import { ALL_OFFICIAL_AHSP_ITEMS } from '../../src/data/nationalCostDatabase/masterRegistry';
import { NationalAHSPItem } from '../../src/data/nationalCostDatabase/types';
import { CostDatabaseEngine } from '../../src/data/nationalCostDatabase/masterRegistry';
import { AHSPItem } from '../../src/types';

/**
 * Server-side AHSP search service.
 *
 * PURGE NOTE (AHSP 2026): this service now searches the VERIFIED canonical
 * 2026 catalog (Lampiran III/IV/V/VI of SE DJBK No. 47/SE/Dk/2026).
 * It no longer searches the legacy Permen PUPR No. 1/PRT/M/2022 baseline
 * (§27 — legacy is archived, never merged into production 2026).
 */

export interface AhspSearchQuery {
  query?: string;
  category?: string;
  limit?: number;
}

export class AhspDataService {
  /** Search the canonical AHSP catalog with a query and optional category filter. */
  public searchAhsp(params: AhspSearchQuery): { total: number; items: AHSPItem[] } {
    const { query = '', category = '', limit = 10 } = params;
    const qLower = query.toLowerCase().trim();
    const catLower = category.toLowerCase().trim();

    const matches: NationalAHSPItem[] = ALL_OFFICIAL_AHSP_ITEMS.filter((item) => {
      const matchCat = !catLower || item.category.toLowerCase().includes(catLower);
      if (!matchCat) return false;

      if (!qLower) return true;
      return (
        item.name.toLowerCase().includes(qLower) ||
        item.code.toLowerCase().includes(qLower) ||
        item.category.toLowerCase().includes(qLower)
      );
    });

    const total = matches.length;
    return {
      total,
      items: matches.slice(0, Math.min(limit, 50)).map((i) => CostDatabaseEngine.toLegacyAHSPItem(i)),
    };
  }

  /** Get a specific AHSP item with its full labour/material/equipment breakdown. */
  public getAhspDetail(idOrCode: string): AHSPItem | null {
    const target = idOrCode.toLowerCase().trim();
    const found = ALL_OFFICIAL_AHSP_ITEMS.find(
      (item) => item.id.toLowerCase() === target || item.code.toLowerCase() === target
    );
    return found ? CostDatabaseEngine.toLegacyAHSPItem(found) : null;
  }

  /** List all AHSP categories available in the canonical catalog. */
  public listCategories(): string[] {
    const categories = new Set<string>();
    for (const item of ALL_OFFICIAL_AHSP_ITEMS) {
      if (item.category) categories.add(item.category);
    }
    return Array.from(categories);
  }
}

export const ahspDataService = new AhspDataService();
