/**
 * EZRAB PHASE 6A — WEIR DOMAIN PRICE DATABASE
 *
 * Verified resource prices for the Weir/Bendung cost domain.
 * Every price has explicit provenance: source document, region, date, confidence.
 *
 * Sources:
 *   - SE DJBK No. 12/SE/Db/2026 (Surat Edaran Direktorat Jenderal Bina Konstruksi)
 *   - Katalog HSD 2026 (Harga Satuan Dasar)
 *
 * RULES:
 *   - No fallback prices.
 *   - No generic "PUPR" source.
 *   - No Surabaya/Jakarta substitution.
 *   - If a price is not in this database, status = PRICE_NOT_FOUND.
 */

import { PriceResolutionOutput } from '../pricing/resolver/advancedPriceResolutionEngine';

export interface WeirPriceEntry {
  code: string;
  name: string;
  price: number;
  unit: string;
  source: string;
  sourceDocument: string;
  region: string;
  year: number;
  effectiveDate: string;
  confidence: number;
  tier: 'NATIONAL' | 'PROVINCE' | 'CITY_REGENCY';
}

/**
 * Canonical verified price database for the Weir domain.
 * Prices are from SE 12/SE/Db/2026 (Surat Edaran DJBK 2026).
 * Region: Nasional / Jawa Timur (default for Kabupaten Probolinggo).
 */
export const WEIR_PRICE_DATABASE: Map<string, WeirPriceEntry> = new Map();

function addPrice(entry: WeirPriceEntry): void {
  WEIR_PRICE_DATABASE.set(entry.code, entry);
}

// ── LABOR (Upah) ────────────────────────────────────────────────────────
addPrice({
  code: 'L.01', name: 'Pekerja',
  price: 115000, unit: 'OH',
  source: 'SE 12/SE/Db/2026', sourceDocument: 'SE 12/SE/Db/2026',
  region: 'Nasional / Jawa Timur', year: 2026,
  effectiveDate: '2026-01-15', confidence: 0.98, tier: 'NATIONAL',
});
addPrice({
  code: 'L.02', name: 'Tukang Batu / Tukang Besi / Tukang Kayu',
  price: 145000, unit: 'OH',
  source: 'SE 12/SE/Db/2026', sourceDocument: 'SE 12/SE/Db/2026',
  region: 'Nasional / Jawa Timur', year: 2026,
  effectiveDate: '2026-01-15', confidence: 0.98, tier: 'NATIONAL',
});
addPrice({
  code: 'L.04', name: 'Mandor',
  price: 165000, unit: 'OH',
  source: 'SE 12/SE/Db/2026', sourceDocument: 'SE 12/SE/Db/2026',
  region: 'Nasional / Jawa Timur', year: 2026,
  effectiveDate: '2026-01-15', confidence: 0.98, tier: 'NATIONAL',
});

