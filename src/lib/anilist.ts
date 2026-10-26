import "server-only";
import { type AniListPart, combinedSchedule, resolvePartEpisode, startKey } from "./anilistParts";
import type { AnimeExtras, NextAiringEpisode } from "./types";
import { base64ToString } from "./utils";

const ANILIST_API_URL = "https://graphql.anilist.co";

// AniList sits behind Cloudflare and rate-limits per client. Node's fetch sends no
// User-Agent, which Cloudflare treats as a bot signal from datacentre IPs — the reason
// these lookups can succeed locally and fail once deployed.
const ANILIST_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
  "User-Agent": "Starotaku/1.0 (+https://starotaku.vercel.app)",
} as const;

// AniList's 30 req/min budget is counted per egress IP, and a Worker egresses from an
// address pool it shares with every other tenant — so the budget can already be spent
// before this app sends anything, and the host is Cloudflare calling Cloudflare. The
// reader used for the stream sources is no help here: it downgrades POST to GET, and
// AniList answers that with `Use POST request to access graphql subdomain`. So this
// fallback has to be a proxy that forwards the method and body intact.
//
// Base64 for the same reason as STREAM_READER_URL: it keeps a scrapeable upstream URL out
// of plain sight in the deployment config. Unset means direct-only, which is correct for
// local development and for any host whose own IP is not rate-limited into the ground.
const ANILIST_PROXY_URL = base64ToString(process.env.ANILIST_PROXY_URL);

const ANILIST_TIMEOUT_MS = 10_000;

/**
 * One transport for every AniList query. Direct first; on a rate-limit or block, retried
 * once through the proxy, which egresses from an address AniList counts separately.
 *
 * Returns the `Response` rather than parsed JSON so each caller keeps its own body typing,
 * and throws nothing — a caller that cannot reach AniList gets null and degrades, exactly
 * as before.
 */
async function anilistFetch(body: string, revalidate: number): Promise<Response | null> {
  const send = (url: string) =>
    fetch(url, {
      method: "POST",
      headers: ANILIST_HEADERS,
      body,
      // No `cache: "force-cache"` here: workerd rejects that mode outright with
      // `TypeError: Unsupported cache mode: force-cache`, which aborts the request before
      // it is sent. A positive `next.revalidate` already marks the fetch cacheable and
      // overrides the origin's `no-store`, so the Data Cache engages without it.
      next: { revalidate },
      signal: AbortSignal.timeout(ANILIST_TIMEOUT_MS),
    });

  let direct: Response | null = null;
  try {
    direct = await send(ANILIST_API_URL);
    if (direct.ok) return direct;
  } catch (error) {
    console.warn("AniList direct fetch failed", { error: String(error) });
  }

  // 429 is the shared-egress case; 403/503 is Cloudflare challenging the caller. Anything
  // else is AniList answering for real (a bad query, say), so retrying through a different
  // address would only burn the proxy's budget on the same rejection.
  const worthRetrying = !direct || direct.status === 429 || direct.status === 403 || direct.status === 503;
  if (!ANILIST_PROXY_URL || !worthRetrying) return direct;

  try {
    const proxied = await send(`${ANILIST_PROXY_URL}${ANILIST_API_URL}`);
    if (proxied.ok) return proxied;
    console.error("AniList proxy fallback rejected", { status: proxied.status });
    return proxied;
  } catch (error) {
    console.error("AniList proxy fallback failed", { error: String(error) });
    return direct;
  }
}

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
  | { status: "failed"; httpStatus: number; retryAfter?: string; detail?: string };

async function getAniListParts(malId: number, revalidate: number): Promise<PartsLookup> {
  const response = await anilistFetch(
    JSON.stringify({ query: PARTS_QUERY, variables: { malId } }),
    revalidate,
  );
  if (!response) return { status: "unreachable", error: new Error("AniList could not be reached.") };

  if (!response.ok) {
    return {
      status: "failed",
      httpStatus: response.status,
      // AniList rate-limits per egress IP. On a shared-egress host that budget is spent by
      // other tenants too, so a 429 here is about the address, not this app's own traffic.
      retryAfter: response.headers.get("retry-after") ?? undefined,
      detail: (await response.text().catch(() => "")).slice(0, 200) || undefined,
    };
  }

  const json = (await response.json()) as AniListPartsResponse;
  // A GraphQL error arrives as HTTP 200 with `data: null`, which would otherwise read as
  // "this title has no parts" and reach the user as a missing source.
  if (json.errors?.length) {
    return {
      status: "failed",
      httpStatus: response.status,
      detail: json.errors.map((error) => error.message).join("; ").slice(0, 200),
    };
  }

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
  if (lookup.status !== "ok") {
    // Logged because this is otherwise the quietest AniList path in the app: a countdown
    // that never appears looks identical to a title that simply is not airing.
    console.error("AniList schedule lookup failed", { malId, lookup });
    return null;
  }
  return combinedSchedule(lookup.parts);
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
    const response = await anilistFetch(
      JSON.stringify({
        query: AIRING_SCHEDULES_QUERY,
        variables: { malIds: ids, page, perPage: ANILIST_PAGE_SIZE },
      }),
      revalidate,
    );

    if (!response?.ok) return media;

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
    console.error("AniList id lookup failed", {
      malId,
      status: lookup.httpStatus,
      retryAfter: lookup.retryAfter,
      detail: lookup.detail,
    });
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
  const response = await anilistFetch(
    JSON.stringify({ query: ANIME_EXTRAS_QUERY, variables: { malId } }),
    revalidate,
  );

  if (!response?.ok) {
    console.error("AniList extras lookup failed", { malId, status: response?.status });
    return null;
  }

  const json = (await response.json()) as AniListExtrasResponse;
  const media = json.data?.Media;
  if (!media) {
    console.error("AniList extras returned no media", { malId, errors: json.errors?.map((e) => e.message) });
    return null;
  }

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

const MANGA_ID_QUERY = `
  query ($malId: Int) {
    Media(idMal: $malId, type: MANGA) { id }
  }
`;

/**
 * The AniList id for a MAL manga — the exact key the manga reader matches WeebCentral
 * series on. Null when AniList doesn't know the title or can't be reached; the reader then
 * falls back to a stricter title match rather than failing.
 */
export async function getAniListMangaId(malId: number, revalidate = 604_800): Promise<number | null> {
  const response = await anilistFetch(
    JSON.stringify({ query: MANGA_ID_QUERY, variables: { malId } }),
    revalidate,
  );
  if (!response?.ok) return null;
  const json = (await response.json()) as { data?: { Media?: { id: number } | null } };
  return json.data?.Media?.id ?? null;
}
