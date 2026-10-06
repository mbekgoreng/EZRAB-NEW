# EZRAB AHSP 2026 — FORENSIC GAP REPORT

Generated: 2026-09-28T11:52:10.386Z
Regulation: **SE DJBK No. 47/SE/Dk/2026**
Phase: **0.5 — Forensic Recovery, Gap Analysis & Completion**

---

## 0. Executive summary

| # | Finding | Impact |
|---|---|---|
| 1 | **The regulation has 7 annexes, not 6.** Lampiran II = *Acuan dalam Penyusunan AHSP* (reference tables), Lampiran VII = *Tata Cara Pengajuan Usulan AHSP* (procedure). Neither carries AHSP items. | The "missing Lampiran V" premise was a mislabelling; the real gap was Lampiran II, now acquired. |
| 2 | **The Bina Marga file was mislabelled `Lampiran-II`; it is Lampiran V.** Proven by cover page, MD5, page range, and a cross-reference in Lampiran VI. | Bina Marga `source.attachment` corrected II → V. |
| 3 | **There is no AHSP Bidang Umum.** | The 143-item Umum target is `SOURCE_NONEXISTENT` — see `EZRAB_AHSP_2026_MISSING_SOURCE.md`. |
| 4 | **Bina Marga index parser dropped 129 of 1,137 rows** (over-strict code regex). | Fixed → Bina Marga items 1134 → union 1163. |
| 5 | **Cipta Karya index parser dropped 38 of 2,841 rows** (letter-suffixed codes, wrapped code digits, code-less rows). | Fixed → CK index parses 2841 rows = the source count. |
| 6 | **SDA index row 810 is printed without a code** in the source. | Recorded as `SOURCE_DEFECT`; code **not** invented. SDA now 1556/1556. |
| 7 | **SMKK contains exactly 223 rows**, confirmed by two independent methods. | The 246 target is not a target of Lampiran III. |

**Net result: 5801 items, -410 vs the brief's 6211.**
Every remaining difference is explained below and classified. No item was invented.

---

## 1. Target reconciliation

| Field | Brief target | Extracted | Δ | Classification | Verdict |
|---|---:|---:|---:|---|---|
| SMKK | 246 | 223 | -23 | EXPECTED | SOURCE_DISPUTED |
| SDA | 1556 | 1556 | 0 | ACTUAL (closed) | SOURCE_CONFIRMED |
| Bina Marga | 1425 | 1163 | -262 | EXPECTED + PARSER_ERROR (fixed) | SOURCE_DISPUTED |
| Cipta Karya | 2841 | 2859 | 18 | ACTUAL (closed, PARSER_ERROR fixed) | SOURCE_DISPUTED |
| Umum | 143 | 0 | -143 | SOURCE_NONEXISTENT | SOURCE_NONEXISTENT |
| **TOTAL** | **6211** | **5801** | **-410** | | |

### Provenance of each target (§2 — targets are not assumed correct)

**SMKK — SOURCE_DISPUTED**

> Lampiran III prints risk-tiered cost tables (Tabel III.1 KECIL, Tabel III.2 SEDANG DAN BESAR), not a numbered AHSP catalogue. A raw line scan and the parser both return exactly 223 rows. No index in the annex prints 246.

**SDA — SOURCE_CONFIRMED**

> Lampiran IV's own 'Daftar Kode AHSP' prints rows 1..1556 — the target matches the source, and all 1556 are now captured (row 810 is printed without a code and is flagged SOURCE_DEFECT).

**BINA_MARGA — SOURCE_DISPUTED**

> Lampiran V's own DAFTAR ISI prints exactly 1,137 rows (41 Normatif, 1,096 Informatif). The document does not contain 1,425 items. 129 of the 1,137 were hidden by an over-strict parser regex and are now recovered.

**CIPTA_KARYA — SOURCE_DISPUTED**

> Lampiran VI's 'Daftar Isi Tabel AHSP' prints 2,841 status-bearing rows (verified by an independent line scan). The target 2,841 is the INDEX count; the dataset is slightly larger because analysis tables absent from the index are kept and flagged analysis-only.

**UMUM — SOURCE_NONEXISTENT**

> SE 47/2026 has seven annexes: I (harga pokok), II (acuan penyusunan AHSP), III (SMKK), IV (SDA), V (Bina Marga), VI (Cipta Karya), VII (tata cara pengajuan usulan AHSP). There is no "AHSP Bidang Umum". The 143 target does not correspond to any annex.


**Sum of the three non-existent/disputed targets:** SMKK 23 + Bina Marga 262 +
Cipta Karya −18 + Umum 143 = 410. After removing targets that the sources never
claimed, the remaining difference is **0**: every annex is now fully captured.

