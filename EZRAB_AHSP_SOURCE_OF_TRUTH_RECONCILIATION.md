# EZRAB — FINAL AHSP SOURCE-OF-TRUTH RECONCILIATION

**Forensic Report (§19) + Final Acceptance Checklist (§20)**
Date of run: 2026-10-01 · Scope: AHSP source-of-truth unification (no DED/RAB rebuild)

---

## 0. Executive Verdict

The forensic finding in the brief is **CONFIRMED and FIXED**.

EZRAB maintained **two independent reads of "AHSP"**:

| Consumer | Read (BEFORE) | Dataset |
|---|---|---|
| **Matcher** (`ahspMatcher`) | `getAHSPDatabase()` | legacy view: `ALL_OFFICIAL_AHSP_ITEMS` projected through `CostDatabaseEngine.toLegacyAHSPItem()` **+ localStorage overlay** |
| **Validator + Price** (`dedRabValidationGate`, `ahspPriceResolver`) | `ALL_OFFICIAL_AHSP_ITEMS` | canonical 2026 catalog |

The two reads could disagree, so the matcher could emit a code the validator then rejected — producing `PRICE_NOT_FOUND` on an item the matcher had labelled MATCHED. The specific symptom was `"Pondasi Batu Kali"` → `A.3.2.1.2`, a **2022 code absent from the 2026 catalog**, injected by `constructionNormalizer`'s hard-coded `suggestedAhspCode` hint.

**After the fix**, the matcher, validator, component resolver, price resolver, pipeline, validation gate and matching engine all resolve against **ONE** authority: `officialAhspRepository` → `ALL_OFFICIAL_AHSP_ITEMS` (5 768 items, single backing array, never duplicated).

---

## §1. Trace Flow (the mismatch, exactly)

```
DED item "Pondasi Batu Kali" (category FOUNDATION, unit m3)
   │
   ├─ ahspMatcher.matchWorkItem()
   │     Priority-1  company catalog ............ miss
   │     Priority-2  exact name in getAHSPDatabase() ← LEGACY READ
   │     Priority-3  constructionNormalizer.normalize()
   │                    → suggestedAhspCode = "A.3.2.1.2"   ← HARD-CODED 2022 CODE
   │                    → matched in getAHSPDatabase()      ← LEGACY READ
   │                    → isSpecCompatible() passes
   │                    ⇒ matchType = EXACT_MATCH, code = "A.3.2.1.2"
   │
   ├─ dedRabValidationGate.validateItem()
   │     inOfficial = official OR legacy OR "2022"          ← THREE-WAY OR
   │     ⇒ accepted (legacy table contained it)
   │
   └─ ahspPriceResolver.resolvePrice()
         official catalog lookup for "A.3.2.1.2"            ← CANONICAL READ
         ⇒ NOT FOUND ⇒ PRICE_NOT_FOUND, unitPrice null
```

**Root cause = DATA SOURCE ARCHITECTURE MISMATCH**, not a missing dataset. The same string ("AHSP") meant two different arrays depending on the caller.

---

## §2. Legacy Authority Removed

- `src/data/indonesianAHSP.ts` — header now classifies `MASTER_AHSP_DATABASE` = **ARCHIVE**, `getAHSPDatabase()` = **DEPRECATED compat view (NOT production authority)**, with a `@deprecated` JSDoc.
- The file is **NOT deleted** (per §12). Consumers are re-pointed, not the dataset.
- `getAHSPDatabase()` no longer appears in the matcher, validator, price resolver, pipeline, or matching engine (grep-verified: only comments + one unused test import remain).

### §12 Consumer Classification

| Consumer | Class | Action |
|---|---|---|
| `ded-rab-v2/ahsp/ahspMatcher.ts` | ACTIVE PRODUCTION | re-pointed to `officialAhspRepository` |
| `ded-rab-v2/ahsp/ahspPriceResolver.ts` | ACTIVE PRODUCTION | re-pointed (canonical `priceResolver2026`) |
| `ded-rab-v2/validation/dedRabValidationGate.ts` | ACTIVE PRODUCTION | official-only gate |
| `services/dedToRabPipelineService.ts` | ACTIVE PRODUCTION | re-pointed |
| `services/dedAhspMatchingEngine.ts` | ACTIVE PRODUCTION | re-pointed |
| `data/indonesianAHSP.ts` (`getAHSPDatabase`) | **DEPRECATED** | kept, documented, no production caller |
| `data/nationalCostDatabase/masterRegistry.ts` | MIGRATION SOURCE | unchanged |

