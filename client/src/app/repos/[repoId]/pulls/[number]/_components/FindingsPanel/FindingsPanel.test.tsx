import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(cleanup);

function finding(o: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

const FINDINGS: FindingRecord[] = [finding()];

/** Two critical, one warning, no suggestion — an uneven, realistic run. */
const MIXED: FindingRecord[] = [
  finding({ id: "c1", severity: "CRITICAL", title: "Hardcoded secret" }),
  finding({ id: "c2", severity: "CRITICAL", title: "Command injection" }),
  finding({ id: "w1", severity: "WARNING", title: "N+1 query", category: "perf" }),
];

/** The filter chip carrying a given severity label. */
const chip = (label: string) => screen.getByRole("button", { name: new RegExp(`^${label}`) });
const cardTitles = () => MIXED.map((f) => f.title).filter((x) => screen.queryByText(x));

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

describe("FindingsPanel — severity tally for this run", () => {
  it("shows a pill per severity with the count of cards listed below", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    // The pill number must equal the number of finding cards of that severity.
    expect(screen.getByText("2 Critical")).toBeInTheDocument();
    expect(screen.getByText("1 Warning")).toBeInTheDocument();
    expect(cardTitles()).toHaveLength(3);
  });

  it("omits severities this run did not produce", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(screen.queryByText(/\d+ Suggestion/)).not.toBeInTheDocument();
  });

  it("recounts when low-confidence findings are hidden, so pills keep matching", () => {
    const withWeak = [...MIXED, finding({ id: "c3", severity: "CRITICAL", title: "Weak hunch", confidence: 0.2 })];
    renderWithIntl(<FindingsPanel findings={withWeak} prId="pr1" />);
    expect(screen.getByText("3 Critical")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByText("2 Critical")).toBeInTheDocument();
    expect(screen.queryByText("Weak hunch")).not.toBeInTheDocument();
  });
});

describe("FindingsPanel — severity filter", () => {
  it("offers all three filters", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(chip("Critical")).toBeInTheDocument();
    expect(chip("Warning")).toBeInTheDocument();
    expect(chip("Suggestion")).toBeInTheDocument();
  });

  it("keeps only the picked severity's cards and hides the rest", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(chip("Warning"));

    expect(screen.getByText("N+1 query")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    expect(screen.queryByText("Command injection")).not.toBeInTheDocument();
    expect(cardTitles()).toHaveLength(1);
  });

  it("clears the filter when the active one is clicked again", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(chip("Critical"));
    expect(cardTitles()).toHaveLength(2);

    fireEvent.click(chip("Critical"));
    expect(cardTitles()).toHaveLength(3);
  });

  it("switches straight from one severity to another", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(chip("Critical"));
    fireEvent.click(chip("Warning"));
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
    expect(cardTitles()).toHaveLength(1);
  });

  it("keeps the pills at this run's totals while a filter narrows the list", () => {
    // The pill answers "how many cards you get if you pick this", so it must
    // not collapse to the filtered view.
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(chip("Warning"));
    expect(screen.getByText("2 Critical")).toBeInTheDocument();
    expect(screen.getByText("1 Warning")).toBeInTheDocument();
  });

  it("shows the empty state for a severity this run has none of", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(chip("Suggestion"));
    expect(screen.getByText("No findings match")).toBeInTheDocument();
    expect(cardTitles()).toHaveLength(0);
  });
});
