import { describe, expect, it } from "vitest";
import { isChapterRead, malChapterNumber, readProgressUpdate, resumeChapter, setReadProgress } from "./readProgress";

const ch = (id: string, number: number | null, externalUrl?: string) => ({ id, number, externalUrl });

describe("malChapterNumber / isChapterRead", () => {
  it("counts extras as their whole chapter and ignores unnumbered ones", () => {
    expect(malChapterNumber(ch("a", 12.5))).toBe(12);
    expect(malChapterNumber(ch("a", null))).toBeNull();
  });

  it("treats chapters up to the MAL count as read, nothing when the count is 0", () => {
    expect(isChapterRead(ch("a", 12), 12)).toBe(true);
    expect(isChapterRead(ch("a", 12.5), 12)).toBe(true);
    expect(isChapterRead(ch("a", 13), 12)).toBe(false);
    expect(isChapterRead(ch("a", 0), 0)).toBe(false);
    expect(isChapterRead(ch("a", null), 99)).toBe(false);
  });
});

describe("readProgressUpdate", () => {
  it("advances progress and starts reading an untracked title", () => {
    expect(readProgressUpdate(ch("a", 1), { read: 0 }, 100)).toEqual({ num_chapters_read: 1, status: "reading" });
  });

  it("promotes plan_to_read and on_hold to reading", () => {
    expect(readProgressUpdate(ch("a", 4), { read: 3, status: "plan_to_read" }, 100)?.status).toBe("reading");
    expect(readProgressUpdate(ch("a", 4), { read: 3, status: "on_hold" }, 100)?.status).toBe("reading");
  });

  it("completes the title on the final chapter, capping source numbering at MAL's total", () => {
    expect(readProgressUpdate(ch("a", 120), { read: 119, status: "reading" }, 120)).toEqual({
      num_chapters_read: 120,
      status: "completed",
    });
    expect(readProgressUpdate(ch("a", 125), { read: 119, status: "reading" }, 120)?.num_chapters_read).toBe(120);
  });

  it("never rewinds when an earlier chapter is re-read", () => {
    expect(readProgressUpdate(ch("a", 2), { read: 9, status: "reading" }, 100)).toBeNull();
  });

  it("keeps a completed title completed while re-reading", () => {
    expect(readProgressUpdate(ch("a", 3), { read: 100, status: "completed" }, 100)).toBeNull();
  });

  it("does nothing for unnumbered chapters or chapter 0", () => {
    expect(readProgressUpdate(ch("a", null), { read: 0 }, 100)).toBeNull();
    expect(readProgressUpdate(ch("a", 0), { read: 0 }, 100)).toBeNull();
  });

  it("works when MAL doesn't know the total yet", () => {
    expect(readProgressUpdate(ch("a", 300), { read: 299, status: "reading" }, undefined)).toEqual({
      num_chapters_read: 300,
      status: "reading",
    });
  });
});

describe("setReadProgress", () => {
  it("sets the count exactly, forwards or backwards", () => {
    expect(setReadProgress(40, { read: 10, status: "reading" }, 100)).toEqual({ num_chapters_read: 40, status: "reading" });
    expect(setReadProgress(5, { read: 10, status: "reading" }, 100)).toEqual({ num_chapters_read: 5, status: "reading" });
  });

  it("completes at the total, and un-completes when rewound", () => {
    expect(setReadProgress(100, { read: 10, status: "reading" }, 100).status).toBe("completed");
    expect(setReadProgress(90, { read: 100, status: "completed" }, 100)).toEqual({ num_chapters_read: 90, status: "reading" });
  });

  it("clamps to the known range", () => {
    expect(setReadProgress(150, { read: 0 }, 100).num_chapters_read).toBe(100);
    expect(setReadProgress(-1, { read: 3 }, 100).num_chapters_read).toBe(0);
  });
});

describe("resumeChapter", () => {
  const list = [ch("p", 0), ch("c1", 1), ch("c2", 2), ch("c2.5", 2.5), ch("c3", 3), ch("ext", 4, "https://mangaplus")];

  it("starts at the very first chapter when nothing is read", () => {
    expect(resumeChapter(list, 0)?.id).toBe("p");
  });

  it("opens the first chapter past the MAL count, skipping extras of read chapters", () => {
    expect(resumeChapter(list, 1)?.id).toBe("c2");
    expect(resumeChapter(list, 2)?.id).toBe("c3");
  });

  it("returns null when caught up, never offering an external-only chapter", () => {
    expect(resumeChapter(list, 3)).toBeNull();
    expect(resumeChapter([], 0)).toBeNull();
  });
});
