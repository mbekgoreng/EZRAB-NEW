/**
 * EZRAB PRICE 2026 — PHASE 10 (unit normalization) + PHASE 11 (raw import)
 * =======================================================================
 * Reads every ACTIVE price source in the repository and emits normalized,
 * provenance-carrying price rows. No matching happens here — see
 * `matchPricesToResources.ts`.
 *
 * Hard rules:
 *   - a row with `price <= 0` is DROPPED (a source that prints 0 is not a price)
 *   - `unitRaw` is always preserved next to the normalized `unit`
 *   - every row carries source, location and period
 */

import * as fs from 'fs';
import * as path from 'path';
import { OFFICIAL_HSD_2026_ITEMS } from '../../src/data/nationalCostDatabase/officialHSD2026';import { MASTER_PRICE_ITEMS } from '../../src/data/indonesianPrices';
import { MASTER_AHSP_DATABASE } from '../../src/data/indonesianAHSP';
import { MaterialLibraryService } from '../../src/services/materialLibraryService';
import { MaterialDatabaseService } from '../../src/domain/material/materialDatabaseService';
import { LaborDatabaseService } from '../../src/domain/labor/laborDatabaseService';
import { EquipmentDatabaseService } from '../../src/domain/equipment/equipmentDatabaseService';
import { normalizeUnit, sha1Like, stableStringify } from './core';
import { PRICE_SOURCES } from './sources.config';
import type {
  ResourcePriceRecord,
  ResourceType,
  PriceLocation,
  PricePeriod,
  PriceSourceTier,
  PriceVerificationStatus,
} from '../../src/data/priceDatabase2026/types';

const SOURCE = new Map(PRICE_SOURCES.map((s) => [s.key, s]));

const RETRIEVED_AT = '2026-09-28';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function periodFromVersion(version: string | undefined, fallbackDate: string | undefined): PricePeriod {
  const v = String(version || '').trim();
  const dateStr = String(fallbackDate || '').trim();
  let year = 2026;
  let month: number | null = null;

  const ym = v.match(/(\d{4})\s*[-/]?\s*(Q([1-4])|(\d{1,2}))?/);
  if (ym) {
    year = parseInt(ym[1], 10);
    if (ym[3]) month = (parseInt(ym[3], 10) - 1) * 3 + 1;
    else if (ym[4]) month = parseInt(ym[4], 10);
  } else {
    const dm = dateStr.match(/^(\d{4})-(\d{2})/);
    if (dm) {
      year = parseInt(dm[1], 10);
      month = parseInt(dm[2], 10);
    }
  }

  const label = v || (month ? `${year}-${String(month).padStart(2, '0')}` : String(year));
  const effectiveFrom = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? dateStr
    : month
      ? `${year}-${String(month).padStart(2, '0')}-01`
      : `${year}-01-01`;

  return { year, month, label, effectiveFrom, effectiveTo: null };
}

function nationalLocation(label: string): PriceLocation {
  return { level: 'NATIONAL', provinceName: null, regencyName: null, cityName: label };
}

function provinceLocation(province: string | undefined, city?: string | undefined): PriceLocation {
  if (!province) return { level: 'NATIONAL', provinceName: null, regencyName: null, cityName: city || null };
  if (city) {
    return {
      level: 'CITY',
      provinceName: province,
      regencyName: city,
      cityName: city,
    };
  }
  return { level: 'PROVINCE', provinceName: province, regencyName: null, cityName: null };
}

function locationKey(loc: PriceLocation): string {
  return [loc.level, loc.provinceName || '', loc.regencyName || ''].join('~').replace(/\s+/g, '');
}

