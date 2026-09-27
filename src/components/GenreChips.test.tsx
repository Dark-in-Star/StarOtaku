import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { GenreChips } from "./GenreChips";

const GENRES = [
  { id: 1, name: "Action" },
  { id: 2, name: "Adventure" },
  { id: 3, name: "Drama" },
  { id: 4, name: "Fantasy" },
  { id: 5, name: "Mystery" },
];

describe("GenreChips", () => {
  it("renders nothing without genres", () => {
    const { container } = render(<GenreChips genres={[]} title="Show" variant="muted" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is not clickable when every genre fits", () => {
    render(<GenreChips genres={GENRES.slice(0, 3)} title="Show" variant="muted" />);

    expect(screen.getByText("Drama")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("opens a dialog listing every genre when the overflowing chips are clicked", async () => {
    const user = userEvent.setup();
    render(<GenreChips genres={GENRES} title="Show" variant="accent" />);

    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(screen.queryByText("Mystery")).not.toBeInTheDocument();

    await user.click(screen.getByText("Action"));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Show")).toBeInTheDocument();
    for (const genre of GENRES) expect(within(dialog).getByText(genre.name)).toBeInTheDocument();
  });
});
