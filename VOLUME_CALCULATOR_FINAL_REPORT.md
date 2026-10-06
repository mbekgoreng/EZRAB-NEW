# VOLUME_CALCULATOR_FINAL_REPORT.md

**Project:** EZRAB (ezrab-v2)
**Report date:** 2026-09-27
**Mandate:** Master Prompt — *EZRAB Volume Calculator + AHSP 2026 + Price Engine: Full Forensic Audit, Data Refresh & Calculation Rebuild*
**Phases executed in this report:** **A (repository audit), B (inventory), C (AHSP mapping audit), D (price database audit)** — read-only forensics.
**Phases NOT executed:** **E–L** (price engine, location engine, calculation engine, calculator migration, golden tests, UX transparency, regression, production build).
**Code changes made by this audit:** **none.** Only audit documents were written. No calculator, price table, engine, test or build artifact was modified.

---

## 1. Executive Summary

EZRAB's **quantity layer is largely sound**. 194 registered calculators were inventoried; the core
formulas (prism, trapezoid, prismoidal, rebar unit weight, sloped roof, opening areas) are deterministic
and readable, and there is genuine engineering infrastructure around them — `UnitEngine`,
`PrecisionEngine` (Decimal.js), an execution trace, a provenance layer, and a well-designed AHSP schema.

**The money layer is where the product is broken**, and the breakage is not cosmetic:

- **No calculator earned PASS.** Not one satisfies all four conditions (verified formula + explicit units +
  sourced price + explicit AHSP mapping). 24 legacy calculators carry a **hardcoded production price**
  inside the calculator itself; 166 pack calculators have **no AHSP mapping at all**.
- **The price corpus is 100% unprovenanced.** 6,386 sampled price records: **0** carry a resolvable URL or
  identifiable vendor; **231/231** HSD records cite a document that is misattributed
  (`SE 12/SE/Db/2026` is a Bina Marga data-collection circular, not an HSD master price list);
  **6,000/6,000** master materials cite EZRAB itself; **all** carry a generic placeholder supplier.
- **Prices are effectively single-region and single-date.** Three distinct region strings for 6,386 records
  ("Nasional / Acuan 2026", "Jabodetabek", "Nasional (Jabodetabek)"); 6,231 records share the identical
  date `2026-01-15`. No freshness computation exists; `AGING`/`EXPIRED` can never be non-zero.
- **Project location never reaches the price layer.** The core resolver reads a `location` input and never
  uses it; the template path has **no location parameter in its signature at all**; the default region is a
  hardcoded `'Surabaya'` falling back to `DKI_JAKARTA`.
- **A silent Rp 74,000 default** is returned for any unresolvable item and displayed as a "national
  reference" — a Rp 2,500,000 electrical panel renders as Rp 74,000. Two more fabricated defaults exist
  (Rp 150,000 and Rp 1,150,000).
- **Unit-blind matching produces a ~42× error** on cement-class components (an AHSP coefficient in `zak`
  resolved against a per-`kg` price).
- **SMKK is never added** to any RAB, although the dataset exists and a 2026 SE attachment
  (Lampiran III) governs it.
- **Overhead/profit are applied twice** if the user edits an item in the Work Item Inspector (~15%
  overpricing), while the same project's user-configured rates are silently discarded back to 5%/5%/11%.

**Answer to the mandate's core question — "why is the final price too cheap?":**
It is not uniformly too cheap. It is **unstable and untraceable**. The same project can land **~15% high**
(inspector path) or **~42× low** on a single affected component (unit mismatch), with no signal to the user
in either case. The mandated remedy — *fix the data sources and the calculation chain so the result is
realistic because it is methodologically correct* — is therefore the right and only correct remedy.
**Do not add percentage markups.**

**Verified external baseline:** SE DJBK No. **47/SE/Dk/2026** (20 Feb 2026) is real, with 7 attachments
(Batang Tubuh + Lampiran I–VII). The authoritative 2026 basic-price source is **e-HSD Kementerian PU
(`ehsd-pupr.id/hsd/2026`, TA 2025/2026)** providing **per-Kota/Kabupaten** tenaga/bahan/alat/SMK3 prices —
verified live during this audit (e.g. Kepala Tukang per jam: Demak Rp 20,064; Yogyakarta Rp 17,857;
Sleman Rp 21,614).

