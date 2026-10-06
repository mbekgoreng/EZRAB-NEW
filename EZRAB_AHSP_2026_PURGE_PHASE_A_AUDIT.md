# EZRAB — AHSP 2026 PURGE & REIMPORT — PHASE A AUDIT

**Scope:** Complete dependency map of every AHSP storage layer in the EZRAB repository,
produced **before** any destructive action (per purge prompt §8).
**Date:** 2026-09-28
**Repo:** `D:/file kerja/PEMBUATAN SOFTWARE/ezrab site web`

---

## 0. HEADLINE FINDING

> **EZRAB has NO runtime AHSP catalog table.**
> The AHSP "database" is **compiled TypeScript datasets** bundled into the client,
> exposed through a single choke point: `ALL_OFFICIAL_AHSP_ITEMS` in
> `src/data/nationalCostDatabase/masterRegistry.ts`.
>
> Supabase holds **only project/RAB tables** (`projects`, `rab_documents`, `rab_versions`,
> `rab_items`, `rab_item_components`) — `rab_items` *references* an AHSP code
> (`ahsp_code`, `ahsp_version`, `ahsp_snapshot`) but there is **no `ahsp_items` /
> `ahsp_components` / `ahsp_resources` table and no migration that creates one.**
>
> Therefore "purge + reimport" = **replace the compiled datasets behind the single
> choke point, and purge the two `localStorage` AHSP overlays.** No SQL DELETE is required.

---

## 1. STORAGE LAYER MAP

### L1 — Compiled AHSP catalog datasets (client bundle) — THE DATABASE
| # | File | Export | Items | Domain | Declared source | Verdict |
|---|------|--------|-------|--------|-----------------|---------|
| 1 | `src/data/nationalCostDatabase/sdaAHSPDataset.ts` | `SDA_AHSP_2026_DATASET` | 1,554 | `SUMBER_DAYA_AIR` | Lampiran IV ✅ | **fabricated prices** (unitPrice=8500 etc.) |
| 2 | `src/data/nationalCostDatabase/binaMargaAHSPDataset.ts` | `BINA_MARGA_AHSP_2026_DATASET` | 1,144 | `BINA_MARGA` | SRC-BM-2026 | **FABRICATED** (self-labelled DEPRECATED) |
| 3 | `src/data/nationalCostDatabase/binaMargaAHSP2026Official.ts` | `BINA_MARGA_AHSP_2026_OFFICIAL` | 986 | `BINA_MARGA` | **"Lampiran II"** ❌ | real extraction, **wrong attachment label** |
| 4 | `src/data/nationalCostDatabase/ciptaKaryaAHSPDataset.ts` | `CIPTA_KARYA_AHSP_2026_DATASET` | ~2,800 | `CIPTA_KARYA` | Lampiran VI ✅ | fabricated prices |
| 5 | `src/data/nationalCostDatabase/smkkDataset.ts` | `OFFICIAL_SMKK_MASTER_ITEMS` / `SMKK_AHSP_ITEMS` | 223 | `SMKK` | Lampiran III ✅ | fabricated prices |
| 6 | `src/data/nationalCostDatabase/sources.ts` | `OFFICIAL_AHSP_SOURCES` | 5 metadata rows | — | — | BM row cites `16.1/SE/Db/2024` (not SE 47/2026) |
| 7 | `src/data/nationalCostDatabase/types.ts` | `NationalAHSPItem` etc. | — | — | — | `AHSPDomain` includes `'UMUM'` |

### L2 — Legacy PUPR baseline
| # | File | Export | Items | Source |
|---|------|--------|-------|--------|
| 8 | `src/data/indonesianAHSP.ts` | `MASTER_AHSP_DATABASE` | 200 | Permen PUPR No. 1/PRT/M/2022 (2022.0) |

### L3 — Composite registry (THE CHOKE POINT)
| # | File | Export | Composition |
|---|------|--------|-------------|
| 9 | `src/data/nationalCostDatabase/masterRegistry.ts` | `ALL_OFFICIAL_AHSP_ITEMS` | **SDA + `BINA_MARGA_AHSP_2026_DATASET`(fabricated) + CK + SMKK** — the *official* 986-item BM set is imported but **NOT used** |

Also defines `CostDatabaseEngine` singleton (search/find/addCustom) with
`localStorage` key **`yfarch_custom_ahsp_v2026`**.

