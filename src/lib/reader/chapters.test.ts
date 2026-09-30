import { describe, expect, it } from "vitest";
import {
  chapterListPage,
  orderChapters,
  parseChapterOrder,
  dedupeChapters,
  highestChapterNumber,
  isReadableMediaType,
  normalizeTitle,
  parseChapterNumber,
  titlesOverlap,
  uniqueTitles,
} from "./chapters";
import type { ReaderChapter } from "./types";

function chapter(id: string, number: number | null, externalUrl?: string): ReaderChapter {
  return { source: "mangadex", id, number, label: `Chapter ${number}`, externalUrl };
}

describe("parseChapterNumber", () => {
  it.each([
    ["Chapter 147", 147],
    ["Episode 12.5", 12.5],
    ["Ch. 3", 3],
    ["chapter 0", 0],
    ["42", 42],
    ["Night 48.1", 48.1],
    ["# 170", 170],
  ])("reads %s", (label, expected) => {
    expect(parseChapterNumber(label)).toBe(expected);
  });

  it.each(["Side Story", "Oneshot", "Volume 3 Extras", "Vol. 2"])("returns null for %s", (label) => {
    expect(parseChapterNumber(label)).toBeNull();
  });
});

describe("normalizeTitle", () => {
  it("ignores punctuation, case, accents and curly quotes", () => {
    expect(normalizeTitle("Frieren: Beyond Journey's End")).toBe(normalizeTitle("Frieren - Beyond Journey’s End"));
    expect(normalizeTitle("Pokémon")).toBe("pokemon");
  });

  it("treats & and 'and' alike", () => {
    expect(normalizeTitle("Spy & Family")).toBe(normalizeTitle("Spy and Family"));
  });

  it("keeps non-Latin scripts", () => {
    expect(normalizeTitle("葬送のフリーレン")).toBe("葬送のフリーレン");
  });
});

describe("titlesOverlap / uniqueTitles", () => {
  it("matches when any normalized title is shared", () => {
    expect(titlesOverlap(["Sousou no Frieren", "Frieren"], ["FRIEREN!"])).toBe(true);
    expect(titlesOverlap(["Berserk"], ["Berserk of Gluttony"])).toBe(false);
  });

  it("drops empties and normalized duplicates, keeping first-seen order", () => {
    expect(uniqueTitles(["One Piece", undefined, "ONE PIECE", "", "ワンピース"])).toEqual(["One Piece", "ワンピース"]);
  });
});

describe("isReadableMediaType", () => {
  it("rejects novels, accepts everything else", () => {
    expect(isReadableMediaType("light_novel")).toBe(false);
    expect(isReadableMediaType("novel")).toBe(false);
    expect(isReadableMediaType("manhwa")).toBe(true);
    expect(isReadableMediaType(undefined)).toBe(true);
  });
});

describe("dedupeChapters", () => {
  it("keeps one entry per number, in ascending order", () => {
    const result = dedupeChapters([chapter("b", 2), chapter("a", 1), chapter("b2", 2)]);
    expect(result.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("prefers a readable upload over an external link for the same number", () => {
    const result = dedupeChapters([chapter("ext", 5, "https://mangaplus"), chapter("scan", 5)]);
    expect(result.map((c) => c.id)).toEqual(["scan"]);
  });

  it("keeps every unnumbered chapter after the numbered run", () => {
    const result = dedupeChapters([chapter("x", null), chapter("a", 1), chapter("y", null)]);
    expect(result.map((c) => c.id)).toEqual(["a", "x", "y"]);
  });
});

describe("highestChapterNumber", () => {
  it("ignores external-only chapters", () => {
    expect(highestChapterNumber([chapter("a", 97), chapter("b", 232, "https://mangaplus")])).toBe(97);
    expect(highestChapterNumber([])).toBeNull();
  });
});

describe("chapterListPage", () => {
  const many = Array.from({ length: 120 }, (_, i) => chapter(`c${i + 1}`, i + 1));

  it("counts from the first chapter, since the list is shown in reading order", () => {
    expect(chapterListPage(many, "c1")).toBe(1);
    expect(chapterListPage(many, "c50")).toBe(1);
    expect(chapterListPage(many, "c51")).toBe(2);
    expect(chapterListPage(many, "c120")).toBe(3);
  });

  it("counts from the newest chapter when the list is shown newest-first", () => {
    expect(chapterListPage(many, "c120", "newest")).toBe(1);
    expect(chapterListPage(many, "c71", "newest")).toBe(1);
    expect(chapterListPage(many, "c70", "newest")).toBe(2);
    expect(chapterListPage(many, "c1", "newest")).toBe(3);
  });

  it("falls back to the first page for an unknown chapter", () => {
    expect(chapterListPage(many, "nope")).toBe(1);
  });
});

describe("orderChapters / parseChapterOrder", () => {
  const list = [chapter("a", 1), chapter("b", 2), chapter("c", 3)];

  it("keeps reading order for oldest-first and reverses for newest-first, without mutating", () => {
    expect(orderChapters(list, "oldest").map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(orderChapters(list, "newest").map((c) => c.id)).toEqual(["c", "b", "a"]);
    expect(list.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("accepts only the two known orders", () => {
    expect(parseChapterOrder("newest")).toBe("newest");
    expect(parseChapterOrder("oldest")).toBe("oldest");
    expect(parseChapterOrder("random")).toBeUndefined();
    expect(parseChapterOrder(undefined)).toBeUndefined();
  });
});
