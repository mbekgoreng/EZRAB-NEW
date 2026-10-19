/**
 * Catur Proyek — logika catur penuh (murni, tanpa DOM).
 *
 * Tema: buah = peran proyek (raja=Mandor, ratu=Arsitek, benteng=Tower Crane,
 * gajah=Surveyor, kuda=Truk, pion=Tukang). Aturan lengkap: legal move,
 * skak, skakmat, stalemate, rokade, en passant, promosi, 50-langkah,
 * material tak-cukup. AI: negamax + alpha-beta (depth 2-3, bisa dikalahkan).
 *
 * Papan: array 64, idx = r*8+c, r=0 adalah rank 8 (baris atas/hitam).
 */

export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export interface Piece {
  t: PieceType;
  c: Color;
}
export type Board = (Piece | null)[];

export interface Move {
  from: number;
  to: number;
  promo?: PieceType;
  castle?: 'K' | 'Q';
  ep?: boolean;
}

export interface State {
  board: Board;
  turn: Color;
  wk: boolean;
  wq: boolean;
  bk: boolean;
  bq: boolean;
  /** kotak target en-passant (kotak di belakang pion yg double-push), atau null */
  ep: number | null;
  half: number;
  full: number;
}

export const idx = (r: number, c: number): number => r * 8 + c;
export const rowOf = (i: number): number => Math.floor(i / 8);
export const colOf = (i: number): number => i % 8;
export const inB = (r: number, c: number): boolean => r >= 0 && r < 8 && c >= 0 && c < 8;
export const opp = (c: Color): Color => (c === 'w' ? 'b' : 'w');

const FILES = 'abcdefgh';
export const squareName = (i: number): string =>
  `${FILES[colOf(i)]}${8 - rowOf(i)}`;

/* ---------------- setup ---------------- */

/** Baris notasi: huruf besar = putih, kecil = hitam, '.' kosong. Baris 0 = rank 8. */
export function stateFromRows(rows: string[]): State {
  const board: Board = new Array(64).fill(null);
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const ch = rows[r][c];
      if (ch === '.') continue;
      const t = ch.toLowerCase() as PieceType;
      board[idx(r, c)] = { t, c: ch === ch.toUpperCase() ? 'w' : 'b' };
    }
  }
  return { board, turn: 'w', wk: true, wq: true, bk: true, bq: true, ep: null, half: 0, full: 1 };
}

export function startState(): State {
  return stateFromRows([
    'rnbqkbnr',
    'pppppppp',
    '........',
    '........',
    '........',
    '........',
    'PPPPPPPP',
    'RNBQKBNR',
  ]);
}

export function cloneState(s: State): State {
  return {
    board: s.board.map((p) => (p ? { ...p } : null)),
    turn: s.turn,
    wk: s.wk, wq: s.wq, bk: s.bk, bq: s.bq,
    ep: s.ep, half: s.half, full: s.full,
  };
}

/* ---------------- serangan ---------------- */

const KNIGHT_D = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING_D = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const STRAIGHT = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/** Apakah kotak sq diserang oleh warna `by`? */
export function isAttacked(bd: Board, sq: number, by: Color): boolean {
  const r = rowOf(sq);
  const c = colOf(sq);
  // pion: penyerang putih ada di r+1, hitam di r-1
  const pr = by === 'w' ? r + 1 : r - 1;
  for (const dc of [-1, 1]) {
    if (inB(pr, c + dc)) {
      const p = bd[idx(pr, c + dc)];
      if (p && p.c === by && p.t === 'p') return true;
    }
  }
  for (const [dr, dc] of KNIGHT_D) {
    if (!inB(r + dr, c + dc)) continue;
    const p = bd[idx(r + dr, c + dc)];
    if (p && p.c === by && p.t === 'n') return true;
  }
  for (const [dr, dc] of KING_D) {
    if (!inB(r + dr, c + dc)) continue;
    const p = bd[idx(r + dr, c + dc)];
    if (p && p.c === by && p.t === 'k') return true;
  }
  const slide = (dirs: number[][], types: PieceType[]): boolean => {
    for (const [dr, dc] of dirs) {
      let rr = r + dr;
      let cc = c + dc;
      while (inB(rr, cc)) {
        const p = bd[idx(rr, cc)];
        if (p) {
          if (p.c === by && types.includes(p.t)) return true;
          break;
        }
        rr += dr;
        cc += dc;
      }
    }
    return false;
  };
  if (slide(DIAG, ['b', 'q'])) return true;
  if (slide(STRAIGHT, ['r', 'q'])) return true;
  return false;
}

