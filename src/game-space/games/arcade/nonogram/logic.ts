/**
 * ArcadeNonogram ("Bongkar Gambar: Piksel Proyek") — pure logic.
 * Pemain mengungkap pixel-art alat proyek (palu, helm, tower crane) dari
 * petunjuk baris/kolom. Sel yang diisi salah = kesalahan mandor.
 */

export type CellMark = 0 | 1 | 2; // 0 kosong, 1 terisi, 2 silang

export interface NonogramPuzzle {
  id: string;
  name: string;
  emoji: string;
  difficulty: string;
  grid: string[]; // 10 string, masing-masing 10 char '0'/'1'
}

const PALU = [
  '0000000000',
  '0001111000',
  '0001111000',
  '0000110000',
  '0000110000',
  '0000110000',
  '0000110000',
  '0000110000',
  '0001111000',
  '0001111000',
];

const HELM = [
  '0000000000',
  '0000110000',
  '0001111000',
  '0011111100',
  '0011111100',
  '0111111110',
  '0111111110',
  '1111111111',
  '0000000000',
  '0000000000',
];

const CRANE = [
  '0000000000',
  '0000010000',
  '0000110000',
  '0001110000',
  '1111111111',
  '0000110001',
  '0001110001',
  '0001110001',
  '0001110011',
  '0011111100',
];

export const PUZZLES: NonogramPuzzle[] = [
  { id: 'palu', name: 'Palu Godam', emoji: '🔨', difficulty: 'Mudah', grid: PALU },
  { id: 'helm', name: 'Helm Proyek', emoji: '⛑️', difficulty: 'Sedang', grid: HELM },
  { id: 'crane', name: 'Tower Crane', emoji: '🏗️', difficulty: 'Sulit', grid: CRANE },
];

export interface Clues {
  rows: number[][];
  cols: number[][];
}

/** Petunjuk untuk satu baris/kolom: panjang run sel '1' berurutan. */
export function lineClue(line: string): number[] {
  const runs: number[] = [];
  let cur = 0;
  for (const ch of line) {
    if (ch === '1') cur += 1;
    else {
      if (cur > 0) { runs.push(cur); cur = 0; }
    }
  }
  if (cur > 0) runs.push(cur);
  return runs;
}

/** Hitung petunjuk baris & kolom dari grid. */
export function computeClues(grid: string[]): Clues {
  const rows = grid.map(lineClue);
  const cols: number[][] = [];
  for (let c = 0; c < grid[0].length; c += 1) {
    let line = '';
    for (let r = 0; r < grid.length; r += 1) line += grid[r][c];
    cols.push(lineClue(line));
  }
  return { rows, cols };
}

/** true bila sel (r,c) seharusnya terisi di solusi. */
export function solutionAt(grid: string[], r: number, c: number): boolean {
  return grid[r][c] === '1';
}

/**
 * Apakah papan sudah benar: semua sel solusi terisi, dan tidak ada sel
 * terisi di luar solusi.
 */
export function checkWin(grid: string[], marks: CellMark[][]): boolean {
  for (let r = 0; r < grid.length; r += 1) {
    for (let c = 0; c < grid[r].length; c += 1) {
      const should = solutionAt(grid, r, c);
      const filled = marks[r][c] === 1;
      if (should !== filled) return false;
    }
  }
  return true;
}

/** Papan kosong 10×10. */
export function emptyMarks(size = 10): CellMark[][] {
  return Array.from({ length: size }, () => Array<CellMark>(size).fill(0));
}

/** Skor: makin sedikit salah & makin cepat makin tinggi (min 100). */
export function scoreFor(mistakes: number, hints: number, seconds: number): number {
  const raw = 1000 - mistakes * 100 - hints * 60 - Math.floor(seconds) * 2;
  return Math.max(100, raw);
}

/**
 * Cari satu sel solusi yang belum terisi (untuk tombol "Bocoran").
 * Mengembalikan null bila tidak ada.
 */
export function findHintCell(grid: string[], marks: CellMark[][]): { r: number; c: number } | null {
  const cand: { r: number; c: number }[] = [];
  for (let r = 0; r < grid.length; r += 1) {
    for (let c = 0; c < grid[r].length; c += 1) {
      if (solutionAt(grid, r, c) && marks[r][c] !== 1) cand.push({ r, c });
    }
  }
  if (cand.length === 0) return null;
  return cand[Math.floor(Math.random() * cand.length)];
}

/** Apakah baris r sudah lengkap sesuai solusi. */
export function rowComplete(grid: string[], marks: CellMark[][], r: number): boolean {
  for (let c = 0; c < grid[r].length; c += 1) {
    if (solutionAt(grid, r, c) !== (marks[r][c] === 1)) return false;
  }
  return true;
}

/** Apakah kolom c sudah lengkap sesuai solusi. */
export function colComplete(grid: string[], marks: CellMark[][], c: number): boolean {
  for (let r = 0; r < grid.length; r += 1) {
    if (solutionAt(grid, r, c) !== (marks[r][c] === 1)) return false;
  }
  return true;
}
