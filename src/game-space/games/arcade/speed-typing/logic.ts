/**
 * Ketik Cepat Estimator — ketik istilah proyek Indonesia secepat mungkin.
 * Pure typing logic (no DOM). Waktu 60 detik dihitung di tsx.
 */

export const DURATION_SEC = 60;

/** Istilah proyek Indonesia (huruf kecil, tanpa spasi). */
export const TERMS: string[] = [
  'semen', 'pasir', 'beton', 'kolom', 'balok', 'sloof', 'pondasi', 'rab',
  'ahsp', 'mandor', 'tukang', 'estimator', 'kontraktor', 'ded', 'bast',
  'opname', 'bekisting', 'cor', 'acian', 'hebel', 'batako', 'split',
  'aspal', 'talud', 'turap', 'drainase', 'denah', 'gambar', 'volume',
  'harga', 'satuan', 'upah', 'material', 'alat', 'overhead', 'profit',
  'pajak', 'adendum', 'kontrak', 'spk', 'surveyor', 'drafter', 'arsitek',
  'struktur', 'atap', 'dinding', 'lantai', 'plafon', 'kusen', 'pintu',
  'jendela', 'tangga', 'kanopi', 'pagar', 'sumur', 'tandon', 'pompa',
  'kabel', 'lampu', 'soket', 'excavator', 'crane', 'molen', 'helm',
  'rompi', 'apd', 'hspk', 'rks', 'shopdrawing', 'asbuilt', 'mc',
];

export type Rng = () => number;

/** Acak n istilah (boleh berulang bila n > daftar). */
export function sampleTerms(n: number, rng: Rng = Math.random): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) out.push(TERMS[(rng() * TERMS.length) | 0]);
  return out;
}

export interface TypeState {
  words: string[];
  wi: number; // indeks kata aktif
  typed: string; // buffer kata aktif
  correctChars: number;
  totalChars: number;
  errors: number;
  wordsDone: number;
}

export function newTypeState(words: string[]): TypeState {
  return { words, wi: 0, typed: '', correctChars: 0, totalChars: 0, errors: 0, wordsDone: 0 };
}

export type CharResult = 'correct' | 'wrong' | 'ignored';

/**
 * Ketik satu karakter. Spasi = akhiri kata (harus sudah lengkap & benar).
 * Karakter salah: dihitung error, buffer tidak maju.
 */
export function typeChar(st: TypeState, ch: string): { state: TypeState; res: CharResult } {
  const word = st.words[st.wi];
  if (!word) return { state: st, res: 'ignored' };
  if (ch === ' ') {
    if (st.typed === word) {
      const nextWords = st.wi + 1 < st.words.length ? st.words : [...st.words, ...sampleTerms(20)];
      const ns: TypeState = {
        ...st,
        words: nextWords,
        wi: st.wi + 1,
        typed: '',
        wordsDone: st.wordsDone + 1,
        correctChars: st.correctChars + 1, // spasi dihitung benar
        totalChars: st.totalChars + 1,
      };
      return { state: ns, res: 'correct' };
    }
    return { state: st, res: 'ignored' }; // spasi prematur diabaikan
  }
  if (!/^[a-z0-9]$/.test(ch)) return { state: st, res: 'ignored' };
  const expected = word[st.typed.length];
  if (ch === expected) {
    return {
      state: {
        ...st,
        typed: st.typed + ch,
        correctChars: st.correctChars + 1,
        totalChars: st.totalChars + 1,
      },
      res: 'correct',
    };
  }
  return {
    state: { ...st, errors: st.errors + 1, totalChars: st.totalChars + 1 },
    res: 'wrong',
  };
}

/** Kata per menit standar: (karakter benar / 5) per menit. */
export function wpm(correctChars: number, elapsedSec: number): number {
  if (elapsedSec <= 0) return 0;
  return (correctChars / 5) / (elapsedSec / 60);
}

/** Akurasi: karakter benar / total karakter. */
export function accuracy(correctChars: number, totalChars: number): number {
  if (totalChars <= 0) return 100;
  return (correctChars / totalChars) * 100;
}

/** Julukan estimator berdasar WPM. */
export function rankFor(w: number): string {
  if (w >= 50) return 'Estimator Kilat ⚡';
  if (w >= 35) return 'Mandor Ketik 👷';
  if (w >= 20) return 'Tukang Ketik 🔨';
  return 'Kuli Ketik 🧱';
}
