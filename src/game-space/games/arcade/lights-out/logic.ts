/**
 * ArcadeLightsOut ("Matikan Lampu Proyek") — pure logic.
 * Grid 5×5 lampu proyek; ketuk satu lampu menyalakan/mematikan dirinya
 * plus tetangga ortogonal. Matikan semua lampu = proyek hemat listrik!
 */

export const GRID = 5;
export const CELL_COUNT = GRID * GRID;

/** Indeks sel yang ikut berubah saat (r,c) diketuk: dirinya + tetangga. */
export function affected(r: number, c: number): number[] {
  const out: number[] = [r * GRID + c];
  if (r > 0) out.push((r - 1) * GRID + c);
  if (r < GRID - 1) out.push((r + 1) * GRID + c);
  if (c > 0) out.push(r * GRID + (c - 1));
  if (c < GRID - 1) out.push(r * GRID + (c + 1));
  return out;
}

/** Ketuk sel (r,c): toggle dirinya + tetangga. Mengembalikan state baru. */
export function toggle(board: boolean[], r: number, c: number): boolean[] {
  const next = board.slice();
  for (const i of affected(r, c)) next[i] = !next[i];
  return next;
}

/** true bila semua lampu mati. */
export function isSolved(board: boolean[]): boolean {
  return board.every((v) => !v);
}

/** Papan kosong (semua mati). */
export function emptyBoard(): boolean[] {
  return new Array(CELL_COUNT).fill(false);
}

/**
 * Acak papan dengan menerapkan N ketukan acak — selalu solvable karena
 * urutan ketukannya sendiri adalah solusi (ketuk 2× = batal).
 */
export function scramble(rng: () => number, presses: number): boolean[] {
  let board = emptyBoard();
  for (let i = 0; i < presses; i += 1) {
    const r = Math.floor(rng() * GRID);
    const c = Math.floor(rng() * GRID);
    board = toggle(board, r, c);
  }
  return board;
}

export interface Shift {
  id: string;
  name: string;
  emoji: string;
  presses: number; // jumlah ketukan acak
  hint: string;
}

export const SHIFTS: Shift[] = [
  { id: 'pagi', name: 'Shift Pagi', emoji: '🌅', presses: 4, hint: 'Pemanasan: sedikit lampu menyala.' },
  { id: 'siang', name: 'Shift Siang', emoji: '☀️', presses: 8, hint: 'Lembur: lumayan banyak yang menyala.' },
  { id: 'malam', name: 'Shift Malam', emoji: '🌙', presses: 12, hint: 'Proyek 24 jam: gelap-gelapan total!' },
];

/** Skor: dasar 1000 − 40/langkah − 3/detik, min 100. */
export function scoreFor(moves: number, seconds: number): number {
  return Math.max(100, 1000 - moves * 40 - Math.floor(seconds) * 3);
}
