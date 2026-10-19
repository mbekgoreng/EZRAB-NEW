/**
 * ArcadeWhackAMole ("Pukul Paku") — pure logic.
 * Paku-paku menonjol dari papan kayu 3×3; pukul dengan palu sebelum masuk lagi.
 * Paku emas = bonus. Streak pukulan beruntun menambah poin.
 */

export type NailKind = 'paku' | 'emas';

export interface NailSpawn {
  hole: number; // 0..8
  kind: NailKind;
  upTime: number; // detik paku bertahan di luar
}

export const GAME_DURATION = 60; // detik
export const HOLE_COUNT = 9;
export const GOLD_CHANCE = 0.09;

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

/** Berapa lama paku bertahan (detik) — makin singkat di akhir. */
export function upTime(elapsed: number, rng: () => number): number {
  const d = difficultyAt(elapsed);
  return (1.45 - d * 0.65) * (0.85 + rng() * 0.3);
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
  const kind: NailKind = rng() < GOLD_CHANCE ? 'emas' : 'paku';
  return { hole, kind, upTime: upTime(elapsed, rng) };
}

export interface HitResult {
  points: number;
  newStreak: number;
}

/** Poin pukulan: paku 10 + streak×2; paku emas 50 + streak×2. */
export function scoreHit(kind: NailKind, streak: number): HitResult {
  const newStreak = streak + 1;
  const base = kind === 'emas' ? 50 : 10;
  return { points: base + newStreak * 2, newStreak };
}

/** Grade akhir. */
export function gradeFor(score: number): string {
  if (score >= 1200) return 'S';
  if (score >= 900) return 'A';
  if (score >= 600) return 'B';
  if (score >= 350) return 'C';
  return 'D';
}
