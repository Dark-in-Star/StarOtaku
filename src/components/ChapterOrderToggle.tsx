"use client";

import Link from "next/link";
import { ArrowDownNarrowWide, ArrowUpNarrowWide } from "lucide-react";
import { CHAPTER_ORDER_COOKIE, type ChapterOrder } from "@/lib/reader/chapters";
import { cn } from "@/lib/utils";

const ONE_YEAR_SECONDS = 31_536_000;

const OPTIONS: { value: ChapterOrder; label: string; icon: typeof ArrowUpNarrowWide }[] = [
  { value: "oldest", label: "Oldest first", icon: ArrowUpNarrowWide },
  { value: "newest", label: "Newest first", icon: ArrowDownNarrowWide },
];

/**
 * The choice travels in the URL (so the list re-renders server-side) and is also kept in a
 * cookie, so it sticks across titles and the reader's "Chapters" link can return to the
 * right page of the list in the right order.
 */
export function ChapterOrderToggle({ order, hrefFor }: { order: ChapterOrder; hrefFor: Record<ChapterOrder, string> }) {
  return (
    <div role="group" aria-label="Chapter order" className="flex rounded-lg border border-border bg-surface p-0.5">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <Link
          key={value}
          href={hrefFor[value]}
          prefetch={false}
          aria-current={order === value ? "true" : undefined}
          onClick={() => {
            document.cookie = `${CHAPTER_ORDER_COOKIE}=${value}; Max-Age=${ONE_YEAR_SECONDS}; Path=/; SameSite=Lax`;
          }}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            order === value ? "bg-surface-muted text-foreground" : "text-muted hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" />
          {label}
        </Link>
      ))}
    </div>
  );
}
