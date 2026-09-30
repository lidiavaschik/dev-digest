import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { callBodies, makeSkill, mockFetch, renderWithProviders } from "../../../../../_testing/render";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

import { ConfigTab } from "./ConfigTab";

beforeEach(() => push.mockClear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ConfigTab", () => {
  it("clean form: no unsaved badge, no message field, save disabled, server token count", () => {
    mockFetch({});
    renderWithProviders(<ConfigTab skill={makeSkill()} />);
    expect(screen.getByText("untested-branches.md")).toBeInTheDocument();
    expect(screen.getByText("12 tokens")).toBeInTheDocument();
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("What changed? (optional)")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save skill" })).toBeDisabled();
    expect(screen.getByText(/Write it as a directive/)).toBeInTheDocument();
  });

  it("editing the body marks it unsaved and saves only changed fields + message", async () => {
    const fetchSpy = mockFetch({ "PUT /skills/sk1": () => makeSkill({ version: 4, body: "new body" }) });
    renderWithProviders(<ConfigTab skill={makeSkill()} />);
    fireEvent.change(screen.getByLabelText("Skill body"), { target: { value: "new body" } });
    expect(screen.getByText("unsaved")).toBeInTheDocument();
    expect(screen.getByText("2 tokens")).toBeInTheDocument(); // ceil(8/4)
    fireEvent.change(screen.getByLabelText("What changed? (optional)"), { target: { value: "shorter" } });
    fireEvent.click(screen.getByRole("button", { name: "Save skill" }));
    await waitFor(() =>
      expect(callBodies(fetchSpy, "PUT", "/skills/sk1")).toEqual([{ body: "new body", message: "shorter" }]),
    );
    expect(await screen.findByText("Skill saved (v4)")).toBeInTheDocument();
  });

  it("the Enabled toggle saves immediately with only {enabled}", async () => {
    const fetchSpy = mockFetch({ "PUT /skills/sk1": () => makeSkill({ enabled: false }) });
    renderWithProviders(<ConfigTab skill={makeSkill()} />);
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(callBodies(fetchSpy, "PUT", "/skills/sk1")).toEqual([{ enabled: false }]));
  });

  it("delete confirms, DELETEs and returns to /skills", async () => {
    const fetchSpy = mockFetch({ "DELETE /skills/sk1": () => new Response(null, { status: 204 }) });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithProviders(<ConfigTab skill={makeSkill()} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete skill" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/skills"));
    expect(fetchSpy.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(true);
  });
});
