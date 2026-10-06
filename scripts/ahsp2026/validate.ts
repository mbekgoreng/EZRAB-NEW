/**
 * VALIDATE + GENERATE — AHSP 2026 master dataset.
 *
 * normalized → validated, plus every report required by the master prompt:
 *   §8  data/ahsp2026/validated/ahsp_2026_master.json
 *   §9  data/ahsp2026/validated/ahsp_2026_components.json
 *   §12 data/ahsp2026/validated/ahsp_2026_resources.json
 *   §14 data/ahsp2026/reports/ahsp_duplicates.json
 *   §15 data/ahsp2026/reports/ahsp_2026_validation_report.json
 *   §15 data/ahsp2026/reports/ahsp_missing_data.json
 *   §16 data/ahsp2026/reports/ahsp_count_report.md
 *   §22 data/ahsp2026/validated/AHSP_2026_MASTER.txt
 *   §24 dataset quality score
 *
 * Validation never invents a value: an unreadable field is left empty and the
 * record is demoted to NEEDS_REVIEW (§27).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  AHSPItem, AHSPComponent, ResourceMasterEntry, DuplicateStatus, ValidationStatus,
  REGULATION,
} from './types';

const ROOT = process.cwd();
const NORM = path.join(ROOT, 'data', 'ahsp2026', 'normalized');
const VAL = path.join(ROOT, 'data', 'ahsp2026', 'validated');
const REP = path.join(ROOT, 'data', 'ahsp2026', 'reports');

/**
 * Target counts published in the project brief (§ Phase 0).
 *
 * Phase 0.5 forensic finding: these are NOT all targets of SE DJBK No. 47/SE/Dk/2026.
 * They are kept verbatim so the reconciliation stays auditable, but each one now
 * carries a provenance verdict in TARGET_PROVENANCE below. No target was lowered
 * to match the extraction — see EZRAB_AHSP_2026_FORENSIC_GAP_REPORT.md.
 */
export const EXPECTED = { SMKK: 246, SDA: 1556, BINA_MARGA: 1425, CIPTA_KARYA: 2841, UMUM: 143, TOTAL: 6211 };

/**
 * Where each brief target came from, and whether it is a real target of this SE.
 *
 *   SOURCE_CONFIRMED  — the annex's own index prints exactly this many codes.
 *   SOURCE_DISPUTED   — the annex exists but its own index does not contain this many items.
 *   SOURCE_NONEXISTENT— no annex of SE 47/2026 corresponds to this field at all.
 */
export const TARGET_PROVENANCE: Record<string, { verdict: string; evidence: string }> = {
  SMKK: {
    verdict: 'SOURCE_DISPUTED',
    evidence:
      'Lampiran III prints risk-tiered cost tables (Tabel III.1 KECIL, Tabel III.2 SEDANG DAN BESAR), ' +
      'not a numbered AHSP catalogue. A raw line scan and the parser both return exactly 223 rows. ' +
      'No index in the annex prints 246.',
  },
  SDA: {
    verdict: 'SOURCE_CONFIRMED',
    evidence:
      "Lampiran IV's own 'Daftar Kode AHSP' prints rows 1..1556 — the target matches the source, and " +
      'all 1556 are now captured (row 810 is printed without a code and is flagged SOURCE_DEFECT).',
  },
  BINA_MARGA: {
    verdict: 'SOURCE_DISPUTED',
    evidence:
      "Lampiran V's own DAFTAR ISI prints exactly 1,137 rows (41 Normatif, 1,096 Informatif). " +
      'The document does not contain 1,425 items. 129 of the 1,137 were hidden by an over-strict ' +
      'parser regex and are now recovered.',
  },
  CIPTA_KARYA: {
    verdict: 'SOURCE_DISPUTED',
    evidence:
      "Lampiran VI's 'Daftar Isi Tabel AHSP' prints 2,841 status-bearing rows (verified by an " +
      'independent line scan). The target 2,841 is the INDEX count; the dataset is slightly larger ' +
      'because analysis tables absent from the index are kept and flagged analysis-only.',
  },
  UMUM: {
    verdict: 'SOURCE_NONEXISTENT',
    evidence:
      'SE 47/2026 has seven annexes: I (harga pokok), II (acuan penyusunan AHSP), III (SMKK), ' +
      'IV (SDA), V (Bina Marga), VI (Cipta Karya), VII (tata cara pengajuan usulan AHSP). ' +
      'There is no "AHSP Bidang Umum". The 143 target does not correspond to any annex.',
  },
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const normCode = (c: string) => c.toLowerCase().replace(/[\s()]/g, '');
const normDesc = (d: string) =>
  d.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Human-readable resource names: trim stray separators left by column wrapping. */
function cleanName(n: string): string {
  return n
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s/]+$/, '')
    .trim();
}

