/**
 * EZRAB Game Space — command detection + Build Challenge logic tests.
 * Run: npx tsx src/test/gameSpace.test.ts
 *
 * Covers the mandatory test items that don't need a browser:
 *  - command `game` and all supported variants are detected (case/space-insensitive)
 *  - normal chat messages are NOT hijacked (still go to AI)
 *  - placement rules (valid + every invalid reason)
 *  - scoring: +100 valid, -25 invalid (floor 0), speed bonus
 *  - level completion, multi-level flow, win state
 */

import { strict as assert } from 'node:assert';
import { isGameCommand } from '../game-space/command';
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import { executeIntent } from '../ai-tools/ezrab-ai/actionRegistry';
import {
  LEVELS, createGameState, tryPlace, canPlace, levelTargetMet,
  remainingTargets, levelBonus, resetForLevel, createBoard,
} from '../game-space/games/build-challenge/logic';

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
    console.log(`  FAIL ${name} — ${(e as Error).message}`);
  }
}

/* ================= 1. Command detection ================= */
console.log('\n[1] isGameCommand');
const shouldMatch = [
  'game', 'GAME', 'Game', '  game  ', 'game!', '/game', '/GAME',
  'main game', 'MAIN GAME', 'ayo main game', 'maen game',
  'buka game', 'bukain game', 'buka game dong', 'tampilkan game',
  'game space', 'GAME SPACE', 'buka game space',
];
shouldMatch.forEach((s) =>
  test(`match "${s}"`, () => assert.equal(isGameCommand(s), true)),
);
const shouldNotMatch = [
  '', '   ', 'gambarkan denah', 'bagaimana cara hitung RAB?',
  'apa itu game?', 'hitung volume beton', 'buka rab', '/rab',
  'game over', 'videogame', 'endgame', 'buka template rab',
];
shouldNotMatch.forEach((s) =>
  test(`no-match "${s || '(empty)'}"`, () => assert.equal(isGameCommand(s), false)),
);

/* ================= 2. Router integration ================= */
console.log('\n[2] routeIntent → OPEN_GAME_SPACE');
['game', '/game', 'main game', 'buka game', 'game space', '  GAME  '].forEach((s) =>
  test(`route "${s}"`, () => {
    const r = routeIntent(s);
    assert.equal(r.intent, 'OPEN_GAME_SPACE');
    assert.equal(r.localOnly, true, 'must not call AI provider');
    assert.equal(r.needsClarification, false);
  }),
);
test('normal chat still goes to AI', () => {
  const r = routeIntent('hitung volume beton 10x8x0.12');
  assert.equal(r.intent, 'UNKNOWN');
  assert.equal(r.localOnly, false);
});
test('other commands unaffected', () => {
  assert.equal(routeIntent('/rab').intent, 'OPEN_RAB');
  assert.equal(routeIntent('buka template rab').intent, 'OPEN_TEMPLATE');
});
test('executeIntent returns openGameSpace flag + no navigation', () => {
  const res = executeIntent('OPEN_GAME_SPACE', undefined, {
    navigate: () => { throw new Error('must not navigate'); },
    currentMenu: 'ezrab-ai',
    activeProject: null,
    projects: [],
    projectTotal: null,
  });
  assert.equal(res.ok, true);
  assert.equal(res.openGameSpace, true);
  assert.equal(res.navigated, undefined);
  assert.ok(res.message.length > 0);
});

