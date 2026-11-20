import {
  NationalAHSPItem,
  AHSPDomain,
  AHSPVersionDiff,
  AHSPProjectSnapshot,
  AHSPSourceMetadata,
  AHSP_DATABASE_VERSION,
} from './types';
import {
  MASTER_PRICE_VERSION,
  DEFAULT_SNAPSHOT_PRICING_MODE,
} from '../priceDatabase2026/types';
import { OFFICIAL_AHSP_SOURCES } from './sources';
import { AHSP_2026_CANONICAL } from './ahsp2026Canonical.generated';
import { BINA_MARGA_2026_MASTER } from './binaMarga2026Master.generated';
import { OFFICIAL_SMKK_2026_ITEMS } from './officialSmkk2026';
import { resolveBinaMargaUnit } from './binaMargaUnitResolution';
import { compareAhspSnapshots } from './ahspVersioning';
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
 *
 * COUNT RECONCILIATION (Phase B, 2026-11-20 — verified by direct count,
 * see scripts/ahsp2026/assertPurge.ts §20/§21). Three figures circulate;
 * all three are correct for DIFFERENT sets — do not "fix" one to match
 * another:
 * - 5,801 = the CANONICAL module (AHSP_2026_CANONICAL): SMKK 223 +
 *   SDA 1,556 + Bina Marga parenthesized codes 1,163 + Cipta Karya 2,859.
 * - 5,742 = THIS registry (ALL_OFFICIAL_AHSP_ITEMS), the runtime catalog
 *   the resolver, AI and UI read: 5,801 − SMKK 223 − BM 1,163
 *   + BM letter-code master 1,137 + official SMKK 190
 *   (CK 2,859 + SDA 1,556 + BM 1,137 + SMKK 190). The version pointer
 *   (ahspVersionPointer.generated.ts) counts THIS set per family.
 * - 5,725 = ACTIVE items: 5,742 minus the 17 quarantined records
 *   (ahspQuarantine.ts; CK 2,849 + BM 1,130 + SDA 1,556 + SMKK 190).
 *   Public pages pin this figure (src/data/ahspPublicCounts.ts).
 * The AHSPRepository count is 5,741 = 5,742 minus the 1 code-less
 * record (SDA-000810; the other code-less canonical record, BM-000007,
 * is substituted out with the parenthesized BM set).
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
 * Bina Marga 2026 Master migration (2026-10-12):
 * Replace the old Bina Marga slice from AHSP_2026_CANONICAL with the new
 * MASTER_AHSP_BINA_MARGA_2026 (1137 items, PDF-verified).
 * Old Bina Marga data is preserved in ahsp2026Canonical.generated.ts (backup).
 */
const canonicalWithoutOldBinaMarga = canonicalNonSmkk.filter(
  (item) => item.domain !== 'BINA_MARGA'
);

/**
 * Combine all official datasets.
 */
/**
 * Map BinaMarga2026Item to NationalAHSPItem shape.
 */
function mapBinaMargaToNational(item: import('./binaMarga2026Master.generated').BinaMarga2026Item): NationalAHSPItem {
  const mapComp = (c: import('./binaMarga2026Master.generated').BinaMarga2026Component) => ({
    code: c.resourceCode,
    name: c.description,
    unit: c.unit,
    coefficient: c.coefficient,
    unitPrice: c.unitPrice,
    amount: c.amount,
  });
  return {
    id: `BM2026-${item.code}`,
    code: item.code,
    codeNormalized: item.codeNormalized,
    standardCode: item.standardCode,
    name: item.name,
    // D-55 narrowing (2026-11-14): `unit` KEMBALI ke nilai mentah master
    // (semantik pra-G2). G2 menimpa `unit` dengan satuan hasil-resolver
    // di lapisan pemetaan bersama — bocor ke resolusi harga: G.166
    // "Meter Panjang" menjadi "m'" lalu ter-resolve OFFICIAL_AHSP
    // (s2 173/186 + costPolicyEngine 5/6; bukti biseksi laporan 08
    // §8.3). Satuan TAMPIL yang sudah diperbaiki tinggal di
    // `unitDisplay` — dibaca HANYA oleh lapisan tampilan (kartu/dialog
    // AHSP Explorer); TIDAK ADA jalur resolusi harga yang membacanya.
    // unitRaw mempertahankan nilai mentah (sudah ada sejak G2).
    unit: item.unit,
    unitDisplay: resolveBinaMargaUnit(item.unit, item.standardCode),
    unitRaw: item.unit,
    domain: 'BINA_MARGA' as const,
    category: 'BINA_MARGA',
    version: '2026',
    year: 2026,
    normativeStatus: 'Normatif' as const,
    method: 'Manual' as const,
    sourceId: 'BM-2026-AUDITED',
    sourceDocument: 'MASTER_AHSP_BINA_MARGA_2026_AUDITED',
    sourcePage: item.sourcePdfPage ?? undefined,
    status: item.validationStatus === 'VERIFIED' ? 'VERIFIED' as const : 'REVIEW' as const,
    laborComponents: item.laborComponents.map(mapComp),
    materialComponents: item.materialComponents.map(mapComp),
    equipmentComponents: item.equipmentComponents.map(mapComp),
    totalLabor: null,
    totalMaterial: null,
    totalEquipment: null,
    unitPrice: item.unitPrice,
    lastUpdated: '2026-10-12',
    dataQualityScore: item.validationStatus === 'VERIFIED' ? 95 : 50,
  } as unknown as NationalAHSPItem;
}

