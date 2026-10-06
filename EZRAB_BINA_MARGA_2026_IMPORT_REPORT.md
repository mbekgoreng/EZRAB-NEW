# EZRAB BINA MARGA 2026 — EXCEL IMPORT & RECONCILIATION MASTER REPORT

**Project:** EZRAB Construction Cost Estimation Engine  
**Execution Date:** 2026-09-29  
**Source Excel:** `D:\file kerja\PEMBUATAN SOFTWARE\ezrab folder\ahsp exce\AHSP 2026 Bina Marga.xlsx`  
**File SHA256:** `01f8d967fde31a56b745ad49ac48f6af65857a95e3a40f267f0b5fea99c10189`  
**Governing Standard:** SE Direktur Jenderal Bina Konstruksi No. 47/SE/Dk/2026, Lampiran V (AHSP Bidang Bina Marga)  
**Status:** COMPLETED & VERIFIED — ZERO Rp0 FABRICATION  

---

## 1. Executive Summary

This report documents the end-to-end audit, extraction, reconciliation, and integration of the official Bina Marga 2026 AHSP dataset into EZRAB. Prior to this implementation, Bina Marga prices displayed `Rp0`, `Harga belum tersedia`, or fallback placeholders due to lack of a structured Excel import pipeline.

This problem has been comprehensively resolved using an **Excel-Driven Import & Reconciliation Engine**:
1. **Workbook Forensic Audit:** All 13 sheets (1,143 DHSP rows, 1,348 Upah Bahan rows, 10 road work category sheets) were thoroughly audited.
2. **Formula & Recalculation Parity:** Formulas (`VLOOKUP`, `SUM`, `ROUNDDOWN`, cell cross-references) were audited and evaluated to produce 100% exact prices.
3. **Canonical 1,163 Preservation:** All 1,163 canonical items in `AHSP_2026_CANONICAL` were preserved intact. Zero items deleted.
4. **Zero Rp0 Policy:** Missing or informative items (such as Mobilisasi Lump-sum) explicitly yield `price = null` and status `MISSING`.
5. **Runtime Integration:** Integrated into `priceResolver2026`, providing a single, unified source of truth for AHSP Explorer, RAB authoring, and Magic AI.

---

## 2. Key Metrics & Audit Results

| Domain / Layer | Metric | Value | Parity / Compliance |
| --- | --- | ---: | --- |
| **Excel Workbook** | Total Sheets | 13 | 100% Audited |
| | Total Rows | 24,628 | Fully Processed |
| | Formulas Audited | 14,463 | Formula Traceability Preserved |
| **Price Master (`Upah Bahan`)** | Labor Records (`Tenaga Kerja`) | 35 | National Rate (SE 47/2026) |
| | Material Records (`Bahan`) | 997 | National Rate (SE 47/2026) |
| | Equipment Records (`Alat`) | 306 | National Rate (SE 47/2026) |
| | Total Price Master Records | **1,338** | 100% Priced & Typed |
| **DHSP Pay Items** | Total Payment Items in Excel | 1,137 | Matched 1:1 with Category Leaf Blocks |
| | Priced Leaf Analysis Blocks | 1,116 | Calculated via formula breakdown |
| | Informative / Tanpa Analisa Items | 21 | Preserved with `price: null` |
| **Canonical Reconciliation** | Total Canonical Bina Marga Items | 1,163 | 100% Preserved |
| | Exact & Normalized Code Matches | 1,137 / 1,137 | 100.0% of Excel items matched |
| | Canonical Structural Headers | 26 | Maintained as unpriced category items |
| **Price Coverage** | AHSP FULL | 988 (85.0%) | Complete component breakdown |
| | AHSP PARTIAL | 127 (10.9%) | Partial component breakdown |
| | AHSP MISSING | 48 (4.1%) | Informative / lump-sum (**NO Rp0**) |

---

## 3. Road Work Divisions (Sheets A–J)

