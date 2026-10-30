/**
 * Generator dataset "Rumah Tinggal 2 Lantai — EZRAB Premium Demo".
 *
 * Prinsip integritas (tidak bisa ditawar):
 * - Harga HANYA dari gerbang kanonis (matchDedItemToAhsp status RESOLVED:
 *   kode terverifikasi + satuan persis + komposisi FULL + konsisten facade).
 * - Status lain => unitPrice/amount null (BUKAN 0) + status pemetaan jujur.
 * - Deskripsi item RESOLVED = judul resmi katalog, bukan karangan.
 * - Kuantitas = input demonstrasi dari asumsi geometri yang dinyatakan.
 *
 * Output:
 * - src/data/premiumDemoData.ts (modul data native aplikasi)
 * - laporan CSV/JSON ke stdout folder (diatur lewat DEMO_OUT env)
 */
import * as fs from 'fs';
import * as path from 'path';
import { SPEC, SECTIONS, type DemoSpecItem } from './spec';
import { SPEC2 } from './spec2';
import { SPEC3 } from './spec3';
import { matchDedItemToAhsp, type CanonicalDedMatch } from '../src/ai-tools/ded-canonical/canonicalDedPricing';
import { officialAhspRepository } from '../src/data/nationalCostDatabase/officialAhspRepository';
import { priceResolver2026 } from '../src/data/priceDatabase2026/resolver';
import type { RabItem, Project, AHSPComponent } from '../src/types';
import type { AhspComponentPricing } from '../src/data/priceDatabase2026/types';

export const PREMIUM_PROJECT_ID = 'PRJ-DEMO-PREMIUM-01';
const TS = '2026-10-30T00:00:00.000Z';

const ALL: DemoSpecItem[] = [...SPEC, ...SPEC2, ...SPEC3];

interface GenRow {
  spec: DemoSpecItem;
  verdict: CanonicalDedMatch;
  item: RabItem;
}

/** Komponen snapshot dari komposisi resolver 2026 (sumber harga yang sama
 *  dengan gerbang kanonis — BUKAN harga mentah tersimpan di record katalog). */
function toSnapshotComponents(
  comps: AhspComponentPricing[],
  kind: 'MATERIAL' | 'LABOR' | 'EQUIPMENT',
): AHSPComponent[] {
  return comps.map((c) => ({
    id: c.componentId,
    code: c.itemCode,
    name: c.itemName,
    unit: c.unit,
    coefficient: c.coefficient,
    unitPrice: c.unitPrice,
    total: c.subtotalPerUnit == null ? null : Math.round(c.subtotalPerUnit),
    resourceType: kind,
  }));
}

