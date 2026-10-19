/**
 * ArcadeMinesweeper ("Cari Pipa Bocor") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/minesweeper/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  DIFFS, emptyBoard, createBoard, openCell, toggleFlag, chord, checkWin, countFlags,
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

console.log('\n[1] DIFFS & emptyBoard');
test('3 tingkat kesulitan', () => {
  assert.deepEqual(Object.keys(DIFFS), ['mudah', 'sedang', 'sulit']);
  assert.equal(DIFFS.mudah.pipes, 10);
  assert.equal(DIFFS.sedang.pipes, 40);
  assert.equal(DIFFS.sulit.pipes, 99);
});
test('emptyBoard ukuran benar, semua tertutup', () => {
  const b = emptyBoard(9, 9);
  assert.equal(b.length, 9);
  assert.equal(b[0].length, 9);
  assert.ok(b.every((row) => row.every((c) => !c.pipe && !c.open && !c.flag && c.n === 0)));
});

console.log('\n[2] createBoard — klik pertama aman');
test('zona 3x3 sekitar klik bebas pipa', () => {
  const b = createBoard(9, 9, 10, 4, 4, () => 0.99);
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      assert.equal(b[4 + dy][4 + dx].pipe, false, `pipa di (${4 + dx},${4 + dy})`);
    }
  }
});
test('jumlah pipa tepat', () => {
  const b = createBoard(16, 16, 40, 8, 8, Math.random);
  let n = 0;
  for (const row of b) for (const c of row) if (c.pipe) n += 1;
  assert.equal(n, 40);
});
test('angka n konsisten dengan tetangga', () => {
  const b = createBoard(9, 9, 10, 0, 0, () => 0.3);
  for (let y = 0; y < 9; y += 1) {
    for (let x = 0; x < 9; x += 1) {
      let cnt = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < 9 && ny < 9 && b[ny][nx].pipe) cnt += 1;
        }
      }
      assert.equal(b[y][x].n, cnt, `n salah di (${x},${y})`);
    }
  }
});

console.log('\n[3] openCell');
test('buka petak aman', () => {
  const b = createBoard(9, 9, 10, 4, 4, () => 0.5);
  const r = openCell(b, 4, 4);
  assert.equal(r.result.hitPipe, false);
  assert.ok(r.result.opened >= 1);
  assert.ok(r.board[4][4].open);
});
test('kena pipa -> hitPipe', () => {
  const b = createBoard(9, 9, 10, 0, 0, () => 0.999);
  // cari pipa
  let px = -1;
  let py = -1;
  outer: for (let y = 0; y < 9; y += 1) {
    for (let x = 0; x < 9; x += 1) {
      if (b[y][x].pipe) { px = x; py = y; break outer; }
    }
  }
  const r = openCell(b, px, py);
  assert.equal(r.result.hitPipe, true);
});
test('flood fill membuka area kosong', () => {
  const b = emptyBoard(5, 5);
  const r = openCell(b, 2, 2);
  assert.equal(r.result.opened, 25);
});
test('petak terbuka / berkatup tidak dibuka ulang', () => {
  const b = createBoard(9, 9, 10, 4, 4, () => 0.5);
  const b2 = toggleFlag(b, 0, 0);
  const r = openCell(b2, 0, 0);
  assert.equal(r.result.opened, 0);
});

console.log('\n[4] toggleFlag & countFlags');
test('pasang & lepas katup', () => {
  let b = emptyBoard(3, 3);
  b = toggleFlag(b, 1, 1);
  assert.equal(b[1][1].flag, true);
  assert.equal(countFlags(b), 1);
  b = toggleFlag(b, 1, 1);
  assert.equal(b[1][1].flag, false);
  assert.equal(countFlags(b), 0);
});
test('petak terbuka tak bisa dikatup', () => {
  let b = emptyBoard(3, 3);
  b = openCell(b, 1, 1).board;
  b = toggleFlag(b, 1, 1);
  assert.equal(b[1][1].flag, false);
});

console.log('\n[5] checkWin');
test('menang saat semua aman terbuka', () => {
  let b = emptyBoard(3, 3);
  b[0][0].pipe = true;
  b[1][1].pipe = true;
  for (let y = 0; y < 3; y += 1) {
    for (let x = 0; x < 3; x += 1) {
      if (!b[y][x].pipe) b[y][x].open = true;
    }
  }
  assert.equal(checkWin(b), true);
});
test('belum menang bila ada yang tertutup', () => {
  const b = emptyBoard(3, 3);
  assert.equal(checkWin(b), false);
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join(', ')}` : ''}`);
process.exit(failed ? 1 : 0);