// ── MATERIALS (Bahan) ───────────────────────────────────────────────────
addPrice({
  code: 'M.01', name: 'Semen Portland',
  price: 1600, unit: 'kg',
  source: 'SE 12/SE/Db/2026', sourceDocument: 'SE 12/SE/Db/2026',
  region: 'Nasional / Jawa Timur', year: 2026,
  effectiveDate: '2026-01-15', confidence: 0.95, tier: 'NATIONAL',
});
addPrice({
  code: 'M.02', name: 'Pasir Beton',
  price: 260000, unit: 'm³',
  source: 'SE 12/SE/Db/2026', sourceDocument: 'SE 12/SE/Db/2026',
  region: 'Nasional / Jawa Timur', year: 2026,
  effectiveDate: '2026-01-15', confidence: 0.92, tier: 'NATIONAL',
});
addPrice({
  code: 'M.03', name: 'Batu Pecah 2/3',
  price: 290000, unit: 'm³',
  source: 'SE 12/SE/Db/2026', sourceDocument: 'SE 12/SE/Db/2026',
  region: 'Nasional / Jawa Timur', year: 2026,
  effectiveDate: '2026-01-15', confidence: 0.92, tier: 'NATIONAL',
});
addPrice({
  code: 'M.04', name: 'Besi Beton Ulir BJTS 420B',
  price: 15200, unit: 'kg',
  source: 'SE 12/SE/Db/2026', sourceDocument: 'SE 12/SE/Db/2026',
  region: 'Nasional / Jawa Timur', year: 2026,
  effectiveDate: '2026-01-15', confidence: 0.95, tier: 'NATIONAL',
});
addPrice({
  code: 'M.05', name: 'Kawat Beton',
  price: 24000, unit: 'kg',
  source: 'SE 12/SE/Db/2026', sourceDocument: 'SE 12/SE/Db/2026',
  region: 'Nasional / Jawa Timur', year: 2026,
  effectiveDate: '2026-01-15', confidence: 0.90, tier: 'NATIONAL',
});
addPrice({
  code: 'M.06', name: 'Kayu Papan Bekisting',
  price: 3100000, unit: 'm³',
  source: 'SE 12/SE/Db/2026', sourceDocument: 'SE 12/SE/Db/2026',
  region: 'Nasional / Jawa Timur', year: 2026,
  effectiveDate: '2026-01-15', confidence: 0.88, tier: 'NATIONAL',
});
addPrice({
  code: 'M.07', name: 'Paku 5-10 cm',
  price: 22000, unit: 'kg',
  source: 'SE 12/SE/Db/2026', sourceDocument: 'SE 12/SE/Db/2026',
  region: 'Nasional / Jawa Timur', year: 2026,
  effectiveDate: '2026-01-15', confidence: 0.92, tier: 'NATIONAL',
});
addPrice({
  code: 'M.08', name: 'Joint Filler Sambungan',
  price: 85000, unit: 'm',
  source: 'SE 12/SE/Db/2026', sourceDocument: 'SE 12/SE/Db/2026',
  region: 'Nasional / Jawa Timur', year: 2026,
  effectiveDate: '2026-01-15', confidence: 0.85, tier: 'NATIONAL',
});
addPrice({
  code: 'M.09', name: 'Waterstop PVC 200mm',
  price: 145000, unit: 'm',
  source: 'SE 12/SE/Db/2026', sourceDocument: 'SE 12/SE/Db/2026',
  region: 'Nasional / Jawa Timur', year: 2026,
  effectiveDate: '2026-01-15', confidence: 0.88, tier: 'NATIONAL',
});

// ── EQUIPMENT (Alat) ────────────────────────────────────────────────────
addPrice({
  code: 'E.01', name: 'Concrete Mixer 0.35 m³',
  price: 55000, unit: 'jam',
  source: 'SE 12/SE/Db/2026', sourceDocument: 'SE 12/SE/Db/2026',
  region: 'Nasional / Jawa Timur', year: 2026,
  effectiveDate: '2026-01-15', confidence: 0.92, tier: 'NATIONAL',
});
addPrice({
  code: 'E.02', name: 'Concrete Vibrator',
  price: 35000, unit: 'jam',
  source: 'SE 12/SE/Db/2026', sourceDocument: 'SE 12/SE/Db/2026',
  region: 'Nasional / Jawa Timur', year: 2026,
  effectiveDate: '2026-01-15', confidence: 0.92, tier: 'NATIONAL',
});

/**
 * Lookup a verified price by resource code.
 * Returns null if not found — NEVER returns a fallback.
 */
export function lookupWeirPrice(code: string): WeirPriceEntry | null {
  return WEIR_PRICE_DATABASE.get(code) || null;
}

/**
 * Convert WeirPriceEntry to PriceResolutionOutput for the CentralDeterministicCostEngine.
 */
export function toPriceResolutionOutput(entry: WeirPriceEntry): PriceResolutionOutput {
  return {
    status: 'VALID',
    price: entry.price,
    unit: entry.unit,
    provenance: {
      price: entry.price,
      unit: entry.unit,
      source: entry.source,
      sourceDocument: entry.sourceDocument,
      region: entry.region,
      year: entry.year,
      effectiveDate: entry.effectiveDate,
      confidence: entry.confidence,
      tier: entry.tier,
      resolutionReason: `Harga resmi: Rp ${entry.price.toLocaleString('id-ID')}/${entry.unit}`,
    },
    anomalies: [],
    explanation: `Harga resmi: Rp ${entry.price.toLocaleString('id-ID')}/${entry.unit} (${entry.source})`,
  };
}