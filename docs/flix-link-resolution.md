# Resolving Flix stream links from a MAL anime id

How a MyAnimeList anime id becomes a playable stream URL on `reanime.to`, end to end.

> **Status: shipped.** This chain is implemented in `src/lib/streams.ts` (resolver,
> `server-only`), `src/lib/streamActions.ts` (the Server Action the player calls) and
> `src/components/WatchHerePlayer.tsx` (the "Watch here" player on
> `/anime/[id]/watch`). The [Legal and practical caveats](#legal-and-practical-caveats)
> section still applies in full.

## TL;DR

```
MAL id  --(AniList GraphQL: Media(idMal:))-->  AniList id  -->  /api/flix/{anilistId}/{ep}  -->  embed URL
```

The flix endpoint is keyed on the **AniList id**, never the MAL id. This is the single
most important fact here, and the easiest to get wrong -- see [The mal_id
trap](#the-mal_id-trap).

## The chain

### 1. Start from a MAL id

This codebase is MAL-native: `src/lib/api.ts` talks to `https://api.myanimelist.net/v2`
and every anime is identified by its MAL id (the `[id]` in `src/app/anime/[id]/`).

### 2. MAL id to AniList id

`src/lib/anilist.ts` already does this. Its GraphQL queries key on `Media(idMal: $malId,
type: ANIME)` and select `id` -- that `id` is the AniList id.

```graphql
query ($malId: Int) {
  Media(idMal: $malId, type: ANIME) {
    id                    # <-- the AniList id the flix endpoint needs
  }
}
```

> **One MAL id can map to several AniList ids.** MAL sometimes keeps a split release as
> one entry with continuous episode numbers, while AniList lists each part separately —
> all sharing the same `idMal`, each numbering its episodes from 1. `Media(idMal:)` then
> returns an arbitrary one of them. Steel Ball Run (MAL 61469) is the known case: AniList
> 190327 (1st STAGE, 1 ep, finished) and 210482 (2nd & 3rd STAGE, 11 eps, airing), so
> MAL episode 2 is `/api/flix/210482/1`. The code therefore queries
> `Page { media(idMal:) }` for every part, orders them by start date, and renumbers the
> episode onto the right part (`src/lib/anilistParts.ts`). The same renumbering applies
> to the next-airing schedule so it matches MAL's watched count.

`getNextAiringEpisode()` already returns this as `anilistId` on its `NextAiringEpisode`
result (see `src/lib/types.ts`). Any new resolver should reuse this module rather than
introducing a second AniList client.

Verified mappings:

| Title | MAL id | AniList id | flix servers |
| --- | --- | --- | --- |
| Frieren: Beyond Journey's End | 52991 | 154587 | 4 |
| Chainsaw Man | 44511 | 127230 | 4 |
| JUJUTSU KAISEN | 40748 | 113415 | 4 |
| Bleach | 269 | 269 | 4 |

### 3. AniList id to flix servers

```
GET https://reanime.to/api/flix/{anilistId}/{episodeNumber}
Accept: application/json
```

```json
{
  "success": true,
  "servers": [
    {
      "$id": "hd1-rjyccuaq8h5n-sub",
      "serverName": "HD-1",
      "dataLink": "https://flixcloud.cc/e/rjyccuaq8h5n?v=1",
      "dataType": "sub",
      "continue": false,
      "softsub": false
    }
  ]
}
```

- `dataType` is `"sub"` or `"dub"` -- both variants may share one embed id.
- `dataLink` is an **embed page URL**, not a video file.
- The site prefers `HD-2`: `servers.find(s => s.serverName === "HD-2") || servers[0]`.

### 4. The TMDB fallback (documented, unverified)

When a title has no AniList id, the site passes a literal `0` in the path and moves the
identifier into the query string:

```
GET /api/flix/0/{episodeNumber}?tmdb={themoviedb_id}&season={n}
```

So `0` is a sentinel meaning "ignore the path id, read the query string".

**This branch was never exercised.** All 30 titles sampled had an AniList id, so the
fallback never fired. Treat it as transcribed-from-source but untested.

## Where this logic came from

It is not guesswork. It was read out of the site's own client bundle
(`assets/immutable/nodes_33.CvCx8Te9.js`), deminified:

```js
async function loadFlix(episodeNumber) {
  const anilist = anime?.anilist;
  const tmdb    = anime?.themoviedb_id;
  const season  = anime?.external_seasons?.tmdb ?? 1;

  if (!anilist && !tmdb) return;

  const url = anilist
    ? `/api/flix/${anilist}/${episodeNumber}`
    : `/api/flix/0/${episodeNumber}?tmdb=${tmdb}&season=${season}`;

  const res = await fetch(url);
  if (!res.ok) return;
  const data = await res.json();
  if (!data.success || !data.servers?.length) return;
  servers = data.servers;
}
```

`mal_id` appears nowhere in this code path.

## The `mal_id` trap

A `mal_id`-keyed implementation **passes casual testing and then fails on roughly half the
modern catalogue** -- silently.

Older titles were seeded into both databases from the same early catalogue, so their MAL
and AniList ids are *identical*. Newer titles diverge.

| Sample | Result |
| --- | --- |
| Naruto (20), Bleach (269), HxH (136), FMA:B (5114), Code Geass (1575), Monster (19), Clannad (2167), Gintama (918) | ids identical -- all pre-2010 |
| Frieren, Chainsaw Man, Jujutsu Kaisen, Solo Leveling, Dandadan, Oshi no Ko, Blue Lock, ... | ids differ -- 2020+ |

Across 30 sampled titles, **22 diverged. In all 22, `mal_id` returned 0 servers and
`anilist_id` returned 4. Zero counterexamples.**

The failure is silent because a wrong id still returns **HTTP 200 with `success: true`**
and an empty `servers` array. Checking `res.ok` or `data.success` catches nothing.

> **Always guard on `servers.length`, never on `success`.**

## Empty results are normal

~10% of lookups return zero servers legitimately -- unaired seasons, obscure OVAs,
specials. Observed: Gintama (918), Onigiri, The Apothecary Diaries Season 3 (unaired).

A correct id and a genuinely-unavailable title produce **byte-identical responses**. There
is no way to distinguish them from the response alone. The site treats this as non-fatal
and logs `"Flix fetch failed (non-critical)"` -- flix is one of several sources, not the
only one.

## Reference implementation

```ts
/** Build the flix URL for an anime, or null when no usable id exists. */
function flixUrl(
  anime: { anilistId?: number; themoviedbId?: number; tmdbSeason?: number },
  episode: number,
): string | null {
  if (anime.anilistId) {
    return `https://reanime.to/api/flix/${anime.anilistId}/${episode}`;
  }
  if (anime.themoviedbId) {
    const season = anime.tmdbSeason ?? 1;
    return `https://reanime.to/api/flix/0/${episode}?tmdb=${anime.themoviedbId}&season=${season}`;
  }
  return null;
}

