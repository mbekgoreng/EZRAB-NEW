# PRICE_DATA_GAP_REPORT.md

**Project:** EZRAB (ezrab-v2) · **Audit date:** 2026-09-27 · **Phase D (gap analysis)**
**Purpose:** state exactly what price data exists, what is missing, what is stale, and what must be
verified manually before any 2026 price can be claimed.

---

## 1. What we HAVE (available now, usable)

| Asset | Count | Usable for | Limitation |
|---|---|---|---|
| `officialHSD2026.ts` records | 231 | material/labor/equipment reference | 1 region, 1 date, no spec depth, misattributed source |
| `indonesianPrices.ts` records | 155 | material + labor | 1 region (`Jabodetabek`), 73 records with no supplier |
| `masterMaterials2026.json` | 6,000 | catalogue breadth | self-referential source, all specs contain "Estimasi" |
| `materialDatabaseService` seed | 23 materials | province+city granularity demo | too small to price a project |
| AHSP national datasets (SDA / Bina Marga / Cipta Karya) | 46,629 / 89,726 / 243,198 lines | coefficients | see `AHSP_2026_MIGRATION_REPORT.md` |
| SMKK master | 3,441 lines | SMKK component list | never wired into any money chain |
| Regional cost factors | 8 unique multipliers | regional adjustment | duplicate keys; source undocumented |
| Existing provenance machinery | `pricing/provenance`, `ahsp/provenance`, `cost/provenance` | infrastructure ready | datasets never populate it |

## 2. What is MISSING entirely

| Missing capability | Blocking requirement | Impact today |
|---|---|---|
| `currency` field | §11 schema | silent IDR assumption |
| `sourceType` (market / manufacturer / e-marketplace / government / contract / index) | §12 hierarchy | cannot rank sources |
| `sourceUrl` / `sourceDocument` populated with real documents | §12, §24 | zero auditability |
| `collectedDate` | §14 | freshness impossible to compute |
| `validUntil` on master prices | §14 | prices can never expire |
| `confidence` (HIGH/MEDIUM/LOW/UNKNOWN) | §25 | UI shows fabricated 0.90–0.98 scores |
| `status` (FRESH/AGING/STALE/UNKNOWN) | §14 | always reports `CURRENT` |
| Province → Regency/City granularity for the main corpus | §13 | all prices effectively national/Jabodetabek |
| Real supplier/vendor identity | §12 Level 1–2 | cannot do multi-source validation |
| Outlier detection | §26 | a single bad vendor price propagates |
| Price snapshot at RAB approval | §36 | historical RAB can silently change |
| AHSP version pinning per project | §35 | old projects can drift to new coefficients |
| SMKK cost component in the money chain | §22 | mandatory cost element absent |

## 3. What is STALE or UNVERIFIED

| Item | Current state | Required treatment |
|---|---|---|
| `officialHSD2026.ts` — all 231 records dated `2026-01-15` | 8+ months old at audit date | mark **AGING**; re-collect from e-HSD |
| `masterMaterials2026.json` — all 6,000 records dated `2026-01-15` | 8+ months old | mark **AGING**; re-collect |
| `indonesianPrices.ts` — 102 records at `2026-09-06` | recent but single-region | mark region as `JABODETABEK` explicitly |
| `indonesianPrices.ts` — 53 records at `2026-09-25` | recent | keep, but attach real source |
| `priceSource: 'Katalog Acuan HSD 2026 (SE 12/SE/Db/2026)'` | **misattributed** — SE 12/SE/Db/2026 is a Bina Marga data-collection circular, not an HSD master list | replace citation with e-HSD PUPR + `SE 47/SE/Dk/2026` Lampiran I |
| `sources.ts:9` `'SE DJBK No. 47/SE/Db/2026'` | wrong document number (real: `47/SE/Dk/2026`) | correct the citation |
| `sources.ts:3-68` all five entries `status: 'VERIFIED'` with domain-root URLs | unverifiable "VERIFIED" claim | downgrade to `REVIEW` until a document URL is attached |
| `provenance.confidenceScore` 0.90/0.95/0.98 | fabricated literals | recompute from source type + freshness + region match + spec match |
| Regional factors (8 unique) | undocumented origin | attach source (e.g. BPS IHPB construction index) or remove |

