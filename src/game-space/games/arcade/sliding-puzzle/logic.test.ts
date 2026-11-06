/**
 * ArcadeSlidingPuzzle ("Geser Keramik") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/sliding-puzzle/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import { solvedBoard, neighbors, shuffleBoard, canMove, moveTile, isSolved, misplaced, isSolvable, isAtHome, homeMask, placedCount } from './logic';

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

console.log('\n[6] isSolvable — penjaga paritas (regresi kandidat acak mentah)');
test('solved 3x3 & 4x4 solvable', () => {
  assert.ok(isSolvable(solvedBoard(3), 3));
  assert.ok(isSolvable(solvedBoard(4), 4));
});
test('satu langkah sah dari solved tetap solvable', () => {
  for (const size of [3, 4]) {
    const b = solvedBoard(size);
    const m = moveTile(b, size, size * size - 2);
    assert.ok(m);
    assert.ok(isSolvable(m, size), `size ${size}`);
  }
});
test('tukar dua keping dari solved = MUSTAHIL (bug klasik permutasi mentah)', () => {
  const b4 = solvedBoard(4);
  [b4[13], b4[14]] = [b4[14], b4[13]]; // tukar keping 14 & 15
  assert.ok(!isSolvable(b4, 4));
  const b3 = solvedBoard(3);
  [b3[0], b3[1]] = [b3[1], b3[0]]; // tukar keping 1 & 2
  assert.ok(!isSolvable(b3, 3));
});
test('statistik: 200 acakan generator per ukuran SEMUA solvable & tak ada yang solved', () => {
  for (const size of [3, 4]) {
    for (let s = 0; s < 200; s += 1) {
      const b = shuffleBoard(size, 120, lcg(s * 31 + size));
      assert.ok(isSolvable(b, size), `size ${size} seed ${s} tidak solvable`);
      assert.ok(!isSolved(b));
    }
  }
});
test('diskriminatif: permutasi mentah Fisher-Yates menghasilkan yang mustahil juga', () => {
  let unsolvable = 0;
  const total = 60;
  for (let s = 0; s < total; s += 1) {
    const rng = lcg(s * 17 + 5);
    const b = solvedBoard(4);
    for (let i = b.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    if (!isSolvable(b, 4)) unsolvable += 1;
  }
  // ±setengah permutasi mentah mustahil; penjaga harus menangkap sebagian besar itu
  assert.ok(unsolvable >= 10 && unsolvable <= 50, `unsolvable=${unsolvable}/${total} di luar rentang wajar`);
});

console.log('\n[7] indikator keping tepat — isAtHome / homeMask / placedCount');
test('solved: semua keping tepat, lubang tidak dihitung', () => {
  for (const size of [3, 4]) {
    const b = solvedBoard(size);
    assert.equal(placedCount(b), size * size - 1);
    const mask = homeMask(b);
    assert.equal(mask.length, size * size);
    assert.ok(mask.slice(0, -1).every(Boolean));
    assert.equal(mask[mask.length - 1], false, 'lubang bukan keping tepat');
    assert.ok(isAtHome(b, 0));
    assert.ok(!isAtHome(b, b.length - 1));
  }
});
test('satu geser dari solved 4x4: placed 14, masker cocok posisi', () => {
  const m = moveTile(solvedBoard(4), 4, 14);
  assert.ok(m);
  assert.equal(placedCount(m), 14);
  assert.equal(misplaced(m), 1);
  const mask = homeMask(m);
  assert.equal(mask[14], false, 'sel lubang tidak tepat');
  assert.equal(mask[15], false, 'keping 15 pindah dari rumahnya');
  assert.equal(mask[0], true);
});
test('invarian acak: placedCount + misplaced = jumlah keping', () => {
  for (const size of [3, 4]) {
    for (let s = 0; s < 30; s += 1) {
      const b = shuffleBoard(size, 90, lcg(s * 13 + size));
      assert.equal(placedCount(b) + misplaced(b), size * size - 1);
      assert.equal(homeMask(b).filter(Boolean).length, placedCount(b));
    }
  }
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
