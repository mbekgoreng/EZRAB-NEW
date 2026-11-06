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

/* icon = kode teks 2 huruf untuk lencana kategori (bukan emoji — digambar CSS). */
export const CATEGORIES: Category[] = [
  {
    id: 'material', label: 'Material', icon: 'MT',
    words: ['SEMEN', 'PASIR', 'BATA', 'KERIKIL', 'SPLIT', 'HEBEL', 'GENTENG', 'TRIPLEK', 'BESI', 'CAT', 'PAKU', 'KAWAT'],
  },
  {
    id: 'alat', label: 'Alat Kerja', icon: 'AL',
    words: ['PALU', 'GERGAJI', 'SEKOP', 'PACUL', 'METERAN', 'SENTER', 'TANGGA', 'EMBER', 'BENANG', 'WATERPAS', 'GERINDA', 'OBENG'],
  },
  {
    id: 'profesi', label: 'Tukang & Tim', icon: 'TK',
    words: ['MANDOR', 'TUKANG', 'KULI', 'ARSITEK', 'ESTIMATOR', 'PENGAWAS', 'DRAFTER', 'SURVEYOR', 'OPERATOR', 'HELPER'],
  },
  {
    id: 'proyek', label: 'Proyek', icon: 'PR',
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

/**
 * Pilih kata dari daftar dengan rng sembarang — indeks SELALU dijepit ke
 * rentang valid. (Bug lama: `(rng()*len)|0` tanpa jepit; rng()>=1 / negatif /
 * NaN menghasilkan word=undefined lalu crash di guessLetter/maskedWord.)
 */
export function pickWord(words: string[], rng: Rng = Math.random): string {
  const f = rng() * words.length;
  if (!Number.isFinite(f)) return words[0];
  const i = Math.min(words.length - 1, Math.max(0, Math.floor(f)));
  return words[i];
}

export function newGame(category: Category, rng: Rng = Math.random): Game {
  return { word: pickWord(category.words, rng), category, guessed: new Set(), wrong: 0 };
}

/* ---------- tingkat kesulitan + progresi antar ronde ----------
 * Bank lama DATAR: kata 3 huruf (CAT, skor 6) dan 9 huruf (ESTIMATOR, 17)
 * tercampur dalam undian yang sama dengan 6 nyawa — sulitnya murni untung-
 * untungan. Kini tiap kata punya skor kesulitan transparan, bank tiap
 * kategori dibagi 3 pita berurutan menurut skor itu, dan kemenangan
 * menaikkan tingkat ronde berikutnya (progresi 1→2→3, mentok di 3).
 */

export type Tier = 1 | 2 | 3;

export const TIER_LABELS: Record<Tier, string> = { 1: 'Mudah', 2: 'Menengah', 3: 'Sulit' };

/** Huruf yang jarang muncul di kata konstruksi — lebih sulit ditebak. */
const RARE_LETTERS = new Set(['F', 'J', 'K', 'Q', 'V', 'X', 'Y', 'Z']);

/** Skor kesulitan kata: panjang + huruf unik + 2×huruf unik langka. Makin besar makin sulit. */
export function difficultyScore(word: string): number {
  const distinct = new Set(word);
  let rare = 0;
  for (const ch of distinct) if (RARE_LETTERS.has(ch)) rare += 1;
  return word.length + distinct.size + rare * 2;
}

/** Kata-kata satu kategori pada satu tingkat: pita sepertiga tengah bank terurut skor (deterministik, tanpa tumpang tindih). */
export function wordsForTier(category: Category, tier: Tier): string[] {
  const sorted = [...category.words].sort(
    (a, b) => difficultyScore(a) - difficultyScore(b) || a.localeCompare(b),
  );
  const band = Math.ceil(sorted.length / 3);
  return sorted.slice((tier - 1) * band, tier * band);
}

/** Tingkat sebuah kata di dalam kategorinya (1..3). */
export function tierOfWord(category: Category, word: string): Tier {
  for (const t of [1, 2, 3] as Tier[]) {
    if (wordsForTier(category, t).includes(word)) return t;
  }
  return 1;
}

/** Ronde baru yang katanya hanya diambil dari pita tingkat yang diminta. */
export function newGameInTier(category: Category, tier: Tier, rng: Rng = Math.random): Game {
  return { word: pickWord(wordsForTier(category, tier), rng), category, guessed: new Set(), wrong: 0 };
}

/** Progresi antar ronde: menang naik satu tingkat (maks 3); kalah tetap di tingkat yang sama. */
export function nextTier(tier: Tier, won: boolean): Tier {
  return won ? (Math.min(3, tier + 1) as Tier) : tier;
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
