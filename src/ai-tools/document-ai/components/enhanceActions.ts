/**
 * ENHANCE TEXT — definisi aksi & validasi rentang (logika murni).
 *
 * Dipakai DocEnhance.tsx. Sepuluh aksi §5 polish memetakan 1:1 ke
 * EnhanceTransform orchestrator; label tombol memakai rumusan §5, arahan
 * per transformasi hidup di ENHANCE_TRANSFORM_GUIDANCE (prompt.ts) dan
 * disusun service — modul ini TIDAK menduplikasinya.
 */
import { MAX_ENHANCE_SELECTION_CHARS } from '../service';
import type { EnhanceTransform } from '../types';

export interface EnhanceActionDef {
  transform: EnhanceTransform;
  /** Label tombol persis rumusan polish §5. */
  label: string;
}

/** Sepuluh aksi Enhance Text, urutan sesuai polish §5. */
export const ENHANCE_ACTIONS: readonly EnhanceActionDef[] = [
  { transform: 'sempurnakan', label: 'Sempurnakan bahasa' },
  { transform: 'formal', label: 'Buat lebih formal' },
  { transform: 'perjelas', label: 'Perjelas maksud' },
  { transform: 'ringkas', label: 'Ringkas teks' },
  { transform: 'perluas', label: 'Perluas penjelasan' },
  { transform: 'tata-bahasa', label: 'Perbaiki tata bahasa dan ejaan' },
  { transform: 'teknis', label: 'Ubah menjadi bahasa teknis konstruksi' },
  { transform: 'poin', label: 'Susun menjadi poin-poin' },
  { transform: 'tabel', label: 'Ubah menjadi tabel' },
  { transform: 'bebas', label: 'Tulis ulang dengan instruksi sendiri' },
] as const;

export function enhanceActionLabel(transform: EnhanceTransform): string {
  return ENHANCE_ACTIONS.find((a) => a.transform === transform)?.label ?? transform;
}

/**
 * Alasan teks terpilih tidak dapat disunting (null = boleh). Batas panjang
 * sama dengan validasi service (SELECTION_TOO_LONG) agar UI menolak lebih
 * dulu dengan pesan yang jelas, bukan menunggu error provider.
 */
export function selectionBlockReason(text: string): string | null {
  if (!text.trim()) return 'Belum ada teks yang diambil dari editor.';
  if (text.length > MAX_ENHANCE_SELECTION_CHARS) {
    return `Teks terpilih ${text.length} karakter melebihi batas ${MAX_ENHANCE_SELECTION_CHARS} karakter untuk satu kali penyuntingan. Persempit pilihan teks Anda.`;
  }
  return null;
}

/**
 * Validasi rentang sebelum menerapkan kandidat: teks yang SEKARANG berada
 * pada rentang tersimpan harus persis sama dengan teks saat diambil. Bila
 * dokumen berubah di antaranya, penerapan dibatalkan — jangan menimpa
 * rentang yang sudah bergeser maknanya.
 */
export function rangeTextStillMatches(currentRangeText: string, capturedText: string): boolean {
  return currentRangeText === capturedText;
}
