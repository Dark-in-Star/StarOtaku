import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchSuggestionsResult } from "@/lib/browseActions";
import { SearchBar } from "./SearchBar";

const push = vi.fn();
const searchSuggestions = vi.fn<(q: string) => Promise<SearchSuggestionsResult>>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/browseActions", () => ({
  searchSuggestions: (q: string) => searchSuggestions(q),
}));

const RESULTS: SearchSuggestionsResult = {
  ok: true,
  signedIn: true,
  anime: [
    {
      id: 1,
      href: "/anime/1",
      title: "Frieren",
      media: "anime",
      mediaType: "tv",
      mean: 9.31,
      status: "currently_airing",
      year: 2023,
      genres: [{ id: 2, name: "Adventure" }],
      listStatus: "watching",
    },
  ],
  manga: [
    {
      id: 2,
      href: "/manga/2",
      title: "Frieren Manga",
      media: "manga",
      mediaType: "manga",
      mean: 8.9,
      status: "on_hiatus",
      genres: [{ id: 8, name: "Drama" }],
    },
  ],
};

beforeEach(() => {
  push.mockClear();
  searchSuggestions.mockReset();
  searchSuggestions.mockResolvedValue(RESULTS);
});

function getTrigger() {
  return screen.getByRole("searchbox");
}

/** Types into the page's search box; the first real character hands over to the overlay. */
async function searchFor(text: string) {
  const user = userEvent.setup();
  render(<SearchBar />);
  await user.type(getTrigger(), text[0]);
  const input = await screen.findByRole("combobox", { name: "Search anime or manga" });
  if (text.length > 1) await user.keyboard(text.slice(1));
  return { user, input };
}

describe("SearchBar", () => {
  it("does not take over the page when the box is only clicked", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);

    await user.click(getTrigger());

    expect(getTrigger()).toHaveFocus();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not open for whitespace, and does not navigate for it either", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);

    await user.type(getTrigger(), "   {Enter}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("opens on the first typed character and keeps typing in the overlay", async () => {
    const { input } = await searchFor("fri");

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(input).toHaveFocus();
    expect(input).toHaveValue("fri");
  });

  it("navigates to the browse page with the entered query on Enter", async () => {
    searchSuggestions.mockResolvedValue({ ok: true, signedIn: false, anime: [], manga: [] });
    const { user } = await searchFor("one piece");

    await user.keyboard("{Enter}");

    expect(push).toHaveBeenCalledWith("/browse?q=one%20piece");
  });

  it("suggests for titles shorter than MAL's 3-character search minimum", async () => {
    await searchFor("86");

    expect(await screen.findByRole("option", { name: /^Frieren anime/i })).toBeInTheDocument();
    expect(searchSuggestions).toHaveBeenLastCalledWith("86");
  });

  it("shows type, rating, genres, list and airing status for each suggestion", async () => {
    await searchFor("frieren");

    const anime = await screen.findByRole("option", { name: /^Frieren anime/i });
    expect(anime).toHaveAttribute("href", "/anime/1");
    expect(anime).toHaveTextContent("TV");
    expect(anime).toHaveTextContent("Currently Airing");
    expect(anime).toHaveTextContent("2023");
    expect(anime).toHaveTextContent("9.31");
    expect(anime).toHaveTextContent("Adventure");
    expect(anime).toHaveTextContent("Watching");

    const manga = screen.getByRole("option", { name: /Frieren Manga/ });
    expect(manga).toHaveTextContent("On Hiatus");
    expect(manga).toHaveTextContent("Not on your list");
    expect(searchSuggestions).toHaveBeenCalledWith("frieren");
  });

  it("searches the full results page on Enter even while the pointer rests on a suggestion", async () => {
    const { user, input } = await searchFor("frieren");

    await user.hover(await screen.findByRole("option", { name: /^Frieren anime/i }));
    await user.click(input);
    await user.keyboard("{Enter}");

    expect(push).toHaveBeenCalledWith("/browse?q=frieren");
  });

  it("navigates to the highlighted suggestion with the arrow keys", async () => {
    const { user } = await searchFor("frieren");

    await screen.findByRole("option", { name: /Frieren Manga/ });
    await user.keyboard("{ArrowDown}{ArrowDown}");

    expect(screen.getByRole("option", { name: /Frieren Manga/ })).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/manga/2");
  });

  it("surfaces a failed suggestion lookup instead of hanging", async () => {
    searchSuggestions.mockResolvedValue({ ok: false, message: "MyAnimeList is temporarily rate-limiting this app." });
    await searchFor("frieren");

    expect(await screen.findByRole("alert")).toHaveTextContent(/rate-limiting/);
  });

  it("closes on Escape", async () => {
    const { user } = await searchFor("f");

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
