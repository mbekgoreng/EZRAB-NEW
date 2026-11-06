/**
 * ArcadeNumberGuessing ("Tebak Volume") — pure logic.
 * Mandor butuh beton sekian m³ untuk pengecoran hari ini.
 * Tebak volumenya (m³) lewat kolom input — petunjuk PANAS/DINGIN
 * memandumu makin dekat.
 *
 * Sistem LEVEL (fungsi murni):
 * - Level 1 = perilaku asli PERSIS: rentang 1–50 m³, 8 kesempatan,
 *   pita panas/dingin asli (panas <=2, hangat <=5, dingin <=12).
 * - Level berikutnya: batas atas berlipat dua (50 -> 100 -> 200 ->
 *   400 -> 800 -> ...) dan kesempatan +1 tiap level (8 -> 9 -> 10
 *   -> ...), mengikuti kebutuhan pencarian biner atas rentang yang
 *   berlipat dua, jadi level tidak pernah mustahil.
 * - Ambang panas/dingin DISKALAKAN proporsional terhadap lebar
 *   rentang level (span = max-min): ambang = round(span * ambangL1 / 49).
 *   Di level 1 span=49 sehingga hasilnya identik dengan pita lama.
 * - Menang ronde -> naik level; skor ronde = scoreFor(attempts) x level
 *   (pengali 1 di level 1, jadi identik dengan skor lama) dan
 *   terakumulasi lintas level lewat addRoundScore.
 */

export const MIN_VOL = 1;
export const MAX_VOL = 50;
export const MAX_ATTEMPTS = 8;

export type Heat = 'tepat' | 'panas' | 'hangat' | 'dingin' | 'beku';
export type Direction = 'kurang' | 'lebih' | 'tepat';

export interface LevelSpec {
  level: number;
  min: number;
  max: number;
  maxAttempts: number;
}

/** Spesifikasi level: fungsi murni, level dibulatkan & minimal 1. */
export function levelSpec(level: number): LevelSpec {
  const lv = Math.max(1, Math.floor(Number.isFinite(level) ? level : 1));
  return {
    level: lv,
    min: MIN_VOL,
    max: MAX_VOL * 2 ** (lv - 1),
    maxAttempts: MAX_ATTEMPTS + (lv - 1),
  };
}

/** Level sesudah menang ronde. */
export function nextLevel(level: number): number {
  return levelSpec(level).level + 1;
}

export interface HeatThresholds { panas: number; hangat: number; dingin: number }

/** Ambang selisih (m³) per pita, diskalakan proporsional terhadap span rentang level. */
export function heatThresholdsForLevel(level: number): HeatThresholds {
  const spec = levelSpec(level);
  const span = spec.max - spec.min; // level 1: 49
  const baseSpan = MAX_VOL - MIN_VOL; // 49
  return {
    panas: Math.max(1, Math.round((span * 2) / baseSpan)),
    hangat: Math.max(2, Math.round((span * 5) / baseSpan)),
    dingin: Math.max(3, Math.round((span * 12) / baseSpan)),
  };
}

/** Volume target acak (m³) — perilaku level 1. */
export function newTarget(rng: () => number): number {
  return newTargetForLevel(rng, 1);
}

/** Volume target acak (m³) di dalam rentang level aktif. */
export function newTargetForLevel(rng: () => number, level: number): number {
  const spec = levelSpec(level);
  const raw = Math.min(0.999999999, Math.max(0, rng()));
  return spec.min + Math.floor(raw * (spec.max - spec.min + 1));
}

/** Petunjuk panas/dingin dari selisih tebakan — pita level 1 (asli). */
export function heatFor(guess: number, target: number): Heat {
  return heatForLevel(guess, target, 1);
}

