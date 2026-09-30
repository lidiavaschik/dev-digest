import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { makeSkill, mockFetch, renderWithProviders } from "../../../../../_testing/render";
import { StatsTab } from "./StatsTab";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("StatsTab", () => {
  it("lists agents using the skill and shows placeholder metrics", async () => {
    mockFetch({
      "GET /skills/sk1/usage": () => ({
        skill_id: "sk1",
        agents: [
          { id: "a1", name: "Test Quality", link_enabled: true, order: 0 },
          { id: "a2", name: "API Contract", link_enabled: false, order: 1 },
        ],
      }),
    });
    renderWithProviders(<StatsTab skill={makeSkill()} />);
    expect(await screen.findByText("Test Quality")).toBeInTheDocument();
    expect(screen.getByText("2 agents")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(screen.getAllByText("off for this agent")).toHaveLength(1);
    const links = screen.getAllByRole("link", { name: /Open/ });
    expect(links[1]).toHaveAttribute("href", "/agents/a2?tab=skills");
  });

  it("shows an empty state when no agent uses it", async () => {
    mockFetch({ "GET /skills/sk1/usage": () => ({ skill_id: "sk1", agents: [] }) });
    renderWithProviders(<StatsTab skill={makeSkill()} />);
    expect(await screen.findByText(/No agent uses this skill yet/)).toBeInTheDocument();
  });
});
