import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnimeListRow } from "./AnimeListRow";
import type { AnimeNode, MyListStatus } from "@/lib/types";

const updateAnimeStatusAction = vi.fn().mockResolvedValue(undefined);
const removeAnimeAction = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/actions", () => ({
  updateAnimeStatusAction: (...args: unknown[]) => updateAnimeStatusAction(...args),
  removeAnimeAction: (...args: unknown[]) => removeAnimeAction(...args),
}));

const NODE: AnimeNode = {
  id: 1,
  title: "86",
  num_episodes: 11,
  media_type: "tv",
  start_season: { season: "spring", year: 2021 },
};

const LIST_STATUS: MyListStatus = { status: "plan_to_watch", score: 0, num_episodes_watched: 0 };

beforeEach(() => {
  updateAnimeStatusAction.mockClear();
  removeAnimeAction.mockClear();
});

describe("AnimeListRow", () => {
  it("shows details but no inline edit/remove controls", () => {
    render(<AnimeListRow node={NODE} listStatus={LIST_STATUS} onUpdated={vi.fn()} onRemoved={vi.fn()} />);

    expect(screen.getByText("86")).toBeInTheDocument();
    expect(screen.getByText(/TV/)).toBeInTheDocument();
    expect(screen.getByText("0 / 11 ep")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /remove/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Increase episodes watched" })).toBeInTheDocument();
  });

  it("increments the episode count and saves it when the plus button is clicked", async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    render(<AnimeListRow node={NODE} listStatus={LIST_STATUS} onUpdated={onUpdated} onRemoved={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Increase episodes watched" }));

    expect(screen.getByText("1 / 11 ep")).toBeInTheDocument();
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ num_episodes_watched: 1, status: "watching" }));
    expect(updateAnimeStatusAction).toHaveBeenCalledWith({ animeId: 1, num_watched_episodes: 1, status: "watching" });
  });

  it("disables the plus button once every episode is watched", () => {
    render(
      <AnimeListRow
        node={NODE}
        listStatus={{ ...LIST_STATUS, num_episodes_watched: 11 }}
        onUpdated={vi.fn()}
        onRemoved={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Increase episodes watched" })).toBeDisabled();
  });

  it("opens a full edit modal with status, progress, and score controls", async () => {
    const user = userEvent.setup();
    render(<AnimeListRow node={NODE} listStatus={LIST_STATUS} onUpdated={vi.fn()} onRemoved={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Edit" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("86")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Watching" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Plan to Watch" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /remove from list/i })).toBeInTheDocument();
  });

  it("saves the full edit (status, score, episodes) from the modal", async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    render(<AnimeListRow node={NODE} listStatus={LIST_STATUS} onUpdated={onUpdated} onRemoved={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog");

    await user.click(within(dialog).getByRole("button", { name: "Watching" }));
    await user.click(within(dialog).getByRole("button", { name: "Score 8" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(updateAnimeStatusAction).toHaveBeenCalledWith({
      animeId: 1,
      status: "watching",
      score: 8,
      num_watched_episodes: 0,
    });
    expect(onUpdated).toHaveBeenCalledWith({ status: "watching", score: 8, num_episodes_watched: 0 });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("removes the entry from the modal", async () => {
    const user = userEvent.setup();
    const onRemoved = vi.fn();
    render(<AnimeListRow node={NODE} listStatus={LIST_STATUS} onUpdated={vi.fn()} onRemoved={onRemoved} />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: /remove from list/i }));

    expect(removeAnimeAction).toHaveBeenCalledWith(1);
    expect(onRemoved).toHaveBeenCalled();
  });

  it("shows the English title, airing status, genres, MAL score, and my score", () => {
    const richNode: AnimeNode = {
      ...NODE,
      alternative_titles: { en: "Eighty-Six" },
      status: "currently_airing",
      genres: [
        { id: 1, name: "Action" },
        { id: 2, name: "Drama" },
        { id: 3, name: "Sci-Fi" },
        { id: 4, name: "Military" },
      ],
      mean: 8.24,
    };
    render(
      <AnimeListRow
        node={richNode}
        listStatus={{ ...LIST_STATUS, score: 9 }}
        onUpdated={vi.fn()}
        onRemoved={vi.fn()}
      />,
    );

    expect(screen.getByText("Eighty-Six")).toBeInTheDocument();
    expect(screen.getByText(/Currently Airing/)).toBeInTheDocument();
    expect(screen.getByText("Action")).toBeInTheDocument();
    expect(screen.getByText("Drama")).toBeInTheDocument();
    expect(screen.getByText("Sci-Fi")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(screen.getByText("8.24")).toBeInTheDocument();
    expect(screen.getByText("My 9")).toBeInTheDocument();
  });

  it("shows the English title even when it matches the main title, but omits my score when unrated", () => {
    render(
      <AnimeListRow
        node={{ ...NODE, alternative_titles: { en: "86" } }}
        listStatus={LIST_STATUS}
        onUpdated={vi.fn()}
        onRemoved={vi.fn()}
      />,
    );

    expect(screen.getAllByText("86")).toHaveLength(2);
    expect(screen.queryByText(/^My /)).not.toBeInTheDocument();
  });

  describe("new episode badge", () => {
    const AIRING: AnimeNode = { ...NODE, status: "currently_airing" };
    const WATCHING: MyListStatus = { status: "watching", score: 0, num_episodes_watched: 7 };

    function scheduleIn(days: number, episode: number) {
      return {
        episode,
        airingAt: new Date(Date.now() + days * 86_400_000).toISOString(),
        timeUntilAiring: days * 86_400,
        anilistId: 1,
      };
    }

    it("badges an unwatched episode aired within the window", () => {
      render(
        <AnimeListRow
          node={AIRING}
          listStatus={WATCHING}
          schedule={scheduleIn(2, 9)}
          onUpdated={vi.fn()}
          onRemoved={vi.fn()}
        />,
      );

      expect(screen.getByText("New")).toBeInTheDocument();
    });

    it("shows no badge when the viewer is caught up", () => {
      render(
        <AnimeListRow
          node={AIRING}
          listStatus={{ ...WATCHING, num_episodes_watched: 8 }}
          schedule={scheduleIn(2, 9)}
          onUpdated={vi.fn()}
          onRemoved={vi.fn()}
        />,
      );

      expect(screen.queryByText("New")).not.toBeInTheDocument();
    });

    it("shows no badge without a schedule", () => {
      render(<AnimeListRow node={AIRING} listStatus={WATCHING} onUpdated={vi.fn()} onRemoved={vi.fn()} />);

      expect(screen.queryByText("New")).not.toBeInTheDocument();
    });

    it("clears the badge as soon as the viewer logs the episode", async () => {
      const user = userEvent.setup();
      render(
        <AnimeListRow
          node={AIRING}
          listStatus={WATCHING}
          schedule={scheduleIn(2, 9)}
          onUpdated={vi.fn()}
          onRemoved={vi.fn()}
        />,
      );

      expect(screen.getByText("New")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Increase episodes watched" }));
      expect(screen.queryByText("New")).not.toBeInTheDocument();
    });
  });
});
