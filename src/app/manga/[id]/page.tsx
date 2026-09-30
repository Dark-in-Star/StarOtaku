import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BookOpen, ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { ApiError, getManga } from "@/lib/api";
import { getSession } from "@/lib/session";
import { ScoreBadge } from "@/components/ScoreBadge";
import { InfoRow } from "@/components/InfoRow";
import { GenreTags } from "@/components/GenreTags";
import { MangaListStatusPanel } from "@/components/MangaListStatusPanel";
import { isReadableMediaType } from "@/lib/reader/chapters";
import { MediaRow, MediaRowItem } from "@/components/MediaRow";
import { MediaCard } from "@/components/MediaCard";
import { formatCompactNumber, formatDateRange, formatMangaStatus, formatMediaType } from "@/lib/format";

async function loadManga(id: number) {
  try {
    return await getManga(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const manga = await loadManga(Number(id));
  return { title: manga.title };
}

export default async function MangaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [manga, session] = await Promise.all([loadManga(Number(id)), getSession()]);
  const authors = manga.authors?.map((a) => `${a.node.first_name} ${a.node.last_name}`.trim()).join(", ");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-6 md:flex-row">
        <div className="mx-auto w-40 shrink-0 sm:w-52 md:mx-0">
          <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-border bg-surface-muted">
            {manga.main_picture && (
              <Image
                src={manga.main_picture.large ?? manga.main_picture.medium}
                alt={manga.title}
                fill
                sizes="(max-width: 768px) 60vw, 208px"
                className="object-cover"
                priority
              />
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-extrabold sm:text-3xl">{manga.title}</h1>
            {manga.alternative_titles?.en && manga.alternative_titles.en !== manga.title && (
              <p className="text-sm text-muted">{manga.alternative_titles.en}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <ScoreBadge mean={manga.mean} size="lg" />
            {manga.rank !== undefined && (
              <span className="rounded-lg bg-surface-muted px-3 py-1.5 text-sm font-semibold text-foreground">
                Rank #{manga.rank}
              </span>
            )}
            {manga.popularity !== undefined && (
              <span className="rounded-lg bg-surface-muted px-3 py-1.5 text-sm font-semibold text-foreground">
                Popularity #{manga.popularity}
              </span>
            )}
            <span className="rounded-lg bg-surface-muted px-3 py-1.5 text-sm font-semibold text-foreground">
              {formatMangaStatus(manga.status)}
            </span>
          </div>

          <GenreTags genres={manga.genres} />

          <div className="flex flex-wrap items-center gap-3">
            {/* Novels have no page images on any reader source. */}
            {isReadableMediaType(manga.media_type) && (
              <Link
                href={`/manga/${manga.id}/read`}
                className="flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-4 py-2 text-sm font-semibold transition-colors text-white hover:bg-primary/80"
              >
                <BookOpen className="size-4" /> Read Now
              </Link>
            )}

            <a
              href={`https://myanimelist.net/manga/${manga.id}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open in MyAnimeList"
              className="flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:border-accent hover:text-accent sm:px-4"
            >
              <Image
                src="https://cdn.myanimelist.net/img/sp/icon/apple-touch-icon-256.png"
                alt=""
                width={16}
                height={16}
                className="rounded-sm"
              />
              <span className="hidden sm:inline">Open in MyAnimeList</span>
              <ExternalLink className="size-3.5 text-muted" />
            </a>
          </div>

          {manga.synopsis && <p className="max-w-3xl whitespace-pre-line text-sm leading-relaxed text-foreground">{manga.synopsis}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="order-2 flex flex-col gap-4 lg:order-1">
          <MangaListStatusPanel manga={manga} initial={manga.my_list_status} isAuthenticated={Boolean(session)} />

          <dl className="divide-y divide-border rounded-xl border border-border bg-surface px-4">
            <InfoRow label="Type">{formatMediaType(manga.media_type)}</InfoRow>
            <InfoRow label="Volumes">{manga.num_volumes || "Unknown"}</InfoRow>
            <InfoRow label="Chapters">{manga.num_chapters || "Unknown"}</InfoRow>
            <InfoRow label="Published">{formatDateRange(manga.start_date, manga.end_date)}</InfoRow>
            {authors && <InfoRow label="Authors">{authors}</InfoRow>}
            <InfoRow label="Members">{formatCompactNumber(manga.num_list_users)}</InfoRow>
            <InfoRow label="Scored by">{formatCompactNumber(manga.num_scoring_users)} users</InfoRow>
          </dl>
        </aside>

        <div className="order-1 flex flex-col gap-8 lg:order-2">
          {manga.related_manga && manga.related_manga.length > 0 && (
            <MediaRow title="Related Manga">
              {manga.related_manga.map((rel) => (
                <MediaRowItem key={rel.node.id}>
                  <MediaCard
                    id={rel.node.id}
                    media="manga"
                    href={`/manga/${rel.node.id}`}
                    title={rel.node.title}
                    imageUrl={rel.node.main_picture?.large ?? rel.node.main_picture?.medium}
                    mean={rel.node.mean}
                    genres={rel.node.genres}
                    subtitle={rel.relation_type_formatted}
                    listStatus={rel.node.my_list_status?.status}
                  />
                </MediaRowItem>
              ))}
            </MediaRow>
          )}

          {manga.recommendations && manga.recommendations.length > 0 && (
            <MediaRow title="Recommendations">
              {manga.recommendations.map((rec) => (
                <MediaRowItem key={rec.node.id}>
                  <MediaCard
                    id={rec.node.id}
                    media="manga"
                    href={`/manga/${rec.node.id}`}
                    title={rec.node.title}
                    imageUrl={rec.node.main_picture?.large ?? rec.node.main_picture?.medium}
                    mean={rec.node.mean}
                    genres={rec.node.genres}
                    mediaType={rec.node.media_type}
                    listStatus={rec.node.my_list_status?.status}
                  />
                </MediaRowItem>
              ))}
            </MediaRow>
          )}
        </div>
      </div>
    </div>
  );
}
