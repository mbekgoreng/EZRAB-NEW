import { MASTER_AHSP_DATABASE } from '../../src/data/indonesianAHSP';
import { AHSPItem } from '../../src/types';

export interface AhspSearchQuery {
  query?: string;
  category?: string;
  limit?: number;
}

export class AhspDataService {
  /**
   * Search master AHSP database with query and optional category filter
   */
  public searchAhsp(params: AhspSearchQuery): { total: number; items: AHSPItem[] } {
    const { query = '', category = '', limit = 10 } = params;
    const qLower = query.toLowerCase().trim();
    const catLower = category.toLowerCase().trim();

    let matches = MASTER_AHSP_DATABASE.filter(item => {
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
      items: matches.slice(0, Math.min(limit, 50))
    };
  }

  /**
   * Get specific AHSP item detail with exact breakdown of labor, material, equipment
   */
  public getAhspDetail(idOrCode: string): AHSPItem | null {
    const target = idOrCode.toLowerCase().trim();
    const found = MASTER_AHSP_DATABASE.find(
      item => item.id.toLowerCase() === target || item.code.toLowerCase() === target
    );
    return found || null;
  }

  /**
   * List all AHSP categories available
   */
  public listCategories(): string[] {
    const categories = new Set<string>();
    for (const item of MASTER_AHSP_DATABASE) {
      if (item.category) categories.add(item.category);
    }
    return Array.from(categories);
  }
}

export const ahspDataService = new AhspDataService();
