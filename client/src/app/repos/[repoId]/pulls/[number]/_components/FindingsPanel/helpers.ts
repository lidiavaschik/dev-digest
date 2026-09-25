import type { FindingRecord, Severity } from "@devdigest/shared";
import { LOW_CONFIDENCE_THRESHOLD, SEVERITY_ORDER } from "./constants";

/** Optionally drop low-confidence findings and sort by severity. */
export function visibleFindings(findings: FindingRecord[], hideLow: boolean): FindingRecord[] {
  let shown = findings;
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}

/**
 * Tally THIS run's findings per severity — a plain group-by over findings that
 * are already in memory, so opening the panel or flipping a filter never costs
 * a request, let alone a model call.
 *
 * Counted on the confidence-filtered list and NOT on the severity-filtered one,
 * so each pill keeps answering "how many cards you get if you pick this" while
 * a filter is active.
 */
export function countBySeverity(findings: FindingRecord[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) {
    if (f.severity in counts) counts[f.severity] += 1;
  }
  return counts;
}

/** Narrow to one severity; `null` means "no severity filter". */
export function bySeverity(findings: FindingRecord[], severity: Severity | null): FindingRecord[] {
  return severity ? findings.filter((f) => f.severity === severity) : findings;
}
