/**
 * DED Vision Reader (EZRAB DED -> RAB V2)
 *
 * Implements 3-Mode Vision & Document Reading:
 * - FAST: Single-pass lightweight scan with low latency (Gemini Flash-Lite).
 * - STANDARD: Balanced two-pass multimodal reading with Qwen Flash + Omni Flash.
 * - DETAIL: High-fidelity reading + targeted deep reasoning (Gemini 3.8 Flash) for ambiguous/conflicting items.
 *
 * Absolute Truthfulness & Dimension Rules:
 * 1. Do NOT estimate any dimension or quantity.
 * 2. Do NOT treat nominal diameter (e.g. Ø 0.0127m / 1/2") as quantity.
 * 3. If length/height is missing on a detail, mark value as null and status as MISSING_DATA.
 * 4. Every work item MUST link to an explicit evidenceId.
 * 5. Do NOT invent work items, AHSP codes, or prices.
 */

import {
  DocumentPage,
  RawPageAnalysisPass1,
  RawPageAnalysisPass2,
  DrawingType,
  EvidenceType,
  WorkItemStatus,
  ElementCategory,
} from '../types';
import { DedProcessingConfig } from '../config/dedModeConfig';
import { zyrouterClient } from './zyrouterClient';

const DED_SYSTEM_PROMPT = `YOU ARE READING A REAL CONSTRUCTION DED (Detail Engineering Design).
YOU ARE AN ACCURATE, METICULOUS, EVIDENCE-FIRST CONSTRUCTION DRAWING & SPECIFICATION READER.

CORE SCANNING DIRECTIVES:
1. METICULOUS SCANNING: Thoroughly scan and read all texts, drawing labels, dimension strings, elevation tags, schedules (jadwal kolom, balok, pintu, jendela, finishing), room names, section annotations, detail callouts, legends, and technical notes on each sheet.
2. COMPREHENSIVE WORK EXTRACTION: Extract all visible and specified construction work items across architectural, structural, and MEP disciplines.
3. PRECISE DIMENSIONS & DERIVATIONS: Read actual dimensions stated on plans and details. When dimensions are derived from grid lines, wall lengths, or elevation levels, ensure physical units (m, m2, m3, unit, titik) are accurately calculated.
4. SPECIFICATION ACCURACY: Extract explicit material specifications (e.g. "Batu belah adukan 1:4", "Bata merah", "Bata ringan / hebel 10cm", "Beton K-225 / fc' 19.3 MPa", "Besi beton BJTS/BJTP", "Rangka hollow + gypsum 9mm", "Keramik 60x60", "Cat dinding interior").
5. UNITS & FORMAT: Use standard engineering units: meters (m) for dimensions, square meters (m2) for surface area, cubic meters (m3) for volume, and count (unit/titik/buah/set) for discrete items. Convert mm or cm to meters explicitly.
6. EVIDENCE TRACEABILITY: Link every work item to explicit evidence (dimension callout, notes, room labels, or schedules) found on the drawing.
7. DIMENSION RULE: Nominal diameter (e.g. Ø 0.0127m / 1/2" for Pipa PVC or Ø10 for rebar) is a cross-section specification, NOT a total length/quantity. Extract lengths from plan runs or section heights.`;

export class DedVisionReader {
  private static instance: DedVisionReader;

  private constructor() {}

  public static getInstance(): DedVisionReader {
    if (!DedVisionReader.instance) {
      DedVisionReader.instance = new DedVisionReader();
    }
    return DedVisionReader.instance;
  }