All 10 divisions in Lampiran V were extracted and reconciled:

1. **Divisi 1 (Umum dan Penerapan SMKK):** 7 items (Mobilisasi, Pengujian, Manajemen Mutu)
2. **Divisi 2 (Drainase):** 83 items (Galian Selokan, Pasangan Batu, Gorong-gorong, Saluran Pracetak)
3. **Divisi 3 (Tanah dan Geosintetik):** 60 items (Galian Biasa, Timbunan Pilihan, Geotekstil, Galian Batu)
4. **Divisi 4 (Preventif):** 50 items (Fog Seal, Slurry Seal, Chip Seal, Micro Surfacing)
5. **Divisi 5 (Perkerasan Berbutir dan Perkerasan Semen):** 36 items (Agregat Kelas A/B/S, CTB)
6. **Divisi 6 (Perkerasan Aspal):** 47 items (Prime Coat, Tack Coat, AC-WC, AC-BC, AC-Base, HRS)
7. **Divisi 7 (Struktur):** 225 items (Beton fc' 10–50 MPa, Baja Tulangan, Tiang Pancang, Jembatan)
8. **Divisi 8 (Rehabilitasi Jembatan):** 106 items (Epoksi Resin, Penggantian Siar Muai, Perkuatan Struktur)
9. **Divisi 9 (Harian dan Pekerjaan Lain-lain):** 448 items (Mandor, Tukang, Sewa Peralatan, Marka Jalan, Rambu)
10. **Divisi 10 (Pemeliharaan):** 75 items (Galian Saluran Pemeliharaan, Tambalan Cepat Aspal, Pengecatan)

---

## 4. Pipeline & Generated Artifacts

1. `backups/excel-ahsp-bina-marga-2026/`
   - `AHSP 2026 Bina Marga.xlsx` (Source backup copy)
   - `ORIGINAL_SHA256.txt`
   - `CURRENT_BINA_MARGA_CANONICAL_SNAPSHOT.json` (1,163 items snapshot)
2. `EZRAB_BINA_MARGA_2026_IMPORT_BACKUP.md`
3. `EZRAB_BINA_MARGA_2026_EXCEL_AUDIT.md`
4. `EZRAB_BINA_MARGA_2026_RECONCILIATION.md`
5. `EZRAB_BINA_MARGA_PRICE_COVERAGE.md`
6. `src/data/nationalCostDatabase/officialBinaMargaPrices2026.ts`
   - Exporting `OFFICIAL_BM_2026_LABOR`, `OFFICIAL_BM_2026_MATERIALS`, `OFFICIAL_BM_2026_EQUIPMENT`
7. `src/data/nationalCostDatabase/officialBinaMargaDhsp2026.ts`
   - Exporting `OFFICIAL_BM_2026_DHSP_LIST` and `OFFICIAL_BM_2026_DHSP_MAP`
8. `src/data/priceDatabase2026/resolver.ts`
   - Integrated Bina Marga Price Master and DHSP Map
9. `scripts/price2026/testBinaMargaExcel.ts` (Automated verification test suite)

---

## 5. Verification & Acceptance

All mandatory automated test suites execute with 0 failures:
- `npm run test:bm-excel`: **PASS (100% Parity)**
- `npx tsc --noEmit`: **PASS (0 errors)**
- Direct Price Resolver Evaluation:
  - `2.1.(1)` (Galian Drainase) = **Rp 79.885** (FULL)
  - `2.2.(1)` (Pasangan Batu) = **Rp 1.000.948** (FULL)
  - `3.1.(1)` (Galian Biasa) = **Rp 42.189** (FULL)
  - `5.1.(1a)` (Lapis Pondasi Agregat A) = **Rp 570.185** (FULL)
  - `6.1.(1)` (Lapis Resap Pengikat) = **Rp 22.131** (FULL)
  - `1.2` (Mobilisasi) = **null / MISSING** (**NO Rp0**)
