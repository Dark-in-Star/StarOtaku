import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, ExternalLink } from "lucide-react";
import { ApiError, getManga } from "@/lib/api";
import { isReaderSource, resolveReadableManga, SOURCE_LABELS, type ReaderSourceId, type SourceOutcome } from "@/lib/reader";
import { cookies } from "next/headers";
import {
  CHAPTER_ORDER_COOKIE,
  CHAPTERS_PER_PAGE,
  orderChapters,
  parseChapterOrder,
  readableChapterCount,
  type ChapterOrder,
} from "@/lib/reader/chapters";
import { ChapterOrderToggle } from "@/components/ChapterOrderToggle";
import { clampPage } from "@/lib/pagination";
import { Pagination } from "@/components/Pagination";
import { readerTargetFromManga } from "@/lib/reader/target";
import { adultReaderEnabled, hasAdultConsent } from "@/lib/reader/adultGate";
import { AdultConsentGate } from "@/components/AdultConsentGate";
import { cn } from "@/lib/utils";

async function loadManga(id: number) {
  try {
    return await getManga(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const manga = await loadManga(Number(id));
  return { title: `Read ${manga.title}` };
}

function outcomeSummary(outcome: SourceOutcome | undefined): string {
  if (!outcome) return "Not checked";
  if (outcome.status === "error") return "Unreachable";
  if (outcome.status === "not-found") return "Not found";
  return `${readableChapterCount(outcome.series.chapters)} chapters`;
}

export default async function ReadMangaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ source?: string; page?: string; order?: string }>;
}) {
  const [{ id }, { source: requested, page: rawPage, order: rawOrder }, cookieStore] = await Promise.all([
    params,
    searchParams,
    cookies(),
  ]);
  const order = parseChapterOrder(rawOrder) ?? parseChapterOrder(cookieStore.get(CHAPTER_ORDER_COOKIE)?.value) ?? "oldest";
  const manga = await loadManga(Number(id));
  const target = readerTargetFromManga(manga);
  if (target.adult && !(await hasAdultConsent())) return <AdultConsentGate />;
  const readable = await resolveReadableManga(target, { allowNhentai: adultReaderEnabled() });

  const requestedOutcome = requested && isReaderSource(requested) ? readable.outcomes[requested] : undefined;
  const series = requestedOutcome?.status === "found" ? requestedOutcome.series : readable.primary;
  const allChapters = orderChapters(series?.chapters ?? [], order);
  const totalPages = Math.ceil(allChapters.length / CHAPTERS_PER_PAGE);
  const page = clampPage(rawPage, totalPages);
  const chapters = allChapters.slice((page - 1) * CHAPTERS_PER_PAGE, page * CHAPTERS_PER_PAGE);
  const listHref = (p: number, o: ChapterOrder = order) => {
    const query = new URLSearchParams({
      ...(requested ? { source: requested } : {}),
      order: o,
      ...(p > 1 ? { page: String(p) } : {}),
    });
    return `/manga/${manga.id}/read?${query}`;
  };
  const pageHref = (p: number) => listHref(p);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <Link
        href={`/manga/${manga.id}`}
        className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Back to details
      </Link>

      <div className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4">
        <div className="relative aspect-2/3 w-16 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-muted">
          {manga.main_picture && (
            <Image src={manga.main_picture.large ?? manga.main_picture.medium} alt={manga.title} fill sizes="64px" className="object-cover" />
          )}
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-bold text-foreground">{manga.title}</h1>
          <p className="text-sm text-muted">
            {series ? `Reading from ${SOURCE_LABELS[series.source]}` : "No readable source found"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" data-testid="reader-sources">
        {(Object.keys(SOURCE_LABELS) as ReaderSourceId[])
          .filter((source) => readable.outcomes[source])
          .map((source) => {
            const outcome = readable.outcomes[source];
            const active = series?.source === source;
            const selectable = outcome?.status === "found";
            const label = (
              <>
                <span className="font-semibold">{SOURCE_LABELS[source]}</span>
                <span className="text-muted">{outcomeSummary(outcome)}</span>
              </>
            );
            const className = cn(
              "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm",
              active ? "border-primary bg-primary/10" : "border-border bg-surface",
            );
            return selectable && !active ? (
              <Link key={source} href={`/manga/${manga.id}/read?source=${source}`} className={cn(className, "hover:bg-surface-muted")}>
                {label}
              </Link>
            ) : (
              <span key={source} className={className} data-source={source} data-status={outcome?.status}>
                {label}
              </span>
            );
          })}
      </div>

      {series ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted">
              {totalPages > 1
                ? `Showing ${(page - 1) * CHAPTERS_PER_PAGE + 1}–${(page - 1) * CHAPTERS_PER_PAGE + chapters.length} of ${allChapters.length} chapters`
                : `${allChapters.length} ${allChapters.length === 1 ? "chapter" : "chapters"}`}
            </p>
            {allChapters.length > 1 && (
              // Switching order starts over on page 1: the old page number would land on
              // unrelated chapters once the list is flipped.
              <ChapterOrderToggle order={order} hrefFor={{ oldest: listHref(1, "oldest"), newest: listHref(1, "newest") }} />
            )}
          </div>
          <Pagination page={page} totalPages={totalPages} href={pageHref} />
          <ol className="divide-y divide-border rounded-xl border border-border bg-surface" data-testid="reader-chapters">
            {chapters.map((chapter) => (
              <li key={`${chapter.source}-${chapter.id}`}>
                {chapter.externalUrl ? (
                  <a
                    href={chapter.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-muted hover:bg-surface-muted"
                  >
                    <span className="truncate">{chapter.label}</span>
                    <span className="flex shrink-0 items-center gap-1 text-xs">
                      Official site <ExternalLink className="size-3" />
                    </span>
                  </a>
                ) : (
                  <Link
                    href={`/manga/${manga.id}/read/${chapter.source}/${chapter.id}?order=${order}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-surface-muted"
                    data-chapter-id={chapter.id}
                    prefetch={false}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <BookOpen className="size-3.5 shrink-0 text-muted" />
                      <span className="truncate font-medium text-foreground">{chapter.label}</span>
                      {chapter.title && <span className="truncate text-muted">{chapter.title}</span>}
                    </span>
                    {chapter.group && <span className="shrink-0 truncate text-xs text-muted">{chapter.group}</span>}
                  </Link>
                )}
              </li>
            ))}
          </ol>
          <Pagination page={page} totalPages={totalPages} href={pageHref} />
        </div>
      ) : (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted">
          None of the reader sources carry this title in English.
        </p>
      )}

      {series?.source === "mangadex" && (
        <p className="text-xs text-muted">
          Chapters provided by <a className="underline" href={`https://mangadex.org/title/${series.seriesId}`}>MangaDex</a> and
          the scanlation groups credited on each chapter.
        </p>
      )}
    </div>
  );
}
