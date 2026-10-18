/**
 * Bongkar Rumah — pure game logic (tanpa DOM/window).
 *
 * Side-view 2D: bangunan dari blok destructible. Ketuk blok -> hancur.
 * Blok intact yang kehilangan penyangga -> jatuh (falling) -> mendarat
 * jadi puing (rubble). Menang saat >= 98% blok hancur.
 */

/* ---------------- types & constants ---------------- */

export type Material = 'bata' | 'kayu' | 'kaca' | 'beton';
export type BlockState = 'intact' | 'falling' | 'rubble' | 'gone';

export interface Block {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  mat: Material;
  vy: number;
  state: BlockState;
}

export const GRAVITY = 900; // px/s^2
export const COMBO_WINDOW = 1.5; // detik
export const WIN_PROGRESS = 0.98;
export const BASE_POINTS = 10;
export const MAX_MULTIPLIER = 5;

/** Warna partikel per material (dipakai renderer). */
export const MAT_PARTICLE_COLORS: Record<Material, string[]> = {
  bata: ['#e2672e', '#c4501f', '#f4a261', '#8a3a17'],
  kayu: ['#a06a35', '#7c4f24', '#c89b6a', '#5d3a1a'],
  kaca: ['#9fd4f5', '#5fb3e8', '#e8f7ff', '#3d8fc4'],
  beton: ['#9aa3ad', '#7d858e', '#c7cdd3', '#5f666d'],
};

/* ---------------- combo state ---------------- */

export interface Combo {
  count: number;
  lastAt: number;
}

export const createCombo = (): Combo => ({ count: 0, lastAt: -Infinity });

export interface DestroyResult {
  ok: boolean;
  points: number;
  multiplier: number;
}

/**
 * Hancurkan satu blok. Mengembalikan poin = BASE_POINTS * multiplier,
 * multiplier naik tiap hancur beruntun dalam COMBO_WINDOW (maks 5x).
 */
export function destroyBlock(
  blocks: Block[],
  id: number,
  combo: Combo,
  now: number,
): DestroyResult {
  const b = blocks.find((x) => x.id === id);
  if (!b || b.state !== 'intact') return { ok: false, points: 0, multiplier: 1 };
  b.state = 'gone';
  b.vy = 0;
  if (now - combo.lastAt <= COMBO_WINDOW) combo.count += 1;
  else combo.count = 1;
  combo.lastAt = now;
  const multiplier = Math.min(MAX_MULTIPLIER, combo.count);
  return { ok: true, points: BASE_POINTS * multiplier, multiplier };
}

/** Multiplier yang sedang aktif (0 bila kombo kedaluwarsa). */
export function activeMultiplier(combo: Combo, now: number): number {
  if (now - combo.lastAt > COMBO_WINDOW) return 0;
  return Math.min(MAX_MULTIPLIER, combo.count);
}

/* ---------------- collapse physics ---------------- */

export interface CollapseEvent {
  kind: 'landed';
  block: Block;
}

function overlapX(a: Block, b: Block): number {
  return Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
}

function isStable(o: Block): boolean {
  return o.state === 'intact' || o.state === 'rubble';
}

/** Blok intact tersangga bila menyentuh tanah atau ada blok stabil di bawahnya (overlap-x > 40%). */
function isSupported(b: Block, blocks: Block[], groundY: number): boolean {
  if (b.y + b.h >= groundY - 1) return true;
  const bottom = b.y + b.h;
  for (const o of blocks) {
    if (o === b || !isStable(o)) continue;
    if (Math.abs(o.y - bottom) <= 2 && overlapX(b, o) > 0.4 * b.w) return true;
  }
  return false;
}

/** Permukaan pendaratan tertinggi di bawah blok (tanah atau atas blok stabil). */
function landingSurface(b: Block, blocks: Block[], groundY: number): number {
  let s = groundY;
  const bottom = b.y + b.h;
  for (const o of blocks) {
    if (o === b || !isStable(o)) continue;
    if (o.y >= bottom - 2 && overlapX(b, o) > 0.4 * b.w) s = Math.min(s, o.y);
  }
  return s;
}

/**
 * Majukan fisika runtuh satu langkah. Blok intact tanpa penyangga -> falling;
 * falling yang menyentuh permukaan -> rubble (+ event 'landed' untuk debu/suara).
 */
