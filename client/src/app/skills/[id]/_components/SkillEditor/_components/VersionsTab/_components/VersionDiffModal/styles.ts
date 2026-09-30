import type { CSSProperties } from "react";
import type { DiffLine } from "../../helpers";

const LINE_COLORS: Record<DiffLine["kind"], CSSProperties> = {
  add: { background: "var(--code-add)", color: "var(--code-add-text)" },
  del: { background: "var(--code-del)", color: "var(--code-del-text)" },
  same: { color: "var(--text-muted)" },
};

export const s = {
  footer: { display: "flex", justifyContent: "flex-end" } satisfies CSSProperties,
  body: { padding: 20 } satisfies CSSProperties,
  meta: { margin: "0 0 14px", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  metaItem: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  same: { fontSize: 13, color: "var(--text-muted)", marginBottom: 10 } satisfies CSSProperties,
  diff: {
    margin: 0,
    fontSize: 12.5,
    lineHeight: "19px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-surface)",
    padding: "8px 0",
    overflowX: "auto",
  } satisfies CSSProperties,
  line: (kind: DiffLine["kind"]): CSSProperties => ({ padding: "0 12px", whiteSpace: "pre", ...LINE_COLORS[kind] }),
  prefix: { display: "inline-block", width: 16, userSelect: "none" } satisfies CSSProperties,
} as const;
