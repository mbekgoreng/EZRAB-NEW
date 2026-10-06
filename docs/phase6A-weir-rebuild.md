# PHASE 6A — WEIR/BENDUNG FORENSIC COST REBUILD REPORT

## Executive Summary

The Weir Body calculator previously displayed **Rp 17,500,000** for 350 m³ of weir body volume — a price derived from a **Rp 50,000/m³ fallback** in `QtoCalculatorView.tsx` line 967. This was catastrophically underpriced.

The forensic rebuild replaces this with a **14-step cost pipeline** that traces every rupiah from geometry inputs through AHSP coefficients, verified resource prices, and markup policy to a final cost of approximately **Rp 1.21 billion** for the golden case (L=25, H=3.5, Wc=2, Wb=6).

**Root Cause:** `m.unitPriceEstimate || 50000` — the weir body material name "Beton Siklop K-225 / Pasangan Batu Kali 1:3 Tubuh Bendung" matched no keyword branch and no MASTER_PRICE_ITEMS entry, falling to the 50,000 fallback. 350 × 50,000 = 17,500,000.

**Fix:** A completely new `src/engine/weir/` domain with 5 engine files, 10 test files (176 tests, 0 failures), 2 UI components, and full integration into `QtoCalculatorView.tsx`.

---

## 1. Root Cause Trace

```
QtoCalculatorView.tsx:967
  → m.unitPriceEstimate || 50000     ← FALLBACK
  → 350 m³ × Rp 50,000/m³
  → Rp 17,500,000                    ← WRONG
```

The material name `Beton Siklop K-225 / Pasangan Batu Kali 1:3 Tubuh Bendung`:
- Does NOT match any `MASTER_PRICE_ITEMS` entry
- Does NOT match keyword branches: Besi, Kawat, Kayu, Paku, Semen, Pasir, Batu, Cat, Cat
- Falls through to `m.unitPriceEstimate || 50000`
- `unitPriceEstimate` is undefined → defaults to 50,000

---

## 2. Rebuilt Cost Pipeline (14 Steps)

| Step | Stage | What It Does |
|------|-------|-------------|
| 1 | Geometry | `Area = ((Wc + Wb) / 2) × H` → 14 m² |
| 2 | Quantity | `Volume = Area × L` → 350 m³ |
| 3 | Work Item | Maps to 5 items: concrete, rebar, formwork, joint, waterstop |
| 4 | AHSP Mapping | Exact code lookup (no fuzzy) → 5 AHSP definitions |
| 5 | Coefficient | Extracts labor/material/equipment coefficients from AHSP |
| 6 | Resource | Lists all resources with codes and units |
| 7 | Unit Validation | Validates: Qty Unit → AHSP Unit → Coeff Unit → Price Unit |
| 8 | Price Resolution | Looks up verified prices from SE 12/SE/Db/2026 (no fallback) |
| 9 | Direct Cost | `Σ(coeff × price) × qty` per work item |
| 10 | SMKK | `directCost × smkkPercent%` (WARNING if 0) |
| 11 | Overhead | `directCost × 5%` |
| 12 | Profit | `directCost × 5%` |
| 13 | Tax | `(D + SMKK + OH + P) × 11%` |
| 14 | Final Cost | `D + SMKK + OH + P + T` |

---

## 3. Golden Case Results

**Input:** L=25m, H=3.5m, Wc=2.0m, Wb=6.0m

**Geometry:** Area = 14 m², Volume = 350 m³

**Cost Summary (service):**
| Component | Amount (Rp) |
|-----------|-------------|
| Labor Cost | ~145,087,900 |
| Material Cost | ~838,835,150 |
| Equipment Cost | ~7,262,500 |
| **Direct Cost** | **~991,185,550** |
| Overhead (5%) | ~49,559,279 |
| Profit (5%) | ~49,559,279 |
| Tax (11%) | ~119,933,452 |
| **Final Cost** | **~1,210,237,560** |

**Oracle Cross-Validation:** Independent oracle (raw multiplication, no shared code) matches within Rp 50,000 tolerance (0.004%).

**Data Confidence:** Grade B (all prices verified, 1 reference estimate for rebar ratio)

