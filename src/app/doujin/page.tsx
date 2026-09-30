import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdultConsentGate } from "@/components/AdultConsentGate";
import { adultReaderEnabled, hasAdultConsent } from "@/lib/reader/adultGate";
import { nhentaiThumbUrl, searchNhentai, type NhentaiSort } from "@/lib/reader/nhentai";

export const metadata: Metadata = { title: "Doujin", robots: { index: false } };

const SORTS: { value: NhentaiSort; label: string }[] = [
  { value: "popular-week", label: "Popular this week" },
  { value: "popular", label: "All-time popular" },
  { value: "date", label: "Newest" },
];

export default async function DoujinPage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string; page?: string }> }) {
  if (!adultReaderEnabled()) notFound();
  if (!(await hasAdultConsent())) return <AdultConsentGate />;

  const { q, sort: rawSort, page: rawPage } = await searchParams;
  const sort = SORTS.find((s) => s.value === rawSort)?.value ?? "popular-week";
  const page = Math.max(1, Number(rawPage) || 1);
  // English by default: the reader's audience is English-speaking, and nhentai's
  // unfiltered index is mostly untranslated Japanese and Chinese uploads.
  const query = q?.trim() ? q.trim() : "language:english";

  const results = await searchNhentai(query, page, sort);
  const cards = await Promise.all(results.result.map(async (hit) => ({ ...hit, thumb: await nhentaiThumbUrl(hit) })));

  const pageHref = (p: number) => `/doujin?${new URLSearchParams({ ...(q ? { q } : {}), sort, page: String(p) })}`;

  return (
    <div className="flex flex-col gap-6">
      <form className="flex flex-col gap-2 sm:flex-row" action="/doujin">
        <input
          name="q"
          defaultValue={q}
          placeholder='Search — e.g. tag:"vanilla" language:english -tag:"netorare"'
          className="h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-sm"
        />
        <select name="sort" defaultValue={sort} className="h-10 rounded-lg border border-border bg-surface px-3 text-sm">
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Search</button>
      </form>

      <p className="text-sm text-muted">{results.total.toLocaleString()} results</p>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5" data-testid="doujin-results">
        {cards.map((hit) => (
          <li key={hit.id}>
            <Link href={`/doujin/${hit.id}`} prefetch={false} className="group flex flex-col gap-2">
              <div className="aspect-2/3 overflow-hidden rounded-lg border border-border bg-surface-muted">
                {/* eslint-disable-next-line @next/next/no-img-element -- remote CDN, served unoptimized */}
                <img src={hit.thumb} alt="" loading="lazy" className="size-full object-cover transition group-hover:scale-105" />
              </div>
              <span className="line-clamp-2 text-xs text-foreground">{hit.english_title}</span>
              <span className="text-xs text-muted">{hit.num_pages} pages</span>
            </Link>
          </li>
        ))}
      </ul>

      <nav className="flex justify-between">
        {page > 1 ? <Link href={pageHref(page - 1)}>← Previous</Link> : <span />}
        {page < results.num_pages && <Link href={pageHref(page + 1)}>Next →</Link>}
      </nav>
    </div>
  );
}
