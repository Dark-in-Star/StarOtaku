import Image from "next/image";
import { Poppins } from "next/font/google";
import { Suspense } from "react";
import { getAnimeRanking, getMangaRanking } from "@/lib/api";
import { MediaCard } from "@/components/MediaCard";
import { MediaRow, MediaRowItem } from "@/components/MediaRow";
import { RowSkeleton } from "@/components/RowSkeleton";
import { SearchBar } from "@/components/SearchBar";
import type { AnimeRankingType, MangaRankingType } from "@/lib/types";

const heroFont = Poppins({ subsets: ["latin"], weight: ["600", "800"] });

async function AnimeRankingRow({
  title,
  rankingType,
  viewAllHref,
  priority = false,
}: {
  title: string;
  rankingType: AnimeRankingType;
  viewAllHref: string;
  priority?: boolean;
}) {
  const result = await getAnimeRanking(rankingType, 12);
  console.log(result);
  return (
    <MediaRow title={title} viewAllHref={viewAllHref}>
      {result.data.map(({ node, ranking },index) => (
        <MediaRowItem key={node.id}>
          <MediaCard
            id={node.id}
            media="anime"
            href={`/anime/${node.id}`}
            title={node.title}
            imageUrl={node.main_picture?.large ?? node.main_picture?.medium}
            mean={node.mean}
            genres={node.genres}
            mediaType={node.media_type}
            rank={ranking.rank}
            listStatus={node.my_list_status?.status}
            priority={priority && index === 0}
          />
        </MediaRowItem>
      ))}
    </MediaRow>
  );
}

async function MangaRankingRow({
  title,
  rankingType,
  viewAllHref,
}: {
  title: string;
  rankingType: MangaRankingType;
  viewAllHref: string;
}) {
  const result = await getMangaRanking(rankingType, 12);
  return (
    <MediaRow title={title} viewAllHref={viewAllHref}>
      {result.data.map(({ node, ranking }) => (
        <MediaRowItem key={node.id}>
          <MediaCard
            id={node.id}
            media="manga"
            href={`/manga/${node.id}`}
            title={node.title}
            imageUrl={node.main_picture?.large ?? node.main_picture?.medium}
            mean={node.mean}
            genres={node.genres}
            mediaType={node.media_type}
            rank={ranking.rank}
            listStatus={node.my_list_status?.status}
          />
        </MediaRowItem>
      ))}
    </MediaRow>
  );
}

export default function Home() {
  return (
    <div className="flex flex-col gap-10">
      <section className="relative overflow-hidden rounded-2xl border border-border">
        <div className="relative aspect-1774/887 min-h-95 w-full sm:min-h-115">
          <Image
            src="/banner.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-black/55" />
          <div className="absolute inset-x-0 top-[25%] bottom-[25%] flex flex-col items-center justify-center gap-3 px-4 text-center sm:gap-4">
            <Image
              src="/logo.webp"
              alt=""
              width={256}
              height={256}
              priority
              className="h-36 w-36 drop-shadow-lg sm:h-32 sm:w-32 md:h-40 md:w-40"
            />
            <h1
              className={`${heroFont.className} text-4xl font-extrabold text-white drop-shadow-lg sm:text-6xl md:text-7xl`}
            >
              Starotaku
            </h1>
            <p
              className={`${heroFont.className} max-w-full text-nowrap text-sm font-semibold text-white/90 drop-shadow sm:text-xl md:text-2xl`}
            >
              Track, Browse, and Stream Anime &amp; Manga
            </p>
            <div className="w-full max-w-md my-8">
              <SearchBar className="border-accent bg-white/15 text-white shadow-lg shadow-black/30 ring-1 ring-white/20 backdrop-blur-md placeholder:text-white/70 focus-visible:border-accent focus-visible:ring-accent/40 dark:border-accent dark:bg-white/15 dark:text-white dark:placeholder:text-white/70 dark:shadow-black/40" />
            </div>
          </div>
        </div>
      </section>

      <Suspense fallback={<RowSkeleton />}>
        <AnimeRankingRow
          title="Currently Airing"
          rankingType="airing"
          viewAllHref="/browse?media=anime&type=airing"
          priority
        />
      </Suspense>

      <Suspense fallback={<RowSkeleton />}>
        <AnimeRankingRow title="Top Anime" rankingType="all" viewAllHref="/browse?media=anime&type=all" />
      </Suspense>

      <Suspense fallback={<RowSkeleton />}>
        <AnimeRankingRow title="Upcoming Anime" rankingType="upcoming" viewAllHref="/browse?media=anime&type=upcoming" />
      </Suspense>

      <Suspense fallback={<RowSkeleton />}>
        <MangaRankingRow title="Top Manga" rankingType="all" viewAllHref="/browse?media=manga&type=all" />
      </Suspense>

      <Suspense fallback={<RowSkeleton />}>
        <MangaRankingRow
          title="Popular Manga"
          rankingType="bypopularity"
          viewAllHref="/browse?media=manga&type=bypopularity"
        />
      </Suspense>
    </div>
  );
}