**No Double Markup:** PASS (overhead, profit, tax each applied exactly once)

---

## 4. Files Created

### Engine (5 files)
| File | Purpose |
|------|---------|
| `src/engine/weir/weirTypes.ts` | Strongly typed interfaces for entire Weir cost domain |
| `src/engine/weir/weirAhspDatabase.ts` | 5 canonical AHSP definitions (exact code lookup, no fuzzy) |
| `src/engine/weir/weirPriceDatabase.ts` | 14 verified prices from SE 12/SE/Db/2026 (no fallback) |
| `src/engine/weir/weirCostService.ts` | Main 14-step cost pipeline with audit trail |
| `src/engine/weir/weirOracle.ts` | Independent oracle for cross-validation |

### Tests (10 files, 176 tests, 0 failures)
| File | Tests | What It Validates |
|------|-------|-------------------|
| `phase6AWeirGeometry.test.ts` | 9 | Golden case geometry, edge cases, formula steps |
| `phase6AWeirAhspMapping.test.ts` | 16 | AHSP database integrity, exact matching, no fuzzy |
| `phase6AWeirUnitChain.test.ts` | 13 | Unit validation, illegal conversions rejected |
| `phase6AWeirPriceResolution.test.ts` | 15 | Price database integrity, no fallbacks, provenance |
| `phase6AWeirCostBreakdown.test.ts` | 17 | Cost summary structure, D=L+M+E, F=D+SMKK+OH+P+T |
| `phase6AWeirNoFallbackPrice.test.ts` | 17 | No 50k/74k/150k/1.15M fallbacks, no "PUPR" source |
| `phase6AWeirNoDoubleMarkup.test.ts` | 17 | Overhead/profit/tax applied once, no compounding |
| `phase6AWeirIndependentReconciliation.test.ts` | 16 | Oracle matches service within tolerance |
| `phase6AWeirSnapshot.test.ts` | 22 | Golden case deterministic snapshot |
| `phase6AWeirNegative.test.ts` | 34 | 12 failure scenarios all fail safely |

### UI (2 files)
| File | Purpose |
|------|---------|
| `src/components/weir/WeirCostSummaryPanel.tsx` | Full cost breakdown, Pareto, assumptions, confidence |
| `src/components/weir/WeirAuditTrailPanel.tsx` | 14-step expandable audit trail |

### Integration
- `src/components/qto/QtoCalculatorView.tsx` — imports WeirCostService, renders panels when `selectedCalcId === 'weir.body'`, hides old fallback price box

---

## 5. AHSP Database (5 Definitions)

| Code | Name | Unit | Components |
|------|------|------|------------|
| `3.1.(1)` | Beton Siklop K-225 Struktur Tubuh Bendung | m³ | 3 labor, 3 material, 2 equipment |
| `BINA_MARGA_3.2.(1)` | Baja Tulangan BJTS 420B | kg | 2 labor, 2 material |
| `BINA_MARGA_3.3.(1)` | Acuan Bekisting Struktur Masif | m² | 2 labor, 2 material |
| `SDA_JOINT_01` | Sambungan Dilatasi Bendung | m | 2 labor, 1 material |
| `SDA_WATERSTOP_01` | Pemasangan Waterstop PVC 200mm | m | 2 labor, 1 material |

**Lookup:** Exact code match only. `lookupWeirAhsp('3.1')` returns `undefined` (no partial match).

---

## 6. Price Database (14 Verified Prices)

| Code | Name | Price | Unit | Source |
|------|------|-------|------|--------|
| L.01 | Pekerja | 115,000 | OH | SE 12/SE/Db/2026 |
| L.02 | Tukang Batu/Besi/Kayu | 145,000 | OH | SE 12/SE/Db/2026 |
| L.04 | Mandor | 165,000 | OH | SE 12/SE/Db/2026 |
| M.01 | Semen Portland | 1,600 | kg | SE 12/SE/Db/2026 |
| M.02 | Pasir Beton | 260,000 | m³ | SE 12/SE/Db/2026 |
| M.03 | Batu Pecah 2/3 | 290,000 | m³ | SE 12/SE/Db/2026 |
| M.04 | Besi Beton Ulir BJTS 420B | 15,200 | kg | SE 12/SE/Db/2026 |
| M.05 | Kawat Beton | 24,000 | kg | SE 12/SE/Db/2026 |
| M.06 | Kayu Papan Bekisting | 3,100,000 | m³ | SE 12/SE/Db/2026 |
| M.07 | Paku 5-10 cm | 22,000 | kg | SE 12/SE/Db/2026 |
| M.08 | Joint Filler Sambungan | 85,000 | m | SE 12/SE/Db/2026 |
| M.09 | Waterstop PVC 200mm | 145,000 | m | SE 12/SE/Db/2026 |
| E.01 | Concrete Mixer 0.35 m³ | 55,000 | jam | SE 12/SE/Db/2026 |
| E.02 | Concrete Vibrator | 35,000 | jam | SE 12/SE/Db/2026 |

