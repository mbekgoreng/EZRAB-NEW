/**
 * EZRAB FULL AI DED INTELLIGENCE ENGINE V3.0
 * Document Reader: Iterative Page-by-Page Reading & Structured Knowledge Extraction
 */

import {
  DedContextMemory,
  DedPageInfo,
  DrawingClassification,
  DrawingElement,
  DimensionConstraint,
  RoomDefinition,
  ScheduleItem,
} from '../types';
import { aiProviderClient } from '../ai/aiProviderClient';

export interface PageReadingResult {
  pageNumber: number;
  drawingTitle: string;
  drawingType: DrawingClassification;
  scale?: string;
  constructionElements: DrawingElement[];
  dimensions: DimensionConstraint[];
  rooms: RoomDefinition[];
  schedules: ScheduleItem[];
  materials: Array<{ materialName: string; specification: string }>;
  notes: string[];
}

export class DedDocumentReader {
  private static instance: DedDocumentReader;

  private constructor() {}

  public static getInstance(): DedDocumentReader {
    if (!DedDocumentReader.instance) {
      DedDocumentReader.instance = new DedDocumentReader();
    }
    return DedDocumentReader.instance;
  }

  /**
   * Initializes a fresh DED_CONTEXT memory structure.
   */
  public createEmptyContext(projectId: string, projectName: string, totalPages: number): DedContextMemory {
    return {
      projectId,
      projectName,
      totalPages,
      pages: new Map<number, DedPageInfo>(),
      drawings: [],
      dimensions: [],
      rooms: [],
      structural_elements: [],
      architectural_elements: [],
      materials: [],
      specifications: [],
      schedules: [],
      notes: [],
      cross_references: [],
      work_items: new Map(),
      quantity_evidence: new Map(),
      ahsp_evidence: new Map(),
      missing_information_queries: [],
    };
  }

