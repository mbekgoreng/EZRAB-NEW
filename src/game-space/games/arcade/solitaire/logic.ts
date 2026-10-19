/**
 * ArcadeSolitaire — "Solitaire Proyek" (Klondike aturan penuh).
 * 4 "suit" material proyek: 🔩 Besi (hitam), 🧱 Bata (merah),
 * 🪵 Kayu (hitam), 🎨 Cat (merah). J=Kenek, Q=Arsitek, K=Mandor.
 *
 * Pure logic: deck, deal, semua langkah legal, undo (snapshot),
 * skor, deteksi menang. Rendering & drag di ArcadeSolitaire.tsx.
 */

export type Suit = 0 | 1 | 2 | 3;

export const SUIT_INFO: Array<{ nama: string; ikon: string; merah: boolean }> = [
  { nama: 'Besi', ikon: '🔩', merah: false },
  { nama: 'Bata', ikon: '🧱', merah: true },
  { nama: 'Kayu', ikon: '🪵', merah: false },
  { nama: 'Cat', ikon: '🎨', merah: true },
];

export const RANK_LABEL = [
  '', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K',
] as const;

export const RANK_NAME: Record<number, string> = {
  1: 'Helm K3',
  11: 'Kenek',
  12: 'Arsitek',
  13: 'Mandor',
};

export interface Card {
  id: number; // 0..51 unik
  suit: Suit;
  rank: number; // 1..13
  faceUp: boolean;
}

export type Pile = Card[];

export interface SolState {
  stock: Pile; // kartu tertutup; ambil dari AKHIR
  waste: Pile; // terbuka; aktif = AKHIR
  foundations: [Pile, Pile, Pile, Pile]; // A→K per suit
  tableau: [Pile, Pile, Pile, Pile, Pile, Pile, Pile];
  moves: number;
  score: number;
  stockCycles: number;
  undo: string[]; // snapshot JSON, dibatasi
}

export const UNDO_LIMIT = 120;

export function makeDeck(): Card[] {
  const deck: Card[] = [];
  let id = 0;
  for (let s = 0 as Suit; s < 4; s = (s + 1) as Suit) {
    for (let r = 1; r <= 13; r += 1) {
      deck.push({ id: id++, suit: s, rank: r, faceUp: false });
    }
  }
  return deck;
}

/** Fisher–Yates dengan RNG injeksi. */
export function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Deal Klondike: kolom i berisi i+1 kartu, teratas terbuka. */
export function deal(rng: () => number): SolState {
  const deck = shuffle(makeDeck(), rng);
  const tableau = [[], [], [], [], [], [], []] as SolState['tableau'];
  for (let col = 0; col < 7; col += 1) {
    for (let k = 0; k <= col; k += 1) {
      const c = deck.pop() as Card;
      c.faceUp = k === col;
      tableau[col].push(c);
    }
  }
  return {
    stock: deck, // sisa 24, tertutup
    waste: [],
    foundations: [[], [], [], []],
    tableau,
    moves: 0,
    score: 0,
    stockCycles: 0,
    undo: [],
  };
}

/* ---------- snapshot / undo ---------- */

interface Snap {
  stock: Pile;
  waste: Pile;
  foundations: Pile[];
  tableau: Pile[];
  moves: number;
  score: number;
  stockCycles: number;
}

function snapshot(st: SolState): string {
  const s: Snap = {
    stock: st.stock,
    waste: st.waste,
    foundations: st.foundations,
    tableau: st.tableau,
    moves: st.moves,
    score: st.score,
    stockCycles: st.stockCycles,
  };
  return JSON.stringify(s);
}

function pushUndo(st: SolState): void {
  st.undo.push(snapshot(st));
  if (st.undo.length > UNDO_LIMIT) st.undo.shift();
}

export function canUndo(st: SolState): boolean {
  return st.undo.length > 0;
}

export function undo(st: SolState): boolean {
  const raw = st.undo.pop();
  if (!raw) return false;
  const s = JSON.parse(raw) as Snap;
  st.stock = s.stock;
  st.waste = s.waste;
  st.foundations = [s.foundations[0], s.foundations[1], s.foundations[2], s.foundations[3]];
  st.tableau = [
    s.tableau[0], s.tableau[1], s.tableau[2], s.tableau[3],
    s.tableau[4], s.tableau[5], s.tableau[6],
  ];
  st.moves = s.moves;
  st.score = s.score;
  st.stockCycles = s.stockCycles;
  return true;
}

/* ---------- aturan legal ---------- */

/** Kartu boleh ditaruh di atas tumpukan tableau? */
export function canPlaceTableau(card: Card, pile: Pile): boolean {
  if (pile.length === 0) return card.rank === 13; // hanya Mandor (K)
  const top = pile[pile.length - 1];
  if (!top.faceUp) return false;
  const redCard = SUIT_INFO[card.suit].merah;
  const redTop = SUIT_INFO[top.suit].merah;
  return redCard !== redTop && card.rank === top.rank - 1;
}

/** Kartu boleh naik ke foundation? */
export function canPlaceFoundation(card: Card, pile: Pile): boolean {
  if (pile.length === 0) return card.rank === 1; // Helm K3 (A)
  const top = pile[pile.length - 1];
  return top.suit === card.suit && card.rank === top.rank + 1;
}

/** Buka kartu teratas tableau bila masih tertutup. */
export function flipTableauTop(st: SolState, col: number): boolean {
  const pile = st.tableau[col];
  const top = pile[pile.length - 1];
  if (top && !top.faceUp) {
    top.faceUp = true;
    return true;
  }
  return false;
}

