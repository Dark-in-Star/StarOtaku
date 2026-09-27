import type { AlternativeTitles, Genre } from "@/lib/types";

export interface ListFilters {
  genres: number[];
  ratingMin: number;
  ratingMax: number;
  dateFrom: string;
  dateTo: string;
  airingStatuses: string[];
}

export const RATING_MIN = 0;
export const RATING_MAX = 10;

export const DEFAULT_LIST_FILTERS: ListFilters = {
  genres: [],
  ratingMin: RATING_MIN,
  ratingMax: RATING_MAX,
  dateFrom: "",
  dateTo: "",
  airingStatuses: [],
};

export interface GenreFacet {
  id: number;
  name: string;
  count: number;
}

export function collectGenreFacets(nodes: { genres?: Genre[] }[]): GenreFacet[] {
  const facets = new Map<number, GenreFacet>();
  for (const node of nodes) {
    for (const genre of node.genres ?? []) {
      const existing = facets.get(genre.id);
      if (existing) existing.count += 1;
      else facets.set(genre.id, { id: genre.id, name: genre.name, count: 1 });
    }
  }
  return Array.from(facets.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Same as collectGenreFacets, but seeded from the full genre taxonomy so genres with
 * zero matches among currently-loaded nodes still show up (count 0) instead of being
 * hidden entirely. */
export function mergeGenreFacets(allGenres: Genre[], nodes: { genres?: Genre[] }[]): GenreFacet[] {
  const counts = new Map<number, number>();
  for (const node of nodes) {
    for (const genre of node.genres ?? []) {
      counts.set(genre.id, (counts.get(genre.id) ?? 0) + 1);
    }
  }
  return allGenres
    .map((genre) => ({ id: genre.id, name: genre.name, count: counts.get(genre.id) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function countActiveFilters(filters: ListFilters): number {
  let count = 0;
  if (filters.genres.length > 0) count += 1;
  if (filters.ratingMin > RATING_MIN || filters.ratingMax < RATING_MAX) count += 1;
  if (filters.dateFrom || filters.dateTo) count += 1;
  if (filters.airingStatuses.length > 0) count += 1;
  return count;
}

export function matchesListFilters(
  node: { genres?: Genre[]; mean?: number; start_date?: string; status?: string },
  filters: ListFilters,
): boolean {
  if (filters.genres.length > 0) {
    const nodeGenreIds = new Set((node.genres ?? []).map((g) => g.id));
    if (!filters.genres.some((id) => nodeGenreIds.has(id))) return false;
  }

  if (filters.ratingMin > RATING_MIN || filters.ratingMax < RATING_MAX) {
    if (node.mean === undefined || node.mean < filters.ratingMin || node.mean > filters.ratingMax) return false;
  }

  if (filters.dateFrom && (!node.start_date || node.start_date < filters.dateFrom)) return false;
  if (filters.dateTo && (!node.start_date || node.start_date > filters.dateTo)) return false;

  if (filters.airingStatuses.length > 0 && (!node.status || !filters.airingStatuses.includes(node.status))) {
    return false;
  }

  return true;
}

export function matchesQuery(node: { title: string; alternative_titles?: AlternativeTitles }, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  if (node.title.toLowerCase().includes(q)) return true;

  const alt = node.alternative_titles;
  if (alt?.en?.toLowerCase().includes(q)) return true;
  if (alt?.ja?.toLowerCase().includes(q)) return true;
  if (alt?.synonyms?.some((synonym) => synonym.toLowerCase().includes(q))) return true;

  return false;
}
