# PRICE_DATABASE_AUDIT.md

**Project:** EZRAB (ezrab-v2) · **Audit date:** 2026-09-27 · **Phase D of the Master Audit**
**Method:** static code inspection with literal field-value frequency counts. Every claim cites `file:line`.
**Verdict summary: the price corpus is 100% unprovenanced, 100% single-region, and effectively single-date.**

---

## 1. What exists

| Dataset | File | Records | Category coverage | Unit of region | Distinct dates |
|---|---|---|---|---|---|
| Official HSD 2026 | `src/data/nationalCostDatabase/officialHSD2026.ts` | **231** | material + labor + equipment + SMKK equipment | 1 value: `Nasional / Acuan 2026` | **1** (`2026-01-15`) |
| EZRAB master prices | `src/data/indonesianPrices.ts` | **155** | material + labor | 1 value: `Jabodetabek` | **2** (`2026-09-06` ×102, `2026-09-25` ×53) |
| Master materials (JSON) | `src/data/masterMaterials2026.json` | **6,000** | material | 1 value: `Nasional (Jabodetabek)` | **1** (`2026-01-15`) |
| Material DB (service) | `src/domain/material/materialDatabaseService.ts` | 23 seed materials | material | **province + city** (real) | mixed |
| Regional factors | `src/data/regionalCostFactors.ts` | 10 keys (**8 unique**) | multiplier only | province group | – |
| AHSP national datasets | `nationalCostDatabase/{sda,binaMarga,ciptaKarya}AHSPDataset.ts` | 46k/89k/243k lines | AHSP coefficients | n/a | – |
| SMKK master | `nationalCostDatabase/smkkDataset.ts` | 3,441 lines | SMKK components | n/a | – |

**Total price records sampled: 6,386 — of which 6,386 carry a generic placeholder source (100%).**

---

## 2. Schema compliance (§11 required fields)

| Required field | `PriceItem` (`src/types/index.ts:241-258`) | `PriceDefinition` (`src/engine/pricing/contracts/types.ts:8-39`) |
|---|---|---|
| id | ✅ | ✅ |
| code | ✅ | ✅ (+`codeNormalized`) |
| name | ✅ | ✅ |
| specification | ✅ (but see §6) | ✅ optional |
| brand | ✅ optional | ✅ optional |
| unit | ✅ | ✅ |
| category | ✅ (3 values) | ✅ (5 values) |
| **region** | ⚠️ `location`, **1 value per dataset** | ⚠️ `location`, **1 value** |
| price | ✅ | ✅ |
| **currency** | ❌ | ❌ |
| source | ⚠️ `priceSource` (self-referential) | ⚠️ `priceSource` + `provenance.sourceName` |
| **sourceType** | ❌ | ❌ |
| **sourceUrl** | ❌ | ⚠️ declared (`:16`) but **never populated from any dataset** |
| **sourceDocument** | ❌ | ⚠️ set to `item.specification` (`priceRepository.ts:66`) |
| **effectiveDate** | ❌ (only `lastUpdated`) | ✅ but synthesized default (`priceRepository.ts:61,99`) |
| **collectedDate** | ❌ | ❌ |
| **validUntil** | ❌ | ❌ for master/HSD (only project prices) |
| **confidence** | ❌ | ⚠️ `provenance.confidenceScore` **hardcoded 0.90/0.95/0.98** (`priceRepository.ts:71,109,147,186,307`) |
| **status** | ❌ | ❌ |

**Consequence:** there is no field capable of expressing "FRESH", "regional fallback", "adjusted from 2025"
or "needs verification". The Master Prompt's §14/§15/§25 requirements are structurally unimplementable with
the current schema.

The validator that could enforce a schema — `PriceValidationEngine.validatePrice`
(`src/engine/pricing/validation/priceValidation.ts:19-46`) — only checks `code/name/price/unit` and is
**never called in production**; its only importer is `src/test/ahspPricingCost.test.ts:15`.

---

## 3. Source quality — literal contents (§12)

