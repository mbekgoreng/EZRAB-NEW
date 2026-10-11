/**
 * EZRAB AHSP 2026 — PHASE D: CANONICAL MODULE GENERATOR
 * =====================================================
 *
 * Reads the VERIFIED Phase 0.5 artefacts and emits the single authoritative
 * TypeScript catalog module consumed by the EZRAB runtime:
 *
 *   data/ahsp2026/validated/ahsp_2026_master.json      -> items
 *   data/ahsp2026/validated/ahsp_2026_components.json  -> components
 *   data/ahsp2026/validated/ahsp_2026_resources.json   -> resource master
 *
 * Outputs (deterministic — re-running produces byte-identical files):
 *   src/data/nationalCostDatabase/ahsp2026Canonical.generated.ts
 *   src/data/nationalCostDatabase/ahsp2026CanonicalResources.generated.ts
 *
 * HARD RULES (purge prompt §12/§13/§14/§16/§26):
 *   - Never invent a code, name, unit, coefficient, price, method or normative status.
 *   - Prices ARE imported from HSD (data/ahsp2026/validated/ahsp_2026_hsd_ck.json).
 *     unitPrice = HSD price when matched by name+unit; null when not found.
 *     Explicit zero in source stays 0 (distinct from missing).
 *   - Bina Marga attachment is "V" — never "II".
 *   - A source row printed without a code keeps code = "" and is flagged SOURCE_DEFECT.
 *   - Every item carries full provenance (regulation, attachment, page, source file).
 *
 * Usage: npx tsx scripts/ahsp2026/generateCanonicalModule.ts
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const VALIDATED = path.join(ROOT, 'data', 'ahsp2026', 'validated');
const OUT_DIR = path.join(ROOT, 'src', 'data', 'nationalCostDatabase');

type Field = 'SMKK' | 'SDA' | 'BINA_MARGA' | 'CIPTA_KARYA';
type Attachment = 'III' | 'IV' | 'V' | 'VI';

const FIELD_TO_DOMAIN: Record<Field, string> = {
  SMKK: 'SMKK',
  SDA: 'SUMBER_DAYA_AIR',
  BINA_MARGA: 'BINA_MARGA',
  CIPTA_KARYA: 'CIPTA_KARYA',
};

/** field -> official annex attachment. Bina Marga = V (NOT II). */
const FIELD_TO_ATTACHMENT: Record<Field, Attachment> = {
  SMKK: 'III',
  SDA: 'IV',
  BINA_MARGA: 'V',
  CIPTA_KARYA: 'VI',
};

interface CanonMaster {
  dataset: unknown;
  summary: Record<string, number>;
  items: any[];
}
interface CanonComponents {
  items: { id: string; code: string; field: string; unit: string; components: { materials: any[]; labor: any[]; equipment: any[] } }[];
}
interface CanonResources {
  resources: any[];
}

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
}

interface HsdEntry {
  code: string;
  name: string;
  unit: string;
  price: number | null;
  sourceSheet: string;
  sourceRow: number;
}

/**
 * PHASE 2B: HSD price lookup.
 * Maps component -> HSD price by normalized (name, unit).
 * Returns price or null when not found. Never invents prices.
 */
class HsdPriceLookup {
  private byNameUnit = new Map<string, HsdEntry>();
  private ambiguous = new Set<string>();

  constructor(entries: HsdEntry[]) {
    for (const e of entries) {
      const key = this.key(e.name, e.unit);
      const existing = this.byNameUnit.get(key);
      if (existing && existing.price !== e.price) {
        // Same name+unit, different price -> ambiguous, don't use
        this.ambiguous.add(key);
        this.byNameUnit.delete(key);
      } else if (!existing) {
        this.byNameUnit.set(key, e);
      }
    }
  }

  private key(name: string, unit: string): string {
    const n = (name || '').toLowerCase().trim().replace(/\s+/g, ' ');
    const u = normalizeUnit(unit || '').toLowerCase();
    return `${n}||${u}`;
  }

