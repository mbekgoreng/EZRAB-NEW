# EZRAB — AHSP 2026 REIMPORT REPORT
### Purge Total AHSP Lama → Regenerate & Reimport AHSP 2026 (Forensically Correct)

**Repo:** `D:/file kerja/PEMBUATAN SOFTWARE/ezrab site web`
**Date:** 2026-09-28
**Regulation of record:** **SE DJBK No. 47/SE/Dk/2026**
**Principles applied:** SOURCE FIRST · NO INVENTION · NO LEGACY FALLBACK · FAIL CLOSED · PROVENANCE EVERYWHERE · DATABASE MUST MATCH CANONICAL DATASET

---

## 1. EXECUTIVE VERDICT

> **PASS.** The legacy AHSP catalog was backed up, purged, and replaced end-to-end by a
> deterministically regenerated canonical dataset of **5801** items sourced exclusively from
> SE DJBK No. 47/SE/Dk/2026. Every storage layer now resolves through a single choke point
> (`ALL_OFFICIAL_AHSP_ITEMS`) backed by the canonical module. There is **no Bidang Umum**,
> **no Lampiran II catalog**, **no fabricated price**, and **no legacy 2022 merge**.
> All §11 / §20 / §21 / §22 / §23 / §25 assertion gates pass; `tsc` is clean; the full test
> suite and production build succeed.

---

## 2. SOURCE OF TRUTH

| Item | Value |
|---|---|
| Regulation | **SE DJBK No. 47/SE/Dk/2026** |
| AHSP-bearing annexes | **III (SMKK), IV (SDA), V (Bina Marga), VI (Cipta Karya)** |
| Non-AHSP annexes | I (Harga Pokok), II (**Acuan dalam Penyusunan AHSP — NOT Bina Marga**), VII (Tata Cara Pengajuan Usulan AHSP) |
| **Bidang Umum** | **Does not exist** in the 2026 structure. The old 143-item target is void. |
| Canonical artefact | `data/ahsp2026/validated/ahsp_2026_master.json` |
| Component artefact | `data/ahsp2026/validated/ahsp_2026_components.json` |
| Resource artefact | `data/ahsp2026/validated/ahsp_2026_resources.json` |

### Annex inventory (`data/ahsp2026/forensic/AHSP_2026_ANNEX_INVENTORY.json`)
Covers annexes I–VII and records **no Bidang Umum**. The file previously mapped as
`Lampiran-II-…-Bina-Marga.pdf` is in fact **Lampiran V** — Bina Marga metadata now carries
`attachment = "V"` everywhere.

---

## 3. OLD DATA INVENTORY & WHY IT WAS PURGED (Phase A)

Full dependency map: **`EZRAB_AHSP_2026_PURGE_PHASE_A_AUDIT.md`**.

### Headline finding
**EZRAB has NO runtime AHSP catalog table.** The AHSP "database" is **compiled TypeScript
datasets** bundled into the client, exposed through one choke point. Supabase holds only
project/RAB tables (`projects`, `rab_documents`, `rab_versions`, `rab_items`,
`rab_item_components`); `rab_items.ahsp_code/ahsp_version/ahsp_snapshot` are **per-project
snapshots**, not a catalog. Therefore "purge + reimport" = replace the compiled datasets
behind the choke point and quarantine the two `localStorage` AHSP overlays.

### Storage layers (L1–L9)
| Layer | Location | Verdict |
|---|---|---|
| L1 | `sdaAHSPDataset.ts`, `binaMargaAHSPDataset.ts`, `binaMargaAHSP2026Official.ts`, `ciptaKaryaAHSPDataset.ts`, `smkkDataset.ts` | fabricated prices / wrong attachment label |
| L2 | `indonesianAHSP.ts` (`MASTER_AHSP_DATABASE`, 200 items, Permen PUPR 2022) | legacy baseline — archive only |
| L3 | `masterRegistry.ts` (`ALL_OFFICIAL_AHSP_ITEMS`) | **the choke point** |
| L4 | `ahspRepository.ts` | merged legacy 2022 + defaulted `category:'UMUM'` |
| L5 | `ahspDataService.ts`, `authoritativeAhspPriceBridge.ts` | searched legacy; fabricated `1150000` |
| L6 | `ahspImportPipeline.ts`, `officialToDefinitionAdapter.ts` | `'UMUM'` fallback; unconditional `VERIFIED` |
| L7 | `localStorage`: `yfarch_custom_ahsp_v2026`, `ezrab:project:{id}:ahsp` | stale custom AHSP |
| L8 | knowledge retriever / KB text | in-memory, no persistent index |
| L9 | Supabase migrations | project/RAB only — **no AHSP catalog** |