### `officialHSD2026.ts` (231 records)
- `priceSource`: **231/231 identical** → `'Katalog Acuan HSD 2026 (SE 12/SE/Db/2026)'`
- `supplier`: **231/231 generic placeholders**, only 4 distinct strings:
  - `"Distributor / Pasar Konstruksi 2026"` ×135
  - `"Rental Alat Berat & Kontraktor Lokal"` ×47
  - `"Standar Mandor & Asosiasi Tenaga Kerja"` ×40
  - `"Distributor Safety Equipment SNI"` ×9
- `location`: **231/231** `'Nasional / Acuan 2026'`
- URLs in file: **0**

### `indonesianPrices.ts` (155 records)
- `supplier`: only **82/155** have one; **73/155 have none**. All 49 distinct values are generic category labels (`'Toko Bangunan'`, `'Pabrik Batako Lokal'`…).
- `priceSource`: 16 distinct values; **82/155 = `'EZRAB Master Database 2026'`** (self-referential).
- URLs in file: **0**

### `masterMaterials2026.json` (6,000 records)
- `priceSource`: **6,000/6,000 = `"Master Database Material EZRAB 2026"`** (self-referential).
- `specification`: **6,000/6,000 contain the word "Estimasi"** (e.g. `"Standard | Merk: Roman Ceramics | Estimasi 2026"`).
- URLs in file: **0**

### Source attribution of the cited regulation — **MISATTRIBUTED**
`officialHSD2026.ts:5` cites *"SE 12/SE/Db/2026 & Katalog Master YFarch RAB PRO"*.
External verification (2026-09-27): `SE 12/SE/Db/2026` is a **Direktorat Jenderal Bina Marga** circular on
*technical implementation of basic price data collection* — it is **not** a national HSD master price list,
and it does not cover building/Cipta Karya materials. The authoritative 2026 basic-price source is
**e-HSD Kementerian PU (`https://ehsd-pupr.id/hsd/2026`, TA 2025/2026)** covering tenaga / bahan / alat /
SMK3 **per Kota/Kabupaten**, plus `SE 47/SE/Dk/2026` Lampiran I for the collection methodology.

> Verified live example from the official portal: `Kepala Tukang, per jam — Kabupaten Demak Rp 20.064;
> Kota Yogyakarta Rp 17.857; Kabupaten Sleman Rp 21.614`. This is the granularity EZRAB currently lacks.

**Also mislabelled in code:** `sources.ts:9` writes `SE DJBK No. 47/SE/Db/2026` — the real number is
**47/SE/Dk/2026** (`Dk`, not `Db`). All five entries in `sources.ts:3-68` are marked `status: 'VERIFIED'`
while their `sourceUrl` points at a domain root (`https://jdih.pu.go.id/`), not a document.

---

## 4. Region (§13)

- `officialHSD2026.ts`: **1 distinct location** for 231 records.
- `indonesianPrices.ts`: **1 distinct location** for 155 records.
- `masterMaterials2026.json`: **1 distinct location** for 6,000 records.
- `regionalCostFactors.ts`: 10 keys, **2 are exact duplicates** (`BALI_NTB_NTT`≡`BALI_NUSRA`,
  `KALIMANTAN`≡`KALIMANTAN_IKN`) → **8 unique factors** (`regionalCostFactors.ts:65-86,98-119`).

**Region is never derived from the project.** Three non-project sources are used instead:

1. **Core resolver ignores region entirely** — `priceResolver.ts:464-479` fetches the baseline with
   `projectId` undefined and never filters by region; the returned region is copied from the master record:
   ```ts
   // priceResolver.ts:684
   region: refItem.location,   // "Jabodetabek" even for a Papua project
   ```
   The `location` input is read at `:456` but **never used to select a price**.
2. **Hardcoded default region** — `AhspPriceBridge.ts:98`:
   ```ts
   const loc = locationProvince || locationCity || 'Surabaya';
   ```
   and `regionalCostFactors.ts:144,149-152` falls back to `DEFAULT_REGIONAL_CODE = 'DKI_JAKARTA'`.