---

## §3. `OfficialAhspRepository` (the single authority)

`src/data/nationalCostDatabase/officialAhspRepository.ts` (NEW)

- Backed by `ALL_OFFICIAL_AHSP_ITEMS` — **the dataset is never copied or re-derived**.
- `getAllOfficialAhsp()` · `getOfficialAhsp(code)` · `hasOfficialAhsp(code)` · `size` · `searchOfficialAhsp(query, opts)`.
- Header documents the invariant: `MATCHED => OFFICIAL_CATALOG_CONTAINS(selectedAhspId)`.

---

## §4. Matcher Contract

`AhspMatchType` = `EXACT_MATCH | SEMANTIC_MATCH | AMBIGUOUS | AI_CUSTOM | NOT_FOUND`

- `AMBIGUOUS` is a **first-class non-decision**: `code === ''`, carries `candidates[]`, and is **never** counted or labelled as MATCHED (`dedRabPipeline`, `dedRabReviewService` both exclude it).
- The matcher **never returns a legacy code as MATCHED** — Priority-2 and the normalizer-hint path both consult the official catalog only.
- Synthetic `suggestedAhspCode` is now an untrusted HINT (§5/§8): if the hinted code is not official, the matcher falls through to a real catalog search instead of trusting it.

---

## §5. `A.3.2.1.2` — Not Assumed

`officialAhspRepository.hasOfficialAhsp('A.3.2.1.2')` → **ABSENT**. Confirmed by the invariant suite (`§5/§8 — the stale 2022 code never surfaces as a match`).

---

## §6. Real Forensic Search — "Pondasi Batu Kali" terms

Searched the official catalog (5 768 items) for every stone-foundation spelling. Non-demolition hits:

| Term | Hits | Notable |
|---|---|---|
| `pondasi batu kali` | **0** | the exact phrase is not in the 2026 catalog |
| `batu kali` | **1** | only `2.7.4` (finishing siar pasangan batu kali, m2) |
| `batu belah` | **100** | `2.2.2.1.2–2.2.2.1.9`, `A.3.11.1a/b.*` |
| `pondasi batu` | **10** | `2.2.2.1.2 … 2.2.2.1.9` (CIPTA_KARYA) |

**Key finding:** *batu kali* ≈ *batu belah* — the catalog writes it as **"batu belah"**. The genuine direct foundation matches are:

```
2.2.2.1.2  Pemasangan 1 m3 pondasi batu belah mortar tipe M 17,5 Mpa setara 1SP : 2PP, cara manual        m3
2.2.2.1.3  ... tipe M (…) cara semi mekanis
2.2.2.1.4  ... tipe S 12,5 Mpa (setara 1SP : 3PP), cara manual
2.2.2.1.5  ... tipe S (…) cara semi mekanis
2.2.2.1.6  ... tipe N 5,2 Mpa (setara 1SP : 4PP), cara manual
2.2.2.1.7  ... tipe N (…) cara semi mekanis
2.2.2.1.8  ... tipe O 2,4 Mpa (setara 1SP : 5PP), cara manual
2.2.2.1.9  ... tipe O (…) cara semi mekanis
```

Plus SDA beda-tinggi variants `A.3.11.1a.* / A.3.11.1b.*` ("1 m3 Pas. Batu Belah dengan Mortar tipe X, beda tinggi …").
**Zero** demolition-only, **zero** fabricated candidates.

---

## §7. Catalog May Lack a Direct Entry → NO_MATCH, never a silent map

Demonstrated with real DED items (below): items whose subject genuinely is not in the 2026 catalog return `NOT_FOUND` rather than being silently remapped. Example: **no non-demolition "kloset" item exists in the catalog** ⇒ `Kloset Duduk KM/WC` → `NOT_FOUND` (it is **not** silently served by the floor-drain analysis `3.18.6.1`).

---

## §8. No Synthetic AHSP / No Synthetic Coefficient

- `AI-CUSTOM-*` is no longer fabricated: 100 % of the real-DED items that previously showed `AI-CUSTOM-MUFSHxxx` now resolve to official matches or `NOT_FOUND`.
- Coefficients come only from the official AHSP record; AI cannot modify them.

