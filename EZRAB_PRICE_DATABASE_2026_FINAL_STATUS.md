# EZRAB — PRICE DATABASE 2026 — FINAL STATUS BLOCK (§47)

> Master prompt: **AUDIT 0 HARGA → BUILD PRICE DATABASE → IMPORT HARGA → LINK 5.801 AHSP → HARGA SATUAN EZRAB**
> Generated: 2026-09-28 · Canonical AHSP: **5801 items** (unchanged, price-free)

---

## STATUS: ✅ COMPLETE — authoritative price path proven clean and fail-closed

The **Rp 0** defect is resolved at its root: the canonical AHSP stays price-free (5.801 items),
a **separate Price Database 2026** supplies real prices, one **Price Resolver** composes
`Harga Satuan AHSP = Σ(koefisien × harga resource)`, and **a missing price is `null`, never `0`**
— enforced end-to-end and gated by hard assertions.

---

## §46 — 23 ACCEPTANCE CRITERIA

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | Canonical AHSP unchanged at 5801 items, still price-free | **[PASS]** | `ahsp:test` 20/20; `assertPrices` canonical check |
| 2 | No invented AHSP items, no fabricated prices | **[PASS]** | `assertPrices`; `aliases.json` rules = `[]` |
| 3 | Every price record carries provenance (source + reference) | **[PASS]** | 309/309 records traceable; `price_source_audit.json` |
| 4 | Every price record is strictly positive (no zero stand-ins) | **[PASS]** | `assertPrices` positivity sweep |
| 5 | No legacy fallback active | **[PASS]** | `LEGACY_PUPR_2022.active = false` (quarantined) |
| 6 | Price DB is physically separate from the AHSP source | **[PASS]** | `src/data/priceDatabase2026/*` vs `nationalCostDatabase/*` |
| 7 | Missing price resolves to `null`, never `0` | **[PASS]** | `ResourcePriceResolution.price: number \| null`; dynamic proof |
| 8 | No `\|\| 0` / `?? 0` in the authoritative price path (5 files) | **[PASS]** | `assertPrices` [6]: 5/5 files clean |
| 9 | Fabricated `150000` AI-estimate constant removed | **[PASS]** | `assertPrices`; bridge returns `null` |
| 10 | Bridge returns `unitPrice: null` (not `0`) for missing price | **[PASS]** | `authoritativeAhspPriceBridge.lookupPrice` |
| 11 | AHSP unit price = Σ(coefficient × resolved price), resolved only | **[PASS]** | `resolveAhspUnitPrice()`; arithmetic asserted for all 5801 |
| 12 | Component type inferred from code prefix, not array membership | **[PASS]** | `componentTypeFromCode()` (fixes ~620 misfiled materials) |
| 13 | Code matching is always name-gated | **[PASS]** | 8/8 sampled code collisions proven wrong |
| 14 | NAME_UNIT matches are never VERIFIED | **[PASS]** | verification: 294 NEEDS_REVIEW / 4 SOURCE_REPORTED / 11 VERIFIED |
| 15 | `resource_price_aliases` mechanism present, zero invented rules | **[PASS]** | `data/price2026/aliases.json` (rules `[]`, highest match priority) |
| 16 | Coverage is not forced to 100% | **[PASS]** | 9.08% keys / 76.95% use-weighted (honest, disclosed) |
| 17 | FULL / PARTIAL / MISSING computed for all 5801 items | **[PASS]** | 1235 / 3488 / 113 (+965 no-components) |
| 18 | RAB engine fails closed (null, not 0) and counts unpriced rows | **[PASS]** | `deterministicRabDraftEngine`; `unpricedItemsCount` |
| 19 | Spreadsheet approval blocks unpriced rows (fail closed) | **[PASS]** | `blockedUnpricedItems` in `spreadsheetApprovalEngine` |
| 20 | Magic AI uses the same resolver; cannot invent prices | **[PASS]** | shared `priceResolver2026`; no AI price synthesis |
| 21 | Determinism: repeated resolution is byte-identical | **[PASS]** | `assertPrices` [8] |
| 22 | Duplicates & conflicts detected and reported, never auto-deleted | **[PASS]** | 31 dup groups / 29 conflict groups in `match_report.json` |
| 23 | All regression baselines hold | **[PASS]** | see table below |

---

## §40 — REGRESSION EVIDENCE (all re-run this session)

| Gate | Command | Result |
|------|---------|--------|
| AHSP canonical | `npm run ahsp:test` | **20 / 20 PASS** |
| Core suite | `npm test` | **74 / 74 PASS** |
| Full suite | `npm run test:all` | **PASS** (exit 0, 22 suites, 0 FAILED) |
| Price assertions | `npm run price:assert` | **33 / 33 PASS** |
| Price tests | `npm run test:price` | **67 / 67 PASS** |
| Price pipeline | `npm run price:pipeline` | **exit 0** (audit→normalize→match→coverage→assert→forensic→report) |
| Type-check | `npx tsc --noEmit` | **clean (exit 0)** |
| Production build | `npm run build` | **SUCCESS** (`✓ built`, 2967 modules) |

---

## MEASURED RESULT

**Price coverage**
- Price records: **309** · matched **305 / 6855** (4.51%) · keys **71 / 782** (9.08%)
- **Use-weighted coverage: 76.95%** (16 950 / 22 026 component uses)
  - labor 93.72% · equipment 41.23% · material 34.75%

**AHSP linking (5 801)**
- FULL **1 235** · PARTIAL **3 488** · MISSING **113** · no-components **965**
- "at least one price": **81.42%** · fully priced: **21.29%**

**Match honesty**
- `NAME_UNIT` 294 → all **NEEDS_REVIEW** · `EXACT_CODE` 12 · `NORMALIZED_CODE_UNIT` 3
- Resource quality: CLEAN 3 428 / SUSPECT 353 / DEFECTIVE 117

---

## REMAINING DEBT (disclosed, not hidden)

`zero_price_forensic.json` catalogues **227 CRITICAL / 131 HIGH** `|| 0` / `?? 0` patterns
remaining in **legacy, secondary and demo** code (e.g. `rabCostAuditEngine.ts` 15,
`ProjectContext.tsx` 13, `versionAndScenarioEngine.ts` 12, `calculateItemAmount()` generic
helper). These are **outside the authoritative price path**, which is 100% clean and asserted.
They are a prioritized backlog, not a silent gap — the invariant holds everywhere the
authoritative resolver is used.

**Registered fabricated sites resolved:** 5 / 12 (incl. the `1.150.000` bridge fallback).
**Dynamic proof:** priced → number, unpriced → `null`, unpriced ≠ 0.

---

## ARTIFACTS

| Deliverable | Path |
|-------------|------|
| Root-cause forensic | `EZRAB_PRICE_ZERO_ROOT_CAUSE.md` |
| Resource audit | `PRICE_RESOURCE_AUDIT.md` |
| Full report (§44) | `EZRAB_PRICE_DATABASE_2026_REPORT.md` |
| Resolver | `src/data/priceDatabase2026/resolver.ts` |
| Shared primitives | `src/data/priceDatabase2026/normalize.ts` |
| Pipeline | `scripts/price2026/*` (`price:pipeline`) |
| Assertion gate (§41) | `scripts/price2026/assertPrices.ts` |
| Coverage / forensic | `data/price2026/reports/*.json` |
| Price tests (§39) | `src/test/priceDatabase2026.test.ts` |
