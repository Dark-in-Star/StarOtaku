import { afterEach, describe, expect, it, vi } from "vitest";
import { StreamSourceError, getStreamSources, pickDefaultServer } from "./streams";
import type { StreamServer } from "./types";

function server(serverName: string, dataType: string, id = `${serverName}-${dataType}`) {
  return { $id: id, serverName, dataLink: `https://flixcloud.cc/e/${id}`, dataType };
}

/** The flix body is read with `.text()` so the reader fallback can share one parser. */
function flixResponse(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 403,
    headers: { get: () => null },
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

/** First call is the AniList id lookup, second is the flix request. */
function mockChain(anilistId: number | null, flix: unknown, flixOk = true) {
  const fetchMock = vi.fn();
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      data: {
        Page: {
          media: anilistId === null ? [] : [{ id: anilistId, idMal: 1, episodes: 12, startDate: null }],
        },
      },
    }),
  });
  fetchMock.mockResolvedValueOnce(flixResponse(flix, flixOk));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getStreamSources", () => {
  it("queries flix with the AniList id, not the MAL id", async () => {
    const fetchMock = mockChain(154587, { success: true, servers: [server("HD-1", "sub")] });

    await getStreamSources(52991, 1);

    expect(fetchMock.mock.calls[1][0]).toBe("https://reanime.to/api/flix/154587/1");
  });

  // AniList splits Steel Ball Run (MAL 61469) into a 1-episode part and an 11-episode part,
  // while MAL numbers the whole run continuously — MAL episode 2 is the second part's 1st.
  it("renumbers the episode onto the right part when AniList splits a MAL entry", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          Page: {
            media: [
              {
                id: 210482,
                idMal: 61469,
                episodes: 11,
                startDate: { year: 2026, month: 9, day: 25 },
                nextAiringEpisode: { episode: 2, airingAt: 1790928000, timeUntilAiring: 1 },
              },
              { id: 190327, idMal: 61469, episodes: 1, startDate: { year: 2026, month: 3, day: 19 } },
            ],
          },
        },
      }),
    });
    fetchMock.mockResolvedValueOnce(flixResponse({ success: true, servers: [server("HD-1", "sub")] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getStreamSources(61469, 2);

    expect(fetchMock.mock.calls[1][0]).toBe("https://reanime.to/api/flix/210482/1");
    // The player still tracks MAL's numbering.
    expect(result?.episode).toBe(2);
  });

  it("maps servers to embed urls and audio tracks", async () => {
    mockChain(154587, {
      success: true,
      servers: [server("HD-1", "sub"), server("HD-2", "dub")],
    });

    const result = await getStreamSources(52991, 3);

    expect(result).toEqual({
      episode: 3,
      servers: [
        { id: "HD-1-sub", serverName: "HD-1", embedUrl: "https://flixcloud.cc/e/HD-1-sub", audio: "sub" },
        { id: "HD-2-dub", serverName: "HD-2", embedUrl: "https://flixcloud.cc/e/HD-2-dub", audio: "dub" },
      ],
    });
  });

  // A wrong id returns HTTP 200 with success:true and no servers, so servers.length is
  // the only signal that distinguishes a usable response.
  it("returns null when success is true but no servers came back", async () => {
    mockChain(154587, { success: true, servers: [] });
    expect(await getStreamSources(52991, 1)).toBeNull();
  });

  // An unresolvable id is overwhelmingly an unreachable AniList rather than an unknown
  // title, so it must not be reported to the user as "no source for this episode".
  it("throws without calling flix when AniList has no id", async () => {
    const fetchMock = mockChain(null, { success: true, servers: [server("HD-1", "sub")] });

    await expect(getStreamSources(999999, 1)).rejects.toBeInstanceOf(StreamSourceError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // A blocked direct call is exactly the deployed-egress case, so it must fall through to
  // the reader rather than failing outright.
  it("falls back to the reader when the direct flix request is rejected", async () => {
    const fetchMock = mockChain(154587, {}, false);
    fetchMock.mockResolvedValueOnce(
      flixResponse({ success: true, servers: [server("HD-2", "sub")] }),
    );

    const result = await getStreamSources(52991, 1);

    expect(result?.servers).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [readerUrl, readerInit] = fetchMock.mock.calls[2];
    expect(readerUrl).toBe("https://r.jina.ai/https://reanime.to/api/flix/154587/1");
    // Without this header the reader wraps the body in markdown and it will not parse.
    expect(readerInit.headers["x-respond-with"]).toBe("text");
  });

  it("throws only once both the direct call and the reader have failed", async () => {
    const fetchMock = mockChain(154587, {}, false);
    fetchMock.mockResolvedValueOnce(flixResponse({}, false));

    await expect(getStreamSources(52991, 1)).rejects.toBeInstanceOf(StreamSourceError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not call the reader when the direct request succeeds", async () => {
    const fetchMock = mockChain(154587, { success: true, servers: [server("HD-1", "sub")] });

    await getStreamSources(52991, 1);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends a browser-like User-Agent so Cloudflare does not serve an interstitial", async () => {
    const fetchMock = mockChain(154587, { success: true, servers: [server("HD-1", "sub")] });

    await getStreamSources(52991, 1);

    const init = fetchMock.mock.calls[1][1];
    expect(init.headers["User-Agent"]).toMatch(/Mozilla/);
    // The origin sends `no-store`; without this Next refuses to populate the Data Cache.
    expect(init.cache).toBe("force-cache");
  });

  it("drops servers with an unrecognised audio track", async () => {
    mockChain(154587, { success: true, servers: [server("HD-1", "raw"), server("HD-2", "sub")] });

    const result = await getStreamSources(52991, 1);

    expect(result?.servers).toHaveLength(1);
    expect(result?.servers[0].serverName).toBe("HD-2");
  });
});

describe("pickDefaultServer", () => {
  const servers: StreamServer[] = [
    { id: "a", serverName: "HD-1", embedUrl: "a", audio: "sub" },
    { id: "b", serverName: "HD-2", embedUrl: "b", audio: "sub" },
    { id: "c", serverName: "HD-1", embedUrl: "c", audio: "dub" },
  ];

  it("prefers HD-2 within the requested audio track", () => {
    expect(pickDefaultServer(servers, "sub")?.id).toBe("b");
  });

  it("falls back to the first server of the requested track when HD-2 is absent", () => {
    expect(pickDefaultServer(servers, "dub")?.id).toBe("c");
  });

  it("falls back to any server when the requested track is unavailable", () => {
    const subOnly = servers.filter((s) => s.audio === "sub");
    expect(pickDefaultServer(subOnly, "dub")?.id).toBe("b");
  });

  it("returns undefined for an empty list", () => {
    expect(pickDefaultServer([], "sub")).toBeUndefined();
  });
});
