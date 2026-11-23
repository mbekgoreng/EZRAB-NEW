/**
 * DED drawing-vision — pure viewer logic (increment I11 Stage 1b).
 *
 * The drag-threshold and image-load decisions from
 * `DedVisionReviewViewer` live here as pure functions so they are
 * unit-testable without a DOM (the component's visual behaviour is
 * verified by the I11 browser suite). No React, no DOM.
 */

/**
 * Drag distance (Manhattan px) past which a pointer gesture is a pan,
 * not a click. Below the threshold the pointerup is a click (a marker
 * click selects it); above it the following click is suppressed.
 * The viewer captures the pointer only once a drag actually starts
 * (I11 Bug 1: capturing on every pointerdown retargeted pointerup /
 * click to the viewport, so a marker's onClick never fired).
 */
export const DEDVR_DRAG_CLICK_THRESHOLD_PX = 4;

/** Manhattan distance past the drag/click threshold? */
export function dragExceedsThreshold(
  dx: number,
  dy: number,
  threshold: number = DEDVR_DRAG_CLICK_THRESHOLD_PX,
): boolean {
  return Math.abs(dx) + Math.abs(dy) > threshold;
}

/** Minimal snapshot of an <img> element's load state. */
export interface LoadedImageSnapshot {
  complete: boolean;
  naturalWidth: number;
  naturalHeight: number;
}

export interface ResolvedImageState {
  /** Natural size when the image is already loaded, else null. */
  size: { width: number; height: number } | null;
  /** True when the image finished loading but has no dimensions. */
  error: boolean;
}

/**
 * Decide the viewer's image state from a snapshot of the <img> element
 * (I11 Bug 2 fix). The [clampedPage] reset effect runs AFTER the commit
 * that swaps the image `src`; for near-instant loads (data URLs) the
 * `load` event may already have fired, and wiping `imageSize` to null
 * unconditionally then strands the viewer on "Memuat gambar…" with no
 * further load event. Re-reading the already-loaded image's natural
 * size here closes the race:
 *
 * - no img (page has no image / img not mounted yet): pending — the
 *   effect clears the state and onLoad/onError report later.
 * - complete + natural size: the load already fired — keep the size.
 * - complete + no natural size: the load failed before the effect ran
 *   (same race on the error path) — report the error, don't wipe it.
 * - not complete: pending — onLoad/onError will report later.
 */
export function resolveImageStateFromSnapshot(
  img: LoadedImageSnapshot | null,
): ResolvedImageState {
  if (!img) return { size: null, error: false };
  if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
    return { size: { width: img.naturalWidth, height: img.naturalHeight }, error: false };
  }
  if (img.complete) return { size: null, error: true };
  return { size: null, error: false };
}
