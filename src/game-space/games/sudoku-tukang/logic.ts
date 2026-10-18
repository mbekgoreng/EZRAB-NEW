/**
 * Sudoku Tukang — pure game logic (no DOM, no window).
 * Seeded RNG: every function that needs randomness takes `rng: Rng`.
 */

export type Rng = () => number; // returns [0, 1)

export type Difficulty = 'gampang' | 'sedang' | 'sulit' | 'ahli';

/** Target clue counts per difficulty. */
export const CLUES: Record<Difficulty, number> = {
  gampang: 44,
  sedang: 36,
  sulit: 30,
  ahli: 26,
};

export const DIFF_LABEL: Record<Difficulty, string> = {
  gampang: 'Gampang',
  sedang: 'Sedang',
  sulit: 'Sulit',
  ahli: 'AHLI',
};

export const MAX_MISTAKES = 3;
export const MAX_HINTS = 3;

export type Grid = (number | null)[]; // length 81
export type FullGrid = number[]; // length 81, all 1..9

const N = 9;

const idx = (r: number, c: number): number => r * N + c;

function shuffled<T>(arr: readonly T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------------- solved grid generation ---------------- */

/**
 * Full valid solved grid via randomized backtracking.
 * Deterministic given the same rng sequence.
 */
export function generateSolved(rng: Rng): FullGrid {
  const grid: (number | null)[] = new Array(81).fill(null);

  const candidates = (i: number): number[] => {
    const r = Math.floor(i / N);
    const c = i % N;
    const used = new Set<number>();
    for (let k = 0; k < N; k += 1) {
      const a = grid[idx(r, k)];
      const b = grid[idx(k, c)];
      if (a !== null) used.add(a);
      if (b !== null) used.add(b);
    }
    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;
    for (let dr = 0; dr < 3; dr += 1) {
      for (let dc = 0; dc < 3; dc += 1) {
        const v = grid[idx(br + dr, bc + dc)];
        if (v !== null) used.add(v);
      }
    }
    return shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9].filter((v) => !used.has(v)), rng);
  };

  const solve = (i: number): boolean => {
    if (i >= 81) return true;
    for (const v of candidates(i)) {
      grid[i] = v;
      if (solve(i + 1)) return true;
      grid[i] = null;
    }
    return false;
  };

  if (!solve(0)) throw new Error('generateSolved: no solution found');
  return grid as FullGrid;
}

/* ---------------- solution counting (uniqueness check) ---------------- */

/**
 * Count solutions of a partial grid, stopping early at `limit`.
 * Uses MRV heuristic so uniqueness checks are fast.
 */
export function countSolutions(grid: Grid, limit = 2): number {
  const g = [...grid];
  let count = 0;

  const peers: number[][] = [];
  for (let i = 0; i < 81; i += 1) {
    const r = Math.floor(i / N);
    const c = i % N;
    const set = new Set<number>();
    for (let k = 0; k < N; k += 1) {
      set.add(idx(r, k));
      set.add(idx(k, c));
    }
    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;
    for (let dr = 0; dr < 3; dr += 1) {
      for (let dc = 0; dc < 3; dc += 1) set.add(idx(br + dr, bc + dc));
    }
    set.delete(i);
    peers.push([...set]);
  }

  const options = (i: number): number[] => {
    const used = new Set<number>();
    for (const p of peers[i]) {
      const v = g[p];
      if (v !== null) used.add(v);
    }
    const out: number[] = [];
    for (let v = 1; v <= 9; v += 1) if (!used.has(v)) out.push(v);
    return out;
  };

  const search = (): void => {
    if (count >= limit) return;
    // MRV: pick empty cell with fewest options
    let bestI = -1;
    let bestOpts: number[] = [];
    for (let i = 0; i < 81; i += 1) {
      if (g[i] !== null) continue;
      const opts = options(i);
      if (opts.length === 0) return; // dead end
      if (bestI === -1 || opts.length < bestOpts.length) {
        bestI = i;
        bestOpts = opts;
        if (opts.length === 1) break;
      }
    }
    if (bestI === -1) {
      count += 1; // full grid
      return;
    }
    for (const v of bestOpts) {
      g[bestI] = v;
      search();
      g[bestI] = null;
      if (count >= limit) return;
    }
  };

  search();
  return count;
}

/* ---------------- puzzle generation ---------------- */

export interface Puzzle {
  puzzle: Grid; // nulls = holes
  solution: FullGrid;
  clues: number;
}

/**
 * Dig holes from a solved grid while the solution stays unique.
 * Passes over remaining clue cells until the target clue count is hit,
 * a time budget expires, or no removable cell remains.
 */
