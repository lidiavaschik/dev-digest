import type { CSSProperties } from "react";

export const s = {
  form: { display: "flex", flexDirection: "column" } satisfies CSSProperties,
  actions: { display: "flex", justifyContent: "flex-end" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", marginTop: 12 } satisfies CSSProperties,
} as const;
