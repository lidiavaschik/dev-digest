import type {
  CommunitySkill,
  CreateSkillInput,
  Skill,
  SkillImportPreview,
  SkillUsage,
  SkillVersion,
  UpdateSkillInput,
} from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import type {
  SkillFetcher,
  SkillRecord,
  SkillsRepositoryPort,
  TokenCounter,
  Tx,
  UnitOfWork,
} from './ports.js';
import {
  autoVersionMessage,
  changedContentFields,
  contentOf,
  sameContent,
  searchCommunitySkills,
  toSkillDto,
  toSkillVersionDto,
} from './helpers.js';
import { CREATED_VERSION_MESSAGE, INITIAL_SKILL_VERSION, restoredMessage } from './constants.js';
import { parseSkillUpload } from './import.js';
import { COMMUNITY_SKILLS } from './community-catalog.js';

/**
 * Skills use cases (Skills Lab). A skill is a markdown instruction block
 * (name / description / type / body) linked to agents. Every change to a
 * content field creates version N+1 plus an immutable snapshot of ALL content
 * fields; toggling `enabled` alone does not. All lookups are workspace-scoped —
 * an unknown or foreign id is a 404.
 */
export interface SkillsServiceDeps {
  repo: SkillsRepositoryPort;
  uow: UnitOfWork;
  tokenizer: TokenCounter;
  fetcher: SkillFetcher;
}

export class SkillsService {
  constructor(private deps: SkillsServiceDeps) {}

  private toDto(rec: SkillRecord): Skill {
    return toSkillDto(rec, this.deps.tokenizer.count(rec.body));
  }

  private async mustGet(
    workspaceId: string,
    id: string,
    opts?: { tx?: Tx; forUpdate?: boolean },
  ): Promise<SkillRecord> {
    const rec = await this.deps.repo.get(workspaceId, id, opts);
    if (!rec) throw new NotFoundError('Skill not found');
    return rec;
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const recs = await this.deps.repo.list(workspaceId);
    return recs.map((r) => this.toDto(r));
  }

  async get(workspaceId: string, id: string): Promise<Skill> {
    return this.toDto(await this.mustGet(workspaceId, id));
  }

  /** Insert the skill at v1 and its v1 snapshot in one transaction. Dup name → 409. */
  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const rec = await this.deps.uow.run(async (tx) => {
      const created = await this.deps.repo.insert(
        {
          workspaceId,
          name: input.name,
          description: input.description,
          type: input.type,
          body: input.body,
          source: input.source,
          enabled: input.enabled,
          version: INITIAL_SKILL_VERSION,
        },
        tx,
      );
      await this.deps.repo.insertVersion(
        {
          skillId: created.id,
          version: INITIAL_SKILL_VERSION,
          ...contentOf(created),
          message: input.message?.trim() || CREATED_VERSION_MESSAGE,
        },
        tx,
      );
      return created;
    });
    return this.toDto(rec);
  }

  /**
   * Patch a skill. Content fields that are present AND differ bump the version
   * and snapshot the full new content (message = client note or an auto one).
   * `enabled`-only or no-op patches write no version.
   */
  async update(workspaceId: string, id: string, patch: UpdateSkillInput): Promise<Skill> {
    const rec = await this.deps.uow.run(async (tx) => {
      const current = await this.mustGet(workspaceId, id, { tx, forUpdate: true });
      const changed = changedContentFields(current, patch);
      const enabledChanged = patch.enabled !== undefined && patch.enabled !== current.enabled;
      if (changed.length === 0 && !enabledChanged) return current;

      const nextVersion = changed.length > 0 ? current.version + 1 : undefined;
      const updated = await this.deps.repo.update(
        workspaceId,
        id,
        {
          ...(changed.length > 0
            ? {
                name: patch.name,
                description: patch.description,
                type: patch.type,
                body: patch.body,
                version: nextVersion,
              }
            : {}),
          ...(enabledChanged ? { enabled: patch.enabled } : {}),
        },
        tx,
      );
      if (!updated) throw new NotFoundError('Skill not found');
      if (nextVersion !== undefined) {
        await this.deps.repo.insertVersion(
          {
            skillId: id,
            version: nextVersion,
            ...contentOf(updated),
            message: patch.message?.trim() || autoVersionMessage(changed),
          },
          tx,
        );
      }
      return updated;
    });
    return this.toDto(rec);
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    const ok = await this.deps.repo.delete(workspaceId, id);
    if (!ok) throw new NotFoundError('Skill not found');
  }

  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[]> {
    await this.mustGet(workspaceId, id);
    const recs = await this.deps.repo.listVersions(id);
    return recs.map(toSkillVersionDto);
  }

  async getVersion(workspaceId: string, id: string, version: number): Promise<SkillVersion> {
    await this.mustGet(workspaceId, id);
    const rec = await this.deps.repo.getVersion(id, version);
    if (!rec) throw new NotFoundError('Skill version not found');
    return toSkillVersionDto(rec);
  }

  /**
   * Restore vN: writes a NEW version (current+1) whose content is vN's snapshot.
   * If vN's content equals the current content (e.g. restoring the current
   * version) this is a no-op and returns the skill unchanged — no empty version.
   */
  async restore(
    workspaceId: string,
    id: string,
    version: number,
    message?: string | null,
  ): Promise<Skill> {
    const rec = await this.deps.uow.run(async (tx) => {
      const current = await this.mustGet(workspaceId, id, { tx, forUpdate: true });
      const snap = await this.deps.repo.getVersion(id, version, tx);
      if (!snap) throw new NotFoundError('Skill version not found');
      if (sameContent(current, snap)) return current;

      const nextVersion = current.version + 1;
      const updated = await this.deps.repo.update(
        workspaceId,
        id,
        { ...contentOf(snap), version: nextVersion },
        tx,
      );
      if (!updated) throw new NotFoundError('Skill not found');
      await this.deps.repo.insertVersion(
        {
          skillId: id,
          version: nextVersion,
          ...contentOf(snap),
          message: message?.trim() || restoredMessage(version),
        },
        tx,
      );
      return updated;
    });
    return this.toDto(rec);
  }

  async usage(workspaceId: string, id: string): Promise<SkillUsage> {
    await this.mustGet(workspaceId, id);
    const agents = await this.deps.repo.usage(workspaceId, id);
    return {
      skill_id: id,
      agents: agents.map((a) => ({
        id: a.id,
        name: a.name,
        link_enabled: a.linkEnabled,
        order: a.order,
      })),
    };
  }

  /** Parse an uploaded .md/.zip into a preview. Writes nothing. */
  preview(filename: string, contentBase64: string): SkillImportPreview {
    const b64 = contentBase64.replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) {
      throw new AppError('skill_import_invalid', 'content_base64 is not valid base64', 422);
    }
    return { ...parseSkillUpload(filename, Buffer.from(b64, 'base64')), source_url: null };
  }

  /**
   * Fetch a skill file from an https URL (SSRF-safe port) and parse it into a
   * preview. Writes nothing; `source_url` is where the bytes actually came from
   * (after GitHub blob→raw normalization and redirects).
   */
  async previewFromUrl(url: string): Promise<SkillImportPreview> {
    const file = await this.deps.fetcher.fetch(url);
    const preview = parseSkillUpload(file.filename, Buffer.from(file.bytes));
    return { ...preview, source_url: file.finalUrl };
  }

  /** The curated community catalog, filtered (see community-catalog.ts). */
  community(filter: { q?: string | null; lang?: string | null }): CommunitySkill[] {
    return searchCommunitySkills(COMMUNITY_SKILLS, filter);
  }
}
