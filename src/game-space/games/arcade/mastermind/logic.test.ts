/**
 * ArcadeMastermind ("Tebak Campuran") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/mastermind/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import { BAHAN, SLOTS, MAX_GUESSES, genCode, evaluate, isWin, scoreFor } from './logic';

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

console.log('\n[1] BAHAN & konstanta');
test('6 bahan unik', () => {
  assert.equal(BAHAN.length, 6);
  assert.equal(new Set(BAHAN.map((b) => b.nama)).size, 6);
});
test('SLOTS=4, MAX_GUESSES=10', () => {
  assert.equal(SLOTS, 4);
  assert.equal(MAX_GUESSES, 10);
});

console.log('\n[2] genCode');
test('4 takaran valid 0..5', () => {
  for (let i = 0; i < 20; i += 1) {
    const c = genCode(() => 0.5);
    assert.equal(c.length, 4);
    assert.ok(c.every((v) => v >= 0 && v < 6));
  }
});
test('rng 0 → semua Semen (0)', () => {
  assert.deepEqual(genCode(() => 0), [0, 0, 0, 0]);
});

console.log('\n[3] evaluate');
test('semua tepat → 4 hitam', () => {
  assert.deepEqual(evaluate([1, 2, 3, 4], [1, 2, 3, 4]), { hitam: 4, putih: 0 });
});
test('semua salah → 0/0', () => {
  assert.deepEqual(evaluate([0, 0, 0, 0], [1, 1, 1, 1]), { hitam: 0, putih: 0 });
});
test('2 tepat + 2 bahan benar posisi salah', () => {
  assert.deepEqual(evaluate([0, 1, 2, 3], [0, 1, 3, 2]), { hitam: 2, putih: 2 });
});
test('duplikat: tebakan [0,0,1,1] vs kode [0,1,2,3] → 1 hitam 1 putih', () => {
  // posisi 0 tepat (hitam); satu '1' tersisa cocok dengan kode posisi 1 (putih);
  // '0' kedua tidak punya pasangan → bukan putih
  assert.deepEqual(evaluate([0, 0, 1, 1], [0, 1, 2, 3]), { hitam: 1, putih: 1 });
});
test('duplikat: tebakan [2,2,2,2] vs kode [2,3,2,4] → 2 hitam 0 putih', () => {
  assert.deepEqual(evaluate([2, 2, 2, 2], [2, 3, 2, 4]), { hitam: 2, putih: 0 });
});
test('tidak double-count: tebakan [1,1,1,1] vs kode [1,2,3,4] → 1 hitam 0 putih', () => {
  assert.deepEqual(evaluate([1, 1, 1, 1], [1, 2, 3, 4]), { hitam: 1, putih: 0 });
});

console.log('\n[4] isWin & scoreFor');
test('isWin hanya saat 4 hitam', () => {
  assert.ok(isWin({ hitam: 4, putih: 0 }));
  assert.ok(!isWin({ hitam: 3, putih: 1 }));
});
test('skor turun tiap tebakan', () => {
  assert.equal(scoreFor(1), 1000);
  assert.equal(scoreFor(10), 100);
  assert.ok(scoreFor(2) > scoreFor(5));
  assert.equal(scoreFor(99), 0);
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join(', ')}` : ''}`);
process.exit(failed ? 1 : 0);