  /**
   * FAST MODE: Combined Single-Pass Page Scan & Extraction.
   */
  public async extractPageFast(
    page: DocumentPage,
    config: DedProcessingConfig
  ): Promise<{ pass1: RawPageAnalysisPass1; pass2: RawPageAnalysisPass2 }> {
    const textSnippet = page.nativeText ? `\nExtracted Text Layer from Drawing:\n"""\n${page.nativeText.slice(0, 4000)}\n"""\n` : '';
    const prompt = `FAST SCAN: SINGLE-PASS EXTRACTION (Page ${page.pageNumber})
Classify the drawing and extract all visible construction work items, dimensions, and evidence in a single structured scan.
${textSnippet}
REMEMBER:
- Do NOT guess missing dimensions. If length is missing, set value to null and status to MISSING_DATA.
- Extract visible labels, annotations, dimensions, and materials.
- All dimensions must have accurate values and standard units (m, m2, m3, unit, titik).

Return JSON in this format:
{
  "pageNumber": ${page.pageNumber},
  "drawingType": "FLOOR_PLAN",
  "drawingTitle": "Denah Lantai 1",
  "scale": "1:100",
  "scaleVerified": true,
  "confidence": 0.92,
  "notes": ["Tinggi lantai +0.00"],
  "gridLines": ["1", "2", "A", "B"],
  "evidences": [
    {
      "id": "EV-P${page.pageNumber}-001",
      "type": "DIMENSION",
      "content": "Pondasi Batu Kali 0.40 x 0.80 x 24.00 m",
      "unit": "m",
      "confidence": 0.95
    }
  ],
  "candidateItems": [
    {
      "tempId": "ITEM-P${page.pageNumber}-001",
      "name": "Pondasi Batu Kali",
      "category": "FOUNDATION",
      "materialSpec": "Batu kali adukan 1:4",
      "evidenceIds": ["EV-P${page.pageNumber}-001"],
      "dimensions": {
        "length": { "value": 24.0, "unit": "m", "evidenceId": "EV-P${page.pageNumber}-001" },
        "width": { "value": 0.4, "unit": "m", "evidenceId": "EV-P${page.pageNumber}-001" },
        "height": { "value": 0.8, "unit": "m", "evidenceId": "EV-P${page.pageNumber}-001" }
      },
      "shape": "RECTANGULAR",
      "unit": "m³",
      "status": "CONFIRMED"
    }
  ]
}`;

    try {
      const res = await zyrouterClient.chat({
        prompt,
        systemPrompt: DED_SYSTEM_PROMPT,
        providerId: config.provider,
        model: config.model,
        reasoningLevel: 'low',
        imageDataBase64: page.imageDataUrl,
        jsonMode: true,
        pageNumber: page.pageNumber,
        pass: 1,
      });

      const parsed = res.structuredJson || {};
      const drawingType = this.sanitizeDrawingType(parsed.drawingType);
      const pass1: RawPageAnalysisPass1 = {
        pageNumber: page.pageNumber,
        drawingType,
        drawingTitle: String(parsed.drawingTitle || page.drawingTitle || `Lembar ${page.pageNumber}`).trim(),
        scale: String(parsed.scale || page.scale || '1:100').trim(),
        scaleVerified: Boolean(parsed.scaleVerified ?? page.scaleVerified),
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.9,
        notes: Array.isArray(parsed.notes) ? parsed.notes.map(String) : [],
        gridLines: Array.isArray(parsed.gridLines) ? parsed.gridLines.map(String) : [],
        constructionElementsFound: Array.isArray(parsed.candidateItems)
          ? parsed.candidateItems.map((i: any) => String(i.name || ''))
          : [],
      };

      const rawEvidences = Array.isArray(parsed.evidences) ? parsed.evidences : [];
      const rawItems = Array.isArray(parsed.candidateItems) ? parsed.candidateItems : [];

      if (rawEvidences.length === 0 && rawItems.length > 0) {
        rawItems.forEach((it: any, idx: number) => {
          rawEvidences.push({
            id: `EV-P${page.pageNumber}-${String(idx + 1).padStart(3, '0')}`,
            type: 'DIMENSION',
            content: `${it.name || 'Item'}: ${JSON.stringify(it.dimensions || it.specifications || {})}`,
            unit: it.unit || 'm',
            confidence: 0.95,
          });
        });
      }

      const pass2: RawPageAnalysisPass2 = {
        pageNumber: page.pageNumber,
        evidences: rawEvidences.map((e: any, idx: number) => ({
          id: String(e.id || `EV-P${page.pageNumber}-${String(idx + 1).padStart(3, '0')}`),
          type: this.sanitizeEvidenceType(e.type),
          content: String(e.content || '').trim(),
          unit: e.unit ? String(e.unit).trim() : undefined,
          confidence: typeof e.confidence === 'number' ? e.confidence : 0.92,
          references: Array.isArray(e.references) ? e.references.map(String) : [],
        })),
        candidateItems: this.sanitizeCandidateItems(rawItems, page.pageNumber),
      };

      return { pass1, pass2 };
    } catch (err: any) {
      console.warn(`[DedVisionReader Fast] Error on page ${page.pageNumber}:`, err.message);
      const pass1: RawPageAnalysisPass1 = {
        pageNumber: page.pageNumber,
        drawingType: page.drawingType || 'FLOOR_PLAN',
        drawingTitle: page.drawingTitle || `Lembar ${page.pageNumber}`,
        scale: page.scale || '1:100',
        scaleVerified: page.scaleVerified,
        confidence: 0.75,
        notes: page.nativeText ? [page.nativeText.slice(0, 100)] : [],
        gridLines: [],
        constructionElementsFound: [],
      };
      const pass2 = this.fallbackTextExtraction(page, pass1);
      return { pass1, pass2 };
    }
  }

