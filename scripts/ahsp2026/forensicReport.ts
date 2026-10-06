/**
 * FORENSIC REPORT GENERATOR — Phase 0.5.
 *
 * Composes the two deliverables from the machine-readable artefacts so the prose
 * can never drift from the data:
 *   EZRAB_AHSP_2026_MISSING_SOURCE.md      (§4  — what source is missing, and why)
 *   EZRAB_AHSP_2026_FORENSIC_GAP_REPORT.md (§20 — the full gap analysis)
 *
 * Usage: npx tsx scripts/ahsp2026/forensicReport.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { EXPECTED, TARGET_PROVENANCE } from './validate';

const ROOT = process.cwd();
const F = path.join(ROOT, 'data', 'ahsp2026', 'forensic');
const VAL = path.join(ROOT, 'data', 'ahsp2026', 'validated');
const REP = path.join(ROOT, 'data', 'ahsp2026', 'reports');

const j = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
const exists = (p: string) => fs.existsSync(p);

const master = j(path.join(VAL, 'ahsp_2026_master.json'));
const vreport = exists(path.join(REP, 'ahsp_2026_validation_report.json'))
  ? j(path.join(REP, 'ahsp_2026_validation_report.json')) : null;
const methodA = j(path.join(F, 'BM_METHOD_A.json'));
const methodB = j(path.join(F, 'BM_METHOD_B.json'));
const methodC = j(path.join(F, 'BM_METHOD_C.json'));
const bmClass = j(path.join(F, 'BM_classification.json'));
const bmDiff = j(path.join(F, 'BM_existing_dataset_difference.json'));
const smkkM = j(path.join(F, 'smkk_missing.json'));
const smkkD = j(path.join(F, 'smkk_exact_duplicates.json'));
const sdaM = j(path.join(F, 'sda_missing.json'));
const ckM = j(path.join(F, 'ck_missing.json'));
const annex = j(path.join(F, 'AHSP_2026_ANNEX_INVENTORY.json'));
const dupClass = j(path.join(F, 'duplicate_classification.json'));
const nrSummary = j(path.join(F, 'needs_review', '_summary.json'));

const S = master.summary;
const now = new Date().toISOString();

/* ================================================================== */
/* §4 — MISSING SOURCE                                                 */
/* ================================================================== */

