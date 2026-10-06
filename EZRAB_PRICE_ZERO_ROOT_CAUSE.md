# EZRAB — PRICE ZERO ROOT CAUSE

**Phase 1 deliverable** · Date: 2026-09-28 · Repo: `D:/file kerja/PEMBUATAN SOFTWARE/ezrab site web`
**Scope:** explain, with evidence, why AHSP/resource prices render as **Rp 0** in EZRAB.
**Invariant:** canonical AHSP (5.801 items) is **not modified** by this investigation.

---

## 0. HEADLINE

> Prices show **Rp 0** for **three independent reasons that compound**:
>
> 1. **The canonical AHSP is price-free by design** — every `unitPrice` is `0` and no component
>    carries a price. That is correct and intentional.
> 2. **The price layer cannot reach most canonical resources.** The 3.898 canonical resources
>    live in a *different code space* than every price source in the repo, and **2.381 of them
>    (61.1%) have no code at all**. Code-based lookup therefore resolves only **44,9%** of
>    component rows — and only **22,3%** once the unit must also agree.
> 3. **Missing is converted to zero at three layers** (engine, contract, UI). So an *unresolved*
>    price is indistinguishable from a *genuine* Rp 0.
>
> **Therefore Rp 0 is not one bug — it is a missing price layer plus a null→0 leak.** Fixing the
> UI alone (which the brief forbids) would only hide it.

---

## 1. THE COMPLETE PATH (traced)

```
OFFICIAL AHSP 2026 (canonical, price-free)          ← unitPrice = 0, component.unitPrice = undefined
   │
   ├─ ahsp2026Canonical.generated.ts  (5.801 items)
   │     laborComponents / materialComponents / equipmentComponents
   │     each row: { code, name, unit, coefficient }   ← NO PRICE. correct.
   │
   ▼
AHSPRepository.initializeAuthoritativeDatasets()      ← ingests canonical only
   │
   ▼
CostCompositionEngine.compose()
   │   processComponents() → priceResolver.resolve({code, name, category, unit}, ctx)
   │
   ▼
PriceResolver.resolve()
   │   TIER 2: repository.getByCode(normalizedCode)   ← CODE SPACE MISMATCH HERE
   │   TIER 3: name+unit scan over 6.574 master rows
   │
   ▼
PriceRepository (6.574 rows from 8 heterogeneous sources, 5 code spaces)
   │
   ▼
❌ RESOLUTION FAILS  →  `unitPrice = 0`  (engine default)
   │
   ▼
CostCompositionResult.unitCost = 0, directCost = 0     ← plain number, no null, no status
   │
   ▼
RabAdapter / UI  →  `formatCurrencyIDR(x || 0)`  →  **Rp 0**
```

---

## 2. THE TEN REQUIRED QUESTIONS

### 1. From where do AHSP resources come?
`src/data/nationalCostDatabase/ahsp2026CanonicalResources.generated.ts`
(`AHSP_2026_CANONICAL_RESOURCES`, **3.898** rows), projected from
`data/ahsp2026/validated/ahsp_2026_resources.json`, which was parsed from SE DJBK No. 47/SE/Dk/2026
annexes III/IV/V/VI. Each row: `{ resource_id, code, name, type, unit, category, source_ahsp_codes, duplicate_status }`.

Measured composition and **code presence**:

| type | rows | rows with **no** code | distinct codes |
|---|---:|---:|---:|
| material | 2.386 | **1.462** | 575 |
| equipment | 1.205 | **900** | 124 |
| labor | 307 | **19** | 59 |
| **total** | **3.898** | **2.381 (61,1%)** | 758 |

> **2.381 resources can never be matched by code** — they carry only a name, a unit and a type.

### 2. Where is the price looked up?
`src/engine/pricing/resolver/priceResolver.ts`
- `resolve()` — TIER 1 project override → TIER 2 exact code in `PriceRepository` → TIER 3 exact
  normalized name + unit → keyword similarity.
- `resolvePrice()` — the project/override-aware variant (used by the project price UI).

The authoritative lookup is `PriceRepository.getByCode(PriceNormalizationEngine.normalizeCode(code))`.

### 3. Is the price database empty?
**No — but it is in the wrong key space.** `PriceRepository.count()` = **6.574** rows, built from
eight sources:

