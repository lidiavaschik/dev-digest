import type { CSSProperties } from "react";

export const s = {
  panel: {
    maxWidth: 820,
    border: "1px dashed var(--border-strong)",
    borderRadius: 10,
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
} as const;
