# EZRAB CIPTA KARYA EXCEL FORENSIC AUDIT REPORT
**Generated:** 2026-09-29T00:00:51.174953  
**Workbook:** `D:\file kerja\PEMBUATAN SOFTWARE\ezrab folder\ahsp exce\ahsp bina kontruksi 2026.xlsx`  
**Total Sheets:** 42  
**Total Rows:** 59,893  
**Total Formulas:** 68,932  
**Leaf AHSP in DHSP:** 2,808  

---
## 1. Executive Summary
The official Cipta Karya workbook (`ahsp bina kontruksi 2026.xlsx`) contains 42 worksheets structured across three distinct layers:
1. **DHSP Summary Sheet (`Daftar Harga Satuan Pekerjaan`)**: 3,148 rows containing work item codes, descriptions, units, and unit prices. Crucially, the unit prices in column E are dynamically linked via `=VLOOKUP(...)` formulas targeting the detail analysis sheets.
2. **Resource Master Sheet (`Upah Bahan`)**: 3,324 resource pricing entries (45 labor rates, 3,075 material prices, and 204 equipment rental rates) serving as the authoritative price master for SE DJBK No. 47/SE/Dk/2026.
3. **40 Technical Analysis Sheets (`Persiapan`, `Galian Tanah`, `Beton`, `Pondasi`, `BAJA`, etc.)**: Detail bill of quantities breaking down each work item into Tenaga Kerja (Labor), Bahan (Materials), and Peralatan (Equipment) with exact coefficients and line totals, concluding at Row F (`Harga Satuan Pekerjaan (D+E)`).

---
## 2. Comprehensive Sheet Inventory
| No | Sheet Name | Rows | Cols | Merged Cells | Formulas | VLOOKUPs | Key Function |
| -: | :--- | ---: | ---: | ---: | ---: | ---: | :--- |
| 1 | `Daftar Harga Satuan Pekerjaan` | 3,182 | 11 | 6 | 14,799 | 11,643 | **DHSP Summary (Master Catalog)** |
| 2 | `Upah Bahan` | 3,366 | 204 | 1 | 79 | 0 | **Price Master (Upah/Bahan/Alat)** |
| 3 | `Persiapan` | 679 | 17 | 3 | 703 | 203 | Detail Analysis |
| 4 | `Galian Tanah` | 723 | 19 | 0 | 540 | 116 | Detail Analysis |
| 5 | `Timbunan Pemadatan` | 232 | 17 | 2 | 183 | 37 | Detail Analysis |
| 6 | `Angkut Material` | 257 | 19 | 0 | 214 | 39 | Detail Analysis |
| 7 | `Geotekstil & Geomembran ` | 152 | 17 | 0 | 164 | 50 | Detail Analysis |
| 8 | `Pembongkaran` | 831 | 15 | 1 | 738 | 200 | Detail Analysis |
| 9 | `Rangka Atap` | 198 | 16 | 0 | 214 | 70 | Detail Analysis |
| 10 | `Beton` | 1,333 | 15 | 0 | 1,393 | 433 | Detail Analysis |
| 11 | `Pondasi` | 1,145 | 16 | 9 | 1,192 | 364 | Detail Analysis |
| 12 | `BAJA` | 140 | 16 | 0 | 143 | 45 | Detail Analysis |
| 13 | `Beton Pracetak` | 469 | 19 | 0 | 484 | 148 | Detail Analysis |
| 14 | `Beton Prategang ` | 20 | 16 | 0 | 22 | 7 | Detail Analysis |
| 15 | `Struktur Kayu` | 59 | 17 | 0 | 64 | 20 | Detail Analysis |
| 16 | `Dinding Penahan Tanah ` | 292 | 16 | 16 | 302 | 87 | Detail Analysis |
| 17 | `Penutup Atap` | 1,058 | 16 | 0 | 1,108 | 351 | Detail Analysis |
| 18 | `Plafon` | 295 | 16 | 1 | 302 | 95 | Detail Analysis |
| 19 | `Pasangan Dinding` | 547 | 16 | 3 | 598 | 201 | Detail Analysis |
| 20 | `Plesteran Dan Acian` | 286 | 16 | 0 | 294 | 91 | Detail Analysis |
| 21 | `Pengecatan dan Pelituran` | 470 | 16 | 0 | 505 | 165 | Detail Analysis |
| 22 | `Penutup Lantai dan Dinding` | 2,284 | 13 | 0 | 2,536 | 873 | Detail Analysis |
| 23 | `Pintu dan Jendela` | 982 | 15 | 0 | 1,000 | 310 | Detail Analysis |
| 24 | `Kaca` | 254 | 16 | 0 | 266 | 84 | Detail Analysis |
| 25 | `Besi dan Aluminium` | 118 | 16 | 0 | 129 | 42 | Detail Analysis |
| 26 | `Kayu` | 42 | 17 | 0 | 48 | 17 | Detail Analysis |
| 27 | `Ornamen` | 19 | 16 | 0 | 19 | 6 | Detail Analysis |
| 28 | `Signage` | 171 | 15 | 0 | 178 | 55 | Detail Analysis |
| 29 | `Sanitair` | 431 | 16 | 0 | 451 | 143 | Detail Analysis |
| 30 | `Lansekap` | 8,879 | 20 | 127 | 8,171 | 2,562 | Detail Analysis |
| 31 | `Jaringan Listrik` | 11,916 | 16 | 0 | 12,564 | 3,649 | Detail Analysis |
| 32 | `Perpipaan dan proteksi kebakar ` | 1,137 | 15 | 48 | 1,163 | 351 | Detail Analysis |
| 33 | `Sistem Air Minum` | 877 | 15 | 0 | 927 | 255 | Detail Analysis |
| 34 | `Sistem Air Limbah` | 276 | 14 | 1 | 296 | 88 | Detail Analysis |
| 35 | `Bak Kontrol` | 69 | 15 | 0 | 81 | 30 | Detail Analysis |
| 36 | `Perpipaan dalam Gedung ` | 8,886 | 15 | 0 | 8,870 | 2,517 | Detail Analysis |
| 37 | `Sistem Air Hujan` | 26 | 17 | 0 | 30 | 11 | Detail Analysis |
| 38 | `Sambungan Rumah` | 92 | 17 | 0 | 65 | 15 | Detail Analysis |
| 39 | `Jalan Pada Pemukiman` | 456 | 18 | 0 | 556 | 199 | Detail Analysis |
| 40 | `Drainase` | 1,776 | 18 | 94 | 1,994 | 619 | Detail Analysis |
| 41 | `Jaringan Pipa Luar Gedung` | 5,223 | 21 | 0 | 5,287 | 1,427 | Detail Analysis |
| 42 | `Strutur Risha ` | 245 | 17 | 0 | 260 | 58 | Detail Analysis |

