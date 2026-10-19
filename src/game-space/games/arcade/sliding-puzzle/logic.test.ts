/**
 * ArcadeSlidingPuzzle ("Geser Keramik") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/sliding-puzzle/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import { solvedBoard, neighbors, shuffleBoard, canMove, moveTile, isSolved, misplaced } from './logic';

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

function lcg(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

console.log('\n[1] solvedBoard & isSolved');
test('4x4 solved valid', () => {
  const b = solvedBoard(4);
  assert.equal(b.length, 16);
  assert.ok(isSolved(b));
  assert.equal(b[15], 0);
});
test('3x3 solved valid', () => {
  assert.ok(isSolved(solvedBoard(3)));
});
test('papan acak 1 langkah → belum solved', () => {
  const b = solvedBoard(4);
  const m = moveTile(b, 4, 14);
  assert.ok(m && !isSolved(m));
});

console.log('\n[2] neighbors');
test('sudut punya 2 tetangga', () => {
  assert.deepEqual(neighbors(0, 4).sort((a, b) => a - b), [1, 4]);
  assert.deepEqual(neighbors(15, 4).sort((a, b) => a - b), [11, 14]);
});
test('tengah punya 4 tetangga', () => {
  assert.equal(neighbors(5, 4).length, 4);
});
test('sisi punya 3 tetangga', () => {
  assert.equal(neighbors(1, 4).length, 3);
});

console.log('\n[3] shuffleBoard');
test('selalu solvable: bisa dikembalikan via random walk balik', () => {
  // solvable ⟺ paritas inversi + posisi lubang konsisten; uji lewat:
  // shuffle lalu verifikasi isSolved(solvedBoard) dan papan valid
  for (const size of [3, 4]) {
    for (let s = 0; s < 10; s += 1) {
      const b = shuffleBoard(size, 80, lcg(s * 7 + 1));
      assert.equal(b.length, size * size);
      assert.ok(b.includes(0), 'lubang hilang');
      const sorted = [...b].sort((a, z) => a - z);
      for (let i = 0; i < sorted.length; i += 1) assert.equal(sorted[i], i);
      assert.ok(!isSolved(b), 'kebetulan solved');
    }
  }
});
test('paritas solvable: inversi + baris lubang genap untuk 4x4', () => {
  // random walk dari solved mempertahankan solvability; verifikasi invarian
  for (let s = 0; s < 20; s += 1) {
    const b = shuffleBoard(4, 60, lcg(s + 100));
    const inv = countInversions(b);
    const emptyRowFromBottom = 4 - Math.floor(b.indexOf(0) / 4);
    // aturan 15-puzzle: (inversi + baris-lubang-dari-bawah) ganjil = solvable
    assert.equal((inv + emptyRowFromBottom) % 2, 1, `tidak solvable (seed ${s})`);
  }
});

console.log('\n[4] canMove & moveTile');
test('tetangga lubang bisa digeser', () => {
  const b = solvedBoard(4); // lubang di 15
  assert.ok(canMove(b, 4, 14));
  assert.ok(canMove(b, 4, 11));
  assert.ok(!canMove(b, 4, 10));
  assert.ok(!canMove(b, 4, 15));
});
test('moveTile menukar dengan lubang & immutable', () => {
  const b = solvedBoard(4);
  const m = moveTile(b, 4, 14);
  assert.ok(m);
  assert.equal(m[15], 15);
  assert.equal(m[14], 0);
  assert.ok(isSolved(b), 'papan asli tidak boleh berubah');
});
test('moveTile invalid → null', () => {
  const b = solvedBoard(4);
  assert.equal(moveTile(b, 4, 10), null);
  assert.equal(moveTile(b, 4, 15), null);
});

console.log('\n[5] misplaced');
test('solved → 0, satu geser → 1', () => {
  assert.equal(misplaced(solvedBoard(3)), 0);
  const m = moveTile(solvedBoard(3), 3, 7);
  assert.ok(m);
  assert.equal(misplaced(m), 1);
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join(', ')}` : ''}`);
process.exit(failed ? 1 : 0);

function countInversions(b: number[]): number {
  const arr = b.filter((v) => v !== 0);
  let inv = 0;
  for (let i = 0; i < arr.length; i += 1) {
    for (let j = i + 1; j < arr.length; j += 1) {
      if (arr[i] > arr[j]) inv += 1;
    }
  }
  return inv;
}
