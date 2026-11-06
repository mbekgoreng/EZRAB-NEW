/**
 * ArcadeShapeClicker ("Ketok Paku") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/shape-clicker/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  levelFor, maxActiveAt, spawnDelayAt, upTimeAt, nextKind, tapPoints, gradeFor,
  hitsNeededFor, partialPoints, nailDepthFor,
  NAILS_PER_LEVEL, GOLD_CHANCE, MAX_HITS_NEEDED, PARTIAL_POINTS,
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

console.log('\n[5] hitsNeededFor — ketokan beruntun (pembeda dari whack-a-mole)');
test('paku biasa selalu butuh >1 ketok', () => {
  for (let lv = 1; lv <= 30; lv += 1) assert.ok(hitsNeededFor('paku', lv) > 1, `level ${lv}`);
});
test('ketokan naik per level: L1-3=2, L4-6=3, L7+=4', () => {
  assert.equal(hitsNeededFor('paku', 1), 2);
  assert.equal(hitsNeededFor('paku', 3), 2);
  assert.equal(hitsNeededFor('paku', 4), 3);
  assert.equal(hitsNeededFor('paku', 6), 3);
  assert.equal(hitsNeededFor('paku', 7), 4);
  assert.equal(hitsNeededFor('paku', 9), 4);
});
test('cap MAX_HITS_NEEDED berlaku & level tidak valid diamankan', () => {
  assert.equal(MAX_HITS_NEEDED, 4);
  assert.equal(hitsNeededFor('paku', 99), MAX_HITS_NEEDED);
  assert.equal(hitsNeededFor('paku', 0), 2);
  assert.equal(hitsNeededFor('paku', -5), 2);
});
test('paku emas selalu 1 ketok di semua level', () => {
  assert.equal(hitsNeededFor('emas', 1), 1);
  assert.equal(hitsNeededFor('emas', 12), 1);
});
test('monoton: kebutuhan ketok tidak turun saat level naik', () => {
  for (let lv = 1; lv < 20; lv += 1) {
    assert.ok(hitsNeededFor('paku', lv + 1) >= hitsNeededFor('paku', lv));
  }
});

console.log('\n[6] partialPoints & nailDepthFor');
test('poin parsial: paku biasa PARTIAL_POINTS, emas 0', () => {
  assert.equal(PARTIAL_POINTS, 2);
  assert.equal(partialPoints('paku'), PARTIAL_POINTS);
  assert.equal(partialPoints('emas'), 0);
  // total parsial maksimum selalu di bawah poin penutup paku (tak bisa farming)
  assert.ok(partialPoints('paku') * (MAX_HITS_NEEDED - 1) < tapPoints('paku', 0).points);
});
test('kedalaman 0..1 dari ketokan masuk', () => {
  assert.equal(nailDepthFor(0, 3), 0);
  assert.equal(nailDepthFor(1, 2), 0.5);
  assert.equal(nailDepthFor(3, 3), 1);
  assert.equal(nailDepthFor(9, 3), 1);
  assert.equal(nailDepthFor(-1, 3), 0);
  assert.equal(nailDepthFor(0, 0), 1);
});
test('regresi: simulasi ketokan — parsial dulu, penutup memakai tapPoints & streak', () => {
  // paku level 4 butuh 3 ketok: 2 parsial (+2) lalu penutup tapPoints
  const need = hitsNeededFor('paku', 4);
  let score = 0;
  let streak = 0;
  for (let hit = 1; hit < need; hit += 1) {
    score += partialPoints('paku');
    assert.equal(nailDepthFor(hit, need) < 1, true);
  }
  const close = tapPoints('paku', streak);
  streak = close.newStreak;
  score += close.points;
  assert.equal(streak, 1); // streak hanya bergerak di ketokan penutup
  assert.equal(score, PARTIAL_POINTS * (need - 1) + 13);
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join(', ')}` : ''}`);
process.exit(failed ? 1 : 0);
