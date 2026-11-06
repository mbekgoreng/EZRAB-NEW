/**
 * ArcadeCheckers ("Dam Bata") — logic tests.
 * Run: npx tsx src/game-space/games/arcade/checkers/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  initialBoard, genMoves, applyMove, countPieces, gameStatus,
  aiPickMove, other, inBoard, SIZE, captureCount, forcedCapture,
  movesEndingAt, type Board, type Move,
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

function emptyBoard(): Board {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
}

console.log('\n[1] initialBoard');
test('12 bidak per sisi di kotak gelap', () => {
  const b = initialBoard();
  const cnt = countPieces(b);
  assert.equal(cnt.merah.man, 12);
  assert.equal(cnt.abu.man, 12);
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (b[r][c]) assert.equal((r + c) % 2, 1, `bidak di kotak terang ${r},${c}`);
    }
  }
});

console.log('\n[2] genMoves — jalan biasa');
test('merah di awal punya langkah maju', () => {
  const moves = genMoves(initialBoard(), 'merah');
  assert.ok(moves.length > 0);
  assert.ok(moves.every((m) => m.steps.every((s) => s.captured === null)));
  // semua langkah merah bergerak ke atas (baris berkurang)
  for (const m of moves) {
    assert.ok(m.steps[0].to[0] < m.from[0]);
  }
});

console.log('\n[3] genMoves — wajib makan');
test('bila bisa makan, hanya langkah makan yang legal', () => {
  const b = emptyBoard();
  b[4][3] = { side: 'merah', king: false };
  b[3][2] = { side: 'abu', king: false };
  b[5][0] = { side: 'merah', king: false }; // bisa jalan biasa
  const moves = genMoves(b, 'merah');
  assert.ok(moves.length > 0);
  assert.ok(moves.every((m) => m.steps.some((s) => s.captured !== null)), 'ada langkah non-makan!');
});
test('makan berantai (double jump) jadi satu langkah', () => {
  const b = emptyBoard();
  b[5][0] = { side: 'merah', king: false };
  b[4][1] = { side: 'abu', king: false };
  b[2][3] = { side: 'abu', king: false };
  // (5,0) makan (4,1)→(3,2), lalu makan (2,3)→(1,4)
  const moves = genMoves(b, 'merah');
  const dbl = moves.find((m) => m.steps.length === 2);
  assert.ok(dbl, `tidak ada double jump: ${JSON.stringify(moves)}`);
  assert.deepEqual(dbl.steps[1].to, [1, 4]);
});

console.log('\n[4] applyMove');
test('makan menghilangkan bidak lawan', () => {
  const b = emptyBoard();
  b[4][3] = { side: 'merah', king: false };
  b[3][2] = { side: 'abu', king: false };
  const moves = genMoves(b, 'merah');
  const nb = applyMove(b, moves[0]);
  const cnt = countPieces(nb);
  assert.equal(cnt.abu.man, 0);
  assert.equal(cnt.merah.man, 1);
  assert.ok(nb[2][1]?.side === 'merah');
  // papan asli tidak berubah
  assert.ok(b[3][2] !== null);
});
test('promosi jadi raja di baris akhir', () => {
  const b = emptyBoard();
  b[1][2] = { side: 'merah', king: false };
  const moves = genMoves(b, 'merah');
  const promo = moves.find((m) => m.promote);
  assert.ok(promo);
  const nb = applyMove(b, promo as Move);
  assert.ok(nb[0][1]?.king === true);
});

console.log('\n[5] gameStatus');
test('jalan di awal', () => {
  assert.equal(gameStatus(initialBoard(), 'merah'), 'jalan');
});
test('habis bidak → kalah', () => {
  const b = emptyBoard();
  b[0][1] = { side: 'abu', king: false };
  assert.equal(gameStatus(b, 'merah'), 'abu-menang');
});
test('tidak bisa jalan → kalah', () => {
  const b = emptyBoard();
  b[0][1] = { side: 'merah', king: false }; // pojok, tidak bisa gerak
  b[7][0] = { side: 'abu', king: false };
  assert.equal(gameStatus(b, 'merah'), 'abu-menang');
});

console.log('\n[6] aiPickMove');
test('selalu pilih langkah legal & wajib makan', () => {
  const b = emptyBoard();
  b[4][3] = { side: 'abu', king: false };
  b[5][2] = { side: 'merah', king: false };
  for (let i = 0; i < 20; i += 1) {
    const m = aiPickMove(b, 'abu', lcg(i + 1));
    assert.ok(m, 'AI tidak menemukan langkah');
    assert.ok((m as Move).steps.some((s) => s.captured !== null), 'AI melewatkan makan wajib!');
  }
});
test('null bila tidak ada langkah', () => {
  const b = emptyBoard();
  assert.equal(aiPickMove(b, 'abu', lcg(1)), null);
});
test('bisa dikalahkan: AI kadang blunder (pilih acak 25%)', () => {
  // dengan banyak pilihan, dalam 40x pick harus ada variasi (tidak selalu sama)
  const b = initialBoard();
  const seen = new Set<string>();
  for (let i = 0; i < 40; i += 1) {
    const m = aiPickMove(b, 'abu', lcg(i * 31 + 7));
    if (m) seen.add(JSON.stringify(m.from) + JSON.stringify(m.steps[0].to));
  }
  assert.ok(seen.size > 1, 'AI selalu pilih langkah yang sama — terlalu kaku');
});

console.log('\n[7] helpers');
test('other & inBoard', () => {
  assert.equal(other('merah'), 'abu');
  assert.equal(other('abu'), 'merah');
  assert.ok(inBoard(0, 0) && inBoard(7, 7));
  assert.ok(!inBoard(8, 0) && !inBoard(-1, 3));
  assert.equal(SIZE, 8);
});

console.log('\n[8] forcedCapture — kewajiban makan dari papan saja');
test('papan awal: tidak wajib makan', () => {
  const fc = forcedCapture(initialBoard(), 'merah');
  assert.equal(fc.mandatory, false);
  assert.deepEqual(fc.capturers, []);
  assert.equal(fc.moveCount, 0);
  assert.equal(fc.maxChain, 0);
});
test('satu penangkap terdeteksi tanpa memilih bidak apa pun', () => {
  const b = emptyBoard();
  b[4][3] = { side: 'merah', king: false };
  b[3][2] = { side: 'abu', king: false };
  b[5][0] = { side: 'merah', king: false }; // hanya bisa jalan biasa
  const fc = forcedCapture(b, 'merah');
  assert.equal(fc.mandatory, true);
  assert.deepEqual(fc.capturers, [[4, 3]]);
  assert.equal(fc.moveCount, 1);
  assert.equal(fc.maxChain, 1);
});
test('dua penangkap independen, urut baris-kolom', () => {
  const b = emptyBoard();
  b[4][1] = { side: 'merah', king: false };
  b[3][2] = { side: 'abu', king: false };
  b[6][5] = { side: 'merah', king: false };
  b[5][6] = { side: 'abu', king: false };
  const fc = forcedCapture(b, 'merah');
  assert.equal(fc.mandatory, true);
  assert.deepEqual(fc.capturers, [[4, 1], [6, 5]]);
  assert.equal(fc.moveCount, 2);
  assert.equal(fc.maxChain, 1);
});
test('rantai ganda: maxChain 2 & captureCount menghitung semua yang dimakan', () => {
  const b = emptyBoard();
  b[5][0] = { side: 'merah', king: false };
  b[4][1] = { side: 'abu', king: false };
  b[2][3] = { side: 'abu', king: false };
  const fc = forcedCapture(b, 'merah');
  assert.equal(fc.mandatory, true);
  assert.deepEqual(fc.capturers, [[5, 0]]);
  assert.equal(fc.maxChain, 2);
  const dbl = genMoves(b, 'merah').find((m) => m.steps.length === 2) as Move;
  assert.equal(captureCount(dbl), 2);
});
test('kewajiban makan juga berlaku untuk sisi abu', () => {
  const b = emptyBoard();
  b[3][4] = { side: 'abu', king: false };
  b[4][3] = { side: 'merah', king: false };
  const fc = forcedCapture(b, 'abu');
  assert.equal(fc.mandatory, true);
  assert.deepEqual(fc.capturers, [[3, 4]]);
});

console.log('\n[9] movesEndingAt — regresi bug tujuan ambigu');
test('dua rantai berbeda berakhir di kotak sama: keduanya tertahan, bukan yang pertama saja', () => {
  const b = emptyBoard();
  b[6][3] = { side: 'merah', king: false };
  b[5][2] = { side: 'abu', king: false };
  b[3][2] = { side: 'abu', king: false };
  b[5][4] = { side: 'abu', king: false };
  b[3][4] = { side: 'abu', king: false };
  // jalur A: (6,3)->(4,1)->(2,3) makan (5,2),(3,2)
  // jalur B: (6,3)->(4,5)->(2,3) makan (5,4),(3,4)
  const moves = genMoves(b, 'merah');
  const variants = movesEndingAt(moves, 2, 3);
  assert.equal(variants.length, 2, `diharapkan 2 varian, dapat ${variants.length}`);
  const capSets = variants
    .map((m) => m.steps.map((s) => (s.captured as [number, number]).join(',')).sort().join('|'))
    .sort();
  assert.deepEqual(capSets, ['3,2|5,2', '3,4|5,4']);
  // kotak perantara BUKAN tujuan akhir — tidak boleh cocok
  assert.equal(movesEndingAt(moves, 4, 1).length, 0);
  assert.equal(movesEndingAt(moves, 4, 5).length, 0);
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join(', ')}` : ''}`);
process.exit(failed ? 1 : 0);
