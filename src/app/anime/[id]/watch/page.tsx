import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Tv } from "lucide-react";
import { ApiError, getAnime } from "@/lib/api";
import { getAnimeExtras, getNextAiringEpisode } from "@/lib/anilist";
import { airedEpisodeCount } from "@/lib/airedEpisodes";
import { getSession } from "@/lib/session";
import { WatchHerePlayer } from "@/components/WatchHerePlayer";

async function loadAnime(id: number) {
  try {
    return await getAnime(id);
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
  const anime = await loadAnime(Number(id));
  return { title: `Watch ${anime.title}` };
}

export default async function WatchAnimePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [anime, extras, schedule, session] = await Promise.all([
    loadAnime(Number(id)),
    getAnimeExtras(Number(id)),
    getNextAiringEpisode(Number(id)),
    getSession(),
  ]);
  const streamingLinks = extras?.streamingLinks ?? [];
  // `num_episodes` is the planned total, so an airing show would otherwise list episodes
  // that have not been broadcast yet and cannot resolve to a source.
  const episodeCount = airedEpisodeCount(anime.num_episodes, anime.status, schedule);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <Link
        href={`/anime/${anime.id}`}
        className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Back to details
      </Link>

      <div className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4">
        <div className="relative aspect-2/3 w-16 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-muted">
          {anime.main_picture && (
            <Image
              src={anime.main_picture.large ?? anime.main_picture.medium}
              alt={anime.title}
              fill
              sizes="64px"
              className="object-cover"
            />
          )}
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-bold text-foreground">{anime.title}</h1>
          <p className="text-sm text-muted">Watch on an officially licensed platform, or stream here</p>
        </div>
      </div>

      <WatchHerePlayer
        malId={anime.id}
        episodeCount={episodeCount}
        totalEpisodes={anime.num_episodes || undefined}
        upcomingEpisode={schedule?.episode}
        airingAt={schedule?.airingAt}
        isAuthenticated={Boolean(session)}
        listStatus={anime.my_list_status}
      />

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-foreground sm:text-xl">Official platforms</h2>
        {streamingLinks.length > 0 ? (
          <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
            {streamingLinks.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-muted"
              >
                <span className="flex items-center gap-3">
                  {link.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={link.icon} alt="" className="size-5 shrink-0 rounded" />
                  ) : (
                    <Tv className="size-5 shrink-0 text-muted" />
                  )}
                  {link.site}
                  {link.language && link.language !== "Japanese" && (
                    <span className="text-xs font-normal text-muted">{link.language}</span>
                  )}
                </span>
                <ExternalLink className="size-3.5 shrink-0 text-muted" />
              </a>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface px-4 py-10 text-center">
            <p className="text-sm text-muted">No officially licensed streaming platform is listed for this title yet.</p>
            <a
              href={`https://myanimelist.net/anime/${anime.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
            >
              Check MyAnimeList <ExternalLink className="size-3.5" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
