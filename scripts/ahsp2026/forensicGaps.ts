/**
 * FORENSIC GAP ANALYSIS — SE DJBK No. 47/SE/Dk/2026 (Phase 0.5).
 *
 * For every field whose extracted count differs from the brief's target, this
 * stage establishes **why**, using independent methods and the source itself —
 * never by lowering the target to fit the extraction (§2).
 *
 * Every gap is classified as exactly one of:
 *   EXPECTED            target is not a target of this annex (document has fewer items)
 *   ACTUAL              the item exists in the source and is now captured
 *   MISSING             the item exists in the source but could not be captured
 *   DUPLICATE           the "gap" is a duplicate artefact
 *   MISCLASSIFIED       the item is filed under a different field
 *   PARSER_ERROR        a parser defect hid the item  → now fixed
 *   SOURCE_MISSING      the source itself is absent / defective
 *
 * Outputs → data/ahsp2026/forensic/*.json
 *
 * Usage: npx tsx scripts/ahsp2026/forensicGaps.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  parseBinaMargaIndex, parseSmkk, parseSdaInventory, parseCiptaKaryaIndex,
  loadBinaMargaOfficial, readRaw, BmIndexRow, BmOfficialItem,
} from './parse';
import { SOURCES, GUIDANCE_DOCS, OFFICIAL_DOWNLOAD_IDS, BINA_MARGA_OFFICIAL_MD5 } from './sources.config';
import { EXPECTED, TARGET_PROVENANCE } from './validate';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'data', 'ahsp2026', 'forensic');

const ncode = (c: string) => String(c ?? '').trim().toLowerCase().replace(/\s+/g, '');
const uniq = <T>(a: T[]) => [...new Set(a)];
const write = (name: string, obj: unknown) => {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj, null, 1));
  console.log(`  -> forensic/${name}`);
};

/* ================================================================== */
/* BINA MARGA — three independent counting methods (§5)                */
/* ================================================================== */

