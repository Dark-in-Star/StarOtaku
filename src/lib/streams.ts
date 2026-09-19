import "server-only";
import { getAniListId } from "./anilist";
import type { StreamServer, StreamSources } from "./types";
import { base64ToString } from "./utils";

/**
 * Signals that the upstream was unreachable or misbehaving, as distinct from an episode
 * that genuinely has no servers. Without the distinction every deployment-only network
 * failure surfaced to the user as the flatly wrong "No source found for episode N."
 */
export class StreamSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StreamSourceError";
  }
}

const FLIX_API_BASE_URL = process.env.FLIX_API_BASE_URL ?? "https://reanime.to/api/flix";

const FLIX_REFERER = "https://reanime.to/";
const FLIX_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Jina's reader, used only as a fallback. The flix origin serves a Cloudflare bot
// challenge (403, `cf-mitigated: challenge`) to Vercel's AWS egress while answering the
// same request from other networks, so a deployed direct fetch fails where local
// development succeeds. The reader fetches from a Google Cloud address that is not
// challenged, and returns the upstream body verbatim under `x-respond-with: text`.
//
// Deliberately second: it is a free third-party service with no availability guarantee,
// so the direct call is always tried first and this runs only when that is blocked.
const READER_PROXY_BASE_URL = base64ToString(process.env.STREAM_READER_URL) ?? "https://r.jina.ai/";

const FLIX_TIMEOUT_MS = 10_000;
// The extra hop makes the reader materially slower than a direct hit.
const READER_TIMEOUT_MS = 25_000;

interface FlixServer {
  $id: string;
  serverName: string;
  dataLink: string;
  dataType: string;
}

interface FlixResponse {
  success?: boolean;
  servers?: FlixServer[];
}

function parseFlix(body: string): FlixResponse | null {
  try {
    const parsed = JSON.parse(body) as FlixResponse;
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The normal path. Returns null — rather than throwing — on any failure, so the caller can
 * fall back to the reader instead of surfacing an error the fallback may well resolve.
 *
 * The origin answers with `Cache-Control: no-store, no-cache, must-revalidate`, and Next
 * refuses to populate the Data Cache for such a response, so `next: { revalidate }` alone
 * silently degrades to an uncached request on every call; `cache: "force-cache"` overrides
 * the origin header and restores the intended caching.
 */
async function fetchFlixDirect(url: string, revalidate: number): Promise<FlixResponse | null> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        // Cloudflare serves an interstitial to clients with no recognisable UA, and Node's
        // fetch sends none.
        "User-Agent": FLIX_USER_AGENT,
        Referer: FLIX_REFERER,
      },
      cache: "force-cache",
      next: { revalidate },
      signal: AbortSignal.timeout(FLIX_TIMEOUT_MS),
    });

    if (!response.ok) {
      // 403 with `cf-mitigated: challenge` is the blocked-egress case the reader exists for.
      console.warn("flix direct fetch rejected", {
        status: response.status,
        cfMitigated: response.headers.get("cf-mitigated"),
      });
      return null;
    }

    return parseFlix(await response.text());
  } catch (error) {
    console.warn("flix direct fetch failed", { error: String(error) });
    return null;
  }
}

/**
 * Fallback via Jina's reader, which egresses from an address the origin does not challenge.
 * `x-respond-with: text` returns the upstream body verbatim; without it the response is
 * wrapped in markdown ("Title:", "Markdown Content:") and will not parse as JSON.
 */
async function fetchFlixViaReader(url: string, revalidate: number): Promise<FlixResponse | null> {
  try {
    const response = await fetch(`${READER_PROXY_BASE_URL}${url}`, {
      headers: { Accept: "text/plain", "x-respond-with": "text" },
      cache: "force-cache",
      next: { revalidate },
      signal: AbortSignal.timeout(READER_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error("flix reader fallback rejected", { status: response.status });
      return null;
    }

    const parsed = parseFlix(await response.text());
    if (!parsed) console.error("flix reader fallback returned an unparseable body");
    return parsed;
  } catch (error) {
    console.error("flix reader fallback failed", { error: String(error) });
    return null;
  }
}

// The flix endpoint is keyed on the AniList id, never the MAL id. A MAL id still
// returns HTTP 200 with `success: true` and an empty `servers` array, so neither
// `res.ok` nor `success` catches the mistake — it fails silently on roughly half the
// modern catalogue. See docs/flix-link-resolution.md.
export async function getStreamSources(
  malId: number,
  episode: number,
  revalidate = 1800,
): Promise<StreamSources | null> {
  const anilistId = await getAniListId(malId);
  // A missing id here is almost always an unreachable AniList rather than an unknown
  // title, and the two must not collapse into the same "no source" message.
  if (!anilistId) throw new StreamSourceError("Could not resolve the AniList id.");

  const flixUrl = `${FLIX_API_BASE_URL}/${anilistId}/${episode}`;

  let json = await fetchFlixDirect(flixUrl, revalidate);
  if (!json) json = await fetchFlixViaReader(flixUrl, revalidate);
  if (!json) throw new StreamSourceError("The stream source could not be reached.");

  // servers.length is the only real check — an empty list means either a wrong id or a
  // genuinely unavailable episode, and the two responses are byte-identical.
  const servers = (json.servers ?? [])
    .filter((server) => server.dataLink && (server.dataType === "sub" || server.dataType === "dub"))
    .map(
      (server): StreamServer => ({
        id: server.$id,
        serverName: server.serverName,
        embedUrl: server.dataLink,
        audio: server.dataType === "dub" ? "dub" : "sub",
      }),
    );

  if (servers.length === 0) return null;

  return { episode, servers };
}

/** The site's own preference order: HD-2 first, then whatever came back first. */
export function pickDefaultServer(servers: StreamServer[], audio: "sub" | "dub"): StreamServer | undefined {
  const matching = servers.filter((server) => server.audio === audio);
  const pool = matching.length > 0 ? matching : servers;
  return pool.find((server) => server.serverName === "HD-2") ?? pool[0];
}
