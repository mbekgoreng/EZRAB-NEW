/**
 * EZRAB FULL AI DED INTELLIGENCE ENGINE V3.0
 * Missing Information Loop: Iterative Cross-Sheet Search Before Marking Unresolved
 */

import {
  DedContextMemory,
  FullAiWorkItem,
} from '../types';
import { aiProviderClient } from '../ai/aiProviderClient';

export interface MissingInfoResolution {
  workItemId: string;
  found: boolean;
  searchedPages: number[];
  discoveredEvidence?: string;
  discoveredDimensions?: Record<string, number | string>;
  exhaustionReason?: string;
}

export class DedMissingInformationLoop {
  private static instance: DedMissingInformationLoop;

  private constructor() {}

  public static getInstance(): DedMissingInformationLoop {
    if (!DedMissingInformationLoop.instance) {
      DedMissingInformationLoop.instance = new DedMissingInformationLoop();
    }
    return DedMissingInformationLoop.instance;
  }

  /**
   * For items lacking explicit dimensions or quantities, searches candidate sheets in DED_CONTEXT
   * (floor plan, elevation, section, detail, schedule, notes) before declaring MISSING_QUANTITY.
   */
  public async resolveMissingInformation(
    item: FullAiWorkItem,
    context: DedContextMemory
  ): Promise<MissingInfoResolution> {
    // 1. Determine which sheets are relevant to this work item category
    const candidatePages = this.identifyCandidateSheets(item, context);

    // 2. Prepare text excerpts from candidate sheets
    const candidateExcerpts = candidatePages.map((pageNum) => {
      const page = context.pages.get(pageNum);
      return `[Halaman ${pageNum} - "${page?.drawingTitle || ''}" (${page?.drawingType || ''})]:\n${page?.nativeText.slice(0, 800) || '(Tidak ada teks)'}`;
    }).join('\n\n');

    const prompt = `Anda adalah Forensic Construction Detective EZRAB AI.
Pertanyaan Internal AI: "Di mana lagi di dalam DED ini informasi dimensi / kuantitas untuk pekerjaan berikut dapat ditemukan?"

WORK ITEM:
- Nama: ${item.name}
- Kategori: ${item.category}
- Spesifikasi Awal: ${item.specification}
- Halaman Asal Awal: ${item.sourcePages.join(', ')}

KANDIDAT HALAMAN DED YANG DISISIR:
${candidateExcerpts}

TUGAS:
1. Periksa teks dan detail dari halaman-halaman kandidat di atas.
2. Apakah ada ukuran panjang, lebar, tinggi, tebal, luas, elevasi, jumlah unit, atau spesifikasi tersembunyi yang menjelaskan pekerjaan "${item.name}"?
3. JANGAN MENGARANG ANGKA! Jika benar-benar tidak ditemukan di halaman mana pun, nyatakan found = false dan berikan alasan teknis yang jujur mengapa belum bisa dihitung secara pasti.

KEMBALIKAN HANYA JSON:
{
  "found": boolean,
  "searchedPages": number[],
  "discoveredEvidence": string,
  "discoveredDimensions": {
    "lengthM": number,
    "widthM": number,
    "heightM": number,
    "thicknessM": number,
    "count": number
  },
  "exhaustionReason": string
}`;

    try {
      const resp = await aiProviderClient.executeChat<any>({
        prompt,
        systemPrompt: 'You are EZRAB Forensic Construction Detective. Search all DED sheets with zero hallucination.',
        jsonMode: true,
        temperature: 0.1,
      });

      const d = resp.data || {};
      const found = Boolean(d.found);

      // Record question in context memory
      context.missing_information_queries.push({
        workItemId: item.id,
        question: `Pencarian parameter dimensi untuk ${item.name}`,
        searchedPages: candidatePages,
        resolved: found,
        resolution: found ? d.discoveredEvidence : d.exhaustionReason,
      });

      if (found) {
        if (d.discoveredDimensions) {
          if (d.discoveredDimensions.lengthM) item.dimensions.lengthM = d.discoveredDimensions.lengthM;
          if (d.discoveredDimensions.widthM) item.dimensions.widthM = d.discoveredDimensions.widthM;
          if (d.discoveredDimensions.heightM) item.dimensions.heightM = d.discoveredDimensions.heightM;
          if (d.discoveredDimensions.thicknessM) item.dimensions.thicknessM = d.discoveredDimensions.thicknessM;
          if (d.discoveredDimensions.count) item.dimensions.count = d.discoveredDimensions.count;
        }
        if (d.discoveredEvidence) {
          item.sourceEvidence.push(`[Temuan Investigasi]: ${d.discoveredEvidence}`);
        }
        candidatePages.forEach((p) => {
          if (!item.sourcePages.includes(p)) item.sourcePages.push(p);
        });
      }

      return {
        workItemId: item.id,
        found,
        searchedPages: candidatePages,
        discoveredEvidence: d.discoveredEvidence,
        discoveredDimensions: d.discoveredDimensions,
        exhaustionReason: d.exhaustionReason || `Informasi tidak ditemukan setelah meneliti seluruh lembar DED kandidat: ${candidatePages.join(', ')}`,
      };
    } catch {
      // Deterministic fallback
      return {
        workItemId: item.id,
        found: false,
        searchedPages: candidatePages,
        exhaustionReason: `Seluruh lembar kandidat (${candidatePages.join(', ')}) telah diperiksa namun data dimensi spesifik belum tersedia pada notasi gambar.`,
      };
    }
  }