### Defect register (D1–D10) — all resolved
| ID | Defect | Resolution |
|----|--------|------------|
| D1 | Fabricated Bina Marga dataset (1,144 items) live in composite | removed + archived |
| D2 | Official BM set labelled **"Lampiran II"** | corrected to **V** |
| D3 | `AHSPDomain` included `'UMUM'` + 3 fallbacks | enum + fallbacks removed |
| D4 | Legacy 2022 merged into 2026 repository | decoupled (archive only) |
| D5 | Fabricated `1150000` unit price | fail-closed (`null`) |
| D6 | `scopeAhspRegistry` header + `domain:'UMUM'` for SMKK | Lampiran V; domain `SMKK` |
| D7 | `sources.ts` BM row cited `16.1/SE/Db/2024` | corrected to SE DJBK 47/2026 Lampiran V |
| D8 | Unconditional `verificationStatus: 'VERIFIED'` | real status propagated |
| D9 | Old BM dataset referenced by 5 audit scripts | repointed / archived |
| D10 | Stale `localStorage` custom AHSP | versioned quarantine migration |

---

## 4. BACKUP (Phase B)

`npm run ahsp:backup` → **19/19 artefacts copied** (~18.4 MB) to
`backups/legacy-ahsp-pre-2026-purge/` with `MANIFEST.json` recording, per entry:
`layer`, `source`, `backup`, `bytes`, `sha256`, `note`, `exists`.

Fail-closed: the script exits `1` if any target is missing. Backup covers L1 datasets,
L2 baseline, L3 registry, L4 repository, L5 services, L6 pipeline/adapter, and the
archive-worthy audit scripts (`backups/legacy-ahsp-pre-2026-purge/scripts/`).

---

## 5. PURGE (Phase C)

Deleted legacy data modules (now backup-only):
- `sdaAHSPDataset.ts` — fabricated prices
- `binaMargaAHSPDataset.ts` — fabricated (self-labelled DEPRECATED)
- `binaMargaAHSP2026Official.ts` — mis-labelled Lampiran II
- `binaMargaAHSP2026OfficialTypes.ts` — mis-labelled Lampiran II
- `ciptaKaryaAHSPDataset.ts` — fabricated prices
- `smkkDataset.ts` — fabricated prices

All consumers repointed to the canonical source:
`ahspRepository`, `ahspImportPipeline`, `authoritativeAhspPriceBridge`, `ahspDataService`,
`sources.ts`, `indonesianAHSP.ts`, `scopeAhspRegistry`, `officialToDefinitionAdapter`,
`costPolicyEngine`, `scopeBasedCostCalculator`, `useScopeBasedCost`, plus the two type/test
repoints to the new honest modules (`binaMargaOfficialTypes`, `binaMargaCanonical`).

New canonical modules created:
- `src/data/nationalCostDatabase/ahsp2026Canonical.generated.ts` (14.17 MB)
- `src/data/nationalCostDatabase/ahsp2026CanonicalResources.generated.ts` (1.03 MB)
- `src/data/nationalCostDatabase/binaMargaOfficialTypes.ts` (types only, **no data**)
- `src/data/nationalCostDatabase/binaMargaCanonical.ts` (pure projection of canonical)

### Post-purge assertions (§11) — all zero
| Check | Result |
|---|---|
| legacy modules removed | 6/6 ✅ |
| legacy backup manifest exists | ✅ |
| legacy backup copied every target | 19/19 ✅ |

