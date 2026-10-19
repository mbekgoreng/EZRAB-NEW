/**
 * ArcadeInsectCatch ("Tangkap Perkakas") — pure logic.
 * Perkakas jatuh dari lantai atas — ketuk sebelum menyentuh tanah!
 * Ketukan beruntun tanpa meleset = kombo. Bor emas = bonus.
 */

export type ToolKind = 'palu' | 'obeng' | 'kunci' | 'meteran' | 'bor-emas';

export const GAME_DURATION = 60; // detik
export const COMBO_STEP = 5; // tiap 5 kombo → bonus popup

export const TOOL_META: Record<ToolKind, { icon: string; name: string; base: number }> = {
  palu: { icon: '🔨', name: 'Palu', base: 10 },
  obeng: { icon: '🪛', name: 'Obeng', base: 10 },
  kunci: { icon: '🔧', name: 'Kunci Pas', base: 15 },
  meteran: { icon: '📏', name: 'Meteran', base: 15 },
  'bor-emas': { icon: '🪚', name: 'Bor Emas', base: 50 },
};

export const GOLD_CHANCE = 0.08;

/** Jenis perkakas berikutnya (bor emas langka). */
export function nextTool(rng: () => number): ToolKind {
  if (rng() < GOLD_CHANCE) return 'bor-emas';
  const r = rng();
  if (r < 0.3) return 'palu';
  if (r < 0.55) return 'obeng';
  if (r < 0.8) return 'kunci';
  return 'meteran';
}

/** Kecepatan jatuh (px/detik) — naik seiring waktu. */
export function fallSpeedAt(elapsed: number, rng: () => number): number {
  const d = Math.min(1, Math.max(0, elapsed / GAME_DURATION));
  return (170 + d * 260) * (0.85 + rng() * 0.3);
}

/** Jeda spawn (detik): 0.95s → 0.4s. */
export function spawnDelayAt(elapsed: number, rng: () => number): number {
  const d = Math.min(1, Math.max(0, elapsed / GAME_DURATION));
  return (0.95 - d * 0.55) * (0.7 + rng() * 0.6);
}

/** Poin ketukan: base + kombo×2. */
export function tapPoints(kind: ToolKind, combo: number): number {
  return TOOL_META[kind].base + combo * 2;
}

/** Grade akhir. */
export function gradeFor(score: number): string {
  if (score >= 1400) return 'S';
  if (score >= 950) return 'A';
  if (score >= 600) return 'B';
  if (score >= 300) return 'C';
  return 'D';
}