/* ================= 3. Placement rules ================= */
console.log('\n[3] placement rules');
test('pondasi on empty ground: ok +100', () => {
  const s = createGameState();
  const r = tryPlace(s, 'pondasi', 3, 3);
  assert.equal(r.ok, true);
  assert.equal(s.score, 100);
  assert.equal(s.counts.pondasi, 1);
});
test('pondasi on occupied: invalid (occupied)', () => {
  const s = createGameState();
  tryPlace(s, 'pondasi', 3, 3);
  const r = tryPlace(s, 'pondasi', 3, 3);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'occupied');
});
test('kolom needs pondasi below', () => {
  const s = createGameState();
  const bad = tryPlace(s, 'kolom', 0, 0);
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'need-pondasi');
  tryPlace(s, 'pondasi', 0, 0);
  const good = tryPlace(s, 'kolom', 0, 0);
  assert.equal(good.ok, true);
});
test('balok needs kolom below', () => {
  const s = createGameState();
  tryPlace(s, 'pondasi', 1, 1);
  const bad = tryPlace(s, 'balok', 1, 1);
  assert.equal(bad.reason, 'need-kolom');
  tryPlace(s, 'kolom', 1, 1);
  assert.equal(tryPlace(s, 'balok', 1, 1).ok, true);
});
test('atap needs balok below', () => {
  const s = createGameState();
  tryPlace(s, 'pondasi', 2, 2);
  tryPlace(s, 'kolom', 2, 2);
  const bad = tryPlace(s, 'atap', 2, 2);
  assert.equal(bad.reason, 'need-balok');
  tryPlace(s, 'balok', 2, 2);
  assert.equal(tryPlace(s, 'atap', 2, 2).ok, true);
});
test('dinding needs empty cell adjacent to pondasi', () => {
  const s = createGameState();
  const far = tryPlace(s, 'dinding', 7, 7);
  assert.equal(far.ok, false);
  assert.equal(far.reason, 'need-adjacent');
  tryPlace(s, 'pondasi', 4, 4);
  assert.equal(tryPlace(s, 'dinding', 5, 4).ok, true);
  const occupied = tryPlace(s, 'dinding', 4, 4);
  assert.equal(occupied.reason, 'occupied');
});
test('out of bounds rejected', () => {
  const s = createGameState();
  assert.equal(tryPlace(s, 'pondasi', -1, 0).reason, 'out');
  assert.equal(tryPlace(s, 'pondasi', 8, 8).reason, 'out');
});
test('invalid attempt: -25, score never below 0', () => {
  const s = createGameState();
  tryPlace(s, 'kolom', 0, 0); // -25 → floor 0
  assert.equal(s.score, 0);
  assert.equal(s.invalidAttempts, 1);
  tryPlace(s, 'pondasi', 0, 0); // +100
  tryPlace(s, 'kolom', 1, 1); // -25 → 75
  assert.equal(s.score, 75);
});
test('moves counted on every attempt', () => {
  const s = createGameState();
  tryPlace(s, 'pondasi', 0, 0);
  tryPlace(s, 'kolom', 5, 5); // invalid
  assert.equal(s.moves, 2);
});

/* ================= 4. Levels & win ================= */
console.log('\n[4] levels & win');
function buildLevel1(s: ReturnType<typeof createGameState>): void {
  const cells: Array<[number, number]> = [[3, 3], [4, 3], [3, 4], [4, 4]];
  cells.forEach(([x, z]) => tryPlace(s, 'pondasi', x, z));
  cells.forEach(([x, z]) => tryPlace(s, 'kolom', x, z));
}
test('level 1 completes after 4 pondasi + 4 kolom', () => {
  const s = createGameState();
  assert.equal(levelTargetMet(s), false);
  buildLevel1(s);
  assert.equal(levelTargetMet(s), true);
  const rem = remainingTargets(s);
  assert.deepEqual(rem, { pondasi: 0, kolom: 0, balok: 0, dinding: 0, atap: 0 });
});
test('partial progress not complete', () => {
  const s = createGameState();
  tryPlace(s, 'pondasi', 3, 3);
  tryPlace(s, 'kolom', 3, 3);
  assert.equal(levelTargetMet(s), false);
  assert.equal(remainingTargets(s).pondasi, 3);
});
test('level bonus: faster = bigger, never negative', () => {
  assert.ok(levelBonus(0, 30) > levelBonus(0, 80));
  assert.equal(levelBonus(0, 9999), 0);
  assert.equal(levelBonus(0, 90), 0);
});
test('resetForLevel clears board, keeps score', () => {
  const s = createGameState();
  buildLevel1(s);
  const scoreBefore = s.score;
  resetForLevel(s, 1);
  assert.equal(s.levelIdx, 1);
  assert.equal(s.score, scoreBefore);
  assert.equal(s.counts.pondasi, 0);
  assert.equal(levelTargetMet(s), false);
});
test('canPlace is pure (no mutation)', () => {
  const b = createBoard();
  const before = JSON.stringify(b);
  canPlace(b, 'kolom', 0, 0);
  canPlace(b, 'pondasi', 0, 0);
  assert.equal(JSON.stringify(b), before);
});
test('3 levels defined with sane targets', () => {
  assert.equal(LEVELS.length, 3);
  LEVELS.forEach((l) => {
    const total = Object.values(l.targets).reduce((a, v) => a + v, 0);
    assert.ok(total > 0, `level ${l.id} has targets`);
    assert.ok(l.parSec > 0, `level ${l.id} has par time`);
  });
});

/* ================= summary ================= */
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('Failures:', failures.join(', '));
  process.exit(1);
}
