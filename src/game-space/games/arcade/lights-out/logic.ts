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
  presses: number; // jumlah ketukan acak
  hint: string;
}

export const SHIFTS: Shift[] = [
  { id: 'pagi', name: 'Shift Pagi', presses: 4, hint: 'Pemanasan: sedikit lampu menyala.' },
  { id: 'siang', name: 'Shift Siang', presses: 8, hint: 'Lembur: lumayan banyak yang menyala.' },
  { id: 'malam', name: 'Shift Malam', presses: 12, hint: 'Proyek 24 jam: gelap-gelapan total!' },
];

/**
 * Rating bintang untuk papan yang SELESAI dimatikan.
 *
 * `parMoves` adalah par PENDEKATAN: jumlah ketukan acak (`presses` shift
 * aktif) yang membentuk papan lewat scramble. Urutan ketukan itu memang
 * salah satu solusi, tetapi ketukan acak bisa saling membatalkan / tumpang
 * tindih, jadi par ini BUKAN optimum yang terbukti — hanya patokan wajar.
 *
 * - belum selesai (`solved` = false) -> 0 bintang
 * - selesai & moves <= par -> 3
 * - selesai & moves <= ceil(par * 1,5) -> 2
 * - selesai di atas itu -> 1
 * Par tidak valid (<= 0 / bukan bilangan berhingga) saat selesai -> 1
 * (menyelesaikan papan tetap dihargai; tidak ada patokan untuk dinilai).
 */
export function starsFor(moves: number, parMoves: number, solved: boolean): number {
  if (!solved) return 0;
  if (!Number.isFinite(parMoves) || parMoves <= 0) return 1;
  if (moves <= parMoves) return 3;
  if (moves <= Math.ceil(parMoves * 1.5)) return 2;
  return 1;
}

/** Skor: dasar 1000 − 40/langkah − 3/detik, min 100. */
export function scoreFor(moves: number, seconds: number): number {
  return Math.max(100, 1000 - moves * 40 - Math.floor(seconds) * 3);
}
