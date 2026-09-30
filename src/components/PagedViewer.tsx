"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type TouchEvent,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReaderPage } from "@/lib/reader/types";
import {
  anchoredScroll,
  clampPageZoom,
  DOUBLE_TAP_ZOOM,
  fitScale,
  PAGE_ZOOM_MAX,
  PAGE_ZOOM_MIN,
  stepPageZoom,
  type Size,
} from "@/lib/zoom";
import { cn } from "@/lib/utils";
import { Shimmer } from "@/components/Shimmer";
import { ZoomControls } from "@/components/ZoomControls";

const SWIPE_MIN_PX = 50;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP_PX = 30;

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("input, select, textarea, [contenteditable]"));
}

function PagedImage({
  page,
  index,
  size,
  onNatural,
}: {
  page: ReaderPage;
  index: number;
  /** Display size once known; until then the image just fits the viewer. */
  size: Size | null;
  onNatural: (natural: Size) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  // A cached page can finish before hydration attaches onLoad.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth) {
      setLoaded(true);
      onNatural({ w: img.naturalWidth, h: img.naturalHeight });
    }
  }, [onNatural]);

  return (
    <>
      {!loaded && (
        <div className="pointer-events-none absolute inset-0">
          <Shimmer className="absolute inset-0 rounded-none" />
          <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-muted">
            Page {index + 1}
          </span>
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- remote hosts with unknown sizes, served unoptimized */}
      <img
        ref={ref}
        src={page.url}
        alt={`Page ${index + 1}`}
        decoding="async"
        draggable={false}
        onLoad={(e) => {
          setLoaded(true);
          onNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
        }}
        onError={() => setLoaded(true)}
        style={size ? { width: size.w, height: size.h, maxWidth: "none" } : undefined}
        className={cn("block shrink-0", !size && "max-h-full max-w-full object-contain")}
        data-reader-page={index + 1}
      />
    </>
  );
}

/**
 * One page at a time, fitted to the screen. Turn pages with the side arrows, a tap on the
 * left or right third, a horizontal swipe, the slider, or the keyboard. Zoom with a pinch,
 * a double-tap in the middle, Ctrl + wheel, the +/− keys or the zoom buttons; while zoomed,
 * dragging pans and swipes/edge taps are paused so they can't turn the page by accident.
 * `page === pages.length` is the end-of-chapter slot, which shows `end`.
 */