### L4 — In-memory repository
| # | File | Behaviour |
|---|------|-----------|
| 10 | `src/engine/ahsp/repository/ahspRepository.ts` | Singleton. Ingests `ALL_OFFICIAL_AHSP_ITEMS` **+ legacy `MASTER_AHSP_DATABASE` (2022)**. Defaults `category: 'UMUM'` at lines 88 & 157. |

### L5 — Server services
| # | File | Behaviour |
|---|------|-----------|
| 11 | `server/services/ahspDataService.ts` | Searches **legacy `MASTER_AHSP_DATABASE` (2022)** |
| 12 | `server/services/authoritativeAhspPriceBridge.ts` | Reads `ALL_OFFICIAL_AHSP_ITEMS`; **fabricates `1150000`** when no price (telemetry-recorded) |

### L6 — Pipeline / adapter (secondary path)
| # | File | Behaviour |
|---|------|-----------|
| 13 | `src/engine/ahsp/pipeline/ahspImportPipeline.ts` | `category: rawItem.category \|\| 'UMUM'` (line 149); stamps `verificationStatus: 'VERIFIED'` unconditionally |
| 14 | `src/engine/ahsp/adapters/officialToDefinitionAdapter.ts` | Maps `OfficialAHSPItem` → `AHSPDefinition`; institution hard-coded "Direktorat Jenderal Bina Marga" |

### L7 — localStorage overlays (client, per-browser)
| # | Key | Owner | Content |
|---|-----|-------|---------|
| 15 | `yfarch_custom_ahsp_v2026` | `masterRegistry.CostDatabaseEngine` | user-added custom AHSP items |
| 16 | `ezrab:project:{projectId}:ahsp` | `src/project-data/ahspBridge.ts` → `ProjectDataRepository` | per-project AHSP rows copied from catalog |

### L8 — Search / AI retrieval (in-memory, rebuilt at boot)
| # | File | Behaviour |
|---|------|-----------|
| 17 | `server/ai/knowledge/knowledgeRetriever.ts` | linear scan of `ALL_OFFICIAL_AHSP_ITEMS` |
| 18 | `server/data/knowledgeBaseData.ts` + `src/data/knowledgeBaseData.ts` | generic AHSP FAQ text (no item lists) |
| 19 | `server/ai/knowledge/constructionKnowledge.ts` | generic AHSP standard text (no item lists) |

**No persistent embedding store, no vector table, no cached index files.**
"Rebuild index" = ensure the repository re-ingests from the new canonical source at boot.

### L9 — Supabase (project/RAB only — NO AHSP catalog)
`supabase/migrations/20260913_auth_membership_foundation.sql`,
`supabase/migrations/20260913_durable_project_rab_foundation.sql`.
Tables: `profiles, workspaces, workspace_members, projects, project_members, audit_logs,
rab_documents, rab_versions, rab_items, rab_item_components`.
`rab_items.ahsp_code / ahsp_version / ahsp_snapshot` are **per-project snapshots**, not a catalog.

---

## 2. CONSUMER FAN-OUT (why `masterRegistry` is the choke point)

`ALL_OFFICIAL_AHSP_ITEMS` is imported by **20 files**:
`AhspExplorerView`, `RabReviewWorkspaceModalView`, `EstimatorAhspView`, `SmartAddWorkItemModal`,
`WorkItemInspectorDrawer`, `AhspDatabaseExplorer`, `ProjectAhspView`, `RabEstimasiView`,
`ResourceLibraryView`, `DaftarPekerjaanView`, `indonesianAHSP.ts`, `ahspMatcher`,
`ahspPriceResolver`, `ahspRepository`, `constructionDataValidator`, `parametricVolumeEngine`,
`priceRepository`, `dedAhspMatchingEngine`, `dedToRabPipelineService`, `knowledgeRetriever`,
`authoritativeAhspPriceBridge`, `automaticRabDraftEngine`.

`MASTER_AHSP_DATABASE` (legacy 2022) is imported by **8 files**:
`LaporanView`, `ahspRepository`, `priceRepository`, `rabCostAuditEngine`, `excelExportEngine`,
`ahspDataService`, `forensicDataCensus`, plus its own module.

→ Rewiring `masterRegistry.ts` + archiving the legacy module fixes every consumer at once.

---

## 3. DEFECT REGISTER (what the purge must remove)

