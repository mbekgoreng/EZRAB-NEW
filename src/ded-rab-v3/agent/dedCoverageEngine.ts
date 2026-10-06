/**
 * EZRAB DED COVERAGE ENGINE (Section 23 Master Architecture)
 * Maps and validates structural, architectural, and MEP completeness across all DED sheets.
 */

import { AiRabItem, DedCoverageReport, DedCoverageDiscipline } from './types';
import { DedContextMemory } from '../types';

export class DedCoverageEngine {
  private static instance: DedCoverageEngine;

  private constructor() {}

  public static getInstance(): DedCoverageEngine {
    if (!DedCoverageEngine.instance) {
      DedCoverageEngine.instance = new DedCoverageEngine();
    }
    return DedCoverageEngine.instance;
  }

  /**
   * Evaluates work items against standard building construction disciplines.
   */
  public evaluateCoverage(items: AiRabItem[], context: DedContextMemory): DedCoverageReport {
    const buildDiscipline = (
      name: string,
      filterFn: (item: AiRabItem) => boolean,
      defaultPages: number[] = [1]
    ): DedCoverageDiscipline => {
      const matched = items.filter(filterFn);
      const pages = Array.from(
        new Set(matched.flatMap((m) => m.evidence.map((e) => e.pageNumber)))
      );

      return {
        category: name,
        covered: matched.length > 0,
        itemCount: matched.length,
        evidencePages: pages.length > 0 ? pages : defaultPages,
        notes: matched.length > 0 ? `${matched.length} pekerjaan teridentifikasi` : 'Belum terdeteksi pada DED',
      };
    };

    const archFloor = buildDiscipline('Lantai / Keramik', (i) => /lantai|keramik|granit|screed/i.test(i.workItem));
    const archWall = buildDiscipline('Dinding / Pasangan', (i) => /dinding|bata|hebel|batako|trasram/i.test(i.workItem));
    const archDoor = buildDiscipline('Pintu', (i) => /pintu|daun pintu|kusen pintu/i.test(i.workItem));
    const archWindow = buildDiscipline('Jendela & Kaca', (i) => /jendela|kaca|bouvenlight|bov/i.test(i.workItem));
    const archCeiling = buildDiscipline('Plafon & Rangka', (i) => /plafon|plafond|gypsum|grc|langit-langit/i.test(i.workItem));
    const archFinish = buildDiscipline('Plesteran, Acian, Cat', (i) => /plester|acian|cat|finishing/i.test(i.workItem));

    const structFoundation = buildDiscipline('Pondasi & Galian', (i) => /pondasi|galian|aanstamping|urugan/i.test(i.workItem));
    const structColumn = buildDiscipline('Kolom Struktur & Praktis', (i) => /kolom/i.test(i.workItem));
    const structBeam = buildDiscipline('Balok & Sloof & Ringbalk', (i) => /sloof|balok|ringbalk|ring balk/i.test(i.workItem));
    const structSlab = buildDiscipline('Pelat Lantai / Dak Beton', (i) => /pelat|dak|slab/i.test(i.workItem));
    const structRoof = buildDiscipline('Rangka & Penutup Atap', (i) => /atap|kuda-kuda|genteng|spandek/i.test(i.workItem));

    const mepPlumbing = buildDiscipline('Plambing & Sanitair', (i) => /pipa|sanitair|kloset|floor drain|kran|air/i.test(i.workItem));
    const mepElectrical = buildDiscipline('Instalasi Listrik & Titik Lampu', (i) => /listrik|lampu|downlight|saklar|stop kontak/i.test(i.workItem));

    const allDisciplines = [
      archFloor,
      archWall,
      archDoor,
      archWindow,
      archCeiling,
      archFinish,
      structFoundation,
      structColumn,
      structBeam,
      structSlab,
      structRoof,
      mepPlumbing,
      mepElectrical,
    ];

    const coveredCount = allDisciplines.filter((d) => d.covered).length;
    const overallCoveragePercent = Math.round((coveredCount / allDisciplines.length) * 100);

    const missingDisciplines = allDisciplines.filter((d) => !d.covered).map((d) => d.category);
    const recommendations: string[] = [];

    if (!archFinish.covered) {
      recommendations.push('Pertimbangkan menambahkan item plesteran dan acian dinding.');
    }
    if (!mepPlumbing.covered) {
      recommendations.push('Periksa lembar MEP untuk jaringan pipa air bersih dan air kotor.');
    }

    return {
      overallCoveragePercent,
      architectural: {
        floor: archFloor,
        wall: archWall,
        door: archDoor,
        window: archWindow,
        ceiling: archCeiling,
        finish: archFinish,
      },
      structural: {
        foundation: structFoundation,
        column: structColumn,
        beam: structBeam,
        slab: structSlab,
        roof: structRoof,
      },
      mep: {
        plumbing: mepPlumbing,
        electrical: mepElectrical,
      },
      missingDisciplines,
      recommendations,
    };
  }
}

export const dedCoverageEngine = DedCoverageEngine.getInstance();