  /**
   * Reads an individual DED page using AI reasoning (visual + native text).
   * Extracts construction elements, rooms, dimensions, and schedules.
   */
  public async readPage(page: DedPageInfo, totalPages: number): Promise<PageReadingResult> {
    const prompt = `Anda adalah Senior Quantity Surveyor dan Construction Drawing Specialist EZRAB AI.
Tugas Anda adalah MEMBACA & MEMAHAMI dokumen DED halaman ${page.pageNumber} dari ${totalPages}.

INFORMASI AWAL HALAMAN:
- Judul / Label Awal: "${page.drawingTitle}"
- Klasifikasi Awal: "${page.drawingType}"
- Skala Awal: "${page.scale || 'Belum teridentifikasi'}"

TEKS ASLI PADA HALAMAN (NATIVE PDF TEXT):
"""
${page.nativeText.slice(0, 3000)}
"""

PETUNJUK ANALISIS MENDALAM:
1. Tentukan Judul Gambar yang akurat (drawingTitle) dan Tipe Gambar (drawingType).
   Pilihan drawingType: SITE_PLAN, FLOOR_PLAN, ELEVATION, SECTION, STRUCTURAL_PLAN, STRUCTURAL_DETAIL, DOOR_WINDOW_SCHEDULE, ROOF_PLAN, MEP_PLUMBING, MEP_ELECTRICAL, ARCHITECTURAL_DETAIL, GENERAL_NOTES, SPECIFICATION_SHEET.
2. Identifikasi semua elemen konstruksi nyata yang terlihat (Pondasi, Sloof, Kolom, Balok, Dinding, Kusen, Pintu, Jendela, Keramik, Plafond, Rangka Atap, Penutup Atap, Sanitair, Pipa, Titik Lampu/Stop Kontak).
3. Jika ini Denah Ruangan (FLOOR_PLAN): ekstrak daftar ruangan lengkap dengan nama, panjang (m), lebar (m), elevasi, dan finishing lantai.
4. Jika ini Gambar Potongan (SECTION) atau Tampak (ELEVATION): ekstrak tinggi dinding, tinggi plafon, kemiringan atap, dan tinggi total bangunan.
5. Jika ini Gambar Struktur (STRUCTURAL_PLAN / STRUCTURAL_DETAIL): ekstrak dimensi penampang (contoh: Sloof 15x20 cm, Kolom 15x15 cm, Pondasi Batu Kali lebar atas 30 cm lebar bawah 60 cm tinggi 80 cm) serta mutu beton atau tulangan.
6. Jika ini Denah/Tabel Kusen (DOOR_WINDOW_SCHEDULE): ekstrak tipe pintu/jendela (P1, P2, J1, dll), ukuran lebar x tinggi, jumlah unit, dan material kusen.
7. JANGAN MENGARANG ANGKA! Jika dimensi tidak tertulis di halaman ini, catat sebagai null atau kosong.

KEMBALIKAN HANYA OBJEK JSON DENGAN STRUKTUR BERIKUT:
{
  "drawingTitle": string,
  "drawingType": string,
  "scale": string,
  "rooms": [
    {
      "name": string,
      "lengthM": number,
      "widthM": number,
      "elevationM": number,
      "floorFinish": string,
      "ceilingHeightM": number
    }
  ],
  "constructionElements": [
    {
      "category": "STRUCTURAL" | "ARCHITECTURAL" | "MEP" | "SITEWORK" | "FINISH",
      "tagOrLabel": string,
      "description": string,
      "dimensionsRaw": string,
      "materialSpecification": string,
      "notes": string
    }
  ],
  "dimensions": [
    {
      "elementRef": string,
      "dimensionType": "LENGTH" | "WIDTH" | "HEIGHT" | "DEPTH" | "THICKNESS" | "AREA" | "COUNT",
      "value": number,
      "unit": string,
      "rawText": string
    }
  ],
  "schedules": [
    {
      "scheduleType": "DOOR" | "WINDOW" | "DOOR_WINDOW_COMBO",
      "mark": string,
      "count": number,
      "widthM": number,
      "heightM": number,
      "material": string,
      "notes": string
    }
  ],
  "materials": [
    { "materialName": string, "specification": string }
  ],
  "notes": [string]
}`;

    try {
      const response = await aiProviderClient.executeChat<any>({
        prompt,
        systemPrompt: 'You are EZRAB Chief Construction Intelligence Engine. Extract structured engineering facts with zero hallucinations.',
        imageDataBase64: page.imageDataBase64,
        imageMimeType: 'image/png',
        jsonMode: true,
        temperature: 0.1,
        timeoutMs: 40000,
      });

      const data = response.data || {};
      const drawingTitle = data.drawingTitle || page.drawingTitle;
      const drawingType = (data.drawingType as DrawingClassification) || page.drawingType;
      const scale = data.scale || page.scale;

      const rawElements = Array.isArray(data.constructionElements) ? data.constructionElements : (data.constructionElements && typeof data.constructionElements === 'object' ? Object.values(data.constructionElements) : []);
      const elements: DrawingElement[] = rawElements.map((el: any, idx: number) => ({
        id: `el-p${page.pageNumber}-${idx + 1}`,
        pageNumber: page.pageNumber,
        category: el.category || 'ARCHITECTURAL',
        tagOrLabel: el.tagOrLabel || el.description?.slice(0, 30) || `Elemen ${idx + 1}`,
        description: el.description || '',
        dimensionsRaw: el.dimensionsRaw,
        materialSpecification: el.materialSpecification,
        notes: el.notes,
      }));

      // FASE DED-FIX TASK 5: hilangkan tebakan satuan dari besar angka.
      // Tanpa declaredUnit eksplisit -> tandai ambiguous, JANGAN asumsikan.
      const normalizeDim = (rawVal: number, declaredUnit?: string): { value: number; unit: string; ambiguous: boolean } => {
        if (!rawVal || isNaN(rawVal) || rawVal <= 0) return { value: 0, unit: 'm', ambiguous: true };
        const u = (declaredUnit || '').toLowerCase().trim();
        if (u === 'mm' || u === 'millimeter') return { value: +(rawVal / 1000).toFixed(4), unit: 'm', ambiguous: false };
        if (u === 'cm' || u === 'centimeter') return { value: +(rawVal / 100).toFixed(4), unit: 'm', ambiguous: false };
        if (u === 'm' || u === 'meter' || u === 'meters') return { value: +rawVal.toFixed(4), unit: 'm', ambiguous: false };
        // Satuan tidak dinyatakan: JANGAN tebak dari besar angka.
        return { value: +rawVal.toFixed(4), unit: 'm', ambiguous: true };
      };

      const rawDims = Array.isArray(data.dimensions) ? data.dimensions : (data.dimensions && typeof data.dimensions === 'object' ? Object.values(data.dimensions) : []);
      const dimensions: DimensionConstraint[] = rawDims.map((d: any, idx: number) => {
        const rawVal = typeof d.value === 'number' ? d.value : parseFloat(d.value) || 0;
        const declaredUnit = d.unit || 'm';
        let norm: { value: number; unit: string; ambiguous: boolean } = { value: rawVal, unit: declaredUnit, ambiguous: true };
        if (['LENGTH', 'WIDTH', 'HEIGHT', 'DEPTH', 'THICKNESS'].includes(d.dimensionType || 'LENGTH')) {
          norm = normalizeDim(rawVal, declaredUnit);
        }
        return {
          id: `dim-p${page.pageNumber}-${idx + 1}`,
          pageNumber: page.pageNumber,
          drawingTitle,
          elementRef: d.elementRef || drawingTitle,
          dimensionType: d.dimensionType || 'LENGTH',
          value: norm.value,
          unit: norm.unit,
          rawText: d.rawText || `${d.value} ${d.unit || '?'} (norm: ${norm.value}m)`,
          // FASE DED-FIX: satuan ambigu -> confidence LOW, bukan HIGH.
          confidence: norm.ambiguous ? 'LOW' : 'HIGH',
        };
      });

      const rawRooms = Array.isArray(data.rooms) ? data.rooms : (data.rooms && typeof data.rooms === 'object' ? Object.values(data.rooms) : []);
      const rooms: RoomDefinition[] = rawRooms.map((r: any, idx: number) => {
        const rawLen = typeof r.lengthM === 'number' ? r.lengthM : parseFloat(r.lengthM) || 0;
        const rawWid = typeof r.widthM === 'number' ? r.widthM : parseFloat(r.widthM) || 0;
        const lengthM = normalizeDim(rawLen, r.unit).value;
        const widthM = normalizeDim(rawWid, r.unit).value;
        const areaM2 = lengthM > 0 && widthM > 0 ? +(lengthM * widthM).toFixed(2) : 0;
        const perimeterM = lengthM > 0 && widthM > 0 ? +(2 * (lengthM + widthM)).toFixed(2) : 0;
        return {
          id: `room-p${page.pageNumber}-${idx + 1}`,
          name: r.name || `Ruangan ${idx + 1}`,
          pageNumber: page.pageNumber,
          lengthM,
          widthM,
          areaM2,
          perimeterM,
          elevationM: typeof r.elevationM === 'number' ? r.elevationM : undefined,
          floorFinish: r.floorFinish,
          ceilingHeightM: typeof r.ceilingHeightM === 'number' ? normalizeDim(r.ceilingHeightM).value : undefined,
        };
      });

      const rawSchedules = Array.isArray(data.schedules) ? data.schedules : (data.schedules && typeof data.schedules === 'object' ? Object.values(data.schedules) : []);
      const schedules: ScheduleItem[] = rawSchedules.map((s: any, idx: number) => {
        const count = typeof s.count === 'number' ? s.count : parseInt(s.count, 10) || 1;
        const widthM = typeof s.widthM === 'number' ? s.widthM : parseFloat(s.widthM) || 0;
        const heightM = typeof s.heightM === 'number' ? s.heightM : parseFloat(s.heightM) || 0;
        const totalOpeningAreaM2 = +(count * widthM * heightM).toFixed(3);
        return {
          id: `sch-p${page.pageNumber}-${idx + 1}`,
          scheduleType: s.scheduleType || 'DOOR',
          mark: s.mark || `Item ${idx + 1}`,
          count,
          widthM,
          heightM,
          totalOpeningAreaM2,
          material: s.material || '',
          sourcePage: page.pageNumber,
          notes: s.notes,
        };
      });

      console.log(`[AI-ESTIMATE-TRACE] PAGE_READ_SUCCESS (Page ${page.pageNumber}/${totalPages}):`, {
        pageNumber: page.pageNumber,
        drawingTitle,
        drawingType,
        elementsCount: elements.length,
        dimensionsCount: dimensions.length,
        roomsCount: rooms.length,
        schedulesCount: schedules.length,
      });

      return {
        pageNumber: page.pageNumber,
        drawingTitle,
        drawingType,
        scale,
        constructionElements: elements,
        dimensions,
        rooms,
        schedules,
        materials: Array.isArray(data.materials) ? data.materials : [],
        notes: Array.isArray(data.notes) ? data.notes : [],
      };
    } catch (err: any) {
      console.error(`[AI-ESTIMATE-TRACE] PAGE_READ_ERROR (Page ${page.pageNumber}): ${err.message}. Stage: PAGE_EXTRACTION`);
      console.warn(`[DedDocumentReader] Page ${page.pageNumber} AI parsing note: ${err.message}. Using native fallback.`);
      return this.fallbackParseFromText(page);
    }
  }

