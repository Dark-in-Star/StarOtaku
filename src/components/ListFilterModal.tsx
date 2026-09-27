"use client";

import { useState } from "react";
import clsx from "clsx";
import { RotateCcw, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/DateField";
import { RangeSlider } from "@/components/RangeSlider";
import {
  DEFAULT_LIST_FILTERS,
  RATING_MAX,
  RATING_MIN,
  type GenreFacet,
  type ListFilters,
} from "@/lib/list-filters";

const CURRENT_YEAR = new Date().getFullYear();

const DATE_PRESETS: { label: string; dateFrom: string; dateTo: string }[] = [
  { label: "Any time", dateFrom: "", dateTo: "" },
  { label: "This year", dateFrom: `${CURRENT_YEAR}-01-01`, dateTo: "" },
  { label: "Last 5 years", dateFrom: `${CURRENT_YEAR - 5}-01-01`, dateTo: "" },
  {
    label: "Last 10 years",
    dateFrom: `${CURRENT_YEAR - 10}-01-01`,
    dateTo: "",
  },
  { label: "Older", dateFrom: "", dateTo: `${CURRENT_YEAR - 10}-12-31` },
];

export function ListFilterModal({
  open,
  onOpenChange,
  genreFacets,
  filters,
  onApply,
  typeOptions,
  type,
  onTypeChange,
  airingStatusOptions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  genreFacets: GenreFacet[];
  filters: ListFilters;
  onApply: (filters: ListFilters) => void;
  typeOptions?: { value: string; label: string }[];
  type?: string;
  onTypeChange?: (type: string) => void;
  airingStatusOptions?: { value: string; label: string }[];
}) {
  const [draft, setDraft] = useState(filters);
  // Re-seed the draft from committed filters each time the modal opens, without
  // an effect: React supports adjusting state during render for this exact case.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(filters);
  }

  function toggleGenre(id: number) {
    setDraft((prev) => ({
      ...prev,
      genres: prev.genres.includes(id)
        ? prev.genres.filter((g) => g !== id)
        : [...prev.genres, id],
    }));
  }

  function toggleAiringStatus(value: string) {
    setDraft((prev) => ({
      ...prev,
      airingStatuses: prev.airingStatuses.includes(value)
        ? prev.airingStatuses.filter((s) => s !== value)
        : [...prev.airingStatuses, value],
    }));
  }

  function handleApply() {
    onApply(draft);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="inset-0 top-0 left-0 flex h-full max-h-full w-full max-w-full translate-x-0 translate-y-0 flex-col gap-0 overflow-y-auto rounded-none border-0 p-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-auto sm:max-h-[85vh] sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
          >
            <X className="size-4" />
          </Button>
          <DialogTitle className="text-base font-bold text-foreground">
            Filters
          </DialogTitle>
          <Button
            type="button"
            variant="link"
            onClick={() => setDraft(DEFAULT_LIST_FILTERS)}
            className="h-auto gap-1 p-0 text-sm font-semibold text-muted hover:text-danger"
          >
            <RotateCcw className="size-3.5" />
            Clear
          </Button>
        </div>
        <DialogDescription className="sr-only">
          Filter your list by airing status, genre, rating, and release date.
        </DialogDescription>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 py-5">
          {typeOptions && typeOptions.length > 0 && (
            <div className="flex flex-col gap-3 sm:hidden">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                Type
              </span>
              <div className="flex flex-wrap gap-2">
                {typeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onTypeChange?.(option.value)}
                    className={clsx(
                      "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                      type === option.value
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-surface text-muted hover:border-accent hover:text-accent",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Rating
          </span>
          <RangeSlider
            min={RATING_MIN}
            max={RATING_MAX}
            step={0.5}
            valueMin={draft.ratingMin}
            valueMax={draft.ratingMax}
            onChange={(ratingMin, ratingMax) =>
              setDraft((prev) => ({ ...prev, ratingMin, ratingMax }))
            }
            formatValue={(value) => value.toFixed(1)}
          />

          <div className="flex flex-col gap-3 border-t border-border pt-5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Release Date
            </span>

            <div className="flex flex-wrap gap-2">
              {DATE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      dateFrom: preset.dateFrom,
                      dateTo: preset.dateTo,
                    }))
                  }
                  className={clsx(
                    "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                    draft.dateFrom === preset.dateFrom &&
                      draft.dateTo === preset.dateTo
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border bg-surface text-muted hover:border-accent hover:text-accent",
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex flex-1 flex-col gap-1">
                <span className="text-xs text-muted">From</span>
                <DateField
                  label="From date"
                  value={draft.dateFrom}
                  maxDate={draft.dateTo || undefined}
                  onChange={(dateFrom) =>
                    setDraft((prev) => ({ ...prev, dateFrom }))
                  }
                />
              </div>
              <span className="mt-5 shrink-0 text-muted">–</span>
              <div className="flex flex-1 flex-col gap-1">
                <span className="text-xs text-muted">To</span>
                <DateField
                  label="To date"
                  value={draft.dateTo}
                  minDate={draft.dateFrom || undefined}
                  onChange={(dateTo) =>
                    setDraft((prev) => ({ ...prev, dateTo }))
                  }
                />
              </div>
            </div>
          </div>
          {airingStatusOptions && airingStatusOptions.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-border pt-5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                Airing Status
              </span>
              <div className="flex flex-wrap gap-2">
                {airingStatusOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={draft.airingStatuses.includes(option.value)}
                    onClick={() => toggleAiringStatus(option.value)}
                    className={clsx(
                      "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                      draft.airingStatuses.includes(option.value)
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-surface text-muted hover:border-accent hover:text-accent",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-3 border-t border-border pt-5">
            {genreFacets.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Genres
                </span>
                <div className="flex flex-wrap gap-2">
                  {genreFacets.map((genre) => (
                    <button
                      key={genre.id}
                      type="button"
                      onClick={() => toggleGenre(genre.id)}
                      className={clsx(
                        "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                        draft.genres.includes(genre.id)
                          ? "border-accent bg-accent text-accent-foreground"
                          : "border-border bg-surface text-muted hover:border-accent hover:text-accent",
                      )}
                    >
                      {genre.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-border px-4 py-3">
          <Button
            type="button"
            onClick={handleApply}
            className="h-10 w-full text-sm font-semibold"
          >
            Show results
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
