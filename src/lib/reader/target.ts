import type { MangaNode } from "../types";
import { uniqueTitles } from "./chapters";
import type { ReaderTarget } from "./types";

const ADULT_GENRES = new Set(["Hentai", "Erotica"]);

export function isAdultManga(manga: Pick<MangaNode, "nsfw" | "genres">): boolean {
  return manga.nsfw === "black" || (manga.genres ?? []).some((genre) => ADULT_GENRES.has(genre.name));
}

/**
 * Romaji and English first, since those are what every source indexes; the Japanese title
 * goes last because it only ever helps on nhentai, and each title tried costs a search.
 */
export function readerTargetFromManga(
  manga: Pick<MangaNode, "id" | "title" | "alternative_titles" | "media_type" | "nsfw" | "genres">,
): ReaderTarget {
  const alt = manga.alternative_titles;
  return {
    malId: manga.id,
    titles: uniqueTitles([manga.title, alt?.en, ...(alt?.synonyms ?? []), alt?.ja]),
    mediaType: manga.media_type,
    adult: isAdultManga(manga),
  };
}