---

## §9. Components Only From Validated Official AHSP

Price resolution goes through `priceResolver2026.resolveAhspUnitPrice(officialItem)`; `DedPriceComponent[]` is built from the official `composition.labor/material/equipment`, subtotals from `*.subtotalPerUnit`.

---

## §10. DED Materials Stay Components

DED material specs (`materialSpec`) remain inputs to `isSpecCompatible`, never promoted to separate work rows.

---

## §11. Price Source Chain

`Project Override → Project Price → Regional → official (priceResolver2026)`.
Never AI · never LLM · never hard-coded · never legacy. Unresolvable ⇒ `unitPrice: null`, `totalPrice: null` (**never 0**).

---

## §13/§14. Regression Test + Invariant

`src/test/ahspSourceOfTruthInvariant.test.ts` — **9 checks, all PASS**:

```
[PASS] §3  repo is backed by the exact official catalog (no duplication)
[PASS] §14 INVARIANT — every MATCHED/EXACT/SEMANTIC code exists in the official catalog (26 probes)
[PASS] §14 a non-decision (AMBIGUOUS) never masquerades as MATCHED
[PASS] §5/§8 the stale 2022 code A.3.2.1.2 never surfaces as a match
[PASS] §14 resolveValidatedAhspCandidate rejects a non-official code
[PASS] §14 resolveValidatedAhspCandidate accepts a real official code
[PASS] §15 unresolved AHSP yields unitPrice=null, totalPrice=null (never 0)
[PASS] §15 AMBIGUOUS price is null (no official decision ⇒ no price)
[PASS] §15 no price is ever the literal 0 from a missing chain
```

Invariant enforced: **`MATCHED ⇒ OFFICIAL_CATALOG_CONTAINS(selectedAhspId)`**.
Registered in `package.json` as `test:ahsp-invariant` and appended to `test:ded-rab`.

---

## §15. Price Gating

`PRICE_FOUND` requires the **full official chain**; otherwise `PRICE_NOT_FOUND` with `unitPrice`/`totalPrice` **null** (never 0). `AMBIGUOUS` items are explicitly fail-closed.

---

## §16. Real DED Pipeline — PRJ-RUMAH-2LT-01

Replayed the **real captured DED item set** for the flagship project
(`pdf-gambar-rumah-1-lantai_compress.pdf`, SHA-256 `60d5967e…f53d8a`) through the **new** matcher + resolver. *(Live re-extraction requires the AI vision provider; the captured artifact is the real DED output for that project and exercises the full item set.)*

| ID | Item | OLD (artifact) | NEW | Verdict |
|---|---|---|---|---|
| DED-001…007 | Lantai … (7×) | `AI-CUSTOM-MUFSH*` | `NOT_FOUND` | honest — no fabricated code |
| DED-008 | Kloset Duduk KM/WC | `AI-CUSTOM` | `NOT_FOUND` | honest — catalog has no non-demolition kloset |
| DED-009 | Kitchen Sink | `3.18.2` EXACT | `NOT_FOUND` | `3.18.2` is not in the 2026 catalog |
| DED-010 | Pintu Ayun 1 Daun | `AI-CUSTOM` | `NOT_FOUND` | honest |
| DED-011 | Dinding Pasangan Bata / Partisi | `A.4.4.1.18` | **AMBIGUOUS** (3.6.1.1–5) | 5 equally-valid red-brick rows (mortar type undecided) |
| DED-012 | Penutup Atap Fasad Depan | `AI-CUSTOM` | **AMBIGUOUS** (3.1.1.1–5) | 5 roof-covering rows (tile type undecided) |
| DED-013/014 | Kusen & Jendela | `AI-CUSTOM` | `NOT_FOUND` | honest |
| DED-015 | Dinding Roster | `3.6.3` EXACT | **AMBIGUOUS** (3.6.1.1–5) | `3.6.3` not in catalog; brick variants undecided |
| DED-016 | Kanopi Beton | `AI-CUSTOM` | `NOT_FOUND` | honest |
| DED-017 | Dinding Fasad | `A.4.4.1.18` | **AMBIGUOUS** (3.6.1.1–5) | same as DED-011 |

