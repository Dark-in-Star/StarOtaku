import "server-only";
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

const NEXT_AIRING_EPISODE_QUERY = `
  query ($malId: Int) {
    Media(idMal: $malId, type: ANIME) {
      id
      nextAiringEpisode {
        airingAt
        timeUntilAiring
        episode
      }
    }
  }
`;

interface AniListNextAiringResponse {
  data?: {
    Media?: {
      id: number;
      nextAiringEpisode?: {
        airingAt: number;
        timeUntilAiring: number;
        episode: number;
      } | null;
    } | null;
  };
  errors?: { message: string }[];
}

/**
 * Looks up the next airing episode for a MAL anime id via AniList's GraphQL API.
 * MAL's own API only exposes a weekly broadcast slot (day + local time), not a
 * concrete next-episode date, so this is the only source for a real countdown.
 * Returns null for anime AniList doesn't know about, has finished airing, or on any
 * fetch/API error — this is a supplementary enhancement, never worth failing the page for.
 */
export async function getNextAiringEpisode(malId: number, revalidate = 300): Promise<NextAiringEpisode | null> {
  let response: Response;
  try {
    response = await fetch(ANILIST_API_URL, {
      method: "POST",
      headers: ANILIST_HEADERS,
      body: JSON.stringify({ query: NEXT_AIRING_EPISODE_QUERY, variables: { malId } }),
      next: { revalidate },
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  const json = (await response.json()) as AniListNextAiringResponse;
  const media = json.data?.Media;
  const next = media?.nextAiringEpisode;
  if (!media || !next) return null;

  return {
    episode: next.episode,
    airingAt: new Date(next.airingAt * 1000).toISOString(),
    timeUntilAiring: next.timeUntilAiring,
    anilistId: media.id,
  };
}

// One page holds 50 media; AniList caps perPage at 50. Callers with more ids than that
// page through rather than firing one request per id — AniList rate-limits per client.
const ANILIST_PAGE_SIZE = 50;

const AIRING_SCHEDULES_QUERY = `
  query ($malIds: [Int], $perPage: Int) {
    Page(perPage: $perPage) {
      media(idMal_in: $malIds, type: ANIME) {
        id
        idMal
        nextAiringEpisode {
          airingAt
          timeUntilAiring
          episode
        }
      }
    }
  }
`;

interface AniListSchedulePageResponse {
  data?: {
    Page?: {
      media?: {
        id: number;
        idMal: number | null;
        nextAiringEpisode?: {
          airingAt: number;
          timeUntilAiring: number;
          episode: number;
        } | null;
      }[] | null;
    } | null;
  };
  errors?: { message: string }[];
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
  const schedules = new Map<number, NextAiringEpisode>();
  const unique = [...new Set(malIds)];

  const pages: number[][] = [];
  for (let i = 0; i < unique.length; i += ANILIST_PAGE_SIZE) {
    pages.push(unique.slice(i, i + ANILIST_PAGE_SIZE));
  }

  await Promise.all(
    pages.map(async (ids) => {
      let response: Response;
      try {
        response = await fetch(ANILIST_API_URL, {
          method: "POST",
          headers: ANILIST_HEADERS,
          body: JSON.stringify({
            query: AIRING_SCHEDULES_QUERY,
            variables: { malIds: ids, perPage: ANILIST_PAGE_SIZE },
          }),
          next: { revalidate },
        });
      } catch {
        return;
      }

      if (!response.ok) return;

      const json = (await response.json()) as AniListSchedulePageResponse;
      for (const media of json.data?.Page?.media ?? []) {
        const next = media.nextAiringEpisode;
        if (!next || media.idMal === null) continue;
        schedules.set(media.idMal, {
          episode: next.episode,
          airingAt: new Date(next.airingAt * 1000).toISOString(),
          timeUntilAiring: next.timeUntilAiring,
          anilistId: media.id,
        });
      }
    }),
  );

  return schedules;
}

const ANILIST_ID_QUERY = `
  query ($malId: Int) {
    Media(idMal: $malId, type: ANIME) {
      id
    }
  }
`;

/**
 * Maps a MAL anime id to its AniList media id. Kept here so there is only ever one
 * AniList client in the codebase. Returns null when AniList doesn't know the title
 * or the request fails — callers treat a missing id as "no data", never as an error.
 */
export async function getAniListId(malId: number, revalidate = 86400): Promise<number | null> {
  let response: Response;
  try {
    response = await fetch(ANILIST_API_URL, {
      method: "POST",
      headers: ANILIST_HEADERS,
      body: JSON.stringify({ query: ANILIST_ID_QUERY, variables: { malId } }),
      next: { revalidate },
    });
  } catch (error) {
    // Logged rather than swallowed silently: when this returns null the caller can only
    // report a generic failure, so without this line there is no way to tell from the
    // deployed logs whether AniList or the stream source was the one that broke.
    console.error("AniList id lookup could not connect", { malId, error });
    return null;
  }

  if (!response.ok) {
    console.error("AniList id lookup failed", { malId, status: response.status });
    return null;
  }

  const json = (await response.json()) as AniListNextAiringResponse;
  const id = json.data?.Media?.id ?? null;
  if (id === null) {
    console.error("AniList returned no media for this id", { malId, errors: json.errors });
  }
  return id;
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