**Rules:**
- `lookupWeirPrice('UNKNOWN')` returns `null` — NEVER a fallback
- No price equals 50,000, 74,000, 150,000, or 1,150,000
- No source uses generic "PUPR" or fabricated "Estimasi Standar"
- All entries have: sourceDocument, region, year, effectiveDate, confidence

---

## 7. Invariants Enforced

| Invariant | Status | How |
|-----------|--------|-----|
| No fallback price | ✅ | `lookupWeirPrice` returns null for unknown codes |
| No fuzzy AHSP matching | ✅ | `lookupWeirAhsp` uses exact Map.get() |
| No silent unit conversion | ✅ | `UnitEngine.areCompatible` rejects m³→kg |
| No double overhead | ✅ | `checkNoDoubleMarkup` verifies per-item |
| No double profit | ✅ | `checkNoDoubleMarkup` verifies per-item |
| No double tax | ✅ | Tax on (D+SMKK+OH+P), not on final |
| No Surabaya/Jakarta substitution | ✅ | `resolveRegion` returns raw input for unknown |
| Fail-closed on missing data | ✅ | `PRICE_NOT_FOUND` / `AHSP_NOT_FOUND` status |
| Engineering assumptions exposed | ✅ | `assumptions[]` with type and note |
| Data confidence graded | ✅ | A/B/C/D/BLOCKED based on evidence |

---

## 8. Independent Oracle Reconciliation

The `WeirIndependentOracle` computes expected costs using **only** `lookupWeirAhsp` and `lookupWeirPrice` — it does NOT import `CentralDeterministicCostEngine` or `WeirCostService`.

| Metric | Service | Oracle | Diff |
|--------|---------|--------|------|
| Direct Cost | 991,185,550 | 991,194,113 | 8,563 (0.001%) |
| Labor Cost | 145,087,900 | 145,091,716 | 3,816 |
| Material Cost | 838,835,150 | 838,839,897 | 4,747 |
| Final Cost | 1,210,237,560 | 1,210,248,015 | 10,455 |

**Tolerance:** Rp 50,000 (0.004% of total) — accounts for rounding differences between `SafeDecimalEngine.safeMultiply` (per-component rounding) and raw float multiplication.

---

## 9. Regression Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ Clean (0 errors) |
| `npm run build` | ✅ Success (56s) |
| All 10 Phase 6A test suites | ✅ 176 passed, 0 failed |

---

## 10. Scope Compliance

This rebuild covers **ONLY** the Weir/Bendung calculation domain. No other calculators were modified. The old `priceBreakdown` useMemo in `QtoCalculatorView.tsx` remains intact for non-weir calculators — it is simply hidden when `selectedCalcId === 'weir.body'` and the `weirCostResult` is available.

---

## 11. Key Architectural Decisions

1. **Separate domain module** (`src/engine/weir/`) — not mixed into existing cost engines
2. **Exact code lookup** — Map.get() with string keys, no normalization, no fuzzy matching
3. **Per-item cost computation** — each work item gets its own overhead/profit/tax, then summed
4. **Quantity multiplication in service layer** — CentralDeterministicCostEngine returns per-unit costs; the service multiplies by quantity (matching the oracle)
5. **Independent oracle** — separate file, separate computation path, shared only with price/AHSP databases

---

*Report generated: 2026-09-27*
*Phase 6A — Weir/Bendung Forensic Cost Rebuild*
*EZRAB Civil Calculator*
