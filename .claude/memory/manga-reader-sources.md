# Manga reader sources

The reader (`src/lib/reader/`) resolves a MAL manga on three sources, none of which knows MAL ids
directly except MangaDex. Every rule below was found by live-testing ~80 random MAL titles; each one
was a real bug before it was fixed.

**Why:** these are all third-party behaviours that look like bugs in our code when they bite, and none
of them shows up in unit tests against fixtures.

**How to apply:**

- **Matching.** MangaDex matches on `links.mal` (exact). WeebCentral matches on the AniList id shown on
  its series page, with MAL → AniList mapped via `getAniListMangaId`. It falls back to an exact
  normalized title only when one side has no AniList id. nhentai is title-only and adult-only, so it's
  tried last. Never loosen these to fuzzy title matching: MangaDex alone has many same-named entries
  (colored editions, doujinshi).
- **MangaDex `includeExternalUrl` is a filter, not an include.** `=1` returns *only* link-out chapters.
  Leave it out to get both kinds.
- **MangaDex images must go through our proxy** (`/api/reader/mangadex/...`). Any foreign `Referer`
  gets a placeholder image, and its rules require proxying and forbid a `Via` header, so never send
  MangaDex through the Jina fallback. WeebCentral and nhentai images hotlink fine.
- **WeebCentral search returns nothing when the query has punctuation** ("Zombie-Loan"), so queries go
  through `normalizeTitle`.
- **Chapter labels vary.** "Night 1", "# 1", "No. 1", "Episode 1" all occur, so see `parseChapterNumber`
  before adding a source.
- **Choosing a source:** most readable chapters wins, not furthest chapter. MangaDex often has the
  latest chapter but big takedown gaps before it.
- **Cloudflare / Vercel:** WeebCentral *is* blocked from Vercel (confirmed in production), so every
  WeebCentral call there goes through the Jina reader, exactly like the anime streams (see `streams.ts`).
  `READER_FORCE_FALLBACK=1` forces that path locally.
- **Jina's HTML mode keeps only the first top-level element of a fragment.** WeebCentral's search results
  and chapter list are multi-root htmx fragments, so on Vercel every series showed exactly one chapter.
  Those two use Jina's markdown mode and the `*Markdown` parsers, and callers pick the parser by
  `result.via`. A fragment with a single root (chapter images) is fine in HTML mode. Any new fragment
  endpoint must be checked through the fallback, not just directly.
- **Live checks:** `scripts/reader-live/` runs the real sources. Run the vitest live config and the
  Playwright reader config (port 3011) before changing matching or parsing, never `pnpm test` alone.
