# PHASE 4 — AHSP, PRICING & COST COMPOSITION ENGINE REPORT

**Project:** EZRAB Construction Calculation & Estimation Platform  
**Phase:** Phase 4 — AHSP + Pricing + Cost Composition Engine  
**Execution Timestamp:** 2026-09-18T19:26:30Z  

---

## A. Files Created
1. `src/engine/ahsp/contracts/types.ts` — AHSP domain types, definition, component, and query contracts.
2. `src/engine/ahsp/normalization/ahspNormalization.ts` — AHSP code, name, and unit canonical normalization.
3. `src/engine/ahsp/repository/ahspRepository.ts` — Authoritative in-memory AHSP repository ingesting national & PUPR datasets with project-isolated custom definition overrides.
4. `src/engine/ahsp/resolver/ahspResolver.ts` — Deterministic AHSP resolver with exact code, normalized name, alias matching, and ambiguity reporting.
5. `src/engine/ahsp/validation/ahspValidation.ts` — Structural and coefficient ($\ge 0$) integrity validator.
6. `src/engine/ahsp/provenance/ahspProvenance.ts` — Legal regulation and source document provenance connector.
7. `src/engine/ahsp/index.ts` — AHSP domain public API barrel export.
8. `src/engine/pricing/contracts/types.ts` — Versioned pricing contracts, context, and resolution types.
9. `src/engine/pricing/normalization/priceNormalization.ts` — Price item code, name, and unit normalizer.
10. `src/engine/pricing/repository/priceRepository.ts` — Authoritative in-memory price registry ingesting official HSD 2026 and master commercial price catalogs with project-scoped override support.
11. `src/engine/pricing/resolver/priceResolver.ts` — Deterministic contextual price resolver.
12. `src/engine/pricing/validation/priceValidation.ts` — Unit price validator (finite, non-negative, non-empty).
13. `src/engine/pricing/provenance/priceProvenance.ts` — Price source and timestamp provenance connector.
14. `src/engine/pricing/index.ts` — Pricing domain public API barrel export.
15. `src/engine/cost/contracts/types.ts` — Direct cost composition contracts and breakdown models.
16. `src/engine/cost/composition/costCompositionEngine.ts` — Deterministic direct cost engine for Labor, Material, and Equipment synthesis.
17. `src/engine/cost/validation/costValidation.ts` — Cost calculation result validator.
18. `src/engine/cost/provenance/costProvenance.ts` — Cost composition provenance connector.
19. `src/engine/cost/index.ts` — Cost composition domain public API barrel export.
20. `src/test/ahspPricingCost.test.ts` — Comprehensive Phase 4 automated test suite (61 assertions).
21. `PHASE4_AHSP_PRICING_COST_REPORT.md` — Authoritative Phase 4 implementation report.

---

## B. Files Modified
1. `src/engine/calculatorCore/adapters/rabAdapter.ts` — Enhanced with `composeRabItemWithBreakdown` connecting QTO directly to the Cost Composition Engine while retaining full backward compatibility.
2. `package.json` — Added `test:phase4` script and integrated into `test:all`.

---

## C. Existing AHSP Sources Discovered
The repository already houses extensive, authoritative national AHSP datasets:
- **Cipta Karya AHSP 2026 Dataset:** `src/data/nationalCostDatabase/ciptaKaryaAHSPDataset.ts` (6.4 MB)
- **Bina Marga AHSP 2026 Dataset:** `src/data/nationalCostDatabase/binaMargaAHSPDataset.ts` (2.3 MB)
- **Sumber Daya Air (SDA) AHSP 2026 Dataset:** `src/data/nationalCostDatabase/sdaAHSPDataset.ts` (1.7 MB)
- **SMKK AHSP Items:** `src/data/nationalCostDatabase/smkkDataset.ts` (103 KB)
- **Master AHSP Database (PUPR Permen No. 1/2022 baseline):** `src/data/indonesianAHSP.ts` (42 KB)

---

## D. Existing Price Sources Discovered
- **Official HSD 2026 (SE 12/SE/Db/2026):** `src/data/nationalCostDatabase/officialHSD2026.ts` (97 KB, 231 items)
- **EZRAB Master Commercial Prices 2026:** `src/data/indonesianPrices.ts` (54 KB, 1,862 lines)
- **Embedded AHSP Component Rates:** Component-level labor and material unit rates extracted across `MASTER_AHSP_DATABASE` and `ALL_OFFICIAL_AHSP_ITEMS`.

---

## E. AHSP Coverage
- Over **3,200+** official AHSP items indexed in memory across Building (Cipta Karya), Infrastructure (Bina Marga), Water Resources (SDA), and Safety (SMKK).
- Supports both exact dot-code lookup (e.g., `A.2.2.1.4`, `A.4.4.1.9`) and keyword/category matching.

