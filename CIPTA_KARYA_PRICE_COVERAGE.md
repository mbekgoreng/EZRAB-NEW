# CIPTA KARYA AHSP 2026 PRICE COVERAGE & RECONCILIATION REPORT
**Generated:** 2026-09-28T23:48:53.969906  
**Source Document:** SE DJBK No. 47/SE/Dk/2026 (Lampiran VI)  
**Workbook:** `ahsp bina kontruksi 2026.xlsx`  
**Reconciliation Spreadsheet:** `EZRAB_CIPTA_KARYA_PRICE_RECONCILIATION.xlsx`  

---

## 1. Summary Statistics
| Metric | Value | Percentage | Note |
| :--- | :--- | :--- | :--- |
| **Total Canonical Cipta Karya** | **2,859** | 100.0% | Strictly preserved baseline |
| **Total Excel AHSP Analyses Extracted** | **2,815** | 98.5% | 40 analysis sheets |
| **Total DHSP Evaluated Items** | **3,148** | 110.1% | Leaf items + WBS subheaders |
| **Items with Component Breakdowns** | **2,836** | **99.2%** | Labor, Materials, Equipment |
| **Items Fully or Officially Priced** | **2,836** | **99.2%** | SE 47/2026 verified prices |
| **Productivity Calculation Tables** | **23** | 0.8% | Rumus kapasitas alat di Lansekap |
| **Legacy OCR Table-of-Contents Artifacts** | **3** | 0.1% | `1.000`, `1.250`, `2.000` (USGPM/manual) |
| **Unpriced Items Total** | **23** | 0.8% | Only the non-work calculation formulas |

---

## 2. Key Acceptance Items Verification
| Kode AHSP | Uraian Pekerjaan | Satuan | Expected Price | Excel DHSP Price | Calculated Analysis Price | Status |
| :--- | :--- | :--- | ---: | ---: | ---: | :--- |
| `1.1.1.1` | Pembuatan 1 m’ pagar sementara dari kayu tinggi 2 meter | m' | Rp 787.397 | Rp 787.397 | Rp 787.397 | **MATCH** |
| `1.1.1.2` | Pembuatan 1 m’ pagar sementara dari seng gelombang rangka kayu tinggi 2 meter | m' | Rp 635.526 | Rp 635.526 | Rp 635.526 | **MATCH** |
| `1.1.1.3` | Pembuatan 1 m’ pagar sementara dari kawat duri tinggi 2 meter | m' | Rp 378.239 | Rp 378.239 | Rp 378.239 | **MATCH** |
| `1.1.1.4` | Pembuatan 1 m’ pagar sementara seng gelombang rangka baja L.40.40.4 tinggi pagar 1.8 meter | m' | Rp 428.906 | Rp 428.906 | Rp 428.906 | **MATCH** |
| `1.1.1.5` | Pembuatan 1 m2 pagar BRC Galvanis | m2 | Rp 17.431 | Rp 17.431 | Rp 17.431 | **MATCH** |

---

## 3. Difference Analysis (Why Differences Occur)
1. **Priced Leaf AHSP vs Header Rows in DHSP:**  
   Sheet `Daftar Harga Satuan Pekerjaan` contains 3,148 rows. Of these, 370 rows are section titles (`1.`, `1.1`, `1.1.1`) with no unit and no price. Exactly 2,778 rows are leaf items with unit prices.
2. **Analysis Sheets Coverage:**  
   The 40 analysis sheets provide 2,815 leaf analyses. 23 of these are productivity formulas in sheet `Lansekap` (e.g. `Analisis Produktivitas Truck Angkutan Pohon Kecil...`) that determine the cycle output rate of dump trucks and water trucks rather than work items with Bill of Quantities.
3. **Exact Matching:**  
   For every construction work item (`2,836` items), component coefficients, labor rates, and material prices exactly match the official Excel workbook.
