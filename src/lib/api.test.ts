import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./session", () => ({
  getValidAccessToken: vi.fn(),
}));

import { getValidAccessToken } from "./session";
import {
  ApiError,
  AuthRequiredError,
  getAnimeList,
  getAnimeRanking,
  getAnime,
  getMangaRanking,
  getMyUserInfo,
  getSeasonalAnime,
  searchAnime,
  searchManga,
} from "./api";

const originalFetch = global.fetch;
const mockGetValidAccessToken = vi.mocked(getValidAccessToken);

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const { ok = true, status = 200 } = init;
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

beforeEach(() => {
  process.env.MAL_API_BASE_URL = "http://localhost:3000";
  process.env.MAL_CLIENT_ID = "test-client-id";
  mockGetValidAccessToken.mockResolvedValue(null);
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("searchAnime", () => {
  it("builds a request with the search query and limit", async () => {
    const fetchMock = mockFetchOnce({ data: [] });

    await searchAnime("naruto", 10);

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("/anime?");
    expect(url).toContain("q=naruto");
    expect(url).toContain("limit=10");
  });

  it("pads a query shorter than MAL's 3-character minimum", async () => {
    const fetchMock = mockFetchOnce({ data: [] });

    await searchAnime("86", 10);

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(new URL(url).searchParams.get("q")).toBe("86.");
  });
});

describe("getAnimeRanking", () => {
  it("requests the given ranking type", async () => {
    const fetchMock = mockFetchOnce({ data: [] });

    await getAnimeRanking("airing", 5);

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("ranking_type=airing");
    expect(url).toContain("limit=5");
  });
});

describe("browse endpoints", () => {
  // MAL drops gray/black titles from search and seasonal results without nsfw=true, even
  // for a logged-in caller — nothing on MAL should be unreachable from browse.
  it.each([
    ["searchAnime", () => searchAnime("kuroinu")],
    ["searchManga", () => searchManga("kuroinu")],
    ["getAnimeRanking", () => getAnimeRanking("all")],
    ["getMangaRanking", () => getMangaRanking("all")],
    ["getSeasonalAnime", () => getSeasonalAnime(2020, "winter")],
  ])("%s asks for nsfw entries", async (_name, call) => {
    const fetchMock = mockFetchOnce({ data: [] });

    await call();

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(new URL(url).searchParams.get("nsfw")).toBe("true");
  });
});

describe("getAnime", () => {
  it("sends the app's client ID header (not a token) when logged out", async () => {
    const fetchMock = mockFetchOnce({ id: 1, title: "Frieren" });

    const result = await getAnime(1);

    expect(result).toEqual({ id: 1, title: "Frieren" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-MAL-CLIENT-ID"]).toBe("test-client-id");
    expect(headers.Authorization).toBeUndefined();
  });

  it("forwards the session token as a Bearer header when logged in", async () => {
    mockGetValidAccessToken.mockResolvedValue("session-token");
    const fetchMock = mockFetchOnce({ id: 1, title: "Frieren", my_list_status: { status: "watching" } });

    await getAnime(1);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer session-token");
  });

  // The Data Cache keys on URL + fetch options only, never on request headers, so a
  // token-bearing response must never be cacheable or one visitor's my_list_status would
  // be served to the next. The logged-out response carries no personal data and is cached.
  it("caches the logged-out response but never a token-bearing one", async () => {
    const anonFetch = mockFetchOnce({ id: 1, title: "Frieren" });
    await getAnime(1);
    const [, anonInit] = anonFetch.mock.calls[0] as [string, RequestInit];
    expect(anonInit.cache).toBeUndefined();
    expect((anonInit as { next?: { revalidate?: number } }).next?.revalidate).toBe(3600);

    mockGetValidAccessToken.mockResolvedValue("session-token");
    const authFetch = mockFetchOnce({ id: 1, title: "Frieren" });
    await getAnime(1);
    const [, authInit] = authFetch.mock.calls[0] as [string, RequestInit];
    expect(authInit.cache).toBe("no-store");
    expect((authInit as { next?: unknown }).next).toBeUndefined();
  });

  it("throws an ApiError with status 404 for a missing anime", async () => {
    mockFetchOnce({ error: "not_found" }, { ok: false, status: 404 });

    await expect(getAnime(999)).rejects.toMatchObject({ status: 404 });
    await expect(getAnime(999)).rejects.toBeInstanceOf(ApiError);
  });

  it("treats MAL's throttle redirect as rate limiting instead of following it", async () => {
    const fetchMock = mockFetchOnce(null, { ok: false, status: 307 });

    await expect(getAnime(1)).rejects.toMatchObject({ status: 429 });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.redirect).toBe("manual");
  });

  it("throws a 503 ApiError when the server is unreachable", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

    await expect(getAnime(1)).rejects.toMatchObject({ status: 503 });
  });
});

describe("getAnimeList", () => {
  it("throws AuthRequiredError when there is no session", async () => {
    await expect(getAnimeList()).rejects.toBeInstanceOf(AuthRequiredError);
  });

  it("sends the session token and returns the list when logged in", async () => {
    mockGetValidAccessToken.mockResolvedValue("session-token");
    const fetchMock = mockFetchOnce({ data: [] });

    await getAnimeList();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/users/@me/animelist");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer session-token");
  });
});

describe("getMyUserInfo", () => {
  it("throws AuthRequiredError when there is no session", async () => {
    await expect(getMyUserInfo()).rejects.toBeInstanceOf(AuthRequiredError);
  });

  it("returns the profile when logged in", async () => {
    mockGetValidAccessToken.mockResolvedValue("session-token");
    mockFetchOnce({ id: 1, name: "tester" });

    await expect(getMyUserInfo()).resolves.toEqual({ id: 1, name: "tester" });
  });
});

describe("getAnimeList pagination", () => {
  function mockFetchSequence(bodies: unknown[]) {
    const fetchMock = vi.fn();
    for (const body of bodies) {
      fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(body) });
    }
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  it("follows paging.next so a list longer than one page isn't truncated", async () => {
    mockGetValidAccessToken.mockResolvedValue("token");

    const first = Array.from({ length: 1000 }, (_, i) => ({ node: { id: i } }));
    const second = [{ node: { id: 5000 } }, { node: { id: 5001 } }];

    const fetchMock = mockFetchSequence([
      { data: first, paging: { next: "https://api.myanimelist.net/next" } },
      { data: second, paging: {} },
    ]);

    const result = await getAnimeList();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.data).toHaveLength(1002);
    // The entry that used to fall off the end must now be present.
    expect(result.data.some((e) => (e.node as { id: number }).id === 5001)).toBe(true);

    const secondUrl = String(fetchMock.mock.calls[1][0]);
    expect(secondUrl).toContain("offset=1000");
  });

  it("asks for nsfw entries so the list isn't silently filtered", async () => {
    mockGetValidAccessToken.mockResolvedValue("token");
    const fetchMock = mockFetchSequence([{ data: [], paging: {} }]);

    await getAnimeList();

    // Without nsfw=true MAL omits gray/black entries, which made the sequel scan
    // re-suggest R-rated titles the user had already completed.
    expect(String(fetchMock.mock.calls[0][0])).toContain("nsfw=true");
  });

  it("stops after a single request when there is no next page", async () => {
    mockGetValidAccessToken.mockResolvedValue("token");
    const fetchMock = mockFetchSequence([{ data: [{ node: { id: 1 } }], paging: {} }]);

    const result = await getAnimeList();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.data).toHaveLength(1);
  });
});

