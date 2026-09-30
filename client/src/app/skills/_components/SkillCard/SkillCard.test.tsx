import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import { makeSkill, renderWithProviders } from "../../_testing/render";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

describe("SkillCard", () => {
  it("renders name, type chip, source label and usage footer", () => {
    renderWithProviders(<SkillCard skill={makeSkill()} />);
    expect(screen.getByText("untested-branches")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
    expect(screen.getByText(/2 agents · — pull · — accept/)).toBeInTheDocument();
    expect(screen.queryByText("needs vetting")).not.toBeInTheDocument();
  });

  it("flags a disabled imported skill as needing vetting", () => {
    renderWithProviders(<SkillCard skill={makeSkill({ source: "imported_file", enabled: false })} />);
    expect(screen.getByText("Imported")).toBeInTheDocument();
    expect(screen.getByText("needs vetting")).toBeInTheDocument();
  });

  it("toggling calls onToggle without triggering the card click", () => {
    const onClick = vi.fn();
    const onToggle = vi.fn();
    renderWithProviders(<SkillCard skill={makeSkill()} onClick={onClick} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("untested-branches"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
