import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const IDS = (process.env.READER_IDS ?? "116778,126287,2").split(",").map(Number).filter(Boolean);
// An id MAL flags adult; used to prove the consent gate sits in front of the reader.
const ADULT_ID = Number(process.env.READER_ADULT_ID ?? 0);
// A plain paged manga with many chapters, for the page-turning checks.
const PAGED_ID = Number(process.env.READER_PAGED_ID ?? 126287);

function setMode(context: BrowserContext, baseURL: string, mode: "paged" | "scroll") {
  return context.addCookies([{ name: "starotaku_reader_mode", value: mode, url: baseURL }]);
}

/** Scrolls the whole strip so lazy pages load, then reports every page that failed to decode. */
async function brokenPages(page: Page): Promise<{ total: number; broken: string[] }> {
  // The route's loading skeleton sits in between chapters, so wait for real pages to exist
  // rather than for whatever strip happens to be on screen.
  await page.locator("img[data-reader-page]").first().waitFor({ timeout: 60_000 });
  for (let i = 0; i < 200; i++) {
    const done = await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight);
      return window.innerHeight + window.scrollY >= document.body.scrollHeight - 5;
    });
    if (done) break;
    await page.waitForTimeout(150);
  }
  await page
    .waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>("img[data-reader-page]")].every((img) => img.complete), null, {
      // Some chapters are 50+ full-size PNGs (~30 MB — Vampire Knight ch. 1), and the browser
      // fetches ~6 at a time per host, so a slow CDN minute is normal, not a failure.
      timeout: 180_000,
    })
    .catch(() => undefined);
  return page.evaluate(() => {
    const imgs = [...document.querySelectorAll<HTMLImageElement>("img[data-reader-page]")];
    return { total: imgs.length, broken: imgs.filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.src) };
  });
}

