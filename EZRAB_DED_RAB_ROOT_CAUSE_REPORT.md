# EZRAB — DED → RAB AI PIPELINE ROOT-CAUSE FIX v2.0 AUDIT REPORT

> **Status:** AUDIT & REMEDIATION COMPLETE  
> **Standard:** Permen PUPR & SE DJBK No. 47/SE/Dk/2026 (AHSP 2026 Canonical)  
> **Regression Test Suite:** 20/20 Tests Passing (`npm run test:ded-rab`)  
> **AHSP Dataset Suite:** 20/20 Tests Passing (`npm run ahsp:test`)  
> **Core Calculator Engine:** 74/74 Tests Passing (`npm test`)  

---

## 1. Executive Summary & Root Cause Analysis

### 1.1 The Critical Incident
The DED → RAB AI pipeline exhibited severe systematic failures:
- Non-work drawing elements such as room names (**"Kamar Utama"**, **"Kamar Anak"**, **"KM/WC"**) and drawing identifiers (**"P1"**, **"P2"**) were ingested directly as construction work items.
- Items were assigned synthetic/hallucinated AHSP codes such as `AI-CUSTOM-MUN26QW` and hallucinated prices (e.g., Rp 85.000, Rp 4.689.300).
- Quantities remained uncalculated (`Qty = null`, `QTO = 0`), creating 67 items with `Missing`, 12 with `No Price`, and 36 with `AI Custom`.
- The user interface still provided an unconstrained **"Terapkan ke RAB (67)"** action, allowing invalid and hallucinated items to contaminate the official project RAB.

### 1.2 Core Root Causes
1. **Absence of Semantic Pre-Classification Layer**: Raw OCR/Vision extractions were fed directly to the AHSP matcher without verifying whether the extracted string represented measurable physical construction work (`CONSTRUCTION_WORK`) or spatial/annotation metadata (`ROOM_LABEL`, `NOTE`, `TITLE`, `GRID`).
2. **Permissive Fallback & AI-CUSTOM Fabrication**: When an item lacked an exact match in the database, legacy code triggered synthetic fallback generators that created arbitrary `AI-CUSTOM-*` codes and plausible-sounding unit prices instead of returning `NEEDS_REVIEW` or `MISSING_AHSP`.
3. **Decoupled QTO & Zero Quantity Acceptance**: The pipeline allowed items with zero or missing quantities to advance without raising a blocking validation status (`MISSING_QUANTITY`).
4. **Fail-Open Bulk Apply**: The bulk apply endpoint and UI button lacked strict gate validation, counting and submitting all extracted items rather than strictly filtering for validated `READY` items.

---

## 2. Audited Files

| File | Subsystem | Audit Status | Key Changes Made |
| :--- | :--- | :--- | :--- |
| `src/ded-rab-v2/semantic/semanticClassifier.ts` | Semantic Ingestion | **CREATED** | 14-entity classification layer rejecting non-construction text |
| `src/ded-rab-v2/validation/dedRabValidationGate.ts` | Validation Gate | **CREATED** | 12-gate fail-closed eligibility verification engine |
| `src/ded-rab-v2/types.ts` | Type System | **UPDATED** | Granular `ValidationStatus`, `DedFact`, `AhspProvenance`, `AMBIGUOUS` |
| `src/ded-rab-v2/ahsp/ahspMatcher.ts` | AHSP Retrieval | **REFACTORED** | Strict official catalog matching; synthetic `AI_CUSTOM` banned |
| `src/ded-rab-v2/ahsp/ahspPriceResolver.ts` | Pricing Engine | **REFACTORED** | Eliminates hallucinated price defaults; enforces database resolution |
| `src/ded-rab-v2/interpretation/dedInterpreter.ts` | Interpretation | **REFACTORED** | Semantic classification integration; extracts room as context only |
| `src/ded-rab-v2/pipeline/dedRabPipeline.ts` | Orchestration | **REFACTORED** | End-to-end fail-closed pipeline with 12 validation gates |
| `src/ded-rab-v2/review/dedRabReviewService.ts` | Review & Persistence | **REFACTORED** | Server-side gate re-evaluation preventing invalid item injection |
| `src/components/document/DedRabWorkflowView.tsx` | User Interface | **REFACTORED** | Honest status tabs, disabled apply button for 0 ready items |
| `src/test/dedRabRootCauseHotfix.test.ts` | Regression Suite | **CREATED** | 20 golden regression tests covering all failure modes |

