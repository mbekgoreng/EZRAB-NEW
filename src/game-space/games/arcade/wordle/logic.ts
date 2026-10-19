/**
 * Tebak Kata (Wordle ID) — pure logic (no DOM).
 * Kata jawaban: Bahasa Indonesia, tepat 5 huruf.
 */

export const WORD_LEN = 5;
export const MAX_GUESSES = 6;

export type Mark = 'correct' | 'present' | 'absent';

/** Daftar kata 5-huruf bertema konstruksi/proyek (tanpa diakritik). */
export const WORDS: string[] = [
  'SEMEN', 'PASIR', 'SLOOF', 'KOLOM', 'BALOK', 'CORAN', 'ACIAN', 'HEBEL',
  'MOLEN', 'ASPAL', 'SPLIT', 'KAPUR', 'SEKOP', 'PACUL', 'EMBER', 'TIMBA',
  'POMPA', 'SUMUR', 'KABEL', 'LAMPU', 'KUSEN', 'PINTU', 'KUNCI', 'KENOP',
  'KAWAT', 'BEGEL', 'ROMPI', 'RAMBU', 'PAGAR', 'DINAS', 'BALAI', 'AUDIT',
  'PAJAK', 'RUMAH', 'PASAR', 'WADUK', 'REHAB', 'RUTIN', 'GEMPA', 'BOCOR',
  'RETAK', 'KARAT', 'LAPUK', 'RAYAP', 'JAMUR', 'LUMUT', 'KERAK', 'EROSI',
  'OMBAK', 'SURUT', 'TALUD', 'TURAP', 'LAPEN', 'SIRTU', 'TANAH', 'LEBAR',
  'DALAM', 'TEBAL', 'BERAT', 'JENIS', 'MEREK', 'CRANE', 'DOZER', 'PAVER',
  'AUGER', 'RELAY', 'TIMER', 'SOKET', 'TOKEN', 'PULSA', 'DENDA', 'VONIS',
  'GRASI', 'BONUS', 'HONOR', 'DEBIT', 'TUNAI', 'SAHAM', 'BURUH', 'KLIEN',
  'MITRA', 'RONDA', 'SABAR', 'JUJUR', 'SALAH', 'BETUL', 'PASTI', 'HARAP',
  'JAWAB', 'WARIS', 'KUASA', 'SAKSI', 'JANJI', 'SIGAP', 'CEPAT', 'TEPAT',
  'RINCI', 'JELAS', 'WAJAR', 'LOGIS', 'GAGAH', 'MEGAH', 'KOKOH', 'TAHAN',
  'MEWAH', 'KANAL', 'PARIT', 'TIANG', 'GARDU', 'TRAFO', 'PANEL', 'SURYA',
  'HIDRO', 'AKSES', 'KARTU', 'ABSEN', 'DRONE', 'MAVIC', 'LASER', 'TEKLA',
  'ETABS', 'MIDAS', 'CIVIL', 'REVIT', 'EXCEL', 'LEICA', 'NIKON', 'CANON',
  'GOPRO', 'AUTEL', 'VOLVO', 'ISUZU', 'HONDA', 'APPLE', 'KURVA', 'BOBOT',
  'MULAI', 'KIRIM', 'SUSUN', 'BUANG', 'PUING', 'HALTE', 'MACET', 'JALUR',
  'ALARM', 'DULUX', 'AVIAN', 'JOTUN', 'VALVE', 'ELBOW', 'TOREN', 'RIOOL',
  'PATOK', 'STUDI', 'CAGAR', 'LURAH', 'CAMAT', 'FASUM', 'FASOS', 'OMZET',
  'DAPEN', 'SKNBI', 'GOPAY', 'SALAM', 'WAKAF', 'ZAKAT', 'INFAQ', 'GIRIK',
  'PETOK', 'BPHTB', 'SIUJK', 'SPARE', 'NATAL', 'NYEPI', 'IMLEK', 'TAHUN',
  'POLRI', 'DERAU', 'BASAH', 'SEGAR', 'SEHAT', 'LABIL', 'HARGA', 'BIAYA',
  'DENAH', 'BETON', 'EZRAB',
].filter((w, i, a) => w.length === WORD_LEN && a.indexOf(w) === i);

export type Rng = () => number;

export function pickWord(rng: Rng = Math.random): string {
  return WORDS[(rng() * WORDS.length) | 0];
}

/** Tebakan valid: tepat 5 huruf A-Z. */
export function isValidGuess(s: string): boolean {
  return /^[A-Z]{5}$/.test(s.toUpperCase());
}

/**
 * Nilai tebakan ala Wordle dengan penanganan huruf ganda yang benar:
 * pass 1 tandai 'correct', pass 2 tandai 'present' dari sisa huruf jawaban.
 */
export function scoreGuess(guess: string, answer: string): Mark[] {
  const g = guess.toUpperCase().split('');
  const a = answer.toUpperCase().split('');
  const marks: Mark[] = new Array(WORD_LEN).fill('absent');
  const remaining: Record<string, number> = {};
  for (let i = 0; i < WORD_LEN; i += 1) {
    if (g[i] === a[i]) {
      marks[i] = 'correct';
    } else {
      remaining[a[i]] = (remaining[a[i]] ?? 0) + 1;
    }
  }
  for (let i = 0; i < WORD_LEN; i += 1) {
    if (marks[i] === 'correct') continue;
    if ((remaining[g[i]] ?? 0) > 0) {
      marks[i] = 'present';
      remaining[g[i]] -= 1;
    }
  }
  return marks;
}

export interface Stats {
  played: number;
  won: number;
  streak: number;
  maxStreak: number;
  /** distribusi: index 0 = menang di tebakan ke-1 */
  dist: number[];
}

export const emptyStats = (): Stats => ({
  played: 0, won: 0, streak: 0, maxStreak: 0, dist: [0, 0, 0, 0, 0, 0],
});

export function recordResult(s: Stats, won: boolean, guessesUsed: number): Stats {
  const next: Stats = { ...s, dist: [...s.dist], played: s.played + 1 };
  if (won) {
    next.won += 1;
    next.streak += 1;
    next.maxStreak = Math.max(next.maxStreak, next.streak);
    if (guessesUsed >= 1 && guessesUsed <= MAX_GUESSES) next.dist[guessesUsed - 1] += 1;
  } else {
    next.streak = 0;
  }
  return next;
}

/** Ringkasan status keyboard: huruf -> mark terbaik (correct > present > absent). */
export function keyStatus(history: { guess: string; marks: Mark[] }[]): Record<string, Mark> {
  const rank: Record<Mark, number> = { absent: 0, present: 1, correct: 2 };
  const out: Record<string, Mark> = {};
  for (const { guess, marks } of history) {
    for (let i = 0; i < WORD_LEN; i += 1) {
      const ch = guess[i];
      if (!out[ch] || rank[marks[i]] > rank[out[ch]]) out[ch] = marks[i];
    }
  }
  return out;
}
