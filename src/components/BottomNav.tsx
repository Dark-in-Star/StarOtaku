"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Archive, Bookmark, Compass, Home } from "lucide-react";
import { NAV_LINKS, isNavLinkActive } from "./nav-links";

const ICONS: Record<string, typeof Home> = {
  "/": Home,
  "/browse": Compass,
  "/archive": Archive,
  "/mylist": Bookmark,
};

/**
 * The bar itself, with `pathname` supplied rather than read, so the prerendered shell can
 * render it with nothing active and the real highlight can stream in.
 */
function BottomNavBar({ pathname }: { pathname: string | null }) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/90 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-7xl items-stretch justify-around">
        {NAV_LINKS.map((link) => {
          const Icon = ICONS[link.href];
          const active = pathname !== null && isNavLinkActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={clsx(
                "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                active ? "text-accent" : "text-muted hover:text-foreground",
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 2} />
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function BottomNav() {
  return <BottomNavBar pathname={usePathname()} />;
}

/** The same bar with nothing highlighted — what the static shell ships. */
export function BottomNavFallback() {
  return <BottomNavBar pathname={null} />;
}