---

## 3. Old Pipeline vs. New Pipeline

### Old Pipeline (Vulnerable & Permissive)
```
DED PDF/Image
     │
     ▼
OCR / Vision Text Extraction
     │
     ▼
Direct RabItem Creation  ◄── [BUG: "Kamar Utama", "P1" turned into RAB items]
     │
     ▼
LLM Semantic Matcher
     │
     ├─► [Match Found] ──► Assign AHSP
     └─► [No Match]    ──► FABRICATE "AI-CUSTOM-XXXX" + Guess Price (Rp 85.000)
     │
     ▼
UI Displays All Items (Missing, AI Custom, No Price)
     │
     ▼
"Terapkan ke RAB (67)" Button Enabled  ◄── [BUG: Contaminates Official RAB]
```

### New Pipeline (Deterministic & Fail-Closed)
```
DED PDF/Image
     │
     ▼
OCR / Vision Fact Extraction (DED_FACT)
     │
     ▼
SEMANTIC CLASSIFICATION LAYER (semanticClassifier.ts)
     │
     ├─► ROOM_LABEL ("Kamar Utama") ────► Store as spatial context; REJECT from RAB
     ├─► TITLE / NOTE / GRID / SYMBOL ──► REJECT from RAB
     ├─► STRUCTURAL_LABEL ("P1", "K1") ──► Requires legend/schedule; if ambiguous -> NEEDS_REVIEW
     └─► CONSTRUCTION_WORK ─────────────► Proceed to Work Item Processing
                                                │
                                                ▼
                                    SPECIFICATION & UNIT EXTRACTION
                                                │
                                                ▼
                                    DETERMINISTIC QTO ENGINE (ezrabCoreQto)
                                                │
                                                ▼
                                    OFFICIAL AHSP RETRIEVAL (ahspMatcher.ts)
                                    (NO AI-CUSTOM ALLOWED; Fail to NO_MATCH / AMBIGUOUS)
                                                │
                                                ▼
                                    PRICE RESOLUTION (ahspPriceResolver.ts)
                                    (Database/Project Price Engine; NO GUESSED PRICES)
                                                │
                                                ▼
                                    12-GATE VALIDATION ENGINE (dedRabValidationGate.ts)
                                                │
                                                ├─► Failed Gate ──► Flag specific status:
                                                │                   - MISSING_QUANTITY
                                                │                   - MISSING_PRICE
                                                │                   - MISSING_AHSP
                                                │                   - UNIT_MISMATCH
                                                │                   - SPECIFICATION_MISMATCH
                                                │                   - AMBIGUOUS
                                                │                   - NEEDS_REVIEW
                                                │                   - INVALID
                                                └─► Passed All 12 Gates ──► STATUS: READY (rabEligible: true)
                                                                                  │
                                                                                  ▼
                                                                     UI "Terapkan ke RAB (N Valid)"
                                                                     (Disabled if N = 0)
                                                                                  │
                                                                                  ▼
                                                                     SERVER RE-VALIDATION GATE
                                                                     (Fail-closed filter on apply)
```

---

## 4. Detailed Root Cause Investigations

### 4.1 Why Room Labels Became RAB Items
* **Mechanism:** The OCR and document AI parser treated every text block with geometric bounding boxes as a potential bill-of-quantities line item. Because labels like *"Kamar Utama"* or *"KM/WC"* were prominent and clear in architectural floor plans, they were parsed into `DedWorkItem` objects.
* **Resolution:** Implemented `semanticClassifier.classify()`. Room names match regex `ROOM_LABEL` rules (`kamar utama`, `kamar mandi`, `km/wc`, `dapur`, `ruang tidur`, etc.) and are flagged with `isRabEligible: false`. When a room label is detected near a construction work item (e.g. wall or floor tile), the room name is preserved strictly as `roomContext` metadata (e.g. `item.roomContext = "Kamar Utama"`), not as an independent work item.