describe("a session whose token has expired", () => {
  function mockFetchStatuses(responses: { status: number; body?: unknown }[]) {
    const fetchMock = vi.fn();
    for (const { status, body } of responses) {
      fetchMock.mockResolvedValueOnce({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(body ?? {}),
      });
    }
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  function authHeaderOf(call: unknown[]): Record<string, string> {
    return (call[1] as { headers: Record<string, string> }).headers;
  }

  it("retries a public ranking with the client ID instead of failing the page", async () => {
    mockGetValidAccessToken.mockResolvedValue("expired-token");
    const fetchMock = mockFetchStatuses([{ status: 401 }, { status: 200, body: { data: [] } }]);

    // MAL 401s an expired bearer token even on endpoints that need no token at all, which
    // took down every browse route for a visitor whose session had simply lapsed.
    await expect(getAnimeRanking("all")).resolves.toEqual({ data: [] });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authHeaderOf(fetchMock.mock.calls[0])).toHaveProperty("Authorization");
    expect(authHeaderOf(fetchMock.mock.calls[1])).toHaveProperty("X-MAL-CLIENT-ID");
  });

  it("retries search and detail reads the same way", async () => {
    mockGetValidAccessToken.mockResolvedValue("expired-token");

    mockFetchStatuses([{ status: 401 }, { status: 200, body: { data: [] } }]);
    await expect(searchAnime("naruto")).resolves.toEqual({ data: [] });

    mockFetchStatuses([{ status: 401 }, { status: 200, body: { id: 1 } }]);
    await expect(getAnime(1)).resolves.toEqual({ id: 1 });
  });

  it("never downgrades a personal list read to an anonymous one", async () => {
    mockGetValidAccessToken.mockResolvedValue("expired-token");
    const fetchMock = mockFetchStatuses([{ status: 401 }]);

    // Retrying /users/@me/animelist without the token would ask MAL for "my" list as
    // nobody — the visitor must be told to log in again instead.
    await expect(getAnimeList()).rejects.toThrow(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still surfaces a 401 that is not about an optional token", async () => {
    mockGetValidAccessToken.mockResolvedValue(null);
    const fetchMock = mockFetchStatuses([{ status: 401 }]);

    // No token was attached, so a 401 here means the app's own client ID was rejected —
    // a real misconfiguration that must not be retried into a loop or swallowed.
    await expect(getAnimeRanking("all")).rejects.toThrow(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
