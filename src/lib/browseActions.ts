"use server";

import {
  SEARCH_SUGGESTION_FIELDS,
  getAnimeRanking,
  getMangaRanking,
  getSeasonalAnime,
  isRateLimited,
  searchAnime,
  searchManga,
} from "./api";
import { toAnimeGridItem, toMangaGridItem, type GridItem } from "./gridItems";
import { getValidAccessToken } from "./session";
import type { AnimeNode, AnimeRankingType, AnimeSeason, AnimeStatus, MangaNode, MangaRankingType, MangaStatus } from "./types";

export interface LoadMoreResult {
  items: GridItem[];
  hasMore: boolean;
}

export async function loadMoreAnimeRanking(type: AnimeRankingType, offset: number, limit: number): Promise<LoadMoreResult> {
  const result = await getAnimeRanking(type, limit, undefined, offset);
  return {
    items: result.data.map(({ node, ranking }) => toAnimeGridItem(node, ranking.rank)),
    hasMore: Boolean(result.paging?.next),
  };
}

export async function loadMoreMangaRanking(type: MangaRankingType, offset: number, limit: number): Promise<LoadMoreResult> {
  const result = await getMangaRanking(type, limit, undefined, offset);
  return {
    items: result.data.map(({ node, ranking }) => toMangaGridItem(node, ranking.rank)),
    hasMore: Boolean(result.paging?.next),
  };
}

export async function loadMoreAnimeSearch(q: string, offset: number, limit: number): Promise<LoadMoreResult> {
  const result = await searchAnime(q, limit, undefined, offset);
  return {
    items: result.data.map(({ node }) => toAnimeGridItem(node)),
    hasMore: Boolean(result.paging?.next),
  };
}

export async function loadMoreMangaSearch(q: string, offset: number, limit: number): Promise<LoadMoreResult> {
  const result = await searchManga(q, limit, undefined, offset);
  return {
    items: result.data.map(({ node }) => toMangaGridItem(node)),
    hasMore: Boolean(result.paging?.next),
  };
}

export async function loadMoreSeasonalAnime(
  year: number,
  season: AnimeSeason,
  offset: number,
  limit: number,
): Promise<LoadMoreResult> {
  const result = await getSeasonalAnime(year, season, "anime_num_list_users", limit, undefined, offset);
  return {
    items: result.data.map(({ node }) => toAnimeGridItem(node)),
    hasMore: Boolean(result.paging?.next),
  };
}

const SUGGESTIONS_PER_MEDIA = 5;

export interface SearchSuggestion extends GridItem {
  media: "anime" | "manga";
  status?: AnimeStatus | MangaStatus;
  year?: number;
}

export type SearchSuggestionsResult =
  | { ok: true; anime: SearchSuggestion[]; manga: SearchSuggestion[]; signedIn: boolean }
  | { ok: false; message: string };

function toSuggestion(media: "anime" | "manga", item: GridItem, node: AnimeNode | MangaNode): SearchSuggestion {
  const startYear = node.start_date ? Number(node.start_date.slice(0, 4)) : undefined;
  return {
    ...item,
    // Rows show a ~44px thumbnail, so the medium poster is plenty.
    imageUrl: node.main_picture?.medium ?? item.imageUrl,
    media,
    status: node.status,
    year: ("start_season" in node ? node.start_season?.year : undefined) ?? startYear,
  };
}

export async function searchSuggestions(q: string): Promise<SearchSuggestionsResult> {
  const query = q.trim();
  if (!query) return { ok: true, anime: [], manga: [], signedIn: false };

  try {
    // Resolved up front so an expiring token is refreshed once, not raced by both searches.
    const signedIn = (await getValidAccessToken()) !== null;
    const [anime, manga] = await Promise.all([
      searchAnime(query, SUGGESTIONS_PER_MEDIA, SEARCH_SUGGESTION_FIELDS),
      searchManga(query, SUGGESTIONS_PER_MEDIA, SEARCH_SUGGESTION_FIELDS),
    ]);
    return {
      ok: true,
      signedIn,
      anime: anime.data.map(({ node }) => toSuggestion("anime", toAnimeGridItem(node), node)),
      manga: manga.data.map(({ node }) => toSuggestion("manga", toMangaGridItem(node), node)),
    };
  } catch (error) {
    return {
      ok: false,
      message: isRateLimited(error) ? (error as Error).message : "Couldn't load suggestions. Press Enter to search anyway.",
    };
  }
}