---

## 2. Bina Marga — three-method forensic comparison (§5, §6, §7)

The annex was counted three independent ways.

| Method | What it counts | Rows | Distinct codes |
|---|---|---:|---:|
| **A** | the annex's own DAFTAR ISI code index (pages 4–30) | 1137 | 1134 |
| **B** | item headers printed in the analysis body | 1118 | 1117 |
| **C** | items that actually carry a rendered analysis table | 986 | 986 |

Method A breakdown:

- rows: **1137**, of which **1** print no code in the KODE column
- status: **41 Normatif**, **1096 Informatif**
- rows without a SATUAN: **3**

### 2.1 The 129-row parser defect (PARSER_ERROR → fixed)

The original index regex required the code to be shaped `\d+\.\d+\.\(…\)` **and**
the status to sit on the same line. It matched only **1,008** of the **1,137**
rows. The 129 lost rows fall into four shapes:

| Shape | Example | Count |
|---|---|---:|
| plain code (no parentheses) | `A.1 1.2 Mobilisasi Lumsum Informatif` | 15 |
| suffixed code | `G.47 7.2.(5c).30   Buah Informatif` | 90 |
| code printed on the line above | `B.9 2.3.(1)   Meter Panjang` | 19 |
| code inside the wrapped description | `G.51 … 7.2.(8).65.50- …` | 5 |

All four are now parsed. The row model keys on the **serial** (`A.1`, `G.51`),
which every row carries, and promotes embedded codes with
`promoteEmbeddedBmCode()`.

### 2.2 Index vs analysis

- codes in the index with **no analysis table**: see `BM_missing_from_analysis.json`
- analysis items **absent from the index**: see `BM_extra_analysis.json`
- difference vs the legacy in-repo dataset: see `BM_existing_dataset_difference.json`
  (legacy 0 items vs 1162 now)

### 2.3 §7 classification

| Kind | Count |
|---|---:|
| `NORMATIVE_ANALYSIS` (Normatif + analysis table) | 959 |
| `INFORMATIVE_HEADER` (Informatif with a body header) | 130 |
| `INDEX_REFERENCE_ONLY` (listed, no analysis in the annex) | 48 |

---

## 3. SMKK — Lampiran III (§8)

| Metric | Value |
|---|---:|
| Brief target | 246 |
| Parsed rows | 223 |
| Independent raw-line scan | 223 |
| Δ vs target | -23 |

Per risk tier (both methods agree):

| Tier | Rows |
|---|---:|
| KECIL | 56 |
| SEDANG DAN BESAR | 167 |

**Classification: `EXPECTED`.** Lampiran III is a **risk-tiered cost-component
table** (Tabel III.1 KECIL, Tabel III.2 SEDANG DAN BESAR), not a numbered AHSP
catalogue. Two independent methods return the same 223 rows, so **no
row is missing**. The 246 target is not a target of this annex.

**Duplicates:** 6 repeated-code groups — all legitimate, because the
NO. hierarchy restarts at each tier. See `smkk_exact_duplicates.json`.

---

## 4. SDA — Lampiran IV (§9)

| Metric | Value |
|---|---:|
| Brief target | 1556 |
| Parsed inventory rows | 1556 |
| Index number range | 1–1556 |
| Δ vs target | 0 |

**Classification: `ACTUAL` — the gap is closed.**

The annex's own *Daftar Kode AHSP* prints rows **1…1556**.
Every number is now present. Exactly **one** row is printed **without a code**:

```
page 28 · row 810: "Pondasi Tiang Bor ∅ 180 cm" (m', Informatif)
   neighbours: 809=A.3.06.5d, 811=A.3.06.6a
```

The row sits between `A.3.06.5d` (809) and `A.3.06.6a` (811). A code could be
guessed from the pattern — **it was not**. The row is kept with an empty code and
demoted to `NEEDS_REVIEW` (`SOURCE_DEFECT`). This is the *only* SDA discrepancy,
and it is a defect in the published PDF, not in the pipeline.

---

## 5. Cipta Karya — Lampiran VI (§10)

| Metric | Value |
|---|---:|
| Brief target | 2841 |
| Index rows parsed | 2841 |
| Independent status-line scan | 2841 |
| Δ vs target | 0 |

**Classification: `ACTUAL` — the gap is closed (PARSER_ERROR fixed).**

The annex prints **2841** index rows. The original
parser captured only 2,803. The **38 lost rows** were:

| Kind | Count | Pages |
|---|---:|---|
| letter_suffixed_codes | 13 | 53, 54 |
| unit_missing_in_source | 1 | 77 |
| code_wrapped_mid_column | 24 | 102, 103 |

The interesting one is the third: the Kabel Tray block on pages 102–103 prints
`5.1.1.12.10` and puts the final digit on the next line, so the real code is
`5.1.1.12.100`. Both the digit and the `unit Normatif Tetap` column are printed
in the source — `prejoinCkWrappedRows()` re-joins them without inventing anything.

The final dataset reports **2859** Cipta Karya items: the 2841
index rows plus analysis tables that are absent from the DAFTAR ISI (kept and
flagged `analysis-only`).

---

## 6. Umum (§4)

**Classification: `SOURCE_NONEXISTENT`.** There is no AHSP Bidang Umum in this
regulation. Full evidence in **`EZRAB_AHSP_2026_MISSING_SOURCE.md`**.

---

## 7. NEEDS_REVIEW classification (§12)

Records flagged `NEEDS_REVIEW`: **2361** of 5801
(`VERIFIED` 3440, `INVALID` 0).

Partitioned into five actionable buckets (a record may appear in more than one):

| Bucket | Records |
|---|---:|
| `POSSIBLE_DUPLICATES` | 1319 |
| `NO_COMPONENTS` | 965 |
| `INDEX_ONLY` | 726 |
| `MERGED_RESOURCE_NAMES` | 196 |
| `MISSING_UNITS` | 81 |
| (not in any bucket) | 27 |

Files: `data/ahsp2026/forensic/needs_review/{possible_duplicates,no_components,index_only,merged_resource_names,missing_units}.json`

Top validation issue families:

| Issue | Records |
|---|---:|
| `POSSIBLE_DUPLICATE` | 1319 |
| `NO_COMPONENTS_IN_SOURCE` | 965 |
| `NO_ANALYSIS_TABLE` | 350 |
| `SMKK_NOT_AN_AHSP_ANALYSIS` | 223 |
| `IN_INDEX_ONLY_CK` | 200 |
| `SUSPECT_MERGED_RESOURCE_NAME` | 196 |
| `HEADER_ONLY_ENTRY` | 130 |
| `MISSING_UNIT` | 81 |
| `SOURCE_TOTAL_MISMATCH_LABOR` | 59 |
| `IN_INDEX_ONLY_BM` | 46 |
| `SOURCE_TOTAL_MISMATCH_MATERIAL` | 46 |
| `EXACT_DUPLICATE_CODE` | 35 |

The dominant bucket is `NO_COMPONENTS`/`INDEX_ONLY` — these are items the annex
**lists but does not analyse** (Informatif reference rows). They are real catalogue
entries; they simply have no coefficient table to read.

---

## 8. Duplicate classification (§13)

Total groups: **291**

| Classification | Groups |
|---|---:|
| `TRUE_DUPLICATE` | 280 |
| `SIMILAR_BUT_DIFFERENT` | 5 |
| `UNRESOLVED` | 6 |

Legend:

- **TRUE_DUPLICATE** — Same code, same field, same content — the source genuinely repeats the item.
- **SAME_CODE_DIFFERENT_CONTEXT** — Same code in two different fields — the numbering is per-field, so this is expected, not a defect.
- **SIMILAR_BUT_DIFFERENT** — Same description/signature key but the component sets differ — distinct items that look alike.
- **SOURCE_VARIANT** — Same code in the same field but from different attachments.
- **UNRESOLVED** — Could not be decided from the data alone; needs a human read of the source page.

`TRUE_DUPLICATE` groups dominate because several annexes genuinely repeat an item
under the same code in different divisions. They are **kept**, not deleted, and
flagged so a reviewer can confirm each one against the printed page.

---

## 9. Reproducibility (§19)

The whole analysis is deterministic and re-runnable:

```
npm run ahsp:extract      # PDFs -> raw JSONL (6,451 pages)
npm run ahsp:normalize    # raw  -> normalized items
npm run ahsp:validate     # normalized -> validated master + reports
npm run ahsp:forensic     # validated -> forensic gap artefacts
npm run ahsp:report       # artefacts -> markdown reports
npm run ahsp:test         # assertions
npm test                  # project suite
npm run build             # production build
```

Sources are read from `sources/ahsp2026/` (all 7 annexes, official names, MD5-verified).

---

## 10. What was NOT touched (§23)

- ❌ Supabase / database import
- ❌ UI / components
- ❌ RAB engine, Price Engine, calculator registry
- ❌ Existing in-repo AHSP datasets (left in place, untouched)
- ❌ No fabricated coefficient, code, unit, description, or price
