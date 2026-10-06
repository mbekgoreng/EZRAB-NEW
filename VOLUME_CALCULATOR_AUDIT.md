# VOLUME_CALCULATOR_AUDIT.md

**Project:** EZRAB (ezrab-v2) · **Audit date:** 2026-09-27 · **Phase A + C of the Master Audit**
**Scope:** every volume/quantity calculator, its formula, units, AHSP link, price source, and defect class.
**Companion files:** `VOLUME_CALCULATOR_AUDIT_INVENTORY.md` (full row-level table),
`PRICE_DATABASE_AUDIT.md`, `PRICE_DATA_GAP_REPORT.md`, `AHSP_2026_MIGRATION_REPORT.md`,
`VOLUME_CALCULATOR_FINAL_REPORT.md`.

---

## 1. Answer to the central question — "why is the price too cheap?"

The audit found the cost chain is wrong in **both directions**, and the dominant direction depends on
which code path the user hits. The Master Prompt's suspicion ("harga akhir terlalu murah") is **confirmed
for specific, reproducible reasons** — none of them cosmetic:

| # | Root cause | Direction | Magnitude | Evidence |
|---|---|---|---|---|
| 1 | **Unit-blind price matching** — AHSP component unit `zak` resolved against a `kg` price (or vice versa) | **underprice** | **~42×** on affected components | `priceResolver.ts:276-329`; `officialHSD2026.ts:14` vs `indonesianPrices.ts:504` |
| 2 | **Regional price never applied from project location** — a Papua project (factor 1.45) is priced at Jabodetabek | **underprice** (non-Java) | up to **~45%** | `priceResolver.ts:464-479,684`; `AhspPriceBridge.ts:98` |
| 3 | **Silent Rp 74,000 default** for unresolvable items | **underprice** for expensive items (a Rp 2.5 M panel shows Rp 74,000) | **~97% under** on that item | `projectPriceEngine.ts:851,935-950` |
| 4 | **SMKK cost never added** | **underprice** | typically 1–3% of contract value | `smkkDataset.ts` merged for search only (`masterRegistry.ts:22`); no money path |
| 5 | **Tax computed on direct cost only** in 3 paths | **underprice** | ~5–10% of total | `deterministicRabDraftEngine.ts:209`; `automaticRabDraftEngine.ts:156`; `LaporanView.tsx:894-897` |
| 6 | **Waste never applied** on the live summary path | **underprice** | 5% typical | no waste term in `unifiedProjectEngine.ts` or either exporter |
| 7 | **Price tables stale (all dated 2026-01-15) with no freshness gate** | **underprice** in an inflating market | market-dependent | 231 + 6,000 records at one date |
| 8 | **Two AHSP price tables disagree 3.56×** for the same code | **both** | 3.56× | `AhspPriceBridge.ts:27` vs `parametricVolumeEngine.ts:200` |
| 9 | **Overhead & profit applied twice** via the Work Item Inspector | **overprice** | **~15%** | `WorkItemInspectorDrawer.tsx:302,474` + `unifiedProjectEngine.ts:31-32` |
| 10 | **Profit rate divergence 5% vs 10%** across engines | **both** | 2× on the profit term | `unifiedProjectEngine.ts:26` vs `rabCostAuditEngine.ts:199` |

**Net effect:** the estimate is not "uniformly too cheap" — it is **unstable and untraceable**. The same
project can come out ~15% high (if items were edited in the inspector) or ~40× low (if a unit mismatch
occurs on a cement component). That is a far more serious finding than a flat under-pricing.

---

## 2. Defect classes from Master Prompt §4 — mapped to evidence

