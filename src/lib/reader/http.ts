import "server-only";
import { base64ToString } from "../utils";

export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// MangaDex rejects spoofed agents outright and nhentai's API docs ask for exactly this
// shape, so the honest agent is used wherever a source is an actual API.
export const APP_USER_AGENT = "Starotaku/1.0 (+https://starotaku.vercel.app)";

// Same reader, and the same reason, as the anime streams: Cloudflare-fronted sources answer
// Vercel's AWS egress with a bot challenge while serving other networks. See streams.ts.
const READER_PROXY_BASE_URL = base64ToString(process.env.STREAM_READER_URL) ?? "https://r.jina.ai/";

// Lets a local run exercise the path a blocked deployment takes, without deploying.
const FORCE_READER = process.env.READER_FORCE_FALLBACK === "1";

const DIRECT_TIMEOUT_MS = 12_000;
const READER_TIMEOUT_MS = 25_000;

export class SourceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceUnavailableError";
  }
}

export type FetchResult = { status: "ok"; body: string; via: "direct" | "reader" } | { status: "not-found" };

interface SourceFetchOptions {
  headers?: Record<string, string>;
  revalidate: number;
  /**
   * Off for MangaDex: its rules forbid non-transparent proxies, and it is not the source
   * Cloudflare blocks anyway.
   */
  readerFallback: boolean;
  /** How the reader should hand the body back: verbatim JSON, or raw HTML. */
  readerFormat?: "text" | "html";
}

async function fetchDirect(url: string, options: SourceFetchOptions): Promise<FetchResult | null> {
  try {
    const response = await fetch(url, {
      headers: options.headers,
      // Sources send no-store on HTML pages, which would silently disable the Data Cache
      // `next.revalidate` asks for — the same trap documented in streams.ts.
      cache: "force-cache",
      next: { revalidate: options.revalidate },
      signal: AbortSignal.timeout(DIRECT_TIMEOUT_MS),
    });
    if (response.status === 404) return { status: "not-found" };
    if (!response.ok) {
      console.warn("reader source rejected direct fetch", {
        url,
        status: response.status,
        cfMitigated: response.headers.get("cf-mitigated"),
      });
      return null;
    }
    return { status: "ok", body: await response.text(), via: "direct" };
  } catch (error) {
    console.warn("reader source direct fetch failed", { url, error: String(error) });
    return null;
  }
}

async function fetchViaReader(url: string, options: SourceFetchOptions): Promise<FetchResult | null> {
  try {
    const response = await fetch(`${READER_PROXY_BASE_URL}${url}`, {
      headers: { Accept: "text/plain", "x-respond-with": options.readerFormat ?? "text" },
      cache: "force-cache",
      next: { revalidate: options.revalidate },
      signal: AbortSignal.timeout(READER_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error("reader fallback rejected", { url, status: response.status });
      return null;
    }
    return { status: "ok", body: await response.text(), via: "reader" };
  } catch (error) {
    console.error("reader fallback failed", { url, error: String(error) });
    return null;
  }
}

/**
 * Direct first, reader second. A 404 is a real answer ("no such series") and is returned
 * rather than retried; anything else that fails both ways throws, so callers can tell an
 * unreachable source from a title the source simply doesn't carry.
 */
export async function fetchSource(url: string, options: SourceFetchOptions): Promise<FetchResult> {
  if (!(FORCE_READER && options.readerFallback)) {
    const direct = await fetchDirect(url, options);
    if (direct) return direct;
  }
  if (options.readerFallback) {
    const viaReader = await fetchViaReader(url, options);
    if (viaReader) return viaReader;
  }
  throw new SourceUnavailableError(`Could not reach ${new URL(url).host}.`);
}

export async function fetchSourceJson<T>(url: string, options: SourceFetchOptions): Promise<T | null> {
  const result = await fetchSource(url, { ...options, readerFormat: "text" });
  if (result.status === "not-found") return null;
  try {
    return JSON.parse(result.body) as T;
  } catch {
    throw new SourceUnavailableError(`${new URL(url).host} returned an unparseable body.`);
  }
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
