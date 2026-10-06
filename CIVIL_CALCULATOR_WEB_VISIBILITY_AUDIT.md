# EZRAB Civil Calculator Web Visibility Audit

Tanggal audit: 2026-09-18  
Scope: source-level and registry/UI integration audit after civil packs were added.

## 1. Root Cause

Civil pack registration was already connected correctly:

```text
civil/index.ts
→ ALL_CIVIL_EXPANSION_CALCULATORS
→ CoreCalculatorRegistry
→ CIVIL_EXPANSION_CALCULATOR_SPECS
→ ALL_CONSTRUCTION_CALCULATORS / getCalculatorById
```

The actual UI visibility gap was the QTO category filter. `filteredCategoryList` handled the generic `ALL`, `RESIDENTIAL`, and `ROAD` modes, but did not recognize civil pack filters such as `DRAINAGE`, `BRIDGE`, `IRRIGATION`, `RIVER`, `WEIR`, `EMBUNG`, `DAM`, or `WATER_STRUCTURE`. The category buttons also exposed only the old hardcoded filter labels and stale total `90`, so catalog exposure was not derived consistently from the catalog source.

The civil definitions were not missing from the Core: source inspection and execution tests show 97 definitions, all imported by `civil/index.ts`, registered by `CoreCalculatorRegistry`, and represented in `CALCULATOR_CATEGORIES`.

## 2. Fixes

| File | Fix | Reason |
|---|---|---|
| `src/components/qto/QtoCalculatorView.tsx` | Added civil pack filter handling for all eight domain packs | Civil filter selection previously fell through to `cat.id` logic and did not provide a reliable domain filter |
| `src/components/qto/QtoCalculatorView.tsx` | Replaced stale category button totals/list with labels derived from `CALCULATOR_CATEGORIES` | Avoids stale hardcoded catalog counts and keeps one UI catalog source |
| `src/test/uiCalculatorIntegration.test.ts` | Added all-civil catalog/definition/Core execution assertions using `TEST_FIXTURE_ONLY` | Existing UI test covered residential/legacy but not civil visibility or execution |

No calculator definition, formula, AHSP, pricing, domain, or parallel registry was added.

## 3. Actual Inventory

Counts are from source imports and runtime registry inspection, not prior reports.

| Domain | Registered | Unique | UI Candidate | UI Visible (source catalog) | Executable | QTO Ready |
|---|---:|---:|---:|---:|---:|---:|
| Building/residential + legacy | existing packs | source-defined | source-defined | source-defined | existing tests | existing adapter |
| Road | 39 | 39 | 39 | 39 | 39 | existing adapter |
| Drainage | 15 | 15 | 15 | 15 | 15 | adapter path available |
| Bridge | 16 | 16 | 16 | 16 | 16 | adapter path available |
| Irrigation | 11 | 11 | 11 | 11 | 11 | adapter path available |
| River & Flood | 9 | 9 | 9 | 9 | 9 | adapter path available |
| Weir | 10 | 10 | 10 | 10 | 10 | adapter path available |
| Embung | 11 | 11 | 11 | 11 | 11 | adapter path available |
| Dam | 12 | 12 | 12 | 12 | 12 | adapter path available |
| Water Structure | 13 | 13 | 13 | 13 | 13 | adapter path available |
| **Civil total** | **97** | **97** | **97** | **97** | **97** | **available; integration regression required** |

`QTO Ready` means the existing adapter/ProjectContext path is available and tested for representative civil output; it does not mean engineering-domain verification.

## 4. UI Verification

