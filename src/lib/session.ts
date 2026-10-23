import "server-only";
import { cookies } from "next/headers";
import { refreshAccessToken } from "./malAuth";

export const SESSION_COOKIE_NAME = "mal_session";
export const PKCE_COOKIE_NAME = "mal_pkce";

export interface MalSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

const isProd = process.env.NODE_ENV === "production";

export const sessionCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 31, // 31 days — matches MAL's refresh token lifetime
};

export const pkceCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 10, // 10 minutes — just long enough to complete the MAL login redirect
};

function serializeSession(session: MalSession): string {
  return JSON.stringify(session);
}

function parseSession(raw: string | undefined): MalSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<MalSession>;
    if (!parsed.accessToken || !parsed.refreshToken || !parsed.expiresAt) return null;
    return parsed as MalSession;
  } catch {
    return null;
  }
}

/** Reads the raw session cookie without attempting a refresh. */
export async function getSession(): Promise<MalSession | null> {
  const store = await cookies();
  return parseSession(store.get(SESSION_COOKIE_NAME)?.value);
}

/** Writes the session cookie. Only callable from Route Handlers and Server Actions. */
export async function setSession(session: MalSession): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, serializeSession(session), sessionCookieOptions);
}

/** Clears the session cookie. Only callable from Route Handlers and Server Actions. */
export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

/**
 * Returns a currently-valid access token, or null if the visitor isn't logged in.
 *
 * This refresh is the only one there is: there is no middleware pre-refreshing sessions
 * (an earlier version of this comment claimed otherwise). It refreshes inline and tries to
 * persist the new session, but Server Components can't write cookies, so that persistence
 * silently no-ops in a page render — the caller still gets a valid token for that one
 * request, and the next render refreshes again until a Server Action or Route Handler
 * writes the cookie back.
 *
 * Returning null here means "treat this visitor as logged out". Callers that attach the
 * token opportunistically must pass `optionalToken` to apiGet, because MAL rejects an
 * expired bearer token with a 401 even on endpoints that need no token at all.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;
  if (session.expiresAt > Date.now() + 60_000) return session.accessToken;

  try {
    const tokens = await refreshAccessToken(session.refreshToken);
    const next: MalSession = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    };
    await setSession(next).catch(() => {});
    return next.accessToken;
  } catch {
    return null;
  }
}
