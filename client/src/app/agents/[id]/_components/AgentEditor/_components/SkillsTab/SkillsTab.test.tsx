import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, AgentSkill, Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";
import { ToastProvider } from "../../../../../../../lib/toast";
import { SkillsTab } from "./SkillsTab";

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

const skill = (id: string, name: string, extra: Partial<Skill> = {}): Skill => ({
  id,
  name,
  description: `${name} description`,
  type: "rubric",
  source: "manual",
  body: "body",
  enabled: true,
  version: 1,
  ...extra,
});

const SK_A = skill("s-a", "untested-branches");
const SK_B = skill("s-b", "api-contract", { type: "convention" });
const SK_C = skill("s-c", "legacy-rule", { enabled: false });
const SK_FREE = skill("s-free", "sql-injection", { type: "security" });

const ATTACHED: AgentSkill[] = [
  { ...SK_B, order: 1, link_enabled: true },
  { ...SK_A, order: 0, link_enabled: true },
  { ...SK_C, order: 2, link_enabled: false },
];

let workspace: Skill[];
let fetchMock: ReturnType<typeof vi.fn>;

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  workspace = [SK_A, SK_B, SK_C, SK_FREE];
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET" && url.endsWith("/agents/ag1/skills")) return json(ATTACHED);
    if (method === "GET" && url.endsWith("/skills")) return json(workspace);
    if (method === "PUT" && url.endsWith("/agents/ag1/skills")) {
      const { items } = JSON.parse(String(init?.body)) as {
        items: { skill_id: string; enabled: boolean }[];
      };
      const all = [SK_A, SK_B, SK_C, SK_FREE];
      return json(
        items.map((it, order) => ({
          ...all.find((s) => s.id === it.skill_id)!,
          order,
          link_enabled: it.enabled,
        })),
      );
    }
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
        <ToastProvider>
          <SkillsTab agent={AGENT} />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const rowNames = () =>
  screen.getAllByTestId("agent-skill-row").map((r) => within(r).getByText(/./, { selector: "span.mono" }).textContent);

const box = (name: string) => screen.getByRole("checkbox", { name: `Enable ${name} for this agent` });

/** Items sent by the (last) PUT /agents/ag1/skills. */
function putItems() {
  const call = [...fetchMock.mock.calls]
    .reverse()
    .find(
      ([url, init]: unknown[]) =>
        (init as RequestInit | undefined)?.method === "PUT" && String(url).endsWith("/agents/ag1/skills"),
    );
  expect(call).toBeDefined();
  return (JSON.parse(String((call![1] as RequestInit).body)) as { items: unknown[] }).items;
}

const putCount = () =>
  fetchMock.mock.calls.filter(([, init]: unknown[]) => (init as RequestInit | undefined)?.method === "PUT").length;

/** Minimal DataTransfer for jsdom drag events. */
function dt() {
  const data: Record<string, string> = {};
  return {
    effectAllowed: "",
    dropEffect: "",
    setData: (k: string, v: string) => (data[k] = v),
    getData: (k: string) => data[k] ?? "",
  };
}

function drag(fromName: string, toName: string) {
  const rows = screen.getAllByTestId("agent-skill-row");
  const byName = (n: string) => rows.find((r) => within(r).queryByText(n))!;
  const dataTransfer = dt();
  fireEvent.dragStart(byName(fromName), { dataTransfer });
  fireEvent.dragOver(byName(toName), { dataTransfer });
  fireEvent.drop(byName(toName), { dataTransfer });
  fireEvent.dragEnd(byName(fromName), { dataTransfer });
}

