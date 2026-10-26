import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `ANILIST_PROXY_URL` is read once at module load, so it has to be set before the import
// below — and the module re-imported per suite to pick up a different value.
const PROXY = "https://proxy.test/";
process.env.ANILIST_PROXY_URL = Buffer.from(PROXY).toString("base64");

const ANILIST_URL = "https://graphql.anilist.co";

const originalFetch = global.fetch;

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const { ok = true, status = 200 } = init;
  return {
    ok,
    status,
    headers: new Headers(),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

const onePart = {
  data: { Page: { media: [{ id: 185874, idMal: 60636, episodes: 10, startDate: { year: 2026, month: 7, day: 25 } }] } },
};

async function importAnilist() {
  vi.resetModules();
  return import("./anilist");
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("resolveAniListEpisode transport", () => {
  it("uses the direct endpoint and does not call the proxy when it succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(onePart));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { resolveAniListEpisode } = await importAnilist();
    expect(await resolveAniListEpisode(60636, 1)).toEqual({ anilistId: 185874, episode: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(ANILIST_URL);
  });

  // The shared-egress case this fallback exists for: AniList counts its 30/min budget per
  // IP, and a Worker's address is shared with other tenants.
  it("retries through the proxy when the direct call is rate-limited", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ errors: [{ message: "Too Many Requests" }] }, { ok: false, status: 429 }))
      .mockResolvedValueOnce(jsonResponse(onePart));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { resolveAniListEpisode } = await importAnilist();
    expect(await resolveAniListEpisode(60636, 1)).toEqual({ anilistId: 185874, episode: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(`${PROXY}${ANILIST_URL}`);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "POST" });
  });

  it("retries through the proxy when the direct call throws", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce(jsonResponse(onePart));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { resolveAniListEpisode } = await importAnilist();
    expect(await resolveAniListEpisode(60636, 1)).toEqual({ anilistId: 185874, episode: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // A 400 is AniList answering for real, so a different egress address would get the same
  // rejection — retrying would only spend the proxy's budget.
  it("does not retry a rejection the proxy cannot change", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ errors: [{ message: "Bad query" }] }, { ok: false, status: 400 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { resolveAniListEpisode } = await importAnilist();
    expect(await resolveAniListEpisode(60636, 1)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("forwards the POST body unchanged to the proxy", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 429 }))
      .mockResolvedValueOnce(jsonResponse(onePart));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { resolveAniListEpisode } = await importAnilist();
    await resolveAniListEpisode(60636, 1);

    const [directInit, proxiedInit] = [fetchMock.mock.calls[0][1], fetchMock.mock.calls[1][1]];
    expect(proxiedInit.body).toBe(directInit.body);
    expect(JSON.parse(proxiedInit.body as string).variables).toEqual({ malId: 60636 });
  });

  // A GraphQL error arrives as HTTP 200 with `data: null`. Read as a successful empty page
  // it would surface to the user as "no source for this episode".
  it("treats a GraphQL error body as a failure rather than an empty result", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: null, errors: [{ message: "Internal Error" }] }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { resolveAniListEpisode } = await importAnilist();
    expect(await resolveAniListEpisode(60636, 1)).toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      "AniList id lookup failed",
      expect.objectContaining({ detail: "Internal Error" }),
    );
  });

  it("returns null without throwing when both the direct call and the proxy fail", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("fetch failed"));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { resolveAniListEpisode } = await importAnilist();
    expect(await resolveAniListEpisode(60636, 1)).toBeNull();
  });
});

describe("getAnimeExtras transport", () => {
  it("falls back to the proxy so the detail page keeps its AniList data", async () => {
    const extras = {
      data: { Media: { trailer: null, externalLinks: [{ url: "https://hulu.com/x", site: "Hulu", type: "STREAMING" }] } },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 429 }))
      .mockResolvedValueOnce(jsonResponse(extras));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { getAnimeExtras } = await importAnilist();
    const result = await getAnimeExtras(60636);

    expect(result?.streamingLinks).toEqual([
      expect.objectContaining({ site: "Hulu", url: "https://hulu.com/x" }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("without a configured proxy", () => {
  it("stays direct-only", async () => {
    delete process.env.ANILIST_PROXY_URL;
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 429 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { resolveAniListEpisode } = await importAnilist();
    expect(await resolveAniListEpisode(60636, 1)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    process.env.ANILIST_PROXY_URL = Buffer.from(PROXY).toString("base64");
  });
});
