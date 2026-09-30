import { APP_USER_AGENT } from "@/lib/reader/http";
import { MANGADEX_UPLOADS_URL } from "@/lib/reader/mangadex";

// Deliberately narrow: only MangaDex's own page-file shape is accepted and the upstream host
// is fixed, so this can never be turned into a general-purpose proxy.
const MODES = new Set(["data", "data-saver"]);
const HASH = /^[0-9a-f]{32}$/;
const FILE = /^[A-Za-z0-9-]+\.(?:jpe?g|png|webp|gif)$/;

const UPSTREAM_TIMEOUT_MS = 20_000;

// One retry: the live probe saw uploads.mangadex.org drop a connection mid-chapter and
// answer the identical request a second later, and a failed page is a hole in the strip.
async function fetchUpstream(url: string): Promise<Response | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, {
        // No Referer and no Via: MangaDex swaps in a placeholder for foreign referers and
        // rejects non-transparent proxies.
        headers: { "User-Agent": APP_USER_AGENT },
        cache: "no-store",
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      if (response.status < 500) return response;
    } catch {
      // Retried below.
    }
  }
  return null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ mode: string; hash: string; file: string }> }) {
  const { mode, hash, file } = await params;
  if (!MODES.has(mode) || !HASH.test(hash) || !FILE.test(file)) {
    return new Response("Not found", { status: 404 });
  }

  const upstream = await fetchUpstream(`${MANGADEX_UPLOADS_URL}/${mode}/${hash}/${file}`);
  if (!upstream) return new Response("Upstream unreachable", { status: 502 });

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!upstream.ok || !upstream.body || !contentType.startsWith("image/")) {
    return new Response("Upstream error", { status: upstream.status === 404 ? 404 : 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": contentType,
      // The path embeds the chapter's content hash, so a URL's bytes never change — the CDN
      // can hold it indefinitely and each page crosses the function once, not once per read.
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
    },
  });
}
