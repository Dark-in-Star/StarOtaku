"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import clsx from "clsx";
import { MobileMediaToggle } from "./MobileMediaToggle";
import { SearchBar } from "./SearchBar";
import { ThemeToggle } from "./ThemeToggle";
import { NAV_LINKS, isNavLinkActive } from "./nav-links";

// `account` is the auth-dependent slot, passed in as a prop because it's a Server
// Component: that keeps the cookie read out of this client tree and out of the layout, so
// the surrounding chrome stays part of the prerendered shell.
function NavBarInner({ account, pathname }: { account: React.ReactNode; pathname: string }) {
  const pageHasOwnSearch = pathname === "/" || pathname.startsWith("/mylist") || pathname.startsWith("/browse");
  const isMyList = pathname.startsWith("/mylist");

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
      <div className="relative mx-auto flex h-14 max-w-7xl items-center gap-3 px-3 sm:h-16 sm:px-6">
        {isMyList && (
          <div className="flex shrink-0 items-center sm:hidden">
            <Suspense fallback={<div className="h-8 w-28 rounded-full bg-surface-muted" />}>
              <MobileMediaToggle />
            </Suspense>
          </div>
        )}

        <Link
          href="/"
          className={clsx(
            "flex shrink-0 items-center",
            isMyList && "max-sm:absolute max-sm:left-1/2 max-sm:top-1/2 max-sm:-translate-x-1/2 max-sm:-translate-y-1/2",
          )}
        >
          <Image src="/brand.webp" alt="Starotaku" width={787} height={209} priority className="h-10 w-auto sm:h-12" />
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={clsx(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isNavLinkActive(pathname, link.href)
                  ? "bg-accent-soft text-accent"
                  : "text-muted hover:bg-surface-muted hover:text-foreground",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          {!pageHasOwnSearch && (
            <div className="hidden sm:block sm:w-40 lg:w-56">
              <Suspense fallback={<div className="h-9 w-full rounded-full bg-surface-muted" />}>
                <SearchBar />
              </Suspense>
            </div>
          )}

          <ThemeToggle />

          {account}
        </div>
      </div>
    </header>
  );
}

export function NavBar({ account }: { account: React.ReactNode }) {
  return <NavBarInner account={account} pathname={usePathname()} />;
}

/**
 * The header as the static shell ships it: "/" is the safe stand-in, since the only
 * things pathname drives here are the active link highlight and whether the page supplies
 * its own search box.
 */
export function NavBarFallback({ account }: { account: React.ReactNode }) {
  return <NavBarInner account={account} pathname="/" />;
}