async function getFlixServers(anilistId: number, episode: number): Promise<FlixServer[]> {
  const url = flixUrl({ anilistId }, episode);
  if (!url) return [];

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return [];

  const data = await res.json();
  // success:true is returned even for wrong ids -- servers.length is the real check.
  if (!data.success || !data.servers?.length) return [];

  return data.servers;
}
```

If this ever ships, it belongs behind `import "server-only"` or `"use server"`, per
`AGENTS.md` -- never in a Client Component or a public Route Handler.

## Appendix: the reanime.to site APIs

Only needed when starting from a title string instead of a MAL id.

### Search

```
GET https://reanime.to/api/v1/search?q={query}&limit=36&offset=0
GET https://reanime.to/api/v1/search?facets=true&limit=0     # facet metadata
```

Note the `/api/v1/` prefix -- plain `/api/search` returns a 404 HTML page.

Results carry `anilist_id` **directly** (and no `mal_id` at all), so search alone is
enough to reach a flix URL -- `__data.json` is not needed for that.

> **Do not trust `results[0]`.** Fuzzy matching returns confidently wrong first hits --
> `"made in abyss"` and `"demon slayer"` both returned *Onigiri* at `limit=1`; `"mushoku
> tensei"` returned Cour 2. Request `limit=10` and match on title / `format` /
> `season_year`.

