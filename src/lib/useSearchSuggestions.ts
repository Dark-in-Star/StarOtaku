"use client";

import { useEffect, useRef, useState } from "react";
import { searchSuggestions, type SearchSuggestionsResult } from "./browseActions";

// Long enough that a steady typist triggers one MAL search per pause, not per keystroke —
// the app shares one rate-limited client ID across every visitor.
const DEBOUNCE_MS = 300;

export function useSearchSuggestions(query: string) {
  const q = query.trim();
  const active = q.length > 0;
  const [latest, setLatest] = useState<{ q: string; result: SearchSuggestionsResult } | null>(null);
  const cache = useRef(new Map<string, SearchSuggestionsResult>());

  useEffect(() => {
    if (!active) return;
    const key = q.toLowerCase();
    const cached = cache.current.get(key);
    let cancelled = false;

    const timer = setTimeout(
      async () => {
        let result = cached;
        if (!result) {
          try {
            result = await searchSuggestions(q);
          } catch {
            result = { ok: false, message: "Couldn't load suggestions. Press Enter to search anyway." };
          }
          if (result.ok) cache.current.set(key, result);
        }
        if (!cancelled) setLatest({ q, result });
      },
      cached ? 0 : DEBOUNCE_MS,
    );

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, active]);

  return {
    loading: active && latest?.q !== q,
    // Kept while the next query loads so the list doesn't flash empty between keystrokes.
    result: active ? latest?.result : undefined,
    /** The query `result` actually answers — lags `query` while a newer search is in flight. */
    resultFor: active ? latest?.q : undefined,
  };
}
