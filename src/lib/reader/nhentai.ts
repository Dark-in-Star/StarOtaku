import "server-only";
import { normalizeTitle } from "./chapters";
import { APP_USER_AGENT, fetchSourceJson } from "./http";
import type { ReaderChapter, ReaderPage, ReaderTarget, SourceOutcome } from "./types";

// nhentai's documented v2 API (OpenAPI at /api/v2/openapi.json). Anonymous access is
// rate-limited per IP — 10 searches and 20 gallery reads a minute — and an API key doubles
// that, so one is sent when configured.
const API_URL = "https://nhentai.net/api/v2";

const FALLBACK_IMAGE_SERVERS = ["https://i1.nhentai.net", "https://i2.nhentai.net", "https://i3.nhentai.net"];
const FALLBACK_THUMB_SERVERS = ["https://t1.nhentai.net", "https://t2.nhentai.net", "https://t3.nhentai.net"];

// A gallery never changes once uploaded, so it can be cached far longer than anything else.
const GALLERY_REVALIDATE = 604_800;
const SEARCH_REVALIDATE = 3_600;
const CDN_REVALIDATE = 86_400;

function headers(): Record<string, string> {
  const key = process.env.NHENTAI_API_KEY;
  return {
    "User-Agent": APP_USER_AGENT,
    Accept: "application/json",
    ...(key ? { Authorization: `Key ${key}` } : {}),
  };
}

function json<T>(url: string, revalidate: number) {
  return fetchSourceJson<T>(url, { headers: headers(), revalidate, readerFallback: true });
}

export interface NhentaiSearchHit {
  id: number;
  media_id: string;
  english_title: string;
  japanese_title: string | null;
  thumbnail: string;
  thumbnail_width: number;
  thumbnail_height: number;
  num_pages: number;
  num_favorites: number;
}

interface NhentaiSearchResponse {
  result: NhentaiSearchHit[];
  num_pages: number;
  total: number;
}

export interface NhentaiTag {
  id: number;
  type: string;
  name: string;
}

export interface NhentaiGallery {
  id: number;
  media_id: string;
  title: { english: string; japanese: string | null; pretty: string };
  cover: { path: string; width: number; height: number };
  thumbnail: { path: string; width: number; height: number };
  upload_date: number;
  tags: NhentaiTag[];
  num_pages: number;
  num_favorites: number;
  pages: { number: number; path: string; width: number; height: number; thumbnail: string }[];
}

interface NhentaiCdn {
  image_servers: string[];
  thumb_servers: string[];
}

export type NhentaiSort = "date" | "popular" | "popular-today" | "popular-week" | "popular-month";

async function cdnServers(): Promise<NhentaiCdn> {
  try {
    const cdn = await json<NhentaiCdn>(`${API_URL}/cdn`, CDN_REVALIDATE);
    if (cdn?.image_servers.length && cdn.thumb_servers.length) return cdn;
  } catch {
    // A stale server list is harmless; the hardcoded one is what the site served at writing.
  }
  return { image_servers: FALLBACK_IMAGE_SERVERS, thumb_servers: FALLBACK_THUMB_SERVERS };
}

// Spreading a gallery's pages over one server per gallery (not per page) keeps a single
// read on one connection while still distributing load across galleries.
function pick(servers: string[], id: number): string {
  return servers[id % servers.length];
}

export async function nhentaiThumbUrl(hit: { id: number; thumbnail: string }): Promise<string> {
  const { thumb_servers } = await cdnServers();
  return `${pick(thumb_servers, hit.id)}/${hit.thumbnail}`;
}

export async function searchNhentai(query: string, page = 1, sort: NhentaiSort = "popular"): Promise<NhentaiSearchResponse> {
  const params = new URLSearchParams({ query, page: String(page), sort });
  const result = await json<NhentaiSearchResponse>(`${API_URL}/search?${params}`, SEARCH_REVALIDATE);
  return result ?? { result: [], num_pages: 0, total: 0 };
}

export async function getNhentaiGallery(id: number): Promise<NhentaiGallery | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  return json<NhentaiGallery>(`${API_URL}/galleries/${id}`, GALLERY_REVALIDATE);
}

export async function getNhentaiPages(id: number): Promise<ReaderPage[]> {
  const gallery = await getNhentaiGallery(id);
  if (!gallery) return [];
  const { image_servers } = await cdnServers();
  const server = pick(image_servers, gallery.id);
  return gallery.pages.map((page) => ({ url: `${server}/${page.path}`, width: page.width, height: page.height }));
}

/**
 * The bare work title out of a gallery name like
 * "(C92) [Circle (Artist)] Title | English Title [English] [Group]": bracketed groups are
 * event, circle, language and scanlator tags, never part of the title.
 */
export function galleryTitleVariants(englishTitle: string, japaneseTitle?: string | null): string[] {
  const strip = (title: string) =>
    title
      .replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, " ")
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean);
  return [...strip(englishTitle), ...(japaneseTitle ? strip(japaneseTitle) : [])];
}

/**
 * Best effort only: nhentai has no MAL ids, so an adult MAL entry is matched on its exact
 * title against the gallery's bare title. Short, generic titles would false-positive, so
 * they are not attempted at all.
 */
export async function findOnNhentai(target: ReaderTarget): Promise<SourceOutcome> {
  const MIN_TITLE_LENGTH = 6;
  try {
    const wanted = new Set(target.titles.map(normalizeTitle).filter((t) => t.length >= MIN_TITLE_LENGTH));
    for (const title of [...wanted].slice(0, 2)) {
      const { result } = await searchNhentai(`"${title}"`, 1, "popular");
      const matches = result.filter((hit) =>
        galleryTitleVariants(hit.english_title, hit.japanese_title).some((variant) => wanted.has(normalizeTitle(variant))),
      );
      if (matches.length === 0) continue;

      // English releases first; within a language, the most favourited is almost always
      // the complete, cleanest upload.
      const english = matches.filter((hit) => /\[english\]/i.test(hit.english_title));
      const ranked = (english.length ? english : matches).sort((a, b) => b.num_favorites - a.num_favorites);
      const chapters: ReaderChapter[] = ranked.slice(0, 10).map((hit) => ({
        source: "nhentai",
        id: String(hit.id),
        number: null,
        label: hit.english_title,
      }));
      return {
        status: "found",
        series: { source: "nhentai", seriesId: String(ranked[0].id), title: ranked[0].english_title, matchedBy: "title", chapters },
      };
    }
    return { status: "not-found" };
  } catch (error) {
    return { status: "error", message: String(error) };
  }
}