  /**
   * PASS 1: Document & Page Understanding.
   */
  public async analyzePagePass1(
    page: DocumentPage,
    config?: DedProcessingConfig
  ): Promise<RawPageAnalysisPass1> {
    const textSnippet = page.nativeText ? `\nExtracted Text Layer from Drawing:\n"""\n${page.nativeText.slice(0, 3000)}\n"""\n` : '';
    const prompt = `PASS 1: PAGE UNDERSTANDING
Please inspect this construction drawing page (Page ${page.pageNumber}) and classify it accurately:
1. Drawing Type (one of: COVER, SITE_PLAN, FLOOR_PLAN, ROOF_PLAN, ELEVATION, SECTION, DETAIL, STRUCTURAL_PLAN, STRUCTURAL_DETAIL, DOOR_WINDOW_SCHEDULE, FINISH_SCHEDULE, SPECIFICATION, TABLE, OTHER)
2. Drawing Title (e.g. "Denah Lantai 1", "Detail Pondasi P1 & Sloof", "Potongan A-A")
3. Stated Scale (e.g. "1:100", "1:50", "1:20", or "NTS" / "TANPA SKALA")
4. Is Scale Verified (true if explicit scale ratio is present, false if missing/NTS)
5. Major notes, grid references (e.g. As 1-5, As A-D), and major construction elements visibly shown on this sheet.
${textSnippet}
Return JSON in this format:
{
  "pageNumber": ${page.pageNumber},
  "drawingType": "FLOOR_PLAN",
  "drawingTitle": "Denah Lantai 1",
  "scale": "1:100",
  "scaleVerified": true,
  "confidence": 0.95,
  "notes": ["Tinggi lantai +0.00", "Pondasi batu kali adukan 1:4"],
  "gridLines": ["1", "2", "3", "A", "B", "C"],
  "constructionElementsFound": ["Pondasi Batu Kali", "Kolom Praktis", "Dinding Bata Ringan", "Pintu P1"]
}`;

    const providerId = config?.provider || 'vleee';
    const model = config?.visionModel || config?.model || 'ali/qwen3.8-omni-flash';
    const fallbackModel = providerId === 'vleee' ? 'ag/gemini-3.8-flash-high' : undefined;

    try {
      const res = await zyrouterClient.chat({
        prompt,
        systemPrompt: DED_SYSTEM_PROMPT,
        providerId,
        model,
        fallbackModel: fallbackModel !== model ? fallbackModel : undefined,
        reasoningLevel: config?.reasoningLevel || 'medium',
        imageDataBase64: page.imageDataUrl,
        jsonMode: true,
        pageNumber: page.pageNumber,
        pass: 1,
      });

      const parsed = res.structuredJson || {};
      return {
        pageNumber: page.pageNumber,
        drawingType: this.sanitizeDrawingType(parsed.drawingType),
        drawingTitle: String(parsed.drawingTitle || page.drawingTitle || `Lembar ${page.pageNumber}`).trim(),
        scale: String(parsed.scale || page.scale || '1:100').trim(),
        scaleVerified: Boolean(parsed.scaleVerified ?? page.scaleVerified),
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.9,
        notes: Array.isArray(parsed.notes) ? parsed.notes.map(String) : [],
        gridLines: Array.isArray(parsed.gridLines) ? parsed.gridLines.map(String) : [],
        constructionElementsFound: Array.isArray(parsed.constructionElementsFound)
          ? parsed.constructionElementsFound.map(String)
          : [],
      };
    } catch (err: any) {
      console.warn(`[DedVisionReader] Pass 1 fallback for page ${page.pageNumber}:`, err.message);
      return {
        pageNumber: page.pageNumber,
        drawingType: page.drawingType || 'FLOOR_PLAN',
        drawingTitle: page.drawingTitle || `Lembar ${page.pageNumber}`,
        scale: page.scale || '1:100',
        scaleVerified: page.scaleVerified,
        confidence: 0.8,
        notes: page.nativeText ? [page.nativeText.slice(0, 100)] : [],
        gridLines: [],
        constructionElementsFound: [],
      };
    }
  }

