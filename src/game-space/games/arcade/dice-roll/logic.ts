/**
 * ArcadeDiceRoll ("Dadu Proyek") — pure logic.
 * Dadu 6 sisi berikon material proyek. Pemain vs AI "Bandar Mandor":
 * pilih sisi taruhan (ATAS/BAWAH/ANGKA PAS) + nominal koin, lalu kocok.
 * Pemenang ronde meraup pot gabungan; imbang → koin kembali.
 */

export interface DieFace {
  value: number; // 1..6
  icon: string;
  name: string;
}

/** Sisi dadu = material proyek. */
export const FACES: DieFace[] = [
  { value: 1, icon: '🧱', name: 'Bata' },
  { value: 2, icon: '🪵', name: 'Kayu' },
  { value: 3, icon: '🔩', name: 'Baut' },
  { value: 4, icon: '🎨', name: 'Cat' },
  { value: 5, icon: '💡', name: 'Lampu' },
  { value: 6, icon: '🏗️', name: 'Tower Crane' },
];

export type BetSide = 'atas' | 'bawah' | 'pas';
export type BetResult = 'menang' | 'kalah' | 'imbang';

export interface RoundResult {
  roll: DieFace;
  player: BetResult;
  ai: BetResult;
  playerDelta: number; // perubahan koin pemain
  aiDelta: number; // perubahan koin AI
  pot: number;
}

export const START_COINS = 100;
export const MIN_STAKE = 5;
export const MAX_ROUNDS_BANKRUPT = 0; // 0 = main sampai bangkrut

/** Kocok dadu. */
export function rollDie(rng: () => number): DieFace {
  return FACES[Math.floor(rng() * FACES.length)];
}

/** ATAS = 4-6, BAWAH = 1-3. */
export function overUnderWins(side: 'atas' | 'bawah', value: number): boolean {
  return side === 'atas' ? value >= 4 : value <= 3;
}

/** Taruhan pemain menang? (AI selalu ambil sisi berlawanan.) */
export function playerWinsBet(side: BetSide, exactNum: number | null, rollValue: number): boolean {
  if (side === 'pas') return exactNum === rollValue;
  return overUnderWins(side, rollValue);
}

/** Bandar selalu ambil sisi berlawanan dari pemain. */
export function aiSideFor(playerSide: BetSide): BetSide {
  if (playerSide === 'atas') return 'bawah';
  if (playerSide === 'bawah') return 'atas';
  return 'pas';
}

/**
 * Bandar pilih angka PAS yang berbeda dari pemain (bila pemain pas),
 * supaya tidak pernah imbang ganda.
 */
export function aiExactNumber(playerNum: number, rng: () => number): number {
  const options = [1, 2, 3, 4, 5, 6].filter((n) => n !== playerNum);
  return options[Math.floor(rng() * options.length)];
}

/**
 * Bandar kadang "lupa" ambil sisi berlawanan dan ikut sisi pemain
 * (blunder yang bisa dimanfaatkan) — peluang 12%.
 */
export function aiChoosesSide(playerSide: BetSide, rng: () => number): BetSide {
  if (playerSide !== 'pas' && rng() < 0.12) return playerSide;
  return aiSideFor(playerSide);
}

/** Nominal taruhan bandar: 10-25% koinnya, min MIN_STAKE. */
export function aiStake(aiCoins: number, rng: () => number): number {
  if (aiCoins < MIN_STAKE) return 0;
  const pct = 0.1 + rng() * 0.15;
  return Math.max(MIN_STAKE, Math.min(aiCoins, Math.floor(aiCoins * pct)));
}

/** Nominal taruhan pemain dijepit ke koin yang dimiliki. */
export function clampStake(stake: number, coins: number): number {
  if (coins < MIN_STAKE) return 0;
  return Math.max(MIN_STAKE, Math.min(coins, Math.floor(stake)));
}

/**
 * Selesaikan satu ronde: kedua taruhan masuk pot, kocok sekali,
 * pemenang meraup pot; bila keduanya menang/kalah → imbang, koin kembali.
 */
