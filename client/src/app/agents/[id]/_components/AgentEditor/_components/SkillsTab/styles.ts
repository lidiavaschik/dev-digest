import type { CSSProperties } from "react";

/** Co-located styles for SkillsTab. */
export const s = {
  wrap: { maxWidth: 1060 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 14, marginBottom: 14 } satisfies CSSProperties,
  h2: { fontSize: 20, fontWeight: 700 } satisfies CSSProperties,
  counter: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--accent-text)",
    background: "var(--accent-bg)",
    padding: "3px 10px",
    borderRadius: 6,
  } satisfies CSSProperties,
  saving: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  filter: {
    marginLeft: "auto",
    width: 300,
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  filterIcon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  filterInput: {
    flex: 1,
    minWidth: 0,
    border: "none",
    outline: "none",
    background: "transparent",
    color: "var(--text-primary)",
    fontSize: 13.5,
  } satisfies CSSProperties,
  hint: { fontSize: 13.5, color: "var(--text-muted)", marginBottom: 16 } satisfies CSSProperties,
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  row: (o: {
    checked: boolean;
    dimmed: boolean;
    dragging: boolean;
    dropAbove: boolean;
    dropBelow: boolean;
  }) =>
    ({
      display: "flex",
      alignItems: "center",
      gap: 14,
      padding: "12px 16px",
      borderRadius: 8,
      border: "1px solid var(--border)",
      background: o.checked ? "var(--bg-hover)" : "var(--bg-elevated)",
      opacity: o.dragging ? 0.4 : o.dimmed ? 0.55 : 1,
      boxShadow: o.dropAbove
        ? "inset 0 2px 0 var(--accent)"
        : o.dropBelow
          ? "inset 0 -2px 0 var(--accent)"
          : undefined,
      transition: "background 120ms, opacity 120ms",
    }) satisfies CSSProperties,
  handle: (enabled: boolean) =>
    ({
      display: "grid",
      placeItems: "center",
      padding: 2,
      border: "none",
      background: "transparent",
      color: "var(--text-muted)",
      cursor: enabled ? "grab" : "not-allowed",
      opacity: enabled ? 1 : 0.4,
      flexShrink: 0,
    }) satisfies CSSProperties,
  checkbox: (checked: boolean) =>
    ({
      width: 18,
      height: 18,
      borderRadius: 4,
      border: "1.5px solid " + (checked ? "var(--accent)" : "var(--border-strong)"),
      background: checked ? "var(--accent)" : "transparent",
      display: "grid",
      placeItems: "center",
      padding: 0,
      cursor: "pointer",
      flexShrink: 0,
    }) satisfies CSSProperties,
  name: {
    flex: 1,
    minWidth: 0,
    fontSize: 14.5,
    fontWeight: 500,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    cursor: "pointer",
    userSelect: "none",
  } satisfies CSSProperties,
  type: (color: string, bg: string) =>
    ({
      fontSize: 12,
      fontWeight: 500,
      color,
      background: bg,
      padding: "3px 10px",
      borderRadius: 5,
      flexShrink: 0,
    }) satisfies CSSProperties,
  empty: {
    padding: "18px 14px",
    borderRadius: 8,
    border: "1px dashed var(--border-strong)",
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  link: { color: "var(--accent-text)" } satisfies CSSProperties,
} as const;
