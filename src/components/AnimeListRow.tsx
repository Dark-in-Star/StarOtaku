"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Pencil, Plus, Star } from "lucide-react";
import { updateAnimeStatusAction } from "@/lib/actions";
import { formatAnimeStatus, formatMediaType, formatSeasonLabel } from "@/lib/format";
import type { AnimeNode, MyListStatus, NextAiringEpisode } from "@/lib/types";
import { PUBLICATION_STATUS_CLASS } from "@/lib/constants";
import { hasUnwatchedNewEpisode } from "@/lib/newEpisode";
import { Button } from "@/components/ui/button";
import { ScoreBadge } from "./ScoreBadge";
import { AnimeListEditModal } from "./AnimeListEditModal";
import { GenreChips } from "./GenreChips";

export function AnimeListRow({
  node,
  listStatus,
  schedule,
  onUpdated,
  onRemoved,
}: {
  node: AnimeNode;
  listStatus: MyListStatus;
  /** Next-airing schedule, when known — drives the unwatched-new-episode badge. */
  schedule?: NextAiringEpisode;
  onUpdated: (update: Partial<MyListStatus>) => void;
  onRemoved: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [episodes, setEpisodes] = useState(listStatus.num_episodes_watched ?? 0);
  const [editOpen, setEditOpen] = useState(false);
  const [editSession, setEditSession] = useState(0);

  const total = node.num_episodes || undefined;
  const atMax = total !== undefined && episodes >= total;

  function handleIncrement() {
    if (atMax) return;
    const next = episodes + 1;
    setEpisodes(next);

    const update: Partial<MyListStatus> = { num_episodes_watched: next };
    if (!listStatus.status || listStatus.status === "plan_to_watch" || listStatus.status === "on_hold") {
      update.status = "watching";
    }
    if (total !== undefined && next >= total) {
      update.status = "completed";
    }

    onUpdated(update);
    startTransition(() =>
      updateAnimeStatusAction({ animeId: node.id, num_watched_episodes: next, status: update.status }),
    );
  }

  const seasonLabel = node.start_season
    ? `${formatSeasonLabel(node.start_season.season)} ${node.start_season.year}`
    : undefined;
  const pct = total ? Math.min(100, (episodes / total) * 100) : 0;

  const englishTitle = node.alternative_titles?.en;
  const myScore = listStatus.score ?? 0;
  // Reads the live `episodes` state, not listStatus, so the badge clears as soon as the
  // viewer bumps their progress — without waiting for a refetch.
  const hasNewEpisode = hasUnwatchedNewEpisode(schedule, episodes);

  return (
    <>
      <div
        data-testid={`anime-list-row-${node.id}`}
        className="relative flex items-start gap-3 rounded-xl border border-border bg-surface p-3 sm:gap-4 mx-4 sm:mx-0"
      >
        <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-muted sm:h-24 sm:w-16">
          {node.main_picture && (
            <Image src={node.main_picture.medium} alt="" fill sizes="64px" className="object-cover" />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="min-w-0">
            {hasNewEpisode && (
              <span className="mb-1 inline-flex items-center rounded-full bg-accent px-1.5 py-0.5 text-[0.6rem] font-bold uppercase leading-none tracking-wide text-accent-foreground sm:text-[0.65rem]">
                New
              </span>
            )}
            {/* Stretched link: its ::after covers the whole card so any click opens the details page,
                while the action buttons sit above it on their own stacking layer. */}
            <Link
              href={`/anime/${node.id}`}
              className="line-clamp-2 text-sm font-semibold text-foreground after:absolute after:inset-0 after:rounded-xl sm:text-base"
            >
              {node.title}
            </Link>
            {englishTitle && <p className="line-clamp-1 text-xs text-muted sm:text-sm">{englishTitle}</p>}
          </div>

          <p className="text-xs text-muted sm:text-sm">
            {formatMediaType(node.media_type)}
            {seasonLabel ? ` · ${seasonLabel}` : ""}
            {node.status && (
              <span className={PUBLICATION_STATUS_CLASS[node.status]}> · {formatAnimeStatus(node.status)}</span>
            )}
          </p>

          <GenreChips genres={node.genres} title={node.title} variant="muted" />

          {(node.mean !== undefined || myScore > 0) && (
            <div className="flex items-center gap-2">
              {node.mean !== undefined && <ScoreBadge mean={node.mean} />}
              {myScore > 0 && (
                <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-1.5 py-0.5 text-xs font-semibold text-accent">
                  <Star className="size-3" fill="currentColor" />
                  My {myScore}
                </span>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
            <span className="shrink-0 text-xs font-medium text-muted sm:text-sm">
              {episodes} / {total ?? "?"} ep
            </span>
          </div>
        </div>

        <div className="relative z-10 flex shrink-0 flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Edit"
            onClick={() => {
              setEditSession((s) => s + 1);
              setEditOpen(true);
            }}
            className="border-border/60"
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Increase episodes watched"
            onClick={handleIncrement}
            disabled={isPending || atMax}
            className="border-border/60"
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      </div>

      <AnimeListEditModal
        key={editSession}
        node={node}
        listStatus={{ ...listStatus, num_episodes_watched: episodes }}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={(update) => {
          if (update.num_episodes_watched !== undefined) setEpisodes(update.num_episodes_watched);
          onUpdated(update);
        }}
        onRemoved={onRemoved}
      />
    </>
  );
}
