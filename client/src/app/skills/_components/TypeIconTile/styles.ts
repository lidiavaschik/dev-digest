import type { CSSProperties } from "react";

export const s = {
  tile: (size: number, color: string, bg: string): CSSProperties => ({
    width: size,
    height: size,
    borderRadius: Math.round(size / 4),
    background: bg,
    color,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  }),
} as const;
