/** Pure helpers for the Versions tab: a small LCS line diff + metadata changes. */
import type { Skill, SkillVersion } from "@devdigest/shared";

export type DiffLine = { kind: "same" | "add" | "del"; text: string };

/** Above this many LCS cells, skip the O(n·m) table and show a whole-body replace. */
export const MAX_DIFF_CELLS = 4_000_000;

/** Line diff from `before` to `after` (LCS). Removed lines precede added ones in a hunk. */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;
  if (n * m > MAX_DIFF_CELLS) {
    return [...a.map((text) => ({ kind: "del" as const, text })), ...b.map((text) => ({ kind: "add" as const, text }))];
  }
  // Flat (n+1)×(m+1) table: L(i, j) = LCS length of a[i..] and b[j..].
  const w = m + 1;
  const lcs = new Uint32Array((n + 1) * w);
  const L = (i: number, j: number) => lcs[i * w + j] ?? 0;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * w + j] = a[i] === b[j] ? L(i + 1, j + 1) + 1 : Math.max(L(i + 1, j), L(i, j + 1));
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const x = a[i] ?? "";
    const y = b[j] ?? "";
    if (x === y) {
      out.push({ kind: "same", text: x });
      i++;
      j++;
    } else if (L(i + 1, j) >= L(i, j + 1)) {
      out.push({ kind: "del", text: x });
      i++;
    } else {
      out.push({ kind: "add", text: y });
      j++;
    }
  }
  for (; i < n; i++) out.push({ kind: "del", text: a[i] ?? "" });
  for (; j < m; j++) out.push({ kind: "add", text: b[j] ?? "" });
  return out;
}

export type MetaField = "name" | "description" | "type";
export interface MetaChange {
  field: MetaField;
  from: string;
  to: string;
}

/** Non-body fields that differ between an old version and the current skill. */
export function metaChanges(version: Pick<SkillVersion, MetaField>, skill: Pick<Skill, MetaField>): MetaChange[] {
  const fields: MetaField[] = ["name", "description", "type"];
  return fields
    .filter((f) => version[f] !== skill[f])
    .map((f) => ({ field: f, from: version[f], to: skill[f] }));
}

/** YYYY-MM-DD from an ISO timestamp. */
export function isoDate(iso: string): string {
  return iso.slice(0, 10);
}
