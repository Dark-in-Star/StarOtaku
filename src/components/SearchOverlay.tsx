"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { ArrowLeft, Check, ChevronRight, Loader2, Search, Star, X } from "lucide-react";
import { Dialog, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import type { SearchSuggestion } from "@/lib/browseActions";
import { MAX_VISIBLE_GENRES, PUBLICATION_STATUS_CLASS } from "@/lib/constants";
import {
  ANIME_LIST_STATUS_LABELS,
  MANGA_LIST_STATUS_LABELS,
  formatAnimeStatus,
  formatMangaStatus,
  formatMediaType,
  formatScore,
} from "@/lib/format";
import type { AnimeStatus, MangaStatus } from "@/lib/types";
import { useSearchSuggestions } from "@/lib/useSearchSuggestions";
import { cn } from "@/lib/utils";

type Media = "anime" | "manga";

/** "return" flies the bar back into the trigger it opened from; "leave" just fades, for navigation. */
type CloseMode = "return" | "leave";

const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
const OPEN_MS = 420;
const CLOSE_MS = 300;
const LEAVE_MS = 180;

export function browseSearchHref(q: string, media: Media = "anime"): string {
  const encoded = encodeURIComponent(q.trim());
  return media === "manga" ? `/browse?media=manga&q=${encoded}` : `/browse?q=${encoded}`;
}

function motionAllowed(el: HTMLElement): boolean {
  return typeof el.animate === "function" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// The bar keeps its own size and only glides vertically from the trigger's height — growing
// it out of the trigger's box read as a stretchy, distracting morph.
function originFrame(origin: HTMLElement | null, bar: HTMLElement): Keyframe | null {
  const from = origin?.getBoundingClientRect();
  if (!from || from.width === 0) return null;
  const dy = from.top + from.height / 2 - (bar.getBoundingClientRect().top + bar.offsetHeight / 2);
  return { transform: `translateY(${dy}px)`, opacity: 0 };
}

const REST_FRAME: Keyframe = { transform: "translateY(0px)", opacity: 1 };

function isPlainClick(e: React.MouseEvent) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

interface SearchOverlayProps {
  open: boolean;
  /** The page element the overlay opened from — the bar animates out of and back into it. */
  origin: HTMLElement | null;
  query: string;
  onQueryChange: (query: string) => void;
  onClosed: () => void;
}

export function SearchOverlay({ open, onClosed, ...props }: SearchOverlayProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClosed()}>
      <DialogPortal>
        <SearchOverlayContent onClosed={onClosed} {...props} />
      </DialogPortal>
    </Dialog>
  );
}