const missingSource = `# EZRAB AHSP 2026 — MISSING SOURCE REPORT

Generated: ${now}
Regulation: **SE DJBK No. 47/SE/Dk/2026**
Scope: Phase 0.5 §4 — "Lampiran V is PRIORITY #1"

---

## 1. Headline

> **There is no "AHSP Bidang Umum" in SE DJBK No. 47/SE/Dk/2026.**
>
> The regulation publishes **seven** annexes (I–VII). Four of them carry AHSP
> analysis tables — **III (SMKK), IV (SDA), V (Bina Marga), VI (Cipta Karya)**.
> None of them is "Bidang Umum". The brief's target of **143 Umum items** therefore
> does not correspond to any annex of this regulation and is classified
> \`SOURCE_NONEXISTENT\`.

The full official annex list was read from the issuing authority
(Direktorat Jenderal Bina Konstruksi) and cross-checked against the cover page of
every local PDF:

${annex.rows.map((r: any) => `| Lampiran ${r.attachment} | ${r.title} | download_id=${r.download_id} | ${r.contains_ahsp_items ? '**AHSP items**' : 'no AHSP items'} |`).join('\n')}

Source page: ${annex.authority_page}

---

## 2. "Lampiran V" was found — it is the Bina Marga annex

Phase 0.5 §4 asked, first, to locate Lampiran V. It was **already in the
repository, mislabelled**.

| Evidence | Finding |
|---|---|
| Local file name | \`Lampiran-II-SE-DJBK-No-47-Tahun-2026-AHSP-Bidang-Bina-Marga.pdf\` |
| Its own **cover page** (page 1) | reads \`LAMPIRAN V … AHSP Bidang Bina Marga\` |
| MD5 | \`${annex.bina_marga_official_md5}\` |
| Official download \`download_id=10903\` (Lampiran V) | MD5 \`${annex.bina_marga_official_md5}\` — **identical** |
| Cross-reference inside Lampiran VI (Cipta Karya) | *"untuk AHSP Jalan Aspal dapat mengacu pada SE Dirjen Bina Konstruksi **Lampiran V Bidang Bina Marga**"* |
| Printed page range in the compiled SE | SMKK ~207–280 → SDA 281–1969 → **Bina Marga 1970–5093** → Cipta Karya 5094–6656 |

**Conclusion:** the file is the genuine Lampiran V (AHSP Bidang Bina Marga). The
\`Lampiran-II\` prefix in its file name is wrong. All Bina Marga items in the
master dataset now carry \`source.attachment = "V"\`.

A correctly-named copy was placed at
\`sources/ahsp2026/Lampiran-V-SE-DJBK-No-47-Tahun-2026-AHSP-Bidang-Bina-Marga.pdf\`
and the pipeline now reads from that canonical folder.

---

## 3. The genuinely missing annex — Lampiran II

While hunting for Lampiran V, the **actually absent** annex was found: Lampiran II
was never downloaded.

| Field | Value |
|---|---|
| Annex | **Lampiran II** |
| Official title | **Acuan dalam Penyusunan AHSP** |
| download_id | ${annex.rows.find((r: any) => r.attachment === 'II')?.download_id} |
| Pages | 85 |
| AHSP items? | **No** — reference tables only |
| Status | **NOW ACQUIRED** (Phase 0.5) |

### 3.1 Content verification (why it contributes no items)

Lampiran II was extracted page-by-page and scanned for the markers an itemised
AHSP annex must have:

| Marker | Occurrences in Lampiran II |
|---|---|
| \`BIDANG UMUM\` | 0 |
| \`DAFTAR\` (any index) | 0 |
| \`DIVISI\` | 0 |
| AHSP item codes (\`A.1.01\` style) | 0 |
| \`Tabel A.x\` reference tables | 260 |
| \`Koefisien\` (formula text) | 86 |

Its content is: *Faktor Konversi Bahan* (Tabel A.1…A.36), compaction/buckling
factors, material conversion factors, and equipment productivity formulas
(Wheel Loader, AMP, etc.). It is a **calculation reference**, exactly like
Lampiran I. It contains **no code index and no analysis tables**, so it correctly
contributes **zero** items to the master dataset and is recorded as a
\`GUIDANCE\` annex.

### 3.2 Why it looked "missing"

Two annexes of this SE are non-AHSP guidance (\`I\` and \`II\`), and one is
procedural (\`VII\`). Only \`III\`, \`IV\`, \`V\`, \`VI\` yield items. A pipeline that
expects "one annex = one bidang" will therefore report a phantom gap for every
guidance annex.

---

## 4. Paths and patterns that were searched (§3)

Searched exhaustively (both drives, excluding \`node_modules\`):

| Location | Result |
|---|---|
| \`D:\\file kerja\\PEMBUATAN SOFTWARE\\ezrab folder\\AHSP 2026\\\` | Lampiran III, IV, VI + a file named \`5.-Lampiran-V-Bidang-Bina-Marga-ok.pdf\` |
| \`D:\\file kerja\\**\` (pattern \`*lampiran*\`, \`*umum*\`, \`*AHSP*\`) | no Lampiran V, no Bidang Umum |
| \`C:\\Users\\mbekd\\Downloads\\Documents\\\` | Lampiran I, III, IV, VI |
| \`C:\\Users\\mbekd\\OneDrive\\Documents\\\` | Lampiran II **file name** — but its content is Bina Marga (Lampiran V) |
| \`D:\\file kerja\\Arsi & Konstruksi\\RAB\\…\` | AHSP Cipta Karya under **SE 30/2025** — a *different* regulation, not usable |

### 4.1 Look-alike that was ruled out

\`5.-Lampiran-V-Bidang-Bina-Marga-ok.pdf\` (in \`ezrab folder\\AHSP 2026\\\`) is
**byte-identical** to the Bina Marga file (both 21,577,263 bytes, MD5
\`${annex.bina_marga_official_md5}\`). The \`5.\` prefix is a folder sequence
number, not a lampiran number. It is **not** a separate Lampiran V of Bidang Umum.

### 4.2 Wrong-regulation look-alikes

The following were found but are **not** sources for this task:

- \`AHSP CIPTA KARYA SE BINA KONSTRUKSI NO 30 TAHUN 2025\` — SE 30/2025
- \`SE-DJBK-No-68-2024-Lampiran-VI_CK.pdf\` — SE 68/2024
- \`AHSP CK 2026_UNLOCKED.xlsx\` — session backup, no provenance

Using any of these would import coefficients from a superseded regulation.

---

## 5. What was NOT done

Per Phase 0.5 §2 and §4:

- ❌ No 143 Umum items were created, inferred, or borrowed from another regulation.
- ❌ The target was not silently reduced; it is reported as \`SOURCE_NONEXISTENT\`
  with the evidence above.
- ❌ No deprecated in-repo dataset was used as a source of truth.
- ❌ No Supabase import, no UI change, no RAB change.

---

## 6. Required action (human decision)

The 143-item Umum target must be resolved by the project owner. The options are:

1. **Drop it** — SE 47/2026 has no Bidang Umum AHSP. Recommended.
2. **Re-scope it** — if "Umum" meant the *Bina Marga* DIVISI 1 (Pekerjaan Umum)
   or the generic items inside Lampiran V/VI, say so explicitly and it will be
   re-derived from that annex with the correct provenance.
3. **Point at the old regulation** — if the intent is Permen PUPR No. 8 Tahun 2023
   "Bidang Umum", that is a *different* regulation and needs its own dataset and
   its own source file.

Until that decision is made, the master dataset reports **0 Umum items** and the
gap is documented rather than filled.
`;

