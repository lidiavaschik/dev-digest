import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { apiErrorResponse, callBodies, makeSkill, mockFetch, renderWithProviders } from "../../_testing/render";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

import { CreateSkillModal } from "./CreateSkillModal";

beforeEach(() => push.mockClear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function fill() {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "new-skill" } });
  fireEvent.change(screen.getByPlaceholderText(/# Rule/), { target: { value: "Do the thing." } });
}

describe("CreateSkillModal", () => {
  it("is disabled until name and body are filled, then POSTs a manual skill and navigates", async () => {
    const fetchSpy = mockFetch({ "POST /skills": () => makeSkill({ id: "new1", name: "new-skill" }) });
    const onClose = vi.fn();
    renderWithProviders(<CreateSkillModal onClose={onClose} />);
    const submit = screen.getByRole("button", { name: "Create skill" });
    expect(submit).toBeDisabled();
    fill();
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/skills/new1?tab=config"));
    expect(onClose).toHaveBeenCalled();
    expect(callBodies(fetchSpy, "POST", "/skills")[0]).toMatchObject({
      name: "new-skill",
      body: "Do the thing.",
      type: "custom",
      source: "manual",
    });
  });

  it("shows a 409 name conflict inline and stays open", async () => {
    mockFetch({ "POST /skills": () => apiErrorResponse(409, "conflict", "duplicate") });
    const onClose = vi.fn();
    renderWithProviders(<CreateSkillModal onClose={onClose} />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    expect(await screen.findByText("A skill with this name already exists")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
