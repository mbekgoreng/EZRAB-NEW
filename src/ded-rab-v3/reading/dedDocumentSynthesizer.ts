/**
 * EZRAB FULL AI DED INTELLIGENCE ENGINE V3.0
 * Document Synthesizer: Cross-Page Construction Reasoning & Semantic Linking
 */

import {
  DedContextMemory,
  CrossReference,
} from '../types';
import { aiProviderClient } from '../ai/aiProviderClient';

export interface DocumentSynthesisSummary {
  buildingType: string;
  totalFloorAreaM2: number;
  totalPerimeterM: number;
  wallHeightM: number;
  ceilingHeightM: number;
  foundationLengthM: number;
  sloofLengthM: number;
  ringbalkLengthM: number;
  columnCount: number;
  totalOpeningAreaM2: number;
  roofSlopeAngleDeg: number;
  roofPlanAreaM2: number;
  keyStructuralSpecs: Record<string, string>;
  keyArchitecturalSpecs: Record<string, string>;
  crossReferencesFound: CrossReference[];
}

export class DedDocumentSynthesizer {
  private static instance: DedDocumentSynthesizer;

  private constructor() {}

  public static getInstance(): DedDocumentSynthesizer {
    if (!DedDocumentSynthesizer.instance) {
      DedDocumentSynthesizer.instance = new DedDocumentSynthesizer();
    }
    return DedDocumentSynthesizer.instance;
  }

