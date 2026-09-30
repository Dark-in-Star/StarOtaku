import { describe, expect, it } from "vitest";
import { parseChapterImages, parseChapterList, parseSearchResults, parseSeriesPage } from "./weebcentral";

// Trimmed from live responses (2026-09-28); only the markup the parsers rely on is kept.
const SEARCH_HTML = `
<article class="bg-base-300 flex gap-4 p-4">
  <section><a href="https://weebcentral.com/series/01J76XYDGDQERFSK333582BNBZ/Sousou-no-Frieren">
    <img src="https://temp.compsci88.com/cover/fallback/01J76XYDGDQERFSK333582BNBZ.jpg" alt="Frieren - Beyond Journey&#39;s End cover">
  </a></section>
  <a href="https://weebcentral.com/series/01J76XYDGDQERFSK333582BNBZ/Sousou-no-Frieren">again</a>
</article>
<article class="bg-base-300 flex gap-4 p-4">
  <a href="https://weebcentral.com/series/01J76XYEXAMPLE0000000000AB/Other">
    <img alt="Other Series cover">
  </a>
</article>`;

const SERIES_HTML = `
<h1 class="md:hidden text-2xl font-bold text-center">Frieren - Beyond Journey&#39;s End</h1>
<li><strong>Adult Content: </strong>
  <a href="https://weebcentral.com/search?adult=False" class="link link-info link-hover">No</a></li>
<a href="https://anilist.co/manga/118586/Sousou-no-Frieren/">AniList</a>
<li>
  <strong>Associated Name(s)</strong>
  <ul class="list-disc list-inside">
    <li>Sousou no Frieren</li>
    <li>葬送のフリーレン</li>
  </ul>
</li>`;

const CHAPTERS_HTML = `
<div class="flex items-center">
  <a href="/chapters/01K7JP7T3V8ZVZJSGF99FFH55K" class="hover:bg-base-300 flex-1 flex items-center p-2">
    <span class="me-2"><img src="/static/images/chapter-badge.svg" alt=""></span>
    <span class="grow flex items-center gap-2">
      <span class="">Chapter 147</span>
      <span class="flex gap-1 items-center link-info"><span class="hidden md:inline">Last Read</span></span>
    </span>
    <time class="text-datetime opacity-50" datetime="2025-10-15T01:02:34.107Z">2025-10-15</time>
  </a>
</div>
<div class="flex items-center">
  <a href="https://weebcentral.com/chapters/01K6EFK2XZRN17SPNVFWJYCG1A" class="hover:bg-base-300 flex-1 flex items-center p-2">
    <span class="grow flex items-center gap-2">
      <span class="">Side Story</span>
    </span>
    <time class="text-datetime opacity-50" datetime="2025-09-30T23:33:43.999Z">2025-09-30</time>
  </a>
</div>`;

const IMAGES_HTML = `
<section id="chapter-images">
  <img
    src="https://scans.lastation.us/manga/Sousou-no-Frieren/0147-001.png"
    class="max-w-full h-auto mx-auto"
    alt="Page 1"
    onerror="this.src='/static/images/broken_image.jpg'" />
  <img
    src="https://scans.lastation.us/manga/Sousou-no-Frieren/0147-002.png"
    alt="Page 2" />
</section>`;

describe("WeebCentral parsers", () => {
  it("reads unique series ids and decoded titles from search results", () => {
    expect(parseSearchResults(SEARCH_HTML)).toEqual([
      { seriesId: "01J76XYDGDQERFSK333582BNBZ", title: "Frieren - Beyond Journey's End" },
      { seriesId: "01J76XYEXAMPLE0000000000AB", title: "Other Series" },
    ]);
  });

  it("reads the AniList id, title, alternate names and adult flag from a series page", () => {
    expect(parseSeriesPage("01J76XYDGDQERFSK333582BNBZ", SERIES_HTML)).toEqual({
      seriesId: "01J76XYDGDQERFSK333582BNBZ",
      title: "Frieren - Beyond Journey's End",
      anilistId: 118586,
      associatedNames: ["Sousou no Frieren", "葬送のフリーレン"],
      adult: false,
    });
  });

  it("returns chapters oldest-first, accepting relative and absolute links", () => {
    const chapters = parseChapterList(CHAPTERS_HTML);
    expect(chapters.map((c) => [c.id, c.label, c.number])).toEqual([
      ["01K6EFK2XZRN17SPNVFWJYCG1A", "Side Story", null],
      ["01K7JP7T3V8ZVZJSGF99FFH55K", "Chapter 147", 147],
    ]);
  });

  it("reads page images in order and skips the broken-image fallback", () => {
    expect(parseChapterImages(IMAGES_HTML).map((p) => p.url)).toEqual([
      "https://scans.lastation.us/manga/Sousou-no-Frieren/0147-001.png",
      "https://scans.lastation.us/manga/Sousou-no-Frieren/0147-002.png",
    ]);
  });
});
