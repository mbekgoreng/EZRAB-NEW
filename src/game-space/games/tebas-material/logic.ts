/**
 * Tebas Material — pure game logic (fruit-ninja: tebas material proyek).
 *
 * No DOM / window. All randomness flows through an injected Rng so tests
 * are deterministic. Rendering + input live in TebasMaterial.tsx.
 */

import { distToSegment } from '../../engine2d/helpers';

export type ItemKind = 'bata' | 'kayu' | 'semangka' | 'beton' | 'dinamit';

export interface Rng {
  (): number;
}

/** Deterministic RNG (mulberry32). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface FlyingItem {
  id: number;
  kind: ItemKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  r: number;
  /** true for the two halves left after a slice */
  half: boolean;
  /** 0 = upper/left half, 1 = lower/right half */
  side: 0 | 1;
  /** remaining seconds before a half fades away */
  life: number;
}

export const GRAVITY = 1500; // px/s^2
export const SLICE_POINTS = 10;
export const START_LIVES = 3;
export const COMBO_MIN = 3;

/** Particle splash palette per material kind. */
export const SPLASH: Record<ItemKind, string[]> = {
  semangka: ['#ef4444', '#f87171', '#fca5a5', '#166534', '#bbf7d0'],
  kayu: ['#b45309', '#d4a373', '#8b5a2b', '#fbbf24'],
  bata: ['#ea580c', '#f97316', '#c2410c', '#fdba74'],
  beton: ['#9ca3af', '#6b7280', '#d1d5db', '#e5e7eb'],
  dinamit: ['#fbbf24', '#f97316', '#ef4444', '#ffffff'],
};

const KIND_TABLE: Array<{ kind: ItemKind; weight: number }> = [
  { kind: 'bata', weight: 26 },
  { kind: 'kayu', weight: 24 },
  { kind: 'semangka', weight: 22 },
  { kind: 'beton', weight: 16 },
  { kind: 'dinamit', weight: 12 },
];

export function pickKind(rng: Rng): ItemKind {
  const total = KIND_TABLE.reduce((s, k) => s + k.weight, 0);
  let roll = rng() * total;
  for (const k of KIND_TABLE) {
    roll -= k.weight;
    if (roll <= 0) return k.kind;
  }
  return 'bata';
}

let nextId = 1;

/**
 * Spawn one item below the screen, tossed upward.
 * vy is derived from gravity so the apex lands mid-screen regardless of H.
 */
export function spawnItem(rng: Rng, W: number, H: number, speedMul = 1): FlyingItem {
  const kind = pickKind(rng);
  const r = kind === 'dinamit' ? 24 + rng() * 6 : 30 + rng() * 12;
  const apex = H * (0.42 + rng() * 0.34); // how high above the bottom it flies
  return {
    id: nextId++,
    kind,
    x: r + 12 + rng() * Math.max(1, W - 2 * (r + 12)),
    y: H + 40,
    vx: (rng() - 0.5) * W * 0.5,
    vy: -Math.sqrt(2 * GRAVITY * apex) * speedMul,
    rot: rng() * Math.PI * 2,
    vr: (rng() - 0.5) * 6,
    r,
    half: false,
    side: 0,
    life: Infinity,
  };
}

/**
 * Advance items one step. Returns survivors; `missed` holds whole items
 * that fell off the bottom unsliced (no penalty — mandor memaklumi).
 */
export function stepItems(
  items: FlyingItem[],
  dt: number,
  W: number,
  H: number,
): { items: FlyingItem[]; missed: FlyingItem[] } {
  const keep: FlyingItem[] = [];
  const missed: FlyingItem[] = [];
  for (const it of items) {
    it.vy += GRAVITY * dt;
    it.x += it.vx * dt;
    it.y += it.vy * dt;
    it.rot += it.vr * dt;
    if (it.half) {
      it.life -= dt;
      if (it.life <= 0) continue;
    } else if (it.y - it.r > H + 60) {
      missed.push(it);
      continue;
    }
    if (it.x < -120 || it.x > W + 120) continue;
    keep.push(it);
  }
  return { items: keep, missed };
}

export interface SliceResult {
  hit: FlyingItem[];
  rest: FlyingItem[];
}

/**
 * Which whole (non-half) items does the swipe segment (ax,ay)->(bx,by)
 * touch? A zero-length segment (tap) degrades to a point test.
 */
export function sliceCheck(
  items: FlyingItem[],
  ax: number,
  ay: number,
  bx: number,
  by: number,
): SliceResult {
  const hit: FlyingItem[] = [];
  const rest: FlyingItem[] = [];
  for (const it of items) {
    if (!it.half && distToSegment(it.x, it.y, ax, ay, bx, by) < it.r) {
      hit.push(it);
    } else {
      rest.push(it);
    }
  }
  return { hit, rest };
}

/** Split a sliced item into two flying halves. */
export function splitItem(item: FlyingItem, rng: Rng): FlyingItem[] {
  const kick = 130 + rng() * 90;
  const mk = (side: 0 | 1, dir: number): FlyingItem => ({
    ...item,
    id: nextId++,
    half: true,
    side,
    vx: item.vx + dir * kick,
    vy: item.vy - 150 - rng() * 80,
    vr: item.vr + dir * (4 + rng() * 5),
    life: 1.15,
  });
  return [mk(0, -1), mk(1, 1)];
}

/** Difficulty wave: spawn interval shrinks 1.1s -> 0.45s, speed rises. */
export function waveFor(elapsed: number): { interval: number; speedMul: number } {
  return {
    interval: Math.max(0.45, 1.1 - elapsed * 0.009),
    speedMul: 1 + Math.min(0.9, elapsed * 0.012),
  };
}

/** Combo bonus: >= COMBO_MIN slices in one swipe earns slices*5 extra. */
export function comboBonus(slicesInSwipe: number): number {
  return slicesInSwipe >= COMBO_MIN ? slicesInSwipe * 5 : 0;
}

/** Points for one clean slice (before combo bonus). */
export function slicePoints(): number {
  return SLICE_POINTS;
}
