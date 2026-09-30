import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agent-skills] Docker not available — skipping integration tests.');
}

/**
 * L02 — an agent's skill set: PUT replace-all (order + per-agent enabled),
 * tenancy (foreign skill → 404, nothing written), duplicate ids → 422,
 * version bump with AgentVersionSkill snapshots, legacy string snapshots,
 * skill_count on the agent list, and the runner's `onlyActive` filter.
 */
d('agent skills', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let n = 0;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  async function makeSkill(opts: { ws?: string; enabled?: boolean; version?: number } = {}) {
    n += 1;
    const [row] = await pg.handle.db
      .insert(t.skills)
      .values({
        workspaceId: opts.ws ?? workspaceId,
        name: `skill-${n}`,
        description: `Use when ${n}`,
        type: 'rubric',
        source: 'manual',
        body: `# Skill ${n}\nflag things`,
        enabled: opts.enabled ?? true,
        version: opts.version ?? 1,
      })
      .returning();
    return row!;
  }

  async function makeAgent(app: Awaited<ReturnType<typeof makeApp>>) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: `Agent ${++n}`,
        provider: 'openai',
        model: 'gpt-4o-mini',
        system_prompt: 'Review the diff.',
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  function links(agentId: string) {
    return pg.handle.db
      .select()
      .from(t.agentSkills)
      .where(eq(t.agentSkills.agentId, agentId))
      .orderBy(t.agentSkills.order);
  }

  it('PUT replaces all links, keeps array order and stores per-agent enabled', async () => {
    const app = await makeApp();
    const agentId = await makeAgent(app);
    const [a, b, c] = [await makeSkill(), await makeSkill(), await makeSkill()];

    const first = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/skills`,
      payload: { items: [{ skill_id: a.id, enabled: true }, { skill_id: b.id, enabled: true }] },
    });
    expect(first.statusCode).toBe(200);

    const res = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/skills`,
      payload: { items: [{ skill_id: c.id, enabled: true }, { skill_id: a.id, enabled: false }] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.map((s: { id: string }) => s.id)).toEqual([c.id, a.id]);
    expect(body.map((s: { order: number }) => s.order)).toEqual([0, 1]);
    expect(body.map((s: { link_enabled: boolean }) => s.link_enabled)).toEqual([true, false]);

    const rows = await links(agentId);
    expect(rows.map((r) => [r.skillId, r.order, r.enabled])).toEqual([
      [c.id, 0, true],
      [a.id, 1, false],
    ]);
    await app.close();
  });

  it('GET returns AgentSkill DTOs (full skill + order + link_enabled), ordered', async () => {
    const app = await makeApp();
    const agentId = await makeAgent(app);
    const [a, b] = [await makeSkill(), await makeSkill()];
    await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/skills`,
      payload: { items: [{ skill_id: b.id, enabled: false }, { skill_id: a.id, enabled: true }] },
    });

    const res = await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({
      id: b.id,
      name: b.name,
      description: b.description,
      type: 'rubric',
      source: 'manual',
      body: b.body,
      enabled: true,
      version: 1,
      order: 0,
      link_enabled: false,
    });
    expect(typeof body[0].updated_at).toBe('string');
    expect(body[1]).toMatchObject({ id: a.id, order: 1, link_enabled: true });
    await app.close();
  });

  it('a skill from another workspace → 404 and nothing changes', async () => {
    const app = await makeApp();
    const agentId = await makeAgent(app);
    const mine = await makeSkill();
    await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/skills`,
      payload: { items: [{ skill_id: mine.id, enabled: true }] },
    });
    const versionBefore = (await app.inject({ method: 'GET', url: `/agents/${agentId}` })).json()
      .version;

    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-${++n}` })
      .returning();
    const foreign = await makeSkill({ ws: otherWs!.id });

    const res = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/skills`,
      payload: {
        items: [
          { skill_id: mine.id, enabled: false },
          { skill_id: foreign.id, enabled: true },
        ],
      },
    });
    expect(res.statusCode).toBe(404);

    // No partial write: the original link (enabled) survives; version unchanged.
    const rows = await links(agentId);
    expect(rows.map((r) => [r.skillId, r.enabled])).toEqual([[mine.id, true]]);
    const after = (await app.inject({ method: 'GET', url: `/agents/${agentId}` })).json();
    expect(after.version).toBe(versionBefore);
    await app.close();
  });

  it('duplicate skill ids → 422', async () => {
    const app = await makeApp();
    const agentId = await makeAgent(app);
    const a = await makeSkill();
    const res = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/skills`,
      payload: { items: [{ skill_id: a.id, enabled: true }, { skill_id: a.id, enabled: false }] },
    });
    expect(res.statusCode).toBe(422);
    expect(await links(agentId)).toHaveLength(0);
    await app.close();
  });

  it('unknown agent → 404', async () => {
    const app = await makeApp();
    const ghost = '00000000-0000-0000-0000-000000000000';
    expect((await app.inject({ method: 'GET', url: `/agents/${ghost}/skills` })).statusCode).toBe(
      404,
    );
    expect(
      (
        await app.inject({ method: 'PUT', url: `/agents/${ghost}/skills`, payload: { items: [] } })
      ).statusCode,
    ).toBe(404);
    await app.close();
  });

  it('PUT bumps the agent version; snapshot pins AgentVersionSkill objects', async () => {
    const app = await makeApp();
    const agentId = await makeAgent(app);
    const a = await makeSkill({ version: 3 });
    const b = await makeSkill();

    await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/skills`,
      payload: { items: [{ skill_id: a.id, enabled: true }, { skill_id: b.id, enabled: false }] },
    });

    const agent = (await app.inject({ method: 'GET', url: `/agents/${agentId}` })).json();
    expect(agent.version).toBe(2);
    const versions = (
      await app.inject({ method: 'GET', url: `/agents/${agentId}/versions` })
    ).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions[0].config.skills).toEqual([
      { skill_id: a.id, skill_version: 3, order: 0, enabled: true },
      { skill_id: b.id, skill_version: 1, order: 1, enabled: false },
    ]);
    expect(versions[1].config.skills).toEqual([]);
    await app.close();
  });

  it('legacy POST {skill_ids} still works and also bumps the version', async () => {
    const app = await makeApp();
    const agentId = await makeAgent(app);
    const a = await makeSkill();
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [a.id] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([{ agent_id: agentId, skill_id: a.id, order: 0, enabled: true }]);
    const agent = (await app.inject({ method: 'GET', url: `/agents/${agentId}` })).json();
    expect(agent.version).toBe(2);
    await app.close();
  });

  it('an OLD snapshot with bare skill-id strings still parses', async () => {
    const app = await makeApp();
    const agentId = await makeAgent(app);
    const skillId = (await makeSkill()).id;
    await pg.handle.db.insert(t.agentVersions).values({
      agentId,
      version: 7,
      configJson: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        system_prompt: 'old',
        output_schema: null,
        strategy: 'single-pass',
        ci_fail_on: 'critical',
        repo_intel: true,
        skills: [skillId],
      },
    });
    const res = await app.inject({ method: 'GET', url: `/agents/${agentId}/versions/7` });
    expect(res.statusCode).toBe(200);
    expect(res.json().config.skills).toEqual([skillId]);
    await app.close();
  });

  it('agent list + detail carry skill_count = skills ENABLED for the agent', async () => {
    const app = await makeApp();
    const agentId = await makeAgent(app);
    const [a, b] = [await makeSkill(), await makeSkill()];
    await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/skills`,
      payload: { items: [{ skill_id: a.id, enabled: true }, { skill_id: b.id, enabled: false }] },
    });

    const list = (await app.inject({ method: 'GET', url: '/agents' })).json();
    const mine = list.find((x: { id: string }) => x.id === agentId);
    expect(mine.skill_count).toBe(1); // b is linked but unchecked
    // Seeded Test Quality Reviewer links four skills.
    const tq = list.find((x: { name: string }) => x.name === 'Test Quality Reviewer');
    expect(tq.skill_count).toBe(4);
    const general = list.find((x: { name: string }) => x.name === 'General Reviewer');
    expect(general.skill_count).toBe(0);

    const one = (await app.inject({ method: 'GET', url: `/agents/${agentId}` })).json();
    expect(one.skill_count).toBe(1);
    await app.close();
  });

  it('linkedSkills onlyActive excludes globally- and per-agent-disabled skills', async () => {
    const app = await makeApp();
    const agentId = await makeAgent(app);
    const on = await makeSkill();
    const globallyOff = await makeSkill({ enabled: false });
    const agentOff = await makeSkill();
    const on2 = await makeSkill();
    await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/skills`,
      payload: {
        items: [
          { skill_id: on2.id, enabled: true },
          { skill_id: globallyOff.id, enabled: true },
          { skill_id: agentOff.id, enabled: false },
          { skill_id: on.id, enabled: true },
        ],
      },
    });

    const repo = new AgentsRepository(pg.handle.db);
    const all = await repo.linkedSkills(agentId);
    expect(all.map((l) => l.skill.id)).toEqual([on2.id, globallyOff.id, agentOff.id, on.id]);
    const active = await repo.linkedSkills(agentId, { onlyActive: true });
    expect(active.map((l) => l.skill.id)).toEqual([on2.id, on.id]);
    await app.close();
  });

  it('seed is idempotent and links the Test Quality skills in order', async () => {
    await seed(pg.handle.db);
    const db = pg.handle.db;
    const [tq] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'Test Quality Reviewer')));
    const repo = new AgentsRepository(db);
    const linked = await repo.linkedSkills(tq!.id);
    expect(linked.map((l) => l.skill.name)).toEqual([
      'untested-branches',
      'missing-corner-cases',
      'over-mocking',
      'flaky-tests',
    ]);
    const versions = await repo.listVersions(tq!.id);
    expect(versions).toHaveLength(1);
    const agents = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'Test Quality Reviewer')));
    expect(agents).toHaveLength(1);
    const sv = await db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, linked[0]!.skill.id));
    expect(sv).toHaveLength(1);
    expect(sv[0]).toMatchObject({ version: 1, name: 'untested-branches', type: 'rubric' });
  });
});
