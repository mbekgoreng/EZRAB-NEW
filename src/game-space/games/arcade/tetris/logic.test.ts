/**
 * Susun Bata — logic tests. Run: npx tsx src/game-space/games/arcade/tetris/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  COLS, ROWS, MATERIALS, SHAPES, bag7, collides, clearLines, emptyBoard,
  gravityMs, levelFor, merge, rotate, scoreFor, spawnPiece, type PieceKind,
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

const kinds: PieceKind[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

console.log('\n[tetris] setup');
test('7 material terdaftar dengan 2 warna', () => {
  for (const k of kinds) {
    const m = MATERIALS[k];
    assert.ok(m.name.length > 2, k);
    assert.match(m.c1, /^#[0-9a-f]{6}$/i, k);
    assert.match(m.c2, /^#[0-9a-f]{6}$/i, k);
  }
});
test('bag7 berisi 7 material unik', () => {
  const bag = bag7(() => 0.5);
  assert.equal(bag.length, 7);
  assert.deepEqual([...bag].sort(), [...kinds].sort());
});
test('papan kosong 10x20', () => {
  const b = emptyBoard();
  assert.equal(b.length, ROWS);
  assert.equal(b[0].length, COLS);
  assert.ok(b.every((r) => r.every((c) => c === 0)));
});

console.log('\n[tetris] rotasi & tabrakan');
test('rotate 4x kembali ke bentuk awal', () => {
  for (const k of kinds) {
    let s = SHAPES[k];
    for (let i = 0; i < 4; i += 1) s = rotate(s);
    assert.deepEqual(s, SHAPES[k], k);
  }
});
test('collides: dinding & lantai', () => {
  const b = emptyBoard();
  const s = SHAPES.O;
  assert.ok(collides(b, s, -1, 0));
  assert.ok(collides(b, s, COLS - 1, 0));
  assert.ok(collides(b, s, 0, ROWS - 1));
  assert.ok(!collides(b, s, 4, 0));
});
test('collides: menabrak tumpukan', () => {
  let b = merge(emptyBoard(), SHAPES.O, 4, ROWS - 2, 'O');
  assert.ok(collides(b, SHAPES.O, 4, ROWS - 3));
  assert.ok(!collides(b, SHAPES.O, 0, ROWS - 3));
});
test('spawnPiece di tengah atas', () => {
  const p = spawnPiece('T');
  assert.equal(p.y, 0);
  assert.ok(p.x >= 3 && p.x <= 4);
  assert.deepEqual(p.shape, SHAPES.T);
});

console.log('\n[tetris] hapus baris & skor');
test('clearLines menghapus baris penuh', () => {
  let b = emptyBoard();
  b[ROWS - 1] = Array<0 | PieceKind>(COLS).fill('I');
  b[ROWS - 2][0] = 'O';
  const { board, cleared } = clearLines(b);
  assert.equal(cleared, 1);
  assert.equal(board.length, ROWS);
  assert.equal(board[ROWS - 1][0], 'O');
  assert.ok(board[0].every((c) => c === 0));
});
test('skor & level', () => {
  assert.equal(scoreFor(1, 0), 100);
  assert.equal(scoreFor(4, 2), 800 * 3);
  assert.equal(levelFor(0), 0);
  assert.equal(levelFor(9), 0);
  assert.equal(levelFor(10), 1);
  assert.equal(levelFor(25), 2);
});
test('gravitasi makin cepat, ada batas bawah', () => {
  assert.ok(gravityMs(1) < gravityMs(0));
  assert.ok(gravityMs(40) >= 60);
  assert.equal(gravityMs(100), 60);
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` (${failures.join(', ')})` : ''}`);
process.exit(failed ? 1 : 0);