**Totals:** 17/17 changed · 0 MATCHED-by-guess · 4 AMBIGUOUS · 13 NOT_FOUND · **0 AI_CUSTOM · 0 §14 violations · 0 literal-0 prices**.
`A.3.2.1.2` never appears. Old artifact's `priceSource=OFFICIAL_AHSP, unitPrice=188850` on `3.18.2` is gone (that code is not official).

### Stone-foundation behaviour (the original complaint)

| Input | Result |
|---|---|
| `Pasangan Pondasi Batu Kali 1:4` | **AMBIGUOUS** → `2.2.2.1.6` (manual) + `2.2.2.1.7` (semi-mekanis) — both genuinely 1:4 |
| `Pondasi Batu Kali` (no ratio) | **AMBIGUOUS** → 10 official candidates |
| `Pasangan batu kali` | **EXACT** → `7.9.(1)` "Pasangan Batu" |
| `Dinding Bata Merah 1/2 Bata` | **AMBIGUOUS** → `3.6.1.1–5` |
| `Pondasi Footplate Beton Bertulang K-250` | fail-closed (unit-mismatch rejected) |

**No wrong match. No fake price. Review required where the catalog genuinely offers a choice.**

---

## §17. DED Vision — UNTOUCHED

No modification to models (`gemini-3.5-flash-lite` / `gemini-3.8-flash`), canonical grouping, QTO, or `SafeDecimal`. The reconciliation is strictly downstream of DED reading.

---

## §18. Verification Results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **EXIT 0** |
| `npm run test:ded-rab` | **EXIT 0** — root-cause **20/20**, fixtures **24/24**, criteria **15/15**, invariant **9/9** |
| `npm run test:core-ai` | **70 PASSED / 0 FAILED** |
| `npm run test:phaseC` | **71 PASSED / 0 FAILED** |
| `npm test` | **74 PASSED / 0 FAILED** |
| `npm run test:all` | **EXIT 0** — all 23 phase suites PASS |
| `npm run ahsp:test` | **20 passed / 0 failed** |
| `npm run build` | **EXIT 0** — 2975 modules, built in 66 s |
| Real DED pipeline replay (§16) | invariant-clean (0 violations, 0 literal-0) |

### Two pre-existing failures (NOT caused by this task, out of scope)

| Suite | Failure | Analysis |
|---|---|---|
| `price:assert` | `3.1.(11)`: `status=FULL` expected `MISSING` | `resolver.ts:689` returns FULL when `totalComponents===0 && hspPrice!==null` for a **header-only** Bina Marga entry (`NO_COMPONENTS_IN_SOURCE`). A false "FULL" with `unitPrice=null`. |
| `price:assert` | `A.1.02.4a.1.d`: `unitPrice=219791` vs `sum=219790.5` | `unitPrice` is rounded, `subtotalPerUnit` is not → 0.5 delta > `1e-6` tolerance. |
| `test:price` | 66/67 (the 67th mirrors the above) | same resolver rounding/status semantics |

**Evidence these are pre-existing & unrelated:** `priceResolver2026` (imports nothing changed this task), `ahsp2026Canonical.generated.ts` (mtime 2026-09-28), `resolver.ts` (mtime 2026-09-30 — *previous* session). This task's edits are `ahspMatcher` (2026-10-01) + tests. The resolver's own chain is untouched. **Both are reported as findings, not silently patched** (out of scope; patching `resolver.ts` risks the price master).

---

## §19. Forensic Output A–M

- **A. Original mismatch** — matcher used legacy view, validator used canonical. Confirmed by import graph + `A.3.2.1.2` absence.
- **B. Legacy authority** — `getAHSPDatabase()` demoted to DEPRECATED; not deleted; no production caller remains.
- **C. Single authority** — `ALL_OFFICIAL_AHSP_ITEMS` (5 768), accessed only via `officialAhspRepository`.
- **D. Matcher contract** — 5-state enum incl. first-class `AMBIGUOUS`; never returns legacy code as MATCHED.
- **E. `A.3.2.1.2`** — absent from catalog; never surfaced.
- **F. Catalog search** — 0 hits for "pondasi batu kali"; 10 for "pondasi batu" (all `2.2.2.1.x`); term is **"batu belah"**.
- **G. Missing entry** — returns NO_MATCH (kloset example), never silent remap.
- **H. Synthetic AHSP** — eliminated; `AI_CUSTOM` count on real DED dropped from 12 → 0.
- **I. Components** — official-only; coefficients immutable by AI.
- **J. DED materials** — stay components.
- **K. Price chain** — project → regional → official (`priceResolver2026`); never AI/hard-coded/legacy; missing ⇒ null.
- **L. Real DED** — 17/17 items changed; 0 guesses; 0 violations.
- **M. Verification** — `tsc`, `test:ded-rab`, `test:core-ai`, `test:phaseC`, `npm test`, `test:all`, `ahsp:test`, `build` all PASS.

