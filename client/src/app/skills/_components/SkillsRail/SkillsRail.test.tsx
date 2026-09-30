import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { callBodies, makeSkill, mockFetch, renderWithProviders } from "../../_testing/render";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

import { SkillsRail } from "./SkillsRail";

const SKILLS = [
  makeSkill(),
  makeSkill({ id: "sk2", name: "api-contract", description: "Flag breaking route signature changes.", type: "convention" }),
];

beforeEach(() => push.mockClear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SkillsRail", () => {
  it("lists skills and filters by search (name + description)", async () => {
    mockFetch({ "GET /skills": () => SKILLS });
    renderWithProviders(<SkillsRail tab="config" onCreate={vi.fn()} onImport={vi.fn()} />);
    expect(await screen.findByText("api-contract")).toBeInTheDocument();
    expect(screen.getByText("untested-branches")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search skills…"), { target: { value: "BREAKING" } });
    expect(screen.getByText("api-contract")).toBeInTheDocument();
    expect(screen.queryByText("untested-branches")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search skills…"), { target: { value: "zzz" } });
    expect(screen.getByText(/No skills match/)).toBeInTheDocument();
  });

  it("card click navigates keeping the current tab", async () => {
    mockFetch({ "GET /skills": () => SKILLS });
    renderWithProviders(<SkillsRail tab="versions" onCreate={vi.fn()} onImport={vi.fn()} />);
    fireEvent.click(await screen.findByText("api-contract"));
    expect(push).toHaveBeenCalledWith("/skills/sk2?tab=versions");
  });

  it("toggle PUTs {enabled} and does not navigate", async () => {
    const fetchSpy = mockFetch({
      "GET /skills": () => SKILLS,
      "PUT /skills/sk1": () => makeSkill({ enabled: false }),
    });
    renderWithProviders(<SkillsRail tab="config" onCreate={vi.fn()} onImport={vi.fn()} />);
    await screen.findByText("untested-branches");
    fireEvent.click(screen.getAllByRole("switch")[0]!);
    await waitFor(() => expect(callBodies(fetchSpy, "PUT", "/skills/sk1")).toEqual([{ enabled: false }]));
    expect(push).not.toHaveBeenCalled();
  });

  it("Add Skill menu lists the three import modes, a divider, then Create — in that order", async () => {
    mockFetch({ "GET /skills": () => [] });
    renderWithProviders(<SkillsRail onCreate={vi.fn()} onImport={vi.fn()} />);
    fireEvent.click(screen.getByText("Add Skill"));
    const labels = ["Import from file", "Import from URL", "Search community skills…", "Create from scratch"];
    const items = labels.map((name) => screen.getByRole("button", { name }));
    const separator = screen.getByRole("separator");
    const follows = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(items[0]!, items[1]!)).toBe(true);
    expect(follows(items[1]!, items[2]!)).toBe(true);
    expect(follows(items[2]!, separator)).toBe(true);
    expect(follows(separator, items[3]!)).toBe(true);
  });

  it.each([
    ["Import from file", "file"],
    ["Import from URL", "url"],
    ["Search community skills…", "community"],
  ])("%s opens the import drawer in %s mode", async (label, mode) => {
    mockFetch({ "GET /skills": () => [] });
    const onCreate = vi.fn();
    const onImport = vi.fn();
    renderWithProviders(<SkillsRail onCreate={onCreate} onImport={onImport} />);
    fireEvent.click(screen.getByText("Add Skill"));
    fireEvent.click(screen.getByText(label));
    expect(onImport).toHaveBeenCalledWith(mode);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("Create from scratch opens the create modal", async () => {
    mockFetch({ "GET /skills": () => [] });
    const onCreate = vi.fn();
    const onImport = vi.fn();
    renderWithProviders(<SkillsRail onCreate={onCreate} onImport={onImport} />);
    fireEvent.click(screen.getByText("Add Skill"));
    fireEvent.click(screen.getByText("Create from scratch"));
    expect(onCreate).toHaveBeenCalled();
    expect(onImport).not.toHaveBeenCalled();
  });
});
