/**
 * EZRAB Game Space v2 — Demolition ("Bongkar Bangunan") pure logic
 * (src/game-space/games/demolition/logic.ts)
 *
 * Zero dependencies: no THREE, no DOM, no React. The engine is a dumb
 * renderer mirror; ALL rules live here.
 *
 * Model: a building is a W×H grid of blocks. Tapping a block destroys it.
 * Any block left without support underneath CRUMBLES in a cascade (chain
 * reaction — the stress-relief core of the game). Score = % of the building
 * flattened + combo bonus for rapid taps.
 */

export const DEMO_W = 6;
export const DEMO_H = 8;

/** ms window in which consecutive taps build a combo. */
export const COMBO_WINDOW_MS = 1500;

export type CellKind = 'concrete' | 'glass' | 'pillar' | 'roof';

export interface DemoCell {
  x: number;
  y: number;
  kind: CellKind;
  present: boolean;
}

export interface DemoState {
  w: number;
  h: number;
  cells: DemoCell[][];
  /** cells[x][y] */
  destroyed: number;
  total: number;
  score: number;
  combo: number;
  bestCombo: number;
  lastHitAt: number;
  taps: number;
}

/** Seeded PRNG (mulberry32) — deterministic buildings for tests. */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function kindForFloor(y: number, h: number, rand: () => number): CellKind {
  if (y === 0) return 'pillar';
  if (y === h - 1) return 'roof';
  // alternate glass / concrete bands, slight random swap for variety
  const glass = y % 2 === 1;
  return rand() < 0.12 ? (glass ? 'concrete' : 'glass') : glass ? 'glass' : 'concrete';
}

/**
 * Generate a building: full lower block + setback tower on top for a nicer
 * silhouette. `seed` makes generation deterministic (tests / rebuilds).
 */
export function createBuilding(seed = 1): DemoState {
  const w = DEMO_W;
  const h = DEMO_H;
  const rand = mulberry(seed);
  const towerW = 4;
  const towerX0 = Math.floor((w - towerW) / 2);
  const baseH = 6;
  const cells: DemoCell[][] = [];
  let total = 0;
  for (let x = 0; x < w; x += 1) {
    cells[x] = [];
    for (let y = 0; y < h; y += 1) {
      const inTower = y >= baseH && x >= towerX0 && x < towerX0 + towerW;
      const inBase = y < baseH;
      const present = inBase || inTower;
      cells[x][y] = { x, y, kind: kindForFloor(y, h, rand), present };
      if (present) total += 1;
    }
  }
  return {
    w, h, cells,
    destroyed: 0,
    total,
    score: 0,
    combo: 0,
    bestCombo: 0,
    lastHitAt: 0,
    taps: 0,
  };
}

export interface HitResult {
  /** true if a standing block was hit */
  hit: boolean;
  /** all cells destroyed by this tap (direct + cascade), bottom-up order */
  destroyedCells: DemoCell[];
  points: number;
  combo: number;
  percent: number;
  won: boolean;
}

/** Points for destroying n blocks at the given combo level. */
export function pointsFor(destroyedCount: number, combo: number): number {
  return destroyedCount * 10 + (combo > 1 ? combo * 5 * destroyedCount : 0);
}

/**
 * Destroy the block at (x, y) and cascade-crumble everything left
 * unsupported. Mutates state. Returns the hit result.
 */
export function hitBlock(state: DemoState, x: number, y: number, nowMs: number): HitResult {
  const fail: HitResult = {
    hit: false, destroyedCells: [], points: 0,
    combo: state.combo, percent: percentDestroyed(state), won: state.destroyed >= state.total,
  };
  if (x < 0 || x >= state.w || y < 0 || y >= state.h) return fail;
  const cell = state.cells[x][y];
  if (!cell.present) return fail;

  // combo bookkeeping
  state.combo = nowMs - state.lastHitAt <= COMBO_WINDOW_MS ? state.combo + 1 : 1;
  state.lastHitAt = nowMs;
  state.bestCombo = Math.max(state.bestCombo, state.combo);
  state.taps += 1;

  // direct destroy
  cell.present = false;
  const destroyedCells: DemoCell[] = [cell];

  // cascade: repeatedly crumble unsupported blocks until stable.
  // A block at y is supported iff y === 0 or the cell below is present.
  let changed = true;
  while (changed) {
    changed = false;
    for (let cx = 0; cx < state.w; cx += 1) {
      for (let cy = 1; cy < state.h; cy += 1) {
        const c = state.cells[cx][cy];
        if (c.present && !state.cells[cx][cy - 1].present) {
          c.present = false;
          destroyedCells.push(c);
          changed = true;
        }
      }
    }
  }

  state.destroyed += destroyedCells.length;
  const points = pointsFor(destroyedCells.length, state.combo);
  state.score += points;
  const won = state.destroyed >= state.total;
  return {
    hit: true,
    destroyedCells,
    points,
    combo: state.combo,
    percent: percentDestroyed(state),
    won,
  };
}

export function percentDestroyed(state: DemoState): number {
  if (state.total === 0) return 0;
  return Math.round((state.destroyed / state.total) * 100);
}

/** Remaining standing blocks (for progress display). */
export function remainingBlocks(state: DemoState): number {
  return state.total - state.destroyed;
}