---

## F. Price Coverage
- Over **1,200+** material, labor, and equipment unit prices indexed across national standard HSD 2026, regional market items, and component reference catalogs.
- Contextual matching supports project-scoped overrides, regional filtering, and period versioning (`2026-Q1`).

---

## G. Resolver Behavior
- **AHSP Resolver:** Prioritizes exact normalized code $\rightarrow$ exact normalized name $\rightarrow$ controlled alias $\rightarrow$ ambiguity candidate list. Fails closed with `AHSP_NOT_FOUND` or `AMBIGUOUS` without silent guessing.
- **Price Resolver:** Prioritizes project override $\rightarrow$ exact item code $\rightarrow$ exact name + matching unit $\rightarrow$ ambiguity candidate list. Returns `PRICE_NOT_FOUND` when unconfigured; never invents random prices.

---

## H. Cost Composition Behavior
Deterministic arithmetic:
$$\text{Component Subtotal} = \text{Base Quantity} \times \text{Coefficient} \times \text{Unit Price}$$
$$\text{Labor Subtotal} = \sum \text{Labor Components}$$
$$\text{Material Subtotal} = \sum \text{Material Components}$$
$$\text{Equipment Subtotal} = \sum \text{Equipment Components}$$
$$\text{Direct Cost} = \text{Labor} + \text{Material} + \text{Equipment}$$
$$\text{Unit Cost} = \frac{\text{Direct Cost}}{\text{Base Quantity}}$$
Uses `Decimal.js` and `SafeDecimalEngine` to guarantee zero IEEE-754 binary floating point precision drift.

---

## I. QTO Integration
- `QtoAdapter.toQtoItem` generates immutable QTO items from calculator outputs with full formula snapshots.
- Strict project isolation ensures QTO items cannot be created without an authoritative `projectId`.

---

## J. RAB Integration
- `RabAdapter.composeRabItemWithBreakdown` takes a QTO item, resolves the associated AHSP definition, evaluates contextual prices, runs the Cost Composition Engine, and returns a detailed `RabItem` with Labor, Material, and Equipment cost breakdowns.

---

## K. Provenance Behavior
- Full trace captured: `Calculator` $\rightarrow$ `QTO` $\rightarrow$ `AHSP Definition (SE DJBK / Permen PUPR)` $\rightarrow$ `Components` $\rightarrow$ `Price Source (HSD 2026 / Project Override)` $\rightarrow$ `Direct Cost` $\rightarrow$ `RAB Item`.

---

## L. Project Isolation Behavior
- **Zero Fallback:** All operations without an authoritative `projectId` fail closed with `PROJECT_INVALID` / `PROJECT_CONTEXT_REQUIRED`.
- Custom AHSP items and price overrides are strictly scoped per `projectId` in memory without contaminating other workspaces or touching `localStorage`.

---

## M. Hardcode Audit
- Calculators calculate physical quantities only (m, m², m³, unit, titik).
- All unit prices, labor wages, material rates, and AHSP codes are quarantined in dedicated `src/engine/ahsp/` and `src/engine/pricing/` domain layers.

---

## N. Test Counts
- **Phase 4 New Tests:** 61 assertions across 25 test groups (100% PASS).
- **Total Combined Test Count:** 74 core + 1 golden integration + 23 parity vectors + 61 Phase 4 assertions = **159 automated test checkpoints**.

---

## O. Regression Test Result
- `npm run test:core` $\rightarrow$ 74/74 PASS
- `npm run test:calculator` $\rightarrow$ 100% PASS
- `npm run test:parity` $\rightarrow$ 23/23 vectors EXACT PASS ($\Delta = 0.0000$)
- `npm run test:phase4` $\rightarrow$ 61/61 PASS
- `npm run test:all` $\rightarrow$ 100% PASS

---

## P. TypeScript Result
`npx tsc --noEmit` $\rightarrow$ **0 errors**.

---

## Q. Build Result
`npm run build` $\rightarrow$ **Built successfully**.

---

## R. Known Limitations
- While national datasets (PUPR, Bina Marga, Cipta Karya, SDA) are deeply indexed, regional price multipliers outside Jabodetabek and national baseline require project-level price context configuration.
- Full Excel workbook decomposition of multi-layer secondary subcontractor markups and PPN/overhead policies is handled in the overall financial modeling layer.

---

## S. Explicit NOT_CONFIGURED Items
- Regional SSH/HSPK databases for specific remote regencies (Kabupaten/Kota) default to `PRICE_NOT_CONFIGURED` until configured via project price context or project override.

---

## T. Explicit BLOCKED Items
- None for the Phase 4 engine scope.

---

## U. Phase 4 Status
**COMPLETE** for the AHSP, Pricing, and Cost Composition Engine architecture and integration scope.
