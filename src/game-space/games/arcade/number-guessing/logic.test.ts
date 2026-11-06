/**
 * ArcadeNumberGuessing ("Tebak Volume") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/number-guessing/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  newTarget, heatFor, heatLabel, directionHint, scoreFor, parseGuess,
  MIN_VOL, MAX_VOL, MAX_ATTEMPTS,
  levelSpec, nextLevel, heatThresholdsForLevel, heatForLevel, newTargetForLevel,
  directionFor, levelScore, addRoundScore, isRoundOver, parseGuessForLevel,
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

console.log('\n[1] newTarget');
test('target dalam 1..50', () => {
  for (let i = 0; i < 100; i += 1) {
    const t = newTarget(() => i / 100);
    assert.ok(t >= MIN_VOL && t <= MAX_VOL, `target ${t} di luar batas`);
    assert.ok(Number.isInteger(t));
  }
  assert.equal(newTarget(() => 0), MIN_VOL);
  assert.equal(newTarget(() => 0.9999), MAX_VOL);
});

console.log('\n[2] heatFor');
test('batas panas/dingin', () => {
  assert.equal(heatFor(20, 20), 'tepat');
  assert.equal(heatFor(22, 20), 'panas');
  assert.equal(heatFor(18, 20), 'panas');
  assert.equal(heatFor(25, 20), 'hangat');
  assert.equal(heatFor(15, 20), 'hangat');
  assert.equal(heatFor(32, 20), 'dingin');
  assert.equal(heatFor(8, 20), 'dingin');
  assert.equal(heatFor(40, 20), 'beku');
  assert.equal(heatFor(1, 50), 'beku');
});
test('label berisi Bahasa Indonesia', () => {
  assert.ok(heatLabel('panas').includes('PANAS'));
  assert.ok(heatLabel('beku').includes('BEKU'));
  assert.ok(heatLabel('tepat').includes('TEPAT'));
});

console.log('\n[3] directionHint');
test('arah kurang/lebih', () => {
  assert.ok(directionHint(10, 20).includes('Kurang'));
  assert.ok(directionHint(30, 20).includes('Kelebihan'));
  assert.equal(directionHint(20, 20), '');
});

console.log('\n[4] scoreFor');
test('makin sedikit tebakan makin besar', () => {
  assert.ok(scoreFor(1) > scoreFor(8));
  assert.equal(scoreFor(1), 100);
  assert.ok(scoreFor(99) >= 10);
});

console.log('\n[5] parseGuess');
test('input valid', () => {
  const r = parseGuess(' 25 ');
  assert.ok(r.ok && r.value === 25);
});
test('input ditolak dengan pesan Indonesia', () => {
  const e1 = parseGuess('');
  assert.ok(!e1.ok && (e1 as { error: string }).error.length > 0);
  const e2 = parseGuess('abc');
  assert.ok(!e2.ok);
  const e3 = parseGuess('99');
  assert.ok(!e3.ok && (e3 as { error: string }).error.includes('50'));
  const e4 = parseGuess('12.5');
  assert.ok(!e4.ok);
  const e5 = parseGuess('0');
  assert.ok(!e5.ok);
});
test('koma desimal Indonesia ditolak (harus bulat)', () => {
  const r = parseGuess('12,5');
  assert.ok(!r.ok);
});

console.log(`\n[6] konstanta`);
test('8 kesempatan', () => {
  assert.equal(MAX_ATTEMPTS, 8);
});

console.log('\n[7] levelSpec — jenjang level');
test('level 1 identik perilaku asli', () => {
  assert.deepEqual(levelSpec(1), { level: 1, min: 1, max: 50, maxAttempts: 8 });
});
test('tabel level 2..5: rentang berlipat dua, kesempatan +1', () => {
  assert.deepEqual(levelSpec(2), { level: 2, min: 1, max: 100, maxAttempts: 9 });
  assert.deepEqual(levelSpec(3), { level: 3, min: 1, max: 200, maxAttempts: 10 });
  assert.deepEqual(levelSpec(4), { level: 4, min: 1, max: 400, maxAttempts: 11 });
  assert.deepEqual(levelSpec(5), { level: 5, min: 1, max: 800, maxAttempts: 12 });
});
test('level monoton melebar dan nextLevel naik satu', () => {
  for (let lv = 1; lv < 6; lv += 1) {
    assert.ok(levelSpec(lv + 1).max > levelSpec(lv).max);
    assert.ok(levelSpec(lv + 1).maxAttempts > levelSpec(lv).maxAttempts);
    assert.equal(nextLevel(lv), lv + 1);
  }
  assert.equal(levelSpec(0).level, 1);
  assert.equal(levelSpec(2.9).level, 2);
});

console.log('\n[8] pita panas/dingin terskala per level');
test('ambang level 1 identik pita lama (2/5/12)', () => {
  assert.deepEqual(heatThresholdsForLevel(1), { panas: 2, hangat: 5, dingin: 12 });
});
test('heatForLevel level 1 identik heatFor untuk semua selisih relevan', () => {
  for (let target = 1; target <= 50; target += 7) {
    for (let guess = 1; guess <= 50; guess += 3) {
      assert.equal(heatForLevel(guess, target, 1), heatFor(guess, target), `${guess} vs ${target}`);
    }
  }
});
test('ambang terskala proporsional span: L2=4/10/24, L3=8/20/49', () => {
  assert.deepEqual(heatThresholdsForLevel(2), { panas: 4, hangat: 10, dingin: 24 });
  assert.deepEqual(heatThresholdsForLevel(3), { panas: 8, hangat: 20, dingin: 49 });
});
test('batas pita level 2 mengikuti ambang terskala', () => {
  assert.equal(heatForLevel(24, 20, 2), 'panas');   // selisih 4
  assert.equal(heatForLevel(25, 20, 2), 'hangat');  // selisih 5
  assert.equal(heatForLevel(30, 20, 2), 'hangat');  // selisih 10
  assert.equal(heatForLevel(44, 20, 2), 'dingin');  // selisih 24
  assert.equal(heatForLevel(45, 20, 2), 'beku');    // selisih 25
  // di level 1 selisih yang sama jatuh lebih dingin (pita tidak terskala di sana)
  assert.equal(heatFor(24, 20), 'hangat');
});

console.log('\n[9] target & skor per level');
test('newTargetForLevel di dalam rentang level', () => {
  for (const lv of [1, 2, 3, 4, 5]) {
    const spec = levelSpec(lv);
    assert.equal(newTargetForLevel(() => 0, lv), spec.min);
    assert.equal(newTargetForLevel(() => 0.9999, lv), spec.max);
    for (let i = 0; i < 20; i += 1) {
      const t = newTargetForLevel(() => i / 20, lv);
      assert.ok(t >= spec.min && t <= spec.max && Number.isInteger(t));
    }
  }
});
test('levelScore: level 1 identik scoreFor, level atas memakai pengali level', () => {
  for (let a = 1; a <= 8; a += 1) assert.equal(levelScore(a, 1), scoreFor(a));
  assert.equal(levelScore(1, 2), 200);
  assert.equal(levelScore(1, 3), 300);
  assert.equal(levelScore(2, 2), 180);
});
test('addRoundScore mengakumulasi skor lintas level', () => {
  let total = 0;
  total = addRoundScore(total, 1, 1);
  assert.equal(total, 100);
  total = addRoundScore(total, 1, 2);
  assert.equal(total, 300);
  total = addRoundScore(total, 3, 3);
  assert.equal(total, 300 + 240);
});

console.log('\n[10] parseGuess terhadap rentang level aktif');
test('parseGuess dengan rentang eksplisit', () => {
  const ok = parseGuess('99', 1, 100);
  assert.ok(ok.ok && ok.value === 99);
  const bad = parseGuess('150', 1, 100);
  assert.ok(!bad.ok && (bad as { error: string }).error.includes('100'));
});
test('parseGuessForLevel memakai rentang level; default tetap level 1', () => {
  const ok = parseGuessForLevel('150', 3);
  assert.ok(ok.ok && ok.value === 150);
  const bad = parseGuessForLevel('250', 3);
  assert.ok(!bad.ok && (bad as { error: string }).error.includes('200'));
  assert.ok(!parseGuess('99').ok); // perilaku lama tanpa parameter
});
test('directionFor terstruktur', () => {
  assert.equal(directionFor(10, 20), 'kurang');
  assert.equal(directionFor(30, 20), 'lebih');
  assert.equal(directionFor(20, 20), 'tepat');
});
test('label & petunjuk bersih tanpa emoji', () => {
  const texts = [heatLabel('tepat'), heatLabel('panas'), heatLabel('hangat'), heatLabel('dingin'), heatLabel('beku'), directionHint(1, 9), directionHint(9, 1)];
  for (const s of texts) {
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B55}\u{2B06}\u{2B07}]/u.test(s), `masih ada simbol: ${s}`);
  }
});

console.log('\n[11] regresi bug');
test('REGRESI scoreFor(0) tidak melewati cap 100', () => {
  assert.equal(scoreFor(0), 100);
  assert.ok(scoreFor(-3) <= 100);
});
test('REGRESI isRoundOver mengunci ronde setelah tepat / kesempatan habis', () => {
  assert.equal(isRoundOver('tepat', 1, 8), true);
  assert.equal(isRoundOver('panas', 8, 8), true);
  assert.equal(isRoundOver('beku', 9, 9), true);
  assert.equal(isRoundOver('panas', 3, 8), false);
  assert.equal(isRoundOver(null, 0, 8), false);
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join(', ')}` : ''}`);
process.exit(failed ? 1 : 0);