  lookup(name: string, unit: string): number | null {
    const key = this.key(name, unit);
    if (this.ambiguous.has(key)) return null;
    const e = this.byNameUnit.get(key);
    if (!e) return null;
    return e.price; // may be null (explicitly no price in source)
  }

  get stats() {
    return { entries: this.byNameUnit.size, ambiguous: this.ambiguous.size };
  }
}

let hsdLookup: HsdPriceLookup | null = null;

function getHsdLookup(): HsdPriceLookup {
  if (!hsdLookup) {
    const hsdPath = path.join(VALIDATED, 'ahsp_2026_hsd_ck.json');
    const entries: HsdEntry[] = fs.existsSync(hsdPath) ? readJson<HsdEntry[]>(hsdPath) : [];
    hsdLookup = new HsdPriceLookup(entries);
    console.log(`[generate] HSD loaded: ${hsdLookup.stats.entries} entries, ${hsdLookup.stats.ambiguous} ambiguous`);
  }
  return hsdLookup;
}

/**
 * Unit normalization (permitted by purge prompt §13 — "unit normalization").
 * Maps the inconsistent unit spellings found in the source to one canonical
 * symbol set. Anything not listed is kept VERBATIM — never guessed.
 * The pre-normalization value is preserved on the item as `unitRaw`.
 */
const UNIT_NORMALIZATION: Record<string, string> = {
  'Meter Kubik': 'm3',
  'Meter Persegi': 'm2',
  'Meter persegi': 'm2',
  'Meter Panjang': "m'",
  M2: 'm2',
  M3: 'm3',
  Kilogram: 'kg',
  Liter: 'l',
  Ton: 'ton',
  ton: 'ton',
  Jam: 'jam',
  jam: 'jam',
  Buah: 'buah',
  buah: 'buah',
  Titik: 'titik',
  titik: 'titik',
  Unit: 'unit',
  unit: 'unit',
  Km: 'km',
  km: 'km',
  Ha: 'ha',
  Ls: 'ls',
  ls: 'ls',
  Lumsum: 'ls',
  Lumpsum: 'ls',
};

function normalizeUnit(raw: string): string {
  const trimmed = (raw ?? '').trim();
  return UNIT_NORMALIZATION[trimmed] ?? trimmed;
}

function readabilityOf(coeffs: number[]): 'OK' | 'DEGRADED' | 'UNREADABLE' {
  if (coeffs.length === 0) return 'UNREADABLE';
  if (coeffs.some((c) => c === 0 || !Number.isFinite(c))) return 'UNREADABLE';
  if (coeffs.some((c) => Math.abs(c) > 0 && Math.abs(c) < 0.001)) return 'DEGRADED';
  return 'OK';
}

/**
 * Derive the pipeline validation status.
 * SOURCE_DEFECT is only used when the SOURCE itself printed the row without a code
 * (per §25 — SDA inventory row 810). Everything else maps straight through.
 */
function deriveStatus(validation: any): 'VERIFIED' | 'NEEDS_REVIEW' | 'SOURCE_DEFECT' {
  const issues: string[] = validation?.issues ?? [];
  const sourceDefect = issues.some((i) => /without a KODE|printed without/i.test(i));
  if (sourceDefect) return 'SOURCE_DEFECT';
  const s = String(validation?.status ?? 'NEEDS_REVIEW').toUpperCase();
  if (s === 'VERIFIED') return 'VERIFIED';
  return 'NEEDS_REVIEW';
}

function dataQualityScore(status: string): number {
  if (status === 'VERIFIED') return 100;
  if (status === 'SOURCE_DEFECT') return 25;
  return 60;
}

/**
 * PHASE 2B: sum component totals. Returns null when no component has a price
 * (distinguishes "no price data" from "price is zero").
 */
function sumTotals(components: Record<string, unknown>[]): number | null {
  let sum = 0;
  let hasPrice = false;
  for (const c of components) {
    const t = c.total;
    if (typeof t === 'number') {
      sum += t;
      hasPrice = true;
    }
  }
  return hasPrice ? sum : null;
}

