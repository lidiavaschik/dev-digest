import type { CSSProperties } from "react";

export const s = {
  row: { display: "flex", alignItems: "center", gap: 12, padding: "16px 28px 0", flexShrink: 0 } satisfies CSSProperties,
  name: {
    fontSize: 20,
    fontWeight: 700,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  right: { marginLeft: "auto" } satisfies CSSProperties,
} as const;