export function generatePuzzle(
  diff: Difficulty,
  rng: Rng,
  timeBudgetMs = 1600,
): Puzzle {
  const target = CLUES[diff];
  const solution = generateSolved(rng);
  const puzzle: Grid = [...solution];
  let clues = 81;
  const start = Date.now();

  let candidates = shuffled(
    Array.from({ length: 81 }, (_, i) => i),
    rng,
  );

  let pass = 0;
  while (clues > target && pass < 8) {
    pass += 1;
    candidates = shuffled(candidates, rng);
    let removedThisPass = 0;
    for (const i of candidates) {
      if (clues <= target) break;
      if (Date.now() - start > timeBudgetMs) break;
      if (puzzle[i] === null) continue;
      const backup = puzzle[i];
      puzzle[i] = null;
      if (countSolutions(puzzle, 2) === 1) {
        clues -= 1;
        removedThisPass += 1;
      } else {
        puzzle[i] = backup;
      }
    }
    candidates = candidates.filter((i) => puzzle[i] !== null);
    if (removedThisPass === 0) break;
    if (Date.now() - start > timeBudgetMs) break;
  }

  return { puzzle, solution, clues };
}

/* ---------------- gameplay state ---------------- */

export interface SudokuState {
  puzzle: Grid;
  solution: FullGrid;
  user: (number | null)[];
  notes: number[][]; // per-cell note digits
  locked: boolean[];
  mistakes: number;
  hintsLeft: number;
  selected: number | null;
}

export function createState(
  puzzle: Grid,
  solution: FullGrid,
  hints = MAX_HINTS,
): SudokuState {
  return {
    puzzle: [...puzzle],
    solution: [...solution],
    user: new Array(81).fill(null),
    notes: Array.from({ length: 81 }, () => [] as number[]),
    locked: puzzle.map((v) => v !== null),
    mistakes: 0,
    hintsLeft: hints,
    selected: null,
  };
}

export interface SetResult {
  ok: boolean;
  mistake: boolean;
  gameOver: boolean;
}

/**
 * Place a digit. Returns ok=false for locked cells.
 * Wrong digit: recorded (shown red), mistakes++, gameOver at MAX_MISTAKES.
 */
export function setCellValue(
  state: SudokuState,
  index: number,
  value: number,
): SetResult {
  if (state.locked[index] || index < 0 || index > 80) {
    return { ok: false, mistake: false, gameOver: false };
  }
  if (value < 1 || value > 9) {
    return { ok: false, mistake: false, gameOver: false };
  }
  if (state.user[index] === value) {
    return { ok: true, mistake: false, gameOver: false };
  }
  state.user[index] = value;
  state.notes[index] = [];
  const mistake = value !== state.solution[index];
  if (mistake) {
    state.mistakes += 1;
  }
  return {
    ok: true,
    mistake,
    gameOver: mistake && state.mistakes >= MAX_MISTAKES,
  };
}

export function eraseCell(state: SudokuState, index: number): boolean {
  if (state.locked[index] || index < 0 || index > 80) return false;
  state.user[index] = null;
  state.notes[index] = [];
  return true;
}

/** Toggle a pencil-mark note digit on an unlocked, empty cell. */
export function toggleNote(state: SudokuState, index: number, value: number): boolean {
  if (state.locked[index] || index < 0 || index > 80) return false;
  if (value < 1 || value > 9) return false;
  if (state.user[index] !== null) return false;
  const arr = state.notes[index];
  const at = arr.indexOf(value);
  if (at >= 0) arr.splice(at, 1);
  else arr.push(value);
  return true;
}

/** Spend one hint: fill the first wrong/empty unlocked cell with the right digit. */
export function useHint(state: SudokuState): number | null {
  if (state.hintsLeft <= 0) return null;
  for (let i = 0; i < 81; i += 1) {
    if (state.locked[i]) continue;
    if (state.user[i] !== state.solution[i]) {
      state.user[i] = state.solution[i];
      state.notes[i] = [];
      state.hintsLeft -= 1;
      return i;
    }
  }
  return null;
}

/** True when every cell shows the solution digit. */
export function isComplete(state: SudokuState): boolean {
  for (let i = 0; i < 81; i += 1) {
    const v = state.locked[i] ? state.puzzle[i] : state.user[i];
    if (v !== state.solution[i]) return false;
  }
  return true;
}

/** Value shown in a cell: locked → puzzle digit, else user digit. */
export function cellValue(state: SudokuState, index: number): number | null {
  return state.locked[index] ? state.puzzle[index] : state.user[index];
}

/** Whether the currently entered digit in a cell is wrong (for red display). */
export function cellWrong(state: SudokuState, index: number): boolean {
  if (state.locked[index]) return false;
  const v = state.user[index];
  return v !== null && v !== state.solution[index];
}
