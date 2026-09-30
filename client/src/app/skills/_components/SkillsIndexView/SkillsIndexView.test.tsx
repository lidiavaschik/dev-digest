import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { makeSkill, mockFetch, renderWithProviders } from "../../_testing/render";

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
// The real AppShell needs repo/theme providers; this view only cares about its children.
vi.mock("../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { SkillsIndexView } from "./SkillsIndexView";

beforeEach(() => {
  nav.push.mockClear();
  nav.replace.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SkillsIndexView", () => {
  it("redirects to the first skill when skills exist", async () => {
    mockFetch({ "GET /skills": () => [makeSkill({ id: "first" }), makeSkill({ id: "second", name: "b" })] });
    renderWithProviders(<SkillsIndexView />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/skills/first?tab=config"));
  });

  it("shows the empty state with Create + every import entry point when there are none", async () => {
    mockFetch({ "GET /skills": () => [] });
    renderWithProviders(<SkillsIndexView />);
    expect(await screen.findByText("No skills yet")).toBeInTheDocument();
    // The rail's Add Skill menu is closed, so these are the empty-state CTAs.
    for (const name of ["Create from scratch", "Import from file", "Import from URL", "Browse community"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("each empty-state import CTA opens the drawer on its own tab", async () => {
    mockFetch({ "GET /skills": () => [], "GET /skills/community": () => [] });
    renderWithProviders(<SkillsIndexView />);
    fireEvent.click(await screen.findByRole("button", { name: "Import from URL" }));
    expect(screen.getByLabelText("Skill URL")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Browse community" }));
    expect(await screen.findByText("No matching skills")).toBeInTheDocument();
  });
});
