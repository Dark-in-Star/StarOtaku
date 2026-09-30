import "server-only";
import { dedupeChapters } from "./chapters";
import { APP_USER_AGENT, fetchSourceJson } from "./http";
import type { ReaderChapter, ReaderPage, ReaderTarget, SourceOutcome } from "./types";

const API_URL = "https://api.mangadex.org";

// The only official image origin with stable URLs. MangaDex@Home node URLs carry a token
// that expires within minutes, which would make every proxied page uncacheable.
export const MANGADEX_UPLOADS_URL = "https://uploads.mangadex.org";

const HEADERS = { "User-Agent": APP_USER_AGENT, Accept: "application/json" };

const CONTENT_RATINGS = ["safe", "suggestive", "erotica", "pornographic"];

const SEARCH_REVALIDATE = 86_400;
const FEED_REVALIDATE = 1_800;
// The at-home endpoint is limited to 40 calls a minute per IP; a chapter's file list only
// changes if the chapter is re-uploaded, so a long cache keeps readers well under it.
const AT_HOME_REVALIDATE = 86_400;

const FEED_PAGE_SIZE = 500;
// MangaDex rejects offset + limit past 10,000.
const FEED_MAX_OFFSET = 10_000 - FEED_PAGE_SIZE;
const MAX_TITLES_TRIED = 4;

interface MdRelationship {
  id: string;
  type: string;
  attributes?: { name?: string };
}

interface MdManga {
  id: string;
  attributes: {
    title: Record<string, string>;
    altTitles?: Record<string, string>[];
    links?: Record<string, string> | null;
  };
}

interface MdChapter {
  id: string;
  attributes: {
    chapter: string | null;
    title: string | null;
    externalUrl: string | null;
    isUnavailable?: boolean;
    pages: number;
    publishAt?: string;
  };
  relationships: MdRelationship[];
}

interface MdCollection<T> {
  result: string;
  data: T[];
  total: number;
}

interface MdAtHome {
  result: string;
  chapter?: { hash: string; data: string[]; dataSaver: string[] };
}

function json<T>(url: string, revalidate: number) {
  return fetchSourceJson<T>(url, { headers: HEADERS, revalidate, readerFallback: false });
}

function primaryTitle(manga: MdManga): string {
  const titles = manga.attributes.title;
  return titles.en ?? titles["ja-ro"] ?? Object.values(titles)[0] ?? "";
}

export function toReaderChapter(chapter: MdChapter): ReaderChapter {
  const { chapter: number, title, externalUrl, publishAt } = chapter.attributes;
  const group = chapter.relationships.find((r) => r.type === "scanlation_group")?.attributes?.name;
  return {
    source: "mangadex",
    id: chapter.id,
    number: number !== null && number !== "" && !Number.isNaN(Number(number)) ? Number(number) : null,
    label: number ? `Chapter ${number}` : "Oneshot",
    title: title || undefined,
    publishedAt: publishAt,
    group,
    externalUrl: externalUrl ?? undefined,
  };
}

// A chapter with neither pages nor a link is a placeholder MangaDex keeps after a takedown.
function isUsable(chapter: MdChapter): boolean {
  if (chapter.attributes.isUnavailable) return false;
  return chapter.attributes.pages > 0 || Boolean(chapter.attributes.externalUrl);
}

export async function findMangaDexSeries(target: ReaderTarget): Promise<MdManga | null> {
  const wanted = String(target.malId);
  for (const title of target.titles.slice(0, MAX_TITLES_TRIED)) {
    const params = new URLSearchParams({ title, limit: "10" });
    for (const rating of CONTENT_RATINGS) params.append("contentRating[]", rating);
    const result = await json<MdCollection<MdManga>>(`${API_URL}/manga?${params}`, SEARCH_REVALIDATE);
    // MAL ids are the match key, never titles: MangaDex has many same-named entries
    // (colored editions, doujinshi, anthologies) that a title comparison would accept.
    const match = result?.data.find((manga) => manga.attributes.links?.mal === wanted);
    if (match) return match;
  }
  return null;
}

export async function getMangaDexChapters(mangaId: string): Promise<ReaderChapter[]> {
  const all: MdChapter[] = [];
  for (let offset = 0; offset <= FEED_MAX_OFFSET; offset += FEED_PAGE_SIZE) {
    const params = new URLSearchParams({
      limit: String(FEED_PAGE_SIZE),
      offset: String(offset),
      "translatedLanguage[]": "en",
      "order[chapter]": "asc",
      "includes[]": "scanlation_group",
      // Deliberately no includeExternalUrl: despite the name it is a filter, and "1" returns
      // *only* link-out chapters (verified — 80 readable chapters became 0). Omitted, the
      // feed returns both kinds.
    });
    for (const rating of CONTENT_RATINGS) params.append("contentRating[]", rating);
    const page = await json<MdCollection<MdChapter>>(`${API_URL}/manga/${mangaId}/feed?${params}`, FEED_REVALIDATE);
    if (!page) break;
    all.push(...page.data);
    if (offset + FEED_PAGE_SIZE >= page.total) break;
  }
  return dedupeChapters(all.filter(isUsable).map(toReaderChapter));
}

export function mangaDexProxyPath(hash: string, file: string): string {
  return `/api/reader/mangadex/data-saver/${hash}/${file}`;
}

/**
 * Page URLs point at this app's own proxy, never at MangaDex: it answers any request with
 * a foreign Referer with a placeholder image (verified — a 59 KB JPEG instead of the page),
 * and its rules require proxying. Data-saver files are used to keep proxy egress small.
 */
export async function getMangaDexPages(chapterId: string): Promise<ReaderPage[]> {
  if (!/^[0-9a-f-]{36}$/.test(chapterId)) return [];
  const atHome = await json<MdAtHome>(`${API_URL}/at-home/server/${chapterId}`, AT_HOME_REVALIDATE);
  if (!atHome?.chapter) return [];
  const { hash, dataSaver } = atHome.chapter;
  return dataSaver.map((file) => ({ url: mangaDexProxyPath(hash, file) }));
}

export async function findOnMangaDex(target: ReaderTarget): Promise<SourceOutcome> {
  try {
    const manga = await findMangaDexSeries(target);
    if (!manga) return { status: "not-found" };
    const chapters = await getMangaDexChapters(manga.id);
    return {
      status: "found",
      series: { source: "mangadex", seriesId: manga.id, title: primaryTitle(manga), matchedBy: "mal-id", chapters },
    };
  } catch (error) {
    return { status: "error", message: String(error) };
  }
}
