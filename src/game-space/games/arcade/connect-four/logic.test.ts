/**
 * ArcadeConnectFour ("Sambung Pipa") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/connect-four/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  createBoard, dropPiece, dropRow, isWinningMove, isFull, legalColumns,
  aiChooseColumn, COLS, ROWS, AI_BLUNDER_CHANCE, type Board,
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

function fillColumn(board: Board, col: number, player: 1 | 2, n: number): void {
  for (let i = 0; i < n; i += 1) dropPiece(board, col, player);
}

console.log('\n[1] dropPiece');
test('papan kosong 7x6', () => {
  const b = createBoard();
  assert.equal(b.length, ROWS);
  assert.equal(b[0].length, COLS);
  assert.ok(b.every((r) => r.every((c) => c === 0)));
});
test('keping jatuh ke bawah', () => {
  const b = createBoard();
  const r = dropPiece(b, 3, 1);
  assert.equal(r?.row, ROWS - 1);
  const r2 = dropPiece(b, 3, 2);
  assert.equal(r2?.row, ROWS - 2);
});
test('kolom penuh → null', () => {
  const b = createBoard();
  fillColumn(b, 0, 1, ROWS);
  assert.equal(dropPiece(b, 0, 2), null);
  assert.equal(dropRow(b, 0), -1);
});
test('kolom di luar batas → null', () => {
  const b = createBoard();
  assert.equal(dropPiece(b, -1, 1), null);
  assert.equal(dropPiece(b, COLS, 1), null);
});

console.log('\n[2] isWinningMove');
test('menang horizontal', () => {
  const b = createBoard();
  for (const c of [1, 2, 3]) dropPiece(b, c, 1);
  const r = dropPiece(b, 4, 1)!;
  assert.ok(isWinningMove(b, 4, r.row, 1));
});
test('menang vertikal', () => {
  const b = createBoard();
  fillColumn(b, 2, 2, 3);
  const r = dropPiece(b, 2, 2)!;
  assert.ok(isWinningMove(b, 2, r.row, 2));
});
test('menang diagonal /', () => {
  const b = createBoard();
  dropPiece(b, 0, 1);
  dropPiece(b, 1, 2); dropPiece(b, 1, 1);
  dropPiece(b, 2, 2); dropPiece(b, 2, 2); dropPiece(b, 2, 1);
  dropPiece(b, 3, 2); dropPiece(b, 3, 2); dropPiece(b, 3, 2);
  const r = dropPiece(b, 3, 1)!;
  assert.ok(isWinningMove(b, 3, r.row, 1));
});
test('3 beruntun belum menang', () => {
  const b = createBoard();
  for (const c of [0, 1, 2]) dropPiece(b, c, 1);
  const r = dropRow(b, 2);
  assert.ok(!isWinningMove(b, 2, r, 1));
});
test('papan penuh terdeteksi', () => {
  const b = createBoard();
  for (let c = 0; c < COLS; c += 1) fillColumn(b, c, c % 2 === 0 ? 1 : 2, ROWS);
  assert.ok(isFull(b));
  assert.equal(legalColumns(b).length, 0);
});

console.log('\n[3] aiChooseColumn');
test('AI selalu ambil kemenangan langsung', () => {
  const b = createBoard();
  for (const c of [0, 1, 2]) dropPiece(b, c, 2);
  const col = aiChooseColumn(b, 2, () => 0.99);
  assert.equal(col, 3);
});
test('AI blokir ancaman lawan (rng tanpa blunder)', () => {
  const b = createBoard();
  for (const c of [0, 1, 2]) dropPiece(b, c, 1);
  // rng() >= AI_BLUNDER_CHANCE → tidak blunder; kolom blokir harus dipilih
  const col = aiChooseColumn(b, 2, () => 0.5);
  assert.equal(col, 3);
});
test('AI bisa blunder (rng di bawah ambang) — kadang tidak blokir', () => {
  const b = createBoard();
  for (const c of [0, 1, 2]) dropPiece(b, c, 1);
  // rng() < AI_BLUNDER_CHANCE → blunder acak; kolom 3 ancaman mungkin tak diblokir
  let blocked = 0;
  for (let i = 0; i < 40; i += 1) {
    const seq = [0.01, (i % 7) / 7 + 0.001];
    let k = 0;
    const col = aiChooseColumn(b, 2, () => seq[k++ % seq.length]);
    if (col === 3) blocked += 1;
  }
  assert.ok(blocked < 40, 'AI harus kadang blunder (bisa dikalahkan)');
  assert.ok(AI_BLUNDER_CHANCE > 0);
});
test('AI pilih kolom legal di papan kosong', () => {
  const b = createBoard();
  for (let i = 0; i < 20; i += 1) {
    const col = aiChooseColumn(b, 2, () => 0.42);
    assert.ok(col >= 0 && col < COLS);
  }
});
test('AI hindari kolom penuh', () => {
  const b = createBoard();
  fillColumn(b, 3, 1, ROWS);
  for (let i = 0; i < 10; i += 1) {
    const col = aiChooseColumn(b, 2, () => 0.5);
    assert.notEqual(col, 3);
  }
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join(', ')}` : ''}`);
process.exit(failed ? 1 : 0);
