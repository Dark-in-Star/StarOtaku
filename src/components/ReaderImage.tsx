"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Shimmer } from "@/components/Shimmer";
import type { ReaderPage } from "@/lib/reader/types";

/**
 * Most sources give no page dimensions, and an unsized <img> is 0px tall until it decodes —
 * so every lazy page would sit "in view" at once and the whole chapter would download in
 * parallel, with nothing painted meanwhile. A shimmering placeholder of that height until
 * load keeps lazy loading meaningful and shows the page is on its way.
 */
export function ReaderImage({ page, index }: { page: ReaderPage; index: number }) {
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  // An eager page can finish before hydration attaches onLoad, and would otherwise keep its
  // placeholder height forever — padding short strip slices with blank space.
  useEffect(() => {
    if (ref.current?.complete) setLoaded(true);
  }, []);

  const sized = Boolean(page.width && page.height);

  return (
    <div className={cn("relative", !sized && !loaded && "min-h-[70vh]")}>
      {!loaded && (
        <>
          <Shimmer className="absolute inset-0 rounded-none" />
          <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-muted">
            Page {index + 1}
          </span>
        </>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- remote hosts with unknown sizes, served unoptimized */}
      <img
        ref={ref}
        src={page.url}
        alt={`Page ${index + 1}`}
        width={page.width}
        height={page.height}
        loading={index < 2 ? "eager" : "lazy"}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        className="block h-auto w-full"
        data-reader-page={index + 1}
      />
    </div>
  );
}
