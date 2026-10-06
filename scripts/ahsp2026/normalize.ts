/**
 * NORMALIZE — build the normalized AHSP 2026 layer.
 *
 * raw (per-page) → normalized (per-AHSP-item, canonical schema)
 *
 * Output: data/ahsp2026/normalized/ahsp_2026_normalized.json
 *         data/ahsp2026/normalized/ahsp_2026_resources.json
 *
 * No prices, no invented fields (§13, §2). Unreadable fields stay empty and the
 * item is flagged so the validator can mark it needs_review.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  parseSda, parseCiptaKarya, parseCiptaKaryaIndex, parseSmkk,
  parseBinaMargaIndex, loadBinaMargaOfficial, readRaw,
  ParsedAnalysis, CK_DIVISIONS, BmOfficialItem,
} from './parse';
import {
  AHSPComponent, AHSPField, AHSPItem, ResourceType, ResourceMasterEntry,
  CALCULATION_TEMPLATE, REGULATION,
} from './types';

const OUT_DIR = path.join(process.cwd(), 'data', 'ahsp2026', 'normalized');

/* ------------------------------------------------------------------ */

interface Built {
  items: AHSPItem[];
  issues: string[];
}

function emptyComponents() {
  return { materials: [] as AHSPComponent[], labor: [] as AHSPComponent[], equipment: [] as AHSPComponent[] };
}

function mkItem(p: {
  code: string; description: string; unit: string; field: AHSPField;
  division: string; subdivision: string; category: string; subcategory: string;
  page: number; attachment: string; sourceFile: string;
  comps?: { labor: AHSPComponent[]; material: AHSPComponent[]; equipment: AHSPComponent[] };
  notes?: string[]; issues?: string[];
}): AHSPItem {
  const c = p.comps ?? { labor: [], material: [], equipment: [] };
  return {
    id: '', // assigned by the caller (stable, per-field, zero-padded)
    code: p.code,
    version: '2026',
    field: p.field,
    division: p.division,
    subdivision: p.subdivision,
    category: p.category,
    subcategory: p.subcategory,
    description: p.description.replace(/\s+/g, ' ').trim(),
    unit: p.unit,
    source: { regulation: REGULATION, attachment: p.attachment, page: p.page, source_file: p.sourceFile },
    components: { materials: c.material, labor: c.labor, equipment: c.equipment },
    calculation: { ...CALCULATION_TEMPLATE },
    validation: {
      code_verified: false, description_verified: false, unit_verified: false,
      components_verified: false, coefficients_verified: false, source_verified: false,
      duplicate_checked: false, status: 'NEEDS_REVIEW', issues: p.issues ?? [],
    },
    notes: p.notes && p.notes.length ? p.notes : undefined,
  };
}

/* ---------------------------- SDA ---------------------------- */

function buildSda(): Built {
  const pages = readRaw('sda');
  const { inventory, analyses, headings } = parseSda(pages);
  const byCode = new Map<string, ParsedAnalysis>();
  for (const a of analyses) if (!byCode.has(a.code)) byCode.set(a.code, a);

  const items: AHSPItem[] = [];
  const issues: string[] = [];

  // Authoritative inventory drives the item list (exactly the codes printed by the SE).
  for (const inv of inventory) {
    const a = byCode.get(inv.code);
    const desc = (a?.description && a.description.length > inv.description.length) ? a.description : inv.description;
    const unit = inv.unit || a?.unit || '';
    const lvl = inv.code ? inv.code.split('.') : [];
    const division = lvl.slice(0, 2).join('.');            // e.g. A.1
    const subdivision = lvl.slice(0, 3).join('.');         // e.g. A.1.01
    const it = mkItem({
      code: inv.code,
      description: desc,
      unit,
      field: 'SDA',
      division: headings.get(division) ? `${division} ${headings.get(division)}` : division,
      subdivision: headings.get(subdivision) ? `${subdivision} ${headings.get(subdivision)}` : subdivision,
      category: headings.get(subdivision) ?? subdivision,
      subcategory: inv.normative,
      page: a?.source_page ?? inv.source_page,
      attachment: 'IV',
      sourceFile: 'Lampiran-IV-SE-DJBK-No-47-Tahun-2026-AHSP-Bidang-Sumber-Daya-Air.pdf',
      comps: a?.components,
      notes: a?.notes,
      issues: a?.issues,
    });
    // Phase 0.5: the source prints row 810 without a code — record it, never invent one.
    if (inv.code_missing_in_source) {
      it.validation.issues.push(
        `source prints inventory row no. ${inv.no} without a KODE (page ${inv.source_page}); code left empty`,
      );
    }
    if (!a) it.validation.issues.push('no analysis table found in source (inventory-only record)');
    items.push(it);
  }
  issues.push(`SDA: inventory rows=${inventory.length}, analysis tables=${analyses.length}, matched=${items.filter((i) => byCode.has(i.code)).length}`);
  return { items, issues };
}

