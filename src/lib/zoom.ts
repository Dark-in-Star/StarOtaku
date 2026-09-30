export interface Size {
  w: number;
  h: number;
}

// Page view: 1 is "fit to screen", so zooming out past it would only add empty margins.
export const PAGE_ZOOM_MIN = 1;
export const PAGE_ZOOM_MAX = 4;
const PAGE_ZOOM_STEP = 1.5;
export const DOUBLE_TAP_ZOOM = 2.5;

// Scroll view: a width multiplier for the strip. Below 1 narrows it (handy on wide screens);
// above 1 widens it past the screen, and the strip scrolls sideways.
export const STRIP_ZOOM_STEPS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2] as const;
export const STRIP_ZOOM_COOKIE = "starotaku_strip_zoom";

// Webtoon slices are many times taller than wide; fitting one to the screen height would
// shrink it to an unreadable sliver, so those fit the width and scroll instead.
const TALL_RATIO = 2;

export function clampPageZoom(zoom: number): number {
  return Math.min(PAGE_ZOOM_MAX, Math.max(PAGE_ZOOM_MIN, zoom));
}

/** One button press in or out; lands exactly on "fit" instead of 1.0000001. */
export function stepPageZoom(zoom: number, direction: 1 | -1): number {
  const next = direction > 0 ? zoom * PAGE_ZOOM_STEP : zoom / PAGE_ZOOM_STEP;
  return clampPageZoom(Math.abs(next - 1) < 0.05 ? 1 : next);
}

export function stepStripZoom(zoom: number, direction: 1 | -1): number {
  // Nearest step first, so a value from an older version or a cookie still steps sensibly.
  let index = 0;
  STRIP_ZOOM_STEPS.forEach((step, i) => {
    if (Math.abs(step - zoom) < Math.abs(STRIP_ZOOM_STEPS[index] - zoom)) index = i;
  });
  return STRIP_ZOOM_STEPS[Math.min(STRIP_ZOOM_STEPS.length - 1, Math.max(0, index + direction))];
}

export function parseStripZoom(value: string | undefined): number | undefined {
  const zoom = Number(value);
  return (STRIP_ZOOM_STEPS as readonly number[]).includes(zoom) ? zoom : undefined;
}

export function isTallPage(natural: Size): boolean {
  return natural.h / natural.w > TALL_RATIO;
}

/** Scale that fits a page in the viewer at zoom 1: the whole page, or the width for a tall strip. */
export function fitScale(natural: Size, box: Size): number {
  return isTallPage(natural) ? box.w / natural.w : Math.min(box.w / natural.w, box.h / natural.h);
}

/**
 * Where to scroll after a zoom so the point under the finger or cursor stays put. `anchor` is
 * that point within the viewer; content smaller than the viewer is centered, which is why the
 * extents are floored at the viewer size.
 */
export function anchoredScroll(
  scroll: { left: number; top: number },
  anchor: { x: number; y: number },
  before: Size,
  after: Size,
  box: Size,
): { left: number; top: number } {
  const oldW = Math.max(before.w, box.w);
  const oldH = Math.max(before.h, box.h);
  const newW = Math.max(after.w, box.w);
  const newH = Math.max(after.h, box.h);
  const clamp = (value: number, max: number) => Math.min(Math.max(0, value), Math.max(0, max));
  return {
    left: clamp(((scroll.left + anchor.x) / oldW) * newW - anchor.x, newW - box.w),
    top: clamp(((scroll.top + anchor.y) / oldH) * newH - anchor.y, newH - box.h),
  };
}