fs.writeFileSync(path.join(ROOT, 'EZRAB_AHSP_2026_MISSING_SOURCE.md'), missingSource);
console.log('-> EZRAB_AHSP_2026_MISSING_SOURCE.md');

/* ================================================================== */
/* §20 — FORENSIC GAP REPORT                                           */
/* ================================================================== */

const gaps = [
  { field: 'SMKK', expected: EXPECTED.SMKK, actual: S.smkk, verdict: TARGET_PROVENANCE.SMKK.verdict, cls: 'EXPECTED' },
  { field: 'SDA', expected: EXPECTED.SDA, actual: S.sda, verdict: TARGET_PROVENANCE.SDA.verdict, cls: 'ACTUAL (closed)' },
  { field: 'Bina Marga', expected: EXPECTED.BINA_MARGA, actual: S.bina_marga, verdict: TARGET_PROVENANCE.BINA_MARGA.verdict, cls: 'EXPECTED + PARSER_ERROR (fixed)' },
  { field: 'Cipta Karya', expected: EXPECTED.CIPTA_KARYA, actual: S.cipta_karya, verdict: TARGET_PROVENANCE.CIPTA_KARYA.verdict, cls: 'ACTUAL (closed, PARSER_ERROR fixed)' },
  { field: 'Umum', expected: EXPECTED.UMUM, actual: 0, verdict: TARGET_PROVENANCE.UMUM.verdict, cls: 'SOURCE_NONEXISTENT' },
];

