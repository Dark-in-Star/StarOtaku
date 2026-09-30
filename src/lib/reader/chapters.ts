import type { ReaderChapter } from "./types";

// Novels on MAL have no page images anywhere; asking every source about them only burns
// rate limit on guaranteed misses.
const UNREADABLE_MEDIA_TYPES = new Set(["light_novel", "novel"]);

export function isReadableMediaType(mediaType: string | undefined): boolean {
  return !mediaType || !UNREADABLE_MEDIA_TYPES.has(mediaType);
}

// Series name their chapters idiosyncratically — Vampire Knight uses "Night 1", Kokou no
// Hito "# 1" — so beyond the known words any label that is just a word and a number counts,
// unless the word is a volume marker, whose number is not a chapter number.
const CHAPTER_WORD = /(?:chapter|episode|ch\.?|ep\.?|#)\s*(\d+(?:\.\d+)?)/i;
const WORD_AND_NUMBER = /^\s*([^\d]*?)\s*(\d+(?:\.\d+)?)\s*$/;

/** "Chapter 147", "Episode 12.5", "Night 3", "# 7" → the number; "Side Story", "Vol. 2" → null. */
export function parseChapterNumber(label: string): number | null {
  const known = CHAPTER_WORD.exec(label);
  if (known) return Number(known[1]);
  const generic = WORD_AND_NUMBER.exec(label);
  if (generic && !/vol/i.test(generic[1])) return Number(generic[2]);
  return null;
}

/**
 * Lowercased, accent-free, punctuation-free, single-spaced — so "Frieren: Beyond Journey's
 * End" and "Frieren - Beyond Journey’s End" compare equal. Titles that differ only in
 * punctuation are the norm across sources, never a real mismatch.
 */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&amp;|&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function titlesOverlap(a: string[], b: string[]): boolean {
  const left = new Set(a.map(normalizeTitle).filter(Boolean));
  return b.some((title) => left.has(normalizeTitle(title)));
}

/** Distinct, non-empty titles in the order given, compared after normalization. */
export function uniqueTitles(titles: (string | undefined | null)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const title of titles) {
    if (!title) continue;
    const key = normalizeTitle(title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(title.trim());
  }
  return result;
}

function readable(chapter: ReaderChapter): boolean {
  return !chapter.externalUrl;
}

/**
 * One entry per chapter number, ascending. Sources carry several uploads of the same
 * chapter (different scanlation groups, or a fan scan alongside an official link); an
 * in-app readable one always beats an external link, otherwise the first seen wins.
 * Unnumbered chapters are all kept, after the numbered run, since there is nothing to
 * dedupe them on.
 */
export function dedupeChapters(chapters: ReaderChapter[]): ReaderChapter[] {
  const byNumber = new Map<number, ReaderChapter>();
  const unnumbered: ReaderChapter[] = [];

  for (const chapter of chapters) {
    if (chapter.number === null) {
      unnumbered.push(chapter);
      continue;
    }
    const existing = byNumber.get(chapter.number);
    if (!existing || (!readable(existing) && readable(chapter))) byNumber.set(chapter.number, chapter);
  }

  const numbered = [...byNumber.values()].sort((a, b) => (a.number as number) - (b.number as number));
  return [...numbered, ...unnumbered];
}

export function readableChapterCount(chapters: ReaderChapter[]): number {
  return chapters.filter(readable).length;
}

export function highestChapterNumber(chapters: ReaderChapter[]): number | null {
  let highest: number | null = null;
  for (const chapter of chapters) {
    if (chapter.number !== null && readable(chapter) && (highest === null || chapter.number > highest)) {
      highest = chapter.number;
    }
  }
  return highest;
}

export const CHAPTERS_PER_PAGE = 50;

export type ChapterOrder = "oldest" | "newest";

export const CHAPTER_ORDER_COOKIE = "starotaku_chapter_order";

export function parseChapterOrder(value: string | undefined): ChapterOrder | undefined {
  return value === "oldest" || value === "newest" ? value : undefined;
}

/** Chapters as the list shows them; sources hand them over in reading order. */
export function orderChapters(chapters: ReaderChapter[], order: ChapterOrder): ReaderChapter[] {
  return order === "newest" ? [...chapters].reverse() : chapters;
}

/** The chapter-list page (1-based) holding `chapterId`, given chapters in reading order. */
export function chapterListPage(chapters: ReaderChapter[], chapterId: string, order: ChapterOrder = "oldest"): number {
  const index = chapters.findIndex((chapter) => chapter.id === chapterId);
  if (index < 0) return 1;
  const position = order === "newest" ? chapters.length - 1 - index : index;
  return Math.floor(position / CHAPTERS_PER_PAGE) + 1;
}
