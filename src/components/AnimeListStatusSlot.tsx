import { getAnime } from "@/lib/api";
import { getSession } from "@/lib/session";
import type { AnimeNode } from "@/lib/types";
import { AnimeListStatusPanel } from "./AnimeListStatusPanel";

/**
 * The per-visitor half of the anime detail sidebar.
 *
 * The session check and `my_list_status` are personal, so they can't live in the page body
 * without forcing the whole route dynamic for everyone. Rendered inside <Suspense>, the
 * page prerenders from the shared `getAnimePublic` payload and this slot streams in.
 *
 * Logged-out visitors never reach MAL here at all — the panel only needs to know there's
 * no session to render its log-in prompt.
 */
export async function AnimeListStatusSlot({ anime }: { anime: AnimeNode }) {
  const session = await getSession();
  if (!session) return <AnimeListStatusPanel anime={anime} isAuthenticated={false} />;

  // Only the list-status field: the rest of the anime is already on the page from the
  // cached public fetch, and a narrow field set keeps this well inside MAL's rate limit.
  let initial = anime.my_list_status;
  try {
    const personal = await getAnime(anime.id, "id,my_list_status");
    initial = personal.my_list_status;
  } catch {
    // Token revoked, or MAL throttling — show the panel untracked rather than failing the
    // page around it.
  }

  return <AnimeListStatusPanel anime={anime} initial={initial} isAuthenticated />;
}

/** Matches the resolved panel's height so the sidebar doesn't jump when it streams in. */
export function AnimeListStatusFallback() {
  return <div className="h-32 animate-pulse rounded-xl border border-border bg-surface" />;
}
