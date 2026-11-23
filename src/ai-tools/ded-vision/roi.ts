/**
 * I8a — Pure ROI (region-of-interest) math for the DED drawing-vision layer.
 *
 * No DOM, no canvas: every function is pure arithmetic over pixel
 * coordinates, so the whole module runs in tsx tests and in the browser.
 *
 * Coordinate convention (shared with visionClient.ts prompts):
 * BoundingBox { x, y, width, height } in IMAGE PIXELS, (0,0) = top-left
 * corner of the image as sent. (The v2 BoundingBox type allows normalized
 * 0..1 OR pixels — this module is pixels-only; callers must not mix the
 * two.)
 */

import type { BoundingBox } from './types';

function isFiniteBbox(bbox: BoundingBox): boolean {
  return (
    Number.isFinite(bbox.x) && Number.isFinite(bbox.y) &&
    Number.isFinite(bbox.width) && Number.isFinite(bbox.height)
  );
}

/**
 * Clamp a bbox to the page bounds (INTERSECTION semantics: the returned
 * box is the part of the input box that lies inside the page — what a
 * crop would actually show). Returns null for degenerate input:
 * non-finite numbers, zero/negative width or height, or a box that has
 * zero/negative area after clamping (e.g. entirely off-page). Never
 * returns a box with area ≤ 0.
 */