---
## 3. Formula Architecture & Resolution Mechanics
The DHSP sheet relies on dynamic formula resolution:
- **Formula Pattern:** `=VLOOKUP(C10,Persiapan!$D$5:$K$679,8,FALSE)`
- **Behavior:** Looks up the item code/name in the respective detail sheet and extracts column 8 (Harga Satuan Pekerjaan D+E).
- **Pre-calculated Cache:** When read with `data_only=True` in openpyxl, Excel's pre-calculated cache provides the exact evaluated numbers (e.g. Row 10: `787397`, Row 11: `635526`, Row 12: `378239`, Row 13: `428906`, Row 14: `17431`).
- **Implication:** The importer must extract both the evaluated numeric prices AND trace component breakdowns from the source analysis sheets.

---
## 4. Hierarchy & Leaf AHSP Classification
In the DHSP and detail sheets, codes represent varying levels of the work breakdown structure (WBS):
- `1.` → Divisi: `PERSIAPAN LAPANGAN / SITE WORK` (No unit, no price)
- `1.1` → Subdivisi: `PEKERJAAN PERSIAPAN` (No unit, no price)
- `1.1.1` → Sub-subdivisi / Category: `Pembuatan Pagar Proyek` (No unit, no price)
- `1.1.1.1` → **Leaf AHSP**: `Pembuatan 1 m' pagar sementara dari kayu tinggi 2 meter` (Unit: `m'`, Price: `787397`)
- `1.1.1.2` → **Leaf AHSP**: `Pembuatan 1 m' pagar sementara dari seng gelombang rangka kayu tinggi 2 meter` (Unit: `m'`, Price: `635526`)

Classification rule: An entry is a **Leaf AHSP** if and only if it possesses a valid construction unit (`m'`, `m2`, `m3`, `buah`, `kg`, `OH`, `titik`, etc.) and a distinct component analysis.
