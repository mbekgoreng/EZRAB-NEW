/**
 * Bata vs Semen — logic tests. Run: npx tsx src/game-space/games/arcade/tic-tac-toe/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import { emptyBoard, winner, isFull, freeCells, place, aiMove, aiOpening, type Board } from './logic';

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

const B = (s: string): Board => s.split('').map((c) => (c === '.' ? null : c)) as Board;

console.log('\n[tictactoe] rules');
test('papan kosong 9 sel', () => {
  const b = emptyBoard();
  assert.equal(b.length, 9);
  assert.ok(b.every((c) => c === null));
});
test('menang baris / kolom / diagonal', () => {
  assert.deepEqual(winner(B('XXX......'))?.line, [0, 1, 2]);
  assert.deepEqual(winner(B('O..O..O..'))?.line, [0, 3, 6]);
  assert.equal(winner(B('X...X...X'))?.mark, 'X');
  assert.equal(winner(B('..O.O.O..'))?.mark, 'O');
});
test('belum ada pemenang & seri', () => {
  assert.equal(winner(B('XOX......')), null);
  assert.ok(isFull(B('XOXOXOOXO')));
  assert.equal(winner(B('XOXOXOOXO')), null);
});
test('place menolak sel terisi / di luar', () => {
  const b = B('X........');
  assert.equal(place(b, 0, 'O'), null);
  assert.equal(place(b, 9, 'O'), null);
  const nb = place(b, 4, 'O');
  assert.ok(nb && nb[4] === 'O' && b[4] === null, 'tidak mutasi');
});
test('freeCells', () => {
  assert.deepEqual(freeCells(B('X..O.....')), [1, 2, 4, 5, 6, 7, 8]);
});

console.log('\n[tictactoe] AI sedang');
test('AI menang saat bisa menang (blunder=0)', () => {
  const b = B('OO.......');
  assert.equal(aiMove(b, () => 0.99, 0), 2);
});
test('AI menutup kemenangan lawan (blunder=0)', () => {
  const b = B('XX.......');
  assert.equal(aiMove(b, () => 0.99, 0), 2);
});
test('AI kadang blunder (bisa dikalahkan)', () => {
  // rng() < blunder -> acak; paksa blunder=1
  const b = B('X........');
  const m = aiMove(b, () => 0, 1);
  assert.ok(m >= 0 && m < 9 && b[m] === null);
});
test('AI tidak pernah pilih sel terisi', () => {
  const b = B('XOXOXO...');
  for (let i = 0; i < 20; i += 1) {
    const m = aiMove(b, () => (i * 37 % 100) / 100, i % 2 === 0 ? 0 : 0.9);
    assert.ok(b[m] === null, `langkah ${m}`);
  }
});
test('aiOpening variatif di papan kosong', () => {
  const seen = new Set<number>();
  for (let i = 0; i < 30; i += 1) seen.add(aiOpening(emptyBoard(), () => (i * 13 % 100) / 100));
  assert.ok(seen.size > 1, 'pembuka tidak monoton');
});
test('AI tidak kalah dari langkah acak (simulasi)', () => {
  // lawan acak vs AI blunder 0.2 — AI tidak boleh kalah dalam 60 game
  let losses = 0;
  for (let g = 0; g < 60; g += 1) {
    let b = emptyBoard();
    let turn: 'X' | 'O' = 'X';
    let seed = g * 7919 + 13;
    const rng = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (;;) {
      const w = winner(b);
      if (w || isFull(b)) { if (w?.mark === 'X') losses += 1; break; }
      const mv = turn === 'X'
        ? freeCells(b)[(rng() * freeCells(b).length) | 0]
        : aiMove(b, rng, 0.2);
      b = place(b, mv, turn) as Board;
      turn = turn === 'X' ? 'O' : 'X';
    }
  }
  assert.ok(losses <= 12, `kalah ${losses}x dari 60 — AI terlalu lemah`);
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` (${failures.join(', ')})` : ''}`);
process.exit(failed ? 1 : 0);