| Domain | Category | Calculator count | Visible source catalog | Selectable filter | Executable |
|---|---|---:|---|---|---|
| Drainage | DRAINAGE | 15 | 15/15 | fixed | 15/15 |
| Bridge | BRIDGE | 16 | 16/16 | fixed | 16/16 |
| Irrigation | IRRIGATION | 11 | 11/11 | fixed | 11/11 |
| River & Flood | RIVER | 9 | 9/9 | fixed | 9/9 |
| Weir | WEIR | 10 | 10/10 | fixed | 10/10 |
| Embung | EMBUNG | 11 | 11/11 | fixed | 11/11 |
| Dam | DAM | 12 | 12/12 | fixed | 12/12 |
| Water Structure | WATER_STRUCTURE | 13 | 13/13 | fixed | 13/13 |

Source-level browser rendering was not available in this terminal session. Therefore this report does not claim visual browser PASS. The automated catalog test verifies the same catalog data consumed by QTO UI and all civil registry definitions.

## 5. QTO Verification

Representative civil QTO adapter test passed in `civilCalculatorExpansion.test.ts`:

* authoritative `projectId` preserved;
* calculated quantity preserved;
* unit preserved;
* missing project ID fails closed.

The QTO adapter also carries calculator ID, formula ID/version, parameter snapshot, formula snapshot, category, source, and timestamps. Entity ID is not currently a universal field on the legacy `QTOItem` contract; this remains a traceability enhancement, not a visibility blocker.

## 6. Project Isolation

Civil test coverage confirms QTO adapter fail-closed behavior for missing project ID. Full two-project browser mutation verification was not run in this session. Existing ProjectContext and ownership paths remain the authority; no civil UI path was introduced that selects a default or arbitrary project.

Status: `PARTIALLY VERIFIED`.

## 7. DED Selection

The current source audit confirms registry IDs resolve through `getCalculatorById`, but a complete browser DED-to-entity selector smoke test was not executed in this session. Expected behavior remains:

* `saluran U-Ditch 60x60` → drainage entity → `drainage.u_ditch`;
* generic `saluran` with multiple applicable variants → `AMBIGUOUS`;
* missing required geometry → `BLOCKED_INPUT`;
* `jembatan beton` → bridge candidate set, not silent design selection.

Status: `PARTIALLY VERIFIED`.

## 8. Regression

Executed successfully:

* `npm run test:civil` — **271 passed, 0 failed**;
* `npm run test:ui` — **existing catalog assertions passed; updated civil assertions require final rerun after this edit**;
* `npm run test:phase6` — **266/266 passed**.

The previous UI test reported 187 catalog items, 30 residential, and 21 legacy; it did not test civil execution. The test was extended to cover all 97 civil IDs.

## 9. TSC

`npx tsc --noEmit --pretty false` exceeded the terminal tool's 30-second limit. No PASS/FAIL claim is made.

## 10. Build

`npm run build` exceeded the terminal tool's 30-second limit. No PASS/FAIL claim is made.

## 11. Remaining Issues

1. Browser/dev-server visual smoke test was not available in this session.
2. Updated UI civil test must be rerun after the final test edit.
3. Full `tsc` and build need a runner with a reproducible timeout/environment.
4. Existing civil definitions often expose `defaultValue`/fallback behavior for test fixtures; production source-backed input policy requires separate domain verification.
5. Civil formula status must not be interpreted as engineering verification solely from implementation tests.

## 12. NOT VERIFIED

* Engineering-domain/source parity for civil formulas.
* Hydraulic performance, Manning, discharge, capacity, pipe sizing.
* Structural design/capacity/reinforcement design.
* Density, compaction, swell, shrinkage, productivity, AHSP, and price.
* Browser visual rendering in this audit session.

## 13. BLOCKED_INPUT

Calculator execution must return `BLOCKED_INPUT` when required geometry, approved member dimensions, product dimensions, route, section, or source evidence is absent. It must not infer values from defaults, another project, last state, or an LLM response.

## Final Status

**Implementation status:** `PARTIALLY VERIFIED` — root UI filter visibility defect fixed and civil catalog/execution coverage added; final compile/browser reruns remain.  
**Engineering domain verification:** `PARTIALLY VERIFIED`.  
**No new calculator or domain was created.**

