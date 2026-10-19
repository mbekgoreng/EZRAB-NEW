/**
 * ArcadeBlackjack (meja proyek) — logic tests.
 * Run: npx tsx src/game-space/games/arcade/blackjack/logic.test.ts
 */
import { strict as assert } from 'node:assert';
import {
  makeShoe, handValue, isBlackjack, isBust, dealerShouldHit,
  resolve, payout, label, DECKS, RESHUFFLE_AT, BLACKJACK_PAY,
  type Card,
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

const C = (rank: number, suit = 0): Card => ({ rank, suit });
const hand = (...ranks: number[]): Card[] => ranks.map((r) => C(r));

console.log('\n[1] makeShoe');
test('4 deck = 208 kartu', () => {
  const shoe = makeShoe(() => 0.5);
  assert.equal(shoe.length, DECKS * 52);
  assert.equal(DECKS, 4);
});
test('tiap kartu muncul tepat 4x', () => {
  const shoe = makeShoe(() => 0.3);
  const counts = new Map<string, number>();
  for (const c of shoe) {
    const k = `${c.rank}-${c.suit}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  assert.equal(counts.size, 52);
  for (const n of counts.values()) assert.equal(n, 4);
});

console.log('\n[2] handValue (As fleksibel)');
test('As + 9 = 20 (soft)', () => {
  const v = handValue(hand(1, 9));
  assert.equal(v.value, 20);
  assert.equal(v.soft, true);
});
test('As + 9 + 5 = 15 (As jadi 1)', () => {
  const v = handValue(hand(1, 9, 5));
  assert.equal(v.value, 15);
  assert.equal(v.soft, false);
});
test('As + As + 9 = 21', () => {
  assert.equal(handValue(hand(1, 1, 9)).value, 21);
});
test('K + Q = 20', () => {
  assert.equal(handValue(hand(13, 12)).value, 20);
});
test('As + K = 21', () => {
  assert.equal(handValue(hand(1, 13)).value, 21);
});

console.log('\n[3] isBlackjack & isBust');
test('2 kartu 21 = blackjack; 3 kartu 21 bukan', () => {
  assert.ok(isBlackjack(hand(1, 13)));
  assert.ok(!isBlackjack(hand(1, 5, 5)));
});
test('bust > 21', () => {
  assert.ok(isBust(hand(10, 9, 5)));
  assert.ok(!isBust(hand(10, 9, 2)));
});

console.log('\n[4] dealerShouldHit (berhenti di 17)');
test('hit di 16, berhenti di 17 & soft 17', () => {
  assert.ok(dealerShouldHit(hand(10, 6)));
  assert.ok(!dealerShouldHit(hand(10, 7)));
  assert.ok(!dealerShouldHit(hand(1, 6))); // soft 17 → berhenti
  assert.ok(!dealerShouldHit(hand(1, 10))); // 21
});

console.log('\n[5] resolve');
test('pemain blackjack vs bukan → blackjack', () => {
  const r = resolve(hand(1, 13), hand(10, 7), false);
  assert.equal(r.outcome, 'blackjack');
});
test('sama-sama blackjack → push', () => {
  assert.equal(resolve(hand(1, 13), hand(1, 12), false).outcome, 'push');
});
test('pemain bust → lose', () => {
  assert.equal(resolve(hand(10, 9, 5), hand(10, 6), false).outcome, 'lose');
});
test('bandar bust → win', () => {
  assert.equal(resolve(hand(10, 7), hand(10, 6, 8), false).outcome, 'win');
});
test('20 vs 18 → win; 18 vs 20 → lose; 19 vs 19 → push', () => {
  assert.equal(resolve(hand(10, 10), hand(10, 8), false).outcome, 'win');
  assert.equal(resolve(hand(10, 8), hand(10, 10), false).outcome, 'lose');
  assert.equal(resolve(hand(10, 9), hand(9, 10), false).outcome, 'push');
});

console.log('\n[6] payout (bet sudah dipotong di awal)');
test('blackjack bayar 3:2 → terima 2.5× bet', () => {
  assert.equal(payout('blackjack', 100), Math.floor(100 * (1 + BLACKJACK_PAY)));
  assert.equal(BLACKJACK_PAY, 1.5);
});
test('win → 2× bet, push → 1× bet, lose → 0', () => {
  assert.equal(payout('win', 100), 200);
  assert.equal(payout('push', 100), 100);
  assert.equal(payout('lose', 100), 0);
});

console.log('\n[7] label');
test('label kartu', () => {
  assert.equal(label(C(1, 0)), 'A♠');
  assert.equal(label(C(13, 1)), 'K♥');
  assert.equal(label(C(10, 3)), '10♣');
});
test('RESHUFFLE_AT = 60', () => {
  assert.equal(RESHUFFLE_AT, 60);
});

console.log(`\n${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join(', ')}` : ''}`);
process.exit(failed ? 1 : 0);
