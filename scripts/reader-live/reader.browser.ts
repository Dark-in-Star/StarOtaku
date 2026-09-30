import { expect, test, type Page } from "@playwright/test";

const IDS = (process.env.READER_IDS ?? "116778,126287,2").split(",").map(Number).filter(Boolean);
// An id MAL flags adult; used to prove the consent gate sits in front of the reader.
const ADULT_ID = Number(process.env.READER_ADULT_ID ?? 0);

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
    const next = page.getByRole("link", { name: /^Next:/ }).first();
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