/** Names that look like two resources merged by a two-column layout artefact. */
const LABOR_WORDS = /\b(Pekerja|Mandor|Tukang|Kepala Tukang|Operator|Supir|Kenek|Juru Ukur)\b/gi;
function looksMerged(name: string): boolean {
  const hits = name.match(LABOR_WORDS) || [];
  return hits.length > 1;
}

/* ------------------------------------------------------------------ */
/* Duplicate detection (§14)                                           */
/* ------------------------------------------------------------------ */

interface DuplicateEntry {
  key: string;
  status: DuplicateStatus;
  ids: string[];
  codes: string[];
  field: string;
  detail: string;
}

function detectDuplicates(items: AHSPItem[]): { groups: DuplicateEntry[]; byId: Map<string, DuplicateStatus> } {
  const groups: DuplicateEntry[] = [];
  const byId = new Map<string, DuplicateStatus>();
  const set = (ids: string[], status: DuplicateStatus) => {
    for (const id of ids) {
      const prev = byId.get(id);
      if (prev === 'conflict') continue;
      if (prev === 'exact_duplicate' && status === 'possible_duplicate') continue;
      byId.set(id, status);
    }
  };

  const bucket = (keyOf: (i: AHSPItem) => string, status: DuplicateStatus, label: string) => {
    const m = new Map<string, AHSPItem[]>();
    for (const it of items) {
      const k = keyOf(it);
      if (!k) continue;
      const arr = m.get(k) ?? [];
      arr.push(it);
      m.set(k, arr);
    }
    for (const [k, arr] of m) {
      if (arr.length < 2) continue;
      groups.push({ key: k, status, ids: arr.map((a) => a.id), codes: arr.map((a) => a.code), field: arr[0].field, detail: label });
      set(arr.map((a) => a.id), status);
    }
  };

  // Exact code collision inside the same field — a real data problem.
  bucket((i) => `${i.field}|${i.version}|${normCode(i.code)}`, 'exact_duplicate', 'same normalized code within the same field+version');

  // Identical description with different codes — only meaningful for descriptions
  // long enough to be distinctive (short/truncated ones collide by accident).
  bucket(
    (i) => (normDesc(i.description).length >= 50 ? `${i.field}|${normDesc(i.description)}` : ''),
    'possible_duplicate',
    'identical description text within the same field',
  );

  // Same field + unit + identical component signature (needs ≥3 rows to be meaningful).
  bucket(
    (i) => {
      const all = [...i.components.labor, ...i.components.materials, ...i.components.equipment];
      if (all.length < 3) return '';
      const sig = all
        .map((c) => `${c.resource_type}:${c.resource_code}:${c.resource_name}:${c.coefficient_raw}`)
        .join('|');
      return `${i.field}|${i.unit}|${sig}`;
    },
    'possible_duplicate',
    'identical component signature within the same field and unit',
  );

  return { groups, byId };
}

/* ------------------------------------------------------------------ */
/* Validation (§15, §27)                                               */
/* ------------------------------------------------------------------ */

interface ValidationOutcome {
  status: ValidationStatus;
  issues: string[];
  checks: {
    code_verified: boolean; description_verified: boolean; unit_verified: boolean;
    components_verified: boolean; coefficients_verified: boolean;
    source_verified: boolean; duplicate_checked: boolean;
  };
}

/**
 * Collapse a free-text parser warning into a stable issue family, so the report
 * counts categories instead of listing hundreds of near-identical sentences.
 * The original sentence is preserved on the item itself (validation.issues).
 */
