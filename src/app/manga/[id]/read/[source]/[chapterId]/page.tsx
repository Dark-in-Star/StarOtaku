import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApiError, getManga } from "@/lib/api";
import { getChapterPages, isReaderSource, resolveReadableManga, SOURCE_LABELS } from "@/lib/reader";
import { readerTargetFromManga } from "@/lib/reader/target";
import { cookies } from "next/headers";
import { CHAPTER_ORDER_COOKIE, chapterListPage, parseChapterOrder } from "@/lib/reader/chapters";
import { adultReaderEnabled, hasAdultConsent } from "@/lib/reader/adultGate";
import { AdultConsentGate } from "@/components/AdultConsentGate";
import { ReaderStrip } from "@/components/ReaderStrip";

type Params = Promise<{ id: string; source: string; chapterId: string }>;

async function loadManga(id: number) {
  try {
    return await getManga(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const manga = await loadManga(Number(id));
  return { title: `Read ${manga.title}` };
}

export default async function ReadChapterPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ order?: string }>;
}) {
  const [{ id, source, chapterId }, { order: rawOrder }] = await Promise.all([params, searchParams]);
  if (!isReaderSource(source)) notFound();

  const manga = await loadManga(Number(id));
  const target = readerTargetFromManga(manga);
  if (target.adult && !(await hasAdultConsent())) return <AdultConsentGate />;
  if (source === "nhentai" && !adultReaderEnabled()) notFound();
  const [readable, pages] = await Promise.all([
    resolveReadableManga(target, { allowNhentai: adultReaderEnabled() }),
    getChapterPages(source, chapterId),
  ]);

  const outcome = readable.outcomes[source];
  const chapters = outcome?.status === "found" ? outcome.series.chapters.filter((chapter) => !chapter.externalUrl) : [];
  const index = chapters.findIndex((chapter) => chapter.id === chapterId);
  const current = index >= 0 ? chapters[index] : undefined;
  // "Chapters" returns to the list page this chapter sits on, in the order it was browsed in.
  // The URL wins over the cookie: a shared or bookmarked list link carries its own order.
  const order =
    parseChapterOrder(rawOrder) ?? parseChapterOrder((await cookies()).get(CHAPTER_ORDER_COOKIE)?.value) ?? "oldest";
  const listPage = chapterListPage(outcome?.status === "found" ? outcome.series.chapters : [], chapterId, order);
  const link = (i: number) =>
    chapters[i] ? { href: `/manga/${manga.id}/read/${source}/${chapters[i].id}?order=${order}`, label: chapters[i].label } : null;

  return (
    <ReaderStrip
      title={manga.title}
      subtitle={[current?.label, current?.title, SOURCE_LABELS[source], current?.group].filter(Boolean).join(" · ")}
      pages={pages}
      indexHref={`/manga/${manga.id}/read?source=${source}&order=${order}${listPage > 1 ? `&page=${listPage}` : ""}`}
      previous={index > 0 ? link(index - 1) : null}
      next={index >= 0 ? link(index + 1) : null}
    />
  );
}