export function normalizeRoi(
  bbox: BoundingBox,
  pageWidthPx: number,
  pageHeightPx: number,
): BoundingBox | null {
  if (!bbox || !isFiniteBbox(bbox)) return null;
  if (!Number.isFinite(pageWidthPx) || pageWidthPx <= 0) return null;
  if (!Number.isFinite(pageHeightPx) || pageHeightPx <= 0) return null;
  if (bbox.width <= 0 || bbox.height <= 0) return null;
  const x = Math.max(0, bbox.x);
  const y = Math.max(0, bbox.y);
  const width = Math.min(bbox.x + bbox.width, pageWidthPx) - x;
  const height = Math.min(bbox.y + bbox.height, pageHeightPx) - y;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

/**
 * Grow a bbox by `marginPx` on all four sides, clamped to the page.
 * Returns null for degenerate input (same rules as normalizeRoi) —
 * EXCEPT that a zero-area input with a POSITIVE margin yields a real
 * box: expanding a line/point by a margin is buffering, and the result
 * is a genuine region (width/height 2×margin, clamped). With a zero or
 * negative margin a degenerate input stays degenerate → null.
 * A negative margin shrinks the box (and may degenerate it → null).
 */
export function expandRoi(
  bbox: BoundingBox,
  marginPx: number,
  pageWidthPx: number,
  pageHeightPx: number,
): BoundingBox | null {
  if (!bbox || !isFiniteBbox(bbox)) return null;
  if (!Number.isFinite(marginPx)) return null;
  return normalizeRoi(
    {
      x: bbox.x - marginPx,
      y: bbox.y - marginPx,
      width: bbox.width + 2 * marginPx,
      height: bbox.height + 2 * marginPx,
    },
    pageWidthPx,
    pageHeightPx,
  );
}

/** One tile of a tiled page. `index` is row-major (row * cols + col). */
export interface PageTile {
  index: number;
  row: number;
  col: number;
  bbox: BoundingBox;
}

function axisStarts(sizePx: number, maxTilePx: number, overlapPx: number): number[] {
  if (sizePx <= maxTilePx) return [0];
  const step = maxTilePx - overlapPx;
  if (step <= 0) {
    throw new RangeError(
      `tilePage: overlapPx (${overlapPx}) must be smaller than maxTilePx (${maxTilePx}).`,
    );
  }
  const starts = [0];
  let s = 0;
  while (s + maxTilePx < sizePx) {
    // Advance one step, but anchor the LAST tile to the far edge so no
    // sliver tile is left over. Consequence (documented): the final
    // overlap on an axis may be LARGER than overlapPx — never smaller.
    s = Math.min(s + step, sizePx - maxTilePx);
    starts.push(s);
  }
  return starts;
}

/**
 * Split a page into overlapping tiles so each tile fits the vision size
 * cap (I8b renders each tile at a scale whose base64 fits
 * MAX_VISION_BASE64_CHARS — see visionImageScaleFactor).
 *
 * Guarantees:
 * - Every pixel of the page is covered by at least one tile (incl. corners).
 * - No tile exceeds maxTilePx in either dimension.
 * - Adjacent tiles overlap by AT LEAST overlapPx on each axis (the last
 *   tile on an axis is edge-anchored, so its overlap may be larger).
 * - Tiles are returned row-major with stable indices.
 *
 * DEDUP IMPLICATION: a detection sitting in an overlap zone is seen by
 * TWO tiles and will be reported twice (once per tile, in tile-local
 * coordinates). I8b/I9 MUST translate tile-local bboxes back to page
 * coordinates and run `dedupeProposals` before the detections become
 * evidence — otherwise counts (e.g. door occurrences) double-count.
 *
 * Throws RangeError for non-positive sizes, non-positive maxTilePx,
 * negative overlapPx, or overlapPx >= maxTilePx.
 */
export function tilePage(
  pageWidthPx: number,
  pageHeightPx: number,
  maxTilePx: number,
  overlapPx: number,
): PageTile[] {
  if (!Number.isFinite(pageWidthPx) || pageWidthPx <= 0) {
    throw new RangeError('tilePage: pageWidthPx must be a positive finite number.');
  }
  if (!Number.isFinite(pageHeightPx) || pageHeightPx <= 0) {
    throw new RangeError('tilePage: pageHeightPx must be a positive finite number.');
  }
  if (!Number.isFinite(maxTilePx) || maxTilePx <= 0) {
    throw new RangeError('tilePage: maxTilePx must be a positive finite number.');
  }
  if (!Number.isFinite(overlapPx) || overlapPx < 0) {
    throw new RangeError('tilePage: overlapPx must be a non-negative finite number.');
  }
  const xs = axisStarts(pageWidthPx, maxTilePx, overlapPx);
  const ys = axisStarts(pageHeightPx, maxTilePx, overlapPx);
  const tiles: PageTile[] = [];
  let index = 0;
  for (let row = 0; row < ys.length; row += 1) {
    for (let col = 0; col < xs.length; col += 1) {
      tiles.push({
        index,
        row,
        col,
        bbox: {
          x: xs[col],
          y: ys[row],
          width: Math.min(maxTilePx, pageWidthPx - xs[col]),
          height: Math.min(maxTilePx, pageHeightPx - ys[row]),
        },
      });
      index += 1;
    }
  }
  return tiles;
}

/**
 * Split a page into an EVEN grid of overlapping tiles for LEGIBILITY
 * (I11 Stage 3, fix 3 — density-aware tiling), as opposed to `tilePage`,
 * which splits for SIZE (oversize pages).
 *
 * The grid is computed by ceiling division: cols = ceil(width /
 * maxTilePx), rows = ceil(height / maxTilePx); each tile covers its
 * 1/n share of the axis PLUS the overlap margin, and tile starts are
 * evenly spaced so the last tile ends exactly at the far edge.
 *
 * Guarantees:
 * - Every pixel of the page is covered by at least one tile (incl. corners).
 * - No tile exceeds maxTilePx + overlapPx in either dimension (the
 *   +overlap overshoot is by design: a tile is its share PLUS margin).
 * - Adjacent tiles overlap by AT LEAST overlapPx on each axis (the even
 *   spacing spreads the overlap evenly instead of dumping it all on the
 *   last tile, as tilePage's edge-anchoring does — for a page only
 *   slightly wider than maxTilePx, tilePage would produce two tiles
 *   overlapping by ~80%).
 * - Tiles are returned row-major with stable indices.
 *
 * DEDUP IMPLICATION: same as tilePage — callers MUST translate
 * tile-local bboxes back to page coordinates and run `dedupeProposals`
 * before detections become evidence.
 *
 * Throws RangeError for non-positive sizes, non-positive maxTilePx,
 * negative overlapPx, or overlapPx >= maxTilePx.
 */
export function tilePageGrid(
  pageWidthPx: number,
  pageHeightPx: number,
  maxTilePx: number,
  overlapPx: number,
): PageTile[] {
  if (!Number.isFinite(pageWidthPx) || pageWidthPx <= 0) {
    throw new RangeError('tilePageGrid: pageWidthPx must be a positive finite number.');
  }
  if (!Number.isFinite(pageHeightPx) || pageHeightPx <= 0) {
    throw new RangeError('tilePageGrid: pageHeightPx must be a positive finite number.');
  }
  if (!Number.isFinite(maxTilePx) || maxTilePx <= 0) {
    throw new RangeError('tilePageGrid: maxTilePx must be a positive finite number.');
  }
  if (!Number.isFinite(overlapPx) || overlapPx < 0) {
    throw new RangeError('tilePageGrid: overlapPx must be a non-negative finite number.');
  }
  if (overlapPx >= maxTilePx) {
    throw new RangeError(
      `tilePageGrid: overlapPx (${overlapPx}) must be smaller than maxTilePx (${maxTilePx}).`,
    );
  }
  const axis = (sizePx: number): { starts: number[]; tilePx: number } => {
    const n = Math.max(1, Math.ceil(sizePx / maxTilePx));
    const tilePx = Math.min(sizePx, Math.ceil(sizePx / n) + overlapPx);
    // One tile already covers the axis (tiny page, or an overlap margin
    // larger than the axis remainder) — a grid would only duplicate it.
    if (n === 1 || tilePx >= sizePx) return { starts: [0], tilePx };
    const starts: number[] = [];
    for (let i = 0; i < n; i += 1) {
      starts.push(Math.round((i * (sizePx - tilePx)) / (n - 1)));
    }
    return { starts, tilePx };
  };
  const xs = axis(pageWidthPx);
  const ys = axis(pageHeightPx);
  const tiles: PageTile[] = [];
  let index = 0;
  for (let row = 0; row < ys.starts.length; row += 1) {
    for (let col = 0; col < xs.starts.length; col += 1) {
      tiles.push({
        index,
        row,
        col,
        bbox: {
          x: xs.starts[col],
          y: ys.starts[row],
          width: Math.min(xs.tilePx, pageWidthPx - xs.starts[col]),
          height: Math.min(ys.tilePx, pageHeightPx - ys.starts[row]),
        },
      });
      index += 1;
    }
  }
  return tiles;
}

/**
 * Stable string id for a bbox, for cache keys (see visionCacheKey).
 * Coordinates are rounded to whole pixels so float jitter from tile math
 * can never split one region into two cache entries.
 */
export function roiIdFor(bbox: BoundingBox): string {
  const x = Math.round(bbox.x);
  const y = Math.round(bbox.y);
  const w = Math.round(bbox.width);
  const h = Math.round(bbox.height);
  return `roi-${x}-${y}-${w}-${h}`;
}

/** Intersection-over-Union of two pixel bboxes, 0..1. 0 when either is degenerate. */
export function bboxIou(a: BoundingBox, b: BoundingBox): number {
  if (!isFiniteBbox(a) || !isFiniteBbox(b)) return 0;
  if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return 0;
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  const interW = x1 - x0;
  const interH = y1 - y0;
  if (interW <= 0 || interH <= 0) return 0;
  const inter = interW * interH;
  const union = a.width * a.height + b.width * b.height - inter;
  if (union <= 0) return 0;
  return inter / union;
}

/** Minimal shape dedupe needs — VisionDetectionProposal satisfies it. */
export interface DedupeCandidate {
  kind: string;
  label: string;
  bbox: BoundingBox | null;
  confidence: number;
}

export interface DedupeMerge {
  /** The kept proposal's kind + label. */
  kind: string;
  label: string;
  /** Confidence of the kept proposal. */
  keptConfidence: number;
  /** Confidence of the dropped duplicate. */
  droppedConfidence: number;
  /** IoU that triggered the merge. */
  iou: number;
}

export interface DedupeResult<T extends DedupeCandidate> {
  kept: T[];
  dropped: T[];
  /** One record per merge, so the caller can audit what was collapsed. */
  merges: DedupeMerge[];
}

/**
 * Drop lower-confidence duplicates: two proposals of the SAME kind and
 * the SAME label (trimmed, exact match — marks like "D1" are
 * case-sensitive identifiers) whose bboxes overlap above `iouThreshold`
 * are the same detection seen twice (typically from tile overlap zones).
 * The higher-confidence one is kept; the other is dropped and the merge
 * is recorded. On a confidence tie the FIRST proposal wins (stable).
 *
 * Proposals with a null bbox can never be proven duplicates — they are
 * always kept. Proposals of different kinds or labels are never merged,
 * however much they overlap (a dimension line legitimately overlaps the
 * symbol it annotates).
 *
 * Default threshold 0.5. Callers working in tile-local coordinates MUST
 * translate bboxes to page coordinates first — IoU across different
 * coordinate frames is meaningless.
 */
export function dedupeProposals<T extends DedupeCandidate>(
  proposals: T[],
  iouThreshold = 0.5,
): DedupeResult<T> {
  if (!Number.isFinite(iouThreshold) || iouThreshold < 0 || iouThreshold > 1) {
    throw new RangeError('dedupeProposals: iouThreshold must be a finite number in 0..1.');
  }
  // Sort by confidence desc, stable (original order breaks ties).
  const ordered = proposals
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.confidence - a.p.confidence || a.i - b.i)
    .map(({ p }) => p);
  const kept: T[] = [];
  const dropped: T[] = [];
  const merges: DedupeMerge[] = [];
  for (const candidate of ordered) {
    let duplicateOf: T | null = null;
    let duplicateIou = 0;
    if (candidate.bbox !== null) {
      for (const existing of kept) {
        if (existing.kind !== candidate.kind) continue;
        if (existing.label.trim() !== candidate.label.trim()) continue;
        if (existing.bbox === null) continue;
        const iou = bboxIou(existing.bbox, candidate.bbox);
        if (iou > iouThreshold) {
          duplicateOf = existing;
          duplicateIou = iou;
          break;
        }
      }
    }
    if (duplicateOf) {
      dropped.push(candidate);
      merges.push({
        kind: candidate.kind,
        label: candidate.label,
        keptConfidence: duplicateOf.confidence,
        droppedConfidence: candidate.confidence,
        iou: duplicateIou,
      });
    } else {
      kept.push(candidate);
    }
  }
  return { kept, dropped, merges };
}
