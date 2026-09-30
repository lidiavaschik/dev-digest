import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { renderWithProviders } from "../../../../../../../_testing/render";
import { BodyEditor } from "./BodyEditor";

afterEach(cleanup);

describe("BodyEditor", () => {
  it("renders one gutter number per line and the unsaved badge only when dirty", () => {
    const { rerender } = renderWithProviders(
      <BodyEditor filename="x.md" value={"a\nb\nc"} onChange={() => {}} dirty={false} tokens={1} />,
    );
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByText("4")).not.toBeInTheDocument();
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
    rerender(<BodyEditor filename="x.md" value={"a"} onChange={() => {}} dirty tokens={1} />);
    expect(screen.getByText("unsaved")).toBeInTheDocument();
    expect(screen.getByText("1 token")).toBeInTheDocument();
  });
});
