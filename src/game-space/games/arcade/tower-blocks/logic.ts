/**
 * Menara Balok — pure drop/trim math (no three.js, no DOM).
 * Sumbu gerak bergantian 'x' | 'z'. Balok digambarkan sebagai
 * kotak dengan pusat (cx, cz) dan ukuran (w, d) di atas balok sebelumnya.
 * Ukuran balok bergerak biasanya sama dengan balok sebelumnya, tetapi
 * boleh LEBIH BESAR berkat mekanisme tumbuh kembali (regrow) — lihat
 * regrowSize/regrowSlab di bawah. dropBlock menangani kedua kasus.
 */

export interface Slab {
  cx: number; cz: number; w: number; d: number;
}

export type Axis = 'x' | 'z';

export interface DropInput {
  prev: Slab;      // balok teratas menara
  moving: Slab;    // balok yang sedang meluncur (ukuran = prev, atau lebih besar bila regrow)
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
 *
 * Interval balok sebelumnya memakai ukuran PREV dan interval balok
 * bergerak memakai ukuran MOVING — keduanya tidak diasumsikan sama.
 * (Versi lama memakai ukuran moving untuk kedua interval; benar hanya
 * selama ukurannya selalu sama, dan salah begitu regrow membuat balok
 * bergerak lebih besar daripada tumpuannya.)
 *
 * Perfect: balok dipertahankan utuh pada ukuran moving — inilah hadiah
 * regrow: lantai sempurna boleh menjorok melebihi tumpuan di bawahnya
 * dan menjadi tumpuan baru yang lebih lebar. Non-perfect: yang bertahan
 * adalah irisan (intersection) kedua interval persis.
 * Debris tunggal: bila overhang ada di dua sisi (moving lebih besar dan
 * melingkupi prev), potongan yang LEBIH BESAR yang dikembalikan; irisan
 * yang bertahan tetap dihitung persis.
 */
export function dropBlock(inp: DropInput): DropResult {
  const { prev, moving, axis } = inp;
  const pCenter = axis === 'x' ? prev.cx : prev.cz;
  const mCenter = axis === 'x' ? moving.cx : moving.cz;
  const pSize = axis === 'x' ? prev.w : prev.d;
  const mSize = axis === 'x' ? moving.w : moving.d;
  const delta = mCenter - pCenter;

  // Perfect: snap ke tengah, tanpa potongan.
  if (Math.abs(delta) <= PERFECT_TOL) {
    const placed: Slab = axis === 'x'
      ? { ...moving, cx: pCenter }
      : { ...moving, cz: pCenter };
    return { placed, debris: null, delta: 0, perfect: true, gameOver: false };
  }

  // Potong overhang: irisan membentang dari max(p0,m0) ke min(p1,m1),
  // masing-masing dari ukuran baloknya sendiri.
  const p0 = pCenter - pSize / 2; const p1 = pCenter + pSize / 2;
  const m0 = mCenter - mSize / 2; const m1 = mCenter + mSize / 2;
  const o0 = Math.max(p0, m0); const o1 = Math.min(p1, m1);
  const overlap = o1 - o0;
  if (overlap < MIN_SIZE) {
    // meleset total -> seluruh balok jadi debris, game over
    return { placed: null, debris: { ...moving }, delta, perfect: false, gameOver: true };
  }
  const oCenter = (o0 + o1) / 2;
  const oSize = overlap;

  const placed: Slab = axis === 'x'
    ? { cx: oCenter, cz: moving.cz, w: oSize, d: moving.d }
    : { cx: moving.cx, cz: oCenter, w: moving.w, d: oSize };

  // debris = potongan overhang terbesar (kiri [m0,o0] atau kanan [o1,m1]);
  // untuk ukuran sama ini persis potongan tunggal versi lama.
  const leftSize = o0 - m0;
  const rightSize = m1 - o1;
  let debris: Slab | null = null;
  if (rightSize > 0 && rightSize >= leftSize) {
    const dCenter = (o1 + m1) / 2;
    debris = axis === 'x'
      ? { cx: dCenter, cz: moving.cz, w: rightSize, d: moving.d }
      : { cx: moving.cx, cz: dCenter, w: moving.w, d: rightSize };
  } else if (leftSize > 0) {
    const dCenter = (m0 + o0) / 2;
    debris = axis === 'x'
      ? { cx: dCenter, cz: moving.cz, w: leftSize, d: moving.d }
      : { cx: moving.cx, cz: dCenter, w: moving.w, d: leftSize };
  }

  return { placed, debris, delta, perfect: false, gameOver: false };
}

/** Ambang rentetan perfect sebelum balok mulai tumbuh kembali. */
export const REGROW_STREAK_MIN = 3;
/** Pertumbuhan ukuran per balok baru yang lahir saat regrow aktif (satuan dunia). */
export const REGROW_STEP = 0.22;

/**
 * Tumbuh kembali (regrow) ala Stack — fungsi murni.
 *
 * Rumus:
 *   perfectStreak < REGROW_STREAK_MIN  -> currentSize (tidak tumbuh)
 *   perfectStreak >= REGROW_STREAK_MIN -> min(baseSize, currentSize + REGROW_STEP)
 *
 * Jaminan: tidak pernah melebihi baseSize, tidak pernah mengecilkan
 * (bila currentSize sudah >= baseSize dikembalikan apa adanya), dan
 * input non-finite dikembalikan apa adanya. Satu langkah per balok
 * baru: memanggilnya berulang pada tiap perfect lanjutan menumbuhkan
 * ukuran selangkah demi selangkah sampai kembali ke baseSize.
 */
export function regrowSize(currentSize: number, baseSize: number, perfectStreak: number): number {
  if (!Number.isFinite(currentSize) || !Number.isFinite(baseSize) || !Number.isFinite(perfectStreak)) {
    return currentSize;
  }
  if (currentSize <= 0 || currentSize >= baseSize) return currentSize;
  if (perfectStreak < REGROW_STREAK_MIN) return currentSize;
  return Math.min(baseSize, currentSize + REGROW_STEP);
}

/**
 * Terapkan regrow pada slab balok berikutnya: hanya dimensi sepanjang
 * sumbu gerak `axis` yang tumbuh menuju dimensi base yang sama; dimensi
 * lain dan pusat slab tidak berubah.
 */
export function regrowSlab(prev: Slab, base: Slab, axis: Axis, perfectStreak: number): Slab {
  return axis === 'x'
    ? { ...prev, w: regrowSize(prev.w, base.w, perfectStreak) }
    : { ...prev, d: regrowSize(prev.d, base.d, perfectStreak) };
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
