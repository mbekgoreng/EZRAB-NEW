/**
 * ArcadeRockPaperScissors — "Bata vs Gergaji vs Gambar Kerja".
 * Suit kontraktor: best-of melawan AI mandor yang belajar pola pemain.
 *
 * Siklus (bukan batu-kertas-gunting biasa):
 *  - 🧱 Bata mengalahkan 🪚 Gergaji (bata menumpulkan mata gergaji)
 *  - 🪚 Gergaji mengalahkan 📐 Gambar Kerja (gergaji mencacah gambar revisi)
 *  - 📐 Gambar Kerja mengalahkan 🧱 Bata (revisi gambar: bata dibongkar!)
 */

export type Move = 'bata' | 'gergaji' | 'gambar';

export const MOVES: Move[] = ['bata', 'gergaji', 'gambar'];

export const MOVE_INFO: Record<
  Move,
  { nama: string; ikon: string; aksiMenang: string }
> = {
  bata: {
    nama: 'Bata',
    ikon: '🧱',
    aksiMenang: 'Bata menumpulkan mata gergaji! Tukang ngamuk.',
  },
  gergaji: {
    nama: 'Gergaji',
    ikon: '🪚',
    aksiMenang: 'Gergaji mencacah gambar kerja jadi serpihan!',
  },
  gambar: {
    nama: 'Gambar Kerja',
    ikon: '📐',
    aksiMenang: 'Gambar kerja direvisi — bata dibongkar ulang!',
  },
};

/** BEATS[a] = langkah yang dikalahkan oleh a. */
const BEATS: Record<Move, Move> = {
  bata: 'gergaji',
  gergaji: 'gambar',
  gambar: 'bata',
};

/** Langkah yang mengalahkan m. */
export function counterOf(m: Move): Move {
  for (const c of MOVES) {
    if (BEATS[c] === m) return c;
  }
  return MOVES[0];
}

export type Outcome = 'menang' | 'kalah' | 'seri';

export function decide(player: Move, ai: Move): Outcome {
  if (player === ai) return 'seri';
  return BEATS[player] === ai ? 'menang' : 'kalah';
}

export interface RpsRound {
  player: Move;
  ai: Move;
  outcome: Outcome;
}

export type Winner = 'pemain' | 'ai' | null;

export interface RpsState {
  target: number; // kemenangan yang dibutuhkan (best-of)
  pScore: number;
  aScore: number;
  round: number;
  history: RpsRound[];
  playerMoves: Move[];
  over: boolean;
  winner: Winner;
}

export function createMatch(target = 3): RpsState {
  return {
    target,
    pScore: 0,
    aScore: 0,
    round: 0,
    history: [],
    playerMoves: [],
    over: false,
    winner: null,
  };
}

/**
 * AI "Mandor Pengamat": menghafal langkah tersering pemain lalu
 * meng-counter-nya (peluang 72%). Kadang ngawur biar adil.
 */
export const AI_COUNTER_CHANCE = 0.72;

export function aiPick(playerMoves: Move[], rng: () => number): Move {
  if (playerMoves.length === 0) return MOVES[Math.floor(rng() * 3)];
  const freq: Record<Move, number> = { bata: 0, gergaji: 0, gambar: 0 };
  for (const m of playerMoves) freq[m] += 1;
  let most: Move = 'bata';
  for (const m of MOVES) {
    if (freq[m] > freq[most]) most = m;
  }
  if (rng() < AI_COUNTER_CHANCE) return counterOf(most);
  return MOVES[Math.floor(rng() * 3)];
}

/** Mainkan satu ronde. Mengembalikan ronde yang baru dimainkan. */
export function playRound(st: RpsState, player: Move, rng: () => number): RpsRound {
  const ai = aiPick(st.playerMoves, rng);
  const outcome = decide(player, ai);
  const round: RpsRound = { player, ai, outcome };
  st.history.push(round);
  st.playerMoves.push(player);
  st.round += 1;
  if (outcome === 'menang') st.pScore += 1;
  else if (outcome === 'kalah') st.aScore += 1;
  if (st.pScore >= st.target) {
    st.over = true;
    st.winner = 'pemain';
  } else if (st.aScore >= st.target) {
    st.over = true;
    st.winner = 'ai';
  }
  return round;
}

/** Reset match dengan target yang sama. */
export function resetMatch(st: RpsState): void {
  const fresh = createMatch(st.target);
  st.pScore = fresh.pScore;
  st.aScore = fresh.aScore;
  st.round = fresh.round;
  st.history = fresh.history;
  st.playerMoves = fresh.playerMoves;
  st.over = fresh.over;
  st.winner = fresh.winner;
}

/** Streak kemenangan beruntun pemain dari history (untuk best score). */
export function currentWinStreak(st: RpsState): number {
  let s = 0;
  for (let i = st.history.length - 1; i >= 0; i -= 1) {
    if (st.history[i].outcome === 'menang') s += 1;
    else break;
  }
  return s;
}
