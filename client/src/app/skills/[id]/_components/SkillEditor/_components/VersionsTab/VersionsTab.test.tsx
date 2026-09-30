import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import type { SkillVersion } from "@devdigest/shared";
import { makeSkill, mockFetch, renderWithProviders } from "../../../../../_testing/render";
import { VersionsTab } from "./VersionsTab";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const SKILL = makeSkill({ version: 2, body: "# Rule\nEvery new branch needs a test." });
const VERSIONS: SkillVersion[] = [
  {
    skill_id: "sk1",
    version: 1,
    name: "old-name",
    description: SKILL.description,
    type: "rubric",
    body: "# Rule\nBranches need tests.",
    message: null,
    created_at: "2026-09-01T09:00:00.000Z",
  },
  {
    skill_id: "sk1",
    version: 2,
    name: SKILL.name,
    description: SKILL.description,
    type: "rubric",
    body: SKILL.body,
    message: "Tightened wording",
    created_at: "2026-09-20T09:00:00.000Z",
  },
];

describe("VersionsTab", () => {
  it("lists versions newest first with a Current badge on the live version", async () => {
    mockFetch({ "GET /skills/sk1/versions": () => VERSIONS });
    renderWithProviders(<VersionsTab skill={SKILL} />);
    const current = await screen.findByTestId("version-2");
    expect(within(current).getByText("Current")).toBeInTheDocument();
    expect(within(current).getByText("Tightened wording")).toBeInTheDocument();
    const old = screen.getByTestId("version-1");
    expect(within(old).getByText("Edited")).toBeInTheDocument();
    expect(within(old).getByText("2026-09-01")).toBeInTheDocument();
    expect(screen.getByText("2 versions")).toBeInTheDocument();
  });

  it("Diff opens a modal with removed/added lines and the name change", async () => {
    mockFetch({ "GET /skills/sk1/versions": () => VERSIONS });
    renderWithProviders(<VersionsTab skill={SKILL} />);
    fireEvent.click(within(await screen.findByTestId("version-1")).getByRole("button", { name: "Diff" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Branches need tests.").closest("[data-kind]")).toHaveAttribute("data-kind", "del");
    expect(within(dialog).getByText("Every new branch needs a test.").closest("[data-kind]")).toHaveAttribute(
      "data-kind",
      "add",
    );
    expect(within(dialog).getByText(/old-name/)).toBeInTheDocument();
  });

  it("Restore confirms and POSTs the restore endpoint", async () => {
    const fetchSpy = mockFetch({
      "GET /skills/sk1/versions": () => VERSIONS,
      "POST /skills/sk1/versions/1/restore": () => makeSkill({ version: 3 }),
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithProviders(<VersionsTab skill={SKILL} />);
    fireEvent.click(within(await screen.findByTestId("version-1")).getByRole("button", { name: "Restore" }));
    await waitFor(() =>
      expect(
        fetchSpy.mock.calls.some(
          ([u, init]) => init?.method === "POST" && String(u).endsWith("/skills/sk1/versions/1/restore"),
        ),
      ).toBe(true),
    );
    expect(await screen.findByText("Restored v1 as v3")).toBeInTheDocument();
  });
});
