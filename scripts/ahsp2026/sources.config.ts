/**
 * Source registry — SE DJBK No. 47/SE/Dk/2026.
 *
 * Side-effect free: safe to import from any script. (The extractor entry point
 * lives in `extractRaw.ts`, which owns the `main()` call.)
 *
 * ── OFFICIAL ANNEX STRUCTURE (verified against the issuing authority) ─────────
 * Source: https://binakonstruksi.pu.go.id/produk/produk-hukum/
 *         surat-edaran-direktur-jenderal-bina-konstruksi-nomor-47-se-dk-2026/
 * (download_ids 10892 batang tubuh, 10894 I, 10897 II, 10899 III, 10901 IV,
 *  10903 V, 10904 VI, 10906 VII).
 *
 *   Batang Tubuh — Tata Cara Penyusunan Perkiraan Biaya Pekerjaan Konstruksi
 *   Lampiran I    — Teknis pengumpulan data Harga pokok sektor konstruksi
 *   Lampiran II   — Acuan dalam Penyusunan AHSP          (REFERENCE, not an item list)
 *   Lampiran III  — Biaya Penerapan SMKK
 *   Lampiran IV   — AHSP Bidang Sumber Daya Air
 *   Lampiran V    — AHSP Bidang Bina Marga
 *   Lampiran VI   — AHSP Bidang Cipta Karya
 *   Lampiran VII  — Tata Cara Pengajuan Usulan AHSP      (PROCEDURAL, not an item list)
 *
 * IMPORTANT (Phase 0.5 forensic finding): there is **no "AHSP Bidang Umum"** in
 * SE 47/2026. The four AHSP-bearing annexes are III, IV, V and VI. The earlier
 * brief target of 143 "Umum" items does not correspond to any annex of this
 * regulation — see EZRAB_AHSP_2026_MISSING_SOURCE.md.
 *
 * Also corrected in Phase 0.5: the Bina Marga PDF was previously stored under the
 * name `Lampiran-II-...-AHSP-Bidang-Bina-Marga.pdf`. Its own cover page reads
 * "LAMPIRAN V", its MD5 matches the authority's download_id=10903 (Lampiran V),
 * and the Lampiran VI (Cipta Karya) text cross-references it as
 * "Lampiran V Bidang Bina Marga". The attachment label is therefore **V**.
 */

import * as path from 'node:path';
import { SourceSpec } from './core';

const SRC = path.join(process.cwd(), 'sources', 'ahsp2026');

/** AHSP-bearing annexes — these produce dataset items. */
export const SOURCES: SourceSpec[] = [
  {
    key: 'smkk',
    attachment: 'III',
    field: 'SMKK',
    pdfPath: path.join(SRC, 'Lampiran-III-SE-DJBK-No-47-Tahun-2026-Biaya-Penerapan-SMKK.pdf'),
  },
  {
    key: 'sda',
    attachment: 'IV',
    field: 'SDA',
    pdfPath: path.join(SRC, 'Lampiran-IV-SE-DJBK-No-47-Tahun-2026-AHSP-Bidang-Sumber-Daya-Air.pdf'),
  },
  {
    key: 'binamarga',
    attachment: 'V',
    field: 'BINA_MARGA',
    pdfPath: path.join(SRC, 'Lampiran-V-SE-DJBK-No-47-Tahun-2026-AHSP-Bidang-Bina-Marga.pdf'),
  },
  {
    key: 'ciptakarya',
    attachment: 'VI',
    field: 'CIPTA_KARYA',
    pdfPath: path.join(SRC, 'Lampiran-VI-SE-DJBK-No-47-Tahun-2026-AHSP-Bidang-Cipta-Karya.pdf'),
  },
];

/**
 * Non-AHSP annexes. They carry no AHSP analysis tables and therefore contribute
 * no items to the master dataset — but they are part of the same regulation and
 * are recorded so the coverage claim is complete.
 */
export const GUIDANCE_DOCS: {
  attachment: string;
  field: string;
  title: string;
  pdfPath: string;
  /** True when the annex contains at least one itemised AHSP analysis table. */
  containsAhspItems: boolean;
  note: string;
}[] = [
  {
    attachment: 'I',
    field: 'TEKNIS_HARGA_POKOK',
    title: 'Teknis pengumpulan data Harga pokok sektor konstruksi di Kementerian PU',
    pdfPath: path.join(SRC, 'Lampiran-I-SE-DJBK-No-47-Tahun-2026-Teknis-Pengumpulan-Data-Harga-Pokok.pdf'),
    containsAhspItems: false,
    note: 'Technical guidance for collecting basic prices. Contains no AHSP analysis tables.',
  },
  {
    attachment: 'II',
    field: 'ACUAN_PENYUSUNAN_AHSP',
    title: 'Acuan dalam Penyusunan AHSP',
    pdfPath: path.join(SRC, 'Lampiran-II-SE-DJBK-No-47-Tahun-2026-Acuan-dalam-Penyusunan-AHSP.pdf'),
    containsAhspItems: false,
    note:
      'Reference tables only: conversion factors (Tabel A.1–A.36), material/equipment ' +
      'productivity formulas and coefficients. Verified to contain no itemised AHSP ' +
      'analysis list (no code index, no DAFTAR, no division headers).',
  },
  {
    attachment: 'VII',
    field: 'TATA_CARA_PENGAJUAN_AHSP',
    title: 'Tata Cara Pengajuan Usulan AHSP',
    pdfPath: path.join(SRC, 'Lampiran-VII-SE-DJBK-No-47-Tahun-2026-Tata-Cara-Pengajuan-Usulan-AHSP.pdf'),
    containsAhspItems: false,
    note: 'Procedural guidance for submitting new AHSP proposals. Contains no AHSP analysis tables.',
  },
];

/** Official download ids, kept for provenance/audit. */
export const OFFICIAL_DOWNLOAD_IDS: Record<string, number> = {
  'batang-tubuh': 10892,
  'I': 10894,
  'II': 10897,
  'III': 10899,
  'IV': 10901,
  'V': 10903,
  'VI': 10904,
  'VII': 10906,
};

/** MD5 of the authoritative Bina Marga download (download_id=10903). */
export const BINA_MARGA_OFFICIAL_MD5 = '96e4a1b33f7b514ea785baf6086bcd80';