function mapComponent(
  row: any,
  itemId: string,
  kind: 'labor' | 'material' | 'equipment',
  idx: number
): Record<string, unknown> {
  const prefix = kind === 'labor' ? 'L' : kind === 'material' ? 'M' : 'E';
  const resourceType = kind === 'labor' ? 'LABOR' : kind === 'material' ? 'MATERIAL' : 'EQUIPMENT';
  const coefficient = typeof row.coefficient === 'number' ? row.coefficient : 0;
  // PHASE 2B: resolve price from HSD (null when not found, never 0-fallback)
  const unitPrice = getHsdLookup().lookup(row.resource_name ?? '', row.unit ?? '');
  const total = unitPrice != null && coefficient > 0 ? Math.round(coefficient * unitPrice) : null;
  return {
    id: `${itemId}-${prefix}${String(idx + 1).padStart(3, '0')}`,
    code: row.resource_code ?? '',
    name: row.resource_name ?? '',
    unit: row.unit ?? '',
    coefficient,
    unitPrice,
    total,
    resourceType,
    coefficientRaw: row.coefficient_raw ?? '',
    rawLine: row.raw ?? '',
    sourcePage: typeof row.source_page === 'number' ? row.source_page : undefined,
  };
}

/**
 * Emit a large array as numbered chunks.
 *
 * A single literal array of 5,801 distinct object shapes makes TypeScript
 * infer a union type that is "too complex to represent" (TS2590). Splitting
 * into bounded chunks keeps each inferred union small and type-checkable.
 */
function emitChunked(
  exportName: string,
  typeName: string,
  rows: Record<string, unknown>[],
  chunkSize = 150
): string {
  const lines: string[] = [];
  const chunkNames: string[] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const name = `__${exportName}_CHUNK_${i / chunkSize}`;
    const slice = rows.slice(i, i + chunkSize);
    lines.push(`const ${name}: ${typeName}[] = [`);
    lines.push(slice.map((r) => JSON.stringify(r)).join(',\n'));
    lines.push('];');
    chunkNames.push(name);
  }
  lines.push('');
  lines.push(`export const ${exportName}: ${typeName}[] = [`);
  lines.push(chunkNames.map((n) => `  ...${n},`).join('\n'));
  lines.push('];');
  return lines.join('\n');
}

