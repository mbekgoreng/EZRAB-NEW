/**
 * EZRAB AI — Deterministic explanations (remediasi Batch 1, 2026-10-28).
 *
 * Pure strings — no imports — so tests can import them without the whole
 * action registry. Used by actionRegistry for EXPLAIN_AHSP_VS_ESTIMATE,
 * METHODOLOGY_MISSING_AHSP, and HOWTO_EXCEL_EXPORT intents.
 *
 * Every claim below is verified against the app's standing rules:
 * - AHSP = katalog kanonis (koefisien Lampiran VI SE DJBK No. 47/SE/Dk/2026
 *   × harga sumber daya HSD), tampil apa adanya dengan status lengkap/parsial.
 * - Estimasi AI = perkiraan berlabel, hanya bila item tak ada di database,
 *   wajib verifikasi sebelum RAB final.
 * - Tanpa dasar = "Harga belum tersedia", bukan Rp0.
 * - Ekspor Excel = tombol "Export Excel (.xlsx)" di halaman Laporan,
 *   memanggil exportProjectToExcel atas RAB proyek aktif; aplikasi
 *   menyebut hasilnya workbook 16-sheet.
 */
export const EXPLAIN_AHSP_VS_ESTIMATE_TEXT =
  'Harga AHSP resmi berasal dari katalog AHSP 2026: koefisien pekerjaan ' +
  '(Lampiran VI SE DJBK No. 47/SE/Dk/2026) dikalikan harga sumber daya HSD, ' +
  'dan ditampilkan apa adanya dengan status lengkap/parsialnya. ' +
  'Estimasi AI berbeda: ia adalah perkiraan, dipakai hanya bila item tidak ' +
  "ditemukan di database AHSP, dan selalu berlabel 'Estimasi AI' — bukan harga " +
  'resmi — sehingga wajib diverifikasi sebelum masuk RAB final. ' +
  'Bila tidak ada dasar sama sekali, nilainya tidak diberi angka: statusnya ' +
  "'Harga belum tersedia', bukan Rp0.";

export const METHODOLOGY_MISSING_AHSP_TEXT =
  'Bila satu pekerjaan tidak ada di AHSP 2026: ' +
  '(1) periksa dulu katalog kanonis — bila ada, pakai data itu; ' +
  '(2) bila tidak ada, AI boleh memberi estimasi berlabel \'Estimasi AI\' hanya ' +
  'bila ada dasar yang masuk akal, dan estimasi itu tidak dihitung sebagai harga resmi; ' +
  '(3) bila tidak ada dasar sama sekali, nilainya tetap \'Harga belum tersedia\' ' +
  '(bukan Rp0), dan total yang memuatnya dinyatakan PARSIAL/belum final. ' +
  'Kode AHSP yang tidak ditemukan dinyatakan tidak ditemukan — tidak diganti dengan item lain.';

export const HOWTO_EXCEL_EXPORT_TEXT =
  'Cara mengekspor RAB ke Excel:\n' +
  '1. Buka menu Laporan. Yang diekspor adalah RAB proyek yang sedang aktif.\n' +
  '2. Di kanan atas halaman Laporan, klik tombol "Export Excel (.xlsx)".\n' +
  '3. Berkas .xlsx terunduh otomatis. Sesuai aplikasi, workbook berisi 16 sheet ' +
  '(antara lain cover, identitas proyek, rekap, detail RAB, backup volume, upah, ' +
  'material, peralatan, AHSP, jadwal, kurva S, dan cashflow).';
