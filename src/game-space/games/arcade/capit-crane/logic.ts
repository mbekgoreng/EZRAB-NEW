/**
 * ArcadeCapitCrane ("Capit Material") — pure logic.
 * Crane proyek mengayun otomatis; pemain menekan tombol untuk menurunkan capit,
 * mencapit material, lalu mengantarnya ke gudang. Tiap material punya poin.
 */

export type ItemKind = 'helm' | 'bata' | 'pipa' | 'semen' | 'kunci-emas';

export interface ItemDef {
  emoji: string;
  name: string;
  points: number;
  weight: number; // bobot spawn
}

export const ITEM_DEFS: Record<ItemKind, ItemDef> = {
  helm: { emoji: '⛑️', name: 'Helm Proyek', points: 50, weight: 30 },
  bata: { emoji: '🧱', name: 'Bata Merah', points: 20, weight: 35 },
  pipa: { emoji: '🔩', name: 'Pipa Besi', points: 40, weight: 20 },
  semen: { emoji: '🧺', name: 'Sak Semen', points: 30, weight: 12 },
  'kunci-emas': { emoji: '🔑', name: 'Kunci Gudang Mandor', points: 150, weight: 3 },
};

export type CranePhase = 'sweep' | 'descend' | 'grab-check' | 'ascend' | 'carry' | 'drop';

export interface CraneItem {
  id: number;
  kind: ItemKind;
  x: number; // posisi di conveyor
}

export const GAME_DURATION = 60; // detik
export const TROLLEY_MIN = 0.12; // fraksi lebar
export const TROLLEY_MAX = 0.88;
export const SWEEP_PERIOD = 3.4; // detik satu ayunan penuh
export const DROP_X_FRAC = 0.88; // posisi gudang (fraksi lebar)
export const GRAB_RADIUS = 40; // px toleransi capit

/** Posisi troli (fraksi 0..1) dari waktu — gerak bolak-balik sinus. */
export function trolleyAt(t: number): number {
  const mid = (TROLLEY_MIN + TROLLEY_MAX) / 2;
  const amp = (TROLLEY_MAX - TROLLEY_MIN) / 2;
  return mid + amp * Math.sin((t / SWEEP_PERIOD) * Math.PI * 2);
}

/** Sudut ayunan capit (radian) — pendulum sederhana + goyangan. */
export function swayAt(t: number): number {
  return 0.16 * Math.sin(t * 2.3) + 0.05 * Math.sin(t * 5.1);
}

/** Kecepatan turun capit (px/detik), makin cepat seiring waktu. */
export function descendSpeed(elapsed: number): number {
  const d = Math.min(1, elapsed / GAME_DURATION);
  return 260 + d * 140;
}

/** Pilih jenis item dari bobot. */
export function pickKind(rng: () => number): ItemKind {
  const kinds = Object.keys(ITEM_DEFS) as ItemKind[];
  const total = kinds.reduce((a, k) => a + ITEM_DEFS[k].weight, 0);
  let roll = rng() * total;
  for (const k of kinds) {
    roll -= ITEM_DEFS[k].weight;
    if (roll <= 0) return k;
  }
  return 'bata';
}

/** Spawn item di conveyor: posisi x acak dalam area main. */
export function spawnItem(rng: () => number, id: number, minX: number, maxX: number): CraneItem {
  return { id, kind: pickKind(rng), x: minX + rng() * (maxX - minX) };
}

/**
 * Cek capit: kembalikan item yang kena capit (terdekat dalam radius),
 * atau null bila meleset.
 */
export function grabCheck(clawX: number, clawY: number, items: CraneItem[], itemY: number): CraneItem | null {
  let best: CraneItem | null = null;
  let bestD = GRAB_RADIUS;
  for (const it of items) {
    const d = Math.hypot(it.x - clawX, itemY - clawY);
    if (d < bestD) { bestD = d; best = it; }
  }
  return best;
}

/** Poin untuk satu capit sukses. */
export function scoreFor(kind: ItemKind): number {
  return ITEM_DEFS[kind].points;
}

/** Bonus kombo: capit beruntun tanpa meleset. */
export function comboBonus(streak: number): number {
  if (streak < 3) return 0;
  return Math.min(100, (streak - 2) * 15);
}
