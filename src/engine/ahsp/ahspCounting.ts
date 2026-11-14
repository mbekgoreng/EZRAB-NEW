/**
 * Batch F (D-44 + D-73) — SATU aturan hitung kanonis untuk item terkait AHSP.
 *
 * Dua permukaan menghitung "item AHSP" dengan populasi berbeda dan keduanya
 * salah dengan caranya sendiri:
 *
 * - D-44: header spreadsheet "dari N AHSP" menghitung SETIAP string
 *   `ahspCode` tak kosong — termasuk `defaultAhspCode` saran template pada
 *   item CALCULATOR. Batch B membuktikan ke-24 nilai `defaultAhspCode`
 *   kalkulator memakai skema kode LEGACY dengan 0 kecocokan di katalog
 *   kanonis 2026 — jadi baris kalkulator bisa terhitung sebagai "AHSP"
 *   hanya karena templatnya kebetulan punya kode saran (1 CALCULATOR →
 *   "0 AHSP"; 2 CALCULATOR → "1 AHSP"; 2 CALCULATOR + 1 AHSP → "3 AHSP").
 * - D-73: tab Analisa Estimator menghitung BARIS berkode (154 demo),
 *   sedangkan Laporan menghitung KODE UNIK (116) + 39 item master legacy
 *   Permen 2022 yang tidak ada hubungannya dengan proyek (= 155).
 *
 * Aturan kanonis (satu-satunya yang dipakai semua permukaan):
 *
 * 1. POPULASI ANALISA PROYEK — `getProjectAhspRows`: baris RAB proyek yang
 *    berkode (`code` ATAU `ahspCode` ATAU `ahspSnapshot`). Satu baris =
 *    satu analisa; TIDAK ada dedup per kode (dua baris berkode sama adalah
 *    dua baris analisa proyek), dan item master legacy TIDAK PERNAH masuk
 *    populasi proyek. EstimatorAhspView + LaporanView memakai helper ini.
 * 2. TAUTAN AHSP TERVERIFIKASI — `hasVerifiedAhspLink`: sebuah baris
 *    terhitung "dari N AHSP" hanya bila identitas AHSP-nya genuine:
 *    - `ahspIdentityStatus === 'SAFE'` (dihitung factory saat kreasi:
 *      lolos cek keamanan parsing DAN ada di katalog kanonis 2026), ATAU
 *    - tanpa flag (item legacy/pra-factory): kodenya ada di katalog
 *      kanonis (`canonicalAhspCodeExists`) — pemeriksaan yang sama
 *      dengan aturan G1 factory, diterapkan saat baca.
 *    - `ahspIdentityStatus === 'UNSAFE'` TIDAK PERNAH terhitung.
 *    `priceSourceKind === 'OFFICIAL_AHSP'` SENGAJA bukan kriteria:
 *    itu klaim provenance harga, bukan bukti identitas — dan probe
 *    Premium Demo 2026-11-14 membuktikan 23 dari 154 item SAFE memakai
 *    kind harga non-resmi, jadi kriteria OFFICIAL saja akan menghitung
 *    131, bukan 154. (OFFICIAL_AHSP ⊂ SAFE untuk item factory: factory
 *    menurunkan klaim resmi bila identitas tidak SAFE.)
 */
import type { RabItem } from '../../types';
import { canonicalAhspCodeExists } from '../../data/priceDatabase2026/ahspDisplayPolicy';

/** Bentuk minimal untuk populasi analisa proyek (D-73). */
export interface AhspRowCandidate {
  code?: string | null;
  ahspCode?: string | null;
  ahspSnapshot?: unknown;
}

/** Bentuk minimal untuk tautan AHSP terverifikasi (D-44). */
export interface AhspLinkCandidate {
  ahspCode?: string | null;
  ahspIdentityStatus?: 'SAFE' | 'UNSAFE' | string | null;
}

/**
 * D-73 — baris analisa proyek: baris RAB yang berkode. Urutan dipertahankan,
 * tanpa dedup. Aturan ini SAMA dengan yang dipakai EstimatorAhspView
 * (`projectAhspList`) — LaporanView wajib memakai helper ini, bukan
 * aturannya sendiri, agar kedua permukaan selalu sepakat soal jumlah dan
 * himpunan item.
 */
export function getProjectAhspRows<T extends AhspRowCandidate>(items: readonly T[]): T[] {
  return items.filter((it) => Boolean(it.code || it.ahspCode || it.ahspSnapshot));
}

/**
 * D-44 — apakah baris ini punya tautan AHSP terverifikasi (genuine)?
 * Kode saran template (`defaultAhspCode` legacy, 0 kecocokan kanonis)
 * mengembalikan false; kode kanonis asli mengembalikan true.
 */
export function hasVerifiedAhspLink(item: AhspLinkCandidate): boolean {
  if (item.ahspIdentityStatus === 'SAFE') return true;
  if (item.ahspIdentityStatus === 'UNSAFE') return false;
  // Tanpa flag: periksa katalog kanonis langsung (aturan G1 factory).
  const code = (item.ahspCode || '').trim();
  if (!code) return false;
  return canonicalAhspCodeExists(code);
}

/** D-44 — hitung baris dengan tautan AHSP terverifikasi. */
export function countVerifiedAhspLinks(items: readonly AhspLinkCandidate[]): number {
  let n = 0;
  for (const it of items) if (hasVerifiedAhspLink(it)) n++;
  return n;
}

/** Alias berbasis RabItem untuk pemakaian di view. */
export function countVerifiedAhspLinksForItems(items: readonly RabItem[]): number {
  return countVerifiedAhspLinks(items);
}
