import { ALL_OFFICIAL_AHSP_ITEMS } from '../../src/data/nationalCostDatabase/masterRegistry';
import { NationalAHSPItem } from '../../src/data/nationalCostDatabase/types';
import { CostDatabaseEngine } from '../../src/data/nationalCostDatabase/masterRegistry';
import { AHSPItem } from '../../src/types';
import { officialAhspRepository } from '../../src/data/nationalCostDatabase/officialAhspRepository';
import { isQuarantined } from '../../src/data/nationalCostDatabase/ahspQuarantine';
import { resolveCodeAlias } from '../../src/data/nationalCostDatabase/ahspCodeAliases';

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
    // Resolve alias so typo/variant codes find the canonical item.
    const qResolved = resolveCodeAlias(query.trim()).toLowerCase();

    const matches: NationalAHSPItem[] = ALL_OFFICIAL_AHSP_ITEMS.filter((item) => {
      // Quarantined items never appear in normal search results.
      if (isQuarantined(item.code)) return false;
      const matchCat = !catLower || item.category.toLowerCase().includes(catLower);
      if (!matchCat) return false;

      if (!qLower) return true;
      return (
        item.name.toLowerCase().includes(qLower) ||
        item.code.toLowerCase().includes(qLower) ||
        item.code.toLowerCase().includes(qResolved) ||
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
    // Repository resolves aliases and blocks quarantined codes.
    const byCode = officialAhspRepository.getOfficialAhsp(idOrCode);
    if (byCode) return CostDatabaseEngine.toLegacyAHSPItem(byCode);
    // Fall back to id lookup on active items only (quarantine-safe).
    const target = idOrCode.toLowerCase().trim();
    const found = officialAhspRepository
      .getActiveOfficialAhsp()
      .find((item) => item.id.toLowerCase() === target);
    return found ? CostDatabaseEngine.toLegacyAHSPItem(found) : null;
  }

  /** List all AHSP categories available in the canonical catalog. */
  public listCategories(): string[] {
    const categories = new Set<string>();
    for (const item of officialAhspRepository.getActiveOfficialAhsp()) {
      if (item.category) categories.add(item.category);
    }
    return Array.from(categories);
  }
}

export const ahspDataService = new AhspDataService();