**Bottom line:** the rebuild is a **data-provenance and calculation-chain rebuild**, not a UI task and not
a markup task. Phases A–D are complete and evidenced. Phases E–L cannot be honestly completed until three
decisions are taken (§20) — chiefly: where real 2026 prices will come from, and whether the official
AHSP 2026 attachments may be ingested.

---

## 2. Calculator Inventory

**Total: 194 registered calculators + 8 server quantity functions + 1 template evaluator = 203 units.**

| Domain | Count | Money applied? | AHSP mapped? | Dominant status |
|---|---|---|---|---|
| Residential / building (core pack) | 30 | no | no | WARNING |
| Building (legacy) | 20 | **hardcoded price** | yes | **HARDCODED** |
| Road / Bina Marga (core pack) | 39 | no | no | WARNING |
| Road / infra (legacy) | 3 | **hardcoded price** | yes | **HARDCODED** |
| Civil / SDA (8 packs) | 97 | no | no | WARNING |
| Paving | 2 | hardcoded (legacy) / none | partial | HARDCODED / WARNING |
| Standalone geometry | 4 | no | no | WARNING |
| Server QTO functions | 8 | from caller | hardcoded | **HARDCODED** |
| Template quantity engine | 1 | no | no | **NEEDS_REBUILD** |

Two **parallel, non-unified** quantity systems exist (legacy registry vs `calculatorCore` packs), plus a
third (`new Function` template rules) and an orphan Excel spec (`masterJsonSpec.ts`, wired only to
`QtoCalculatorView.tsx:66`). Full row-level detail: `VOLUME_CALCULATOR_AUDIT_INVENTORY.md`.

---

## 3. Formula Audit

**Correct:** prism `L×W×H`; trapezoid `((top+bottom)/2)×h×L`; prismoidal `(H/3)(A1+A2+√(A1·A2))`;
rebar `d²/162.2` kg/m (SNI 2052 basis, density 7850 kg/m³); sloped roof `area/cos(pitch)`;
opening areas/perimeters; geotextile overlap `(L×W)×(1+overlap%)`.

**Suspect / unverifiable:**
- `deterministicQtoEngine.ts` — hardcoded assumed dimensions presented as quantities: `45.0` (abutment),
  `0.04` (road thickness), `2.4` (canal perimeter). **FAIL.**
- `automaticQtoEngine.ts` / `constructionEntityEngine.ts` — `perimeter×0.8×0.8` excavation,
  `perimeter×0.15×0.20` sloof, `count×0.25×0.25×height` column, `2×(L+W)×H×0.85` wall. **HARDCODED.**
- Dam/weir valley factors `×0.85`, `×0.75`, `×0.8` with no cited source.
- Embung uses **both** `H/3` and `H/6` prismoidal forms in different calculators — defensible but
  undocumented and inconsistent.
- Template `QuantityEngine.evalSimpleFormula` executes `new Function(...)` on template-authored strings —
  no unit model, no validation. **NEEDS_REBUILD.**
- Stair calculator (`calculateStair`) — not independently verified in this pass.

**Duplication:** trapezoid volume is implemented in **13+ files**; prism volume in **20+**; tile waste
`×1.05` in **3**; `(P×H) − Abukaan + Asop` byte-identical in two legacy calculators with different
AHSP codes and prices.

---

## 4. Unit Audit

| Aspect | Verdict |
|---|---|
| Units declared per calculator | ✅ yes |
| Normalization engine (`UnitEngine`) | ✅ exists |
| Compatibility check inside cost composition | ✅ warns on mismatch (`costCompositionEngine.ts:95-104`) |
| Unit enforced during **price resolution** | ❌ **NO** — partial-match path ignores unit |
| `sak` ↔ `kg`, `zak` ↔ `kg`, `ton` ↔ `kg` conversion | ❌ absent (`ahspNormalization.ts:47` only maps `zak→sak`) |
| Price-unit vs coefficient-unit guard | ❌ absent |

