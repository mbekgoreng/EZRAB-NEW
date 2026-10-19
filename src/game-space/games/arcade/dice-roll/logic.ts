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
  if (r === 'menang') return 'MENANG! 🎉';
  if (r === 'kalah') return 'KALAH 😅';
  return 'IMBANG — koin kembali';
}
