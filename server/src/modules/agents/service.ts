import type { Container } from '../../platform/container.js';
import type {
  Agent,
  AgentSkill,
  AgentSkillLink,
  AgentVersion,
  CiFailOn,
  ModelInfo,
  Provider,
  ReviewStrategy,
} from '@devdigest/shared';
import { AgentsRepository } from './repository.js';
import { toAgentDto, toAgentSkillDto, toAgentVersionDto } from './helpers.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';

/**
 * A2 — agents service. Business logic for the Agents tab + Agent Editor.
 * Provider/model selection uses the LLM adapter's dynamic model list.
 *
 * An Agent = provider + model + system_prompt + linked skills + output_schema +
 * enabled. Config changes are versioned via `agent_versions` (repository).
 */

// Re-exported for backwards compatibility; implementation lives in ./helpers.
export { toAgentDto } from './helpers.js';

export interface CreateAgentInput {
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  system_prompt: string;
  output_schema?: unknown;
  strategy?: ReviewStrategy;
  ci_fail_on?: CiFailOn;
  repo_intel?: boolean;
  enabled?: boolean;
}

export interface UpdateAgentInput {
  name?: string;
  description?: string;
  provider?: Provider;
  model?: string;
  system_prompt?: string;
  output_schema?: unknown;
  strategy?: ReviewStrategy;
  ci_fail_on?: CiFailOn;
  repo_intel?: boolean;
  enabled?: boolean;
}

export class AgentsService {
  private repo: AgentsRepository;

  constructor(private container: Container) {
    this.repo = new AgentsRepository(container.db);
  }

  async list(workspaceId: string): Promise<Agent[]> {
    const rows = await this.repo.list(workspaceId);
    const counts = await this.repo.countSkillsByAgent(rows.map((r) => r.id));
    return rows.map((r) => toAgentDto(r, counts.get(r.id) ?? 0));
  }

