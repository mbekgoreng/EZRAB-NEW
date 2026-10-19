/**
 * ArcadeNonogram ("Bongkar Gambar: Piksel Proyek") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/nonogram/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  lineClue, computeClues, solutionAt, checkWin, emptyMarks,
  scoreFor, findHintCell, rowComplete, colComplete, PUZZLES,
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

console.log('\n[1] lineClue');
test('run tunggal', () => assert.deepEqual(lineClue('0001110000'), [3]));
test('beberapa run', () => assert.deepEqual(lineClue('11001110'), [2, 3]));
test('baris kosong -> []', () => assert.deepEqual(lineClue('0000000000'), []));
test('baris penuh -> [10]', () => assert.deepEqual(lineClue('1111111111'), [10]));

console.log('\n[2] computeClues + puzzle integrity');
test('3 puzzle bawaan, semua 10x10 valid', () => {
  assert.equal(PUZZLES.length, 3);
  for (const p of PUZZLES) {
    assert.equal(p.grid.length, 10, `${p.id} rows`);
    for (const row of p.grid) {
      assert.equal(row.length, 10, `${p.id} cols`);
      assert.ok(/^[01]{10}$/.test(row), `${p.id} chars`);
    }
  }
});
test('petunjuk palu baris-1 = [4]', () => {
  const { rows } = computeClues(PUZZLES[0].grid);
  assert.deepEqual(rows[1], [4]);
});
test('petunjuk crane baris-4 (jib) = [10]', () => {
  const { rows } = computeClues(PUZZLES[2].grid);
  assert.deepEqual(rows[4], [10]);
});
test('petunjuk helm baris-7 (brim) = [10]', () => {
  const { rows } = computeClues(PUZZLES[1].grid);
  assert.deepEqual(rows[7], [10]);
});
test('setiap puzzle punya >= 20 sel solusi', () => {
  for (const p of PUZZLES) {
    let n = 0;
    for (const row of p.grid) for (const ch of row) if (ch === '1') n += 1;
    assert.ok(n >= 20, `${p.id} hanya ${n} sel`);
  }
});

console.log('\n[3] checkWin / solutionAt / rowCol');
test('papan kosong belum menang', () => {
  assert.equal(checkWin(PUZZLES[0].grid, emptyMarks()), false);
});
test('papan persis solusi = menang', () => {
  const grid = PUZZLES[0].grid;
  const marks = grid.map((row) => row.split('').map((ch) => (ch === '1' ? 1 : 0) as 1 | 0));
  assert.equal(checkWin(grid, marks), true);
});
test('satu sel solusi belum terisi = belum menang', () => {
  const grid = PUZZLES[0].grid;
  const marks = grid.map((row) => row.split('').map((ch) => (ch === '1' ? 1 : 0) as 1 | 0));
  marks[1][3] = 0;
  assert.equal(checkWin(grid, marks), false);
});
test('sel terisi di luar solusi = belum menang', () => {
  const grid = PUZZLES[0].grid;
  const marks = grid.map((row) => row.split('').map((ch) => (ch === '1' ? 1 : 0) as 1 | 0));
  marks[0][0] = 1;
  assert.equal(checkWin(grid, marks), false);
});
test('solutionAt membaca grid', () => {
  assert.equal(solutionAt(PUZZLES[0].grid, 1, 3), true);
  assert.equal(solutionAt(PUZZLES[0].grid, 0, 0), false);
});
test('rowComplete & colComplete', () => {
  const grid = PUZZLES[0].grid;
  const marks = emptyMarks();
  assert.equal(rowComplete(grid, marks, 0), true); // baris kosong = lengkap
  assert.equal(rowComplete(grid, marks, 1), false);
  assert.equal(colComplete(grid, marks, 0), true); // kolom kosong = lengkap
  assert.equal(colComplete(grid, marks, 3), false);
});

console.log('\n[4] scoreFor & findHintCell');
test('skor sempurna = 1000', () => assert.equal(scoreFor(0, 0, 0), 1000));
test('skor berkurang & dijepit min 100', () => {
  assert.ok(scoreFor(3, 1, 60) < 1000);
  assert.equal(scoreFor(50, 50, 9999), 100);
});
test('findHintCell null bila papan sudah penuh', () => {
  const grid = PUZZLES[0].grid;
  const marks = grid.map((row) => row.split('').map((ch) => (ch === '1' ? 1 : 0) as 1 | 0));
  assert.equal(findHintCell(grid, marks), null);
});
test('findHintCell menunjuk sel solusi yang belum terisi', () => {
  const grid = PUZZLES[0].grid;
  const cell = findHintCell(grid, emptyMarks());
  assert.ok(cell !== null);
  if (cell) assert.equal(solutionAt(grid, cell.r, cell.c), true);
});

console.log(`\n${passed} lulus, ${failed} gagal${failed > 0 ? `: ${failures.join(', ')}` : ''}`);
process.exit(failed > 0 ? 1 : 0);
