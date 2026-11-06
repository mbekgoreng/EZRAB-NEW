/**
 * Selamatkan Tukang — logic tests. Run: npx tsx src/game-space/games/arcade/hangman/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  CATEGORIES, MAX_WRONG, newGame, guessLetter, maskedWord,
  isWon, isLost, livesLeft, hintLetter, collapsedPart,
  pickWord, difficultyScore, wordsForTier, tierOfWord, newGameInTier, nextTier,
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

console.log('\n[hangman] tingkat kesulitan & progresi');
test('difficultyScore transparan: panjang + unik + langka', () => {
  assert.equal(difficultyScore('SEMEN'), 9); // 5 + 4 unik + 0 langka
  assert.equal(difficultyScore('KAWAT'), 11); // 5 + 4 unik + K langka x2
  assert.ok(difficultyScore('CAT') < difficultyScore('TRIPLEK'));
  assert.ok(difficultyScore('TOL') < difficultyScore('ESTIMATOR'));
});
test('wordsForTier: tiap kategori x tingkat non-kosong, berurutan, tanpa tumpang tindih', () => {
  for (const c of CATEGORIES) {
    const bands = [wordsForTier(c, 1), wordsForTier(c, 2), wordsForTier(c, 3)];
    for (const b of bands) assert.ok(b.length >= 2, `${c.id} pita terlalu tipis`);
    const all = bands.flat();
    assert.equal(all.length, c.words.length, c.id);
    assert.deepEqual([...all].sort(), [...c.words].sort(), c.id);
    // berurutan menurut skor: maks pita bawah <= min pita atas
    for (let i = 0; i < 2; i += 1) {
      const lo = Math.max(...bands[i].map(difficultyScore));
      const hi = Math.min(...bands[i + 1].map(difficultyScore));
      assert.ok(lo <= hi, `${c.id} pita ${i + 1}->${i + 2}: ${lo} <= ${hi}`);
    }
  }
  assert.equal(tierOfWord(CATEGORIES[0], 'CAT'), 1);
  assert.equal(tierOfWord(CATEGORIES[0], 'TRIPLEK'), 3);
});
test('newGameInTier hanya mengambil kata dari pita tingkatnya', () => {
  for (const c of CATEGORIES) {
    for (const t of [1, 2, 3] as const) {
      const pool = wordsForTier(c, t);
      for (const r of [0, 0.37, 0.71, 0.999]) {
        const g = newGameInTier(c, t, () => r);
        assert.ok(pool.includes(g.word), `${c.id} t${t} r${r}: ${g.word}`);
        assert.equal(tierOfWord(c, g.word), t);
      }
    }
  }
  // kata termudah material di tingkat 1 adalah yang berskor terkecil
  assert.equal(newGameInTier(CATEGORIES[0], 1, () => 0).word, 'CAT');
});
test('nextTier: menang naik sampai mentok 3, kalah tetap', () => {
  assert.equal(nextTier(1, true), 2);
  assert.equal(nextTier(2, true), 3);
  assert.equal(nextTier(3, true), 3);
  assert.equal(nextTier(2, false), 2);
  assert.equal(nextTier(1, false), 1);
});

console.log('\n[hangman] regresi bug rng di luar rentang');
test('pickWord/newGame menjepit rng >=1, negatif, dan NaN (dulu word=undefined -> crash)', () => {
  assert.equal(pickWord(CAT.words, () => 1), CAT.words[CAT.words.length - 1]);
  assert.equal(pickWord(CAT.words, () => -0.5), CAT.words[0]);
  const g1 = newGame(CAT, () => 1);
  assert.ok(CAT.words.includes(g1.word));
  assert.equal(guessLetter(g1, 'Z'), g1.word.includes('Z') ? 'hit' : 'miss'); // tidak crash
  const g2 = newGame(CAT, () => Number.NaN);
  assert.ok(CAT.words.includes(g2.word));
  assert.deepEqual(maskedWord(g2).length, g2.word.length);
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` (${failures.join(', ')})` : ''}`);
process.exit(failed ? 1 : 0);
