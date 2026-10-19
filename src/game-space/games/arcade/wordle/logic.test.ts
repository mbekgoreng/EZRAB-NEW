/**
 * Tebak Kata — logic tests. Run: npx tsx src/game-space/games/arcade/wordle/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  WORDS, WORD_LEN, MAX_GUESSES, pickWord, isValidGuess, scoreGuess,
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
