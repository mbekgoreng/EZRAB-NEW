/**
 * ArcadeReversi — Othello 8x8 vs AI SEDANG.
 * AI: minimax alpha-beta depth 3 + bobot posisi & mobilitas + jitter acak
 * (20% pilih langkah sub-optimal) -> bisa dikalahkan pemain teliti.
 */
export const N = 8;
export type Cell = 0 | 1 | 2; // 0 kosong, 1 hitam (pemain), 2 putih (AI)
export type Board = Cell[][];

export interface Move { r: number; c: number; flips: [number, number][] }

const DIRS: [number, number][] = [
  [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1],
];

// Bobot posisi klasik: sudut mahal, kotak sekitar sudut berbahaya.
const POS_W = [
  [120, -20, 20, 5, 5, 20, -20, 120],
  [-20, -40, -5, -5, -5, -5, -40, -20],
  [20, -5, 15, 3, 3, 15, -5, 20],
  [5, -5, 3, 3, 3, 3, -5, 5],
  [5, -5, 3, 3, 3, 3, -5, 5],
  [20, -5, 15, 3, 3, 15, -5, 20],
  [-20, -40, -5, -5, -5, -5, -40, -20],
  [120, -20, 20, 5, 5, 20, -20, 120],
];

export const BLACK: Cell = 1;
export const WHITE: Cell = 2;

export function emptyBoard(): Board {
  const b: Board = [];
  for (let r = 0; r < N; r += 1) b.push(new Array<Cell>(N).fill(0));
  b[3][3] = WHITE; b[3][4] = BLACK;
  b[4][3] = BLACK; b[4][4] = WHITE;
  return b;
}

export function clone(b: Board): Board {
  return b.map((row) => [...row]);
}

function flipsFor(b: Board, r: number, c: number, who: Cell): [number, number][] {
  const out: [number, number][] = [];
  const opp: Cell = who === BLACK ? WHITE : BLACK;
  for (const [dr, dc] of DIRS) {
    const line: [number, number][] = [];
    let rr = r + dr; let cc = c + dc;
    while (rr >= 0 && rr < N && cc >= 0 && cc < N && b[rr][cc] === opp) {
      line.push([rr, cc]);
      rr += dr; cc += dc;
    }
    if (line.length > 0 && rr >= 0 && rr < N && cc >= 0 && cc < N && b[rr][cc] === who) {
      out.push(...line);
    }
  }
  return out;
}

export function legalMoves(b: Board, who: Cell): Move[] {
  const moves: Move[] = [];
  for (let r = 0; r < N; r += 1) {
    for (let c = 0; c < N; c += 1) {
      if (b[r][c] !== 0) continue;
      const flips = flipsFor(b, r, c, who);
      if (flips.length > 0) moves.push({ r, c, flips });
    }
  }
  return moves;
}

export function applyMove(b: Board, m: Move, who: Cell): Board {
  const nb = clone(b);
  nb[m.r][m.c] = who;
  for (const [r, c] of m.flips) nb[r][c] = who;
  return nb;
}

export function count(b: Board): { black: number; white: number } {
  let black = 0; let white = 0;
  for (const row of b) for (const v of row) {
    if (v === BLACK) black += 1;
    else if (v === WHITE) white += 1;
  }
  return { black, white };
}

export function isGameOver(b: Board): boolean {
  return legalMoves(b, BLACK).length === 0 && legalMoves(b, WHITE).length === 0;
}

function evaluate(b: Board, who: Cell): number {
  const opp: Cell = who === BLACK ? WHITE : BLACK;
  let pos = 0; let mine = 0; let theirs = 0;
  for (let r = 0; r < N; r += 1) {
    for (let c = 0; c < N; c += 1) {
      if (b[r][c] === who) { pos += POS_W[r][c]; mine += 1; }
      else if (b[r][c] === opp) { pos -= POS_W[r][c]; theirs += 1; }
    }
  }
  const mob = legalMoves(b, who).length - legalMoves(b, opp).length;
  return pos + mob * 12 + (mine - theirs) * 2;
}

function minimax(
  b: Board, depth: number, alpha: number, beta: number,
  maximizing: boolean, ai: Cell, rng: () => number,
): number {
  const human: Cell = ai === BLACK ? WHITE : BLACK;
  const turn = maximizing ? ai : human;
  const moves = legalMoves(b, turn);
  if (depth === 0 || moves.length === 0) {
    if (moves.length === 0 && depth > 0) {
      // pass: giliran lawan
      const om = legalMoves(b, turn === ai ? human : ai);
      if (om.length === 0) {
        const { black, white } = count(b);
        const diff = ai === BLACK ? black - white : white - black;
        return diff > 0 ? 100000 + diff : diff < 0 ? -100000 + diff : 0;
      }
      return minimax(b, depth - 1, alpha, beta, !maximizing, ai, rng);
    }
    return evaluate(b, ai) + rng() * 4; // jitter kecil anti-deterministik
  }
  if (maximizing) {
    let best = -Infinity;
    for (const m of moves) {
      const v = minimax(applyMove(b, m, turn), depth - 1, alpha, beta, false, ai, rng);
      best = Math.max(best, v);
      alpha = Math.max(alpha, v);
      if (beta <= alpha) break;
    }
    return best;
  }
  let best = Infinity;
  for (const m of moves) {
    const v = minimax(applyMove(b, m, turn), depth - 1, alpha, beta, true, ai, rng);
    best = Math.min(best, v);
    beta = Math.min(beta, v);
    if (beta <= alpha) break;
  }
  return best;
}

export interface AiPick { move: Move | null; value: number }

/** AI SEDANG: depth 3, 20% ambil langkah peringkat-2/3 (bisa dikalahkan). */
export function aiPickMove(b: Board, ai: Cell, rng: () => number): AiPick {
  const moves = legalMoves(b, ai);
  if (moves.length === 0) return { move: null, value: 0 };
  const scored = moves.map((m) => ({
    m,
    v: minimax(applyMove(b, m, ai), 2, -Infinity, Infinity, false, ai, rng),
  }));
  scored.sort((a, z) => z.v - a.v);
  if (rng() < 0.2 && scored.length > 1) {
    const idx = 1 + ((rng() * Math.min(3, scored.length - 1)) | 0);
    return { move: scored[idx].m, value: scored[idx].v };
  }
  return { move: scored[0].m, value: scored[0].v };
}

export const POS_W_EXPORT = POS_W;