export function resolveRound(
  playerSide: BetSide,
  playerNum: number | null,
  playerStake: number,
  aiSide: BetSide,
  aiNum: number | null,
  aiCoins: number,
  rng: () => number,
): RoundResult {
  const aiBet = Math.min(aiStake(aiCoins, rng), aiCoins);
  const roll = rollDie(rng);
  const pWin = playerWinsBet(playerSide, playerNum, roll.value);
  const aWin = playerWinsBet(aiSide, aiNum, roll.value);
  const pot = playerStake + aiBet;
  let player: BetResult;
  let ai: BetResult;
  let playerDelta: number;
  let aiDelta: number;
  if (pWin && !aWin) {
    player = 'menang'; ai = 'kalah';
    playerDelta = aiBet; aiDelta = -aiBet;
  } else if (aWin && !pWin) {
    player = 'kalah'; ai = 'menang';
    playerDelta = -playerStake; aiDelta = playerStake;
  } else {
    player = 'imbang'; ai = 'imbang';
    playerDelta = 0; aiDelta = 0;
  }
  return { roll, player, ai, playerDelta, aiDelta, pot };
}

/** Label ronde untuk popup. */
export function resultLabel(r: BetResult): string {
  if (r === 'menang') return 'MENANG!';
  if (r === 'kalah') return 'KALAH';
  return 'IMBANG — koin kembali';
}

/* ================================================================== */
/*  MODE PERTANDINGAN (Gelombang 1C)                                    */
/*                                                                      */
/*  Menggantikan pola lama "main sampai bangkrut" (MAX_ROUNDS_BANKRUPT) */
/*  sebagai struktur sesi utama:                                        */
/*   - Pertandingan = MATCH_ROUNDS ronde TETAP.                         */
/*   - Tiap ronde pemain memilih tingkat risiko:                        */
/*       standar (pengali 1) atau berani (pengali 2 untuk taruhan       */
/*       efektif KEDUA pihak — pemain dan Bandar sama-sama digandakan,  */
/*       jadi pot, kemenangan, dan kekalahan tetap nol-sum & terbuka).  */
/*   - Semua angka (taruhan Bandar, taruhan efektif, pot, menang/       */
/*     kalah) bisa dihitung SEBELUM lempar via previewRound().          */
/*   - Bangkrut sebelum ronde habis = kalah pertandingan seketika.      */
/*   - Ronde habis -> menang bila koin pemain > koin Bandar             */
/*     (seri bila sama persis).                                         */
/* ================================================================== */

export type RiskTier = 'standar' | 'berani';

export const MATCH_ROUNDS = 10;

export const RISK_INFO: Record<
  RiskTier,
  { label: string; multiplier: number; blurb: string }
> = {
  standar: {
    label: 'Standar',
    multiplier: 1,
    blurb: 'Taruhan efektif = nominal yang dipilih, untuk kamu dan Bandar.',
  },
  berani: {
    label: 'Berani ×2',
    multiplier: 2,
    blurb:
      'Taruhan efektif kamu DAN Bandar digandakan: menang dapat 2× taruhan Bandar, kalah kehilangan 2× taruhanmu.',
  },
};

export function riskMultiplier(tier: RiskTier): number {
  return RISK_INFO[tier].multiplier;
}

/** Taruhan efektif satu pihak pada tingkat risiko tertentu. */
export function effectiveStake(stake: number, tier: RiskTier): number {
  return Math.max(0, Math.floor(stake)) * riskMultiplier(tier);
}

export interface RoundPreview {
  multiplier: number;
  playerEffective: number;
  aiEffective: number;
  pot: number;
  /** Koin yang didapat pemain bila menang ronde ini. */
  winGain: number;
  /** Koin yang hilang dari pemain bila kalah ronde ini. */
  loseLoss: number;
}

/**
 * Pratinjau transparan SEBELUM lempar: dari nominal pemain + taruhan
 * Bandar yang sudah ditampilkan, hitung semua angka ronde.
 */
export function previewRound(stake: number, aiStakeValue: number, tier: RiskTier): RoundPreview {
  const playerEffective = effectiveStake(stake, tier);
  const aiEffective = effectiveStake(aiStakeValue, tier);
  return {
    multiplier: riskMultiplier(tier),
    playerEffective,
    aiEffective,
    pot: playerEffective + aiEffective,
    winGain: aiEffective,
    loseLoss: playerEffective,
  };
}

export type MatchWinner = 'pemain' | 'ai' | 'seri' | null;

export interface MatchRoundRecord {
  round: number; // 1-based
  rollValue: number;
  result: BetResult;
  risk: RiskTier;
  playerDelta: number;
  aiDelta: number;
}

export interface MatchState {
  totalRounds: number;
  roundsPlayed: number;
  playerCoins: number;
  aiCoins: number;
  startCoins: number;
  over: boolean;
  winner: MatchWinner;
  /** Pihak yang bangkrut sebelum ronde habis (penyebab kalah/menang dini). */
  bankrupt: 'pemain' | 'ai' | null;
  history: MatchRoundRecord[];
}

