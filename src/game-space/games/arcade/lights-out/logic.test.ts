/**
 * ArcadeLightsOut ("Matikan Lampu Proyek") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/lights-out/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import { affected, toggle, isSolved, emptyBoard, scramble, scoreFor, GRID, CELL_COUNT, SHIFTS } from './logic';

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

console.log('\n[1] affected');
test('tengah = 5 sel (diri + 4 tetangga)', () => assert.equal(affected(2, 2).length, 5));
test('sudut = 3 sel', () => assert.equal(affected(0, 0).length, 3));
test('tepi = 4 sel', () => assert.equal(affected(0, 2).length, 4));
test('tidak keluar grid', () => {
  for (let r = 0; r < GRID; r += 1) for (let c = 0; c < GRID; c += 1) {
    for (const i of affected(r, c)) assert.ok(i >= 0 && i < CELL_COUNT);
  }
});

console.log('\n[2] toggle & isSolved');
test('ketuk 2× = kembali semula', () => {
  const b0 = emptyBoard();
  const b1 = toggle(toggle(b0, 1, 1), 1, 1);
  assert.deepEqual(b1, b0);
});
test('toggle tidak mutasi papan asal', () => {
  const b0 = emptyBoard();
  toggle(b0, 2, 2);
  assert.deepEqual(b0, emptyBoard());
});
test('ketuk tengah menyalakan pola plus', () => {
  const b = toggle(emptyBoard(), 2, 2);
  const on = b.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(on.sort((x, y) => x - y), [7, 11, 12, 13, 17]);
});
test('papan kosong = solved', () => assert.equal(isSolved(emptyBoard()), true));
test('papan menyala = belum solved', () => assert.equal(isSolved(toggle(emptyBoard(), 0, 0)), false));

console.log('\n[3] scramble solvable');
test('scramble selalu bisa diselesaikan ulang', () => {
  // terapkan scramble, lalu terapkan ketukan yg sama lagi -> harus solved
  let seed = 12345;
  const rng = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (const pressCount of [1, 4, 8, 12, 25]) {
    seed = 999;
    let board = emptyBoard();
    const presses: Array<[number, number]> = [];
    for (let i = 0; i < pressCount; i += 1) {
      const r = Math.floor(rng() * GRID);
      const c = Math.floor(rng() * GRID);
      presses.push([r, c]);
      board = toggle(board, r, c);
    }
    // ketuk ulang dengan urutan sama -> batal semua
    for (const [r, c] of presses) board = toggle(board, r, c);
    assert.equal(isSolved(board), true, `presses=${pressCount}`);
  }
});
test('scramble mengembalikan 25 sel', () => assert.equal(scramble(() => 0.5, 6).length, CELL_COUNT));

console.log('\n[4] SHIFTS & scoreFor');
test('3 shift terdefinisi', () => assert.equal(SHIFTS.length, 3));
test('skor sempurna = 1000, dijepit min 100', () => {
  assert.equal(scoreFor(0, 0), 1000);
  assert.equal(scoreFor(999, 9999), 100);
});
test('langkah lebih sedikit = skor lebih tinggi', () => {
  assert.ok(scoreFor(5, 10) > scoreFor(15, 10));
});

console.log(`\n${passed} lulus, ${failed} gagal${failed > 0 ? `: ${failures.join(', ')}` : ''}`);
process.exit(failed > 0 ? 1 : 0);
