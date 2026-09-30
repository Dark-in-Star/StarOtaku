import { describe, expect, it, vi } from "vitest";
import { pickPrimary } from "./index";
import { toReaderChapter } from "./mangadex";
import { galleryTitleVariants } from "./nhentai";
import { isAdultManga, readerTargetFromManga } from "./target";
import type { ReaderChapter, SourceOutcome } from "./types";

vi.mock("../anilist", () => ({ getAniListMangaId: vi.fn() }));

function found(source: "weebcentral" | "mangadex" | "nhentai", numbers: (number | null)[]): SourceOutcome {
  const chapters: ReaderChapter[] = numbers.map((n, i) => ({ source, id: `${source}-${i}`, number: n, label: String(n) }));
  return { status: "found", series: { source, seriesId: source, title: source, matchedBy: "title", chapters } };
}

describe("pickPrimary", () => {
  it("picks the source with the most readable chapters, even if another reaches further", () => {
    expect(pickPrimary({ weebcentral: found("weebcentral", [1, 2, 3]), mangadex: found("mangadex", [1, 2, 3, 4]) })?.source).toBe(
      "mangadex",
    );
    expect(pickPrimary({ weebcentral: found("weebcentral", [1, 2, 3, 4]), mangadex: found("mangadex", [1, 50, 166]) })?.source).toBe(
      "weebcentral",
    );
  });

  it("breaks a count tie on the furthest chapter", () => {
    expect(pickPrimary({ weebcentral: found("weebcentral", [1, 2]), mangadex: found("mangadex", [1, 3]) })?.source).toBe("mangadex");
  });

  it("prefers WeebCentral on a tie, since its images need no proxy", () => {
    expect(pickPrimary({ weebcentral: found("weebcentral", [1, 2]), mangadex: found("mangadex", [1, 2]) })?.source).toBe(
      "weebcentral",
    );
  });

  it("falls back to nhentai only when neither mainstream source has chapters", () => {
    expect(pickPrimary({ weebcentral: { status: "not-found" }, mangadex: found("mangadex", []), nhentai: found("nhentai", [null]) })?.source).toBe(
      "nhentai",
    );
    expect(pickPrimary({ weebcentral: { status: "error", message: "x" } })).toBeNull();
  });
});

describe("MangaDex toReaderChapter", () => {
  it("maps numbers, oneshots, groups and external links", () => {
    const base = { id: "c1", relationships: [{ id: "g", type: "scanlation_group", attributes: { name: "Group" } }] };
    expect(
      toReaderChapter({ ...base, attributes: { chapter: "10.5", title: "", externalUrl: null, pages: 20 } }),
    ).toMatchObject({ number: 10.5, label: "Chapter 10.5", group: "Group", title: undefined, externalUrl: undefined });
    expect(
      toReaderChapter({ ...base, attributes: { chapter: null, title: "Pilot", externalUrl: "https://x", pages: 0 } }),
    ).toMatchObject({ number: null, label: "Oneshot", title: "Pilot", externalUrl: "https://x" });
  });
});

describe("galleryTitleVariants", () => {
  it("strips event, circle, language and group tags and splits the bilingual title", () => {
    expect(
      galleryTitleVariants("(C92) [Inariya (Inari)] Kyoudai ni Okeru Seikoushou no Kiroku | A Record [English] [desudesu]", "[稲荷屋] 姉弟 [英訳]"),
    ).toEqual(["Kyoudai ni Okeru Seikoushou no Kiroku", "A Record", "姉弟"]);
  });
});

describe("readerTargetFromManga", () => {
  it("orders romaji, English, synonyms, then Japanese, without duplicates", () => {
    const target = readerTargetFromManga({
      id: 1,
      title: "Sousou no Frieren",
      alternative_titles: { en: "Frieren: Beyond Journey's End", synonyms: ["sousou no frieren", "Frieren"], ja: "葬送のフリーレン" },
      media_type: "manga",
    });
    expect(target.titles).toEqual(["Sousou no Frieren", "Frieren: Beyond Journey's End", "Frieren", "葬送のフリーレン"]);
    expect(target.adult).toBe(false);
  });

  it("flags black-rated and Hentai/Erotica titles as adult", () => {
    expect(isAdultManga({ nsfw: "black" })).toBe(true);
    expect(isAdultManga({ nsfw: "white", genres: [{ id: 49, name: "Erotica" }] })).toBe(true);
    expect(isAdultManga({ nsfw: "gray", genres: [{ id: 9, name: "Ecchi" }] })).toBe(false);
  });
});
