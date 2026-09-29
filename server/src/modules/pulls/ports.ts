/**
 * Ports for the pulls use cases — the interfaces PullsService depends on.
 *
 * Everything here is plain TypeScript over contracts: no Drizzle, no Fastify, no
 * Container. The row shapes are the service's own view of persistence, NOT
 * `$inferSelect` types — mapping a Drizzle row onto them is repository.ts's job,
 * which is what lets a service test run with an in-memory fake and no Postgres.
 */
import type { GitHubClient, PrFile, PrCommit } from '@devdigest/shared';

/** The slice of a repo row the pulls use cases need. */
export interface RepoRef {
  id: string;
  owner: string;
  name: string;
}

/** The slice of a pull_requests row the pulls use cases need. */
export interface PullRow {
  id: string;
  repoId: string;
  number: number;
  title: string;
  author: string;
  branch: string;
  base: string;
  headSha: string;
  lastReviewedSha: string | null;
  additions: number;
  deletions: number;
  filesCount: number;
  status: string;
  body: string | null;
  openedAt: Date | null;
  updatedAt: Date | null;
}

/** A reviews row, newest-first, as the findings rollup consumes it. */
export interface ReviewRef {
  id: string;
  prId: string;
  runId: string | null;
  agentId: string | null;
  score: number | null;
  kind: 'summary' | 'review';
}

/** One finding's severity, keyed back to its review. */
export interface FindingSeverityRef {
  reviewId: string;
  severity: string;
}

/** Fields written when a PR is imported or re-synced from GitHub. */
export interface UpsertPullInput {
  workspaceId: string;
  repoId: string;
  number: number;
  title: string;
  author: string;
  branch: string;
  base: string;
  headSha: string;
  additions: number;
  deletions: number;
  filesCount: number;
  status: string;
  openedAt: Date | null;
  updatedAt: Date | null;
}

export interface PrStats {
  additions: number;
  deletions: number;
  filesCount: number;
}

export interface PullsRepository {
  findRepo(workspaceId: string, repoId: string): Promise<RepoRef | undefined>;
  findRepoById(repoId: string): Promise<RepoRef | undefined>;
  findPull(workspaceId: string, prId: string): Promise<PullRow | undefined>;
  listPullsByRepo(repoId: string): Promise<PullRow[]>;
  upsertPull(input: UpsertPullInput): Promise<void>;
  updatePrStats(prId: string, stats: PrStats): Promise<void>;
  updatePrDetail(prId: string, detail: PrStats & { body: string | null }): Promise<void>;

  /** Reviews for the given PRs, NEWEST FIRST — the order the rollup relies on. */
  listReviewsForPrs(workspaceId: string, prIds: string[]): Promise<ReviewRef[]>;
  /** Severities of the NOT-dismissed findings of the given reviews. */
  listOutstandingFindingSeverities(reviewIds: string[]): Promise<FindingSeverityRef[]>;
  /** Total cost per PR; null for a PR whose runs carry no cost data. */
  sumRunCostByPr(workspaceId: string, prIds: string[]): Promise<Map<string, number | null>>;

  replaceFiles(prId: string, files: PrFile[]): Promise<void>;
  replaceCommits(prId: string, commits: PrCommit[]): Promise<void>;
  listFiles(prId: string): Promise<PrFile[]>;
  listCommits(prId: string): Promise<PrCommit[]>;
}

/** Resolves a GitHub client, or throws when no token is configured. */
export type GitHubClientFactory = () => Promise<GitHubClient>;

/**
 * The logging surface the service uses. Deliberately not Fastify's logger type —
 * the application layer must not know the framework (`service-no-http`).
 */
export interface Logger {
  warn(obj: Record<string, unknown>, msg: string): void;
}
