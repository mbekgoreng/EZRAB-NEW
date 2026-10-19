/**
 * Video Poker Proyek — Jacks or Better reskin konstruksi.
 * Corak kartu = material proyek: Bata 🧱, Kayu 🪵, Besi 🔩, Cat 🎨.
 * Pangkat J/Q/K/A = Tukang/Mandor/Arsitek/Direktur. Pure logic, tanpa canvas.
 */

export interface Card {
  rank: number; // 2..14 (11=Tukang 12=Mandor 13=Arsitek 14=Direktur)
  suit: number; // 0..3
}

export const SUITS = [
  { name: 'Bata', symbol: '🧱' },
  { name: 'Kayu', symbol: '🪵' },
  { name: 'Besi', symbol: '🔩' },
  { name: 'Cat', symbol: '🎨' },
] as const;

export const RANK_LABEL: Record<number, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'T', 12: 'M', 13: 'A', 14: 'D',
};
export const RANK_NAME: Record<number, string> = {
  2: 'Dua', 3: 'Tiga', 4: 'Empat', 5: 'Lima', 6: 'Enam', 7: 'Tujuh',
  8: 'Delapan', 9: 'Sembilan', 10: 'Sepuluh',
  11: 'Tukang', 12: 'Mandor', 13: 'Arsitek', 14: 'Direktur',
};

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 52 kartu unik. */
export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (let suit = 0; suit < 4; suit += 1) {
    for (let rank = 2; rank <= 14; rank += 1) deck.push({ rank, suit });
  }
  return deck;
}

export function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = (rng() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface HandResult {
  key: string;
  name: string;
  pay: number; // per koin taruhan
}

const PAYS: Record<string, { name: string; pay: number }> = {
  royal: { name: 'ROYAL PROYEK!', pay: 250 },
  straightFlush: { name: 'Borongan Lurus', pay: 50 },
  four: { name: 'Kuartet Mandor', pay: 25 },
  fullHouse: { name: 'Rumah Penuh', pay: 9 },
  flush: { name: 'Siram Rata', pay: 6 },
  straight: { name: 'Antre Lurus', pay: 4 },
  three: { name: 'Trio Tukang', pay: 3 },
  twoPair: { name: 'Dua Pasang', pay: 2 },
  jacks: { name: 'Tukang ke Atas', pay: 1 },
  none: { name: 'Zonk — Boncos', pay: 0 },
};

/** Nilai kombinasi 5 kartu (Jacks or Better, 9/6). */
export function evaluate(cards: Card[]): HandResult {
  const ranks = cards.map((c) => c.rank).sort((a, b) => a - b);
  const flush = cards.every((c) => c.suit === cards[0].suit);
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.values()].sort((a, b) => b - a);

  let straight = false;
  const uniq = [...new Set(ranks)];
  if (uniq.length === 5) {
    if (uniq[4] - uniq[0] === 4) straight = true;
    else if (uniq.join(',') === '2,3,4,5,14') straight = true; // A-2-3-4-5
  }
  const isRoyal = straight && flush && uniq[0] === 10;

  let key = 'none';
  if (isRoyal) key = 'royal';
  else if (straight && flush) key = 'straightFlush';
  else if (groups[0] === 4) key = 'four';
  else if (groups[0] === 3 && groups[1] === 2) key = 'fullHouse';
  else if (flush) key = 'flush';
  else if (straight) key = 'straight';
  else if (groups[0] === 3) key = 'three';
  else if (groups[0] === 2 && groups[1] === 2) key = 'twoPair';
  else if (groups[0] === 2) {
    const pairRank = [...counts.entries()].find(([, n]) => n === 2)![0];
    if (pairRank >= 11) key = 'jacks'; // Tukang/Mandor/Arsitek/Direktur
  }
  const p = PAYS[key];
  return { key, name: p.name, pay: p.pay };
}

export type Phase = 'deal' | 'hold';

export interface VPState {
  credits: number;
  bet: number; // 1..5
  deck: Card[];
  hand: Card[];
  held: boolean[];
  phase: Phase;
  lastName: string;
  lastWin: number;
}

export const START_CREDITS = 100;
export const MAX_BET = 5;

export function createState(): VPState {
  return {
    credits: START_CREDITS, bet: 1, deck: [], hand: [],
    held: [false, false, false, false, false],
    phase: 'deal', lastName: '', lastWin: 0,
  };
}

export function canAfford(st: VPState): boolean {
  return st.credits >= st.bet;
}

/** Taruhan dipotong, 5 kartu dibagikan. Return false jika kredit kurang. */
export function placeDeal(st: VPState, rng: () => number): boolean {
  if (st.phase !== 'deal' || !canAfford(st)) return false;
  st.credits -= st.bet;
  st.deck = shuffle(makeDeck(), rng);
  st.hand = st.deck.slice(0, 5);
  st.deck = st.deck.slice(5);
  st.held = [false, false, false, false, false];
  st.lastWin = 0;
  st.lastName = '';
  st.phase = 'hold';
  return true;
}

/** Kartu yang tidak di-hold diganti dari deck, lalu dinilai. */
export function placeDraw(st: VPState): HandResult | null {
  if (st.phase !== 'hold') return null;
  for (let i = 0; i < 5; i += 1) {
    if (!st.held[i]) {
      const c = st.deck.pop();
      if (c) st.hand[i] = c;
    }
  }
  const res = evaluate(st.hand);
  st.lastName = res.name;
  st.lastWin = res.pay * st.bet;
  st.credits += st.lastWin;
  st.phase = 'deal';
  return res;
}

/** Isi ulang koin virtual kalau bangkrut (koin mainan, bukan uang). */
export function refill(st: VPState): void {
  if (st.credits < MAX_BET) st.credits = START_CREDITS;
}
