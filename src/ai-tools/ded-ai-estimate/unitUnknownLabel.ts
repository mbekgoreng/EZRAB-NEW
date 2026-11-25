/**
 * WD-3.7-08 — label kanonis untuk satuan yang diasumsikan m².
 *
 * Modul murni TANPA impor (boleh dipakai view, ekspor Excel, dan
 * dedOutputContract tanpa risiko impor siklik). Satu sumber untuk:
 *  - teks kolom satuan di ekspor Excel DedAiResultView,
 *  - penanda jumlah item bersatuan-diasumsikan di ringkasan WBS,
 *  - catatan asumsi di dedOutputContract (assumptions[]).
 *
 * Anotasi tampilan/provenance SAJA — tidak mengubah kuantitas, harga,
 * subtotal, atau keikutsertaan item dalam total.
 */

/** Sufiks kolom satuan di ekspor (Excel tidak mendukung badge visual). */
export const UNIT_UNKNOWN_EXPORT_SUFFIX = ' (satuan diasumsikan)';

/**
 * Label satuan untuk ekspor/teks polos: satuan apa adanya bila dinyatakan,
 * ditambah sufiks bila satuan diasumsikan sistem (unitUnknown).
 */
export function exportUnitLabel(units: string, unitUnknown?: boolean): string {
  return unitUnknown ? `${units}${UNIT_UNKNOWN_EXPORT_SUFFIX}` : units;
}

/**
 * Catatan asumsi kanonis untuk dedOutputContract assumptions[] — merujuk
 * token provenance 'unit:assumed-m2' yang ditempel convertAiItem agar
 * jejak auditnya dapat ditelusur balik ke sumber yang sama.
 */
export const UNIT_UNKNOWN_ASSUMPTION_NOTE =
  'Satuan diasumsikan m² — satuan tidak tercantum di DED/model; sistem memakai m² sebagai default ' +
  '(token provenance unit:assumed-m2). Verifikasi satuan sebelum finalisasi.';

/** Hitung item bersatuan-diasumsikan dalam satu daftar (dipakai ringkasan WBS). */
export function countUnitUnknown(items: ReadonlyArray<{ unitUnknown?: boolean }>): number {
  let n = 0;
  for (const it of items) if (it.unitUnknown) n++;
  return n;
}
