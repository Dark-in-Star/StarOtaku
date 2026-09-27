import type { NextAiringEpisode } from "./types";

/**
 * One AniList media that maps to a MAL id.
 *
 * MAL and AniList don't always agree on where one entry ends: MAL keeps some split
 * releases as a single entry with continuous episode numbers (e.g. Steel Ball Run, MAL
 * 61469), while AniList lists each part separately — every part carrying the same
 * `idMal` and numbering its own episodes from 1. `Media(idMal:)` then returns an
 * arbitrary one of them, which is how a currently-airing title ended up resolving to a
 * finished one-episode part with no schedule and no playable episodes.
 */
export interface AniListPart {
  id: number;
  episodes: number | null;
  /** `yyyymmdd` as a number for ordering; null when AniList has no start date. */
  startKey: number | null;
  nextAiringEpisode: { episode: number; airingAt: number; timeUntilAiring: number } | null;
}

export function startKey(date: { year?: number | null; month?: number | null; day?: number | null } | null | undefined) {
  if (!date?.year) return null;
  return date.year * 10_000 + (date.month ?? 12) * 100 + (date.day ?? 31);
}

function inReleaseOrder(parts: AniListPart[]): AniListPart[] {
  return [...parts].sort(
    (a, b) => (a.startKey ?? Infinity) - (b.startKey ?? Infinity) || a.id - b.id,
  );
}

/** Episodes a part contributes before the next one starts counting. */
function partLength(part: AniListPart): number {
  if (part.episodes && part.episodes > 0) return part.episodes;
  return part.nextAiringEpisode ? Math.max(part.nextAiringEpisode.episode - 1, 0) : 0;
}

/**
 * The next airing episode across every part, renumbered onto MAL's continuous count so it
 * lines up with MAL's `num_episodes_watched` and the player's episode list.
 */
export function combinedSchedule(parts: AniListPart[]): NextAiringEpisode | null {
  const ordered = inReleaseOrder(parts);
  let offset = 0;
  for (const part of ordered) {
    const next = part.nextAiringEpisode;
    if (next) {
      return {
        episode: offset + next.episode,
        airingAt: new Date(next.airingAt * 1000).toISOString(),
        timeUntilAiring: next.timeUntilAiring,
        anilistId: part.id,
      };
    }
    offset += partLength(part);
  }
  return null;
}

/** Maps a MAL episode number to the AniList part and that part's own episode number. */
export function resolvePartEpisode(
  parts: AniListPart[],
  episode: number,
): { anilistId: number; episode: number } | null {
  const ordered = inReleaseOrder(parts);
  let remaining = episode;
  for (const [index, part] of ordered.entries()) {
    const length = partLength(part);
    // The last part absorbs any overflow, so a single-part title keeps the identity mapping
    // even when AniList's episode count lags behind MAL's.
    if (index === ordered.length - 1 || remaining <= length) {
      return { anilistId: part.id, episode: remaining };
    }
    remaining -= length;
  }
  return null;
}
