import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { CommunitySkill, SkillImportPreview } from "@devdigest/shared";
import { apiErrorResponse, callBodies, makeSkill, mockFetch, renderWithProviders } from "../../_testing/render";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

import { ImportSkillDrawer } from "./ImportSkillDrawer";

const PREVIEW: SkillImportPreview = {
  filename: "branches.zip",
  name: "untested-branches",
  description: "Flag untested branches.",
  type: "rubric",
  body: "# Untested branches\nEvery branch needs a test.",
  ignored_files: ["scripts/run.sh"],
  warnings: ["Archive contained executable files; they were ignored."],
};

beforeEach(() => push.mockClear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function upload() {
  const file = new File(["# hi"], "branches.zip", { type: "application/zip" });
  fireEvent.change(screen.getByLabelText("Choose file…"), { target: { files: [file] } });
}

describe("ImportSkillDrawer", () => {
  it("upload → preview shows trust banner, ignored files and warnings", async () => {
    const fetchSpy = mockFetch({ "POST /skills/import/preview": () => PREVIEW });
    renderWithProviders(<ImportSkillDrawer onClose={vi.fn()} />);
    upload();
    expect(await screen.findByText("scripts/run.sh")).toBeInTheDocument();
    expect(screen.getByText(/third-party instructions inside your agent's prompt/)).toBeInTheDocument();
    expect(screen.getByText(/executable files/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Untested branches" })).toBeInTheDocument();
    const [body] = callBodies(fetchSpy, "POST", "/skills/import/preview") as { filename: string; content_base64: string }[];
    expect(body?.filename).toBe("branches.zip");
    expect(atob(body?.content_base64 ?? "")).toBe("# hi");
  });

  it("save is disabled until acknowledged, then posts a disabled imported_file skill", async () => {
    const fetchSpy = mockFetch({
      "POST /skills/import/preview": () => PREVIEW,
      "POST /skills": () => makeSkill({ id: "imp1", source: "imported_file", enabled: false }),
    });
    const onClose = vi.fn();
    renderWithProviders(<ImportSkillDrawer onClose={onClose} />);
    upload();
    await screen.findByText("scripts/run.sh");
    const save = screen.getByRole("button", { name: "Save (disabled)" });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/skills/imp1?tab=config"));
    expect(onClose).toHaveBeenCalled();
    expect(callBodies(fetchSpy, "POST", "/skills")[0]).toEqual({
      name: "untested-branches",
      description: "Flag untested branches.",
      type: "rubric",
      body: PREVIEW.body,
      source: "imported_file",
      enabled: false,
      message: "Imported from branches.zip",
    });
  });

  it("shows the server's 422 parse message inline", async () => {
    mockFetch({ "POST /skills/import/preview": () => apiErrorResponse(422, "invalid_skill", "No SKILL.md in archive") });
    renderWithProviders(<ImportSkillDrawer onClose={vi.fn()} />);
    upload();
    expect(await screen.findByText("No SKILL.md in archive")).toBeInTheDocument();
  });

  it("shows a 409 name conflict inline", async () => {
    mockFetch({
      "POST /skills/import/preview": () => PREVIEW,
      "POST /skills": () => apiErrorResponse(409, "conflict", "dup"),
    });
    renderWithProviders(<ImportSkillDrawer onClose={vi.fn()} />);
    upload();
    await screen.findByText("scripts/run.sh");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Save (disabled)" }));
    expect(await screen.findByText("A skill with this name already exists")).toBeInTheDocument();
  });

  it("opens on the requested tab and switches modes via the drawer tabs", async () => {
    mockFetch({ "GET /skills": () => [], "GET /skills/community": () => [] });
    renderWithProviders(<ImportSkillDrawer mode="url" onClose={vi.fn()} />);
    expect(screen.getByLabelText("Skill URL")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Community" }));
    expect(await screen.findByText(/Curated catalog/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "From file" }));
    expect(screen.getByLabelText("Choose file…")).toBeInTheDocument();
  });
});

const RAW_URL = "https://raw.githubusercontent.com/org/repo/main/skills/x/SKILL.md";
const URL_PREVIEW: SkillImportPreview = {
  ...PREVIEW,
  filename: "SKILL.md",
  ignored_files: [],
  warnings: [],
  source_url: RAW_URL,
};

describe("ImportSkillDrawer — From URL", () => {
  const typed = "https://github.com/org/repo/blob/main/skills/x/SKILL.md";

  function fetchPreview() {
    fireEvent.change(screen.getByLabelText("Skill URL"), { target: { value: `  ${typed} ` } });
    fireEvent.click(screen.getByRole("button", { name: "Fetch preview" }));
  }

  it("posts {url}, shows source_url as an external link, then saves a disabled imported_url skill", async () => {
    const fetchSpy = mockFetch({
      "POST /skills/import/preview-url": () => URL_PREVIEW,
      "POST /skills": () => makeSkill({ id: "u1", source: "imported_url", enabled: false }),
    });
    renderWithProviders(<ImportSkillDrawer mode="url" onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Fetch preview" })).toBeDisabled();
    fetchPreview();
    const link = await screen.findByRole("link", { name: RAW_URL });
    expect(link).toHaveAttribute("href", RAW_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(callBodies(fetchSpy, "POST", "/skills/import/preview-url")).toEqual([{ url: typed }]);
    expect(screen.getByText(/third-party instructions inside your agent's prompt/)).toBeInTheDocument();

    const save = screen.getByRole("button", { name: "Save (disabled)" });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(save);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/skills/u1?tab=config"));
    expect(callBodies(fetchSpy, "POST", "/skills")[0]).toMatchObject({
      name: "untested-branches",
      source: "imported_url",
      enabled: false,
      message: `Imported from ${RAW_URL}`,
    });
  });

  it("shows the server's 422 fetch error inline and keeps the URL form", async () => {
    mockFetch({
      "POST /skills/import/preview-url": () => apiErrorResponse(422, "fetch_failed", "Refusing to fetch a private address"),
    });
    renderWithProviders(<ImportSkillDrawer mode="url" onClose={vi.fn()} />);
    fetchPreview();
    expect(await screen.findByText("Refusing to fetch a private address")).toBeInTheDocument();
    expect(screen.getByLabelText("Skill URL")).toBeInTheDocument();
  });
});

const ENTRY: CommunitySkill = {
  id: "obra/superpowers:systematic-debugging",
  name: "systematic-debugging",
  repo: "obra/superpowers",
  stars: 293_000,
  lang: "Markdown",
  desc: "Four-phase debugging: root cause before fixes.",
  url: "https://github.com/obra/superpowers/blob/main/skills/systematic-debugging/SKILL.md",
  type: "rubric",
};

describe("ImportSkillDrawer — Community", () => {
  it("lists entries, searches with a debounced q, imports via preview-url and saves a disabled community skill", async () => {
    const fetchSpy = mockFetch({
      "GET /skills": () => [],
      "GET /skills/community": () => [ENTRY],
      "POST /skills/import/preview-url": () => ({ ...URL_PREVIEW, name: ENTRY.name, source_url: ENTRY.url }),
      "POST /skills": () => makeSkill({ id: "c1", source: "community", enabled: false }),
    });
    renderWithProviders(<ImportSkillDrawer mode="community" onClose={vi.fn()} />);
    expect(await screen.findByText("systematic-debugging")).toBeInTheDocument();
    expect(screen.getByText("293k")).toBeInTheDocument();
    expect(screen.getByText("obra/superpowers")).toBeInTheDocument();

    const communityUrls = () =>
      fetchSpy.mock.calls.map(([input]) => new URL(String(input))).filter((u) => u.pathname === "/skills/community");
    fireEvent.change(screen.getByLabelText(/Search community skills/), { target: { value: "debug" } });
    expect(communityUrls().some((u) => u.searchParams.get("q") === "debug")).toBe(false);
    await waitFor(() => expect(communityUrls().some((u) => u.searchParams.get("q") === "debug")).toBe(true));

    fireEvent.click(await screen.findByRole("button", { name: "Import systematic-debugging" }));
    await screen.findByRole("link", { name: ENTRY.url });
    expect(callBodies(fetchSpy, "POST", "/skills/import/preview-url")).toEqual([{ url: ENTRY.url }]);

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Save (disabled)" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/skills/c1?tab=config"));
    expect(callBodies(fetchSpy, "POST", "/skills")[0]).toMatchObject({
      name: "systematic-debugging",
      source: "community",
      enabled: false,
      message: "Imported from community: obra/superpowers/systematic-debugging",
    });
  });

  it("shows a 422 from the entry's URL fetch inline above the list", async () => {
    mockFetch({
      "GET /skills": () => [],
      "GET /skills/community": () => [ENTRY],
      "POST /skills/import/preview-url": () => apiErrorResponse(422, "invalid_skill", "Upstream returned 404"),
    });
    renderWithProviders(<ImportSkillDrawer mode="community" onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Import systematic-debugging" }));
    expect(await screen.findByText("Upstream returned 404")).toBeInTheDocument();
    expect(screen.getByText("systematic-debugging")).toBeInTheDocument();
  });
});
