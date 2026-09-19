"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Sparkles } from "lucide-react";
import { AnimeListRow } from "./AnimeListRow";
import { EmptyState } from "./EmptyState";
import { ListFilterButton } from "./ListFilterButton";
import { ListSearchBar } from "./ListSearchBar";
import { MediaTypeToggle } from "./MediaTypeToggle";
import { RevealList } from "./RevealList";
import { ScrollableTabRow } from "./ScrollableTabRow";
import { SequelPromo } from "./SequelPromo";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ANIME_LIST_STATUS_LABELS } from "@/lib/format";
import { matchesListFilters, matchesQuery } from "@/lib/list-filters";
import { selectScannableEntries } from "@/lib/sequels";
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks";
import { clearSearchAndFilters, setFilters, setQuery, setSort, setStatus, setType } from "@/lib/store/listFiltersSlice";
import type { AnimeNode, ListNode, ListStatus, MyListStatus, NextAiringEpisode } from "@/lib/types";

type Entry = ListNode<AnimeNode, MyListStatus>;

const STATUS_TABS: { value: ListStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  ...(Object.entries(ANIME_LIST_STATUS_LABELS) as [ListStatus, string][]).map(([value, label]) => ({
    value,
    label,
  })),
];

const TYPE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "tv", label: "TV" },
  { value: "ona", label: "ONA" },
  { value: "ova", label: "OVA" },
  { value: "movie", label: "Movie" },
  { value: "special", label: "Special" },
  { value: "cm", label: "CM" },
  { value: "pv", label: "PV" },
  { value: "tv_special", label: "TV Special" },
];

const SORT_OPTIONS = [
  { value: "title", label: "Alphabetical" },
  { value: "score", label: "Score" },
  { value: "episodes", label: "Episodes Watched" },
  { value: "start_date", label: "Air Start Date" },
  { value: "updated", label: "Last Updated" },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]["value"];

const COMPARATORS: Record<SortValue, (a: Entry, b: Entry) => number> = {
  title: (a, b) => a.node.title.localeCompare(b.node.title),
  score: (a, b) => (b.list_status.score ?? 0) - (a.list_status.score ?? 0),
  episodes: (a, b) => (b.list_status.num_episodes_watched ?? 0) - (a.list_status.num_episodes_watched ?? 0),
  start_date: (a, b) => (b.node.start_date ?? "").localeCompare(a.node.start_date ?? ""),
  updated: (a, b) => (b.list_status.updated_at ?? "").localeCompare(a.list_status.updated_at ?? ""),
};