| # | Source | Rows | Code space | Unit space |
|---|---|---:|---|---|
| 1 | `OFFICIAL_HSD_2026_ITEMS` | 231 | `M-001` … | kg, m3, … |
| 2 | `MASTER_PRICE_ITEMS` | 155 | `KP.001` … | m², … |
| 3 | `MASTER_AHSP_DATABASE` components (**legacy Permen PUPR 2022**) | — | `L.01`, `M.001` … | OH, … |
| 4 | `ALL_OFFICIAL_AHSP_ITEMS` components | **0 useful** | — | — |
| 5 | `MaterialLibraryService` | 28 | `MAT-KER-ROM-60` | m2 |
| 6 | `MaterialDatabaseService` | 6.167 | `MAT-BLD-CEM-0001` | sak, m3 |
| 7 | `LaborDatabaseService` | 85 | `L.MAN-00` | OH |
| 8 | `EquipmentDatabaseService` | 37 | `E.01` | jam |

**Source 4 is dead code**: it filters `component.unitPrice > 0`, and the canonical catalog has no
component prices — so it contributes **zero** rows.

**The canonical code space is different from all eight.** Canonical resources use the *source PDF's*
internal codes: `M12`, `M170`, `M246`, `L03`, `E23`, `EI311`, `G.16`, `T.27`. No price source uses
that space.

### 4. Does the price lookup return null?
Partly. Two different contracts disagree:
- `PriceResolver.resolve()` → returns `PRICE_NOT_FOUND` **with no `resolvedPrice`** (correct).
- `PriceResolver.resolvePrice()` → **TIER 9 returns `price: 0`** with `status: 'NOT_FOUND'`
  (`priceResolver.ts`, ~line 766). The `status` is honest; the **`price` field is not** — it is a
  number that cannot be distinguished from a real zero by any consumer that reads `.price`.

### 5. Is null converted to zero?
**Yes — at three layers.**

| Layer | Location | Behaviour |
|---|---|---|
| Engine | `costCompositionEngine.ts` `processComponents()` | on failure sets `let unitPrice = 0` and pushes a *string* warning |
| Engine | `costCompositionEngine.ts` `compose()` | `unitCost` / `directCost` are plain `number`; no `pricingStatus`, no null |
| Contract | `priceResolver.ts` TIER 9 | `price: 0` for `NOT_FOUND` |
| Server | `authoritativeAhspPriceBridge.ts` `lookupPrice()` | `unitPrice: 0` for `PRICE_NOT_FOUND` |
| UI | ~25 components | `unitPrice \|\| 0` → `formatCurrencyIDR(0)` → **"Rp 0"** |

Measured component-row resolution (29.320 rows over 872 distinct `code|unit` keys):

| metric | rows | share |
|---|---:|---:|
| resolved by **code** | 13.158 | 44,9% |
| resolved by **code + unit** | 6.543 | 22,3% |
| **unresolved** | 16.162 | **55,1%** |

### 6. Do resource codes fail to match?
**Yes — this is the primary data defect.** Top unresolved canonical codes by frequency:

| freq | type | canonical code\|unit | name |
|---:|---|---|---|
| 727 | labor | `L03\|jam` | Mandor |
| 713 | labor | `L01\|jam` | Pekerja |
| 403 | labor | `L02\|jam` | Tukang Batu |
| 204 | material | `M12\|Kg` | Semen |
| 187 | material | `M170\|Ltr` | Air |
| 164 | equipment | `E23\|Jam` | Water Tank Truck |
| 148 | labor | `M03\|M3` | Aggregat Kasar *(mislabelled type in source)* |
| 111 | equipment | `E11\|Jam` | FLAT BED TRUCK 4 TON |

None of `L01/L02/L03`, `M12`, `M170`, `E23` exist as keys in `PriceRepository`.

### 7. Do units differ?
**Yes — a second, independent blocker.** Even where the code matches, the unit often does not:

```
UNIT-DIFF labor L.01  want=OH   got=oj
UNIT-DIFF labor L.04  want=OH   got=oj
```

Canonical labor units are `OH` (orang-hari) and `jam`; the price layer carries `oj`
(orang-jam), `Jam`, `jam`. `PriceNormalizationEngine.normalizeUnit` does **not** unify
`OH` ↔ `oj` ↔ `Jam`. So a labour code can resolve by code and still be rejected by the unit
guard — or worse, be accepted with a per-hour price treated as a per-day price (a ~7× error).

This is the same defect class as the historical `zak` ↔ `kg` cement bug that mispriced cement by
roughly 42× (already documented in `docs/phase1-fabricated-price-freeze.md`).

