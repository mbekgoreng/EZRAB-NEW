/**
 * EZRAB Build Challenge — pure game logic (src/game-space/games/build-challenge/logic.ts)
 *
 * Zero dependencies: no THREE, no DOM, no React. Fully unit-testable with tsx.
 * The Three.js engine (BuildChallengeEngine) is a dumb renderer mirror of this
 * state; ALL rules, scoring and win conditions live here.
 */

export const GRID = 8;

export type CompType = 'pondasi' | 'kolom' | 'balok' | 'dinding' | 'atap';

export const COMP_ORDER: CompType[] = ['pondasi', 'kolom', 'balok', 'dinding', 'atap'];

export const COMP_META: Record<
  CompType,
  { label: string; hint: string; points: number }
> = {
  pondasi: { label: 'Pondasi', hint: 'Taruh di tanah kosong', points: 100 },
  kolom: { label: 'Kolom', hint: 'Taruh di atas pondasi', points: 100 },
  balok: { label: 'Balok', hint: 'Taruh di atas kolom', points: 100 },
  dinding: { label: 'Dinding', hint: 'Tanah kosong, menempel pondasi', points: 100 },
  atap: { label: 'Atap', hint: 'Taruh di atas balok', points: 100 },
};

export type Targets = Record<CompType, number>;

export interface LevelDef {
  id: number;
  name: string;
  briefing: string;
  targets: Targets;
  /** par time in seconds for the speed bonus */
  parSec: number;
}

export const LEVELS: LevelDef[] = [
  {
    id: 1,
    name: 'Fondasi & Kolom',
    briefing: 'Bangun struktur dasar: 4 pondasi beton, lalu 4 kolom di atasnya.',
    targets: { pondasi: 4, kolom: 4, balok: 0, dinding: 0, atap: 0 },
    parSec: 90,
  },
  {
    id: 2,
    name: 'Balok & Dinding',
    briefing: 'Sambung 4 balok di atas kolom, lalu pasang 4 dinding menempel pondasi.',
    targets: { pondasi: 4, kolom: 4, balok: 4, dinding: 4, atap: 0 },
    parSec: 150,
  },
  {
    id: 3,
    name: 'Atap & Finishing',
    briefing: 'Selesaikan bangunan: tutup dengan 4 atap di atas balok + 2 dinding lagi.',
    targets: { pondasi: 4, kolom: 4, balok: 4, dinding: 6, atap: 4 },
    parSec: 180,
  },
];

export type InvalidReason =
  | 'out'
  | 'occupied'
  | 'need-pondasi'
  | 'need-kolom'
  | 'need-balok'
  | 'need-adjacent';

export const REASON_TEXT: Record<InvalidReason, string> = {
  out: 'Di luar area site.',
  occupied: 'Sudah ada komponen di sini.',
  'need-pondasi': 'Kolom harus di atas pondasi.',
  'need-kolom': 'Balok harus di atas kolom.',
  'need-balok': 'Atap harus di atas balok.',
  'need-adjacent': 'Dinding harus di tanah kosong yang menempel pondasi.',
};

export interface PlaceResult {
  ok: boolean;
  reason?: InvalidReason;
  /** points delta applied to the score */
  delta: number;
}

/** Points lost on an invalid placement attempt (score never drops below 0). */
export const INVALID_PENALTY = 25;
/** Speed bonus per second under par when a level completes. */
export const BONUS_PER_SEC = 5;

/** Board: stack of components per cell, board[x][z]. */
export type Board = CompType[][][];

export function createBoard(): Board {
  return Array.from({ length: GRID }, () =>
    Array.from({ length: GRID }, () => [] as CompType[]),
  );
}

const inBounds = (x: number, z: number): boolean =>
  x >= 0 && x < GRID && z >= 0 && z < GRID;

function adjacentToPondasi(board: Board, x: number, z: number): boolean {
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  return dirs.some(([dx, dz]) => {
    const nx = x + dx;
    const nz = z + dz;
    return inBounds(nx, nz) && board[nx][nz].includes('pondasi');
  });
}

