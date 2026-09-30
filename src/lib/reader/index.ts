import "server-only";
import { getAniListMangaId } from "../anilist";
import { highestChapterNumber, isReadableMediaType, readableChapterCount } from "./chapters";
import { findOnMangaDex, getMangaDexPages } from "./mangadex";
import { findOnNhentai, getNhentaiPages } from "./nhentai";
import type { ReadableManga, ReaderPage, ReaderSourceId, ReaderTarget, SourceOutcome, SourceSeries } from "./types";
import { findOnWeebCentral, getWeebCentralPages } from "./weebcentral";

export * from "./types";

function found(outcome: SourceOutcome | undefined): SourceSeries | null {
  return outcome?.status === "found" && readableChapterCount(outcome.series.chapters) > 0 ? outcome.series : null;
}

/**
 * The source with the most readable chapters wins, then the one reaching furthest. Reach
 * alone misleads: MangaDex often has the latest chapter but big takedown gaps before it
 * (verified: [Oshi no Ko] reached ch. 166 on both, with 101 chapters there against 167).
 * On a full tie WeebCentral is preferred, because its images load straight from its CDN
 * while every MangaDex page has to pass through this app's proxy and cost egress.
 */
export function pickPrimary(outcomes: ReadableManga["outcomes"]): SourceSeries | null {
  const candidates = [found(outcomes.weebcentral), found(outcomes.mangadex)].filter((s): s is SourceSeries => s !== null);
  if (candidates.length === 0) return found(outcomes.nhentai);

  const score = (series: SourceSeries) => [readableChapterCount(series.chapters), highestChapterNumber(series.chapters) ?? 0];
  return candidates.reduce((best, next) => {
    const [bestCount, bestReach] = score(best);
    const [nextCount, nextReach] = score(next);
    return nextCount > bestCount || (nextCount === bestCount && nextReach > bestReach) ? next : best;
  });
}

export async function resolveReadableManga(
  target: ReaderTarget,
  { allowNhentai = false }: { allowNhentai?: boolean } = {},
): Promise<ReadableManga> {
  if (!isReadableMediaType(target.mediaType) || target.titles.length === 0) {
    return { target, outcomes: {}, primary: null };
  }

  const [weebcentral, mangadex] = await Promise.all([
    getAniListMangaId(target.malId).then((anilistId) => findOnWeebCentral(target, anilistId)),
    findOnMangaDex(target),
  ]);
  const outcomes: ReadableManga["outcomes"] = { weebcentral, mangadex };

  // nhentai is only a last resort for adult entries neither mainstream source carries —
  // its match is title-only, so it is never consulted when a better answer exists.
  if (allowNhentai && target.adult && !found(weebcentral) && !found(mangadex)) {
    outcomes.nhentai = await findOnNhentai(target);
  }

  return { target, outcomes, primary: pickPrimary(outcomes) };
}

export async function getChapterPages(source: ReaderSourceId, chapterId: string): Promise<ReaderPage[]> {
  switch (source) {
    case "weebcentral":
      return getWeebCentralPages(chapterId);
    case "mangadex":
      return getMangaDexPages(chapterId);
    case "nhentai":
      return getNhentaiPages(Number(chapterId));
  }
}

export function isReaderSource(value: string): value is ReaderSourceId {
  return value === "weebcentral" || value === "mangadex" || value === "nhentai";
}