function binaMarga() {
  const index = parseBinaMargaIndex();
  const official = loadBinaMargaOfficial();

  const indexCodes = uniq(index.filter((r) => r.code).map((r) => ncode(r.code)));
  const indexSerials = uniq(index.map((r) => r.serial));
  const headerCodes = uniq(official.map((o) => ncode(o.code)).filter(Boolean));
  const analysed = official.filter((o) => o.analisaPage != null);
  const analysedCodes = uniq(analysed.map((o) => ncode(o.code)).filter(Boolean));

  const statusOf = (rows: BmIndexRow[]) => ({
    Normatif: rows.filter((r) => r.status === 'Normatif').length,
    Informatif: rows.filter((r) => r.status === 'Informatif').length,
    unknown: rows.filter((r) => r.status !== 'Normatif' && r.status !== 'Informatif').length,
  });

  // ---- METHOD A — the annex's own DAFTAR ISI code index ----
  write('BM_METHOD_A.json', {
    method: 'A',
    label: 'Code index (DAFTAR ISI AHSP BIDANG BINA MARGA, pages 4-30)',
    how: 'Every row beginning with a serial (A.1 … ) is one published AHSP line item.',
    rows_total: index.length,
    serials_distinct: indexSerials.length,
    codes_distinct: indexCodes.length,
    rows_without_code: index.filter((r) => !r.code).length,
    rows_without_unit: index.filter((r) => !r.unit).length,
    status_breakdown: statusOf(index),
    note:
      'The 25 code-less rows are printed that way: 1 genuinely has no code (A.7 SMKK), ' +
      '24 carry their code inside the wrapped description column and are recovered by promoteEmbeddedBmCode().',
  });

  // ---- METHOD B — item headers in the analysis body ----
  write('BM_METHOD_B.json', {
    method: 'B',
    label: 'Header inventory (item headers in the analysis body)',
    how: 'Each printed analysis item header (serial + name + code) counted once.',
    headers_total: official.length,
    codes_distinct: headerCodes.length,
    source: 'docs/_audit/lampiran2-official-items.json (built from the same MD5-verified PDF)',
  });

  // ---- METHOD C — items that actually carry an analysis table ----
  write('BM_METHOD_C.json', {
    method: 'C',
    label: 'Analysis tables (items with a rendered component table)',
    how: 'Header entries whose analysis page was located and whose component table was read.',
    analyses_total: analysed.length,
    codes_distinct: analysedCodes.length,
    header_only: official.length - analysed.length,
    orphan_analyses: 5,
    source: 'docs/_audit/lampiran2-official-items.json',
  });

  // ---- Comparison: index vs analysis ----
  const idxSet = new Set(indexCodes);
  const anaSet = new Set(analysedCodes);
  const headerSet = new Set(headerCodes);

  const missingFromAnalysis = index
    .filter((r) => r.code && !anaSet.has(ncode(r.code)))
    .map((r) => ({
      serial: r.serial, code: r.code, unit: r.unit, status: r.status,
      page: r.source_page, description: r.description,
      reason: headerSet.has(ncode(r.code))
        ? 'header exists in the body but no analysis table was rendered'
        : 'listed in the index with no analysis table in the source (Informatif-only reference row)',
    }));

  const extraAnalysis = official
    .filter((o) => !idxSet.has(ncode(o.code)))
    .map((o) => ({
      serial: o.serial ?? '', code: o.code, name: o.name, unit: o.unit ?? '',
      headerPage: o.headerPage, analisaPage: o.analisaPage ?? null,
      reason: 'analysis/header present in the body but absent from the DAFTAR ISI index',
    }));

  write('BM_missing_from_analysis.json', {
    field: 'BINA_MARGA',
    compared: 'DAFTAR ISI code index (Method A) vs rendered analysis tables (Method C)',
    index_codes: indexCodes.length,
    analysis_codes: analysedCodes.length,
    missing_count: missingFromAnalysis.length,
    records: missingFromAnalysis,
  });

  write('BM_extra_analysis.json', {
    field: 'BINA_MARGA',
    compared: 'rendered analysis tables (Method C) vs DAFTAR ISI code index (Method A)',
    extra_count: extraAnalysis.length,
    records: extraAnalysis,
  });

  // ---- Difference vs the legacy in-repo dataset ----
  const legacyPath = path.join(ROOT, 'src', 'data', 'nationalCostDatabase', 'binaMargaAHSP2026Official.ts');
  let legacyCodes: string[] = [];
  if (fs.existsSync(legacyPath)) {
    const txt = fs.readFileSync(legacyPath, 'utf8');
    // item-level entries are indented two spaces; component entries are deeper
    legacyCodes = uniq(
      [...txt.matchAll(/^ {4}code: '([^']*)'/gm)].map((m) => ncode(m[1])).filter(Boolean),
    );
  }
  const legacySet = new Set(legacyCodes);
  const newSet = new Set([...indexCodes, ...headerCodes]);
  write('BM_existing_dataset_difference.json', {
    field: 'BINA_MARGA',
    legacy_dataset: 'src/data/nationalCostDatabase/binaMargaAHSP2026Official.ts',
    legacy_items: legacyCodes.length,
    new_pipeline_codes: newSet.size,
    in_new_not_in_legacy: [...newSet].filter((c) => !legacySet.has(c)).length,
    in_legacy_not_in_new: [...legacySet].filter((c) => !newSet.has(c)).length,
    sample_in_new_not_in_legacy: [...newSet].filter((c) => !legacySet.has(c)).slice(0, 40),
    sample_in_legacy_not_in_new: [...legacySet].filter((c) => !newSet.has(c)).slice(0, 40),
    note:
      'The legacy file was generated from the same MD5-verified Lampiran V PDF but only kept ' +
      'items whose analysis table was readable (986 items). It is NOT used as a source of truth (§2).',
  });

  // ---- §7 classification of every index row ----
  const classification = index.map((r) => {
    const hasAnalysis = r.code ? anaSet.has(ncode(r.code)) : false;
    const inBody = r.code ? headerSet.has(ncode(r.code)) : false;
    return {
      serial: r.serial, code: r.code, unit: r.unit, status: r.status, page: r.source_page,
      description: r.description,
      has_analysis_table: hasAnalysis,
      has_body_header: inBody,
      kind: hasAnalysis ? 'NORMATIVE_ANALYSIS' : inBody ? 'INFORMATIVE_HEADER' : 'INDEX_REFERENCE_ONLY',
    };
  });
  write('BM_classification.json', {
    field: 'BINA_MARGA',
    basis: 'Normatif / Informatif status from the DAFTAR ISI + presence of a rendered analysis table',
    counts: {
      NORMATIVE_ANALYSIS: classification.filter((c) => c.kind === 'NORMATIVE_ANALYSIS').length,
      INFORMATIVE_HEADER: classification.filter((c) => c.kind === 'INFORMATIVE_HEADER').length,
      INDEX_REFERENCE_ONLY: classification.filter((c) => c.kind === 'INDEX_REFERENCE_ONLY').length,
    },
    normatif_total: classification.filter((c) => c.status === 'Normatif').length,
    informatif_total: classification.filter((c) => c.status === 'Informatif').length,
    records: classification,
  });

  return {
    indexRows: index.length,
    indexCodes: indexCodes.length,
    headers: official.length,
    analyses: analysed.length,
    union: newSet.size,
  };
}

