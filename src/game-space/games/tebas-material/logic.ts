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
/**
 * Toleransi bilah (px): swipe tidak harus TEPAT mengenai — ada
 * "lebar pedang" 14px di tiap sisi. Kunci fairness untuk item cepat.
 */
export const BLADE_PAD = 14;
export const START_LIVES = 3;
/** Kombo mulai dari 2 tebasan dalam satu swipe (slow-mo + bonus). */
export const COMBO_MIN = 2;
/** Slow-mo saat kombo: timeScale & durasi (detik). */
export const SLOWMO_SCALE = 0.3;
export const SLOWMO_T = 0.3;
/** 2 detik pertama run: tidak ada dinamit (fairness, hasil play-test). */
export const GRACE_NO_DYNAMITE_T = 2.0;

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

export interface SpawnOpts {
  /** true -> dinamit tidak boleh muncul (grace period awal run). */
  noDinamit?: boolean;
}

/** pickKind tapi dinamit dikecualikan (untuk grace period). */
export function pickKindSafe(rng: Rng): ItemKind {
  let k = pickKind(rng);
  let guard = 0;
  while (k === 'dinamit' && guard < 32) {
    k = pickKind(rng);
    guard += 1;
  }
  return k === 'dinamit' ? 'bata' : k;
}

/**
 * Spawn one item below the screen, tossed upward.
 * vy is derived from gravity so the apex lands mid-screen regardless of H.
 */
export function spawnItem(rng: Rng, W: number, H: number, speedMul = 1, opts: SpawnOpts = {}): FlyingItem {
  const kind = opts.noDinamit ? pickKindSafe(rng) : pickKind(rng);
  // material BESAR & juicy; dinamit sedikit lebih kecil tapi tetap jelas
  const r = kind === 'dinamit' ? 26 + rng() * 6 : 34 + rng() * 14;
  // spawn bias ke tengah (fairness): satu sabetan horizontal di tengah
  // layar mengenai sebagian besar item — seperti Fruit Ninja.
  // apex TINGGI: waktu terbang ~2 detik, pemain sempat membidik.
  const apex = H * (0.55 + rng() * 0.30); // how high above the bottom it flies
  return {
    id: nextId++,
    kind,
    x: W * (0.12 + rng() * 0.76),
    y: H + 40,
    vx: (rng() - 0.5) * W * 0.35,
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
 * BLADE_PAD memberi toleransi "lebar pedang" agar item cepat tetap adil.
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
    if (!it.half && distToSegment(it.x, it.y, ax, ay, bx, by) < it.r + BLADE_PAD) {
      hit.push(it);
    } else {
      rest.push(it);
    }
  }
  return { hit, rest };
}

/** Split a sliced item into two flying halves (juicy: tendangan kuat). */
export function splitItem(item: FlyingItem, rng: Rng): FlyingItem[] {
  const kick = 170 + rng() * 120;
  const mk = (side: 0 | 1, dir: number): FlyingItem => ({
    ...item,
    id: nextId++,
    half: true,
    side,
    vx: item.vx + dir * kick,
    vy: item.vy - 180 - rng() * 100,
    vr: item.vr + dir * (5 + rng() * 6),
    life: 1.25,
  });
  return [mk(0, -1), mk(1, 1)];
}

/**
 * Difficulty wave (fairness-tuned): spawn interval 1.45s -> 0.6s menyusut
 * PELAN, speed naik PELAN. Dengan miss = -1 nyawa, spawn agresif = mati
 * sebelum bereaksi; curve ini memberi pemain ruang bernapas di awal.
 */
export function waveFor(elapsed: number): { interval: number; speedMul: number } {
  return {
    interval: Math.max(0.6, 1.45 - elapsed * 0.007),
    speedMul: 1 + Math.min(0.7, elapsed * 0.008),
  };
}

/** Batas item bersamaan di layar (anti-banjir miss). */
export const MAX_ITEMS = 9;

/** Combo bonus: >= COMBO_MIN slices in one swipe earns slices*5 extra. */
export function comboBonus(slicesInSwipe: number): number {
  return slicesInSwipe >= COMBO_MIN ? slicesInSwipe * 5 : 0;
}

/**
 * Nyawa hilang saat item jatuh tanpa dislice.
 * Dinamit yang jatuh = beruntung (tidak ada penalti); material = -1 nyawa.
 */
export function missLivesLost(kind: ItemKind): number {
  return kind === 'dinamit' ? 0 : 1;
}

/** Points for one clean slice (before combo bonus). */
export function slicePoints(): number {
  return SLICE_POINTS;
}
