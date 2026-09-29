/**
 * The PR-list rollup rules, unit-tested.
 *
 * These branches used to be reachable only through a Postgres container, because
 * the logic was inline in routes.ts — pulls-findings.it.test.ts spends ~8s to
 * cover them. They are pure functions now; this file runs in milliseconds and
 * covers the edge cases the integration suite does not (missing agent_id,
 * run_id-less legacy rows, ordering).
 *
 * The two rules worth guarding, both from server/INSIGHTS.md (2026-09-22):
 *   1. group by (pr_id, agent_id), newest run per group
 *   2. never filter on `kind` when aggregating findings
 */
import { describe, it, expect } from 'vitest';
import { findingsCountsByPr, needsStatBackfill, rollupReviews } from '../src/modules/pulls/helpers.js';
import type { ReviewRef } from '../src/modules/pulls/ports.js';

/** Newest-first is the contract of listReviewsForPrs. */
const rv = (p: Partial<ReviewRef> & { id: string }): ReviewRef => ({
  prId: 'pr1',
  runId: null,
  agentId: 'agentA',
  score: null,
  kind: 'review',
  ...p,
});

describe('rollupReviews — latest run of EACH agent', () => {
  it('keeps one run per agent, so two agents add up', () => {
    const out = rollupReviews([
      rv({ id: 'r-a2', agentId: 'agentA', runId: 'run-a2' }),
      rv({ id: 'r-b1', agentId: 'agentB', runId: 'run-b1' }),
      rv({ id: 'r-a1', agentId: 'agentA', runId: 'run-a1' }), // superseded
    ]);
    expect(out.latestRunReviewIds.sort()).toEqual(['r-a2', 'r-b1']);
  });

  it('a re-run replaces only its OWN agent, never the others', () => {
    const out = rollupReviews([
      rv({ id: 'r-a2', agentId: 'agentA', runId: 'run-a2' }),
      rv({ id: 'r-a1', agentId: 'agentA', runId: 'run-a1' }),
      rv({ id: 'r-b1', agentId: 'agentB', runId: 'run-b1' }),
    ]);
    expect(out.latestRunReviewIds).toContain('r-b1');
    expect(out.latestRunReviewIds).not.toContain('r-a1');
  });

  it("includes a 'summary' row that shares the latest run's run_id", () => {
    const out = rollupReviews([
      rv({ id: 'r-sum', runId: 'run1', kind: 'summary' }),
      rv({ id: 'r-rev', runId: 'run1', kind: 'review' }),
      rv({ id: 'r-old', runId: 'run0', kind: 'review' }),
    ]);
    expect(out.latestRunReviewIds.sort()).toEqual(['r-rev', 'r-sum']);
    expect(out.latestRunReviewIds).not.toContain('r-old');
  });

  it('a review with no agent_id stands alone instead of colliding with others', () => {
    const out = rollupReviews([
      rv({ id: 'r-x', agentId: null }),
      rv({ id: 'r-y', agentId: null }),
    ]);
    // Neither supersedes the other — they are not the same agent re-running.
    expect(out.latestRunReviewIds.sort()).toEqual(['r-x', 'r-y']);
  });

  it('falls back to the row itself for rows written before run_id existed', () => {
    const out = rollupReviews([
      rv({ id: 'r-new', runId: null }),
      rv({ id: 'r-old', runId: null }),
    ]);
    expect(out.latestRunReviewIds).toEqual(['r-new']);
  });

  it("only a 'review' row carries the score, but any row means 'reviewed'", () => {
    const out = rollupReviews([
      rv({ id: 'r-sum', kind: 'summary', score: 99, prId: 'pr1' }),
      rv({ id: 'r-rev', kind: 'review', score: 42, prId: 'pr1' }),
      rv({ id: 'r-s2', kind: 'summary', score: 7, prId: 'pr2' }),
    ]);
    expect(out.latestScoreByPr.get('pr1')).toBe(42);
    expect(out.latestScoreByPr.has('pr2')).toBe(false); // no score…
    expect(out.reviewedPrIds.has('pr2')).toBe(true); // …but still reviewed
  });

  it('is empty for a PR with no reviews at all', () => {
    const out = rollupReviews([]);
    expect(out.latestRunReviewIds).toEqual([]);
    expect(out.reviewedPrIds.size).toBe(0);
  });
});

describe('findingsCountsByPr', () => {
  it('rolls severities up per PR across several reviews', () => {
    const prByReviewId = new Map([
      ['r1', 'pr1'],
      ['r2', 'pr1'],
      ['r3', 'pr2'],
    ]);
    const counts = findingsCountsByPr(
      [
        { reviewId: 'r1', severity: 'CRITICAL' },
        { reviewId: 'r2', severity: 'WARNING' },
        { reviewId: 'r2', severity: 'WARNING' },
        { reviewId: 'r3', severity: 'SUGGESTION' },
      ],
      prByReviewId,
    );
    expect(counts.get('pr1')).toEqual({ critical: 1, warning: 2, suggestion: 0 });
    expect(counts.get('pr2')).toEqual({ critical: 0, warning: 0, suggestion: 1 });
  });

  it('drops a finding whose review belongs to no listed PR', () => {
    const counts = findingsCountsByPr(
      [{ reviewId: 'orphan', severity: 'CRITICAL' }],
      new Map([['r1', 'pr1']]),
    );
    expect(counts.size).toBe(0);
  });
});

describe('needsStatBackfill', () => {
  const row = (n: number, zero: boolean) => ({
    n,
    additions: zero ? 0 : 1,
    deletions: 0,
    filesCount: 0,
  });

  it('selects only fully-zeroed rows, capped', () => {
    const rows = [row(1, true), row(2, false), row(3, true), row(4, true)];
    expect(needsStatBackfill(rows, 2).map((r) => r.n)).toEqual([1, 3]);
  });

  it('returns nothing when every row already has stats', () => {
    expect(needsStatBackfill([row(1, false)], 10)).toEqual([]);
  });
});
