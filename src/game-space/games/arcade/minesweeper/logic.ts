/**
 * Cari Pipa Bocor — minesweeper bertema proyek. Pure logic (no DOM).
 *
 * Petak berisi "pipa bocor" (bukan ranjau). Angka = jumlah pipa bocor
 * di 8 petak sekitarnya ("tekanan rembesan"). Klik pertama selalu aman.
 * Tandai dugaan pipa dengan "katup" (flag).
 */

export type Diff = 'mudah' | 'sedang' | 'sulit';

export interface DiffSpec {
  w: number;
  h: number;
  pipes: number;
  label: string;
  desc: string;
}

export const DIFFS: Record<Diff, DiffSpec> = {
  mudah: { w: 9, h: 9, pipes: 10, label: 'Rumah', desc: '9×9, 10 pipa bocor' },
  sedang: { w: 16, h: 16, pipes: 40, label: 'Ruko', desc: '16×16, 40 pipa bocor' },
  sulit: { w: 30, h: 16, pipes: 99, label: 'Gedung', desc: '30×16, 99 pipa bocor' },
};

export type Rng = () => number;

export interface Cell {
  pipe: boolean;
  open: boolean;
  flag: boolean;
  n: number; // pipa bocor di sekitar
}

export type Board = Cell[][];

export function emptyBoard(w: number, h: number): Board {
  return Array.from({ length: h }, () =>
    Array.from({ length: w }, () => ({ pipe: false, open: false, flag: false, n: 0 })),
  );
}

const DIRS = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0],           [1, 0],
  [-1, 1],  [0, 1],  [1, 1],
];

function neighbors(b: Board, x: number, y: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const [dx, dy] of DIRS) {
    const nx = x + dx;
    const ny = y + dy;
    if (ny >= 0 && ny < b.length && nx >= 0 && nx < b[0].length) out.push([nx, ny]);
  }
  return out;
}

/**
 * Buat papan; pipa dipasang SETELAH klik pertama (sx, sy) agar klik
 * pertama selalu aman (zona 3×3 di sekitarnya bebas pipa).
 */
export function createBoard(w: number, h: number, pipes: number, sx: number, sy: number, rng: Rng = Math.random): Board {
  const b = emptyBoard(w, h);
  const safe = new Set<string>();
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const nx = sx + dx;
      const ny = sy + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) safe.add(`${nx},${ny}`);
    }
  }
  const spots: Array<[number, number]> = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!safe.has(`${x},${y}`)) spots.push([x, y]);
    }
  }
  // Fisher-Yates parsial
  const count = Math.min(pipes, spots.length);
  for (let i = 0; i < count; i += 1) {
    const j = i + ((rng() * (spots.length - i)) | 0);
    [spots[i], spots[j]] = [spots[j], spots[i]];
    const [px, py] = spots[i];
    b[py][px].pipe = true;
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      b[y][x].n = neighbors(b, x, y).filter(([nx, ny]) => b[ny][nx].pipe).length;
    }
  }
  return b;
}

export interface OpenResult {
  hitPipe: boolean;
  opened: number; // petak baru yang terbuka
}

/** Buka petak; flood-fill bila n === 0. Kembalikan salinan papan baru. */
export function openCell(prev: Board, x: number, y: number): { board: Board; result: OpenResult } {
  const board = prev.map((row) => row.map((c) => ({ ...c })));
  const cell = board[y]?.[x];
  if (!cell || cell.open || cell.flag) return { board, result: { hitPipe: false, opened: 0 } };
  if (cell.pipe) {
    cell.open = true;
    return { board, result: { hitPipe: true, opened: 1 } };
  }
  let opened = 0;
  const stack: Array<[number, number]> = [[x, y]];
  while (stack.length > 0) {
    const [cx, cy] = stack.pop() as [number, number];
    const c = board[cy][cx];
    if (c.open || c.flag) continue;
    c.open = true;
    opened += 1;
    if (c.n === 0) {
      for (const [nx, ny] of neighbors(board, cx, cy)) {
        if (!board[ny][nx].open && !board[ny][nx].flag && !board[ny][nx].pipe) stack.push([nx, ny]);
      }
    }
  }
  return { board, result: { hitPipe: false, opened } };
}

/** Pasang/lepas katup (flag). */
export function toggleFlag(prev: Board, x: number, y: number): Board {
  const board = prev.map((row) => row.map((c) => ({ ...c })));
  const cell = board[y]?.[x];
  if (!cell || cell.open) return board;
  cell.flag = !cell.flag;
  return board;
}

/** Chord: klik angka yang katup sekitarnya sudah pas -> buka sisanya. */
export function chord(prev: Board, x: number, y: number): { board: Board; result: OpenResult } {
  const cell = prev[y]?.[x];
  if (!cell || !cell.open || cell.n === 0) return { board: prev, result: { hitPipe: false, opened: 0 } };
  const nbs = neighbors(prev, x, y);
  const flags = nbs.filter(([nx, ny]) => prev[ny][nx].flag).length;
  if (flags !== cell.n) return { board: prev, result: { hitPipe: false, opened: 0 } };
  let board = prev;
  let hitPipe = false;
  let opened = 0;
  for (const [nx, ny] of nbs) {
    const c = board[ny][nx];
    if (!c.open && !c.flag) {
      const r = openCell(board, nx, ny);
      board = r.board;
      hitPipe = hitPipe || r.result.hitPipe;
      opened += r.result.opened;
    }
  }
  return { board, result: { hitPipe, opened } };
}

/** Menang bila semua petak aman sudah terbuka. */
export function checkWin(board: Board): boolean {
  for (const row of board) {
    for (const c of row) {
      if (!c.pipe && !c.open) return false;
    }
  }
  return true;
}

export function countFlags(board: Board): number {
  let n = 0;
  for (const row of board) for (const c of row) if (c.flag) n += 1;
  return n;
}
