/**
 * EZRAB DED -> RAB V2: Page Visual Reader
 *
 * STEP 2 & 3: PAGE-BY-PAGE VISUAL READING & DOCUMENT UNDERSTANDING
 *
 * Core Principles:
 * - EVERY PAGE MUST BE VISUALLY READ.
 * - Do NOT assume one Vision call = entire DED understood.
 * - Explicitly track: pagesExpected, pagesProcessed, pagesFailed, pagesSkipped.
 * - If pagesProcessed < pagesExpected: document is marked NOT COMPLETE.
 * - Returns structured PageObservationModel per page.
 */

import {
  DocumentPage,
  PageObservationModel,
  PageReadingProgress,
  DrawingType,
  EvidenceRecord,
} from '../types';
import { DedProcessingConfig } from '../config/dedModeConfig';
import { zyrouterClient } from './zyrouterClient';

const PAGE_UNDERSTANDING_SYSTEM_PROMPT = `YOU ARE AN EXPERT CONSTRUCTION DED (Detail Engineering Design) VISUAL ANALYZER.
YOUR FIRST AND PRIMARY JOB IS TO THOROUGHLY UNDERSTAND THE DRAWING PAGE.

DO NOT ATTEMPT TO CREATE A FINAL RAB AT THIS STAGE.
FOCUS EXCLUSIVELY ON EXTRACTING COMPLETE, OBJECTIVE VISUAL OBSERVATIONS FROM THIS DRAWING.

FOR EACH PAGE, EXTRACT:
1. Drawing metadata: title, drawing number, drawing type (FLOOR_PLAN, FOUNDATION_PLAN, SECTION, ELEVATION, DETAIL, SCHEDULE, etc.).
2. Visible annotations, notes, specifications, dimensions, and elevations.
3. Rooms and architectural spaces with their stated dimensions.
4. Structural elements (Pondasi, Sloof, Kolom, Balok, Ring Balok, Plat, Tangga, etc.) and tags (e.g. SL1, K1, P1).
5. Architectural elements (Dinding bata/hebel, Plesteran, Acian, Keramik lantai, Plafon, Atap, Kusen pintu/jendela).
6. Materials referenced (Semen, pasir, batu kali, beton K-225, besi tulangan, bata ringan, gypsum, baja ringan).
7. Cross-page references: tags or pointers pointing to other detail sheets, sections, or schedules.
8. Raw evidence snippets with coordinates/descriptions.

STRICT ACCURACY RULES:
- Never fabricate dimensions. If a dimension is not explicitly labeled, set value to null.
- Nominal rebar diameters (e.g. Ø10, Ø12) are bar sizes, NOT total work quantities.
- Dimensions must be reported in meters (m) for length/width/height, m² for area, m³ for volume, or count (unit/titik).`;

export class PageVisualReader {
  private static instance: PageVisualReader;

  private constructor() {}

  public static getInstance(): PageVisualReader {
    if (!PageVisualReader.instance) {
      PageVisualReader.instance = new PageVisualReader();
    }
    return PageVisualReader.instance;
  }

  /**
   * Visually reads every page in sequence or controlled concurrency.
   */
  public async readPages(
    pages: DocumentPage[],
    config: DedProcessingConfig,
    onPageProgress?: (current: number, total: number, message: string) => void
  ): Promise<{
    pageObservations: PageObservationModel[];
    progress: PageReadingProgress;
  }> {
    const pagesExpected = pages.length;
    let pagesProcessed = 0;
    let pagesFailed = 0;
    let pagesSkipped = 0;

    const pageObservations: PageObservationModel[] = [];

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const pageNum = page.pageNumber || (i + 1);

      if (onPageProgress) {
        onPageProgress(i + 1, pagesExpected, `Membaca visual Halaman ${pageNum} dari ${pagesExpected}...`);
      }

      // Check for non-empty page
      if (page.nonEmptyPixelCheck === false && !page.imageDataUrl) {
        pagesSkipped++;
        continue;
      }

      try {
        const observation = await this.analyzePageVisual(page, config);
        pageObservations.push(observation);
        pagesProcessed++;
      } catch (err: any) {
        console.error(`[PageVisualReader] Failed reading page ${pageNum}:`, err.message || err);
        pagesFailed++;
        // Create minimal failed observation model so page tracking remains intact
        pageObservations.push({
          pageId: page.id || `page-${pageNum}`,
          pageNumber: pageNum,
          drawingTitle: page.drawingTitle || `Halaman ${pageNum}`,
          drawingType: page.drawingType || 'OTHER',
          observations: [{
            id: `OBS-P${pageNum}-ERR`,
            type: 'READING_ERROR',
            description: `Gagal membaca halaman ${pageNum}: ${err.message || 'AI Provider Error'}`,
            confidence: 0,
            evidenceText: 'READING_ERROR',
          }],
          dimensions: [],
          constructionElements: [],
          materials: [],
          notes: [`Error membaca halaman visual: ${err.message || 'Unknown'}`],
          referencesToOtherPages: [],
          rawEvidence: [],
        });
      }
    }

