/**
 * Arcade2048 — logic tests.
 * Run: npx tsx src/game-space/games/arcade/2048/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  createGame, move, canMove, undo, spawnTile, emptyGrid, cloneGrid,
  tierOf, tileName, tileIcon, TIERS, MAX_TIER, WIN_VALUE, N,
  type G2048, type Grid,
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

// rng: selalu pilih sel pertama & tier1 (2)
const rngFirst = () => 0.0;

function withGrid(rows: number[][]): G2048 {
  const st = createGame(rngFirst);
  st.grid = rows.map((r) => r.slice());
  st.undoStack = [];
  return st;
}

console.log('\n[1] createGame & spawn');
test('awal: 2 ubin, skor 0', () => {
  const st = createGame(rngFirst);
  const filled = st.grid.flat().filter((v) => v !== 0).length;
  assert.equal(filled, 2);
  assert.equal(st.score, 0);
  assert.ok(!st.over);
});
test('spawnTile di grid penuh → false', () => {
  const g = emptyGrid();
  for (let r = 0; r < N; r += 1) for (let c = 0; c < N; c += 1) g[r][c] = 2;
  assert.ok(!spawnTile(g, rngFirst));
});

console.log('\n[2] geser & gabung');
test('geser kiri sederhana', () => {
  const st = withGrid([
    [2, 0, 0, 2],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const res = move(st, 'left', () => 0.999); // spawn di sel terakhir
  assert.ok(res.moved);
  assert.equal(st.grid[0][0], 4, '2+2 bergabung');
  assert.equal(res.gained, 4);
  assert.equal(st.score, 4);
});
test('gabung sekali per langkah (tidak chain)', () => {
  const st = withGrid([
    [2, 2, 4, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  move(st, 'left', () => 0.999);
  // baris jadi [4,4,...] lalu spawn; pastikan dua 4 tidak gabung jadi 8
  const row = st.grid[0].slice(0, 2);
  assert.deepEqual(row, [4, 4]);
});
test('geser kanan', () => {
  const st = withGrid([
    [2, 2, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  move(st, 'right', () => 0.999);
  assert.equal(st.grid[0][3], 4);
});
test('geser atas & bawah', () => {
  const st = withGrid([
    [2, 0, 0, 0],
    [2, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  move(st, 'up', () => 0.999);
  assert.equal(st.grid[0][0], 4);
  const st2 = withGrid([
    [2, 0, 0, 0],
    [2, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  move(st2, 'down', () => 0.999);
  assert.equal(st2.grid[3][0], 4);
});
test('langkah buntu → moved false, tanpa spawn', () => {
  const st = withGrid([
    [2, 4, 2, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [4, 2, 4, 2],
  ]);
  const before = JSON.stringify(st.grid);
  const res = move(st, 'left', rngFirst);
  assert.ok(!res.moved);
  assert.equal(JSON.stringify(st.grid), before);
  assert.equal(res.gained, 0);
});
test('mergedCells terisi untuk juice', () => {
  const st = withGrid([
    [4, 4, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const res = move(st, 'left', () => 0.999);
  assert.ok(res.mergedCells.length >= 1);
  assert.equal(res.mergedCells[0].tier, 3); // 8 = tier 3
});

console.log('\n[3] menang & kalah');
test('mencapai 2048 → won', () => {
  const st = withGrid([
    [1024, 1024, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const res = move(st, 'left', () => 0.999);
  assert.ok(res.won);
  assert.ok(st.won);
  assert.equal(st.grid[0][0], WIN_VALUE);
});
test('grid buntu total → over', () => {
  const g = [
    [2, 4, 2, 4],
    [8, 16, 8, 16],
    [2, 4, 2, 4],
    [8, 16, 8, 16],
  ];
  assert.ok(!canMove(g));
  const st = withGrid(g);
  // buat satu langkah legal dulu: ubah satu sel agar bisa gabung
  st.grid[0][0] = 4; // [4,4,2,4] → bisa gabung
  const res = move(st, 'left', rngFirst);
  assert.ok(res.moved);
});
test('canMove true bila ada sel kosong', () => {
  const g = emptyGrid();
  g[0][0] = 2;
  assert.ok(canMove(g));
});

console.log('\n[4] undo');
test('undo mengembalikan grid & skor', () => {
  const st = withGrid([
    [2, 2, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const before = cloneGrid(st.grid);
  move(st, 'left', () => 0.999);
  assert.ok(st.score > 0);
  assert.ok(undo(st));
  assert.deepEqual(st.grid, before);
  assert.equal(st.score, 0);
});
test('undo kosong → false', () => {
  const st = createGame(rngFirst);
  assert.ok(!undo(st));
});

console.log('\n[5] tier & nama');
test('11 tier terdefinisi', () => {
  assert.equal(TIERS.length, 11);
  assert.equal(MAX_TIER, 11);
  assert.equal(WIN_VALUE, 2048);
});
test('tierOf & tileName & tileIcon', () => {
  assert.equal(tierOf(2), 1);
  assert.equal(tierOf(2048), 11);
  assert.equal(tileName(2), 'Bata');
  assert.equal(tileName(2048), 'Pencakar Langit');
  assert.equal(tileIcon(4), '🪨');
  assert.equal(tileName(0), '0');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length > 0) console.log('FAILURES:', failures.join(', '));
if (failed > 0) process.exit(1);
