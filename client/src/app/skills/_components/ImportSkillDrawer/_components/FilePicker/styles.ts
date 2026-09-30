import type { CSSProperties } from "react";

export const s = {
  pick: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    padding: "48px 24px",
    border: "1px dashed var(--border-strong)",
    borderRadius: 10,
    textAlign: "center",
  } satisfies CSSProperties,
  pickIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  hiddenInput: { display: "none" } satisfies CSSProperties,
  hint: { fontSize: 12.5, color: "var(--text-muted)", maxWidth: 420, lineHeight: 1.5 } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
} as const;
