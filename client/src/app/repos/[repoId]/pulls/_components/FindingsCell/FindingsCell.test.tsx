/**
 * FindingsCell — the PR list's FINDINGS column. The counters summarise; the
 * hover card lists the outstanding findings of each agent's latest run, summed
 * — re-running one agent replaces its own previous run, a second agent adds to
 * the total. Dismissed findings and off-contract severities are excluded on
 * both sides, so the card header and the counters always agree.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";
import { HOVER_OPEN_MS } from "../../constants";

const reviewsResult = vi.hoisted(() => ({
  current: { data: undefined as ReviewRecord[] | undefined, isLoading: false, isError: false },
}));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: (prId: string | null) =>
    prId ? reviewsResult.current : { data: undefined, isLoading: false, isError: false },
}));

import { FindingsCell } from "./FindingsCell";

function finding(o: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded Stripe secret key",
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
    rationale: "Line 12 contains a literal string starting with sk_live_.",
    suggestion: null,
    confidence: 0.98,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

function review(findings: FindingRecord[], o: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: "r1",
    pr_id: "pr-1",
    agent_id: "a1",
    run_id: "run-1",
    agent_name: "security-reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: "…",
    score: 61,
    model: "openrouter/some-model",
    grounding: null,
    created_at: "2026-06-01T12:00:00.000Z",
    findings,
    ...o,
  } as ReviewRecord;
}

function renderCell(props: Partial<React.ComponentProps<typeof FindingsCell>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <FindingsCell
        counts={{ critical: 1, warning: 1, suggestion: 0 }}
        prId="pr-1"
        prNumber={482}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

/** Hover the cell and let the open delay elapse. */
function hoverCell() {
  fireEvent.mouseEnter(screen.getByRole("group", { name: "Findings" }));
  act(() => {
    vi.advanceTimersByTime(HOVER_OPEN_MS + 1);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  reviewsResult.current = { data: undefined, isLoading: false, isError: false };
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("FindingsCell — counters", () => {
  it("renders a counter per severity", () => {
    renderCell({ counts: { critical: 3, warning: 5, suggestion: 2 } });
    expect(screen.getByLabelText("Critical: 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Warning: 5")).toBeInTheDocument();
    expect(screen.getByLabelText("Suggestion: 2")).toBeInTheDocument();
  });

  it("shows an em dash and no card for a PR that was never reviewed", () => {
    renderCell({ counts: null });
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Findings" })).not.toBeInTheDocument();
  });
});

describe("FindingsCell — hover card", () => {
  it("opens on hover and lists the PR's findings", () => {
    reviewsResult.current = {
      data: [
        review([
          finding(),
          finding({
            id: "f2",
            severity: "WARNING",
            category: "perf",
            title: "N+1 query in user list endpoint",
            file: "src/api/users.ts",
            start_line: 45,
            end_line: 52,
          }),
        ]),
      ],
      isLoading: false,
      isError: false,
    };
    renderCell();
    hoverCell();

    const card = screen.getByRole("dialog", { name: "Findings for this pull request" });
    expect(card).toBeInTheDocument();
    expect(screen.getByText("2 findings in this run")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
    expect(screen.getByText("N+1 query in user list endpoint")).toBeInTheDocument();
    // Multi-line findings render as a range.
    expect(screen.getByText("src/api/users.ts:45-52")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts:12")).toBeInTheDocument();
  });

  it("leaves dismissed findings out, so the header matches the counters", () => {
    reviewsResult.current = {
      data: [
        review([
          finding(),
          finding({
            id: "f2",
            title: "Already handled",
            dismissed_at: "2026-06-02T10:00:00.000Z",
          }),
        ]),
      ],
      isLoading: false,
      isError: false,
    };
    renderCell({ counts: { critical: 1, warning: 0, suggestion: 0 } });
    hoverCell();

    expect(screen.getByText("1 finding in this run")).toBeInTheDocument();
    expect(screen.queryByText("Already handled")).not.toBeInTheDocument();
  });

  it("skips severities the counters can't count, so the two always agree", () => {
    reviewsResult.current = {
      data: [
        review([
          finding(),
          // `findings.severity` is an unconstrained text column; the server's
          // rollup ignores anything outside the three, so the card must too.
          finding({ id: "f2", severity: "WEIRD" as FindingRecord["severity"], title: "Odd one" }),
        ]),
      ],
      isLoading: false,
      isError: false,
    };
    renderCell({ counts: { critical: 1, warning: 0, suggestion: 0 } });
    hoverCell();

    expect(screen.getByText("1 finding in this run")).toBeInTheDocument();
    expect(screen.queryByText("Odd one")).not.toBeInTheDocument();
  });

  it("sums the latest run of EACH agent", () => {
    // Two agents are two opinions on the same PR — both belong in the card.
    reviewsResult.current = {
      data: [
        review([finding({ id: "s1", title: "From the security agent" })], {
          id: "r2",
          run_id: "run-2",
          agent_id: "agent-security",
        }),
        review([finding({ id: "p1", title: "From the perf agent" })], {
          id: "r1",
          run_id: "run-1",
          agent_id: "agent-perf",
        }),
      ],
      isLoading: false,
      isError: false,
    };
    renderCell({ counts: { critical: 2, warning: 0, suggestion: 0 } });
    hoverCell();

    expect(screen.getByText("2 findings in this run")).toBeInTheDocument();
    expect(screen.getByText("From the security agent")).toBeInTheDocument();
    expect(screen.getByText("From the perf agent")).toBeInTheDocument();
  });

  it("drops a re-run agent's superseded findings, keeping the other agent's", () => {
    reviewsResult.current = {
      data: [
        review([finding({ id: "new1", title: "Fresh run of agent A" })], {
          id: "r3",
          run_id: "run-3",
          agent_id: "agent-a",
        }),
        review([finding({ id: "b1", title: "Agent B, not re-run" })], {
          id: "r2",
          run_id: "run-2",
          agent_id: "agent-b",
        }),
        review([finding({ id: "old1", title: "Superseded run of agent A" })], {
          id: "r1",
          run_id: "run-1",
          agent_id: "agent-a",
        }),
      ],
      isLoading: false,
      isError: false,
    };
    renderCell({ counts: { critical: 2, warning: 0, suggestion: 0 } });
    hoverCell();

    expect(screen.getByText("2 findings in this run")).toBeInTheDocument();
    expect(screen.getByText("Fresh run of agent A")).toBeInTheDocument();
    expect(screen.getByText("Agent B, not re-run")).toBeInTheDocument();
    expect(screen.queryByText("Superseded run of agent A")).not.toBeInTheDocument();
  });

  it("keeps both review rows of one run together (a summary beside the review)", () => {
    reviewsResult.current = {
      data: [
        review([finding({ id: "a", title: "From the review row" })], {
          id: "r2",
          run_id: "run-9",
          agent_id: "agent-a",
        }),
        review([finding({ id: "b", title: "From the summary row" })], {
          id: "r3",
          run_id: "run-9",
          kind: "summary",
          agent_id: "agent-a",
        }),
      ],
      isLoading: false,
      isError: false,
    };
    renderCell({ counts: { critical: 2, warning: 0, suggestion: 0 } });
    hoverCell();

    expect(screen.getByText("2 findings in this run")).toBeInTheDocument();
    expect(screen.getByText("From the summary row")).toBeInTheDocument();
  });

  it("does not open when the PR is reviewed but has nothing outstanding", () => {
    renderCell({ counts: { critical: 0, warning: 0, suggestion: 0 } });
    hoverCell();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens on keyboard focus too", () => {
    reviewsResult.current = { data: [review([finding()])], isLoading: false, isError: false };
    renderCell();
    fireEvent.focus(screen.getByLabelText("Critical: 1"));
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    reviewsResult.current = { data: [review([finding()])], isLoading: false, isError: false };
    renderCell();
    hoverCell();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stays open while its own findings list is scrolled", () => {
    // `scroll` doesn't bubble, so the listener has to be capture-phase — which
    // means it also sees the card's own scrollable body. Scrolling the list
    // must not close the thing being scrolled.
    reviewsResult.current = {
      data: [review([finding(), finding({ id: "f2", title: "Second finding" })])],
      isLoading: false,
      isError: false,
    };
    renderCell();
    hoverCell();
    const card = screen.getByRole("dialog");

    fireEvent.scroll(card.querySelector("div:last-of-type")!);
    expect(screen.queryByRole("dialog")).toBeInTheDocument();

    fireEvent.scroll(card);
    expect(screen.queryByRole("dialog")).toBeInTheDocument();
  });

  it("still closes when the page behind it scrolls", () => {
    reviewsResult.current = { data: [review([finding()])], isLoading: false, isError: false };
    renderCell();
    hoverCell();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // A fixed-position card would drift away from its row, so this one closes.
    fireEvent.scroll(document.body);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows an error line instead of an empty card when the fetch fails", () => {
    reviewsResult.current = { data: undefined, isLoading: false, isError: true };
    renderCell();
    hoverCell();
    expect(screen.getByText("Couldn’t load findings")).toBeInTheDocument();
  });
});
