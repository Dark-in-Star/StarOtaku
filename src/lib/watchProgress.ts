import type { ListStatus } from "./types";

export interface WatchProgressUpdate {
  num_watched_episodes: number;
  status: ListStatus;
}

/**
 * The episode the player should open on: the one after the last the user finished.
 *
 * Clamped to what has actually aired, so a viewer caught up on an airing show lands on
 * the latest available episode rather than an empty slot. A finished rewatch (progress at
 * or past the aired run) also lands there rather than nowhere.
 */
export function resumeEpisode(watched: number, airedEpisodes: number): number {
  if (airedEpisodes < 1) return 1;
  const next = Math.floor(watched) + 1;
  return Math.min(Math.max(next, 1), airedEpisodes);
}

/**
 * Works out the list update for "the user just finished episode `episode`".
 *
 * Progress only ever moves forward: re-watching an earlier episode must not rewind the
 * count MAL already has, which would silently destroy progress the user built elsewhere.
 * Returns null when there is nothing to send.
 */
export function watchProgressUpdate(
  episode: number,
  watched: number,
  status: ListStatus | undefined,
  totalEpisodes: number | undefined,
): WatchProgressUpdate | null {
  if (!Number.isInteger(episode) || episode < 1) return null;

  const next = Math.max(watched, episode);
  const nextStatus = nextListStatus(next, status, totalEpisodes);
  if (next === watched && nextStatus === status) return null;

  return { num_watched_episodes: next, status: nextStatus };
}

function nextListStatus(
  watched: number,
  status: ListStatus | undefined,
  totalEpisodes: number | undefined,
): ListStatus {
  if (totalEpisodes !== undefined && watched >= totalEpisodes) return "completed";
  // A title being re-watched keeps its "completed" status; anything else the user is
  // actively streaming is, by definition, being watched.
  if (status === "completed") return "completed";
  return "watching";
}
