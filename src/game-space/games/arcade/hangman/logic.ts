/**
 * Selamatkan Tukang — pure logic (no DOM).
 * Tiap tebakan salah merobohkan satu bagian perancah (6 nyawa).
 * Semua kata bertema konstruksi / proyek.
 */

export const MAX_WRONG = 6;

export interface Category {
  id: string;
  label: string;
  icon: string;
  words: string[];
}

export const CATEGORIES: Category[] = [
  {
    id: 'material', label: 'Material', icon: '🧱',
    words: ['SEMEN', 'PASIR', 'BATA', 'KERIKIL', 'SPLIT', 'HEBEL', 'GENTENG', 'TRIPLEK', 'BESI', 'CAT', 'PAKU', 'KAWAT'],
  },
  {
    id: 'alat', label: 'Alat Kerja', icon: '🔧',
    words: ['PALU', 'GERGAJI', 'SEKOP', 'PACUL', 'METERAN', 'SENTER', 'TANGGA', 'EMBER', 'BENANG', 'WATERPAS', 'GERINDA', 'OBENG'],
  },
  {
    id: 'profesi', label: 'Tukang & Tim', icon: '👷',
    words: ['MANDOR', 'TUKANG', 'KULI', 'ARSITEK', 'ESTIMATOR', 'PENGAWAS', 'DRAFTER', 'SURVEYOR', 'OPERATOR', 'HELPER'],
  },
  {
    id: 'proyek', label: 'Proyek', icon: '🏗️',
    words: ['GEDUNG', 'JEMBATAN', 'RUMAH', 'BENDUNG', 'TOL', 'KANTOR', 'MASJID', 'SEKOLAH', 'PELABUHAN', 'WADUK', 'RUSUN', 'VILLA'],
  },
];

export type Rng = () => number;

export interface Game {
  word: string;
  category: Category;
  guessed: Set<string>;
  wrong: number;
}

export function newGame(category: Category, rng: Rng = Math.random): Game {
  const word = category.words[(rng() * category.words.length) | 0];
  return { word, category, guessed: new Set(), wrong: 0 };
}

/** Tebak huruf. Return 'hit' | 'miss' | 'repeat' | 'done'. */
export function guessLetter(g: Game, raw: string): 'hit' | 'miss' | 'repeat' | 'done' {
  if (isWon(g) || isLost(g)) return 'done';
  const ch = raw.toUpperCase();
  if (!/^[A-Z]$/.test(ch) || g.guessed.has(ch)) return 'repeat';
  g.guessed.add(ch);
  if (g.word.includes(ch)) return 'hit';
  g.wrong += 1;
  return 'miss';
}

/** Kata dengan huruf yang belum ditebak jadi underscore. */
export function maskedWord(g: Game): string[] {
  return g.word.split('').map((ch) => (g.guessed.has(ch) ? ch : '_'));
}

export const isWon = (g: Game): boolean => g.word.split('').every((ch) => g.guessed.has(ch));
export const isLost = (g: Game): boolean => g.wrong >= MAX_WRONG;
export const livesLeft = (g: Game): number => MAX_WRONG - g.wrong;

/** Nama bagian perancah yang roboh pada kesalahan ke-n (1..6). */
export function collapsedPart(wrong: number): string {
  return [
    '',
    'pengaku silang lepas!',
    'satu kaki perancah patah!',
    'papan lantai melorot!',
    'perancah oleng berat!',
    'kaki kedua ambruk!',
    'PERANCAH ROBOH TOTAL!',
  ][Math.min(Math.max(wrong, 0), 6)];
}

/** Huruf vokal yang belum ditebak — untuk hint. */
export function hintLetter(g: Game): string | null {
  for (const v of ['A', 'I', 'U', 'E', 'O']) {
    if (g.word.includes(v) && !g.guessed.has(v)) return v;
  }
  for (const ch of g.word) {
    if (!g.guessed.has(ch)) return ch;
  }
  return null;
}