/* ------------------------ Cipta Karya ------------------------ */

function buildCiptaKarya(): Built {
  const pages = readRaw('ciptakarya');
  const index = parseCiptaKaryaIndex(pages);
  const analyses = parseCiptaKarya(pages);
  const byCode = new Map<string, ParsedAnalysis>();
  for (const a of analyses) if (!byCode.has(a.code)) byCode.set(a.code, a);

  const issues: string[] = [];
  const seen = new Set<string>();
  const items: AHSPItem[] = [];

  // The attachment's own DAFTAR ISI drives the inventory (authoritative codes).
  for (const ix of index) {
    if (seen.has(ix.code)) continue;
    seen.add(ix.code);
    const a = byCode.get(ix.code);
    const top = ix.code.split('.')[0];
    const div = CK_DIVISIONS[top] ?? `DIVISI ${top}`;
    const desc = (a?.description && a.description.length > ix.description.length) ? a.description : ix.description;
    const it = mkItem({
      code: ix.code, description: desc, unit: ix.unit || a?.unit || '', field: 'CIPTA_KARYA',
      division: div, subdivision: div, category: div,
      subcategory: `${ix.type}${ix.status ? ' / ' + ix.status : ''}`,
      page: a?.source_page ?? ix.source_page, attachment: 'VI',
      sourceFile: 'Lampiran-VI-SE-DJBK-No-47-Tahun-2026-AHSP-Bidang-Cipta-Karya.pdf',
      comps: a?.components, notes: a?.notes, issues: a?.issues,
    });
    if (!a) it.validation.issues.push('listed in DAFTAR ISI but no analysis table found in source');
    items.push(it);
  }

  // Analysis tables whose code is absent from the DAFTAR ISI are still real
  // records; keep them and flag the discrepancy rather than dropping data.
  let orphans = 0;
  for (const a of analyses) {
    if (seen.has(a.code)) continue;
    seen.add(a.code);
    orphans += 1;
    const top = a.code.split('.')[0];
    const div = CK_DIVISIONS[top] ?? `DIVISI ${top}`;
    const it = mkItem({
      code: a.code, description: a.description, unit: a.unit, field: 'CIPTA_KARYA',
      division: div, subdivision: div, category: div, subcategory: 'analysis-only',
      page: a.source_page, attachment: 'VI',
      sourceFile: 'Lampiran-VI-SE-DJBK-No-47-Tahun-2026-AHSP-Bidang-Cipta-Karya.pdf',
      comps: a.components, notes: a.notes, issues: a.issues,
    });
    it.validation.issues.push('has an analysis table but is absent from the DAFTAR ISI index');
    items.push(it);
  }

  issues.push(`CIPTA KARYA: daftar-isi rows=${index.length}, analysis tables=${analyses.length}, matched=${index.length - 0 && items.filter(i => byCode.has(i.code)).length}, analysis-only=${orphans}`);
  return { items, issues };
}

/* ---------------------------- SMKK ---------------------------- */

function buildSmkk(): Built {
  const pages = readRaw('smkk');
  const rows = parseSmkk(pages);
  const items: AHSPItem[] = rows.map((r) => {
    const tier = r.code.split('-')[0];
    return mkItem({
      code: r.code, description: r.description, unit: r.unit, field: 'SMKK',
      division: `SMKK ${tier}`, subdivision: r.code.split('.').slice(0, 2).join('.'),
      category: 'KOMPONEN BIAYA PENERAPAN SMKK', subcategory: r.quantity,
      page: r.source_page, attachment: 'III',
      sourceFile: 'Lampiran-III-SE-DJBK-No-47-Tahun-2026-Biaya-Penerapan-SMKK_rth_nv_20260218.pdf',
      notes: r.evidence ? [r.evidence] : undefined,
      issues: ['SMKK rows are cost components, not AHSP analyses (no coefficient table in source)'],
    });
  });
  return { items, issues: [`SMKK: rows parsed=${rows.length}`] };
}

/* -------------------------- Bina Marga ------------------------ */

