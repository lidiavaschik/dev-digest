import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { AgentVersionSkill, CiFailOn, Provider, ReviewStrategy } from '@devdigest/shared';
import { DEFAULT_AGENT_DESCRIPTION, INITIAL_AGENT_VERSION } from './constants.js';
import { isConfigChange } from './helpers.js';

/**
 * A2 — agents data-access. Owns `agents`, `agent_versions`, and the
 * `agent_skills` link table (shared with A1's skills repository, but A2 owns the
 * agent side: link/reorder/list for an agent). Workspace-scoped throughout.
 */

import type { AgentRow, AgentVersionRow } from '../../db/rows.js';
export type { AgentRow, AgentVersionRow };

export interface InsertAgent {
  workspaceId: string;
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
  enabled?: boolean;
  createdBy?: string | null;
}

export interface UpdateAgent {
  name?: string;
  description?: string;
  provider?: Provider;
  model?: string;
  systemPrompt?: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
  enabled?: boolean;
}

/** A Drizzle transaction handle — same query surface as `Db`. */
export type DbTx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** One entry of an agent's desired skill set (array index = prompt order). */
export interface SkillLinkInput {
  skillId: string;
  enabled: boolean;
}

/** A skill linked to an agent (with its order), joined from agent_skills. */
export interface LinkedSkillRow {
  skill: typeof t.skills.$inferSelect;
  order: number;
  /** Per-agent switch (agent_skills.enabled). */
  enabled: boolean;
}

export class AgentsRepository {
  constructor(private db: Db | DbTx) {}

