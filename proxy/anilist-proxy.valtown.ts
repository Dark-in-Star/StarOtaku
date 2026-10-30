/**
 * The Val Town build of `anilist-proxy.ts`. Same contract, same hard-coded upstream; the
 * only differences are the ones the platform forces:
 *
 *   - `export default` instead of `Deno.serve`, which is how Val Town binds an HTTP val
 *   - `process.env` instead of `Deno.env`
 *
 * Why this file exists alongside the Deno one: Deno Deploy meters the free plan *per
 * month*, so an exhausted quota stays exhausted for the rest of the month. Val Town
 * meters per day (100,000 runs, 1 min wall clock), which is the same shape as the
 * Worker's own 100k/day — so the worst case is hours, not weeks.
 *
 * Deploy: https://www.val.town → New val → HTTP → paste this → Save.
 *
 * Set SHARED_SECRET in the val's environment variables. That is optional on Deno Deploy
 * but expected here: new free vals are public, so the URL and this mechanism are readable
 * by anyone. The secret lives in env rather than in the source, so a public val leaks how
 * the proxy works but not the means to use it. The upstream stays hard-coded, so even an
 * unauthenticated caller cannot aim this at another host.
 *
 * Then point the Worker at it, base64-encoded and keeping the trailing slash, exactly as
 * with the Deno deployment — see `README.md`.
 */

const ANILIST_API_URL = "https://graphql.anilist.co";

const SHARED_SECRET = process.env.SHARED_SECRET;

// Under the app's own 10s AbortSignal (ANILIST_TIMEOUT_MS in `src/lib/anilist.ts`), so the
// caller gives up before this does and a slow upstream surfaces as the app's timeout
// rather than as a 502 from here. Well inside Val Town's 1 min wall-clock ceiling.
const UPSTREAM_TIMEOUT_MS = 8_000;

export default async function anilistProxy(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Proxy-Secret",
      },
    });
  }

  // GraphQL is POST-only; answering anything else keeps crawlers from finding a usable
  // endpoint here. This is also the check a GET-only reader fails, which is why the
  // app's STREAM_READER_URL could never stand in for this.
  if (request.method !== "POST") {
    return new Response("This endpoint proxies POST requests to the AniList GraphQL API.", {
      status: 405,
      headers: { "Content-Type": "text/plain" },
    });
  }

  if (SHARED_SECRET && request.headers.get("x-proxy-secret") !== SHARED_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }

  const body = await request.text();

  let upstream: Response;
  try {
    upstream = await fetch(ANILIST_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        // Forwarded rather than invented, so AniList sees the app identifying itself.
        "User-Agent": request.headers.get("user-agent") ?? "Starotaku/1.0",
      },
      body,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    return new Response(JSON.stringify({ errors: [{ message: `Proxy could not reach AniList: ${error}` }] }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Status and body pass through untouched: the app distinguishes a 429 or 403 from a
  // 400, and rewriting them here would hide the difference.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