**Concrete defect:** `Semen Portland` exists as `kg @ 1,600` (HSD) and `zak @ 68,000`
(indonesianPrices) and `sak @ 74,000` (material DB). Resolving the `zak` coefficient against the `kg`
price yields **5,216/m² instead of 221,680/m² — a 42× under-price.** Verdict: **unit handling is sound on
the quantity side and broken on the price side.**

---

## 5. AHSP Audit

- Schema is **good** (`nationalCostDatabase/types.ts:28-96`): code, name, domain, unit, version, year,
  normative status (Normatif/Informatif), method, sourceId, sourceDocument, sourcePage, status, and
  separate labor/material/equipment component arrays with `dataQualityScore`. Version-diff and project
  snapshot contracts exist.
- **Provenance is bad:** `sources.ts:9` cites `47/SE/Db/2026` (real: **47/SE/Dk/2026**); all five sources
  are marked `VERIFIED` with domain-root URLs; the Bina Marga source is a **2024** circular relabelled
  "Rev 2026".
- **Same AHSP code, two prices:** `A.4.1.1.5` = **Rp 4,700,000** (`AhspPriceBridge.ts:27`, `verified: true`)
  vs **Rp 1,320,000** (`parametricVolumeEngine.ts:200`) — **3.56× divergence.**
- **166 calculators have no AHSP mapping** (chain `Calculator → Work Item → AHSP → Components → Price`
  is complete only for the 24 legacy calculators, and even there the price hop is hardcoded).
- The 2026 **new / major-change / minor-change / alternative** classification is **not representable** in
  the schema. Migration classification is therefore **BLOCKED** — see `AHSP_2026_MIGRATION_REPORT.md` §3.

---

## 6. Material Price Audit

| Finding | Evidence |
|---|---|
| 231 HSD + 155 + 6,000 records; **0** with a resolvable URL/vendor | `officialHSD2026.ts`, `indonesianPrices.ts`, `masterMaterials2026.json` |
| `specification` is a placeholder for 135/231 HSD records; **6,000/6,000** master specs contain the word "Estimasi" | sampled counts |
| Rebar priced flat across diameters: Ø6/Ø8/Ø10 all **Rp 12,500/kg**; D10/D13/D16 all **Rp 13,200/kg** | `indonesianPrices.ts:668-777` |
| HSD rebar has no diameter/grade at all | `officialHSD2026.ts:529,543` |
| `confidenceScore` hardcoded 0.90/0.95/0.98 (not measured) | `priceRepository.ts:71,109,147,186,307` |
| No median selection, no outlier flagging | `priceResolver.ts:373,410`; `materialDatabaseService.ts:1344` |
| Fabricated defaults 74,000 / 150,000 / 1,150,000 | `projectPriceEngine.ts:851`; `AhspPriceBridge.ts:120`; `automaticRabDraftEngine.ts:133`; `parametricVolumeEngine.ts:242`; `authoritativeAhspPriceBridge.ts:183` |

**Data Quality Score of the current corpus (per §42 model): ≈ 22/100** — computed as source quality 0/25,
freshness ≤50/100, location 40/100, spec ≈20/100, multi-source 0/10, AHSP mapping ≈40/100.

---

## 7. Labor Audit

- Labor exists in `officialHSD2026.ts` (40 records under `"Standar Mandor & Asosiasi Tenaga Kerja"`) and in
  `indonesianPrices.ts`, but **region granularity is absent** (single national/Jabodetabek value).
- No per-region wage floor check exists; there is no comparison against the mandated minimum wage.
- The authoritative source for this data is **e-HSD PUPR per Kota/Kabupaten** (verified live:
  Kepala Tukang/jam Demak 20,064 · Yogyakarta 17,857 · Sleman 21,614 · Bantul 17,809 · Kudus 18,289).
- **Verdict: OUTDATED + MISSING_SOURCE.**

## 8. Equipment Audit

- 47 HSD records carry the placeholder supplier `"Rental Alat Berat & Kontraktor Lokal"` — no vendor, no
  rental period, no productivity, no fuel/operator split.
