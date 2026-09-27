import "server-only";
import { type AniListPart, combinedSchedule, resolvePartEpisode, startKey } from "./anilistParts";
import type { AnimeExtras, NextAiringEpisode } from "./types";

const ANILIST_API_URL = "https://graphql.anilist.co";

// AniList sits behind Cloudflare and rate-limits per client. Node's fetch sends no
// User-Agent, which Cloudflare treats as a bot signal from datacentre IPs — the reason
// these lookups can succeed locally and fail once deployed.
const ANILIST_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
  "User-Agent": "Starotaku/1.0 (+https://starotaku.vercel.app)",
} as const;

// Every part, not `Media(idMal:)`: that returns just one of the AniList entries sharing a
// MAL id, and which one is arbitrary — see `AniListPart`.
const PARTS_QUERY = `
  query ($malId: Int) {
    Page(perPage: 50) {
      media(idMal: $malId, type: ANIME) {
        id
        episodes
        startDate { year month day }
        nextAiringEpisode {
          airingAt
          timeUntilAiring
          episode
        }
      }
    }
  }
`;

interface AniListPartMedia {
  id: number;
  idMal: number | null;
  episodes: number | null;
  startDate?: { year: number | null; month: number | null; day: number | null } | null;
  nextAiringEpisode?: {
    airingAt: number;
    timeUntilAiring: number;
    episode: number;
  } | null;
}

interface AniListPartsResponse {
  data?: {
    Page?: {
      pageInfo?: { hasNextPage: boolean } | null;
      media?: AniListPartMedia[] | null;
    } | null;
  };
  errors?: { message: string }[];
}

function toPart(media: AniListPartMedia): AniListPart {
  return {
    id: media.id,
    episodes: media.episodes,
    startKey: startKey(media.startDate),
    nextAiringEpisode: media.nextAiringEpisode ?? null,
  };
}

type PartsLookup =
  | { status: "ok"; parts: AniListPart[] }
  | { status: "unreachable"; error: unknown }
  | { status: "failed"; httpStatus: number };

async function getAniListParts(malId: number, revalidate: number): Promise<PartsLookup> {
  let response: Response;
  try {
    response = await fetch(ANILIST_API_URL, {
      method: "POST",
      headers: ANILIST_HEADERS,
      body: JSON.stringify({ query: PARTS_QUERY, variables: { malId } }),
      next: { revalidate },
    });
  } catch (error) {
    return { status: "unreachable", error };
  }

  if (!response.ok) return { status: "failed", httpStatus: response.status };

  const json = (await response.json()) as AniListPartsResponse;
  return { status: "ok", parts: (json.data?.Page?.media ?? []).map(toPart) };
}

/**
 * Looks up the next airing episode for a MAL anime id via AniList's GraphQL API.
 * MAL's own API only exposes a weekly broadcast slot (day + local time), not a
 * concrete next-episode date, so this is the only source for a real countdown.
 * Returns null for anime AniList doesn't know about, has finished airing, or on any
 * fetch/API error — this is a supplementary enhancement, never worth failing the page for.
 */
export async function getNextAiringEpisode(malId: number, revalidate = 300): Promise<NextAiringEpisode | null> {
  const lookup = await getAniListParts(malId, revalidate);
  return lookup.status === "ok" ? combinedSchedule(lookup.parts) : null;
}

// One page holds 50 media; AniList caps perPage at 50. Callers with more ids than that
// page through rather than firing one request per id — AniList rate-limits per client.
const ANILIST_PAGE_SIZE = 50;

const AIRING_SCHEDULES_QUERY = `
  query ($malIds: [Int], $page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage }
      media(idMal_in: $malIds, type: ANIME) {
        id
        idMal
        episodes
        startDate { year month day }
        nextAiringEpisode {
          airingAt
          timeUntilAiring
          episode
        }
      }
    }
  }
`;

// A MAL id can match several AniList parts, so a batch of ids can overflow one page.
async function fetchScheduleMedia(ids: number[], revalidate: number): Promise<AniListPartMedia[]> {
  const media: AniListPartMedia[] = [];
  for (let page = 1; ; page++) {
    let response: Response;
    try {
      response = await fetch(ANILIST_API_URL, {
        method: "POST",
        headers: ANILIST_HEADERS,
        body: JSON.stringify({
          query: AIRING_SCHEDULES_QUERY,
          variables: { malIds: ids, page, perPage: ANILIST_PAGE_SIZE },
        }),
        next: { revalidate },
      });
    } catch {
      return media;
    }

    if (!response.ok) return media;

    const json = (await response.json()) as AniListPartsResponse;
    media.push(...(json.data?.Page?.media ?? []));
    if (!json.data?.Page?.pageInfo?.hasNextPage) return media;
  }
}

/**
 * Batched form of `getNextAiringEpisode`: looks up many MAL ids in one GraphQL request,
 * keyed by MAL id. Anime AniList doesn't know, or that aren't currently airing, are simply
 * absent from the map. Like the single lookup this never throws — a failed page yields no
 * entries rather than breaking the caller's page.
 */
