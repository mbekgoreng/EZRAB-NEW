/**
 * ONE-PASS Task C — propagasi integritas harga pada jalur REKALKULASI
 * existingMapping (QTO yang sudah tertaut ke item RAB dihitung ulang).
 *
 * Masalah lama: cabang existingMapping di ProjectContext memperbarui
 * volume/jumlah item tertaut dari kuantitas baru × harga satuan TERSIMPAN,
 * tetapi status parsial rincian BARU tidak pernah dievaluasi — item bisa
 * diam-diam mempertahankan status "lengkap" padahal rincian terakhirnya
 * sudah parsial/unresolved.
 *
 * Aturan helper ini (murni, tanpa efek samping):
 * - Pemanggil TIDAK menyediakan data integritas (undefined) → tidak ada
 *   perubahan. Metadata lama tidak ditebak dan tidak dihapus.
 * - Rincian baru PARSIAL → flag parsial + jumlah unresolved + peringatan
 *   yang jelas DITETAPKAN pada patch. Harga satuan dan priceStatus item
 *   TIDAK disentuh: harga tersimpan (termasuk yang diedit pengguna) tidak
 *   ditimpa, dan tidak ada harga sintetis yang dibuat.
 * - Rincian baru LENGKAP → flag parsial dibersihkan HANYA karena pemanggil
 *   menyediakan data rincian teresolusi yang sebenarnya (priceIntegrity
 *   dihitung dari baris rincian aktual di QtoCalculatorView), dan daftar
 *   peringatan diganti dengan peringatan rincian terkini.
 */
import type { RabItem } from '../types';

export interface RecalcPriceIntegrity {
  isPartial: boolean;
  unresolvedComponentCount: number;
  priceValidationWarnings?: string[];
}

/** Awalan peringatan parsial rekalkulasi — dipakai untuk dedupe antar-rekalkulasi. */
export const RECALC_PARTIAL_WARNING_PREFIX = 'Rekalkulasi QTO terakhir bersifat PARSIAL';

export function buildRecalcPartialWarning(unresolvedComponentCount: number): string {
  return (
    `${RECALC_PARTIAL_WARNING_PREFIX}: ${unresolvedComponentCount} komponen belum memiliki harga — ` +
    'harga satuan tersimpan dipertahankan apa adanya (bukan harga baru dan bukan harga sintetis dari total parsial).'
  );
}

export function applyRecalcPriceIntegrity(
  item: Pick<RabItem, 'isPartial' | 'unresolvedComponentCount' | 'priceValidationWarnings'>,
  integrity: RecalcPriceIntegrity | undefined
): Partial<Pick<RabItem, 'isPartial' | 'unresolvedComponentCount' | 'priceValidationWarnings'>> {
  if (!integrity) return {};
  const unresolved = Math.max(0, integrity.unresolvedComponentCount || 0);
  if (integrity.isPartial || unresolved > 0) {
    // Buang peringatan parsial rekalkulasi lama (hitungannya bisa basi),
    // pertahankan peringatan lain, lalu gabung peringatan pemanggil +
    // peringatan parsial terkini tanpa duplikat.
    const merged: string[] = (item.priceValidationWarnings ?? []).filter(
      (w) => typeof w === 'string' && !w.startsWith(RECALC_PARTIAL_WARNING_PREFIX)
    );
    for (const w of [...(integrity.priceValidationWarnings ?? []), buildRecalcPartialWarning(unresolved)]) {
      if (w && !merged.includes(w)) merged.push(w);
    }
    return {
      isPartial: true,
      unresolvedComponentCount: unresolved,
      priceValidationWarnings: merged,
    };
  }
  // Rincian lengkap tervalidasi: bersihkan status parsial lama; peringatan
  // diganti set rincian terkini (lintas-wilayah/INDEX_ONLY yang masih
  // relevan), atau dikosongkan bila tidak ada lagi.
  return {
    isPartial: false,
    unresolvedComponentCount: 0,
    priceValidationWarnings: integrity.priceValidationWarnings?.length
      ? [...integrity.priceValidationWarnings]
      : undefined,
  };
}
