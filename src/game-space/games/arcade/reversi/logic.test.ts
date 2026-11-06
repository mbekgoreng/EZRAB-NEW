/**
 * ArcadeReversi logic tests. Run: npx tsx src/game-space/games/arcade/reversi/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  emptyBoard, legalMoves, applyMove, count, isGameOver,
  aiPickMove, flipsAt, movePreviews, flipVisibleFace, BLACK, WHITE, N,
} from './logic';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void): void {
  try { fn(); passed += 1; console.log(`  PASS ${name}`); }
  catch (e) { failed += 1; failures.push(name); console.log(`  FAIL ${name} — ${(e as Error).message}`); }
}
let s = 12345;
const rng = (): number => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };

test('papan awal: 2 hitam 2 putih di tengah', () => {
  const b = emptyBoard();
  const { black, white } = count(b);
  assert.equal(black, 2); assert.equal(white, 2);
});

test('langkah legal awal hitam = 4', () => {
  const moves = legalMoves(emptyBoard(), BLACK);
  assert.equal(moves.length, 4);
});

test('applyMove membalik bidak lawan', () => {
  const b = emptyBoard();
  const mv = legalMoves(b, BLACK).find((m) => m.r === 2 && m.c === 3);
  assert.ok(mv, 'harus ada langkah (2,3)');
  const nb = applyMove(b, mv, BLACK);
  assert.equal(nb[2][3], BLACK);
  assert.equal(nb[3][3], BLACK); // bidak putih terbalik
  const { black, white } = count(nb);
  assert.equal(black, 4); assert.equal(white, 1);
});

test('langkah ilegal tidak muncul di legalMoves', () => {
  const moves = legalMoves(emptyBoard(), BLACK);
  assert.ok(!moves.some((m) => m.r === 0 && m.c === 0));
});

test('isGameOver pada papan penuh', () => {
  const b = emptyBoard();
  for (let r = 0; r < N; r += 1) for (let c = 0; c < N; c += 1) b[r][c] = (r + c) % 2 === 0 ? BLACK : WHITE;
  assert.ok(isGameOver(b));
});

test('AI memilih langkah legal', () => {
  const b = emptyBoard();
  const { move } = aiPickMove(b, WHITE, rng);
  assert.ok(move);
  const legal = legalMoves(b, WHITE);
  assert.ok(legal.some((m) => m.r === move!.r && m.c === move!.c));
});

test('AI mengambil sudut bila tersedia (langkah cerdas)', () => {
  // susun papan di mana (0,0) legal untuk putih
  const b = emptyBoard();
  for (let r = 0; r < N; r += 1) for (let c = 0; c < N; c += 1) b[r][c] = 0;
  b[0][1] = BLACK; b[0][2] = WHITE;
  b[1][0] = BLACK; b[1][1] = BLACK; b[2][0] = WHITE; b[2][2] = WHITE;
  const legal = legalMoves(b, WHITE);
  assert.ok(legal.some((m) => m.r === 0 && m.c === 0), 'sudut harus legal');
  // paksa rng agar tidak kena 20% sub-optimal
  const { move } = aiPickMove(b, WHITE, () => 0.99);
  assert.ok(move && move.r === 0 && move.c === 0, `AI harus ambil sudut, dapat (${move?.r},${move?.c})`);
});

test('AI kadang sub-optimal (bisa dikalahkan): dengan rng<0.2 tidak selalu terbaik', () => {
  const b = emptyBoard();
  let corner = 0;
  // papan di mana sudut (0,0) jelas terbaik TAPI ada opsi legal lain (5,5);
  // rng kecil memicu cabang sub-optimal -> AI tidak selalu ambil sudut
  for (let r = 0; r < N; r += 1) for (let c = 0; c < N; c += 1) b[r][c] = 0;
  b[0][1] = BLACK; b[0][2] = WHITE;
  b[1][0] = BLACK; b[1][1] = BLACK; b[2][0] = WHITE; b[2][2] = WHITE;
  b[3][3] = BLACK; b[4][4] = BLACK; // membuat (5,5) legal untuk putih
  const legal = legalMoves(b, WHITE);
  assert.ok(legal.length >= 2, `butuh >=2 langkah legal, dapat ${legal.length}`);
  assert.ok(legal.some((m) => m.r === 0 && m.c === 0), 'sudut harus legal');
  for (let i = 0; i < 40; i += 1) {
    const { move } = aiPickMove(b, WHITE, () => 0.01);
    if (move && move.r === 0 && move.c === 0) corner += 1;
  }
  assert.ok(corner < 40, `AI harus kadang tidak ambil sudut (ambil ${corner}/40)`);
});

test('simulasi penuh berakhir tanpa error', () => {
  let b = emptyBoard();
  let turn: 1 | 2 = BLACK;
  let guard = 0;
  while (!isGameOver(b) && guard < 200) {
    const moves = legalMoves(b, turn);
    if (moves.length > 0) {
      b = turn === BLACK
        ? applyMove(b, moves[((rng() * moves.length) | 0)], turn)
        : applyMove(b, aiPickMove(b, WHITE, rng).move!, turn);
    }
    turn = turn === BLACK ? WHITE : BLACK;
    guard += 1;
  }
  assert.ok(isGameOver(b));
  const { black, white } = count(b);
  assert.equal(black + white, 64);
});

// --- Pratinjau langkah (flipsAt + movePreviews) ---
// Papan rancangan: (3,2) untuk HITAM membalik 3 keping dari dua arah
// (2 mendatar + 1 tegak); (0,0) membalik 1 keping dan adalah sudut.
function previewBoard() {
  const b = emptyBoard();
  for (let r = 0; r < N; r += 1) for (let c = 0; c < N; c += 1) b[r][c] = 0;
  b[0][1] = WHITE; b[0][2] = BLACK;
  b[3][3] = WHITE; b[3][4] = WHITE; b[3][5] = BLACK;
  b[4][2] = WHITE; b[5][2] = BLACK;
  return b;
}

test('flipsAt menghitung balik multi-arah dengan tepat', () => {
  const b = previewBoard();
  const flips = flipsAt(b, 3, 2, BLACK);
  assert.equal(flips.length, 3);
  assert.ok(flips.some(([r, c]) => r === 3 && c === 3));
  assert.ok(flips.some(([r, c]) => r === 3 && c === 4));
  assert.ok(flips.some(([r, c]) => r === 4 && c === 2));
  assert.equal(flipsAt(b, 0, 0, BLACK).length, 1);
});

test('flipsAt menolak sel terisi, di luar papan, dan tanpa jepitan', () => {
  const b = previewBoard();
  assert.deepEqual(flipsAt(b, 3, 3, BLACK), []); // terisi putih
  assert.deepEqual(flipsAt(b, 3, 5, BLACK), []); // terisi hitam
  assert.deepEqual(flipsAt(b, -1, 0, BLACK), []); // luar papan
  assert.deepEqual(flipsAt(b, 8, 8, BLACK), []); // luar papan
  assert.deepEqual(flipsAt(b, 7, 7, BLACK), []); // kosong tapi tidak menjepit
});

test('movePreviews papan awal: 4 langkah, masing-masing membalik 1', () => {
  const previews = movePreviews(emptyBoard(), BLACK);
  assert.equal(previews.length, 4);
  assert.ok(previews.every((p) => p.flipCount === 1));
  assert.ok(previews.every((p) => !p.isCorner));
});

test('movePreviews membedakan langkah besar vs kecil + menandai sudut (diskriminatif)', () => {
  const previews = movePreviews(previewBoard(), BLACK);
  const big = previews.find((p) => p.r === 3 && p.c === 2);
  const corner = previews.find((p) => p.r === 0 && p.c === 0);
  assert.ok(big, 'langkah (3,2) harus ada di pratinjau');
  assert.ok(corner, 'langkah (0,0) harus ada di pratinjau');
  assert.equal(big!.flipCount, 3);
  assert.equal(corner!.flipCount, 1);
  assert.equal(corner!.isCorner, true);
  assert.equal(big!.isCorner, false);
  // jumlah pada pratinjau harus sama dengan flips pada langkah legalnya
  for (const p of previews) {
    const mv = legalMoves(previewBoard(), BLACK).find((m) => m.r === p.r && m.c === p.c);
    assert.equal(p.flipCount, mv!.flips.length);
  }
});

// --- Regresi bug animasi balik: sisi lama harus tampil di separuh pertama ---
test('flipVisibleFace: separuh pertama sisi lama, separuh kedua sisi baru', () => {
  assert.equal(flipVisibleFace(WHITE, BLACK, 0), WHITE);
  assert.equal(flipVisibleFace(WHITE, BLACK, 0.25), WHITE);
  assert.equal(flipVisibleFace(WHITE, BLACK, 0.49), WHITE);
  assert.equal(flipVisibleFace(WHITE, BLACK, 0.5), BLACK);
  assert.equal(flipVisibleFace(WHITE, BLACK, 0.75), BLACK);
  assert.equal(flipVisibleFace(WHITE, BLACK, 1), BLACK);
  assert.equal(flipVisibleFace(BLACK, WHITE, 0.1), BLACK);
  assert.equal(flipVisibleFace(BLACK, BLACK, 0.1), BLACK); // tanpa perubahan sisi
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log('failures:', failures.join(', ')); process.exit(1); }