export function kingSquare(bd: Board, color: Color): number {
  for (let i = 0; i < 64; i += 1) {
    const p = bd[i];
    if (p && p.t === 'k' && p.c === color) return i;
  }
  return -1;
}

export function inCheck(s: State, color: Color): boolean {
  const k = kingSquare(s.board, color);
  return k >= 0 && isAttacked(s.board, k, opp(color));
}

/* ---------------- pembangkit langkah ---------------- */

/** Langkah pseudo-legal (belum disaring skak) dari kotak `from`. */
export function genMoves(s: State, from: number): Move[] {
  const bd = s.board;
  const p = bd[from];
  if (!p || p.c !== s.turn) return [];
  const moves: Move[] = [];
  const r = rowOf(from);
  const c = colOf(from);
  const push = (to: number, extra: Partial<Move> = {}): void => {
    const target = bd[to];
    if (!target || target.c !== p.c) moves.push({ from, to, ...extra });
  };
  const pushCaptureOnly = (to: number, extra: Partial<Move> = {}): boolean => {
    const target = bd[to];
    if (target && target.c !== p.c) {
      moves.push({ from, to, ...extra });
      return true;
    }
    return false;
  };

  if (p.t === 'p') {
    const dir = p.c === 'w' ? -1 : 1;
    const startR = p.c === 'w' ? 6 : 1;
    const promoR = p.c === 'w' ? 0 : 7;
    const oneR = r + dir;
    if (inB(oneR, c) && !bd[idx(oneR, c)]) {
      if (oneR === promoR) {
        for (const pr of ['q', 'r', 'b', 'n'] as PieceType[]) push(idx(oneR, c), { promo: pr });
      } else {
        push(idx(oneR, c));
        const twoR = r + 2 * dir;
        if (r === startR && !bd[idx(twoR, c)]) push(idx(twoR, c));
      }
    }
    for (const dc of [-1, 1]) {
      const cc = c + dc;
      if (!inB(oneR, cc)) continue;
      const to = idx(oneR, cc);
      if (oneR === promoR) {
        if (bd[to] && bd[to]!.c !== p.c) {
          for (const pr of ['q', 'r', 'b', 'n'] as PieceType[]) push(to, { promo: pr });
        }
      } else {
        pushCaptureOnly(to);
      }
      // en passant
      if (s.ep === to) moves.push({ from, to, ep: true });
    }
  } else if (p.t === 'n') {
    for (const [dr, dc] of KNIGHT_D) {
      if (inB(r + dr, c + dc)) push(idx(r + dr, c + dc));
    }
  } else if (p.t === 'k') {
    for (const [dr, dc] of KING_D) {
      if (inB(r + dr, c + dc)) push(idx(r + dr, c + dc));
    }
    // rokade
    const homeR = p.c === 'w' ? 7 : 0;
    const rightsK = p.c === 'w' ? s.wk : s.bk;
    const rightsQ = p.c === 'w' ? s.wq : s.bq;
    if (r === homeR && c === 4 && !inCheck(s, p.c)) {
      const enemy = opp(p.c);
      if (
        rightsK &&
        !bd[idx(homeR, 5)] && !bd[idx(homeR, 6)] &&
        !isAttacked(bd, idx(homeR, 5), enemy) &&
        !isAttacked(bd, idx(homeR, 6), enemy)
      ) {
        moves.push({ from, to: idx(homeR, 6), castle: 'K' });
      }
      if (
        rightsQ &&
        !bd[idx(homeR, 1)] && !bd[idx(homeR, 2)] && !bd[idx(homeR, 3)] &&
        !isAttacked(bd, idx(homeR, 3), enemy) &&
        !isAttacked(bd, idx(homeR, 2), enemy)
      ) {
        moves.push({ from, to: idx(homeR, 2), castle: 'Q' });
      }
    }
  } else {
    const dirs = p.t === 'b' ? DIAG : p.t === 'r' ? STRAIGHT : [...DIAG, ...STRAIGHT];
    for (const [dr, dc] of dirs) {
      let rr = r + dr;
      let cc = c + dc;
      while (inB(rr, cc)) {
        const to = idx(rr, cc);
        const target = bd[to];
        if (!target) {
          moves.push({ from, to });
        } else {
          if (target.c !== p.c) moves.push({ from, to });
          break;
        }
        rr += dr;
        cc += dc;
      }
    }
  }
  return moves;
}

