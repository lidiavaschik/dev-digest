import { describe, it, expect } from "vitest";
import type { AgentSkill, Skill } from "@devdigest/shared";
import { buildRows, countEnabled, filterRows, moveItem, seedKey, toItems } from "./helpers";

const skill = (id: string, name: string, extra: Partial<Skill> = {}): Skill => ({
  id,
  name,
  description: `${name} rule`,
  type: "rubric",
  source: "manual",
  body: "b",
  enabled: true,
  version: 1,
  ...extra,
});
const A = skill("a", "zeta");
const B = skill("b", "alpha");
const C = skill("c", "mid");
const D = skill("d", "beta");
const link = (s: Skill, order: number, on = true): AgentSkill => ({ ...s, order, link_enabled: on });

describe("SkillsTab helpers", () => {
  it("moveItem moves forward/backward and ignores out-of-range", () => {
    expect(moveItem([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(moveItem([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
    expect(moveItem([1, 2, 3], 0, 5)).toEqual([1, 2, 3]);
  });

  it("buildRows: linked by order first, then unlinked by name (unchecked)", () => {
    const rows = buildRows([link(C, 1, false), link(A, 0)], [A, B, C, D]);
    expect(rows.map((r) => [r.skill.name, r.enabled])).toEqual([
      ["zeta", true],
      ["mid", false],
      ["alpha", false],
      ["beta", false],
    ]);
  });

  it("buildRows keeps a linked skill missing from the workspace list", () => {
    expect(buildRows([link(A, 0)], []).map((r) => r.skill.id)).toEqual(["a"]);
  });

  it("toItems sends every row in order; countEnabled counts checked", () => {
    const rows = buildRows([link(A, 0)], [A, B]);
    expect(toItems(rows)).toEqual([
      { skill_id: "a", enabled: true },
      { skill_id: "b", enabled: false },
    ]);
    expect(countEnabled(rows)).toBe(1);
  });

  it("filterRows matches name/description and keeps real indexes", () => {
    const rows = buildRows([], [A, B, C]);
    expect(filterRows(rows, "  MID ").map((x) => [x.row.skill.id, x.index])).toEqual([["c", 1]]);
    expect(filterRows(rows, "").length).toBe(3);
  });

  it("seedKey changes when order, per-agent or global enabled changes", () => {
    const base = seedKey([link(A, 0), link(B, 1)], [A, B]);
    expect(seedKey([link(A, 1), link(B, 0)], [A, B])).not.toBe(base);
    expect(seedKey([link(A, 0, false), link(B, 1)], [A, B])).not.toBe(base);
    expect(seedKey([link(A, 0), link(B, 1)], [{ ...A, enabled: false }, B])).not.toBe(base);
  });
});
