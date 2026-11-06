/**
 * Master Repair Fase 12 — probe ulang 190 kalkulator terhadap service baru.
 * Menghasilkan matriks remediasi per komponen + metrik before/after.
 * Run: npx tsx src/test/calcRepairProbe.ts
 * Output: ../your_files/EZRAB-CALC-REPAIR/phase12-probe.json
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ALL_CONSTRUCTION_CALCULATORS } from '../engine/constructionCalculators/registry';
import { resolveComponentPrice, type ComponentPriceResult } from '../engine/constructionCalculators/componentPriceResolution';
import { normalizeComponentName } from '../engine/constructionCalculators/canonicalResources';

const OUT_DIR = path.resolve(process.cwd(), '../your_files/EZRAB-CALC-REPAIR');
const baseline = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'phase0-baseline.json'), 'utf8'));

type KindKey = 'material' | 'labor' | 'equipment';
const KIND_LABEL: Record<KindKey, string> = { material: 'Material', labor: 'Upah', equipment: 'Alat' };

interface CompRow {
  name: string; unit: string; kind: KindKey; qty: number;
  resourceCode?: string; declaredEstimate?: number | null;
  usedBy: Set<string>;
}

const comps = new Map<string, CompRow>();
const calcStats = new Map<string, { priced: number; unpriced: number }>();

for (const spec of ALL_CONSTRUCTION_CALCULATORS) {
  const inputs: Record<string, number> = {};
  for (const p of spec.parameters ?? []) {
    if (typeof p.defaultValue === 'number') inputs[p.id] = p.defaultValue;
  }
  const result: any = spec.calculate(inputs);
  const rows: Array<{ name: string; unit: string; kind: KindKey; qty: number; code?: string; est?: number | null }> = [
    ...(result.materials ?? []).map((m: any) => ({ name: m.name, unit: m.unit, kind: 'material' as KindKey, qty: m.quantity, code: m.resourceCode, est: m.unitPriceEstimate })),
    ...(result.labor ?? []).map((l: any) => ({ name: l.role, unit: l.unit || 'OH', kind: 'labor' as KindKey, qty: l.hoursOrDays, code: l.resourceCode, est: l.rateEstimate })),
    ...(result.equipment ?? []).map((e: any) => ({ name: e.name, unit: e.unit, kind: 'equipment' as KindKey, qty: e.quantity, code: e.resourceCode, est: e.unitPriceEstimate })),
  ];
  let priced = 0;
  let unpriced = 0;
  for (const row of rows) {
    const r = resolveComponentPrice({
      kind: row.kind === 'material' ? 'MATERIAL' : row.kind === 'labor' ? 'LABOR' : 'EQUIPMENT',
      name: row.name, unit: row.unit, quantity: row.qty,
      resourceCode: row.code, declaredEstimate: row.est,
    });
    if (r.unitPrice != null) priced += 1; else unpriced += 1;
    const key = `${row.name.toLowerCase()}|${row.unit}|${row.kind}`;
    const existing = comps.get(key);
    if (existing) {
      existing.usedBy.add(spec.id);
    } else {
      comps.set(key, {
        name: row.name, unit: row.unit, kind: row.kind, qty: row.qty,
        resourceCode: row.code, declaredEstimate: row.est, usedBy: new Set([spec.id]),
      });
    }
  }
  calcStats.set(spec.id, { priced, unpriced });
}

// Klasifikasi remediasi (untuk komponen yang tetap tak berharga)
const SPEC_REQUIRED_PATTERNS: Array<{ re: RegExp; why: string }> = [
  { re: /fs 45/, why: 'Spesifikasi ganda kuat lentur FS-45 vs fc 25 MPa — perlu keputusan teknis, bukan padanan K-225/K-300' },
  { re: /^batu split$/, why: 'Gradasi tidak dinyatakan; dua record resmi (1/2 dan 2/3) berbeda harga' },
  { re: /kabel nym.*standar sni/, why: 'Satu baris menggabungkan dua ukuran kabel (3x2,5 dan 2x1,5) — harus dipecah' },
  { re: /hollow galvanis 4x4/, why: 'Satu baris menggabungkan dua profil (4x4 dan 2x4) dan panjang beda dari record' },
  { re: /papan bekisting.*dolken/, why: 'Satu baris = dua komoditas (papan bekisting + dolken) — harus dipecah' },
  { re: /asphalt finisher.*tandem roller/, why: 'Bundel dua alat dalam satu baris — harus dipecah' },
  { re: /mobile crane.*chain block/, why: 'Bundel dua alat berbeda (mobile crane + chain block)' },
  { re: /tripod crane.*excavator/, why: 'Bundel dua alat berbeda (tripod crane + excavator mini)' },
  { re: /concrete paver/, why: 'Mesin paver/screed bukan concrete vibrator — kandidat audit salah mesin' },
  { re: /tangki air 50 m/, why: 'Kapasitas 50 m³; record terdekat 1.000 L (beda 50x)' },
  { re: /cat primer antikarat zinkromate/, why: 'Primer zinkromate/epoxy baja — record generik antikarat belum cukup setara (NEEDS_REVIEW)' },
  { re: /besi tulangan ulir bjts/, why: 'Diameter tidak dinyatakan; kelas resmi BjTS terbagi <12 mm dan >12 mm dengan harga berbeda' },
  { re: /baja tulangan sirip bjts/, why: 'Diameter tidak dinyatakan; kelas resmi BjTS terbagi <12 mm dan >12 mm' },
  { re: /beton kedap air/, why: 'Admixture waterproofing adalah spek pembeda — ready mix polos tidak setara' },
  { re: /mortar pengisi nat/, why: 'Mortar pengisi nat bervolume m³ vs produk acian/perekat per-sak — fungsi dan satuan berbeda' },
];
const USER_PRICE_PATTERNS = /precast|u ditch|box culvert|pintu air|pracetak/;

function remediationClass(name: string, unit: string, r: ComponentPriceResult): string {
  if (r.provenance === 'OFFICIAL_AHSP_2026') return 'OFFICIAL_VERIFIED';
  if (r.provenance === 'OFFICIAL_HSPK_REGIONAL') return 'OFFICIAL_HSPK_REGIONAL';
  if (r.provenance === 'MARKET_REFERENCE') return 'MARKET_REFERENCE_AVAILABLE';
  if (r.provenance === 'CALCULATOR_ESTIMATE') return 'CALCULATOR_ESTIMATE';
  if (r.provenance === 'USER_PROVIDED') return 'USER_PROVIDED';
  if (r.status === 'UNIT_MISMATCH') return 'UNIT_MISMATCH';
  if (r.status === 'AMBIGUOUS_MAPPING') return 'AMBIGUOUS_MAPPING';
  if (r.missingReason === 'OFFICIAL_MAPPING_PENDING') return 'OFFICIAL_MAPPING_PENDING';
  const norm = normalizeComponentName(name);
  if (unit === 'dus') return 'TECHNICAL_SPECIFICATION_REQUIRED';
  if (unit === 'batang' && /besi|baja tulangan/.test(norm)) return 'TECHNICAL_SPECIFICATION_REQUIRED';
  for (const p of SPEC_REQUIRED_PATTERNS) if (p.re.test(norm)) return 'TECHNICAL_SPECIFICATION_REQUIRED';
  if (USER_PRICE_PATTERNS.test(norm)) return 'USER_PRICE_REQUIRED';
  return 'NO_VERIFIED_SOURCE';
}

// Join dengan baseline (status sebelum perbaikan)
const beforeMap = new Map<string, any>();
for (const c of [...baseline.unresolvedComponents, ...baseline.resolvedComponents]) {
  beforeMap.set(`${(c.name as string).toLowerCase()}|${c.unit}|${c.kindKey}`, c);
}

const matrix: any[] = [];
const afterCounts = {
  total: 0, resolved: 0, unresolved: 0, unitMismatch: 0, ambiguous: 0,
  official: 0, hspkRegional: 0, market: 0, userProvided: 0, estimate: 0, falsePositives: 0,
  crossRegion: 0, indexOnly: 0,
};
const classCounts = new Map<string, number>();

for (const [key, comp] of comps) {
  const r = resolveComponentPrice({
    kind: comp.kind === 'material' ? 'MATERIAL' : comp.kind === 'labor' ? 'LABOR' : 'EQUIPMENT',
    name: comp.name, unit: comp.unit, quantity: comp.qty,
    resourceCode: comp.resourceCode, declaredEstimate: comp.declaredEstimate,
  });
  const cls = remediationClass(comp.name, comp.unit, r);
  classCounts.set(cls, (classCounts.get(cls) ?? 0) + 1);
  afterCounts.total += 1;
  if (r.unitPrice != null) afterCounts.resolved += 1; else afterCounts.unresolved += 1;
  if (r.status === 'UNIT_MISMATCH') afterCounts.unitMismatch += 1;
  if (r.status === 'AMBIGUOUS_MAPPING') afterCounts.ambiguous += 1;
  if (r.provenance === 'OFFICIAL_AHSP_2026') afterCounts.official += 1;
  if (r.provenance === 'OFFICIAL_HSPK_REGIONAL') afterCounts.hspkRegional += 1;
  if (r.provenance === 'MARKET_REFERENCE') afterCounts.market += 1;
  if (r.provenance === 'USER_PROVIDED') afterCounts.userProvided += 1;
  if (r.provenance === 'CALCULATOR_ESTIMATE') afterCounts.estimate += 1;
  if (r.crossRegion) afterCounts.crossRegion += 1;
  if (r.priceConfidence === 'INDEX_ONLY' && r.unitPrice != null) afterCounts.indexOnly += 1;
  if (r.unitPrice != null && r.unitValidation && r.unitValidation.result !== 'EXACT_MATCH' && r.unitValidation.result !== 'APPROVED_CONVERSION') {
    afterCounts.falsePositives += 1;
  }
  const before = beforeMap.get(key);
  matrix.push({
    name: comp.name,
    unit: comp.unit,
    kind: KIND_LABEL[comp.kind],
    usedBy: [...comp.usedBy],
    resourceCode: r.resourceCode,
    before: before
      ? (baseline.unresolvedComponents.includes(before) ? 'UNRESOLVED' : `RESOLVED (${before.source})`)
      : 'NOT_IN_BASELINE',
    afterClass: cls,
    afterStatus: r.status,
    provenance: r.provenance,
    unitPrice: r.unitPrice,
    sourceReference: r.sourceReference,
    explanation: r.explanation,
    missingReason: r.missingReason,
    regionalSource: r.regionalSource
      ? {
          price: r.regionalSource.price,
          unit: r.regionalSource.unit,
          kind: r.regionalSource.kind,
          publisher: r.regionalSource.publisher,
          documentTitle: r.regionalSource.documentTitle,
          documentDate: r.regionalSource.documentDate,
          regionLabel: r.regionalSource.regionLabel,
          provinceScope: r.regionalSource.provinceScope,
          url: r.regionalSource.url,
        }
      : null,
    regionalPriceAssumption: r.regionalPriceAssumption ?? false,
    regionalRejected: r.regionalRejected ?? null,
    crossRegion: r.crossRegion ?? false,
    sourceRegion: r.sourceRegion ?? null,
    priceConfidence: r.priceConfidence ?? null,
  });
}

let incompleteCalcs = 0;
let noPriceCalcs = 0;
let blockedPartialSyncs = 0;
for (const [, st] of calcStats) {
  if (st.unpriced > 0 && st.priced > 0) { incompleteCalcs += 1; blockedPartialSyncs += 1; }
  if (st.priced === 0 && st.unpriced > 0) noPriceCalcs += 1;
}
const affectedCalcs = [...calcStats.values()].filter((s) => s.unpriced > 0).length;

const summary = {
  generatedAt: new Date().toISOString(),
  metrics: {
    calculators: ALL_CONSTRUCTION_CALCULATORS.length,
    uniqueComponents: afterCounts.total,
    resolvedUnique: afterCounts.resolved,
    unresolvedUnique: afterCounts.unresolved,
    unitMismatchUnique: afterCounts.unitMismatch,
    ambiguousUnique: afterCounts.ambiguous,
    officialVerifiedUnique: afterCounts.official,
    hspkRegionalUnique: afterCounts.hspkRegional,
    marketReferenceUnique: afterCounts.market,
    userProvidedUnique: afterCounts.userProvided,
    calculatorEstimateUnique: afterCounts.estimate,
    incompleteCalculators: incompleteCalcs,
    fullyUnpricedCalculators: noPriceCalcs,
    affectedCalculators: affectedCalcs,
    falsePositives: afterCounts.falsePositives,
    crossRegionUnique: afterCounts.crossRegion,
    indexOnlyResolvedUnique: afterCounts.indexOnly,
    partialSyncsBlocked: affectedCalcs,
    partialSyncsThatWereSilentBefore: blockedPartialSyncs,
  },
  remediationClasses: Object.fromEntries([...classCounts.entries()].sort()),
  baselineTotals: baseline.totals,
};

// Skenario proyek berprovinsi Jawa Timur. Setelah Coverage Completion
// §5 (2026-11-06): tautan Jatim aktif sebagai kelas aslinya (HSPK lokal);
// tautan provinsi LAIN tidak lagi ditolak — dipakai sebagai
// MARKET_REFERENCE lintas-wilayah (crossRegion) dan dihitung terpisah.
const jatimScenario = (() => {
  let resolved = 0;
  let hspk = 0;
  let marketRegional = 0;
  let crossRegion = 0;
  for (const [, comp] of comps) {
    const r = resolveComponentPrice({
      kind: comp.kind === 'material' ? 'MATERIAL' : comp.kind === 'labor' ? 'LABOR' : 'EQUIPMENT',
      name: comp.name, unit: comp.unit, quantity: comp.qty,
      resourceCode: comp.resourceCode, declaredEstimate: comp.declaredEstimate,
      projectProvince: 'Jawa Timur',
    });
    if (r.unitPrice != null) resolved += 1;
    if (r.provenance === 'OFFICIAL_HSPK_REGIONAL') hspk += 1;
    if (r.provenance === 'MARKET_REFERENCE' && r.regionalSource) marketRegional += 1;
    if (r.crossRegion) crossRegion += 1;
  }
  return { province: 'Jawa Timur', resolvedUnique: resolved, hspkRegionalUnique: hspk, marketRegionalResearchUnique: marketRegional, crossRegionUnique: crossRegion };
})();
(summary as any).jatimScenario = jatimScenario;

fs.writeFileSync(path.join(OUT_DIR, 'phase12-probe.json'), JSON.stringify({ summary, matrix }, null, 2));
console.log(JSON.stringify(summary, null, 2));
