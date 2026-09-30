import { Shimmer } from "@/components/Shimmer";

function NavSkeleton() {
  return (
    <div className="flex items-center justify-between gap-2">
      <Shimmer className="h-9 w-20 rounded-lg" />
      <Shimmer className="h-9 w-28 rounded-lg" />
      <Shimmer className="h-9 w-20 rounded-lg" />
    </div>
  );
}

export default function ReadChapterLoading() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4" aria-busy="true" aria-label="Loading chapter">
      <div className="flex flex-col gap-2">
        <Shimmer className="h-5 w-48" />
        <Shimmer className="h-3.5 w-64" />
      </div>
      <NavSkeleton />
      <div className="-mx-4 flex flex-col gap-1 sm:mx-0">
        <Shimmer className="aspect-2/3 w-full rounded-none" />
        <Shimmer className="aspect-2/3 w-full rounded-none" />
      </div>
    </div>
  );
}