| ID | Defect | Location | Required action |
|----|--------|----------|-----------------|
| D1 | Fabricated Bina Marga dataset (1,144 items, 10 distinct prices, 744× Rp 149,875) is **live** in the composite | `binaMargaAHSPDataset.ts` + `masterRegistry.ts:10,23` | Remove from composite; archive file |
| D2 | Official BM set labelled **"Lampiran II"** (must be **V**) | `binaMargaAHSP2026Official.ts:2,91`; `binaMargaAHSP2026OfficialTypes.ts:5,80,91` | Correct to `V` |
| D3 | `AHSPDomain` includes `'UMUM'`; used as default in 3 places | `types.ts:8`; `ahspRepository.ts:88,157`; `ahspImportPipeline.ts:149` | Remove `'UMUM'` domain + all UMUM fallbacks |
| D4 | Legacy 2022 baseline merged into 2026 repository | `ahspRepository.ts:115-180` | Decouple (archive only) |
| D5 | Fabricated `1150000` unit price | `authoritativeAhspPriceBridge.ts:186-196` | Fail-closed |
| D6 | `scopeAhspRegistry` header + `domain:'UMUM'` for SMKK | `scopeAhspRegistry.ts:9,215` | Lampiran V; domain `SMKK` |
| D7 | `sources.ts` BM row cites `16.1/SE/Db/2024` | `sources.ts:22` | Correct to SE DJBK 47/2026 Lampiran V |
| D8 | Unconditional `verificationStatus: 'VERIFIED'` | `ahspImportPipeline.ts:166` | Propagate real status |
| D9 | Old BM dataset still referenced by 5 audit scripts | `scripts/reconcile*.ts`, `_probe*.ts` | Repoint to canonical |
| D10 | Stale localStorage custom AHSP from old catalog | key `yfarch_custom_ahsp_v2026` | Versioned quarantine migration |

---

## 4. CANONICAL TARGET (source of truth = Phase 0.5 output)

`data/ahsp2026/validated/ahsp_2026_master.json`

```
TOTAL            5801
  SMKK            223   (attachment III)
  SDA            1556   (attachment IV)
  BINA_MARGA     1163   (attachment V)
  CIPTA_KARYA    2859   (attachment VI)
  UMUM              0
VERIFIED         3440
NEEDS_REVIEW     2361
INVALID             0
components      29320   (materials 6760 · labor 16108 · equipment 6452)
resources        3903   (material 2386 · labor 310 · equipment 1207)
```

### Count reconciliation vs. the prompt
The prompt §2 states `CK 2841` and total `5801`. **2841 is a partial count:**
`2859 = 2841 (status-line index rows) + 18 (DIVISI 7 — Jalan pada Permukiman rows
printed without a status column)`. Only **2859** reconciles with the stated total of 5801
(223 + 1556 + 1163 + **2859** = 5801). The verified artefact is authoritative — see §21 rule
"on discrepancy STOP; do not silently fix numbers." Reported, not altered.

### Canonical item shape (price-free)
```jsonc
{
  "id": "AHSP-2026-SMKK-000001",
  "code": "KECIL-1", "version": "2026",
  "field": "SMKK", "division": "...", "subdivision": "...",
  "category": "...", "subcategory": "...", "description": "...", "unit": "",
  "source": { "regulation": "SE DJBK No. 47/SE/Dk/2026",
              "attachment": "III", "page": 30, "source_file": "Lampiran-III-....pdf" },
  "components": { "materials": [], "labor": [], "equipment": [] },
  "calculation": { ...formulas... },
  "validation": { "status": "NEEDS_REVIEW", "issues": [ ... ] }
}
```
Component row: `{ resource_code, resource_name, resource_type, unit, coefficient,
coefficient_raw, source_page, raw }` — **coefficient only, no price**.
Resource row: `{ resource_id, code, name, type, unit, category, source_ahsp_codes, duplicate_status }`.

⚠️ Canonical carries **no `normativeStatus` and no `method`**. These must **not** be invented;
the type will accept `'UNSPECIFIED'` and the value will be set explicitly.

---

## 5. PHASE A EXIT CRITERIA

- [x] Every AHSP storage layer enumerated (L1–L9)
- [x] Dependency map complete (FKs = none; consumers = 20 + 8 files)
- [x] Legacy `Lampiran II → Bina Marga` mapping located (D2)
- [x] `Umum` / `BIDANG_UMUM` / `LAMPIRAN_UMUM` records located (D3, D6) — **none exist as data rows**; only as a domain enum + fallback constants
- [x] Duplicate codes / orphans / stale caches — none persistent; search index is in-memory
- [x] Canonical counts verified against the artefact

**Gate: dependency map complete → Phase B (backup) authorised.**