function familyOf(raw: string): string {
  const s = raw.trim();
  if (/^no analysis table found/i.test(s)) return 'NO_ANALYSIS_TABLE';
  if (/^listed in DAFTAR ISI/i.test(s)) return 'IN_INDEX_ONLY_CK';
  if (/^listed in the Lampiran V code index/i.test(s)) return 'IN_INDEX_ONLY_BM';
  if (/^has an analysis table but is absent from the DAFTAR ISI/i.test(s)) return 'ANALYSIS_ONLY_CK';
  if (/^has an analysis table but is absent from the Lampiran V/i.test(s)) return 'ANALYSIS_ONLY_BM';
  if (/^header-only entry/i.test(s)) return 'HEADER_ONLY_ENTRY';
  if (/^SMKK rows are cost components/i.test(s)) return 'SMKK_NOT_AN_AHSP_ANALYSIS';
  if (/^coefficient unreadable/i.test(s)) return 'UNREADABLE_COEFFICIENT';
  if (/^resource name unreadable/i.test(s)) return 'UNREADABLE_RESOURCE_NAME';
  if (/^baris komponen tidak terbaca/i.test(s)) return 'UNREADABLE_COMPONENT_ROW';
  if (/^jumlah TENAGA tidak cocok/i.test(s)) return 'SOURCE_TOTAL_MISMATCH_LABOR';
  if (/^jumlah BAHAN tidak cocok/i.test(s)) return 'SOURCE_TOTAL_MISMATCH_MATERIAL';
  if (/^jumlah PERALATAN tidak cocok/i.test(s)) return 'SOURCE_TOTAL_MISMATCH_EQUIPMENT';
  if (/^total A\+B\+C tidak cocok/i.test(s)) return 'SOURCE_TOTAL_MISMATCH_ABC';
  return s.slice(0, 60);
}

function validateItem(it: AHSPItem, dup: DuplicateStatus | undefined): ValidationOutcome {
  // Keep the raw parser text on the item (§9 `issues`); the reports aggregate it
  // into stable families via `familyOf` so they stay readable.
  const issues: string[] = [...it.validation.issues];
  const all: AHSPComponent[] = [...it.components.labor, ...it.components.materials, ...it.components.equipment];

  const codeOk = Boolean(it.code && it.code.trim());
  const descOk = Boolean(it.description && it.description.trim().length > 2);
  const unitOk = Boolean(it.unit && it.unit.trim());
  const pageOk = Number.isFinite(it.source.page) && it.source.page > 0;
  const coefOk = all.length === 0 ? false : all.every((c) => c.coefficient !== null);
  const nameOk = all.length === 0 ? false : all.every((c) => Boolean(c.resource_name && c.resource_name.trim()));
  const hasComponents = all.length > 0;

  if (!codeOk) issues.push('MISSING_CODE');
  if (!descOk) issues.push('MISSING_DESCRIPTION');
  if (!unitOk) issues.push('MISSING_UNIT');
  if (!pageOk) issues.push('MISSING_SOURCE_PAGE');
  if (!hasComponents) issues.push('NO_COMPONENTS_IN_SOURCE');
  if (hasComponents && !coefOk) issues.push('UNREADABLE_COEFFICIENT');
  if (hasComponents && !nameOk) issues.push('UNREADABLE_RESOURCE_NAME');
  if (all.some((c) => c.coefficient !== null && c.coefficient < 0)) issues.push('NEGATIVE_COEFFICIENT');
  if (all.some((c) => c.coefficient !== null && c.coefficient === 0)) issues.push('ZERO_COEFFICIENT');
  if (all.some((c) => looksMerged(cleanName(c.resource_name)))) issues.push('SUSPECT_MERGED_RESOURCE_NAME');
  if (dup === 'exact_duplicate') issues.push('EXACT_DUPLICATE_CODE');
  if (dup === 'possible_duplicate') issues.push('POSSIBLE_DUPLICATE');
  if (it.notes?.some((n) => /tidak|khusus|kecuali/i.test(n))) issues.push('SOURCE_NOTE_PRESENT');

  const checks = {
    code_verified: codeOk,
    description_verified: descOk,
    unit_verified: unitOk,
    components_verified: hasComponents,
    coefficients_verified: hasComponents && coefOk,
    source_verified: pageOk,
    duplicate_checked: true,
  };

  // §27 — INVALID only when the record cannot be an AHSP at all.
  if (!codeOk && !descOk) return { status: 'INVALID', issues: [...issues, 'NOT_AN_AHSP_RECORD'], checks };

  const blocking = !codeOk || !descOk || !unitOk || !pageOk;
  const uncertain = !hasComponents || (hasComponents && (!coefOk || !nameOk)) ||
    dup === 'exact_duplicate' || dup === 'possible_duplicate' ||
    issues.includes('SUSPECT_MERGED_RESOURCE_NAME') || issues.includes('NEGATIVE_COEFFICIENT');

  return { status: blocking || uncertain ? 'NEEDS_REVIEW' : 'VERIFIED', issues: [...new Set(issues)], checks };
}