export const ALL_OFFICIAL_AHSP_ITEMS: NationalAHSPItem[] = [
  ...canonicalWithoutOldBinaMarga,
  ...BINA_MARGA_2026_MASTER.map(mapBinaMargaToNational),
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
   * 
   * NOTE: If multiple items share the same code (e.g. SDA variants),
   * this returns the first match. Use findAllByCode() to detect ambiguity.
   */
  public findByCode(code: string): NationalAHSPItem | undefined {
    const clean = code.trim().toLowerCase();
    return this.getAllItems().find(
      itm => itm.codeNormalized.toLowerCase() === clean || itm.code.toLowerCase() === clean
    );
  }

  /**
   * Find ALL items matching a code.
   * Use this to detect ambiguous codes (multiple variants sharing one code).
   * Returns empty array if no match.
   */
  public findAllByCode(code: string): NationalAHSPItem[] {
    const clean = code.trim().toLowerCase();
    return this.getAllItems().filter(
      itm => itm.codeNormalized.toLowerCase() === clean || itm.code.toLowerCase() === clean
    );
  }

  /**
   * Check if a code is ambiguous (matches multiple items).
   */
  public isCodeAmbiguous(code: string): boolean {
    return this.findAllByCode(code).length > 1;
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
   * Compare two AHSP database versions for one family — a REAL diff
   * (Master Pricing §8 (b), replacing the pre-§8 stub).
   *
   * The pre-§8 stub reported only the target version's codes as
   * `addedCodes` with `removedCodes: []` and `revisedCodes: []`
   * permanently empty (there was no verified baseline to diff
   * against). It had NO callers (verified 2026-11-16), so its
   * signature is replaced: callers pass the two item sets explicitly
   * (version snapshots, or the live catalog), and the diff reports
   * added / removed / revised codes + per-item field-level diffs
   * (name, unit, baked price, coefficients, component codes/units,
   * added/removed components) + a deterministic count summary.
   *
   * Items match by stable id; components match by stable id when both
   * sides carry one, else by position within the array. The diff is
   * deterministic: identical inputs produce identical output regardless
   * of input order. See `compareAhspSnapshots` in ahspVersioning.ts.
   */
  public compareVersions(
    domain: AHSPDomain,
    source: { versionId: string; items: readonly NationalAHSPItem[] },
    target: { versionId: string; items: readonly NationalAHSPItem[] },
  ): AHSPVersionDiff {
    return compareAhspSnapshots(source, target, domain);
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
      // MASTER PRICING §3 (I-11): stamp the source versions this snapshot
      // was frozen against. A snapshot freezes VALUES, so its pricing mode
      // is inherently SNAPSHOT_PRICE (Decision D) — model only; §10
      // behaviour (adoption, mode switching) is not implemented here.
      ahspDatabaseVersion: AHSP_DATABASE_VERSION,
      masterPriceVersion: MASTER_PRICE_VERSION,
      pricingMode: DEFAULT_SNAPSHOT_PRICING_MODE,
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
