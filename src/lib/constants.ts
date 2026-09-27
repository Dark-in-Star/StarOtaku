import type { AnimeStatus, MangaStatus } from "./types";

export const MAX_VISIBLE_GENRES = 3;

export const PUBLICATION_STATUS_CLASS: Record<AnimeStatus | MangaStatus, string> = {
  currently_airing: "font-medium text-score",
  currently_publishing: "font-medium text-score",
  not_yet_aired: "font-medium text-accent",
  not_yet_published: "font-medium text-accent",
  finished_airing: "",
  finished: "",
  on_hiatus: "",
};
