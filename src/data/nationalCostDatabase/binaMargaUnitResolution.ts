/**
 * binaMargaUnitResolution — satuan Bina Marga yang VALID untuk tampilan.
 *
 * D-55 (Batch G2, 2026-11-14): field `unit` di master Bina Marga
 * (letter-code) berisi fragmen deskripsi pembayaran dari ekstraksi PDF
 * — mis. "Pemadatan Cerdas (IC)", "Penggantian Landasan Elastomer
 * Sintetis Berlapis Baja" — bukan satuan. Terverifikasi: 843 dari 1.137
 * item punya unit di luar himpunan satuan kanonis (case-insensitive).
 * Kartu AHSP Explorer merender field itu verbatim.
 *
 * Perbaikan di LAPISAN PEMETAAN (bukan berkas generated — berkas
 * `binaMarga2026Master.generated.ts` bertanda DO NOT EDIT dan JSON
 * sumbernya tidak ada di repo, jadi regenerasi tidak mungkin dari sini;
 * koreksi hulu dicatat untuk report 09):
 *   1. Bila unit master sudah merupakan satuan yang dikenal → pakai
 *      verbatim (ejaan sumber dipertahankan, mis. "M3").
 *   2. Bila bukan → ambil satuan dari rekaman KANONIS yang sama
 *      (`ahsp2026Canonical.generated.ts`, irisan Bina Marga — yang
 *      membawa satuan benar, mis. 3.2.(1b) → "m3"), dicocokkan lewat
 *      `standardCode` (kode parenthesized). 838 dari 843 item
 *      terperbaiki lewat jalur ini.
 *   3. Bila tidak ada padanan kanonis (5 item: A.2, A.7, G.51, G.52,
 *      J.14) → "—". TIDAK PERNAH mengarang satuan.
 *
 * Nilai mentah TIDAK HILANG: `unitRaw` di masterRegistry tetap
 * menyimpan fragmen aslinya. Dua konflik satuan yang sah (H.15: master
 * "m" vs kanonis "buah"; J.60: "m" vs "m'") DIBIARKAN apa adanya —
 * unit master valid sehingga aturan (1) menang; konfliknya dicatat
 * di log Batch G2 untuk report 09, bukan diselesaikan diam-diam.
 */

import { AHSP_2026_CANONICAL } from './ahsp2026Canonical.generated';

/**
 * Satuan yang dikenal — persis himpunan satuan pada irisan Bina Marga
 * kanonis (12 nilai, huruf kecil). Perbandingan selalu case-insensitive
 * agar "M3"/"Jam"/"Kg" dari master tetap diakui.
 */
export const KNOWN_BM_UNITS: ReadonlySet<string> = new Set([
  'buah',
  'jam',
  'kg',
  'km',
  'l',
  'ls',
  'm',
  "m'",
  'm2',
  'm3',
  'titik',
  'ton',
]);

/** True bila `unit` (setelah trim, case-insensitive) adalah satuan yang dikenal. */
export function isKnownBinaMargaUnit(unit: string | null | undefined): boolean {
  if (unit == null) return false;
  const clean = unit.trim().toLowerCase();
  return clean !== '' && KNOWN_BM_UNITS.has(clean);
}

/** Indeks malas: kode kanonis (code + codeNormalized) → satuan kanonis. */
let canonicalUnitByCode: Map<string, string> | null = null;

function getCanonicalUnitIndex(): Map<string, string> {
  if (canonicalUnitByCode) return canonicalUnitByCode;
  const index = new Map<string, string>();
  for (const item of AHSP_2026_CANONICAL) {
    if ((item as { domain?: string }).domain !== 'BINA_MARGA') continue;
    const unit = String((item as { unit?: string }).unit ?? '').trim();
    if (!unit || !isKnownBinaMargaUnit(unit)) continue;
    const code = String((item as { code?: string }).code ?? '').trim();
    const codeNormalized = String((item as { codeNormalized?: string }).codeNormalized ?? '').trim();
    if (code && !index.has(code)) index.set(code, unit);
    if (codeNormalized && !index.has(codeNormalized)) index.set(codeNormalized, unit);
  }
  canonicalUnitByCode = index;
  return index;
}

/** Untuk tes: ukuran indeks satuan kanonis (jumlah kode Bina Marga yang terpetakan). */
export function canonicalBmUnitIndexSize(): number {
  return getCanonicalUnitIndex().size;
}

/**
 * Satuan tampil untuk satu item master Bina Marga.
 * @param rawUnit unit apa adanya dari master (bisa fragmen deskripsi).
 * @param standardCode kode parenthesized item (kunci ke rekaman kanonis).
 * @returns unit master verbatim bila dikenal; satuan kanonis bila ada
 *   padanannya; "—" bila tidak ada bukti satuan yang sah.
 */
export function resolveBinaMargaUnit(
  rawUnit: string | null | undefined,
  standardCode: string | null | undefined,
): string {
  const raw = (rawUnit ?? '').trim();
  if (raw !== '' && isKnownBinaMargaUnit(raw)) return raw;
  const std = (standardCode ?? '').trim();
  if (std !== '') {
    const canonical = getCanonicalUnitIndex().get(std);
    if (canonical) return canonical;
  }
  return '—';
}
