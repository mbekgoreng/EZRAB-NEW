/**
 * Sambung Kata — pure game logic (word-connect: sambung huruf jadi kata konstruksi).
 *
 * No DOM / window. Level generation is seeded & deterministic so every
 * level is provably solvable: each target word's letters are a subset of
 * the wheel letters (letter reuse allowed while selecting).
 */

export interface Rng {
  (): number;
}

/** Deterministic RNG (mulberry32). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleSeeded<T>(arr: readonly T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Kosakata konstruksi Indonesia (A-Z, tanpa spasi). */
export const KOSAKATA: string[] = [
  'SEMEN', 'BATA', 'MANDOR', 'RAB', 'AHSP', 'BESI', 'COR', 'FONDASI',
  'KOLOM', 'BALOK', 'ATAP', 'PAKU', 'CAT', 'PASIR', 'KERIKIL', 'TUKANG',
  'KENEK', 'DINDING', 'LANTAI', 'PINTU', 'JENDELA', 'GENTENG', 'BAJA',
  'BETON', 'MORTAR', 'SLOOF', 'KUSEN', 'PLAFON', 'TANGGA', 'PAGAR',
  'DAK', 'RANGKA', 'BATAKO', 'PONDASI', 'SEKOP', 'CANGKUL', 'GERGAJI',
  'PALU', 'BOR', 'OBENG', 'AIR', 'KERAN', 'TOILET', 'WASTAFEL', 'TALANG',
  'PIPA', 'SUMUR', 'SEPTIK', 'DRAINASE', 'ASPAL', 'PAVING', 'KANOPI',
  'TERAS', 'GARASI', 'GUDANG', 'ADUKAN', 'SPESI', 'ACIAN', 'PLESTER',
  'BEGEL', 'SENG', 'TRIPLEK', 'GIPSUM', 'KERAMIK', 'GRANIT', 'MARMER',
  'KAYU', 'BAMBU', 'KASO', 'RENG', 'USUK', 'GORDING', 'BUBUNGAN',
  'LISPLANG', 'PILAR', 'FOOTPLAT', 'PANCANG', 'TIANG', 'TURAP',
  'DEWATERING', 'BEKISTING', 'SCAFFOLDING', 'CRANE', 'EKSKAVATOR',
  'BULDOZER', 'MOLEN', 'VIBRATOR', 'THEODOLIT', 'WATERPASS', 'METERAN',
  'BENANG', 'PATOK', 'GALIAN', 'TIMBUNAN', 'PEMADATAN', 'TAPAK',
  'BATUKALI', 'SIRTU', 'AGREGAT', 'SPLIT',
];

export const WORD_SET: Set<string> = new Set(KOSAKATA);

export const PACK_COUNT = 3;
export const LEVELS_PER_PACK = 20;
export const MAX_WHEEL_LETTERS = 8;
export const MIN_WHEEL_LETTERS = 6;
export const HINTS_PER_PACK = 5;

/** Words eligible for a pack: 0 -> <=4 huruf, 1 -> <=6 huruf, 2 -> bebas. */
export function packWords(pack: number): string[] {
  if (pack === 0) return KOSAKATA.filter((w) => w.length <= 4);
  if (pack === 1) return KOSAKATA.filter((w) => w.length <= 6);
  return [...KOSAKATA];
}

