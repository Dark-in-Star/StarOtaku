import Link from "next/link";
import { BookOpen } from "lucide-react";
import { getManga } from "@/lib/api";
import { getSession } from "@/lib/session";
import type { MangaNode } from "@/lib/types";
import { MangaListStatusPanel } from "./MangaListStatusPanel";

const LIST_STATUS_FIELDS = "id,my_list_status";

/**
 * Reads the visitor's own list entry for a manga, or null when logged out.
 *
 * Both slots below go through this so a logged-in reader costs one narrow MAL call for the
 * page, not one per personalized element.
 */
async function loadMyListStatus(id: number) {
  const session = await getSession();
  if (!session) return { isAuthenticated: false, status: undefined };
  try {
    const personal = await getManga(id, LIST_STATUS_FIELDS);
    return { isAuthenticated: true, status: personal.my_list_status };
  } catch {
    // Token revoked, or MAL throttling — treat as untracked rather than failing the page.
    return { isAuthenticated: true, status: undefined };
  }
}

/**
 * The per-visitor half of the manga detail sidebar. Kept out of the page body so the route
 * can prerender from the shared `getMangaPublic` payload; see AnimeListStatusSlot.
 */
export async function MangaListStatusSlot({ manga }: { manga: MangaNode }) {
  const { isAuthenticated, status } = await loadMyListStatus(manga.id);
  return <MangaListStatusPanel manga={manga} initial={status} isAuthenticated={isAuthenticated} />;
}

/**
 * "Read Now", or "Continue Reading · Ch. N" once there's progress on MAL. Personal for the
 * same reason the panel is, so it streams in alongside it.
 */
export async function MangaReadButton({ manga }: { manga: MangaNode }) {
  const { status } = await loadMyListStatus(manga.id);
  const chaptersRead = status?.num_chapters_read ?? 0;

  return (
    <Link
      // With progress on MAL, jump straight to the next unread chapter.
      href={chaptersRead > 0 ? `/manga/${manga.id}/read?continue=1` : `/manga/${manga.id}/read`}
      className="flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-4 py-2 text-sm font-semibold transition-colors text-white hover:bg-primary/80"
    >
      <BookOpen className="size-4" /> {chaptersRead > 0 ? `Continue Reading · Ch. ${chaptersRead + 1}` : "Read Now"}
    </Link>
  );
}

/** The logged-out shape of the button, shown while the real one streams in. */
export function MangaReadButtonFallback({ mangaId }: { mangaId: number }) {
  return (
    <Link
      href={`/manga/${mangaId}/read`}
      className="flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-4 py-2 text-sm font-semibold transition-colors text-white hover:bg-primary/80"
    >
      <BookOpen className="size-4" /> Read Now
    </Link>
  );
}

export function MangaListStatusFallback() {
  return <div className="h-32 animate-pulse rounded-xl border border-border bg-surface" />;
}