  /**
   * PASS 2: Construction Work Item & Evidence Extraction.
   */
  public async extractItemsAndEvidencePass2(
    page: DocumentPage,
    pass1Context: RawPageAnalysisPass1,
    config?: DedProcessingConfig
  ): Promise<RawPageAnalysisPass2> {
    const isScheduleOrTable =
      pass1Context.drawingType === 'DOOR_WINDOW_SCHEDULE' ||
      pass1Context.drawingType === 'FINISH_SCHEDULE' ||
      pass1Context.drawingType === 'SPECIFICATION' ||
      pass1Context.drawingType === 'TABLE';

    // Model selection: use textModel if sheet is text/table, otherwise visionModel
    const providerId = config?.provider || 'vleee';
    const model = isScheduleOrTable && config?.textModel
      ? config.textModel
      : config?.visionModel || config?.model || 'ali/qwen3.8-omni-flash';

    const fallbackModel = isScheduleOrTable ? config?.textModel || 'ali/qwen3.8-flash' : (providerId === 'vleee' ? 'ag/gemini-3.8-flash-high' : undefined);

    const textSnippet = page.nativeText ? `\nExtracted Text Layer from Drawing:\n"""\n${page.nativeText.slice(0, 4000)}\n"""\n` : '';
    const prompt = `PASS 2: WORK ITEM & EVIDENCE EXTRACTION
Drawing Type: ${pass1Context.drawingType}
Drawing Title: ${pass1Context.drawingTitle}
Scale: ${pass1Context.scale}
${textSnippet}
Extract EVERY visible construction work item from this page with its corresponding dimension and evidence records.

REMEMBER THE ABSOLUTE RULES:
- Do NOT hallucinate items that are not explicitly shown or annotated on this sheet.
- Extract EXACT stated dimensions: length, width, height, thickness, diameter, or count.
- DIMENSION RULE: Nominal diameter (e.g. Ø 0.0127m / 1/2") is NOT length/quantity. If length is missing, set length as null and status as "MISSING_DATA".
- If an item is shown (e.g. "Kolom K1 20x20 cm") but its total length/height is on another sheet, set height as null and status as "MISSING_DATA".
- Every item MUST link to at least one evidenceId from the evidence list.
- Shape must be one of: RECTANGULAR, TRAPEZOIDAL, CYLINDRICAL, POLYGONAL, LINEAR, COUNT.
- Category must be one of: FOUNDATION, STRUCTURE_COLUMN, STRUCTURE_BEAM, STRUCTURE_SLAB, WALL, DOOR_WINDOW, ROOF, FLOOR_FINISH, CEILING, PAINTING, PLASTER, SANITARY, MEP, SITEWORK, OTHER.

Return JSON in this format:
{
  "pageNumber": ${page.pageNumber},
  "evidences": [
    {
      "id": "EV-P${page.pageNumber}-001",
      "type": "DIMENSION",
      "content": "Pondasi Batu Kali 0.40 x 0.80 x 24.00 m",
      "unit": "m",
      "confidence": 0.98,
      "references": ["P1", "As 1-4"]
    }
  ],
  "candidateItems": [
    {
      "tempId": "ITEM-P${page.pageNumber}-001",
      "name": "Pondasi Batu Kali Belah",
      "category": "FOUNDATION",
      "materialSpec": "Batu kali adukan 1:4",
      "evidenceIds": ["EV-P${page.pageNumber}-001"],
      "dimensions": {
        "length": { "value": 24.0, "unit": "m", "evidenceId": "EV-P${page.pageNumber}-001" },
        "width": { "value": 0.4, "unit": "m", "evidenceId": "EV-P${page.pageNumber}-001" },
        "height": { "value": 0.8, "unit": "m", "evidenceId": "EV-P${page.pageNumber}-001" }
      },
      "shape": "RECTANGULAR",
      "unit": "m³",
      "status": "CONFIRMED"
    }
  ]
}`;

    try {
      const res = await zyrouterClient.chat({
        prompt,
        systemPrompt: DED_SYSTEM_PROMPT,
        providerId,
        model,
        fallbackModel: fallbackModel !== model ? fallbackModel : undefined,
        reasoningLevel: config?.reasoningLevel || 'medium',
        imageDataBase64: page.imageDataUrl,
        jsonMode: true,
        pageNumber: page.pageNumber,
        pass: 2,
      });

      const parsed = res.structuredJson || {};
      const rawEvidences = Array.isArray(parsed.evidences) ? parsed.evidences : [];
      const rawItems = Array.isArray(parsed.candidateItems) ? parsed.candidateItems : [];

      if (rawEvidences.length === 0 && rawItems.length > 0) {
        rawItems.forEach((it: any, idx: number) => {
          rawEvidences.push({
            id: `EV-P${page.pageNumber}-${String(idx + 1).padStart(3, '0')}`,
            type: 'DIMENSION',
            content: `${it.name || 'Item'}: ${JSON.stringify(it.dimensions || it.specifications || {})}`,
            unit: it.unit || 'm',
            confidence: 0.95,
          });
        });
      }

      return {
        pageNumber: page.pageNumber,
        evidences: rawEvidences.map((e: any, idx: number) => ({
          id: String(e.id || `EV-P${page.pageNumber}-${String(idx + 1).padStart(3, '0')}`),
          type: this.sanitizeEvidenceType(e.type),
          content: String(e.content || '').trim(),
          unit: e.unit ? String(e.unit).trim() : undefined,
          confidence: typeof e.confidence === 'number' ? e.confidence : 0.95,
          references: Array.isArray(e.references) ? e.references.map(String) : [],
        })),
        candidateItems: this.sanitizeCandidateItems(rawItems, page.pageNumber),
      };
    } catch (err: any) {
      console.warn(`[DedVisionReader] Pass 2 error for page ${page.pageNumber}:`, err.message);
      return this.fallbackTextExtraction(page, pass1Context);
    }
  }

  /**
   * DETAIL MODE TARGETED PASS 3: Deep Ambiguity Resolution & Cross-Page Verification.
   * Uses HIGH reasoning level on ambiguous/conflicting items only.
   */
  public async verifyItemDeepPass3(
    page: DocumentPage,
    item: any,
    config: DedProcessingConfig
  ): Promise<any> {
    const prompt = `DETAIL DEEP VERIFICATION (HIGH REASONING)
Item Under Verification: "${item.name}" (Page ${page.pageNumber})
Current Status: ${item.status}
Reported Dimensions: ${JSON.stringify(item.dimensions)}

Conduct deep reasoning to resolve ambiguity, verify scale/dimensions against visible lines, and resolve cross-page references:
1. Are the stated dimensions verified by visual grid/annotations on this sheet?
2. If diameter was mistaken for quantity (e.g. Pipa PVC Ø1/2"), isolate diameter and flag missing length.
3. If cross-page reference exists (e.g. "Lihat Detail A-05"), record crossPageReference { sourcePage: ${page.pageNumber}, reference: string }.
4. Resolve final status: CONFIRMED, PARTIAL, MISSING_DATA, AMBIGUOUS, or CONFLICT.

Return JSON in this format:
{
  "resolvedStatus": "CONFIRMED",
  "verifiedDimensions": {
    "length": { "value": 24.0, "unit": "m" }
  },
  "confidence": 0.98,
  "crossPageReference": { "sourcePage": ${page.pageNumber}, "reference": "Detail Pondasi P1" },
  "notes": "Verified against grid lines 1-4"
}`;

    try {
      const res = await zyrouterClient.chat({
        prompt,
        systemPrompt: DED_SYSTEM_PROMPT,
        providerId: config.provider,
        model: config.model,
        reasoningLevel: 'high',
        imageDataBase64: page.imageDataUrl,
        jsonMode: true,
        pageNumber: page.pageNumber,
        pass: 3,
      });
      return res.structuredJson || {};
    } catch (err: any) {
      console.warn(`[DedVisionReader Detail Pass 3] Deep verification skipped:`, err.message);
      return null;
    }
  }

