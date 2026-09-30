import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockSkillFetcher } from '../src/adapters/mocks.js';
import { COMMUNITY_SKILLS } from '../src/modules/skills/community-catalog.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills-community] Docker not available — skipping integration tests.');
}

const RAW = 'https://raw.githubusercontent.com/obra/superpowers/main/skills/systematic-debugging/SKILL.md';
const SKILL_MD =
  '---\nname: systematic-debugging\ndescription: Use when encountering any bug.\n---\n# Systematic Debugging\nFind the root cause first.';

/**
 * GET /skills/community (static catalog, must not be captured by /skills/:id) and
 * POST /skills/import/preview-url (fetch → parse → preview, writes nothing).
 * `app` uses MockSkillFetcher (no network); `realApp` wires the real
 * HttpsSkillFetcher and is only fed URLs it refuses before any DNS/network.
 */
d('/skills/community + /skills/import/preview-url', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let realApp: FastifyInstance;
  let fetcher: MockSkillFetcher;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    fetcher = new MockSkillFetcher({
      [RAW]: SKILL_MD,
      'https://example.com/redirected': {
        content: SKILL_MD,
        finalUrl: 'https://cdn.example.com/skills/SKILL.md',
      },
    });
    const base = { git: new MockGitClient(), github: new MockGitHubClient() };
    app = await buildApp({ config, db: pg.handle.db, overrides: { ...base, skillFetcher: fetcher } });
    realApp = await buildApp({ config, db: pg.handle.db, overrides: base });
  });
  afterAll(async () => {
    await app?.close();
    await realApp?.close();
    await pg?.stop();
  });

  async function skillRows() {
    const [row] = await pg.handle.db.select({ c: sql<number>`count(*)::int` }).from(t.skills);
    return row!.c;
  }

  it('GET /skills/community returns the whole catalog, stars desc (not routed to /skills/:id)', async () => {
    const res = await app.inject({ method: 'GET', url: '/skills/community' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{ id: string; stars: number; url: string }>;
    expect(body).toHaveLength(COMMUNITY_SKILLS.length);
    expect(body[0]!.stars).toBeGreaterThanOrEqual(body[body.length - 1]!.stars);
    expect(body.map((s) => s.id)).toContain('obra/superpowers:systematic-debugging');
  });

  it('filters by q and lang', async () => {
    const q = await app.inject({ method: 'GET', url: '/skills/community?q=Code-Review' });
    expect(q.statusCode).toBe(200);
    expect((q.json() as Array<{ name: string }>).map((s) => s.name).sort()).toEqual([
      'receiving-code-review',
      'requesting-code-review',
    ]);

    const lang = await app.inject({ method: 'GET', url: '/skills/community?lang=Python' });
    const langBody = lang.json() as Array<{ repo: string }>;
    expect(langBody).toHaveLength(3);
    expect(langBody.every((s) => s.repo === 'anthropics/skills')).toBe(true);

    const none = await app.inject({ method: 'GET', url: '/skills/community?q=zzz-nothing&lang=Shell' });
    expect(none.json()).toEqual([]);
  });

  it('/skills/:id still validates its uuid (community is a static route, not an id)', async () => {
    const res = await app.inject({ method: 'GET', url: '/skills/not-a-uuid' });
    expect(res.statusCode).toBe(422);
  });

  it('POST /skills/import/preview-url returns a preview with source_url and writes nothing', async () => {
    const before = await skillRows();
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview-url',
      payload: { url: RAW },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      filename: 'SKILL.md',
      name: 'systematic-debugging',
      description: 'Use when encountering any bug.',
      type: 'custom',
      source_url: RAW,
      ignored_files: [],
    });
    expect(fetcher.calls).toContain(RAW);
    expect(await skillRows()).toBe(before);
  });

  it('source_url is the final URL after redirects', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview-url',
      payload: { url: 'https://example.com/redirected' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().source_url).toBe('https://cdn.example.com/skills/SKILL.md');
  });

  it('file-upload preview reports source_url: null', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'SKILL.md', content_base64: Buffer.from(SKILL_MD).toString('base64') },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().source_url).toBeNull();
  });

  it('422 for an http:// URL, a loopback IP and a fetch failure (real + mock fetcher)', async () => {
    for (const a of [app, realApp]) {
      const http = await a.inject({
        method: 'POST',
        url: '/skills/import/preview-url',
        payload: { url: 'http://example.com/SKILL.md' },
      });
      expect(http.statusCode).toBe(422);
      expect(http.json().error.message).toMatch(/Only https/);

      const loop = await a.inject({
        method: 'POST',
        url: '/skills/import/preview-url',
        payload: { url: 'https://127.0.0.1/x' },
      });
      expect(loop.statusCode).toBe(422);
      expect(loop.json().error.message).toMatch(/Private, loopback/);
    }

    const missing = await app.inject({
      method: 'POST',
      url: '/skills/import/preview-url',
      payload: { url: 'https://example.com/missing.md' },
    });
    expect(missing.statusCode).toBe(422);
    expect(missing.json().error.message).toBe('Could not fetch skill: HTTP 404');
  });

  it('422 for a body that is not a URL', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview-url',
      payload: { url: 'nope' },
    });
    expect(res.statusCode).toBe(422);
  });
});