### 8. Is location unavailable?
**Yes — no location model exists for resources.** `PriceDefinition.location` is a free-text string
(`'Nasional / Acuan 2026'`, `'Jabatodetabek'`, `'Proyek'`). There is no province/regency code, no
`location_level`, and no way to ask for "Kabupaten Pasuruan". Prices are effectively national-only.

### 9. Is period/year unavailable?
**Partly.** `PriceDefinition.periodVersion` is a free-text string (`'2026-Q1'`, `'2022-Q1'`,
`'2026.1'`). There is no `period_year` / `period_month` / `effective_from` / `effective_to`, so
"September 2026" cannot be requested, and period fallback cannot be reasoned about.

### 10. Does the UI itself force a fallback to 0?
**Yes.** `unitPrice || 0` appears across ~25 components. Worst offenders:

| file | line | code |
|---|---:|---|
| `ahsp/AhspExplorerView.tsx` | 1632 | `formatCurrencyIDR((addToRabModalItem.unitPrice \|\| 0) * …)` |
| `document/RabReviewWorkspaceModalView.tsx` | 1494 | `formatCurrencyIDR(ahsp.unitPrice \|\| 0)` |
| `document/RabReviewWorkspaceModalView.tsx` | 1473 | `handleSelectAhspFromDb(…, ahsp.unitPrice \|\| 0)` |
| `estimator/SmartAddWorkItemModal.tsx` | 199, 252, 1141 | `ahsp.unitPrice \|\| 0` |
| `estimator/EstimatorAhspView.tsx` | 143, 283, 316 | `item.unitPrice \|\| 0`, `(l.unitPrice \|\| 0)` |
| `inspector/WorkItemInspectorDrawer.tsx` | 183-184 | `resolvePrice(c.name, c.unitPrice \|\| 0)` |

`WorkItemInspectorDrawer.tsx:183` is worse than a zero-fallback: it calls a **name-based
`resolvePrice(c.name, …)`** helper inside the UI, i.e. the UI performs its own price lookup instead
of using the authoritative resolver.

Because the canonical catalog is price-free, `ahsp.unitPrice` is **always 0**, so every one of these
sites deterministically renders **"Rp 0"**.

---

## 3. SECONDARY DEFECTS FOUND

| # | Defect | Location | Severity |
|---|---|---|---|
| S1 | **Hardcoded fabricated price `150000`** returned when `isAiFallbackAllowed` | `authoritativeAhspPriceBridge.ts` `lookupPrice()` | **critical** — invents a price |
| S2 | Legacy **Permen PUPR 2022** component prices ingested as first-class 2026 prices | `priceRepository.ts` step 3 (`MASTER_AHSP_DATABASE`) | high — superseded baseline re-entering through the price door |
| S3 | Dead ingest path (`component.unitPrice > 0` never true) | `priceRepository.ts` step 4 | medium |
| S4 | UI performs its own name-based price resolution | `WorkItemInspectorDrawer.tsx:183` | high |
| S5 | Unit guard is warning-only; mismatched units still price | `priceResolver.ts` | high — silent 7×/42× error |
| S6 | Name-keyword similarity can select a price with only 1 matching word | `priceResolver.ts` (`matchCount >= 1`) | high — anti-pattern |

---

## 4. WHAT THE FIX MUST BE (design consequences)

The brief's target architecture is the right one. Concretely, the missing pieces are:

1. **A separate price layer keyed by canonical resource identity** —
   `(resourceCode, unit, location, period, source)`, never by name alone.
2. **An explicit, auditable resource→price matching + alias step** that is allowed to leave
   resources **unmatched** (unmatched ⇒ `null` + `NEEDS_REVIEW`, never a guessed price).
3. **A deterministic `resolveResourcePrice()`** that returns `price: number | null` and always
   reports `requestedLocation` / `resolvedLocation` / `fallback` / `period`.
4. **`pricingStatus: FULL | PARTIAL | MISSING`** propagated from the cost engine to the RAB and the UI.
5. **Deletion of the three null→0 conversions** and of the fabricated `150000`.
6. **UI that renders status, not zero** — `Rp 0` only when the source genuinely says 0.

**Not** in scope: regenerating or editing the canonical AHSP. It stays at 5.801, untouched.

---

## 5. VERIFICATION COMMANDS USED

```bash
npx tsx scripts/price2026/_diag.ts    # coverage + code-space histogram
npx tsx scripts/price2026/_diag2.ts   # source code-space comparison
```

Raw measured output is reproduced in §2.6/§2.3 above and re-emitted by
`npm run price:audit` → `data/price2026/reports/price_source_audit.json`.

**END OF ROOT-CAUSE REPORT.**