- No equipment record expresses `unit` + `duration` + `productivity` + `source` as required by §19.
- **Verdict: MISSING_SOURCE.**

---

## 9. Waste Audit

| Factor | Value | Configurable | Where |
|---|---|---|---|
| Rebar waste | 5% default | ✅ yes (input) | `residentialPackCalculators.ts:480`; `registry.ts:942,976` |
| Wall tile waste | `×1.05` literal | ❌ no | `residentialPackCalculators.ts:784`; `registry.ts:1788` |
| Gypsum sheets | `×1.05` literal | ❌ no | `registry.ts:1855` |
| Hebel blocks | `×1.05` literal | ❌ no | `registry.ts:1206` |
| Sand bedding compaction | `×1.15` literal | ❌ no | `registry.ts:2252` |
| Aggregate compaction | `×1.2` literal | ❌ no | `registry.ts:2352` |
| Geotextile/geogrid overlap | param | ✅ yes | `roadPackCalculators.ts:1862,1920` |
| Embung overlap | 1.10 default | ✅ yes | `embungPackCalculators.ts:615` |
| Project/global waste setting | 5% | collected | `UnifiedSettingsView.tsx:249`; `TemplateRabCatalogView.tsx:107` — **never read by any calculator** |

**Findings:** waste is (a) **never applied on the live money path**, (b) baked into quantities in 12
literal places, and (c) **collected from the user but discarded**. If the project-level setting were ever
wired in, every quantity already containing `×1.05` would be inflated again — a latent double-count.

---

## 10. Overhead / Profit Audit

| Path | Overhead | Profit | Live? |
|---|---|---|---|
| `unifiedProjectEngine.recalculateCostSummary` | **5%** (literal) | **5%** (literal) | **YES** — called from `ProjectContext.tsx:760` |
| `unifiedProjectEngine.computeCostSummaryFromSections` | 5% | 5% | YES (exports) |
| `rabCostAuditEngine.runAudit` | 5% | **10%** | **no callers — dead code** |
| `formulaEngine.recalculateProjectCost` | config | config | no callers found |
| `server/services/calculationService` | 5% | 5% | server path |
| `parametricVolumeEngine` | 5% | 5% | template path |
| `versionAndScenarioEngine` | 3–5% | **8–10%** | scenario path |
| `WorkItemInspectorDrawer` | 5% (default) | **10%** (default) | user-facing |

**Defects:**
1. **Not configurable in the live path.** `ProjectContext.tsx:760` calls
   `UnifiedProjectEngine.recalculateCostSummary(pItems)` **omitting** `currentSummary`, so rates are always
   5%/5%/11%; the result then **overwrites** the stored summary (`:769`), wiping any user setting. The
   settings modal writes `overheadPercent`/`profitPercent`/`ppnPercent` to the **project root**, but the
   `Project` type has no such fields and no calculator reads them.
2. **Double application.** `WorkItemInspectorDrawer.tsx:302` computes
   `unitPrice = directCost + overhead + profit` and saves it at `:474`; the rollup then treats that as
   direct cost and applies overhead+profit+tax **again** → **~15% overpricing**.
3. **The audit engine's own double-markup detector is dead** — `doubleMarkupCount` is declared at
   `rabCostAuditEngine.ts:194` and never incremented, so it always reports 0.

---

## 11. Tax Audit

| Path | Rate | Base | Verdict |
|---|---|---|---|
| `unifiedProjectEngine.ts:38` | 11% | direct + oh + profit + contingency + director markup | ✅ correct base |
| `unifiedProjectEngine.ts:264-265` (exports) | 11% | direct + oh + profit (**drops contingency & markup**) | ⚠️ inconsistent |
| `deterministicRabDraftEngine.ts:209` | 11% | **direct cost only** | ❌ wrong |
| `automaticRabDraftEngine.ts:156` | 11% | **direct cost only** | ❌ wrong |
| `decimalEngine.ts:44-46` | 11% | subtotal + overhead (**profit missing**) | ❌ wrong |
| `LaporanView.tsx:894-897` | 11% | `totalBoqAmount`; `grandTotal = totalBoqAmount` | ❌ oh/profit/tax never added |
| `EstimatorRekapitulasiView.tsx:53-56` | 11% | direct + overhead (**profit missing**) | ❌ wrong |
| `rabCostAuditEngine.ts:256,334,370,404` | 11% | `direct × 1.15` **magic multiplier** | ❌ wrong when rates ≠ 5/10 |
| `excelExportEngine.ts:665-666` | 11% + **PPh 1.75%** | PPh on direct cost only | ❌ formula ≠ stored value |

