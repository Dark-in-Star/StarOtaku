"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function ZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
  canZoomIn,
  canZoomOut,
  className,
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
  className?: string;
}) {
  const button =
    "flex size-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-surface-muted disabled:pointer-events-none disabled:opacity-40";
  return (
    <div role="group" aria-label="Zoom" className={cn("flex shrink-0 items-center rounded-lg border border-border bg-surface p-0.5", className)}>
      <button type="button" onClick={onZoomOut} disabled={!canZoomOut} aria-label="Zoom out" className={button}>
        <Minus className="size-4" />
      </button>
      <button
        type="button"
        onClick={onReset}
        aria-label="Reset zoom"
        title="Reset zoom"
        className="h-8 min-w-12 rounded-md px-1 text-xs font-semibold tabular-nums text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" onClick={onZoomIn} disabled={!canZoomIn} aria-label="Zoom in" className={button}>
        <Plus className="size-4" />
      </button>
    </div>
  );
}