/** Petunjuk panas/dingin dengan pita yang diskalakan untuk level aktif. */
export function heatForLevel(guess: number, target: number, level: number): Heat {
  const d = Math.abs(guess - target);
  if (d === 0) return 'tepat';
  const th = heatThresholdsForLevel(level);
  if (d <= th.panas) return 'panas';
  if (d <= th.hangat) return 'hangat';
  if (d <= th.dingin) return 'dingin';
  return 'beku';
}

/** Label petunjuk bersih tanpa emoji (Bahasa Indonesia). */
export function heatLabel(h: Heat): string {
  switch (h) {
    case 'tepat': return 'TEPAT!';
    case 'panas': return 'PANAS!';
    case 'hangat': return 'Hangat';
    case 'dingin': return 'Dingin';
    case 'beku': return 'BEKU!';
  }
}

/** Arah tebakan terhadap target sebagai nilai terstruktur (untuk ikon SVG). */
export function directionFor(guess: number, target: number): Direction {
  if (guess === target) return 'tepat';
  return guess < target ? 'kurang' : 'lebih';
}

/** Arah petunjuk: tebakanmu kurang/lebih dari target (teks bersih, tanpa emoji). */
export function directionHint(guess: number, target: number): string {
  const dir = directionFor(guess, target);
  if (dir === 'tepat') return '';
  return dir === 'kurang' ? 'Kurang — tambah volumenya!' : 'Kelebihan — kurangi!';
}

/**
 * Skor ronde dasar: makin sedikit tebakan makin besar (100 -> 10).
 * Regresi: attemptsUsed diklamp minimal 1 — sebelumnya scoreFor(0)
 * menghasilkan 110, melewati cap 100 yang didokumentasikan.
 */
export function scoreFor(attemptsUsed: number): number {
  const used = Math.max(1, Math.floor(Number.isFinite(attemptsUsed) ? attemptsUsed : 1));
  return Math.max(10, 110 - used * 10);
}

/** Skor ronde pada level tertentu: skor dasar x level (level 1 identik scoreFor). */
export function levelScore(attemptsUsed: number, level: number): number {
  return scoreFor(attemptsUsed) * levelSpec(level).level;
}

/** Akumulasi skor total lintas level. */
export function addRoundScore(totalScore: number, attemptsUsed: number, level: number): number {
  const base = Number.isFinite(totalScore) ? Math.max(0, Math.floor(totalScore)) : 0;
  return base + levelScore(attemptsUsed, level);
}

/**
 * Apakah ronde sudah berakhir? Dipakai komponen untuk mengunci input
 * begitu ronde selesai — regresi: sebelumnya tebakan masih diterima
 * selama jeda transisi ke layar akhir sehingga hasil bisa tertimpa /
 * skor tercatat ganda.
 */
export function isRoundOver(lastHeat: Heat | null, attemptsUsed: number, maxAttempts: number): boolean {
  if (lastHeat === 'tepat') return true;
  return attemptsUsed >= maxAttempts;
}

/**
 * Validasi input teks -> angka m³ atau pesan error.
 * Rentang bisa diberikan (default rentang level 1 agar perilaku lama tetap).
 */
export function parseGuess(
  raw: string,
  min: number = MIN_VOL,
  max: number = MAX_VOL,
): { ok: true; value: number } | { ok: false; error: string } {
  const t = raw.trim().replace(',', '.');
  if (t === '') return { ok: false, error: 'Isi dulu volumenya, Bos!' };
  const n = Number(t);
  if (!Number.isFinite(n)) return { ok: false, error: 'Itu bukan angka, Bos!' };
  if (!Number.isInteger(n)) return { ok: false, error: 'Bulatkan ke m³ penuh ya!' };
  if (n < min || n > max) {
    return { ok: false, error: `Antara ${min}–${max} m³ saja!` };
  }
  return { ok: true, value: n };
}

/** Validasi input terhadap rentang level aktif. */
export function parseGuessForLevel(
  raw: string,
  level: number,
): { ok: true; value: number } | { ok: false; error: string } {
  const spec = levelSpec(level);
  return parseGuess(raw, spec.min, spec.max);
}
