/**
 * ArcadeNumberGuessing ("Tebak Volume") — pure logic.
 * Mandor butuh beton sekian m³ untuk pengecoran hari ini.
 * Tebak volumenya (m³) lewat kolom input — petunjuk PANAS/DINGIN
 * memandumu makin dekat. 8x kesempatan!
 */

export const MIN_VOL = 1;
export const MAX_VOL = 50;
export const MAX_ATTEMPTS = 8;

export type Heat = 'tepat' | 'panas' | 'hangat' | 'dingin' | 'beku';

/** Volume target acak (m³). */
export function newTarget(rng: () => number): number {
  return MIN_VOL + Math.floor(rng() * (MAX_VOL - MIN_VOL + 1));
}

/** Petunjuk panas/dingin dari selisih tebakan. */
export function heatFor(guess: number, target: number): Heat {
  const d = Math.abs(guess - target);
  if (d === 0) return 'tepat';
  if (d <= 2) return 'panas';
  if (d <= 5) return 'hangat';
  if (d <= 12) return 'dingin';
  return 'beku';
}

/** Label + emoji petunjuk (Bahasa Indonesia). */
export function heatLabel(h: Heat): string {
  switch (h) {
    case 'tepat': return 'TEPAT! 🎯';
    case 'panas': return 'PANAS! 🔥';
    case 'hangat': return 'Hangat 🙂';
    case 'dingin': return 'Dingin 🧊';
    case 'beku': return 'BEKU! 🥶';
  }
}

/** Arah petunjuk: tebakanmu kurang/lebih dari target. */
export function directionHint(guess: number, target: number): string {
  if (guess === target) return '';
  return guess < target ? 'Kurang — tambah volumenya! ⬆️' : 'Kelebihan — kurangi! ⬇️';
}

/** Skor: makin sedikit tebakan makin besar (100 → 10). */
export function scoreFor(attemptsUsed: number): number {
  return Math.max(10, 110 - attemptsUsed * 10);
}

/** Validasi input teks → angka m³ atau pesan error. */
export function parseGuess(raw: string): { ok: true; value: number } | { ok: false; error: string } {
  const t = raw.trim().replace(',', '.');
  if (t === '') return { ok: false, error: 'Isi dulu volumenya, Bos!' };
  const n = Number(t);
  if (!Number.isFinite(n)) return { ok: false, error: 'Itu bukan angka, Bos!' };
  if (!Number.isInteger(n)) return { ok: false, error: 'Bulatkan ke m³ penuh ya!' };
  if (n < MIN_VOL || n > MAX_VOL) {
    return { ok: false, error: `Antara ${MIN_VOL}–${MAX_VOL} m³ saja!` };
  }
  return { ok: true, value: n };
}
