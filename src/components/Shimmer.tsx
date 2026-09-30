import { cn } from "@/lib/utils";

/**
 * A placeholder block with a light sweep across it (`animate-shimmer` in globals.css). The
 * sweep is an absolutely positioned ::after, so the block must clip it — hence the
 * built-in `relative overflow-hidden`.
 */
export function Shimmer({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-shimmer relative overflow-hidden rounded bg-surface-muted", className)} />;
}
