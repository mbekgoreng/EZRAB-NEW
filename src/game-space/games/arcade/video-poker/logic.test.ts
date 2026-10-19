/**
 * Video Poker Proyek logic tests. Run: npx tsx src/game-space/games/arcade/video-poker/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  makeDeck, shuffle, evaluate, createState, placeDeal, placeDraw, refill,
  mulberry32, type Card,
} from './logic';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
  try { fn(); passed += 1; console.log(`  PASS ${name}`); }
  catch (e) { failed += 1; console.log(`  FAIL ${name} — ${(e as Error).message}`); }
}
const C = (rank: number, suit: number): Card => ({ rank, suit });

test('deck 52 kartu unik', () => {
  const d = makeDeck();
  assert.equal(d.length, 52);
  assert.equal(new Set(d.map((c) => `${c.rank}-${c.suit}`)).size, 52);
});

test('shuffle deterministik dengan seed sama', () => {
  const a = shuffle(makeDeck(), mulberry32(7)).map((c) => c.rank);
  const b = shuffle(makeDeck(), mulberry32(7)).map((c) => c.rank);
  assert.deepEqual(a, b);
});

test('royal flush proyek', () => {
  const r = evaluate([C(10, 0), C(11, 0), C(12, 0), C(13, 0), C(14, 0)]);
  assert.equal(r.key, 'royal'); assert.equal(r.pay, 250);
});

test('straight flush', () => {
  const r = evaluate([C(5, 2), C(6, 2), C(7, 2), C(8, 2), C(9, 2)]);
  assert.equal(r.key, 'straightFlush');
});

test('four of a kind', () => {
  const r = evaluate([C(9, 0), C(9, 1), C(9, 2), C(9, 3), C(2, 0)]);
  assert.equal(r.key, 'four'); assert.equal(r.pay, 25);
});

test('full house', () => {
  const r = evaluate([C(12, 0), C(12, 1), C(12, 2), C(4, 0), C(4, 3)]);
  assert.equal(r.key, 'fullHouse'); assert.equal(r.pay, 9);
});

test('flush', () => {
  const r = evaluate([C(2, 1), C(5, 1), C(9, 1), C(11, 1), C(13, 1)]);
  assert.equal(r.key, 'flush'); assert.equal(r.pay, 6);
});

test('straight biasa', () => {
  const r = evaluate([C(4, 0), C(5, 1), C(6, 2), C(7, 0), C(8, 3)]);
  assert.equal(r.key, 'straight'); assert.equal(r.pay, 4);
});

test('straight A-2-3-4-5 (wheel)', () => {
  const r = evaluate([C(14, 0), C(2, 1), C(3, 2), C(4, 0), C(5, 3)]);
  assert.equal(r.key, 'straight');
});

test('three of a kind', () => {
  const r = evaluate([C(7, 0), C(7, 1), C(7, 2), C(2, 0), C(13, 3)]);
  assert.equal(r.key, 'three'); assert.equal(r.pay, 3);
});

test('two pair', () => {
  const r = evaluate([C(6, 0), C(6, 1), C(10, 2), C(10, 3), C(3, 0)]);
  assert.equal(r.key, 'twoPair'); assert.equal(r.pay, 2);
});

test('pair Tukang (J) dibayar, pair 10 tidak', () => {
  const jacks = evaluate([C(11, 0), C(11, 1), C(3, 2), C(7, 0), C(9, 3)]);
  assert.equal(jacks.key, 'jacks'); assert.equal(jacks.pay, 1);
  const tens = evaluate([C(10, 0), C(10, 1), C(3, 2), C(7, 0), C(9, 3)]);
  assert.equal(tens.key, 'none'); assert.equal(tens.pay, 0);
});

test('pair Direktur (A) dibayar', () => {
  const r = evaluate([C(14, 0), C(14, 1), C(3, 2), C(7, 0), C(9, 3)]);
  assert.equal(r.key, 'jacks');
});

test('deal potong taruhan & bagi 5 kartu', () => {
  const st = createState();
  st.bet = 3;
  assert.ok(placeDeal(st, mulberry32(1)));
  assert.equal(st.credits, 97);
  assert.equal(st.hand.length, 5);
  assert.equal(st.phase, 'hold');
});

test('deal gagal kalau kredit kurang', () => {
  const st = createState();
  st.credits = 2; st.bet = 5;
  assert.equal(placeDeal(st, mulberry32(1)), false);
  assert.equal(st.phase, 'deal');
});

test('draw hanya ganti kartu non-hold', () => {
  const st = createState();
  placeDeal(st, mulberry32(5));
  const kept = [st.hand[0], st.hand[4]];
  st.held = [true, false, false, false, true];
  placeDraw(st, mulberry32(9));
  assert.deepEqual(st.hand[0], kept[0]);
  assert.deepEqual(st.hand[4], kept[1]);
  assert.equal(st.phase, 'deal');
});

test('refill isi ulang saat bangkrut', () => {
  const st = createState();
  st.credits = 0;
  refill(st);
  assert.equal(st.credits, 100);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
