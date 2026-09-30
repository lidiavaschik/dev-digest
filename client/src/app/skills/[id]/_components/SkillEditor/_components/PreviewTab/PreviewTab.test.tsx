import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { makeSkill, renderWithProviders } from "../../../../../_testing/render";
import { PreviewTab } from "./PreviewTab";

afterEach(cleanup);

describe("PreviewTab", () => {
  it("renders the skill as a ### heading followed by its markdown body", () => {
    renderWithProviders(<PreviewTab skill={makeSkill({ body: "Every **new** branch needs a test." })} />);
    expect(screen.getByRole("heading", { level: 3, name: "untested-branches" })).toBeInTheDocument();
    expect(screen.getByText("new")).toBeInTheDocument();
    expect(screen.getByText("Rendered as the reviewing agent receives it.")).toBeInTheDocument();
  });
});