## FINAL VERIFICATION

### Browser Visual Verification

`npm run dev -- --host 127.0.0.1 --port 4173` started successfully and returned HTTP 200 for the Vite index. However, no browser automation/runtime (Playwright, Puppeteer, or equivalent) is available in the repository environment. HTTP index availability is not visual browser verification.

```text
BROWSER VISUAL VERIFICATION: NOT AVAILABLE
```

Therefore `WEB VISIBLE PASS` is not claimed. Source-catalog/UI integration is verified by the updated automated UI test, but manual visual smoke tests for each domain remain pending.

### Domain smoke coverage

The civil expansion test executes representative calculators from all eight domains using `TEST_FIXTURE_ONLY` inputs and reports 271 passed assertions, including registry resolution, deterministic output, and representative QTO/project isolation checks. This is execution evidence, not browser click evidence.

### TSC and Build

Background process monitoring completed. `npx tsc --noEmit --pretty false` exited with code 0 and no diagnostics. `npm run build` exited with code 0; Vite transformed 2,796 modules and produced `dist/` successfully. Status:

```text
TSC: PASS
BUILD: PASS
```

No build configuration or timeout was changed.

### Full regression

Targeted results captured:

* `npm run test:all`: completed successfully; core, calculator, parity, phase 4, phase 5, phase 6, civil, and UI stages exited successfully.
* `test:civil`: 271 passed, 0 failed.
* `test:ui`: 0 errors; 97/97 civil catalog and execution checks.
* `test:phase6`: 266/266 passed.
* `test:phase4`: 61 passed, 0 failed.
* `test:phase5`: 167 passed, 0 failed.
* `test:foundation`: NOT_AVAILABLE (no package script exists).
* Phase 3 parity stage is included in `test:all` and exited successfully; exact vector count was not separately extracted in this run.

Full regression status: `PASS` for the available `test:all` pipeline.

### Final verification table

| Domain | Registered | UI Visible | Selectable | Executable | QTO | Status |
|---|---:|---|---|---:|---|---|
| Drainage | 15 | NOT AVAILABLE (browser) | source/test verified | 15/15 | representative adapter verified | PARTIALLY VERIFIED |
| Bridge | 16 | NOT AVAILABLE (browser) | source/test verified | 16/16 | representative adapter verified | PARTIALLY VERIFIED |
| Irrigation | 11 | NOT AVAILABLE (browser) | source/test verified | 11/11 | representative adapter verified | PARTIALLY VERIFIED |
| River & Flood | 9 | NOT AVAILABLE (browser) | source/test verified | 9/9 | representative adapter verified | PARTIALLY VERIFIED |
| Weir | 10 | NOT AVAILABLE (browser) | source/test verified | 10/10 | representative adapter verified | PARTIALLY VERIFIED |
| Embung | 11 | NOT AVAILABLE (browser) | source/test verified | 11/11 | representative adapter verified | PARTIALLY VERIFIED |
| Dam | 12 | NOT AVAILABLE (browser) | source/test verified | 12/12 | representative adapter verified | PARTIALLY VERIFIED |
| Water Structure | 13 | NOT AVAILABLE (browser) | source/test verified | 13/13 | representative adapter verified | PARTIALLY VERIFIED |
| **Total** | **97** | **NOT AVAILABLE (browser)** | **97/97 source/test** | **97/97** | **PARTIALLY VERIFIED** | **PARTIALLY VERIFIED** |

### Final status decision

```text
IMPLEMENTATION STATUS: PARTIALLY VERIFIED
DOMAIN VERIFICATION STATUS: PARTIALLY VERIFIED
```

The implementation meets the software gates for registry, static UI catalog, automated execution, TSC, build, and available full regression. The requested strict COMPLETE gate is not granted because browser visual verification remains unavailable; QTO/project isolation remain representative/partial for full cross-project integration, and engineering-domain verification remains partial. No calculator was added.