"use client";

import { useCallback, useRef, useState } from "react";
import { updateMangaStatusAction } from "./actions";
import { readProgressUpdate, setReadProgress, type ReadProgress, type ReadProgressUpdate } from "./readProgress";

export type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Local copy of the user's MAL chapter progress for one manga. Updates show immediately
 * and roll back if MAL rejects them. A ref mirrors the state so rapid calls (e.g. marking a
 * chapter and pressing Next straight away) each build on the latest value, not a stale render.
 */
export function useReadProgress({
  mangaId,
  initial,
  total,
  enabled,
}: {
  mangaId: number;
  initial: ReadProgress;
  total?: number;
  enabled: boolean;
}) {
  const [progress, setProgress] = useState(initial);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const latest = useRef(initial);

  const apply = useCallback(
    async (update: ReadProgressUpdate | null) => {
      if (!enabled || !update) return;
      const previous = latest.current;
      const next = { read: update.num_chapters_read, status: update.status };
      latest.current = next;
      setProgress(next);
      setSaveState("saving");
      try {
        await updateMangaStatusAction({ mangaId, ...update });
        setSaveState("saved");
      } catch {
        latest.current = previous;
        setProgress(previous);
        setSaveState("error");
      }
    },
    [enabled, mangaId],
  );

  /** "Finished this chapter" — forward-only. */
  const markRead = useCallback(
    (chapter: { number: number | null }) => apply(readProgressUpdate(chapter, latest.current, total)),
    [apply, total],
  );

  /** "I've read exactly this many" — may rewind; an explicit correction. */
  const setRead = useCallback((read: number) => apply(setReadProgress(read, latest.current, total)), [apply, total]);

  return { progress, saveState, markRead, setRead };
}