export interface Level {
  pack: number;
  level: number; // 0-based inside pack
  words: string[];
  /** distinct letters on the wheel (shuffled), 6..8 */
  letters: string[];
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function unionOf(words: string[]): Set<string> {
  const s = new Set<string>();
  for (const w of words) for (const c of w) s.add(c);
  return s;
}

/**
 * Generate one level. Deterministic from (pack, level).
 * Guarantees: 3..6 target words, every word's letters ⊆ wheel letters,
 * wheel size 6..8, so the level is always solvable.
 */
export function generateLevel(pack: number, level: number): Level {
  const rng = mulberry32(pack * 7919 + level * 131 + 17);
  const cands = packWords(pack);
  const targetCount = 3 + Math.floor(rng() * 4); // 3..6

  // Multi-attempt randomized greedy (deterministic): shuffle candidate order
  // with derived seeds, fill greedily within the letter budget, keep the
  // best set (most words, tie -> fewest distinct letters).
  let bestWords: string[] = [];
  let bestUnion = new Set<string>();
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const arng = mulberry32(pack * 100003 + level * 1009 + attempt * 77 + 5);
    const order = shuffleSeeded(cands, arng);
    const words: string[] = [];
    const union = new Set<string>();
    for (const w of order) {
      if (words.length >= targetCount) break;
      const u = unionOf([...words, w]);
      if (u.size <= MAX_WHEEL_LETTERS) {
        words.push(w);
        for (const c of w) union.add(c);
      }
    }
    const better =
      words.length > bestWords.length ||
      (words.length === bestWords.length && union.size < bestUnion.size);
    if (better) {
      bestWords = words;
      bestUnion = union;
    }
    if (bestWords.length >= targetCount && bestUnion.size <= 6) break; // great already
  }
  const words = bestWords;
  const union = bestUnion;

  // Wheel: union letters + random padding to reach MIN_WHEEL_LETTERS.
  const wheel = new Set<string>(union);
  const padPool = shuffleSeeded([...LETTERS].filter((c) => !wheel.has(c)), rng);
  let pi = 0;
  while (wheel.size < MIN_WHEEL_LETTERS && pi < padPool.length) {
    wheel.add(padPool[pi]);
    pi += 1;
  }
  const letters = shuffleSeeded([...wheel], rng);
  // longest words first in the answer list (nicer slot layout)
  words.sort((a, b) => b.length - a.length || a.localeCompare(b));
  return { pack, level, words, letters };
}

/** Can `word` be formed from the wheel letters (reuse allowed)? */
export function canForm(word: string, letters: readonly string[]): boolean {
  const set = new Set(letters);
  for (const c of word) if (!set.has(c)) return false;
  return word.length > 0;
}

/** Is `word` a known construction word? */
export function isValidWord(word: string): boolean {
  return WORD_SET.has(word);
}

export type SubmitStatus = 'target' | 'already' | 'other' | 'invalid';

export interface SubmitResult {
  status: SubmitStatus;
  word: string;
}

/**
 * Submit a formed word. Pure: `found` is the list of already-found targets.
 * - target: valid word AND one of this level's targets (new)
 * - already: target found before (no penalty)
 * - other: valid Indonesian construction word but not a level target (no penalty)
 * - invalid: unknown word or unformable from wheel
 */
export function submitWord(level: Level, found: readonly string[], word: string): SubmitResult {
  const w = word.toUpperCase();
  if (w.length < 2 || !canForm(w, level.letters) || !isValidWord(w)) {
    return { status: 'invalid', word: w };
  }
  if (level.words.includes(w)) {
    return { status: found.includes(w) ? 'already' : 'target', word: w };
  }
  return { status: 'other', word: w };
}

export interface Hint {
  word: string;
  ch: string;
  index: number;
}

/** Reveal the first letter of the first unsolved target word. */
export function revealHint(level: Level, found: readonly string[]): Hint | null {
  for (const w of level.words) {
    if (!found.includes(w)) return { word: w, ch: w[0], index: 0 };
  }
  return null;
}

/** All target words found? */
export function levelComplete(level: Level, found: readonly string[]): boolean {
  return level.words.every((w) => found.includes(w));
}

/**
 * Append a letter-node index to the current selection (pure).
 * Letter reuse is allowed (BATA needs 'A' twice); only a consecutive
 * repeat is ignored (finger resting on one node).
 */
export function appendSelection(sel: readonly number[], idx: number): number[] {
  if (sel[sel.length - 1] === idx) return [...sel];
  return [...sel, idx];
}

/** Next position after completing (pack, level); null = all packs done. */
export function nextPosition(pack: number, level: number): { pack: number; level: number } | null {
  if (level + 1 < LEVELS_PER_PACK) return { pack, level: level + 1 };
  if (pack + 1 < PACK_COUNT) return { pack: pack + 1, level: 0 };
  return null;
}

export const PACK_NAMES = ['Kuli Bangunan', 'Tukang Ahli', 'Mandor Besar'];
