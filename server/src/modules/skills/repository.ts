import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
import { AppError } from '../../platform/errors.js';
import type {
  NewSkill,
  SkillPatch,
  SkillRecord,
  SkillsRepositoryPort,
  SkillUsageRecord,
  SkillVersionRecord,
  Tx,
  UnitOfWork,
} from './ports.js';

/**
 * Skills data-access (Drizzle). Owns `skills` + `skill_versions`; reads
 * `agent_skills` ⋈ `agents` for counts/usage. Every skill lookup is scoped by
 * workspace_id. Also the module's UnitOfWork: `run()` opens a transaction whose
 * handle the service passes back into the other methods.
 */

const SKILL_NAME_UNIQUE = 'skills_ws_name_uq';

/** Correlated count of agent links for the skill row in the outer query. */
const agentCountSql = sql<number>`(select count(*)::int from ${t.agentSkills} where ${t.agentSkills.skillId} = ${t.skills.id} and ${t.agentSkills.enabled})`;

function toRecord(row: SkillRow, agentCount: number): SkillRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    description: row.description,
    type: row.type,
    source: row.source,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidenceFiles: row.evidenceFiles ?? null,
    updatedAt: row.updatedAt,
    agentCount: Number(agentCount),
  };
}

function toVersionRecord(row: SkillVersionRow): SkillVersionRecord {
  return {
    skillId: row.skillId,
    version: row.version,
    name: row.name,
    description: row.description,
    type: row.type,
    body: row.body,
    message: row.message,
    createdAt: row.createdAt,
  };
}

/** postgres-js raises the raw PostgresError (drizzle 0.38 does not wrap it). */
function isNameTaken(err: unknown): boolean {
  for (let e: unknown = err, i = 0; e && i < 3; e = (e as { cause?: unknown }).cause, i++) {
    const pg = e as { code?: string; constraint_name?: string };
    if (pg.code === '23505' && pg.constraint_name === SKILL_NAME_UNIQUE) return true;
  }
  return false;
}

function nameTaken(name: string | undefined): AppError {
  return new AppError(
    'skill_name_taken',
    `A skill named "${name ?? ''}" already exists in this workspace`,
    409,
  );
}

export class SkillsRepository implements SkillsRepositoryPort, UnitOfWork {
  constructor(private db: Db) {}

  run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => fn(tx));
  }

  /** A transaction exposes the same query API as the root client. */
  private q(tx?: Tx): Db {
    return (tx as Db | undefined) ?? this.db;
  }

  async list(workspaceId: string): Promise<SkillRecord[]> {
    const rows = await this.db
      .select({ skill: t.skills, agentCount: agentCountSql })
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skills.name));
    return rows.map((r) => toRecord(r.skill, r.agentCount));
  }

  async get(
    workspaceId: string,
    id: string,
    opts: { tx?: Tx; forUpdate?: boolean } = {},
  ): Promise<SkillRecord | undefined> {
    const where = and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id));
    const base = this.q(opts.tx)
      .select({ skill: t.skills, agentCount: agentCountSql })
      .from(t.skills)
      .where(where);
    const [row] = opts.forUpdate ? await base.for('update', { of: t.skills }) : await base;
    return row ? toRecord(row.skill, row.agentCount) : undefined;
  }

  async insert(values: NewSkill, tx?: Tx): Promise<SkillRecord> {
    try {
      const [row] = await this.q(tx)
        .insert(t.skills)
        .values({
          workspaceId: values.workspaceId,
          name: values.name,
          description: values.description,
          type: values.type,
          source: values.source,
          body: values.body,
          enabled: values.enabled,
          version: values.version,
        })
        .returning();
      return toRecord(row!, 0);
    } catch (err) {
      if (isNameTaken(err)) throw nameTaken(values.name);
      throw err;
    }
  }

  async update(
    workspaceId: string,
    id: string,
    patch: SkillPatch,
    tx?: Tx,
  ): Promise<SkillRecord | undefined> {
    const set = {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.version !== undefined ? { version: patch.version, updatedAt: sql`now()` } : {}),
    };
    if (Object.keys(set).length === 0) return this.get(workspaceId, id, { tx });
    try {
      const [row] = await this.q(tx)
        .update(t.skills)
        .set(set)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .returning();
      if (!row) return undefined;
      // Re-read to include the agent count (cheap; keeps one mapping path).
      return this.get(workspaceId, id, { tx });
    } catch (err) {
      if (isNameTaken(err)) throw nameTaken(patch.name);
      throw err;
    }
  }

  /** Versions and agent links cascade via FK. */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  async insertVersion(snapshot: Omit<SkillVersionRecord, 'createdAt'>, tx?: Tx): Promise<void> {
    await this.q(tx).insert(t.skillVersions).values({
      skillId: snapshot.skillId,
      version: snapshot.version,
      name: snapshot.name,
      description: snapshot.description,
      type: snapshot.type,
      body: snapshot.body,
      message: snapshot.message,
    });
  }

  async listVersions(skillId: string): Promise<SkillVersionRecord[]> {
    const rows = await this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
    return rows.map(toVersionRecord);
  }

  async getVersion(skillId: string, version: number, tx?: Tx): Promise<SkillVersionRecord | undefined> {
    const [row] = await this.q(tx)
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row ? toVersionRecord(row) : undefined;
  }

  async usage(workspaceId: string, skillId: string): Promise<SkillUsageRecord[]> {
    const rows = await this.db
      .select({
        id: t.agents.id,
        name: t.agents.name,
        linkEnabled: t.agentSkills.enabled,
        order: t.agentSkills.order,
      })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(
        and(
          eq(t.agentSkills.skillId, skillId),
          eq(t.agents.workspaceId, workspaceId),
          // an unchecked slot on an agent's Skills tab is not "using" the skill
          eq(t.agentSkills.enabled, true),
        ),
      )
      .orderBy(asc(t.agents.name), asc(t.agents.id));
    return rows;
  }
}