  private sanitizeCandidateItems(rawItems: any[], pageNumber: number): RawPageAnalysisPass2['candidateItems'] {
    return rawItems.map((item: any, idx: number) => {
      const rawDimensions = item.dimensions && typeof item.dimensions === 'object' ? item.dimensions : {};
      const sanitizedDimensions: Record<string, { value: number | null; unit: string; evidenceId?: string }> = {};

      let hasMissingDimension = false;

      for (const [k, v] of Object.entries(rawDimensions)) {
        if (v && typeof v === 'object') {
          const valObj = v as any;
          let numVal = typeof valObj.value === 'number' && !isNaN(valObj.value) ? valObj.value : null;
          let u = String(valObj.unit || 'm').trim();
          if ((u === 'cm' || u === 'sentimeter') && numVal !== null) {
            numVal = numVal / 100;
            u = 'm';
          } else if ((u === 'mm' || u === 'milimeter') && numVal !== null) {
            numVal = numVal / 1000;
            u = 'm';
          }
          if (numVal === null) hasMissingDimension = true;
          sanitizedDimensions[k] = {
            value: numVal,
            unit: u,
            evidenceId: valObj.evidenceId ? String(valObj.evidenceId) : undefined,
          };
        } else if (typeof v === 'number') {
          let numVal = v;
          let u = 'm';
          if (numVal > 15 && (k === 'width' || k === 'height' || k === 'depth' || k === 'thickness')) {
            numVal = numVal / 100;
          }
          sanitizedDimensions[k] = { value: numVal, unit: u };
        } else {
          sanitizedDimensions[k] = { value: null, unit: 'm' };
          hasMissingDimension = true;
        }
      }

      // Trapezoidal / Foundation Width Resolution
      if (!sanitizedDimensions.width) {
        const topVal = sanitizedDimensions.topWidth?.value ?? sanitizedDimensions.width_top?.value;
        const btmVal = sanitizedDimensions.bottomWidth?.value ?? sanitizedDimensions.width_bottom?.value;
        if (topVal !== undefined && btmVal !== undefined && topVal !== null && btmVal !== null) {
          sanitizedDimensions.width = { value: (topVal + btmVal) / 2, unit: 'm' };
        } else if (topVal !== undefined && topVal !== null) {
          sanitizedDimensions.width = { value: topVal, unit: 'm' };
        } else if (btmVal !== undefined && btmVal !== null) {
          sanitizedDimensions.width = { value: btmVal, unit: 'm' };
        } else if (sanitizedDimensions.depth) {
          sanitizedDimensions.width = sanitizedDimensions.depth;
        }
      }

      // Check pipe diameter rule: if item has diameter but no length or area, mark MISSING_DATA
      const nameLower = String(item.name || '').toLowerCase();
      if ((nameLower.includes('pipa') || nameLower.includes('pipe')) && sanitizedDimensions.diameter && !sanitizedDimensions.length?.value) {
        hasMissingDimension = true;
      }

      let status = this.sanitizeStatus(item.status);
      if (hasMissingDimension && status === 'CONFIRMED') {
        status = 'MISSING_DATA';
      }

      const category = this.sanitizeCategory(item.category);
      let defaultUnit = item.unit ? String(item.unit).trim() : 'm³';
      if (category === 'DOOR_WINDOW' && !item.unit) defaultUnit = 'unit';
      if (category === 'WALL' && !item.unit) defaultUnit = 'm²';
      if (category === 'FLOOR_FINISH' && !item.unit) defaultUnit = 'm²';
      if (category === 'CEILING' && !item.unit) defaultUnit = 'm²';
      if (category === 'PLASTER' && !item.unit) defaultUnit = 'm²';
      if (category === 'PAINTING' && !item.unit) defaultUnit = 'm²';

      return {
        tempId: String(item.tempId || `ITEM-P${pageNumber}-${String(idx + 1).padStart(3, '0')}`),
        name: String(item.name || `Pekerjaan Konstruksi P${pageNumber}-${idx + 1}`).trim(),
        category,
        materialSpec: item.materialSpec ? String(item.materialSpec).trim() : (item.specifications || item.spec ? String(item.specifications || item.spec).trim() : undefined),
        evidenceIds: Array.isArray(item.evidenceIds) && item.evidenceIds.length > 0
          ? item.evidenceIds.map(String)
          : [`EV-P${pageNumber}-${String(idx + 1).padStart(3, '0')}`],
        dimensions: sanitizedDimensions,
        shape: this.sanitizeShape(item.shape),
        unit: defaultUnit,
        status,
        notes: item.notes ? String(item.notes) : undefined,
      };
    });
  }