// Scroll mode puts every page in the DOM at once, which is what lets these checks prove that
// *all* of a chapter's images decode, not just the one on screen.
test.describe("scroll mode", () => {
  test.beforeEach(async ({ context, baseURL }) => setMode(context, baseURL!, "scroll"));

  for (const id of IDS) {
    test(`MAL ${id}: every found source lists chapters and renders a chapter's pages`, async ({ page }) => {
      await page.goto(`/manga/${id}/read`);
      const sources = page.getByTestId("reader-sources");
      await expect(sources).toBeVisible();

      const chapterLinks = page.getByTestId("reader-chapters").locator("a[data-chapter-id]");
      test.skip((await chapterLinks.count()) === 0, "no source carries this title");

      // The list is in reading order, so the first link is the first chapter.
      await chapterLinks.first().click();
      await expect(page).toHaveURL(/\/read\/(weebcentral|mangadex|nhentai)\//);
      const { total, broken } = await brokenPages(page);
      expect(total).toBeGreaterThan(0);
      expect(broken).toEqual([]);

      // Walk forward one chapter to prove chapter navigation resolves too.
      const next = page.getByRole("button", { name: /^Next:/ }).first();
      if (await next.count()) {
        const before = page.url();
        await next.click();
        await page.waitForURL((url) => url.toString() !== before);
        const second = await brokenPages(page);
        expect(second.total).toBeGreaterThan(0);
        expect(second.broken).toEqual([]);
      }
    });
  }

  test("MangaDex pages go through the same-origin proxy and decode", async ({ page }) => {
    const mdId = Number(process.env.READER_MD_ID ?? 116778);
    await page.goto(`/manga/${mdId}/read?source=mangadex`);
    const link = page.getByTestId("reader-chapters").locator("a[data-chapter-id]").last();
    test.skip((await link.count()) === 0, "MangaDex has no readable chapters for this title");
    await link.click();
    const { total, broken } = await brokenPages(page);
    expect(total).toBeGreaterThan(0);
    expect(broken).toEqual([]);
    const srcs = await page.$$eval("img[data-reader-page]", (imgs) => imgs.map((img) => (img as HTMLImageElement).src));
    expect(srcs.every((src) => new URL(src).pathname.startsWith("/api/reader/mangadex/"))).toBe(true);
  });

  test("doujin browse and reader render after consent", async ({ page }) => {
    await page.goto("/doujin");
    await page.getByRole("button", { name: "I am 18 or older" }).click();
    const results = page.getByTestId("doujin-results");
    await expect(results).toBeVisible();
    const thumbs = results.locator("img");
    await expect.poll(async () => thumbs.count()).toBeGreaterThan(5);
    await thumbs.first().scrollIntoViewIfNeeded();
    await expect.poll(() => thumbs.first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

    await results.locator("a").nth(3).click();
    const { total, broken } = await brokenPages(page);
    expect(total).toBeGreaterThan(0);
    expect(broken).toEqual([]);
  });
});

test("paged mode turns pages by button, key, tap, swipe and slider, then moves on from the end card", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  await setMode(context, baseURL!, "paged");
  await page.goto(`/manga/${PAGED_ID}/read`);
  await page.getByTestId("reader-chapters").locator("a[data-chapter-id]").first().click();

  const viewer = page.getByTestId("reader-viewer");
  const counter = page.getByText(/^(\d+ \/ \d+|End)$/);
  const onPage = async (n: number) => {
    await expect(counter).toHaveText(new RegExp(`^${n} /`));
    await expect.poll(() => viewer.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth), { timeout: 30_000 }).toBeGreaterThan(0);
  };

  await onPage(1);
  await page.getByRole("button", { name: "Next page" }).click();
  await onPage(2);
  await page.keyboard.press("ArrowRight");
  await onPage(3);
  await page.keyboard.press("ArrowLeft");
  await onPage(2);

  const box = (await viewer.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);
  await onPage(3);
  await page.mouse.click(box.x + box.width * 0.1, box.y + box.height / 2);
  await onPage(2);

  if (testInfo.project.name === "mobile") {
    const cdp = await context.newCDPSession(page);
    const y = box.y + box.height / 2;
    const swipe = async (from: number, to: number) => {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + box.width * from, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x + box.width * to, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    };
    await swipe(0.8, 0.2);
    await onPage(3);
    await swipe(0.2, 0.8);
    await onPage(2);
  }

  const slider = page.getByRole("slider", { name: "Page" });
  await slider.fill(await slider.getAttribute("max") as string);
  await expect(counter).toHaveText("End");
  const end = page.getByTestId("reader-end");
  await expect(end).toBeVisible();

  const before = page.url();
  await end.getByRole("button", { name: /^Next:/ }).click();
  await page.waitForURL((url) => url.toString() !== before);
  await onPage(1);
});

test("the proxy refuses anything but a MangaDex page path", async ({ request }) => {
  for (const path of [
    "/api/reader/mangadex/data/not-a-hash/1.png",
    "/api/reader/mangadex/other/9aab5b090256c87568c308531a28441d/1.png",
    "/api/reader/mangadex/data/9aab5b090256c87568c308531a28441d/..%2F..%2Fetc",
  ]) {
    expect((await request.get(path)).status()).toBe(404);
  }
});

test("adult routes sit behind the consent gate", async ({ page }) => {
  await page.goto("/doujin");
  await expect(page.getByRole("heading", { name: "Adult content" })).toBeVisible();
  await expect(page.getByTestId("doujin-results")).toHaveCount(0);
  if (ADULT_ID) {
    await page.goto(`/manga/${ADULT_ID}/read`);
    await expect(page.getByRole("heading", { name: "Adult content" })).toBeVisible();
  }
});

