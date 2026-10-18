/**
 * EZRAB Game Space 2D — canvas DPR sizing (src/game-space/engine2d/canvas.ts)
 */

export interface CanvasSize {
  w: number;
  h: number;
  dpr: number;
}

/**
 * Size the canvas backing store to its CSS box x devicePixelRatio
 * (capped at 2 for perf). Returns CSS-pixel dimensions.
 */
export function fitCanvas(canvas: HTMLCanvasElement): CanvasSize {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  const bw = Math.round(w * dpr);
  const bh = Math.round(h * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  return { w, h, dpr };
}

/** Reset transform so drawing uses CSS pixels. */
export function withDpr(ctx: CanvasRenderingContext2D, dpr: number): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
