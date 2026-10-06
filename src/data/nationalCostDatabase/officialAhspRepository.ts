/**
 * OfficialAhspRepository — THE single authoritative AHSP source for EZRAB.
 * =======================================================================
 *
 * SOURCE OF TRUTH: `ALL_OFFICIAL_AHSP_ITEMS` (masterRegistry → AHSP_2026_CANONICAL
 * + OFFICIAL_SMKK_2026_ITEMS). This module does NOT copy or re-derive that dataset;
 * it is a thin, indexed access layer over the one array.
 *
 * WHY THIS EXISTS
 * ---------------
 * EZRAB previously had two AHSP reads:
 *   - the MATCHER used `getAHSPDatabase()` (legacy view, localStorage-overlaid), and
 *   - the VALIDATOR/PRICE used `ALL_OFFICIAL_AHSP_ITEMS` (canonical).
 * Those two could disagree, so a match could be produced that the validator then
 * rejected — e.g. "Pondasi Batu Kali" → `A.3.2.1.2`, a 2022 code that does NOT
 * exist in the 2026 catalog.
 *
 * THE INVARIANT THIS MODULE ENFORCES (§14):
 *
 *     MATCHED  =>  OFFICIAL_CATALOG_CONTAINS(selectedAhspId)
 *
 * If a code is not in `ALL_OFFICIAL_AHSP_ITEMS`, it can never be reported as a
 * MATCH. There is no legacy fallback, no synthetic code, no localStorage overlay.
 */

import { NationalAHSPItem } from './types';
import { ALL_OFFICIAL_AHSP_ITEMS } from './masterRegistry';

/** Normalise a code for comparison (official codes mix "." and "()" and "a/b" suffixes). */
function normCode(code: unknown): string {
  return String(code ?? '').toLowerCase().trim();
}

class OfficialAhspRepositoryImpl {
  private readonly items: NationalAHSPItem[];
  /** code.toLowerCase() → item */
  private readonly byCode: Map<string, NationalAHSPItem>;

  constructor() {
    // Single backing store — the canonical array itself, never duplicated.
    this.items = ALL_OFFICIAL_AHSP_ITEMS;
    this.byCode = new Map();
    for (const it of this.items) {
      const key = normCode(it.code);
      if (key && !this.byCode.has(key)) this.byCode.set(key, it);
    }
  }

  /** Every official item. Treat as read-only. */
  public getAllOfficialAhsp(): readonly NationalAHSPItem[] {
    return this.items;
  }

  /** Exact code lookup. Returns undefined when the code is absent from the official catalog. */
  public getOfficialAhsp(code: string): NationalAHSPItem | undefined {
    if (!code) return undefined;
    return this.byCode.get(normCode(code));
  }

  /**
   * THE GATE (§14). True iff `code` exists in the official catalog.
   * Every MATCHED result in the matcher must satisfy this.
   */
  public hasOfficialAhsp(code: string): boolean {
    if (!code) return false;
    return this.byCode.has(normCode(code));
  }

  /** Official item count (diagnostics / assertions). */
  public get size(): number {
    return this.items.length;
  }

  /**
   * Text search over the official catalog ONLY (§4, §6). Returns ranked candidates;
   * never auto-selects. Callers must apply their own spec/unit guards and review.
   */
  public searchOfficialAhsp(
    query: string,
    opts: { limit?: number; domain?: string; unit?: string; preferBuildingDomain?: boolean } = {}
  ): Array<{ item: NationalAHSPItem; score: number }> {
    const q = String(query ?? '').toLowerCase().trim();
    if (!q) return [];
    const words = q.split(/\s+/).filter((w) => w.length > 2);
    const limit = opts.limit ?? 10;
    const isDemolitionQuery = /bongkar|pembongkaran|bongkaran/.test(q);
    const preferBuilding = opts.preferBuildingDomain !== false;

    const scored: Array<{ item: NationalAHSPItem; score: number }> = [];
    for (const it of this.items) {
      if (opts.domain && it.domain !== opts.domain) continue;
      const title = String((it as any).title || it.name || '').toLowerCase();
      const isDemolitionItem = /bongkaran|pembongkaran|dibongkar|bongkar\b/.test(title);
      if (isDemolitionItem && !isDemolitionQuery) continue; // Never propose demolition for new work

      const itemUnit = String(it.unit || '').toLowerCase();
      const hay = `${normCode(it.code)} ${title} ${itemUnit} ${String((it as any).category || '').toLowerCase()}`;
      let score = 0;
      if (title === q) score += 100;
      for (const w of words) {
        if (hay.includes(w)) score += 10;
      }
      // Whole-query substring is a strong signal.
      if (title.includes(q)) score += 40;

      if (score > 0) {
        // Prioritize building domain (CIPTA_KARYA) for residential & building projects
        if (preferBuilding && it.domain === 'CIPTA_KARYA') {
          score += 25;
        }

        // Unit compatibility check if unit specified
        if (opts.unit) {
          const reqUnit = opts.unit.toLowerCase().replace(/[\^²³']/g, (m) => (m === '²' ? '2' : m === '³' ? '3' : "'"));
          const candUnit = itemUnit.replace(/[\^²³']/g, (m) => (m === '²' ? '2' : m === '³' ? '3' : "'"));
          if (reqUnit === candUnit) {
            score += 30; // Direct unit match
          } else if (
            (reqUnit.startsWith('m2') && !candUnit.startsWith('m2')) ||
            (reqUnit.startsWith('m3') && !candUnit.startsWith('m3')) ||
            (reqUnit.startsWith('kg') && !candUnit.startsWith('kg'))
          ) {
            score -= 40; // Severe penalty for incompatible dimensional unit
          }
        }

        if (score > 0) scored.push({ item: it, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }
}

export const officialAhspRepository = new OfficialAhspRepositoryImpl();
export type OfficialAhspRepository = OfficialAhspRepositoryImpl;

/**
 * Backwards-compatible re-export of the canonical array, so consumers that imported
 * `ALL_OFFICIAL_AHSP_ITEMS` from here get the exact same (single) dataset.
 */
export { ALL_OFFICIAL_AHSP_ITEMS };
