/**
 * ArcadeShapeClicker ("Ketok Paku") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/shape-clicker/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  levelFor, maxActiveAt, spawnDelayAt, upTimeAt, nextKind, tapPoints, gradeFor,
  NAILS_PER_LEVEL, GOLD_CHANCE,
} from './logic';

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

console.log('\n[1] levelFor & maxActiveAt');
test('level naik tiap 8 ketokan', () => {
  assert.equal(levelFor(0), 1);
  assert.equal(levelFor(NAILS_PER_LEVEL - 1), 1);
  assert.equal(levelFor(NAILS_PER_LEVEL), 2);
  assert.equal(levelFor(NAILS_PER_LEVEL * 3), 4);
});
test('paku aktif dibatasi & naik per level', () => {
  assert.ok(maxActiveAt(1) >= 2);
  assert.ok(maxActiveAt(9) >= maxActiveAt(1));
  assert.ok(maxActiveAt(99) <= 5);
});

console.log('\n[2] spawnDelayAt & upTimeAt');
test('spawn makin rapat & paku makin cepat tenggelam', () => {
  assert.ok(spawnDelayAt(8, () => 0.5) < spawnDelayAt(1, () => 0.5));
  assert.ok(upTimeAt(8, () => 0.5) < upTimeAt(1, () => 0.5));
  assert.ok(upTimeAt(99, () => 0.01) > 0);
});

console.log('\n[3] nextKind & tapPoints');
test('batas deterministik paku emas', () => {
  assert.equal(nextKind(() => 0.01), 'emas');
  assert.equal(nextKind(() => 0.5), 'paku');
  assert.ok(GOLD_CHANCE > 0 && GOLD_CHANCE < 0.2);
});
test('poin: base + streak×3', () => {
  const r = tapPoints('paku', 4);
  assert.equal(r.newStreak, 5);
  assert.equal(r.points, 10 + 5 * 3);
  const g = tapPoints('emas', 0);
  assert.equal(g.newStreak, 1);
  assert.equal(g.points, 43);
});

console.log('\n[4] gradeFor');
test('grade S..D', () => {
  assert.equal(gradeFor(1300), 'S');
  assert.equal(gradeFor(900), 'A');
  assert.equal(gradeFor(600), 'B');
  assert.equal(gradeFor(300), 'C');
  assert.equal(gradeFor(20), 'D');
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join(', ')}` : ''}`);
process.exit(failed ? 1 : 0);
