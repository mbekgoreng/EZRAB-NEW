/**
 * Selamatkan Tukang — logic tests. Run: npx tsx src/game-space/games/arcade/hangman/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  CATEGORIES, MAX_WRONG, newGame, guessLetter, maskedWord,
  isWon, isLost, livesLeft, hintLetter, collapsedPart,
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

const CAT = CATEGORIES[0];

console.log('\n[hangman] setup');
test('kategori konstruksi valid & kata A-Z', () => {
  assert.ok(CATEGORIES.length >= 4);
  for (const c of CATEGORIES) {
    assert.ok(c.words.length >= 8, c.id);
    for (const w of c.words) assert.match(w, /^[A-Z]{2,}$/, `${c.id}:${w}`);
  }
  assert.equal(CAT.id, 'material');
});
test('newGame mulai bersih', () => {
  const g = newGame(CAT, () => 0);
  assert.equal(g.word, CAT.words[0]);
  assert.equal(g.wrong, 0);
  assert.equal(g.guessed.size, 0);
});

console.log('\n[hangman] tebakan');
test('tebakan benar tidak menambah wrong', () => {
  const g = newGame(CAT, () => 0); // SEMEN
  assert.equal(guessLetter(g, 'e'), 'hit');
  assert.equal(guessLetter(g, 'E'), 'repeat');
  assert.equal(g.wrong, 0);
  assert.deepEqual(maskedWord(g), ['_', 'E', '_', 'E', '_']);
});
test('tebakan salah menambah wrong', () => {
  const g = newGame(CAT, () => 0);
  assert.equal(guessLetter(g, 'Z'), 'miss');
  assert.equal(livesLeft(g), MAX_WRONG - 1);
});
test('menang saat semua huruf terbuka', () => {
  const g = newGame(CAT, () => 0); // SEMEN
  for (const ch of ['S', 'E', 'M', 'N']) guessLetter(g, ch);
  assert.ok(isWon(g));
  assert.equal(guessLetter(g, 'X'), 'done');
});
test('kalah setelah 6 salah', () => {
  const g = newGame(CAT, () => 0); // SEMEN
  for (const ch of ['A', 'B', 'C', 'D', 'F', 'G']) guessLetter(g, ch);
  assert.ok(isLost(g));
  assert.equal(g.wrong, MAX_WRONG);
});
test('hintLetter memberi huruf yang ada di kata', () => {
  const g = newGame(CAT, () => 0); // SEMEN
  const h = hintLetter(g);
  assert.ok(h && g.word.includes(h) && !g.guessed.has(h));
});
test('collapsedPart menamai tiap tahap roboh', () => {
  assert.equal(collapsedPart(0), '');
  assert.ok(collapsedPart(1).length > 3);
  assert.ok(collapsedPart(6).includes('ROBOH'));
  assert.equal(collapsedPart(99), collapsedPart(6));
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` (${failures.join(', ')})` : ''}`);
process.exit(failed ? 1 : 0);
