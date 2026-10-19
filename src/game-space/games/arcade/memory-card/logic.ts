/**
 * Pasangan Material — logika murni memory match.
 * Kartu berupa material konstruksi (bata, semen, helm, ...).
 */

export type Rand = () => number;

export function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Material {
  id: string;
  emoji: string;
  name: string;
  color: string;
}

export const MATERIALS: Material[] = [
  { id: 'bata', emoji: '🧱', name: 'Bata Merah', color: '#ef4444' },
  { id: 'semen', emoji: '🌫️', name: 'Semen', color: '#94a3b8' },
  { id: 'helm', emoji: '⛑️', name: 'Helm Proyek', color: '#f59e0b' },
  { id: 'crane', emoji: '🏗️', name: 'Tower Crane', color: '#eab308' },
  { id: 'palu', emoji: '🔨', name: 'Palu', color: '#78716c' },
  { id: 'gergaji', emoji: '🪚', name: 'Gergaji', color: '#fb923c' },
  { id: 'kunci', emoji: '🔧', name: 'Kunci Inggris', color: '#64748b' },
  { id: 'obeng', emoji: '🪛', name: 'Obeng', color: '#3b82f6' },
  { id: 'toolbox', emoji: '🧰', name: 'Kotak Perkakas', color: '#dc2626' },
  { id: 'cat', emoji: '🎨', name: 'Cat Tembok', color: '#a855f7' },
  { id: 'kayu', emoji: '🪵', name: 'Kayu Balok', color: '#92400e' },
  { id: 'tangga', emoji: '🪜', name: 'Tangga', color: '#ca8a04' },
  { id: 'paku', emoji: '📌', name: 'Paku', color: '#475569' },
  { id: 'batu', emoji: '🪨', name: 'Batu Kali', color: '#6b7280' },
  { id: 'barikade', emoji: '🚧', name: 'Barikade', color: '#f97316' },
  { id: 'rompi', emoji: '🦺', name: 'Rompi Proyek', color: '#84cc16' },
  { id: 'pipa', emoji: '🔩', name: 'Baut Pipa', color: '#0ea5e9' },
  { id: 'meteran', emoji: '📏', name: 'Meteran', color: '#eab308' },
];

export type Mode = '4x4' | '6x6';

export function pairsForMode(mode: Mode): number {
  return mode === '4x4' ? 8 : 18;
}

/** Deck: array materialId, tiap id tepat 2x, diacak. */
export function createDeck(mode: Mode, rand: Rand): string[] {
  const n = pairsForMode(mode);
  const pool = [...MATERIALS];
  // kocok pool dulu agar pilihan material bervariasi
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const chosen = pool.slice(0, n);
  const deck: string[] = [];
  for (const m of chosen) deck.push(m.id, m.id);
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function materialById(id: string): Material {
  const m = MATERIALS.find((x) => x.id === id);
  if (!m) throw new Error(`material tak dikenal: ${id}`);
  return m;
}

export interface MemoryState {
  deck: string[];
  matched: boolean[];
  open: number[]; // indeks kartu yang sedang terbuka (0..2)
  steps: number;
  pairsFound: number;
  totalPairs: number;
  locked: boolean; // true saat menunggu kartu mismatch menutup
  started: boolean;
  finished: boolean;
}

export function createMemory(mode: Mode, rand: Rand): MemoryState {
  const deck = createDeck(mode, rand);
  return {
    deck,
    matched: new Array(deck.length).fill(false),
    open: [],
    steps: 0,
    pairsFound: 0,
    totalPairs: pairsForMode(mode),
    locked: false,
    started: false,
    finished: false,
  };
}

export type FlipResult =
  | { kind: 'ignored' }
  | { kind: 'first' }
  | { kind: 'match'; pair: number }
  | { kind: 'mismatch'; a: number; b: number }
  | { kind: 'win' };

/**
 * Balik kartu ke-i. Pure: mengembalikan hasil; state dimutasi.
 * Kartu mismatch dibiarkan terbuka — pemanggil menutupnya via closeMismatch().
 */
export function flipCard(st: MemoryState, i: number): FlipResult {
  if (st.locked || st.finished) return { kind: 'ignored' };
  if (i < 0 || i >= st.deck.length) return { kind: 'ignored' };
  if (st.matched[i] || st.open.includes(i)) return { kind: 'ignored' };
  if (!st.started) st.started = true;
  st.open.push(i);
  if (st.open.length === 1) return { kind: 'first' };
  st.steps += 1;
  const [a, b] = st.open;
  if (st.deck[a] === st.deck[b]) {
    st.matched[a] = true;
    st.matched[b] = true;
    st.open = [];
    st.pairsFound += 1;
    if (st.pairsFound === st.totalPairs) {
      st.finished = true;
      return { kind: 'win' };
    }
    return { kind: 'match', pair: st.pairsFound };
  }
  st.locked = true;
  return { kind: 'mismatch', a, b };
}

/** Tutup dua kartu mismatch setelah jeda. */
export function closeMismatch(st: MemoryState): void {
  st.open = [];
  st.locked = false;
}

/** Skor performa: makin sedikit langkah & cepat makin tinggi. */
export function scoreFor(steps: number, seconds: number, pairs: number): number {
  const ideal = pairs; // 1 langkah per pasang = mustahil, dipakai sebagai acuan
  const stepScore = Math.max(0, 1000 - Math.max(0, steps - ideal) * 25);
  const timeScore = Math.max(0, 500 - Math.max(0, seconds - pairs * 4) * 5);
  return Math.round(stepScore + timeScore);
}