function makeRow(args: {
  sourceKey: string;
  resourceType: ResourceType;
  code: string;
  name: string;
  unitRaw: string;
  price: number;
  location: PriceLocation;
  period: PricePeriod;
  sourceType?: string;
  supplier?: string | null;
  verificationStatus?: PriceVerificationStatus;
  notes?: string[];
  unitConversionFactor?: number | null;
}): ResourcePriceRecord | null {
  const cfg = SOURCE.get(args.sourceKey);
  if (!cfg) throw new Error(`Unknown price source: ${args.sourceKey}`);
  if (!Number.isFinite(args.price) || args.price <= 0) return null;

  const unit = normalizeUnit(args.unitRaw);
  const loc = args.location;
  const id = `PRC-${cfg.key}-${sha1Like(
    [args.code || args.name, unit, locationKey(loc), args.period.label, args.sourceType || ''].join('|')
  )}`;

  return {
    id,
    resourceId: null,
    resourceCode: args.code || '',
    resourceName: args.name || '',
    resourceType: args.resourceType,
    unit,
    unitRaw: args.unitRaw || '',
    unitConversionFactor: args.unitConversionFactor ?? null,
    price: args.price,
    currency: 'IDR',
    location: loc,
    period: args.period,
    sourceKey: cfg.key,
    sourceTier: cfg.tier as PriceSourceTier,
    sourcePriority: cfg.priority,
    sourceName: cfg.sourceName,
    sourceType: args.sourceType || cfg.sourceType,
    sourceDocument: cfg.sourceDocument,
    sourceUrl: cfg.sourceUrl,
    supplier: args.supplier ?? null,
    retrievedAt: RETRIEVED_AT,
    verificationStatus: args.verificationStatus || cfg.verificationStatus,
    matchMethod: 'UNMATCHED',
    matchConfidence: 0,
    notes: args.notes || [],
  };
}

