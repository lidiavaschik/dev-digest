import { describe, it, expect } from "vitest";
import type { CommunitySkill } from "@devdigest/shared";
import { importSource, initialImportType, isHttpUrl, previewSourceUrl } from "./helpers";

const entry = { id: "e", name: "n", repo: "o/r", stars: 1, lang: "", desc: "", url: "https://e/SKILL.md", type: "security" } satisfies CommunitySkill;

describe("ImportSkillDrawer helpers", () => {
  it("maps each origin to its saved source", () => {
    expect(importSource({ kind: "file" })).toBe("imported_file");
    expect(importSource({ kind: "url", url: "https://x" })).toBe("imported_url");
    expect(importSource({ kind: "community", entry })).toBe("community");
  });

  it("uses the catalog's suggested type only when the parser fell back to custom", () => {
    expect(initialImportType({ type: "custom" }, { kind: "community", entry })).toBe("security");
    expect(initialImportType({ type: "rubric" }, { kind: "community", entry })).toBe("rubric");
    expect(initialImportType({ type: "custom" }, { kind: "file" })).toBe("custom");
  });

  it("prefers the server's source_url, falls back to the origin URL, null for uploads", () => {
    expect(previewSourceUrl({ source_url: "https://raw/x" }, { kind: "url", url: "https://typed" })).toBe("https://raw/x");
    expect(previewSourceUrl({ source_url: null }, { kind: "url", url: "https://typed" })).toBe("https://typed");
    expect(previewSourceUrl({}, { kind: "community", entry })).toBe(entry.url);
    expect(previewSourceUrl({ source_url: undefined }, { kind: "file" })).toBeNull();
  });

  it("only treats http(s) as linkable", () => {
    expect(isHttpUrl("https://x")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
  });
});