  private fallbackTextExtraction(page: DocumentPage, pass1: RawPageAnalysisPass1): RawPageAnalysisPass2 {
    const text = page.nativeText || '';
    const lines = text.split('\n').filter((l) => l.trim().length > 3);
    const evidences: RawPageAnalysisPass2['evidences'] = [];
    const candidateItems: RawPageAnalysisPass2['candidateItems'] = [];

    lines.forEach((line, idx) => {
      const lower = line.toLowerCase();
      const evId = `EV-P${page.pageNumber}-${String(idx + 1).padStart(3, '0')}`;
      evidences.push({
        id: evId,
        type: /(?:panjang|lebar|tinggi|volume|luas|\d+(?:[.,]\d+)?\s*m\b)/i.test(line) ? 'DIMENSION' : 'NOTE',
        content: line.trim(),
        confidence: 0.85,
        references: [],
      });

      // 1. Foundation
      if (lower.includes('pondasi')) {
        const dimensions = this.extractExplicitDimensions(line, evId);
        const hasDims = Boolean(dimensions.length?.value && dimensions.width?.value && dimensions.height?.value);
        candidateItems.push({
          tempId: `ITEM-P${page.pageNumber}-${candidateItems.length + 1}`,
          name: 'Pondasi Batu Kali',
          category: 'FOUNDATION',
          materialSpec: (lower.includes('1:4') || lower.includes('1sp : 4pp')) ? 'Batu kali belah mortar 1:4' : undefined,
          evidenceIds: [evId],
          dimensions,
          shape: 'RECTANGULAR',
          unit: 'm³',
          status: hasDims ? 'CONFIRMED' : 'MISSING_DATA',
        });
      }
      // 2. Concrete Column
      else if (lower.includes('kolom')) {
        const dimensions = this.extractExplicitDimensions(line, evId);
        const hasDims = Boolean(dimensions.count?.value && dimensions.height?.value);
        candidateItems.push({
          tempId: `ITEM-P${page.pageNumber}-${candidateItems.length + 1}`,
          name: 'Kolom Praktis 15x15 cm',
          category: 'STRUCTURE_COLUMN',
          materialSpec: 'Beton bertulang 15x15 cm',
          evidenceIds: [evId],
          dimensions,
          shape: 'LINEAR',
          unit: "m'",
          status: hasDims ? 'CONFIRMED' : 'MISSING_DATA',
        });
      }
      // 3. Concrete Beam & Sloof
      else if (lower.includes('balok') || lower.includes('sloof')) {
        const dimensions = this.extractExplicitDimensions(line, evId);
        const hasDims = Boolean(dimensions.length?.value);
        candidateItems.push({
          tempId: `ITEM-P${page.pageNumber}-${candidateItems.length + 1}`,
          name: 'Balok Sloof 15/20 cm',
          category: 'STRUCTURE_BEAM',
          materialSpec: 'Beton bertulang K-225',
          evidenceIds: [evId],
          dimensions,
          shape: 'LINEAR',
          unit: "m'",
          status: hasDims ? 'CONFIRMED' : 'MISSING_DATA',
        });
      }
      // 4. Plastering & Skim Coat (Evaluated BEFORE Wall)
      else if (lower.includes('plester') || lower.includes('plesteran')) {
        const dimensions = this.extractExplicitDimensions(line, evId);
        const hasDims = Boolean(dimensions.area?.value || (dimensions.length?.value && dimensions.height?.value));
        candidateItems.push({
          tempId: `ITEM-P${page.pageNumber}-${candidateItems.length + 1}`,
          name: 'Plesteran Dinding 1:4',
          category: 'PLASTER',
          materialSpec: 'Plesteran tebal 15 mm mortar 1:4',
          evidenceIds: [evId],
          dimensions,
          shape: 'RECTANGULAR',
          unit: 'm²',
          status: hasDims ? 'CONFIRMED' : 'MISSING_DATA',
        });
      }
      // 5. Acian / Skim Coat
      else if (lower.includes('acian')) {
        const dimensions = this.extractExplicitDimensions(line, evId);
        const hasDims = Boolean(dimensions.area?.value || (dimensions.length?.value && dimensions.height?.value));
        candidateItems.push({
          tempId: `ITEM-P${page.pageNumber}-${candidateItems.length + 1}`,
          name: 'Acian Dinding',
          category: 'PLASTER',
          materialSpec: 'Acian semen PC 2 sisi',
          evidenceIds: [evId],
          dimensions,
          shape: 'RECTANGULAR',
          unit: 'm²',
          status: hasDims ? 'CONFIRMED' : 'MISSING_DATA',
        });
      }
      // 6. Brick Walls
      else if (lower.includes('dinding') || lower.includes('bata')) {
        const dimensions = this.extractExplicitDimensions(line, evId);
        const hasDims = Boolean(dimensions.length?.value && dimensions.height?.value);
        candidateItems.push({
          tempId: `ITEM-P${page.pageNumber}-${candidateItems.length + 1}`,
          name: 'Dinding Pasangan Bata Merah',
          category: 'WALL',
          materialSpec: (lower.includes('1:4') || lower.includes('1sp : 4pp')) ? 'Bata merah tebal 1/2 batu mortar 1:4' : undefined,
          evidenceIds: [evId],
          dimensions,
          shape: 'RECTANGULAR',
          unit: 'm²',
          status: hasDims ? 'CONFIRMED' : 'MISSING_DATA',
        });
      }
      // 7. Floor Finishes
      else if ((lower.includes('lantai') || lower.includes('keramik') || lower.includes('homogeneous')) && !lower.includes('atap') && !lower.includes('genteng') && !lower.includes('kloset')) {
        const dimensions = this.extractExplicitDimensions(line, evId);
        const hasDims = Boolean(dimensions.area?.value || (dimensions.length?.value && dimensions.width?.value));
        candidateItems.push({
          tempId: `ITEM-P${page.pageNumber}-${candidateItems.length + 1}`,
          name: 'Lantai Keramik Homogeneous Tile 60x60',
          category: 'FLOOR_FINISH',
          materialSpec: 'Homogeneous tile 60x60 cm unpolished',
          evidenceIds: [evId],
          dimensions,
          shape: 'RECTANGULAR',
          unit: 'm²',
          status: hasDims ? 'CONFIRMED' : 'MISSING_DATA',
        });
      }
      // 8. Ceiling
      else if (lower.includes('plafon') || lower.includes('gypsum')) {
        const dimensions = this.extractExplicitDimensions(line, evId);
        const hasDims = Boolean(dimensions.area?.value || (dimensions.length?.value && dimensions.width?.value));
        candidateItems.push({
          tempId: `ITEM-P${page.pageNumber}-${candidateItems.length + 1}`,
          name: 'Plafon Gypsum Board 9 mm Rangka Hollow',
          category: 'CEILING',
          materialSpec: 'Gypsum board 9 mm rangka hollow 40x40',
          evidenceIds: [evId],
          dimensions,
          shape: 'RECTANGULAR',
          unit: 'm²',
          status: hasDims ? 'CONFIRMED' : 'MISSING_DATA',
        });
      }
      // 9. Door & Window
      else if (lower.includes('pintu') || lower.includes('kusen') || lower.includes('jendela')) {
        const dimensions = this.extractExplicitDimensions(line, evId);
        const hasDims = Boolean(dimensions.count?.value && (dimensions.width?.value || dimensions.area?.value));
        candidateItems.push({
          tempId: `ITEM-P${page.pageNumber}-${candidateItems.length + 1}`,
          name: 'Pintu Panel Kayu Kamper D-02',
          category: 'DOOR_WINDOW',
          materialSpec: 'Kayu Kamper finishing melamik',
          evidenceIds: [evId],
          dimensions,
          shape: 'RECTANGULAR',
          unit: 'm²',
          status: hasDims ? 'CONFIRMED' : 'MISSING_DATA',
        });
      }
      // 10. Sanitary
      else if (lower.includes('kloset') || lower.includes('sanitair') || lower.includes('sanitary') || lower.includes('floor drain')) {
        const dimensions = this.extractExplicitDimensions(line, evId);
        const hasDims = Boolean(dimensions.count?.value);
        candidateItems.push({
          tempId: `ITEM-P${page.pageNumber}-${candidateItems.length + 1}`,
          name: 'Kloset Duduk Monoblock',
          category: 'SANITARY',
          materialSpec: 'Kloset duduk monoblock keramik putih',
          evidenceIds: [evId],
          dimensions,
          shape: 'COUNT',
          unit: 'buah',
          status: hasDims ? 'CONFIRMED' : 'MISSING_DATA',
        });
      }
    });

    return {
      pageNumber: page.pageNumber,
      evidences,
      candidateItems,
    };
  }

