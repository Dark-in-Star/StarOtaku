export type ReaderSourceId = "weebcentral" | "mangadex" | "nhentai";

export const SOURCE_LABELS: Record<ReaderSourceId, string> = {
  weebcentral: "WeebCentral",
  mangadex: "MangaDex",
  nhentai: "nhentai",
};

export interface ReaderChapter {
  source: ReaderSourceId;
  id: string;
  /** Null for a oneshot or a chapter labelled without a number ("Extra", "Side Story"). */
  number: number | null;
  label: string;
  title?: string;
  publishedAt?: string;
  group?: string;
  /** Set when the source only links out (MangaDex chapters hosted on MANGA Plus). */
  externalUrl?: string;
}

export interface ReaderPage {
  url: string;
  width?: number;
  height?: number;
}

/** What a source needs to find a MAL entry — kept free of MAL types so any caller can build it. */
export interface ReaderTarget {
  malId: number;
  titles: string[];
  mediaType?: string;
  adult: boolean;
}

export type MatchedBy = "mal-id" | "anilist-id" | "title";

export interface SourceSeries {
  source: ReaderSourceId;
  seriesId: string;
  title: string;
  matchedBy: MatchedBy;
  chapters: ReaderChapter[];
}

export type SourceOutcome =
  | { status: "found"; series: SourceSeries }
  | { status: "not-found" }
  | { status: "error"; message: string };

export interface ReadableManga {
  target: ReaderTarget;
  outcomes: Partial<Record<ReaderSourceId, SourceOutcome>>;
  /** The source the reader should open by default, or null when nothing can be read. */
  primary: SourceSeries | null;
}
