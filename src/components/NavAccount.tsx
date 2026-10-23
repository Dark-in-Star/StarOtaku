import { getMyUserInfo } from "@/lib/api";
import { getSession } from "@/lib/session";
import { AccountMenu } from "./AccountMenu";
import { MobileProfileSheet } from "./MobileProfileSheet";

/**
 * The only part of the chrome that depends on the visitor.
 *
 * It lives apart from NavBar so the root layout never reads cookies itself: reading them
 * there opted every route in the app into dynamic rendering, so nothing could be
 * prerendered or served from the CDN. Rendered inside <Suspense>, the cookie read is
 * deferred past the static shell — the rest of the page is prerendered and this slot
 * streams in behind it.
 */
export async function NavAccount() {
  const session = await getSession();

  let pictureUrl: string | undefined;
  let userName: string | undefined;
  if (session) {
    try {
      const user = await getMyUserInfo("picture");
      pictureUrl = user.picture;
      userName = user.name;
    } catch {
      // Session cookie present but the profile fetch failed (e.g. a revoked token the
      // proxy hasn't caught yet) — fall back to the icon-only avatar state.
    }
  }

  const isAuthenticated = Boolean(session);

  return (
    <>
      <AccountMenu isAuthenticated={isAuthenticated} pictureUrl={pictureUrl} userName={userName} />
      <MobileProfileSheet isAuthenticated={isAuthenticated} pictureUrl={pictureUrl} userName={userName} />
    </>
  );
}

/**
 * Matches the footprint of the resolved menu + sheet so the header doesn't reflow when
 * the streamed auth state lands.
 */
export function NavAccountFallback() {
  return (
    <>
      <div className="hidden h-9 w-9 shrink-0 rounded-full bg-surface-muted lg:block" />
      <div className="h-9 w-9 shrink-0 rounded-full bg-surface-muted lg:hidden" />
    </>
  );
}