/** Terapkan langkah -> State baru (murni). */
export function applyMove(s: State, m: Move): State {
  const ns = cloneState(s);
  const bd = ns.board;
  const piece = bd[m.from]!;
  const captured = bd[m.to] || (m.ep ? bd[idx(rowOf(m.from), colOf(m.to))] : null);
  // en passant: hapus pion yang dilewati
  if (m.ep) bd[idx(rowOf(m.from), colOf(m.to))] = null;
  bd[m.from] = null;
  bd[m.to] = { t: m.promo ?? piece.t, c: piece.c };
  // rokade: pindahkan benteng
  if (m.castle) {
    const homeR = piece.c === 'w' ? 7 : 0;
    if (m.castle === 'K') {
      bd[idx(homeR, 5)] = bd[idx(homeR, 7)];
      bd[idx(homeR, 7)] = null;
    } else {
      bd[idx(homeR, 3)] = bd[idx(homeR, 0)];
      bd[idx(homeR, 0)] = null;
    }
  }
  // hak rokade hilang
  const rookSq: Record<string, 'wk' | 'wq' | 'bk' | 'bq'> = {
    '7,7': 'wk', '7,0': 'wq', '0,7': 'bk', '0,0': 'bq',
  };
  if (piece.t === 'k') {
    if (piece.c === 'w') { ns.wk = false; ns.wq = false; }
    else { ns.bk = false; ns.bq = false; }
  }
  const key = (sq: number): string => `${rowOf(sq)},${colOf(sq)}`;
  const fk = rookSq[key(m.from)];
  if (fk) (ns as unknown as Record<string, boolean>)[fk] = false;
  const tk = rookSq[key(m.to)];
  if (tk) (ns as unknown as Record<string, boolean>)[tk] = false;
  // kotak en-passant baru
  ns.ep = null;
  if (piece.t === 'p' && Math.abs(rowOf(m.to) - rowOf(m.from)) === 2) {
    ns.ep = idx((rowOf(m.from) + rowOf(m.to)) / 2, colOf(m.from));
  }
  ns.half = piece.t === 'p' || captured ? 0 : ns.half + 1;
  if (ns.turn === 'b') ns.full += 1;
  ns.turn = opp(ns.turn);
  return ns;
}

/** Langkah legal penuh (disaring skak) dari kotak. */
export function legalMovesFor(s: State, from: number): Move[] {
  return genMoves(s, from).filter((m) => {
    const ns = applyMove(s, m);
    return !inCheck(ns, s.turn);
  });
}

/** Semua langkah legal untuk warna (default: giliran). */
export function allLegal(s: State, color: Color = s.turn): Move[] {
  const out: Move[] = [];
  for (let i = 0; i < 64; i += 1) {
    const p = s.board[i];
    if (p && p.c === color) out.push(...legalMovesFor({ ...s, turn: color }, i));
  }
  return out;
}

/* ---------------- status permainan ---------------- */

export type GameResult = 'w' | 'b' | 'draw';
export type EndReason = 'checkmate' | 'stalemate' | 'fifty' | 'material';

export interface GameStatus {
  over: boolean;
  result: GameResult | null;
  reason: EndReason | null;
  inCheck: boolean;
}

export function insufficientMaterial(bd: Board): boolean {
  const minors: Color[] = [];
  for (const p of bd) {
    if (!p || p.t === 'k') continue;
    if (p.t === 'p' || p.t === 'r' || p.t === 'q') return false;
    minors.push(p.c);
  }
  if (minors.length === 0) return true; // K vs K
  if (minors.length === 1) return true; // K+minor vs K
  return false;
}

export function gameStatus(s: State): GameStatus {
  const moves = allLegal(s);
  const check = inCheck(s, s.turn);
  if (moves.length === 0) {
    if (check) return { over: true, result: opp(s.turn), reason: 'checkmate', inCheck: true };
    return { over: true, result: 'draw', reason: 'stalemate', inCheck: false };
  }
  if (s.half >= 100) return { over: true, result: 'draw', reason: 'fifty', inCheck: check };
  if (insufficientMaterial(s.board)) return { over: true, result: 'draw', reason: 'material', inCheck: check };
  return { over: false, result: null, reason: null, inCheck: check };
}

