"use client";

import { useEffect, useRef } from "react";

/**
 * Returns a ref to attach to a sentinel element; `onReach` fires whenever that element
 * scrolls into view. Callers place the sentinel ahead of the end of the list (see
 * `sentinelIndex`) so the next page starts loading before the user hits the bottom.
 *
 * `onReach` is read through a ref so a fresh closure each render doesn't tear down and
 * re-create the observer (which would re-fire on an element already in view).
 */
export function useInfiniteScroll(onReach: () => void, enabled: boolean) {
  const targetRef = useRef<HTMLDivElement | null>(null);
  const onReachRef = useRef(onReach);

  useEffect(() => {
    onReachRef.current = onReach;
  }, [onReach]);

  useEffect(() => {
    const target = targetRef.current;
    if (!enabled || !target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onReachRef.current();
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [enabled]);

  return targetRef;
}

/**
 * Index of the item that should carry the sentinel: the start of the second-to-last row,
 * given how many items fit on one row at the widest breakpoint. Falls back to the first
 * item while the list is shorter than the trigger distance.
 */
export function sentinelIndex(total: number, perRow: number) {
  return Math.max(0, total - perRow * 2);
}
