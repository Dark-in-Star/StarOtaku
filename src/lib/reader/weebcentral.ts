import "server-only";
import { normalizeTitle, parseChapterNumber, titlesOverlap } from "./chapters";
import { BROWSER_USER_AGENT, decodeHtmlEntities, fetchSource } from "./http";
import type { ReaderChapter, ReaderPage, ReaderTarget, SourceOutcome } from "./types";

// WeebCentral has no API; these are the same htmx fragments its own pages request, which
// return small HTML documents rather than full pages.
const BASE_URL = "https://weebcentral.com";

const HEADERS = { "User-Agent": BROWSER_USER_AGENT, Accept: "text/html" };

const SEARCH_REVALIDATE = 86_400;
const SERIES_REVALIDATE = 86_400;
const CHAPTER_LIST_REVALIDATE = 1_800;
const PAGES_REVALIDATE = 86_400;

// Each candidate costs a series-page fetch to verify, so only the top few search hits are
// checked; a right answer below that is a search-ranking problem no amount of paging fixes.
const MAX_TITLES_TRIED = 3;
const MAX_CANDIDATES_PER_SEARCH = 3;

export interface WeebCentralSearchHit {
  seriesId: string;
  title: string;
}

export interface WeebCentralSeries {
  seriesId: string;
  title: string;
  anilistId: number | null;
  associatedNames: string[];
  adult: boolean;
}

function html(url: string, revalidate: number) {
  return fetchSource(url, { headers: HEADERS, revalidate, readerFallback: true, readerFormat: "html" });
}

export function parseSearchResults(body: string): WeebCentralSearchHit[] {
  const hits: WeebCentralSearchHit[] = [];
  const seen = new Set<string>();
  for (const block of body.split(/<article class="bg-base-300/).slice(1)) {
    const link = /series\/([0-9A-Z]{26})\//.exec(block);
    const alt = /alt="([^"]*?) cover"/.exec(block);
    if (!link || seen.has(link[1])) continue;
    seen.add(link[1]);
    hits.push({ seriesId: link[1], title: alt ? decodeHtmlEntities(alt[1]) : "" });
  }
  return hits;
}

export function parseSeriesPage(seriesId: string, body: string): WeebCentralSeries {
  const title = /<h1[^>]*>([^<]+)<\/h1>/.exec(body)?.[1] ?? "";
  const anilist = /anilist\.co\/manga\/(\d+)/.exec(body);
  const namesBlock = /Associated Name\(s\)<\/strong>\s*<ul[^>]*>([\s\S]*?)<\/ul>/.exec(body)?.[1] ?? "";
  const associatedNames = [...namesBlock.matchAll(/<li>([^<]+)<\/li>/g)].map((m) => decodeHtmlEntities(m[1].trim()));
  const adult = /Adult Content:\s*<\/strong>\s*<a[^>]*>\s*Yes/i.test(body);
  return {
    seriesId,
    title: decodeHtmlEntities(title.trim()),
    anilistId: anilist ? Number(anilist[1]) : null,
    associatedNames,
    adult,
  };
}

export function parseChapterList(body: string): ReaderChapter[] {
  const chapters: ReaderChapter[] = [];
  const pattern =
    /href="(?:https:\/\/weebcentral\.com)?\/chapters\/([0-9A-Z]{26})"[\s\S]*?<span class="grow[^"]*">\s*<span[^>]*>([^<]+)<\/span>[\s\S]*?<time[^>]*datetime="([^"]+)"/g;
  for (const match of body.matchAll(pattern)) {
    const label = decodeHtmlEntities(match[2].trim());
    chapters.push({
      source: "weebcentral",
      id: match[1],
      number: parseChapterNumber(label),
      label,
      publishedAt: match[3],
    });
  }
  // The list is newest-first; the reader and dedupe logic both expect reading order.
  return chapters.reverse();
}

export function parseChapterImages(body: string): ReaderPage[] {
  return [...body.matchAll(/<img\s+src="(https?:\/\/[^"]+)"[^>]*alt="Page \d+"/g)].map((m) => ({ url: m[1] }));
}

export async function searchWeebCentral(text: string): Promise<WeebCentralSearchHit[]> {
  const params = new URLSearchParams({
    limit: "8",
    offset: "0",
    text,
    sort: "Best Match",
    order: "Descending",
    official: "Any",
    anime: "Any",
    adult: "Any",
    display_mode: "Full Display",
  });
  const result = await html(`${BASE_URL}/search/data?${params}`, SEARCH_REVALIDATE);
  return result.status === "ok" ? parseSearchResults(result.body) : [];
}

export async function getWeebCentralSeries(seriesId: string): Promise<WeebCentralSeries | null> {
  const result = await html(`${BASE_URL}/series/${seriesId}`, SERIES_REVALIDATE);
  return result.status === "ok" ? parseSeriesPage(seriesId, result.body) : null;
}

export async function getWeebCentralChapters(seriesId: string): Promise<ReaderChapter[]> {
  const result = await html(`${BASE_URL}/series/${seriesId}/full-chapter-list`, CHAPTER_LIST_REVALIDATE);
  return result.status === "ok" ? parseChapterList(result.body) : [];
}

export async function getWeebCentralPages(chapterId: string): Promise<ReaderPage[]> {
  if (!/^[0-9A-Z]{26}$/.test(chapterId)) return [];
  const url = `${BASE_URL}/chapters/${chapterId}/images?is_prev=False&current_page=1&reading_style=long_strip`;
  const result = await html(url, PAGES_REVALIDATE);
  return result.status === "ok" ? parseChapterImages(result.body) : [];
}

/**
 * A series is accepted on its AniList id when both sides have one — that is exact. Only
 * when AniList doesn't know the MAL entry does a title match stand in, and even then a
 * series whose AniList id points somewhere else is rejected rather than trusted on title.
 */
export async function findOnWeebCentral(target: ReaderTarget, anilistId: number | null): Promise<SourceOutcome> {
  try {
    const checked = new Set<string>();
    // Its search matches nothing when the query has punctuation in it (verified: "Zombie-Loan"
    // finds nothing, "Zombie Loan" finds the series), so queries go in normalized.
    const queries = [...new Set(target.titles.map(normalizeTitle).filter(Boolean))];
    for (const query of queries.slice(0, MAX_TITLES_TRIED)) {
      const hits = await searchWeebCentral(query);
      for (const hit of hits.slice(0, MAX_CANDIDATES_PER_SEARCH)) {
        if (checked.has(hit.seriesId)) continue;
        checked.add(hit.seriesId);

        const series = await getWeebCentralSeries(hit.seriesId);
        if (!series) continue;

        const byAniList = anilistId !== null && series.anilistId === anilistId;
        const byTitle =
          (anilistId === null || series.anilistId === null) &&
          titlesOverlap(target.titles, [series.title, hit.title, ...series.associatedNames]);
        if (!byAniList && !byTitle) continue;

        const chapters = await getWeebCentralChapters(series.seriesId);
        return {
          status: "found",
          series: {
            source: "weebcentral",
            seriesId: series.seriesId,
            title: series.title || hit.title,
            matchedBy: byAniList ? "anilist-id" : "title",
            chapters,
          },
        };
      }
    }
    return { status: "not-found" };
  } catch (error) {
    return { status: "error", message: String(error) };
  }
}
