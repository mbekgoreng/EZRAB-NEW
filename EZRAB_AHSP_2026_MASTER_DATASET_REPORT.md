# EZRAB — AHSP 2026 MASTER DATASET REPORT

**Document:** `EZRAB_AHSP_2026_MASTER_DATASET_REPORT.md`
**Phase:** 0 — Build, Extract, Normalize & Repair the complete AHSP 2026 master dataset
**Generated:** 2026-09-28T11:52:05.965Z
**Regulation:** SE DJBK No. 47/SE/Dk/2026 (Kementerian Pekerjaan Umum)
**Status:** READY_FOR_REVIEW — see §16 Import readiness

---

## 1. Source files

All sources are read from `sources/ahsp2026/` (canonical, official file names).

| Attachment | Field | File | Pages | Raw records | Role |
|---|---|---|---:|---:|---|
| Lampiran V | Bina Marga | `Lampiran-V-SE-DJBK-No-47-Tahun-2026-AHSP-Bidang-Bina-Marga.pdf` | 3,125 | 3,125 | AHSP source |
| Lampiran III | SMKK | `Lampiran-III-SE-DJBK-No-47-Tahun-2026-Biaya-Penerapan-SMKK.pdf` | 74 | 74 | AHSP source |
| Lampiran IV | Sumber Daya Air | `Lampiran-IV-SE-DJBK-No-47-Tahun-2026-AHSP-Bidang-Sumber-Daya-Air.pdf` | 1,689 | 1,689 | AHSP source |
| Lampiran VI | Cipta Karya | `Lampiran-VI-SE-DJBK-No-47-Tahun-2026-AHSP-Bidang-Cipta-Karya.pdf` | 1,563 | 1,563 | AHSP source |
| **Total (AHSP-bearing)** | | | **6,451** | **6,451** | |

### Non-AHSP annexes of the same regulation

| Attachment | Title | Pages | Contains AHSP items |
|---|---|---:|---|
| Lampiran I | Teknis pengumpulan data Harga pokok sektor konstruksi di Kementerian PU | 109 | ❌ guidance only |
| Lampiran II | Acuan dalam Penyusunan AHSP | 85 | ❌ reference tables only (Tabel A.1–A.36) |
| Lampiran VII | Tata Cara Pengajuan Usulan AHSP | — | ❌ procedural |

These three are recorded in `scripts/ahsp2026/sources.config.ts` (`GUIDANCE_DOCS`) and
contribute **0** items. See `EZRAB_AHSP_2026_MISSING_SOURCE.md`.

> **Phase 0.5 correction.** Earlier this report said "Lampiran II = AHSP Bina Marga" and
> "Lampiran V (AHSP Umum) not supplied". Both were wrong. The Bina Marga PDF's own cover
> reads **LAMPIRAN V**, its MD5 matches the authority's `download_id=10903`, and Lampiran VI
> cross-references it as *"Lampiran V Bidang Bina Marga"*. There is **no AHSP Bidang Umum**
> in SE 47/2026 — the `UMUM` field is legitimately empty.

## 2. Extraction method

All four PDFs are **text-based** (probe verdict TEXT-BASED on every source; see
`scripts/ahsp2026/probePdf.ts`). No OCR was required.

The pipeline mirrors the approach already proven in this repository for Lampiran II:

```
PDF
 ↓  pdfjs-dist getTextContent()              scripts/ahsp2026/core.ts
Glyph fragments
 ↓  reconstructLines()  (baseline grouping by transform[5], x-order by transform[4],
 ↓                       visible horizontal gap → column break)
Raw visual rows
 ↓  per-field parsers                        scripts/ahsp2026/parse.ts
Normalized AHSP items
 ↓  dedupe + validation + reports            scripts/ahsp2026/validate.ts
Validated master dataset
```

Joining fragments with spaces destroys the AHSP tables (koefisien/satuan/komponen must stay on
one visual row), which is why row reconstruction is mandatory rather than optional.

Three document layouts are handled, all keyed off the source's own structure:

| Field | Item delimiter | Component rows classified by |
|---|---|---|
| SDA | `A.1.01.a.1 <desc>` + table header within 12 lines | the section marker the row falls under (`A Tenaga Kerja` / `B Bahan` / `C Peralatan`) |
| Cipta Karya | `4.2.4.3 <desc>` + table header, rejecting section headings | same section markers |
| Bina Marga | the attachment's own NO/KODE index + the verified analysis extraction | `componentType` recorded by the existing extraction |
| SMKK | the numbered NO. hierarchy of the Tabel III.x cost tables | n/a (source has no coefficient table) |

**Component type is never guessed from a code prefix** — it is taken from the document section,
which is the only reliable signal across these four layouts.

## 3. Raw records

| Layer | Count |
|---|---:|
| Raw pages extracted | **6,451** |
| — Bina Marga | 3,125 |
| — SMKK | 74 |
| — SDA | 1,689 |
| — Cipta Karya | 1,563 |

Each raw record carries `raw_id`, `source_file`, `source_attachment`, `source_page`,
`raw_lines` and `raw_text` (§7), so any item can be traced back to the exact page.

## 4. Normalized records

**5,801** items in `data/ahsp2026/normalized/ahsp_2026_normalized.json`.

## 5. Validated records

**5,801** items in `data/ahsp2026/validated/ahsp_2026_master.json`,
carrying **29,320** component rows.

## 6. Needs-review records

**2,361** (40.7%).

## 7. Invalid records

**0**. No record was unrecoverable: every parsed row carries at
least a code or a description.

## 8. Category counts

| Field | Expected | Actual | Difference | Verified | Needs review |
|---|---:|---:|---:|---:|---:|
| SMKK | 246 | 223 | -23 | 0 | 223 |
| SDA | 1556 | 1556 | 0 | 935 | 621 |
| Bina Marga | 1425 | 1163 | -262 | 961 | 202 |
| Cipta Karya | 2841 | 2859 | 18 | 1544 | 1315 |
| Umum | 143 | 0 | -143 | 0 | 0 |
| **TOTAL** | **6211** | **5,801** | **-410** | **3,440** | **2,361** |

### Why the differences exist (§16)

| Field | Expected | Actual | Cause |
|---|---:|---:|---|
| SMKK | 246 | 223 | Lampiran III is a **risk-tiered cost-component table** (Tabel III.1 KECIL, Tabel III.2 SEDANG DAN BESAR), not a numbered AHSP catalogue. A raw line scan and the parser both return exactly 223 rows — **EXPECTED**, not missing. |
| SDA | 1556 | 1556 | Lampiran IV's own "Daftar Kode AHSP" prints rows 1..1556; all are captured. Row **810 is printed without a code** in the source → kept with an empty code and flagged `SOURCE_DEFECT`. |
| Bina Marga | 1425 | 1163 | Lampiran V's DAFTAR ISI prints exactly **1,137** rows (41 Normatif, 1,096 Informatif). An over-strict regex had hidden **129** of them — **PARSER_ERROR, now fixed**. The 1,425 target is not present in the document. |
| Cipta Karya | 2841 | 2859 | The DAFTAR ISI prints **2,841** status-bearing rows (independent line scan confirms). **38** were hidden by three layout quirks — **PARSER_ERROR, now fixed**. The dataset is slightly larger than 2,841 because analysis tables absent from the index are kept and flagged `analysis-only`. |
| Umum | 143 | 0 | **SOURCE_NONEXISTENT.** SE 47/2026 has no AHSP Bidang Umum. Not an extraction failure — the source does not exist. See `EZRAB_AHSP_2026_MISSING_SOURCE.md`. |

> **No item was fabricated to close a gap.** Per §16 and §35 the actual counts are reported,
> each difference is explained, and each is classified (EXPECTED / PARSER_ERROR / SOURCE_MISSING /
> SOURCE_NONEXISTENT) in `EZRAB_AHSP_2026_FORENSIC_GAP_REPORT.md`.

## 9. Resource counts

| Type | Count |
|---|---:|
| Material | 2,386 |
| Labor | 307 |
| Equipment | 1,205 |
| **Total** | **3,898** |

Look-alike entries flagged `possible_duplicate` or `conflict`: **680**.
Per §12, `Semen Portland`, `Semen Portland Type I` and `Semen Portland PCC` are **never**
auto-merged — they are kept as separate entries and flagged.

