/**
 * EZRAB — DED Coverage Engine
 *
 * Verifies completeness across all major construction trade divisions:
 * 1. Foundation (Pondasi & Tanah)
 * 2. Structure (Kolom, Balok, Plat)
 * 3. Wall (Dinding, Plesteran, Acian)
 * 4. Floor (Keramik, Screed)
 * 5. Ceiling (Plafon Gypsum/GRC)
 * 6. Roof (Rangka Atap, Penutup Atap, Lisplank)
 * 7. Doors & Windows (Kusen, Pintu, Jendela, Boven)
 * 8. Painting (Cat Dinding & Plafon)
 * 9. Plumbing (Pipa Air Bersih & Kotor)
 * 10. Electrical (Titik Lampu, Stop Kontak, Saklar)
 * 11. Sanitary (Kloset, Floor Drain)
 */

export interface ConstructionDivisionCoverage {
  division: string;
  category: string;
  isCovered: boolean;
  itemCount: number;
  sampleItems: string[];
}

export interface DedCoverageReport {
  overallCoveragePercentage: number;
  divisionsTotal: number;
  divisionsCovered: number;
  divisionsMissing: number;
  divisionDetails: ConstructionDivisionCoverage[];
}

export class DedCoverageEngine {
  private static instance: DedCoverageEngine;

  private constructor() {}

  public static getInstance(): DedCoverageEngine {
    if (!DedCoverageEngine.instance) {
      DedCoverageEngine.instance = new DedCoverageEngine();
    }
    return DedCoverageEngine.instance;
  }

  public checkCoverage(items: Array<{ name: string; category?: string }>): DedCoverageReport {
    const divisions: Array<{ division: string; category: string; keywords: string[] }> = [
      { division: 'Pondasi & Tanah', category: 'FOUNDATION', keywords: ['pondasi', 'galian', 'urugan', 'batu kali', 'footplat', 'tanah'] },
      { division: 'Struktur Beton', category: 'STRUCTURE', keywords: ['sloof', 'kolom', 'balok', 'ringbalk', 'plat', 'dak', 'beton'] },
      { division: 'Dinding & Plesteran', category: 'WALL', keywords: ['dinding', 'bata', 'hebel', 'plesteran', 'acian'] },
      { division: 'Penutup Lantai', category: 'FLOOR_FINISH', keywords: ['keramik', 'granit', 'lantai', 'screed'] },
      { division: 'Plafon & Partisi', category: 'CEILING', keywords: ['plafon', 'plafond', 'gypsum', 'grc', 'kalsiboard'] },
      { division: 'Atap & Rangka', category: 'ROOF', keywords: ['atap', 'kuda-kuda', 'reng', 'genteng', 'spandek', 'lisplank', 'nok'] },
      { division: 'Pintu & Jendela', category: 'DOOR_WINDOW', keywords: ['pintu', 'jendela', 'kusen', 'boven', 'p1', 'p2', 'j1', 'j2', 'bv1'] },
      { division: 'Pengecatan', category: 'PAINTING', keywords: ['cat', 'pengecatan', 'painting'] },
      { division: 'Instalasi Plumbing', category: 'PLUMBING', keywords: ['pipa', 'air bersih', 'air kotor', 'plumbing'] },
      { division: 'Instalasi Listrik', category: 'MEP', keywords: ['listrik', 'lampu', 'downlight', 'saklar', 'stop kontak'] },
      { division: 'Sanitair', category: 'SANITARY', keywords: ['kloset', 'closet', 'floor drain', 'wastafel', 'kran'] },
    ];

    const divisionDetails: ConstructionDivisionCoverage[] = divisions.map((div) => {
      const matchingItems = items.filter((it) => {
        const norm = (it.name || '').toLowerCase();
        const cat = (it.category || '').toUpperCase();
        return div.keywords.some((kw) => norm.includes(kw)) || cat.includes(div.category);
      });

      return {
        division: div.division,
        category: div.category,
        isCovered: matchingItems.length > 0,
        itemCount: matchingItems.length,
        sampleItems: matchingItems.slice(0, 3).map((i) => i.name),
      };
    });

    const covered = divisionDetails.filter((d) => d.isCovered).length;
    const total = divisionDetails.length;
    const pct = Math.round((covered / total) * 100);

    return {
      overallCoveragePercentage: pct,
      divisionsTotal: total,
      divisionsCovered: covered,
      divisionsMissing: total - covered,
      divisionDetails,
    };
  }
}

export const dedCoverageEngine = DedCoverageEngine.getInstance();
