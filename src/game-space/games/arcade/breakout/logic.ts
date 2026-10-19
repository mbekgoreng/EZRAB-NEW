/**
 * Bobok Tembok — hancurkan susunan bata pakai bola kerikil.
 * Pure physics & level generation (no DOM).
 */

export type BrickKind = 'bata' | 'hebel' | 'beton';

export interface Brick {
  id: number;
  /** posisi dalam satuan grid (tsx memetakan ke px) */
  x: number;
  y: number;
  w: number;
  h: number;
  kind: BrickKind;
  hp: number;
}

export const KIND_HP: Record<BrickKind, number> = { bata: 1, hebel: 2, beton: 3 };
export const KIND_SCORE: Record<BrickKind, number> = { bata: 50, hebel: 120, beton: 200 };

export type Rng = () => number;

/** Susun tembok: makin tinggi level, makin banyak hebel & beton. */
export function createLevel(level: number, cols: number, rows: number, rng: Rng = Math.random): Brick[] {
  const bricks: Brick[] = [];
  const hardBias = Math.min(0.55, 0.08 + level * 0.09);
  let id = 0;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const roll = rng();
      let kind: BrickKind = 'bata';
      if (r === 0 && roll < 0.3 + hardBias) kind = 'beton';
      else if (roll < hardBias) kind = roll < hardBias / 2 ? 'beton' : 'hebel';
      else if (r <= 1 && roll < hardBias + 0.3) kind = 'hebel';
      bricks.push({ id: id++, x: c, y: r, w: 1, h: 1, kind, hp: KIND_HP[kind] });
    }
  }
  return bricks;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export function stepBall(b: Ball, dt: number): Ball {
  return { ...b, x: b.x + b.vx * dt, y: b.y + b.vy * dt };
}

export type Side = 'left' | 'right' | 'top' | 'bottom';

/** Tabrakan lingkaran vs kotak; kembalikan sisi tabrakan (null bila tidak kena). */
export function circleRectHit(
  b: Ball,
  r: { x: number; y: number; w: number; h: number },
): Side | null {
  const nx = Math.max(r.x, Math.min(b.x, r.x + r.w));
  const ny = Math.max(r.y, Math.min(b.y, r.y + r.h));
  const dx = b.x - nx;
  const dy = b.y - ny;
  if (dx * dx + dy * dy > b.r * b.r) return null;
  const ox = r.w / 2 + b.r - Math.abs(b.x - (r.x + r.w / 2));
  const oy = r.h / 2 + b.r - Math.abs(b.y - (r.y + r.h / 2));
  if (ox < oy) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'top' : 'bottom';
}

export function reflect(b: Ball, side: Side): Ball {
  if (side === 'left' || side === 'right') return { ...b, vx: -b.vx };
  return { ...b, vy: -b.vy };
}

/**
 * Pantulan dari papan bekisting: sudut tergantung titik kena.
 * Kena tengah -> lurus ke atas; kena ujung -> menyamping.
 */
export function bouncePaddle(b: Ball, paddle: { x: number; y: number; w: number }): Ball {
  const rel = Math.max(-1, Math.min(1, (b.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2)));
  const speed = Math.hypot(b.vx, b.vy);
  const ang = -Math.PI / 2 + rel * 1.05; // -90° ± ~60°
  return { ...b, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, y: paddle.y - b.r - 1 };
}

export type PowerKind = 'panjang' | 'multibola' | 'semenbeku' | 'helm';

/** Powerup jatuh dari bata yang hancur (22% kemungkinan). */
export function powerForBrick(rng: Rng = Math.random): PowerKind | null {
  if (rng() > 0.22) return null;
  const kinds: PowerKind[] = ['panjang', 'multibola', 'semenbeku', 'helm'];
  return kinds[(rng() * kinds.length) | 0];
}

/** Kecepatan bola awal per level. */
export function ballSpeed(level: number): number {
  return 380 + level * 36;
}
