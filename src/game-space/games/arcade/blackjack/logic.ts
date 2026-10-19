/**
 * ArcadeBlackjack (meja proyek) — pure logic.
 * Lawan "Mandor Besar", taruhan pakai sak semen. Aturan 21 baku:
 * bandar hit sampai 17 (berhenti di semua 17), blackjack bayar 3:2.
 */

export interface Card {
  rank: number; // 1=As .. 11=J, 12=Q, 13=K
  suit: number; // 0=♠ 1=♥ 2=♦ 3=♣
}

export const SUITS = ['♠', '♥', '♦', '♣'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const DECKS = 4;
export const RESHUFFLE_AT = 60;
export const BLACKJACK_PAY = 1.5;

export function isRed(suit: number): boolean {
  return suit === 1 || suit === 2;
}

/** Buat shoe 4 deck lalu acak. */
export function makeShoe(rng: () => number): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < DECKS; d += 1) {
    for (let s = 0; s < 4; s += 1) {
      for (let r = 1; r <= 13; r += 1) shoe.push({ rank: r, suit: s });
    }
  }
  for (let i = shoe.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

/** Nilai kartu untuk hitung (As = 11 dulu, disesuaikan di handValue). */
function cardPoints(rank: number): number {
  if (rank === 1) return 11;
  if (rank >= 11) return 10;
  return rank;
}

/** Nilai tangan terbaik ≤ 21 (As fleksibel 11/1). Kembalikan {value, soft}. */
export function handValue(cards: readonly Card[]): { value: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardPoints(c.rank);
    if (c.rank === 1) aces += 1;
  }
  let soft = aces > 0;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
    if (aces === 0) soft = false;
  }
  return { value: total, soft };
}

export function isBlackjack(cards: readonly Card[]): boolean {
  return cards.length === 2 && handValue(cards).value === 21;
}

export function isBust(cards: readonly Card[]): boolean {
  return handValue(cards).value > 21;
}

/** Bandar hit di < 17, berhenti di semua 17 (termasuk soft 17). */
export function dealerShouldHit(cards: readonly Card[]): boolean {
  return handValue(cards).value < 17;
}

export type Outcome = 'blackjack' | 'win' | 'push' | 'lose' | 'surrender';

/**
 * Selesaikan ronde. `bet` = taruhan awal (sudah termasuk penggandaan bila double).
 * Kembalikan outcome; payout dihitung terpisah.
 */
export function resolve(
  player: readonly Card[],
  dealer: readonly Card[],
  playerDoubled: boolean,
): { outcome: Outcome; reason: string } {
  void playerDoubled;
  const p = handValue(player).value;
  const d = handValue(dealer).value;
  const pBJ = isBlackjack(player);
  const dBJ = isBlackjack(dealer);
  if (pBJ && dBJ) return { outcome: 'push', reason: 'Sama-sama blackjack!' };
  if (pBJ) return { outcome: 'blackjack', reason: 'BLACKJACK! Mandor Besar tepuk tangan.' };
  if (dBJ) return { outcome: 'lose', reason: 'Mandor Besar blackjack.' };
  if (p > 21) return { outcome: 'lose', reason: 'Kelebihan 21 — bust!' };
  if (d > 21) return { outcome: 'win', reason: 'Mandor Besar bust!' };
  if (p > d) return { outcome: 'win', reason: `${p} vs ${d} — menang!` };
  if (p < d) return { outcome: 'lose', reason: `${p} vs ${d} — kalah.` };
  return { outcome: 'push', reason: `Seri ${p} — taruhan kembali.` };
}

/**
 * Perubahan saldo dari outcome. Taruhan `bet` sudah dipotong di awal.
 * Kembalikan delta saldo (positif = terima).
 */
export function payout(outcome: Outcome, bet: number): number {
  switch (outcome) {
    case 'blackjack': return Math.floor(bet * (1 + BLACKJACK_PAY));
    case 'win': return bet * 2;
    case 'push': return bet;
    case 'lose':
    case 'surrender': return 0;
  }
}

export function label(card: Card): string {
  return `${RANKS[card.rank - 1]}${SUITS[card.suit]}`;
}
