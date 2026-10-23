import { NextResponse, type NextRequest } from "next/server";
import { refreshAccessToken } from "@/lib/malAuth";
import { SESSION_COOKIE_NAME, sessionCookieOptions, type MalSession } from "@/lib/session";

// Proxy (formerly "middleware") always runs on the Node.js runtime in Next.js 16,
// so node:crypto usage in malAuth.ts works without extra configuration.

// This runs only to refresh a near-expiry session cookie before the render that follows,
// and every path reaching it bills a function invocation — so anything that can't carry a
// refreshable session is excluded: build assets, `/api/reader/*` (immutable, CDN-held
// images that must not be dragged back through a function on each hit), and any path whose
// last segment has a file extension, which covers everything served from `public/`.
export const config = {
  matcher: ["/((?!_next/static|_next/image|api/reader|icons/)(?!.*\\.\\w+$).*)"],
};

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

export async function proxy(request: NextRequest) {
  const session = parseSession(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (!session || session.expiresAt > Date.now() + 5 * 60_000) {
    return NextResponse.next();
  }

  try {
    const tokens = await refreshAccessToken(session.refreshToken);
    const next: MalSession = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    };
    const serialized = JSON.stringify(next);

    // Update the request cookie too, so the Server Component render that follows
    // this middleware pass (within the same request) already sees the fresh token.
    request.cookies.set(SESSION_COOKIE_NAME, serialized);
    const response = NextResponse.next({ request });
    response.cookies.set(SESSION_COOKIE_NAME, serialized, sessionCookieOptions);
    return response;
  } catch {
    // Refresh token is expired or revoked — drop the session so the UI shows a
    // logged-out state instead of repeatedly failing authenticated requests.
    const response = NextResponse.next();
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }
}
