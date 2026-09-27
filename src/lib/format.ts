import type { AnimeRankingType, AnimeSeason, AnimeStatus, MangaRankingType, MangaStatus } from "./types";

export function formatScore(mean?: number): string {
  return mean !== undefined ? mean.toFixed(2) : "N/A";
}

export function formatCompactNumber(value?: number): string {
  if (value === undefined) return "N/A";
  return new Intl.NumberFormat("en-US", { notation: "compact" }).format(value);
}

export function formatDate(value?: string): string {
  if (!value) return "Unknown";

  // Full ISO datetime (e.g. a joined_at timestamp) — parse and display normally;
  // it's timezone-aware, so there's no local/UTC day-shift risk to guard against.
  if (value.includes("T")) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  // Plain "YYYY-MM-DD" (or "YYYY") calendar date, as used for anime/manga air dates.
  // Constructed via the local-timezone Date() overload to avoid the classic
  // new Date("YYYY-MM-DD") UTC-parsing off-by-one-day bug.
  const parts = value.split("-");
  const date = new Date(Number(parts[0]), Number(parts[1] ?? 1) - 1, Number(parts[2] ?? 1));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: parts.length > 2 ? "numeric" : undefined,
  });
}

/** Inverse of the local-timezone parsing in formatDate: a Date back to a "YYYY-MM-DD" key. */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateRange(start?: string, end?: string): string {
  if (!start && !end) return "Unknown";
  if (start && !end) return `${formatDate(start)} - ?`;
  if (start && end) return `${formatDate(start)} - ${formatDate(end)}`;
  return formatDate(end);
}

export const ANIME_STATUS_LABELS: Record<AnimeStatus, string> = {
  finished_airing: "Finished Airing",
  currently_airing: "Currently Airing",
  not_yet_aired: "Not Yet Aired",
};

export function formatAnimeStatus(status?: AnimeStatus): string {
  return status ? (ANIME_STATUS_LABELS[status] ?? status) : "Unknown";
}

const MANGA_STATUS_LABELS: Record<MangaStatus, string> = {
  finished: "Finished",
  currently_publishing: "Publishing",
  not_yet_published: "Not Yet Published",
  on_hiatus: "On Hiatus",
};

export function formatMangaStatus(status?: MangaStatus): string {
  return status ? (MANGA_STATUS_LABELS[status] ?? status) : "Unknown";
}

export function formatCountdown(msRemaining: number): string {
  if (msRemaining <= 0) return "Airing now";

  const totalSeconds = Math.floor(msRemaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const units: [number, string][] = [
    [days, "day"],
    [hours, "hour"],
    [minutes, "minute"],
    [seconds, "second"],
  ];
  // Drop leading zero-value units (e.g. skip "days" once it hits zero) but always show minutes/seconds.
  const start = units.findIndex(([value], i) => value > 0 || i >= units.length - 2);
  return units
    .slice(start)
    .map(([value, unit]) => `${value} ${unit}${value === 1 ? "" : "s"}`)
    .join(", ");
}

export function formatMediaType(type?: string): string {
  if (!type) return "Unknown";
  return type.toUpperCase().replace(/_/g, " ");
}

const CHARACTER_ROLE_LABELS: Record<string, string> = {
  MAIN: "Main",
  SUPPORTING: "Supporting",
  BACKGROUND: "Background",
};

export function formatCharacterRole(role: string): string {
  return CHARACTER_ROLE_LABELS[role] ?? role;
}

export const ANIME_LIST_STATUS_LABELS: Record<string, string> = {
  watching: "Watching",
  completed: "Completed",
  on_hold: "On Hold",
  dropped: "Dropped",
  plan_to_watch: "Plan to Watch",
};

export const MANGA_LIST_STATUS_LABELS: Record<string, string> = {
  reading: "Reading",
  completed: "Completed",
  on_hold: "On Hold",
  dropped: "Dropped",
  plan_to_read: "Plan to Read",
};

export const ANIME_RANKING_TABS: { value: AnimeRankingType; label: string }[] = [
  { value: "all", label: "Top Anime" },
  { value: "airing", label: "Airing Now" },
  { value: "upcoming", label: "Upcoming" },
  { value: "tv", label: "TV" },
  { value: "ova", label: "OVA" },
  { value: "movie", label: "Movies" },
  { value: "special", label: "Specials" },
  { value: "bypopularity", label: "Popularity" },
  { value: "favorite", label: "Favorites" },
];

export const MANGA_RANKING_TABS: { value: MangaRankingType; label: string }[] = [
  { value: "all", label: "Top Manga" },
  { value: "manga", label: "Manga" },
  { value: "novels", label: "Novels" },
  { value: "oneshots", label: "One-shots" },
  { value: "doujin", label: "Doujin" },
  { value: "manhwa", label: "Manhwa" },
  { value: "manhua", label: "Manhua" },
  { value: "bypopularity", label: "Popularity" },
  { value: "favorite", label: "Favorites" },
];

export const SEASON_ORDER: AnimeSeason[] = ["winter", "spring", "summer", "fall"];

const SEASON_LABELS: Record<AnimeSeason, string> = {
  winter: "Winter",
  spring: "Spring",
  summer: "Summer",
  fall: "Fall",
};

export function formatSeasonLabel(season: AnimeSeason): string {
  return SEASON_LABELS[season];
}

export function isAnimeSeason(value: string | undefined): value is AnimeSeason {
  return SEASON_ORDER.includes(value as AnimeSeason);
}

export function getCurrentAnimeSeason(date: Date = new Date()): { year: number; season: AnimeSeason } {
  const month = date.getMonth();
  const year = date.getFullYear();
  if (month <= 2) return { year, season: "winter" };
  if (month <= 5) return { year, season: "spring" };
  if (month <= 8) return { year, season: "summer" };
  return { year, season: "fall" };
}

export function shiftSeason(year: number, season: AnimeSeason, direction: 1 | -1): { year: number; season: AnimeSeason } {
  const index = SEASON_ORDER.indexOf(season) + direction;
  if (index < 0) return { year: year - 1, season: SEASON_ORDER[SEASON_ORDER.length - 1] };
  if (index >= SEASON_ORDER.length) return { year: year + 1, season: SEASON_ORDER[0] };
  return { year, season: SEASON_ORDER[index] };
}
