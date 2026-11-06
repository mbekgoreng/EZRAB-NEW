/**
 * ArcadeLightsOut ("Matikan Lampu Proyek") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/lights-out/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import { affected, toggle, isSolved, emptyBoard, scramble, scoreFor, starsFor, GRID, CELL_COUNT, SHIFTS } from './logic';

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
// Penyesuaian tes emoji (dinyatakan eksplisit): tes lama tidak memeriksa
// field emoji SHIFTS secara langsung, tetapi field itu kini DIBUANG dari
// data logic (ikon shift digambar SVG prosedural di komponen). Tes di
// bawah menegaskan ketiadaannya agar emoji tidak kembali lewat data.
test('SHIFTS tidak lagi memuat field emoji / karakter emoji', () => {
  for (const sh of SHIFTS) {
    assert.ok(!('emoji' in sh), `shift ${sh.id} masih punya field emoji`);
    const text = `${sh.id} ${sh.name} ${sh.hint}`;
    for (const ch of text) {
      const cp = ch.codePointAt(0) ?? 0;
      const isEmoji = (cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x2600 && cp <= 0x27bf) || cp === 0x2b50 || cp === 0x2b55;
      assert.ok(!isEmoji, `karakter emoji U+${cp.toString(16)} di shift ${sh.id}`);
    }
  }
});

console.log('\n[5] starsFor (par = presses shift, pendekatan — bukan optimum terbukti)');
test('belum selesai = 0 bintang berapa pun langkahnya', () => {
  assert.equal(starsFor(0, 8, false), 0);
  assert.equal(starsFor(3, 8, false), 0);
  assert.equal(starsFor(99, 8, false), 0);
});
test('selesai <= par = 3 bintang', () => {
  assert.equal(starsFor(1, 8, true), 3);
  assert.equal(starsFor(8, 8, true), 3, 'tepat par = 3');
  assert.equal(starsFor(4, 4, true), 3, 'par shift pagi = 4');
});
test('selesai <= ceil(par x 1,5) = 2 bintang', () => {
  assert.equal(starsFor(9, 8, true), 2);
  assert.equal(starsFor(12, 8, true), 2, 'tepat ceil(8 x 1,5) = 12 = 2');
  assert.equal(starsFor(6, 4, true), 2, 'tepat ceil(4 x 1,5) = 6 = 2');
  assert.equal(starsFor(18, 12, true), 2, 'tepat ceil(12 x 1,5) = 18 = 2');
});
test('selesai di atas 1,5x par = 1 bintang', () => {
  assert.equal(starsFor(13, 8, true), 1);
  assert.equal(starsFor(7, 4, true), 1);
  assert.equal(starsFor(100, 12, true), 1);
});
test('par tidak valid saat selesai = 1 bintang', () => {
  assert.equal(starsFor(5, 0, true), 1);
  assert.equal(starsFor(5, -3, true), 1);
});

console.log('\n[6] model undo (toggle adalah invers dirinya sendiri)');
test('undo: toggle ulang langkah terakhir mengembalikan papan sebelum langkah itu', () => {
  const seq: Array<[number, number]> = [[0, 0], [2, 2], [4, 3], [1, 4]];
  let board = scramble(() => 0.42, 8);
  const before: boolean[][] = [];
  for (const [r, c] of seq) { before.push(board); board = toggle(board, r, c); }
  // undo = terapkan toggle yang sama pada langkah terakhir, urut mundur
  for (let i = seq.length - 1; i >= 0; i -= 1) {
    board = toggle(board, seq[i][0], seq[i][1]);
    assert.deepEqual(board, before[i], `setelah undo langkah ke-${i + 1}`);
  }
});

console.log(`\n${passed} lulus, ${failed} gagal${failed > 0 ? `: ${failures.join(', ')}` : ''}`);
process.exit(failed > 0 ? 1 : 0);
