/**
 * Tenancy: the repo-intel routes take a repo id straight from the URL, and every
 * table behind the facade is keyed by repo_id alone — so without an ownership
 * check the id itself grants access to whatever workspace owns it.
 *
 * Both routes now resolve the caller's workspace and assert the repo belongs to
 * it, answering 404 (not 403) so a repo in another workspace is indistinguishable
 * from one that never existed.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import type { FastifyInstance } from 'fastify';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('repo-intel routes are scoped to the caller workspace', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  /** A repo owned by the caller's (seeded, default) workspace. */
  let ownRepoId: string;
  /** A repo owned by a DIFFERENT workspace — must be invisible. */
  let foreignRepoId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);

    const [ownWorkspace] = await pg.handle.db.select().from(t.workspaces);
    const [otherWorkspace] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: 'other-tenant' })
      .returning();

    const [own] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ownWorkspace!.id, owner: 'acme', name: 'own', fullName: 'acme/own' })
      .returning();
    ownRepoId = own!.id;

    const [foreign] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId: otherWorkspace!.id,
        owner: 'evil',
        name: 'foreign',
        fullName: 'evil/foreign',
      })
      .returning();
    foreignRepoId = foreign!.id;

    app = await buildApp({ config: config(), db: pg.handle.db });
  });

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  it('GET /repos/:id/index-state returns the state for a repo in the caller workspace', async () => {
    const res = await app.inject({ method: 'GET', url: `/repos/${ownRepoId}/index-state` });
    expect(res.statusCode).toBe(200);
  });

  it('GET /repos/:id/index-state 404s for a repo owned by another workspace', async () => {
    const res = await app.inject({ method: 'GET', url: `/repos/${foreignRepoId}/index-state` });
    expect(res.statusCode).toBe(404);
    // Same answer as a non-existent repo — no "exists but forbidden" signal.
    expect(res.json().error.code).toBe('not_found');
  });

  it('POST /repos/:id/resync 404s for a repo owned by another workspace', async () => {
    const res = await app.inject({ method: 'POST', url: `/repos/${foreignRepoId}/resync` });
    expect(res.statusCode).toBe(404);
  });

  it('a repo id that matches no row is also a 404', async () => {
    const missing = '00000000-0000-0000-0000-000000000000';
    const res = await app.inject({ method: 'GET', url: `/repos/${missing}/index-state` });
    expect(res.statusCode).toBe(404);
  });
});