## 4. Authoritative sources to collect from (verified reachable 2026-09-27)

| Priority | Source | What it provides | Granularity |
|---|---|---|---|
| **1** | **e-HSD Kementerian PU — `https://ehsd-pupr.id/hsd/2026`** | Harga Satuan Dasar tenaga / bahan / alat / SMK3, TA 2025/2026 | **per Kota/Kabupaten** (e.g. Kepala Tukang/jam: Demak 20,064; Yogyakarta 17,857; Sleman 21,614) |
| **2** | **SE DJBK No. 47/SE/Dk/2026** (20 Feb 2026) + Lampiran I–VII | AHSP SDA / Bina Marga / Cipta Karya, SMKK cost, price-collection methodology, AHSP proposal procedure | national normative coefficients |
| **3** | `binamarga.pu.go.id/hsd` (e-HSDBM) | Bina Marga basic prices | per unit / divisi |
| **4** | BPS — IHPB bahan bangunan/konstruksi | index adjustment when actual price unavailable | national/provincial index |
| **5** | Regional/provincial price decrees | local reference | province |
| **6** | Project-level supplier quotations / historical contracts | Level 1 & Level 5 of the hierarchy | per project |

> **Rule for the rebuild (Master Prompt §15/§43):** where an actual 2026 price cannot be collected,
> the record must be labelled `Source Year: <year> · Adjusted To: 2026 · Adjustment Method: <method> ·
> Confidence: <level>` or `Price Status: Needs Verification`. **Never** label an estimate as "Harga 2026".

## 5. Manual verification queue (must be done by a human QS, not generated)

1. Every record currently claiming `priceSource: 'SE 12/SE/Db/2026'` (231) — re-source or delete the claim.
2. Every record with `supplier` = generic placeholder (231 HSD + 73 indonesianPrices + 6,000 master).
3. Rebar prices (Ø6–Ø32, polos/ulir, BJTS/BJTP grades) — currently flat-priced across diameters.
4. Cement prices (kg vs zak vs sak) — unit conflict must be resolved before any coefficient is applied.
5. Keramik / baja profil / pipa PVC — 135 HSD records sharing one placeholder specification.
6. Regional factors (8 unique) — attach a published source or remove.
7. All `REGIONAL_REFERENCE` labels — currently produced by a substring heuristic, so national prices are
   mislabelled as regional (`priceResolver.ts:195,673`).

## 6. Data-quality score model (proposed, per Master Prompt §42)

`Data Quality = w1·source_quality + w2·freshness + w3·location_match + w4·spec_match + w5·multi_source + w6·ahsp_mapping`

| Component | Weight | Score rule |
|---|---|---|
| source quality | 25 | Level 1 market = 100, manufacturer = 85, e-marketplace = 70, government reference = 60, contract = 50, index-adjusted = 35, unknown = 0 |
| freshness | 20 | ≤30 days = 100, ≤90 = 75, ≤180 = 50, ≤365 = 25, >365 = 0 |
| location match | 20 | kabupaten match = 100, province = 70, national fallback = 40 |
| specification match | 20 | exact grade/size/diameter = 100, family match = 50, name only = 20 |
| multi-source validation | 10 | ≥3 sources agreeing = 100, 2 = 70, 1 = 40, 0 = 0 |
| AHSP mapping | 5 | explicit code+version = 100, name match = 40, none = 0 |

**Current corpus score (computed from the audit evidence):** source quality 0/25, freshness ≤50/100,
location 40/100, spec ~20/100, multi-source 0/10, AHSP mapping ~40/100 → **≈ 22/100**.

That number is the honest answer to "how good is the price data today". It is not a display bug; it is a
data-provenance gap.
