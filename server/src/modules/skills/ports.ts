/**
 * Ports for the skills use cases — what SkillsService depends on. Plain
 * TypeScript over contracts: no Drizzle, no Fastify, no Container. Record shapes
 * are the service's own view of persistence; repository.ts maps rows onto them.
 */
import type { SkillSource, SkillType } from '@devdigest/shared';

/** Downloads a skill file from an https URL (SSRF-safe adapter; see vendor/shared/adapters.ts). */
export type { SkillFetcher } from '@devdigest/shared';

/** Opaque transaction handle — only the repository knows what it is. */
export type Tx = unknown;

export interface UnitOfWork {
  run<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}

/** Token counter for a skill body (backed by the tokenizer adapter). */
export interface TokenCounter {
  count(text: string): number;
}

/** The versioned content of a skill — every field a snapshot captures. */
export interface SkillContent {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

export interface SkillRecord extends SkillContent {
  id: string;
  workspaceId: string;
  source: SkillSource;
  enabled: boolean;
  version: number;
  evidenceFiles: string[] | null;
  updatedAt: Date;
  /** Number of agent_skills links to this skill. */
  agentCount: number;
}

export interface SkillVersionRecord extends SkillContent {
  skillId: string;
  version: number;
  message: string | null;
  createdAt: Date;
}

export interface SkillUsageRecord {
  id: string;
  name: string;
  linkEnabled: boolean;
  order: number;
}

export interface NewSkill extends SkillContent {
  workspaceId: string;
  source: SkillSource;
  enabled: boolean;
  version: number;
}

export interface SkillPatch extends Partial<SkillContent> {
  enabled?: boolean;
  /** Set together with content changes; also bumps updated_at. */
  version?: number;
}

export interface SkillsRepositoryPort {
  list(workspaceId: string): Promise<SkillRecord[]>;
  /** `forUpdate` row-locks the skill for the rest of `tx` (serializes version bumps). */
  get(
    workspaceId: string,
    id: string,
    opts?: { tx?: Tx; forUpdate?: boolean },
  ): Promise<SkillRecord | undefined>;
  insert(values: NewSkill, tx?: Tx): Promise<SkillRecord>;
  update(workspaceId: string, id: string, patch: SkillPatch, tx?: Tx): Promise<SkillRecord | undefined>;
  delete(workspaceId: string, id: string): Promise<boolean>;
  insertVersion(snapshot: Omit<SkillVersionRecord, 'createdAt'>, tx?: Tx): Promise<void>;
  /** Newest first. Caller must have asserted workspace ownership of the skill. */
  listVersions(skillId: string): Promise<SkillVersionRecord[]>;
  getVersion(skillId: string, version: number, tx?: Tx): Promise<SkillVersionRecord | undefined>;
  /** Agents in the workspace linking this skill, ordered by agent name. */
  usage(workspaceId: string, skillId: string): Promise<SkillUsageRecord[]>;
}
