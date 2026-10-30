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

Any non-Cloudflare host works. Two builds of the same proxy live here:

| File | Host | Quota resets |
| --- | --- | --- |
| `anilist-proxy.ts` | Deno Deploy, Fly.io | **monthly** (~1M req/mo on Deno's free plan) |
| `anilist-proxy.valtown.ts` | Val Town | **daily** (100,000 runs/day, 1 min wall clock) |

Prefer the Val Town build. Deno Deploy's free plan meters per *month*, so a quota that runs
out on the 12th stays out until the 1st; Val Town meters per *day*, the same shape as the
Worker's own 100k/day limit, so the worst case is hours rather than weeks. The proxy is
only reached on a *failed direct* call (see `anilistFetch`), so in practice neither ceiling
is approached — the Worker's own request limit binds first.

### Val Town (recommended)

1. https://www.val.town → **New val** → **HTTP**. The trigger has to be HTTP: a Script val
   never calls the exported handler, and answers every request with a 500 `"Not found"`.
2. Paste `anilist-proxy.valtown.ts` into `main.ts`, click **Save**. Val Town deploys on
   save; opening the `/code/` editor URL on its own deploys nothing.
3. In the val's **Environment variables**, add `SHARED_SECRET` set to any random string.
   Treat this as required, not optional: new free vals are **public**, so the source and
   URL are readable by anyone. The secret is read from env, never from the source, so a
   public val exposes the mechanism but not the means to use it — and the upstream stays
   hard-coded, so no caller can repoint it.
4. Copy the deployment URL with the file's **copy-URL** button — not the `www.val.town/x/...`
   editor address, which is not callable. The endpoint is a separate host shaped
   `https://<user>-<val>.web.val.run`, and the file id does not always match the val name,
   so copy it rather than constructing it.

### Deno Deploy

1. https://dash.deno.com → **New Playground**
2. Paste `anilist-proxy.ts`, click **Save & Deploy**
3. Optional but recommended: add a `SHARED_SECRET` env var in the playground's settings
4. Copy the deployment URL, e.g. `https://anilist-proxy-abc123.deno.dev`

### Pointing the Worker at it

Identical for either host. The app appends the AniList URL to this value, so **keep the
trailing slash**, and base64-encode it (same convention as `STREAM_READER_URL`):

```bash
# base64 of the proxy URL, trailing slash included
echo -n 'https://you-anilistproxy.web.val.run/' | base64

npx wrangler secret put ANILIST_PROXY_URL --name starotaku    # paste the base64
npx wrangler secret put ANILIST_PROXY_SECRET --name starotaku # the SHARED_SECRET value
```

`ANILIST_PROXY_SECRET` is sent as `X-Proxy-Secret` to the proxy only, never to AniList.

## Verifying

```bash
curl -s -X POST https://you-anilistproxy.web.val.run/ \
  -H 'X-Proxy-Secret: <the SHARED_SECRET value>' \
  -H 'Content-Type: application/json' \
  -d '{"query":"query { Page(perPage:1){ media(idMal:21, type:ANIME){ id nextAiringEpisode { episode } } } }"}'
```

A working proxy returns `{"data":{"Page":{"media":[{"id":21,...}]}}}`. A 403 with the
"principal's office" message means that host is blocked too — try a different provider.

On Val Town two 500s look alike and mean different things: `"Val not found"` is the wrong
hostname, while `"Not found"` means the val resolved but has no HTTP handler — an empty
`main.ts` or a non-HTTP trigger. `Forbidden` means the proxy is working and `SHARED_SECRET`
is set, so pass `X-Proxy-Secret` as above.

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