/**
 * Bina Marga is built as the UNION of two official sources:
 *   1. the attachment's own code index (pages 4–30) — authoritative codes, units
 *      and Normatif/Informatif status;
 *   2. the existing verified analysis-table extraction — supplies components and
 *      coefficients for the items it could read.
 * Nothing is dropped: an item present in only one source is still kept, and the
 * asymmetry is recorded in its validation issues.
 *
 * Phase 0.5 correction: this is **Lampiran V**, not Lampiran II. The PDF's own
 * cover reads "LAMPIRAN V", its MD5 matches the authority's download_id=10903,
 * and Lampiran VI cross-references it as "Lampiran V Bidang Bina Marga".
 */
function buildBinaMarga(): Built {
  const index = parseBinaMargaIndex();
  const official = loadBinaMargaOfficial();
  const byCode = new Map<string, BmOfficialItem>();
  for (const o of official) {
    const c = String(o.code ?? '').trim();
    if (c && !byCode.has(c)) byCode.set(c, o);
  }

  const issues: string[] = [];
  const items: AHSPItem[] = [];
  const seen = new Set<string>();

  const compsOf = (o?: BmOfficialItem) => {
    const comps = { labor: [] as AHSPComponent[], material: [] as AHSPComponent[], equipment: [] as AHSPComponent[] };
    if (!o) return comps;
    for (const c of o.components ?? []) {
      const t: string = c.componentType ?? c.type ?? '';
      const type: ResourceType = /TENAGA|LABOR|UPAH/i.test(t) ? 'labor' : /BAHAN|MATERIAL/i.test(t) ? 'material' : 'equipment';
      const key = type === 'labor' ? 'labor' : type === 'material' ? 'material' : 'equipment';
      comps[key].push({
        resource_code: c.code ?? '',
        resource_name: c.name ?? '',
        resource_type: type,
        unit: c.unit ?? '',
        coefficient: typeof c.coefficient === 'number' ? c.coefficient : null,
        coefficient_raw: c.raw ?? String(c.coefficient ?? ''),
        source_page: c.sourcePage ?? o.analisaPage ?? o.headerPage ?? 0,
        raw: c.raw ?? '',
      });
    }
    return comps;
  };

  for (const ix of index) {
    if (seen.has(ix.code)) continue;
    seen.add(ix.code);
    const o = byCode.get(ix.code);
    const top = ix.code.split('.')[0];
    const it = mkItem({
      code: ix.code,
      description: (o?.name && o.name.length > ix.description.length) ? o.name : ix.description,
      unit: ix.unit || o?.unit || '',
      field: 'BINA_MARGA',
      division: `DIVISI ${top}`, subdivision: `DIVISI ${top}`, category: `DIVISI ${top}`,
      subcategory: ix.status,
      page: o?.analisaPage ?? ix.source_page, attachment: 'V',
      sourceFile: 'Lampiran-V-SE-DJBK-No-47-Tahun-2026-AHSP-Bidang-Bina-Marga.pdf',
      comps: compsOf(o),
      issues: [...(o?.warnings ?? [])],
    });
    if (!o) it.validation.issues.push('listed in the Lampiran V code index but no analysis table was extracted');
    else if (!o.analisaPage) it.validation.issues.push('header-only entry: no analysis table in the source');
    // §13 — reference-year figures printed in the source are kept in a clearly
    // separated `source_reference` block. They are NEVER the active price.
    if (o && (o.hargaSatuan != null || o.totalABC != null || o.overheadProfitPercent != null)) {
      it.source_reference = {
        total_abc: o.totalABC ?? null,
        overhead_profit_percent: o.overheadProfitPercent ?? null,
        unit_price_printed: o.hargaSatuan ?? null,
      };
    }
    items.push(it);
  }

  let orphans = 0;
  for (const o of official) {
    const c = String(o.code ?? '').trim();
    if (!c || seen.has(c)) continue;
    seen.add(c);
    orphans += 1;
    const top = c.split('.')[0];
    const it = mkItem({
      code: c, description: o.name ?? '', unit: o.unit ?? '', field: 'BINA_MARGA',
      division: `DIVISI ${top}`, subdivision: `DIVISI ${top}`, category: `DIVISI ${top}`, subcategory: '',
      page: o.analisaPage ?? o.headerPage ?? 0, attachment: 'V',
      sourceFile: 'Lampiran-V-SE-DJBK-No-47-Tahun-2026-AHSP-Bidang-Bina-Marga.pdf',
      comps: compsOf(o), issues: [...(o.warnings ?? [])],
    });
    it.validation.issues.push('has an analysis table but is absent from the Lampiran V code index');
    items.push(it);
  }

  issues.push(`BINA MARGA (Lampiran V): code-index rows=${index.length}, extracted items=${official.length}, union=${items.length}, analysis-only=${orphans}`);
  return { items, issues };
}