/* ---------------- AI: negamax + alpha-beta ---------------- */

const VAL: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const MATE = 100000;

// Piece-square tables, indeks 0 = a1 (rank 1). Nilai dari sudut pandang putih.
const PST: Record<PieceType, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
  ],
};

/** Skor statis dari sudut pandang PUTIH (centipawn). */
export function evaluate(s: State): number {
  let score = 0;
  for (let i = 0; i < 64; i += 1) {
    const p = s.board[i];
    if (!p) continue;
    // indeks PST: 0=a1. idx internal: r=0 rank8 -> sq64 = (7-r)*8+c
    const sq64 = (7 - rowOf(i)) * 8 + colOf(i);
    const v = VAL[p.t] + PST[p.t][p.c === 'w' ? sq64 : 63 - sq64];
    score += p.c === 'w' ? v : -v;
  }
  return score;
}

/** Urutkan: promosi & capture (MVV-LVA) dulu. */
function orderMoves(s: State, moves: Move[]): Move[] {
  return moves
    .map((m) => {
      let key = 0;
      const victim = s.board[m.to] || (m.ep ? { t: 'p' as PieceType, c: opp(s.turn) } : null);
      if (victim) {
        const attacker = s.board[m.from]!;
        key = 10000 + VAL[victim.t] - VAL[attacker.t] / 16;
      }
      if (m.promo) key += 9000 + VAL[m.promo];
      return { m, key };
    })
    .sort((a, b) => b.key - a.key)
    .map((x) => x.m);
}

function negamax(s: State, depth: number, alpha: number, beta: number, ply: number): number {
  if (++NODES > NODE_CAP) throw new AbortSearch();
  // horizon: eval statis saja (hemat satu allLegal per daun)
  if (depth <= 0) {
    const ev = evaluate(s);
    return s.turn === 'w' ? ev : -ev;
  }
  const st = gameStatus(s);
  if (st.over) {
    if (st.result === 'draw') return 0;
    return -(MATE - ply); // giliran jalan = kalah -> mate lebih cepat lebih buruk
  }
  let best = -Infinity;
  for (const m of orderMoves(s, allLegal(s))) {
    const score = -negamax(applyMove(s, m), depth - 1, -beta, -alpha, ply + 1);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

export interface AiResult {
  move: Move;
  /** skor dari sudut pandang AI (centipawn) */
  score: number;
}

/** Dilempar saat pencarian melebihi NODE_CAP. */
class AbortSearch extends Error {}
let NODES = 0;
let NODE_CAP = Infinity;

function searchRoot(s: State, color: Color, depth: number, rand: () => number): AiResult {
  NODES = 0;
  const moves = orderMoves(s, allLegal(s, color));
  let best = -Infinity;
  const scored: { m: Move; sc: number }[] = [];
  for (const m of moves) {
    const sc = -negamax(applyMove(s, m), depth - 1, -Infinity, Infinity, 1);
    scored.push({ m, sc });
    if (sc > best) best = sc;
  }
  const pool = scored.filter((x) => x.sc >= best - 25);
  const pick = pool[Math.floor(rand() * pool.length)];
  return { move: pick.m, score: pick.sc };
}

/**
 * Langkah AI untuk warna `color` (harus = s.turn). Depth 2-3.
 * Depth 3 dibatasi node-cap (fallback ke depth 2 bila terlalu lama),
 * dan di antara langkah terbaik (selisih <= 25cp) dipilih acak -> bisa dikalahkan.
 */
export function aiBestMove(s: State, color: Color, depth = 3, rand: () => number = Math.random): AiResult | null {
  if (s.turn !== color) return null;
  const moves = allLegal(s, color);
  if (moves.length === 0) return null;
  if (depth <= 2) return searchRoot(s, color, 2, rand);
  NODE_CAP = 40000;
  const fallback = searchRoot(s, color, 2, rand);
  try {
    return searchRoot(s, color, 3, rand);
  } catch (e) {
    if (e instanceof AbortSearch) return fallback;
    throw e;
  } finally {
    NODE_CAP = Infinity;
  }
}

/** Notasi ringkas untuk UI/log: e2e4, e7e8q. */
export function moveToUci(m: Move): string {
  return `${squareName(m.from)}${squareName(m.to)}${m.promo ?? ''}`;
}
