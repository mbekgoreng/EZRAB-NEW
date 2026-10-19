/**
 * ArcadeSolitaire — logic tests.
 * Run: npx tsx src/game-space/games/arcade/solitaire/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  deal, makeDeck, shuffle, canPlaceTableau, canPlaceFoundation,
  drawStock, moveWasteToTableau, moveWasteToFoundation,
  moveTableauToFoundation, moveTableauToTableau, moveFoundationToTableau,
  autoToFoundation, isWon, undo, canUndo, hasAnyMove, validSequence,
  SUIT_INFO, RANK_LABEL,
  type Card, type SolState, type Pile,
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

function seqRng(values: number[]): () => number {
  let k = 0;
  return () => values[k++ % values.length];
}

const C = (suit: 0 | 1 | 2 | 3, rank: number, faceUp = true): Card => ({
  id: suit * 13 + rank, suit, rank, faceUp,
});

console.log('\n[1] deck & deal');
test('makeDeck 52 kartu unik', () => {
  const d = makeDeck();
  assert.equal(d.length, 52);
  assert.equal(new Set(d.map((c) => c.id)).size, 52);
});
test('shuffle deterministik dengan rng sama', () => {
  const a = shuffle(makeDeck(), seqRng([0.1, 0.5, 0.9]));
  const b = shuffle(makeDeck(), seqRng([0.1, 0.5, 0.9]));
  assert.deepEqual(a.map((c) => c.id), b.map((c) => c.id));
});
test('deal: 7 kolom, kolom i berisi i+1 kartu, teratas terbuka', () => {
  const st = deal(() => 0.42);
  for (let i = 0; i < 7; i += 1) {
    assert.equal(st.tableau[i].length, i + 1, `kolom ${i}`);
    const top = st.tableau[i][i];
    assert.ok(top.faceUp, `kolom ${i} teratas terbuka`);
    for (let k = 0; k < i; k += 1) assert.ok(!st.tableau[i][k].faceUp);
  }
  assert.equal(st.stock.length, 24);
  assert.equal(st.waste.length, 0);
  assert.ok(st.foundations.every((f) => f.length === 0));
});
test('SUIT_INFO: 2 merah 2 hitam', () => {
  assert.equal(SUIT_INFO.filter((s) => s.merah).length, 2);
  assert.equal(SUIT_INFO.filter((s) => !s.merah).length, 2);
});
test('RANK_LABEL lengkap A..K', () => {
  assert.equal(RANK_LABEL[1], 'A');
  assert.equal(RANK_LABEL[13], 'K');
  assert.equal(RANK_LABEL.length, 14);
});

console.log('\n[2] aturan tableau');
test('kolom kosong hanya terima K (Mandor)', () => {
  assert.ok(canPlaceTableau(C(0, 13), []));
  assert.ok(!canPlaceTableau(C(0, 12), []));
});
test('turun 1 & beda warna', () => {
  // Q bata (merah) di atas K besi (hitam) → ok
  assert.ok(canPlaceTableau(C(1, 12), [C(0, 13)]));
  // Q besi (hitam) di atas K besi (hitam) → tolak (warna sama)
  assert.ok(!canPlaceTableau(C(0, 12), [C(0, 13)]));
  // J di atas K → tolak (selisih 2)
  assert.ok(!canPlaceTableau(C(1, 11), [C(0, 13)]));
});
test('tidak bisa taruh di atas kartu tertutup', () => {
  assert.ok(!canPlaceTableau(C(1, 12), [C(0, 13, false)]));
});

console.log('\n[3] aturan foundation');
test('foundation kosong hanya terima A', () => {
  assert.ok(canPlaceFoundation(C(2, 1), []));
  assert.ok(!canPlaceFoundation(C(2, 2), []));
});
test('naik 1 & suit sama', () => {
  assert.ok(canPlaceFoundation(C(2, 2), [C(2, 1)]));
  assert.ok(!canPlaceFoundation(C(1, 2), [C(2, 1)])); // beda suit
  assert.ok(!canPlaceFoundation(C(2, 3), [C(2, 1)])); // lompat
});

console.log('\n[4] stock/waste');
test('drawStock: stock→waste terbuka', () => {
  const st = deal(() => 0.1);
  const n0 = st.stock.length;
  const r = drawStock(st);
  assert.equal(r, 'drew');
  assert.equal(st.stock.length, n0 - 1);
  assert.equal(st.waste.length, 1);
  assert.ok(st.waste[0].faceUp);
});
test('drawStock: recycle saat stock habis', () => {
  const st = deal(() => 0.1);
  while (st.stock.length > 0) drawStock(st);
  const w = st.waste.length;
  assert.ok(w > 0);
  const r = drawStock(st);
  assert.equal(r, 'recycled');
  assert.equal(st.waste.length, 0);
  assert.equal(st.stock.length, w);
  assert.ok(st.stock.every((c) => !c.faceUp));
  assert.equal(st.stockCycles, 1);
});

console.log('\n[5] langkah & undo');
test('moveTableauToFoundation legal', () => {
  const st = deal(() => 0.1);
  // paksa: taruh A di atas kolom 0
  st.tableau[0] = [C(3, 1)];
  assert.ok(moveTableauToFoundation(st, 0));
  assert.equal(st.tableau[0].length, 0);
  const total = st.foundations.reduce((n, f) => n + f.length, 0);
  assert.equal(total, 1);
  assert.ok(st.score > 0);
});
test('moveTableauToFoundation ilegal → false, state utuh', () => {
  const st = deal(() => 0.1);
  st.tableau[0] = [C(3, 5)];
  const before = JSON.stringify(st.tableau[0]);
  assert.ok(!moveTableauToFoundation(st, 0));
  assert.equal(JSON.stringify(st.tableau[0]), before);
});
test('moveTableauToTableau: urutan valid', () => {
  const st = deal(() => 0.1);
  // kolom 0: K besi terbuka; kolom 1: Q bata terbuka di atas
  st.tableau[0] = [C(0, 13)];
  st.tableau[1] = [C(2, 5, false), C(1, 12)];
  assert.ok(moveTableauToTableau(st, 1, 1, 0));
  assert.equal(st.tableau[0].length, 2);
  assert.equal(st.tableau[1].length, 1);
  assert.ok(st.tableau[1][0].faceUp, 'kartu di bawah terbuka otomatis');
});
test('moveTableauToTableau: sekuens multi-kartu', () => {
  const st = deal(() => 0.1);
  st.tableau[0] = [C(0, 13)]; // K hitam
  // Q merah, J hitam → urutan valid
  st.tableau[1] = [C(1, 12), C(0, 11)];
  assert.ok(validSequence(st.tableau[1], 2));
  assert.ok(moveTableauToTableau(st, 1, 2, 0));
  assert.equal(st.tableau[0].length, 3);
});
test('moveWasteToTableau & moveWasteToFoundation', () => {
  const st = deal(() => 0.1);
  st.waste = [C(0, 13)];
  st.tableau[0] = [];
  assert.ok(moveWasteToTableau(st, 0));
  assert.equal(st.waste.length, 0);
  st.waste = [C(2, 1)];
  assert.ok(moveWasteToFoundation(st, 2));
  assert.equal(st.foundations[2][0].rank, 1);
});
test('moveFoundationToTableau kena denda', () => {
  const st = deal(() => 0.1);
  st.foundations[0] = [C(0, 1), C(0, 2)];
  st.tableau[0] = [C(1, 3)]; // 3 merah → 2 hitam boleh
  st.score = 50;
  assert.ok(moveFoundationToTableau(st, 0, 0));
  assert.ok(st.score < 50);
});
test('undo mengembalikan state', () => {
  const st = deal(() => 0.1);
  assert.ok(!canUndo(st));
  drawStock(st);
  assert.ok(canUndo(st));
  const wLen = st.waste.length;
  assert.ok(wLen === 1);
  assert.ok(undo(st));
  assert.equal(st.waste.length, 0);
  assert.equal(st.stock.length, 24);
});
test('autoToFoundation dari waste', () => {
  const st = deal(() => 0.1);
  st.waste = [C(1, 1)];
  assert.ok(autoToFoundation(st, { kind: 'waste' }));
  const total = st.foundations.reduce((n, f) => n + f.length, 0);
  assert.equal(total, 1);
  assert.equal(st.waste.length, 0);
});

console.log('\n[6] menang & buntu');
test('isWon bila 4 tower penuh', () => {
  const st = deal(() => 0.1);
  for (let s = 0 as 0 | 1 | 2 | 3; s < 4; s = (s + 1) as 0 | 1 | 2 | 3) {
    const pile: Pile = [];
    for (let r = 1; r <= 13; r += 1) pile.push(C(s, r));
    st.foundations[s] = pile;
  }
  assert.ok(isWon(st));
});
test('isWon false di awal', () => {
  assert.ok(!isWon(deal(() => 0.1)));
});
test('hasAnyMove true di awal (stock tersedia)', () => {
  assert.ok(hasAnyMove(deal(() => 0.1)));
});
test('skor tidak negatif', () => {
  const st = deal(() => 0.1);
  st.foundations[0] = [C(0, 1)];
  st.tableau[0] = [C(1, 2)];
  st.score = 5;
  moveFoundationToTableau(st, 0, 0); // -15 → clamp 0
  assert.ok(st.score >= 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length > 0) console.log('FAILURES:', failures.join(', '));
if (failed > 0) process.exit(1);