/* -------------------------- Resource master ------------------- */

export function buildResources(items: AHSPItem[]): ResourceMasterEntry[] {
  const map = new Map<string, ResourceMasterEntry>();
  for (const it of items) {
    const all: AHSPComponent[] = [...it.components.labor, ...it.components.materials, ...it.components.equipment];
    for (const c of all) {
      const key = `${c.resource_type}|${c.resource_code}|${c.resource_name}|${c.unit}`;
      const existing = map.get(key);
      if (existing) {
        if (!existing.source_ahsp_codes.includes(it.code)) existing.source_ahsp_codes.push(it.code);
      } else {
        map.set(key, {
          resource_id: '', code: c.resource_code, name: c.resource_name,
          type: c.resource_type, unit: c.unit, category: it.field,
          source_ahsp_codes: [it.code], duplicate_status: 'unique',
        });
      }
    }
  }
  return [...map.values()];
}

/* ------------------------------------------------------------------ */

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const t0 = Date.now();

  const sda = buildSda();
  const ck = buildCiptaKarya();
  const smkk = buildSmkk();
  const bm = buildBinaMarga();

  // Assign stable IDs: AHSP-2026-<FIELD>-<6 digits>.
  const groups: { field: AHSPField; items: AHSPItem[] }[] = [
    { field: 'SMKK', items: smkk.items },
    { field: 'SDA', items: sda.items },
    { field: 'BINA_MARGA', items: bm.items },
    { field: 'CIPTA_KARYA', items: ck.items },
  ];
  const all: AHSPItem[] = [];
  for (const g of groups) {
    let n = 0;
    for (const it of g.items) {
      n += 1;
      it.id = `AHSP-2026-${g.field}-${String(n).padStart(6, '0')}`;
      all.push(it);
    }
  }

  const resources = buildResources(all);
  resources.forEach((r, i) => { r.resource_id = `RES-${String(i + 1).padStart(6, '0')}`; });

  const doc = {
    dataset: {
      id: 'AHSP-2026', version: '2026', regulation: REGULATION, status: 'official',
      source: 'Kementerian Pekerjaan Umum',
      note: 'Normalized layer. Coefficients preserved from source; no active prices stored (§13).',
      generated_at: new Date().toISOString(),
    },
    summary: {
      total: all.length,
      smkk: smkk.items.length, sda: sda.items.length,
      bina_marga: bm.items.length, cipta_karya: ck.items.length, umum: 0,
    },
    items: all,
  };

  fs.writeFileSync(path.join(OUT_DIR, 'ahsp_2026_normalized.json'), JSON.stringify(doc));
  fs.writeFileSync(path.join(OUT_DIR, 'ahsp_2026_resources.json'), JSON.stringify({
    dataset: { id: 'AHSP-2026-RESOURCES', version: '2026', generated_at: new Date().toISOString() },
    summary: {
      total: resources.length,
      material: resources.filter((r) => r.type === 'material').length,
      labor: resources.filter((r) => r.type === 'labor').length,
      equipment: resources.filter((r) => r.type === 'equipment').length,
    },
    resources,
  }));

  console.log('='.repeat(70));
  console.log('NORMALIZE — AHSP 2026');
  console.log('='.repeat(70));
  for (const line of [...sda.issues, ...ck.issues, ...smkk.issues, ...bm.issues]) console.log('  ' + line);
  console.log('');
  console.log(`  total items      : ${all.length}`);
  console.log(`    SMKK           : ${smkk.items.length}`);
  console.log(`    SDA            : ${sda.items.length}`);
  console.log(`    BINA MARGA     : ${bm.items.length}`);
  console.log(`    CIPTA KARYA    : ${ck.items.length}`);
  console.log(`  resources        : ${resources.length} (M=${resources.filter(r => r.type === 'material').length} L=${resources.filter(r => r.type === 'labor').length} E=${resources.filter(r => r.type === 'equipment').length})`);
  console.log(`  elapsed          : ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  -> ${path.relative(process.cwd(), path.join(OUT_DIR, 'ahsp_2026_normalized.json'))}`);
}

// Run only when invoked directly (not when imported by another pipeline stage).
if (process.argv[1] && /normalize\.[tj]s$/.test(process.argv[1].replace(/\\/g, '/'))) main();
