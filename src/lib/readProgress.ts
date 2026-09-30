import type { MangaListStatus } from "./types";

export interface ReadProgress {
  read: number;
  status?: MangaListStatus;
}

export interface ReadProgressUpdate {
  num_chapters_read: number;
  status: MangaListStatus;
}

interface NumberedChapter {
  id: string;
  number: number | null;
  externalUrl?: string;
}

/**
 * The MAL chapter count a source chapter stands for. MAL counts whole chapters, so a
 * "12.5" extra counts as 12, and an unnumbered side story counts as nothing.
 */
export function malChapterNumber(chapter: { number: number | null }): number | null {
  return chapter.number === null ? null : Math.floor(chapter.number);
}

export function isChapterRead(chapter: { number: number | null }, read: number): boolean {
  const n = malChapterNumber(chapter);
  return read > 0 && n !== null && n <= read;
}

function statusFor(read: number, status: MangaListStatus | undefined, total: number | undefined): MangaListStatus {
  if (total !== undefined && total > 0 && read >= total) return "completed";
  // A finished title being re-read stays completed; anything else being read is "reading".
  if (status === "completed" && read > 0) return "completed";
  return "reading";
}

/**
 * The list update for "the reader just finished this chapter". Like watch progress, it only
 * ever moves forward: re-reading an old chapter must not rewind what MAL already has. Null
 * when there's nothing to send.
 */
export function readProgressUpdate(
  chapter: { number: number | null },
  current: ReadProgress,
  total: number | undefined,
): ReadProgressUpdate | null {
  const n = malChapterNumber(chapter);
  if (n === null || n < 1) return null;
  const capped = total && total > 0 ? Math.min(n, total) : n;
  const next = Math.max(current.read, capped);
  const status = statusFor(next, current.status, total);
  if (next === current.read && status === current.status) return null;
  return { num_chapters_read: next, status };
}

/**
 * An explicit "I've read up to here" from the chapter list. Unlike finishing a chapter this
 * may move backwards — it's a deliberate correction, e.g. un-marking a chapter misclicked.
 */
export function setReadProgress(
  read: number,
  current: ReadProgress,
  total: number | undefined,
): ReadProgressUpdate {
  const clamped = Math.max(0, total && total > 0 ? Math.min(read, total) : read);
  // Rewinding a completed title means it's no longer finished.
  const status = current.status === "completed" && clamped < (total ?? Infinity) ? "reading" : statusFor(clamped, current.status, total);
  return { num_chapters_read: clamped, status };
}

/**
 * Where "Continue reading" should open: the first in-app chapter past the MAL count, in
 * reading order. Null when there's nothing newer to read.
 */
export function resumeChapter<T extends NumberedChapter>(chapters: T[], read: number): T | null {
  const readable = chapters.filter((chapter) => !chapter.externalUrl);
  if (readable.length === 0) return null;
  if (read <= 0) return readable[0];
  return readable.find((chapter) => (malChapterNumber(chapter) ?? -1) > read) ?? null;
}