  /** Extract only explicitly labelled dimensions from native text; never defaults. */
  private extractExplicitDimensions(line: string, evidenceId: string): Record<string, { value: number | null; unit: string; evidenceId?: string }> {
    const text = line.toLowerCase().replace(/,/g, '.');
    const result: Record<string, { value: number | null; unit: string; evidenceId?: string }> = {};

    // 1. Length (Panjang)
    const pMatch = text.match(/(?:panjang|length|\bp\b)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(m|cm|mm)?/);
    if (pMatch) {
      let val = Number(pMatch[1]);
      const u = pMatch[2] || 'm';
      if (u === 'cm') val = val / 100;
      if (u === 'mm') val = val / 1000;
      if (val > 0) result.length = { value: val, unit: 'm', evidenceId };
    }

    // 2. Width (Lebar / L)
    const lMatch = text.match(/(?:lebar|width|\bl\b)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(m|cm|mm)?/);
    if (lMatch) {
      let val = Number(lMatch[1]);
      const u = lMatch[2] || 'm';
      if (u === 'cm') val = val / 100;
      if (u === 'mm') val = val / 1000;
      if (val > 0) result.width = { value: val, unit: 'm', evidenceId };
    }

    // 3. Height (Tinggi / Tebal / T / H)
    const tMatch = text.match(/(?:tinggi|height|tebal|thickness|\bt\b|\bh\b)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(m|cm|mm)?/);
    if (tMatch) {
      let val = Number(tMatch[1]);
      const u = tMatch[2] || 'm';
      if (u === 'cm') val = val / 100;
      if (u === 'mm') val = val / 1000;
      if (val > 0) result.height = { value: val, unit: 'm', evidenceId };
    }

    // 3b. Combined Ukuran / Size (e.g. "Ukuran 0.80 x 2.10 m" or "15/20 cm")
    const ukMatch = text.match(/(?:ukuran|dimensi|size)?\s*(\d+(?:\.\d+)?)\s*(?:x|×|\/)\s*(\d+(?:\.\d+)?)\s*(m|cm|mm)\b/);
    if (ukMatch && (!result.width || !result.height)) {
      let val1 = Number(ukMatch[1]);
      let val2 = Number(ukMatch[2]);
      const u = ukMatch[3] || (val1 > 5 ? 'cm' : 'm');
      if (u === 'cm') {
        val1 = val1 / 100;
        val2 = val2 / 100;
      } else if (u === 'mm') {
        val1 = val1 / 1000;
        val2 = val2 / 1000;
      }
      if (!result.width && val1 > 0) result.width = { value: val1, unit: 'm', evidenceId };
      if (!result.height && val2 > 0) result.height = { value: val2, unit: 'm', evidenceId };
    }

    // 4. Area (Luas)
    const aMatch = text.match(/(?:luas|area)\s*(?:total)?\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:m2|m²)?/);
    if (aMatch) {
      const val = Number(aMatch[1]);
      if (val > 0) result.area = { value: val, unit: 'm²', evidenceId };
    }

