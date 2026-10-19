/**
 * ArcadeShapeClicker ("Ketok Paku") — pure logic.
 * Paku-paku menonjol di atas gambar kerja (blueprint) — ketok secepatnya
 * sebelum tenggelam lagi! Level naik → makin ramai & makin cepat tenggelam.
 * Paku emas = bonus. Salah ketok = kombo putus.
 */

export type NailKind = 'paku' | 'emas';

export const NAILS_PER_LEVEL = 8; // ketokan sukses per level
export const GOLD_CHANCE = 0.1;

/** Level dari jumlah ketokan sukses. */
export function levelFor(hits: number): number {
  return 1 + Math.floor(Math.max(0, hits) / NAILS_PER_LEVEL);
}

/** Maksimal paku aktif bersamaan: 2 → 5. */
export function maxActiveAt(level: number): number {
  return Math.min(5, 1 + Math.floor(level / 2) + 1);
}

/** Jeda spawn (detik): 0.9s → 0.35s. */
export function spawnDelayAt(level: number, rng: () => number): number {
  const d = Math.max(0.35, 0.9 - (level - 1) * 0.08);
  return d * (0.7 + rng() * 0.6);
}

/** Berapa lama paku bertahan (detik): 1.6s → 0.7s. */
export function upTimeAt(level: number, rng: () => number): number {
  const base = Math.max(0.7, 1.6 - (level - 1) * 0.12);
  return base * (0.85 + rng() * 0.3);
}

/** Jenis paku berikutnya. */
export function nextKind(rng: () => number): NailKind {
  return rng() < GOLD_CHANCE ? 'emas' : 'paku';
}

/** Poin ketokan: paku 10 + streak×3; emas 40 + streak×3. */
export function tapPoints(kind: NailKind, streak: number): { points: number; newStreak: number } {
  const newStreak = streak + 1;
  const base = kind === 'emas' ? 40 : 10;
  return { points: base + newStreak * 3, newStreak };
}

/** Grade akhir. */
export function gradeFor(score: number): string {
  if (score >= 1200) return 'S';
  if (score >= 850) return 'A';
  if (score >= 550) return 'B';
  if (score >= 280) return 'C';
  return 'D';
}
