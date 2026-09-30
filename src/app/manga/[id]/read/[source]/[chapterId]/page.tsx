import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ApiError, getManga } from "@/lib/api";
import { getSession } from "@/lib/session";
import { getChapterPages, isReaderSource, resolveReadableManga, SOURCE_LABELS } from "@/lib/reader";
import { readerTargetFromManga } from "@/lib/reader/target";
import {
  CHAPTER_ORDER_COOKIE,
  chapterListPage,
  defaultReaderMode,
  parseChapterOrder,
  parseReaderMode,
  READER_MODE_COOKIE,
} from "@/lib/reader/chapters";
import { adultReaderEnabled, hasAdultConsent } from "@/lib/reader/adultGate";
import { AdultConsentGate } from "@/components/AdultConsentGate";
import { ChapterReader } from "@/components/ChapterReader";
import { parseStripZoom, STRIP_ZOOM_COOKIE } from "@/lib/zoom";

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
  const [{ id, source, chapterId }, { order: rawOrder }, cookieStore, session] = await Promise.all([
    params,
    searchParams,
    cookies(),
    getSession(),
  ]);
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
  const order = parseChapterOrder(rawOrder) ?? parseChapterOrder(cookieStore.get(CHAPTER_ORDER_COOKIE)?.value) ?? "oldest";
  const listPage = chapterListPage(outcome?.status === "found" ? outcome.series.chapters : [], chapterId, order);
  const chapterHref = (chapter: { id: string }) => `/manga/${manga.id}/read/${source}/${chapter.id}?order=${order}`;
  const link = (i: number) => (chapters[i] ? { href: chapterHref(chapters[i]), label: chapters[i].label } : null);
  const returnTo = `/manga/${manga.id}/read/${source}/${chapterId}`;

  return (
    <ChapterReader
      // A new chapter must start on page 1 with fresh state, not inherit the last one's.
      key={chapterId}
      title={manga.title}
      subtitle={[current?.label, current?.title, SOURCE_LABELS[source], current?.group].filter(Boolean).join(" · ")}
      pages={pages}
      indexHref={`/manga/${manga.id}/read?source=${source}&order=${order}${listPage > 1 ? `&page=${listPage}` : ""}`}
      previous={index > 0 ? link(index - 1) : null}
      next={index >= 0 ? link(index + 1) : null}
      chapterOptions={chapters.map((chapter) => ({ id: chapter.id, label: chapter.label, href: chapterHref(chapter) }))}
      currentChapterId={chapterId}
      defaultMode={parseReaderMode(cookieStore.get(READER_MODE_COOKIE)?.value) ?? defaultReaderMode(manga.media_type)}
      defaultStripZoom={parseStripZoom(cookieStore.get(STRIP_ZOOM_COOKIE)?.value)}
      tracking={
        current
          ? {
              mangaId: manga.id,
              chapter: { number: current.number, label: current.label },
              isAuthenticated: Boolean(session),
              loginHref: `/auth/login?returnTo=${encodeURIComponent(returnTo)}`,
              initial: { read: manga.my_list_status?.num_chapters_read ?? 0, status: manga.my_list_status?.status },
              total: manga.num_chapters || undefined,
            }
          : undefined
      }
    />
  );
}
