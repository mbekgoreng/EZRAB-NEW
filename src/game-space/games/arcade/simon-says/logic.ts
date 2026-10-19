/**
 * ArcadeSimonSays ("Ikuti Mandor") — pure logic.
 * Mandor memberi urutan aba-aba lewat 4 rambu (BERHENTI/AWAS/JALAN/BONGKAR);
 * pemain mengulang urutannya. Salah sekali → shift berakhir.
 */

export interface AbaAba {
  id: number; // 0..3
  label: string;
  color: string;
  dark: string;
  freq: number; // nada (Hz)
}

export const ABA_ABA: AbaAba[] = [
  { id: 0, label: 'BERHENTI', color: '#ef4444', dark: '#7f1d1d', freq: 262 },
  { id: 1, label: 'AWAS', color: '#facc15', dark: '#854d0e', freq: 330 },
  { id: 2, label: 'JALAN', color: '#22c55e', dark: '#14532d', freq: 392 },
  { id: 3, label: 'BONGKAR', color: '#3b82f6', dark: '#1e3a8a', freq: 494 },
];

/** Tambah satu aba-aba acak ke urutan. */
export function extendSequence(seq: readonly number[], rng: () => number): number[] {
  return [...seq, Math.floor(rng() * ABA_ABA.length)];
}

/** Durasi tiap langkah playback (detik) — makin cepat tiap ronde. */
export function stepDuration(round: number): number {
  return Math.max(0.30, 0.62 - round * 0.025);
}

/** Jeda antar langkah playback (detik). */
export const STEP_GAP = 0.14;

/** Cek input pemain pada posisi ke-`pos` dalam urutan. */
export function checkInput(
  seq: readonly number[],
  pos: number,
  pad: number,
): 'lanjut' | 'ronde-selesai' | 'salah' {
  if (seq[pos] !== pad) return 'salah';
  return pos === seq.length - 1 ? 'ronde-selesai' : 'lanjut';
}

/** Skor = ronde yang diselesaikan. */
export function scoreFor(roundsCleared: number): number {
  return roundsCleared;
}