export function canPlace(board: Board, type: CompType, x: number, z: number): PlaceResult {
  if (!inBounds(x, z)) return { ok: false, reason: 'out', delta: -INVALID_PENALTY };
  const stack = board[x][z];
  switch (type) {
    case 'pondasi':
      if (stack.length > 0) return { ok: false, reason: 'occupied', delta: -INVALID_PENALTY };
      return { ok: true, delta: COMP_META.pondasi.points };
    case 'kolom':
      if (stack[stack.length - 1] !== 'pondasi')
        return { ok: false, reason: 'need-pondasi', delta: -INVALID_PENALTY };
      return { ok: true, delta: COMP_META.kolom.points };
    case 'balok':
      if (stack[stack.length - 1] !== 'kolom')
        return { ok: false, reason: 'need-kolom', delta: -INVALID_PENALTY };
      return { ok: true, delta: COMP_META.balok.points };
    case 'dinding':
      if (stack.length > 0) return { ok: false, reason: 'occupied', delta: -INVALID_PENALTY };
      if (!adjacentToPondasi(board, x, z))
        return { ok: false, reason: 'need-adjacent', delta: -INVALID_PENALTY };
      return { ok: true, delta: COMP_META.dinding.points };
    case 'atap':
      if (stack[stack.length - 1] !== 'balok')
        return { ok: false, reason: 'need-balok', delta: -INVALID_PENALTY };
      return { ok: true, delta: COMP_META.atap.points };
  }
}

export interface GameState {
  levelIdx: number;
  board: Board;
  counts: Targets;
  score: number;
  moves: number;
  invalidAttempts: number;
}

export function createGameState(): GameState {
  return {
    levelIdx: 0,
    board: createBoard(),
    counts: { pondasi: 0, kolom: 0, balok: 0, dinding: 0, atap: 0 },
    score: 0,
    moves: 0,
    invalidAttempts: 0,
  };
}

/** Apply a placement. Returns the PlaceResult; mutates state on success only. */
export function tryPlace(state: GameState, type: CompType, x: number, z: number): PlaceResult {
  const check = canPlace(state.board, type, x, z);
  state.moves += 1;
  if (!check.ok) {
    state.invalidAttempts += 1;
    state.score = Math.max(0, state.score + check.delta);
    return check;
  }
  state.board[x][z].push(type);
  state.counts[type] += 1;
  state.score += check.delta;
  return check;
}

export function levelTargetMet(state: GameState): boolean {
  const t = LEVELS[state.levelIdx].targets;
  return (Object.keys(t) as CompType[]).every((k) => state.counts[k] >= t[k]);
}

/** Remaining placements per component for the current level. */
export function remainingTargets(state: GameState): Targets {
  const t = LEVELS[state.levelIdx].targets;
  const r = { ...t };
  (Object.keys(r) as CompType[]).forEach((k) => {
    r[k] = Math.max(0, t[k] - state.counts[k]);
  });
  return r;
}

/** Speed bonus for finishing a level. elapsedSec is wall time spent on the level. */
export function levelBonus(levelIdx: number, elapsedSec: number): number {
  const par = LEVELS[levelIdx].parSec;
  return Math.max(0, Math.round(par - elapsedSec)) * BONUS_PER_SEC;
}

/** Reset board+counts for a new level, keeping accumulated score/moves. */
export function resetForLevel(state: GameState, levelIdx: number): void {
  state.levelIdx = levelIdx;
  state.board = createBoard();
  state.counts = { pondasi: 0, kolom: 0, balok: 0, dinding: 0, atap: 0 };
}

/** Total target placements across all levels (for progress display). */
export function totalPlacementsAllLevels(): number {
  return LEVELS.reduce(
    (sum, l) => sum + (Object.keys(l.targets) as CompType[]).reduce((s, k) => s + l.targets[k], 0),
    0,
  );
}