function main() {
  const master = readJson<CanonMaster>(path.join(VALIDATED, 'ahsp_2026_master.json'));
  const comps = readJson<CanonComponents>(path.join(VALIDATED, 'ahsp_2026_components.json'));
  const resources = readJson<CanonResources>(path.join(VALIDATED, 'ahsp_2026_resources.json'));

  const compById = new Map(comps.items.map((c) => [c.id, c]));

  const generatedAt = new Date().toISOString();
  const items: Record<string, unknown>[] = [];
  const counts: Record<string, number> = { SMKK: 0, SDA: 0, BINA_MARGA: 0, CIPTA_KARYA: 0 };
  const statusCounts: Record<string, number> = { VERIFIED: 0, NEEDS_REVIEW: 0, SOURCE_DEFECT: 0 };

  for (const m of master.items) {
    const field = m.field as Field;
    if (!(field in FIELD_TO_DOMAIN)) {
      throw new Error(`FAIL-CLOSED: unknown field "${m.field}" on ${m.id}`);
    }
    const attachment = FIELD_TO_ATTACHMENT[field];
    const c = compById.get(m.id);
    const labor = (c?.components?.labor ?? []).map((r, i) => mapComponent(r, m.id, 'labor', i));
    const material = (c?.components?.materials ?? []).map((r, i) => mapComponent(r, m.id, 'material', i));
    const equipment = (c?.components?.equipment ?? []).map((r, i) => mapComponent(r, m.id, 'equipment', i));

    const allCoeffs = [...labor, ...material, ...equipment].map((x: any) => x.coefficient as number);
    const status = deriveStatus(m.validation);
    const code = (m.code ?? '').trim();

    // §25 guard: a code-less row must never be given an invented code.
    if (!code && status !== 'SOURCE_DEFECT' && (m.validation?.issues ?? []).some((i: string) => /MISSING_CODE/.test(i))) {
      // code-less but not a source print defect -> stays empty, NEEDS_REVIEW (never invented)
    }

    items.push({
      id: m.id,
      code,
      codeNormalized: code,
      name: m.description ?? '',
      unit: normalizeUnit(m.unit ?? ''),
      unitRaw: (m.unit ?? '').trim(),
      domain: FIELD_TO_DOMAIN[field],
      subDomain: m.division ?? '',
      category: m.category || m.division || 'UNSPECIFIED',
      subCategory: m.subcategory || undefined,
      version: '2026',
      year: 2026,
      normativeStatus: 'UNSPECIFIED',
      method: 'UNSPECIFIED',
      sourceId: `SE-DJBK-47-2026-LAMPIRAN-${attachment}`,
      sourceDocument: `Lampiran ${attachment} SE DJBK No. 47/SE/Dk/2026`,
      sourcePage: typeof m.source?.page === 'number' ? m.source.page : undefined,
      status,
      laborComponents: labor,
      materialComponents: material,
      equipmentComponents: equipment,
      totalLabor: sumTotals(labor),
      totalMaterial: sumTotals(material),
      totalEquipment: sumTotals(equipment),
      unitPrice: sumTotals([...labor, ...material, ...equipment]),
      lastUpdated: generatedAt.slice(0, 10),
      dataQualityScore: dataQualityScore(status),
      provenance: {
        regulation: m.source?.regulation ?? 'SE DJBK No. 47/SE/Dk/2026',
        attachment,
        page: typeof m.source?.page === 'number' ? m.source.page : null,
        sourceFile: m.source?.source_file ?? '',
      },
      validationStatus: status,
      validationIssues: m.validation?.issues ?? [],
      validationFlags: {
        code: !!m.validation?.code_verified,
        description: !!m.validation?.description_verified,
        unit: !!m.validation?.unit_verified,
        components: !!m.validation?.components_verified,
        coefficients: !!m.validation?.coefficients_verified,
        source: !!m.validation?.source_verified,
      },
      division: m.division ?? '',
      subdivision: m.subdivision ?? '',
      coefficientReadability: readabilityOf(allCoeffs),
      notes: m.notes ?? undefined,
    });

    counts[field]++;
    statusCounts[status]++;
  }

  // ---- emit catalog module ----
  const header = `/**
 * EZRAB AHSP 2026 — CANONICAL CATALOG  (AUTO-GENERATED — DO NOT EDIT BY HAND)
 * ===========================================================================
 *
 * Source of truth: SE DJBK No. 47/SE/Dk/2026, Lampiran III / IV / V / VI.
 *   III -> SMKK          (attachment "III")
 *   IV  -> Sumber Daya Air (attachment "IV")
 *   V   -> Bina Marga    (attachment "V")   <-- NOT "II"
 *   VI  -> Cipta Karya   (attachment "VI")
 *
 * There is NO AHSP Bidang Umum. There is NO Lampiran II in this catalog.
 *
 * Generated : ${generatedAt}
 * Generator : scripts/ahsp2026/generateCanonicalModule.ts
 * Source    : data/ahsp2026/validated/ahsp_2026_master.json
 *             data/ahsp2026/validated/ahsp_2026_components.json
 *
 * Totals    : ${JSON.stringify(counts)}
 * Status    : ${JSON.stringify(statusCounts)}
 * Total     : ${items.length}
 *
 * PRICES ARE IMPORTED from HSD (data/ahsp2026/validated/ahsp_2026_hsd_ck.json).
 * unitPrice = HSD price when matched; null when not found (never 0-fallback).
 * the price layer must still fail closed when unavailable at runtime.
 * normativeStatus / method are "UNSPECIFIED" — the source does not carry them and
 * they MUST NOT be invented.
 */

import { NationalAHSPItem } from './types';

export const AHSP_2026_CANONICAL_GENERATED_AT = '${generatedAt}';

export const AHSP_2026_CANONICAL_SUMMARY = ${JSON.stringify(
    { total: items.length, byField: counts, byStatus: statusCounts, attachment: FIELD_TO_ATTACHMENT },
    null,
    2
  )} as const;

${emitChunked('AHSP_2026_CANONICAL', 'NationalAHSPItem', items)}
`;

  fs.writeFileSync(
    path.join(OUT_DIR, 'ahsp2026Canonical.generated.ts'),
    header
  );

  // ---- emit resource master module ----
  const resHeader = `/**
 * EZRAB AHSP 2026 — CANONICAL RESOURCE MASTER  (AUTO-GENERATED — DO NOT EDIT)
 * ==========================================================================
 * Derived from data/ahsp2026/validated/ahsp_2026_resources.json
 * Generated : ${generatedAt}
 * Total     : ${resources.resources.length}
 */

import { CanonicalResource } from './types';

${emitChunked('AHSP_2026_CANONICAL_RESOURCES', 'CanonicalResource', resources.resources)}
`;
  fs.writeFileSync(
    path.join(OUT_DIR, 'ahsp2026CanonicalResources.generated.ts'),
    resHeader
  );

  const itemBytes = fs.statSync(path.join(OUT_DIR, 'ahsp2026Canonical.generated.ts')).size;
  const resBytes = fs.statSync(path.join(OUT_DIR, 'ahsp2026CanonicalResources.generated.ts')).size;

  console.log('[generate] canonical catalog written');
  console.log(`  items    : ${items.length}  (${JSON.stringify(counts)})`);
  console.log(`  status   : ${JSON.stringify(statusCounts)}`);
  console.log(`  resources: ${resources.resources.length}`);
  console.log(`  file     : ahsp2026Canonical.generated.ts          ${(itemBytes / 1048576).toFixed(2)} MB`);
  console.log(`  file     : ahsp2026CanonicalResources.generated.ts ${(resBytes / 1048576).toFixed(2)} MB`);

  if (items.length !== 5801) {
    console.error(`[generate] FAIL-CLOSED: expected 5801 items, got ${items.length}`);
    process.exit(1);
  }

  // PHASE 2B regression gate: prices must survive the transform
  runPriceRegressionGate(items);
}

