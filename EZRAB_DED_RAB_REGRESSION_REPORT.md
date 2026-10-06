# EZRAB DED → RAB ENGINE v1.0 — REGRESSION TEST REPORT

**Target Environment:** `http://localhost:3000`  
**Test Command:** `npm run test:ded-rab`  
**Test Suites:**
1. `src/test/dedRabRootCauseHotfix.test.ts` (20 Tests)
2. `src/test/dedRab24Fixtures.test.ts` (24 Fixtures)
3. `src/test/dedRab15RegressionCriteria.test.ts` (15 Criteria)
**Total Test Assertions:** 59  
**Total Passed:** 59  
**Total Failed:** 0  
**Date:** 2026-09-30  
**Status:** 100% PASSING  

---

## 1. Executive Summary

This report confirms the complete regression testing of the **EZRAB DED → RAB Engine v1.0**. All 15 core regression criteria mandated by the root-cause fix specification were subjected to automated unit and integration tests, alongside 20 root-cause regression tests and 24 construction fixtures.

The entire suite executes deterministically with zero mock overrides of business logic and zero floating-point arithmetic drift.

---

## 2. Summary Matrix: 15 Core Regression Criteria

| No | Regression Criterion | Test Description | Expected Behavior | Actual Result | Status |
|:---:|---|---|---|---|:---:|
| **1** | Missing Dimension Handling | DED item missing length/width/height | QTO returns `quantity: null`, `status: MISSING_DATA` (never 0) | `quantity === null`, `missingParameters: ['width', 'height']` | **PASS** |
| **2** | Missing Unit Price Handling | Item lacking database price | Price returns `unitPrice: 0`, `status: MISSING_PRICE` | `validation.status === 'MISSING_PRICE'`, `verified: false` | **PASS** |
| **3** | Rogue AHSP Rejection | Item with hallucinated AHSP code (`A.99.99.FAKE`) | Rejected by official DB validation gate | `isValid === false`, `errors` confirm not registered | **PASS** |
| **4** | Project Context Isolation | Overrides in Project A | Project B cannot view or apply Project A price | `projectPriceEngine.getProjectPrice(projB)` returns `undefined` | **PASS** |
| **5** | Deterministic Math Precision | Edge-case decimal evaluation ($0.1 + 0.2$, division by zero) | Eliminates float drift, handles zero division safely | `safeAdd(0.1, 0.2) === 0.3`, `safeDivide(1500, 0) === 0` | **PASS** |
| **6** | Room Label Filtering | Text: "Kamar Tidur Utama", "KM/WC" | Marked `ROOM_LABEL`, ineligible for RAB | `entityType === 'ROOM_LABEL'`, `isRabEligible: false` | **PASS** |
| **7** | Raw Reference Marks | Marks: "P1", "J1", "K1" without schedule | Marked `SYMBOL`/`REFERENCE`, needs review | `entityType === 'DOOR_REFERENCE'`, `isRabEligible: false` | **PASS** |
| **8** | Scheduled Reference Marks | Mark: "P1 - Daun Pintu Panel Kayu Jati" | Resolved to `CONSTRUCTION_WORK` | `entityType === 'CONSTRUCTION_WORK'`, `isRabEligible: true` | **PASS** |
| **9** | Specification Conflict | DED: "Bata Merah" vs AHSP: "Bata Ringan / Hebel" | Flagged as `SPECIFICATION_MISMATCH` | `validation.status === 'SPECIFICATION_MISMATCH'` | **PASS** |
| **10** | Engineering Unit Conflict | DED: $m^2$ vs AHSP: $m^3$ for foundation | Flagged as `UNIT_MISMATCH` | `validation.status === 'UNIT_MISMATCH'` | **PASS** |
| **11** | Multi-Candidate Ambiguity | Multiple valid PUPR AHSP candidates | Flagged as `AMBIGUOUS` with candidate list | `validation.status === 'AMBIGUOUS'` | **PASS** |
| **12** | Complete Item Verification | Valid AHSP + QTO + Price + Provenance | Achieves `status: READY`, `rabEligible: true` | `validation.isValid === true`, `confidence: HIGH` | **PASS** |
| **13** | Fail-Closed Commit Gate | Batch containing 1 READY and 1 invalid item | Only READY item committed to RAB | Official RAB count = 1, unready preserved in review | **PASS** |
| **14** | Complete Audit Trail | Provenance generation for verified item | Contains source file, page, evidence ID, AHSP code | `provenance` record completely populated | **PASS** |
| **15** | Zero AI Math Enforcement | Calculations verified with `SafeDecimalEngine` | Fixed-point multiplication and weighting | `safeMultiply(7.2, 950000) === 6840000`, Bobot = 10.00% | **PASS** |

