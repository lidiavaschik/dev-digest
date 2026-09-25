import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import type { SeverityCounts } from "@/lib/types";
import { CARD_MAX_HEIGHT, CARD_WIDTH, SEVERITY_ORDER, VIEWPORT_MARGIN } from "./constants";

/**
 * The review rows of each agent's LATEST run — re-running one agent replaces
 * its own previous run, while a second agent adds to the total. Mirrors the
 * server's scoping for the FINDINGS column, so the card and the counters agree.
 *
 * `GET /pulls/:id/reviews` returns rows newest-first, so the first row seen per
 * agent names that agent's current run. The run_id match (rather than that one
 * row) keeps a 'summary' row beside its 'review' together, which the contract
 * allows; a review with no agent_id can't be grouped, so it stands alone.
 */
export function latestRunReviews(reviews: ReviewRecord[] | undefined): ReviewRecord[] {
  const all = reviews ?? [];
  const key = (r: ReviewRecord) => r.agent_id ?? `review:${r.id}`;
  const latestPerAgent = new Map<string, { runId: string | null; reviewId: string }>();
  for (const r of all) {
    if (!latestPerAgent.has(key(r))) {
      latestPerAgent.set(key(r), { runId: r.run_id ?? null, reviewId: r.id });
    }
  }
  return all.filter((r) => {
    const latest = latestPerAgent.get(key(r));
    if (!latest) return false;
    return latest.runId ? r.run_id === latest.runId : latest.reviewId === r.id;
  });
}

/**
 * Every still-outstanding finding of those runs, sorted by severity. Dismissed
 * findings are dropped so the card's header count matches the three counters
 * (which the server computes the same way).
 */
export function cardFindings(reviews: ReviewRecord[] | undefined): FindingRecord[] {
  return latestRunReviews(reviews)
    .flatMap((r) => r.findings)
    // `findings.severity` is an unconstrained text column, and the server's
    // rollupSeverities silently ignores anything outside the three. Match it,
    // or the card would list a row the counters never counted.
    .filter((f) => !f.dismissed_at && SEVERITY_ORDER[f.severity] != null)
    .sort((a, b) => SEVERITY_ORDER[a.severity]! - SEVERITY_ORDER[b.severity]!);
}

/** `src/api/users.ts:45` — or `:45-52` when the finding spans lines. */
export function fileRef(f: Pick<FindingRecord, "file" | "start_line" | "end_line">): string {
  return f.end_line > f.start_line
    ? `${f.file}:${f.start_line}-${f.end_line}`
    : `${f.file}:${f.start_line}`;
}

/** True when the PR has been reviewed but has nothing left to show. */
export function isEmptyCounts(counts: SeverityCounts): boolean {
  return counts.critical === 0 && counts.warning === 0 && counts.suggestion === 0;
}

/**
 * Place the card against its trigger. The card is portalled and `position:
 * fixed` (the PR table clips `overflow: hidden`), so it is positioned in
 * VIEWPORT coordinates — no scroll offsets. Flips above when there isn't room
 * below, and is clamped so a wide card never runs off a narrow window.
 */
export function cardPosition(
  rect: { top: number; bottom: number; left: number },
  viewport: { width: number; height: number },
): { top: number; left: number } {
  const below = viewport.height - rect.bottom;
  const flip = below < CARD_MAX_HEIGHT + VIEWPORT_MARGIN && rect.top > below;
  const top = flip ? Math.max(VIEWPORT_MARGIN, rect.top - CARD_MAX_HEIGHT - 8) : rect.bottom + 8;
  const maxLeft = viewport.width - CARD_WIDTH - VIEWPORT_MARGIN;
  const left = Math.max(VIEWPORT_MARGIN, Math.min(rect.left, maxLeft));
  return { top, left };
}
