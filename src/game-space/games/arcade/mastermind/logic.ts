/**
 * ArcadeMastermind ("Tebak Campuran") — pure logic.
 * Racik beton: tebak 4 takaran dari 6 bahan dalam 10× tebakan.
 * ● hitam = bahan & takaran tepat; ○ putih = bahan benar, takaran salah.
 */

export interface Bahan {
  id: number;
  nama: string;
  warna: string;
  gelap: string;
}

export const BAHAN: Bahan[] = [
  { id: 0, nama: 'Semen', warna: '#9ca3af', gelap: '#4b5563' },
  { id: 1, nama: 'Pasir', warna: '#fbbf24', gelap: '#92400e' },
  { id: 2, nama: 'Kerikil', warna: '#b45309', gelap: '#451a03' },
  { id: 3, nama: 'Air', warna: '#38bdf8', gelap: '#0c4a6e' },
  { id: 4, nama: 'Kapur', warna: '#f8fafc', gelap: '#94a3b8' },
  { id: 5, nama: 'Aditif', warna: '#a78bfa', gelap: '#4c1d95' },
];

export const SLOTS = 4;
export const MAX_GUESSES = 10;

export interface Feedback {
  hitam: number;
  putih: number;
}

/** Kode rahasia: 4 takaran acak (bahan boleh berulang). */
export function genCode(rng: () => number): number[] {
  return Array.from({ length: SLOTS }, () => Math.floor(rng() * BAHAN.length));
}

/**
 * Nilai tebakan vs kode. Penanganan duplikat yang benar:
 * hitam dulu (posisi tepat), lalu putih dari sisa yang belum terpakai.
 */
export function evaluate(guess: readonly number[], code: readonly number[]): Feedback {
  let hitam = 0;
  const codeRest: number[] = [];
  const guessRest: number[] = [];
  for (let i = 0; i < SLOTS; i += 1) {
    if (guess[i] === code[i]) hitam += 1;
    else {
      codeRest.push(code[i]);
      guessRest.push(guess[i]);
    }
  }
  let putih = 0;
  for (const g of guessRest) {
    const idx = codeRest.indexOf(g);
    if (idx >= 0) {
      putih += 1;
      codeRest.splice(idx, 1);
    }
  }
  return { hitam, putih };
}

/** Menang bila 4 hitam. */
export function isWin(fb: Feedback): boolean {
  return fb.hitam === SLOTS;
}

/** Skor: makin sedikit tebakan makin besar. */
export function scoreFor(attempts: number): number {
  return Math.max(0, (MAX_GUESSES - attempts + 1)) * 100;
}
