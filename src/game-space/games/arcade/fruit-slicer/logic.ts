/**
 * ArcadeFruitSlicer ("Tebas Bambu") — pure logic.
 * Bambu, kayu & triplek beterbangan dari bawah — tebas dengan swipe!
 * JANGAN tebas dinamit 🧨 (nyawa -1). Tebasan beruntun = kombo.
 * Helm emas = bonus langka.
 */

export type SliceKind = 'bambu' | 'kayu' | 'triplek' | 'emas' | 'dinamit';

export interface SpawnSpec {
  kind: SliceKind;
  /** peluang kemunculan dinamit naik seiring waktu */
  bombChance: number;
}

export const GAME_DURATION = 60; // detik
export const MAX_LIVES = 3;
export const COMBO_WINDOW = 1.6; // detik antar tebasan agar kombo lanjut

export const KIND_META: Record<SliceKind, { icon: string; name: string; base: number }> = {
  bambu: { icon: '🎋', name: 'Bambu', base: 10 },
  kayu: { icon: '🪵', name: 'Kayu', base: 15 },
  triplek: { icon: '📦', name: 'Triplek', base: 20 },
  emas: { icon: '🪖', name: 'Helm Emas', base: 50 },
  dinamit: { icon: '🧨', name: 'Dinamit', base: 0 },
};

/** Peluang dinamit: 8% → 22% di akhir permainan. */
export function bombChanceAt(elapsed: number): number {
  const d = Math.min(1, Math.max(0, elapsed / GAME_DURATION));
  return 0.08 + d * 0.14;
}

/** Jeda antar spawn (detik): 1.1s → 0.45s. */
export function spawnDelayAt(elapsed: number, rng: () => number): number {
  const d = Math.min(1, Math.max(0, elapsed / GAME_DURATION));
  return (1.1 - d * 0.65) * (0.75 + rng() * 0.5);
}

/** Jenis item berikutnya. */
export function nextKind(elapsed: number, rng: () => number): SliceKind {
  const r = rng();
  const bombP = bombChanceAt(elapsed);
  if (r < bombP) return 'dinamit';
  if (r < bombP + 0.05) return 'emas';
  const r2 = rng();
  if (r2 < 0.45) return 'bambu';
  if (r2 < 0.78) return 'kayu';
  return 'triplek';
}

/** Poin tebasan: base + bonus kombo (kombo ≥3 → ×2, ≥6 → ×3). */
export function slicePoints(kind: SliceKind, combo: number): number {
  const base = KIND_META[kind].base;
  const mult = combo >= 6 ? 3 : combo >= 3 ? 2 : 1;
  return base * mult;
}

/** Kombo baru setelah tebasan sukses (dinamit tidak dihitung). */
export function nextCombo(prevCombo: number, secondsSinceLast: number): number {
  return secondsSinceLast <= COMBO_WINDOW ? prevCombo + 1 : 1;
}

/** Grade akhir. */
export function gradeFor(score: number): string {
  if (score >= 1500) return 'S';
  if (score >= 1000) return 'A';
  if (score >= 650) return 'B';
  if (score >= 350) return 'C';
  return 'D';
}
