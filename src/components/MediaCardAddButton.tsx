"use client";

import { useState, useTransition } from "react";
import { Check, Clock, Loader2, Pause, Play, Plus, X } from "lucide-react";
import { AnimeListEditModal } from "./AnimeListEditModal";
import { MangaListEditModal } from "./MangaListEditModal";
import { ANIME_LIST_STATUS_LABELS, MANGA_LIST_STATUS_LABELS } from "@/lib/format";
import {
  getAnimeListEntryAction,
  getMangaListEntryAction,
  type AnimeListEntry,
  type MangaListEntry,
} from "@/lib/listEntryActions";
import type {
  AnimeNode,
  MangaNode,
  MyListEntryStatus,
  MyListStatus,
  MyMangaListStatusNode,
} from "@/lib/types";

// Each list status gets its own icon *and* colour: colour alone would be invisible to a
// colour-blind visitor, and over a poster thumbnail it can't be relied on for contrast either.
const STATUS_STYLES: Record<MyListEntryStatus, { icon: typeof Check; className: string }> = {
  watching: { icon: Play, className: "border-accent/60 bg-accent text-accent-foreground" },
  reading: { icon: Play, className: "border-accent/60 bg-accent text-accent-foreground" },
  completed: { icon: Check, className: "border-score/60 bg-score text-black" },
  on_hold: { icon: Pause, className: "border-amber-300/60 bg-amber-500 text-black" },
  dropped: { icon: X, className: "border-danger/60 bg-danger text-white" },
  plan_to_watch: { icon: Clock, className: "border-white/40 bg-slate-600 text-white" },
  plan_to_read: { icon: Clock, className: "border-white/40 bg-slate-600 text-white" },
};

const UNTRACKED_CLASS =
  "border-white/25 bg-black/55 text-white hover:border-accent hover:bg-accent hover:text-accent-foreground";

export function MediaCardAddButton({
  id,
  title,
  mediaType,
  media,
  listStatus,
}: {
  id: number;
  title: string;
  mediaType?: string;
  media: "anime" | "manga";
  /** The visitor's current status for this title; undefined means it isn't on their list. */
  listStatus?: MyListEntryStatus;
}) {
  const [status, setStatus] = useState(listStatus);
  const [isLoading, startLoading] = useTransition();
  // The modal only mounts once the real entry (score, progress, episode count) has been
  // fetched — a card knows the status but none of the values behind it, and opening with
  // zeroes would misreport the user's own progress back to them.
  const [entry, setEntry] = useState<AnimeListEntry | MangaListEntry>();

  function openModal() {
    startLoading(async () => {
      try {
        setEntry(media === "anime" ? await getAnimeListEntryAction(id) : await getMangaListEntryAction(id));
      } catch {
        // Fall back to an empty entry so the modal still opens and can add the title.
        setEntry({ node: { id, title, media_type: mediaType } as AnimeNode, listStatus: { score: 0 } });
      }
    });
  }

  function closeModal(next: boolean) {
    if (!next) setEntry(undefined);
  }

  const added = status !== undefined;
  // A tracked entry with an unrecognised status still counts as on-list, so fall back to
  // the generic "completed"-style tick rather than dropping back to a plus.
  const style = (status && STATUS_STYLES[status]) ?? STATUS_STYLES.completed;
  const Icon = added ? style.icon : Plus;
  const statusLabel =
    status &&
    (media === "anime"
      ? (ANIME_LIST_STATUS_LABELS[status] ?? MANGA_LIST_STATUS_LABELS[status])
      : (MANGA_LIST_STATUS_LABELS[status] ?? ANIME_LIST_STATUS_LABELS[status]));

  const label = added
    ? `${title} — ${statusLabel ?? "On your list"}. Edit your list entry`
    : `Add ${title} to your list`;

  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        data-testid={`media-card-add-${id}`}
        onClick={openModal}
        disabled={isLoading}
        className={`absolute right-2 bottom-2 z-10 inline-flex size-8 items-center justify-center rounded-full border shadow-sm backdrop-blur-sm transition-all duration-200 hover:scale-110 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
          added ? style.className : UNTRACKED_CLASS
        }`}
        data-added={added}
        data-status={status}
      >
        {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
      </button>

      {entry &&
        (media === "anime" ? (
          <AnimeListEditModal
            node={entry.node as AnimeNode}
            listStatus={entry.listStatus as MyListStatus}
            isNew={!added}
            open
            onOpenChange={closeModal}
            onSaved={(update) => setStatus(update.status ?? status ?? "watching")}
            onRemoved={() => setStatus(undefined)}
          />
        ) : (
          <MangaListEditModal
            node={entry.node as MangaNode}
            listStatus={entry.listStatus as MyMangaListStatusNode}
            open
            onOpenChange={closeModal}
            onSaved={(update) => setStatus(update.status ?? status ?? "reading")}
            onRemoved={() => setStatus(undefined)}
          />
        ))}
    </>
  );
}
