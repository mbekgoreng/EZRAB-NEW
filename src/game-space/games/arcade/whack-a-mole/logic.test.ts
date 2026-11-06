/**
 * ArcadeWhackAMole ("Pukul Paku") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/whack-a-mole/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  difficultyAt, spawnDelay, upTime, nextSpawn, scoreHit, gradeFor,
  GAME_DURATION, HOLE_COUNT, GOLD_CHANCE,
  spawnKind, upTimeForKind, multiplierForStreak, timePenaltyFor,
  BAUT_CHANCE, BAUT_TIME_PENALTY, BAUT_SCORE_PENALTY,
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
test('paku: 10 + streak×2 (pengganda x1 di bawah streak 6)', () => {
  const r = scoreHit('paku', 4);
  assert.equal(r.newStreak, 5);
  assert.equal(r.multiplier, 1);
  assert.equal(r.points, 10 + 5 * 2);
});
test('emas: 50 + streak×2', () => {
  const r = scoreHit('emas', 0);
  assert.equal(r.newStreak, 1);
  assert.equal(r.points, 52);
});

console.log('\n[4b] pembeda Gelombang 5: baut larangan + kombo + emas singkat');
test('spawnKind: batas emas / baut / paku', () => {
  assert.equal(spawnKind(0), 'emas');
  assert.equal(spawnKind(GOLD_CHANCE - 0.001), 'emas');
  assert.equal(spawnKind(GOLD_CHANCE), 'baut');
  assert.equal(spawnKind(GOLD_CHANCE + BAUT_CHANCE - 0.001), 'baut');
  assert.equal(spawnKind(GOLD_CHANCE + BAUT_CHANCE), 'paku');
  assert.equal(spawnKind(0.99), 'paku');
  assert.ok(BAUT_CHANCE > 0 && BAUT_CHANCE < 0.25);
});
test('nextSpawn bisa melahirkan baut (rng kind di zona baut)', () => {
  // rng berurutan: lubang, jenis, upTime — jenis 0.15 ada di zona baut
  const rolls = [0.1, GOLD_CHANCE + 0.05, 0.5];
  let i = 0;
  const sp = nextSpawn(() => rolls[i++ % rolls.length], 10, new Set());
  assert.equal(sp.kind, 'baut');
});
test('baut terpukul: skor negatif, streak putus, penalti waktu (regresi larangan)', () => {
  const r = scoreHit('baut', 8);
  assert.equal(r.points, -BAUT_SCORE_PENALTY);
  assert.equal(r.newStreak, 0);
  assert.equal(r.timePenalty, BAUT_TIME_PENALTY);
  assert.equal(timePenaltyFor('baut'), 3);
  assert.equal(timePenaltyFor('paku'), 0);
  assert.equal(timePenaltyFor('emas'), 0);
});
test('pengganda kombo: x1 → x2 (streak 6) → x3 (streak 11)', () => {
  assert.equal(multiplierForStreak(1), 1);
  assert.equal(multiplierForStreak(5), 1);
  assert.equal(multiplierForStreak(6), 2);
  assert.equal(multiplierForStreak(10), 2);
  assert.equal(multiplierForStreak(11), 3);
  assert.equal(multiplierForStreak(30), 3);
});
test('kombo menaikkan poin secara multiplikatif, bukan aditif', () => {
  const r = scoreHit('paku', 5); // streak baru 6 → x2
  assert.equal(r.multiplier, 2);
  assert.equal(r.points, (10 + 6 * 2) * 2);
  const g = scoreHit('emas', 10); // streak baru 11 → x3
  assert.equal(g.multiplier, 3);
  assert.equal(g.points, (50 + 11 * 2) * 3);
});
test('emas nongol jauh lebih singkat dari paku untuk basis sama', () => {
  assert.ok(upTimeForKind(1.2, 'emas') < upTimeForKind(1.2, 'paku'));
  assert.equal(upTimeForKind(1.2, 'emas'), 1.2 * 0.6);
  assert.equal(upTimeForKind(1.2, 'paku'), 1.2);
  assert.ok(upTimeForKind(1.2, 'baut') < upTimeForKind(1.2, 'paku'));
});
test('BUKAN-BUG terbukti: emas dari nextSpawn memang lebih singkat dari paku (seed terkontrol)', () => {
  // Dua spawn dengan gulungan upTime identik, hanya jenis berbeda.
  const mk = (kindRoll: number) => {
    const rolls = [0.1, kindRoll, 0.5];
    let i = 0;
    return nextSpawn(() => rolls[i++ % rolls.length], 10, new Set());
  };
  const gold = mk(0.01);
  const plain = mk(0.9);
  assert.equal(gold.kind, 'emas');
  assert.equal(plain.kind, 'paku');
  assert.ok(gold.upTime < plain.upTime, `${gold.upTime} !< ${plain.upTime}`);
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
