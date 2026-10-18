/**
 * EZRAB Game Space v2 — Zen Build ("Mode Bebas") pure logic
 * (src/game-space/games/zen-build/logic.ts)
 *
 * Zero dependencies. Deliberately rule-free: any piece on any cell, stacked
 * freely, unlimited pieces. The only "rules" are undo history and bounds.
 */

export const ZEN_GRID = 8;

export type ZenPiece = 'beton' | 'kayu' | 'bata' | 'kaca' | 'atap';

export const ZEN_PIECES: ZenPiece[] = ['beton', 'kayu', 'bata', 'kaca', 'atap'];

export const ZEN_META: Record<ZenPiece, { label: string; icon: string; hint: string }> = {
  beton: { label: 'Beton', icon: '⬜', hint: 'Pelat beton kokoh' },
  kayu: { label: 'Kayu', icon: '🪵', hint: 'Balok kayu hangat' },
  bata: { label: 'Bata', icon: '🧱', hint: 'Dinding bata' },
  kaca: { label: 'Kaca', icon: '🪟', hint: 'Panel kaca' },
  atap: { label: 'Atap', icon: '🔺', hint: 'Atap pelana' },
};

export interface ZenPlacement {
  type: ZenPiece;
  x: number;
  z: number;
}

export interface ZenState {
  /** stacks[x][z] */
  stacks: ZenPiece[][][];
  history: ZenPlacement[];
  count: number;
}

export function createZenState(): ZenState {
  return {
    stacks: Array.from({ length: ZEN_GRID }, () =>
      Array.from({ length: ZEN_GRID }, () => [] as ZenPiece[]),
    ),
    history: [],
    count: 0,
  };
}

export function inZenBounds(x: number, z: number): boolean {
  return x >= 0 && x < ZEN_GRID && z >= 0 && z < ZEN_GRID;
}

/** Place a piece. Always succeeds when in bounds (no rules in zen mode). */
export function zenPlace(state: ZenState, type: ZenPiece, x: number, z: number): boolean {
  if (!inZenBounds(x, z)) return false;
  state.stacks[x][z].push(type);
  state.history.push({ type, x, z });
  state.count += 1;
  return true;
}

/** Undo the last placement. Returns the removed placement or null. */
export function zenUndo(state: ZenState): ZenPlacement | null {
  const last = state.history.pop();
  if (!last) return null;
  const stack = state.stacks[last.x][last.z];
  stack.pop();
  state.count = Math.max(0, state.count - 1);
  return last;
}

/** Clear everything. */
export function zenClear(state: ZenState): void {
  state.stacks = Array.from({ length: ZEN_GRID }, () =>
    Array.from({ length: ZEN_GRID }, () => [] as ZenPiece[]),
  );
  state.history = [];
  state.count = 0;
}

/** Height (in pieces) of a stack — for progress/stats display. */
export function zenStackHeight(state: ZenState, x: number, z: number): number {
  if (!inZenBounds(x, z)) return 0;
  return state.stacks[x][z].length;
}
