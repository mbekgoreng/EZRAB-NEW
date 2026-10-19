/**
 * Sambung Kata — logic tests. Run: npx tsx src/game-space/games/sambung-kata/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  mulberry32, shuffleSeeded, KOSAKATA, WORD_SET, packWords,
  generateLevel, canForm, isValidWord, submitWord, revealHint,
  levelComplete, nextPosition, appendSelection, PACK_COUNT, LEVELS_PER_PACK,
  MAX_WHEEL_LETTERS, MIN_WHEEL_LETTERS, HINTS_PER_PACK,
  type Level,
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

console.log('\n[1] kosakata');
test('kosakata ≥ 80 kata', () => {
  assert.ok(KOSAKATA.length >= 80, `hanya ${KOSAKATA.length} kata`);
});
test('semua kata A-Z tanpa spasi, unik', () => {
  const seen = new Set<string>();
  for (const w of KOSAKATA) {
    assert.ok(/^[A-Z]+$/.test(w), `kata tidak valid: ${w}`);
    assert.ok(!seen.has(w), `duplikat: ${w}`);
    seen.add(w);
  }
});
test('kata wajib ada (SEMEN, RAB, AHSP, FONDASI)', () => {
  for (const w of ['SEMEN', 'RAB', 'AHSP', 'FONDASI', 'BATA', 'MANDOR']) {
    assert.ok(WORD_SET.has(w), `${w} hilang`);
  }
});

console.log('\n[2] pack filter');
test('pack 1: semua kata ≤ 4 huruf', () => {
  const ws = packWords(0);
  assert.ok(ws.length >= 10, `pack 1 hanya ${ws.length} kandidat`);
  assert.ok(ws.every((w) => w.length <= 4));
});
test('pack 2: semua kata ≤ 6 huruf', () => {
  const ws = packWords(1);
  assert.ok(ws.every((w) => w.length <= 6));
});
test('pack 3: bebas (ada kata > 6 huruf)', () => {
  const ws = packWords(2);
  assert.ok(ws.some((w) => w.length > 6));
});

console.log('\n[3] generator deterministik');
test('generateLevel deterministik untuk seed sama', () => {
  const a = generateLevel(1, 7);
  const b = generateLevel(1, 7);
  assert.deepEqual(a, b);
});
test('level berbeda biasanya berbeda kata', () => {
  const a = generateLevel(0, 0);
  const b = generateLevel(0, 1);
  assert.ok(a.words.join(',') !== b.words.join(','), 'level 0 dan 1 identik?');
});

console.log('\n[4] semua 60 level solvable');
{
  let checked = 0;
  for (let p = 0; p < PACK_COUNT; p += 1) {
    for (let l = 0; l < LEVELS_PER_PACK; l += 1) {
      const lv = generateLevel(p, l);
      test(`pack ${p + 1} level ${l + 1}: 3-6 kata, wheel 6-8, semua kata ⊆ wheel`, () => {
        assert.ok(lv.words.length >= 3 && lv.words.length <= 6, `${lv.words.length} kata`);
        assert.ok(
          lv.letters.length >= MIN_WHEEL_LETTERS && lv.letters.length <= MAX_WHEEL_LETTERS,
          `wheel ${lv.letters.length} huruf`,
        );
        for (const w of lv.words) {
          assert.ok(canForm(w, lv.letters), `kata ${w} tidak bisa dibentuk dari [${lv.letters}]`);
          assert.ok(isValidWord(w), `kata ${w} bukan kata valid`);
        }
      });
      checked += 1;
    }
  }
  test(`total ${PACK_COUNT * LEVELS_PER_PACK} level diperiksa`, () => {
    assert.equal(checked, 60);
  });
}

console.log('\n[5] submit');
const lv: Level = { pack: 0, level: 0, words: ['BATA', 'CAT'], letters: ['B', 'A', 'T', 'C', 'X', 'Y'] };
test('submit benar mengisi slot (target)', () => {
  const r = submitWord(lv, [], 'BATA');
  assert.equal(r.status, 'target');
});
test('submit kata target yang sudah ditemukan → already', () => {
  const r = submitWord(lv, ['BATA'], 'BATA');
  assert.equal(r.status, 'already');
});
test('submit salah tidak mengubah (invalid: bukan kata)', () => {
  const r = submitWord(lv, [], 'BXTA');
  assert.equal(r.status, 'invalid');
});
test('submit kata valid tapi bukan target → other (tanpa penalti)', () => {
  // 'TAC'? bukan kata. pakai kata valid dari kosakata yang formable: 'CAT' target...
  // buat level khusus: target BATA, submit 'BATU'? tidak ada. Gunakan 'ATAP'? tidak formable.
  const lv2: Level = { pack: 1, level: 0, words: ['SEMEN'], letters: ['S', 'E', 'M', 'N', 'B', 'A', 'T', 'X'] };
  const r = submitWord(lv2, [], 'BATA'); // valid, formable, bukan target
  assert.equal(r.status, 'other');
});
test('submit kata yang hurufnya tak ada di wheel → invalid', () => {
  const r = submitWord(lv, [], 'SEMINAR');
  assert.equal(r.status, 'invalid');
});
test('submit case-insensitive', () => {
  const r = submitWord(lv, [], 'bata');
  assert.equal(r.status, 'target');
  assert.equal(r.word, 'BATA');
});

console.log('\n[6] hint & progres');
test('hint membuka huruf pertama kata yang belum ditemukan', () => {
  const h = revealHint(lv, []);
  assert.ok(h !== null);
  assert.equal(h.word, 'BATA');
  assert.equal(h.ch, 'B');
  assert.equal(h.index, 0);
});
test('hint melewati kata yang sudah ditemukan', () => {
  const h = revealHint(lv, ['BATA']);
  assert.ok(h !== null);
  assert.equal(h.word, 'CAT');
});
test('hint null bila semua sudah ditemukan', () => {
  assert.equal(revealHint(lv, ['BATA', 'CAT']), null);
});
test('levelComplete hanya bila semua target ditemukan', () => {
  assert.equal(levelComplete(lv, ['BATA']), false);
  assert.equal(levelComplete(lv, ['BATA', 'CAT']), true);
});
test('nextPosition: naik level, pindah pack, lalu null', () => {
  assert.deepEqual(nextPosition(0, 5), { pack: 0, level: 6 });
  assert.deepEqual(nextPosition(0, 19), { pack: 1, level: 0 });
  assert.equal(nextPosition(2, 19), null);
});
test('konstanta hint & pack', () => {
  assert.equal(HINTS_PER_PACK, 5);
  assert.equal(PACK_COUNT, 3);
  assert.equal(LEVELS_PER_PACK, 20);
});
test('shuffleSeeded deterministik', () => {
  const rng1 = mulberry32(5);
  const rng2 = mulberry32(5);
  assert.deepEqual(shuffleSeeded([1, 2, 3, 4, 5], rng1), shuffleSeeded([1, 2, 3, 4, 5], rng2));
});

console.log('\n[7] seleksi huruf (reuse)');
test('appendSelection mengizinkan huruf dipakai ulang (BATA)', () => {
  let sel: number[] = [];
  sel = appendSelection(sel, 1); // B
  sel = appendSelection(sel, 0); // A
  sel = appendSelection(sel, 2); // T
  sel = appendSelection(sel, 0); // A lagi
  assert.deepEqual(sel, [1, 0, 2, 0]);
});
test('appendSelection mengabaikan pengulangan beruntun', () => {
  const sel = appendSelection([1, 0], 0);
  assert.deepEqual(sel, [1, 0]);
});
test('kata berhuruf ganda tetap bisa disubmit (BATA)', () => {
  const lv2: Level = { pack: 0, level: 0, words: ['BATA'], letters: ['B', 'A', 'T', 'X', 'Y', 'Z'] };
  const r = submitWord(lv2, [], 'BATA');
  assert.equal(r.status, 'target');
});

console.log('\n[8] invarian keras 60 level');
test('wheel: huruf distinct, 6-8; kata unik; urut terpanjang-dulu', () => {
  for (let p = 0; p < PACK_COUNT; p += 1) {
    for (let l = 0; l < LEVELS_PER_PACK; l += 1) {
      const lv = generateLevel(p, l);
      assert.equal(new Set(lv.letters).size, lv.letters.length, `p${p}l${l}: huruf wheel duplikat`);
      assert.ok(
        lv.letters.length >= MIN_WHEEL_LETTERS && lv.letters.length <= MAX_WHEEL_LETTERS,
        `p${p}l${l}: wheel ${lv.letters.length}`,
      );
      assert.equal(new Set(lv.words).size, lv.words.length, `p${p}l${l}: kata duplikat`);
      for (let k = 1; k < lv.words.length; k += 1) {
        assert.ok(
          lv.words[k - 1].length >= lv.words[k].length,
          `p${p}l${l}: kata tidak urut terpanjang dulu`,
        );
      }
    }
  }
});
test('setiap huruf tiap kata target ada di wheel', () => {
  for (let p = 0; p < PACK_COUNT; p += 1) {
    for (let l = 0; l < LEVELS_PER_PACK; l += 1) {
      const lv = generateLevel(p, l);
      const set = new Set(lv.letters);
      for (const w of lv.words) {
        for (const c of w) assert.ok(set.has(c), `p${p}l${l}: huruf ${c} dari ${w} tak ada di wheel`);
      }
    }
  }
});
test('revealHint tak pernah menunjuk kata yang sudah ditemukan', () => {
  for (let p = 0; p < PACK_COUNT; p += 1) {
    for (let l = 0; l < LEVELS_PER_PACK; l += 1) {
      const lv = generateLevel(p, l);
      const found: string[] = [];
      for (const w of lv.words) {
        const h = revealHint(lv, found);
        assert.ok(h !== null && !found.includes(h.word), `p${p}l${l}: hint menunjuk kata lama`);
        found.push(h.word);
      }
      assert.equal(revealHint(lv, found), null, `p${p}l${l}: hint harus null saat tuntas`);
    }
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('failures:', failures.join(', '));
  process.exit(1);
}
