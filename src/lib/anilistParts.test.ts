import { describe, expect, it } from "vitest";
import { type AniListPart, combinedSchedule, resolvePartEpisode, startKey } from "./anilistParts";

function part(id: number, episodes: number | null, start: string | null, nextEpisode?: number): AniListPart {
  const [year, month, day] = start ? start.split("-").map(Number) : [];
  return {
    id,
    episodes,
    startKey: startKey(start ? { year, month, day } : null),
    nextAiringEpisode: nextEpisode ? { episode: nextEpisode, airingAt: 1_790_928_000, timeUntilAiring: 60 } : null,
  };
}

// Steel Ball Run (MAL 61469): AniList has a finished 1-episode "1st STAGE" and an airing
// 11-episode "2nd & 3rd STAGE", both with idMal 61469 — and returns them in either order.
const steelBallRun = [part(210482, 11, "2026-09-25", 2), part(190327, 1, "2026-03-19")];

describe("combinedSchedule", () => {
  it("renumbers the airing part's next episode past the earlier parts", () => {
    expect(combinedSchedule(steelBallRun)).toMatchObject({ episode: 3, anilistId: 210482 });
  });

  it("passes a single part's schedule through unchanged", () => {
    expect(combinedSchedule([part(1, 12, "2026-07-01", 7)])).toMatchObject({ episode: 7, anilistId: 1 });
  });

  it("returns null when no part is airing", () => {
    expect(combinedSchedule([part(1, 12, "2026-01-01"), part(2, 12, "2026-07-01")])).toBeNull();
    expect(combinedSchedule([])).toBeNull();
  });

  it("counts an earlier part with an unknown length by its aired episodes", () => {
    const parts = [part(1, null, "2026-01-01", 5), part(2, 12, "2026-07-01", 1)];
    expect(combinedSchedule(parts)).toMatchObject({ episode: 5, anilistId: 1 });
  });
});

describe("resolvePartEpisode", () => {
  it("maps MAL's continuous numbering onto each part's own", () => {
    expect(resolvePartEpisode(steelBallRun, 1)).toEqual({ anilistId: 190327, episode: 1 });
    expect(resolvePartEpisode(steelBallRun, 2)).toEqual({ anilistId: 210482, episode: 1 });
    expect(resolvePartEpisode(steelBallRun, 12)).toEqual({ anilistId: 210482, episode: 11 });
  });

  it("keeps the identity mapping for a single part, even past AniList's count", () => {
    expect(resolvePartEpisode([part(5, 12, "2020-01-01")], 3)).toEqual({ anilistId: 5, episode: 3 });
    expect(resolvePartEpisode([part(5, 12, "2020-01-01")], 14)).toEqual({ anilistId: 5, episode: 14 });
  });

  it("orders undated parts last", () => {
    const parts = [part(9, 3, null), part(8, 2, "2024-01-01")];
    expect(resolvePartEpisode(parts, 3)).toEqual({ anilistId: 9, episode: 1 });
  });

  it("returns null when AniList has no media", () => {
    expect(resolvePartEpisode([], 1)).toBeNull();
  });
});
