/**
 * ArcadeSimonSays ("Ikuti Mandor") — pure logic.
 * Mandor memberi urutan aba-aba lewat 4 panel berglif perkakas/isyarat
 * (palu, helm, bendera aba-aba, peluit); pemain mengulang urutannya.
 * Salah sekali → shift berakhir.
 *
 * Gelombang 5:
 * - Tiap panel punya `glyph` perkakas/isyarat yang digambar prosedural
 *   di Canvas (bukan emoji / bukan sekadar warna).
 * - Progresi tempo EKPLISIT sebagai fungsi murni `tempoFor(round)`:
 *   durasi langkah, jeda, langkah/detik, dan label tempo per ronde.
 *   `stepDuration` lama dipertahankan sebagai pembungkus agar kompatibel.
 */

export type PadGlyph = 'palu' | 'helm' | 'bendera' | 'peluit';

export interface AbaAba {
  id: number; // 0..3
  label: string;
  color: string;
  dark: string;
  freq: number; // nada (Hz)
  glyph: PadGlyph;
  glyphLabel: string;
}

export const ABA_ABA: AbaAba[] = [
  { id: 0, label: 'BERHENTI', color: '#ef4444', dark: '#7f1d1d', freq: 262, glyph: 'palu', glyphLabel: 'Palu' },
  { id: 1, label: 'AWAS', color: '#F5B301', dark: '#854d0e', freq: 330, glyph: 'helm', glyphLabel: 'Helm' },
  { id: 2, label: 'JALAN', color: '#22c55e', dark: '#14532d', freq: 392, glyph: 'bendera', glyphLabel: 'Bendera aba-aba' },
  { id: 3, label: 'BONGKAR', color: '#2563EB', dark: '#1e3a8a', freq: 494, glyph: 'peluit', glyphLabel: 'Peluit' },
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

export interface Tempo {
  round: number;
  stepDuration: number; // detik panel menyala per langkah
  gap: number; // detik jeda antar langkah
  perStep: number; // total detik per langkah (nyala + jeda)
  stepsPerSecond: number;
  label: string;
}

/**
 * Tempo eksplisit per ronde (murni). Ronde <= 0 diperlakukan sebagai ronde 1.
 * Label: 1–3 Santai, 4–6 Sedang, 7–10 Cepat, >10 Kilat.
 */
export function tempoFor(round: number): Tempo {
  const r = Math.max(1, Math.floor(round) || 1);
  const sd = stepDuration(r);
  const perStep = sd + STEP_GAP;
  const label = r <= 3 ? 'Santai' : r <= 6 ? 'Sedang' : r <= 10 ? 'Cepat' : 'Kilat';
  return {
    round: r,
    stepDuration: sd,
    gap: STEP_GAP,
    perStep,
    stepsPerSecond: perStep > 0 ? 1 / perStep : 0,
    label,
  };
}

/** Teks HUD murni: ronde, panjang urutan, fase, dan progres input. */
export function hudSummary(
  round: number,
  seqLength: number,
  phase: 'watch' | 'input',
  inputPos: number,
): { title: string; detail: string; tempoLabel: string } {
  const tempo = tempoFor(round);
  const title = `Ronde ${round} • Urutan ${seqLength}`;
  const detail = phase === 'watch'
    ? `Perhatikan • Tempo ${tempo.label} (${tempo.stepDuration.toFixed(2)} dtk/langkah)`
    : `Giliranmu • Input ${inputPos}/${seqLength} • Tempo ${tempo.label}`;
  return { title, detail, tempoLabel: tempo.label };
}

/** Fraksi progres input pemain dalam urutan (0..1, dijepit). */
export function inputProgress(seqLength: number, inputPos: number): number {
  if (seqLength <= 0) return 0;
  return Math.min(1, Math.max(0, inputPos / seqLength));
}

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