    const isComplete = pagesProcessed === pagesExpected && pagesFailed === 0;

    const progress: PageReadingProgress = {
      pagesExpected,
      pagesProcessed,
      pagesFailed,
      pagesSkipped,
      isComplete,
    };

    return {
      pageObservations,
      progress,
    };
  }

  /**
   * Analyzes an individual page image using Multimodal Vision.
   */
  public async analyzePageVisual(
    page: DocumentPage,
    config: DedProcessingConfig
  ): Promise<PageObservationModel> {
    const pageNum = page.pageNumber;

    const prompt = `DOCUMENT UNDERSTANDING: DETAILED PAGE ANALYSIS (Halaman ${pageNum})
Baca gambar teknik konstruksi pada halaman ini secara mendalam dan menyeluruh.
Identifikasi seluruh teks, notasi, dimensi, ruangan, elemen struktur, elemen arsitektur, dan referensi lembar lain.

Kembalikan respon JSON dalam format terstruktur:
{
  "pageNumber": ${pageNum},
  "drawingTitle": "string (Judul gambar / denah pada kop gambar)",
  "drawingNumber": "string (Nomor lembar gambar jika ada, misal ARS-01 atau STR-02)",
  "drawingType": "FLOOR_PLAN" | "FOUNDATION_PLAN" | "ROOF_PLAN" | "SECTION" | "ELEVATION" | "DETAIL" | "SCHEDULE" | "OTHER",
  "observations": [
    {
      "id": "OBS-01",
      "type": "ROOM" | "STRUCTURE" | "WALL" | "FINISH" | "OPENING" | "MEP" | "NOTE",
      "description": "string uraian pengamatan visual",
      "confidence": 0.95,
      "evidenceText": "Kutipan teks / dimensi yang terlihat di gambar"
    }
  ],
  "dimensions": [
    {
      "name": "string (misal: Panjang Pondasi As A-D, Lebar Denah, Tinggi Dinding)",
      "value": number | null,
      "unit": "m" | "m2" | "m3" | "cm" | "mm",
      "confidence": 0.95,
      "rawText": "string kutipan label asli"
    }
  ],
  "constructionElements": [
    {
      "name": "string (misal: Pondasi Batu Belah, Sloof SL1, Kolom K1, Pasangan Dinding Bata)",
      "category": "STRUCTURE" | "WALL" | "FLOOR_FINISH" | "CEILING" | "ROOF" | "DOOR_WINDOW" | "SANITARY" | "MEP" | "EARTHWORK",
      "specification": "string (misal: 15x20 cm K-225, Mortar 1:4, Tebal 10 cm)",
      "material": "string",
      "dimensions": { "length": number | null, "width": number | null, "height": number | null, "area": number | null, "count": number | null },
      "confidence": 0.92
    }
  ],
  "materials": [
    {
      "name": "string (misal: Batu belah, Semen Portland, Pasir Pasang, Besi Ulir D10)",
      "spec": "string",
      "confidence": 0.90
    }
  ],
  "notes": ["string catatan teknis pada gambar"],
  "referencesToOtherPages": [
    {
      "targetDrawing": "string (misal: Detail Pondasi Potongan A-A)",
      "targetSheet": "string",
      "tag": "string (misal: SL1, K1, P1, J1)",
      "relationship": "SPECIFICATION" | "DETAIL_CROSS_SECTION" | "SCHEDULE"
    }
  ]
}`;

    const res = await zyrouterClient.chat({
      prompt,
      systemPrompt: PAGE_UNDERSTANDING_SYSTEM_PROMPT,
      providerId: config.provider,
      model: config.model,
      reasoningLevel: 'low',
      imageDataBase64: page.imageDataUrl,
      imageMimeType: page.imageMimeType || 'image/png',
      jsonMode: true,
      pageNumber: pageNum,
      pass: 1,
    });

    const parsed = res.structuredJson || {};

    const rawEvidence: EvidenceRecord[] = [];
    let evSeq = 1;

    // Collect dimensions into raw evidence
    const dims = Array.isArray(parsed.dimensions) ? parsed.dimensions : [];
    for (const d of dims) {
      if (d && d.name) {
        rawEvidence.push({
          id: `EV-P${pageNum}-${String(evSeq++).padStart(3, '0')}`,
          sourceDocumentId: page.documentId || 'doc',
          sourceFileName: page.documentId || 'DED',
          pageNumber: pageNum,
          type: 'DIMENSION',
          content: `${d.name}: ${d.value ?? 'N/A'} ${d.unit || 'm'} (${d.rawText || ''})`,
          unit: d.unit || 'm',
          confidence: typeof d.confidence === 'number' ? d.confidence : 0.9,
        });
      }
    }

    // Collect construction elements into raw evidence
    const elements = Array.isArray(parsed.constructionElements) ? parsed.constructionElements : [];
    for (const el of elements) {
      if (el && el.name) {
        rawEvidence.push({
          id: `EV-P${pageNum}-${String(evSeq++).padStart(3, '0')}`,
          sourceDocumentId: page.documentId || 'doc',
          sourceFileName: page.documentId || 'DED',
          pageNumber: pageNum,
          type: 'SPECIFICATION',
          content: `${el.name} [${el.category || 'WORK'}]: ${el.specification || ''}`,
          confidence: typeof el.confidence === 'number' ? el.confidence : 0.9,
          references: [el.name],
        });
      }
    }

    // Collect observations
    const obsList = Array.isArray(parsed.observations) ? parsed.observations : [];
    const observations = obsList.map((o: any, idx: number) => ({
      id: o.id || `OBS-P${pageNum}-${idx + 1}`,
      type: String(o.type || 'NOTE'),
      description: String(o.description || ''),
      confidence: typeof o.confidence === 'number' ? o.confidence : 0.9,
      sourceRegion: o.sourceRegion,
      evidenceText: String(o.evidenceText || o.description || ''),
    }));

    return {
      pageId: page.id || `page-${pageNum}`,
      pageNumber: pageNum,
      drawingTitle: String(parsed.drawingTitle || page.drawingTitle || `Halaman ${pageNum}`).trim(),
      drawingNumber: parsed.drawingNumber ? String(parsed.drawingNumber).trim() : undefined,
      drawingType: (parsed.drawingType as DrawingType) || page.drawingType || 'OTHER',
      observations,
      dimensions: dims.map((d: any) => ({
        name: String(d.name || ''),
        value: typeof d.value === 'number' ? d.value : null,
        unit: String(d.unit || 'm'),
        confidence: typeof d.confidence === 'number' ? d.confidence : 0.9,
        rawText: d.rawText ? String(d.rawText) : undefined,
      })),
      constructionElements: elements.map((el: any) => ({
        name: String(el.name || ''),
        category: String(el.category || 'STRUCTURE'),
        specification: el.specification ? String(el.specification) : undefined,
        material: el.material ? String(el.material) : undefined,
        dimensions: el.dimensions && typeof el.dimensions === 'object' ? el.dimensions : {},
        confidence: typeof el.confidence === 'number' ? el.confidence : 0.9,
      })),
      materials: Array.isArray(parsed.materials)
        ? parsed.materials.map((m: any) => ({
            name: String(m.name || ''),
            spec: String(m.spec || ''),
            confidence: typeof m.confidence === 'number' ? m.confidence : 0.9,
          }))
        : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes.map(String) : [],
      referencesToOtherPages: Array.isArray(parsed.referencesToOtherPages)
        ? parsed.referencesToOtherPages.map((r: any) => ({
            targetDrawing: String(r.targetDrawing || ''),
            targetSheet: r.targetSheet ? String(r.targetSheet) : undefined,
            tag: String(r.tag || ''),
            relationship: String(r.relationship || 'SPECIFICATION'),
          }))
        : [],
      rawEvidence,
    };
  }
}

export const pageVisualReader = PageVisualReader.getInstance();
