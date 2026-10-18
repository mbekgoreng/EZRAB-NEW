/**
 * EZRAB Game Space v2 — pure logic tests for the 3 stress-relief games.
 * Run: npx tsx src/test/gameSpaceV2.test.ts
 *
 * Covers (no browser / no THREE needed):
 *  - demolition: building generation, direct hit, cascade crumble,
 *    miss handling, combo windows, scoring, win at 100%
 *  - zen-build: rule-free placement, undo, clear, bounds
 *  - stack: mover physics, perfect / slice / miss drops, axis alternation,
 *    footprint correctness
 */

import { strict as assert } from 'node:assert';
import {
  DEMO_W, DEMO_H, COMBO_WINDOW_MS,
  createBuilding, hitBlock, pointsFor, percentDestroyed, remainingBlocks,
} from '../game-space/games/demolition/logic';
import {
  ZEN_GRID, createZenState, zenPlace, zenUndo, zenClear, zenStackHeight, inZenBounds,
} from '../game-space/games/zen-build/logic';
import {
  BLOCK_H, BASE_SIZE, PERFECT_EPS, TRAVEL,
  createStack, stepMover, dropBlock, towerHeight,
} from '../game-space/games/stack/logic';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  PASS ${name}`);
  } catch (e) {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL ${name}: ${(e as Error).message}`);
  }
}

/* ================= demolition ================= */

test('demolition: building generates 44 blocks (36 base + 8 tower), deterministic', () => {
  const a = createBuilding(1);
  const b = createBuilding(1);
  assert.equal(a.total, 44);
  assert.equal(a.w, DEMO_W);
  assert.equal(a.h, DEMO_H);
  assert.equal(JSON.stringify(a.cells), JSON.stringify(b.cells));
  // tower setback: top floors only x in [1,4]
  assert.equal(a.cells[0][7].present, false);
  assert.equal(a.cells[2][7].present, true);
  assert.equal(a.cells[5][5].present, true);
});

test('demolition: top-block hit destroys exactly 1 (no cascade above)', () => {
  const s = createBuilding(1);
  const r = hitBlock(s, 2, 7, 1000);
  assert.equal(r.hit, true);
  assert.equal(r.destroyedCells.length, 1);
  assert.equal(s.destroyed, 1);
  assert.equal(r.combo, 1);
});

test('demolition: knocking a ground pillar crumbles the whole column (cascade)', () => {
  const s = createBuilding(1);
  const r = hitBlock(s, 0, 0, 1000);
  assert.equal(r.hit, true);
  // column x=0, y=0..5 → 6 blocks crumble
  assert.equal(r.destroyedCells.length, 6);
  assert.equal(s.destroyed, 6);
  // tower (x 1..4) untouched
  assert.equal(s.cells[2][7].present, true);
});

test('demolition: cascade crosses into the tower when its support is removed', () => {
  const s = createBuilding(1);
  const r = hitBlock(s, 2, 0, 1000);
  assert.equal(r.hit, true);
  // column x=2: y=0..5 base + y=6..7 tower = 8 blocks
  assert.equal(r.destroyedCells.length, 8);
});

test('demolition: miss on empty cell / out of bounds changes nothing', () => {
  const s = createBuilding(1);
  hitBlock(s, 2, 7, 1000); // destroy it first
  const scoreBefore = s.score;
  const r1 = hitBlock(s, 2, 7, 2000);
  const r2 = hitBlock(s, -1, 0, 2000);
  const r3 = hitBlock(s, 0, 99, 2000);
  assert.equal(r1.hit, false);
  assert.equal(r2.hit, false);
  assert.equal(r3.hit, false);
  assert.equal(s.score, scoreBefore);
  assert.equal(s.destroyed, 1);
});

test('demolition: rapid taps build combo, slow taps reset it', () => {
  const s = createBuilding(1);
  const h1 = hitBlock(s, 1, 7, 1000);
  const h2 = hitBlock(s, 2, 7, 1000 + COMBO_WINDOW_MS - 100);
  const h3 = hitBlock(s, 3, 7, 1000 + COMBO_WINDOW_MS - 100 + COMBO_WINDOW_MS + 500);
  assert.equal(h1.combo, 1);
  assert.equal(h2.combo, 2);
  assert.equal(h3.combo, 1); // window expired → reset
  assert.ok(s.bestCombo >= 2);
});

test('demolition: pointsFor rewards combo, percent hits 100 → won', () => {
  assert.ok(pointsFor(3, 2) > pointsFor(3, 1));
  assert.equal(pointsFor(0, 5), 0);
  const s = createBuilding(1);
  // flatten everything column by column
  for (let x = 0; x < DEMO_W; x += 1) {
    hitBlock(s, x, 0, 1000 + x * 10);
  }
  assert.equal(s.destroyed, s.total);
  assert.equal(percentDestroyed(s), 100);
  assert.equal(remainingBlocks(s), 0);
  const r = hitBlock(s, 0, 0, 99999);
  assert.equal(r.won, true);
});

/* ================= zen-build ================= */

test('zen: placement is rule-free and unlimited', () => {
  const s = createZenState();
  assert.equal(zenPlace(s, 'beton', 0, 0), true);
  assert.equal(zenPlace(s, 'kaca', 0, 0), true); // stack anything on anything
  assert.equal(zenPlace(s, 'atap', 0, 0), true);
  assert.equal(zenStackHeight(s, 0, 0), 3);
  assert.equal(s.count, 3);
});

