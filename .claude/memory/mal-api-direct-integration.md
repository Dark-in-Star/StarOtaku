# MAL API: direct integration

This app used to route all MyAnimeList data calls through a separate companion server,
`anivio-server` (a stateless Hono wrapper on port 3000). That server has been retired —
its entire job was injecting one of two headers and forwarding the request, which this app's
own server-side code can do itself with zero added infrastructure.

**Why:** one deployable app instead of two — no second process to host, run, or pay for.

**How to apply:**

- `src/lib/api.ts` (`apiGet`) and `src/lib/actions.ts` (list mutations) call
  `https://api.myanimelist.net/v2` directly, controlled by `BASE_URL` in `api.ts`
  (`MAL_API_BASE_URL` env var overrides it — used only by e2e to point at the local mock).
- Public endpoints (search, ranking, season, detail without a caller) send
  `X-MAL-CLIENT-ID: <MAL_CLIENT_ID>`; authenticated endpoints (lists, profile, mutations) send
  `Authorization: Bearer <token>` instead. See `authHeaders()` in `api.ts` — mirror this
  exactly for any new MAL endpoint, don't send both headers or neither.
- `MAL_CLIENT_ID` already exists in this app's own `.env.local` (it's also used for the
  OAuth2 + PKCE login flow in `malAuth.ts`) — don't add a second client-ID variable.
- Both `api.ts` and `actions.ts` are `server-only` / `"use server"`. **Never** wrap these calls
  in an `app/api/**/route.ts` Route Handler — that would make MAL data (and implicitly the
  app's client ID) fetchable by anyone via `curl`, which is exactly what retiring the
  standalone server was meant to avoid. MAL calls should only ever happen during SSR
  (Server Components) or inside a Server Action invoked by this app's own pages.
- The one exception: `src/app/api/anime/[id]/schedule/route.ts` is intentionally public — it
  proxies AniList's (not MAL's) airing schedule for the client-side countdown component, has
  no secrets in it, and is meant to be fetched from the browser. Don't treat it as precedent
  for exposing MAL data the same way.
