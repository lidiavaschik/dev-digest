import { describe, it, expect } from "vitest";
import { diffLines, isoDate, metaChanges } from "./helpers";

describe("diffLines", () => {
  it("marks unchanged, removed and added lines", () => {
    expect(diffLines("a\nb\nc", "a\nx\nc")).toEqual([
      { kind: "same", text: "a" },
      { kind: "del", text: "b" },
      { kind: "add", text: "x" },
      { kind: "same", text: "c" },
    ]);
  });

  it("handles pure additions and deletions at the ends", () => {
    expect(diffLines("a", "a\nb")).toEqual([
      { kind: "same", text: "a" },
      { kind: "add", text: "b" },
    ]);
    expect(diffLines("a\nb", "b")).toEqual([
      { kind: "del", text: "a" },
      { kind: "same", text: "b" },
    ]);
  });

  it("identical bodies produce only unchanged lines", () => {
    expect(diffLines("x\ny", "x\ny").every((l) => l.kind === "same")).toBe(true);
  });
});

describe("metaChanges / isoDate", () => {
  it("lists only the fields that differ", () => {
    expect(
      metaChanges({ name: "a", description: "d", type: "rubric" }, { name: "b", description: "d", type: "rubric" }),
    ).toEqual([{ field: "name", from: "a", to: "b" }]);
  });

  it("formats the date part", () => {
    expect(isoDate("2026-09-29T10:00:00.000Z")).toBe("2026-09-29");
  });
});