export async function getNextAiringEpisodes(
  malIds: number[],
  revalidate = 300,
): Promise<Map<number, NextAiringEpisode>> {
  const unique = [...new Set(malIds)];

  const chunks: number[][] = [];
  for (let i = 0; i < unique.length; i += ANILIST_PAGE_SIZE) {
    chunks.push(unique.slice(i, i + ANILIST_PAGE_SIZE));
  }

  const partsByMalId = new Map<number, AniListPart[]>();
  const results = await Promise.all(chunks.map((ids) => fetchScheduleMedia(ids, revalidate)));
  for (const media of results.flat()) {
    if (media.idMal === null) continue;
    const parts = partsByMalId.get(media.idMal) ?? [];
    parts.push(toPart(media));
    partsByMalId.set(media.idMal, parts);
  }

  const schedules = new Map<number, NextAiringEpisode>();
  for (const [malId, parts] of partsByMalId) {
    const schedule = combinedSchedule(parts);
    if (schedule) schedules.set(malId, schedule);
  }
  return schedules;
}

/**
 * Maps a MAL anime id and MAL episode number to the AniList media id and that media's own
 * episode number — the pair the stream source is keyed on. Kept here so there is only ever
 * one AniList client in the codebase. Returns null when AniList doesn't know the title or
 * the request fails — callers treat a missing id as "no data", never as an error.
 */
export async function resolveAniListEpisode(
  malId: number,
  episode: number,
  revalidate = 3600,
): Promise<{ anilistId: number; episode: number } | null> {
  const lookup = await getAniListParts(malId, revalidate);

  // Logged rather than swallowed silently: when this returns null the caller can only
  // report a generic failure, so without these lines there is no way to tell from the
  // deployed logs whether AniList or the stream source was the one that broke.
  if (lookup.status === "unreachable") {
    console.error("AniList id lookup could not connect", { malId, error: lookup.error });
    return null;
  }
  if (lookup.status === "failed") {
    console.error("AniList id lookup failed", { malId, status: lookup.httpStatus });
    return null;
  }

  const resolved = resolvePartEpisode(lookup.parts, episode);
  if (!resolved) console.error("AniList returned no media for this id", { malId });
  return resolved;
}

const ANIME_EXTRAS_QUERY = `
  query ($malId: Int) {
    Media(idMal: $malId, type: ANIME) {
      trailer { id site }
      externalLinks { url site type icon color language }
      characters(perPage: 12) {
        edges {
          role
          node { id name { full } image { large medium } }
          voiceActors(language: JAPANESE) { id name { full } image { large medium } }
        }
      }
      staff(perPage: 10) {
        edges {
          role
          node { id name { full } image { large medium } }
        }
      }
    }
  }
`;

interface AniListPerson {
  id: number;
  name: { full: string };
  image?: { large?: string; medium?: string } | null;
}

interface AniListExternalLink {
  url: string;
  site: string;
  type: string;
  icon?: string | null;
  color?: string | null;
  language?: string | null;
}

interface AniListExtrasResponse {
  data?: {
    Media?: {
      trailer?: { id: string; site: string } | null;
      externalLinks?: AniListExternalLink[] | null;
      characters?: {
        edges: { role: string; node: AniListPerson; voiceActors: AniListPerson[] }[];
      } | null;
      staff?: { edges: { role: string; node: AniListPerson }[] } | null;
    } | null;
  };
  errors?: { message: string }[];
}

function personImage(person: AniListPerson): string | undefined {
  return person.image?.large ?? person.image?.medium ?? undefined;
}

export async function getAnimeExtras(malId: number, revalidate = 3600): Promise<AnimeExtras | null> {
  let response: Response;
  try {
    response = await fetch(ANILIST_API_URL, {
      method: "POST",
      headers: ANILIST_HEADERS,
      body: JSON.stringify({ query: ANIME_EXTRAS_QUERY, variables: { malId } }),
      next: { revalidate },
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  const json = (await response.json()) as AniListExtrasResponse;
  const media = json.data?.Media;
  if (!media) return null;

  return {
    trailer: media.trailer?.site === "youtube" && media.trailer.id ? { id: media.trailer.id } : null,
    streamingLinks: (media.externalLinks ?? [])
      .filter((link) => link.type === "STREAMING")
      .map((link) => ({
        url: link.url,
        site: link.site,
        icon: link.icon ?? undefined,
        color: link.color ?? undefined,
        language: link.language ?? undefined,
      })),
    characters: (media.characters?.edges ?? []).map((edge) => ({
      id: edge.node.id,
      name: edge.node.name.full,
      imageUrl: personImage(edge.node),
      role: edge.role,
      voiceActors: (edge.voiceActors ?? []).map((va) => ({
        id: va.id,
        name: va.name.full,
        imageUrl: personImage(va),
      })),
    })),
    staff: (media.staff?.edges ?? []).map((edge) => ({
      id: edge.node.id,
      name: edge.node.name.full,
      imageUrl: personImage(edge.node),
      role: edge.role,
    })),
  };
}
