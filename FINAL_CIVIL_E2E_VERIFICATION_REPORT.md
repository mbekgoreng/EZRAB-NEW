# EZRAB Final Civil E2E Verification Report

Tanggal: 2026-09-18

## 1. Executive Summary

The existing 97 civil calculators were audited through the existing registry, UI catalog, Core execution, QTO adapter, project-context guards, and available DED workflow artifacts. No calculator, domain, formula, registry, AHSP, pricing, hydraulic, or structural design was added.

Software-level registry/catalog/execution verification is successful. Browser visual automation and full cross-project persistence/RLS verification are not available in this environment. DED selector evidence exists in the document/vision workflow, but the requested U-Ditch natural-language selector cases were not executable end-to-end through a dedicated selector contract in this run.

## 2. Browser Verification

`node_modules` contains no Playwright, Puppeteer, or equivalent browser automation. The Vite development server previously returned HTTP 200, but that is not visual browser evidence.

**Status: BLOCKED / NOT_AVAILABLE**

Not claimed: visual category clicks, form filling, browser Calculate click, or browser Add-to-QTO click.

## 3. Civil Domain Matrix

| Domain | Registered | Unique | UI Catalog | Resolve | Execute | QTO | Status |
|---|---:|---:|---:|---:|---:|---:|---|
| Drainage | 15 | 15 | 15 | 15 | 15 | representative | PARTIALLY VERIFIED |
| Bridge | 16 | 16 | 16 | 16 | 16 | representative | PARTIALLY VERIFIED |
| Irrigation | 11 | 11 | 11 | 11 | 11 | representative | PARTIALLY VERIFIED |
| River & Flood | 9 | 9 | 9 | 9 | 9 | representative | PARTIALLY VERIFIED |
| Weir | 10 | 10 | 10 | 10 | 10 | representative | PARTIALLY VERIFIED |
| Embung | 11 | 11 | 11 | 11 | 11 | representative | PARTIALLY VERIFIED |
| Dam | 12 | 12 | 12 | 12 | 12 | representative | PARTIALLY VERIFIED |
| Water Structure | 13 | 13 | 13 | 13 | 13 | representative | PARTIALLY VERIFIED |
| **Total** | **97** | **97** | **97** | **97** | **97** | **partial** | **PARTIALLY VERIFIED** |

Civil execution evidence: `npm run test:civil`, 271 passed / 0 failed.

## 4. UI Catalog Verification

The source chain is:

```text
civil/index.ts
→ ALL_CIVIL_EXPANSION_CALCULATORS
→ CoreCalculatorRegistry
→ CIVIL_EXPANSION_CALCULATOR_SPECS
→ ALL_CONSTRUCTION_CALCULATORS
→ getCalculatorById
→ CALCULATOR_CATEGORIES
→ QtoCalculatorView
```

The UI catalog contains all eight domain packs and 97 civil IDs. `QtoCalculatorView` derives the “Semua” count from `CALCULATOR_CATEGORIES`; no production `Semua (90)` label remains. Domain filter handling exists for all eight pack IDs.

The automated UI test verifies exact civil ID presence, resolution, definition parameters, finite execution output, and unit. It does not prove browser pixels/clicks.

**Status: PARTIALLY VERIFIED** (static/runtime catalog PASS; browser unavailable).

## 5. Calculator Execution

For each civil definition the automated test checks:

* ID is present in the civil source catalog;
* Core registry resolves the exact ID;
* definition has a name and parameters;
* `TEST_FIXTURE_ONLY` inputs execute;
* primary quantity is finite;
* primary unit is present.

All 97 civil definitions pass this coverage.

**Status: PASS at automated Core level.**

## 6. QTO End-to-End

`QtoAdapter.toQtoItem()` was verified at contract level. It preserves:

* authoritative `projectId`;
* `calculatorId`;
* quantity;
* unit;
* formula ID/version;
* formula snapshot;
* parameter snapshot where trace is available;
* source/category/status metadata.

It rejects empty project context. The civil suite includes representative QTO conversion and project fail-closed assertions. No DB-backed 97-calculator QTO integration was available.

**Status: PARTIALLY VERIFIED.**

## 7. Project Isolation

Verified:

* empty project ID fails closed;
* missing project context fails closed in QTO adapter;
* calculator/QTO contract carries the provided authoritative project ID;
* no civil code introduces a default/LLM project ID.

Not verified:

* full Project A / Project B persisted QTO read isolation;
* RLS-backed cross-project read rejection;
* stale context and unauthorized context through a live DB path.

