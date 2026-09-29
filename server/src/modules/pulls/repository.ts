/**
 * Drizzle implementation of the pulls ports. The only file in this module that
 * knows the schema exists; everything above it sees the plain shapes in ports.ts.
 */
import { and, desc, eq, inArray, isNull, sum } from 'drizzle-orm';
import type { PrCommit, PrFile } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type {
  FindingSeverityRef,
  PrStats,
  PullRow,
  PullsRepository,
  RepoRef,
  ReviewRef,
  UpsertPullInput,
} from './ports.js';

export class PullsRepo implements PullsRepository {
  constructor(private readonly db: Db) {}

  async findRepo(workspaceId: string, repoId: string): Promise<RepoRef | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id, owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async findRepoById(repoId: string): Promise<RepoRef | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id, owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(eq(t.repos.id, repoId));
    return row;
  }

  async findPull(workspaceId: string, prId: string): Promise<PullRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async listPullsByRepo(repoId: string): Promise<PullRow[]> {
    return this.db.select().from(t.pullRequests).where(eq(t.pullRequests.repoId, repoId));
  }

  async upsertPull(input: UpsertPullInput): Promise<void> {
    await this.db
      .insert(t.pullRequests)
      .values(input)
      .onConflictDoUpdate({
        target: [t.pullRequests.repoId, t.pullRequests.number],
        set: {
          title: input.title,
          headSha: input.headSha,
          status: input.status,
          updatedAt: input.updatedAt,
        },
      });
  }

  async updatePrStats(prId: string, stats: PrStats): Promise<void> {
    await this.db.update(t.pullRequests).set(stats).where(eq(t.pullRequests.id, prId));
  }

  async updatePrDetail(prId: string, detail: PrStats & { body: string | null }): Promise<void> {
    await this.db.update(t.pullRequests).set(detail).where(eq(t.pullRequests.id, prId));
  }

  /** Newest first — rollupReviews() depends on this ordering. */
  async listReviewsForPrs(workspaceId: string, prIds: string[]): Promise<ReviewRef[]> {
    if (prIds.length === 0) return [];
    return this.db
      .select({
        id: t.reviews.id,
        prId: t.reviews.prId,
        runId: t.reviews.runId,
        agentId: t.reviews.agentId,
        score: t.reviews.score,
        kind: t.reviews.kind,
      })
      .from(t.reviews)
      .where(and(eq(t.reviews.workspaceId, workspaceId), inArray(t.reviews.prId, prIds)))
      .orderBy(desc(t.reviews.createdAt));
  }

  async listOutstandingFindingSeverities(reviewIds: string[]): Promise<FindingSeverityRef[]> {
    if (reviewIds.length === 0) return [];
    return this.db
      .select({ reviewId: t.findings.reviewId, severity: t.findings.severity })
      .from(t.findings)
      .where(and(inArray(t.findings.reviewId, reviewIds), isNull(t.findings.dismissedAt)));
  }

  /**
   * `sum()` yields null (not 0) for a PR whose runs all have NULL cost — drizzle
   * short-circuits the decoder on null. That distinction is load-bearing: the UI
   * renders "—" for null and "$0.00" only for a genuine zero.
   */
  async sumRunCostByPr(workspaceId: string, prIds: string[]): Promise<Map<string, number | null>> {
    const out = new Map<string, number | null>();
    if (prIds.length === 0) return out;
    const rows = await this.db
      .select({ prId: t.agentRuns.prId, cost: sum(t.agentRuns.costUsd).mapWith(Number) })
      .from(t.agentRuns)
      .where(and(eq(t.agentRuns.workspaceId, workspaceId), inArray(t.agentRuns.prId, prIds)))
      .groupBy(t.agentRuns.prId);
    for (const r of rows) if (r.prId) out.set(r.prId, r.cost ?? null);
    return out;
  }

  async replaceFiles(prId: string, files: PrFile[]): Promise<void> {
    await this.db.delete(t.prFiles).where(eq(t.prFiles.prId, prId));
    if (files.length === 0) return;
    await this.db.insert(t.prFiles).values(
      files.map((f) => ({
        prId,
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch ?? null,
      })),
    );
  }

  async replaceCommits(prId: string, commits: PrCommit[]): Promise<void> {
    await this.db.delete(t.prCommits).where(eq(t.prCommits.prId, prId));
    if (commits.length === 0) return;
    await this.db.insert(t.prCommits).values(
      commits.map((c) => ({
        prId,
        sha: c.sha,
        message: c.message,
        author: c.author,
        committedAt: c.committed_at ? new Date(c.committed_at) : null,
      })),
    );
  }

  async listFiles(prId: string): Promise<PrFile[]> {
    const rows = await this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
    return rows.map((f) => ({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch ?? null,
    }));
  }

  async listCommits(prId: string): Promise<PrCommit[]> {
    const rows = await this.db.select().from(t.prCommits).where(eq(t.prCommits.prId, prId));
    return rows.map((c) => ({
      sha: c.sha,
      message: c.message,
      author: c.author,
      committed_at: c.committedAt?.toISOString() ?? null,
    }));
  }
}