  /**
   * Deterministic fallback when AI provider has transient error on a specific page,
   * guaranteeing zero page loss.
   */
  private fallbackParseFromText(page: DedPageInfo): PageReadingResult {
    const text = page.nativeText;
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const elements: DrawingElement[] = [];
    const notes: string[] = [];

    lines.forEach((line, idx) => {
      if (line.length > 5 && !line.match(/^\d+$/)) {
        notes.push(line);
        if (idx < 5) {
          elements.push({
            id: `el-fallback-${page.pageNumber}-${idx}`,
            pageNumber: page.pageNumber,
            category: 'ARCHITECTURAL',
            tagOrLabel: line.slice(0, 30),
            description: line,
          });
        }
      }
    });

    return {
      pageNumber: page.pageNumber,
      drawingTitle: page.drawingTitle || `Halaman ${page.pageNumber}`,
      drawingType: page.drawingType || 'UNKNOWN',
      scale: page.scale,
      constructionElements: elements,
      dimensions: [],
      rooms: [],
      schedules: [],
      materials: [],
      notes,
    };
  }

  /**
   * Integrates a page reading result into the central DED_CONTEXT memory.
   */
  public integratePageIntoContext(context: DedContextMemory, pageInfo: DedPageInfo, result: PageReadingResult): void {
    // 1. Update Page Info
    pageInfo.drawingTitle = result.drawingTitle;
    pageInfo.drawingType = result.drawingType;
    pageInfo.scale = result.scale;
    pageInfo.readStatus = 'READ';
    pageInfo.readTimestamp = Date.now();
    context.pages.set(pageInfo.pageNumber, pageInfo);

    // 2. Accumulate Drawings / Elements
    context.drawings.push(...result.constructionElements);
    result.constructionElements.forEach((el) => {
      if (el.category === 'STRUCTURAL') context.structural_elements.push(el);
      else if (el.category === 'ARCHITECTURAL') context.architectural_elements.push(el);
    });

    // 3. Accumulate Dimensions
    context.dimensions.push(...result.dimensions);

    // 4. Accumulate Rooms (with cross-page deduplication)
    result.rooms.forEach((r) => {
      const existing = context.rooms.find(x =>
        x.name.trim().toLowerCase() === r.name.trim().toLowerCase() &&
        Math.abs((x.areaM2 || 0) - (r.areaM2 || 0)) < 1.0
      );
      if (!existing) {
        context.rooms.push(r);
      }
    });

    // 5. Accumulate Schedules
    context.schedules.push(...result.schedules);

    // 6. Accumulate Materials & Notes
    result.materials.forEach((m) => {
      const existing = context.materials.find((x) => x.materialName.toLowerCase() === m.materialName.toLowerCase());
      if (existing) {
        if (!existing.sourcePages.includes(pageInfo.pageNumber)) {
          existing.sourcePages.push(pageInfo.pageNumber);
        }
      } else {
        context.materials.push({
          materialName: m.materialName,
          sourcePages: [pageInfo.pageNumber],
          specification: m.specification || '',
        });
      }
    });

    result.notes.forEach((n) => {
      context.notes.push({ text: n, pageNumber: pageInfo.pageNumber });
    });
  }
}

export const dedDocumentReader = DedDocumentReader.getInstance();
