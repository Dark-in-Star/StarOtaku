"use client";

import { Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SearchOverlay, browseSearchHref } from "./SearchOverlay";

export function SearchBar({ className, mobileCollapse }: { className?: string; mobileCollapse?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") ?? "");
  const [origin, setOrigin] = useState<HTMLElement | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setValue(e.target.value);
    // Only a real character takes over the page — a click or tab into the box shouldn't.
    if (e.target.value.trim()) setOrigin(e.currentTarget);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    router.push(browseSearchHref(q));
    setMobileOpen(false);
  }

  const overlay = (
    <SearchOverlay
      open={origin !== null}
      origin={origin}
      query={value}
      onQueryChange={setValue}
      onClosed={() => setOrigin(null)}
    />
  );

  const form = (
    <form onSubmit={handleSubmit} className="relative w-full">
      <Input
        type="search"
        value={value}
        onChange={handleChange}
        placeholder="Search anime or manga..."
        className={cn(
          "h-9 rounded-full border-border bg-surface-muted pr-9 placeholder:text-muted focus-visible:border-accent",
          className,
        )}
      />
      <Button
        type="submit"
        variant="ghost"
        size="icon-sm"
        aria-label="Search"
        className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full text-muted hover:text-accent"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
          <circle cx="9" cy="9" r="6" />
          <path strokeLinecap="round" d="M17 17l-3.5-3.5" />
        </svg>
      </Button>
    </form>
  );

  if (!mobileCollapse) {
    return (
      <>
        {form}
        {overlay}
      </>
    );
  }

  const expandedMobileForm = (
    <form onSubmit={handleSubmit} className="relative flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <Input
        type="search"
        value={value}
        onChange={handleChange}
        placeholder="Search anime or manga..."
        autoFocus
        className="h-9 rounded-full border-border bg-surface-muted pl-9 placeholder:text-muted focus-visible:border-accent"
      />
    </form>
  );

  return (
    <>
      <div className="hidden sm:ml-auto sm:block sm:w-64">{form}</div>
      <div className={cn("ml-auto sm:hidden", mobileOpen && "w-full")}>
        {mobileOpen ? (
          <div className="flex w-full items-center gap-1">
            {expandedMobileForm}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close search"
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Search anime or manga"
            onClick={() => setMobileOpen(true)}
          >
            <Search className="h-4 w-4" />
          </Button>
        )}
      </div>
      {overlay}
    </>
  );
}