| Class | Found? | Evidence / status |
|---|---|---|
| A. Formula volume salah | ⚠️ partial | Core formulas are correct (prism, trapezoid, prismoidal, rebar). `deterministicQtoEngine` uses unexplained literals (`45.0`, `0.04`, `2.4`) |
| B. Satuan salah | ✅ **YES** | kg vs zak/sak on cement (`officialHSD2026.ts:14` vs `indonesianPrices.ts:504`) |
| C. Konversi satuan salah | ✅ **YES** | `normalizeUnit` collapses `zak→sak` but never relates `sak→kg` (`ahspNormalization.ts:47`) |
| D. Koefisien AHSP salah | ⚠️ unverifiable | cannot be validated without ingesting Lampiran IV–VI → **BLOCKED** |
| E. AHSP outdated | ✅ **YES** | Bina Marga source is a **2024** circular relabelled "Rev 2026" (`sources.ts:22`) |
| F. Material price outdated | ✅ **YES** | 6,231 records all dated `2026-01-15` |
| G. Labor price outdated | ✅ **YES** | same corpus; no per-region labor rates (e-HSD has them) |
| H. Equipment price outdated | ✅ **YES** | 47 generic "Rental Alat Berat" placeholder suppliers |
| I. Waste tidak diterapkan | ✅ **YES** | zero waste terms on the live money path |
| J. Waste diterapkan dua kali | ⚠️ risk | `×1.05` baked into quantity in 3 places (`residentialPackCalculators.ts:784`, `registry.ts:1788`, `calculatorWorkbookMap.ts:323`) while project waste settings are collected but never read |
| K. Overhead tidak diterapkan | ⚠️ inverse | applied, but **always 5%** and user settings are discarded (`ProjectContext.tsx:760`) |
| L. Profit tidak diterapkan | ⚠️ inverse | applied, but **inconsistent 5% vs 10% vs 8%** |
| M. Pajak salah | ✅ **YES** | 11% hardcoded everywhere; wrong base in 3 paths; Excel formula includes PPh while stored value excludes it |
| N. SMKK tidak dipertimbangkan | ✅ **YES** | never wired |
| O. Mapping volume → item RAB salah | ✅ **YES** | 166 calculators have no AHSP mapping |
| P. Material substitute salah | ✅ **YES** | 1-keyword fuzzy match (`priceResolver.ts:305`) |
| Q. Harga per unit salah | ✅ **YES** | Rp 74,000 / Rp 150,000 / Rp 1,150,000 fabricated defaults |
| R. Quantity dikalikan dua kali | ⚠️ risk | inspector writes a marked-up unit price that the rollup treats as direct cost |
| S. Quantity tidak dikalikan sama sekali | ⚠️ | items with `unitPrice = 0` (missing price) still sum into the total without a status gate (`rabCostAuditEngine.ts:197`) |
| T. Harga dasar hardcoded | ✅ **YES** | 24 legacy calculators carry `defaultUnitPrice` |
| U. Harga lama masih default | ✅ **YES** | all HSD records |
| V. Pembulatan terlalu agresif | ⚠️ minor | unit price rounded to integer **before** × large volume (`AhspPriceBridge.ts:115`); rounding scheme collected but never applied |
| W. Transportasi/logistik | ⚠️ partial | `road.material_hauling` computes m³·km but no cost chain consumes it |
| X. Location factor tidak diterapkan | ✅ **YES** | see §1 #2 |
| Y. Material specification mismatch | ✅ **YES** | rebar flat-priced Ø6–Ø16; 135/231 records share one placeholder spec |

**Classes confirmed as real defects: B, C, E, F, G, H, I, M, N, O, P, Q, T, U, X, Y (16 of 25).**
Classes A, D remain unverifiable (A partially verified, D blocked pending official documents).

---

## 3. Formula audit — verdict by family