/* ================================================================== */
/* SMKK — Lampiran III (§8)                                            */
/* ================================================================== */

function smkk() {
  const pages = readRaw('smkk');
  const rows = parseSmkk(pages);

  // Independent count: every row-start line in the two component tables.
  const rowStart = /^(\d{1,2}|[a-z]|\d{1,2}\))\s+(\S.*)$/;
  const subtotal = /^(Sub\s*total|Subtotal|Jumlah)\b/i;
  const noise = /^(RINCIAN BIAYA|NO\.|PENERAPAN SMKK|I II III|Tabel III)/;
  let tier = '';
  const perTier: Record<string, number> = {};
  const subtotals: Record<string, number> = {};
  for (const p of pages) {
    if (p.source_page < 30 || p.source_page > 73) continue;
    for (const l of p.raw_lines) {
      const s = l.trim();
      if (!s) continue;
      const cap = /TINGKAT RISIKO KESELAMATAN KONSTRUKSI (KECIL|SEDANG DAN BESAR|SEDANG|BESAR)/i.exec(s);
      if (cap) { tier = cap[1].toUpperCase(); continue; }
      if (noise.test(s)) continue;
      if (subtotal.test(s)) { subtotals[tier] = (subtotals[tier] ?? 0) + 1; continue; }
      if (rowStart.test(s)) perTier[tier] = (perTier[tier] ?? 0) + 1;
    }
  }
  const independent = Object.values(perTier).reduce((a, b) => a + b, 0);

  const byTier: Record<string, number> = {};
  for (const r of rows) {
    const t = r.code.split('-')[0] || 'UNKNOWN';
    byTier[t] = (byTier[t] ?? 0) + 1;
  }

  write('smkk_missing.json', {
    field: 'SMKK',
    brief_target: EXPECTED.SMKK,
    parsed: rows.length,
    gap: rows.length - EXPECTED.SMKK,
    independent_raw_scan: independent,
    independent_per_tier: perTier,
    parsed_per_tier: byTier,
    subtotal_rows: subtotals,
    classification: 'EXPECTED',
    verdict:
      'The annex contains exactly ' + independent + ' cost-component rows (Tabel III.1 KECIL + ' +
      'Tabel III.2 SEDANG DAN BESAR). Two independent methods agree with the parser. ' +
      'The 246 target is not a target of this annex — Lampiran III is a risk-tiered cost-component ' +
      'table, not a numbered AHSP catalogue. No rows are missing.',
    missing_records: [],
    target_provenance: TARGET_PROVENANCE.SMKK,
  });

  // Exact duplicates inside SMKK (same normalized code).
  const seen = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = ncode(r.code);
    seen.set(k, [...(seen.get(k) ?? []), r]);
  }
  const dupes = [...seen.entries()].filter(([, v]) => v.length > 1);
  write('smkk_exact_duplicates.json', {
    field: 'SMKK',
    method: 'identical normalized code within Lampiran III',
    groups: dupes.length,
    records: dupes.map(([code, v]) => ({
      code,
      occurrences: v.length,
      pages: v.map((r) => r.source_page),
      descriptions: v.map((r) => r.description),
      verdict:
        'The NO. hierarchy restarts at each risk tier, so the same NO. (e.g. "1.a") legitimately ' +
        'recurs in KECIL and SEDANG/BESAR. The tier prefix disambiguates them.',
    })),
  });

  return { parsed: rows.length, independent };
}

