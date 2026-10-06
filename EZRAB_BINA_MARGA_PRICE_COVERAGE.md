# EZRAB BINA MARGA 2026 — PRICE COVERAGE REPORT

**Date:** 2026-09-28T22:09:40.187Z  
**Source Document:** SE Direktur Jenderal Bina Konstruksi No. 47/SE/Dk/2026 Lampiran V  
**Workbook:** `AHSP 2026 Bina Marga.xlsx`  
**Total Canonical Bina Marga AHSP:** 1.163  
**DHSP Items in Excel:** 1.137  

---

## 1. Executive Summary & AHSP Price Status

| Metric | Count | Percentage | Description |
| --- | ---: | ---: | --- |
| **AHSP FULL** | 988 | 85.0% | All components fully priced or official DHSP price resolved |
| **AHSP PARTIAL** | 127 | 10.9% | Some components priced |
| **AHSP MISSING** | 48 | 4.1% | Informative / lump-sum / no price in official source (**NO Rp0**) |
| **TOTAL CANONICAL** | 1.163 | 100.0% | Complete catalog |

---

## 2. Resource Master Coverage (`Upah Bahan`)

| Resource Category | Source Sheet | Total Priced Records | Unit Range | Location |
| --- | --- | ---: | --- | --- |
| Labor (`Tenaga Kerja`) | `Upah Bahan` (R10–R44) | 35 | Jam, OH | NATIONAL (SE 47/2026) |
| Materials (`Bahan`) | `Upah Bahan` (R46–R1041) | 997 | M3, Kg, Liter, Buah | NATIONAL (SE 47/2026) |
| Equipment (`Alat`) | `Upah Bahan` (R1043–R1348) | 306 | Jam, Sewa | NATIONAL (SE 47/2026) |
| **TOTAL RESOURCE MASTER** | | **1.338** | | |

---

## 3. Component Level Coverage

| Component Type | Total Components | Resolved | Coverage Rate |
| --- | ---: | ---: | ---: |
| Labor Components | 2.796 | 2.739 | 98.0% |
| Material Components | 3.542 | 3.470 | 98.0% |
| Equipment Components | 3.475 | 3.445 | 99.1% |
| **TOTAL ALL COMPONENTS** | **9.813** | **9.654** | **98.4%** |

---

## 4. Integrity Compliance

1. **Zero Rp0 Policy:** Strictly enforced. Items without price return `price = null` with status `MISSING`.
2. **Zero Fabrication:** No synthetic coefficients, fallback constants, or artificial price multipliers.
3. **Single Source of Truth:** `priceResolver2026` resolves both AHSP unit prices and component breakdowns.