### 4.2 Why AI-CUSTOM Appeared
* **Mechanism:** In `ahspMatcher.ts`, when semantic similarity between a work description and standard AHSP items was below threshold, a fallback generator created a synthetic AHSP object prefixed with `AI-CUSTOM-` and gave it a mock unit price.
* **Resolution:** Completely prohibited AI code synthesis. `ahspMatcher` and `dedRabValidationGate` now reject any code starting with `AI-CUSTOM` or tagged as `AI_CUSTOM`. If no official AHSP code exists in `ALL_OFFICIAL_AHSP_ITEMS` or `indonesianAHSP`, the item status is strictly set to `MISSING_AHSP` or `NEEDS_REVIEW`. Only explicit user-created custom items via the UI (`isUserCustomItem: true`) are allowed.

### 4.3 Why Guessed Prices Appeared
* **Mechanism:** Price resolvers had default fallbacks or accepted AI-suggested unit prices to make the spreadsheet preview look populated.
* **Resolution:** `ahspPriceResolver.ts` enforces that prices must be resolved deterministically from project unit prices or the official 2026 AHSP dataset. If a price cannot be resolved from the database, `unitPrice` remains `0` or `null`, `priceStatus` is set to `NOT_FOUND`, and the gate sets `MISSING_PRICE`.

### 4.4 Why QTO = 0 (Uncalculated Volume)
* **Mechanism:** The previous parser extracted text but did not execute geometric formula binding or link dimensions to calculator packs. The volume calculator was bypassed, leaving `quantity = null` or `quantity = 0`.
* **Resolution:** Connected `ezrabCoreQto.ts` and `coreCalculatorEngine`. DED dimensions (length, width, height, thick, count) are fed into verified formula calculators (e.g., $10 \times 0.6 \times 0.8 = 4.8\text{ m}^3$). Items without calculable dimensions retain `quantity: null` and receive validation status `MISSING_QUANTITY`.

### 4.5 Why AHSP Matching Failed & Specification Conflicts Occurred
* **Mechanism:** Pure vector/fuzzy string search frequently paired incompatible materials, such as mapping "Dinding Bata Merah" to "Bata Ringan (AAC)" or structural concrete to lean concrete.
* **Resolution:** Introduced Gate 4 & 5 (`checkSpecificationCompatibility`) and Gate 6 (`checkUnitCompatibility`). Brick walls must match brick types; concrete grades must match within tolerance; units must match canonical dimensions ($\text{m}^3$ to $\text{m}^3$, $\text{m}^2$ to $\text{m}^2$). Multiple equally valid candidates are preserved in `candidateAhspList` with status `AMBIGUOUS`.

---

## 5. Verification & Test Matrix

All 20 Regression Tests defined in the specification have been implemented in `src/test/dedRabRootCauseHotfix.test.ts` and execute cleanly:

```
======================================================================
EZRAB DED -> RAB PIPELINE ROOT-CAUSE FIX v2.0 — 20 REGRESSION TESTS
======================================================================
  [PASS] TEST 01: "Kamar Utama" -> ROOM_LABEL -> NOT RAB
  [PASS] TEST 02: "Kamar Anak" -> ROOM_LABEL -> NOT RAB
  [PASS] TEST 03: "KM/WC" -> ROOM_LABEL -> NOT RAB
  [PASS] TEST 04: "Pondasi Batu Kali" -> CONSTRUCTION_WORK -> AHSP candidate
  [PASS] TEST 05: "AI-CUSTOM-XXXX" -> NOT OFFICIAL AHSP
  [PASS] TEST 06: AI hallucinated AHSP code -> rejected
  [PASS] TEST 07: AHSP valid + quantity missing -> NOT READY
  [PASS] TEST 08: AHSP valid + price missing -> NO_PRICE -> NOT READY
  [PASS] TEST 09: AHSP valid + unit mismatch -> UNIT_MISMATCH
  [PASS] TEST 10: AHSP valid + specification mismatch -> SPECIFICATION_MISMATCH
  [PASS] TEST 11: Multiple candidates -> MULTIPLE_CANDIDATES
  [PASS] TEST 12: Valid AHSP + valid quantity + valid components + valid price -> READY
  [PASS] TEST 13: READY item -> can apply to RAB
  [PASS] TEST 14: 67 invalid items -> apply button = 0 valid
  [PASS] TEST 15: AI tries to create custom AHSP -> rejected
  [PASS] TEST 16: P1/P2 without legend/context -> NEEDS_REVIEW
  [PASS] TEST 17: P1 proven as column through drawing context -> CONSTRUCTION_WORK candidate
  [PASS] TEST 18: Dimension extraction: 10 x 0.6 x 0.8 -> 4.8 m3
  [PASS] TEST 19: DED quantity preserved exactly -> no arbitrary rounding
  [PASS] TEST 20: Project AHSP version mismatch -> rejected
----------------------------------------------------------------------
TOTAL TESTS: 20 | PASSED: 20 | FAILED: 0
======================================================================
```