### Anime detail: decoding `__data.json`

```
GET https://reanime.to/anime/{slug}/__data.json
```

This is a **SvelteKit devalue-flattened** payload, not plain JSON. `data.anime.mal_id`
does not work. Inside `nodes[i].data`, index `0` is the root and every number is a
*pointer* into that same array; `-1` is `undefined`, `-2` is `null`. Values are
deduplicated, which is why two keys can point at the same index.

```js
function hydrate(arr, idx, seen = new Map()) {
  if (idx === -1) return undefined;
  if (idx === -2) return null;
  if (seen.has(idx)) return seen.get(idx);   // shared refs; omit and `relations` recurses forever
  const v = arr[idx];
  if (typeof v !== "object" || v === null) return v;
  if (Array.isArray(v)) {
    const out = []; seen.set(idx, out);
    for (const i of v) out.push(hydrate(arr, i, seen));
    return out;
  }
  const out = {}; seen.set(idx, out);
  for (const [k, i] of Object.entries(v)) out[k] = hydrate(arr, i, seen);
  return out;
}

const raw  = await (await fetch(`https://reanime.to/anime/${slug}/__data.json`)).json();
const node = raw.nodes.find(n => n?.type === "data" && n.data?.[0]?.anime !== undefined);
const root = hydrate(node.data, 0);

root.anime.anilist_id;   // the id flix needs
root.episodes;           // { data, limit, offset, total, totalPages, source }
```

`root.anime` also carries `episodes_total`, `last_episode`, `subbed` / `dubbed`,
`themoviedb_id`, `external_seasons`, and cross-site ids (`anidb_id`, `kitsu_id`,
`tvdb_id`, `imdb_id`, `simkl_id`, `livechart_id`).

**Field naming differs by source** -- the client bundle reads `anime.anilist`, while
`__data.json` and `/api/v1/search` both expose `anilist_id`. Don't assume one property
name works everywhere.

### Episode enumeration

`root.episodes` is paginated: `{ total, totalPages, limit: 100, source: "jikan" }`. Most
series fit one page, but honour `totalPages` rather than assuming. Frieren:
`episodes_total: 28` gives `/api/flix/154587/1` through `/api/flix/154587/28`.

### Adjacent endpoint

`GET /api/thumbnails/{id}` -- per-episode thumbnails.

## Legal and practical caveats

- **`reanime.to` is an unofficial third-party site.** It is unaffiliated with MyAnimeList
  and with the rights holders, and it is not a licensed distributor. This differs
  fundamentally from the official MAL API that the rest of this codebase uses.
- **These are private, undocumented endpoints** with no stability guarantee, no terms of
  use permitting this, and no versioning. The client bundle hash
  (`nodes_33.CvCx8Te9.js`) changes on every deploy, and the URL shapes can change without
  notice.
- **The chain stops at the embed URL.** `dataLink` points at a `flixcloud.cc` embed page.
  Going further -- unwrapping the embed to extract the underlying video stream -- is a
  meaningfully different activity from mapping a JSON API, and this document deliberately
  does not cover it.
- Before shipping anything based on this, consider whether integrating unlicensed
  streaming belongs in the project at all. Rate-limit politely if you do experiment.

## Verification record

- 30 titles sampled across eras and formats; 22 with divergent MAL / AniList ids.
- In all 22 divergent cases, `mal_id` gave 0 servers and `anilist_id` gave 4 servers.
- 3 titles returned 0 servers on both ids (genuine unavailability).
- Full MAL to AniList to flix chain confirmed on Frieren, Chainsaw Man, Jujutsu Kaisen,
  Bleach.
- Routing logic read directly from the site's client bundle, not inferred.
- TMDB fallback branch: **not verified** (no sampled title lacked an AniList id).
- Verified 2026-09-05 against the live site.