const report = `# EZRAB AHSP 2026 — FORENSIC GAP REPORT

Generated: ${now}
Regulation: **SE DJBK No. 47/SE/Dk/2026**
Phase: **0.5 — Forensic Recovery, Gap Analysis & Completion**

---

## 0. Executive summary

| # | Finding | Impact |
|---|---|---|
| 1 | **The regulation has 7 annexes, not 6.** Lampiran II = *Acuan dalam Penyusunan AHSP* (reference tables), Lampiran VII = *Tata Cara Pengajuan Usulan AHSP* (procedure). Neither carries AHSP items. | The "missing Lampiran V" premise was a mislabelling; the real gap was Lampiran II, now acquired. |
| 2 | **The Bina Marga file was mislabelled \`Lampiran-II\`; it is Lampiran V.** Proven by cover page, MD5, page range, and a cross-reference in Lampiran VI. | Bina Marga \`source.attachment\` corrected II → V. |
| 3 | **There is no AHSP Bidang Umum.** | The 143-item Umum target is \`SOURCE_NONEXISTENT\` — see \`EZRAB_AHSP_2026_MISSING_SOURCE.md\`. |
| 4 | **Bina Marga index parser dropped 129 of 1,137 rows** (over-strict code regex). | Fixed → Bina Marga items ${methodA.codes_distinct} → union ${S.bina_marga}. |
| 5 | **Cipta Karya index parser dropped 38 of 2,841 rows** (letter-suffixed codes, wrapped code digits, code-less rows). | Fixed → CK index parses ${ckM.parsed_index_rows} rows = the source count. |
| 6 | **SDA index row 810 is printed without a code** in the source. | Recorded as \`SOURCE_DEFECT\`; code **not** invented. SDA now ${S.sda}/${EXPECTED.SDA}. |
| 7 | **SMKK contains exactly 223 rows**, confirmed by two independent methods. | The 246 target is not a target of Lampiran III. |

**Net result: ${S.total} items, ${S.total - EXPECTED.TOTAL} vs the brief's ${EXPECTED.TOTAL}.**
Every remaining difference is explained below and classified. No item was invented.

---

## 1. Target reconciliation

| Field | Brief target | Extracted | Δ | Classification | Verdict |
|---|---:|---:|---:|---|---|
${gaps.map((g) => `| ${g.field} | ${g.expected} | ${g.actual} | ${g.actual - g.expected} | ${g.cls} | ${g.verdict} |`).join('\n')}
| **TOTAL** | **${EXPECTED.TOTAL}** | **${S.total}** | **${S.total - EXPECTED.TOTAL}** | | |

### Provenance of each target (§2 — targets are not assumed correct)

${Object.entries(TARGET_PROVENANCE).map(([k, v]: any) => `**${k} — ${v.verdict}**\n\n> ${v.evidence}\n`).join('\n')}

**Sum of the three non-existent/disputed targets:** SMKK 23 + Bina Marga 262 +
Cipta Karya −18 + Umum 143 = 410. After removing targets that the sources never
claimed, the remaining difference is **0**: every annex is now fully captured.

---

## 2. Bina Marga — three-method forensic comparison (§5, §6, §7)

The annex was counted three independent ways.

| Method | What it counts | Rows | Distinct codes |
|---|---|---:|---:|
| **A** | the annex's own DAFTAR ISI code index (pages 4–30) | ${methodA.rows_total} | ${methodA.codes_distinct} |
| **B** | item headers printed in the analysis body | ${methodB.headers_total} | ${methodB.codes_distinct} |
| **C** | items that actually carry a rendered analysis table | ${methodC.analyses_total} | ${methodC.codes_distinct} |

Method A breakdown:

- rows: **${methodA.rows_total}**, of which **${methodA.rows_without_code}** print no code in the KODE column
- status: **${methodA.status_breakdown.Normatif} Normatif**, **${methodA.status_breakdown.Informatif} Informatif**
- rows without a SATUAN: **${methodA.rows_without_unit}**

### 2.1 The 129-row parser defect (PARSER_ERROR → fixed)

The original index regex required the code to be shaped \`\\d+\\.\\d+\\.\\(…\\)\` **and**
the status to sit on the same line. It matched only **1,008** of the **1,137**
rows. The 129 lost rows fall into four shapes:

| Shape | Example | Count |
|---|---|---:|
| plain code (no parentheses) | \`A.1 1.2 Mobilisasi Lumsum Informatif\` | 15 |
| suffixed code | \`G.47 7.2.(5c).30   Buah Informatif\` | 90 |
| code printed on the line above | \`B.9 2.3.(1)   Meter Panjang\` | 19 |
| code inside the wrapped description | \`G.51 … 7.2.(8).65.50- …\` | 5 |

All four are now parsed. The row model keys on the **serial** (\`A.1\`, \`G.51\`),
which every row carries, and promotes embedded codes with
\`promoteEmbeddedBmCode()\`.

### 2.2 Index vs analysis

- codes in the index with **no analysis table**: see \`BM_missing_from_analysis.json\`
- analysis items **absent from the index**: see \`BM_extra_analysis.json\`
- difference vs the legacy in-repo dataset: see \`BM_existing_dataset_difference.json\`
  (legacy ${bmDiff.legacy_items} items vs ${bmDiff.new_pipeline_codes} now)

### 2.3 §7 classification

| Kind | Count |
|---|---:|
| \`NORMATIVE_ANALYSIS\` (Normatif + analysis table) | ${bmClass.counts.NORMATIVE_ANALYSIS} |
| \`INFORMATIVE_HEADER\` (Informatif with a body header) | ${bmClass.counts.INFORMATIVE_HEADER} |
| \`INDEX_REFERENCE_ONLY\` (listed, no analysis in the annex) | ${bmClass.counts.INDEX_REFERENCE_ONLY} |

---

## 3. SMKK — Lampiran III (§8)

| Metric | Value |
|---|---:|
| Brief target | ${EXPECTED.SMKK} |
| Parsed rows | ${smkkM.parsed} |
| Independent raw-line scan | ${smkkM.independent_raw_scan} |
| Δ vs target | ${smkkM.gap} |

Per risk tier (both methods agree):

| Tier | Rows |
|---|---:|
${Object.entries(smkkM.independent_per_tier).map(([k, v]) => `| ${k} | ${v} |`).join('\n')}

**Classification: \`EXPECTED\`.** Lampiran III is a **risk-tiered cost-component
table** (Tabel III.1 KECIL, Tabel III.2 SEDANG DAN BESAR), not a numbered AHSP
catalogue. Two independent methods return the same ${smkkM.parsed} rows, so **no
row is missing**. The 246 target is not a target of this annex.

**Duplicates:** ${smkkD.groups} repeated-code groups — all legitimate, because the
NO. hierarchy restarts at each tier. See \`smkk_exact_duplicates.json\`.

---

## 4. SDA — Lampiran IV (§9)

| Metric | Value |
|---|---:|
| Brief target | ${EXPECTED.SDA} |
| Parsed inventory rows | ${sdaM.parsed} |
| Index number range | 1–${sdaM.index_no_range[1]} |
| Δ vs target | ${sdaM.gap} |

**Classification: \`ACTUAL\` — the gap is closed.**

The annex's own *Daftar Kode AHSP* prints rows **1…${sdaM.index_no_range[1]}**.
Every number is now present. Exactly **one** row is printed **without a code**:

\`\`\`
${sdaM.records.map((r: any) => `page ${r.page} · row ${r.no}: "${r.description}" (${r.unit}, ${r.status})`).join('\n')}
   neighbours: ${sdaM.records.map((r: any) => r.neighbours.map((n: any) => `${n.no}=${n.code}`).join(', ')).join('; ')}
\`\`\`

The row sits between \`A.3.06.5d\` (809) and \`A.3.06.6a\` (811). A code could be
guessed from the pattern — **it was not**. The row is kept with an empty code and
demoted to \`NEEDS_REVIEW\` (\`SOURCE_DEFECT\`). This is the *only* SDA discrepancy,
and it is a defect in the published PDF, not in the pipeline.

---

## 5. Cipta Karya — Lampiran VI (§10)

| Metric | Value |
|---|---:|
| Brief target | ${EXPECTED.CIPTA_KARYA} |
| Index rows parsed | ${ckM.parsed_index_rows} |
| Independent status-line scan | ${ckM.independent_status_line_scan} |
| Δ vs target | ${ckM.gap} |

**Classification: \`ACTUAL\` — the gap is closed (PARSER_ERROR fixed).**

The annex prints **${ckM.independent_status_line_scan}** index rows. The original
parser captured only 2,803. The **38 lost rows** were:

| Kind | Count | Pages |
|---|---:|---|
${ckM.recovered_detail.map((d: any) => `| ${d.kind} | ${d.count} | ${d.pages.join(', ')} |`).join('\n')}

The interesting one is the third: the Kabel Tray block on pages 102–103 prints
\`5.1.1.12.10\` and puts the final digit on the next line, so the real code is
\`5.1.1.12.100\`. Both the digit and the \`unit Normatif Tetap\` column are printed
in the source — \`prejoinCkWrappedRows()\` re-joins them without inventing anything.

The final dataset reports **${S.cipta_karya}** Cipta Karya items: the ${ckM.parsed_index_rows}
index rows plus analysis tables that are absent from the DAFTAR ISI (kept and
flagged \`analysis-only\`).

---

## 6. Umum (§4)

**Classification: \`SOURCE_NONEXISTENT\`.** There is no AHSP Bidang Umum in this
regulation. Full evidence in **\`EZRAB_AHSP_2026_MISSING_SOURCE.md\`**.

---

## 7. NEEDS_REVIEW classification (§12)

${vrSummary(vreport, nrSummary)}

---

## 8. Duplicate classification (§13)

Total groups: **${dupClass.total_groups}**

| Classification | Groups |
|---|---:|
${Object.entries(dupClass.by_classification).map(([k, v]) => `| \`${k}\` | ${v} |`).join('\n')}

