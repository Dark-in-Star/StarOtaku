"use client";

import { useState, type ReactNode } from "react";
import { useInfiniteScroll, sentinelIndex } from "@/lib/useInfiniteScroll";

// Rows stack one per line, so the second-to-last row is two items from the end.
const ITEMS_PER_ROW = 1;

export function RevealList({ items, pageSize = 60 }: { items: ReactNode[]; pageSize?: number }) {
  const [count, setCount] = useState(pageSize);
  const visible = items.slice(0, count);
  const remaining = items.length - count;

  const sentinelAt = sentinelIndex(visible.length, ITEMS_PER_ROW);
  const sentinelRef = useInfiniteScroll(() => setCount((c) => c + pageSize), remaining > 0);

  return (
    <div className="flex flex-col gap-2.5">
      {visible.map((item, index) => (
        <div key={index} className="relative">
          {index === sentinelAt && (
            <div ref={sentinelRef} aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px" />
          )}
          {item}
        </div>
      ))}
    </div>
  );
}
