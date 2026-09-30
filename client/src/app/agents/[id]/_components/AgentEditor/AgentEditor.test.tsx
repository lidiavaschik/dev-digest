import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import { ToastProvider } from "../../../../../lib/toast";

// Mock the data hooks so the editor renders without a network/query client.
vi.mock("../../../../../lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
  useAgentSkills: () => ({ data: [], isLoading: false, isError: false }),
  useSetAgentSkills: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: [] }),
}));

import { AgentEditor } from "./AgentEditor";

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
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

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

const OTHER_AGENT: Agent = {
  ...AGENT,
  id: "ag2",
  name: "Performance Reviewer",
  description: "Flags N+1 queries",
};

describe("A2 Agent Editor (smoke)", () => {
  it("renders the Config tab fields", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save agent")).toBeInTheDocument();
    expect(screen.getByText("Skills")).toBeInTheDocument(); // tab label
  });

  it("renders the Skills tab when ?tab=skills", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="skills" onTab={() => {}} />);
    expect(screen.getByText("0 of 0 enabled")).toBeInTheDocument();
    expect(screen.queryByText("Configuration")).not.toBeInTheDocument();
  });

  // The form seeds its state from the agent prop, so switching agents must
  // remount it (key={agent.id}) — a re-render alone would keep the previous
  // agent's values in the inputs.
  it("reseeds the form when a different agent is selected", () => {
    const { rerender } = renderWithIntl(
      <AgentEditor agent={AGENT} tab="config" onTab={() => {}} />,
    );
    expect(screen.getByDisplayValue("Security Reviewer")).toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
        <ToastProvider>
          <AgentEditor agent={OTHER_AGENT} tab="config" onTab={() => {}} />
        </ToastProvider>
      </NextIntlClientProvider>,
    );

    expect(screen.getByDisplayValue("Performance Reviewer")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Security Reviewer")).not.toBeInTheDocument();
  });
});