const perSectionCount = new Map<number, number>();
const rows: GenRow[] = ALL.map((spec, idx) => {
  const n = (perSectionCount.get(spec.s) ?? 0) + 1;
  perSectionCount.set(spec.s, n);
  const verdict = matchDedItemToAhsp({
    name: spec.name,
    unit: spec.unit,
    specification: spec.spec,
    claimedAhspCode: spec.code,
  });
  const sectionName = SECTIONS[spec.s - 1];
  const base: RabItem = {
    id: `RAB-DEMO-${String(idx + 1).padStart(3, '0')}`,
    projectId: PREMIUM_PROJECT_ID,
    no: n,
    wbsCode: `${spec.s}.${n}`,
    code: '',
    category: sectionName,
    sectionName,
    description: spec.name,
    volume: spec.qty,
    unit: spec.unit,
    unitPrice: null,
    amount: null,
    totalPrice: null,
    priceStatus: 'PRICE_UNRESOLVED',
    priceSourceKind: 'UNRESOLVED',
    priceSourceLabel: 'Belum ada sumber harga terverifikasi',
    volumeSource: 'MANUAL',
    notes: spec.basis,
  };

  if (verdict.status === 'RESOLVED' && verdict.matchedCode) {
    const cat = officialAhspRepository.getOfficialAhsp(verdict.matchedCode);
    if (!cat) throw new Error(`RESOLVED tanpa item katalog: ${verdict.matchedCode}`);
    // Komposisi dari resolver 2026 — jalur yang sama dengan gerbang kanonis.
    const comp = priceResolver2026.resolveAhspUnitPrice(cat as never);
    if (verdict.unitPrice == null || comp.unitPrice == null || Math.abs(comp.unitPrice - verdict.unitPrice) > 2) {
      throw new Error(`Harga komposisi (${comp.unitPrice}) != gerbang (${verdict.unitPrice}) untuk ${cat.code}`);
    }
    const mat = Math.round(comp.material.subtotalPerUnit);
    const lab = Math.round(comp.labor.subtotalPerUnit);
    const eqp = Math.round(comp.equipment.subtotalPerUnit);
    const amount = Math.round(spec.qty * verdict.unitPrice);
    // Uraian RAB = judul resmi katalog + sufiks lokasi/elemen dari nama demo
    // (praktik RAB lazim; identitas katalog murni tetap di ahspSnapshot).
    // Tanpa sufiks lokasi, baris lantai 1 vs lantai 2 tak bisa dibedakan.
    const tail = spec.name.split('—').slice(1).join('—').trim();
    base.description =
      tail && !cat.name.toLowerCase().includes(tail.toLowerCase())
        ? `${cat.name} — ${tail}`
        : cat.name;
    base.code = cat.code;
    base.ahspCode = cat.code;
    base.unit = cat.unit;
    base.materialPrice = mat;
    base.laborPrice = lab;
    base.equipmentPrice = eqp;
    base.unitPrice = verdict.unitPrice;
    base.amount = amount;
    base.totalPrice = amount;
    base.priceStatus = 'PRICE_RESOLVED';
    base.priceSourceKind = 'OFFICIAL_AHSP';
    base.priceSourceLabel = 'AHSP 2026 — SE DJBK No. 47/SE/Dk/2026';
    base.priceSourceName = cat.sourceDocument;
    base.priceSourceExplanation =
      `Kode ${cat.code} terverifikasi di katalog resmi AHSP 2026 (${cat.sourceDocument}); ` +
      'satuan cocok persis; komposisi lengkap (FULL); harga = biaya langsung resolver kanonis.';
    base.ahspMappingStatus = 'VERIFIED';
    base.ahspIdentityStatus = 'SAFE';
    base.ahspSnapshot = {
      ahspId: cat.id,
      code: cat.code,
      version: '2026',
      name: cat.name,
      unit: cat.unit,
      laborComponents: toSnapshotComponents(comp.labor.components, 'LABOR'),
      materialComponents: toSnapshotComponents(comp.material.components, 'MATERIAL'),
      equipmentComponents: toSnapshotComponents(comp.equipment.components, 'EQUIPMENT'),
      unitPrice: verdict.unitPrice,
      sourceDocument: cat.sourceDocument,
      snapshotTimestamp: TS,
    };
  } else {
    base.priceSourceExplanation = verdict.reason;
    if (verdict.status === 'UNIT_MISMATCH') {
      base.ahspMappingStatus = 'UNIT_MISMATCH';
      if (verdict.matchedCode) { base.ahspCode = verdict.matchedCode; base.code = verdict.matchedCode; }
    } else if (verdict.status === 'INCOMPLETE_COMPONENTS') {
      base.ahspMappingStatus = 'MAPPED_UNPRICED';
      if (verdict.matchedCode) { base.ahspCode = verdict.matchedCode; base.code = verdict.matchedCode; }
    } else {
      base.ahspMappingStatus = 'NEEDS_MAPPING';
    }
  }
  return { spec, verdict, item: base };
});

// ---------- Ringkasan biaya konsisten (rumus sama computeSeedCostSummary) ----------
const priced = rows.filter((r) => r.item.amount != null);
const directCost = priced.reduce((s, r) => s + (r.item.amount ?? 0), 0);
const overheadAmount = Math.round(directCost * 0.05);
const profitAmount = Math.round(directCost * 0.05);
const subtotalBeforeTax = directCost + overheadAmount + profitAmount;
const taxAmount = Math.round(subtotalBeforeTax * 0.11);
const grandTotal = subtotalBeforeTax + taxAmount;

const project: Project = {
  id: PREMIUM_PROJECT_ID,
  projectNumber: 'PRJ-2026-DEMO',
  name: 'Rumah Tinggal 2 Lantai — EZRAB Premium Demo',
  clientName: 'Proyek Contoh EZRAB (Demonstrasi)',
  location: 'Jakarta Selatan (contoh)',
  buildingType: 'Rumah Tinggal',
  landArea: 112,
  buildingArea: 72,
  floorCount: 2,
  year: 2026,
  status: 'draft',
  isDemo: true,
  notes:
    'DATA DEMONSTRASI — bukan dokumen konstruksi. Kuantitas dari asumsi geometri contoh; ' +
    'harga hanya dari katalog resmi AHSP 2026 lewat resolver kanonis; item tanpa padanan ' +
    'terverifikasi dibiarkan tanpa harga (null) dan tercatat di register unresolved.',
  sections: [],
  costSummary: {
    directCost,
    overheadPercent: 5,
    overheadAmount,
    profitPercent: 5,
    profitAmount,
    contingencyPercent: 0,
    contingencyAmount: 0,
    directorMarkupPercent: 0,
    directorMarkupNominal: 0,
    directorMarkupTotal: 0,
    showMarkupToEditor: false,
    showMarkupToClient: false,
    subtotalBeforeTax,
    taxPercent: 11,
    taxAmount,
    grandTotal,
    costPerM2: 0,
  },
  // Bidang ringkasan ala proyek bawaan lain (kompat tampilan daftar proyek)
  ...( {
    client: 'Proyek Contoh EZRAB (Demonstrasi)',
    progress: 0,
    totalRab: grandTotal,
    itemsCount: rows.length,
    createdAt: TS,
    updatedAt: TS,
  } as object),
} as Project;