export function stepCollapse(
  blocks: Block[],
  dt: number,
  groundY: number,
): CollapseEvent[] {
  const events: CollapseEvent[] = [];
  for (const b of blocks) {
    if (b.state === 'intact' && !isSupported(b, blocks, groundY)) {
      b.state = 'falling';
      b.vy = 0;
    }
  }
  for (const b of blocks) {
    if (b.state !== 'falling') continue;
    b.vy += GRAVITY * dt;
    b.y += b.vy * dt;
    const surface = landingSurface(b, blocks, groundY);
    if (b.y + b.h >= surface) {
      b.y = surface - b.h;
      b.vy = 0;
      b.state = 'rubble';
      events.push({ kind: 'landed', block: b });
    }
  }
  return events;
}

/* ---------------- progress & win ---------------- */

/** Proporsi blok yang sudah hancur (gone + rubble), 0..1. */
export function progress(blocks: Block[]): number {
  if (blocks.length === 0) return 1;
  let done = 0;
  for (const b of blocks) {
    if (b.state === 'gone' || b.state === 'rubble') done += 1;
  }
  return done / blocks.length;
}

export function isWon(blocks: Block[]): boolean {
  return progress(blocks) >= WIN_PROGRESS;
}

/** Blok intact teratas pada titik (x,y) — untuk tap. */
export function blockAt(blocks: Block[], x: number, y: number): Block | null {
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    const b = blocks[i];
    if (b.state !== 'intact') continue;
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

/* ---------------- level data ---------------- */

export interface LevelMeta {
  name: string;
  sub: string;
  hasCrane: boolean;
}

export const LEVELS: LevelMeta[] = [
  { name: 'Rumah Type 36', sub: 'Dinding bata 1 lantai + atap kayu', hasCrane: false },
  { name: 'Ruko', sub: '2 lantai beton & kaca', hasCrane: false },
  { name: 'Apartemen', sub: '4 lantai, mulai serius', hasCrane: false },
  { name: 'Tower', sub: '6 lantai + tower crane', hasCrane: true },
];

const BW = 38;
const BH = 30;

type Cell = Material | 'x';

function buildRows(
  groundY: number,
  cx: number,
  cols: number,
  rows: Cell[][],
): Block[] {
  const blocks: Block[] = [];
  const x0 = cx - (cols * BW) / 2;
  let id = 0;
  // rows[0] = baris paling bawah
  for (let r = 0; r < rows.length; r += 1) {
    const y = groundY - (r + 1) * BH;
    for (let c = 0; c < cols; c += 1) {
      const mat = rows[r][c];
      if (mat === 'x') continue;
      blocks.push({
        id: id++, x: x0 + c * BW, y, w: BW, h: BH,
        mat: mat as Material, vy: 0, state: 'intact',
      });
    }
  }
  return blocks;
}

const B: Cell = 'bata';
const K: Cell = 'kayu';
const C: Cell = 'kaca';
const T: Cell = 'beton';
const X: Cell = 'x';

export interface LevelData {
  meta: LevelMeta;
  blocks: Block[];
  total: number;
}

/** Bangun level ke-idx (0-based). Deterministik — tanpa random. */
export function createLevel(idx: number, groundY: number, cx = 195): LevelData {
  const meta = LEVELS[idx] ?? LEVELS[0];
  let blocks: Block[] = [];
  switch (idx) {
    case 0: {
      // Rumah Type 36: 6 kolom, 2 baris bata penuh, atap kayu
      blocks = buildRows(groundY, cx, 6, [
        [B, B, B, B, B, B],
        [B, B, B, B, B, B],
        [K, K, K, K, K, K],
      ]);
      break;
    }
    case 1: {
      // Ruko: 7 kolom, 2 lantai beton + kaca
      blocks = buildRows(groundY, cx, 7, [
        [T, T, T, T, T, T, T],
        [T, C, C, C, C, C, T],
        [T, T, T, T, T, T, T],
        [T, C, C, C, C, C, T],
        [T, T, T, T, T, T, T],
      ]);
      break;
    }
    case 2: {
      // Apartemen: 8 kolom, 4 lantai
      const pil: Cell[] = [T, C, C, C, C, C, C, T];
      const slab: Cell[] = [T, T, T, T, T, T, T, T];
      blocks = buildRows(groundY, cx, 8, [slab, pil, slab, pil, slab, pil, slab]);
      break;
    }
    case 3: {
      // Tower: 9 kolom, podium beton + 5 lantai kaca + atap
      const pil: Cell[] = [T, C, C, C, C, C, C, C, T];
      const slab: Cell[] = [T, T, T, T, T, T, T, T, T];
      blocks = buildRows(groundY, cx, 9, [slab, slab, pil, pil, pil, pil, pil, slab]);
      break;
    }
    default:
      blocks = [];
  }
  return { meta, blocks, total: blocks.length };
}
