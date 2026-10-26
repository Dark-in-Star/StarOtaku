# AniList proxy

`anilist-proxy.ts` forwards GraphQL POSTs to `https://graphql.anilist.co` from a host
AniList will talk to.

## Why this exists

AniList answers requests from Cloudflare Workers egress with:

```
403 {"errors":[{"message":"You have been manually blocked. Please come to the principal's office.","status":403}]}
```

That is a **manual block on the address range**, not a rate limit. It does not reset, and
caching cannot route around it — a cache miss still has to reach AniList. Production runs
on a Worker, so without a proxy every AniList lookup fails there while working fine from a
developer machine.

The consequences are easy to misread. The watch page reports *"Couldn't reach the stream
source"* even though the stream source is healthy, because `getStreamSources` needs an
AniList id before it can call the flix API and throws first. Character lists, trailers and
official-platform links silently disappear for the same reason.

## Why not the existing reader

`STREAM_READER_URL` (Jina) cannot stand in: it downgrades POST to GET, and AniList replies
`Use POST request to access graphql subdomain`. A GraphQL proxy has to forward the method
and body intact.

Public CORS proxies are also no help — corsproxy.io, allorigins and codetabs are all
Cloudflare-fronted and hit the same block (403/520/522).

## Deploying

Any non-Cloudflare host works. Deno Deploy is the quickest:

1. https://dash.deno.com → **New Playground**
2. Paste `anilist-proxy.ts`, click **Save & Deploy**
3. Optional but recommended: add a `SHARED_SECRET` env var in the playground's settings
4. Copy the deployment URL, e.g. `https://anilist-proxy-abc123.deno.dev`

Then point the Worker at it. The app appends the AniList URL to this value, so **keep the
trailing slash**, and base64-encode it (same convention as `STREAM_READER_URL`):

```bash
# base64 of "https://anilist-proxy-abc123.deno.dev/"
echo -n 'https://anilist-proxy-abc123.deno.dev/' | base64

npx wrangler secret put ANILIST_PROXY_URL --name starotaku    # paste the base64
npx wrangler secret put ANILIST_PROXY_SECRET --name starotaku # only if SHARED_SECRET was set
```

`ANILIST_PROXY_SECRET` is sent as `X-Proxy-Secret` to the proxy only, never to AniList.

## Verifying

```bash
curl -s -X POST https://anilist-proxy-abc123.deno.dev/ \
  -H 'Content-Type: application/json' \
  -d '{"query":"query { Page(perPage:1){ media(idMal:21, type:ANIME){ id nextAiringEpisode { episode } } } }"}'
```

A working proxy returns `{"data":{"Page":{"media":[{"id":21,...}]}}}`. A 403 with the
"principal's office" message means that host is blocked too — try a different provider.

Once the secret is set, this should stop being `{"schedule":null}`:

```bash
curl -s https://starotaku.darkinstarpro.workers.dev/api/anime/21/schedule
```

## Behaviour notes

- The upstream is hard-coded, so this is not an open proxy — a leaked URL cannot be
  aimed at another host.
- Status codes pass through unchanged, because `anilistFetch` in `src/lib/anilist.ts`
  retries a 429/403/503 but deliberately does not retry a 400.
- The app tries AniList directly first and only falls back here, so if the Worker's own
  egress is ever unblocked the proxy quietly stops being used.
