/**
 * ArcadeTypingGame ("Ketik Proyek") — pure logic.
 * Istilah-istilah proyek berjatuhan dari atas — ketik kata lengkapnya
 * untuk menghancurkannya sebelum menyentuh garis deadline!
 * Salah ketik tidak mengurangi nyawa; kata yang lolos = -1 nyawa.
 */

export const MAX_LIVES = 3;
export const WORDS_PER_LEVEL = 8;

/** Bank kata: 100% istilah proyek Indonesia. */
export const WORDS: string[] = [
  'SEMEN', 'BETON', 'BATA', 'PASIR', 'KERIKIL', 'BESI', 'PAKU', 'KAYU',
  'TRIPLEK', 'GENTENG', 'KERAMIK', 'CAT', 'PIPA', 'KABEL', 'AHSP', 'RAB',
  'MANDOR', 'TUKANG', 'FONDASI', 'SLOOF', 'KOLOM', 'BALOK', 'DINDING',
  'ATAP', 'PLAFON', 'KUSEN', 'PINTU', 'JENDELA', 'TANGGA', 'PAGAR',
  'KANOPI', 'BAJA', 'HOLLOW', 'GYPSUM', 'GRANIT', 'COR', 'BEKISTING',
  'SCAFFOLDING', 'MOLEN', 'VIBRATOR', 'WATERPASS', 'THEODOLIT', 'BOBOK',
  'ACI', 'PLESTER', 'DED', 'SPK', 'BAST', 'RETENSI', 'TERMIN',
];

/** Level dari kata yang berhasil dihancurkan. */
export function levelFor(destroyed: number): number {
  return 1 + Math.floor(Math.max(0, destroyed) / WORDS_PER_LEVEL);
}

/** Kecepatan jatuh kata (px/detik): 55 → 150. */
export function fallSpeedAt(level: number): number {
  return Math.min(150, 55 + (level - 1) * 14);
}

/** Jeda spawn (detik): 2.2s → 1.0s. */
export function spawnDelayAt(level: number): number {
  return Math.max(1.0, 2.2 - (level - 1) * 0.15);
}

/** Ambil kata acak yang belum aktif di layar. */
export function pickWord(rng: () => number, activeWords: ReadonlySet<string>): string {
  const pool = WORDS.filter((w) => !activeWords.has(w));
  const list = pool.length > 0 ? pool : WORDS;
  return list[Math.floor(rng() * list.length)];
}

/** Poin: 5 per huruf + bonus kecepatan (sisa jarak × 2). */
export function wordPoints(word: string, yFrac: number): number {
  return word.length * 5 + Math.round((1 - yFrac) * 20);
}

/** Apakah huruf cocok dengan huruf berikutnya dari kata target? */
export function matchesNext(word: string, typed: number, ch: string): boolean {
  return word[typed] === ch;
}

/** Grade akhir. */
export function gradeFor(score: number): string {
  if (score >= 900) return 'S';
  if (score >= 620) return 'A';
  if (score >= 400) return 'B';
  if (score >= 200) return 'C';
  return 'D';
}
