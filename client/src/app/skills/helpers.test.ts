import { describe, it, expect } from "vitest";
import { estimateTokens, needsVetting, renderSkillPrompt, toSkillTab } from "./helpers";

describe("skills helpers", () => {
  it("needsVetting only for disabled third-party skills", () => {
    expect(needsVetting({ source: "imported_file", enabled: false })).toBe(true);
    expect(needsVetting({ source: "community", enabled: false })).toBe(true);
    expect(needsVetting({ source: "imported_url", enabled: true })).toBe(false);
    expect(needsVetting({ source: "manual", enabled: false })).toBe(false);
  });

  it("estimateTokens rounds chars/4 up", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcde")).toBe(2);
  });

  it("toSkillTab falls back to config", () => {
    expect(toSkillTab("versions")).toBe("versions");
    expect(toSkillTab("bogus")).toBe("config");
    expect(toSkillTab(null)).toBe("config");
  });

  it("renderSkillPrompt uses a ### heading", () => {
    expect(renderSkillPrompt({ name: "x", body: "rule" })).toBe("### x\nrule");
  });
});
