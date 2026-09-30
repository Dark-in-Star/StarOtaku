import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdultConsentGate } from "@/components/AdultConsentGate";
import { ReaderStrip } from "@/components/ReaderStrip";
import { adultReaderEnabled, hasAdultConsent } from "@/lib/reader/adultGate";
import { getNhentaiGallery, getNhentaiPages } from "@/lib/reader/nhentai";

export const metadata: Metadata = { title: "Doujin", robots: { index: false } };

const TAG_TYPES_SHOWN = new Set(["artist", "group", "parody", "character", "tag", "language"]);

export default async function DoujinGalleryPage({ params }: { params: Promise<{ id: string }> }) {
  if (!adultReaderEnabled()) notFound();
  if (!(await hasAdultConsent())) return <AdultConsentGate />;

  const { id } = await params;
  const [gallery, pages] = await Promise.all([getNhentaiGallery(Number(id)), getNhentaiPages(Number(id))]);
  if (!gallery) notFound();

  const tags = gallery.tags.filter((tag) => TAG_TYPES_SHOWN.has(tag.type));

  return (
    <div className="flex flex-col gap-4">
      <ReaderStrip
        title={gallery.title.pretty || gallery.title.english}
        subtitle={`${gallery.num_pages} pages · ${gallery.num_favorites.toLocaleString()} favorites`}
        pages={pages}
        indexHref="/doujin"
      />
      <ul className="mx-auto flex max-w-3xl flex-wrap gap-1.5">
        {tags.map((tag) => (
          <li key={tag.id} className="rounded-md bg-surface-muted px-2 py-0.5 text-xs text-muted">
            {tag.type === "tag" ? tag.name : `${tag.type}: ${tag.name}`}
          </li>
        ))}
      </ul>
    </div>
  );
}