**Status: PARTIALLY VERIFIED.**

## 8. DED Selector E2E

Existing DED-related implementation is present in `server/services/dedVisionExtractionService.ts`, `src/components/document/DedRabWorkflowView.tsx`, and phase 6.7/6.8 server tests. The repository search did not identify a standalone production calculator-selector contract that can be invoked with the three requested natural-language cases and return `AMBIGUOUS`/`BLOCKED_INPUT` deterministically.

Expected policy remains:

* `saluran U-Ditch 60x60` → drainage/channel candidate → `drainage.u_ditch` when required fields are satisfied;
* `saluran` → `AMBIGUOUS` / clarification;
* `U-Ditch` without required dimensions → `BLOCKED_INPUT` or clarification, never guessed.

No fake browser simulation or invented selector result was used.

**Status: PARTIALLY VERIFIED.**

## 9. Anti False-Pass Audit

The civil/UI tests do more than count arrays:

* exact calculator IDs are compared;
* Core registry resolution is checked;
* definitions and parameters are checked;
* calculators execute with fixture inputs;
* quantity finite/NaN conditions are checked;
* unit presence is checked;
* QTO quantity/unit/project ID are checked for representative output;
* missing project ID is checked as fail-closed;
* civil output behavior is covered by 271 assertions.

Remaining limitation: full 97-item QTO persistence and browser interaction are not covered.

**Status: PARTIALLY VERIFIED.**

## 10. TSC

Command:

```text
npx tsc --noEmit --pretty false
```

Background execution completed with exit code `0` and no diagnostics.

**Status: PASS.**

## 11. Build

Command:

```text
npm run build
```

Background execution completed with exit code `0`. Vite transformed 2,796 modules and generated `dist/` successfully.

**Status: PASS.**

## 12. Full Regression

`npm run test:all` completed successfully through core, calculator, parity, phase 4, phase 5, phase 6, civil, and UI stages.

Captured targeted results:

* Phase 4: 61 passed / 0 failed;
* Phase 5: 167 passed / 0 failed;
* Phase 6 Road: 266 / 266;
* Civil: 271 passed / 0 failed;
* UI: 0 errors and 97/97 civil catalog/execution checks.

`npm run test:foundation` is not available because no such npm script exists. The parity stage is included in `test:all` and exited successfully; a separately extracted exact vector count was not produced in this run.

**Status: PASS for available regression pipeline; foundation command NOT_AVAILABLE.**

## 13. Engineering Verification Boundary

**Status: PARTIALLY VERIFIED.**

Automated tests verify implementation behavior, not engineering source authority. No engineering verification is claimed for hydraulic coefficients/capacity/Manning/pipe sizing, structural capacity/design/reinforcement design, CBR, density, compaction, swell/shrinkage, productivity, AHSP, wages, or prices.

## 14. Remaining Risks

1. Browser visual and click verification is unavailable.
2. Full DB/RLS project isolation is not exercised here.
3. Full 97-item QTO persistence is not exercised here.
4. Requested natural-language DED selector cases lack a directly callable selector contract in the inspected runtime path.
5. Engineering-domain source verification remains separate from implementation tests.

## 15. Exact Blockers

* `BROWSER_VISUAL_VERIFICATION`: `NOT_AVAILABLE` — no browser automation dependency/runtime.
* `FULL_PROJECT_ISOLATION_INTEGRATION`: `NOT_VERIFIED` — no completed DB/RLS cross-project test in this run.
* `DED_SELECTOR_CASES`: `PARTIALLY VERIFIED` — existing DED workflow exists, but requested natural-language candidate/ambiguity contract was not directly executable.
* `test:foundation`: `NOT_AVAILABLE` — npm script absent.

## 16. Final Status

```text
IMPLEMENTATION STATUS: PARTIALLY VERIFIED
DOMAIN VERIFICATION STATUS: PARTIALLY VERIFIED
BROWSER VERIFICATION STATUS: BLOCKED / NOT_AVAILABLE
QTO STATUS: PARTIALLY VERIFIED
PROJECT ISOLATION STATUS: PARTIALLY VERIFIED
DED STATUS: PARTIALLY VERIFIED
TSC: PASS
BUILD: PASS
FULL REGRESSION: PASS (available test:all pipeline)
```

The implementation is not labeled `COMPLETE` because browser visual verification and the requested full DB-backed project/DED E2E evidence remain unavailable. No new calculator, domain, registry, formula, AHSP, pricing, hydraulic, or structural design was added.