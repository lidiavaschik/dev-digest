import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 860 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  subtitle: { fontSize: 13.5, color: "var(--text-secondary)", margin: "4px 0 18px", lineHeight: 1.5 } satisfies CSSProperties,
  list: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    overflow: "hidden",
  } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "12px 16px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  pill: {
    fontSize: 12,
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: 99,
    background: "var(--accent-bg)",
    color: "var(--accent-text)",
    flexShrink: 0,
  } satisfies CSSProperties,
  message: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  date: { fontSize: 12.5, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  actions: { display: "flex", gap: 8, flexShrink: 0, minWidth: 150, justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