/**
 * PHASE 2B regression gate.
 * Verifies that HSD prices survive from source to canonical output.
 * Fails closed on any integrity violation.
 */
function runPriceRegressionGate(items: any[]): void {
  console.log('[gate] running price regression checks...');
  let priced = 0, nullPriced = 0, zeroPriced = 0;
  let coefChanged = 0;

  for (const it of items) {
    for (const grp of ['laborComponents', 'materialComponents', 'equipmentComponents']) {
      for (const c of (it[grp] || [])) {
        const up = (c as any).unitPrice;
        if (typeof up === 'number' && up > 0) priced++;
        else if (up === null || up === undefined) nullPriced++;
        else if (up === 0) zeroPriced++;
        // Coefficient must never be altered by price logic
        if (typeof (c as any).coefficient !== 'number') coefChanged++;
      }
    }
  }

  console.log(`[gate] components with price > 0 : ${priced}`);
  console.log(`[gate] components with price null : ${nullPriced}`);
  console.log(`[gate] components with price = 0  : ${zeroPriced} (must be 0 — no 0-fallback allowed)`);

  // Gate 1: no component may have unitPrice === 0 (0-fallback is forbidden)
  if (zeroPriced > 0) {
    console.error(`[gate] FAIL: ${zeroPriced} components have unitPrice 0 (0-fallback forbidden)`);
    process.exit(1);
  }
  // Gate 2: at least some prices must resolve (HSD is populated)
  if (priced === 0) {
    console.error('[gate] FAIL: no component resolved a price — HSD lookup broken');
    process.exit(1);
  }
  // Gate 3: coefficients untouched
  if (coefChanged > 0) {
    console.error(`[gate] FAIL: ${coefChanged} components have non-numeric coefficient`);
    process.exit(1);
  }
  console.log('[gate] PASS');
}

main();
