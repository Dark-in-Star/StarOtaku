"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BookOpen, Check, ExternalLink, Play } from "lucide-react";
import type { ReaderChapter } from "@/lib/reader/types";
import { isChapterRead, malChapterNumber, resumeChapter, type ReadProgress } from "@/lib/readProgress";
import { useReadProgress } from "@/lib/useReadProgress";
import { cn } from "@/lib/utils";

type ResumeCandidate = Pick<ReaderChapter, "id" | "number" | "label" | "externalUrl" | "source">;

/**
 * The chapter list with the reader's MAL progress layered on: a Continue card at the top,
 * read chapters ticked off, and a tick button per row that sets progress to that chapter —
 * the quick way to catch the list up after reading elsewhere, or to undo a mistake.
 */
export function ChapterList({
  mangaId,
  chapters,
  readingOrder,
  chapterHref,
  isAuthenticated,
  loginHref,
  initial,
  total,
  header,
  footer,
}: {
  mangaId: number;
  /** This page's chapters, in display order. */
  chapters: ReaderChapter[];
  /** Every chapter in reading order — only what "Continue" needs to find the next one. */
  readingOrder: ResumeCandidate[];
  /** `${prefix}${source}/${id}${suffix}` — a function can't cross to a Client Component. */
  chapterHref: { prefix: string; suffix: string };
  isAuthenticated: boolean;
  loginHref: string;
  initial: ReadProgress;
  total?: number;
  header?: ReactNode;
  footer?: ReactNode;
}) {
  const { progress, saveState, setRead } = useReadProgress({ mangaId, initial, total, enabled: isAuthenticated });
  const href = (chapter: Pick<ReaderChapter, "source" | "id">) => `${chapterHref.prefix}${chapter.source}/${chapter.id}${chapterHref.suffix}`;

  const read = isAuthenticated ? progress.read : 0;
  const resume = resumeChapter(readingOrder, read);
  const first = readingOrder.find((chapter) => !chapter.externalUrl);
  const caughtUp = read > 0 && !resume;
  const target = resume ?? first;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4" data-testid="reader-continue">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm font-semibold text-foreground">
            {caughtUp ? "You're all caught up" : read > 0 ? "Continue reading" : "Start reading"}
          </p>
          <p className="text-xs text-muted" aria-live="polite">
            {!isAuthenticated ? (
              <>
                {/* Plain <a>: a <Link> would prefetch the login route, which starts an OAuth handshake. */}
                <a href={loginHref} className="font-semibold text-accent hover:underline">
                  Log in
                </a>{" "}
                to keep track of what you&apos;ve read.
              </>
            ) : saveState === "error" ? (
              "Couldn't update MyAnimeList. Try again."
            ) : (
              `${progress.read} / ${total || "?"} chapters read on MyAnimeList`
            )}
          </p>
        </div>
        {target && (
          <Link
            href={href(target)}
            prefetch={false}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/80"
          >
            <Play className="size-3.5" fill="currentColor" />
            {caughtUp ? `Re-read ${target.label}` : target.label}
          </Link>
        )}
      </div>

      {header}

      <ol className="divide-y divide-border rounded-xl border border-border bg-surface" data-testid="reader-chapters">
        {chapters.map((chapter) => {
          const n = malChapterNumber(chapter);
          const done = isAuthenticated && isChapterRead(chapter, progress.read);
          const markable = isAuthenticated && n !== null && n > 0;
          return (
            <li key={`${chapter.source}-${chapter.id}`} className="flex items-center">
              {markable ? (
                <button
                  type="button"
                  onClick={() => void setRead(done ? n - 1 : n)}
                  disabled={saveState === "saving"}
                  aria-label={done ? `Mark ${chapter.label} unread` : `Mark read up to ${chapter.label}`}
                  aria-pressed={done}
                  title={done ? "Mark unread" : "Mark read up to here"}
                  className="flex size-11 shrink-0 items-center justify-center text-muted transition-colors hover:text-accent disabled:opacity-60"
                >
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full border",
                      done ? "border-accent bg-accent text-accent-foreground" : "border-border",
                    )}
                  >
                    {done && <Check className="size-3" strokeWidth={3} />}
                  </span>
                </button>
              ) : (
                <span className="flex size-11 shrink-0 items-center justify-center text-muted">
                  <BookOpen className="size-3.5" />
                </span>
              )}

              {chapter.externalUrl ? (
                <a
                  href={chapter.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 py-3 pr-4 text-sm text-muted hover:text-foreground"
                >
                  <span className="truncate">{chapter.label}</span>
                  <span className="flex shrink-0 items-center gap-1 text-xs">
                    Official site <ExternalLink className="size-3" />
                  </span>
                </a>
              ) : (
                <Link
                  href={href(chapter)}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 py-3 pr-4 text-sm hover:text-accent"
                  data-chapter-id={chapter.id}
                  prefetch={false}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={cn("truncate font-medium", done ? "text-muted" : "text-foreground")}>{chapter.label}</span>
                    {chapter.title && <span className="truncate text-muted">{chapter.title}</span>}
                  </span>
                  {chapter.group && <span className="shrink-0 truncate text-xs text-muted">{chapter.group}</span>}
                </Link>
              )}
            </li>
          );
        })}
      </ol>

      {footer}
    </div>
  );
}
