import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 820 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 20 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  enabledLabel: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  actions: { display: "flex", gap: 10, marginTop: 4 } satisfies CSSProperties,
  danger: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    marginTop: 36,
    padding: "14px 16px",
    border: "1px solid var(--crit-bg)",
    borderRadius: 8,
  } satisfies CSSProperties,
  dangerText: { flex: 1 } satisfies CSSProperties,
  dangerTitle: { fontSize: 14, fontWeight: 600, color: "var(--crit)" } satisfies CSSProperties,
  dangerBody: { fontSize: 13, color: "var(--text-muted)", marginTop: 4 } satisfies CSSProperties,
} as const;
