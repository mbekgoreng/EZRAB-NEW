# EZRAB_VOLUME_WORKBOOK_AUDIT.md — Real Excel Workbook Audit

## 1. Executive Summary & File Provenance

- **Workbook File Name**: `EZRAB_VOLUME_CALCULATOR_MASTER.xlsx`
- **File Size**: 4,420,149 bytes (~4.42 MB)
- **Status**: **VERIFIED & AUDITED** (Original Authoritative Reference Workbook)
- **Total Worksheets**: 24 visible sheets (0 hidden, 0 very hidden)
- **Total Master Formulas**: 1,751 formulas indexed in `FORMULA_SPEC`
- **Total Mapped Inputs**: 1,329 parameter & price rows indexed in `INPUT_MAP`

---

## 2. Worksheet Registry & Invariant Matrix

| No | Sheet Name | Category | Rows | Cols | Formulas | Embedded Drawings | Status |
|---|---|---|---|---|---|---|---|
| 01 | `Bowplank` | Pekerjaan Persiapan | 79 | 19 | 34 | 2 | PASS |
| 02 | `Pondasi` | Pekerjaan Pondasi | 132 | 19 | 74 | 2 | PASS |
| 03 | `Foot Plate` | Pekerjaan Pondasi | 119 | 19 | 115 | 4 | PASS |
| 04 | `Sloof` | Pekerjaan Struktur | 102 | 21 | 100 | 2 | PASS |
| 05 | `Kolom` | Pekerjaan Struktur | 97 | 19 | 104 | 2 | PASS |
| 06 | `Balok` | Pekerjaan Struktur | 106 | 20 | 107 | 2 | PASS |
| 07 | `Bata Ringan` | Pekerjaan Dinding | 88 | 18 | 51 | 4 | PASS |
| 08 | `Bata Merah` | Pekerjaan Dinding | 87 | 18 | 60 | 4 | PASS |
| 09 | `Batako` | Pekerjaan Dinding | 87 | 18 | 54 | 4 | PASS |
| 10 | `Pintu & Jendela` | Pekerjaan Arsitektur | 98 | 18 | 82 | 4 | PASS |
| 11 | `Atap Baja Ringan` | Pekerjaan Atap | 138 | 30 | 192 | 3 | PASS |
| 12 | `Plesteran & Acian` | Pekerjaan Finishing | 94 | 18 | 58 | 4 | PASS |
| 13 | `Penutup Lantai` | Pekerjaan Finishing | 103 | 18 | 107 | 2 | PASS |
| 14 | `Penutup Dinding` | Pekerjaan Finishing | 88 | 18 | 77 | 2 | PASS |
| 15 | `Plafon` | Pekerjaan Arsitektur | 84 | 21 | 162 | 3 | PASS |
| 16 | `Pengecatan` | Pekerjaan Finishing | 51 | 21 | 40 | 4 | PASS |
| 17 | `Kelistrikan` | Pekerjaan MEP | 48 | 19 | 104 | 2 | PASS |
| 18 | `Instalasi Air Bersih` | Pekerjaan MEP | 52 | 18 | 98 | 2 | PASS |
| 19 | `Sanitair` | Pekerjaan MEP | 72 | 20 | 112 | 2 | PASS |
| 20 | `Rekap RAB` | Rekapitulasi | 32 | 9 | 20 | 0 | PASS |
| 21 | `FORMULA_SPEC` | Specification | 1752 | 5 | 1751 | 0 | PASS |
| 22 | `INPUT_MAP` | Specification | 1329 | 7 | 0 | 0 | PASS |
| 23 | `CALC_AUDIT` | Audit Metadata | 21 | 8 | 0 | 0 | PASS |
| 24 | `EZRAB_README` | Documentation | 10 | 2 | 0 | 0 | PASS |

---

## 3. Structural & Calculation Findings

1. **Precision & Rounding**:
   - Internal calculation formulas utilize raw floating/decimal operations without intermediate premature rounding.
   - Outputs utilize display formatting (`0.00`, `0.000`, `Rp #,##0`).
2. **Error Guarding**:
   - The master workbook wraps critical operations in `=IFERROR(..., 0)` to guarantee fail-safe numeric returns.
3. **Cross-Sheet References**:
   - Recapitulation sheet `Rekap RAB` references primary quantities and subtotals across the 19 calculator sheets.
4. **Baja WF Audit Note**:
   - As confirmed by real workbook inspection, Baja WF is **NOT** present in the 19 residential/building Excel sheets.
   - Consequently, Baja WF is implemented as a **PROPOSED / SEPARATELY SOURCED** structural calculator with verified SNI 07-7178-2006 / Gunung Garuda profile registry.
