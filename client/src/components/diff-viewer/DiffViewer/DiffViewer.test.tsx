import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile } from "@/lib/types";
import messages from "../../../../messages/en/shell.json";
import { DiffViewer } from "./DiffViewer";

afterEach(cleanup);

/** Small patches so every card auto-expands (under AUTO_EXPAND_MAX_LINES). */
const file = (path: string, marker: string): PrFile => ({
  path,
  additions: 1,
  deletions: 0,
  patch: `@@ -1,1 +1,2 @@\n context\n+${marker}\n`,
});

const ALPHA = file("src/alpha.ts", "ALPHA_LINE");
const BETA = file("src/beta.ts", "BETA_LINE");
const GAMMA = file("src/gamma.ts", "GAMMA_LINE");

function renderDiff(files: PrFile[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: messages }}>
      <DiffViewer files={files} />
    </NextIntlClientProvider>,
  );
}

function rerenderDiff(rerender: (ui: React.ReactElement) => void, files: PrFile[]) {
  rerender(
    <NextIntlClientProvider locale="en" messages={{ shell: messages }}>
      <DiffViewer files={files} />
    </NextIntlClientProvider>,
  );
}

describe("DiffViewer", () => {
  it("renders one card per changed file", () => {
    renderDiff([ALPHA, BETA]);
    expect(screen.getByText("src/alpha.ts")).toBeInTheDocument();
    expect(screen.getByText("src/beta.ts")).toBeInTheDocument();
    expect(screen.getByText(/ALPHA_LINE/)).toBeInTheDocument();
  });

  it("shows an empty state when there are no files", () => {
    renderDiff([]);
    expect(screen.getByText(messages.diffViewer.noChangedFiles)).toBeInTheDocument();
  });

  // Regression: cards were keyed by array index, so each FileCard's collapsed
  // state belonged to a SLOT. Inserting a file ahead of a collapsed one handed
  // that collapsed state to whichever file shifted into the slot.
  it("keeps a card's collapsed state with its file when the list changes", () => {
    const { rerender } = renderDiff([ALPHA, BETA]);

    // Collapse alpha (auto-expanded) by clicking its header.
    fireEvent.click(screen.getByText("src/alpha.ts"));
    expect(screen.queryByText(/ALPHA_LINE/)).not.toBeInTheDocument();
    expect(screen.getByText(/BETA_LINE/)).toBeInTheDocument();

    // Prepend a file: alpha moves from slot 0 to slot 1.
    rerenderDiff(rerender, [GAMMA, ALPHA, BETA]);

    // Alpha is still the collapsed one; gamma, newly mounted, is open.
    expect(screen.queryByText(/ALPHA_LINE/)).not.toBeInTheDocument();
    expect(screen.getByText(/GAMMA_LINE/)).toBeInTheDocument();
    expect(screen.getByText(/BETA_LINE/)).toBeInTheDocument();
  });
});