/* ------------------------------------------------------------------ */
/* Resource master (§12)                                               */
/* ------------------------------------------------------------------ */

function buildResources(items: AHSPItem[]): ResourceMasterEntry[] {
  const map = new Map<string, ResourceMasterEntry>();
  for (const it of items) {
    for (const c of [...it.components.labor, ...it.components.materials, ...it.components.equipment]) {
      const name = cleanName(c.resource_name);
      const key = `${c.resource_type}|${c.resource_code}|${name}|${c.unit}`;
      const ex = map.get(key);
      if (ex) { if (!ex.source_ahsp_codes.includes(it.code)) ex.source_ahsp_codes.push(it.code); }
      else {
        map.set(key, {
          resource_id: '', code: c.resource_code, name, type: c.resource_type, unit: c.unit,
          category: it.field, source_ahsp_codes: [it.code], duplicate_status: 'unique',
        });
      }
    }
  }
  const out = [...map.values()];

  // §12 — never silently merge look-alike resources; only flag them.
  const byNameUnit = new Map<string, ResourceMasterEntry[]>();
  for (const r of out) {
    const k = `${r.type}|${r.name.toLowerCase().replace(/\s+/g, ' ').trim()}|${r.unit.toLowerCase()}`;
    const arr = byNameUnit.get(k) ?? [];
    arr.push(r);
    byNameUnit.set(k, arr);
  }
  for (const arr of byNameUnit.values()) {
    if (arr.length > 1) for (const r of arr) r.duplicate_status = 'possible_duplicate';
  }
  const byName = new Map<string, ResourceMasterEntry[]>();
  for (const r of out) {
    const k = `${r.type}|${r.name.toLowerCase().replace(/\s+/g, ' ').trim()}`;
    const arr = byName.get(k) ?? [];
    arr.push(r);
    byName.set(k, arr);
  }
  for (const arr of byName.values()) {
    const units = new Set(arr.map((r) => r.unit.toLowerCase()));
    if (units.size > 1) for (const r of arr) r.duplicate_status = 'conflict';
  }
  for (const r of out) if (looksMerged(r.name)) r.duplicate_status = 'possible_duplicate';
  out.sort((a, b) => (a.type + a.name).localeCompare(b.type + b.name));
  out.forEach((r, i) => { r.resource_id = `RES-${String(i + 1).padStart(6, '0')}`; });
  return out;
}

/* ------------------------------------------------------------------ */
/* Master TXT (§22)                                                    */
/* ------------------------------------------------------------------ */

