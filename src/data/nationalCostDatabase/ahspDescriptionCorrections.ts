/**
 * EZRAB AHSP 2026 — DESCRIPTION CORRECTIONS (Phase 2E)
 * ====================================================
 * Overlay patch layer. The canonical generated file is NEVER edited by hand.
 * Each correction is proven by DIRECT PDF inspection (lampiran-VI.pdf).
 *
 * Every entry records: old value, new value, code, unit, PDF page, reason.
 * Prices and coefficients are NOT touched by these corrections.
 */

export interface DescriptionCorrection {
  code: string;
  field: 'name' | 'unit' | 'materialName';
  /** Material index for materialName corrections (0-based). */
  materialIndex?: number;
  oldValue: string;
  newValue: string;
  /** PDF page number in lampiran-VI.pdf (file page, not printed number). */
  pdfPage: number;
  reason: string;
}

export const DESCRIPTION_CORRECTIONS: DescriptionCorrection[] = [
  // ---- 2.2.1.2.4: waterstop width (Phase 2D §B, verified 2E PDF hal. 253) ----
  {
    code: '2.2.1.2.4', field: 'name',
    oldValue: 'Pemasangan 1 m\' PVC waterstop lebar 150 mm (untuk bangunan gedung)',
    newValue: 'Pemasangan 1 m\' PVC Waterstop lebar 230 mm – 320 mm (untuk Bangunan Gedung)',
    pdfPage: 253,
    reason: 'PDF: "PVC Waterstop lebar 230 mm – 320 mm"; master salah tulis 150 mm',
  },
  {
    code: '2.2.1.2.4', field: 'unit',
    oldValue: 'm', newValue: "m'",
    pdfPage: 253,
    reason: 'Satuan tersirat "m\'" dari uraian PDF',
  },

  // ---- 4.1.8.1–.10: description shift (verified 2E PDF hal. 760–763) ----
  // Master 4.1.8.N (N=2..10) = PDF 4.1.8.(N-1); master .1 = bogus label.
  {
    code: '4.1.8.1', field: 'name',
    oldValue: 'Cara Perhitungan AHSP Pengelolaan Tanah Tidak Subur',
    newValue: 'Pengolahan Tanah berPH 4.50-5.50 dan Bertekstur Pasir 60.01% - 100.00% atau Tanah Sandy per m3',
    pdfPage: 760,
    reason: 'Label bogus di master; PDF 4.1.8.1 = uraian pengolahan tanah',
  },
  {
    code: '4.1.8.1', field: 'unit',
    oldValue: 'buah', newValue: 'm3',
    pdfPage: 760,
    reason: 'Semua uraian seri ini "per m3"',
  },
  {
    code: '4.1.8.2', field: 'name',
    oldValue: 'Pengolahan Tanah berPH 4,50-5,50 dan bertekstur Pasir 60,01%-100,00% atau tanah sandy per m3',
    newValue: 'Pengolahan Tanah berPH 4.50-5.50 dan Bertekstur Liat 40.01% - 60.00% atau Tanah Sandy Loam per m3',
    pdfPage: 760,
    reason: 'Pergeseran satu posisi: master .2 = PDF .1',
  },
  {
    code: '4.1.8.3', field: 'name',
    oldValue: 'Pengolahan Tanah berPH 4.50-5.50 dan Bertekstur Liat 40.01% - 60.00% atau Tanah Sandy Loam per m3',
    newValue: 'Pengolahan Tanah berPH 4.50-5.50 dan Bertekstur Liat 60.01% - 100.00% atau Tanah Loam To Clay Loam per m3',
    pdfPage: 761,
    reason: 'Pergeseran satu posisi: master .3 = PDF .2',
  },
  {
    code: '4.1.8.4', field: 'name',
    oldValue: 'Pengolahan Tanah berPH 4.50-5.50 dan Bertekstur Liat 60.01% - 100.00% atau Tanah Loam To Clay Loam per m3',
    newValue: 'Pengolahan Tanah berPH 3.50-4.49 dan Bertekstur Liat 60.01% - 100.00% atau Tanah Sandy per m3',
    pdfPage: 761,
    reason: 'Pergeseran satu posisi: master .4 = PDF .3',
  },
  {
    code: '4.1.8.5', field: 'name',
    oldValue: 'Pengolahan Tanah berPH 3.50-4.49 dan Bertekstur Liat 60.01% - 100.00% atau Tanah Sandy per m3',
    newValue: 'Pengolahan Tanah berPH 3.50-4.49 dan Bertekstur Liat 40.01% - 60.00% atau Tanah Sandy Loam per m3',
    pdfPage: 761,
    reason: 'Pergeseran satu posisi: master .5 = PDF .4',
  },
  {
    code: '4.1.8.6', field: 'name',
    oldValue: 'Pengolahan Tanah berPH 3.50-4.49 dan Bertekstur Liat 40.01% - 60.00% atau Tanah Sandy Loam per m3',
    newValue: 'Pengolahan Tanah berPH 3.50-4.49 dan Bertekstur Liat 60.01% - 100.00% atau Tanah Loam To Clay Loam per m3',
    pdfPage: 762,
    reason: 'Pergeseran satu posisi: master .6 = PDF .5',
  },
  {
    code: '4.1.8.7', field: 'name',
    oldValue: 'Pengolahan Tanah berPH 3.50-4.49 dan Bertekstur Liat 60.01% - 100.00% atau Tanah Loam To Clay Loam per m3',
    newValue: 'Pengolahan Tanah berPH >7.5 per m3',
    pdfPage: 762,
    reason: 'Pergeseran satu posisi: master .7 = PDF .6',
  },
  {
    code: '4.1.8.8', field: 'name',
    oldValue: 'Pengolahan Tanah berPH >7.5 per m3',
    newValue: 'Pengolahan Tanah berPH >7.5 dan Bertekstur Pasir 60.01% - 100.00% atau Tanah Sandy per m3',
    pdfPage: 762,
    reason: 'Pergeseran satu posisi: master .8 = PDF .7',
  },
  {
    code: '4.1.8.9', field: 'name',
    oldValue: 'Pengolahan Tanah berPH >7.5 dan Bertekstur Pasir 60.01% - 100.00% atau Tanah Sandy per m3',
    newValue: 'Pengolahan Tanah berPH >7.5 dan Bertekstur Liat 40.01% - 60.00% atau Tanah Sandy Loam per m3',
    pdfPage: 763,
    reason: 'Pergeseran satu posisi: master .9 = PDF .8',
  },
  {
    code: '4.1.8.10', field: 'name',
    oldValue: 'Pengolahan Tanah berPH >7.5 dan Bertekstur Liat 40.01% - 60.00% atau Tanah Sandy Loam per m3',
    newValue: 'Pengolahan Tanah berPH >7.5 dan Bertekstur Liat 60.01% - 100.00% atau Tanah Loam To Clay Loam per m3',
    pdfPage: 763,
    reason: 'Pergeseran satu posisi: master .10 = PDF .9; uraian PDF .10 sebelumnya tidak ada di master',
  },

  // ---- 5.1.2.12–.14: wrong descriptions + material names (PDF hal. 911–912) ----
  // Components NOT swapped — only descriptions were wrong. All three are
  // DISTINCT items (different materials), not duplicates.
  {
    code: '5.1.2.12', field: 'name',
    oldValue: 'Pemasangan 1 Unit Panel Kontrol Power Chiller',
    newValue: 'Pemasangan 1 Unit Panel Kontrol Pompa Kolam Renang',
    pdfPage: 911,
    reason: 'PDF hal. 911; "Power Chiller" sebenarnya = 5.1.2.20',
  },
  {
    code: '5.1.2.12', field: 'materialName', materialIndex: 0,
    oldValue: 'Panel Kontrol Power Chiller termasuk material bantu',
    newValue: 'Panel Kontrol Pompa Kolam Renang termasuk material bantu',
    pdfPage: 911,
    reason: 'Material PDF: "Panel Kontrol Pompa Kolam Renang"',
  },
  {
    code: '5.1.2.13', field: 'name',
    oldValue: 'Pemasangan 1 Unit Panel Kontrol Power Chiller',
    newValue: 'Pemasangan 1 Unit Panel Kontrol Water Treatment Plant (WTP)',
    pdfPage: 912,
    reason: 'PDF hal. 912; item BERBEDA dari .12 (material berbeda), bukan duplikat',
  },
  {
    code: '5.1.2.13', field: 'materialName', materialIndex: 0,
    oldValue: 'Panel Kontrol Power Chiller termasuk material bantu',
    newValue: 'Panel Kontrol Water Treatment Plant (WTP) termasuk material bantu',
    pdfPage: 912,
    reason: 'Material PDF: "Panel Kontrol WTP"',
  },
  {
    code: '5.1.2.14', field: 'name',
    oldValue: 'Pemasangan 1 Unit Panel Kontrol Power Chiller',
    newValue: 'Pemasangan 1 Unit Panel Kontrol Instalasi Pengolahan Air Limbah (IPAL)',
    pdfPage: 912,
    reason: 'PDF hal. 912; item BERBEDA dari .12/.13 (material berbeda), bukan duplikat',
  },
  {
    code: '5.1.2.14', field: 'materialName', materialIndex: 0,
    oldValue: 'Panel Kontrol Power Chiller termasuk material bantu',
    newValue: 'Panel Kontrol Instalasi Pengolahan Air Limbah (IPAL) termasuk material bantu',
    pdfPage: 912,
    reason: 'Material PDF: "Panel Kontrol IPAL"',
  },
  {
    code: '5.1.2.15', field: 'name',
    oldValue: 'Pemasangan 1 Unit Panel Power Gondola',
    newValue: 'Pemasangan 1 Unit Panel Power Lift',
    pdfPage: 913,
    reason: 'PDF hal. 913',
  },
  {
    code: '5.1.2.15', field: 'materialName', materialIndex: 0,
    oldValue: 'Panel Power Gondola termasuk material bantu',
    newValue: 'Panel Power Lift termasuk material bantu',
    pdfPage: 913,
    reason: 'Konsistensi dengan uraian PDF',
  },

  // ---- 5.5.4.17: wrong content = duplicate of 5.5.4.18 (PDF hal. 1090) ----
  {
    code: '5.5.4.17', field: 'name',
    oldValue: 'Pemasangan 1 m\' pipa PVC AW, DN. 3" (80 mm) + Isolasi',
    newValue: 'Pemasangan 1 m Pipa PVC AW ; DN. 2-1/2" (65 mm) + Isolasi',
    pdfPage: 1090,
    reason: 'PDF hal. 1090; isi master = duplikat 5.5.4.18 (defek pipeline)',
  },

  // ---- 6.5.10.11/.12: pressure rating (PDF hal. 1288) ----
  {
    code: '6.5.10.11', field: 'name',
    oldValue: 'Pemasangan 1 Unit Pressure Gauge 16 K + Gate valve, DN 1/2" (15 mm)',
    newValue: 'Pemasangan 1 Unit Pressure Gauge 40 K + Gate valve, DN 1/2" (15 mm)',
    pdfPage: 1288,
    reason: 'PDF: "Pressure Gauge 40 K"',
  },
  {
    code: '6.5.10.12', field: 'name',
    oldValue: 'Pemasangan 1 Unit Pressure Gauge 16 K + Gate valve, DN 1" (25 mm)',
    newValue: 'Pemasangan 1 Unit Pressure Gauge 40 K + Gate valve, DN 1" (25 mm)',
    pdfPage: 1288,
    reason: 'PDF: "Pressure Gauge 40 K"',
  },

  // ---- 6.5.2.1: unit + typo (PDF hal. 1216) ----
  {
    code: '6.5.2.1', field: 'unit',
    oldValue: 'buah', newValue: 'Unit',
    pdfPage: 1216,
    reason: 'PDF: "1 Unit ball valve"',
  },
  {
    code: '6.5.2.1', field: 'name',
    oldValue: 'Pemasangan 1 buah ball velve, Dia. 1/2" (15 mm)',
    newValue: 'Pemasangan 1 Unit ball valve, DN 1/2" (15 mm)',
    pdfPage: 1216,
    reason: 'PDF persis; typo "velve" diperbaiki',
  },

  // ---- Bina Marga I.44 / I.64: qualifier varian tersangkut ke kolom satuan (P0 audit 2026-10-26) ----
  // Sumber verifikasi: master audit kanonis data/ahsp2026/validated/ahsp_2026_master.json
  // (SE DJBK No. 47/SE/Dk/2026 Lampiran V — BUKAN lampiran-VI seperti koreksi lain di
  // file ini; angka pdfPage di bawah adalah halaman Lampiran V tersebut).
  // I.44: master BM menulis satuan "(Penerapan Umum)" — padahal itu qualifier varian
  // di depan uraian kanonis, dan satuan kanonisnya "Meter Persegi" (Lampiran V hal. 1824).
  {
    code: 'I.44', field: 'unit',
    oldValue: '(Penerapan Umum)', newValue: 'Meter Persegi',
    pdfPage: 1824,
    reason: 'Kanonis Lampiran V hal. 1824: uraian "(Penerapan Umum) Marka Jalan Termoplastik Non Glow in The Dark", satuan "Meter Persegi"; master BM salah letak qualifier ke kolom satuan',
  },
  // I.64: master BM menulis satuan "Engineering Grade, Ukuran Sedang" (qualifier varian)
  // dan memenggal nama ("Rambu Peringatan/Larangan/Perintah, Tunggal,"); kanonis
  // Lampiran V hal. 1877: uraian lengkap + satuan "Buah".
  {
    code: 'I.64', field: 'unit',
    oldValue: 'Engineering Grade, Ukuran Sedang', newValue: 'Buah',
    pdfPage: 1877,
    reason: 'Kanonis Lampiran V hal. 1877: satuan "Buah"; master BM salah letak qualifier varian ke kolom satuan',
  },
  {
    code: 'I.64', field: 'name',
    oldValue: 'Rambu Peringatan/Larangan/Perintah, Tunggal,',
    newValue: 'Engineering Grade, Ukuran Sedang Rambu Peringatan/Larangan/Perintah, Tunggal,',
    pdfPage: 1877,
    reason: 'Kanonis Lampiran V hal. 1877: uraian lengkap diawali qualifier varian; master BM memenggal qualifier dari nama',
  },
];

/** code -> corrections lookup */
const correctionMap = new Map<string, DescriptionCorrection[]>();
for (const c of DESCRIPTION_CORRECTIONS) {
  const arr = correctionMap.get(c.code) ?? [];
  arr.push(c);
  correctionMap.set(c.code, arr);
}

/** Get all corrections for a code. */
export function getCorrections(code: string): DescriptionCorrection[] {
  return correctionMap.get(code.trim()) ?? [];
}

/** True if the code has any pending description correction. */
export function hasCorrection(code: string): boolean {
  return correctionMap.has(code.trim());
}

/** All corrected codes (for audit). */
export function listCorrectedCodes(): string[] {
  return [...correctionMap.keys()];
}
