import { describe, expect, it } from "vitest";
import { hasUnwatchedNewEpisode } from "./newEpisode";
import type { NextAiringEpisode } from "./types";

const NOW = new Date("2026-09-19T12:00:00Z").getTime();
const DAY_MS = 86_400_000;

function schedule(episode: number, daysUntilAiring: number): NextAiringEpisode {
  return {
    episode,
    airingAt: new Date(NOW + daysUntilAiring * DAY_MS).toISOString(),
    timeUntilAiring: daysUntilAiring * 86_400,
    anilistId: 1,
  };
}

describe("hasUnwatchedNewEpisode", () => {
  it("badges a weekly show with an unwatched aired episode", () => {
    // Ep 9 airs in 2 days, so ep 8 aired 5 days ago; viewer has watched 7.
    expect(hasUnwatchedNewEpisode(schedule(9, 2), 7, NOW)).toBe(true);
  });

  it("does not badge a viewer who is caught up", () => {
    expect(hasUnwatchedNewEpisode(schedule(9, 2), 8, NOW)).toBe(false);
  });

  it("does not badge a viewer ahead of the aired count", () => {
    expect(hasUnwatchedNewEpisode(schedule(9, 2), 12, NOW)).toBe(false);
  });

  it("does not badge when the next episode is beyond the window", () => {
    // A long gap means the last episode aired well over a week ago.
    expect(hasUnwatchedNewEpisode(schedule(9, 20), 7, NOW)).toBe(false);
  });

  it("badges right at the window edge", () => {
    expect(hasUnwatchedNewEpisode(schedule(9, 7), 7, NOW)).toBe(true);
  });

  it("does not badge just past the window edge", () => {
    expect(hasUnwatchedNewEpisode(schedule(9, 7.5), 7, NOW)).toBe(false);
  });

  it("badges when the schedule is stale but episodes are unwatched", () => {
    expect(hasUnwatchedNewEpisode(schedule(9, -1), 7, NOW)).toBe(true);
  });

  it("does not badge before the first episode airs", () => {
    expect(hasUnwatchedNewEpisode(schedule(1, 3), 0, NOW)).toBe(false);
  });

  it("treats a missing schedule as no badge", () => {
    expect(hasUnwatchedNewEpisode(null, 0, NOW)).toBe(false);
    expect(hasUnwatchedNewEpisode(undefined, 0, NOW)).toBe(false);
  });

  it("treats undefined watched count as zero", () => {
    expect(hasUnwatchedNewEpisode(schedule(3, 2), undefined, NOW)).toBe(true);
  });

  it("ignores an unparseable airing timestamp", () => {
    const broken = { ...schedule(9, 2), airingAt: "not-a-date" };
    expect(hasUnwatchedNewEpisode(broken, 7, NOW)).toBe(false);
  });
});