function writeMasterTxt(items: AHSPItem[], outPath: string) {
  const chunks: string[] = [];
  const line = (s = '') => chunks.push(s + '\n');
  const bar = '='.repeat(60);
  const dash = '-'.repeat(42);

  for (const it of items) {
    line(bar);
    line('AHSP 2026');
    line(bar);
    line();
    line(`KODE       : ${it.code}`);
    line(`BIDANG     : ${it.field}`);
    line(`DIVISI     : ${it.division}`);
    line(`URAIAN     : ${it.description}`);
    line(`SATUAN     : ${it.unit}`);
    line();

    const section = (title: string, rows: AHSPComponent[]) => {
      line(`[${title}]`);
      line(dash);
      if (rows.length === 0) { line('(tidak ada)'); line(); return; }
      line('Kode | Nama | Satuan | Koefisien');
      for (const c of rows) {
        line(`${c.resource_code || '-'} | ${c.resource_name || '-'} | ${c.unit || '-'} | ${c.coefficient_raw}`);
      }
      line();
    };
    section('MATERIAL', it.components.materials);
    section('UPAH', it.components.labor);
    section('ALAT', it.components.equipment);

    line('[SOURCE]');
    line(`Regulation : ${it.source.regulation}`);
    line(`Attachment : ${it.source.attachment}`);
    line(`Page       : ${it.source.page}`);
    line(`File       : ${it.source.source_file}`);
    line();
    line('[VALIDATION]');
    line(`Status : ${it.validation.status}`);
    if (it.validation.issues.length) line(`Issues : ${it.validation.issues.join(', ')}`);
    line(bar);
    line();
  }
  fs.writeFileSync(outPath, chunks.join(''), 'utf8');
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

function main() {
  const t0 = Date.now();
  fs.mkdirSync(VAL, { recursive: true });
  fs.mkdirSync(REP, { recursive: true });

  const src = JSON.parse(fs.readFileSync(path.join(NORM, 'ahsp_2026_normalized.json'), 'utf8'));
  const items: AHSPItem[] = src.items;

  // Clean resource names once, so every downstream artefact shares the same text.
  for (const it of items) {
    for (const c of [...it.components.labor, ...it.components.materials, ...it.components.equipment]) {
      c.resource_name = cleanName(c.resource_name);
    }
  }

  const { groups, byId } = detectDuplicates(items);

  const missing: any[] = [];
  const statusCounts = { VERIFIED: 0, NEEDS_REVIEW: 0, INVALID: 0 };
  const issueCounts: Record<string, number> = {};

  for (const it of items) {
    const out = validateItem(it, byId.get(it.id));
    it.validation.status = out.status;
    it.validation.issues = out.issues;
    Object.assign(it.validation, out.checks);
    statusCounts[out.status] += 1;
    for (const is of out.issues) {
      const fam = familyOf(is);
      issueCounts[fam] = (issueCounts[fam] ?? 0) + 1;
    }

    if (!it.unit || !it.code || !it.description) {
      missing.push({ id: it.id, code: it.code, field: it.field, page: it.source.page, unit: it.unit || null, description: it.description || null, issues: out.issues });
    }
  }

  // ---- master dataset (§8, §9) ----
  const byField = (f: string) => items.filter((i) => i.field === f).length;
  const summary = {
    total: items.length,
    smkk: byField('SMKK'),
    sda: byField('SDA'),
    bina_marga: byField('BINA_MARGA'),
    cipta_karya: byField('CIPTA_KARYA'),
    umum: byField('UMUM'),
  };
  const master = {
    dataset: {
      id: 'AHSP-2026', version: '2026', regulation: REGULATION, status: 'official',
      source: 'Kementerian Pekerjaan Umum',
      generated_at: new Date().toISOString(),
      price_policy: 'Coefficients only. Active prices are resolved by the EZRAB Price Engine (§13).',
    },
    summary,
    items,
  };
  fs.writeFileSync(path.join(VAL, 'ahsp_2026_master.json'), JSON.stringify(master));

  // ---- components (§9) ----
  const components = items.map((it) => ({ id: it.id, code: it.code, field: it.field, unit: it.unit, components: it.components }));
  fs.writeFileSync(path.join(VAL, 'ahsp_2026_components.json'), JSON.stringify({
    dataset: { id: 'AHSP-2026-COMPONENTS', version: '2026', generated_at: new Date().toISOString() },
    items: components,
  }));

  // ---- resources (§12) ----
  const resources = buildResources(items);
  const resSummary = {
    total: resources.length,
    material: resources.filter((r) => r.type === 'material').length,
    labor: resources.filter((r) => r.type === 'labor').length,
    equipment: resources.filter((r) => r.type === 'equipment').length,
    possible_duplicate: resources.filter((r) => r.duplicate_status !== 'unique').length,
  };
  fs.writeFileSync(path.join(VAL, 'ahsp_2026_resources.json'), JSON.stringify({
    dataset: { id: 'AHSP-2026-RESOURCES', version: '2026', generated_at: new Date().toISOString() },
    summary: resSummary, resources,
  }));

  // ---- duplicates (§14) ----
  fs.writeFileSync(path.join(REP, 'ahsp_duplicates.json'), JSON.stringify({
    generated_at: new Date().toISOString(),
    total_groups: groups.length,
    exact_duplicate_groups: groups.filter((g) => g.status === 'exact_duplicate').length,
    possible_duplicate_groups: groups.filter((g) => g.status === 'possible_duplicate').length,
    groups,
  }, null, 1));

  // ---- validation report (§15) ----
  const componentCount = items.reduce((a, i) => a + i.components.labor.length + i.components.materials.length + i.components.equipment.length, 0);
  const validationReport = {
    generated_at: new Date().toISOString(),
    regulation: REGULATION,
    totals: { items: items.length, components: componentCount, resources: resources.length },
    status_counts: statusCounts,
    issue_counts: issueCounts,
    category_counts: summary,
    expected_vs_actual: {
      smkk: { expected: EXPECTED.SMKK, actual: summary.smkk, difference: summary.smkk - EXPECTED.SMKK },
      sda: { expected: EXPECTED.SDA, actual: summary.sda, difference: summary.sda - EXPECTED.SDA },
      bina_marga: { expected: EXPECTED.BINA_MARGA, actual: summary.bina_marga, difference: summary.bina_marga - EXPECTED.BINA_MARGA },
      cipta_karya: { expected: EXPECTED.CIPTA_KARYA, actual: summary.cipta_karya, difference: summary.cipta_karya - EXPECTED.CIPTA_KARYA },
      umum: { expected: EXPECTED.UMUM, actual: summary.umum, difference: summary.umum - EXPECTED.UMUM },
      total: { expected: EXPECTED.TOTAL, actual: summary.total, difference: summary.total - EXPECTED.TOTAL },
    },
    target_provenance: TARGET_PROVENANCE,
    duplicate_summary: {
      groups: groups.length,
      exact: groups.filter((g) => g.status === 'exact_duplicate').length,
      possible: groups.filter((g) => g.status === 'possible_duplicate').length,
    },
    missing_data_records: missing.length,
  };
  fs.writeFileSync(path.join(REP, 'ahsp_2026_validation_report.json'), JSON.stringify(validationReport, null, 1));
  fs.writeFileSync(path.join(REP, 'ahsp_missing_data.json'), JSON.stringify({
    generated_at: new Date().toISOString(), count: missing.length, records: missing,
  }, null, 1));

  // ---- count report (§16) + quality score (§24) ----
  const verified = statusCounts.VERIFIED, review = statusCounts.NEEDS_REVIEW, invalid = statusCounts.INVALID;
  const withComp = items.filter((i) => i.components.labor.length + i.components.materials.length + i.components.equipment.length > 0).length;
  const missingSource = items.filter((i) => !(i.source.page > 0)).length;
  const quality = {
    total_records: items.length,
    verified_records: verified,
    needs_review_records: review,
    invalid_records: invalid,
    duplicate_records: [...byId.keys()].length,
    missing_component_records: items.length - withComp,
    missing_source_records: missingSource,
  };
  fs.writeFileSync(path.join(REP, 'ahsp_dataset_quality.json'), JSON.stringify({ generated_at: new Date().toISOString(), ...quality }, null, 1));

  const countMd = [
    '# AHSP 2026 — Count & Quality Report',
    '',
    `Generated: ${new Date().toISOString()}  `,
    `Regulation: **${REGULATION}**`,
    '',
    '## 1. Expected vs Actual',
    '',
    '| Field | Expected | Actual | Difference |',
    '|---|---:|---:|---:|',
    `| SMKK | ${EXPECTED.SMKK} | ${summary.smkk} | ${summary.smkk - EXPECTED.SMKK} |`,
    `| SDA | ${EXPECTED.SDA} | ${summary.sda} | ${summary.sda - EXPECTED.SDA} |`,
    `| Bina Marga | ${EXPECTED.BINA_MARGA} | ${summary.bina_marga} | ${summary.bina_marga - EXPECTED.BINA_MARGA} |`,
    `| Cipta Karya | ${EXPECTED.CIPTA_KARYA} | ${summary.cipta_karya} | ${summary.cipta_karya - EXPECTED.CIPTA_KARYA} |`,
    `| Umum | ${EXPECTED.UMUM} | ${summary.umum} | ${summary.umum - EXPECTED.UMUM} |`,
    `| **TOTAL** | **${EXPECTED.TOTAL}** | **${summary.total}** | **${summary.total - EXPECTED.TOTAL}** |`,
    '',
    '> Targets are validation targets from the project brief, not quotas. No item was',
    '> invented to close a gap; differences are explained in the final report.',
    '',
    '## 2. Dataset Quality',
    '',
    '```',
    'Dataset Quality Report',
    '',
    `Total                  : ${quality.total_records}`,
    `Verified               : ${quality.verified_records}`,
    `Needs Review           : ${quality.needs_review_records}`,
    `Invalid                : ${quality.invalid_records}`,
    `Duplicates             : ${quality.duplicate_records}`,
    `Missing Components     : ${quality.missing_component_records}`,
    `Missing Source         : ${quality.missing_source_records}`,
    '```',
    '',
    '## 3. Resources',
    '',
    `| Type | Count |`,
    `|---|---:|`,
    `| Material | ${resSummary.material} |`,
    `| Labor | ${resSummary.labor} |`,
    `| Equipment | ${resSummary.equipment} |`,
    `| **Total** | **${resSummary.total}** |`,
    '',
    `Look-alike resource entries flagged \`possible_duplicate\`/\`conflict\`: **${resSummary.possible_duplicate}**`,
    '',
    '## 4. Validation Issue Frequency',
    '',
    '| Issue | Records |',
    '|---|---:|',
    ...Object.entries(issueCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`),
    '',
  ].join('\n');
  fs.writeFileSync(path.join(REP, 'ahsp_count_report.md'), countMd);

  // ---- validation report markdown ----
  const valMd = [
    '# AHSP 2026 — Validation Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `- Items: **${items.length}**`,
    `- Components: **${componentCount}**`,
    `- Resources: **${resources.length}**`,
    `- Verified: **${verified}**  ·  Needs review: **${review}**  ·  Invalid: **${invalid}**`,
    `- Duplicate groups: **${groups.length}** (exact ${validationReport.duplicate_summary.exact}, possible ${validationReport.duplicate_summary.possible})`,
    `- Records with missing required fields: **${missing.length}**`,
    '',
    '## Issue frequency',
    '',
    '| Issue | Records |',
    '|---|---:|',
    ...Object.entries(issueCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`),
    '',
    '## Validation levels (§27)',
    '',
    '- **VERIFIED** — source read, code/description/unit present, components present, every coefficient numeric, source page recorded, no duplicate.',
    '- **NEEDS_REVIEW** — a required field is empty, or the item has no analysis table in the source, or a coefficient/resource name is unreadable, or a duplicate was detected.',
    '- **INVALID** — the record has neither a code nor a description and cannot be an AHSP.',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(REP, 'ahsp_2026_validation_report.md'), valMd);

  // ---- master TXT (§22) ----
  writeMasterTxt(items, path.join(VAL, 'AHSP_2026_MASTER.txt'));

  console.log('='.repeat(70));
  console.log('VALIDATE — AHSP 2026');
  console.log('='.repeat(70));
  console.log(`  items            : ${items.length}`);
  console.log(`  components       : ${componentCount}`);
  console.log(`  resources        : ${resources.length} (M=${resSummary.material} L=${resSummary.labor} E=${resSummary.equipment})`);
  console.log(`  VERIFIED         : ${verified}`);
  console.log(`  NEEDS_REVIEW     : ${review}`);
  console.log(`  INVALID          : ${invalid}`);
  console.log(`  duplicate groups : ${groups.length}`);
  console.log(`  missing records  : ${missing.length}`);
  console.log(`  elapsed          : ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  -> ${path.relative(ROOT, path.join(VAL, 'ahsp_2026_master.json'))}`);
}

if (process.argv[1] && /validate\.[tj]s$/.test(process.argv[1].replace(/\\/g, '/'))) main();
