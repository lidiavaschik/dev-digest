import type { CSSProperties } from "react";

/** Co-located styles for FindingsPanel (extracted from inline styles). */
export const s = {
  /** Row of «N CRITICAL · N WARNING · N SUGGESTION» pills, above the filters. */
  countsRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  countPill: (color: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    color,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  }),
  countDot: {
    color: "var(--text-muted)",
    fontSize: 12,
  } satisfies CSSProperties,
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  divider: {
    width: 1,
    height: 18,
    background: "var(--border)",
    margin: "0 2px",
  } satisfies CSSProperties,
  toggleGroup: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
} as const;
