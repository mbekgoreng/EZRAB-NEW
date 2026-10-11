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
import { isQuarantined, excludeQuarantined } from './ahspQuarantine';
import { resolveCodeAlias } from './ahspCodeAliases';
import { getCorrections } from './ahspDescriptionCorrections';

/**
 * Apply Phase 2E description corrections overlay to an item.
 * Returns a shallow copy with corrected name/unit/material names.
 * Prices, coefficients, and identity are NEVER touched.
 */
function applyCorrections(item: NationalAHSPItem): NationalAHSPItem {
  const corrections = getCorrections(item.code);
  if (corrections.length === 0) return item;
  const copy: NationalAHSPItem = {
    ...item,
    materialComponents: item.materialComponents.map(m => ({ ...m })),
  };
  for (const c of corrections) {
    if (c.field === 'name') copy.name = c.newValue;
    else if (c.field === 'unit') copy.unit = c.newValue;
    else if (c.field === 'materialName' && copy.materialComponents[c.materialIndex ?? 0]) {
      copy.materialComponents[c.materialIndex ?? 0] = {
        ...copy.materialComponents[c.materialIndex ?? 0],
        name: c.newValue,
      };
    }
  }
  return copy;
}

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

  /**
   * Active items only — excludes quarantined records (Phase 2E).
   * Use this for search candidates, AI matching, and UI lists.
   * getAllOfficialAhsp() remains the raw complete dataset (for audits/tests).
   */
  public getActiveOfficialAhsp(): NationalAHSPItem[] {
    // Phase 2H P2 fix: apply description corrections so bulk consumers see
    // the same corrected names as getOfficialAhsp()/searchOfficialAhsp().
    return excludeQuarantined([...this.items]).map(applyCorrections);
  }

  /**
   * Exact code lookup. Resolves aliases first (Phase 2E), then looks up.
   * Returns undefined when the code is absent from the official catalog.
   * Quarantined codes return undefined (use getQuarantineRecord for audit).
   */
  public getOfficialAhsp(code: string): NationalAHSPItem | undefined {
    if (!code) return undefined;
    const resolved = resolveCodeAlias(code);
    if (isQuarantined(resolved)) return undefined;
    const item = this.byCode.get(normCode(resolved));
    // Phase 2E: apply PDF-verified description corrections overlay.
    return item ? applyCorrections(item) : undefined;
  }

  /**
   * THE GATE (§14). True iff `code` exists in the official catalog.
   * Aliases resolve to their canonical code. Quarantined codes return false.
   * Every MATCHED result in the matcher must satisfy this.
   */
  public hasOfficialAhsp(code: string): boolean {
    if (!code) return false;
    const resolved = resolveCodeAlias(code);
    if (isQuarantined(resolved)) return false;
    return this.byCode.has(normCode(resolved));
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
    const rawQ = String(query ?? '').trim();
    if (!rawQ) return [];
    // Phase 2E: resolve alias so typo/variant codes search the canonical record.
    const resolvedQ = resolveCodeAlias(rawQ);
    const q = resolvedQ.toLowerCase();
    const words = q.split(/\s+/).filter((w) => w.length > 2);
    // Also search the raw query: if user typed an alias, match the canonical code too.
    const rawWords = rawQ.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const limit = opts.limit ?? 10;
    const isDemolitionQuery = /bongkar|pembongkaran|bongkaran/.test(q);
    const preferBuilding = opts.preferBuildingDomain !== false;

    const scored: Array<{ item: NationalAHSPItem; score: number }> = [];
    for (const it of this.items) {
      // Phase 2E: quarantined items never appear as search candidates.
      if (isQuarantined(it.code)) continue;
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
      // Also match raw query words (covers alias codes typed by user).
      for (const w of rawWords) {
        if (w !== q && hay.includes(w)) score += 5;
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

        if (score > 0) scored.push({ item: applyCorrections(it), score });
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