  /**
   * Synthesizes cross-page knowledge across all read pages in DED_CONTEXT.
   */
  public async synthesize(context: DedContextMemory): Promise<DocumentSynthesisSummary> {
    // 1. Compute direct deterministic totals from accumulated page memory
    const totalFloorAreaM2 = +(context.rooms.reduce((acc, r) => acc + (r.areaM2 || 0), 0)).toFixed(2);
    const totalPerimeterM = +(context.rooms.reduce((acc, r) => acc + (r.perimeterM || 0), 0)).toFixed(2);
    const totalOpeningAreaM2 = +(context.schedules.reduce((acc, s) => acc + (s.totalOpeningAreaM2 || 0), 0)).toFixed(3);

    // 2. Prepare concise briefing of all discovered sheets for the AI synthesis
    const pageBriefs = Array.from(context.pages.values())
      .sort((a, b) => a.pageNumber - b.pageNumber)
      .map((p) => `Halaman ${p.pageNumber}: "${p.drawingTitle}" [${p.drawingType}] (Skala: ${p.scale || 'N/A'})`)
      .join('\n');

    const roomsBrief = context.rooms
      .map((r) => `- ${r.name} (Hal ${r.pageNumber}): ${r.lengthM}m × ${r.widthM}m = ${r.areaM2} m² (Elv: ${r.elevationM ?? '0.00'})`)
      .slice(0, 20)
      .join('\n');

    const schedulesBrief = context.schedules
      .map((s) => `- ${s.mark} (Hal ${s.sourcePage}): ${s.count} unit, ${s.widthM}m × ${s.heightM}m, material: ${s.material}`)
      .join('\n');

    const materialsBrief = context.materials
      .map((m) => `- ${m.materialName}: ${m.specification} (Halaman: ${m.sourcePages.join(', ')})`)
      .slice(0, 15)
      .join('\n');

    const prompt = `Anda adalah Chief Construction Synthesizer EZRAB AI.
Tugas Anda adalah MENGHUBUNGKAN DATA LINTAS HALAMAN (CROSS-PAGE REASONING) untuk seluruh dokumen DED ini.

DAFTAR HALAMAN TERBACA:
${pageBriefs}

DATA RUANGAN TERKUMPUL:
${roomsBrief || 'Belum ada ruangan'}

DATA KUSEN, PINTU & JENDELA TERKUMPUL:
${schedulesBrief || 'Belum ada jadwal kusen'}

DATA MATERIAL & SPESIFIKASI:
${materialsBrief || 'Spesifikasi umum'}

TUGAS REASONING:
1. Hubungkan Denah Ruangan dengan Gambar Tampak & Potongan: Berapa tinggi dinding tipikal (wallHeightM) dan tinggi plafon tipikal (ceilingHeightM)?
2. Hubungkan Denah Pondasi & Denah Sloof dengan Detail Struktur:
   - Berapa total estimasi panjang pondasi batu kali (foundationLengthM) dan sloof (sloofLengthM)?
   - Berapa dimensi penampang sloof (contoh 15x20 cm), ringbalk (15x15 cm), kolom praktis (15x15 cm)?
   - Berapa mutu beton yang disyaratkan (contoh K-225 atau K-175)?
3. Hubungkan Denah Atap & Potongan: Berapa perkiraan luas denah atap (roofPlanAreaM2) dan sudut kemiringan atap (roofSlopeAngleDeg)?
4. Identifikasi Cross References (hubungan saling merujuk antar lembar, misal Denah Hal 2 merujuk Detail Hal 10 atau Potongan Hal 7).

KEMBALIKAN HANYA OBJEK JSON:
{
  "buildingType": "Rumah Tinggal 1 Lantai",
  "wallHeightM": number,
  "ceilingHeightM": number,
  "foundationLengthM": number,
  "sloofLengthM": number,
  "ringbalkLengthM": number,
  "columnCount": number,
  "roofSlopeAngleDeg": number,
  "roofPlanAreaM2": number,
  "keyStructuralSpecs": {
    "sloofDimension": string,
    "kolomDimension": string,
    "ringbalkDimension": string,
    "mutuBeton": string,
    "pondasiType": string
  },
  "keyArchitecturalSpecs": {
    "dinding": string,
    "kusen": string,
    "lantai": string,
    "plafon": string,
    "atap": string
  },
  "crossReferences": [
    {
      "fromPage": number,
      "toPage": number,
      "elementTag": string,
      "relationship": "DETAILS" | "SECTION_OF" | "ELEVATION_OF" | "SCHEDULE_FOR",
      "notes": string
    }
  ]
}`;

    try {
      const resp = await aiProviderClient.executeChat<any>({
        prompt,
        systemPrompt: 'You are EZRAB Chief Construction Synthesizer. Connect cross-page engineering realities without guessing.',
        jsonMode: true,
        temperature: 0.1,
      });

      const d = resp.data || {};

      const crossReferencesFound: CrossReference[] = (d.crossReferences || []).map((cr: any) => ({
        fromPage: typeof cr.fromPage === 'number' ? cr.fromPage : parseInt(cr.fromPage, 10) || 1,
        toPage: typeof cr.toPage === 'number' ? cr.toPage : parseInt(cr.toPage, 10) || 1,
        elementTag: cr.elementTag || '',
        relationship: cr.relationship || 'DETAILS',
        notes: cr.notes || '',
      }));

      context.cross_references.push(...crossReferencesFound);

      const normLen = (v: any, fallback: number): number => {
        if (typeof v !== 'number' || isNaN(v) || v <= 0) return fallback;
        if (v >= 500) return +(v / 1000).toFixed(2); // mm -> m
        if (v >= 250) return +(v / 100).toFixed(2);  // cm -> m
        return +v.toFixed(2);
      };

      const normHeight = (v: any, fallback: number): number => {
        if (typeof v !== 'number' || isNaN(v) || v <= 0) return fallback;
        if (v >= 500) return +(v / 1000).toFixed(2); // mm -> m
        if (v >= 25) return +(v / 100).toFixed(2);   // cm -> m
        return +v.toFixed(2);
      };

      return {
        buildingType: d.buildingType || 'Rumah Tinggal 1 Lantai',
        totalFloorAreaM2,
        totalPerimeterM,
        wallHeightM: normHeight(d.wallHeightM, 3.5),
        ceilingHeightM: normHeight(d.ceilingHeightM, 3.2),
        foundationLengthM: normLen(d.foundationLengthM, 76),
        sloofLengthM: normLen(d.sloofLengthM, 76),
        ringbalkLengthM: normLen(d.ringbalkLengthM, 76),
        columnCount: typeof d.columnCount === 'number' && d.columnCount > 0 && d.columnCount < 200 ? d.columnCount : 24,
        totalOpeningAreaM2,
        roofSlopeAngleDeg: typeof d.roofSlopeAngleDeg === 'number' && d.roofSlopeAngleDeg > 0 && d.roofSlopeAngleDeg < 80 ? d.roofSlopeAngleDeg : 30,
        roofPlanAreaM2: typeof d.roofPlanAreaM2 === 'number' && d.roofPlanAreaM2 > 0 && d.roofPlanAreaM2 < 2000 ? d.roofPlanAreaM2 : totalFloorAreaM2 * 1.25,
        keyStructuralSpecs: d.keyStructuralSpecs || {
          sloofDimension: '15 x 20 cm',
          kolomDimension: '15 x 15 cm',
          ringbalkDimension: '15 x 15 cm',
          mutuBeton: 'K-225',
          pondasiType: 'Pondasi Batu Kali',
        },
        keyArchitecturalSpecs: d.keyArchitecturalSpecs || {
          dinding: 'Bata Merah / Bata Ringan',
          kusen: 'Aluminium 4 inch',
          lantai: 'Keramik 40x40',
          plafon: 'Gypsum 9 mm + Rangka Hollow',
          atap: 'Atap Metal / Spandek',
        },
        crossReferencesFound,
      };
    } catch (err: any) {
      console.warn(`[DedDocumentSynthesizer] Synthesis fallback used: ${err.message}`);
      return {
        buildingType: 'Rumah Tinggal 1 Lantai',
        totalFloorAreaM2,
        totalPerimeterM,
        wallHeightM: 3.5,
        ceilingHeightM: 3.2,
        foundationLengthM: 76,
        sloofLengthM: 76,
        ringbalkLengthM: 76,
        columnCount: 24,
        totalOpeningAreaM2,
        roofSlopeAngleDeg: 30,
        roofPlanAreaM2: +(totalFloorAreaM2 * 1.25).toFixed(2),
        keyStructuralSpecs: {
          sloofDimension: '15 x 20 cm',
          kolomDimension: '15 x 15 cm',
          ringbalkDimension: '15 x 15 cm',
          mutuBeton: 'K-225',
          pondasiType: 'Pondasi Batu Kali',
        },
        keyArchitecturalSpecs: {
          dinding: 'Bata Merah / Bata Ringan',
          kusen: 'Aluminium 4 inch',
          lantai: 'Keramik 40x40',
          plafon: 'Gypsum 9 mm',
          atap: 'Atap Metal',
        },
        crossReferencesFound: [],
      };
    }
  }
}

export const dedDocumentSynthesizer = DedDocumentSynthesizer.getInstance();
