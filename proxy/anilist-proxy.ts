/**
 * A minimal POST-forwarding proxy for AniList's GraphQL API.
 *
 * AniList answers Cloudflare Workers egress with
 *
 *   403 "You have been manually blocked. Please come to the principal's office."
 *
 * which is a manual block on the address range, not a rate limit — so no amount of
 * caching or retrying on the Worker side gets past it. This runs somewhere that is not
 * Cloudflare and forwards the request verbatim.
 *
 * It is deliberately not a general open proxy: it talks to exactly one upstream, so a
 * leaked URL cannot be pointed at anything else.
 *
 * Deploy to Deno Deploy (https://dash.deno.com → New Playground → paste → Save):
 * the egress is Google Cloud, which AniList serves normally. Val.town and Fly.io work
 * the same way. Then set, base64-encoded, as the Worker's ANILIST_PROXY_URL.
 *
 * The app requests `${ANILIST_PROXY_URL}${ANILIST_API_URL}`, so with a value of
 * `https://<name>.deno.dev/` the path arrives as `/https://graphql.anilist.co`. That
 * path is ignored on purpose: the upstream is hard-coded above, so the trailing URL is
 * only a convention shared with the app's reader proxies and never something a caller
 * can redirect.
 */

const ANILIST_API_URL = "https://graphql.anilist.co";

// Only this app should be able to spend the proxy's egress reputation. Set SHARED_SECRET
// in the deployment's env and the same value in the Worker; leave it unset to allow any
// caller, which is acceptable only because the upstream is fixed.
const SHARED_SECRET = Deno.env.get("SHARED_SECRET");

Deno.serve(async (request: Request) => {
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
      signal: AbortSignal.timeout(15_000),
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
});
