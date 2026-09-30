export type PageSlot = number | "gap";

/**
 * The page numbers to show around `current`: always the first and last, the current one
 * with `radius` neighbours either side, and a "gap" wherever pages are skipped. A gap that
 * would stand in for a single page shows that page instead — "1 … 3" is worse than "1 2 3".
 */
export function pageWindow(current: number, total: number, radius = 1): PageSlot[] {
  if (total <= 1) return total === 1 ? [1] : [];
  const pages = new Set<number>([1, total]);
  for (let p = current - radius; p <= current + radius; p++) {
    if (p >= 1 && p <= total) pages.add(p);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const slots: PageSlot[] = [];
  for (const page of sorted) {
    const previous = slots[slots.length - 1];
    if (typeof previous === "number" && page - previous === 2) slots.push(previous + 1);
    else if (typeof previous === "number" && page - previous > 2) slots.push("gap");
    slots.push(page);
  }
  return slots;
}

export function clampPage(raw: string | undefined, total: number): number {
  const page = Math.floor(Number(raw));
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(page, Math.max(total, 1));
}
