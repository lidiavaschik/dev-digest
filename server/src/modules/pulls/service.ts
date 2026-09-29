/**
 * PullsService — the pulls use cases.
 *
 * Local-first is the rule throughout: GitHub is a best-effort enrichment, never
 * a precondition. A missing token or an offline machine degrades to whatever was
 * persisted (seeded or previously imported) instead of failing the read.
 *
 * Depends only on ports: no Drizzle, no Fastify, no Container. A test can drive
 * it with an in-memory repository and a stub GitHub client, with no Postgres.
 */
import type {
  GitHubClient,
  PrCommentInput,
  PrDetail,
  PrMeta,
  PrReviewComment,
} from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { BACKFILL_LIMIT } from './constants.js';
import { findingsCountsByPr, needsStatBackfill, rollupReviews } from './helpers.js';
import type {
  GitHubClientFactory,
  Logger,
  PullRow,
  PullsRepository,
  RepoRef,
} from './ports.js';
import { deriveReviewStatus } from './status.js';

export class PullsService {
  constructor(
    private readonly repo: PullsRepository,
    private readonly github: GitHubClientFactory,
    private readonly log: Logger,
  ) {}

  /** A GitHub client, or null when none is configured / reachable. */
  private async githubOrNull(reason: string): Promise<GitHubClient | null> {
    try {
      return await this.github();
    } catch (err) {
      this.log.warn({ err }, reason);
      return null;
    }
  }