export function createMatch(
  totalRounds: number = MATCH_ROUNDS,
  startCoins: number = START_COINS,
): MatchState {
  return {
    totalRounds,
    roundsPlayed: 0,
    playerCoins: startCoins,
    aiCoins: startCoins,
    startCoins,
    over: false,
    winner: null,
    bankrupt: null,
    history: [],
  };
}

/** Pemenang dari perbandingan koin akhir (dipakai saat ronde habis). */
export function matchWinnerFor(playerCoins: number, aiCoins: number): Exclude<MatchWinner, null> {
  if (playerCoins > aiCoins) return 'pemain';
  if (playerCoins < aiCoins) return 'ai';
  return 'seri';
}

export interface MatchChoice {
  side: BetSide;
  exact: number | null;
  stake: number;
  risk: RiskTier;
  /** Taruhan Bandar yang sudah dihitung & ditampilkan sebelum lempar. */
  aiStake: number;
}

export interface MatchRoundOutcome {
  state: MatchState;
  result: (RoundResult & { risk: RiskTier; playerEffective: number; aiEffective: number }) | null;
}

/**
 * Selesaikan satu ronde pertandingan. MURNI: state masukan tidak diubah.
 *
 * Urutan konsumsi rng (deterministik, teruji):
 *  1. bila sisi 'pas': aiExactNumber (angka Bandar, beda dari pemain)
 *  2. rollDie
 * Sisi Bandar selalu berlawanan (aiSideFor) — tanpa blunder acak — agar
 * pratinjau sebelum lempar jujur sepenuhnya.
 */
export function resolveMatchRound(
  state: MatchState,
  choice: MatchChoice,
  rng: () => number,
): MatchRoundOutcome {
  if (state.over) return { state, result: null };

  const playerStake = clampStake(choice.stake, state.playerCoins);
  const aiBetBase = Math.max(0, Math.min(Math.floor(choice.aiStake), state.aiCoins));
  const preview = previewRound(playerStake, aiBetBase, choice.risk);
  // Taruhan efektif tidak boleh melebihi koin yang benar-benar dimiliki.
  const playerEffective = Math.min(preview.playerEffective, state.playerCoins);
  const aiEffective = Math.min(preview.aiEffective, state.aiCoins);
  const pot = playerEffective + aiEffective;

  const aiSide = aiSideFor(choice.side);
  const aiNum = choice.side === 'pas' ? aiExactNumber(choice.exact ?? 1, rng) : null;
  const roll = rollDie(rng);
  const pWin = playerWinsBet(choice.side, choice.exact, roll.value);
  const aWin = playerWinsBet(aiSide, aiNum, roll.value);

  let player: BetResult;
  let ai: BetResult;
  let playerDelta: number;
  let aiDelta: number;
  if (pWin && !aWin) {
    player = 'menang'; ai = 'kalah';
    playerDelta = aiEffective; aiDelta = -aiEffective;
  } else if (aWin && !pWin) {
    player = 'kalah'; ai = 'menang';
    playerDelta = -playerEffective; aiDelta = playerEffective;
  } else {
    player = 'imbang'; ai = 'imbang';
    playerDelta = 0; aiDelta = 0;
  }

  const playerCoins = Math.max(0, state.playerCoins + playerDelta);
  const aiCoins = Math.max(0, state.aiCoins + aiDelta);
  const roundsPlayed = state.roundsPlayed + 1;

  let over = false;
  let winner: MatchWinner = null;
  let bankrupt: MatchState['bankrupt'] = null;
  if (playerCoins < MIN_STAKE) {
    over = true; winner = 'ai'; bankrupt = 'pemain';
  } else if (aiCoins < MIN_STAKE) {
    over = true; winner = 'pemain'; bankrupt = 'ai';
  } else if (roundsPlayed >= state.totalRounds) {
    over = true;
    winner = matchWinnerFor(playerCoins, aiCoins);
  }

  const record: MatchRoundRecord = {
    round: roundsPlayed,
    rollValue: roll.value,
    result: player,
    risk: choice.risk,
    playerDelta,
    aiDelta,
  };

  return {
    state: {
      ...state,
      roundsPlayed,
      playerCoins,
      aiCoins,
      over,
      winner,
      bankrupt,
      history: [...state.history, record],
    },
    result: {
      roll,
      player,
      ai,
      playerDelta,
      aiDelta,
      pot,
      risk: choice.risk,
      playerEffective,
      aiEffective,
    },
  };
}