function SearchOverlayContent({ origin, query, onQueryChange, onClosed }: Omit<SearchOverlayProps, "open">) {
  const router = useRouter();
  const listboxId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLFormElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closing = useRef(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const { loading, result, resultFor } = useSearchSuggestions(query);
  const anime = result?.ok ? result.anime : [];
  const manga = result?.ok ? result.manga : [];
  const items = [...anime, ...manga];
  const selected = activeIndex < items.length ? activeIndex : -1;
  const trimmed = query.trim();

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input) {
      input.focus({ preventScroll: true });
      // Typing started in the page's box, so continue after what's already there.
      input.setSelectionRange(input.value.length, input.value.length);
    }
    const bar = barRef.current;
    if (!bar || !motionAllowed(bar)) return;

    overlayRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: "ease-out" });
    const from = originFrame(origin, bar);
    bar.animate(
      from ? [from, REST_FRAME] : [{ opacity: 0, transform: "translateY(-16px)" }, { opacity: 1, transform: "none" }],
      { duration: OPEN_MS, easing: EASE_OUT },
    );
    panelRef.current?.animate([{ opacity: 0, transform: "translateY(24px)" }, { opacity: 1, transform: "none" }], {
      duration: 360,
      delay: 180,
      easing: EASE_OUT,
      fill: "backwards",
    });
  }, [origin]);

  useEffect(() => {
    if (selected >= 0) document.getElementById(`${listboxId}-${selected}`)?.scrollIntoView({ block: "nearest" });
  }, [selected, listboxId]);

  function close(mode: CloseMode) {
    if (closing.current) return;
    closing.current = true;
    const bar = barRef.current;
    if (!bar || !motionAllowed(bar)) {
      onClosed();
      return;
    }

    const timing = { duration: mode === "leave" ? LEAVE_MS : CLOSE_MS, easing: EASE_OUT, fill: "forwards" as const };
    const to = mode === "return" ? originFrame(origin, bar) : null;
    const animations = [
      overlayRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], timing),
      panelRef.current?.animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(12px)" }], {
        ...timing,
        duration: LEAVE_MS,
      }),
      bar.animate(to ? [REST_FRAME, to] : [{ opacity: 1 }, { opacity: 0, transform: "translateY(-12px)" }], timing),
    ];
    void Promise.allSettled(animations.map((animation) => animation?.finished)).then(onClosed);
  }

  function dismissOnBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) close("return");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const picked = items[selected];
    if (picked) {
      router.push(picked.href);
    } else if (trimmed) {
      router.push(browseSearchHref(trimmed));
    } else {
      return;
    }
    close("leave");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(Math.min(selected + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(Math.max(selected - 1, -1));
    }
  }

  function leaveOnPlainClick(e: React.MouseEvent) {
    if (isPlainClick(e)) close("leave");
  }

  const groups: { media: Media; label: string; items: SearchSuggestion[]; offset: number }[] = [
    { media: "anime", label: "Anime", items: anime, offset: 0 },
    { media: "manga", label: "Manga", items: manga, offset: anime.length },
  ];

  return (
    <>
      <DialogPrimitive.Overlay
        ref={overlayRef}
        className="fixed inset-0 z-50 bg-background/85 bg-[radial-gradient(900px_420px_at_50%_-10%,color-mix(in_srgb,var(--accent)_16%,transparent),transparent)] backdrop-blur-md"
      />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          close("return");
        }}
        onClick={dismissOnBackdrop}
        className="fixed inset-0 z-50 flex justify-center outline-none"
      >
        <DialogTitle className="sr-only">Search anime and manga</DialogTitle>

        <div
          onClick={dismissOnBackdrop}
          className="flex h-full w-full max-w-3xl flex-col gap-3 px-3 pt-3 pb-3 sm:px-6 sm:pt-8 sm:pb-12"
        >
          <form
            ref={barRef}
            role="search"
            onSubmit={handleSubmit}
            className="flex h-12 w-full shrink-0 items-center gap-1 overflow-hidden rounded-2xl border border-border bg-surface px-1.5 shadow-xl shadow-black/30 transition-colors focus-within:border-accent/60 sm:h-14 sm:px-3"
          >
            <button
              type="button"
              aria-label="Close search"
              onClick={() => close("return")}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground sm:hidden"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <Search aria-hidden className="ml-1 hidden h-5 w-5 shrink-0 text-muted sm:block" />
            <input
              ref={inputRef}
              type="search"
              role="combobox"
              aria-label="Search anime or manga"
              aria-autocomplete="list"
              aria-controls={listboxId}
              aria-expanded={items.length > 0}
              aria-activedescendant={selected >= 0 ? `${listboxId}-${selected}` : undefined}
              enterKeyHint="search"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(e) => {
                onQueryChange(e.target.value);
                setActiveIndex(-1);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search anime or manga..."
              className="h-full min-w-0 flex-1 bg-transparent px-2 text-base text-foreground outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
            />
            {loading && <Loader2 aria-hidden className="h-4 w-4 shrink-0 animate-spin text-muted" />}
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  onQueryChange("");
                  setActiveIndex(-1);
                  inputRef.current?.focus();
                }}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              aria-label="Close search"
              onClick={() => close("return")}
              className="ml-1 hidden h-6 shrink-0 items-center rounded-md border border-border px-1.5 text-[0.65rem] font-semibold text-muted transition-colors hover:border-accent/50 hover:text-foreground sm:inline-flex"
            >
              Esc
            </button>
          </form>

          <div ref={panelRef} className="flex min-h-0 flex-col">
            {trimmed && (
              <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface/95 shadow-2xl shadow-black/40">
                {!result ? (
                  <div aria-hidden>
                    {Array.from({ length: 4 }, (_, i) => (
                      <SuggestionSkeleton key={i} />
                    ))}
                  </div>
                ) : !result.ok ? (
                  <p role="alert" className="px-4 py-4 text-sm text-danger">
                    {result.message}
                  </p>
                ) : items.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-muted">
                    {loading ? "Searching…" : `No anime or manga matched “${trimmed}”.`}
                  </p>
                ) : (
                  <div
                    key={resultFor}
                    id={listboxId}
                    role="listbox"
                    aria-label="Suggestions"
                    className={cn(
                      "min-h-0 overflow-y-auto overscroll-contain transition-opacity",
                      loading && "opacity-60",
                    )}
                  >
                    {groups.map(
                      (group) =>
                        group.items.length > 0 && (
                          <div key={group.media} role="group" aria-labelledby={`${listboxId}-${group.media}`}>
                            <div
                              id={`${listboxId}-${group.media}`}
                              className="sticky top-0 z-10 border-b border-border/50 bg-surface/95 px-4 pt-3 pb-1.5 text-[0.65rem] font-bold tracking-widest text-muted uppercase backdrop-blur"
                            >
                              {group.label}
                            </div>
                            {group.items.map((item, i) => {
                              const index = group.offset + i;
                              return (
                                <SuggestionRow
                                  key={`${item.media}-${item.id}`}
                                  id={`${listboxId}-${index}`}
                                  item={item}
                                  index={index}
                                  selected={index === selected}
                                  signedIn={result.signedIn}
                                  onClick={leaveOnPlainClick}
                                />
                              );
                            })}
                          </div>
                        ),
                    )}
                  </div>
                )}

                <div className="grid shrink-0 grid-cols-2 divide-x divide-border/60 border-t border-border/60">
                  {(["anime", "manga"] as const).map((media) => (
                    <Link
                      key={media}
                      href={browseSearchHref(trimmed, media)}
                      onClick={leaveOnPlainClick}
                      className="flex items-center justify-center gap-1 py-3 text-xs font-semibold text-accent transition-colors hover:bg-surface-muted"
                    >
                      View all {media} results
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogPrimitive.Content>
    </>
  );
}

function statusLabel(item: SearchSuggestion): string | undefined {
  if (!item.status) return undefined;
  return item.media === "anime"
    ? formatAnimeStatus(item.status as AnimeStatus)
    : formatMangaStatus(item.status as MangaStatus);
}

function SuggestionRow({
  id,
  item,
  index,
  selected,
  signedIn,
  onClick,
}: {
  id: string;
  item: SearchSuggestion;
  index: number;
  selected: boolean;
  signedIn: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  // A manga's media_type is usually just "manga" — only worth repeating when it's narrower
  // (e.g. "light_novel", "one_shot").
  const subtype = item.mediaType && item.mediaType !== item.media ? formatMediaType(item.mediaType) : undefined;
  const status = statusLabel(item);
  const genres = item.genres ?? [];
  const extraGenres = genres.length - MAX_VISIBLE_GENRES;

  return (
    <Link
      id={id}
      href={item.href}
      role="option"
      aria-selected={selected}
      onClick={onClick}
      style={{ animationDelay: `${index * 35}ms` }}
      className={cn(
        "group flex items-center gap-3 border-b border-border/50 px-3 py-2.5 transition-colors hover:bg-surface-muted animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both last:border-b-0 sm:px-4 sm:py-3",
        selected && "bg-surface-muted",
      )}
    >
      <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded-md bg-surface-muted">
        {item.imageUrl && <Image src={item.imageUrl} alt="" fill sizes="44px" className="object-cover" />}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className={cn("truncate text-sm font-semibold text-foreground", selected && "text-accent")}>{item.title}</p>

        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
          <span
            className={cn(
              "rounded px-1.5 py-px text-[0.6rem] font-bold tracking-wide uppercase",
              item.media === "anime" ? "bg-accent-soft text-accent" : "bg-surface-muted text-foreground",
            )}
          >
            {item.media}
          </span>
          {[
            subtype && <span key="type">{subtype}</span>,
            status && (
              <span key="status" className={item.status && PUBLICATION_STATUS_CLASS[item.status]}>
                {status}
              </span>
            ),
            item.year && <span key="year">{item.year}</span>,
          ]
            .filter(Boolean)
            .flatMap((part, i) => (i === 0 ? [part] : [<span key={`dot-${i}`}>·</span>, part]))}
        </p>

        {/* Capped to one line: wrapped genre chips just drop out instead of growing the row. */}
        <div className="flex max-h-5 flex-wrap items-center gap-1 overflow-hidden">
          <ListBadge item={item} signedIn={signedIn} />
          {genres.slice(0, MAX_VISIBLE_GENRES).map((genre) => (
            <span
              key={genre.id}
              className="rounded-full bg-surface-muted px-2 py-0.5 text-[0.65rem] font-medium text-muted"
            >
              {genre.name}
            </span>
          ))}
          {extraGenres > 0 && <span className="text-[0.65rem] text-muted">+{extraGenres}</span>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-score">
          <Star aria-hidden className="h-3.5 w-3.5 fill-current" />
          <span className="sr-only">Score </span>
          {item.mean !== undefined ? formatScore(item.mean) : "N/A"}
        </span>
        <ChevronRight
          aria-hidden
          className={cn(
            "h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5",
            selected && "translate-x-0.5 text-accent",
          )}
        />
      </div>
    </Link>
  );
}

function ListBadge({ item, signedIn }: { item: SearchSuggestion; signedIn: boolean }) {
  if (item.listStatus) {
    const labels = item.media === "anime" ? ANIME_LIST_STATUS_LABELS : MANGA_LIST_STATUS_LABELS;
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-[0.65rem] font-semibold text-accent">
        <Check aria-hidden className="h-3 w-3" />
        {labels[item.listStatus] ?? "On your list"}
      </span>
    );
  }
  // Logged-out visitors have no list, so "not on it" would be misleading.
  if (!signedIn) return null;
  return (
    <span className="rounded-full border border-dashed border-border px-2 py-0.5 text-[0.65rem] font-medium text-muted">
      Not on your list
    </span>
  );
}

function SuggestionSkeleton() {
  return (
    <div className="flex items-center gap-3 border-b border-border/50 px-3 py-2.5 last:border-b-0 sm:px-4 sm:py-3">
      <div className="h-16 w-11 shrink-0 animate-pulse rounded-md bg-surface-muted" />
      <div className="flex flex-1 flex-col gap-2">
        <div className="h-3.5 w-2/3 animate-pulse rounded bg-surface-muted" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-surface-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-surface-muted" />
      </div>
    </div>
  );
}
