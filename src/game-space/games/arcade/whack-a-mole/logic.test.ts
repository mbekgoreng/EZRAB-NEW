/**
 * ArcadeWhackAMole ("Pukul Paku") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/whack-a-mole/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  difficultyAt, spawnDelay, upTime, nextSpawn, scoreHit, gradeFor,
  GAME_DURATION, HOLE_COUNT, GOLD_CHANCE,
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

console.log('\n[1] difficultyAt');
test('dijepit 0..1', () => {
  assert.equal(difficultyAt(-5), 0);
  assert.equal(difficultyAt(0), 0);
  assert.equal(difficultyAt(GAME_DURATION), 1);
  assert.equal(difficultyAt(999), 1);
});
test('tengah permainan = 0.5', () => {
  assert.equal(difficultyAt(GAME_DURATION / 2), 0.5);
});

console.log('\n[2] spawnDelay & upTime');
test('spawn makin rapat seiring waktu', () => {
  const rng = () => 0.5;
  assert.ok(spawnDelay(50, rng) < spawnDelay(5, rng));
});
test('paku makin singkat seiring waktu', () => {
  const rng = () => 0.5;
  assert.ok(upTime(50, rng) < upTime(5, rng));
});
test('nilai positif', () => {
  assert.ok(spawnDelay(0, () => 0.01) > 0);
  assert.ok(upTime(60, () => 0.99) > 0);
});

console.log('\n[3] nextSpawn');
test('lubang dalam 0..8', () => {
  for (let i = 0; i < 30; i += 1) {
    const sp = nextSpawn(() => 0.3, 10, new Set());
    assert.ok(sp.hole >= 0 && sp.hole < HOLE_COUNT);
    assert.ok(sp.upTime > 0);
  }
});
test('hindari lubang aktif bila ada yang bebas', () => {
  const active = new Set([0, 1, 2, 3, 4, 5, 6, 7]);
  for (let i = 0; i < 20; i += 1) {
    const sp = nextSpawn(() => 0.9, 10, active);
    assert.equal(sp.hole, 8);
  }
});
test('peluang emas ≈ 9% (uji deterministik batas)', () => {
  // rng tepat di bawah GOLD_CHANCE → emas
  const sp = nextSpawn(() => 0.05, 10, new Set());
  assert.equal(sp.kind, 'emas');
  const sp2 = nextSpawn(() => 0.5, 10, new Set());
  assert.equal(sp2.kind, 'paku');
  assert.ok(GOLD_CHANCE > 0 && GOLD_CHANCE < 0.2);
});

console.log('\n[4] scoreHit');
test('paku: 10 + streak×2', () => {
  const r = scoreHit('paku', 4);
  assert.equal(r.newStreak, 5);
  assert.equal(r.points, 10 + 5 * 2);
});
test('emas: 50 + streak×2', () => {
  const r = scoreHit('emas', 0);
  assert.equal(r.newStreak, 1);
  assert.equal(r.points, 52);
});

console.log('\n[5] gradeFor');
test('grade S/A/B/C/D', () => {
  assert.equal(gradeFor(1500), 'S');
  assert.equal(gradeFor(950), 'A');
  assert.equal(gradeFor(700), 'B');
  assert.equal(gradeFor(400), 'C');
  assert.equal(gradeFor(100), 'D');
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join(', ')}` : ''}`);
process.exit(failed ? 1 : 0);
