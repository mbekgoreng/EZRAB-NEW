/**
 * ArcadeWhackAMole ("Pukul Paku") — pure logic.
 * Paku-paku menonjol dari papan kayu 3×3; pukul dengan palu sebelum masuk lagi.
 *
 * Gelombang 5 — pembeda mekanik dari shape-clicker (klik-bentuk generik):
 *  1. PAKU EMAS: target bonus langka, poin besar, waktu nongol JAUH lebih
 *     singkat dari paku biasa (`upTimeForKind`).
 *  2. BAUT LARANGAN: target JANGAN DIPUKUL — memukulnya memotong skor DAN
 *     waktu (`scoreHit` negatif + `timePenaltyFor`), serta memutus streak.
 *     Ini target negatif; shape-clicker tidak punya target larangan.
 *  3. KOMBO: streak pukulan beruntun menaikkan PENGGANDA poin
 *     (`multiplierForStreak`: x1 → x2 di streak 6 → x3 di streak 11),
 *     bukan sekadar bonus aditif datar.
 * Semua keputusan spawn/skor di atas adalah fungsi murni teruji.
 */

export type NailKind = 'paku' | 'emas' | 'baut';

export interface NailSpawn {
  hole: number; // 0..8
  kind: NailKind;
  upTime: number; // detik target bertahan di luar
}

export const GAME_DURATION = 60; // detik
export const HOLE_COUNT = 9;
export const GOLD_CHANCE = 0.09;
/** Peluang baut larangan muncul (setelah peluang emas gagal). */
export const BAUT_CHANCE = 0.14;
/** Penalti waktu (detik) bila baut terpukul. */
export const BAUT_TIME_PENALTY = 3;
/** Penalti skor dasar bila baut terpukul (sebelum dijepit ke >= -skor). */
export const BAUT_SCORE_PENALTY = 30;

/** 0..1 progres kesulitan dari waktu berjalan. */
export function difficultyAt(elapsed: number): number {
  return Math.min(1, Math.max(0, elapsed / GAME_DURATION));
}

/** Jeda antar spawn (detik) — makin rapat di akhir permainan. */
export function spawnDelay(elapsed: number, rng: () => number): number {
  const d = difficultyAt(elapsed);
  const base = 1.05 - d * 0.62;
  return base * (0.7 + rng() * 0.6);
}

/** Berapa lama target bertahan (detik) — makin singkat di akhir. */
export function upTime(elapsed: number, rng: () => number): number {
  const d = difficultyAt(elapsed);
  return (1.45 - d * 0.65) * (0.85 + rng() * 0.3);
}

/**
 * Faktor waktu nongol per jenis: emas hanya 60% dari paku biasa
 * (harus disambar cepat), baut 85% (godaan singkat untuk salah pukul).
 */
export function upTimeForKind(baseUpTime: number, kind: NailKind): number {
  if (kind === 'emas') return baseUpTime * 0.6;
  if (kind === 'baut') return baseUpTime * 0.85;
  return baseUpTime;
}

/** Tentukan jenis dari satu lemparan rng (0..1) — murni & teruji batasnya. */
export function spawnKind(roll: number): NailKind {
  if (roll < GOLD_CHANCE) return 'emas';
  if (roll < GOLD_CHANCE + BAUT_CHANCE) return 'baut';
  return 'paku';
}

/** Pengganda kombo dari streak BARU setelah pukulan: 1 / 2 / 3. */
export function multiplierForStreak(newStreak: number): number {
  if (newStreak >= 11) return 3;
  if (newStreak >= 6) return 2;
  return 1;
}

/** Penalti waktu per jenis yang terpukul (hanya baut yang menghukum waktu). */
export function timePenaltyFor(kind: NailKind): number {
  return kind === 'baut' ? BAUT_TIME_PENALTY : 0;
}

/** Tentukan spawn berikutnya: lubang acak (hindari yang sedang aktif bila bisa). */
export function nextSpawn(
  rng: () => number,
  elapsed: number,
  activeHoles: ReadonlySet<number>,
): NailSpawn {
  const free: number[] = [];
  for (let i = 0; i < HOLE_COUNT; i += 1) {
    if (!activeHoles.has(i)) free.push(i);
  }
  const pool = free.length > 0 ? free : Array.from({ length: HOLE_COUNT }, (_, i) => i);
  const hole = pool[Math.floor(rng() * pool.length)];
  const kind: NailKind = spawnKind(rng());
  return { hole, kind, upTime: upTimeForKind(upTime(elapsed, rng), kind) };
}

export interface HitResult {
  points: number;
  newStreak: number;
  multiplier: number;
  timePenalty: number;
}

/**
 * Poin pukulan:
 * - paku: (10 + streakBaru×2) × pengganda kombo
 * - emas: (50 + streakBaru×2) × pengganda kombo
 * - baut (LARANGAN): −30 poin, streak putus, penalti waktu 3 detik.
 */
export function scoreHit(kind: NailKind, streak: number): HitResult {
  if (kind === 'baut') {
    return { points: -BAUT_SCORE_PENALTY, newStreak: 0, multiplier: 1, timePenalty: BAUT_TIME_PENALTY };
  }
  const newStreak = streak + 1;
  const multiplier = multiplierForStreak(newStreak);
  const base = kind === 'emas' ? 50 : 10;
  return { points: (base + newStreak * 2) * multiplier, newStreak, multiplier, timePenalty: 0 };
}

/** Grade akhir. */
export function gradeFor(score: number): string {
  if (score >= 1200) return 'S';
  if (score >= 900) return 'A';
  if (score >= 600) return 'B';
  if (score >= 350) return 'C';
  return 'D';
}
