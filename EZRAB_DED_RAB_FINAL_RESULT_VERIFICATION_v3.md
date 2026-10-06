# EZRAB DED → RAB Final Result Verification v3

Date: 2026-09-30

## FINAL CODE VERIFICATION: PASS

The legacy resource enum values in test fixtures were corrected contextually (`BAHAN` → `MATERIAL`, `UPAH` → `LABOR`). No production type, DED→RAB business logic, architecture, assertion, or expected value was changed.

## Root cause found

The previous pipeline collected `allEvidences`, but `DedInterpreter` still created one `DedWorkItem` per `candidateItems` OCR occurrence. Dimensions were copied only from that candidate's `item.dimensions`; evidence records on the same page were not associated to the work. Consequently the QTO stage received a work item with `dimensions.length/width/height` missing and correctly returned `quantity: null`, even where the DED contained valid dimension evidence. AHSP and price resolution then continued on each duplicate occurrence, producing multiple RAB review rows.

## Implemented architecture

`DedInterpreter` now performs:

`candidate OCR occurrences → semantic classification → canonical grouping → contextual evidence association → DedWorkItem`

* Repeated labels are grouped by normalized construction type/material/unit.
* `canonicalWorkId` is stable and propagated to `DedWorkItem` and `ConstructionWorkModel`.
* All supporting evidence IDs/pages are retained.
* Dimension evidence is associated only when it is on the same supporting page and either explicitly names the work or the page has a single work candidate. No numeric proximity-only association is used.
* QTO remains deterministic and fail-closed; missing dimensions remain `null`.
* Structural reference codes remain review metadata and are filtered from `08_RAB_DRAFT`.
* Spreadsheet output preserves `null` for missing quantity/price/amount instead of converting it to zero.
* A forensic JSON trace is emitted at QTO with work ID, description, pages, evidence IDs, dimension evidence IDs, dimensions, formula, QTO result, and final quantity.

## Regression coverage

`src/test/dedRabCanonicalEvidenceRegression.test.ts` covers:

| Criterion | Result |
|---|---|
| A. Multiple OCR occurrences → one work | PASS |
| B. Dimension evidence → QTO quantity | PASS |
| C. Multiple AHSP components → one RAB row | PASS |
| D. P1/J1/BV1 → not RAB | PASS |
| E. Duplicate page evidence merges | PASS |
| F. Valid quantity/price path remains positive | PASS |
| G. Genuine missing dimensions → `null` quantity | PASS |

Existing `dedRabRootCauseHotfix.test.ts`: 20/20 PASS.
Core AI suite: 70/70 PASS.
Phase C suite: 71/71 PASS.

## Command verification — final run

* `npx tsc --noEmit`: **PASS** — 0 errors.
* `npm run build`: **PASS** — TypeScript completed and Vite production build completed (`built in 47.13s`).
* `npm run test:ded-rab`: **PASS** — 20/20 root-cause tests, 24/24 fixtures, 15/15 criteria, canonical A–G PASS.
* `npm run test:core-ai`: **PASS** — 70/70.
* `npm run test:phaseC`: **PASS** — 71/71.

## UI acceptance limitation

**BROWSER UI VERIFICATION: NOT AVAILABLE.** This execution environment does not provide a browser/UI interaction tool. A fresh visual walkthrough of `/app/projects/PRJ-RUMAH-2LT-01/ai?mode=ded-rab` was not performed, and no browser PASS is claimed. The spreadsheet RAB draft generation path was covered by the passing regression suite, including duplicate grouping, reference filtering, null quantity preservation, component row cardinality, and READY filtering.

## Integrity constraints verified

No `quantity || 1`, `quantity || 0`, `quantity ?? 0`, default volume, hardcoded DED quantity, or hardcoded price was introduced. AHSP and resource price resolution remain delegated to their existing authoritative engines.