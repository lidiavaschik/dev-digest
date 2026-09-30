import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 920 } satisfies CSSProperties,
  tiles: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 } satisfies CSSProperties,
  tile: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    padding: "14px 16px",
  } satisfies CSSProperties,
  tileLabel: {
    fontSize: 11.5,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  tileValue: { fontSize: 22, fontWeight: 700, marginTop: 8 } satisfies CSSProperties,
  tileValueMuted: { fontSize: 22, fontWeight: 700, marginTop: 8, color: "var(--text-muted)" } satisfies CSSProperties,
  note: { fontSize: 12.5, color: "var(--text-muted)", margin: "10px 0 22px" } satisfies CSSProperties,
  panel: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    padding: "14px 16px",
  } satisfies CSSProperties,
  panelTitle: {
    fontSize: 11.5,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 10,
  } satisfies CSSProperties,
  agentRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 0",
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  agentIcon: { color: "var(--accent)" } satisfies CSSProperties,
  agentName: { fontSize: 14, fontWeight: 500 } satisfies CSSProperties,
  open: {
    marginLeft: "auto",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 13,
    color: "var(--accent-text)",
    textDecoration: "none",
  } satisfies CSSProperties,
} as const;
