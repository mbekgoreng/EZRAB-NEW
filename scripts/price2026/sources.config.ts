/**
 * EZRAB PRICE 2026 — SOURCE REGISTRY
 * ==================================
 *
 * PHASE 6 (source audit) + PHASE 27 (source priority).
 *
 * Every price source that already exists in the repository is registered here with
 * an explicit tier, priority and verification status. Sources are NEVER invented.
 * A source listed as `LEGACY_SUPERSEDED` is audited and recorded but EXCLUDED from
 * the active price database (rule 3: no old prices without a reason to trust them).
 */

import type { PriceSourceTier, PriceVerificationStatus } from '../../src/data/priceDatabase2026/types';

export interface PriceSourceConfig {
  key: string;
  label: string;
  /** Module the rows are read from. */
  origin: string;
  tier: PriceSourceTier;
  priority: number;
  verificationStatus: PriceVerificationStatus;
  sourceName: string;
  sourceDocument: string | null;
  sourceUrl: string | null;
  /** Source type label carried onto each row. */
  sourceType: string;
  /** true = ingested into the active price database. */
  active: boolean;
  /** Location level the source reports at. */
  locationLevel: 'NATIONAL' | 'PROVINCE' | 'REGENCY' | 'CITY';
  notes: string;
}

/**
 * Priority ladder (PHASE 27):
 *   1 official government  →  2 official project  →  3 verified regional
 *   4 user-imported verified  →  5 project internal master  →  6 commercial
 *   99 legacy (excluded)
 */
export const PRICE_SOURCES: PriceSourceConfig[] = [
  {
    key: 'HSD_2026',
    label: 'Katalog Acuan HSD 2026',
    origin: 'src/data/nationalCostDatabase/officialHSD2026.ts',
    tier: 'OFFICIAL_GOVERNMENT',
    priority: 1,
    verificationStatus: 'VERIFIED',
    sourceName: 'Katalog Acuan HSD 2026',
    sourceDocument: 'SE 12/SE/Db/2026',
    sourceUrl: null,
    sourceType: 'GOVERNMENT_REFERENCE',
    active: true,
    locationLevel: 'NATIONAL',
    notes: 'Official 2026 basic-price catalogue carried in the repository.',
  },
  {
    key: 'LABOR_2026',
    label: 'Master Upah Tenaga Kerja 2026',
    origin: 'src/domain/labor/laborDatabaseService.ts',
    tier: 'VERIFIED_REGIONAL',
    priority: 3,
    verificationStatus: 'VERIFIED',
    sourceName: 'Master Upah Tenaga Kerja 2026 (EZRAB)',
    sourceDocument: 'SE DJBK No. 12/SE/Db/2026 & Permen PUPR 1/2022',
    sourceUrl: null,
    sourceType: 'GOVERNMENT_REFERENCE',
    active: true,
    locationLevel: 'PROVINCE',
    notes:
      'Per-role labour rates. Emits BOTH OH (orang-hari) and OJ (orang-jam) rows so the ' +
      'canonical unit (OH or jam) can be matched without an implicit conversion.',
  },
  {
    key: 'EQUIPMENT_2026',
    label: 'Master Sewa Alat Berat 2026',
    origin: 'src/domain/equipment/equipmentDatabaseService.ts',
    tier: 'VERIFIED_REGIONAL',
    priority: 3,
    verificationStatus: 'VERIFIED',
    sourceName: 'Master Sewa Alat Berat 2026 (EZRAB)',
    sourceDocument: 'SE DJBK No. 12/SE/Db/2026',
    sourceUrl: null,
    sourceType: 'GOVERNMENT_REFERENCE',
    active: true,
    locationLevel: 'NATIONAL',
    notes: 'Emits both `jam` (hourly) and `hari` (daily) rows.',
  },
  {
    key: 'MATERIAL_MASTER_2026',
    label: 'Master Material & Harga 2026',
    origin: 'src/domain/material/materialDatabaseService.ts',
    tier: 'PROJECT_INTERNAL_MASTER',
    priority: 5,
    verificationStatus: 'SOURCE_REPORTED',
    sourceName: 'Master Database Material EZRAB 2026',
    sourceDocument: null,
    sourceUrl: null,
    sourceType: 'EZRAB_DATABASE',
    active: true,
    locationLevel: 'CITY',
    notes:
      'Multi-sector, multi-region material catalogue carried in the repository. ' +
      'Reports province + city, so it is the only source that can serve REGENCY/CITY queries. ' +
      'Not externally audited → SOURCE_REPORTED, never VERIFIED.',
  },
  {
    key: 'MATERIAL_LIBRARY',
    label: 'EZRAB Material Library (brand)',
    origin: 'src/services/materialLibraryService.ts',
    tier: 'COMMERCIAL_REFERENCE',
    priority: 6,
    verificationStatus: 'SOURCE_REPORTED',
    sourceName: 'EZRAB Material Library',
    sourceDocument: null,
    sourceUrl: null,
    sourceType: 'MARKET_REFERENCE',
    active: true,
    locationLevel: 'NATIONAL',
    notes: 'Branded commercial reference prices.',
  },
  {
    key: 'COMMERCIAL_2026',
    label: 'EZRAB Master Commercial Price Items',
    origin: 'src/data/indonesianPrices.ts',
    tier: 'COMMERCIAL_REFERENCE',
    priority: 6,
    verificationStatus: 'SOURCE_REPORTED',
    sourceName: 'EZRAB Master Database 2026',
    sourceDocument: null,
    sourceUrl: null,
    sourceType: 'MARKET_REFERENCE',
    active: true,
    locationLevel: 'NATIONAL',
    notes: 'Branded commercial reference prices (keramik, cat, sanitary, …).',
  },

  // ---------------------------------------------------------------------------
  // AUDITED BUT EXCLUDED
  // ---------------------------------------------------------------------------
  {
    key: 'LEGACY_PUPR_2022',
    label: 'Permen PUPR No. 1/PRT/M/2022 component prices',
    origin: 'src/data/indonesianAHSP.ts (MASTER_AHSP_DATABASE)',
    tier: 'LEGACY_SUPERSEDED',
    priority: 99,
    verificationStatus: 'NEEDS_REVIEW',
    sourceName: 'Permen PUPR No. 1/PRT/M/2022',
    sourceDocument: 'Permen PUPR No. 1/PRT/M/2022',
    sourceUrl: null,
    sourceType: 'HISTORICAL_EZRAB',
    active: false,
    locationLevel: 'NATIONAL',
    notes:
      'EXCLUDED. This is the superseded 2022 baseline that was purged from AHSP. It is ' +
      'also the source that SHADOWS the correct 2026 labour rates inside PriceRepository ' +
      '(first-wins ingestion inserts L.01 with unit `oj` before the 2026 labour master is ' +
      'read). Retained for audit only.',
  },
];

export const ACTIVE_SOURCES = PRICE_SOURCES.filter((s) => s.active);
export const EXCLUDED_SOURCES = PRICE_SOURCES.filter((s) => !s.active);
