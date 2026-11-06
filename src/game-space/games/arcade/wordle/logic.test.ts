/**
 * Tebak Kata — logic tests. Run: npx tsx src/game-space/games/arcade/wordle/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  WORDS, WORD_LEN, MAX_GUESSES, pickWord, pickNextWord, isValidGuess, scoreGuess,
  recordResult, emptyStats, keyStatus,
} from './logic';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn(); passed += 1;
    console.log(`  PASS ${name}`);
  } catch (e) {
    failed += 1; failures.push(name);
    console.log(`  FAIL ${name} — ${(e as Error).message}`);
  }
}

console.log('\n[wordle] kata');
test('semua kata tepat 5 huruf A-Z, unik, jumlah ≥ 100', () => {
  assert.ok(WORDS.length >= 100, `hanya ${WORDS.length} kata`);
  for (const w of WORDS) assert.match(w, /^[A-Z]{5}$/, w);
  assert.equal(new Set(WORDS).size, WORDS.length, 'ada duplikat');
});
test('pickWord mengembalikan kata dari daftar', () => {
  for (let i = 0; i < 20; i += 1) assert.ok(WORDS.includes(pickWord()));
});
test('pickNextWord tidak pernah mengulang kata ronde sebelumnya', () => {
  const prev = WORDS[10];
  // Sapu seluruh rentang rng: hasil selalu kata sah dan tidak pernah `prev`.
  for (let i = 0; i < 200; i += 1) {
    const w = pickNextWord(prev, () => i / 200);
    assert.ok(WORDS.includes(w), w);
    assert.notEqual(w, prev);
  }
  // Rng yang pada pickWord tepat menunjuk `prev` pun harus bergeser ke kata lain.
  const idxPrev = WORDS.indexOf(prev);
  assert.equal(pickWord(() => idxPrev / WORDS.length), prev);
  assert.notEqual(pickNextWord(prev, () => idxPrev / WORDS.length), prev);
});
test('pickNextWord: rantai sesi panjang tanpa pengulangan berurutan', () => {
  let seed = 42;
  const lcg = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  let prev = pickNextWord(null, lcg);
  for (let round = 0; round < 60; round += 1) {
    const next = pickNextWord(prev, lcg);
    assert.notEqual(next, prev, `ronde ${round}`);
    prev = next;
  }
});
test('pickNextWord: previous kosong/tidak dikenal setara undian biasa', () => {
  for (const prev of [null, undefined, '', 'XXXXX']) {
    const w = pickNextWord(prev, () => 0);
    assert.ok(WORDS.includes(w), w);
  }
  // Huruf kecil pada previous tetap dikenali sebagai kata yang sama.
  assert.notEqual(pickNextWord(WORDS[0].toLowerCase(), () => 0), WORDS[0]);
});

console.log('\n[wordle] validasi');
test('isValidGuess', () => {
  assert.ok(isValidGuess('ANGIN'));
  assert.ok(isValidGuess('angin'));
  assert.ok(!isValidGuess('ANGI'));
  assert.ok(!isValidGuess('ANGINN'));
  assert.ok(!isValidGuess('ANG1N'));
});

console.log('\n[wordle] penilaian');
test('semua benar', () => {
  assert.deepEqual(scoreGuess('BETON', 'BETON'), ['correct', 'correct', 'correct', 'correct', 'correct']);
});
test('semua salah', () => {
  assert.deepEqual(scoreGuess('BIAYA', 'SEMEN'), ['absent', 'absent', 'absent', 'absent', 'absent']);
});
test('present + correct campuran', () => {
  // jawaban SLOOF, tebakan KOLOM
  assert.deepEqual(scoreGuess('KOLOM', 'SLOOF'), ['absent', 'present', 'present', 'correct', 'absent']);
});
test('huruf ganda: tebakan punya 2, jawaban 1 -> hanya 1 present', () => {
  // jawaban PASIR (S x1), tebakan SAKSI (S di pos 0 & 3)
  assert.deepEqual(scoreGuess('SAKSI', 'PASIR'), ['present', 'correct', 'absent', 'absent', 'present']);
});
test('huruf ganda: correct didahulukan dari present', () => {
  // jawaban PASIR, tebakan PARIT
  assert.deepEqual(scoreGuess('PARIT', 'PASIR'), ['correct', 'correct', 'present', 'correct', 'absent']);
});
test('huruf ganda: kelebihan huruf tebakan sesudah kuota jawaban habis -> absent', () => {
  // jawaban PASIR (R x1, A x1), tebakan RARAT (R x2, A x2):
  // R pertama present (memakai satu-satunya R), R kedua absent;
  // A pertama correct (memakai satu-satunya A), A kedua absent.
  assert.deepEqual(scoreGuess('RARAT', 'PASIR'), ['present', 'correct', 'absent', 'absent', 'absent']);
});
test('huruf ganda: jawaban 2x, tebakan 1x di luar posisi -> present dari sisa', () => {
  // jawaban HEBEL (E x2 di pos 1 & 3), tebakan EMBER (E di pos 0 & 3):
  // pos 3 correct memakai satu E; E di pos 0 present dari E sisa di pos 1.
  // (B di pos 2 juga exact di kedua kata -> correct.)
  assert.deepEqual(scoreGuess('EMBER', 'HEBEL'), ['present', 'absent', 'correct', 'correct', 'absent']);
});

console.log('\n[wordle] statistik');
test('recordResult menang/kalah & streak', () => {
  let s = emptyStats();
  s = recordResult(s, true, 3);
  assert.equal(s.played, 1); assert.equal(s.won, 1);
  assert.equal(s.streak, 1); assert.equal(s.maxStreak, 1);
  assert.equal(s.dist[2], 1);
  s = recordResult(s, false, 6);
  assert.equal(s.played, 2); assert.equal(s.streak, 0); assert.equal(s.maxStreak, 1);
});
test('keyStatus ambil mark terbaik', () => {
  const ks = keyStatus([
    { guess: 'BETON', marks: ['absent', 'absent', 'absent', 'absent', 'absent'] },
    { guess: 'SEMEN', marks: ['present', 'correct', 'absent', 'absent', 'absent'] },
  ]);
  assert.equal(ks.S, 'present');
  assert.equal(ks.E, 'correct');
  assert.equal(ks.N, 'absent');
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` (${failures.join(', ')})` : ''}`);
process.exit(failed ? 1 : 0);
