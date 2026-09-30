import type { CSSProperties } from "react";

export const s = {
  loading: { padding: 28, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  editor: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } satisfies CSSProperties,
} as const;
