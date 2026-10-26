# AniList on shared egress: the per-IP rate limit

AniList's GraphQL API (`https://graphql.anilist.co`) allows **30 requests per minute, counted
per egress IP** (`X-RateLimit-Limit: 30`). It is itself behind Cloudflare.

On a host with shared egress — the Cloudflare Workers deployment at
`starotaku.darkinstarpro.workers.dev` — that budget is consumed by *other tenants on the same
address*, so the direct call can be rejected no matter how little traffic this app sends. It is
also Cloudflare calling Cloudflare, the path the protection treats most harshly.

**The symptom is easy to misread.** Every AniList lookup returns null, which looks like a
*stream* failure: `/anime/<id>/watch` reports "Couldn't reach the stream source" because
`getStreamSources` throws `StreamSourceError("Could not resolve the AniList id.")` before the
flix API is ever called. Both upstreams are healthy; only the AniList hop is blocked.

**How to tell AniList is the broken hop, not the stream source:**

- `GET /api/anime/21/schedule` returns `{"schedule":null}` on the deployment but real data
  locally. The route touches AniList only, so it is a clean probe.
- No AniList-derived content renders anywhere: `/anime/<id>` shows no characters, no trailer,
  no `s4.anilist.co` images, and the watch page claims no official platforms exist. MAL content
  (title, score, studios, `cdn.myanimelist.net` art) renders fine.

**How to apply:**

- Every AniList query goes through `anilistFetch()` in `src/lib/anilist.ts` — one transport,
  direct first, retried once through `ANILIST_PROXY_URL` on 429/403/503 or a thrown error. Add
  new queries there; do not reintroduce a bare `fetch(ANILIST_API_URL, ...)`.
- Other statuses (e.g. 400) are **not** retried: that is AniList answering for real, and a
  different egress address would get the same rejection.
- `ANILIST_PROXY_URL` is base64-encoded and optional; unset means direct-only, which is right
  locally. It **must forward POST and the body intact** — the `STREAM_READER_URL` reader used
  for streams and the manga sources downgrades POST to GET, and AniList answers that with
  `Use POST request to access graphql subdomain`, so it cannot proxy GraphQL.
- A GraphQL error arrives as **HTTP 200 with `data: null`**. Read as a successful empty page it
  becomes a bogus "no source for this episode", so `getAniListParts` checks `json.errors`
  before trusting the body. Keep that check on any new query.
- Caching is the other half of the fix: `kvDataAdapter()` in `vite.config.ts` needs the
  `VINEXT_KV_CACHE` KV binding in `cloudflare.config.ts`, or the data cache has no store and
  every render re-hits AniList. The binding was missing, which is what made the limit so easy
  to exhaust. `cache: "force-cache"` is also required — AniList sends `no-store`, which would
  otherwise silently disable the Data Cache that `next.revalidate` asks for.

See also [[mal-api-direct-integration]] and `src/lib/streams.ts`, which documents the same
blocked-egress problem for the flix stream source.
