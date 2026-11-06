/**
 * ArcadeNonogram ("Bongkar Gambar: Piksel Proyek") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/nonogram/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  lineClue, computeClues, solutionAt, checkWin, emptyMarks,
  scoreFor, findHintCell, rowComplete, colComplete, PUZZLES,
  filledRuns, clueSatisfied, rowClueSatisfied, colClueSatisfied, pauseToggleFor,
  type CellMark,
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

console.log('\n[5] clueSatisfied — petunjuk terpenuhi secara live (pola, tanpa solusi)');
const line = (s: string): CellMark[] => s.split('').map((ch) => Number(ch) as CellMark);
test('filledRuns membaca run isian, silang & kosong memisahkan', () => {
  assert.deepEqual(filledRuns(line('1102110010')), [2, 2, 1]);
  assert.deepEqual(filledRuns(line('0002220000')), []);
});
test('run persis petunjuk -> satisfied', () => assert.equal(clueSatisfied([4], line('0001111000')), true));
test('isian kurang dari petunjuk -> belum', () => assert.equal(clueSatisfied([4], line('0001110000')), false));
test('isian berlebih dari petunjuk -> belum (bukan sekadar >=)', () => assert.equal(clueSatisfied([4], line('0001111100')), false));
test('beberapa run harus cocok semua & urutannya', () => {
  assert.equal(clueSatisfied([2, 3], line('1100111000')), true);
  assert.equal(clueSatisfied([2, 3], line('1111100000')), false); // run menyatu [5]
  assert.equal(clueSatisfied([3, 2], line('1100111000')), false); // urutan terbalik
});
test('petunjuk kosong [] terpenuhi hanya bila tak ada isian', () => {
  assert.equal(clueSatisfied([], line('0002220000')), true);
  assert.equal(clueSatisfied([], line('0001000000')), false);
});
test('silang menutup run: [2] satisfied walau sisa sel belum ditandai', () => {
  assert.equal(clueSatisfied([2], line('0011200000')), true);
});
test('DISKRIMINATIF vs rowComplete: pola bergeser satisfied di clueSatisfied, ditolak rowComplete', () => {
  // baris-1 palu: solusi di kolom 3-6 (petunjuk [4]); pemain "mengisi" kolom 0-3.
  const marks = emptyMarks();
  marks[1] = line('1111000000');
  assert.equal(clueSatisfied([4], marks[1]), true); // murni pola run — tidak membaca solusi
  assert.equal(rowComplete(PUZZLES[0].grid, marks, 1), false); // pembaca solusi menolak
});
test('rowClueSatisfied pada puzzle nyata', () => {
  const grid = PUZZLES[0].grid;
  const marks = emptyMarks();
  assert.equal(rowClueSatisfied(grid, marks, 0), true); // baris kosong: petunjuk [] sudah terpenuhi
  assert.equal(rowClueSatisfied(grid, marks, 1), false);
  marks[1] = line('0001111000');
  assert.equal(rowClueSatisfied(grid, marks, 1), true);
});
test('colClueSatisfied pada puzzle nyata', () => {
  const grid = PUZZLES[0].grid;
  const marks = emptyMarks();
  assert.equal(colClueSatisfied(grid, marks, 0), true); // kolom kosong
  assert.equal(colClueSatisfied(grid, marks, 3), false);
  for (let r = 0; r < 10; r += 1) marks[r][3] = grid[r][3] === '1' ? 1 : 0;
  assert.equal(colClueSatisfied(grid, marks, 3), true);
});
test('papan selesai: semua baris & kolom clueSatisfied (konsisten dgn checkWin)', () => {
  const grid = PUZZLES[2].grid;
  const marks = grid.map((row) => row.split('').map((ch) => (ch === '1' ? 1 : 0) as CellMark));
  assert.equal(checkWin(grid, marks), true);
  for (let i = 0; i < 10; i += 1) {
    assert.equal(rowClueSatisfied(grid, marks, i), true, `baris ${i}`);
    assert.equal(colClueSatisfied(grid, marks, i), true, `kolom ${i}`);
  }
});

console.log('\n[6] pauseToggleFor — regresi Escape saat terjeda');
test("layar 'play' -> 'pause'", () => assert.equal(pauseToggleFor('play'), 'pause'));
test("layar 'pause' -> 'resume' (dulu tak tercapai: keputusan hidup di update yang dilewati Loop saat jeda)", () => {
  assert.equal(pauseToggleFor('pause'), 'resume');
});
test('layar lain tidak berubah', () => {
  assert.equal(pauseToggleFor('tutorial'), null);
  assert.equal(pauseToggleFor('over'), null);
});

console.log(`\n${passed} lulus, ${failed} gagal${failed > 0 ? `: ${failures.join(', ')}` : ''}`);
process.exit(failed > 0 ? 1 : 0);
