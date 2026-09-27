"use client";

import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ListFilterModal } from "@/components/ListFilterModal";
import {
  DEFAULT_LIST_FILTERS,
  collectGenreFacets,
  countActiveFilters,
  mergeGenreFacets,
  type ListFilters,
} from "@/lib/list-filters";
import type { Genre } from "@/lib/types";

export function ListFilterButton({
  nodes,
  allGenres,
  filters,
  onChange,
  typeOptions,
  type,
  onTypeChange,
  airingStatusOptions,
}: {
  nodes: { genres?: Genre[]; mean?: number; start_date?: string }[];
  allGenres?: Genre[];
  filters: ListFilters;
  onChange: (filters: ListFilters) => void;
  typeOptions?: { value: string; label: string }[];
  type?: string;
  onTypeChange?: (type: string) => void;
  airingStatusOptions?: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const activeCount = countActiveFilters(filters);
  const genreFacets = allGenres && allGenres.length > 0 ? mergeGenreFacets(allGenres, nodes) : collectGenreFacets(nodes);

  return (
    <>
      <div className="ml-auto flex items-center gap-1">
        <Button type="button" variant="outline" onClick={() => setOpen(true)} className="gap-1.5">
          <SlidersHorizontal className="h-4 w-4" />
          Filter
          {activeCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-xs font-semibold text-accent-foreground">
              {activeCount}
            </span>
          )}
        </Button>

        {activeCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Clear filters"
            title="Clear filters"
            onClick={() => onChange(DEFAULT_LIST_FILTERS)}
            className="text-muted hover:text-danger"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <ListFilterModal
        open={open}
        onOpenChange={setOpen}
        genreFacets={genreFacets}
        filters={filters}
        onApply={onChange}
        typeOptions={typeOptions}
        type={type}
        onTypeChange={onTypeChange}
        airingStatusOptions={airingStatusOptions}
      />
    </>
  );
}
