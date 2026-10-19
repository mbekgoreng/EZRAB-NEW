/**
 * ArcadeBubbleShooter ("Tembak Semen") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/bubble-shooter/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  EMPTY, neighbors, levelGrid, findCluster, findFloating, colorsInGrid,
  pushCeiling, isCleared, rowsForLevel, colorsForLevel,
  scorePop, scoreDrop, LEVEL_BONUS, type Grid,
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

function lcg(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

console.log('\n[1] neighbors (odd-r)');
test('baris genap: 6 tetangga di tengah', () => {
  const n = neighbors(2, 2, 6);
  assert.equal(n.length, 6);
  // tetangga kiri-kanan selalu ada
  assert.ok(n.some(([r, c]) => r === 2 && c === 1));
  assert.ok(n.some(([r, c]) => r === 2 && c === 3));
});
test('baris ganjil: offset ke kanan', () => {
  const n = neighbors(1, 2, 6);
  assert.ok(n.some(([r, c]) => r === 0 && c === 2)); // atas-kanan
  assert.ok(n.some(([r, c]) => r === 0 && c === 3));
});
test('tepi: tetangga di luar kolom dibuang', () => {
  const n = neighbors(0, 0, 6);
  assert.ok(n.every(([, c]) => c >= 0));
  assert.ok(n.length < 6);
});
test('baris negatif dibuang', () => {
  const n = neighbors(0, 3, 6);
  assert.ok(n.every(([r]) => r >= 0));
});

console.log('\n[2] levelGrid');
test('dimensi & tanpa 3 horizontal berurutan', () => {
  const g = levelGrid(5, 8, 4, lcg(7));
  assert.equal(g.length, 5);
  assert.equal(g[0].length, 8);
  for (const row of g) {
    for (let c = 2; c < row.length; c += 1) {
      assert.ok(!(row[c] === row[c - 1] && row[c] === row[c - 2]), `3 berurutan di kolom ${c}`);
    }
    assert.ok(row.every((v) => v >= 0 && v < 4));
  }
});

console.log('\n[3] findCluster');
test('cluster warna sama terhubung', () => {
  const g: Grid = [
    [0, 0, 1],
    [0, 1, 1],
    [2, 2, 2],
  ];
  const cl = findCluster(g, 0, 0);
  assert.equal(cl.length, 3); // (0,0),(0,1),(1,0)
});
test('sel kosong → cluster kosong', () => {
  const g: Grid = [[EMPTY, 0]];
  assert.deepEqual(findCluster(g, 0, 0), []);
});
test('warna beda tidak ikut', () => {
  const g: Grid = [[0, 1], [1, 1]];
  assert.equal(findCluster(g, 0, 0).length, 1);
});

console.log('\n[4] findFloating');
test('yang terhubung ke atas tidak jatuh', () => {
  const g: Grid = [
    [0, 1],
    [0, 1],
  ];
  assert.deepEqual(findFloating(g), []);
});
test('pulau melayang terdeteksi', () => {
  const g: Grid = [
    [0, EMPTY],
    [EMPTY, EMPTY],
    [1, 1],
  ];
  const f = findFloating(g);
  assert.equal(f.length, 2);
});
test('terhubung diagonal via heksagonal tetap anchored', () => {
  // (1,1) bertetangga dengan (0,1)? baris 1 ganjil: tetangga (0,1),(0,2) — ya
  const g: Grid = [
    [0, 0],
    [EMPTY, 0],
  ];
  assert.deepEqual(findFloating(g), []);
});

console.log('\n[5] colorsInGrid');
test('hanya warna yang ada', () => {
  const g: Grid = [[0, 2], [2, EMPTY]];
  assert.deepEqual(colorsInGrid(g), [0, 2]);
});

console.log('\n[6] pushCeiling');
test('tambah baris di atas', () => {
  const g: Grid = [[0, 1]];
  const ok = pushCeiling(g, 2, 3, lcg(1), 8);
  assert.ok(ok);
  assert.equal(g.length, 2);
});
test('false bila sudah maxRows', () => {
  const g: Grid = [[0]];
  assert.equal(pushCeiling(g, 1, 2, lcg(1), 1), false);
});

console.log('\n[7] isCleared & level params');
test('isCleared', () => {
  assert.ok(isCleared([[EMPTY, EMPTY]]));
  assert.ok(!isCleared([[EMPTY, 0]]));
});
test('rowsForLevel & colorsForLevel', () => {
  assert.equal(rowsForLevel(1), 5);
  assert.equal(rowsForLevel(99), 9);
  assert.equal(colorsForLevel(1), 4);
  assert.equal(colorsForLevel(99), 6);
});

console.log('\n[8] skor');
test('scorePop/scoreDrop/LEVEL_BONUS', () => {
  assert.equal(scorePop(5), 50);
  assert.equal(scoreDrop(3), 60);
  assert.equal(LEVEL_BONUS, 500);
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join(', ')}` : ''}`);
process.exit(failed ? 1 : 0);
