/**
 * Pure derivations for the PR list. No DB, no HTTP — these are the rules that
 * used to live inline in routes.ts, where every branch needed a Postgres
 * container to reach. See INSIGHTS.md (2026-09-22) for the two that were got
 * wrong twice.
 */
import type { FindingSeverityRef, ReviewRef } from './ports.js';
import { rollupSeverities, type SeverityCounts } from './status.js';

export interface ReviewRollup {
  /** Review ids belonging to the latest run of EACH agent, across all PRs. */
  latestRunReviewIds: string[];
  /** PRs with at least one review row — "reviewed" vs "never reviewed". */
  reviewedPrIds: Set<string>;
  /** review id → pr id, so findings can be grouped back per PR. */
  prByReviewId: Map<string, string>;
  /** Latest 'review'-kind score per PR (only that kind carries a score). */
  latestScoreByPr: Map<string, number | null>;
}

/**
 * A PR's current findings = the latest run of EACH agent, summed.
 *
 * Neither "every run" (double-counts a re-run) nor "the newest run" (drops the
 * other agents) is right: a PR is reviewed by several agents, each re-runnable
 * on its own. So the grouping key is (pr_id, agent_id) and the newest run_id
 * within each group wins.
 *
 * `reviews` MUST arrive newest-first; the first row seen per key is the latest.
 */
export function rollupReviews(reviews: ReviewRef[]): ReviewRollup {
  const reviewedPrIds = new Set<string>();
  const prByReviewId = new Map<string, string>();
  const latestScoreByPr = new Map<string, number | null>();
  // A review with no agent_id can't be grouped with anything, so it stands alone.
  const agentKey = (rv: ReviewRef) => `${rv.prId}::${rv.agentId ?? `review:${rv.id}`}`;
  const latestRunByAgent = new Map<string, { runId: string | null; reviewId: string }>();

  for (const rv of reviews) {
    reviewedPrIds.add(rv.prId);
    prByReviewId.set(rv.id, rv.prId);
    const key = agentKey(rv);
    if (!latestRunByAgent.has(key)) {
      latestRunByAgent.set(key, { runId: rv.runId, reviewId: rv.id });
    }
    if (rv.kind === 'review' && !latestScoreByPr.has(rv.prId)) {
      latestScoreByPr.set(rv.prId, rv.score);
    }
  }

  // Match on run_id rather than on the single newest row: a run may leave a
  // 'summary' row beside its 'review', and both belong to that run. Reviews
  // predating run_id fall back to identifying the row itself.
  const latestRunReviewIds: string[] = [];
  for (const rv of reviews) {
    const latest = latestRunByAgent.get(agentKey(rv));
    if (!latest) continue;
    const inLatest = latest.runId ? rv.runId === latest.runId : rv.id === latest.reviewId;
    if (inLatest) latestRunReviewIds.push(rv.id);
  }

  return { latestRunReviewIds, reviewedPrIds, prByReviewId, latestScoreByPr };
}

/**
 * Per-PR severity breakdown from the findings of the latest-run reviews.
 *
 * NOTE: callers must NOT pre-filter reviews by `kind` — a 'summary' row's
 * findings count too. Filtering kind is only correct when reading a score.
 */
export function findingsCountsByPr(
  findings: FindingSeverityRef[],
  prByReviewId: Map<string, string>,
): Map<string, SeverityCounts> {
  const grouped = new Map<string, { severity: string }[]>();
  for (const f of findings) {
    const prId = prByReviewId.get(f.reviewId);
    if (!prId) continue;
    const list = grouped.get(prId);
    if (list) list.push(f);
    else grouped.set(prId, [f]);
  }
  const out = new Map<string, SeverityCounts>();
  for (const [prId, list] of grouped) out.set(prId, rollupSeverities(list));
  return out;
}

/** PRs whose diff stats are still zeroed, capped per request. */
export function needsStatBackfill<T extends { additions: number; deletions: number; filesCount: number }>(
  rows: T[],
  limit: number,
): T[] {
  return rows
    .filter((r) => r.additions === 0 && r.deletions === 0 && r.filesCount === 0)
    .slice(0, limit);
}
