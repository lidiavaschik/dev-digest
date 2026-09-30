import type { CSSProperties } from "react";

export const s = {
  error: { color: "var(--crit)", fontWeight: 500 } satisfies CSSProperties,
} as const;