## 10. Duplicate count

| Category | Groups |
|---|---:|
| Exact duplicate code (same field + version) | 15 |
| Possible duplicate | 276 |
| **Total** | **291** |

Nothing was deleted (§14). The exact groups arise where the source's numbering restarts —
SMKK restarts its NO. hierarchy at each risk tier, and BM/CK restart per division. Every group is
classified in `data/ahsp2026/forensic/duplicate_classification.json` as
`TRUE_DUPLICATE` / `SAME_CODE_DIFFERENT_CONTEXT` / `SIMILAR_BUT_DIFFERENT` /
`SOURCE_VARIANT` / `UNRESOLVED` for human resolution.

## 11. Missing data count

**90** records with at least one missing required field
(`data/ahsp2026/reports/ahsp_missing_data.json`).

| Issue family | Records |
|---|---:|
| POSSIBLE_DUPLICATE | 1319 |
| NO_COMPONENTS_IN_SOURCE | 965 |
| NO_ANALYSIS_TABLE | 350 |
| SMKK_NOT_AN_AHSP_ANALYSIS | 223 |
| IN_INDEX_ONLY_CK | 200 |
| SUSPECT_MERGED_RESOURCE_NAME | 196 |
| HEADER_ONLY_ENTRY | 130 |
| MISSING_UNIT | 81 |
| SOURCE_TOTAL_MISMATCH_LABOR | 59 |
| IN_INDEX_ONLY_BM | 46 |
| SOURCE_TOTAL_MISMATCH_MATERIAL | 46 |
| EXACT_DUPLICATE_CODE | 35 |

## 12. Broken rows

Row-level repair was **structural only** (§28). Nothing official was altered:

| Situation | Handling |
|---|---|
| Coefficient printed as `0,150` | stored as `coefficient: 0.15` **and** `coefficient_raw: "0,150"` — the raw text is never discarded (§11) |
| Resource name wrapped above its row | re-attached from a bounded 3-line buffer |
| Code/unit columns printed on the name's line | stripped from the name fragment, kept as the component's code/unit |
| Row with prices after the coefficient (SDA `A.3.04.2c`) | parsed by locating the last (unit, number) pair, so priced and un-priced layouts behave identically |
| Narrative rows such as `a tanah subur : 75` | rejected — not component rows |
| Unreadable coefficient | `coefficient: null` + `UNREADABLE_COEFFICIENT` → NEEDS_REVIEW. Never guessed. |

29,320 component rows were extracted; **0** carry a negative coefficient and
**0** carry a non-numeric coefficient.

## 13. Source traceability

Every item carries:

```json
"source": {
  "regulation": "SE DJBK No. 47/SE/Dk/2026",
  "attachment": "IV",
  "page": 52,
  "source_file": "Lampiran-IV-SE-DJBK-No-47-Tahun-2026-AHSP-Bidang-Sumber-Daya-Air.pdf"
}
```

**Test 9** asserts that each `source.page` really exists in the corresponding raw layer, so the
chain `AHSP → attachment → page → source file → raw record` is machine-verified, not asserted.

## 14. Existing dataset comparison

| Legacy file | Items | Relationship to the new master |
|---|---:|---|
| `sdaAHSPDataset.ts` | 1,554 | PURGED — archived; NationalAHSPItem[], hardcoded unitPrice + component prices |
| `binaMargaAHSPDataset.ts` | 1,144 | PURGED — FABRICATED (self-declared DEPRECATED in-file) |
| `binaMargaAHSP2026Official.ts` | 986 | PURGED — real extraction but mis-labelled "Lampiran II"; superseded by canonical Lampiran V |
| `ciptaKaryaAHSPDataset.ts` | 3,131 | PURGED — hardcoded unitPrice + component prices |
| `smkkDataset.ts` | 124 | PURGED — SMKKMasterItem[], different schema (no components) |

**Legacy datasets were PURGED and the canonical catalog re-imported.** The runtime now reads:

