/**
 * ArcadeSortirMaterial ("Sortir Material") — pure logic.
 * Material jatuh dari conveyor; seret ke bin yang benar (bata/kayu/besi).
 * Salah bin atau lolos = nyawa berkurang. Makin lama makin cepat.
 */

export type MatKind = 'bata' | 'kayu' | 'besi';

export interface BinDef {
  emoji: string;
  name: string;
  color: string; // aksen
}

export const BINS: Record<MatKind, BinDef> = {
  bata: { emoji: '🧱', name: 'BATA', color: '#ef4444' },
  kayu: { emoji: '🪵', name: 'KAYU', color: '#b45309' },
  besi: { emoji: '🔩', name: 'BESI', color: '#64748b' },
};

export const MAT_WEIGHTS: Record<MatKind, number> = { bata: 34, kayu: 33, besi: 33 };

export interface SortItem {
  id: number;
  kind: MatKind;
  x: number;
  y: number;
  variant: number; // varian gambar 0..2
}

export const MAX_LIVES = 3;
export const START_FALL = 130; // px/detik
export const START_SPAWN = 1.6; // detik antar spawn

/** Kecepatan jatuh (px/detik) — naik seiring waktu. */
export function fallSpeed(elapsed: number): number {
  return START_FALL * (1 + Math.min(1.6, elapsed / 45));
}

/** Interval spawn (detik) — makin rapat seiring waktu. */
export function spawnInterval(elapsed: number): number {
  return Math.max(0.55, START_SPAWN * (1 - Math.min(0.62, elapsed / 90)));
}

/** Pilih jenis material dari bobot. */
export function pickKind(rng: () => number): MatKind {
  const kinds = Object.keys(MAT_WEIGHTS) as MatKind[];
  const total = kinds.reduce((a, k) => a + MAT_WEIGHTS[k], 0);
  let roll = rng() * total;
  for (const k of kinds) {
    roll -= MAT_WEIGHTS[k];
    if (roll <= 0) return k;
  }
  return 'bata';
}

/** Spawn item di atas layar pada salah satu lajur. */
export function spawnItem(rng: () => number, id: number, lanes: number[], y: number): SortItem {
  return {
    id,
    kind: pickKind(rng),
    x: lanes[Math.floor(rng() * lanes.length)],
    y,
    variant: Math.floor(rng() * 3),
  };
}

/** Hasil sortir: benar bila bin == jenis material. */
export function sortResult(kind: MatKind, bin: MatKind): 'correct' | 'wrong' {
  return kind === bin ? 'correct' : 'wrong';
}

/** Poin sortir benar: 20 + bonus streak (maks +40). */
export function scoreFor(streak: number): number {
  return 20 + Math.min(40, Math.max(0, streak - 1) * 5);
}

/** Level kesulitan 1..5 dari waktu berjalan (untuk label & efek). */
export function levelAt(elapsed: number): number {
  return Math.min(5, 1 + Math.floor(elapsed / 25));
}