### Additional defects found & fixed during this task (beyond the brief's original finding)

1. **Order-dependent semantic matching (WRONG MATCH).** `findSemanticMatch` used `database.find()` — first array hit. Because `ALL_OFFICIAL_AHSP_ITEMS` is annex-ordered, the early `1.6.x` **demolition** block and `7.x` **Bina Marga bridge** block captured items:
   - `Kloset` → `1.6.16` "Pembongkaran Kloset"
   - `Penutup Atap` → `1.6.9` "Bongkaran rangka atap"
   - `Dinding Bata` → `7.1.(4a5)` "Beton fc'35 untuk Kolom/Dinding Pilar Jembatan"
   **Fixed:** added an **eligibility gate** (exclude `bongkaran|pembongkaran`, require unit-class agreement) + **ranked selection** with explicit tie → AMBIGUOUS. Also split roof *covering* vs roof *frame*, and fixture-specific subject gates (kloset ≠ floor drain ≠ wastafel).
2. **Cyclopean-concrete pollution.** `Pondasi Batu Kali` pulled `2.2.2.2.x` "pondasi beton siklop (60% beton)" as candidates. **Fixed:** a plain stone foundation now rejects concrete-bearing candidates unless the item asks for siklop/beton.
3. **Fixture premises encoding the bug.** 14 test assertions hard-coded `A.3.2.1.2` / `A.4.4.1.18` / `3.18.2` / `3.6.3` (non-official codes) — they passed *because* of the wrong match. **Fixed:** re-pointed to real official codes (`2.2.2.1.2`, `3.6.4.1`) with a guard assertion that the fixture codes exist in the catalog; FIXTURE 01's `code.length > 0` replaced with the honest MATCHED-or-AMBIGUOUS contract.

---

## §20. Final Acceptance Checklist

| # | Requirement | Status |
|---|---|---|
| 1 | One authoritative production AHSP source | **PASS** — `officialAhspRepository` → `ALL_OFFICIAL_AHSP_ITEMS` |
| 2 | Matcher never returns a non-official code as MATCHED | **PASS** — §14 invariant over 26 probes |
| 3 | Validator/price use the same source as the matcher | **PASS** |
| 4 | `AMBIGUOUS` is a real non-decision (no code, has candidates) | **PASS** |
| 5 | `A.3.2.1.2` never fabricated or surfaced | **PASS** |
| 6 | No synthetic AHSP / coefficient | **PASS** — `AI_CUSTOM` 12 → 0 |
| 7 | Missing price ⇒ `null`, never `0` | **PASS** — all suites |
| 8 | `PRICE_FOUND` only via the full official chain | **PASS** |
| 9 | DED Vision untouched | **PASS** |
| 10 | Legacy dataset not deleted; consumers classified | **PASS** |
| 11 | Regression test asserts the invariant | **PASS** — 9/9 |
| 12 | Real DED project exercised end-to-end | **PASS** — PRJ-RUMAH-2LT-01 |
| 13 | `tsc` / `test:ded-rab` / `test:core-ai` / `test:phaseC` / `build` | **PASS** |
| 14 | Prefer NO_MATCH over WRONG MATCH; NO_PRICE over FAKE PRICE; NEEDS_REVIEW over AI GUESS | **PASS** |

**Outstanding (reported, not patched):** two pre-existing `priceResolver2026` defects (§18) — a false `FULL` status on a header-only entry, and a rounding delta in `unitPrice` vs `Σ subtotal`. Both live in a file outside this task's scope and untouched by it.

---

### FINAL PRINCIPLE — honoured

> *NO_MATCH rather than WRONG MATCH · NO_PRICE rather than FAKE PRICE · NEEDS_REVIEW rather than AI GUESS.*