---

## 3. Suite 2: 20 Root-Cause Regression Tests (`dedRabRootCauseHotfix.test.ts`)

| Test ID | Test Name | Assertion | Result |
|---|---|---|:---:|
| **TEST 01** | "Kamar Utama" $\rightarrow$ ROOM_LABEL $\rightarrow$ NOT RAB | `entityType === 'ROOM_LABEL'` | **PASS** |
| **TEST 02** | "Kamar Anak" $\rightarrow$ ROOM_LABEL $\rightarrow$ NOT RAB | `entityType === 'ROOM_LABEL'` | **PASS** |
| **TEST 03** | "KM/WC" $\rightarrow$ ROOM_LABEL $\rightarrow$ NOT RAB | `entityType === 'ROOM_LABEL'` | **PASS** |
| **TEST 04** | "Pondasi Batu Kali" $\rightarrow$ CONSTRUCTION_WORK | `entityType === 'CONSTRUCTION_WORK'` | **PASS** |
| **TEST 05** | "AI-CUSTOM-XXXX" $\rightarrow$ NOT OFFICIAL AHSP | `errors` contain `AI-CUSTOM` | **PASS** |
| **TEST 06** | AI hallucinated AHSP code $\rightarrow$ rejected | `errors` confirm not in database | **PASS** |
| **TEST 07** | AHSP valid + quantity missing $\rightarrow$ NOT READY | `status === 'MISSING_QUANTITY'` | **PASS** |
| **TEST 08** | AHSP valid + price missing $\rightarrow$ NO_PRICE $\rightarrow$ NOT READY | `status === 'MISSING_PRICE'` | **PASS** |
| **TEST 09** | AHSP valid + unit mismatch $\rightarrow$ UNIT_MISMATCH | `status === 'UNIT_MISMATCH'` | **PASS** |
| **TEST 10** | AHSP valid + spec mismatch $\rightarrow$ SPECIFICATION_MISMATCH | `status === 'SPECIFICATION_MISMATCH'` | **PASS** |
| **TEST 11** | Multiple candidates $\rightarrow$ MULTIPLE_CANDIDATES | `status === 'AMBIGUOUS'` | **PASS** |
| **TEST 12** | Valid AHSP + QTO + Price $\rightarrow$ READY | `status === 'READY'`, `rabEligible: true` | **PASS** |
| **TEST 13** | READY item $\rightarrow$ can apply to RAB | `convertToOfficialRabItems` converts 1 item | **PASS** |
| **TEST 14** | 67 invalid items $\rightarrow$ apply button = 0 valid | `convertToOfficialRabItems` converts 0 items | **PASS** |
| **TEST 15** | AI tries to create custom AHSP $\rightarrow$ rejected | `matchType === 'NOT_FOUND'`, `code === ''` | **PASS** |
| **TEST 16** | P1/P2 without legend $\rightarrow$ NEEDS_REVIEW | `isRabEligible: false` | **PASS** |
| **TEST 17** | P1 proven as column in schedule $\rightarrow$ CONSTRUCTION_WORK | `isRabEligible: true` | **PASS** |
| **TEST 18** | Dimension extraction: $10 \times 0.6 \times 0.8 \rightarrow 4.8\text{ m}^3$ | `quantity === 4.8`, `unit === 'm³'` | **PASS** |
| **TEST 19** | DED quantity preserved exactly (no arbitrary rounding) | `quantity === 12.3456` | **PASS** |
| **TEST 20** | Project AHSP version mismatch $\rightarrow$ rejected | `errors` flag obsolete version | **PASS** |

---

## 4. Suite 3: 24 Construction Fixtures (`dedRab24Fixtures.test.ts`)

