import { Shimmer } from "@/components/Shimmer";

// Finding a title across the reader sources takes a few seconds (up to ~6s on a cold cache),
// so this mirrors the real page's layout closely enough that nothing jumps when it arrives.
export default function ReadMangaLoading() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6" aria-busy="true" aria-label="Finding chapters">
      <Shimmer className="h-4 w-28" />

      <div className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4">
        <Shimmer className="aspect-2/3 w-16 shrink-0 rounded-lg" />
        <div className="flex flex-1 flex-col gap-2">
          <Shimmer className="h-5 w-3/5" />
          <Shimmer className="h-3.5 w-2/5" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Shimmer className="h-8 w-40 rounded-lg" />
        <Shimmer className="h-8 w-36 rounded-lg" />
      </div>

      <div className="flex items-center justify-between gap-2">
        <Shimmer className="h-3 w-40" />
        <Shimmer className="h-7 w-52 rounded-lg" />
      </div>

      <div className="divide-y divide-border rounded-xl border border-border bg-surface">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-3 px-4 py-3.5">
            <div className="flex items-center gap-2">
              <Shimmer className="size-3.5 shrink-0" />
              <Shimmer className="h-3.5 w-28" />
            </div>
            <Shimmer className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
