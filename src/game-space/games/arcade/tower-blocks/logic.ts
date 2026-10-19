/**
 * Menara Balok — pure drop/trim math (no three.js, no DOM).
 * Sumbu gerak bergantian 'x' | 'z'. Balok digambarkan sebagai
 * kotak dengan pusat (cx, cz) dan ukuran (w, d) di atas balok sebelumnya.
 */

export interface Slab {
  cx: number; cz: number; w: number; d: number;
}

export type Axis = 'x' | 'z';

export interface DropInput {
  prev: Slab;      // balok teratas menara
  moving: Slab;    // balok yang sedang meluncur (ukuran = prev)
  axis: Axis;      // sumbu gerak balok
}

export interface DropResult {
  /** balok yang bertahan di menara (null bila game over) */
  placed: Slab | null;
  /** potongan overhang yang jatuh (null bila perfect/tidak ada) */
  debris: Slab | null;
  /** selisih posisi sepanjang sumbu gerak */
  delta: number;
  perfect: boolean;
  gameOver: boolean;
}

export const PERFECT_TOL = 0.22; // toleransi "perfect" dalam satuan dunia
export const MIN_SIZE = 0.28;    // di bawah ini -> balok tak bisa diletakkan

/**
 * Jatuhkan balok yang sedang meluncur ke atas menara.
 * Overhang di luar balok sebelumnya terpotong menjadi debris.
 */
export function dropBlock(inp: DropInput): DropResult {
  const { prev, moving, axis } = inp;
  const pCenter = axis === 'x' ? prev.cx : prev.cz;
  const mCenter = axis === 'x' ? moving.cx : moving.cz;
  const size = axis === 'x' ? moving.w : moving.d;
  const delta = mCenter - pCenter;

  // Perfect: snap ke tengah, tanpa potongan.
  if (Math.abs(delta) <= PERFECT_TOL) {
    const placed: Slab = axis === 'x'
      ? { ...moving, cx: pCenter }
      : { ...moving, cz: pCenter };
    return { placed, debris: null, delta: 0, perfect: true, gameOver: false };
  }

  const overlap = size - Math.abs(delta);
  if (overlap < MIN_SIZE) {
    // meleset total -> seluruh balok jadi debris, game over
    return { placed: null, debris: { ...moving }, delta, perfect: false, gameOver: true };
  }

  // Potong overhang: overlap membentang dari max(p0,m0) ke min(p1,m1).
  const p0 = pCenter - size / 2; const p1 = pCenter + size / 2;
  const m0 = mCenter - size / 2; const m1 = mCenter + size / 2;
  const o0 = Math.max(p0, m0); const o1 = Math.min(p1, m1);
  const oCenter = (o0 + o1) / 2;
  const oSize = o1 - o0;

  const placed: Slab = axis === 'x'
    ? { cx: oCenter, cz: moving.cz, w: oSize, d: moving.d }
    : { cx: moving.cx, cz: oCenter, w: moving.w, d: oSize };

  // debris = bagian yang menonjol (di sisi arah meleset)
  const sign = delta >= 0 ? 1 : -1;
  const dCenter = sign > 0 ? (o1 + m1) / 2 : (m0 + o0) / 2;
  const dSize = size - oSize;
  const debris: Slab = axis === 'x'
    ? { cx: dCenter, cz: moving.cz, w: dSize, d: moving.d }
    : { cx: moving.cx, cz: dCenter, w: moving.w, d: dSize };

  return { placed, debris, delta, perfect: false, gameOver: false };
}

/** Warna balok berdasar ketinggian: gradasi hue pelangi yang halus. */
export function slabHue(level: number): number {
  return (level * 9) % 360;
}

/** Kecepatan luncur (satuan/detik) naik perlahan per level. */
export function slideSpeed(level: number): number {
  return 2.6 + Math.min(3.4, level * 0.09);
}

/** Jangkauan luncur dari tengah. */
export const SLIDE_RANGE = 4.2;

/** Skor: 1 per lantai + bonus perfect berantai. */
export function scoreForDrop(level: number, combo: number, perfect: boolean): number {
  return 1 + (perfect ? 1 + Math.min(combo, 8) : 0);
}
