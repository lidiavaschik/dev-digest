import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 820 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  subtitle: { fontSize: 13.5, color: "var(--text-secondary)", margin: "4px 0 18px" } satisfies CSSProperties,
  card: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    padding: "18px 22px",
    fontSize: 14,
  } satisfies CSSProperties,
} as const;