**Additional:** PPN is hardcoded `11` everywhere as a fallback (the 12% rate never appears);
PPh `1.75%` is an unsourced literal (`excelExportEngine.ts:117`); the Excel grand-total formula sums
subtotal + PPN + PPh while the **stored** `grandTotal` excludes PPh, so the exported file contradicts itself.

---

## 12. Location Pricing

**Required chain:** `Project → Province → Regency/City → Pricing Region` (never the user's browser location).

**Actual behaviour:** the chain is not implemented.

1. The core resolver reads `location` at `priceResolver.ts:456` and **never uses it**; the returned region
   is copied from the master record (`:684`) — a Papua project is priced at "Jabodetabek".
2. The template path **cannot** pass location: `WorkspaceView.tsx:616` → `rabTemplateService.ts:1455`
   `generateRabFromTemplate(template, userParams, targetProjectId, detailLevel, selectedOptionalItemIds)`
   — **no location parameter exists in the signature.**
3. Defaults are hardcoded: `AhspPriceBridge.ts:98` `locationProvince || locationCity || 'Surabaya'`, then
   `regionalCostFactors.ts:144` falls back to `DEFAULT_REGIONAL_CODE = 'DKI_JAKARTA'`.
4. One path infers region by **scanning free text** (`detectRegionFromText`, `regionalCostFactors.ts:174-199`).
5. Regional factors: 10 keys but only **8 unique** (`BALI_NTB_NTT`≡`BALI_NUSRA`,
   `KALIMANTAN`≡`KALIMANTAN_IKN`), with no documented source.
6. National HSD records are **mislabelled as `REGIONAL_REFERENCE`** because the label is derived from
   `priceSource.includes('SE')` — true for every record (`priceResolver.ts:195,673`).

**Verdict: FAIL.** Fallbacks exist but are not labelled as fallbacks to the user, and the primary regional
input is never read from the project.

---

## 13. Price Source

| Required level (§12) | Present? | Evidence |
|---|---|---|
| 1 — verifiable local market price | ❌ | 0 vendor-identified records |
| 2 — manufacturer/distributor/agent | ⚠️ nominal | generic labels only ("Distributor Roman") |
| 3 — procurement e-marketplace | ❌ | – |
| 4 — official central/regional government data | ⚠️ claimed, not linked | `SE 12/SE/Db/2026` misattributed |
| 5 — historical contract data | ❌ | – |
| 6 — index/inflation adjustment (last resort) | ❌ | no adjustment records; BPS not integrated |

**6,386 sampled records → 0 with a resolvable source. 100% generic placeholders.**
The `sourceType` field required to express this hierarchy **does not exist in the schema**.

---

## 14. Price Freshness

- `officialHSD2026.ts`: **231/231** at `2026-01-15`.
- `masterMaterials2026.json`: **6,000/6,000** at `2026-01-15`.
- `indonesianPrices.ts`: **155** split across exactly two timestamps (102 + 53) — bulk stamp.
- No FRESH/AGING/STALE/UNKNOWN computation exists; `freshness: 'CURRENT'` is **hardcoded**
  (`materialDatabaseService.ts:840,917,977`), so AGING/EXPIRED counters are structurally always 0.
- Master/HSD records have **no `validUntil`**, so they can never expire (`projectPriceEngine.ts:618-628`
  applies only to project prices).
- **Verdict: FAIL.** At audit date, 6,231 records are ~8 months old and the system cannot say so.

---

## 15. Versioning

| Requirement | Status |
|---|---|
| AHSP versioned | ⚠️ partial — `version` field + `'2026.1'`/`'2022.0'` labels exist (`sources.ts`) |
| Project stores `ahspVersion` | ❌ absent from the `Project` type |
| Project stores `priceSnapshotVersion` | ❌ absent |
| 2026 change-class (new/major/minor/alternative) | ❌ not representable → migration **BLOCKED** |
| Historical RAB protected from coefficient drift | ❌ no pinning |

**Verdict: FAIL** (contracts partially exist, enforcement does not).

## 16. Snapshot

- `AHSPProjectSnapshot` type **exists** (`nationalCostDatabase/types.ts:84-96`) but is **not used by any
  approval flow**.
- No price snapshot, no calculation snapshot, no timestamp/user/version capture on approval.
- **Consequence:** editing a price dataset silently changes historical RABs — directly violating §36.
- **Verdict: FAIL.**

---

## 17. Golden Tests

**Status: NOT BUILT.** Phase I has not been executed. No `volumeCalculatorGoldenTests` exist yet.
The existing test suite contains parity tooling (`calculatorCore/parity/{goldenVectors,parityRunner,
independentReferenceEvaluator}.ts`) which is a usable foundation, but it does not yet assert the full
required chain (input → quantity → AHSP mapping → material/labor/equipment quantity → direct cost →
overhead → profit → tax → final), nor the extreme cases (quantity 0/1/100/1000; missing price/AHSP/
material/location; stale price; unknown source).

**This is a genuine gap, not a formality:** the defects in §1 #1, #2, #9 and #10 would all be caught by a
golden test of the full chain. Writing those tests is the highest-value next engineering step.

---

## 18. Regression Tests

**Status: NOT RUN FOR THIS AUDIT — and no need to run them, because this audit changed no code.**

Last verified state of the repository (end of the preceding verification task, after the browser-compat
fixes to `aiSourceReadingService.ts`, `aiDrawingIntelligence.ts`, `dedToRabPipelineService.ts`,
`aiProviderRegistry.ts`, `aiProviderRouter.ts`):

| Gate | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | **exit 0** |
| Full suite | `npm run test:all` | **exit 0**, all suites `0 FAILED` (1,204 PASS lines; 11 suites reporting explicit PASSED counts) |
| Production build | `vite build` | **exit 0** (2,865 modules; `dist-qa` emitted) |

No test was deleted, skipped or weakened at any point. The audit documents written here are `.md` files and
cannot affect the build or the suite. **Regression must be re-run after Phase E–H code changes**, not
before.

---

## 19. Build

**Status: NOT RE-RUN FOR THIS AUDIT (no code changed).** Last verified: production build **PASS**
(`vite build` exit 0, 2,865 modules transformed, output emitted to `dist-qa`).

Note for the rebuild phase: `npm run build` (which writes to `dist/`) failed once in this environment
because the sandbox's trash shim timed out while emptying the existing `dist/` directory
(`ETIMEDOUT` on `genie-trash/win32-x64.exe`). That is an **environment** issue, not a code issue — the same
build succeeds when writing to a fresh output directory. Anyone reproducing the build should either clear
`dist/` manually first or build to a new `--outDir`.

---

## 20. Remaining Issues

### 20.1 Blocked — cannot proceed without a decision or a document (Master Prompt §46)

| # | Blocked item | What is needed |
|---|---|---|
| B1 | AHSP 2026 new/changed/deprecated/alternative classification | the 7 official Lampiran PDFs (or authorisation to ingest them) |
| B2 | AHSP coefficient verification (D in §4 of the mandate) | same as B1 — coefficients must not be inferred |
| B3 | Real 2026 material/labor/equipment prices | decision on the price source: scrape/import e-HSD PUPR, manual QS collection, or supplier quotations |
| B4 | Regional factor provenance | published source for the 8 factors, or removal |
| B5 | PPh 1.75% rate source | regulatory basis or removal |

### 20.2 Open defects not yet fixed (by design — this phase was audit-only)

All 13 items in `VOLUME_CALCULATOR_AUDIT.md` §6 (severity ranking), plus:
- 3 parallel quantity systems that must be consolidated to one;
- `masterJsonSpec.ts` orphan spec;
- dead code (`rabCostAuditEngine` has no callers; `formulaEngine.recalculateProjectCost` has no callers);
- duplicated regional factor keys;
- rounding scheme collected but never applied;
- `PriceValidationEngine` never called in production;
- 4 price-only engines not yet audited (`ahspCalculationEngine`, `formulaEngine`,
  `deterministicRabDraftEngine`, `automaticRabDraftEngine`).

### 20.3 Definition of Done — honest status

| Requirement | Status |
|---|---|
| All volume calculators inventoried | ✅ 194 + 9 |
| All formulas verified | ⚠️ ~95% (stair, dam/weir factors, server literals outstanding) |
| All units verified | ⚠️ quantity ✅ / price ❌ |
| All conversions verified | ❌ |
| AHSP mapping for every calculator | ❌ 27 of 194 |
| AHSP 2026 mapped | ❌ **BLOCKED** |
| AHSP versioning available | ⚠️ partial |
| Material/labor/equipment prices not hardcoded in calculators | ❌ 24 legacy + 3 engines |
| Prices have source | ❌ 0/6,386 |
| Prices have date | ⚠️ present but bulk-stamped |
| Prices have region | ❌ 3 region strings total |
| Prices have confidence | ❌ hardcoded literals |
| Project location used for regional pricing | ❌ |
| Fallback pricing transparent | ⚠️ partially (3 fabricated defaults) |
| Waste verified | ❌ |
| Overhead verified | ❌ (double-applied, not configurable) |
| Profit verified | ❌ (5%/10%/8% divergence) |
| Tax verified | ❌ (wrong base in 3 paths) |
| SMKK checked when relevant | ❌ never applied |
| Final price has breakdown | ⚠️ yes in `CostCompositionEngine`, but the live summary path has none |
| Historical RAB unaffected by price update | ❌ no snapshot/pinning |
| Price snapshot available | ❌ |
| Golden tests available | ❌ **not built** |
| Unit / integration / TypeScript / build | ✅ (last verified, unchanged) |
| No undocumented hardcoded production price | ❌ |
| No fake 2026 pricing | ❌ currently fake (misattributed source, placeholder specs) |
| No silent fallback | ❌ 3 silent defaults |

**DoD: NOT MET.** Phases A–D delivered; E–L outstanding.

---

## 21. Recommended execution order (with the one decision that unblocks everything)

```
DECISION 1 ── price source for 2026
   (a) import e-HSD PUPR per kabupaten/kota  ← recommended, real, granular, official
   (b) manual QS collection with source documents
   (c) supplier quotations per project

DECISION 2 ── AHSP 2026 attachments
   (a) place the 7 Lampiran in the workspace and ingest with sourcePage  ← recommended
   (b) keep current datasets, relabel verified:false, sourceYear:<stored>

DECISION 3 ── calculation policy ownership
   (a) one CalculationPolicy consumed by every path  ← recommended
   (b) per-engine rates (rejected: this is the current defect)
```

Then, in order:
**E** Price Engine — extend schema (currency/sourceType/sourceUrl/collectedDate/validUntil/confidence/
status), unit guard on resolution, median + outlier rule, kill the 3 fabricated defaults.
**F** Location Engine — thread `project.region` into `resolvePrice`, label every fallback, remove the
`'Surabaya'`/`DKI_JAKARTA` silent defaults.
**G** Calculation Engine — single policy for overhead/profit/tax/SMKK; apply waste exactly once; fix the
tax base; align exports with the stored summary.
**H** Calculator Migration — remove the 24 hardcoded `defaultUnitPrice` values; map the 166 calculators to
AHSP codes; consolidate the 3 quantity systems.
**I** Golden Tests — full chain + extreme cases + no NaN/Infinity/negative/silent-zero.
**J** UX Transparency — expose the full breakdown, price source, date, region, freshness and confidence in
the UI.
**K** Regression — `tsc`, full suite, no test weakened.
**L** Production build.

**Nothing in E–L should start before Decision 1 and Decision 2 are answered**, because both change the
data contracts that E–I depend on.