  async get(workspaceId: string, id: string): Promise<Agent | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    if (!row) return undefined;
    const counts = await this.repo.countSkillsByAgent([row.id]);
    return toAgentDto(row, counts.get(row.id) ?? 0);
  }

  /** Delete an agent (and its versions/skill-links, via cascade). */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async create(workspaceId: string, input: CreateAgentInput, userId?: string): Promise<Agent> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      provider: input.provider,
      model: input.model,
      systemPrompt: input.system_prompt,
      outputSchema: input.output_schema,
      ...(input.strategy !== undefined ? { strategy: input.strategy } : {}),
      ...(input.ci_fail_on !== undefined ? { ciFailOn: input.ci_fail_on } : {}),
      ...(input.repo_intel !== undefined ? { repoIntel: input.repo_intel } : {}),
      enabled: input.enabled,
      createdBy: userId ?? null,
    });
    return toAgentDto(row, 0);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateAgentInput,
  ): Promise<Agent | undefined> {
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
      ...(patch.model !== undefined ? { model: patch.model } : {}),
      ...(patch.system_prompt !== undefined ? { systemPrompt: patch.system_prompt } : {}),
      ...(patch.output_schema !== undefined ? { outputSchema: patch.output_schema } : {}),
      ...(patch.strategy !== undefined ? { strategy: patch.strategy } : {}),
      ...(patch.ci_fail_on !== undefined ? { ciFailOn: patch.ci_fail_on } : {}),
      ...(patch.repo_intel !== undefined ? { repoIntel: patch.repo_intel } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    });
    if (!row) return undefined;
    const counts = await this.repo.countSkillsByAgent([row.id]);
    return toAgentDto(row, counts.get(row.id) ?? 0);
  }

  /**
   * Config history for an agent, newest version first. Workspace-scoped: returns
   * undefined when the agent isn't in this workspace (the route maps that to 404)
   * so version snapshots can't be read across tenants.
   */
  async listVersions(workspaceId: string, agentId: string): Promise<AgentVersion[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const rows = await this.repo.listVersions(agentId);
    return rows.map(toAgentVersionDto);
  }

  /**
   * A single config snapshot for an agent. Returns undefined when the agent isn't
   * in this workspace OR that version was never recorded (route → 404).
   */
  async getVersion(
    workspaceId: string,
    agentId: string,
    version: number,
  ): Promise<AgentVersion | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const row = await this.repo.getVersion(agentId, version);
    return row ? toAgentVersionDto(row) : undefined;
  }

  /** Linked skills for an agent as AgentSkillLink[] (ordered). */
  async skillLinks(agentId: string): Promise<AgentSkillLink[]> {
    const links = await this.repo.linkedSkills(agentId);
    return links.map((l) => ({
      agent_id: agentId,
      skill_id: l.skill.id,
      order: l.order,
      enabled: l.enabled,
    }));
  }

  /** Linked skills for an agent as full AgentSkill DTOs (ordered); undefined → 404. */
  async agentSkills(workspaceId: string, agentId: string): Promise<AgentSkill[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const links = await this.repo.linkedSkills(agentId);
    return links.map(toAgentSkillDto);
  }

  /**
   * Replace an agent's skill set (array order = prompt order, per-agent enabled).
   * ONE transaction: tenancy check on every skill id (any foreign/unknown id →
   * 404, nothing written), replace-all, then bump the agent version + snapshot.
   * Returns undefined when the agent isn't in this workspace.
   */
  async replaceSkills(
    workspaceId: string,
    agentId: string,
    items: { skill_id: string; enabled: boolean }[],
  ): Promise<AgentSkill[] | undefined> {
    const ids = items.map((i) => i.skill_id);
    if (new Set(ids).size !== ids.length) {
      throw new ValidationError('Duplicate skill_id in items');
    }
    const ok = await this.repo.transaction(async (repo) => {
      const agent = await repo.getById(workspaceId, agentId);
      if (!agent) return false;
      const found = new Set(await repo.skillIdsInWorkspace(workspaceId, ids));
      const missing = ids.filter((id) => !found.has(id));
      if (missing.length > 0) throw new NotFoundError('Skill not found', { skill_ids: missing });
      await repo.replaceSkillLinks(
        agentId,
        items.map((i) => ({ skillId: i.skill_id, enabled: i.enabled })),
      );
      await repo.bumpVersion(workspaceId, agentId);
      return true;
    });
    return ok ? this.agentSkills(workspaceId, agentId) : undefined;
  }

  /**
   * Legacy POST shape: set / reorder by bare ids (all enabled). Same
   * transactional replace + version bump as `replaceSkills`.
   */
  async setSkills(
    workspaceId: string,
    agentId: string,
    skillIds: string[],
  ): Promise<AgentSkillLink[] | undefined> {
    const res = await this.replaceSkills(
      workspaceId,
      agentId,
      skillIds.map((skill_id) => ({ skill_id, enabled: true })),
    );
    return res ? this.skillLinks(agentId) : undefined;
  }

  /** Link a single skill (append or set order) — additive; bumps the version. */
  async linkSkill(
    workspaceId: string,
    agentId: string,
    skillId: string,
    order?: number,
  ): Promise<AgentSkillLink[] | undefined> {
    const ok = await this.repo.transaction(async (repo) => {
      const agent = await repo.getById(workspaceId, agentId);
      if (!agent) return false;
      const found = await repo.skillIdsInWorkspace(workspaceId, [skillId]);
      if (found.length === 0) throw new NotFoundError('Skill not found');
      const existing = await repo.linkedSkills(agentId);
      await repo.linkSkill(agentId, skillId, order ?? existing.length);
      await repo.bumpVersion(workspaceId, agentId);
      return true;
    });
    return ok ? this.skillLinks(agentId) : undefined;
  }

  /**
   * Dynamic model list from the provider adapter's /models. Degrades gracefully
   * to [] if the provider key is not configured (the editor still renders).
   */
  async listModels(provider: Provider): Promise<ModelInfo[]> {
    try {
      const llm = await this.container.llm(provider);
      return await llm.listModels();
    } catch {
      return [];
    }
  }
}
