"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, ChevronRight, GalleryHorizontal, List, Maximize, Minimize, Rows3 } from "lucide-react";
import type { ReaderPage } from "@/lib/reader/types";
import { READER_MODE_COOKIE, type ReaderMode } from "@/lib/reader/chapters";
import { isChapterRead, type ReadProgress } from "@/lib/readProgress";
import { useReadProgress } from "@/lib/useReadProgress";
import { STRIP_ZOOM_COOKIE, STRIP_ZOOM_STEPS, stepStripZoom } from "@/lib/zoom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PagedViewer } from "@/components/PagedViewer";
import { ReaderImage } from "@/components/ReaderImage";
import { ZoomControls } from "@/components/ZoomControls";

const ONE_YEAR_SECONDS = 31_536_000;

interface ChapterLink {
  href: string;
  label: string;
}

export interface ReaderTracking {
  mangaId: number;
  chapter: { number: number | null; label: string };
  isAuthenticated: boolean;
  loginHref: string;
  initial: ReadProgress;
  total?: number;
}

interface ChapterReaderProps {
  title: string;
  subtitle?: string;
  pages: ReaderPage[];
  indexHref: string;
  previous?: ChapterLink | null;
  next?: ChapterLink | null;
  /** Every chapter, in reading order, for the jump menu. */
  chapterOptions?: (ChapterLink & { id: string })[];
  currentChapterId?: string;
  defaultMode: ReaderMode;
  /** Strip width multiplier for scroll mode, remembered in a cookie. */
  defaultStripZoom?: number;
  tracking?: ReaderTracking;
}

function remember(name: string, value: string | number) {
  document.cookie = `${name}=${value}; Max-Age=${ONE_YEAR_SECONDS}; Path=/; SameSite=Lax`;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("input, select, textarea, [contenteditable]"));
}