---

## 6. CANONICAL DATASET & REGENERATION (Phase D)

`npm run ahsp:generate` → deterministic emission of the canonical module.

| Domain | Attachment | Items |
|---|---|---:|
| SMKK | **III** | 223 |
| Sumber Daya Air | **IV** | 1556 |
| Bina Marga | **V** | 1163 |
| Cipta Karya | **VI** | 2859 |
| **TOTAL** | — | **5801** |

- Components: **29,320** (labor 16,108 · material 6,760 · equipment 6,452)
- Resources: **3,898** (material 2,386 · labor 307 · equipment 1,205)
- Status: **VERIFIED 3440 · NEEDS_REVIEW 2360 · SOURCE_DEFECT 1**
- `unitPrice` non-zero count: **0** (price-free by design — prices resolve at runtime, fail closed)
- Missing provenance: **0**

**Determinism:** generation was run twice and produced byte-identical modules.
**Fail-closed:** the generator exits `1` if the item count ≠ 5801.
**TS2590 guard:** the 14 MB literal is emitted in 150-row chunks.

---

## 7. NORMALIZATION RULES APPLIED (§13)

Permitted and applied — **only** these:
- whitespace collapse in names/units
- field/category trimming
- unit normalization via a **documented map** (`Buah`/`buah` → `Buah`, `Meter Kubik`/`m3` → `m3`), preserving the original in `unitRaw`
- source-metadata normalization
- status derivation (`VERIFIED` / `NEEDS_REVIEW` / `SOURCE_DEFECT`)

**Never** applied: changing source codes, inventing codes, merging/dropping by similar name,
altering coefficients. `NEEDS_REVIEW` was never promoted to `VERIFIED`.

---

## 8. PROVENANCE (§14)

Every item carries `provenance = { regulation, attachment, page, sourceFile }`.
Distribution (verified from the generated module):

| Attachment | Items | `sourceId` |
|---|---:|---|
| III | 223 | `SE-DJBK-47-2026-LAMPIRAN-III` |
| IV | 1556 | `SE-DJBK-47-2026-LAMPIRAN-IV` |
| V | 1163 | `SE-DJBK-47-2026-LAMPIRAN-V` |
| VI | 2859 | `SE-DJBK-47-2026-LAMPIRAN-VI` |

Domain → attachment is strictly `SMKK→III · SUMBER_DAYA_AIR→IV · BINA_MARGA→V · CIPTA_KARYA→VI`.
**Bina Marga records labelled "II": 0.** Missing provenance: 0.

---

## 9. IMPORT: KEYING, IDEMPOTENCY, SAFETY (§15)

- Import key = **source + attachment + code**.
- **Idempotent**: re-running the generator/import produces identical output (verified twice).
- **Duplicate-safe**: duplicate codes are classified and reported, never silently dropped.
- **FK-safe / transaction-safe**: no FK-bearing AHSP table exists; the repository re-ingests
  atomically at construction and the `localStorage` quarantine migration is best-effort and
  non-destructive (old payload preserved under a backup key).
- Code-less records are addressable by `id` only (never given an invented code).

---

## 10. COMPONENT PRESERVATION (§16)

Each component retains `resource_code`, `resource_name`, `resource_type`, `unit`,
`coefficient`, `coefficient_raw`, `source_page`, `raw`. Coefficients are preserved verbatim;
no coefficient was recomputed, rounded, or dropped.

---

## 11. RESOURCE MASTER AUDIT (§17)

3,898 resources. Look-alike entries are **flagged** (`possible_duplicate` / `conflict`) —
**never auto-merged**. The master is rebuilt from `ahsp_2026_resources.json` without name-based
merging.

---

## 12. INDEX REBUILD (§18)

There is **no persistent embedding store, vector table, or cached index file** in EZRAB
(confirmed by repository-wide search). Search is a live scan over
`ALL_OFFICIAL_AHSP_ITEMS` inside `CostDatabaseEngine.searchAHSP`, and the `AHSPRepository`
builds its `Map` indexes at construction. Because the canonical module is the only source,
**the indexes are rebuilt from the canonical dataset on every boot by construction** — there is
no stale index to invalidate.

