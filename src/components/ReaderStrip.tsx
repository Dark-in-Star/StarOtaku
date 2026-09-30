import Link from "next/link";
import { ChevronLeft, ChevronRight, List } from "lucide-react";
import type { ReaderPage } from "@/lib/reader/types";
import { ReaderImage } from "@/components/ReaderImage";
import { cn } from "@/lib/utils";

interface ChapterLink {
  href: string;
  label: string;
}

interface ReaderStripProps {
  title: string;
  subtitle?: string;
  pages: ReaderPage[];
  indexHref: string;
  previous?: ChapterLink | null;
  next?: ChapterLink | null;
}

function ChapterNav({ indexHref, previous, next }: Pick<ReaderStripProps, "indexHref" | "previous" | "next">) {
  const linkClass = "flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-muted";
  return (
    <nav className="flex items-center justify-between gap-2">
      {previous ? (
        <Link href={previous.href} className={linkClass} prefetch={false} aria-label={`Previous: ${previous.label}`}>
          <ChevronLeft className="size-4" /> Prev
        </Link>
      ) : (
        <span className={cn(linkClass, "pointer-events-none opacity-40")}>
          <ChevronLeft className="size-4" /> Prev
        </span>
      )}
      <Link href={indexHref} className={linkClass} prefetch={false}>
        <List className="size-4" /> Chapters
      </Link>
      {next ? (
        <Link href={next.href} className={linkClass} prefetch={false} aria-label={`Next: ${next.label}`}>
          Next <ChevronRight className="size-4" />
        </Link>
      ) : (
        <span className={cn(linkClass, "pointer-events-none opacity-40")}>
          Next <ChevronRight className="size-4" />
        </span>
      )}
    </nav>
  );
}

/**
 * A vertical long strip — the one layout that works for manga, manhwa and doujinshi alike
 * without knowing reading direction.
 */
export function ReaderStrip({ title, subtitle, pages, indexHref, previous, next }: ReaderStripProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-bold text-foreground">{title}</h1>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>

      <ChapterNav indexHref={indexHref} previous={previous} next={next} />

      {pages.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted">
          This chapter&apos;s pages could not be loaded.
        </p>
      ) : (
        <div className="-mx-4 flex flex-col sm:mx-0" data-testid="reader-pages">
          {pages.map((page, index) => (
            <ReaderImage key={page.url} page={page} index={index} />
          ))}
        </div>
      )}

      <ChapterNav indexHref={indexHref} previous={previous} next={next} />
    </div>
  );
}