3. **Free-text keyword scan** — `detectRegionFromText` (`regionalCostFactors.ts:174-199`).

**Broken propagation:** `WorkspaceView.tsx:616` → `rabTemplateService.ts:1455` `generateRabFromTemplate(...)`
— **the signature has no location parameter at all**, so project location cannot reach the price layer on
the template path. Same for `PriceProvenanceModal.tsx:47-50` and `aiToolRegistry.ts:367-369`.

---

## 5. Freshness (§14)

| Dataset | Records | Distinct dates | Largest identical group |
|---|---|---|---|
| `officialHSD2026.ts` | 231 | 1 | **231 × `2026-01-15` (100%)** |
| `indonesianPrices.ts` | 155 | 2 | 102 × `2026-09-06`, 53 × `2026-09-25` |
| `masterMaterials2026.json` | 6,000 | 1 | **6,000 × `2026-01-15` (100%)** |

No FRESH/AGING/STALE/UNKNOWN computation exists in the pricing engine. The `PriceFreshness` type
(`src/domain/material/types.ts:57-61`) exists but is **hardcoded**:
```ts
// materialDatabaseService.ts:840 (also :917, :977)
freshness: 'CURRENT',
```
So `AGING`/`EXPIRED` counts will always be `0`. The only real expiry logic — `isPriceExpired`
(`projectPriceEngine.ts:618-628`) — applies solely to project prices that carry `validUntil`; **master/HSD
records have no `validUntil` and therefore can never expire.**

---

## 6. Material specification (§17)

**Not reliably distinguished.**

1. **Rebar: diameter in the name, price identical.**
   `indonesianPrices.ts:668-723` — `Ø6 mm`, `Ø8 mm`, `Ø10 mm` all **Rp 12,500/kg** with identical
   `minPrice 11000 / maxPrice 16000`. `:724-777` — `D10`, `D13`, `D16` all **Rp 13,200/kg**.
2. **HSD rebar has no diameter at all:** `officialHSD2026.ts:529` `"Besi beton polos"` Rp 14,500/kg;
   `:543` `"Besi beton ulir"` Rp 15,000/kg — no Ø, no grade.
3. **135 of 231 HSD records share one generic spec string**
   (`"Standar Acuan 2026 (SE 12/SE/Db/2026)"`), including `Keramik lantai` (`:739`), `Baja profil` (`:571`),
   `Pipa PVC` (`:1131`) — none carry size/grade/class.
4. **Name-only fuzzy matching with a 1-keyword floor** (`priceResolver.ts:303-305`):
   ```ts
   if (queryTerms.length > 0 && (matchCount >= Math.ceil(queryTerms.length * 0.5) || matchCount >= 1)) {
   ```
   The `|| matchCount >= 1` clause lets a single shared word qualify a record; the partial path **never
   enforces unit or specification equality** (`:276-329`).

---

## 7. Unit consistency (§8) — **materially broken**

The same physical material carries incompatible units across datasets:

| Material | Dataset | Unit | Price | Evidence |
|---|---|---|---|---|
| Semen Portland | HSD | `kg` | 1,600 | `officialHSD2026.ts:14-16` |
| Semen Portland Komposit | HSD | `kg` | 1,700 | `officialHSD2026.ts:28-29` |
| Semen PCC 50 kg | indonesianPrices | `zak` | 68,000 | `indonesianPrices.ts:504-510` |
| Semen PCC 50kg | Material DB | `sak` | 74,000–78,500 | `materialDatabaseService.ts:188,201-203` |
| Semen Portland | ciptaKarya AHSP | `kg` (coef 25.0) | 1,650 | `ciptaKaryaAHSPDataset.ts:882-888` |
| Semen Portland | indonesianAHSP | `zak` (coef 3.260) | 68,000 | `indonesianAHSP.ts:166` |

`normalizeUnit` collapses `zak`→`sak` (`ahspNormalization.ts:47`) but **does not relate `sak` to `kg`**
(a 50 kg sack ≈ 50× the per-kg price). There is no canonical unit and no conversion factor on `PriceItem`.

