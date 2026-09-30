import type { CSSProperties } from "react";

export const s = {
  loading: { padding: 28, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  secondary: { display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 8, marginTop: -40 } satisfies CSSProperties,
} as const;