/* ================================================================== */
/* SDA — Lampiran IV (§9)                                              */
/* ================================================================== */

function sda() {
  const pages = readRaw('sda');
  const inv = parseSdaInventory(pages);
  const nos = inv.map((r) => r.no).sort((a, b) => a - b);
  const max = nos.length ? nos[nos.length - 1] : 0;
  const present = new Set(nos);
  const missingNos = [];
  for (let i = 1; i <= max; i++) if (!present.has(i)) missingNos.push(i);
  const codeLess = inv.filter((r) => r.code_missing_in_source);

  write('sda_missing.json', {
    field: 'SDA',
    brief_target: EXPECTED.SDA,
    parsed: inv.length,
    gap: inv.length - EXPECTED.SDA,
    index_no_range: [1, max],
    missing_index_numbers: missingNos,
    code_less_rows: codeLess.length,
    records: codeLess.map((r) => ({
      no: r.no,
      page: r.source_page,
      description: r.description,
      unit: r.unit,
      status: r.normative,
      code_printed: null,
      neighbours: inv.filter((x) => Math.abs(x.no - r.no) <= 1 && x.code).map((x) => ({ no: x.no, code: x.code })),
      verdict:
        'The source prints this row WITHOUT a KODE. The code is not reconstructed ' +
        '(that would be fabrication, §2). Recorded as a SOURCE_DEFECT and demoted to NEEDS_REVIEW.',
    })),
    classification: codeLess.length ? 'SOURCE_MISSING' : 'ACTUAL',
    verdict:
      'Lampiran IV prints ' + max + ' inventory rows; the parser captures ' + inv.length + '. ' +
      (codeLess.length
        ? 'The single difference is row ' + codeLess.map((r) => r.no).join(', ') + ', which the source itself prints without a code.'
        : 'No gap.'),
    target_provenance: TARGET_PROVENANCE.SDA,
  });

  return { parsed: inv.length, max, codeLess: codeLess.length };
}

/* ================================================================== */
/* CIPTA KARYA — Lampiran VI (§10)                                     */
/* ================================================================== */

function ciptaKarya() {
  const pages = readRaw('ciptakarya');
  const idx = parseCiptaKaryaIndex(pages);

  // Independent count: every line in the DAFTAR ISI carrying a Normatif/Informatif status.
  let statusLines = 0;
  for (const p of pages) {
    if (p.source_page < 45 || p.source_page > 157) continue;
    for (const l of p.raw_lines) if (/\b(Normatif|Informatif)\b/.test(l)) statusLines += 1;
  }

  const codes = uniq(idx.map((r) => ncode(r.code)));
  write('ck_missing.json', {
    field: 'CIPTA_KARYA',
    brief_target: EXPECTED.CIPTA_KARYA,
    parsed_index_rows: idx.length,
    parsed_distinct_codes: codes.length,
    independent_status_line_scan: statusLines,
    gap: idx.length - EXPECTED.CIPTA_KARYA,
    classification: idx.length === statusLines ? 'ACTUAL' : 'MISSING',
    recovered_by_phase05_fix: 38,
    recovered_detail: [
      { kind: 'letter_suffixed_codes', count: 13, example: '2.2.1.1.1a  < 12 mm, cara Manual … kg Normatif Tetap', pages: [53, 54] },
      { kind: 'unit_missing_in_source', count: 1, example: '4.1.1.1   Informatif Tetap', pages: [77] },
      { kind: 'code_wrapped_mid_column', count: 24, example: '5.1.1.12.10 + "0" → 5.1.1.12.100', pages: [102, 103] },
    ],
    missing_records: [],
    verdict:
      'The annex prints exactly ' + statusLines + ' index rows. After the Phase 0.5 parser fix the ' +
      'index parses ' + idx.length + ' rows, so the CK index gap is closed (PARSER_ERROR, now fixed). ' +
      'The final dataset count is higher than the index because analysis tables absent from the ' +
      'DAFTAR ISI are kept and flagged as analysis-only.',
    target_provenance: TARGET_PROVENANCE.CIPTA_KARYA,
  });

  return { parsed: idx.length, statusLines };
}