```
data/ahsp2026/validated/ahsp_2026_master.json   (verified, price-free — source of truth)
        ↓  scripts/ahsp2026/generateCanonicalModule.ts
src/data/nationalCostDatabase/ahsp2026Canonical.generated.ts   (5,801 items)
        ↓
src/data/nationalCostDatabase/masterRegistry.ts  (single choke point)
        ↓  ALL_OFFICIAL_AHSP_ITEMS
every consumer (UI, pricing, DED/RAB, AI retrieval)

backups/legacy-ahsp-pre-2026-purge/   ← the old datasets, ARCHIVED only
```

The key difference: the legacy datasets embed `unitPrice`, `totalLabor`, `totalMaterial` and
`totalEquipment` directly on each item, so a price change mutates the "official" record. The new
master stores **coefficients and resource references only**; the active price is resolved by the
Price Engine (§13, §19).

## 15. Remaining issues

| # | Issue | Severity | Detail |
|---|---|---|---|
| 1 | **No AHSP Bidang Umum exists in SE 47/2026** | INFO (decision needed) | The 143-item target is `SOURCE_NONEXISTENT`. The project owner must drop, re-scope, or re-point it. See `EZRAB_AHSP_2026_MISSING_SOURCE.md`. |
| 2 | Bina Marga actual (1163) < target (1425) | INFO | Lampiran V's own index prints 1,137 rows; 1,425 is not a target of this annex. 129 rows hidden by a regex bug were recovered in Phase 0.5. |
| 3 | SMKK items have no components | BY DESIGN | Lampiran III is a cost-component table; there is no coefficient table to extract. |
| 4 | 965 items have no components | MEDIUM | Mostly SMKK plus inventory-only / index-only rows; each is flagged `NO_COMPONENTS_IN_SOURCE` and bucketed in `needs_review/no_components.json`. |
| 5 | 15 exact duplicate codes | LOW | Source numbering restarts across risk tiers (SMKK) and across divisions (BM/CK); reported, not auto-resolved. |
| 6 | `SUSPECT_MERGED_RESOURCE_NAME` on 196 items | LOW | Two-column layouts occasionally merge two labour names; flagged in `needs_review/merged_resource_names.json`. |
| 7 | SDA inventory row **810** has no code in the source | LOW | Kept with an empty code, flagged `SOURCE_DEFECT`. Code **not** invented. |
| 8 | Legacy fabricated datasets | ✅ RESOLVED | Purged from `src/` and archived under `backups/legacy-ahsp-pre-2026-purge/`. The runtime catalog is the verified canonical 2026 dataset only. |

## 16. Import readiness

| Gate | Status |
|---|---|
| Official sources located | ✅ all 7 annexes (4 AHSP-bearing + 3 non-AHSP) |
| Extraction succeeded | ✅ 6,451 pages, 0 unreadable documents |
| Coefficients numeric | ✅ 0 non-numeric, 0 negative |
| Source traceability | ✅ machine-verified by Test 9 |
| Prices separated from the master | ✅ verified by Test 12 |
| Independent method agreement | ✅ SMKK 223=223, SDA 1556=1556, BM 1137 index rows, CK 2841=2841 |
| All declared fields complete | ⚠️ `UMUM` = 0 — but **no such field exists** in the regulation |
| Duplicates resolved | ⚠️ 291 groups reported, none auto-deleted |

**STATUS: `READY_FOR_REVIEW`**

Every annex of SE 47/2026 is now fully accounted for and every gap is explained with
source-level evidence. The status is `READY_FOR_REVIEW` rather than `READY_FOR_IMPORT`
because (a) the `UMUM` target needs a human decision, and (b) the flagged records
(2,361) are awaiting review. No source is missing any more.

## 17. Reproduce

```bash
npm run ahsp:extract     # PDF → data/ahsp2026/raw/*.jsonl        (≈2 min, 6,451 pages)
npm run ahsp:normalize   # raw → data/ahsp2026/normalized/*.json  (≈10 s)
npm run ahsp:validate    # normalized → validated + reports        (≈1 s)
npm run ahsp:forensic    # validated → forensic gap artefacts      (≈5 s)
npm run ahsp:report      # regenerates this report + the forensic reports
npm run ahsp:test        # dataset assertions
```

---

*Generated by `scripts/ahsp2026/generateReport.ts` from the artefacts in
`data/ahsp2026/`. Every number in this document is read from a generated file.*
