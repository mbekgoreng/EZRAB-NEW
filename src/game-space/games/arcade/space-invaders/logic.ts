/**
 * ArcadeSpaceInvaders ("Tembak Deadline") — pure logic.
 * Tembak tanggal-tanggal deadline & revisi yang berjatuhan dari atas
 * sebelum mencapai mejamu. Tameng = tumpukan RAB, nyawa 3.
 */

/** Label deadline per baris formasi (makin atas makin galak). */
export const DEADLINES = ['DL!', 'H-3', 'H-7', 'REV-2', 'REV-1'];

export interface WaveSpec {
  rows: number;
  cols: number;
  xSpeed: number; // px/detik formasi
  yDrop: number; // px turun tiap mentok tepi
  fireInterval: number; // detik antar tembakan musuh
  ufoInterval: number; // detik antar mandor lewat
}

export const MAX_LIVES = 3;

/** Spesifikasi gelombang: makin banyak & cepat tiap wave. */
export function waveSpec(wave: number): WaveSpec {
  return {
    rows: Math.min(5, 3 + Math.floor((wave - 1) / 2)),
    cols: 8,
    xSpeed: 34 + wave * 9,
    yDrop: 22,
    fireInterval: Math.max(0.5, 1.5 - wave * 0.14),
    ufoInterval: Math.max(9, 17 - wave),
  };
}

/** Poin per baris (0 = paling atas). */
export function scoreForRow(row: number): number {
  if (row === 0) return 30;
  if (row === 1) return 20;
  return 10;
}

export const UFO_SCORE = 200;

/** Kecepatan formasi naik saat jumlah deadline berkurang (efek klasik). */
export function speedFactor(alive: number, total: number): number {
  if (total <= 0) return 1;
  const r = alive / total;
  return 1 + (1 - r) * 1.6;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Tameng tumpukan RAB: grid boolean (true = kertas masih ada). */
export function makeShield(cols: number, rows: number): boolean[][] {
  return Array.from({ length: rows }, () => Array<boolean>(cols).fill(true));
}

/** Hancurkan lingkaran kertas di sekitar (px,py) dalam koordinat grid. */
export function erodeShield(shield: boolean[][], px: number, py: number, radius: number): void {
  for (let r = 0; r < shield.length; r += 1) {
    for (let c = 0; c < shield[0].length; c += 1) {
      const dx = c - px;
      const dy = r - py;
      if (dx * dx + dy * dy <= radius * radius) shield[r][c] = false;
    }
  }
}

/** Apakah tameng masih punya kertas? */
export function shieldAlive(shield: boolean[][]): boolean {
  return shield.some((row) => row.some((v) => v));
}

/* --- Gelombang 3: kejelasan bahaya & integritas tameng (murni) --- */

/** Bonus menyelesaikan satu wave (sebelumnya angka inline di komponen). */
export function waveBonus(wave: number): number {
  return 100 * wave;
}

export type DangerLevel = 'aman' | 'dekat' | 'kritis';

/**
 * Tingkat bahaya dari jarak tepi bawah formasi ke pemain:
 * >140px aman, 70..140 dekat, <70 kritis (peringatan tegas di layar).
 */
export function dangerLevel(formationBottomY: number, playerY: number): DangerLevel {
  const gap = playerY - formationBottomY;
  if (gap < 70) return 'kritis';
  if (gap < 140) return 'dekat';
  return 'aman';
}

/** Persentase kertas tameng yang masih utuh (0..100, dibulatkan). */
export function shieldPercent(shield: boolean[][]): number {
  let total = 0;
  let alive = 0;
  for (const row of shield) {
    for (const v of row) {
      total += 1;
      if (v) alive += 1;
    }
  }
  return total === 0 ? 0 : Math.round((alive / total) * 100);
}
