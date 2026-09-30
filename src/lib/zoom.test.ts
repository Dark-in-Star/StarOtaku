import { describe, expect, it } from "vitest";
import { anchoredScroll, clampPageZoom, fitScale, isTallPage, parseStripZoom, stepPageZoom, stepStripZoom } from "./zoom";

describe("page zoom", () => {
  it("clamps between fit (1) and 4x", () => {
    expect(clampPageZoom(0.5)).toBe(1);
    expect(clampPageZoom(9)).toBe(4);
    expect(clampPageZoom(2)).toBe(2);
  });

  it("steps by 1.5x and lands exactly back on fit", () => {
    expect(stepPageZoom(1, 1)).toBe(1.5);
    expect(stepPageZoom(1.5, -1)).toBe(1);
    expect(stepPageZoom(1, -1)).toBe(1);
    expect(stepPageZoom(3.375, 1)).toBe(4);
  });
});

describe("strip zoom", () => {
  it("moves one step either way and stops at the ends", () => {
    expect(stepStripZoom(1, 1)).toBe(1.25);
    expect(stepStripZoom(1, -1)).toBe(0.8);
    expect(stepStripZoom(2, 1)).toBe(2);
    expect(stepStripZoom(0.5, -1)).toBe(0.5);
  });

  it("snaps an off-step value to the nearest step before moving", () => {
    expect(stepStripZoom(1.1, 1)).toBe(1.25);
  });

  it("accepts only known steps from a cookie", () => {
    expect(parseStripZoom("1.25")).toBe(1.25);
    expect(parseStripZoom("3")).toBeUndefined();
    expect(parseStripZoom(undefined)).toBeUndefined();
  });
});

describe("fitScale", () => {
  const box = { w: 400, h: 800 };

  it("fits a normal page entirely, limited by whichever side is tighter", () => {
    expect(fitScale({ w: 800, h: 1200 }, box)).toBe(0.5); // width-limited
    expect(fitScale({ w: 1000, h: 4000 * 0.4 }, box)).toBe(0.4); // 1000x1600: width-limited
    expect(fitScale({ w: 300, h: 1200 * 0.5 }, { w: 400, h: 300 })).toBe(0.5); // height-limited
  });

  it("fits a tall webtoon slice to the width only", () => {
    expect(isTallPage({ w: 800, h: 5000 })).toBe(true);
    expect(fitScale({ w: 800, h: 5000 }, box)).toBe(0.5);
  });
});

describe("anchoredScroll", () => {
  const box = { w: 400, h: 800 };

  it("keeps the point under the finger fixed when zooming from fit", () => {
    // Page exactly fills the viewer; zoom 2x around its centre.
    expect(anchoredScroll({ left: 0, top: 0 }, { x: 200, y: 400 }, box, { w: 800, h: 1600 }, box)).toEqual({ left: 200, top: 400 });
  });

  it("keeps an off-centre point fixed", () => {
    expect(anchoredScroll({ left: 0, top: 0 }, { x: 100, y: 100 }, box, { w: 800, h: 1600 }, box)).toEqual({ left: 100, top: 100 });
  });

  it("stays inside the scrollable range when zooming back out", () => {
    expect(anchoredScroll({ left: 50, top: 50 }, { x: 10, y: 10 }, { w: 800, h: 1600 }, box, box)).toEqual({ left: 0, top: 0 });
  });
});
