import { describe, it, expect } from "vitest";
import type { CommunitySkill } from "@devdigest/shared";
import { filterByLang, formatStars, installedNames, languageOptions } from "./helpers";

const entry = (o: Partial<CommunitySkill>): CommunitySkill => ({
  id: "x",
  name: "x",
  repo: "o/r",
  stars: 1,
  lang: "TypeScript",
  desc: "",
  url: "https://example.com/SKILL.md",
  ...o,
});

describe("CommunityBrowser helpers", () => {
  it("formatStars compacts thousands and millions", () => {
    expect(formatStars(950)).toBe("950");
    expect(formatStars(1500)).toBe("1.5k");
    expect(formatStars(293_000)).toBe("293k");
    expect(formatStars(1_200_000)).toBe("1.2M");
  });

  it("languageOptions is distinct, sorted and keeps the selected language", () => {
    const list = [entry({ lang: "Python" }), entry({ lang: "Go" }), entry({ lang: "Python" })];
    expect(languageOptions(list, "")).toEqual(["Go", "Python"]);
    expect(languageOptions(list, "Rust")).toEqual(["Go", "Python", "Rust"]);
  });

  it("filterByLang keeps everything for the 'all' value", () => {
    const list = [entry({ id: "a", lang: "Go" }), entry({ id: "b", lang: "Python" })];
    expect(filterByLang(list, "")).toHaveLength(2);
    expect(filterByLang(list, "Go").map((e) => e.id)).toEqual(["a"]);
  });

  it("installedNames matches case-insensitively", () => {
    expect(installedNames([{ name: "Systematic-Debugging" }]).has("systematic-debugging")).toBe(true);
    expect(installedNames(undefined).size).toBe(0);
  });
});
