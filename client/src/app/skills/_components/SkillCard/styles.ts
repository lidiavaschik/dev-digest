import type { CSSProperties } from "react";

export const s = {
  card: (active: boolean): CSSProperties => ({
    padding: "12px 14px",
    borderRadius: 8,
    cursor: "pointer",
    border: "1px solid " + (active ? "var(--accent)" : "var(--border)"),
    background: active ? "var(--bg-hover)" : "var(--bg-elevated)",
    marginBottom: 10,
    outline: "none",
  }),
  headerRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  name: (enabled: boolean): CSSProperties => ({
    flex: 1,
    minWidth: 0,
    fontSize: 13.5,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    color: enabled ? "var(--text-primary)" : "var(--text-secondary)",
  }),
  description: {
    fontSize: 13,
    color: "var(--text-muted)",
    margin: "8px 0 0",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  chips: { display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" } satisfies CSSProperties,
  source: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  divider: { height: 1, background: "var(--border)", margin: "10px 0 8px" } satisfies CSSProperties,
  footer: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