export function AnimeListBrowser({
  entries: initialEntries,
  initialStatus,
  schedules = {},
}: {
  entries: Entry[];
  initialStatus: ListStatus | "all";
  /** Next-airing schedules keyed by MAL id, for currently-airing shows being watched. */
  schedules?: Record<number, NextAiringEpisode>;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const dispatch = useAppDispatch();
  const status = useAppSelector((s) => s.listFilters.anime.status) as ListStatus | "all";
  const type = useAppSelector((s) => s.listFilters.anime.type);
  const sort = useAppSelector((s) => s.listFilters.anime.sort) as SortValue;
  const filters = useAppSelector((s) => s.listFilters.anime.filters);
  const query = useAppSelector((s) => s.listFilters.anime.query);

  useEffect(() => {
    if (initialStatus !== "all") {
      dispatch(setStatus({ media: "anime", status: initialStatus }));
    }
    // Only sync an explicit deep-link status on mount — subsequent tab clicks own the state from here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    return entries.reduce<Record<string, number>>((acc, e) => {
      const key = e.list_status.status ?? "unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
  }, [entries]);

  const scannableCount = useMemo(() => selectScannableEntries(entries).length, [entries]);

  const statusTypeFiltered = useMemo(() => {
    return entries
      .filter((e) => status === "all" || e.list_status.status === status)
      .filter((e) => type === "all" || e.node.media_type === type);
  }, [entries, status, type]);

  const filtered = useMemo(() => {
    return statusTypeFiltered
      .filter((e) => matchesListFilters(e.node, filters))
      .filter((e) => matchesQuery(e.node, query))
      .slice()
      .sort(COMPARATORS[sort]);
  }, [statusTypeFiltered, filters, query, sort]);

  function handleUpdated(animeId: number, update: Partial<MyListStatus>) {
    setEntries((prev) =>
      prev.map((e) => (e.node.id === animeId ? { ...e, list_status: { ...e.list_status, ...update } } : e)),
    );
  }

  function handleRemoved(animeId: number) {
    setEntries((prev) => prev.filter((e) => e.node.id !== animeId));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="sticky top-14 z-30 flex flex-col gap-5 border-b border-border bg-surface/90 backdrop-blur sm:top-16 sm:rounded-2xl sm:border px-5 py-3 sm:py-5">
        <div className="hidden flex-wrap items-center gap-3 sm:flex">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold sm:text-2xl">My Anime List</h1>
            <MediaTypeToggle active="anime" />
          </div>
          <ListSearchBar
            value={query}
            onChange={(value) => dispatch(setQuery({ media: "anime", query: value }))}
            placeholder="Search your anime list..."
            hideMobile
          />
        </div>

        <ScrollableTabRow className="-mx-3 border-b border-border px-3 sm:mx-0 sm:px-0">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => dispatch(setStatus({ media: "anime", status: tab.value }))}
              className={clsx(
                "-mb-px shrink-0 whitespace-nowrap border-b-2 px-2.5 py-2.5 text-sm transition-colors sm:px-3.5",
                tab.value === status
                  ? "border-accent font-semibold text-foreground"
                  : "border-transparent font-medium text-muted hover:text-foreground",
              )}
            >
              {tab.label}
              {tab.value !== "all" && counts[tab.value] ? (
                <span className="ml-1 text-xs text-muted">({counts[tab.value]})</span>
              ) : null}
            </button>
          ))}
        </ScrollableTabRow>

        <div className="flex flex-wrap items-center gap-2">
          <div className="hidden sm:block">
            <Select value={type} onValueChange={(value) => dispatch(setType({ media: "anime", type: value }))}>
              <SelectTrigger aria-label="Type" className="w-fit min-w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Select value={sort} onValueChange={(value) => dispatch(setSort({ media: "anime", sort: value }))}>
            <SelectTrigger aria-label="Sort" className="w-fit min-w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <ListFilterButton
            nodes={statusTypeFiltered.map((e) => e.node)}
            filters={filters}
            onChange={(value) => dispatch(setFilters({ media: "anime", filters: value }))}
            typeOptions={TYPE_OPTIONS}
            type={type}
            onTypeChange={(value) => dispatch(setType({ media: "anime", type: value }))}
          />

          <Button asChild variant="outline" className="h-9 gap-1.5">
            <Link href="/mylist/sequels">
              <Sparkles className="size-4 text-accent" />
              <span className="max-sm:sr-only">Find sequels</span>
            </Link>
          </Button>

          <ListSearchBar
            value={query}
            onChange={(value) => dispatch(setQuery({ media: "anime", query: value }))}
            placeholder="Search your anime list..."
            hideDesktop
            mobileDockRight={false}
          />
        </div>
      </div>

      <SequelPromo scannableCount={scannableCount} />

      {filtered.length === 0 ? (
        statusTypeFiltered.length > 0 ? (
          <EmptyState title="No matches" description="Try adjusting or clearing your search and filters.">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => dispatch(clearSearchAndFilters({ media: "anime" }))}
            >
              Clear search &amp; filters
            </Button>
          </EmptyState>
        ) : (
          <EmptyState title="Nothing here yet" description="Anime you add to this status will show up here." />
        )
      ) : (
        <RevealList
          items={filtered.map(({ node, list_status }) => (
            <AnimeListRow
              key={node.id}
              node={node}
              listStatus={list_status}
              schedule={schedules[node.id]}
              onUpdated={(update) => handleUpdated(node.id, update)}
              onRemoved={() => handleRemoved(node.id)}
            />
          ))}
        />
      )}
    </div>
  );
}
