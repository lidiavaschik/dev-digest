import type { FindingActionKind, Severity } from "@devdigest/shared";

/**
 * The three severities in display order, with the lowercase key their label
 * lives under in messages/en/prReview.json (`severity.*`).
 */
export const SEVERITIES: { key: Severity; labelKey: "critical" | "warning" | "suggestion" }[] = [
  { key: "CRITICAL", labelKey: "critical" },
  { key: "WARNING", labelKey: "warning" },
  { key: "SUGGESTION", labelKey: "suggestion" },
];

/** Sort weight per severity (lower = shown first). */
export const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
  INFO: 3,
};

/** Confidence below this is hidden when "hide low confidence" is on. */
export const LOW_CONFIDENCE_THRESHOLD = 0.65;

/** Keyboard shortcut → finding action. */
export const KEY_TO_ACTION: Record<string, FindingActionKind> = {
  a: "accept",
  d: "dismiss",
};