export function ChapterReader({
  title,
  subtitle,
  pages,
  indexHref,
  previous,
  next,
  chapterOptions,
  currentChapterId,
  defaultMode,
  defaultStripZoom = 1,
  tracking,
}: ChapterReaderProps) {
  const router = useRouter();
  const [mode, setMode] = useState<ReaderMode>(defaultMode);
  const [page, setPage] = useState(0);
  const [stripZoom, setStripZoom] = useState(defaultStripZoom);
  const [fullscreen, setFullscreen] = useState(false);

  const trackable = Boolean(tracking?.isAuthenticated && tracking.chapter.number !== null);
  const { progress, saveState, markRead } = useReadProgress({
    mangaId: tracking?.mangaId ?? 0,
    initial: tracking?.initial ?? { read: 0 },
    total: tracking?.total,
    enabled: trackable,
  });
  const chapterRead = tracking ? isChapterRead(tracking.chapter, progress.read) : false;

  const markCurrentRead = useCallback(() => {
    if (tracking && trackable) void markRead(tracking.chapter);
  }, [markRead, trackable, tracking]);

  // Moving on to the next chapter is the clearest "I finished this one" signal there is, so
  // it records progress — the same rule the anime player uses for "next episode".
  const goNextChapter = useCallback(() => {
    if (!next) return;
    markCurrentRead();
    router.push(next.href);
  }, [markCurrentRead, next, router]);

  const goPreviousChapter = useCallback(() => {
    if (previous) router.push(previous.href);
  }, [previous, router]);

  const nextPage = useCallback(() => {
    if (page < pages.length) setPage(page + 1);
    else goNextChapter();
  }, [goNextChapter, page, pages.length]);

  const previousPage = useCallback(() => {
    if (page > 0) setPage(page - 1);
    else goPreviousChapter();
  }, [goPreviousChapter, page]);

  function changeMode(nextMode: ReaderMode) {
    setMode(nextMode);
    remember(READER_MODE_COOKIE, nextMode);
  }

  const changeStripZoom = useCallback((zoom: number) => {
    setStripZoom(zoom);
    remember(STRIP_ZOOM_COOKIE, zoom);
  }, []);

  // Full screen is two layers: an overlay that covers the app's own header and bottom bar
  // (works everywhere), plus the browser's Fullscreen API to hide the browser's bars too where
  // it's allowed. iPhone Safari only grants that to videos, so there the overlay stands alone.
  const enterFullscreen = useCallback(() => {
    setFullscreen(true);
    document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);

  const exitFullscreen = useCallback(() => {
    setFullscreen(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
  }, []);

  // Leaving browser full screen by its own means (Esc, a system gesture) closes the overlay too.
  useEffect(() => {
    function onChange() {
      if (!document.fullscreenElement) setFullscreen(false);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // The page behind the overlay mustn't scroll along with it.
  useEffect(() => {
    if (!fullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [fullscreen]);

  // Fetch the next chapter's route data while the reader is near the end of this one.
  useEffect(() => {
    if (next && (mode === "scroll" || page >= pages.length - 2)) router.prefetch(next.href);
  }, [mode, next, page, pages.length, router]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      if (e.key === "f" || e.key === "F") {
        if (fullscreen) exitFullscreen();
        else enterFullscreen();
      } else if (e.key === "Escape" && fullscreen) {
        exitFullscreen();
      } else if (mode === "scroll" && (e.key === "+" || e.key === "=")) {
        changeStripZoom(stepStripZoom(stripZoom, 1));
      } else if (mode === "scroll" && (e.key === "-" || e.key === "_")) {
        changeStripZoom(stepStripZoom(stripZoom, -1));
      } else if (mode === "scroll" && e.key === "0") {
        changeStripZoom(1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (mode === "paged") nextPage();
        else goNextChapter();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (mode === "paged") previousPage();
        else goPreviousChapter();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    changeStripZoom,
    enterFullscreen,
    exitFullscreen,
    fullscreen,
    goNextChapter,
    goPreviousChapter,
    mode,
    nextPage,
    previousPage,
    stripZoom,
  ]);

  const navButton = "flex h-9 shrink-0 items-center gap-1 rounded-lg border border-border bg-surface px-2.5 text-sm font-medium transition-colors hover:bg-surface-muted";
  const disabledNav = "pointer-events-none opacity-40";

  const chapterNav = (
    <nav className="flex items-center gap-2" aria-label="Chapters">
      <button
        type="button"
        onClick={goPreviousChapter}
        disabled={!previous}
        aria-label={previous ? `Previous: ${previous.label}` : "No previous chapter"}
        className={cn(navButton, !previous && disabledNav)}
      >
        <ChevronLeft className="size-4" /> <span className="hidden sm:inline">Prev</span>
      </button>

      {chapterOptions && chapterOptions.length > 0 ? (
        <select
          value={currentChapterId}
          onChange={(e) => {
            const target = chapterOptions.find((option) => option.id === e.target.value);
            if (target) router.push(target.href);
          }}
          aria-label="Jump to chapter"
          className="h-9 min-w-0 flex-1 truncate rounded-lg border border-border bg-surface px-2 text-sm"
        >
          {chapterOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <span className="flex-1" />
      )}

      <Link href={indexHref} prefetch={false} className={navButton} aria-label="Chapters">
        <List className="size-4" />
      </Link>

      <button
        type="button"
        onClick={goNextChapter}
        disabled={!next}
        aria-label={next ? `Next: ${next.label}` : "No next chapter"}
        className={cn(navButton, !next && disabledNav)}
      >
        <span className="hidden sm:inline">Next</span> <ChevronRight className="size-4" />
      </button>
    </nav>
  );

  const endCard = (
    <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border border-border bg-surface p-5 text-center" data-testid="reader-end">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">End of chapter</p>
        <p className="text-base font-bold text-foreground">{tracking?.chapter.label ?? title}</p>
      </div>

      {tracking && !tracking.isAuthenticated && (
        <p className="text-xs text-muted">
          {/* Plain <a>: a <Link> would prefetch the login route, which starts an OAuth handshake. */}
          <a href={tracking.loginHref} className="font-semibold text-accent hover:underline">
            Log in with MyAnimeList
          </a>{" "}
          to keep track of what you&apos;ve read.
        </p>
      )}

      {tracking?.isAuthenticated && tracking.chapter.number === null && (
        <p className="text-xs text-muted">This chapter has no number, so it can&apos;t be counted on MyAnimeList.</p>
      )}

      {trackable && (
        <div className="flex w-full flex-col gap-2">
          <Button
            type="button"
            variant={chapterRead ? "outline" : "secondary"}
            onClick={markCurrentRead}
            disabled={chapterRead || saveState === "saving"}
            className="w-full gap-1.5"
          >
            <Check className="size-4" /> {chapterRead ? "Marked as read" : "Mark as read"}
          </Button>
          <p className="text-xs text-muted" aria-live="polite">
            {saveState === "error"
              ? "Couldn't update MyAnimeList. Try again."
              : `MyAnimeList: ${progress.read} / ${tracking?.total || "?"} ch`}
          </p>
        </div>
      )}

      {next ? (
        <div className="flex w-full flex-col gap-1.5">
          <Button type="button" onClick={goNextChapter} className="w-full gap-1.5 text-white">
            Next: {next.label} <ChevronRight className="size-4" />
          </Button>
          {trackable && !chapterRead && (
            <p className="text-[11px] text-muted">Going to the next chapter marks this one as read.</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">You&apos;re all caught up.</p>
          <Button asChild variant="outline">
            <Link href={indexHref}>Back to chapters</Link>
          </Button>
        </div>
      )}
    </div>
  );

  const modeToggle = (
    <div role="group" aria-label="Reading mode" className="flex shrink-0 rounded-lg border border-border bg-surface p-0.5">
      {(
        [
          { value: "paged", label: "Pages", icon: GalleryHorizontal },
          { value: "scroll", label: "Scroll", icon: Rows3 },
        ] as const
      ).map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => changeMode(value)}
          aria-pressed={mode === value}
          // The text label is hidden on phones, so the name has to live here.
          aria-label={label}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
            mode === value ? "bg-surface-muted text-foreground" : "text-muted hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );

  const stripZoomControls = (
    <ZoomControls
      zoom={stripZoom}
      onZoomIn={() => changeStripZoom(stepStripZoom(stripZoom, 1))}
      onZoomOut={() => changeStripZoom(stepStripZoom(stripZoom, -1))}
      onReset={() => changeStripZoom(1)}
      canZoomIn={stripZoom < STRIP_ZOOM_STEPS[STRIP_ZOOM_STEPS.length - 1]}
      canZoomOut={stripZoom > STRIP_ZOOM_STEPS[0]}
    />
  );

  const fullscreenButton = (
    <button
      type="button"
      onClick={fullscreen ? exitFullscreen : enterFullscreen}
      aria-label={fullscreen ? "Exit full screen" : "Full screen"}
      title={fullscreen ? "Exit full screen (Esc)" : "Full screen (F)"}
      className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-foreground transition-colors hover:bg-surface-muted"
    >
      {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
    </button>
  );

  // The strip keeps a comfortable reading width on big screens; zoom scales that width, and
  // past the screen's edge the strip scrolls sideways.
  const strip = (
    <div className="-mx-3 overflow-x-auto sm:mx-0">
      <div className="mx-auto flex flex-col" style={{ width: `calc(min(100%, 48rem) * ${stripZoom})` }} data-testid="reader-pages">
        {pages.map((p, index) => (
          <ReaderImage key={p.url} page={p} index={index} />
        ))}
      </div>
    </div>
  );

  const body: ReactNode =
    pages.length === 0 ? (
      <p className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted">
        This chapter&apos;s pages could not be loaded.
      </p>
    ) : mode === "paged" ? (
      <PagedViewer
        pages={pages}
        page={page}
        onNext={nextPage}
        onPrevious={previousPage}
        onJump={(target) => setPage(Math.max(0, Math.min(target, pages.length)))}
        end={endCard}
        fullscreen={fullscreen}
      />
    ) : (
      <>
        {strip}
        <div className="flex justify-center px-3 py-2">{endCard}</div>
        <div className="px-3 pb-3 sm:px-0">{chapterNav}</div>
      </>
    );

  if (fullscreen) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex flex-col bg-black" data-testid="reader-fullscreen">
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-3 py-2">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {title}
            {tracking && <span className="font-normal text-muted"> · {tracking.chapter.label}</span>}
          </p>
          {mode === "scroll" && stripZoomControls}
          {modeToggle}
          {fullscreenButton}
        </div>
        {mode === "paged" ? (
          <div className="min-h-0 flex-1">{body}</div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
        )}
      </div>,
      document.body,
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="truncate text-base font-bold text-foreground sm:text-lg">{title}</h1>
          {subtitle && <p className="truncate text-xs text-muted sm:text-sm">{subtitle}</p>}
        </div>
        {pages.length > 0 && (
          <div className="flex shrink-0 items-center gap-1.5">
            {mode === "scroll" && <span className="hidden sm:block">{stripZoomControls}</span>}
            {modeToggle}
            {fullscreenButton}
          </div>
        )}
      </div>

      {chapterNav}
      {mode === "scroll" && pages.length > 0 && <div className="flex justify-end sm:hidden">{stripZoomControls}</div>}

      {body}

      {pages.length > 0 && (
        <p className="hidden text-center text-[11px] text-muted lg:block">
          {mode === "paged"
            ? "← → turn pages · + − zoom · double-click to zoom · F full screen"
            : "← → previous / next chapter · + − strip width · F full screen"}
        </p>
      )}
    </div>
  );
}