function categoryToType(cat: string | undefined): ResourceType {
  const c = String(cat || '').toUpperCase();
  if (c === 'LABOR') return 'labor';
  if (c === 'EQUIPMENT') return 'equipment';
  if (c === 'MATERIAL') return 'material';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// per-source readers
// ---------------------------------------------------------------------------

function readHsd(): ResourcePriceRecord[] {
  const out: ResourcePriceRecord[] = [];
  for (const item of OFFICIAL_HSD_2026_ITEMS as any[]) {
    const row = makeRow({
      sourceKey: 'HSD_2026',
      resourceType: categoryToType(item.category),
      code: String(item.code || ''),
      name: String(item.name || ''),
      unitRaw: String(item.unit || ''),
      price: Number(item.price),
      location: nationalLocation(item.location || 'Nasional'),
      period: periodFromVersion(item.periodVersion, item.lastUpdated),
      supplier: item.supplier ?? null,
      notes: item.specification ? [String(item.specification)] : [],
    });
    if (row) out.push(row);
  }
  return out;
}

function readLabor(): ResourcePriceRecord[] {
  const out: ResourcePriceRecord[] = [];
  const all = LaborDatabaseService.getInstance().getAllLabor() as any[];
  for (const l of all) {
    const period = periodFromVersion(undefined, l.effectiveDate);
    const loc = provinceLocation(l.province, l.region && l.region !== l.province ? l.region : undefined);
    const base = {
      sourceKey: 'LABOR_2026',
      resourceType: 'labor' as ResourceType,
      code: String(l.code || ''),
      name: String(l.name || ''),
      location: loc,
      period,
      supplier: null,
      notes: [
        `skillLevel=${l.skillLevel || 'n/a'}`,
        `workHoursPerDay=${l.workHoursPerDay ?? 'n/a'}`,
      ],
    };
    // Emit BOTH units so the canonical unit (OH or jam) matches without an
    // implicit conversion. OJ is per person-hour; OH is per person-day.
    const oh = makeRow({ ...base, unitRaw: 'OH', price: Number(l.basePriceOH) });
    if (oh) out.push(oh);
    const oj = makeRow({ ...base, unitRaw: 'OJ', price: Number(l.basePriceOJ) });
    if (oj) out.push(oj);
  }
  return out;
}

function readEquipment(): ResourcePriceRecord[] {
  const out: ResourcePriceRecord[] = [];
  const all = EquipmentDatabaseService.getInstance().getAllEquipment() as any[];
  for (const e of all) {
    const prov = e.provenance || {};
    const period = periodFromVersion(undefined, prov.effectiveDate);
    const loc = nationalLocation('Nasional / Acuan 2026');
    const base = {
      sourceKey: 'EQUIPMENT_2026',
      resourceType: 'equipment' as ResourceType,
      code: String(e.code || ''),
      name: String(e.name || ''),
      location: loc,
      period,
      supplier: null,
      notes: [
        `capacity=${e.capacity || 'n/a'}`,
        `fuelPerHour=${e.fuelConsumptionLiterPerHour ?? 'n/a'}`,
      ],
    };
    const hourly = makeRow({ ...base, unitRaw: 'jam', price: Number(e.rentalPricePerHour) });
    if (hourly) out.push(hourly);
    const daily = makeRow({ ...base, unitRaw: 'hari', price: Number(e.rentalPricePerDay) });
    if (daily) out.push(daily);
  }
  return out;
}

function readMaterialMaster(): ResourcePriceRecord[] {
  const out: ResourcePriceRecord[] = [];
  const db = MaterialDatabaseService.getInstance();
  const all = db.getAllMaterials() as any[];
  for (const m of all) {
    const prices = db.getPricesByMaterialId(m.id) as any[];
    if (!prices || prices.length === 0) continue;
    // One row per distinct region for this material (identity includes location).
    const seen = new Set<string>();
    for (const p of prices) {
      if (!p || !(p.price > 0)) continue;
      const region = p.region || {};
      const loc = provinceLocation(region.province, region.city);
      const key = locationKey(loc);
      if (seen.has(key)) continue;
      seen.add(key);
      const row = makeRow({
        sourceKey: 'MATERIAL_MASTER_2026',
        resourceType: 'material',
        code: String(m.materialCode || m.id || ''),
        name: String(m.name || ''),
        unitRaw: String(m.unit || ''),
        price: Number(p.price),
        location: loc,
        period: periodFromVersion(undefined, p.priceDate),
        sourceType: String(p.sourceType || 'EZRAB_DATABASE'),
        supplier: p.supplierName ?? null,
        verificationStatus: p.confidence === 'HIGH' ? 'SOURCE_REPORTED' : 'NEEDS_REVIEW',
        notes: [
          `confidence=${p.confidence || 'n/a'}`,
          `priceType=${p.priceType || 'n/a'}`,
          `tier=${p.priceTier || 'n/a'}`,
        ],
      });
      if (row) out.push(row);
    }
  }
  return out;
}

function readMaterialLibrary(): ResourcePriceRecord[] {
  const out: ResourcePriceRecord[] = [];
  const lib = MaterialLibraryService.getInstance();
  for (const m of lib.getAllMaterials() as any[]) {
    const info = lib.getMaterialPrice(m.id) as any;
    if (!info || !(info.unitPrice > 0)) continue;
    const row = makeRow({
      sourceKey: 'MATERIAL_LIBRARY',
      resourceType: 'material',
      code: String(m.id || ''),
      name: String(m.name || ''),
      unitRaw: String(m.unit || ''),
      price: Number(info.unitPrice),
      location: nationalLocation('Jabodetabek'),
      period: periodFromVersion(undefined, info.effectiveDate),
      supplier: info.supplier ?? null,
      notes: [m.brand ? `brand=${m.brand}` : ''],
    });
    if (row) out.push(row);
  }
  return out;
}

function readCommercial(): ResourcePriceRecord[] {
  const out: ResourcePriceRecord[] = [];
  for (const item of MASTER_PRICE_ITEMS as any[]) {
    const row = makeRow({
      sourceKey: 'COMMERCIAL_2026',
      resourceType: categoryToType(item.category),
      code: String(item.code || ''),
      name: String(item.name || ''),
      unitRaw: String(item.unit || ''),
      price: Number(item.price),
      location: nationalLocation(item.location || 'Jabodetabek'),
      period: periodFromVersion(item.periodVersion, item.lastUpdated),
      supplier: item.supplier ?? null,
      notes: [item.specification ? String(item.specification) : '', item.brand ? `brand=${item.brand}` : ''],
    });
    if (row) out.push(row);
  }
  return out;
}

/** Legacy 2022 baseline — AUDITED, EXCLUDED from the active database. */
function readLegacy(): ResourcePriceRecord[] {
  const out: ResourcePriceRecord[] = [];
  const seen = new Set<string>();
  for (const ahsp of MASTER_AHSP_DATABASE as any[]) {
    for (const [type, comps] of [
      ['labor', ahsp.laborComponents || []],
      ['material', ahsp.materialComponents || []],
      ['equipment', ahsp.equipmentComponents || []],
    ] as const) {
      for (const c of comps as any[]) {
        if (!c.code || !(c.unitPrice > 0)) continue;
        const key = String(c.code).toUpperCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const row = makeRow({
          sourceKey: 'LEGACY_PUPR_2022',
          resourceType: type as ResourceType,
          code: String(c.code),
          name: String(c.name || ''),
          unitRaw: String(c.unit || ''),
          price: Number(c.unitPrice),
          location: nationalLocation('Nasional / Permen PUPR 1/2022'),
          period: periodFromVersion('2022-Q1', '2022-01-01'),
          verificationStatus: 'NEEDS_REVIEW',
          notes: ['EXCLUDED SOURCE — superseded 2022 baseline'],
        });
        if (row) out.push(row);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// public
// ---------------------------------------------------------------------------

export function readAllSourceRows(): ResourcePriceRecord[] {
  const rows: ResourcePriceRecord[] = [];
  rows.push(...readHsd());
  rows.push(...readLabor());
  rows.push(...readEquipment());
  rows.push(...readMaterialMaster());
  rows.push(...readMaterialLibrary());
  rows.push(...readCommercial());
  rows.push(...readLegacy());

  // deterministic ordering
  rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // de-duplicate identical identities (keep the highest-priority source)
  const best = new Map<string, ResourcePriceRecord>();
  for (const r of rows) {
    const key = [r.sourceKey, r.resourceCode || r.resourceName, r.unit, locationKey(r.location), r.period.label].join('|');
    const prev = best.get(key);
    if (!prev || r.sourcePriority < prev.sourcePriority) best.set(key, r);
  }
  const out = [...best.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // integrity: identity must be unique
  const ids = new Set<string>();
  for (const r of out) {
    if (ids.has(r.id)) throw new Error(`DUPLICATE_PRICE_IDENTITY: ${r.id}`);
    ids.add(r.id);
  }
  return out;
}

/** Stable digest of the active row set — used for determinism assertions. */
export function activeRowDigest(rows: ResourcePriceRecord[]): string {
  const active = rows.filter((r) => SOURCE.get(r.sourceKey)?.active);
  return sha1Like(stableStringify(active.map((r) => [r.id, r.price, r.unit, r.verificationStatus])));
}

/** Written to data/price2026/normalized/price_rows.json by `npm run price:normalize`. */
export function runNormalizeCli(): void {
  const rows = readAllSourceRows();
  const active = rows.filter((r) => SOURCE.get(r.sourceKey)?.active);
  const bySource = new Map<string, number>();
  for (const r of rows) bySource.set(r.sourceKey, (bySource.get(r.sourceKey) || 0) + 1);

  const outDir = path.join(process.cwd(), 'data', 'price2026', 'normalized');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'price_rows.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totalRows: rows.length,
        activeRows: active.length,
        excludedRows: rows.length - active.length,
        digest: activeRowDigest(rows),
        bySource: Object.fromEntries([...bySource.entries()].sort()),
        rows,
      },
      null,
      2
    )
  );

  console.log('=== PHASE 10/11 — NORMALIZED PRICE ROWS ===');
  console.log('total rows    :', rows.length);
  console.log('active rows   :', active.length);
  console.log('excluded rows :', rows.length - active.length);
  for (const [k, v] of [...bySource.entries()].sort()) {
    const cfg = SOURCE.get(k)!;
    console.log(`  ${cfg.active ? 'ACTIVE ' : 'EXCLUDE'} ${k.padEnd(22)} ${String(v).padStart(6)}`);
  }
  console.log('digest        :', activeRowDigest(rows));
  console.log('Wrote: data/price2026/normalized/price_rows.json');
}

const isMain = (process.argv[1] || '').replace(/\\/g, '/').endsWith('normalizePrices.ts');
if (isMain) runNormalizeCli();
