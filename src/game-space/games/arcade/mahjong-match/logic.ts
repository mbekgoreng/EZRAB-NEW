/**
 * ArcadeMahjongMatch — cocokkan pasangan ubin bebas.
 * Ubin bebas = tidak tertutup ubin di atasnya & minimal satu sisi (kiri/kanan) terbuka.
 */
export interface Tile {
  id: number;
  x: number; y: number; z: number; // grid coords; z = lapisan (0 bawah)
  kind: number; // 0..PAIRS-1
  alive: boolean;
}

export const COLS = 8;
export const ROWS = 6;
export const LAYERS = 3;
export const PAIR_COUNT = 12;
export const TILE_W = 44;
export const TILE_H = 56;

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bentuk layout: tapak kaki kura-kura sederhana, 3 lapis menyusut. */
function footprint(z: number): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  const inset = z; // tiap lapis menyusut 1 sel tiap sisi
  for (let y = inset; y < ROWS - inset; y += 1) {
    for (let x = inset; x < COLS - inset; x += 1) {
      cells.push({ x, y });
    }
  }
  return cells;
}

/** Bangun layout acak dengan jumlah ubin genap & minimal 1 pasangan bebas di awal. */
export function buildLayout(seed: number): Tile[] {
  const rng = mulberry(seed);
  const slots: { x: number; y: number; z: number }[] = [];
  for (let z = 0; z < LAYERS; z += 1) {
    for (const c of footprint(z)) slots.push({ ...c, z });
  }
  // jumlah slot harus genap
  const usable = slots.slice(0, slots.length - (slots.length % 2));
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const shuffled = [...usable];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = (rng() * (i + 1)) | 0;
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const kinds: number[] = [];
    const nPairs = shuffled.length / 2;
    for (let k = 0; k < nPairs; k += 1) kinds.push(k % PAIR_COUNT, k % PAIR_COUNT);
    for (let i = kinds.length - 1; i > 0; i -= 1) {
      const j = (rng() * (i + 1)) | 0;
      [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
    }
    const tiles: Tile[] = shuffled.map((s, i) => ({
      id: i, x: s.x, y: s.y, z: s.z, kind: kinds[i], alive: true,
    }));
    if (freePairs(tiles).length > 0) return tiles;
  }
  // fallback: susun manual 2 pasangan bebas
  const tiles: Tile[] = usable.map((s, i) => ({
    id: i, x: s.x, y: s.y, z: s.z, kind: (i >> 1) % PAIR_COUNT, alive: true,
  }));
  return tiles;
}

export function tileAt(tiles: Tile[], x: number, y: number, z: number): Tile | undefined {
  return tiles.find((t) => t.alive && t.x === x && t.y === y && t.z === z);
}

export function isFree(tiles: Tile[], t: Tile): boolean {
  if (!t.alive) return false;
  // tertutup dari atas?
  if (tileAt(tiles, t.x, t.y, t.z + 1)) return false;
  // minimal satu sisi horizontal terbuka
  const leftBlocked = !!tileAt(tiles, t.x - 1, t.y, t.z);
  const rightBlocked = !!tileAt(tiles, t.x + 1, t.y, t.z);
  return !leftBlocked || !rightBlocked;
}

export function freePairs(tiles: Tile[]): [Tile, Tile][] {
  const free = tiles.filter((t) => isFree(tiles, t));
  const byKind = new Map<number, Tile[]>();
  for (const t of free) {
    const arr = byKind.get(t.kind) ?? [];
    arr.push(t);
    byKind.set(t.kind, arr);
  }
  const out: [Tile, Tile][] = [];
  for (const arr of byKind.values()) {
    for (let i = 0; i + 1 < arr.length; i += 2) out.push([arr[i], arr[i + 1]]);
  }
  return out;
}

export function remaining(tiles: Tile[]): number {
  return tiles.filter((t) => t.alive).length;
}

export function isCleared(tiles: Tile[]): boolean {
  return remaining(tiles) === 0;
}

/** Kocok ulang posisi ubin yang tersisa (tetap di slotnya per lapis). Penalti di komponen. */
export function shuffleRemaining(tiles: Tile[], rng: () => number): Tile[] {
  const alive = tiles.filter((t) => t.alive);
  const slots = alive.map((t) => ({ x: t.x, y: t.y, z: t.z }));
  const kinds = alive.map((t) => t.kind);
  for (let i = kinds.length - 1; i > 0; i -= 1) {
    const j = (rng() * (i + 1)) | 0;
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  // pastikan ada pasangan bebas; coba beberapa kali
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const next: Tile[] = alive.map((t, i) => ({ ...t, x: slots[i].x, y: slots[i].y, z: slots[i].z, kind: kinds[i] }));
    const dead = tiles.filter((t) => !t.alive);
    const all = [...next, ...dead];
    if (freePairs(all).length > 0) return all;
    for (let i = kinds.length - 1; i > 0; i -= 1) {
      const j = (rng() * (i + 1)) | 0;
      [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
    }
  }
  return tiles;
}

/** Skor: tiap pasangan +100, bonus kecepatan dihitung komponen. */
export const PAIR_SCORE = 100;
