import { describe, expect, it } from "vitest";
import { clampPage, pageWindow } from "./pagination";

describe("pageWindow", () => {
  it("shows every page when there are few", () => {
    expect(pageWindow(2, 4)).toEqual([1, 2, 3, 4]);
  });

  it("collapses long runs either side of the current page into gaps", () => {
    expect(pageWindow(5, 10)).toEqual([1, "gap", 4, 5, 6, "gap", 10]);
  });

  it("shows a lone skipped page instead of a gap", () => {
    expect(pageWindow(4, 10)).toEqual([1, 2, 3, 4, 5, "gap", 10]);
  });

  it("handles the edges", () => {
    expect(pageWindow(1, 9)).toEqual([1, 2, "gap", 9]);
    expect(pageWindow(9, 9)).toEqual([1, "gap", 8, 9]);
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(1, 0)).toEqual([]);
  });
});

describe("clampPage", () => {
  it("falls back to page 1 for missing or junk input", () => {
    expect(clampPage(undefined, 5)).toBe(1);
    expect(clampPage("abc", 5)).toBe(1);
    expect(clampPage("-3", 5)).toBe(1);
  });

  it("caps at the last page", () => {
    expect(clampPage("99", 5)).toBe(5);
    expect(clampPage("3", 5)).toBe(3);
    expect(clampPage("2", 0)).toBe(1);
  });
});