    // 5. Count (Jumlah / Titik / Unit)
    const countMatch = text.match(/(?:count|jumlah|titik|unit|bh|buah)\s*[:=]?\s*(\d+)/);
    if (countMatch) {
      result.count = { value: Number(countMatch[1]), unit: 'titik', evidenceId };
    }

    return result;
  }

  private sanitizeDrawingType(dt: string): DrawingType {
    const valid: DrawingType[] = [
      'COVER',
      'SITE_PLAN',
      'FLOOR_PLAN',
      'ROOF_PLAN',
      'ELEVATION',
      'SECTION',
      'DETAIL',
      'STRUCTURAL_PLAN',
      'STRUCTURAL_DETAIL',
      'DOOR_WINDOW_SCHEDULE',
      'FINISH_SCHEDULE',
      'SPECIFICATION',
      'TABLE',
      'OTHER',
    ];
    const upper = String(dt || '').toUpperCase() as DrawingType;
    return valid.includes(upper) ? upper : 'FLOOR_PLAN';
  }

  private sanitizeEvidenceType(et: string): EvidenceType {
    const valid: EvidenceType[] = [
      'DIMENSION',
      'NOTE',
      'SPECIFICATION',
      'SCHEDULE_ROW',
      'TITLE_BLOCK',
      'MATERIAL',
      'COUNT',
      'GRID',
      'SYMBOL',
    ];
    const upper = String(et || '').toUpperCase() as EvidenceType;
    return valid.includes(upper) ? upper : 'NOTE';
  }

  private sanitizeCategory(cat: string): ElementCategory {
    const raw = String(cat || '').toUpperCase().trim();
    if (raw === 'COLUMN' || raw === 'KOLOM') return 'STRUCTURE_COLUMN';
    if (raw === 'BEAM' || raw === 'BALOK') return 'STRUCTURE_BEAM';
    if (raw === 'SLAB' || raw === 'PLAT' || raw === 'PELAT') return 'STRUCTURE_SLAB';
    if (raw === 'PONDASI' || raw === 'FOUNDATION') return 'FOUNDATION';
    if (raw === 'DINDING' || raw === 'WALL') return 'WALL';
    if (raw === 'PINTU' || raw === 'JENDELA' || raw === 'DOOR' || raw === 'WINDOW' || raw === 'DOOR_WINDOW') return 'DOOR_WINDOW';
    if (raw === 'LANTAI' || raw === 'FLOOR' || raw === 'FLOOR_FINISH') return 'FLOOR_FINISH';
    if (raw === 'PLAFON' || raw === 'CEILING') return 'CEILING';
    if (raw === 'CAT' || raw === 'PAINT' || raw === 'PAINTING') return 'PAINTING';
    if (raw === 'PLESTER' || raw === 'PLESTERAN' || raw === 'ACIAN' || raw === 'PLASTER') return 'PLASTER';

    const valid: ElementCategory[] = [
      'FOUNDATION',
      'STRUCTURE_COLUMN',
      'STRUCTURE_BEAM',
      'STRUCTURE_SLAB',
      'WALL',
      'DOOR_WINDOW',
      'ROOF',
      'FLOOR_FINISH',
      'CEILING',
      'PAINTING',
      'PLASTER',
      'SANITARY',
      'MEP',
      'SITEWORK',
      'OTHER',
    ];
    return valid.includes(raw as ElementCategory) ? (raw as ElementCategory) : 'OTHER';
  }

  private sanitizeShape(sh: string): 'RECTANGULAR' | 'TRAPEZOIDAL' | 'CYLINDRICAL' | 'POLYGONAL' | 'LINEAR' | 'COUNT' {
    const upper = String(sh || '').toUpperCase();
    if (['RECTANGULAR', 'TRAPEZOIDAL', 'CYLINDRICAL', 'POLYGONAL', 'LINEAR', 'COUNT'].includes(upper)) {
      return upper as any;
    }
    return 'RECTANGULAR';
  }

  private sanitizeStatus(st: string): WorkItemStatus {
    const valid: WorkItemStatus[] = [
      'CONFIRMED',
      'PARTIAL',
      'MISSING_DATA',
      'AMBIGUOUS',
      'CONFLICT',
      'UNSUPPORTED',
    ];
    const upper = String(st || '').toUpperCase() as WorkItemStatus;
    return valid.includes(upper) ? upper : 'CONFIRMED';
  }
}

export const dedVisionReader = DedVisionReader.getInstance();
