/**
 * Arcade2048 — "Cor 2048".
 * Gabungkan material proyek: Bata → … → Pencakar Langit (2048).
 * Pure logic: grid 4x4, geser+gabung, spawn, undo, menang/kalah.
 */

export const N = 4;

/** Tier 1..11. Nilai = 2^tier. */
export const TIERS = [
  { ikon: '🧱', nama: 'Bata' },
  { ikon: '🪨', nama: 'Batu Kali' },
  { ikon: '🪵', nama: 'Kayu' },
  { ikon: '🔩', nama: 'Besi' },
  { ikon: '🟧', nama: 'Hebel' },
  { ikon: '⬜', nama: 'Cor Beton' },
  { ikon: '🟥', nama: 'Dinding' },
  { ikon: '🪟', nama: 'Fasad Kaca' },
  { ikon: '🏠', nama: 'Rumah' },
  { ikon: '🏢', nama: 'Gedung' },
  { ikon: '🌆', nama: 'Pencakar Langit' },
] as const;

export const MAX_TIER = TIERS.length; // 11 → nilai 2048
export const WIN_VALUE = 2 ** MAX_TIER; // 2048

/** Warna dasar tiap tier (gradien dibuat di render). */
export const TIER_COLORS = [
  '#c96f4a', // bata
  '#8d99ae', // batu
  '#a4713c', // kayu
  '#6c757d', // besi
  '#e9a13b', // hebel
  '#b8c4ce', // cor
  '#d64545', // dinding
  '#4cc9f0', // fasad kaca
  '#80b918', // rumah
  '#3a86ff', // gedung
  '#ffbe0b', // pencakar langit
] as const;

export type Grid = number[][]; // nilai 0 = kosong, selain itu 2^tier

export type Dir = 'up' | 'down' | 'left' | 'right';

export const DIRS: Dir[] = ['up', 'down', 'left', 'right'];

export interface G2048 {
  grid: Grid;
  score: number;
  best: number;
  moves: number;
  over: boolean;
  won: boolean; // pernah mencapai 2048
  keepGoing: boolean; // lanjut setelah menang
  undoStack: Array<{ grid: Grid; score: number }>;
}

export function emptyGrid(): Grid {
  return Array.from({ length: N }, () => new Array(N).fill(0));
}

export function cloneGrid(g: Grid): Grid {
  return g.map((row) => row.slice());
}

function emptyCells(g: Grid): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let r = 0; r < N; r += 1) {
    for (let c = 0; c < N; c += 1) {
      if (g[r][c] === 0) out.push([r, c]);
    }
  }
  return out;
}

/** Munculkan 1 ubin (90% tier1, 10% tier2) di sel acak. */
export function spawnTile(g: Grid, rng: () => number): boolean {
  const cells = emptyCells(g);
  if (cells.length === 0) return false;
  const [r, c] = cells[Math.floor(rng() * cells.length)];
  g[r][c] = rng() < 0.9 ? 2 : 4;
  return true;
}

export function createGame(rng: () => number): G2048 {
  const grid = emptyGrid();
  spawnTile(grid, rng);
  spawnTile(grid, rng);
  return {
    grid,
    score: 0,
    best: 0,
    moves: 0,
    over: false,
    won: false,
    keepGoing: false,
    undoStack: [],
  };
}

/** Geser satu baris ke kiri + gabung. Kembalikan baris baru & skor gabungan. */
function slideRow(row: number[]): { row: number[]; gained: number; merges: number[] } {
  const vals = row.filter((v) => v !== 0);
  const out: number[] = [];
  const merges: number[] = []; // indeks hasil gabungan (untuk juice)
  let gained = 0;
  let i = 0;
  while (i < vals.length) {
    if (i + 1 < vals.length && vals[i] === vals[i + 1]) {
      const nv = vals[i] * 2;
      out.push(nv);
      merges.push(out.length - 1);
      gained += nv;
      i += 2;
    } else {
      out.push(vals[i]);
      i += 1;
    }
  }
  while (out.length < N) out.push(0);
  return { row: out, gained, merges };
}

