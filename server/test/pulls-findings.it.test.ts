import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

/**
 * The PR list's FINDINGS column: a per-severity tally of the LATEST run of EACH
 * agent, summed — the PR's current verdict, every agent's newest word on it.
 * Re-running one agent replaces its own earlier run; a second agent adds to the
 * total. Dismissed findings are excluded (the column answers "what is still
 * outstanding"). `null` means never reviewed — the same "—" signal the SCORE
 * ring uses — and must stay distinguishable from a reviewed PR that has nothing
 * left, which is {0,0,0}.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let seq = 0;

d('PR list findings breakdown (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const app = () =>
    buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), git: new MockGitClient({ diff: '' }) },
    });

  /** A repo with `count` PRs; `number` keeps them distinct inside the repo. */
  async function repoWithPrs(count = 1) {
    const name = `findings-repo-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const prs = [];
    for (let i = 0; i < count; i++) {
      const [pr] = await pg.handle.db
        .insert(t.pullRequests)
        .values({
          workspaceId,
          repoId: repo!.id,
          number: i + 1,
          title: 'Add rate limiting',
          author: 'marisa.koch',
          branch: `feat/rl-${i}`,
          base: 'main',
          headSha: 'a1b2c3d4',
          additions: 1,
          deletions: 0,
          filesCount: 1,
          status: 'open',
        })
        .returning();
      prs.push(pr!);
    }
    return { repo: repo!, prs, pr: prs[0]! };
  }

  /** `createdAt` is explicit so "which run is latest" never depends on timing. */
  async function insertReview(
    prId: string,
    opts: {
      kind?: 'review' | 'summary';
      runId?: string;
      agentId?: string;
      at?: Date;
    } = {},
  ): Promise<string> {
    const [row] = await pg.handle.db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId,
        kind: opts.kind ?? 'review',
        runId: opts.runId ?? null,
        agentId: opts.agentId ?? null,
        verdict: 'request_changes',
        score: 61,
        ...(opts.at ? { createdAt: opts.at } : {}),
      })
      .returning({ id: t.reviews.id });
    return row!.id;
  }

  const OLDER = new Date('2026-06-01T10:00:00.000Z');
  const NEWER = new Date('2026-06-02T10:00:00.000Z');

  async function insertFinding(
    reviewId: string,
    severity: string,
    values: Partial<typeof t.findings.$inferInsert> = {},
  ) {
    await pg.handle.db.insert(t.findings).values({
      reviewId,
      file: 'src/config.ts',
      startLine: 12,
      endLine: 12,
      severity,
      category: 'security',
      title: `A ${severity} finding`,
      rationale: 'because',
      confidence: 0.9,
      ...values,
    });
  }

  /** The single PR row the list returns for `repoId`. */
  async function listOne(a: Awaited<ReturnType<typeof app>>, repoId: string) {
    const rows = (await a.inject({ method: 'GET', url: `/repos/${repoId}/pulls` })).json();
    return rows[0];
  }

  it("sums the latest run of EACH agent — two agents add up", async () => {
    const a = await app();
    const { repo, pr } = await repoWithPrs();
    const security = crypto.randomUUID();
    const perf = crypto.randomUUID();
    const one = await insertReview(pr.id, { agentId: security, runId: crypto.randomUUID() });
    await insertFinding(one, 'CRITICAL');
    await insertFinding(one, 'WARNING');
    const two = await insertReview(pr.id, { agentId: perf, runId: crypto.randomUUID() });
    await insertFinding(two, 'CRITICAL');
    await insertFinding(two, 'SUGGESTION');

    // Different agents are different opinions on the same PR — both count.
    expect((await listOne(a, repo.id)).findings_counts).toEqual({
      critical: 2,
      warning: 1,
      suggestion: 1,
    });

    await a.close();
  });

  it("re-running ONE agent replaces that agent's earlier run", async () => {
    const a = await app();
    const { repo, pr } = await repoWithPrs();
    const agentId = crypto.randomUUID();
    const stale = await insertReview(pr.id, { agentId, runId: crypto.randomUUID(), at: OLDER });
    await insertFinding(stale, 'CRITICAL');
    await insertFinding(stale, 'WARNING');
    const fresh = await insertReview(pr.id, { agentId, runId: crypto.randomUUID(), at: NEWER });
    await insertFinding(fresh, 'SUGGESTION');

    // The superseded run's 2 findings are gone, not added in.
    expect((await listOne(a, repo.id)).findings_counts).toEqual({
      critical: 0,
      warning: 0,
      suggestion: 1,
    });

    await a.close();
  });

  it("keeps each agent's newest run when some agents re-ran and others didn't", async () => {
    const a = await app();
    const { repo, pr } = await repoWithPrs();
    const reRun = crypto.randomUUID();
    const untouched = crypto.randomUUID();
    const stale = await insertReview(pr.id, { agentId: reRun, runId: crypto.randomUUID(), at: OLDER });
    await insertFinding(stale, 'CRITICAL');
    const other = await insertReview(pr.id, { agentId: untouched, runId: crypto.randomUUID(), at: OLDER });
    await insertFinding(other, 'WARNING');
    const fresh = await insertReview(pr.id, { agentId: reRun, runId: crypto.randomUUID(), at: NEWER });
    await insertFinding(fresh, 'SUGGESTION');

    // The other agent's older run is still current FOR THAT AGENT, so it stays.
    expect((await listOne(a, repo.id)).findings_counts).toEqual({
      critical: 0,
      warning: 1,
      suggestion: 1,
    });

    await a.close();
  });

  it('excludes dismissed findings, and drops the count rather than the PR', async () => {
    const a = await app();
    const { repo, pr } = await repoWithPrs();
    const review = await insertReview(pr.id);
    await insertFinding(review, 'CRITICAL');
    await insertFinding(review, 'CRITICAL', { dismissedAt: new Date() });
    await insertFinding(review, 'WARNING', { dismissedAt: new Date() });

    expect((await listOne(a, repo.id)).findings_counts).toEqual({
      critical: 1,
      warning: 0,
      suggestion: 0,
    });

    await a.close();
  });

  it("includes a 'summary' review's findings when it belongs to the same run", async () => {
    const a = await app();
    const { repo, pr } = await repoWithPrs();
    const runId = crypto.randomUUID();
    const agentId = crypto.randomUUID();
    const review = await insertReview(pr.id, { kind: 'review', runId, agentId, at: NEWER });
    await insertFinding(review, 'CRITICAL');
    const summary = await insertReview(pr.id, { kind: 'summary', runId, agentId, at: NEWER });
    await insertFinding(summary, 'WARNING');

    // Same agent, same run, two rows: the run_id grouping must keep both rather
    // than treat the summary as a superseded run. GET /pulls/:id/reviews doesn't
    // filter kind either.
    expect((await listOne(a, repo.id)).findings_counts).toEqual({
      critical: 1,
      warning: 1,
      suggestion: 0,
    });

    await a.close();
  });

  it('a reviewed PR with nothing outstanding is {0,0,0}, not null', async () => {
    const a = await app();
    const { repo, pr } = await repoWithPrs();
    const review = await insertReview(pr.id);
    await insertFinding(review, 'CRITICAL', { dismissedAt: new Date() });

    expect((await listOne(a, repo.id)).findings_counts).toEqual({
      critical: 0,
      warning: 0,
      suggestion: 0,
    });

    await a.close();
  });

  it('a PR that was never reviewed is null, so the cell reads "—"', async () => {
    const a = await app();
    const { repo } = await repoWithPrs();

    expect((await listOne(a, repo.id)).findings_counts).toBeNull();

    await a.close();
  });

  it("does not leak another PR's findings into the tally", async () => {
    const a = await app();
    const { repo, prs } = await repoWithPrs(2);
    const mine = await insertReview(prs[0]!.id);
    await insertFinding(mine, 'CRITICAL');
    const theirs = await insertReview(prs[1]!.id);
    await insertFinding(theirs, 'WARNING');
    await insertFinding(theirs, 'SUGGESTION');

    const rows = (await a.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const byNumber = new Map<number, { findings_counts: unknown }>(
      rows.map((r: { number: number }) => [r.number, r] as const),
    );
    expect(byNumber.get(1)!.findings_counts).toEqual({ critical: 1, warning: 0, suggestion: 0 });
    expect(byNumber.get(2)!.findings_counts).toEqual({ critical: 0, warning: 1, suggestion: 1 });

    await a.close();
  });
});
