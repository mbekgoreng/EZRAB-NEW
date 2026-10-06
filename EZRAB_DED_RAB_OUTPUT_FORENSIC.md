# EZRAB DED → RAB OUTPUT FORENSIC REPORT
**Document Source**: `qa-fixtures/pdf-gambar-rumah-1-lantai_compress.pdf` (32 Pages, 3.01 MB)  
**Date**: October 2, 2026  
**Status**: PRE-REBUILD FORENSIC AUDIT (BEFORE IMPLEMENTATION)

---

## 1. Executive Summary

A forensic audit was conducted on the current `EZRAB DED → RAB` output generation pipeline to determine why only 3 items (typically Pondasi, Kolom, and Dinding) were surfaced in the final output, and why critical construction items either vanished or collapsed into `MISSING_DATA`.

### Core Findings
1. **The DED Document contains 32 dense engineering sheets covering Architectural, Structural, and MEP disciplines**, but the legacy pipeline prematurely filtered, dropped, or failed to cross-correlate 85%+ of the actionable scope.
2. **Artificial Triage & Filtering**: The pipeline previously discarded sheets or only inspected single pages in isolation without a unified Document Memory.
3. **Premature `MISSING_DATA` Flagging**: When a detail page (e.g. Page 19 - Detail Pondasi) displayed cross-section dimensions (0.60 m × 0.80 m) without repeat-stating total linear length (present on Page 2 & 18 - Denah Pondasi: 48.0 m), the QTO engine instantly failed closed with `MISSING_DATA` rather than performing Cross-Page Knowledge Retrieval.
4. **Classification & Aggregation Collapse**: Real work items (e.g. Kusen Aluminium Pintu/Jendela, Keramik 40×40, Rangka Plafond Gypsum, Kuda-kuda Baja Ringan, Kloset Duduk, Instalasi Pipa PVC, Titik Lampu) were misclassified as raw materials, symbols, or unhandled annotations, causing `dedInterpreter` to skip them.
5. **No AI Document Memory**: Each page scan was ephemeral. Observations on Page 10 (Schedule Kusen) were forgotten when inspecting Page 2 (Denah), preventing the system from resolving door/window counts and wall opening deductions.

---

## 2. DED Document Reality vs Pipeline Output

| Discipline | Pages in Real DED (`pdf-gambar-rumah-1-lantai_compress.pdf`) | Actual Engineering Content | Legacy Pipeline Outcome | Root Cause of Loss |
|---|---|---|---|---|
| **Architectural Plans** | Page 1, 2, 9, 12, 13, 14 | Denah Rumah 1:50, Denah Kusen, Denah Keramik, Denah Plafond, Denah Atap | Only Denah walls extracted | Disconnected from schedules; room labels ignored; finishes skipped |
| **Elevations & Sections** | Page 3, 4, 5, 6, 7, 8 | Tampak Depan/Belakang/Samping, Potongan A-A & B-B (Elevasi +0.00, +3.20, +4.00, +5.90) | Heights not passed to structural items | Height dimensions on sections not linked to plan items |
| **Architectural Details** | Page 10, 11, 15, 16 | Detail Pintu P1/P2, Detail Jendela J1, Detail Atap & Plafond Gypsum, Detail KM/WC | **DROPPED** | Classified as `MATERIAL` or `SYMBOL` without schedule link |
| **Structural Plans** | Page 17, 18, 20, 22, 24, 25 | Denah Pondasi, Denah Sloof, Denah Kolom, Denah Balok/Ringbalk, Pembesian | Partially extracted (Pondasi, Kolom) | Sloof & Ringbalk failed cross-reference |
| **Structural Details** | Page 19, 21, 23, 26 | Detail Pondasi Batu Kali, Cor Lantai Kerja t=50mm, Pasir Urug t=50mm, Aanstamping, Detail Sloof 15/20, Detail Kolom K1 15/15 | Pondasi partially matched; Sub-base works omitted | Pipeline rules forbade adding Galian/Pasir Urug unless explicitly on sheet |
| **MEP Plans & Details** | Page 27, 28, 29, 30, 31, 32 | Air Bersih, Air Kotor, Septic Tank & Resapan, Titik Lampu, Stop Kontak, Saklar | **DROPPED 100%** | Classified as `NOTE` or dropped by triage |

---

## 3. Detailed Forensic Tracing: Where Information is Lost

### Stage 1: Page Ingestion & Vision Reading
- **Issue**: In `dedVisionReader.ts`, the system prompt strictly mandated:
  > *"Do NOT invent work items (e.g. if the drawing only specifies 'Pondasi Batu Kali', do NOT automatically add Galian Tanah, Urugan Pasir, Bekisting, or Plesteran)... If length/height is missing, mark as null and status as MISSING_DATA."*
- **Consequence**: The vision model was discouraged from building the physical construction sequence. If a detail sheet only had dimensions $0.6 \times 0.8$, it wrote `length: null` and `status: MISSING_DATA` without waiting for the plan view.

