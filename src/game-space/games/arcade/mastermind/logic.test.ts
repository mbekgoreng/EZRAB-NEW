/**
 * ArcadeMastermind ("Tebak Campuran") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/mastermind/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import { BAHAN, SLOTS, MAX_GUESSES, TOTAL_CODES, genCode, evaluate, isWin, scoreFor, remainingCodes, countRemaining } from './logic';

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

console.log('\n[5] genCode — regresi clamp rng');
test('rng() === 1 → semua Aditif (5), bukan indeks 6 di luar BAHAN', () => {
  const c = genCode(() => 1);
  assert.deepEqual(c, [5, 5, 5, 5]);
  assert.ok(c.every((v) => BAHAN[v] !== undefined));
});
test('rng negatif → semua Semen (0)', () => {
  assert.deepEqual(genCode(() => -0.5), [0, 0, 0, 0]);
});
test('rng tepat di bawah 1 → 5', () => {
  assert.deepEqual(genCode(() => 0.999999), [5, 5, 5, 5]);
});

console.log('\n[6] remainingCodes / countRemaining');
test('tanpa riwayat → 1296 (6^4), semua unik', () => {
  assert.equal(TOTAL_CODES, 1296);
  assert.equal(countRemaining([]), 1296);
  const all = remainingCodes([]);
  assert.equal(all.length, 1296);
  assert.equal(new Set(all.map((c) => c.join(','))).size, 1296);
});
test('tebakan [0,0,0,0] feedback 0/0 → tepat 625 (5^4, tanpa bahan 0)', () => {
  // Tebakan hanya memakai SATU bahan (0). 0 hitam 0 putih berarti kode
  // tidak memakai bahan 0 di posisi mana pun → 5 pilihan × 4 slot = 625.
  const h = [{ guess: [0, 0, 0, 0], feedback: { hitam: 0, putih: 0 } }];
  assert.equal(countRemaining(h), 625);
  assert.ok(remainingCodes(h).every((c) => c.every((v) => v !== 0)));
});
test('tebakan [0,1,2,3] feedback 0/0 → tepat 16 (2^4, hanya bahan 4 & 5)', () => {
  // Tebakan memakai EMPAT bahan berbeda. 0/0 menyingkirkan keempatnya,
  // tersisa 2 bahan untuk 4 slot = 16 — BUKAN 625.
  const h = [{ guess: [0, 1, 2, 3], feedback: { hitam: 0, putih: 0 } }];
  assert.equal(countRemaining(h), 16);
  assert.ok(remainingCodes(h).every((c) => c.every((v) => v === 4 || v === 5)));
});
test('tebakan [0,0,1,1] feedback 0/0 → tepat 256 (4^4, tanpa bahan 0 & 1)', () => {
  const h = [{ guess: [0, 0, 1, 1], feedback: { hitam: 0, putih: 0 } }];
  assert.equal(countRemaining(h), 256);
});
test('feedback 4 hitam → tepat 1, yaitu tebakan itu sendiri', () => {
  const h = [{ guess: [1, 2, 3, 4], feedback: { hitam: 4, putih: 0 } }];
  assert.equal(countRemaining(h), 1);
  assert.deepEqual(remainingCodes(h), [[1, 2, 3, 4]]);
});
test('riwayat kontradiktif → 0', () => {
  const h = [
    { guess: [0, 0, 0, 0], feedback: { hitam: 4, putih: 0 } },
    { guess: [0, 0, 0, 0], feedback: { hitam: 0, putih: 0 } },
  ];
  assert.equal(countRemaining(h), 0);
  assert.deepEqual(remainingCodes(h), []);
});
test('konsistensi silang: kode rahasia selalu termasuk sisa & semua sisa mereproduksi feedback', () => {
  const guesses = [[0, 1, 2, 3], [5, 5, 0, 0], [1, 1, 2, 4], [3, 0, 5, 2]];
  // Sampel kode rahasia yang tersebar (termasuk duplikat ekstrem).
  const secrets = [[0, 0, 0, 0], [5, 5, 5, 5], [1, 2, 3, 4], [4, 3, 2, 1], [2, 2, 5, 0], [3, 1, 4, 1]];
  for (const secret of secrets) {
    const history = guesses.map((guess) => ({ guess, feedback: evaluate(guess, secret) }));
    const rest = remainingCodes(history);
    assert.ok(rest.some((c) => c.join(',') === secret.join(',')), `rahasia ${secret} harus tersisa`);
    assert.equal(countRemaining(history), rest.length);
    for (const cand of rest) {
      for (const entry of history) {
        assert.deepEqual(evaluate(entry.guess, cand), entry.feedback);
      }
    }
  }
});
test('menambah riwayat tidak pernah menaikkan sisa kemungkinan', () => {
  const secret = [2, 0, 5, 1];
  const guesses = [[0, 0, 0, 0], [1, 2, 3, 4], [2, 0, 5, 5]];
  let prev = countRemaining([]);
  for (let k = 1; k <= guesses.length; k += 1) {
    const history = guesses.slice(0, k).map((guess) => ({ guess, feedback: evaluate(guess, secret) }));
    const now = countRemaining(history);
    assert.ok(now <= prev, `${now} <= ${prev}`);
    prev = now;
  }
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join(', ')}` : ''}`);
process.exit(failed ? 1 : 0);