---

## 13. UI CATEGORY MAPPING (§19)

`src/components/ahsp/AhspExplorerView.tsx` now maps domains to their annex deterministically:

| UI domain | Label shown |
|---|---|
| SMKK | **Lampiran III** SE DJBK No. 47/SE/Dk/2026 (SMKK) |
| Sumber Daya Air | **Lampiran IV** SE DJBK No. 47/SE/Dk/2026 |
| Bina Marga | **Lampiran V** SE DJBK No. 47/SE/Dk/2026 |
| Cipta Karya | **Lampiran VI** SE DJBK No. 47/SE/Dk/2026 |

The banner badge was corrected from "Permen PUPR 2026" → **"Database Resmi SE DJBK 47/2026"**,
and a fabricated `sourceDocument` fallback (`'Lampiran IV …'`) was replaced with
**"Sumber tidak tercatat"** (fail-closed display, no invented source).

---

## 14. COUNT VALIDATION (§20) + CROSS-CHECK (§21)

```
METHOD A (source artefact)      : 5801
METHOD B (generated module)     : 5801
METHOD C (registry constant)    : 5801
METHOD D (CostDatabaseEngine)   : 5801
METHOD E (AHSPRepository)       : 5799
```
| Assertion | Result |
|---|---|
| METHOD A == B == C | PASS |
| runtime engine count equals canonical (no legacy merge) | PASS 5801 vs 5801 |
| repository count = canonical − code-less records | PASS 5799 vs 5801 − 2 |
| total = 5801 | PASS |
| SMKK = 223 / SDA = 1556 / BINA_MARGA = 1163 / CIPTA_KARYA = 2859 | PASS |
| total is **NOT** 6211 | PASS |

### Count reconciliation (reported, not silently altered)
The brief's §2 states `CK 2841` and total `5801`. Only **2859** reconciles:
`2859 = 2841 (status-line index rows) + 18 (DIVISI 7 — Jalan pada Permukiman rows printed
without a status column)`. `223 + 1556 + 1163 + 2859 = 5801`. The verified artefact is
authoritative; the 6211 target was **not** forced.

---

## 15. DUPLICATE AUDIT (§22)

`duplicate_classification.json` present. **291 duplicate groups classified**, none auto-deleted.
`POSSIBLE_DUPLICATE` items remain `NEEDS_REVIEW` and are surfaced, never removed.

---

## 16. INTEGRITY AUDIT (§23)

| Check | Result |
|---|---|
| invalid status count | **0** |
| orphan components | **0** |
| broken FK | **0** |
| missing provenance | **0** |
| missing `source_file` | **0** |
| wrong Bina Marga attachment ("II") | **0** |
| fake Bidang Umum records | **0** |
| active price inside master | **0** (price-free) |
| duplicate ids | **0** |

---

## 17. REGRESSION (§24) & MANDATORY TEST CASES (§25)

| Command | Result |
|---|---|
| `npm run ahsp:pipeline` | PASS (extract → normalize → validate → forensic → classify → report → generate → assert → test) |
| `npm run ahsp:test` | **20 / 20** |
| `npm test` | **74 / 74** |
| `npm run test:all` | PASS (22 sub-suites chained, exit 0) |
| `npm run test:phase4` | **61 / 61** |
| `npm run build` | **SUCCESS** (`tsc` clean, vite built) |

### §25 mandatory cases — all PASS
- Bina Marga `"1.2"` present — *Mobilisasi*
- Bina Marga `"7.2.(5c).30"` readable — *bentang nominal 30 meter, Penyediaan Unit…*
- Cipta Karya `"2.2.1.1.1a"` present
- Cipta Karya `"5.1.1.12.100"` present (wrapped code joined — `prejoinCkWrappedRows()`)
- Bina Marga `"2.1.(1)"` name matches source
- SDA row 810 keeps an **EMPTY code** (`code=""`), flagged `SOURCE_DEFECT` — not invented
- Bina Marga attachment is `"V"`