export function PagedViewer({
  pages,
  page,
  onNext,
  onPrevious,
  onJump,
  end,
  fullscreen = false,
  toolbar,
}: {
  pages: ReaderPage[];
  page: number;
  onNext: () => void;
  onPrevious: () => void;
  onJump: (page: number) => void;
  end: ReactNode;
  /** Fills the screen instead of sitting between the app's header and bottom bar. */
  fullscreen?: boolean;
  /** Extra controls for the bottom row (e.g. the full-screen toggle). */
  toolbar?: ReactNode;
}) {
  const viewer = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Size | null>(null);
  const current = pages[page];
  const atEnd = !current;

  // Zoom and the page's natural size are tied to the page they were measured on, so turning
  // the page resets to fit without an effect.
  const [zoomState, setZoomState] = useState({ page, zoom: 1 });
  const zoom = zoomState.page === page ? zoomState.zoom : 1;
  const [naturalState, setNaturalState] = useState<{ url: string; size: Size } | null>(null);
  const natural = useMemo(
    () =>
      current && naturalState?.url === current.url
        ? naturalState.size
        : current?.width && current.height
          ? { w: current.width, h: current.height }
          : null,
    [current, naturalState],
  );

  const fit = natural && box ? fitScale(natural, box) : null;
  const size = natural && fit ? { w: natural.w * fit * zoom, h: natural.h * fit * zoom } : null;
  const zoomed = zoom > 1.01;

  const onNatural = useCallback(
    (measured: Size) => {
      if (current) setNaturalState({ url: current.url, size: measured });
    },
    [current],
  );

  useEffect(() => {
    const el = viewer.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setBox({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Preloading the next two pages makes turning feel instant; the browser caches them.
  useEffect(() => {
    for (const next of pages.slice(page + 1, page + 3)) {
      const img = new Image();
      img.src = next.url;
    }
  }, [page, pages]);

  const pendingScroll = useRef<{ left: number; top: number } | null>(null);

  const zoomTo = useCallback(
    (target: number, anchor?: { x: number; y: number }) => {
      const next = clampPageZoom(target);
      const el = scroller.current;
      if (el && natural && fit && box) {
        const at = anchor ?? { x: el.clientWidth / 2, y: el.clientHeight / 2 };
        pendingScroll.current = anchoredScroll(
          { left: el.scrollLeft, top: el.scrollTop },
          at,
          { w: natural.w * fit * zoom, h: natural.h * fit * zoom },
          { w: natural.w * fit * next, h: natural.h * fit * next },
          box,
        );
      }
      setZoomState({ page, zoom: next });
    },
    [box, fit, natural, page, zoom],
  );

  // Applied after the resized image is in the DOM, so the scroll range already fits it.
  useLayoutEffect(() => {
    const el = scroller.current;
    const target = pendingScroll.current;
    if (!el || !target) return;
    pendingScroll.current = null;
    el.scrollLeft = target.left;
    el.scrollTop = target.top;
  }, [zoom]);

  const pointIn = (clientX: number, clientY: number) => {
    const rect = scroller.current?.getBoundingClientRect();
    return rect ? { x: clientX - rect.left, y: clientY - rect.top } : undefined;
  };

  // Ctrl + wheel (and trackpad pinch, which browsers report as Ctrl + wheel) zooms the page
  // rather than the whole site. Needs a non-passive listener to cancel the browser zoom.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      zoomTo(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), { x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoom, zoomTo]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      if (e.key === "+" || e.key === "=") zoomTo(stepPageZoom(zoom, 1));
      else if (e.key === "-" || e.key === "_") zoomTo(stepPageZoom(zoom, -1));
      else if (e.key === "0") zoomTo(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom, zoomTo]);

  // --- touch: swipe to turn, pinch to zoom, double-tap to toggle zoom ---
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const gestureWasPinch = useRef(false);

  const distance = (e: TouchEvent) =>
    Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);

  function inMiddle(clientX: number) {
    const rect = viewer.current?.getBoundingClientRect();
    if (!rect) return false;
    const x = (clientX - rect.left) / rect.width;
    return x >= 0.3 && x <= 0.7;
  }

  function handleTouchStart(e: TouchEvent) {
    if (e.touches.length === 2) {
      pinch.current = { dist: distance(e), zoom };
      gestureWasPinch.current = true;
      swipeStart.current = null;
    } else if (e.touches.length === 1) {
      gestureWasPinch.current = false;
      swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }

  function handleTouchMove(e: TouchEvent) {
    if (!pinch.current || e.touches.length !== 2) return;
    const center = pointIn(
      (e.touches[0].clientX + e.touches[1].clientX) / 2,
      (e.touches[0].clientY + e.touches[1].clientY) / 2,
    );
    zoomTo((pinch.current.zoom * distance(e)) / pinch.current.dist, center);
  }

  function handleTouchEnd(e: TouchEvent) {
    if (e.touches.length < 2) pinch.current = null;
    if (e.touches.length > 0 || gestureWasPinch.current) return;

    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const dx = endX - start.x;
    const dy = endY - start.y;

    // A tap that barely moved: check for a double-tap.
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      const now = Date.now();
      const prev = lastTap.current;
      if (
        prev &&
        now - prev.t < DOUBLE_TAP_MS &&
        Math.abs(endX - prev.x) < DOUBLE_TAP_SLOP_PX &&
        Math.abs(endY - prev.y) < DOUBLE_TAP_SLOP_PX &&
        (zoomed || inMiddle(endX))
      ) {
        lastTap.current = null;
        zoomTo(zoomed ? 1 : DOUBLE_TAP_ZOOM, pointIn(endX, endY));
        return;
      }
      lastTap.current = { t: now, x: endX, y: endY };
      return;
    }

    if (zoomed) return;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) onNext();
    else onPrevious();
  }

  function handleTap(e: MouseEvent<HTMLDivElement>) {
    if (zoomed || (e.target as HTMLElement).closest("a, button, input, select")) return;
    const { left, width } = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - left) / width;
    if (x < 0.3) onPrevious();
    else if (x > 0.7) onNext();
  }

  function handleDoubleClick(e: MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("a, button, input, select")) return;
    if (!zoomed && !inMiddle(e.clientX)) return;
    zoomTo(zoomed ? 1 : DOUBLE_TAP_ZOOM, pointIn(e.clientX, e.clientY));
  }

  // --- mouse: drag to pan while zoomed (touch pans natively) ---
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!zoomed || e.pointerType !== "mouse" || !scroller.current) return;
    drag.current = { x: e.clientX, y: e.clientY, left: scroller.current.scrollLeft, top: scroller.current.scrollTop };
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start || !scroller.current) return;
    scroller.current.scrollLeft = start.left - (e.clientX - start.x);
    scroller.current.scrollTop = start.top - (e.clientY - start.y);
  }

  const arrowClass =
    "absolute top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface/80 text-foreground shadow-sm transition-colors hover:bg-surface sm:size-11";

  return (
    <div className={cn("flex flex-col gap-2", fullscreen && "h-full gap-0")}>
      <div
        ref={viewer}
        className={cn(
          "relative select-none overflow-hidden",
          fullscreen
            ? "min-h-0 flex-1 bg-black"
            : // Leaves room for the app header and bottom bar plus the reader's own title row,
              // chapter menu and slider, so none of the controls is ever pushed off-screen.
              "-mx-3 h-[calc(100dvh-17rem)] min-h-80 bg-surface-muted/40 sm:mx-0 sm:h-[calc(100dvh-19.5rem)] sm:rounded-xl lg:h-[calc(100dvh-16rem)]",
        )}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleTap}
        onDoubleClick={handleDoubleClick}
        data-testid="reader-viewer"
        data-zoom={zoom.toFixed(2)}
      >
        {atEnd ? (
          <div className="flex h-full items-center justify-center overflow-y-auto p-4">{end}</div>
        ) : (
          <div
            key={current.url}
            ref={scroller}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={() => (drag.current = null)}
            onPointerLeave={() => (drag.current = null)}
            className={cn(
              "absolute inset-0 overflow-auto overscroll-contain",
              // Native pinch-zoom is off inside the viewer (our own pinch handles it); panning
              // stays native — vertical only at fit, both ways once zoomed in.
              zoomed ? "cursor-grab touch-pan-x touch-pan-y active:cursor-grabbing" : "touch-pan-y",
            )}
          >
            <div className="relative flex min-h-full w-max min-w-full items-center justify-center">
              <PagedImage page={current} index={page} size={size} onNatural={onNatural} />
            </div>
          </div>
        )}

        {/* The end card brings its own buttons; the side arrows would sit on top of them. */}
        {!atEnd && (
          <>
            <button type="button" onClick={onPrevious} aria-label="Previous page" className={cn(arrowClass, "left-2")}>
              <ChevronLeft className="size-5" />
            </button>
            <button type="button" onClick={onNext} aria-label="Next page" className={cn(arrowClass, "right-2")}>
              <ChevronRight className="size-5" />
            </button>
          </>
        )}
      </div>

      <div className={cn("flex items-center gap-2 px-1 sm:gap-3", fullscreen && "bg-background px-3 py-2")}>
        <input
          type="range"
          min={1}
          max={pages.length + 1}
          value={Math.min(page, pages.length) + 1}
          onChange={(e) => onJump(Number(e.target.value) - 1)}
          // A focused range input keeps the arrow keys for itself, which would silently disable
          // the page-turn shortcuts after a drag. Keyboard users who tab to it keep native control.
          onPointerUp={(e) => e.currentTarget.blur()}
          aria-label="Page"
          className="h-1.5 min-w-0 flex-1 cursor-pointer accent-accent"
        />
        <span className="w-14 shrink-0 text-right text-xs font-medium tabular-nums text-muted">
          {atEnd ? "End" : `${page + 1} / ${pages.length}`}
        </span>
        {!atEnd && (
          <ZoomControls
            zoom={zoom}
            onZoomIn={() => zoomTo(stepPageZoom(zoom, 1))}
            onZoomOut={() => zoomTo(stepPageZoom(zoom, -1))}
            onReset={() => zoomTo(1)}
            canZoomIn={zoom < PAGE_ZOOM_MAX}
            canZoomOut={zoom > PAGE_ZOOM_MIN}
          />
        )}
        {toolbar}
      </div>
    </div>
  );
}
