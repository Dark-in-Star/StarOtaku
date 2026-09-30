/**
 * Live end-to-end probe of the manga reader sources against randomly sampled MAL titles.
 *
 *   SEED=123 REPORT_DIR=/some/dir pnpm vitest run --config scripts/reader-live/vitest.live.config.mts
 *
 * READER_FORCE_FALLBACK=1 routes every WeebCentral/nhentai request through the Jina reader,
 * which is the path a Cloudflare-blocked deployment takes.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import path from "node:path";
import { getChapterPages, resolveReadableManga, type ReaderChapter, type ReaderSourceId } from "@/lib/reader";
import { readableChapterCount, highestChapterNumber } from "@/lib/reader/chapters";
import { APP_USER_AGENT, BROWSER_USER_AGENT } from "@/lib/reader/http";
import { MANGADEX_UPLOADS_URL } from "@/lib/reader/mangadex";
import { getNhentaiGallery, getNhentaiPages, nhentaiThumbUrl, searchNhentai } from "@/lib/reader/nhentai";
import { readerTargetFromManga } from "@/lib/reader/target";
import type { MangaNode } from "@/lib/types";

const FOREIGN_REFERER = "https://starotaku.vercel.app/";
const SEED = Number(process.env.SEED ?? Date.now() % 1_000_000);
const REPORT_DIR = process.env.REPORT_DIR ?? path.resolve("test-results/reader-live");
const SAMPLE_PLAN = (process.env.SAMPLE_PLAN ?? "full") as "full" | "small";

function loadClientId(): string {
  if (process.env.MAL_CLIENT_ID) return process.env.MAL_CLIENT_ID;
  const env = readFileSync(path.resolve(".env.local"), "utf8");
  const match = /^MAL_CLIENT_ID=(.+)$/m.exec(env);
  if (!match) throw new Error("MAL_CLIENT_ID missing");
  return match[1].trim();
}
const CLIENT_ID = loadClientId();

// mulberry32 — reproducible "random" picks for a given SEED.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = rng(SEED);
const randInt = (min: number, max: number) => Math.floor(min + random() * (max - min + 1));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const DETAIL_FIELDS = "id,title,alternative_titles,media_type,nsfw,genres,num_chapters,status,popularity";

async function mal<T>(pathname: string, query: Record<string, string | number | boolean>): Promise<T> {
  const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]));
  const response = await fetch(`https://api.myanimelist.net/v2${pathname}?${qs}`, { headers: { "X-MAL-CLIENT-ID": CLIENT_ID } });
  if (!response.ok) throw new Error(`MAL ${pathname} ${response.status}`);
  return (await response.json()) as T;
}

// [ranking type, offset range, count, bucket label]
const FULL_PLAN: [string, number, number, number, string][] = [
  ["bypopularity", 0, 300, 4, "popular"],
  ["manga", 300, 4000, 4, "mid/obscure manga"],
  ["manhwa", 0, 800, 3, "manhwa"],
  ["manhua", 0, 400, 2, "manhua"],
  ["oneshots", 0, 600, 2, "oneshot"],
  ["doujin", 0, 400, 2, "doujin (often adult)"],
  ["all", 6000, 25000, 2, "deep catalogue"],
  ["novels", 0, 200, 1, "novel (must be skipped)"],
];
const SMALL_PLAN: typeof FULL_PLAN = [
  ["bypopularity", 0, 300, 3, "popular"],
  ["manhwa", 0, 800, 1, "manhwa"],
  ["manga", 300, 4000, 1, "mid/obscure manga"],
];

async function sampleManga(): Promise<{ manga: MangaNode; bucket: string }[]> {
  const picks: { manga: MangaNode; bucket: string }[] = [];
  const seen = new Set<number>();
  for (const [type, min, max, count, bucket] of SAMPLE_PLAN === "small" ? SMALL_PLAN : FULL_PLAN) {
    let attempts = 0;
    let got = 0;
    while (got < count && attempts < count * 4) {
      attempts++;
      const offset = randInt(min, max);
      const page = await mal<{ data: { node: MangaNode }[] }>("/manga/ranking", {
        ranking_type: type,
        limit: 1,
        offset,
        nsfw: true,
        fields: DETAIL_FIELDS,
      });
      const node = page.data[0]?.node;
      if (!node || seen.has(node.id)) continue;
      seen.add(node.id);
      picks.push({ manga: node, bucket: `${bucket} (${type}@${offset})` });
      got++;
    }
  }
  return picks;
}

interface ImageCheck {
  url: string;
  ok: boolean;
  status: number;
  contentType: string;
  bytes: number;
  retried?: boolean;
}

function isImage(bytes: Uint8Array): boolean {
  const hex = Buffer.from(bytes.subarray(0, 12)).toString("hex");
  return (
    hex.startsWith("89504e47") || // PNG
    hex.startsWith("ffd8ff") || // JPEG
    hex.startsWith("47494638") || // GIF
    (hex.startsWith("52494646") && hex.slice(16, 24) === "57454250") || // RIFF....WEBP
    hex.slice(8, 16) === "66747970" // ISO-BMFF (AVIF)
  );
}

// Mirrors the proxy's single retry, and records it so flakiness stays visible in the report.
async function checkImage(url: string): Promise<ImageCheck> {
  const first = await checkImageOnce(url);
  if (first.ok) return first;
  await sleep(1_000);
  return { ...(await checkImageOnce(url)), retried: true };
}

async function checkImageOnce(url: string): Promise<ImageCheck> {
  // MangaDex pages are this app's proxy paths; check exactly what the proxy would fetch.
  const proxied = /^\/api\/reader\/mangadex\/(data|data-saver)\/([0-9a-f]{32})\/(.+)$/.exec(url);
  const target = proxied ? `${MANGADEX_UPLOADS_URL}/${proxied[1]}/${proxied[2]}/${proxied[3]}` : url;
  const headers: Record<string, string> = proxied
    ? { "User-Agent": APP_USER_AGENT }
    : { "User-Agent": BROWSER_USER_AGENT, Referer: FOREIGN_REFERER };
  try {
    const response = await fetch(target, { headers, signal: AbortSignal.timeout(20_000) });
    const body = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "";
    // Judged on the file signature, not size: a manhwa strip's last slice is legitimately a
    // few hundred bytes of blank PNG, while an HTML error page can be any size.
    return { url, ok: response.ok && contentType.startsWith("image/") && isImage(body), status: response.status, contentType, bytes: body.length };
  } catch (error) {
    return { url, ok: false, status: 0, contentType: String(error), bytes: 0 };
  }
}

interface ChapterCheck {
  source: ReaderSourceId;
  chapter: string;
  pages: number;
  images: ImageCheck[];
  ms: number;
}

function sampleChapters(chapters: ReaderChapter[]): ReaderChapter[] {
  const readable = chapters.filter((c) => !c.externalUrl);
  if (readable.length <= 3) return readable;
  const picked = [readable[0], readable[Math.floor(readable.length / 2)], readable[readable.length - 1]];
  return [...new Map(picked.map((c) => [c.id, c])).values()];
}

async function checkChapter(chapter: ReaderChapter): Promise<ChapterCheck> {
  const started = Date.now();
  const pages = await getChapterPages(chapter.source, chapter.id);
  const toCheck = pages.length > 1 ? [pages[0], pages[pages.length - 1]] : pages;
  const images = await Promise.all(toCheck.map((p) => checkImage(p.url)));
  return { source: chapter.source, chapter: chapter.label.slice(0, 60), pages: pages.length, images, ms: Date.now() - started };
}

interface TitleResult {
  malId: number;
  title: string;
  bucket: string;
  mediaType?: string;
  adult: boolean;
  malChapters?: number;
  resolveMs: number;
  sources: Record<string, string>;
  primary: string | null;
  chapterChecks: ChapterCheck[];
  verdict: "readable" | "not-carried" | "skipped" | "broken";
  notes: string[];
}

const results: TitleResult[] = [];
const doujinResults: { id: number; title: string; pages: number; expected: number; thumb: ImageCheck; images: ImageCheck[] }[] = [];

describe(`reader live probe (seed ${SEED})`, () => {
  it("resolves and reads randomly sampled MAL manga", async () => {
    const sample = await sampleManga();
    console.log(`Sampled ${sample.length} titles with seed ${SEED}`);

    for (const { manga, bucket } of sample) {
      const target = readerTargetFromManga(manga);
      const started = Date.now();
      const readable = await resolveReadableManga(target, { allowNhentai: true });
      const resolveMs = Date.now() - started;

      const sources: Record<string, string> = {};
      const chapterChecks: ChapterCheck[] = [];
      const notes: string[] = [];
      for (const [source, outcome] of Object.entries(readable.outcomes)) {
        if (!outcome) continue;
        if (outcome.status !== "found") {
          sources[source] = outcome.status === "error" ? `error: ${outcome.message.slice(0, 80)}` : "not-found";
          continue;
        }
        const { chapters, matchedBy, title } = outcome.series;
        const external = chapters.length - readableChapterCount(chapters);
        sources[source] =
          `found by ${matchedBy} "${title.slice(0, 40)}" — ${readableChapterCount(chapters)} readable` +
          (external ? ` + ${external} external` : "") +
          ` (max ch ${highestChapterNumber(chapters) ?? "—"})`;
        // Every found source is exercised, not just the primary, so each one's reliability
        // is measured independently.
        for (const chapter of sampleChapters(chapters)) chapterChecks.push(await checkChapter(chapter));
      }

      const allImagesOk = chapterChecks.length > 0 && chapterChecks.every((c) => c.pages > 0 && c.images.every((i) => i.ok));
      const primaryOk = readable.primary
        ? chapterChecks.filter((c) => c.source === readable.primary!.source).every((c) => c.pages > 0 && c.images.every((i) => i.ok))
        : false;
      if (chapterChecks.some((c) => c.pages === 0)) notes.push("a chapter returned 0 pages");
      // WeebCentral carries whole series, so one chapter for a long MAL entry means a parser lost
      // the rest — exactly how the reader fallback's truncated HTML shipped once, looking "readable".
      const wc = readable.outcomes.weebcentral;
      const truncated =
        wc?.status === "found" && readableChapterCount(wc.series.chapters) <= 1 && (manga.num_chapters ?? 0) > 5;
      if (truncated) notes.push("WeebCentral returned a single chapter for a long series (truncated list?)");
      if (chapterChecks.some((c) => c.images.some((i) => !i.ok))) notes.push("an image failed");
      if (!allImagesOk && primaryOk) notes.push("primary fine; a secondary source failed");

      const verdict: TitleResult["verdict"] = Object.keys(readable.outcomes).length === 0
        ? "skipped"
        : readable.primary
          ? primaryOk && !truncated
            ? "readable"
            : "broken"
          : "not-carried";

      results.push({
        malId: manga.id,
        title: manga.title,
        bucket,
        mediaType: manga.media_type,
        adult: target.adult,
        malChapters: manga.num_chapters,
        resolveMs,
        sources,
        primary: readable.primary?.source ?? null,
        chapterChecks,
        verdict,
        notes,
      });
      console.log(`[${verdict}] ${manga.id} ${manga.title} — ${JSON.stringify(sources)}`);
    }

    // A title a source doesn't carry is a coverage gap, not a bug; "broken" is: the reader
    // chose a source and then failed to show its pages.
    expect(results.filter((r) => r.verdict === "broken")).toEqual([]);
  });

  it("reads random nhentai galleries end to end", async () => {
    if (SAMPLE_PLAN === "small") return;
    const firstPage = await searchNhentai("language:english", randInt(1, 200), "popular");
    await sleep(6_500);
    const secondPage = await searchNhentai("language:english", randInt(1, 2000), "date");
    const pool = [...firstPage.result, ...secondPage.result];
    const picks = [...pool].sort(() => random() - 0.5).slice(0, 10);

    for (const hit of picks) {
      await sleep(3_200);
      const gallery = await getNhentaiGallery(hit.id);
      const pages = await getNhentaiPages(hit.id);
      const toCheck = pages.length > 1 ? [pages[0], pages[pages.length - 1]] : pages;
      doujinResults.push({
        id: hit.id,
        title: hit.english_title.slice(0, 70),
        pages: pages.length,
        expected: gallery?.num_pages ?? -1,
        thumb: await checkImage(await nhentaiThumbUrl(hit)),
        images: await Promise.all(toCheck.map((p) => checkImage(p.url))),
      });
    }

    expect(doujinResults.every((d) => d.pages === d.expected && d.thumb.ok && d.images.every((i) => i.ok))).toBe(true);
  });

  afterAll(() => {
    mkdirSync(REPORT_DIR, { recursive: true });
    const suffix = process.env.READER_FORCE_FALLBACK === "1" ? "-fallback" : "";
    const base = path.join(REPORT_DIR, `reader-live-${SEED}${suffix}`);
    writeFileSync(`${base}.json`, JSON.stringify({ seed: SEED, results, doujinResults }, null, 2));

    const lines = [
      `# Reader live probe — seed ${SEED}${suffix}`,
      "",
      "| MAL | Title | Bucket | Verdict | Primary | Sources | Chapters checked | Resolve |",
      "|---|---|---|---|---|---|---|---|",
      ...results.map((r) => {
        const checks = r.chapterChecks
          .map((c) => `${c.source[0]}:${c.chapter.replace(/\|/g, "/")}=${c.pages}p${c.images.every((i) => i.ok) ? "✓" : "✗"}${c.images.some((i) => i.retried) ? "(retry)" : ""}`)
          .join(", ");
        const sources = Object.entries(r.sources).map(([k, v]) => `**${k}**: ${v.replace(/\|/g, "/")}`).join("<br>");
        return `| ${r.malId} | ${r.title.replace(/\|/g, "/")}${r.adult ? " 🔞" : ""} | ${r.bucket} | ${r.verdict} | ${r.primary ?? "—"} | ${sources} | ${checks} | ${(r.resolveMs / 1000).toFixed(1)}s |`;
      }),
      "",
      "## nhentai galleries",
      "",
      "| id | Title | Pages (got/expected) | Thumb | First+last page |",
      "|---|---|---|---|---|",
      ...doujinResults.map(
        (d) =>
          `| ${d.id} | ${d.title.replace(/\|/g, "/")} | ${d.pages}/${d.expected} | ${d.thumb.ok ? "✓" : `✗ ${d.thumb.status}`} | ${d.images.map((i) => (i.ok ? "✓" : `✗ ${i.status}`)).join(" ")} |`,
      ),
    ];
    writeFileSync(`${base}.md`, lines.join("\n"));
    console.log(`Report written to ${base}.md`);
  });
});
