/**
 * Sudoku Tukang — logic tests. Run: npx tsx src/game-space/games/sudoku-tukang/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  generateSolved, countSolutions, generatePuzzle, CLUES,
  createState, setCellValue, eraseCell, toggleNote, useHint, isComplete,
  cellValue, cellWrong, MAX_MISTAKES,
  type Rng, type Difficulty,
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

/** Deterministic seeded RNG (mulberry32). */
function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const groups = (g: number[], pick: (r: number, c: number) => number): number[][] =>
  Array.from({ length: 9 }, (_, k) =>
    Array.from({ length: 9 }, (_, j) => g[pick(k, j)]));

console.log('\n[1] generateSolved validity');
test('baris 1..9', () => {
  const g = generateSolved(mulberry32(1));
  for (const row of groups(g, (r, c) => r * 9 + c)) {
    assert.deepEqual([...row].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  }
});
test('kolom 1..9', () => {
  const g = generateSolved(mulberry32(2));
  for (const col of groups(g, (r, c) => c * 9 + r)) {
    assert.deepEqual([...col].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  }
});
test('box 3x3 1..9', () => {
  const g = generateSolved(mulberry32(3));
  for (let br = 0; br < 3; br += 1) {
    for (let bc = 0; bc < 3; bc += 1) {
      const cells: number[] = [];
      for (let dr = 0; dr < 3; dr += 1) {
        for (let dc = 0; dc < 3; dc += 1) {
          cells.push(g[(br * 3 + dr) * 9 + (bc * 3 + dc)]);
        }
      }
      assert.deepEqual(cells.sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    }
  }
});
test('deterministik: seed sama → grid sama', () => {
  assert.deepEqual(generateSolved(mulberry32(9)), generateSolved(mulberry32(9)));
});
test('seed beda → grid beda (hampir pasti)', () => {
  assert.notDeepEqual(generateSolved(mulberry32(10)), generateSolved(mulberry32(11)));
});

console.log('\n[2] countSolutions');
test('grid penuh → tepat 1 solusi', () => {
  const g = generateSolved(mulberry32(4));
  assert.equal(countSolutions(g, 2), 1);
});
test('grid kosong → berhenti di limit', () => {
  const empty = new Array(81).fill(null);
  assert.equal(countSolutions(empty, 2), 2);
  assert.equal(countSolutions(empty, 1), 1);
});

console.log('\n[3] generatePuzzle');
const diffs: Difficulty[] = ['gampang', 'sedang', 'sulit', 'ahli'];
for (const d of diffs) {
  test(`clue ${d} == ${CLUES[d]}`, () => {
    const p = generatePuzzle(d, mulberry32(42));
    assert.equal(p.clues, CLUES[d]);
    assert.equal(p.puzzle.filter((v) => v !== null).length, CLUES[d]);
  });
  test(`solusi ${d} unik`, () => {
    const p = generatePuzzle(d, mulberry32(7));
    assert.equal(countSolutions(p.puzzle, 2), 1);
  });
}
test('puzzle subset dari solution', () => {
  const p = generatePuzzle('sedang', mulberry32(1337));
  for (let i = 0; i < 81; i += 1) {
    const v = p.puzzle[i];
    if (v !== null) assert.equal(v, p.solution[i]);
  }
});
test('generate < 2 detik (ahli)', () => {
  const t0 = Date.now();
  generatePuzzle('ahli', mulberry32(99));
  assert.ok(Date.now() - t0 < 2000, `took ${Date.now() - t0}ms`);
});

console.log('\n[4] gameplay state');
const mkState = () => {
  const p = generatePuzzle('gampang', mulberry32(5));
  return createState(p.puzzle, p.solution);
};
const firstOpen = (p: ReturnType<typeof generatePuzzle>) => p.puzzle.findIndex((v) => v === null);

test('setCellValue benar → ok tanpa mistake', () => {
  const p = generatePuzzle('gampang', mulberry32(5));
  const s = createState(p.puzzle, p.solution);
  const i = firstOpen(p);
  const r = setCellValue(s, i, p.solution[i]);
  assert.equal(r.ok, true);
  assert.equal(r.mistake, false);
  assert.equal(s.mistakes, 0);
  assert.equal(cellValue(s, i), p.solution[i]);
});
test('setCellValue salah → mistake + counter naik', () => {
  const p = generatePuzzle('gampang', mulberry32(5));
  const s = createState(p.puzzle, p.solution);
  const i = firstOpen(p);
  const wrong = (p.solution[i] % 9) + 1;
  const r = setCellValue(s, i, wrong);
  assert.equal(r.ok, true);
  assert.equal(r.mistake, true);
  assert.equal(s.mistakes, 1);
  assert.equal(cellWrong(s, i), true);
});
test(`${MAX_MISTAKES}x salah → gameOver`, () => {
  const p = generatePuzzle('gampang', mulberry32(5));
  const s = createState(p.puzzle, p.solution);
  let r = { ok: false, mistake: false, gameOver: false };
  for (let k = 0; k < MAX_MISTAKES; k += 1) {
    const i = firstOpen(p);
    eraseCell(s, i);
    r = setCellValue(s, i, (p.solution[i] % 9) + 1);
  }
  assert.equal(s.mistakes, MAX_MISTAKES);
  assert.equal(r.gameOver, true);
});
test('sel terkunci tidak bisa diubah', () => {
  const p = generatePuzzle('gampang', mulberry32(5));
  const s = createState(p.puzzle, p.solution);
  const i = p.puzzle.findIndex((v) => v !== null);
  assert.equal(setCellValue(s, i, 5).ok, false);
  assert.equal(eraseCell(s, i), false);
});
test('eraseCell menghapus input user', () => {
  const p = generatePuzzle('gampang', mulberry32(5));
  const s = createState(p.puzzle, p.solution);
  const i = firstOpen(p);
  setCellValue(s, i, p.solution[i]);
  assert.equal(eraseCell(s, i), true);
  assert.equal(cellValue(s, i), null);
});
test('toggleNote tambah/hapus catatan', () => {
  const p = generatePuzzle('gampang', mulberry32(5));
  const s = createState(p.puzzle, p.solution);
  const i = firstOpen(p);
  assert.equal(toggleNote(s, i, 3), true);
  assert.deepEqual(s.notes[i], [3]);
  assert.equal(toggleNote(s, i, 3), true);
  assert.deepEqual(s.notes[i], []);
});
test('toggleNote ditolak di sel terkunci/terisi', () => {
  const p = generatePuzzle('gampang', mulberry32(5));
  const s = createState(p.puzzle, p.solution);
  const lockedI = p.puzzle.findIndex((v) => v !== null);
  assert.equal(toggleNote(s, lockedI, 3), false);
  const openI = firstOpen(p);
  setCellValue(s, openI, p.solution[openI]);
  assert.equal(toggleNote(s, openI, 3), false);
});
test('useHint mengisi jawaban benar & kurangi stok', () => {
  const p = generatePuzzle('gampang', mulberry32(5));
  const s = createState(p.puzzle, p.solution, 3);
  const i = useHint(s);
  assert.notEqual(i, null);
  assert.equal(s.hintsLeft, 2);
  assert.equal(cellValue(s, i as number), p.solution[i as number]);
  assert.equal(cellWrong(s, i as number), false);
});
test('useHint habis → null', () => {
  const p = generatePuzzle('gampang', mulberry32(5));
  const s = createState(p.puzzle, p.solution, 1);
  useHint(s);
  assert.equal(useHint(s), null);
});
test('isComplete: false di awal, true saat semua benar', () => {
  const p = generatePuzzle('gampang', mulberry32(5));
  const s = createState(p.puzzle, p.solution);
  assert.equal(isComplete(s), false);
  for (let i = 0; i < 81; i += 1) {
    if (!s.locked[i]) setCellValue(s, i, p.solution[i]);
  }
  assert.equal(isComplete(s), true);
});
test('isComplete false bila ada yang salah', () => {
  const p = generatePuzzle('gampang', mulberry32(5));
  const s = createState(p.puzzle, p.solution);
  const i = firstOpen(p);
  setCellValue(s, i, (p.solution[i] % 9) + 1);
  assert.equal(isComplete(s), false);
});

console.log('\n[5] uniqueness sweep: 8 seed × 4 difficulty (programmatic)');
for (const d of diffs) {
  test(`semua puzzle ${d} solusi UNIK & clue tepat (8 seed)`, () => {
    for (let sd = 0; sd < 8; sd += 1) {
      const p = generatePuzzle(d, mulberry32(7000 + sd * 131 + d.length * 17));
      assert.equal(countSolutions(p.puzzle, 2), 1, `seed ${sd}: solusi tidak unik`);
      assert.equal(p.clues, CLUES[d], `seed ${sd}: clue ${p.clues} != ${CLUES[d]}`);
      assert.equal(
        p.puzzle.filter((v) => v !== null).length,
        CLUES[d],
        `seed ${sd}: clue fisik tidak cocok`,
      );
      for (let i = 0; i < 81; i += 1) {
        if (p.puzzle[i] !== null) assert.equal(p.puzzle[i], p.solution[i], `seed ${sd}: clue bukan subset solusi`);
      }
    }
  });
}
test('salah di sel yang sudah benar tetap dihitung (koreksi jadi salah)', () => {
  const p = generatePuzzle('gampang', mulberry32(5));
  const s = createState(p.puzzle, p.solution);
  const i = firstOpen(p);
  setCellValue(s, i, p.solution[i]); // benar dulu
  assert.equal(s.mistakes, 0);
  const r = setCellValue(s, i, (p.solution[i] % 9) + 1); // diganti salah
  assert.equal(r.mistake, true);
  assert.equal(s.mistakes, 1);
});
test('nilai sama berulang tidak dihitung ganda', () => {
  const p = generatePuzzle('gampang', mulberry32(5));
  const s = createState(p.puzzle, p.solution);
  const i = firstOpen(p);
  const wrong = (p.solution[i] % 9) + 1;
  setCellValue(s, i, wrong);
  const r = setCellValue(s, i, wrong);
  assert.equal(r.ok, true);
  assert.equal(r.mistake, false);
  assert.equal(s.mistakes, 1);
});
test('notes tidak mempengaruhi isComplete/validasi', () => {
  const p = generatePuzzle('gampang', mulberry32(5));
  const s = createState(p.puzzle, p.solution);
  for (let i = 0; i < 81; i += 1) {
    if (!s.locked[i]) {
      toggleNote(s, i, 1);
      toggleNote(s, i, 9);
      setCellValue(s, i, p.solution[i]); // notes ikut terhapus saat diisi
      assert.deepEqual(s.notes[i], []);
    }
  }
  assert.equal(isComplete(s), true);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('failures:', failures.join(', '));
  process.exit(1);
}