| Family | Verdict | Notes |
|---|---|---|
| Prism `L×W×H` | ✅ CORRECT | consistent across all packs |
| Trapezoid `((top+bottom)/2)×h×L` | ✅ CORRECT | but implemented **13+ times** (see inventory §6.2) |
| Prismoidal `(H/3)(A1+A2+√(A1A2))` | ✅ CORRECT | embung uses both `H/3` and `H/6` forms in different calculators — **inconsistent choice**, both defensible but undocumented |
| Rebar `d²/162.2` kg/m (π·7850/4·10⁶) | ✅ CORRECT | SNI 2052 based; duplicated in legacy + core |
| Sloped roof `area/cos(pitch)` | ✅ CORRECT | – |
| Stair `calculateStair()` | ⚠️ UNVERIFIABLE from summary | needs dedicated review |
| Dam/weir valley factors `×0.85`, `×0.75`, `×0.8` | ❌ **SUSPECT** | unexplained magic factors with no cited source (`damPackCalculators.ts:35`, `:69`, `:260`, `:323`; `weirPackCalculators.ts:214`) |
| Server QTO literals `45.0`, `0.04`, `2.4`, `0.8×0.8`, `0.25×0.25`, `0.15×0.20` | ❌ **FAIL** | hardcoded assumed dimensions presented as quantities |
| Template `new Function(...)` rules | ❌ **NEEDS_REBUILD** | non-deterministic, no unit model, no validation |

---

## 4. Unit audit

| Aspect | Verdict |
|---|---|
| Quantity units declared per calculator | ✅ yes (`unit` on every `CalculatorDefinition`) |
| Unit normalization engine | ✅ exists (`UnitEngine.normalizeUnit`, `areCompatible`) |
| Unit compatibility checked in cost composition | ✅ yes, warns on mismatch (`costCompositionEngine.ts:95-104`) |
| Unit enforced in **price resolution** | ❌ **NO** — partial-match path ignores unit → the 42× cement defect |
| `sak`/`zak`/`kg`/`ton` conversions | ❌ absent |
| Price unit vs AHSP coefficient unit guard | ❌ absent |

**Verdict: unit handling is sound on the quantity side and broken on the price side.**

---

## 5. AHSP mapping audit

| Group | Count | Mapping | Status |
|---|---|---|---|
| Legacy calculators | 24 | explicit `defaultAhspCode` | ⚠️ mapped but **price is hardcoded alongside it** |
| Core pack calculators | 166 | **none** | ❌ unmapped (§34 violation) |
| Server QTO engines | 8 | hardcoded codes in code | ⚠️ brittle |
| Standalone | 4 | none | ❌ unmapped |

Required chain (Master Prompt §34) — `Calculator → Work Item → AHSP Code → AHSP Version → Components →
Price Database` — is **complete only for the 24 legacy calculators**, and even there the last hop is
bypassed by a hardcoded price.

---

## 6. Severity ranking (what to fix first)

| Rank | Finding | Severity | Why first |
|---|---|---|---|
| 1 | Unit-blind price resolution (42× error) | **CRITICAL** | silently produces absurd line prices |
| 2 | Silent default prices (74,000 / 150,000 / 1,150,000) | **CRITICAL** | fabricates money with a confident label |
| 3 | Regional pricing not applied from project location | **HIGH** | every non-Java project is mispriced |
| 4 | Overhead/profit double-application via inspector | **HIGH** | ~15% overpricing, user-triggerable |
| 5 | SMKK never applied | **HIGH** | mandatory cost element missing |
| 6 | Tax on wrong base in 3 paths + Excel/PPh mismatch | **HIGH** | incorrect totals, inconsistent documents |
| 7 | 24 calculators with hardcoded prices | **HIGH** | violates §10; blocks any price update |
| 8 | 6,231 stale prices with no freshness gate | **HIGH** | market drift with no signal |
| 9 | Zero provenance (0 URLs, 100% placeholders) | **HIGH** | nothing is auditable |
| 10 | 166 calculators unmapped to AHSP | **MEDIUM** | blocks AHSP-based costing |
| 11 | Two AHSP price tables diverging 3.56× | **MEDIUM** | same code, two answers |
| 12 | Duplicated formulas across 13+ files | **MEDIUM** | maintenance risk, divergent fixes |
| 13 | Orphan `masterJsonSpec.ts` + template `new Function` | **MEDIUM** | parallel untrusted quantity systems |
