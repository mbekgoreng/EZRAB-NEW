# AHSP_2026_MIGRATION_REPORT.md

**Project:** EZRAB (ezrab-v2) · **Audit date:** 2026-09-27 · **Phase C of the Master Audit**
**Baseline regulation (verified externally, 2026-09-27):** Surat Edaran Direktur Jenderal Bina Konstruksi
**Nomor 47/SE/Dk/2026**, dated **20 February 2026** — *Tata Cara Penyusunan Perkiraan Biaya Pekerjaan
Konstruksi Bidang Pekerjaan Umum*, consisting of a main body plus **seven attachments**:

| Attachment | Content | Present in EZRAB? |
|---|---|---|
| Batang Tubuh | cost-estimate preparation procedure | ❌ not stored |
| **Lampiran I** | technical guidance for collecting basic construction prices at Kementerian PU | ❌ not stored |
| **Lampiran II** | reference basis for preparing AHSP | ❌ not stored |
| **Lampiran III** | **SMKK implementation cost** | ⚠️ partially (SMKK dataset exists, not wired) |
| **Lampiran IV** | **AHSP Sumber Daya Air** | ⚠️ dataset exists — **unverified against the official PDF** |
| **Lampiran V** | **AHSP Bina Marga** | ⚠️ dataset exists — **unverified against the official PDF** |
| **Lampiran VI** | **AHSP Cipta Karya** | ⚠️ dataset exists — **unverified against the official PDF** |
| **Lampiran VII** | AHSP proposal submission procedure | ❌ not stored |

---

## 1. What EZRAB currently holds

| Domain | File | Lines | Claimed source (`sources.ts`) | Claimed items |
|---|---|---|---|---|
| SDA | `sdaAHSPDataset.ts` | 46,629 | `SRC-SDA-2026` — "Lampiran IV SE DJBK No. 47 Tahun 2026" | 1,556 normative + informative |
| Bina Marga | `binaMargaAHSPDataset.ts` | 89,726 | `SRC-BM-2026` — "SE Dirjen Bina Marga No. 16.1/SE/Db/2024 Rev 2026" | Divisi 1–10 |
| Cipta Karya | `ciptaKaryaAHSPDataset.ts` | 243,198 | `SRC-CK-2026` — "Permen PUPR No. 1/PRT/M/2022 & SE Dirjen Cipta Karya 2026" | persiapan → sanitair |
| SMKK | `smkkDataset.ts` | 3,441 | `SRC-SMKK-2026` — "Permen PUPR No. 10/2021 & Lampiran Biaya K3 2026" | APD/APK/personil/faskes |
| Legacy | `SRC-PUPR-2022` | – | `Permen PUPR No. 1/PRT/M/2022` | legacy basis |

**Schema quality: GOOD.** `nationalCostDatabase/types.ts:28-55` (`NationalAHSPItem`) already carries
`code`, `codeNormalized`, `name`, `unit`, `domain`, `category`, `version`, `year`, `normativeStatus`
(Normatif/Informatif/Custom), `method` (Manual/Semi-Mekanis/Mekanis/Fabrikasi), `sourceId`,
`sourceDocument`, `sourcePage`, `status`, and separate `laborComponents` / `materialComponents` /
`equipmentComponents` arrays plus `dataQualityScore`. A version-diff contract also exists
(`AHSPVersionDiff`, `types.ts:69-82`) and a project snapshot contract (`AHSPProjectSnapshot`,
`types.ts:84-96`).

> This satisfies the **structure** required by Master Prompt §9. What it does not yet satisfy is
> **verified provenance of the contents**.

---

## 2. Provenance defects found (evidence)

| # | Defect | Evidence | Severity |
|---|---|---|---|
| 1 | Wrong document number for the 2026 SE | `sources.ts:9` writes `SE DJBK No. 47/SE/Db/2026` — real number is **47/SE/Dk/2026** | HIGH (audit trail invalid) |
| 2 | All five sources marked `status: 'VERIFIED'` while `sourceUrl` is a **domain root** (`https://jdih.pu.go.id/`), not a document | `sources.ts:13,15` and `:26,28`, `:39,41`, `:52,54` | HIGH (unverifiable claim) |
| 3 | Bina Marga cited as `16.1/SE/Db/2024 Rev 2026` — a **2024** circular relabelled as 2026 | `sources.ts:22` | HIGH |
| 4 | Cipta Karya cited as a mix of `Permen PUPR 1/PRT/M/2022` **and** "SE Dirjen Cipta Karya 2026" | `sources.ts:35` | MEDIUM |
| 5 | `sourcePage` is optional and, per sampling, not populated — AHSP items cannot be traced to a page of the official document | `types.ts:44` | MEDIUM |
| 6 | The 2026 SE's classification of **new / major-change / minor-change / alternative AHSP** is not represented anywhere in the schema | no field exists | MEDIUM (blocks §35 migration semantics) |
| 7 | **Same AHSP code, two different prices, both claiming official provenance** | `AhspPriceBridge.ts:27` `A.4.1.1.5 → Rp 4,700,000 (verified: true)` vs `parametricVolumeEngine.ts:200` `A.4.1.1.5 → Rp 1,320,000` — **3.56× divergence** | **CRITICAL** |
| 8 | 166 of 194 calculators have **no AHSP mapping at all** (see `VOLUME_CALCULATOR_AUDIT_INVENTORY.md` §3) | pack calculators emit quantity only | HIGH (§34 unmapped) |

