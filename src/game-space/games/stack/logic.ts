/**
 * EZRAB Game Space v2 — Stack ("Stack Menara") pure logic
 * (src/game-space/games/stack/logic.ts)
 *
 * Zero dependencies. Classic tower stacker math: a block slides along one
 * axis; tapping drops it onto the previous block. The overhang is sliced off
 * (it becomes falling debris in the engine). Perfect drops keep full width
 * and build combo. A total miss ends the run.
 *
 * Each level stores its FULL footprint (cx/cz center, sx/sz sizes) because
 * the slide axis alternates: dropping along z must overlap the top block's
 * z-extent, not its x-width.
 */

export const BLOCK_H = 0.6;
export const BASE_SIZE = 3.4;
/** |center offset| at or below this counts as a perfect drop. */
export const PERFECT_EPS = 0.14;
/** Mover travel half-range. */
export const TRAVEL = 3.6;

export type Axis = 'x' | 'z';

export interface StackLevel {
  cx: number;
  cz: number;
  sx: number;
  sz: number;
  /** axis this block slid along when placed */
  axis: Axis;
  y: number;
}

export interface Mover {
  pos: number;
  dir: 1 | -1;
  speed: number;
  /** size along the slide axis (this is what gets sliced) */
  size: number;
  /** size along the perpendicular axis (fixed for this drop) */
  fixed: number;
  axis: Axis;
  y: number;
}

export interface StackState {
  levels: StackLevel[];
  mover: Mover;
  score: number;
  combo: number;
  bestCombo: number;
  gameOver: boolean;
}

export function createStack(): StackState {
  const base: StackLevel = { cx: 0, cz: 0, sx: BASE_SIZE, sz: BASE_SIZE, axis: 'x', y: 0 };
  return {
    levels: [base],
    mover: {
      pos: -TRAVEL,
      dir: 1,
      speed: 2.4,
      size: BASE_SIZE,
      fixed: BASE_SIZE,
      axis: 'x',
      y: BLOCK_H,
    },
    score: 0,
    combo: 0,
    bestCombo: 0,
    gameOver: false,
  };
}

/** Advance the sliding block; bounces at the travel edges. */
export function stepMover(state: StackState, dt: number): void {
  if (state.gameOver) return;
  const m = state.mover;
  m.pos += m.dir * m.speed * dt;
  if (m.pos > TRAVEL) {
    m.pos = TRAVEL;
    m.dir = -1;
  } else if (m.pos < -TRAVEL) {
    m.pos = -TRAVEL;
    m.dir = 1;
  }
}

export type DropKind = 'perfect' | 'slice' | 'miss';

export interface Overhang {
  /** center along the slide axis */
  center: number;
  /** size along the slide axis */
  size: number;
}

export interface DropResult {
  kind: DropKind;
  /** final placed block (null on miss) */
  placed: StackLevel | null;
  /** the sliced-off part that should fall as debris (null on perfect/miss) */
  overhang: Overhang | null;
  combo: number;
  score: number;
  gameOver: boolean;
}

/**
 * Drop the moving block. Mutates state (pushes the new level or sets
 * gameOver). Returns everything the engine needs to animate.
 */
export function dropBlock(state: StackState): DropResult {
  const fail: DropResult = {
    kind: 'miss', placed: null, overhang: null,
    combo: 0, score: state.score, gameOver: true,
  };
  if (state.gameOver) return fail;
  const prev = state.levels[state.levels.length - 1];
  const m = state.mover;
  const axis = m.axis;

  // previous block's interval ALONG THE SLIDE AXIS
  const pCenter = axis === 'x' ? prev.cx : prev.cz;
  const pSize = axis === 'x' ? prev.sx : prev.sz;
  const l0 = pCenter - pSize / 2;
  const r0 = pCenter + pSize / 2;
  const l1 = m.pos - m.size / 2;
  const r1 = m.pos + m.size / 2;
  const ol = Math.max(l0, l1);
  const orr = Math.min(r0, r1);
  const overlap = orr - ol;

  if (overlap <= 0.001) {
    state.gameOver = true;
    state.combo = 0;
    return fail;
  }

  const offset = m.pos - pCenter;
  let placed: StackLevel;
  let overhang: Overhang | null = null;
  let kind: DropKind;

  if (Math.abs(offset) <= PERFECT_EPS) {
    // perfect: snap to previous center, keep full size
    kind = 'perfect';
    state.combo += 1;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    placed = axis === 'x'
      ? { cx: pCenter, cz: prev.cz, sx: m.size, sz: prev.sz, axis, y: m.y }
      : { cx: prev.cx, cz: pCenter, sx: prev.sx, sz: m.size, axis, y: m.y };
    state.score += 1 + state.combo; // combo bonus
  } else {
    kind = 'slice';
    state.combo = 0;
    const newSize = overlap;
    const newCenter = (ol + orr) / 2;
    placed = axis === 'x'
      ? { cx: newCenter, cz: prev.cz, sx: newSize, sz: prev.sz, axis, y: m.y }
      : { cx: prev.cx, cz: newCenter, sx: prev.sx, sz: newSize, axis, y: m.y };
    if (offset > 0) {
      overhang = { center: (orr + r1) / 2, size: Math.max(0, r1 - orr) };
    } else {
      overhang = { center: (l1 + ol) / 2, size: Math.max(0, ol - l1) };
    }
    state.score += 1;
  }

  state.levels.push(placed);

  // next mover: alternate axis, rise one block, slight speed-up.
  // slide size = placed extent along the new axis; fixed = extent along other.
  const nextAxis: Axis = axis === 'x' ? 'z' : 'x';
  const height = state.levels.length;
  const speed = Math.min(6.2, 2.4 + height * 0.09);
  const startSide = height % 2 === 0 ? -TRAVEL : TRAVEL;
  state.mover = {
    pos: startSide,
    dir: startSide < 0 ? 1 : -1,
    speed,
    size: nextAxis === 'x' ? placed.sx : placed.sz,
    fixed: nextAxis === 'x' ? placed.sz : placed.sx,
    axis: nextAxis,
    y: m.y + BLOCK_H,
  };

  return { kind, placed, overhang, combo: state.combo, score: state.score, gameOver: false };
}

/** Tower height in blocks (excluding the base). */
export function towerHeight(state: StackState): number {
  return state.levels.length - 1;
}