// ---------- Validasi internal ----------
const errors: string[] = [];
const ids = new Set<string>(); const wbs = new Set<string>();
for (const r of rows) {
  if (ids.has(r.item.id)) errors.push(`ID ganda ${r.item.id}`);
  ids.add(r.item.id);
  if (wbs.has(r.item.wbsCode!)) errors.push(`WBS ganda ${r.item.wbsCode}`);
  wbs.add(r.item.wbsCode!);
  if (r.item.priceStatus === 'PRICE_RESOLVED') {
    if (!r.item.ahspCode || !officialAhspRepository.hasOfficialAhsp(r.item.ahspCode)) errors.push(`Kode tak resmi pada ${r.item.id}`);
    if (r.item.unitPrice == null || r.item.amount !== Math.round(r.item.volume * r.item.unitPrice)) errors.push(`Aritmetika ${r.item.id}`);
  } else if (r.item.unitPrice !== null || r.item.amount !== null) {
    errors.push(`Item unresolved berharga pada ${r.item.id}`);
  }
}
const sumCheck = priced.reduce((s, r) => s + (r.item.amount ?? 0), 0);
if (sumCheck !== directCost) errors.push('Total tidak rekonsiliasi');

// ---------- Tulis modul data ----------
const outDir = process.env.DEMO_OUT || 'demo-gen/out';
fs.mkdirSync(outDir, { recursive: true });
const items = rows.map((r) => r.item);
const moduleBody = `/**
 * GENERATED — JANGAN EDIT MANUAL.
 * Dataset "Rumah Tinggal 2 Lantai — EZRAB Premium Demo" (213 baris direncanakan).
 * Digenerate dari katalog resmi AHSP 2026 lewat gerbang kanonis
 * (matchDedItemToAhsp): harga hanya untuk item RESOLVED; selain itu null.
 * Regenerasi: demo-gen/generate.ts (lihat laporan pendamping di your_files).
 */
import type { Project, RabItem } from '../types';

export const PREMIUM_DEMO_PROJECT_ID = '${PREMIUM_PROJECT_ID}';

export const PREMIUM_DEMO_PROJECT: Project = ${JSON.stringify(project, null, 2)};

export const PREMIUM_DEMO_RAB_ITEMS: RabItem[] = ${JSON.stringify(items, null, 2)};
`;
fs.writeFileSync(path.join('src/data', 'premiumDemoData.ts'), moduleBody);

// ---------- Laporan ----------
const csvEsc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const matchCsv = [
  'wbs,section,uraian_demo,satuan,volume,status_hasil,kode_ahsp,uraian_resmi,harga_satuan,jumlah,alasan',
  ...rows.map((r) => [
    r.item.wbsCode, r.item.sectionName, r.spec.name, r.spec.unit, r.spec.qty,
    r.verdict.status, r.item.ahspCode ?? '', r.item.priceStatus === 'PRICE_RESOLVED' ? r.item.description : '',
    r.item.unitPrice ?? '', r.item.amount ?? '', r.verdict.reason,
  ].map(csvEsc).join(',')),
].join('\n');
fs.writeFileSync(path.join(outDir, 'matching-report.csv'), matchCsv);

const byStatus = new Map<string, number>();
for (const r of rows) byStatus.set(r.verdict.status, (byStatus.get(r.verdict.status) ?? 0) + 1);
const summary = {
  totalItems: rows.length,
  byStatus: Object.fromEntries(byStatus),
  pricedItems: priced.length,
  unresolvedItems: rows.length - priced.length,
  directCost, overheadAmount, profitAmount, subtotalBeforeTax, taxAmount, grandTotal,
  errors,
};
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (errors.length) { console.error('VALIDATION ERRORS:', errors); process.exit(1); }