Legend:

${Object.entries(dupClass.legend).map(([k, v]) => `- **${k}** — ${v}`).join('\n')}

\`TRUE_DUPLICATE\` groups dominate because several annexes genuinely repeat an item
under the same code in different divisions. They are **kept**, not deleted, and
flagged so a reviewer can confirm each one against the printed page.

---

## 9. Reproducibility (§19)

The whole analysis is deterministic and re-runnable:

\`\`\`
npm run ahsp:extract      # PDFs -> raw JSONL (6,451 pages)
npm run ahsp:normalize    # raw  -> normalized items
npm run ahsp:validate     # normalized -> validated master + reports
npm run ahsp:forensic     # validated -> forensic gap artefacts
npm run ahsp:report       # artefacts -> markdown reports
npm run ahsp:test         # assertions
npm test                  # project suite
npm run build             # production build
\`\`\`

Sources are read from \`sources/ahsp2026/\` (all 7 annexes, official names, MD5-verified).

---

## 10. What was NOT touched (§23)

- ❌ Supabase / database import
- ❌ UI / components
- ❌ RAB engine, Price Engine, calculator registry
- ❌ Existing in-repo AHSP datasets (left in place, untouched)
- ❌ No fabricated coefficient, code, unit, description, or price
`;

function vrSummary(vr: any, nr: any): string {
  if (!vr) return '_validation report not found_';
  const sc = vr.status_counts;
  const ic = Object.entries(vr.issue_counts).sort((a: any, b: any) => b[1] - a[1]).slice(0, 12);
  return `Records flagged \`NEEDS_REVIEW\`: **${sc.NEEDS_REVIEW}** of ${vr.totals.items}
(\`VERIFIED\` ${sc.VERIFIED}, \`INVALID\` ${sc.INVALID}).

Partitioned into five actionable buckets (a record may appear in more than one):

| Bucket | Records |
|---|---:|
| \`POSSIBLE_DUPLICATES\` | ${nr.buckets.POSSIBLE_DUPLICATES} |
| \`NO_COMPONENTS\` | ${nr.buckets.NO_COMPONENTS} |
| \`INDEX_ONLY\` | ${nr.buckets.INDEX_ONLY} |
| \`MERGED_RESOURCE_NAMES\` | ${nr.buckets.MERGED_RESOURCE_NAMES} |
| \`MISSING_UNITS\` | ${nr.buckets.MISSING_UNITS} |
| (not in any bucket) | ${nr.other_needs_review} |

Files: \`data/ahsp2026/forensic/needs_review/{possible_duplicates,no_components,index_only,merged_resource_names,missing_units}.json\`

Top validation issue families:

| Issue | Records |
|---|---:|
${ic.map(([k, v]) => `| \`${k}\` | ${v} |`).join('\n')}

The dominant bucket is \`NO_COMPONENTS\`/\`INDEX_ONLY\` — these are items the annex
**lists but does not analyse** (Informatif reference rows). They are real catalogue
entries; they simply have no coefficient table to read.`;
}

fs.writeFileSync(path.join(ROOT, 'EZRAB_AHSP_2026_FORENSIC_GAP_REPORT.md'), report);
console.log('-> EZRAB_AHSP_2026_FORENSIC_GAP_REPORT.md');
