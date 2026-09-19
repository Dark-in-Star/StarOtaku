import type { NextAiringEpisode } from "./types";

const DAY_MS = 86_400_000;
export const NEW_EPISODE_WINDOW_DAYS = 7;

/**
 * Whether an entry should show a "new episode" badge: an episode aired within the last
 * `NEW_EPISODE_WINDOW_DAYS` days that the viewer hasn't watched yet.
 *
 * AniList only reports the *next* episode, so the latest aired one is `episode - 1` and its
 * air time is one release interval before `airingAt`. Virtually all airing anime release
 * weekly, which is also exactly the badge window — so rather than guess the interval, the
 * check is: does the next episode air within one week from now? If it does, the previous
 * episode aired within the past week, because they are one interval apart.
 *
 * That equivalence is why a split-cour break or a delay doesn't produce a false positive:
 * the next airing is then far out, so no badge — even though an episode may technically
 * have aired "recently" before the break started.
 */
export function hasUnwatchedNewEpisode(
  schedule: NextAiringEpisode | null | undefined,
  episodesWatched: number | undefined,
  now: number = Date.now(),
): boolean {
  if (!schedule || schedule.episode <= 1) return false;

  const latestAired = schedule.episode - 1;
  if ((episodesWatched ?? 0) >= latestAired) return false;

  const airingAt = new Date(schedule.airingAt).getTime();
  if (Number.isNaN(airingAt)) return false;

  const msUntilNext = airingAt - now;
  // A stale schedule (next airing already in the past) means the feed hasn't rolled over
  // yet; treat it as current rather than hiding a badge the viewer has earned.
  if (msUntilNext < 0) return true;

  return msUntilNext <= NEW_EPISODE_WINDOW_DAYS * DAY_MS;
}
