/**
 * Priority 1: Exact AHSP Provider
 * Matches work items against exact official AHSP codes from official PUPR 2026 database.
 */

import { AhspProvider, AhspSearchInput, AhspCandidate } from '../providerContracts';
import { officialAhspRepository } from '../../../data/nationalCostDatabase/officialAhspRepository';

export class EzrabAhspProvider implements AhspProvider {
  public readonly name = 'EXACT_AHSP';
  public readonly priority = 1;

  public async findAhsp(input: AhspSearchInput): Promise<AhspCandidate | null> {
    const { workItemName, specification, unit, ahspCode: explicitCode } = input;
    const nameNorm = workItemName.toLowerCase().trim();

    // Check explicit code or embedded code e.g. "Pondasi Batu Kali 2.2.2.1.6"
    const codeMatch = workItemName.match(/\b([A-Za-z0-9]+(?:\.[A-Za-z0-9]+){2,})\b/);
    const targetCode = explicitCode || (codeMatch ? codeMatch[1] : null);
    if (targetCode) {
      const official = officialAhspRepository.getOfficialAhsp(targetCode);
      if (official) {
        return {
          code: official.code,
          name: official.name,
          unit: official.unit,
          source: (official as any).source || (official as any).sourceId || 'PUPR 2026',
          matchType: 'EXACT_MATCH',
          provenance: 'EZRAB_DATABASE',
          confidence: 0.98,
          confidenceRating: 'HIGH',
          notes: 'Ditemukan kecocokan kode AHSP resmi exact dari dokumen.',
        };
      }
    }

    return null;
  }
}

export const ezrabAhspProvider = new EzrabAhspProvider();
