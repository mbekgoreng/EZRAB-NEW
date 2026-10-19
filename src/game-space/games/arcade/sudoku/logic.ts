/**
 * ArcadeSudoku — "Sudoku Material".
 * Sel berisi IKON material proyek (bukan angka): tiap ikon = 1..9.
 * Generator solusi-unik via backtracking + penghapusan dengan uji
 * keunikan. 4 difficulty, notes, hint. Pure logic.
 */

export const SIZE = 9;
export const CELLS = 81;

export interface Material {
  ikon: string;
  nama: string;
}

/** Indeks 1..9 → material. Indeks 0 = kosong. */
export const MATERIALS: Material[] = [
  { ikon: '', nama: '' },
  { ikon: '🧱', nama: 'Bata' },
  { ikon: '🪵', nama: 'Kayu' },
  { ikon: '🔩', nama: 'Besi' },
  { ikon: '🪨', nama: 'Batu' },
  { ikon: '🪟', nama: 'Kaca' },
  { ikon: '🎨', nama: 'Cat' },
  { ikon: '⛓️', nama: 'Kawat' },
  { ikon: '🚰', nama: 'Pipa' },
  { ikon: '🛢️', nama: 'Aspal' },
];

export type Difficulty = 'mudah' | 'sedang' | 'sulit' | 'ekstrem';

export const DIFFICULTY_INFO: Record<
  Difficulty,
  { label: string; givens: number; desc: string }
> = {
  mudah: { label: 'Mudah', givens: 44, desc: 'Buat pemanasan ala mandor' },
  sedang: { label: 'Sedang', givens: 38, desc: 'Standar tukang berpengalaman' },
  sulit: { label: 'Sulit', givens: 32, desc: 'Butuh kopi + konsentrasi' },
  ekstrem: { label: 'Ekstrem', givens: 26, desc: 'Level konsultan begadang' },
};

export const DIFFICULTIES: Difficulty[] = ['mudah', 'sedang', 'sulit', 'ekstrem'];

/** 0 = kosong. */
export type Grid = number[];

export function emptyGrid(): Grid {
  return new Array(CELLS).fill(0);
}

function shuffled<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function peers(idx: number): number[] {
  const r = Math.floor(idx / 9);
  const c = idx % 9;
  const set = new Set<number>();
  for (let k = 0; k < 9; k += 1) {
    set.add(r * 9 + k);
    set.add(k * 9 + c);
  }
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let dr = 0; dr < 3; dr += 1) {
    for (let dc = 0; dc < 3; dc += 1) set.add((br + dr) * 9 + (bc + dc));
  }
  set.delete(idx);
  return [...set];
}

/** Apakah `val` boleh di idx (aturan sudoku)? */
export function isValidPlacement(grid: Grid, idx: number, val: number): boolean {
  if (val < 1 || val > 9) return false;
  for (const p of peers(idx)) {
    if (grid[p] === val) return false;
  }
  return true;
}

/**
 * Hitung solusi (dibatasi `limit`). Mengembalikan jumlah solusi
 * yang ditemukan (maks `limit`).
 */
export function countSolutions(grid: Grid, limit = 2, rng?: () => number): number {
  const g = grid.slice();
  let count = 0;

  // MRV: pilih sel kosong dengan kandidat tersedikit
  function pickCell(): number {
    let best = -1;
    let bestCount = 10;
    for (let i = 0; i < CELLS; i += 1) {
      if (g[i] !== 0) continue;
      let n = 0;
      for (let v = 1; v <= 9; v += 1) {
        if (isValidPlacement(g, i, v)) n += 1;
      }
      if (n === 0) return -2; // buntu
      if (n < bestCount) {
        bestCount = n;
        best = i;
        if (n === 1) break;
      }
    }
    return best;
  }

  function solve(): void {
    if (count >= limit) return;
    const cell = pickCell();
    if (cell === -2) return;
    if (cell === -1) {
      count += 1;
      return;
    }
    const order = rng ? shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9], rng) : [1, 2, 3, 4, 5, 6, 7, 8, 9];
    for (const v of order) {
      if (!isValidPlacement(g, cell, v)) continue;
      g[cell] = v;
      solve();
      g[cell] = 0;
      if (count >= limit) return;
    }
  }

  solve();
  return count;
}

/** Bangun solusi penuh acak. */
export function generateSolution(rng: () => number): Grid {
  const sol = emptyGrid();
  const gg = emptyGrid();
  function pickCell(): number {
    for (let i = 0; i < CELLS; i += 1) if (gg[i] === 0) return i;
    return -1;
  }
  function solve(): boolean {
    const cell = pickCell();
    if (cell === -1) {
      for (let i = 0; i < CELLS; i += 1) sol[i] = gg[i];
      return true;
    }
    for (const v of shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9], rng)) {
      if (!isValidPlacement(gg, cell, v)) continue;
      gg[cell] = v;
      if (solve()) return true;
      gg[cell] = 0;
    }
    return false;
  }
  solve();
  return sol;
}

export interface Puzzle {
  puzzle: Grid; // 0 = kosong (soal)
  solution: Grid;
  givens: number;
  difficulty: Difficulty;
}

/**
 * Hapus sel satu per satu (urutan acak); tiap penghapusan diuji
 * keunikannya. Berhenti saat givens tercapai atau tak bisa lagi.
 */
export function generatePuzzle(rng: () => number, difficulty: Difficulty): Puzzle {
  const solution = generateSolution(rng);
  const puzzle = solution.slice();
  const target = DIFFICULTY_INFO[difficulty].givens;
  const order = shuffled([...Array(CELLS).keys()], rng);
  for (const idx of order) {
    const givensNow = puzzle.filter((v) => v !== 0).length;
    if (givensNow <= target) break;
    const backup = puzzle[idx];
    puzzle[idx] = 0;
    if (countSolutions(puzzle, 2) !== 1) {
      puzzle[idx] = backup; // kembalikan — solusi jadi ganda
    }
  }
  return {
    puzzle,
    solution,
    givens: puzzle.filter((v) => v !== 0).length,
    difficulty,
  };
}

/** Validasi grid penuh: tiap baris/kolom/box berisi 1..9 tepat sekali. */
export function isCompleteValid(grid: Grid): boolean {
  for (let i = 0; i < CELLS; i += 1) {
    if (grid[i] < 1 || grid[i] > 9) return false;
  }
  for (let i = 0; i < CELLS; i += 1) {
    const v = grid[i];
    for (const p of peers(i)) {
      if (p > i && grid[p] === v) return false;
    }
  }
  return true;
}

/** Konflik untuk sel idx (peer dengan nilai sama, bukan dirinya). */
export function conflictsAt(grid: Grid, idx: number): number[] {
  const v = grid[idx];
  if (v === 0) return [];
  return peers(idx).filter((p) => grid[p] === v);
}

export interface Hint {
  idx: number;
  value: number;
}

/** Hint: sel kosong/salah pertama (urutan acak) → nilai solusi. */
export function findHint(
  grid: Grid, solution: Grid, rng: () => number,
): Hint | null {
  const bad: number[] = [];
  for (let i = 0; i < CELLS; i += 1) {
    if (grid[i] !== solution[i]) bad.push(i);
  }
  if (bad.length === 0) return null;
  const idx = bad[Math.floor(rng() * bad.length)];
  return { idx, value: solution[idx] };
}

/** Format detik → "m:ss". */
export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
