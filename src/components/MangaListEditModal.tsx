"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { Trash2, X } from "lucide-react";
import { removeMangaAction, updateMangaStatusAction } from "@/lib/actions";
import { MANGA_LIST_STATUS_LABELS, formatDateRange, formatMangaStatus } from "@/lib/format";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollableTabRow } from "@/components/ScrollableTabRow";
import type { MangaListStatus, MangaNode, MyMangaListStatusNode } from "@/lib/types";

const STATUS_OPTIONS = Object.entries(MANGA_LIST_STATUS_LABELS) as [MangaListStatus, string][];
const SCORE_OPTIONS = [0, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

export function MangaListEditModal({
  node,
  listStatus,
  isNew = false,
  open,
  onOpenChange,
  onSaved,
  onRemoved,
}: {
  node: MangaNode;
  listStatus: MyMangaListStatusNode;
  /** True when this manga isn't on the user's list yet — swaps the modal into an "add" flow. */
  isNew?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (update: Partial<MyMangaListStatusNode>) => void;
  onRemoved: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(listStatus.status);
  const [score, setScore] = useState(listStatus.score ?? 0);
  const [chapters, setChapters] = useState(listStatus.num_chapters_read ?? 0);

  const total = node.num_chapters || undefined;
  const chapterOptions = Array.from({ length: (total ?? Math.max(chapters, 12)) + 1 }, (_, i) => i);

  function handleSave() {
    if (!status) return;
    startTransition(async () => {
      await updateMangaStatusAction({ mangaId: node.id, status, score, num_chapters_read: chapters });
      onSaved({ status, score, num_chapters_read: chapters });
      onOpenChange(false);
    });
  }

  function handleRemove() {
    startTransition(async () => {
      await removeMangaAction(node.id);
      onRemoved();
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="inset-0 top-0 left-0 flex h-full max-h-full w-full max-w-full translate-x-0 translate-y-0 flex-col gap-0 overflow-y-auto rounded-none border-0 p-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-auto sm:max-h-[85vh] sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Close" onClick={() => onOpenChange(false)}>
            <X className="size-4" />
          </Button>
          <Button
            type="button"
            variant="link"
            onClick={handleSave}
            disabled={isPending || !status}
            className="h-auto p-0 text-sm font-semibold text-accent disabled:opacity-40"
          >
            {isNew ? "Add" : "Save"}
          </Button>
        </div>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 py-4">
          <div>
            <DialogTitle className="text-base font-bold text-foreground">{node.title}</DialogTitle>
            <DialogDescription className="text-xs text-muted">
              {isNew ? "Add this to your list" : "Edit your list entry"}
            </DialogDescription>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">Status</span>
              <span className="text-xs text-muted">{formatMangaStatus(node.status)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {STATUS_OPTIONS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatus(value)}
                  className={clsx(
                    "rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                    status === value
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border bg-surface text-muted hover:border-accent hover:text-accent",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">Progress</span>
              <span className="text-xs text-muted">{total ?? "?"} ch</span>
            </div>
            <ScrollableTabRow>
              {chapterOptions.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setChapters(n)}
                  aria-label={`Chapter ${n}`}
                  className={clsx(
                    "shrink-0 rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors",
                    n === chapters
                      ? "border-accent text-accent"
                      : "border-transparent text-muted hover:border-border hover:text-foreground",
                  )}
                >
                  {n}
                </button>
              ))}
            </ScrollableTabRow>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Score</span>
            <ScrollableTabRow>
              {SCORE_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setScore(n)}
                  aria-label={n === 0 ? "Not scored" : `Score ${n}`}
                  className={clsx(
                    "shrink-0 rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors",
                    n === score
                      ? "border-accent text-accent"
                      : "border-transparent text-muted hover:border-border hover:text-foreground",
                  )}
                >
                  {n === 0 ? "-" : n}
                </button>
              ))}
            </ScrollableTabRow>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
            <span className="font-semibold text-muted">Published</span>
            <span className="text-foreground">{formatDateRange(node.start_date, node.end_date)}</span>
          </div>
        </div>

        {!isNew && (
          <div className="shrink-0 border-t border-border px-4 py-3">
            <Button
              type="button"
              variant="ghost"
              onClick={handleRemove}
              disabled={isPending}
              className="h-auto w-full justify-start gap-2 p-0 text-sm font-medium text-danger hover:bg-transparent hover:text-danger"
            >
              <Trash2 className="size-4" /> Remove from list
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
