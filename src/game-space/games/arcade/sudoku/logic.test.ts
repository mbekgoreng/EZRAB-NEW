/**
 * ArcadeSudoku — logic tests.
 * Run: npx tsx src/game-space/games/arcade/sudoku/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  generateSolution, generatePuzzle, countSolutions, isValidPlacement,
  isCompleteValid, conflictsAt, findHint, fmtTime, emptyGrid,
  MATERIALS, DIFFICULTY_INFO, DIFFICULTIES,
  type Grid,
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

function seqRng(seed = 12345): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

console.log('\n[1] material & difficulty');
test('9 material unik berikon', () => {
  assert.equal(MATERIALS.length, 10); // indeks 0 kosong + 9
  const ikons = MATERIALS.slice(1).map((m) => m.ikon);
  assert.equal(new Set(ikons).size, 9);
  assert.ok(MATERIALS.slice(1).every((m) => m.nama.length > 0));
});
test('4 difficulty terdefinisi', () => {
  assert.deepEqual(DIFFICULTIES, ['mudah', 'sedang', 'sulit', 'ekstrem']);
  assert.ok(DIFFICULTY_INFO.mudah.givens > DIFFICULTY_INFO.ekstrem.givens);
});

console.log('\n[2] generateSolution');
test('solusi valid & lengkap', () => {
  const sol = generateSolution(seqRng(7));
  assert.ok(isCompleteValid(sol), 'harus valid penuh');
  assert.ok(sol.every((v) => v >= 1 && v <= 9));
});
test('solusi deterministik dengan seed sama', () => {
  const a = generateSolution(seqRng(99));
  const b = generateSolution(seqRng(99));
  assert.deepEqual(a, b);
});
test('seed beda → solusi beda (kemungkinan besar)', () => {
  const a = generateSolution(seqRng(1));
  const b = generateSolution(seqRng(2));
  assert.ok(a.some((v, i) => v !== b[i]));
});

console.log('\n[3] generatePuzzle (mudah & sedang — cepat)');
for (const d of ['mudah', 'sedang'] as const) {
  test(`puzzle ${d}: solusi unik`, () => {
    const p = generatePuzzle(seqRng(d === 'mudah' ? 11 : 22), d);
    assert.equal(countSolutions(p.puzzle, 2), 1);
  });
  test(`puzzle ${d}: givens ≈ target`, () => {
    const p = generatePuzzle(seqRng(d === 'mudah' ? 33 : 44), d);
    const target = DIFFICULTY_INFO[d].givens;
    assert.ok(
      p.givens >= target - 3 && p.givens <= target + 8,
      `givens=${p.givens}, target=${target}`,
    );
  });
  test(`puzzle ${d}: soal konsisten dengan solusi`, () => {
    const p = generatePuzzle(seqRng(d === 'mudah' ? 55 : 66), d);
    for (let i = 0; i < 81; i += 1) {
      if (p.puzzle[i] !== 0) assert.equal(p.puzzle[i], p.solution[i]);
    }
    assert.ok(isCompleteValid(p.solution));
  });
}

console.log('\n[4] aturan penempatan');
test('isValidPlacement menolak duplikat baris', () => {
  const g = emptyGrid();
  g[0] = 5;
  assert.ok(!isValidPlacement(g, 1, 5));
  assert.ok(isValidPlacement(g, 1, 3));
});
test('isValidPlacement menolak duplikat kolom & box', () => {
  const g = emptyGrid();
  g[0] = 5;
  assert.ok(!isValidPlacement(g, 9, 5)); // kolom
  assert.ok(!isValidPlacement(g, 10, 5)); // box
  assert.ok(isValidPlacement(g, 40, 5)); // jauh
});
test('conflictsAt menemukan konflik', () => {
  const g = emptyGrid();
  g[0] = 5;
  g[1] = 5;
  assert.deepEqual(conflictsAt(g, 0), [1]);
  assert.deepEqual(conflictsAt(g, 5), []);
});

console.log('\n[5] hint & util');
test('findHint menunjuk sel salah/kosong dengan nilai solusi', () => {
  const p = generatePuzzle(seqRng(77), 'mudah');
  const g = p.puzzle.slice();
  const hint = findHint(g, p.solution, seqRng(5));
  assert.ok(hint !== null);
  assert.equal(hint!.value, p.solution[hint!.idx]);
  assert.ok(g[hint!.idx] !== p.solution[hint!.idx]);
});
test('findHint null saat selesai', () => {
  const p = generatePuzzle(seqRng(78), 'mudah');
  assert.equal(findHint(p.solution.slice(), p.solution, seqRng(5)), null);
});
test('fmtTime', () => {
  assert.equal(fmtTime(0), '0:00');
  assert.equal(fmtTime(65), '1:05');
  assert.equal(fmtTime(600), '10:00');
});
test('isCompleteValid menolak grid salah', () => {
  const p = generatePuzzle(seqRng(79), 'mudah');
  const bad = p.solution.slice();
  bad[0] = bad[1]; // duplikat di baris 0
  assert.ok(!isCompleteValid(bad));
  const withZero = p.solution.slice();
  withZero[0] = 0;
  assert.ok(!isCompleteValid(withZero));
});
test('countSolutions grid kosong > 1 (dibatasi)', () => {
  assert.equal(countSolutions(emptyGrid(), 2), 2);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length > 0) console.log('FAILURES:', failures.join(', '));
if (failed > 0) process.exit(1);
