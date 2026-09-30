import type { CSSProperties } from "react";

export const s = {
  card: {
    display: "flex",
    gap: 14,
    alignItems: "flex-start",
    padding: "14px 16px",
    border: "1px solid var(--border)",
    borderRadius: 9,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 } satisfies CSSProperties,
  name: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  repo: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  meta: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  stars: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  starIcon: { color: "var(--warn)" } satisfies CSSProperties,
  desc: {
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } satisfies CSSProperties,
  action: { flexShrink: 0 } satisfies CSSProperties,
} as const;
