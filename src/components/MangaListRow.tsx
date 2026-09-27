"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Pencil, Plus, Star } from "lucide-react";
import { updateMangaStatusAction } from "@/lib/actions";
import { formatMangaStatus, formatMediaType } from "@/lib/format";
import type { MangaNode, MyMangaListStatusNode } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ScoreBadge } from "./ScoreBadge";
import { MangaListEditModal } from "./MangaListEditModal";
import { GenreChips } from "./GenreChips";

export function MangaListRow({
  node,
  listStatus,
  onUpdated,
  onRemoved,
}: {
  node: MangaNode;
  listStatus: MyMangaListStatusNode;
  onUpdated: (update: Partial<MyMangaListStatusNode>) => void;
  onRemoved: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [chapters, setChapters] = useState(listStatus.num_chapters_read ?? 0);
  const [editOpen, setEditOpen] = useState(false);
  const [editSession, setEditSession] = useState(0);

  const total = node.num_chapters || undefined;
  const atMax = total !== undefined && chapters >= total;

  function handleIncrement() {
    if (atMax) return;
    const next = chapters + 1;
    setChapters(next);

    const update: Partial<MyMangaListStatusNode> = { num_chapters_read: next };
    if (!listStatus.status || listStatus.status === "plan_to_read" || listStatus.status === "on_hold") {
      update.status = "reading";
    }
    if (total !== undefined && next >= total) {
      update.status = "completed";
    }

    onUpdated(update);
    startTransition(() =>
      updateMangaStatusAction({ mangaId: node.id, num_chapters_read: next, status: update.status }),
    );
  }

  const pct = total ? Math.min(100, (chapters / total) * 100) : 0;

  const englishTitle = node.alternative_titles?.en;
  const isPublishing = node.status === "currently_publishing";
  const myScore = listStatus.score ?? 0;

  return (
    <>
      <div
        data-testid={`manga-list-row-${node.id}`}
        className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3 sm:gap-4 mx-4 sm:mx-0"
      >
        <Link
          href={`/manga/${node.id}`}
          className="relative h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-muted sm:h-24 sm:w-16"
        >
          {node.main_picture && (
            <Image src={node.main_picture.medium} alt={node.title} fill sizes="64px" className="object-cover" />
          )}
        </Link>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="min-w-0">
            <Link
              href={`/manga/${node.id}`}
              className="line-clamp-2 text-sm font-semibold text-foreground hover:text-accent sm:text-base"
            >
              {node.title}
            </Link>
            {englishTitle && <p className="line-clamp-1 text-xs text-muted sm:text-sm">{englishTitle}</p>}
          </div>

          <p className="text-xs text-muted sm:text-sm">
            {formatMediaType(node.media_type)}
            {isPublishing && <span className="font-medium text-score"> · {formatMangaStatus(node.status)}</span>}
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
              {chapters} / {total ?? "?"} ch
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2">
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
            aria-label="Increase chapters read"
            onClick={handleIncrement}
            disabled={isPending || atMax}
            className="border-border/60"
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      </div>

      <MangaListEditModal
        key={editSession}
        node={node}
        listStatus={{ ...listStatus, num_chapters_read: chapters }}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={(update) => {
          if (update.num_chapters_read !== undefined) setChapters(update.num_chapters_read);
          onUpdated(update);
        }}
        onRemoved={onRemoved}
      />
    </>
  );
}
