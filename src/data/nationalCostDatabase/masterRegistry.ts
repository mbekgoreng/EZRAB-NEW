import {
  NationalAHSPItem,
  AHSPDomain,
  AHSPVersionDiff,
  AHSPProjectSnapshot,
  AHSPSourceMetadata
} from './types';
import { OFFICIAL_AHSP_SOURCES } from './sources';
import { AHSP_2026_CANONICAL } from './ahsp2026Canonical.generated';
import { OFFICIAL_SMKK_2026_ITEMS } from './officialSmkk2026';
import { AHSPItem } from '../../types';

/**
 * EZRAB AHSP MASTER REGISTRY
 * ==========================
 *
 * SINGLE CHOKE POINT for the national AHSP catalog.
 *
 * Sourced from SE DJBK No. 47/SE/Dk/2026:
 * - Lampiran III: Biaya Penerapan SMKK (Official 190 Items with full coefficient calculations)
 * - Lampiran IV: Sumber Daya Air (SDA)
 * - Lampiran V: Bina Marga
 * - Lampiran VI: Cipta Karya
 */

/** Current custom-AHSP storage key (bumped for the 2026 canonical catalog). */
const STORAGE_KEY_CUSTOM_AHSP = 'yfarch_custom_ahsp_v2027';
/** Pre-purge keys quarantined on first load. */
const LEGACY_STORAGE_KEYS = ['yfarch_custom_ahsp_v2026'];
/** Where the pre-purge custom payload is preserved before quarantine. */
const STORAGE_KEY_LEGACY_BACKUP = 'yfarch_custom_ahsp_legacy_backup';

/**
 * Filter out legacy raw SMKK items and use verified official 190 SMKK items with coefficients
 */
const canonicalNonSmkk = AHSP_2026_CANONICAL.filter((item) => item.domain !== 'SMKK');

/**
 * Combine all official datasets.
 */
export const ALL_OFFICIAL_AHSP_ITEMS: NationalAHSPItem[] = [
  ...canonicalNonSmkk,
  ...OFFICIAL_SMKK_2026_ITEMS,
];

/** True when a custom record came from a purged/legacy source and must not survive. */
function isPurgedLegacyCustom(item: any): boolean {
  if (!item) return true;
  if (item.domain === 'UMUM') return true;
  const src = String(item.sourceDocument || '');
  if (/Lampiran\s*II\b/i.test(src)) return true;
  return false;
}

class NationalConstructionCostDatabaseEngine {
  private customItems: NationalAHSPItem[] = [];

  constructor() {
    this.loadCustomItems();
  }

  /**
   * Load custom items, performing the one-time legacy quarantine:
   *   1. preserve the old payload under a backup key,
   *   2. drop records sourced from the purged legacy catalog (UMUM / Lampiran II),
   *   3. write the surviving records to the new key.
   */
  private loadCustomItems() {
    try {
      if (typeof localStorage === 'undefined') return;

      const current = localStorage.getItem(STORAGE_KEY_CUSTOM_AHSP);
      if (current) {
        this.customItems = JSON.parse(current);
        return;
      }

      for (const legacyKey of LEGACY_STORAGE_KEYS) {
        const raw = localStorage.getItem(legacyKey);
        if (!raw) continue;

        // 1. preserve
        try {
          localStorage.setItem(STORAGE_KEY_LEGACY_BACKUP, raw);
        } catch { /* storage full — continue, quarantine is best-effort */ }

        // 2. filter
        let parsed: any[] = [];
        try { parsed = JSON.parse(raw); } catch { parsed = []; }
        const kept = (Array.isArray(parsed) ? parsed : []).filter((i) => !isPurgedLegacyCustom(i));

        // 3. migrate
        this.customItems = kept;
        this.persistCustomItems();
        localStorage.removeItem(legacyKey);
        break;
      }
    } catch {
      this.customItems = [];
    }
  }

  private persistCustomItems() {
    try {
      localStorage.setItem(STORAGE_KEY_CUSTOM_AHSP, JSON.stringify(this.customItems));
    } catch (e) {
      console.warn('Failed to persist custom AHSP items', e);
    }
  }

  /**
   * Get all AHSP items (Official + Custom)
   */
  public getAllItems(): NationalAHSPItem[] {
    return [...ALL_OFFICIAL_AHSP_ITEMS, ...this.customItems];
  }