/** Apakah `count` kartu teratas kolom membentuk urutan tableau yang valid & terbuka? */
export function validSequence(pile: Pile, count: number): boolean {
  if (count < 1 || count > pile.length) return false;
  const seq = pile.slice(pile.length - count);
  for (const c of seq) if (!c.faceUp) return false;
  for (let i = 0; i < seq.length - 1; i += 1) {
    const a = seq[i];
    const b = seq[i + 1];
    if (SUIT_INFO[a.suit].merah === SUIT_INFO[b.suit].merah) return false;
    if (a.rank !== b.rank + 1) return false;
  }
  return true;
}

function addScore(st: SolState, delta: number): void {
  st.score = Math.max(0, st.score + delta);
}

/* ---------- langkah ---------- */

export type DrawResult = 'drew' | 'recycled' | 'empty';

/** Ambil dari gudang (stock). Habis → daur ulang waste. */
export function drawStock(st: SolState): DrawResult {
  if (st.stock.length > 0) {
    pushUndo(st);
    const c = st.stock.pop() as Card;
    c.faceUp = true;
    st.waste.push(c);
    st.moves += 1;
    return 'drew';
  }
  if (st.waste.length > 0) {
    pushUndo(st);
    st.stock = st.waste.reverse().map((c) => ({ ...c, faceUp: false }));
    st.waste = [];
    st.stockCycles += 1;
    st.moves += 1;
    addScore(st, -20);
    return 'recycled';
  }
  return 'empty';
}

export function topWaste(st: SolState): Card | null {
  return st.waste.length > 0 ? st.waste[st.waste.length - 1] : null;
}

/** Waste → tableau. */
export function moveWasteToTableau(st: SolState, col: number): boolean {
  const card = topWaste(st);
  if (!card || !canPlaceTableau(card, st.tableau[col])) return false;
  pushUndo(st);
  st.waste.pop();
  st.tableau[col].push(card);
  st.moves += 1;
  addScore(st, 5);
  return true;
}

/** Waste → foundation. */
export function moveWasteToFoundation(st: SolState, fi: number): boolean {
  const card = topWaste(st);
  if (!card || !canPlaceFoundation(card, st.foundations[fi])) return false;
  pushUndo(st);
  st.waste.pop();
  st.foundations[fi].push(card);
  st.moves += 1;
  addScore(st, 10);
  return true;
}

/** Tableau → foundation (kartu teratas kolom). */
export function moveTableauToFoundation(st: SolState, col: number): boolean {
  const pile = st.tableau[col];
  const card = pile[pile.length - 1];
  if (!card || !card.faceUp) return false;
  for (let fi = 0; fi < 4; fi += 1) {
    if (canPlaceFoundation(card, st.foundations[fi])) {
      pushUndo(st);
      pile.pop();
      st.foundations[fi].push(card);
      flipTableauTop(st, col);
      st.moves += 1;
      addScore(st, 10);
      return true;
    }
  }
  return false;
}

/** Pindahkan `count` kartu teratas antar kolom tableau. */
export function moveTableauToTableau(
  st: SolState, from: number, count: number, to: number,
): boolean {
  if (from === to) return false;
  const src = st.tableau[from];
  const dst = st.tableau[to];
  if (!validSequence(src, count)) return false;
  const moving = src.slice(src.length - count);
  if (!canPlaceTableau(moving[0], dst)) return false;
  pushUndo(st);
  src.splice(src.length - count, count);
  dst.push(...moving);
  flipTableauTop(st, from);
  st.moves += 1;
  addScore(st, moving.length > 1 ? 5 : 3);
  return true;
}

/** Foundation → tableau (darurat, kena denda). */
export function moveFoundationToTableau(st: SolState, fi: number, col: number): boolean {
  const f = st.foundations[fi];
  const card = f[f.length - 1];
  if (!card || !canPlaceTableau(card, st.tableau[col])) return false;
  pushUndo(st);
  f.pop();
  st.tableau[col].push(card);
  st.moves += 1;
  addScore(st, -15);
  return true;
}

export type AutoSrc = { kind: 'waste' } | { kind: 'tableau'; col: number };

/** Coba naikkan kartu ke foundation yang cocok (klik/double-click). */
export function autoToFoundation(st: SolState, src: AutoSrc): boolean {
  if (src.kind === 'waste') {
    for (let fi = 0; fi < 4; fi += 1) {
      if (moveWasteToFoundation(st, fi)) return true;
    }
    return false;
  }
  return moveTableauToFoundation(st, src.col);
}

/** Menang bila 52 kartu naik ke tower. */
export function isWon(st: SolState): boolean {
  return st.foundations.every((f) => f.length === 13);
}

/** Ada langkah legal yang tersisa? (untuk deteksi buntu) */
export function hasAnyMove(st: SolState): boolean {
  if (st.stock.length > 0) return true;
  const w = topWaste(st);
  if (w) {
    if (st.foundations.some((f) => canPlaceFoundation(w, f))) return true;
    if (st.tableau.some((p) => canPlaceTableau(w, p))) return true;
  }
  for (let col = 0; col < 7; col += 1) {
    const pile = st.tableau[col];
    const top = pile[pile.length - 1];
    if (top && top.faceUp) {
      if (st.foundations.some((f) => canPlaceFoundation(top, f))) return true;
      for (let to = 0; to < 7; to += 1) {
        if (to !== col && canPlaceTableau(top, st.tableau[to])) return true;
      }
      // urutan lebih panjang
      for (let count = 2; count <= pile.length; count += 1) {
        if (!validSequence(pile, count)) break;
        const moving = pile[pile.length - count];
        for (let to = 0; to < 7; to += 1) {
          if (to !== col && canPlaceTableau(moving, st.tableau[to])) return true;
        }
      }
    }
  }
  return false;
}