describe("Agent SkillsTab", () => {
  it("lists every workspace skill: linked in prompt order, then the rest by name", async () => {
    renderTab();
    await screen.findByText("untested-branches");
    expect(rowNames()).toEqual(["untested-branches", "api-contract", "legacy-rule", "sql-injection"]);
    // checked = linked AND enabled for this agent; total = all workspace skills
    expect(screen.getByText("2 of 4 enabled")).toBeInTheDocument();
    expect(box("untested-branches")).toHaveAttribute("aria-checked", "true");
    expect(box("legacy-rule")).toHaveAttribute("aria-checked", "false");
    expect(box("sql-injection")).toHaveAttribute("aria-checked", "false");
    // type chips per row
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, i]: unknown[]) => (i as RequestInit | undefined)?.method === "PUT")).toBe(false);
  });

  it("checking a skill saves immediately with the full ordered list", async () => {
    renderTab();
    await screen.findByText("sql-injection");
    fireEvent.click(box("sql-injection"));
    expect(screen.getByText("3 of 4 enabled")).toBeInTheDocument();
    await waitFor(() =>
      expect(putItems()).toEqual([
        { skill_id: "s-a", enabled: true },
        { skill_id: "s-b", enabled: true },
        { skill_id: "s-c", enabled: false },
        { skill_id: "s-free", enabled: true },
      ]),
    );
  });

  it("clicking the name toggles too; unchecking keeps the slot", async () => {
    renderTab();
    await screen.findByText("untested-branches");
    fireEvent.click(screen.getByText("untested-branches"));
    await waitFor(() => expect(putItems()[0]).toEqual({ skill_id: "s-a", enabled: false }));
    expect(rowNames()[0]).toBe("untested-branches");
  });

  it("drag and drop reorders and saves the new order", async () => {
    renderTab();
    await screen.findByText("untested-branches");
    drag("sql-injection", "untested-branches");
    await waitFor(() =>
      expect(putItems()).toEqual([
        { skill_id: "s-free", enabled: false },
        { skill_id: "s-a", enabled: true },
        { skill_id: "s-b", enabled: true },
        { skill_id: "s-c", enabled: false },
      ]),
    );
    await waitFor(() =>
      expect(rowNames()).toEqual(["sql-injection", "untested-branches", "api-contract", "legacy-rule"]),
    );
  });

  it("dropping a row onto itself does not save", async () => {
    renderTab();
    await screen.findByText("untested-branches");
    drag("api-contract", "api-contract");
    expect(putCount()).toBe(0);
  });

  it("Alt+↓ on the handle moves a row (keyboard reorder)", async () => {
    renderTab();
    await screen.findByText("untested-branches");
    const handle = screen.getByRole("button", { name: /Reorder untested-branches/ });
    fireEvent.keyDown(handle, { key: "ArrowDown", altKey: true });
    await waitFor(() => expect((putItems()[0] as { skill_id: string }).skill_id).toBe("s-b"));
    fireEvent.keyDown(handle, { key: "ArrowDown" }); // no Alt → ignored
  });

  it("filter narrows the list and disables reordering", async () => {
    renderTab();
    await screen.findByText("untested-branches");
    fireEvent.change(screen.getByLabelText("Filter skills…"), { target: { value: "sql" } });
    expect(rowNames()).toEqual(["sql-injection"]);
    expect(screen.getByRole("button", { name: /Reorder sql-injection/ })).toBeDisabled();
    expect(screen.getByText("Clear the filter to reorder skills.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Filter skills…"), { target: { value: "zzz" } });
    expect(screen.getByText("No skills match this filter.")).toBeInTheDocument();
  });

  it("a globally disabled skill is dimmed with a badge", async () => {
    renderTab();
    await screen.findByText("legacy-rule");
    expect(screen.getByText("disabled globally")).toBeInTheDocument();
  });

  it("rolls back the optimistic change when the save fails", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "PUT") return new Response(JSON.stringify({ error: { message: "nope" } }), { status: 500 });
      if (url.endsWith("/agents/ag1/skills")) return json(ATTACHED);
      if (url.endsWith("/skills")) return json(workspace);
      return json({});
    });
    renderTab();
    await screen.findByText("sql-injection");
    fireEvent.click(box("sql-injection"));
    await waitFor(() => expect(box("sql-injection")).toHaveAttribute("aria-checked", "false"));
  });

  it("empty workspace links to the Skills page", async () => {
    workspace = [];
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/agents/ag1/skills")) return json([]);
      if (url.endsWith("/skills")) return json([]);
      return json({});
    });
    renderTab();
    expect(await screen.findByRole("link", { name: "Create one on the Skills page" })).toHaveAttribute("href", "/skills");
  });
});