  /**
   * Unit of work: run `fn` against a repository bound to ONE transaction, so a
   * multi-step use case (verify → replace links → bump version → snapshot)
   * commits or rolls back as a whole. The service owns the boundary; the tx
   * handle never leaves this file.
   */
  async transaction<T>(fn: (repo: AgentsRepository) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => fn(new AgentsRepository(tx)));
  }

  /**
   * Number of skills ENABLED for each agent (one grouped query, no N+1). The
   * Skills tab persists every workspace skill's slot, so a plain link count
   * would include the unchecked ones.
   */
  async countSkillsByAgent(agentIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (agentIds.length === 0) return out;
    const rows = await this.db
      .select({ agentId: t.agentSkills.agentId, n: count() })
      .from(t.agentSkills)
      .where(and(inArray(t.agentSkills.agentId, agentIds), eq(t.agentSkills.enabled, true)))
      .groupBy(t.agentSkills.agentId);
    for (const r of rows) out.set(r.agentId, Number(r.n));
    return out;
  }

  /** The subset of `skillIds` that exist in `workspaceId` (tenancy check). */
  async skillIdsInWorkspace(workspaceId: string, skillIds: string[]): Promise<string[]> {
    if (skillIds.length === 0) return [];
    const rows = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), inArray(t.skills.id, skillIds)));
    return rows.map((r) => r.id);
  }

  async list(workspaceId: string): Promise<AgentRow[]> {
    return this.db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId));
  }

  async listEnabled(workspaceId: string): Promise<AgentRow[]> {
    return this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.enabled, true)));
  }

  async getById(workspaceId: string, id: string): Promise<AgentRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)));
    return row;
  }

  /** Delete an agent (scoped to workspace). Versions/skill-links cascade;
   *  agent_runs keep their history with agent_id set null. Returns false if
   *  no such agent existed in the workspace. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .returning({ id: t.agents.id });
    return rows.length > 0;
  }

  /** Insert an agent AND record version 1 in agent_versions (immutable snapshot). */
  async insert(values: InsertAgent): Promise<AgentRow> {
    const [row] = await this.db
      .insert(t.agents)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description ?? DEFAULT_AGENT_DESCRIPTION,
        provider: values.provider,
        model: values.model,
        systemPrompt: values.systemPrompt,
        outputSchema: (values.outputSchema as object | undefined) ?? null,
        ...(values.strategy !== undefined ? { strategy: values.strategy } : {}),
        ...(values.ciFailOn !== undefined ? { ciFailOn: values.ciFailOn } : {}),
        ...(values.repoIntel !== undefined ? { repoIntel: values.repoIntel } : {}),
        enabled: values.enabled ?? true,
        version: INITIAL_AGENT_VERSION,
        createdBy: values.createdBy ?? null,
      })
      .returning();
    await this.snapshotVersion(row!, INITIAL_AGENT_VERSION);
    return row!;
  }

  /**
   * Update an agent. Any config change bumps the version and snapshots the new
   * config into agent_versions (reproducibility for eval).
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateAgent,
  ): Promise<AgentRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    // A config-affecting change (anything except just toggling enabled) bumps version.
    const configChanged = isConfigChange(existing, patch);
    const nextVersion = configChanged ? existing.version + 1 : existing.version;

    const [row] = await this.db
      .update(t.agents)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
        ...(patch.model !== undefined ? { model: patch.model } : {}),
        ...(patch.systemPrompt !== undefined ? { systemPrompt: patch.systemPrompt } : {}),
        ...(patch.outputSchema !== undefined
          ? { outputSchema: patch.outputSchema as object }
          : {}),
        ...(patch.strategy !== undefined ? { strategy: patch.strategy } : {}),
        ...(patch.ciFailOn !== undefined ? { ciFailOn: patch.ciFailOn } : {}),
        ...(patch.repoIntel !== undefined ? { repoIntel: patch.repoIntel } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(configChanged ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .returning();

    if (configChanged && row) await this.snapshotVersion(row, nextVersion);
    return row;
  }

  /**
   * Bump an agent's config version and snapshot the new config (incl. its
   * current skill links). Used when only the skill set changed.
   */
  async bumpVersion(workspaceId: string, id: string): Promise<AgentRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;
    const nextVersion = existing.version + 1;
    const [row] = await this.db
      .update(t.agents)
      .set({ version: nextVersion })
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .returning();
    if (row) await this.snapshotVersion(row, nextVersion);
    return row;
  }

  private async snapshotVersion(row: AgentRow, version: number): Promise<void> {
    // Pin each linked skill's version so a snapshot replays the exact text.
    const links = await this.linkedSkills(row.id);
    const skills: AgentVersionSkill[] = links.map((l) => ({
      skill_id: l.skill.id,
      skill_version: l.skill.version,
      order: l.order,
      enabled: l.enabled,
    }));
    await this.db
      .insert(t.agentVersions)
      .values({
        agentId: row.id,
        version,
        configJson: {
          provider: row.provider,
          model: row.model,
          system_prompt: row.systemPrompt,
          output_schema: row.outputSchema,
          strategy: row.strategy,
          ci_fail_on: row.ciFailOn,
          repo_intel: row.repoIntel,
          skills,
        },
      })
      .onConflictDoNothing();
  }

  // ---- agent_versions (immutable config snapshots) ------------------------

  /** All config snapshots for an agent, newest version first. */
  async listVersions(agentId: string): Promise<AgentVersionRow[]> {
    return this.db
      .select()
      .from(t.agentVersions)
      .where(eq(t.agentVersions.agentId, agentId))
      .orderBy(desc(t.agentVersions.version));
  }

  /** A single config snapshot, or undefined if that version was never recorded. */
  async getVersion(agentId: string, version: number): Promise<AgentVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agentVersions)
      .where(and(eq(t.agentVersions.agentId, agentId), eq(t.agentVersions.version, version)));
    return row;
  }

  // ---- agent_skills link table (A2 owns the agent side) -------------------

  /**
   * Skills linked to an agent, in `order` ascending. `onlyActive` keeps only
   * skills that are enabled BOTH globally (skills.enabled) and for this agent
   * (agent_skills.enabled) — exactly the set that reaches the review prompt.
   */
  async linkedSkills(
    agentId: string,
    opts: { onlyActive?: boolean } = {},
  ): Promise<LinkedSkillRow[]> {
    const where = opts.onlyActive
      ? and(
          eq(t.agentSkills.agentId, agentId),
          eq(t.skills.enabled, true),
          eq(t.agentSkills.enabled, true),
        )
      : eq(t.agentSkills.agentId, agentId);
    const rows = await this.db
      .select({ skill: t.skills, order: t.agentSkills.order, enabled: t.agentSkills.enabled })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(where)
      .orderBy(asc(t.agentSkills.order));
    return rows.map((r) => ({ skill: r.skill, order: r.order, enabled: r.enabled }));
  }

  async skillIdsForAgent(agentId: string): Promise<string[]> {
    const links = await this.linkedSkills(agentId);
    return links.map((l) => l.skill.id);
  }

  /** Link a skill to an agent at a given order (idempotent: upserts order). */
  async linkSkill(agentId: string, skillId: string, order: number): Promise<void> {
    await this.db
      .insert(t.agentSkills)
      .values({ agentId, skillId, order })
      .onConflictDoUpdate({
        target: [t.agentSkills.agentId, t.agentSkills.skillId],
        set: { order },
      });
  }

  async unlinkSkill(agentId: string, skillId: string): Promise<void> {
    await this.db
      .delete(t.agentSkills)
      .where(and(eq(t.agentSkills.agentId, agentId), eq(t.agentSkills.skillId, skillId)));
  }

  /**
   * Replace the full set of linked skills for an agent, assigning order = index
   * and the per-agent `enabled` flag. Skills not in the list are unlinked.
   * Call inside `transaction()` — delete + insert must not be observed apart.
   */
  async replaceSkillLinks(agentId: string, items: SkillLinkInput[]): Promise<void> {
    await this.db.delete(t.agentSkills).where(eq(t.agentSkills.agentId, agentId));
    if (items.length === 0) return;
    await this.db.insert(t.agentSkills).values(
      items.map((it, i) => ({ agentId, skillId: it.skillId, order: i, enabled: it.enabled })),
    );
  }
}
