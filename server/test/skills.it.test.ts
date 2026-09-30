import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { deflateRawSync } from 'node:zlib';
import type { FastifyInstance } from 'fastify';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * Skills module over a real Postgres: CRUD, versioning (snapshot of every content
 * field + message), enabled-only toggles, restore, usage, tenancy 404s, the
 * duplicate-name 409 and the import preview (which must write nothing).
 */
d('/skills', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let defaultWs: string;
  let n = 0;
  const uniq = (p: string) => `${p}-${++n}-${Math.random().toString(36).slice(2, 7)}`;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
    const [ws] = await pg.handle.db
      .select({ id: t.workspaces.id })
      .from(t.workspaces)
      .where(eq(t.workspaces.name, 'default'));
    defaultWs = ws!.id;
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  async function create(body: Record<string, unknown> = {}) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: uniq('skill'), body: 'Check every branch.', ...body },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  async function versions(id: string) {
    const res = await app.inject({ method: 'GET', url: `/skills/${id}/versions` });
    expect(res.statusCode).toBe(200);
    return res.json() as Array<Record<string, unknown>>;
  }

  async function skillCount() {
    const [row] = await pg.handle.db.select({ c: sql<number>`count(*)::int` }).from(t.skills);
    return row!.c;
  }

  it('POST creates v1 with defaults, tokens and a v1 snapshot; GET returns it', async () => {
    const name = uniq('create');
    const created = await create({ name, description: 'When X, do Y.', type: 'rubric' });
    expect(created).toMatchObject({
      name,
      description: 'When X, do Y.',
      type: 'rubric',
      source: 'manual',
      enabled: true,
      version: 1,
      agent_count: 0,
    });
    expect(created.tokens).toBeGreaterThan(0);
    expect(typeof created.updated_at).toBe('string');

    const got = await app.inject({ method: 'GET', url: `/skills/${created.id}` });
    expect(got.statusCode).toBe(200);
    expect(got.json()).toEqual(created);

    const v = await versions(created.id);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({
      skill_id: created.id,
      version: 1,
      name,
      description: 'When X, do Y.',
      type: 'rubric',
      body: 'Check every branch.',
      message: 'Created',
    });
  });

  it('POST keeps a client v1 message, source and enabled=false (import flow)', async () => {
    const s = await create({ source: 'imported_file', enabled: false, message: 'Imported from x.zip' });
    expect(s).toMatchObject({ source: 'imported_file', enabled: false });
    expect((await versions(s.id))[0]!.message).toBe('Imported from x.zip');
  });

  it('GET /skills lists workspace skills ordered by name', async () => {
    await create({ name: uniq('zz-order') });
    await create({ name: uniq('aa-order') });
    const res = await app.inject({ method: 'GET', url: '/skills' });
    expect(res.statusCode).toBe(200);
    const names = (res.json() as Array<{ name: string }>).map((s) => s.name);
    expect(names).toEqual([...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    expect(names.some((x) => x.startsWith('aa-order'))).toBe(true);
  });

  it('duplicate name → 409 on create and on rename', async () => {
    const a = await create();
    const dup = await app.inject({ method: 'POST', url: '/skills', payload: { name: a.name, body: 'x' } });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('skill_name_taken');

    const b = await create();
    const rename = await app.inject({ method: 'PUT', url: `/skills/${b.id}`, payload: { name: a.name } });
    expect(rename.statusCode).toBe(409);
    expect(rename.json().error.code).toBe('skill_name_taken');
    // The failed rename left no version behind.
    expect(await versions(b.id)).toHaveLength(1);
  });

  it('body change → v2 with a full snapshot + auto message; custom message is kept', async () => {
    const s = await create({ description: 'desc', type: 'convention' });
    const res = await app.inject({
      method: 'PUT',
      url: `/skills/${s.id}`,
      payload: { body: 'New body.' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ version: 2, body: 'New body.' });
    expect(new Date(res.json().updated_at).getTime()).toBeGreaterThanOrEqual(
      new Date(s.updated_at).getTime(),
    );

    let v = await versions(s.id);
    expect(v.map((x) => x.version)).toEqual([2, 1]);
    expect(v[0]).toMatchObject({
      name: s.name,
      description: 'desc',
      type: 'convention',
      body: 'New body.',
      message: 'Edited body',
    });

    const res3 = await app.inject({
      method: 'PUT',
      url: `/skills/${s.id}`,
      payload: { description: 'd2', type: 'security', message: 'Tightened scope' },
    });
    expect(res3.json().version).toBe(3);
    v = await versions(s.id);
    expect(v.map((x) => x.version)).toEqual([3, 2, 1]);
    expect(v[0]).toMatchObject({ description: 'd2', type: 'security', message: 'Tightened scope' });
  });

  it('enabled-only toggle or unchanged values → no new version', async () => {
    const s = await create();
    const off = await app.inject({ method: 'PUT', url: `/skills/${s.id}`, payload: { enabled: false } });
    expect(off.statusCode).toBe(200);
    expect(off.json()).toMatchObject({ enabled: false, version: 1 });

    const same = await app.inject({
      method: 'PUT',
      url: `/skills/${s.id}`,
      payload: { name: s.name, body: s.body, enabled: false },
    });
    expect(same.json()).toMatchObject({ version: 1 });
    expect(await versions(s.id)).toHaveLength(1);
  });

  it('concurrent content edits serialize (row lock): v2 and v3, no PK clash', async () => {
    const s = await create();
    const [a, b] = await Promise.all([
      app.inject({ method: 'PUT', url: `/skills/${s.id}`, payload: { body: 'Edit A' } }),
      app.inject({ method: 'PUT', url: `/skills/${s.id}`, payload: { body: 'Edit B' } }),
    ]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    expect((await versions(s.id)).map((x) => x.version)).toEqual([3, 2, 1]);
  });

  it('GET one version; unknown version → 404; bad version → 422', async () => {
    const s = await create();
    const v1 = await app.inject({ method: 'GET', url: `/skills/${s.id}/versions/1` });
    expect(v1.statusCode).toBe(200);
    expect(v1.json()).toMatchObject({ version: 1, body: s.body });
    expect((await app.inject({ method: 'GET', url: `/skills/${s.id}/versions/9` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/skills/${s.id}/versions/0` })).statusCode).toBe(422);
  });

  it('restore v1 → v3 with v1 content; restoring identical content is a no-op', async () => {
    const s = await create({ description: 'orig', type: 'rubric' });
    await app.inject({
      method: 'PUT',
      url: `/skills/${s.id}`,
      payload: { body: 'Changed', description: 'changed', type: 'custom' },
    });
    const r = await app.inject({ method: 'POST', url: `/skills/${s.id}/versions/1/restore`, payload: {} });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ version: 3, body: s.body, description: 'orig', type: 'rubric' });
    const v = await versions(s.id);
    expect(v.map((x) => x.version)).toEqual([3, 2, 1]);
    expect(v[0]).toMatchObject({ body: s.body, description: 'orig', message: 'Restored from v1' });

    // v3 == v1 content → restoring v1 again (or v3) writes nothing.
    const again = await app.inject({ method: 'POST', url: `/skills/${s.id}/versions/1/restore`, payload: {} });
    expect(again.json().version).toBe(3);
    expect(await versions(s.id)).toHaveLength(3);

    const missing = await app.inject({ method: 'POST', url: `/skills/${s.id}/versions/42/restore`, payload: {} });
    expect(missing.statusCode).toBe(404);
  });

  it('usage lists agents that ENABLE the skill (unchecked slots excluded); agent_count follows', async () => {
    const { db } = pg.handle;
    const s = await create();
    const [zed] = await db
      .insert(t.agents)
      .values({ workspaceId: defaultWs, name: 'Zed agent', provider: 'openai', model: 'm', systemPrompt: 'p' })
      .returning();
    const [amy] = await db
      .insert(t.agents)
      .values({ workspaceId: defaultWs, name: 'Amy agent', provider: 'openai', model: 'm', systemPrompt: 'p' })
      .returning();
    await db.insert(t.agentSkills).values([
      { agentId: zed!.id, skillId: s.id, order: 0, enabled: true },
      { agentId: amy!.id, skillId: s.id, order: 3, enabled: false },
    ]);

    const res = await app.inject({ method: 'GET', url: `/skills/${s.id}/usage` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      skill_id: s.id,
      // Amy's link is an unchecked slot on her Skills tab — not "using" the skill.
      agents: [{ id: zed!.id, name: 'Zed agent', link_enabled: true, order: 0 }],
    });
    const got = await app.inject({ method: 'GET', url: `/skills/${s.id}` });
    expect(got.json().agent_count).toBe(1);
    const listed = (await app.inject({ method: 'GET', url: '/skills' })).json() as Array<{ id: string; agent_count: number }>;
    expect(listed.find((x) => x.id === s.id)!.agent_count).toBe(1);

    // DELETE → 204; versions and links cascade.
    const del = await app.inject({ method: 'DELETE', url: `/skills/${s.id}` });
    expect(del.statusCode).toBe(204);
    expect(del.body).toBe('');
    expect((await app.inject({ method: 'GET', url: `/skills/${s.id}` })).statusCode).toBe(404);
    expect(await db.select().from(t.skillVersions).where(eq(t.skillVersions.skillId, s.id))).toHaveLength(0);
    expect(await db.select().from(t.agentSkills).where(eq(t.agentSkills.skillId, s.id))).toHaveLength(0);
    expect((await app.inject({ method: 'DELETE', url: `/skills/${s.id}` })).statusCode).toBe(404);
  });

  it('a skill in another workspace is a 404 on every route', async () => {
    const { db } = pg.handle;
    const [otherWs] = await db.insert(t.workspaces).values({ name: uniq('other') }).returning();
    const [foreign] = await db
      .insert(t.skills)
      .values({
        workspaceId: otherWs!.id,
        name: 'foreign',
        description: '',
        type: 'custom',
        source: 'manual',
        body: 'secret',
      })
      .returning();
    await db.insert(t.skillVersions).values({ skillId: foreign!.id, version: 1, name: 'foreign', body: 'secret' });
    const id = foreign!.id;

    const calls: Array<[string, string, unknown?]> = [
      ['GET', `/skills/${id}`],
      ['PUT', `/skills/${id}`, { body: 'hijack' }],
      ['DELETE', `/skills/${id}`],
      ['GET', `/skills/${id}/versions`],
      ['GET', `/skills/${id}/versions/1`],
      ['POST', `/skills/${id}/versions/1/restore`, {}],
      ['GET', `/skills/${id}/usage`],
    ];
    for (const [method, url, payload] of calls) {
      const res = await app.inject({ method: method as 'GET', url, ...(payload ? { payload } : {}) });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
    const list = (await app.inject({ method: 'GET', url: '/skills' })).json() as Array<{ id: string }>;
    expect(list.some((s) => s.id === id)).toBe(false);
    const [still] = await db.select().from(t.skills).where(eq(t.skills.id, id));
    expect(still!.body).toBe('secret');
  });

  it('unknown / malformed id → 404 / 422', async () => {
    const unknown = '00000000-0000-4000-8000-000000000000';
    expect((await app.inject({ method: 'GET', url: `/skills/${unknown}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/skills/not-a-uuid' })).statusCode).toBe(422);
  });

  it('POST /skills/import/preview returns a preview and writes nothing', async () => {
    const before = await skillCount();
    const mdText = '---\nname: response-shape-compat\ndescription: Keep shapes stable.\ntype: convention\n---\nBody here.';
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'SKILL.md', content_base64: Buffer.from(mdText).toString('base64') },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      filename: 'SKILL.md',
      name: 'response-shape-compat',
      description: 'Keep shapes stable.',
      type: 'convention',
      body: 'Body here.',
      ignored_files: [],
      warnings: [],
      source_url: null,
    });

    // A zip with a script: also parsed, script ignored.
    const zip = tinyZip([
      ['SKILL.md', mdText],
      ['scripts/check.sh', '#!/bin/sh\necho hi'],
    ]);
    const zres = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'bundle.zip', content_base64: zip.toString('base64') },
    });
    expect(zres.statusCode).toBe(200);
    expect(zres.json().ignored_files).toEqual(['scripts/check.sh']);
    expect(zres.json().warnings.join('\n')).toMatch(/never run: scripts\/check\.sh/);

    const bad = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'evil.exe', content_base64: Buffer.from('MZ').toString('base64') },
    });
    expect(bad.statusCode).toBe(422);
    const badB64 = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'a.md', content_base64: '!!!not base64!!!' },
    });
    expect(badB64.statusCode).toBe(422);

    expect(await skillCount()).toBe(before);
  });
});

/** Minimal deflate zip writer (crc left 0 — the parser does not verify it). */
function tinyZip(files: Array<[string, string]>): Buffer {
  const parts: Buffer[] = [];
  const cds: Buffer[] = [];
  let off = 0;
  for (const [name, text] of files) {
    const raw = Buffer.from(text);
    const comp = deflateRawSync(raw);
    const nm = Buffer.from(name);
    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0);
    loc.writeUInt16LE(8, 8);
    loc.writeUInt32LE(comp.length, 18);
    loc.writeUInt32LE(raw.length, 22);
    loc.writeUInt16LE(nm.length, 26);
    parts.push(loc, nm, comp);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(comp.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(nm.length, 28);
    cd.writeUInt32LE(off, 42);
    cds.push(cd, nm);
    off += 30 + nm.length + comp.length;
  }
  const cd = Buffer.concat(cds);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}
