import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { pageWindow } from "@/lib/pagination";
import { cn } from "@/lib/utils";

const ITEM = "flex h-9 min-w-9 items-center justify-center rounded-lg border px-2.5 text-sm font-medium transition-colors";
const IDLE = "border-border bg-surface text-foreground hover:border-accent hover:text-accent";

export function Pagination({ page, totalPages, href }: { page: number; totalPages: number; href: (page: number) => string }) {
  if (totalPages <= 1) return null;

  const arrow = (target: number, label: string, icon: React.ReactNode) =>
    target >= 1 && target <= totalPages ? (
      <Link href={href(target)} aria-label={label} className={cn(ITEM, IDLE)} prefetch={false}>
        {icon}
      </Link>
    ) : (
      <span aria-hidden className={cn(ITEM, "pointer-events-none border-border bg-surface opacity-40")}>
        {icon}
      </span>
    );

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-center gap-1.5">
      {arrow(page - 1, "Previous page", <ChevronLeft className="size-4" />)}
      {pageWindow(page, totalPages).map((slot, i) =>
        slot === "gap" ? (
          <span key={`gap-${i}`} className="px-1 text-sm text-muted">
            …
          </span>
        ) : slot === page ? (
          <span key={slot} aria-current="page" className={cn(ITEM, "border-accent bg-accent text-accent-foreground")}>
            {slot}
          </span>
        ) : (
          <Link key={slot} href={href(slot)} className={cn(ITEM, IDLE)} prefetch={false}>
            {slot}
          </Link>
        ),
      )}
      {arrow(page + 1, "Next page", <ChevronRight className="size-4" />)}
    </nav>
  );
}