---

## 6. Before / After Comparison

| Scenario | Before Hotfix (v1.x) | After Hotfix (v2.0) |
| :--- | :--- | :--- |
| **Room Text ("Kamar Utama")** | Added as RAB item with AI-CUSTOM code and Rp 85.000 price | Classified as `ROOM_LABEL`, `isRabEligible = false`, excluded from RAB |
| **Door/Structural Tag ("P1")** | Added as raw item or arbitrary AHSP | Flagged as `NEEDS_REVIEW` until proven by legend/schedule context |
| **No AHSP in Database** | Synthesizes `AI-CUSTOM-XXXX` | Flagged as `MISSING_AHSP` or `NEEDS_REVIEW` |
| **Missing Dimensions** | Quantity defaulted to 1 or 0, still allowed in RAB | Flagged as `MISSING_QUANTITY`, ineligible for RAB (`READY = false`) |
| **Missing Price** | Default fake price inserted | Status set to `MISSING_PRICE`, `READY = false` |
| **Material Mismatch** | Bata Merah matched to Hebel/AAC | Blocked by Gate 4: `SPECIFICATION_MISMATCH` |
| **Bulk Apply Action** | *"Terapkan ke RAB (67)"* adds 67 invalid items | *"Terapkan ke RAB (0 Item Valid)"* disabled with explanatory tooltip |
| **Server Security** | Trusted client payload on apply | Server re-evaluates all 12 gates; rejects any unverified item |

---

## 7. Acceptance Criteria Verification

- [x] **A. Room labels do not become RAB items**: Verified by Tests 01, 02, 03.
- [x] **B. AI-CUSTOM is never considered official AHSP**: Verified by Tests 05, 15.
- [x] **C. AI cannot create official prices**: Verified by Tests 08, 12.
- [x] **D. QTO originates from deterministic calculation**: Verified by Tests 18, 19.
- [x] **E. Empty quantity cannot achieve READY**: Verified by Test 07.
- [x] **F. Empty price cannot achieve READY**: Verified by Test 08.
- [x] **G. AHSP mismatch cannot achieve READY**: Verified by Tests 09, 10, 11.
- [x] **H. Version mismatch rejected**: Verified by Test 20.
- [x] **I. Bulk Apply strictly restricted to READY items**: Verified by Tests 13, 14.
- [x] **J. Server re-validates items on apply**: Enforced in `dedRabReviewService.ts`.
- [x] **K. No legacy fallback bypasses resolver**: Audited and confirmed across pipeline.
- [x] **L. AHSP components verified from official database**: Verified against 2026 AHSP dataset.
- [x] **M. All items require visual/source trace**: Enforced by Gate 9 in `dedRabValidationGate.ts`.
- [x] **N. No Match produces NEEDS_REVIEW, never AI-CUSTOM**: Verified by Tests 05, 06, 16.

---

## 8. Remaining Limitations & Operating Guidance
1. **Low-Resolution / Scanned Drawings**: When drawing resolution is insufficient to read numerical dimensions, the system deliberately refrains from guessing and leaves items as `MISSING_QUANTITY` with a request for user input in the review drawer.
2. **Ambiguous Schedule Legends**: Structural tags like $P1$, $K1$, $S1$ without an accompanying structural schedule table in the uploaded PDF will remain in `NEEDS_REVIEW` until the user links or uploads the structural schedule sheet.
