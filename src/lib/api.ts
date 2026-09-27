import "server-only";
import { requireClientId } from "./malAuth";
import { getValidAccessToken } from "./session";
import type {
  AnimeNode,
  AnimeRankingType,
  AnimeSeason,
  AnimeSeasonSort,
  ListNode,
  MalListResponse,
  MangaNode,
  MangaRankingType,
  MalUser,
  MyListStatus,
  MyMangaListStatusNode,
  RankingNode,
} from "./types";

// Talks to MAL's API directly from Next.js server-side code (Server Components,
// Server Actions) — no separate backend to run or deploy. MAL_API_BASE_URL stays
// overridable so e2e tests can still point this at an in-memory mock (see
// e2e/mock-server.mjs) without touching a real MyAnimeList account.
const BASE_URL = process.env.MAL_API_BASE_URL ?? "https://api.myanimelist.net/v2";

// Backstop for a MAL connection that stalls outright: undici's own header timeout is five
// minutes, long enough that any page render touching MAL looks frozen.
const REQUEST_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export const RATE_LIMITED_STATUS = 429;

export function isRateLimited(error: unknown): boolean {
  return error instanceof ApiError && error.status === RATE_LIMITED_STATUS;
}

/** Thrown by authenticated calls when the visitor has no valid MAL session. */
export class AuthRequiredError extends Error {
  constructor() {
    super("Log in with MyAnimeList to see this.");
    this.name = "AuthRequiredError";
  }
}

type QueryValue = string | number | boolean | undefined;

function buildQuery(query?: Record<string, QueryValue>): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

interface FetchOptions {
  query?: Record<string, QueryValue>;
  revalidate?: number | false;
  cache?: RequestCache;
  token?: string;
}

// MAL's public endpoints (search, ranking, season, and detail without a caller
// token) authenticate with the app's own client ID instead of a user's token.
function authHeaders(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : { "X-MAL-CLIENT-ID": requireClientId() };
}

