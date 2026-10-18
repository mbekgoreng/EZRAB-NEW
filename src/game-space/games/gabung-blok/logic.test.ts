/**
 * Test logic Gabung Blok. Jalankan: npx tsx src/game-space/games/gabung-blok/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  move, spawnRandom, canMove, emptyCells, newBoard, tierScore, MAX_TIER, Dir,
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

/** rng deterministik: selalu 0 → pilih sel kosong pertama, tier selalu BATA */
const rngZero = () => 0;

console.log('\n[1] move — geser & gabung');
test('geser kiri menggabungkan pasangan', () => {
  const r = move([1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'left');
  assert.deepEqual(r.board.slice(0, 4), [2, 0, 0, 0]);
  assert.equal(r.gained, tierScore(1));
  assert.equal(r.moved, true);
});
test('geser kanan menumpuk ke kanan', () => {
  const r = move([1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'right');
  assert.deepEqual(r.board.slice(0, 4), [0, 0, 0, 2]);
});
test('geser atas menggabungkan kolom', () => {
  const b = new Array(16).fill(0);
  b[0] = 1; b[4] = 1;
  const r = move(b, 'up');
  assert.equal(r.board[0], 2);
  assert.equal(r.board[4], 0);
});
test('geser bawah menggabungkan kolom ke bawah', () => {
  const b = new Array(16).fill(0);
  b[0] = 1; b[4] = 1;
  const r = move(b, 'down');
  assert.equal(r.board[12], 2);
  assert.equal(r.board[0], 0);
});

console.log('\n[2] aturan gabung 1x per gerakan');
test('tiap tile gabung max 1x: [1,1,1,0] → [2,1,0,0]', () => {
  const r = move([1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'left');
  assert.deepEqual(r.board.slice(0, 4), [2, 1, 0, 0]);
});
test('tidak ada chain merge: [1,1,1,1] → [2,2,0,0]', () => {
  const r = move([1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'left');
  assert.deepEqual(r.board.slice(0, 4), [2, 2, 0, 0]);
});
test('tidak ada gabungan bila beda tier', () => {
  const r = move([1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'left');
  assert.deepEqual(r.board.slice(0, 4), [1, 2, 0, 0]);
  assert.equal(r.gained, 0);
});
test('MENARA tidak bisa digabung lagi (mentok tier)', () => {
  const t = MAX_TIER + 1;
  const r = move([t, t, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'left');
  assert.deepEqual(r.board.slice(0, 4), [t, t, 0, 0]);
  assert.equal(r.gained, 0);
});

console.log('\n[3] skor');
test('skor = jumlah gained dari semua gabungan', () => {
  const r = move([1, 1, 1, 1, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'left');
  assert.equal(r.gained, 2 * tierScore(1) + tierScore(2));
});
test('tierScore cantik: 10, 20, 40, ..., 1280', () => {
  const vals = [0, 1, 2, 3, 4, 5, 6, 7].map(tierScore);
  assert.deepEqual(vals, [10, 20, 40, 80, 160, 320, 640, 1280]);
});
test('moved=false bila papan tidak berubah', () => {
  const r = move([1, 2, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'left');
  assert.equal(r.moved, false);
  assert.equal(r.gained, 0);
});

console.log('\n[4] menang');
test('deteksi menang saat MENARA muncul', () => {
  const t = MAX_TIER; // board value tier 6 (GEDUNG) → gabung jadi MENARA
  const b = new Array(16).fill(0);
  b[0] = t; b[1] = t;
  const r = move(b, 'left');
  assert.equal(r.board[0], MAX_TIER + 1);
  assert.equal(r.won, true);
});
test('tidak menang bila belum ada MENARA', () => {
  const r = move([1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'left');
  assert.equal(r.won, false);
});

console.log('\n[5] spawn & sel kosong');
test('spawn hanya mengisi sel kosong', () => {
  const b = new Array(16).fill(3);
  b[7] = 0;
  const idx = spawnRandom(b, rngZero);
  assert.equal(idx, 7);
  assert.ok(b[7] > 0);
  assert.equal(emptyCells(b).length, 0);
});
test('spawn return -1 saat papan penuh', () => {
  const b = new Array(16).fill(1);
  assert.equal(spawnRandom(b, rngZero), -1);
});
test('emptyCells mengembalikan indeks yang benar', () => {
  const b = new Array(16).fill(1);
  b[0] = 0; b[15] = 0;
  assert.deepEqual(emptyCells(b), [0, 15]);
});
test('newBoard berisi tepat 2 tile', () => {
  const b = newBoard(rngZero);
  assert.equal(b.filter((v) => v > 0).length, 2);
});

console.log('\n[6] kalah');
test('deteksi kalah: papan penuh tanpa pasangan', () => {
  const b = [1, 2, 1, 2, 2, 1, 2, 1, 1, 2, 1, 2, 2, 1, 2, 1];
  assert.equal(canMove(b), false);
});
test('belum kalah bila ada pasangan bersebelahan', () => {
  const b = [1, 1, 2, 3, 2, 3, 4, 5, 3, 4, 5, 6, 4, 5, 6, 7];
  assert.equal(canMove(b), true);
});
test('belum kalah bila masih ada sel kosong', () => {
  const b = new Array(16).fill(1);
  b[5] = 0;
  assert.equal(canMove(b), true);
});
test('canMove mengecek arah vertikal juga', () => {
  const b = [1, 2, 3, 4, 1, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  assert.equal(canMove(b), true); // kolom 0: 1 & 1 bersebelahan vertikal
});
for (const d of ['left', 'right', 'up', 'down'] as Dir[]) {
  test(`papan penuh tanpa langkah: move ${d} → moved=false`, () => {
    const b = [1, 2, 1, 2, 2, 1, 2, 1, 1, 2, 1, 2, 2, 1, 2, 1];
    assert.equal(move(b, d).moved, false);
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('failures:', failures.join(', '));
  process.exit(1);
}