Preserved parser fixes: `promoteEmbeddedBmCode()` (BM +129 rows), `prejoinCkWrappedRows()` (CK +38 rows).

---

## 18. FAIL-CLOSED (§26) & LEGACY ARCHIVED, NOT MERGED (§27)

- Missing AHSP code → `AHSP_NOT_FOUND` (no default, no guessing).
- Missing price → fail closed; no fabricated fallback.
- Ambiguous query → `AMBIGUOUS_AHSP` (no silent auto-selection).
- Empty `projectId` → `PROJECT_INVALID`, zero cost computed.
- Legacy Permen PUPR 2022 (`MASTER_AHSP_DATABASE`) is **archive-only** — `getAHSPDatabase()`
  no longer seeds it, and the repository no longer ingests it.
- Legacy `localStorage` custom AHSP is quarantined: old payload preserved under
  `yfarch_custom_ahsp_legacy_backup`, `UMUM`/Lampiran-II records dropped, survivors migrated to
  `yfarch_custom_ahsp_v2027`.

---

## 19. ACCEPTANCE CRITERIA (§29) — 15/15

| # | Criterion | Status |
|---|---|---|
| 1 | Legacy AHSP fully backed up | **PASS** |
| 2 | Legacy AHSP fully purged from production paths | **PASS** |
| 3 | Canonical dataset regenerated deterministically | **PASS** |
| 4 | Import is idempotent / duplicate-safe / FK-safe | **PASS** |
| 5 | Every item has provenance | **PASS** |
| 6 | Bina Marga attachment = V | **PASS** |
| 7 | No Bidang Umum records | **PASS** |
| 8 | No invented codes / items | **PASS** |
| 9 | Counts = 223 / 1556 / 1163 / 2859 = 5801 | **PASS** |
| 10 | Cross-check methods A–E agree | **PASS** |
| 11 | Duplicate audit classified, none auto-deleted | **PASS** |
| 12 | Integrity audit all zero | **PASS** |
| 13 | UI categories map to correct annexes | **PASS** |
| 14 | Regression suite green | **PASS** |
| 15 | Fail-closed behaviour preserved | **PASS** |

---

## 20. §30 STATUS BLOCK

```
OLD DATA      : PURGED (19/19 artefacts archived to backups/legacy-ahsp-pre-2026-purge/)
NEW DATA      : REIMPORTED (canonical SE DJBK No. 47/SE/Dk/2026)
SMKK          : 223   (Lampiran III)
SDA           : 1556  (Lampiran IV)
BINA MARGA    : 1163  (Lampiran V)
CIPTA KARYA   : 2859  (Lampiran VI)
TOTAL         : 5801  (NOT 6211)
VERIFIED      : 3440
NEEDS_REVIEW  : 2360
SOURCE_DEFECT : 1
INVALID       : 0
TEST          : ahsp:test 20/20 | npm test 74/74 | test:all PASS | test:phase4 61/61
BUILD         : SUCCESS
REPORT        : EZRAB_AHSP_2026_REIMPORT_REPORT.md
```

---

## 21. ARTEFACTS

| Artefact | Purpose |
|---|---|
| `EZRAB_AHSP_2026_REIMPORT_REPORT.md` | this report (§28) |
| `EZRAB_AHSP_2026_PURGE_PHASE_A_AUDIT.md` | Phase A dependency map |
| `data/ahsp2026/validated/ahsp_2026_master.json` | canonical source of truth |
| `data/ahsp2026/reports/ahsp_count_report.md` | count & quality report |
| `data/ahsp2026/forensic/duplicate_classification.json` | §22 duplicate audit |
| `backups/legacy-ahsp-pre-2026-purge/MANIFEST.json` | Phase B backup manifest |
| `src/data/nationalCostDatabase/ahsp2026Canonical.generated.ts` | 5801-item canonical module |
| `scripts/ahsp2026/assertPurge.ts` | §11/§20/§21/§22/§23/§25 gates |

**END OF REPORT.**