---

## 3. Migration classification

| Class | Required by §35 | Status in EZRAB |
|---|---|---|
| AHSP **new** in 2026 | list of newly introduced codes | **BLOCKED — cannot be produced** (requires the official Lampiran IV/V/VI PDFs) |
| AHSP **changed (major)** | codes whose coefficients changed materially | **BLOCKED** |
| AHSP **changed (minor)** | codes with editorial/minor changes | **BLOCKED** |
| AHSP **deprecated** | codes withdrawn in 2026 | **BLOCKED** |
| AHSP **alternative** | alternative methods offered | **BLOCKED** |
| AHSP **unmapped** | codes not reachable from any calculator | **PRODUCED** — 166 pack calculators have no mapping |

### Why BLOCKED and not estimated
Per Master Prompt §46 (STOP CONDITIONS) and §15 (do not fake 2026), producing a
new/changed/deprecated/alternative list requires the actual attachment contents. Those attachments are
published by Ditjen Bina Konstruksi (8 downloadable files, verified reachable 2026-09-27), but they are
large PDF/Excel documents whose coefficients **must not be transcribed by inference**. Until they are
ingested, any "2026 migration" claim would be fabrication.

**To unblock, one of the following is required from the Boss:**
1. Download the 8 official attachments (Batang Tubuh + Lampiran I–VII) and place them in the workspace
   (e.g. `docs/regulasi/SE-47-2026/`), **or**
2. Authorise an automated ingestion step that fetches those documents and parses them into
   `NationalAHSPItem` records with `sourcePage` populated, **or**
3. Point EZRAB at the e-HSD PUPR portal (`ehsd-pupr.id`) for basic prices and keep AHSP coefficients from
   the currently stored datasets, explicitly labelled `sourceYear: <as-stored>` + `verified: false`.

---

## 4. Versioning & snapshot status (§35, §36)

| Requirement | Status | Evidence |
|---|---|---|
| AHSP versioned (`AHSP-2023` / `2025` / `2026`) | ⚠️ partially — `version` field exists (`types.ts:38`) and sources carry `version: '2026.1'` / `'2022.0'` | `sources.ts:11,24,37,50,63` |
| Project stores `ahspVersion` | ❌ not found on the `Project` type | `src/types/index.ts` project interface has no `ahspVersion` |
| Project stores `priceSnapshotVersion` | ❌ not found | – |
| Price / AHSP / calculation snapshot on approval | ❌ not implemented (`AHSPProjectSnapshot` type exists but is unused by the approval flow) | `types.ts:84-96` |
| Old projects protected from silent coefficient drift | ❌ — no pinning, so a dataset edit changes historical RABs | – |

---

## 5. Required actions (ordered)

1. **Correct the citations** in `sources.ts` (`47/SE/Dk/2026`, drop the "Rev 2026" relabel of the 2024
   Bina Marga circular) and downgrade `status: 'VERIFIED'` → `'REVIEW'` until a document URL exists.
2. **Ingest the official attachments** (Batang Tubuh + Lampiran I–VII) with `sourcePage` per item.
3. **Add the 2026 change-class field** (`NEW | MAJOR_CHANGE | MINOR_CHANGE | ALTERNATIVE | UNCHANGED`) to
   `NationalAHSPItem` so §35 migration semantics become expressible.
4. **Resolve the dual-price conflict** — delete one of the two AHSP price tables and route both engines to
   a single authoritative repository.
5. **Map the 166 unmapped calculators** to AHSP codes (Calculator → Work Item → AHSP code → version →
   components → price database), per §34.
6. **Pin AHSP version per project** and implement the approval snapshot before any price update ships.
