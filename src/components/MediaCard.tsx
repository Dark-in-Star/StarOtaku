import Image from "next/image";
import Link from "next/link";
import { formatMediaType } from "@/lib/format";
import { ScoreBadge } from "./ScoreBadge";
import { MediaCardAddButton } from "./MediaCardAddButton";
import { Genre, MyListEntryStatus } from "@/lib/types";
import { MAX_VISIBLE_GENRES } from "@/lib/constants";

interface MediaCardProps {
  href: string;
  title: string;
  imageUrl?: string;
  mean?: number;
  mediaType?: string;
  rank?: number;
  subtitle?: string;
  priority?: boolean;
  genres?: Genre[];
  /** Numeric MAL id — required to offer the add-to-list button. */
  id?: number;
  media?: "anime" | "manga";
  /** The visitor's own list status for this title, when they track it. */
  listStatus?: MyListEntryStatus;
}

export function MediaCard({
  href,
  title,
  imageUrl,
  mean,
  mediaType,
  rank,
  subtitle,
  priority,
  genres,
  id,
  media,
  listStatus,
}: MediaCardProps) {
  const allGenres = genres ?? [];
  const visibleGenres = allGenres.slice(0, MAX_VISIBLE_GENRES);
  const extraGenreCount = allGenres.length - visibleGenres.length;

  const resolvedMedia = media ?? (href.startsWith("/manga/") ? "manga" : "anime");
  const canAdd = id !== undefined;

  return (
    // Not a <Link> wrapper: the add button must not be a descendant of the anchor
    // (nested interactive elements are invalid HTML and break keyboard/screen-reader use).
    // The anchor covers the card via an inset overlay instead.
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-surface shadow-sm transition-all duration-300 ease-out focus-within:border-accent/40 hover:-translate-y-1 hover:border-accent/40 hover:shadow-glow">
      <div className="relative aspect-2/3 w-full overflow-hidden bg-surface-muted">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={title}
            fill
            sizes="(max-width: 640px) 45vw, (max-width: 1024px) 25vw, 15vw"
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-110"
            priority={priority}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted">
            No image
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/60 via-black/0 to-black/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        {rank !== undefined && (
          <span className="absolute left-2 top-2 rounded-lg bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground shadow-sm">
            #{rank}
          </span>
        )}
        <span className="absolute right-2 top-2 rounded-lg bg-surface/90 px-2 py-0.5 text-xs font-bold text-foreground shadow-sm">
          {subtitle ?? formatMediaType(mediaType)}
        </span>
        <div className="absolute bottom-2 left-2">
          <ScoreBadge mean={mean} />
        </div>
        {canAdd && (
          <MediaCardAddButton
            id={id}
            title={title}
            mediaType={mediaType}
            media={resolvedMedia}
            listStatus={listStatus}
          />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="line-clamp-2 min-h-10 text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-accent">
          {title}
        </h3>

        {visibleGenres.length > 0 && (
          <div className="mt-auto flex flex-wrap items-center gap-1">
            {visibleGenres.map((genre) => (
              <span
                key={genre.id}
                className="rounded-full border border-accent/25 bg-accent-soft px-2 py-0.5 text-[0.65rem] font-semibold text-accent sm:text-xs"
              >
                {genre.name}
              </span>
            ))}
            {extraGenreCount > 0 && (
              <span className="rounded-full border border-border/60 px-2 py-0.5 text-[0.65rem] font-semibold text-muted sm:text-xs">
                +{extraGenreCount}
              </span>
            )}
          </div>
        )}
      </div>

      <Link href={href} aria-label={title} className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-none" />
    </div>
  );
}