  /**
   * Search and Autocomplete Engine with Exact Match Prioritization
   */
  public searchAHSP(
    query: string,
    filterDomain: AHSPDomain | 'ALL' = 'ALL',
    filterCategory: string = 'ALL',
    filterVersion: string = 'ALL'
  ): { item: NationalAHSPItem; matchScore: number; matchType: 'EXACT_CODE' | 'PREFIX_CODE' | 'KEYWORD' }[] {
    const qClean = query.trim().toLowerCase();
    const all = this.getAllItems();

    const filtered = all.filter(itm => {
      if (filterDomain !== 'ALL' && itm.domain !== filterDomain) return false;
      if (filterCategory !== 'ALL' && itm.category !== filterCategory) return false;
      if (filterVersion !== 'ALL' && itm.version !== filterVersion) return false;
      return true;
    });

    if (!qClean) {
      return filtered.map(item => ({ item, matchScore: 100, matchType: 'KEYWORD' }));
    }

    const results: { item: NationalAHSPItem; matchScore: number; matchType: 'EXACT_CODE' | 'PREFIX_CODE' | 'KEYWORD' }[] = [];

    for (const item of filtered) {
      const codeClean = (item.codeNormalized || '').toLowerCase();
      const nameClean = item.name.toLowerCase();
      const catClean = item.category.toLowerCase();

      // 1. Exact code match
      if (codeClean === qClean) {
        results.push({ item, matchScore: 1000, matchType: 'EXACT_CODE' });
      }
      // 2. Prefix code match (e.g. user typed "A.1.02")
      else if (codeClean.startsWith(qClean)) {
        results.push({ item, matchScore: 500 + (100 - codeClean.length), matchType: 'PREFIX_CODE' });
      }
      // 3. Name contains query
      else if (nameClean.includes(qClean)) {
        const isStartOfWord = nameClean.includes(` ${qClean}`) || nameClean.startsWith(qClean);
        const score = isStartOfWord ? 200 : 100;
        results.push({ item, matchScore: score, matchType: 'KEYWORD' });
      }
      // 4. Category contains query
      else if (catClean.includes(qClean)) {
        results.push({ item, matchScore: 50, matchType: 'KEYWORD' });
      }
    }

    // Sort descending by score
    return results.sort((a, b) => b.matchScore - a.matchScore);
  }

  /**
   * Find item by exact code
   */
  public findByCode(code: string): NationalAHSPItem | undefined {
    const clean = code.trim().toLowerCase();
    return this.getAllItems().find(
      itm => itm.codeNormalized.toLowerCase() === clean || itm.code.toLowerCase() === clean
    );
  }

  /**
   * Find item by ID
   */
  public findById(id: string): NationalAHSPItem | undefined {
    return this.getAllItems().find(itm => itm.id === id);
  }

  /**
   * Register or add a verified/custom AHSP item
   */
  public addCustomAHSP(item: Omit<NationalAHSPItem, 'id'>): { success: boolean; error?: string; item?: NationalAHSPItem } {
    // Unique check by code + version
    const existing = this.getAllItems().find(
      i => i.codeNormalized.toLowerCase() === item.codeNormalized.toLowerCase() && i.version === item.version
    );

    if (existing) {
      return { success: false, error: `Kode AHSP [${item.code}] versi ${item.version} sudah terdaftar dalam sistem.` };
    }

    const newItem: NationalAHSPItem = {
      ...item,
      id: `AHSP-CUST-${Date.now()}`,
      status: item.status || 'ACTIVE',
      lastUpdated: new Date().toISOString().substring(0, 10),
      dataQualityScore: item.dataQualityScore || 90,
    };

    this.customItems.unshift(newItem);
    this.persistCustomItems();
    return { success: true, item: newItem };
  }

  /**
   * Compare two AHSP versions (e.g. 2025 vs 2026) for audit & update assistance.
   *
   * §13 / §26 — NO INVENTION: the canonical 2026 catalog is price-free and there
   * is no verified 2025 baseline in the repository. This helper therefore reports
   * only what is actually known: the codes present in the requested target
   * version. It does NOT invent removed codes, and does NOT synthesise an
   * `oldPrice` by scaling a price that does not exist.
   */
  public compareVersions(domain: AHSPDomain, sourceVersion: string = '2025', targetVersion: string = '2026'): AHSPVersionDiff {
    const targetItems = this.getAllItems().filter(i => i.domain === domain && i.version === targetVersion);

    return {
      sourceVersion,
      targetVersion,
      domain,
      addedCodes: targetItems,
      removedCodes: [],
      revisedCodes: [],
    };
  }

  /**
   * Create an immutable snapshot for a project RAB item
   */
  public createProjectSnapshot(item: NationalAHSPItem): AHSPProjectSnapshot {
    return {
      ahspId: item.id,
      code: item.code,
      version: item.version,
      sourceDocument: item.sourceDocument,
      name: item.name,
      unit: item.unit,
      laborComponents: JSON.parse(JSON.stringify(item.laborComponents)),
      materialComponents: JSON.parse(JSON.stringify(item.materialComponents)),
      equipmentComponents: JSON.parse(JSON.stringify(item.equipmentComponents)),
      unitPrice: item.unitPrice,
      snapshotTimestamp: new Date().toISOString(),
    };
  }

  /**
   * Convert NationalAHSPItem to legacy AHSPItem for backward compatibility
   */
  public toLegacyAHSPItem(item: NationalAHSPItem): AHSPItem {
    return {
      id: item.id,
      code: item.code,
      name: item.name,
      category: item.category,
      unit: item.unit,
      regulationSource: item.sourceDocument,
      laborComponents: item.laborComponents,
      materialComponents: item.materialComponents,
      equipmentComponents: item.equipmentComponents,
      totalLabor: item.totalLabor,
      totalMaterial: item.totalMaterial,
      totalEquipment: item.totalEquipment,
      unitPrice: item.unitPrice,
      lastUpdated: item.lastUpdated,
      isCustom: item.normativeStatus === 'Custom',
    };
  }
}

export const CostDatabaseEngine = new NationalConstructionCostDatabaseEngine();
