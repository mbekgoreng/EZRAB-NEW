/**
 * Bata vs Semen — tic-tac-toe 3x3. Pure logic (no DOM).
 * Pemain = Bata (X), AI = Semen (O). AI "sedang": minimax tapi kadang
 * iseng pilih langkah acak supaya bisa dikalahkan.
 */

export type Mark = 'X' | 'O';
export type Cell = Mark | null;
export type Board = Cell[]; // 9 sel, index 0..8

export const LINES: number[][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // baris
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // kolom
  [0, 4, 8], [2, 4, 6],            // diagonal
];

export const emptyBoard = (): Board => Array<Cell>(9).fill(null);

export function winner(b: Board): { mark: Mark; line: number[] } | null {
  for (const line of LINES) {
    const [a, c, d] = line;
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return { mark: b[a] as Mark, line };
  }
  return null;
}

export const isFull = (b: Board): boolean => b.every((c) => c !== null);

export const freeCells = (b: Board): number[] => {
  const out: number[] = [];
  b.forEach((c, i) => { if (c === null) out.push(i); });
  return out;
};

export function place(b: Board, i: number, m: Mark): Board | null {
  if (i < 0 || i > 8 || b[i] !== null) return null;
  const next = [...b];
  next[i] = m;
  return next;
}

/** Skor minimax dari sudut pandang O (AI): +10 menang, -10 kalah, 0 seri. */
function minimax(b: Board, turn: Mark, depth: number, alpha: number, beta: number): number {
  const w = winner(b);
  if (w) return w.mark === 'O' ? 10 - depth : depth - 10;
  if (isFull(b)) return 0;
  if (turn === 'O') {
    let best = -Infinity;
    for (const i of freeCells(b)) {
      const nb = place(b, i, 'O') as Board;
      best = Math.max(best, minimax(nb, 'X', depth + 1, alpha, beta));
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }
  let best = Infinity;
  for (const i of freeCells(b)) {
    const nb = place(b, i, 'X') as Board;
    best = Math.min(best, minimax(nb, 'O', depth + 1, alpha, beta));
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

/**
 * Langkah AI "sedang": peluang `blunder` (default 0.35) pilih sel acak,
 * selebihnya langkah minimax terbaik. Selalu bisa dikalahkan.
 */
export function aiMove(b: Board, rng: () => number = Math.random, blunder = 0.35): number {
  const free = freeCells(b);
  if (free.length === 0) return -1;
  if (rng() < blunder) return free[(rng() * free.length) | 0];
  let bestScore = -Infinity;
  let bestIdx = free[0];
  for (const i of free) {
    const nb = place(b, i, 'O') as Board;
    const sc = minimax(nb, 'X', 0, -Infinity, Infinity);
    if (sc > bestScore) { bestScore = sc; bestIdx = i; }
  }
  return bestIdx;
}

/** Urutan langkah tengah-dulu untuk variasi pembuka AI. */
export function aiOpening(b: Board, rng: () => number = Math.random): number {
  if (freeCells(b).length === 9) {
    const pref = [4, 0, 2, 6, 8];
    return pref[(rng() * pref.length) | 0];
  }
  return aiMove(b, rng);
}
