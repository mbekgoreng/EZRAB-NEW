/**
 * ArcadeNonogram ("Bongkar Gambar: Piksel Proyek") — pure logic.
 * Pemain mengungkap pixel-art alat proyek (palu, helm, tower crane) dari
 * petunjuk baris/kolom. Sel yang diisi salah = kesalahan mandor.
 *
 * Ikon setiap puzzle BUKAN emoji: komponen menggambar pratinjau piksel-art
 * prosedural langsung dari `grid` puzzle itu sendiri.
 */

export type CellMark = 0 | 1 | 2; // 0 kosong, 1 terisi, 2 silang

export interface NonogramPuzzle {
  id: string;
  name: string;
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
  { id: 'palu', name: 'Palu Godam', difficulty: 'Mudah', grid: PALU },
  { id: 'helm', name: 'Helm Proyek', difficulty: 'Sedang', grid: HELM },
  { id: 'crane', name: 'Tower Crane', difficulty: 'Sulit', grid: CRANE },
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

/**
 * Panjang run sel TERISI (mark 1) berurutan dalam satu baris/kolom pemain.
 * Sel kosong (0) dan silang (2) sama-sama memisahkan run — persis cara
 * petunjuk dibaca dari grid solusi oleh lineClue().
 */
export function filledRuns(line: readonly CellMark[]): number[] {
  const runs: number[] = [];
  let cur = 0;
  for (const m of line) {
    if (m === 1) cur += 1;
    else {
      if (cur > 0) { runs.push(cur); cur = 0; }
    }
  }
  if (cur > 0) runs.push(cur);
  return runs;
}

/**
 * Umpan balik live inti nonogram: apakah petunjuk satu baris/kolom SUDAH
 * terpenuhi oleh pola isian pemain saat ini juga — tanpa membaca solusi.
 *
 * Terpenuhi bila run sel terisi pemain persis sama dengan angka petunjuk
 * (petunjuk [] terpenuhi bila belum ada isian sama sekali). Karena game ini
 * menolak isian di luar solusi (dihitung kesalahan, tidak ditempatkan),
 * pola yang cocok berarti baris/kolom itu memang selesai — jadi komponen
 * boleh mencoret & meredupkan angkanya segera, tidak menunggu baris penuh
 * disilang satu-satu. Fungsi ini murni pola: penempatan bergeser dengan
 * run yang sama tetap "satisfied" di sini, sedangkan rowComplete() yang
 * membaca solusi akan menolaknya.
 */
export function clueSatisfied(clue: readonly number[], line: readonly CellMark[]): boolean {
  const runs = filledRuns(line);
  if (runs.length !== clue.length) return false;
  return runs.every((n, i) => n === clue[i]);
}

/** clueSatisfied untuk baris r pada papan saat ini. */
export function rowClueSatisfied(grid: string[], marks: CellMark[][], r: number): boolean {
  return clueSatisfied(computeClues(grid).rows[r], marks[r]);
}

/** clueSatisfied untuk kolom c pada papan saat ini. */
export function colClueSatisfied(grid: string[], marks: CellMark[][], c: number): boolean {
  const line = marks.map((row) => row[c]);
  return clueSatisfied(computeClues(grid).cols[c], line);
}

/**
 * Keputusan tombol Escape terhadap layar saat ini: 'pause' | 'resume' | null.
 *
 * Regresi yang dijaga: keputusan ini dulu hidup di dalam update() game —
 * padahal Loop engine2d MELEWATI update() selama terjeda, sehingga cabang
 * 'resume' tidak pernah bisa tercapai dan Escape tidak bisa melanjutkan
 * permainan. Komponen kini memanggil fungsi murni ini dari listener
 * keydown window yang tetap hidup saat loop terjeda.
 */
export function pauseToggleFor(screen: string): 'pause' | 'resume' | null {
  if (screen === 'play') return 'pause';
  if (screen === 'pause') return 'resume';
  return null;
}