async function apiGet<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { query, revalidate = 300, cache, token } = options;
  const url = `${BASE_URL}${path}${buildQuery(query)}`;

  // Next's Data Cache keys on URL + fetch options only — request headers, including the
  // per-user Authorization one, are not part of the key. Since the list field sets ask for
  // my_list_status, a token-bearing response is personal and must never land in the shared
  // cache, or one visitor's list state would be served to the next.
  const perUser = token !== undefined;

  let response: Response;
  try {
    response = await fetch(url, {
      cache: perUser ? "no-store" : cache,
      next: cache || perUser ? undefined : { revalidate },
      headers: authHeaders(token),
      // MAL's edge answers a throttled client with a 307 to /error.json, and that endpoint
      // never responds — following it hangs the request until the timeout. The API itself
      // never redirects, so any 3xx is the throttle.
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ApiError(503, "Could not reach the MyAnimeList API.");
  }

  if ((response.status >= 300 && response.status < 400) || response.status === RATE_LIMITED_STATUS) {
    throw new ApiError(
      RATE_LIMITED_STATUS,
      "MyAnimeList is temporarily rate-limiting this app. Wait a few minutes, then try again.",
    );
  }

  if (!response.ok) {
    if (response.status === 404) throw new ApiError(404, "Not found");
    throw new ApiError(response.status, `Request to ${path} failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

/** For endpoints that must be authenticated: resolves a token or throws AuthRequiredError. */
async function requireToken(): Promise<string> {
  const token = await getValidAccessToken();
  if (!token) throw new AuthRequiredError();
  return token;
}

// my_list_status is only populated when a user token is attached (see the opportunistic
// token in searchAnime/getAnimeRanking/getSeasonalAnime) — for a logged-out visitor MAL
// simply omits it, which the cards read as "not on your list".
export const ANIME_LIST_FIELDS =
  "id,title,main_picture,mean,media_type,status,num_episodes,start_season,start_date,genres,rank,popularity,my_list_status";

export const ANIME_DETAIL_FIELDS =
  "id,title,main_picture,alternative_titles,start_date,end_date,synopsis,mean,rank,popularity," +
  "num_list_users,num_scoring_users,nsfw,media_type,status,genres,num_episodes,start_season," +
  "broadcast,source,average_episode_duration,rating,studios,background,related_anime,related_manga," +
  // Nested field lists: MAL returns only id/title/main_picture inside these sub-nodes
  // otherwise, and my_list_status on each is what lets the cards show list state.
  "recommendations{id,title,main_picture,mean,media_type,genres,my_list_status}," +
  "pictures,my_list_status";

export const MANGA_LIST_FIELDS =
  "id,title,main_picture,mean,media_type,status,num_volumes,num_chapters,start_date,genres,rank,popularity,my_list_status";

// The my-list cards also show an English title alongside the main (Japanese) one, which the
// ranking/search field sets above don't request.
export const MY_ANIME_LIST_FIELDS = `${ANIME_LIST_FIELDS},alternative_titles`;
export const MY_MANGA_LIST_FIELDS = `${MANGA_LIST_FIELDS},alternative_titles`;

// Just enough for a search-suggestion row; both media share it since each endpoint ignores
// fields it doesn't have.
export const SEARCH_SUGGESTION_FIELDS = "id,title,main_picture,mean,media_type,status,start_season,start_date,genres,my_list_status";

export const MANGA_DETAIL_FIELDS =
  "id,title,main_picture,alternative_titles,start_date,end_date,synopsis,mean,rank,popularity," +
  "num_list_users,num_scoring_users,nsfw,media_type,status,genres,num_volumes,num_chapters,authors{first_name,last_name}," +
  "background,related_anime,related_manga," +
  "recommendations{id,title,main_picture,mean,media_type,genres,my_list_status}," +
  "pictures,my_list_status";

// MAL answers a q under 3 characters with 400 "invalid q", leaving short titles like "86"
// or "K" unsearchable. It ignores punctuation when matching, so padding with dots returns
// the same results the bare query would (verified live: "86." finds 86, "k.." finds K-On!).
const MAL_MIN_QUERY_LENGTH = 3;

function malSearchQuery(q: string): string {
  return q.padEnd(MAL_MIN_QUERY_LENGTH, ".");
}

// MAL's client-ID-only (no user token) mode appears to always exclude NSFW-flagged
// content (verified: searching a well-known Hentai title returns zero results with just
// a client ID, even though the title and its genre both exist on MAL). Opportunistically
// attaching a logged-in visitor's own token — same as getAnime/getManga already do for
// detail pages — is the only lever this app has to surface it, and still depends on that
// visitor's own MAL account having adult-content display enabled.
export async function searchAnime(q: string, limit = 24, fields = ANIME_LIST_FIELDS, offset = 0) {
  const token = (await getValidAccessToken()) ?? undefined;
  return apiGet<MalListResponse<{ node: AnimeNode }>>("/anime", {
    query: { q: malSearchQuery(q), limit, offset, fields },
    token,
  });
}

export async function getAnime(id: number, fields = ANIME_DETAIL_FIELDS) {
  // Optional auth: logged-in visitors get my_list_status back too.
  const token = (await getValidAccessToken()) ?? undefined;
  return apiGet<AnimeNode>(`/anime/${id}`, { query: { fields }, cache: "no-store", token });
}

// Relations effectively never change once a title is on MAL, so this narrow field set is
// cached hard (a day) — a sequel scan re-reads the same anime across runs and would
// otherwise burn a rate-limited request per list entry every time.
export const ANIME_RELATION_FIELDS =
  "id,title,related_anime{id,title,main_picture,mean,media_type,status,num_episodes,start_season,genres}";

export async function getAnimeRelations(id: number) {
  return apiGet<AnimeNode>(`/anime/${id}`, {
    query: { fields: ANIME_RELATION_FIELDS },
    revalidate: 86_400,
  });
}

export async function getAnimeRanking(rankingType: AnimeRankingType, limit = 24, fields = ANIME_LIST_FIELDS, offset = 0) {
  const token = (await getValidAccessToken()) ?? undefined;
  return apiGet<MalListResponse<RankingNode<AnimeNode>>>("/anime/ranking", {
    query: { ranking_type: rankingType, limit, offset, fields },
    token,
  });
}

export async function getSeasonalAnime(
  year: number,
  season: AnimeSeason,
  sort: AnimeSeasonSort = "anime_num_list_users",
  limit = 24,
  fields = ANIME_LIST_FIELDS,
  offset = 0,
) {
  const token = (await getValidAccessToken()) ?? undefined;
  return apiGet<MalListResponse<{ node: AnimeNode }>>(`/anime/season/${year}/${season}`, {
    query: { sort, limit, offset, fields },
    token,
  });
}

export async function searchManga(q: string, limit = 24, fields = MANGA_LIST_FIELDS, offset = 0) {
  const token = (await getValidAccessToken()) ?? undefined;
  return apiGet<MalListResponse<{ node: MangaNode }>>("/manga", {
    query: { q: malSearchQuery(q), limit, offset, fields },
    token,
  });
}

export async function getManga(id: number, fields = MANGA_DETAIL_FIELDS) {
  const token = (await getValidAccessToken()) ?? undefined;
  return apiGet<MangaNode>(`/manga/${id}`, { query: { fields }, cache: "no-store", token });
}

export async function getMangaRanking(rankingType: MangaRankingType, limit = 24, fields = MANGA_LIST_FIELDS, offset = 0) {
  const token = (await getValidAccessToken()) ?? undefined;
  return apiGet<MalListResponse<RankingNode<MangaNode>>>("/manga/ranking", {
    query: { ranking_type: rankingType, limit, offset, fields },
    token,
  });
}

// MAL caps a single list page at 1000 entries and hands back paging.next for the rest.
// Requesting limit=1000 and stopping there silently truncates any longer list, which is
// invisible on the list screens but actively wrong for anything that reasons about the
// *whole* list (the sequel scan treated missing entries as "not on your list").
const LIST_PAGE_SIZE = 1000;

// A guard against an unbounded loop if MAL ever returns a self-referential cursor.
const MAX_LIST_PAGES = 20;

async function fetchAllListPages<T>(path: string, fields: string, token: string): Promise<MalListResponse<T>> {
  const data: T[] = [];
  let offset = 0;

  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const chunk = await apiGet<MalListResponse<T>>(path, {
      // nsfw=true is what makes this the user's *whole* list. MAL silently omits
      // nsfw-flagged ("gray"/"black") entries otherwise — verified: a list reporting 366
      // entries by default returns 399 with this on. Relations and detail lookups are not
      // filtered the same way, so without it the sequel scan re-suggested R-rated titles
      // the user had already completed, and list counts under-reported.
      query: { fields: `${fields},list_status`, limit: LIST_PAGE_SIZE, offset, nsfw: true },
      cache: "no-store",
      token,
    });

    data.push(...chunk.data);
    if (!chunk.paging?.next || chunk.data.length === 0) break;
    offset += chunk.data.length;
  }

  return { data };
}

export async function getAnimeList(fields = MY_ANIME_LIST_FIELDS) {
  const token = await requireToken();
  return fetchAllListPages<ListNode<AnimeNode, MyListStatus>>("/users/@me/animelist", fields, token);
}

export async function getMangaList(fields = MY_MANGA_LIST_FIELDS) {
  const token = await requireToken();
  return fetchAllListPages<ListNode<MangaNode, MyMangaListStatusNode>>("/users/@me/mangalist", fields, token);
}

export async function getMyUserInfo(fields = "anime_statistics") {
  const token = await requireToken();
  return apiGet<MalUser>("/users/@me", { query: { fields }, cache: "no-store", token });
}

export { BASE_URL };