**Where this becomes a wrong RAB line** — `costCompositionEngine.ts:213-221` passes the AHSP component unit
into the resolver; the partial-match path ignores unit, so:
```
resolved.price = 1,600 (kg)  ×  coefficient 3.260 (zak/m²)  =     5,216 /m²
correct        = 68,000 (zak) ×  coefficient 3.260          =   221,680 /m²
→ ~42× UNDER-PRICING for that component (and ~42× over-pricing in the reverse direction)
```

---

## 8. Multi-source validation (§26) — **absent**

- `priceResolver.ts:333-341` computes min/max/median but **never selects the median**; selection is
  insertion order (`:373 const best = exactNameMatches[0]`) or highest *name-match* score (`:410`).
- `materialDatabaseService.ts:1344-1345` takes `const basePrice = prices[0]` — first vendor wins.
- `aiPriceSearchService.ts:224-239` computes a median for display only.
- **No outlier detection exists anywhere** (no z-score/IQR/σ logic in the repository).

---

## 9. Overrides (§35) — mechanism sound, three defects

**Mechanism:** project-scoped maps — `projectPriceEngine.ts:49` (`projectOverrides`, persisted to
`localStorage['ezrab_project_overrides_v2']` at `:94`) and `priceRepository.ts:24`
(`projectScopedOverrides`). `setProjectPriceOverride` (`priceRepository.ts:478-494`) builds a **copy** and
writes only to the project map → **the master database cannot be corrupted by an override.** ✅

**Defects:**
1. **No validation** — `projectPriceEngine.ts:276-314` never checks `price < 0 || isNaN(price)` (unlike
   `setProjectPrice` at `:157-159`); `Math.round(price)` at `:306` can store `NaN`/negative, later returned
   with `confidence: 1.0, isFinal: true` (`:549-578`).
2. **Overrides never expire** — `ProjectPriceOverride` has no `validUntil` (`contracts/types.ts:274-294`), so
   an override permanently outranks a fresher quotation.
3. **Global mutable singletons** — `PriceRepository` (`:19-35`) and `ProjectPriceEngine` (`:42-135`) are
   process-wide; `addCustomPrice`/`updatePrice`/`deletePrice` mutate the shared master with no project scope,
   and the localStorage keys are global to the browser profile.

---

## 10. Silent default prices — **the single most dangerous pattern found**

`projectPriceEngine.resolveFinalPrice` invents a price when nothing resolves:
```ts
// projectPriceEngine.ts:851
const nationalRefPrice = options.fallbackReferencePrice !== undefined ? options.fallbackReferencePrice : 74000;
// :935-950 — TIER 3
return { price: nationalRefPrice, unit: defaultUnit, source: 'EZRAB_REFERENCE',
         status: 'REFERENCE', isFinal: true, confidence: 0.95,
         explanation: 'Harga acuan standar database master EZRAB', ... };
```
This is displayed as the "national reference" in the UI:
```ts
// MaterialInspectorPanel.tsx:804-807 (no fallbackReferencePrice passed)
const resolved = projectPriceEngine.resolveFinalPrice({ materialIdOrCode: ..., projectId });
// :822
Rp {(basePrice > 0 ? basePrice : 74000).toLocaleString('id-ID')}
```
→ a `Panel listrik` (HSD `M-118`, **Rp 2,500,000**, `officialHSD2026.ts:1646-1658`) displays as **Rp 74,000**.

Additional fabricated defaults:
| Value | Location | Label shown to user |
|---|---|---|
| 150,000 | `AhspPriceBridge.ts:120` | `priceSource: 'ai_estimate'`, `ahspStatus: 'needs_verification'` |
| 150,000 | `automaticRabDraftEngine.ts:133` | `defaultEstimatedPrice` |
| 150,000 | `parametricVolumeEngine.ts:242` | `source: 'CUSTOM'` |
| 1,150,000 | `authoritativeAhspPriceBridge.ts:183` | `item.unitPrice \|\| (...) \|\| 1150000` |

