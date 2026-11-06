/**
 * ArcadeMinesweeper ("Cari Pipa Bocor") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/minesweeper/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  DIFFS, emptyBoard, createBoard, openCell, toggleFlag, chord, checkWin, countFlags, findHint,
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

console.log('\n[6] chord & hitCell (regresi: ledakan chord tak teridentifikasi)');
test('openCell aman -> hitCell null; kena pipa -> hitCell = sel pipa itu', () => {
  const b = createBoard(9, 9, 10, 0, 0, () => 0.999);
  let px = -1;
  let py = -1;
  outer: for (let y = 0; y < 9; y += 1) {
    for (let x = 0; x < 9; x += 1) {
      if (b[y][x].pipe) { px = x; py = y; break outer; }
    }
  }
  assert.deepEqual(openCell(b, px, py).result.hitCell, [px, py]);
  const safe = openCell(b, 0, 0);
  assert.equal(safe.result.hitPipe, false);
  assert.equal(safe.result.hitCell, null);
});
test('chord dengan katup pas membuka sisa tetangga', () => {
  let b = emptyBoard(3, 3);
  b[0][0].pipe = true;
  b[0][1].n = 1; b[1][0].n = 1; b[1][1].n = 1;
  b[1][1].open = true;
  b = toggleFlag(b, 0, 0);
  const r = chord(b, 1, 1);
  assert.equal(r.result.hitPipe, false);
  assert.equal(r.result.hitCell, null);
  assert.equal(r.result.opened, 7);
  assert.equal(checkWin(r.board), true);
});
test('chord tanpa katup pas tidak melakukan apa-apa', () => {
  const b = emptyBoard(3, 3);
  b[0][0].pipe = true;
  b[1][1].n = 1;
  b[1][1].open = true;
  const r = chord(b, 1, 1);
  assert.equal(r.result.opened, 0);
  assert.equal(r.result.hitPipe, false);
  assert.equal(r.result.hitCell, null);
});
test('chord kena pipa -> hitCell menunjuk pipa yang meledak', () => {
  let b = emptyBoard(3, 3);
  b[0][2].pipe = true; // pipa di (2,0)
  b[0][1].n = 1; b[1][1].n = 1; b[1][2].n = 1;
  b[1][1].open = true;
  b = toggleFlag(b, 0, 0); // katup SALAH: jumlah pas, posisi meleset
  const r = chord(b, 1, 1);
  assert.equal(r.result.hitPipe, true);
  assert.deepEqual(r.result.hitCell, [2, 0]);
  assert.equal(r.board[0][2].open, true);
});

console.log('\n[7] findHint — petunjuk deduksi logis');
test('sisa 0 di sekitar angka -> petak tersembunyi pasti aman', () => {
  let b = emptyBoard(3, 3);
  b[0][0].pipe = true;
  b[1][1].n = 1;
  b[1][1].open = true;
  b = toggleFlag(b, 0, 0);
  assert.deepEqual(findHint(b), { kind: 'safe', x: 1, y: 0, basedOn: [1, 1] });
});
test('sisa == petak tersembunyi -> petak itu pasti pipa', () => {
  const b = emptyBoard(3, 3);
  b[0][0].pipe = true;
  b[1][1].n = 1;
  b[1][1].open = true;
  for (let y = 0; y < 3; y += 1) {
    for (let x = 0; x < 3; x += 1) {
      if (!(x === 0 && y === 0) && !(x === 1 && y === 1)) b[y][x].open = true;
    }
  }
  assert.deepEqual(findHint(b), { kind: 'pipe', x: 0, y: 0, basedOn: [1, 1] });
});
test('posisi ambigu / papan baru -> null (tidak mengarang tebakan)', () => {
  const b = emptyBoard(3, 3);
  b[0][0].pipe = true;
  b[1][1].n = 1;
  b[1][1].open = true;
  assert.equal(findHint(b), null);
  assert.equal(findHint(emptyBoard(3, 3)), null);
});
test('petunjuk aman didahulukan dari petunjuk pipa; deterministik & murni', () => {
  let b = emptyBoard(5, 5);
  b[0][0].pipe = true;
  b[4][4].pipe = true;
  for (let y = 0; y < 5; y += 1) for (let x = 0; x < 5; x += 1) b[y][x].open = true;
  b[0][0].open = false; // satu-satunya tersembunyi di sekitar (1,1) -> deduksi pipa
  b[4][4].open = false;
  b[2][2].open = false; // tersembunyi aman di sekitar (3,3)
  b[1][1].n = 1;
  b[3][3].n = 1;
  b = toggleFlag(b, 4, 4); // katup tepat di sekitar (3,3) -> deduksi aman
  const snapshot = JSON.stringify(b);
  const h1 = findHint(b);
  const h2 = findHint(b);
  assert.deepEqual(h1, { kind: 'safe', x: 2, y: 2, basedOn: [3, 3] });
  assert.deepEqual(h1, h2);
  assert.equal(JSON.stringify(b), snapshot, 'findHint mengubah papan');
});

console.log('\n[8] regresi: sisa pipa BUKAN penentu menang/kalah');
test('menang sah dengan sisa pipa > 0 (tanpa memasang semua katup)', () => {
  const b = emptyBoard(3, 3);
  b[0][0].pipe = true;
  b[0][1].pipe = true;
  for (let y = 0; y < 3; y += 1) {
    for (let x = 0; x < 3; x += 1) if (!b[y][x].pipe) b[y][x].open = true;
  }
  assert.equal(checkWin(b), true);
  assert.equal(2 - countFlags(b), 2);
});
test('sisa pipa 0 tapi permainan belum menang', () => {
  let b = emptyBoard(3, 3);
  b[0][0].pipe = true;
  b = toggleFlag(b, 0, 0);
  assert.equal(1 - countFlags(b), 0);
  assert.equal(checkWin(b), false);
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join(', ')}` : ''}`);
process.exit(failed ? 1 : 0);