export interface MoveResult {
  moved: boolean;
  gained: number;
  /** posisi (r,c) & tier hasil gabungan — untuk juice */
  mergedCells: Array<{ r: number; c: number; tier: number }>;
  spawned: boolean;
  won: boolean;
  over: boolean;
}

/** Satu langkah ke arah dir. Grid dimutasi; undo di-push bila bergerak. */
export function move(st: G2048, dir: Dir, rng: () => number): MoveResult {
  const res: MoveResult = {
    moved: false, gained: 0, mergedCells: [], spawned: false, won: false, over: false,
  };
  if (st.over) return res;

  // simpan untuk undo
  const prevGrid = cloneGrid(st.grid);
  const prevScore = st.score;

  let gained = 0;

  const applyRow = (r: number, get: (i: number) => number, set: (i: number, v: number) => void): void => {
    const line = [0, 1, 2, 3].map(get);
    const s = slideRow(line);
    gained += s.gained;
    for (let i = 0; i < N; i += 1) set(i, s.row[i]);
    void r;
  };

  if (dir === 'left') {
    for (let r = 0; r < N; r += 1) {
      applyRow(r, (i) => st.grid[r][i], (i, v) => { st.grid[r][i] = v; });
    }
  } else if (dir === 'right') {
    for (let r = 0; r < N; r += 1) {
      applyRow(r, (i) => st.grid[r][N - 1 - i], (i, v) => { st.grid[r][N - 1 - i] = v; });
    }
  } else if (dir === 'up') {
    for (let c = 0; c < N; c += 1) {
      applyRow(c, (i) => st.grid[i][c], (i, v) => { st.grid[i][c] = v; });
    }
  } else {
    for (let c = 0; c < N; c += 1) {
      applyRow(c, (i) => st.grid[N - 1 - i][c], (i, v) => { st.grid[N - 1 - i][c] = v; });
    }
  }

  // deteksi perubahan
  let moved = false;
  outer: for (let r = 0; r < N; r += 1) {
    for (let c = 0; c < N; c += 1) {
      if (st.grid[r][c] !== prevGrid[r][c]) {
        moved = true;
        break outer;
      }
    }
  }
  if (!moved) {
    return res; // tidak ada perubahan: tanpa spawn, tanpa undo
  }

  st.undoStack.push({ grid: prevGrid, score: prevScore });
  if (st.undoStack.length > 50) st.undoStack.shift();

  st.score += gained;
  st.moves += 1;
  res.moved = true;
  res.gained = gained;

  res.spawned = spawnTile(st.grid, rng);

  // catat sel gabungan untuk juice (nilai 2x lipat vs posisi yang sama sebelumnya)
  for (let r = 0; r < N; r += 1) {
    for (let c = 0; c < N; c += 1) {
      const v = st.grid[r][c];
      if (v > 0 && v !== prevGrid[r][c] && v === prevGrid[r][c] * 2) {
        res.mergedCells.push({ r, c, tier: Math.round(Math.log2(v)) });
      }
    }
  }

  if (!st.won && st.grid.some((row) => row.includes(WIN_VALUE))) {
    st.won = true;
    res.won = true;
  }
  if (!canMove(st.grid)) {
    st.over = true;
    res.over = true;
  }
  return res;
}

/** Apakah masih ada langkah legal? */
export function canMove(g: Grid): boolean {
  if (emptyCells(g).length > 0) return true;
  for (let r = 0; r < N; r += 1) {
    for (let c = 0; c < N; c += 1) {
      const v = g[r][c];
      if (c + 1 < N && g[r][c + 1] === v) return true;
      if (r + 1 < N && g[r + 1][c] === v) return true;
    }
  }
  return false;
}

export function undo(st: G2048): boolean {
  const prev = st.undoStack.pop();
  if (!prev) return false;
  st.grid = prev.grid;
  st.score = prev.score;
  st.over = false;
  return true;
}

export function tierOf(value: number): number {
  return value <= 0 ? 0 : Math.round(Math.log2(value));
}

export function tileName(value: number): string {
  const t = tierOf(value);
  return t >= 1 && t <= MAX_TIER ? TIERS[t - 1].nama : String(value);
}

export function tileIcon(value: number): string {
  const t = tierOf(value);
  return t >= 1 && t <= MAX_TIER ? TIERS[t - 1].ikon : '';
}