Counter-example (correct behaviour to copy): `authoritativeAhspPriceBridge.ts:134-142` returns
`priceStatus: 'PRICE_NOT_FOUND', unitPrice: 0, status: 'PRICE_MISSING'` — fail-closed, never fabricates.

---

## 11. TOP 10 PRICE-LAYER DEFECTS (by severity)

| # | Defect | Evidence | Direction of error | Minimal fix |
|---|---|---|---|---|
| **1** | Silent Rp 74,000 default surfaced as "national reference" | `projectPriceEngine.ts:851,935-950`; `MaterialInspectorPanel.tsx:804,822` | both (under & over) | Require explicit `fallbackReferencePrice`; else return `PRICE_NOT_FOUND` |
| **2** | Unit-blind fuzzy match (kg vs zak vs ton) | `priceResolver.ts:276-329,392-425` | **~42× underprice** | Enforce unit equality on partial path; add `sak↔kg` factor |
| **3** | Region never derived from project | `priceResolver.ts:464-479,684`; `rabTemplateService.ts:1455`; `WorkspaceView.tsx:616` | mispriced outside Java | Thread `project.region` into `resolvePrice`; apply regional factor at return boundary |
| **4** | Single hardcoded date + region per dataset; no freshness | 231×`2026-01-15`; 155×`Jabodetabek`; 6,000×`2026-01-15` | stale prices applied silently | Add `collectedDate`/`validUntil`; compute FRESH/AGING/STALE and gate usage |
| **5** | 1-keyword match floor admits wrong materials | `priceResolver.ts:305` | both | Require ≥0.6 term match + unit + spec overlap |
| **6** | Spec-insensitive pricing (135/231 share one spec; flat rebar price) | `officialHSD2026.ts:531,545`; `indonesianPrices.ts:668-777` | both | Add `diameter`/`grade`/`size` fields with distinct prices |
| **7** | Overrides unvalidated and never expire | `projectPriceEngine.ts:276-314`; `contracts/types.ts:274-294` | both | Validate finite `price > 0`; add `validUntil` |
| **8** | Zero provenance: 0 URLs, 100% generic placeholders | 231 + 155 + 6,000 records | unverifiable | Populate `sourceUrl`/`sourceDocument`/`supplierName`; reject records without them |
| **9** | Required schema fields missing; validator never runs in production | `types/index.ts:241-258`; `priceValidation.ts` (test-only importer) | governance gap | Extend schema; call validator on ingest and reject failures |
| **10** | No multi-source triangulation; no outlier flag | `priceResolver.ts:373,410`; `materialDatabaseService.ts:1344` | both | Select median of same-material/same-unit vendors; flag ±30% outliers |

**Secondary:** national HSD mislabelled `REGIONAL` because `priceSource.includes('SE')`
(`priceResolver.ts:195,673`); duplicate regional factors (`regionalCostFactors.ts:65-119`);
`volumeTechnicalReferences.ts` carries no prices (not a price source).

---

## 12. What is actually GOOD (do not rebuild these)

- `CostCompositionEngine` — Decimal arithmetic, unit compatibility check, per-component provenance,
  execution trace, fails closed on missing `projectId` (`costCompositionEngine.ts:40-60,91-104`).
- `authoritativeAhspPriceBridge.ts:93-142` — explicit `NOT_FOUND` / `PRICE_NOT_FOUND` / `PRICE_MISSING`.
- `PriceRepository.setProjectPriceOverride` — copy-on-write, project-scoped, master-safe.
- `UnitEngine` / `PrecisionEngine` — explicit normalization and rounding policy objects.
- `nationalCostDatabase/types.ts` — a genuinely good AHSP schema (`NationalAHSPItem` with
  labor/material/equipment component arrays, `sourceId`, `sourcePage`, `dataQualityScore`).
- The 6,000-record material catalogue — the **volume** is there; what is missing is provenance, region,
  dates and specification depth.