test('zen: out of bounds rejected', () => {
  const s = createZenState();
  assert.equal(zenPlace(s, 'beton', -1, 0), false);
  assert.equal(zenPlace(s, 'beton', ZEN_GRID, 0), false);
  assert.equal(zenPlace(s, 'beton', 0, ZEN_GRID), false);
  assert.equal(s.count, 0);
  assert.equal(inZenBounds(0, 0), true);
  assert.equal(inZenBounds(ZEN_GRID - 1, ZEN_GRID - 1), true);
});

test('zen: undo removes last placement (LIFO), empty → null', () => {
  const s = createZenState();
  assert.equal(zenUndo(s), null);
  zenPlace(s, 'kayu', 1, 1);
  zenPlace(s, 'bata', 2, 2);
  const u = zenUndo(s);
  assert.equal(u?.type, 'bata');
  assert.equal(s.count, 1);
  assert.equal(zenStackHeight(s, 2, 2), 0);
  assert.equal(zenStackHeight(s, 1, 1), 1);
});

test('zen: clear resets everything', () => {
  const s = createZenState();
  zenPlace(s, 'beton', 0, 0);
  zenPlace(s, 'kaca', 3, 3);
  zenClear(s);
  assert.equal(s.count, 0);
  assert.equal(s.history.length, 0);
  assert.equal(zenStackHeight(s, 0, 0), 0);
  assert.equal(zenUndo(s), null);
});

/* ================= stack ================= */

test('stack: initial state sane', () => {
  const s = createStack();
  assert.equal(s.levels.length, 1);
  assert.equal(s.levels[0].sx, BASE_SIZE);
  assert.equal(s.levels[0].sz, BASE_SIZE);
  assert.equal(s.mover.axis, 'x');
  assert.equal(s.mover.size, BASE_SIZE);
  assert.equal(s.gameOver, false);
  assert.equal(towerHeight(s), 0);
});

test('stack: mover advances and bounces at travel edges', () => {
  const s = createStack();
  const p0 = s.mover.pos;
  stepMover(s, 0.5);
  assert.ok(s.mover.pos > p0);
  s.mover.pos = TRAVEL - 0.01;
  s.mover.dir = 1;
  stepMover(s, 1);
  assert.equal(s.mover.dir, -1);
  assert.ok(s.mover.pos <= TRAVEL);
});

test('stack: perfect drop keeps full size, snaps center, builds combo', () => {
  const s = createStack();
  s.mover.pos = 0.05; // within PERFECT_EPS of prev center 0
  assert.ok(Math.abs(0.05) <= PERFECT_EPS);
  const r = dropBlock(s);
  assert.equal(r.kind, 'perfect');
  assert.equal(r.placed!.sx, BASE_SIZE);
  assert.equal(r.placed!.cx, 0);
  assert.equal(r.combo, 1);
  assert.equal(r.score, 2); // 1 + combo bonus 1
  assert.equal(s.mover.axis, 'z'); // alternates
  assert.equal(s.gameOver, false);
});

test('stack: sliced drop shrinks footprint and yields overhang debris', () => {
  const s = createStack();
  s.mover.pos = 1.0;
  const r = dropBlock(s);
  assert.equal(r.kind, 'slice');
  assert.ok(Math.abs(r.placed!.sx - (BASE_SIZE - 1.0)) < 1e-9);
  assert.ok(Math.abs(r.placed!.cx - 0.5) < 1e-9);
  assert.ok(r.overhang !== null);
  assert.ok(Math.abs(r.overhang!.size - 1.0) < 1e-9);
  assert.equal(r.combo, 0);
  assert.equal(r.score, 1);
});

test('stack: total miss ends the run', () => {
  const s = createStack();
  s.mover.pos = 5.0; // interval [3.3, 6.7] vs prev [-1.7, 1.7] → no overlap
  const r = dropBlock(s);
  assert.equal(r.kind, 'miss');
  assert.equal(r.gameOver, true);
  assert.equal(s.gameOver, true);
  assert.equal(r.placed, null);
});

test('stack: z-axis drop overlaps the top block z-extent (footprint correctness)', () => {
  const s = createStack();
  // level 1: slice along x → sx shrinks, sz stays 3.4
  s.mover.pos = 1.0;
  const r1 = dropBlock(s);
  assert.equal(r1.kind, 'slice');
  assert.equal(s.mover.axis, 'z');
  assert.ok(Math.abs(s.mover.size - BASE_SIZE) < 1e-9); // slide size = placed sz
  // level 2 slides along z: center it on prev cz (0) → perfect
  s.mover.pos = 0.03;
  const r2 = dropBlock(s);
  assert.equal(r2.kind, 'perfect');
  assert.ok(Math.abs(r2.placed!.sz - BASE_SIZE) < 1e-9);
  assert.ok(Math.abs(r2.placed!.sx - (BASE_SIZE - 1.0)) < 1e-9); // x-extent preserved
  assert.equal(towerHeight(s), 2);
});

test('stack: repeated perfects accumulate combo bonus', () => {
  const s = createStack();
  for (let i = 0; i < 3; i += 1) {
    const prev = s.levels[s.levels.length - 1];
    s.mover.pos = s.mover.axis === 'x' ? prev.cx : prev.cz;
    const r = dropBlock(s);
    assert.equal(r.kind, 'perfect');
  }
  assert.equal(s.combo, 3);
  assert.equal(s.bestCombo, 3);
  assert.equal(s.score, (1 + 1) + (1 + 2) + (1 + 3));
});

/* ================= summary ================= */
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('Failures:', failures.join(', '));
  process.exit(1);
}
