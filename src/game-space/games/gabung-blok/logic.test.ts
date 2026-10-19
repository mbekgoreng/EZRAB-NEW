/**
 * Test logic Gabung Blok. Jalankan: npx tsx src/game-space/games/gabung-blok/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  move, spawnRandom, canMove, emptyCells, newBoard, tierScore, MAX_TIER, Dir,
  pushUndo, popUndo, type UndoEntry,
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

console.log('\n[7] undo');
test('pushUndo/popUndo: LIFO, tidak mutasi argumen', () => {
  const b1 = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const b2 = [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  let st: UndoEntry[] = [];
  st = pushUndo(st, b1, 10);
  st = pushUndo(st, b2, 30);
  assert.equal(st.length, 2);
  const r1 = popUndo(st);
  assert.deepEqual(r1.entry?.board, b2);
  assert.equal(r1.entry?.score, 30);
  assert.equal(r1.stack.length, 1);
  // argumen asli tidak termutasi
  assert.equal(st.length, 2);
  const r2 = popUndo(r1.stack);
  assert.deepEqual(r2.entry?.board, b1);
  assert.equal(r2.entry?.score, 10);
  const r3 = popUndo(r2.stack);
  assert.equal(r3.entry, null);
  assert.deepEqual(r3.stack, []);
});
test('pushUndo menyalin board (snapshot beku)', () => {
  const b = [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const st = pushUndo([], b, 0);
  b[0] = 9; // mutasi setelah push
  const { entry } = popUndo(st);
  assert.equal(entry?.board[0], 1, 'snapshot ikut berubah!');
});
test('pushUndo dibatasi cap (default 40)', () => {
  let st: UndoEntry[] = [];
  const b = new Array(16).fill(0);
  for (let k = 0; k < 55; k += 1) st = pushUndo(st, b, k);
  assert.equal(st.length, 40);
  assert.equal(st[0].score, 15); // 15 entri tertua dibuang
  assert.equal(st[39].score, 54);
});
test('undo mengembalikan skor & board pra-gerakan (simulasi komponen)', () => {
  const rng = () => 0.5;
  let board = newBoard(rng);
  let score = 0;
  let hist: UndoEntry[] = [];
  // mainkan 5 gerakan legal
  const dirs: Dir[] = ['left', 'up', 'right', 'down', 'left'];
  let played = 0;
  for (const d of dirs) {
    const r = move(board, d);
    if (!r.moved) continue;
    hist = pushUndo(hist, board, score);
    board = r.board;
    score += r.gained;
    spawnRandom(board, rng);
    played += 1;
  }
  assert.ok(played > 0, 'tidak ada gerakan legal?');
  const before = { board: board.slice(), score };
  const { entry, stack } = popUndo(hist);
  assert.ok(entry !== null);
  board = entry.board;
  score = entry.score;
  hist = stack;
  void hist;
  // setelah undo, board & skor == snapshot pra-gerakan terakhir
  assert.notDeepEqual(board, before.board, 'board tidak berubah setelah undo?');
  assert.ok(score <= before.score, 'skor undo lebih besar dari sebelum undo?');
});

console.log('\n[8] stress: 150 game × gerakan acak (tanpa crash, tanpa stuck)');
test('ratusan gerakan acak: invarian terjaga, game-over tepat', () => {
  const mulberry = (seed: number): (() => number) => {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const DIRS: Dir[] = ['left', 'right', 'up', 'down'];
  let moves = 0;
  let overs = 0;
  for (let g = 0; g < 150; g += 1) {
    const rng = mulberry(9000 + g);
    let board = newBoard(rng);
    let guard = 0;
    for (;;) {
      guard += 1;
      assert.ok(guard < 3000, 'stuck: 3000 iterasi tanpa game-over');
      assert.equal(board.length, 16);
      for (const v of board) assert.ok(v >= 0 && v <= MAX_TIER + 1, `tier liar: ${v}`);
      const dir = DIRS[Math.floor(rng() * 4)];
      const snapshot = board.slice();
      const r = move(board, dir);
      assert.deepEqual(board, snapshot, 'move() memutasi input!');
      assert.ok(r.gained >= 0, 'skor negatif');
      board = r.board;
      if (!r.moved) {
        assert.deepEqual(board, snapshot, 'no-op move mengubah papan!');
        continue;
      }
      moves += 1;
      spawnRandom(board, rng);
      if (!canMove(board)) {
        overs += 1;
        break; // game-over tepat: tidak ada langkah legal tersisa
      }
    }
  }
  assert.ok(moves > 5000, `gerakan terlalu sedikit: ${moves}`);
  assert.equal(overs, 150, 'tidak semua game berakhir game-over');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('failures:', failures.join(', '));
  process.exit(1);
}
