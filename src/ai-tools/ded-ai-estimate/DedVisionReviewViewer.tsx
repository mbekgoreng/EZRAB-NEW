/**
 * DED drawing-vision — Visual Review Interface, viewer core (increment I7).
 *
 * Split-view left pane (owner-approved concept 2026-10-07, prototype
 * `~/workspace/your_files/ded-ai-prototype.html`): the DED plan image
 * with AI-detected dimensions/quantities as clickable overlays. The
 * results panel on the right is owned by I7b (`DedAiResultView` wiring).
 *
 * ------------------------------------------------------------------
 * PROPS INTERFACE (stable — I7b depends on these exact names/types)
 * ------------------------------------------------------------------
 *   pageImages:     Map<number, string> | PageImageInput[]
 *                   Page number -> image data URL (from the live parser's
 *                   `previewDataUrl` or `pdfPageService`). Pages without
 *                   an image show an honest empty state, never a fake
 *                   drawing.
 *   items:          ReviewItem[] — detections to overlay (only items
 *                   whose `page` is the current page and whose `bbox`
 *                   is non-null get a marker; others are counted in
 *                   the footer, never placed at a fake position).
 *   selectedItemId: string | null — controlled selection.
 *   onSelectItem:   (id: string | null) => void — fired when a marker
 *                   is clicked (or the selection is cleared).
 *   focusTarget?:   FocusTarget | null — `{ page, bbox }`. The parent
 *                   sets a FRESH object per jump (e.g. when a QTO
 *                   result is clicked); the viewer navigates to the
 *                   page and centers the bbox (page-only jump when
 *                   `bbox` is null). Selection alone does NOT move the
 *                   view — the parent must also set `focusTarget`.
 *   onPageChange?:  (page: number) => void — page changes (nav buttons,
 *                   focus jump, banner jump).
 *   currentPage?:   number — controlled page. Omit for uncontrolled
 *                   (viewer manages its own page, starting at
 *                   `initialPage`, default 1).
 *   initialPage?:   number — first page when uncontrolled (default 1).
 *   totalPages?:    number — total document pages. Defaults to the
 *                   highest page number seen in `pageImages` / `items`.
 *   pageTitles?:    Record<number, string> — optional sheet titles
 *                   (e.g. `{ 3: 'Denah Lt.1' }`) shown next to the
 *                   page indicator.
 *
 * ------------------------------------------------------------------
 * Behaviour notes
 * ------------------------------------------------------------------
 * - Zoom 0.5x–3x (buttons, Ctrl/Cmd+wheel, keyboard +/-). Zoom is
 *   applied by sizing the <img> in layout pixels (natural size x zoom),
 *   NOT by CSS transform — so scrollbars always cover the zoomed
 *   content. Ctrl+wheel needs a native non-passive listener because
 *   React attaches wheel handlers passively (preventDefault would not
 *   work through onWheel).
 * - Pan by dragging the viewport (mouse or touch, via pointer events).
 *   A drag of >4 px suppresses the click that follows it, so panning
 *   across a marker never selects it. The pointer is captured only
 *   once a drag actually starts (I11 Bug 1: capturing on every
 *   pointerdown retargeted pointerup/click to the viewport, so a
 *   marker's onClick never fired).
 * - Markers are positioned with CSS percentages computed by
 *   `bboxToPercent` (pixel bbox / natural image size), so they scale
 *   with zoom for free. Markers render only after the image reports
 *   its natural size — positions are never guessed before load. The
 *   per-page reset re-reads the <img>'s natural size when the image
 *   already loaded (I11 Bug 2: for near-instant loads the `load`
 *   event can fire before the reset effect runs; wiping `imageSize`
 *   unconditionally then stranded the viewer on "Memuat gambar…").
 * - Keyboard: the viewport is focusable (Tab); +/- zoom, 0 resets
 *   zoom; arrow keys scroll natively; markers are <button>s, so they
 *   are Tab-focusable and activatable with Enter/Space.
 * - No CSS import in this file (so plain tsx can import it for a
 *   smoke check). Styles live in `dedVisionReview.css`, imported by
 *   the view that mounts this component.
 * - Dependency-light: React + ded-vision types/reviewState only. No
 *   lucide-react, no v2/v3 stacks.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { bboxToPercent, confidenceToColor, jumpTarget } from '../ded-vision/reviewState';
import {
  DEDVR_DRAG_CLICK_THRESHOLD_PX,
  dragExceedsThreshold,
  resolveImageStateFromSnapshot,
} from '../ded-vision/viewerLogic';
import type { ReviewItem } from '../ded-vision/reviewState';
import type { BoundingBox } from '../ded-vision/types';

/** Zoom bounds (x). Buttons step by DEDVR_ZOOM_STEP; wheel by x1.1. */
export const DEDVR_ZOOM_MIN = 0.5;
export const DEDVR_ZOOM_MAX = 3;
export const DEDVR_ZOOM_STEP = 0.25;

