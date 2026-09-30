/** Pure helpers for the agent Skills tab — no React. */
import type { AgentSkill, Skill } from "@devdigest/shared";

/**
 * One row of the tab: EVERY workspace skill is listed; `enabled` = the per-agent
 * checkbox. Array position = prompt order (unchecked rows keep their slot so a
 * later re-check restores it).
 */
export interface SkillRow {
  skill: Skill;
  enabled: boolean;
}

/** Payload item for PUT /agents/:id/skills. */
export interface SkillItem {
  skill_id: string;
  enabled: boolean;
}

/** Move `list[from]` to index `to`. Returns a new array; out-of-range is a no-op copy. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

/**
 * Linked skills first, in their saved order; then every not-yet-linked
 * workspace skill (unchecked), by name. A linked skill missing from the
 * workspace list (race after a delete) falls back to the linked copy.
 */
export function buildRows(linked: readonly AgentSkill[], all: readonly Skill[]): SkillRow[] {
  const byId = new Map(all.map((s) => [s.id, s]));
  const ordered = [...linked].sort((a, b) => a.order - b.order);
  const seen = new Set(ordered.map((l) => l.id));
  const head = ordered.map((l) => ({ skill: byId.get(l.id) ?? l, enabled: l.link_enabled }));
  const tail = all
    .filter((s) => !seen.has(s.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((skill) => ({ skill, enabled: false }));
  return [...head, ...tail];
}

/** Rows → PUT payload. Every row is sent so the full order (unchecked slots too) persists. */
export function toItems(rows: readonly SkillRow[]): SkillItem[] {
  return rows.map((r) => ({ skill_id: r.skill.id, enabled: r.enabled }));
}

/** How many rows are checked for this agent. */
export function countEnabled(rows: readonly SkillRow[]): number {
  return rows.filter((r) => r.enabled).length;
}

/** Case-insensitive name/description filter; keeps each row's real index for reordering. */
export function filterRows(
  rows: readonly SkillRow[],
  query: string,
): { row: SkillRow; index: number }[] {
  const q = query.trim().toLowerCase();
  const all = rows.map((row, index) => ({ row, index }));
  if (!q) return all;
  return all.filter(
    ({ row }) =>
      row.skill.name.toLowerCase().includes(q) || row.skill.description.toLowerCase().includes(q),
  );
}

/** Stable identity of the loaded data — React key so a changed server state reseeds the rows. */
export function seedKey(linked: readonly AgentSkill[], all: readonly Skill[]): string {
  return buildRows(linked, all)
    .map((r) => `${r.skill.id}:${r.enabled ? 1 : 0}:${r.skill.enabled ? 1 : 0}`)
    .join("|");
}
