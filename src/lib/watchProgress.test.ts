import { describe, expect, it } from "vitest";
import { resumeEpisode, watchProgressUpdate } from "./watchProgress";

describe("watchProgressUpdate", () => {
  it("advances progress and starts watching an untracked title", () => {
    expect(watchProgressUpdate(1, 0, undefined, 12)).toEqual({
      num_watched_episodes: 1,
      status: "watching",
    });
  });

  it("promotes plan_to_watch and on_hold to watching", () => {
    expect(watchProgressUpdate(3, 2, "plan_to_watch", 12)?.status).toBe("watching");
    expect(watchProgressUpdate(3, 2, "on_hold", 12)?.status).toBe("watching");
  });

  it("completes the title on the final episode", () => {
    expect(watchProgressUpdate(12, 11, "watching", 12)).toEqual({
      num_watched_episodes: 12,
      status: "completed",
    });
  });

  it("never rewinds progress when an earlier episode is rewatched", () => {
    expect(watchProgressUpdate(2, 9, "watching", 12)).toBeNull();
  });

  it("keeps completed titles completed while rewatching", () => {
    expect(watchProgressUpdate(3, 12, "completed", 12)).toBeNull();
  });

  it("keeps counting past the total when the total is unknown", () => {
    expect(watchProgressUpdate(30, 29, "watching", undefined)).toEqual({
      num_watched_episodes: 30,
      status: "watching",
    });
  });

  it("returns null for a nonsensical episode number", () => {
    expect(watchProgressUpdate(0, 0, "watching", 12)).toBeNull();
    expect(watchProgressUpdate(-1, 0, "watching", 12)).toBeNull();
  });
});

describe("resumeEpisode", () => {
  it("opens on the episode after the last one watched", () => {
    expect(resumeEpisode(3, 12)).toBe(4);
  });

  it("starts at episode 1 for an untracked title", () => {
    expect(resumeEpisode(0, 12)).toBe(1);
  });

  it("stays on the latest aired episode when caught up on an airing show", () => {
    expect(resumeEpisode(5, 5)).toBe(5);
  });

  it("stays on the final episode once the title is finished", () => {
    expect(resumeEpisode(12, 12)).toBe(12);
  });

  it("never exceeds the aired run when progress has run ahead", () => {
    expect(resumeEpisode(24, 12)).toBe(12);
  });

  it("falls back to episode 1 when nothing has aired", () => {
    expect(resumeEpisode(3, 0)).toBe(1);
  });
});
