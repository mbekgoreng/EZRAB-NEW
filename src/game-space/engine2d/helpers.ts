/**
 * EZRAB Game Space 2D — math & misc helpers (src/game-space/engine2d/helpers.ts)
 * Pure functions. Safe to unit test.
 */

export const TAU = Math.PI * 2;

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** rand(max) -> [0,max); rand(lo,hi) -> [lo,hi) */
export const rand = (lo: number, hi?: number): number =>
  hi === undefined ? Math.random() * lo : lo + Math.random() * (hi - lo);

export const randInt = (lo: number, hi: number): number =>
  Math.floor(rand(lo, hi + 1));

export const choice = <T>(arr: readonly T[]): T =>
  arr[(Math.random() * arr.length) | 0];

export const shuffle = <T>(arr: readonly T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const rectsOverlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const pointInRect = (x: number, y: number, r: Rect): boolean =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

export const dist = (x1: number, y1: number, x2: number, y2: number): number =>
  Math.hypot(x2 - x1, y2 - y1);

/** Distance from point (px,py) to segment (ax,ay)-(bx,by). */
export const distToSegment = (
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number => {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(px, py, ax, ay);
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
  return dist(px, py, ax + dx * t, ay + dy * t);
};

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeInQuad = (t: number): number => t * t;
export const easeOutBack = (t: number): number => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

/** Format seconds -> m:ss */
export const fmtTime = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
