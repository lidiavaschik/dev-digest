import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { CommunitySkill } from "@devdigest/shared";
import { apiErrorResponse, makeSkill, mockFetch, renderWithProviders } from "../../../../_testing/render";
import { CommunityBrowser } from "./CommunityBrowser";

const entry = (o: Partial<CommunitySkill>): CommunitySkill => ({
  id: o.name ?? "x",
  name: "x",
  repo: "org/repo",
  stars: 1200,
  lang: "TypeScript",
  desc: "A rule.",
  url: `https://github.com/org/repo/blob/main/${o.name ?? "x"}/SKILL.md`,
  ...o,
});

const CATALOG = [
  entry({ name: "api-contract", lang: "TypeScript", type: "convention" }),
  entry({ name: "py-typing", lang: "Python" }),
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CommunityBrowser", () => {
  it("marks entries already in the workspace as Installed and disables their import", async () => {
    mockFetch({ "GET /skills": () => [makeSkill({ name: "api-contract" })], "GET /skills/community": () => CATALOG });
    renderWithProviders(<CommunityBrowser onPreview={vi.fn()} />);
    const installed = await screen.findByRole("button", { name: "Installed" });
    expect(installed).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Import api-contract" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import py-typing" })).toBeEnabled();
  });

  it("filters by language, offering every language of the results", async () => {
    mockFetch({ "GET /skills": () => [], "GET /skills/community": () => CATALOG });
    renderWithProviders(<CommunityBrowser onPreview={vi.fn()} />);
    await screen.findByText("py-typing");
    const select = screen.getByLabelText("Language");
    expect([...(select as HTMLSelectElement).options].map((o) => o.text)).toEqual(["All languages", "Python", "TypeScript"]);
    fireEvent.change(select, { target: { value: "Python" } });
    expect(screen.getByText("py-typing")).toBeInTheDocument();
    expect(screen.queryByText("api-contract")).not.toBeInTheDocument();
  });

  it("shows 'No matching skills' for an empty result", async () => {
    mockFetch({ "GET /skills": () => [], "GET /skills/community": () => [] });
    renderWithProviders(<CommunityBrowser onPreview={vi.fn()} />);
    expect(await screen.findByText("No matching skills")).toBeInTheDocument();
  });

  it("shows an error with Retry that refetches the catalog", async () => {
    let fail = true;
    const fetchSpy = mockFetch({
      "GET /skills": () => [],
      "GET /skills/community": () => (fail ? apiErrorResponse(500, "internal", "boom") : CATALOG),
    });
    renderWithProviders(<CommunityBrowser onPreview={vi.fn()} />);
    expect(await screen.findByText("Could not load community skills.")).toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("py-typing")).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchSpy.mock.calls.filter(([u]) => new URL(String(u)).pathname === "/skills/community")).toHaveLength(2),
    );
  });

  it("hands the parsed preview and the entry to onPreview", async () => {
    const preview = { filename: "SKILL.md", name: "py-typing", description: "", type: "custom", body: "b", ignored_files: [], warnings: [] };
    mockFetch({
      "GET /skills": () => [],
      "GET /skills/community": () => CATALOG,
      "POST /skills/import/preview-url": () => preview,
    });
    const onPreview = vi.fn();
    renderWithProviders(<CommunityBrowser onPreview={onPreview} />);
    fireEvent.click(await screen.findByRole("button", { name: "Import py-typing" }));
    await waitFor(() => expect(onPreview).toHaveBeenCalledWith(preview, { kind: "community", entry: CATALOG[1] }));
  });
});