  async listPullsForRepo(workspaceId: string, repoId: string): Promise<PrMeta[]> {
    const repo = await this.repo.findRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const gh = await this.githubOrNull(
      'GitHub client unavailable (no token / offline); serving persisted PRs',
    );
    if (gh) await this.syncPullsFromGitHub(gh, workspaceId, repo);

    const rows = await this.repo.listPullsByRepo(repo.id);
    if (gh) await this.backfillDiffStats(gh, repo, rows);

    const prIds = rows.map((r) => r.id);
    // Latest-review score, "was it reviewed at all", and which review rows belong
    // to each agent's latest run — one pass over the same newest-first rows.
    const reviews = await this.repo.listReviewsForPrs(workspaceId, prIds);
    const rollup = rollupReviews(reviews);

    const findings = await this.repo.listOutstandingFindingSeverities(rollup.latestRunReviewIds);
    const findingsByPr = findingsCountsByPr(findings, rollup.prByReviewId);
    const costByPr = await this.repo.sumRunCostByPr(workspaceId, prIds);

    const now = Date.now();
    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      title: r.title,
      author: r.author,
      branch: r.branch,
      base: r.base,
      head_sha: r.headSha,
      additions: r.additions,
      deletions: r.deletions,
      files_count: r.filesCount,
      status: deriveReviewStatus({
        ghStatus: r.status,
        lastReviewedSha: r.lastReviewedSha,
        headSha: r.headSha,
        updatedAt: r.updatedAt,
        now,
      }),
      opened_at: r.openedAt?.toISOString() ?? null,
      updated_at: r.updatedAt?.toISOString() ?? null,
      score: rollup.latestScoreByPr.has(r.id) ? rollup.latestScoreByPr.get(r.id)! : null,
      cost_usd: costByPr.get(r.id) ?? null,
      // Null = never reviewed (what the score ring shows as "—");
      // {0,0,0} = reviewed with nothing outstanding.
      findings_counts: rollup.reviewedPrIds.has(r.id)
        ? findingsByPr.get(r.id) ?? { critical: 0, warning: 0, suggestion: 0 }
        : null,
    }));
  }

  /** Idempotent import (unique repo_id + number); never fails the read. */
  private async syncPullsFromGitHub(
    gh: GitHubClient,
    workspaceId: string,
    repo: RepoRef,
  ): Promise<void> {
    try {
      const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
      for (const pr of pulls) {
        await this.repo.upsertPull({
          workspaceId,
          repoId: repo.id,
          number: pr.number,
          title: pr.title,
          author: pr.author,
          branch: pr.branch,
          base: pr.base,
          headSha: pr.head_sha,
          additions: pr.additions,
          deletions: pr.deletions,
          filesCount: pr.files_count,
          status: pr.status,
          openedAt: pr.opened_at ? new Date(pr.opened_at) : null,
          updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
        });
      }
    } catch (err) {
      this.log.warn({ err }, 'GitHub PR sync skipped (no token / offline); serving persisted PRs');
    }
  }

  /**
   * GitHub's PR-LIST payload carries no diff stats, so freshly-imported PRs land
   * with zeroed size. Backfill from the detail endpoint, capped per request (one
   * fetch each); the periodic refetch chips away at any remainder. Mutates `rows`
   * so the response reflects the backfill without a re-read.
   */
  private async backfillDiffStats(
    gh: GitHubClient,
    repo: RepoRef,
    rows: PullRow[],
  ): Promise<void> {
    for (const r of needsStatBackfill(rows, BACKFILL_LIMIT)) {
      try {
        const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, r.number);
        await this.repo.updatePrStats(r.id, {
          additions: detail.additions,
          deletions: detail.deletions,
          filesCount: detail.files_count,
        });
        r.additions = detail.additions;
        r.deletions = detail.deletions;
        r.filesCount = detail.files_count;
      } catch (err) {
        this.log.warn({ err, number: r.number }, 'PR diff-stat backfill skipped');
      }
    }
  }

  async getPullDetail(workspaceId: string, prId: string): Promise<PrDetail> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, prId);

    try {
      const gh = await this.github();
      const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pr.number);
      await this.repo.replaceFiles(pr.id, detail.files);
      await this.repo.replaceCommits(pr.id, detail.commits);
      await this.repo.updatePrDetail(pr.id, {
        body: detail.body ?? null,
        additions: detail.additions,
        deletions: detail.deletions,
        filesCount: detail.files_count,
      });
      return { ...detail, id: pr.id };
    } catch (err) {
      this.log.warn(
        { err },
        'GitHub PR detail refresh skipped (no token / offline); serving persisted detail',
      );
      return this.persistedDetail(pr);
    }
  }

  private async persistedDetail(pr: PullRow): Promise<PrDetail> {
    const [files, commits] = await Promise.all([
      this.repo.listFiles(pr.id),
      this.repo.listCommits(pr.id),
    ]);
    return {
      id: pr.id,
      number: pr.number,
      title: pr.title,
      author: pr.author,
      branch: pr.branch,
      base: pr.base,
      head_sha: pr.headSha,
      additions: pr.additions,
      deletions: pr.deletions,
      files_count: pr.filesCount,
      status: pr.status as PrDetail['status'],
      opened_at: pr.openedAt?.toISOString() ?? null,
      updated_at: pr.updatedAt?.toISOString() ?? null,
      body: pr.body ?? null,
      files,
      commits,
    };
  }

  private async resolvePrAndRepo(
    workspaceId: string,
    prId: string,
  ): Promise<{ pr: PullRow; repo: RepoRef }> {
    const pr = await this.repo.findPull(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.findRepoById(pr.repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return { pr, repo };
  }

  // ---- Inline review comments (Files changed tab) -------------------------
  // Proxied live to GitHub with no local persistence, so the tab stays in
  // lock-step with GitHub instead of maintaining a stale mirror.

  async listComments(workspaceId: string, prId: string): Promise<PrReviewComment[]> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, prId);
    const gh = await this.githubOrNull('GitHub client unavailable; serving no PR comments');
    if (!gh) return [];
    try {
      return await gh.listReviewComments({ owner: repo.owner, name: repo.name }, pr.number);
    } catch (err) {
      this.log.warn({ err }, 'GitHub review-comments fetch skipped (offline / error)');
      return [];
    }
  }

  async createComment(
    workspaceId: string,
    prId: string,
    input: PrCommentInput,
  ): Promise<PrReviewComment> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, prId);
    let gh: GitHubClient;
    try {
      gh = await this.github();
    } catch {
      throw new AppError('github_unavailable', 'Connect a GitHub token to post comments.', 400);
    }
    try {
      return await gh.createReviewComment({ owner: repo.owner, name: repo.name }, pr.number, {
        commitId: pr.headSha,
        path: input.path,
        line: input.line,
        ...(input.side ? { side: input.side } : {}),
        body: input.body,
        ...(input.in_reply_to != null ? { inReplyTo: input.in_reply_to } : {}),
      });
    } catch (err) {
      // GitHub rejects comments on lines outside the diff / on closed PRs (422).
      const msg = err instanceof Error ? err.message : 'Failed to post the comment to GitHub.';
      throw new AppError('github_comment_failed', msg, 400, { cause: String(err) });
    }
  }
}