export interface PageImageInput {
  page: number;
  dataUrl: string;
}

export interface FocusTarget {
  page: number;
  bbox: BoundingBox | null;
}

export interface DedVisionReviewViewerProps {
  pageImages: Map<number, string> | PageImageInput[];
  items: ReviewItem[];
  selectedItemId: string | null;
  onSelectItem: (id: string | null) => void;
  focusTarget?: FocusTarget | null;
  onPageChange?: (page: number) => void;
  currentPage?: number;
  initialPage?: number;
  totalPages?: number;
  pageTitles?: Record<number, string>;
}

function normalizePageImages(
  input: Map<number, string> | PageImageInput[],
): Map<number, string> {
  if (input instanceof Map) return input;
  const map = new Map<number, string>();
  for (const entry of input) {
    if (Number.isFinite(entry.page) && typeof entry.dataUrl === 'string' && entry.dataUrl !== '') {
      map.set(entry.page, entry.dataUrl);
    }
  }
  return map;
}

function clampZoom(z: number): number {
  return Math.min(DEDVR_ZOOM_MAX, Math.max(DEDVR_ZOOM_MIN, z));
}

export const DedVisionReviewViewer: React.FC<DedVisionReviewViewerProps> = ({
  pageImages,
  items,
  selectedItemId,
  onSelectItem,
  focusTarget = null,
  onPageChange,
  currentPage,
  initialPage = 1,
  totalPages,
  pageTitles,
}) => {
  const [internalPage, setInternalPage] = useState<number>(
    Number.isFinite(initialPage) && initialPage >= 1 ? Math.floor(initialPage) : 1,
  );
  const [zoom, setZoom] = useState<number>(1);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [imageError, setImageError] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  /** Current page <img> (for the Bug 2 re-read in the reset effect). */
  const imgRef = useRef<HTMLImageElement | null>(null);
  /** Bbox to center on once the target page's image has loaded. */
  const pendingCenterRef = useRef<BoundingBox | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
    moved: boolean;
    /** Pointer captured once the drag started (never on pointerdown). */
    captured: boolean;
  } | null>(null);
  const suppressClickRef = useRef<boolean>(false);

  const imageMap = useMemo(() => normalizePageImages(pageImages), [pageImages]);

  const maxSeenPage = useMemo(() => {
    let max = 1;
    for (const p of imageMap.keys()) max = Math.max(max, p);
    for (const it of items) {
      if (it.page !== null) max = Math.max(max, it.page);
      for (const p of it.sourcePages) max = Math.max(max, p);
    }
    return max;
  }, [imageMap, items]);

  const totalPagesNum =
    totalPages !== undefined && Number.isFinite(totalPages) && totalPages >= 1
      ? Math.floor(totalPages)
      : maxSeenPage;

  const currentPageNum = currentPage !== undefined ? currentPage : internalPage;
  const clampedPage = Math.min(totalPagesNum, Math.max(1, currentPageNum));
  const dataUrl = imageMap.get(clampedPage);
  const pageTitle = pageTitles?.[clampedPage];

  const pageItems = useMemo(
    () => items.filter((it) => it.page === clampedPage),
    [items, clampedPage],
  );
  const positionedItems = useMemo(
    () => pageItems.filter((it) => it.bbox !== null),
    [pageItems],
  );
  const unpositionedCount = pageItems.length - positionedItems.length;

  const selectedItem = useMemo(
    () => items.find((it) => it.id === selectedItemId) ?? null,
    [items, selectedItemId],
  );
  const selectedOnOtherPage =
    selectedItem !== null &&
    selectedItem.page !== null &&
    selectedItem.page !== clampedPage;

  const goToPage = (page: number) => {
    const next = Math.min(totalPagesNum, Math.max(1, Math.floor(page)));
    setInternalPage(next);
    if (onPageChange) onPageChange(next);
  };

  /* ---- reset per-page state + scroll on page change ----
   * I11 Bug 2: this effect runs after the commit that swaps the <img>
   * src, and for near-instant loads (data URLs) the `load` event may
   * already have fired — wiping imageSize to null unconditionally then
   * strands the viewer on "Memuat gambar…" with no further load event
   * (row-click jumps hit it 4/4). Re-read the already-loaded image's
   * natural size instead of assuming the load is still pending. */
  useEffect(() => {
    const resolved = resolveImageStateFromSnapshot(imgRef.current);
    setImageSize(resolved.size);
    setImageError(resolved.error);
    const vp = viewportRef.current;
    if (vp) {
      vp.scrollLeft = 0;
      vp.scrollTop = 0;
    }
  }, [clampedPage]);

  /* ---- focus jump: parent sets a fresh focusTarget per jump ---- */
  useEffect(() => {
    if (!focusTarget) return;
    goToPage(focusTarget.page);
    // Center after the target page's image loads (see the centering
    // effect below). Null bbox = page-only jump; nothing to center.
    pendingCenterRef.current = focusTarget.bbox;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTarget]);

  /* ---- center the pending bbox once the image size is known ---- */
  useEffect(() => {
    const bbox = pendingCenterRef.current;
    const vp = viewportRef.current;
    const stage = stageRef.current;
    if (!bbox || !imageSize || !vp || !stage) return;
    const cxPx = (bbox.x + bbox.width / 2) * zoom;
    const cyPx = (bbox.y + bbox.height / 2) * zoom;
    const vpRect = vp.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const targetLeft =
      vp.scrollLeft + (stageRect.left - vpRect.left) + cxPx - vpRect.width / 2;
    const targetTop =
      vp.scrollTop + (stageRect.top - vpRect.top) + cyPx - vpRect.height / 2;
    vp.scrollLeft = Math.max(0, targetLeft);
    vp.scrollTop = Math.max(0, targetTop);
    pendingCenterRef.current = null;
  }, [imageSize, clampedPage, zoom]);

  /* ---- Ctrl/Cmd+wheel zoom (native non-passive listener: React's
   *  onWheel is passive and preventDefault would not stop the page
   *  from zooming/scrolling). Plain wheel keeps native scrolling. ---- */
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((prev) => clampZoom(prev * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, []);

  const zoomIn = () => setZoom((prev) => clampZoom(prev + DEDVR_ZOOM_STEP));
  const zoomOut = () => setZoom((prev) => clampZoom(prev - DEDVR_ZOOM_STEP));
  const zoomReset = () => setZoom(1);

  /* ---- drag-to-pan (pointer events: mouse + touch) ----
   * I11 Bug 1: the pointer is captured ONLY once a drag actually
   * starts (past the threshold, in handlePointerMove). Capturing on
   * every pointerdown retargeted pointerup/click to the viewport, so
   * a marker's onClick never fired and mouse clicks never selected. */
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const vp = viewportRef.current;
    if (!vp) return;
    suppressClickRef.current = false;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: vp.scrollLeft,
      scrollTop: vp.scrollTop,
      moved: false,
      captured: false,
    };
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const vp = viewportRef.current;
    if (!drag || !vp) return;
    const dx = drag.startX - e.clientX;
    const dy = drag.startY - e.clientY;
    if (dragExceedsThreshold(dx, dy, DEDVR_DRAG_CLICK_THRESHOLD_PX)) {
      drag.moved = true;
      // Drag started: capture now so pointerup/pointermove keep
      // arriving even if the pointer leaves the viewport mid-drag.
      if (!drag.captured) {
        drag.captured = true;
        try {
          vp.setPointerCapture(e.pointerId);
        } catch {
          /* pointer capture is best-effort (notably on some touch paths) */
        }
      }
    }
    vp.scrollLeft = drag.scrollLeft + dx;
    vp.scrollTop = drag.scrollTop + dy;
  };

  const endDrag = () => {
    if (dragRef.current?.moved) suppressClickRef.current = true;
    dragRef.current = null;
    setIsDragging(false);
  };

  const handleMarkerClick = (id: string) => {
    // A click that ends a drag is a pan, not a selection.
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onSelectItem(id === selectedItemId ? null : id);
  };

  const handleJumpToSelected = () => {
    if (!selectedItem) return;
    const target = jumpTarget(selectedItem);
    if (!target) return;
    goToPage(target.page);
    pendingCenterRef.current = target.bbox;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Skip when focus is on a marker button (Enter/Space activate it).
    if ((e.target as HTMLElement).closest('button')) return;
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomIn();
    } else if (e.key === '-') {
      e.preventDefault();
      zoomOut();
    } else if (e.key === '0') {
      e.preventDefault();
      zoomReset();
    }
  };

  return (
    <div className="dedvr-root" data-dedvr-page={clampedPage}>
      {/* Toolbar: page nav + zoom */}
      <div className="dedvr-toolbar">
        <div className="dedvr-nav">
          <button
            type="button"
            className="dedvr-nav-btn"
            disabled={clampedPage <= 1}
            onClick={() => goToPage(clampedPage - 1)}
            aria-label="Halaman sebelumnya"
            title="Halaman sebelumnya"
          >
            ‹
          </button>
          <span className="dedvr-page-indicator" aria-live="polite">
            Hal. {clampedPage} / {totalPagesNum}
          </span>
          <button
            type="button"
            className="dedvr-nav-btn"
            disabled={clampedPage >= totalPagesNum}
            onClick={() => goToPage(clampedPage + 1)}
            aria-label="Halaman berikutnya"
            title="Halaman berikutnya"
          >
            ›
          </button>
          {pageTitle ? <span className="dedvr-page-title">{pageTitle}</span> : null}
        </div>
        <div className="dedvr-zoom">
          <button
            type="button"
            className="dedvr-zoom-btn"
            disabled={zoom <= DEDVR_ZOOM_MIN}
            onClick={zoomOut}
            aria-label="Perkecil"
            title="Perkecil (−)"
          >
            −
          </button>
          <button
            type="button"
            className="dedvr-zoom-label"
            onClick={zoomReset}
            aria-label="Reset zoom ke 100%"
            title="Reset zoom (100%)"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            className="dedvr-zoom-btn"
            disabled={zoom >= DEDVR_ZOOM_MAX}
            onClick={zoomIn}
            aria-label="Perbesar"
            title="Perbesar (+)"
          >
            +
          </button>
        </div>
      </div>

      {/* Selected item lives on another page — offer the jump. */}
      {selectedOnOtherPage && selectedItem ? (
        <button type="button" className="dedvr-banner" onClick={handleJumpToSelected}>
          Item terpilih “{selectedItem.label}” ada di hal. {selectedItem.page} — klik untuk
          melompat ke sana.
        </button>
      ) : null}

      {/* Viewport: scrollable, draggable, keyboard-focusable. */}
      <div
        ref={viewportRef}
        className={`dedvr-viewport${isDragging ? ' dedvr-viewport--dragging' : ''}`}
        tabIndex={0}
        role="region"
        aria-label={`Gambar halaman ${clampedPage}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
      >
        <div className="dedvr-canvas-pad">
          {dataUrl && !imageError ? (
            <div ref={stageRef} className="dedvr-stage">
              <img
                ref={imgRef}
                src={dataUrl}
                alt={`Halaman ${clampedPage} dokumen DED`}
                className="dedvr-image"
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                style={
                  imageSize
                    ? { width: Math.round(imageSize.width * zoom), height: 'auto' }
                    : undefined
                }
                onLoad={(e) => {
                  const img = e.currentTarget;
                  setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
                }}
                onError={() => setImageError(true)}
              />
              {!imageSize ? <div className="dedvr-loading">Memuat gambar…</div> : null}
              {imageSize
                ? positionedItems.map((item) => {
                    const pct = bboxToPercent(item.bbox as BoundingBox, imageSize.width, imageSize.height);
                    if (!pct) return null;
                    const color = confidenceToColor(item.confidence);
                    const selected = item.id === selectedItemId;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`dedvr-marker dedvr-marker--${color}${
                          selected ? ' dedvr-marker--selected' : ''
                        }`}
                        style={{
                          left: `${pct.leftPct}%`,
                          top: `${pct.topPct}%`,
                          width: `${pct.widthPct}%`,
                          height: `${pct.heightPct}%`,
                        }}
                        onClick={() => handleMarkerClick(item.id)}
                        title={`${item.label} — keyakinan ${Math.round(item.confidence * 100)}%`}
                        aria-label={`Deteksi: ${item.label}`}
                        aria-pressed={selected}
                      >
                        <span className="dedvr-marker-label">{item.label}</span>
                      </button>
                    );
                  })
                : null}
            </div>
          ) : (
            <div className="dedvr-empty" role="status">
              <div className="dedvr-empty-title">
                {imageError ? 'Gambar halaman gagal dimuat' : 'Gambar halaman belum tersedia'}
              </div>
              <div className="dedvr-empty-text">
                {imageError
                  ? `Gambar untuk halaman ${clampedPage} tidak bisa dimuat. Coba muat ulang dokumen.`
                  : `Halaman ${clampedPage} belum dirender sebagai gambar. Deteksi pada halaman ini tetap bisa ditinjau dari panel hasil.`}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer: counts + confidence legend (prototype semantics). */}
      <div className="dedvr-footer">
        <span className="dedvr-footer-count">
          {positionedItems.length} deteksi di halaman ini
          {unpositionedCount > 0 ? ` · ${unpositionedCount} tanpa posisi` : ''}
        </span>
        <span className="dedvr-legend" aria-label="Legenda keyakinan">
          <span className="dedvr-legend-item">
            <i className="dedvr-legend-dot dedvr-legend-dot--green" /> Yakin
          </span>
          <span className="dedvr-legend-item">
            <i className="dedvr-legend-dot dedvr-legend-dot--yellow" /> Ragu
          </span>
          <span className="dedvr-legend-item">
            <i className="dedvr-legend-dot dedvr-legend-dot--red" /> Tak terbaca
          </span>
        </span>
      </div>
    </div>
  );
};

export default DedVisionReviewViewer;