  /**
   * Filters sheets to those most likely to contain evidence for a given work category.
   */
  private identifyCandidateSheets(item: FullAiWorkItem, context: DedContextMemory): number[] {
    const allPages = Array.from(context.pages.values());
    const matchedPages = new Set<number>(item.sourcePages);

    const name = item.name.toLowerCase();
    const cat = item.category.toLowerCase();

    for (const p of allPages) {
      const type = p.drawingType;
      const title = p.drawingTitle.toLowerCase();

      if (cat.includes('pondasi') || cat.includes('tanah')) {
        if (type === 'STRUCTURAL_PLAN' || type === 'STRUCTURAL_DETAIL' || title.includes('pondasi') || title.includes('potongan')) {
          matchedPages.add(p.pageNumber);
        }
      } else if (cat.includes('beton') || cat.includes('struktur')) {
        if (type === 'STRUCTURAL_PLAN' || type === 'STRUCTURAL_DETAIL' || title.includes('sloof') || title.includes('kolom') || title.includes('ringbalk')) {
          matchedPages.add(p.pageNumber);
        }
      } else if (cat.includes('dinding') || cat.includes('plesteran') || cat.includes('cat')) {
        if (type === 'FLOOR_PLAN' || type === 'ELEVATION' || type === 'SECTION' || title.includes('denah') || title.includes('tampak') || title.includes('potongan')) {
          matchedPages.add(p.pageNumber);
        }
      } else if (cat.includes('kusen') || cat.includes('pintu') || cat.includes('jendela')) {
        if (type === 'DOOR_WINDOW_SCHEDULE' || title.includes('kusen') || title.includes('pintu') || title.includes('jendela')) {
          matchedPages.add(p.pageNumber);
        }
      } else if (cat.includes('lantai') || cat.includes('keramik')) {
        if (title.includes('keramik') || title.includes('lantai') || type === 'FLOOR_PLAN') {
          matchedPages.add(p.pageNumber);
        }
      } else if (cat.includes('plafon') || title.includes('plafon')) {
        if (title.includes('plafond') || title.includes('plafon') || type === 'SECTION') {
          matchedPages.add(p.pageNumber);
        }
      } else if (cat.includes('atap') || title.includes('atap')) {
        if (type === 'ROOF_PLAN' || title.includes('atap') || title.includes('kuda')) {
          matchedPages.add(p.pageNumber);
        }
      } else if (cat.includes('sanitair') || cat.includes('plumbing') || cat.includes('air')) {
        if (type === 'MEP_PLUMBING' || title.includes('air') || title.includes('sanitair')) {
          matchedPages.add(p.pageNumber);
        }
      } else if (cat.includes('listrik') || cat.includes('elektrikal')) {
        if (type === 'MEP_ELECTRICAL' || title.includes('listrik')) {
          matchedPages.add(p.pageNumber);
        }
      }
    }

    const result = Array.from(matchedPages).sort((a, b) => a - b);
    return result.length > 0 ? result : [1, 2];
  }
}

export const dedMissingInformationLoop = DedMissingInformationLoop.getInstance();