test("page view zooms by button, key, double-click, Ctrl+wheel and pinch; zoomed taps pan instead of turning", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  await setMode(context, baseURL!, "paged");
  await page.goto(`/manga/${PAGED_ID}/read`);
  await page.getByTestId("reader-chapters").locator("a[data-chapter-id]").first().click();

  const viewer = page.getByTestId("reader-viewer");
  const img = viewer.locator("img");
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 30_000 }).toBeGreaterThan(0);
  const zoomOf = async () => Number(await viewer.getAttribute("data-zoom"));
  const widthOf = () => img.evaluate((el) => el.getBoundingClientRect().width);
  // Measure only once the page has been fitted to the viewer (before that it shows at its
  // natural pixel size for a frame).
  const viewerWidth = (await viewer.boundingBox())!.width;
  await expect.poll(widthOf).toBeLessThanOrEqual(viewerWidth + 1);
  const fitWidth = await widthOf();

  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect.poll(zoomOf).toBe(1.5);
  expect(await widthOf()).toBeCloseTo(fitWidth * 1.5, 0);
  await page.keyboard.press("+");
  await expect.poll(zoomOf).toBe(2.25);
  await page.keyboard.press("0");
  await expect.poll(zoomOf).toBe(1);

  const box = (await viewer.boundingBox())!;
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(zoomOf).toBe(2.5);

  // Zoomed in: an edge tap must not turn the page, and dragging pans. The tap goes above the
  // round arrow button, which is an explicit "next page" and rightly still works when zoomed.
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.2);
  await expect(page.getByText(/^1 \/ \d+$/)).toBeVisible();
  if (testInfo.project.name === "desktop") {
    const scroller = viewer.locator("div.overflow-auto").first();
    const before = await scroller.evaluate((el) => el.scrollLeft);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    expect(await scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before);
  }

  await page.getByRole("button", { name: "Reset zoom" }).click();
  await expect.poll(zoomOf).toBe(1);

  if (testInfo.project.name === "desktop") {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -300);
    await page.keyboard.up("Control");
    await expect.poll(zoomOf).toBeGreaterThan(1);
  } else {
    const cdp = await context.newCDPSession(page);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cx - 30, y: cy, id: 0 }, { x: cx + 30, y: cy, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: cx - 90, y: cy, id: 0 }, { x: cx + 90, y: cy, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(zoomOf).toBeGreaterThan(2);
  }

  // Turning the page resets to fit.
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByText(/^2 \/ \d+$/)).toBeVisible();
  await expect.poll(zoomOf).toBe(1);
});

test("full screen covers the whole window in both modes and closes with its button or Esc", async ({ page, context, baseURL }) => {
  await setMode(context, baseURL!, "paged");
  await page.goto(`/manga/${PAGED_ID}/read`);
  await page.getByTestId("reader-chapters").locator("a[data-chapter-id]").first().click();
  await page.getByTestId("reader-viewer").locator("img").waitFor();

  await page.getByRole("button", { name: "Full screen" }).click();
  const overlay = page.getByTestId("reader-fullscreen");
  await expect(overlay).toBeVisible();
  const viewport = page.viewportSize()!;
  const box = (await overlay.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(viewport.width - 1);
  expect(box.height).toBeGreaterThanOrEqual(viewport.height - 1);
  // Pages still turn inside it.
  await overlay.getByRole("button", { name: "Next page" }).click();
  await expect(overlay.getByText(/^2 \/ \d+$/)).toBeVisible();
  await overlay.getByRole("button", { name: "Exit full screen" }).click();
  await expect(overlay).toHaveCount(0);

  // Scroll mode, entered and left from the keyboard; strip zoom widens the strip.
  await page.getByRole("button", { name: "Scroll" }).click();
  await page.keyboard.press("f");
  await expect(overlay).toBeVisible();
  const strip = overlay.getByTestId("reader-pages");
  const before = (await strip.boundingBox())!.width;
  await overlay.getByRole("button", { name: "Zoom out" }).click();
  await expect.poll(async () => (await strip.boundingBox())!.width).toBeLessThan(before);
  await overlay.getByRole("button", { name: "Reset zoom" }).click();
  await page.keyboard.press("Escape");
  await expect(overlay).toHaveCount(0);
});
