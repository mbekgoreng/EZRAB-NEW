/**
 * ArcadeCheckers ("Dam Bata") — pure logic dam Inggris 8×8.
 * Bata merah (pemain) vs batako abu (AI). Wajib makan, promosi jadi Bata Raja.
 * AI "sedang": greedy + noise + kadang blunder → bisa dikalahkan.
 */

export type Side = 'merah' | 'abu';

export interface Piece {
  side: Side;
  king: boolean;
}

export type Board = (Piece | null)[][]; // 8×8, main di kotak gelap

export interface Step {
  to: [number, number];
  captured: [number, number] | null;
}

export interface Move {
  from: [number, number];
  steps: Step[];
  promote: boolean;
}

export const SIZE = 8;

export function other(side: Side): Side {
  return side === 'merah' ? 'abu' : 'merah';
}

export function inBoard(r: number, c: number): boolean {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

/** Papan awal: 3 baris per sisi di kotak gelap. */
export function initialBoard(): Board {
  const b: Board = Array.from({ length: SIZE }, () => Array<Piece | null>(SIZE).fill(null));
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if ((r + c) % 2 === 1) b[r][c] = { side: 'abu', king: false };
    }
  }
  for (let r = 5; r < 8; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if ((r + c) % 2 === 1) b[r][c] = { side: 'merah', king: false };
    }
  }
  return b;
}

function dirs(piece: Piece): Array<[number, number]> {
  if (piece.king) return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  return piece.side === 'merah' ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
}

function promoRow(side: Side): number {
  return side === 'merah' ? 0 : SIZE - 1;
}

/** Semua rangkaian makan (capture chains) dari posisi (r,c). */
function captureChains(
  board: Board,
  r: number,
  c: number,
  piece: Piece,
  path: Step[],
  out: Move[],
  from: [number, number],
): void {
  let extended = false;
  for (const [dr, dc] of dirs(piece)) {
    const mr = r + dr;
    const mc = c + dc;
    const tr = r + dr * 2;
    const tc = c + dc * 2;
    if (!inBoard(tr, tc) || board[tr][tc] !== null) continue;
    const mid = inBoard(mr, mc) ? board[mr][mc] : null;
    if (!mid || mid.side === piece.side) continue;
    extended = true;
    // simulasi makan
    board[tr][tc] = piece;
    board[r][c] = null;
    board[mr][mc] = null;
    const promoted = tr === promoRow(piece.side) && !piece.king;
    const step: Step = { to: [tr, tc], captured: [mr, mc] };
    if (promoted) {
      // promosi mengakhiri giliran (aturan Inggris)
      out.push({ from, steps: [...path, step], promote: true });
    } else {
      captureChains(board, tr, tc, piece, [...path, step], out, from);
    }
    // undo
    board[r][c] = piece;
    board[tr][tc] = null;
    board[mr][mc] = mid;
  }
  if (!extended && path.length > 0) {
    const last = path[path.length - 1].to;
    out.push({
      from,
      steps: path,
      promote: last[0] === promoRow(piece.side) && !piece.king,
    });
  }
}

/** Semua langkah legal; bila ada yang makan, HANYA yang makan (wajib makan). */
export function genMoves(board: Board, side: Side): Move[] {
  const captures: Move[] = [];
  const quiets: Move[] = [];
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const piece = board[r][c];
      if (!piece || piece.side !== side) continue;
      const chains: Move[] = [];
      captureChains(board, r, c, piece, [], chains, [r, c]);
      captures.push(...chains);
      if (chains.length === 0) {
        for (const [dr, dc] of dirs(piece)) {
          const tr = r + dr;
          const tc = c + dc;
          if (inBoard(tr, tc) && board[tr][tc] === null) {
            quiets.push({
              from: [r, c],
              steps: [{ to: [tr, tc], captured: null }],
              promote: tr === promoRow(side) && !piece.king,
            });
          }
        }
      }
    }
  }
  return captures.length > 0 ? captures : quiets;
}

/** Terapkan langkah → papan baru. */
export function applyMove(board: Board, move: Move): Board {
  const b = board.map((row) => row.map((p) => (p ? { ...p } : null)));
  const [fr, fc] = move.from;
  const piece = b[fr][fc] as Piece;
  b[fr][fc] = null;
  for (const st of move.steps) {
    if (st.captured) {
      const [cr, cc] = st.captured;
      b[cr][cc] = null;
    }
  }
  const [tr, tc] = move.steps[move.steps.length - 1].to;
  b[tr][tc] = move.promote ? { side: piece.side, king: true } : piece;
  return b;
}

/** Hitung bidak per sisi. */
export function countPieces(board: Board): Record<Side, { man: number; king: number }> {
  const out: Record<Side, { man: number; king: number }> = {
    merah: { man: 0, king: 0 },
    abu: { man: 0, king: 0 },
  };
  for (const row of board) {
    for (const p of row) {
      if (!p) continue;
      if (p.king) out[p.side].king += 1;
      else out[p.side].man += 1;
    }
  }
  return out;
}

/** Status permainan: 'jalan' | 'merah-menang' | 'abu-menang' | 'seri'. */
export function gameStatus(board: Board, turn: Side): 'jalan' | 'merah-menang' | 'abu-menang' | 'seri' {
  const cnt = countPieces(board);
  const me = cnt[turn].man + cnt[turn].king;
  const foe = cnt[other(turn)].man + cnt[other(turn)].king;
  if (me === 0) return turn === 'merah' ? 'abu-menang' : 'merah-menang';
  if (foe === 0) return turn === 'merah' ? 'merah-menang' : 'abu-menang';
  if (genMoves(board, turn).length === 0) {
    return turn === 'merah' ? 'abu-menang' : 'merah-menang';
  }
  return 'jalan';
}

interface Scored {
  move: Move;
  score: number;
}

function scoreMove(board: Board, move: Move, side: Side, rng: () => number): number {
  let s = rng() * 6; // noise
  const caps = move.steps.filter((st) => st.captured).length;
  s += caps * 14;
  if (move.promote) s += 20;
  const [tr] = move.steps[move.steps.length - 1].to;
  // dorong maju ke baris promosi
  const adv = side === 'abu' ? tr : SIZE - 1 - tr;
  s += adv * 1.2;
  // makan berantai disukai
  if (caps > 1) s += 8;
  return s;
}

/**
 * AI "sedang": 75% pilih langkah greedy terbaik, 25% langkah acak (blunder).
 * Cukup menantang tapi bisa dikalahkan.
 */
export function aiPickMove(board: Board, side: Side, rng: () => number): Move | null {
  const moves = genMoves(board, side);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];
  if (rng() < 0.25) {
    return moves[Math.floor(rng() * moves.length)];
  }
  let best: Scored | null = null;
  for (const m of moves) {
    const sc = scoreMove(board, m, side, rng);
    if (!best || sc > best.score) best = { move: m, score: sc };
  }
  return (best as Scored).move;
}