- **FIXTURE 01:** Pondasi batu kali 1:4 ($\text{Vol} = 17.28\text{ m}^3$) — **PASS**
- **FIXTURE 02:** Footplat $100 \times 100 \times 30\text{ cm}$, 12 unit ($\text{Beton} = 3.6\text{ m}^3$, $\text{Bekisting} = 14.4\text{ m}^2$) — **PASS**
- **FIXTURE 03:** Sloof $15 \times 20\text{ cm}$, $\text{Pjg} = 48\text{ m}$ ($\text{Beton} = 1.44\text{ m}^3$, $\text{Bekisting} = 19.2\text{ m}^2$) — **PASS**
- **FIXTURE 04:** Kolom K1 $15 \times 30\text{ cm}$, 16 unit, $\text{Tinggi} = 3.5\text{ m}$ ($\text{Beton} = 2.52\text{ m}^3$) — **PASS**
- **FIXTURE 05:** Balok B1 $15 \times 30\text{ cm}$, $\text{Pjg} = 48\text{ m}$ ($\text{Beton} = 2.16\text{ m}^3$) — **PASS**
- **FIXTURE 06:** Plat lantai 2 tebal $12\text{ cm}$, $\text{Luas} = 64\text{ m}^2$ ($\text{Beton} = 7.68\text{ m}^3$) — **PASS**
- **FIXTURE 07:** Dinding bata merah 1:4 ($\text{Gross } 168\text{ m}^2 - \text{Bukaan } 7\text{ m}^2 = 161\text{ m}^2$) — **PASS**
- **FIXTURE 08:** Dinding hebel $t = 10\text{ cm}$ ($\text{Luas} = 120\text{ m}^2$) — **PASS**
- **FIXTURE 09:** Plesteran 1:4 tebal $15\text{ mm}$, 2 sisi ($2 \times 161 = 322\text{ m}^2$) — **PASS**
- **FIXTURE 10:** Acian semen, 2 sisi plesteran ($322\text{ m}^2$) — **PASS**
- **FIXTURE 11:** Keramik lantai $60 \times 60$ ($\text{Luas} = 45\text{ m}^2$) — **PASS**
- **FIXTURE 12:** Plafon gypsum $9\text{ mm}$ + rangka hollow ($\text{Luas} = 64\text{ m}^2$) — **PASS**
- **FIXTURE 13:** Cat dinding interior 3 lapis ($\text{Luas} = 322\text{ m}^2$) — **PASS**
- **FIXTURE 14:** Atap genteng keramik ($\text{Luas} = 100\text{ m}^2$) — **PASS**
- **FIXTURE 15:** Kloset duduk monoblok (2 unit) — **PASS**
- **FIXTURE 16:** Floor drain stainless (2 unit) — **PASS**
- **FIXTURE 17:** Titik lampu kabel NYM $3 \times 1.5$ (18 titik) — **PASS**
- **FIXTURE 18:** Pipa PVC AW 4 inch air kotor ($\text{Pjg} = 24\text{ m}$) — **PASS**
- **FIXTURE 19:** Galian tanah pondasi ($\text{Vol galian} > \text{Vol pondasi}$) — **PASS**
- **FIXTURE 20:** Urugan kembali tanah ($\text{Vol galian} - \text{Vol pondasi} = 30.72\text{ m}^3$) — **PASS**
- **FIXTURE 21:** AI-CUSTOM rejection $\rightarrow$ Ditolak keras — **PASS**
- **FIXTURE 22:** QTO missing parameter $\rightarrow$ `quantity: null`, BUKAN 0 — **PASS**
- **FIXTURE 23:** Price missing component $\rightarrow$ `unitPrice: null`, BUKAN 0 — **PASS**
- **FIXTURE 24:** WBS hierarchy (3 level) $\rightarrow$ Category $\rightarrow$ Work Package $\rightarrow$ Item — **PASS**

---

## 5. Global Regression Test Command

```bash
npm run test:ded-rab
```
Output:
```
TOTAL TESTS: 20 | PASSED: 20 | FAILED: 0
TOTAL FIXTURES: 24 | PASSED: 24 | FAILED: 0
TOTAL CRITERIA TESTED: 15 | PASSED: 15 | FAILED: 0
GRAND TOTAL: 59 PASSED | 0 FAILED
```
