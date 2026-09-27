"use client";

import { useState } from "react";
import type { Genre } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MAX_VISIBLE_GENRES } from "@/lib/constants";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { GenreTags } from "./GenreTags";

const CHIP_CLASS = {
  accent:
    "rounded-full border border-accent/25 bg-accent-soft px-2 py-0.5 text-[0.65rem] font-semibold text-accent sm:text-xs",
  muted: "rounded-full bg-surface-muted px-2 py-0.5 text-[0.65rem] font-medium text-muted sm:text-xs",
};

const EXTRA_CLASS = {
  accent: "rounded-full border border-border/60 px-2 py-0.5 text-[0.65rem] font-semibold text-muted sm:text-xs",
  muted: "text-[0.65rem] text-muted sm:text-xs",
};

export function GenreChips({
  genres,
  title,
  variant,
  className,
}: {
  genres?: Genre[];
  /** The title the genres belong to — shown in the all-genres dialog. */
  title: string;
  variant: keyof typeof CHIP_CLASS;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const all = genres ?? [];
  if (all.length === 0) return null;

  const visible = all.slice(0, MAX_VISIBLE_GENRES);
  const extraCount = all.length - visible.length;
  const chips = (
    <>
      {visible.map((genre) => (
        <span key={genre.id} className={CHIP_CLASS[variant]}>
          {genre.name}
        </span>
      ))}
      {extraCount > 0 && <span className={EXTRA_CLASS[variant]}>+{extraCount}</span>}
    </>
  );

  if (extraCount === 0) {
    return <div className={cn("flex flex-wrap items-center gap-1", className)}>{chips}</div>;
  }

  return (
    <>
      {/* Lifted above the card's stretched link so a click here opens the dialog instead of navigating. */}
      <button
        type="button"
        aria-label={`Show all ${all.length} genres`}
        onClick={() => setOpen(true)}
        className={cn(
          "relative z-10 flex w-fit cursor-pointer flex-wrap items-center gap-1 rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          className,
        )}
      >
        {chips}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <div className="flex flex-col gap-1 pr-6">
            <DialogTitle>Genres</DialogTitle>
            <DialogDescription className="line-clamp-2">{title}</DialogDescription>
          </div>
          <GenreTags genres={all} />
        </DialogContent>
      </Dialog>
    </>
  );
}