### Stage 2: Lack of Document Memory
- **Issue**: `dedAnalysisService.ts` processed pages independently and stored only flat `RawPageAnalysisPass2[]`.
- **Consequence**: There was no unified blackboard/memory structure where:
  - Total building perimeter and grid lengths (from Denah, Page 2/18)
  - Wall heights and ceiling heights (from Potongan, Page 7/8/15)
  - Door & Window counts (from Denah Kusen Page 9 and Detail Page 10/11)
  could be queried by any work item.

### Stage 3: Semantic Classifier & Normalizer Drop Filter
- **Issue**: In `dedInterpreter.ts` (lines 163–175):
  ```ts
  if (
    entityType === 'TITLE_HEADER' ||
    entityType === 'NOTE' ||
    entityType === 'DRAWING_ANNOTATION' ||
    entityType === 'LEGEND' ||
    entityType === 'GRID_AXIS' ||
    entityType === 'DIMENSION' ||
    entityType === 'ELEVATION' ||
    entityType === 'UNKNOWN'
  ) {
    continue; // SILENTLY DROPPED!
  }
  ```
- Items with text like `"Kusen Aluminium 4\""`, `"Atap Metal Spandek"`, `"Kuda - Kuda Baja Ringan"`, `"Plafond Gypsum Board T = 9 mm + Rangka Hollow"`, `"Keramik 40x40"`, `"Kloset Duduk"`, `"Pipa PVC AW"`, `"Titik Lampu"` frequently received `UNKNOWN` or `DRAWING_ANNOTATION` classifications from the generic classifier, resulting in them being completely dropped from the work items inventory.

### Stage 4: Over-Aggressive Key Grouping (`groupRawWorkOccurrences`)
- **Issue**: In `dedInterpreter.ts` (lines 509–515):
  ```ts
  const key = `${normalized.constructionType}|${normalized.material}|${normalized.standardUnit}`;
  const existing = groups.get(key);
  if (existing) {
    // Merged and overwritten!
  }
  ```
- Many items mapped to the default `constructionType` or empty category, causing multiple distinct works to be merged into a single item or wiped out.

### Stage 5: Deterministic QTO Disconnected from Search
- **Issue**: `ezrabCoreQto.ts` expected `dimensions.length`, `dimensions.width`, `dimensions.height` to already be populated on the object.
- **Consequence**: If `dimensions.length` was missing from the immediate page, `ezrabCoreQto` returned `status: 'MISSING_DATA'`. The item was never re-investigated against the document memory, remaining `MISSING_DATA` permanently.

---

## 4. Rebuild Architectural Plan (The "AI-First Output Engine")

To satisfy all user directives without modifying the UI:
1. **Document Memory (`DedDocumentMemory`)**:
   - Persistent store maintaining all 32 pages of observations, grids, spatial rooms, structural lines, schedules, and cross-references.
2. **Full DED Work Inventory Discovery**:
   - Discovers ALL construction disciplines:
     - Pekerjaan Persiapan & Galian (Galian, Urugan Kembali, Pasir Urug t=5cm)
     - Pekerjaan Pondasi (Pondasi Batu Kali, Aanstamping, Cor Lantai Kerja)
     - Pekerjaan Struktur Beton Bertulang (Sloof 15/20, Kolom Praktis 15/15, Ringbalk 15/20)
     - Pekerjaan Dinding & Finishes (Dinding Bata Merah/Hebel, Plesteran 1:4 2 Sisi, Acian Semen PC)
     - Pekerjaan Kusen, Pintu & Jendela (Pintu P1, Pintu P2, Jendela J1 Aluminium + Kaca)
     - Pekerjaan Lantai & Dinding Basah (Keramik Lantai 40×40, Keramik WC 25×25, Keramik Dinding WC 25×60)
     - Pekerjaan Plafond (Plafond Gypsum 9 mm + Rangka Hollow)
     - Pekerjaan Atap (Kuda-kuda Baja Ringan, Reng, Atap Metal Spandek, Nok Spandek)
     - Pekerjaan Sanitasi & Plumbing (Kloset Duduk, Pipa Air Bersih, Pipa Air Kotor PVC AW)
     - Pekerjaan Elektrikal (Titik Lampu, Stop Kontak, Saklar)
3. **Cross-Page Quantity Resolution & QTO Arithmetic**:
   - AI determines the formula and retrieves input dimensions across pages (e.g., length from Denah Page 2/18 $\times$ section from Detail Page 19/21).
   - QTO calculates deterministically with SafeDecimal arithmetic.
   - Exact quantity states: `FOUND_DIRECT`, `CALCULATED_QTO`, `CALCULATED_FROM_OTHER_PAGE`, `CALCULATED_WITH_DEDUCTION`, `PARTIAL`, `UNRESOLVED`.
4. **Authoritative PUPR 2026 AHSP Matcher**:
   - Uses the official 5,768 item repository.
   - Strict semantic and unit compatibility.
5. **SafeDecimal Price Engine**:
   - Central price resolution hierarchy.
6. **AI Self-Review Audit**:
   - 20-point completeness and integrity verification.
