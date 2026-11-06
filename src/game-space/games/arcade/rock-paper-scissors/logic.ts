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

/* ================================================================== */
/*  AI ADAPTIF BERTAHAP (Gelombang 1C)                                  */
/*                                                                      */
/*  Fase 'acak'    : ronde selesai < AI_WARMUP_ROUNDS -> AI acak murni, */
/*                   belum membaca pola apa pun.                        */
/*  Fase 'membaca' : AI memprediksi langkah pemain berikutnya dari      */
/*                   riwayat ronde yang SUDAH SELESAI saja:             */
/*                   1) transisi dari langkah terakhir pemain           */
/*                      (sesudah X pemain paling sering main apa),      */
/*                   2) bila tak ada data transisi: frekuensi total.    */
/*                   Prediksi DETERMINISTIK (tanpa rng) dan AI memainkan  */
/*                   penangkalnya. Pilihan ronde yang SEDANG berjalan    */
/*                   tidak pernah dibaca: prediksi dihitung dari        */
/*                   st.playerMoves SEBELUM langkah baru dicatat.       */
/* ================================================================== */

export const AI_WARMUP_ROUNDS = 2;

export type AiPhase = 'acak' | 'membaca';

export function aiPhaseFor(completedRounds: number): AiPhase {
  return completedRounds < AI_WARMUP_ROUNDS ? 'acak' : 'membaca';
}

/** Argmax deterministik: seri -> urutan MOVES (bata, gergaji, gambar). */
function argmaxMove(counts: Record<Move, number>): Move {
  let best: Move = MOVES[0];
  for (const m of MOVES) {
    if (counts[m] > counts[best]) best = m;
  }
  return best;
}

/**
 * Prediksi langkah pemain berikutnya dari riwayat langkah SELESAI.
 * Mengembalikan null bila riwayat belum cukup (< AI_WARMUP_ROUNDS).
 */
export function predictPlayerMove(playerMoves: Move[]): Move | null {
  if (playerMoves.length < AI_WARMUP_ROUNDS) return null;
  const last = playerMoves[playerMoves.length - 1];
  const trans: Record<Move, number> = { bata: 0, gergaji: 0, gambar: 0 };
  let transTotal = 0;
  for (let i = 0; i < playerMoves.length - 1; i += 1) {
    if (playerMoves[i] === last) {
      trans[playerMoves[i + 1]] += 1;
      transTotal += 1;
    }
  }
  if (transTotal > 0) return argmaxMove(trans);
  const freq: Record<Move, number> = { bata: 0, gergaji: 0, gambar: 0 };
  for (const m of playerMoves) freq[m] += 1;
  return argmaxMove(freq);
}

/**
 * Pilihan AI adaptif: fase acak / riwayat kurang -> acak via rng;
 * fase membaca -> penangkal prediksi, deterministik (rng tak dipakai).
 */
export function aiPickAdaptive(playerMoves: Move[], rng: () => number): Move {
  const predicted = predictPlayerMove(playerMoves);
  if (predicted === null) return MOVES[Math.floor(rng() * 3)];
  return counterOf(predicted);
}

/** Catat satu ronde dengan pilihan AI yang sudah ditentukan. */
function applyRound(st: RpsState, player: Move, ai: Move): RpsRound {
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

/** Mainkan satu ronde (AI klasik frekuensi — dipertahankan apa adanya). */
export function playRound(st: RpsState, player: Move, rng: () => number): RpsRound {
  return applyRound(st, player, aiPick(st.playerMoves, rng));
}

/**
 * Mainkan satu ronde dengan AI adaptif bertahap.
 * KEADILAN: pilihan AI dihitung dari st.playerMoves (ronde SELESAI)
 * SEBELUM langkah pemain ronde ini dicatat — AI tidak mengintip
 * pilihan ronde berjalan.
 */
export function playRoundAdaptive(st: RpsState, player: Move, rng: () => number): RpsRound {
  return applyRound(st, player, aiPickAdaptive(st.playerMoves, rng));
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
