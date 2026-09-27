"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { MediaCard } from "./MediaCard";
import { MediaGrid } from "./MediaGrid";
import { EmptyState } from "./EmptyState";
import { Button } from "@/components/ui/button";
import { planSequelScanAction, scanSequelChunkAction } from "@/lib/sequelActions";
import { accumulateSuggestions, SCAN_BATCH_SIZE, type SequelSuggestion } from "@/lib/sequels";
import type { MyListEntryStatus } from "@/lib/types";

type Phase = "idle" | "scanning" | "done" | "error";

export function SequelFinder() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [includeSideStories, setIncludeSideStories] = useState(false);
  const [scanned, setScanned] = useState(0);
  const [total, setTotal] = useState(0);
  const [failed, setFailed] = useState(0);
  const [suggestions, setSuggestions] = useState<SequelSuggestion[]>([]);
  const [statusById, setStatusById] = useState<Record<number, MyListEntryStatus>>({});
  const [error, setError] = useState<string>();

  // Lets an in-flight scan be abandoned when the user restarts or leaves the page.
  const runIdRef = useRef(0);

  // Server Actions share one per-client queue, so a scan that outlives this page would keep
  // enqueueing chunks ahead of every other page's actions (list edits, infinite scroll) and
  // keep spending MAL's rate limit on results nobody will see.
  useEffect(() => {
    const runs = runIdRef;
    return () => {
      runs.current += 1;
    };
  }, []);

  const runScan = useCallback(async () => {
    const runId = ++runIdRef.current;
    setPhase("scanning");
    setSuggestions([]);
    setScanned(0);
    setFailed(0);
    setError(undefined);

    try {
      const plan = await planSequelScanAction();
      if (runIdRef.current !== runId) return;

      setStatusById(plan.statusById);
      setTotal(plan.targets.length);
      if (plan.targets.length === 0) {
        setPhase("done");
        return;
      }

      for (let offset = 0; offset < plan.targets.length; offset += SCAN_BATCH_SIZE) {
        if (runIdRef.current !== runId) return;

        const slice = plan.targets.slice(offset, offset + SCAN_BATCH_SIZE);
        const result = await scanSequelChunkAction(slice, plan.onList, includeSideStories);
        if (runIdRef.current !== runId) return;

        setSuggestions((prev) => accumulateSuggestions(prev, result.suggestions));
        setScanned(Math.min(offset + slice.length, plan.targets.length));
        setFailed((prev) => prev + result.failed);

        if (result.rateLimited) {
          throw new Error(
            "MyAnimeList started rate-limiting the scan. Wait a few minutes, then scan again — titles already checked are cached, so it picks up quickly.",
          );
        }
      }

      setPhase("done");
    } catch (e) {
      if (runIdRef.current !== runId) return;
      setError(e instanceof Error ? e.message : "Something went wrong during the scan.");
      setPhase("error");
    }
  }, [includeSideStories]);

  const pct = total > 0 ? Math.round((scanned / total) * 100) : 0;
  const isScanning = phase === "scanning";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 my-5 rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
              <Sparkles className="size-5 text-accent" />
              Find sequels
            </h1>
            <p className="max-w-prose text-sm text-muted">
              Checks everything you&apos;ve watched, are watching, or plan to watch for follow-ups that aren&apos;t
              on your list yet.
            </p>
          </div>

          <Button type="button" onClick={runScan} disabled={isScanning} className="shrink-0">
            {isScanning ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Scanning…
              </>
            ) : phase === "done" ? (
              <>
                <RefreshCw className="size-4" /> Scan again
              </>
            ) : (
              <>
                <Sparkles className="size-4" /> Start scan
              </>
            )}
          </Button>
        </div>

        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={includeSideStories}
            onChange={(e) => setIncludeSideStories(e.target.checked)}
            disabled={isScanning}
            className="size-4 accent-accent"
          />
          Include side stories &amp; spin-offs
        </label>

        {isScanning && (
          <div className="flex flex-col gap-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-muted" aria-live="polite">
              Checked {scanned} of {total} — found {suggestions.length} so far
            </p>
          </div>
        )}

        {phase === "done" && (
          <p className="text-sm text-muted" aria-live="polite">
            Scanned {total} {total === 1 ? "title" : "titles"} — found {suggestions.length}{" "}
            {suggestions.length === 1 ? "suggestion" : "suggestions"}.
            {failed > 0 && ` ${failed} couldn't be checked.`}
          </p>
        )}
      </div>

      {phase === "error" && <EmptyState title="Scan failed" description={error ?? "Please try again."} />}

      {phase === "done" && suggestions.length === 0 && total > 0 && (
        <EmptyState
          title="You're all caught up"
          description="Every sequel to what you've watched is already on your list."
        />
      )}

      {phase === "done" && total === 0 && (
        <EmptyState
          title="Nothing to scan yet"
          description="Add some anime to your list — watched, watching, or planned — then come back to find their sequels."
        />
      )}

      {suggestions.length > 0 && (
        <MediaGrid>
          {suggestions.map((suggestion) => (
            <div key={suggestion.node.id} className="flex flex-col gap-1.5">
              <MediaCard
                id={suggestion.node.id}
                media="anime"
                href={`/anime/${suggestion.node.id}`}
                title={suggestion.node.title}
                imageUrl={suggestion.node.main_picture?.large ?? suggestion.node.main_picture?.medium}
                mean={suggestion.node.mean}
                genres={suggestion.node.genres}
                mediaType={suggestion.node.media_type}
                subtitle={suggestion.relationLabel}
                listStatus={statusById[suggestion.node.id]}
              />
              {suggestion.sources[0] && (
                <p className="px-1 text-[0.7rem] leading-snug text-muted">
                  Follows <span className="text-foreground">{suggestion.sources[0].title}</span>
                  {suggestion.sources.length > 1 && ` +${suggestion.sources.length - 1} more`}
                </p>
              )}
            </div>
          ))}
        </MediaGrid>
      )}
    </div>
  );
}
