/**
 * Priority 3 & 4: Reference / Related AHSP Provider
 * Finds related construction standards from national databases when exact/semantic match is unavailable.
 */

import { AhspProvider, AhspSearchInput, AhspCandidate } from '../providerContracts';
import { officialAhspRepository } from '../../../data/nationalCostDatabase/officialAhspRepository';
import { canonicalUnitRegistry } from '../../../engine/pricing/canonical/canonicalUnitRegistry';

export class ReferenceAhspProvider implements AhspProvider {
  public readonly name = 'REFERENCE_AHSP';
  public readonly priority = 3;

  public async findAhsp(input: AhspSearchInput): Promise<AhspCandidate | null> {
    const { workItemName, category, unit } = input;
    const norm = workItemName.toLowerCase().trim();

    // 1. Try search with full workItemName first
    const searchQueries = [
      norm,
      ...norm.split(/\s+/).filter((w) => w.length > 3 && !['pekerjaan', 'pemasangan', 'pembuatan', 'pengadaan'].includes(w)),
    ];

    for (const q of searchQueries) {
      const results = officialAhspRepository.searchOfficialAhsp(q, {
        limit: 10,
        unit,
        preferBuildingDomain: true,
      });

      const compatible = results
        .map((r) => r.item)
        .filter((c: any) => {
          const cName = String(c.name || '').toLowerCase();
          // Reject bridge girders and heavy highway items for building items
          if (/gelagar|pratekan|bentang \d|box girder|jembatan/.test(cName)) {
            return false;
          }

          if (!unit) return true;
          // Dimensional compatibility check
          return canonicalUnitRegistry.areDimensionallyCompatible(unit, c.unit);
        });

      if (compatible.length > 0) {
        // Prefer CIPTA_KARYA domain
        const ckMatch = compatible.find((c) => c.domain === 'CIPTA_KARYA');
        const top = ckMatch || compatible[0];

        return {
          code: top.code,
          name: top.name,
          unit: top.unit,
          source: (top as any).source || (top as any).regulationSource || 'Referensi Standar Nasional PUPR 2026',
          matchType: 'RELATED_MATCH',
          provenance: 'MARKET_REFERENCE',
          confidence: 0.85,
          confidenceRating: 'MEDIUM',
          notes: `Referensi standar pekerjaan serumpun: ${top.name}.`,
          candidates: compatible.slice(0, 3).map((c: any) => ({ code: c.code, name: c.name, unit: c.unit })),
        };
      }
    }

    return null;
  }
}

export const referenceAhspProvider = new ReferenceAhspProvider();