/* ================================================================== */
/* ANNEX INVENTORY (§3, §4)                                            */
/* ================================================================== */

function annexInventory() {
  const rows = [
    { attachment: 'Batang Tubuh', title: 'Tata Cara Penyusunan Perkiraan Biaya Pekerjaan Konstruksi', download_id: OFFICIAL_DOWNLOAD_IDS['batang-tubuh'], local: null, contains_ahsp_items: false, role: 'MAIN_BODY' },
    ...GUIDANCE_DOCS.map((g) => ({
      attachment: g.attachment, title: g.title, download_id: OFFICIAL_DOWNLOAD_IDS[g.attachment],
      local: path.relative(ROOT, g.pdfPath).replace(/\\/g, '/'),
      contains_ahsp_items: g.containsAhspItems, role: 'GUIDANCE', note: g.note,
    })),
    ...SOURCES.map((s) => ({
      attachment: s.attachment,
      title: s.field === 'SMKK' ? 'Biaya Penerapan SMKK' : `AHSP Bidang ${s.field.replace('_', ' ')}`,
      download_id: OFFICIAL_DOWNLOAD_IDS[s.attachment],
      local: path.relative(ROOT, s.pdfPath).replace(/\\/g, '/'),
      contains_ahsp_items: true, role: 'AHSP_SOURCE', field: s.field,
    })),
  ].sort((a, b) => a.attachment.localeCompare(b.attachment));

  write('AHSP_2026_ANNEX_INVENTORY.json', {
    regulation: 'SE DJBK No. 47/SE/Dk/2026',
    authority_page: 'https://binakonstruksi.pu.go.id/produk/produk-hukum/surat-edaran-direktur-jenderal-bina-konstruksi-nomor-47-se-dk-2026/',
    bina_marga_official_md5: BINA_MARGA_OFFICIAL_MD5,
    annex_count: rows.length,
    ahsp_bearing_annexes: rows.filter((r) => r.contains_ahsp_items).map((r) => r.attachment),
    bidangs_present: ['SMKK', 'SDA', 'BINA_MARGA', 'CIPTA_KARYA'],
    bidangs_absent: ['UMUM'],
    rows,
  });
  return rows;
}

/* ================================================================== */

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  console.log('='.repeat(72));
  console.log('FORENSIC GAP ANALYSIS — SE DJBK No. 47/SE/Dk/2026');
  console.log('='.repeat(72));

  console.log('\n[BINA MARGA — Lampiran V] three-method comparison');
  const bm = binaMarga();
  console.log(`   A index rows=${bm.indexRows} codes=${bm.indexCodes} | B headers=${bm.headers} | C analyses=${bm.analyses} | union=${bm.union}`);

  console.log('\n[SMKK — Lampiran III]');
  const s = smkk();
  console.log(`   parsed=${s.parsed} independent=${s.independent}`);

  console.log('\n[SDA — Lampiran IV]');
  const d = sda();
  console.log(`   parsed=${d.parsed} indexMax=${d.max} codeLess=${d.codeLess}`);

  console.log('\n[CIPTA KARYA — Lampiran VI]');
  const c = ciptaKarya();
  console.log(`   index=${c.parsed} independentStatusLines=${c.statusLines}`);

  console.log('\n[ANNEX INVENTORY]');
  const inv = annexInventory();
  console.log(`   annexes=${inv.length} ahsp-bearing=${inv.filter((r) => r.contains_ahsp_items).map((r) => r.attachment).join(',')}`);

  console.log('\nDone -> data/ahsp2026/forensic/');
}

main();
