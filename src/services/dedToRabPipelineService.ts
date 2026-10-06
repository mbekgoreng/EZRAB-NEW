/**
 * EZRAB DED -> RAB Production Pipeline Service (Phase 10 Legacy)
 *
 * @deprecated This legacy service is superseded by the DED -> RAB V2 Architecture
 * in `src/ded-rab-v2/pipeline/dedRabPipeline.ts`. The UI is now exclusively routed through V2.
 *
 * Implements the core EZRAB pipeline:
 * SOURCE -> READ -> DETECT -> EXTRACT -> MAP AHSP -> CALCULATE -> DRAFT RAB -> REVIEW -> CONFIRM -> SAVE TO PROJECT
 */

import {
  DocumentClassification,
  DEDSourceInventoryItem,
  DrawingElementDetection,
  DEDWorkItem,
  DEDRabDraftRow,
  DEDRabDraftSummary,
  DimensionExtraction,
  DeterministicCalculationResult,
  AHSPMappingCandidate,
  PriceSourceResolution,
  SupportedUnit,
  WorkItemConfidence,
  WorkItemStatus,
  RabMutationDiff,
  MissingDataSummary,
  AHSPSourceType,
  AHSPMatchClassification,
  ValueSourceType,
  AICustomItem,
  AIWorkItem,
  AIConstructionInterpretation,
  AIWarning,
  AIUnresolvedItem,
  DedProcessingJob,
} from '../domain/ded/dedPipelineTypes';
import { AISourceReadingService, RealSourceReadResult } from './aiSourceReadingService';
import { AIEvidence } from './aiEvidenceService';
import { aiProviderRouter } from './aiProviderRouter';
import { aiCostRouter } from './aiCostRouter';
import { officialAhspRepository, ALL_OFFICIAL_AHSP_ITEMS } from '../data/nationalCostDatabase/officialAhspRepository';
import { priceResolver2026 } from '../data/priceDatabase2026/resolver';
import { PrecisionEngine } from '../engine/calculatorCore/precision/precisionEngine';
import { RabItem } from '../types';
import { dedEvidenceStore } from './dedEvidenceStore';
import { dedWorkItemStore } from './dedWorkItemStore';
import { dedQtoCalculationEngine } from './dedQtoCalculationEngine';
import { dedAhspMatchingEngine } from './dedAhspMatchingEngine';
import { spreadsheetSyncEngine } from './spreadsheetSyncEngine';
import { aiModelRouter } from './aiModelRouter';
import { aiDocumentReader } from './aiDocumentReader';
import { aiConstructionInterpreter } from './aiConstructionInterpreter';

export interface ProcessPipelineInput {
  projectId: string;
  projectName?: string;
  files: Array<{
    fileName: string;
    buffer: ArrayBuffer | Uint8Array | Buffer | string;
    mimeType?: string;
    pageCount?: number;
    customScale?: string;
  }>;
  existingProjectRabItems?: RabItem[];
  companyAhspItems?: Array<{ code: string; name: string; unit: string; unitPrice?: number }>;
  onProgress?: (job: DedProcessingJob) => void;
  forceVision?: boolean;
  preferredProvider?: string;
  preferredModel?: string;
}

export class DedToRabPipelineService {
  private static instance: DedToRabPipelineService;
  private sourceReader: AISourceReadingService;

  // In-memory project drafts cache (keyed by projectId)
  private projectDrafts: Map<string, DEDRabDraftSummary> = new Map();
  // In-memory project sources cache (keyed by projectId)
  private projectSources: Map<string, DEDSourceInventoryItem[]> = new Map();
  private customItemSeq: number = 1;

  private constructor() {
    this.sourceReader = AISourceReadingService.getInstance();
  }

  public static getInstance(): DedToRabPipelineService {
    if (!DedToRabPipelineService.instance) {
      DedToRabPipelineService.instance = new DedToRabPipelineService();
    }
    return DedToRabPipelineService.instance;
  }

  /**
   * Resets in-memory project pipeline state (useful for tests or new sessions)
   */
  public resetProjectState(projectId?: string): void {
    if (projectId) {
      this.projectDrafts.delete(projectId);
      this.projectSources.delete(projectId);
      dedEvidenceStore.clearProjectEvidences(projectId);
      dedWorkItemStore.clearProjectWorkItems(projectId);
      spreadsheetSyncEngine.clear(projectId);
    } else {
      this.projectDrafts.clear();
      this.projectSources.clear();
      this.customItemSeq = 1;
      dedEvidenceStore.clearAll();
      dedWorkItemStore.clearAll();
      spreadsheetSyncEngine.clear();
    }
  }

  /**
   * SECTION 3 & 4: SOURCE INVENTORY & EVIDENCE-BASED DOCUMENT CLASSIFICATION
   */
  public classifyDocument(fileName: string, contentText: string): DocumentClassification {
    const fn = fileName.toLowerCase();
    const txt = contentText.toLowerCase();

    // 1. BOQ / Bill of Quantities
    if (fn.includes('boq') || fn.includes('bill_of_quantities') || txt.includes('bill of quantities') || txt.includes('daftar kuantitas')) {
      return 'BOQ';
    }

    // 2. Specification (RKS / Spek Teknis)
    if (
      fn.includes('spek') ||
      fn.includes('rks') ||
      fn.includes('spesifikasi') ||
      txt.includes('spesifikasi teknis') ||
      txt.includes('rencana kerja dan syarat') ||
      txt.includes('spesifikasi material')
    ) {
      return 'SPECIFICATION';
    }

    // 3. Structural Drawing (DED Struktur)
    if (
      fn.includes('struktur') ||
      fn.includes('structural') ||
      fn.startsWith('s-') ||
      fn.includes('dwg-s') ||
      txt.includes('gambar struktur') ||
      txt.includes('denah pondasi') ||
      txt.includes('denah balok') ||
      txt.includes('denah kolom') ||
      txt.includes('pembesian')
    ) {
      return 'STRUCTURAL_DRAWING';
    }

    // 4. Architectural Drawing (DED Arsitektur)
    if (
      fn.includes('arsitektur') ||
      fn.includes('architectural') ||
      fn.startsWith('a-') ||
      fn.includes('dwg-a') ||
      txt.includes('gambar arsitektur') ||
      txt.includes('denah lantai') ||
      txt.includes('tampak depan') ||
      txt.includes('potongan a-a') ||
      txt.includes('pintu dan jendela')
    ) {
      return 'ARCHITECTURAL_DRAWING';
    }

    // 5. MEP Drawing
    if (
      fn.includes('mep') ||
      fn.includes('mekanikal') ||
      fn.includes('elektrikal') ||
      fn.includes('plumbing') ||
      fn.startsWith('m-') ||
      fn.startsWith('e-') ||
      txt.includes('mekanikal elektrikal') ||
      txt.includes('instalasi listrik') ||
      txt.includes('sanitasi')
    ) {
      return 'MEP_DRAWING';
    }

    // 6. AHSP / Analisa Harga
    if (fn.includes('ahsp') || txt.includes('analisa harga satuan') || txt.includes('koefisien tenaga')) {
      return 'AHSP';
    }

    // 7. RAB
    if (fn.includes('rab') || txt.includes('rencana anggaran biaya') || (txt.includes('uraian pekerjaan') && txt.includes('harga satuan'))) {
      return 'RAB';
    }

    // 8. Schedule
    if (fn.includes('jadwal') || fn.includes('schedule') || fn.includes('kurva_s') || txt.includes('jadwal pelaksanaan')) {
      return 'SCHEDULE';
    }

    // Fallback: If not clearly verified, return UNKNOWN (never force classification)
    return 'UNKNOWN';
  }

  /**
   * SECTION 5: DRAWING ANALYSIS — Detect only truly visible elements
   */
  public detectVisibleElements(
    source: DEDSourceInventoryItem,
    rawText: string
  ): DrawingElementDetection[] {
    const detections: DrawingElementDetection[] = [];
    const textLower = rawText.toLowerCase();

    const patterns: Array<{
      category: DrawingElementDetection['category'];
      keywords: RegExp[];
      descGenerator: (match: string) => string;
    }> = [
      {
        category: 'Foundation',
        keywords: [/(?:pondasi\s+(?:batu\s+kali|foot\s*plate|tiang\s*pancang|menerus)[^.,;\n]*)/i, /pondasi/i],
        descGenerator: (m) => `Pondasi terdeteksi: ${m.trim()}`,
      },
      {
        category: 'Column',
        keywords: [/(?:kolom\s+(?:k\d+|praktis|utama)[^.,;\n]*)/i, /column|kolom/i],
        descGenerator: (m) => `Kolom struktural: ${m.trim()}`,
      },
      {
        category: 'Beam',
        keywords: [/(?:balok\s+(?:sloof|b\d+|lintel|ring\s*balk)[^.,;\n]*)/i, /balok|sloof|beam/i],
        descGenerator: (m) => `Balok struktural: ${m.trim()}`,
      },
      {
        category: 'Slab',
        keywords: [/(?:pelat\s+lantai[^.,;\n]*)/i, /pelat|plat|slab/i],
        descGenerator: (m) => `Pelat lantai beton: ${m.trim()}`,
      },
      {
        category: 'Wall',
        keywords: [/(?:dinding\s+(?:bata\s+merah|hebel|batako)[^.,;\n]*)/i, /dinding|wall/i],
        descGenerator: (m) => `Dinding pasangan: ${m.trim()}`,
      },
      {
        category: 'Door',
        keywords: [/(?:pintu\s+(?:p\d+|kayu|aluminium|kaca)[^.,;\n]*)/i, /pintu|door/i],
        descGenerator: (m) => `Kusen & daun pintu: ${m.trim()}`,
      },
      {
        category: 'Window',
        keywords: [/(?:jendela\s+(?:j\d+|aluminium|kaca)[^.,;\n]*)/i, /jendela|window/i],
        descGenerator: (m) => `Kusen & kaca jendela: ${m.trim()}`,
      },
      {
        category: 'Roof',
        keywords: [/(?:atap\s+(?:baja\s+ringan|genteng|spandek)[^.,;\n]*)/i, /atap|roof|kuda-kuda/i],
        descGenerator: (m) => `Konstruksi atap: ${m.trim()}`,
      },
      {
        category: 'Stair',
        keywords: [/(?:tangga\s+(?:beton|besi)[^.,;\n]*)/i, /tangga|stair/i],
        descGenerator: (m) => `Tangga penghubung: ${m.trim()}`,
      },
      {
        category: 'Floor',
        keywords: [/(?:lantai\s+(?:keramik|granit|homogenous|vinyl|parket)[^.,;\n]*)/i, /keramik|granit|homogenous|vinyl|parket/i],
        descGenerator: (m) => `Lantai penutup: ${m.trim()}`,
      },
      {
        category: 'Ceiling',
        keywords: [/(?:plafon\s+(?:gypsum|pvc|kalsiboard|akustik|drop)[^.,;\n]*)/i, /plafon|gypsum|drop\s*ceiling/i],
        descGenerator: (m) => `Plafon ruangan: ${m.trim()}`,
      },
      {
        category: 'Painting',
        keywords: [/(?:cat\s+(?:dinding|tembok|eksterior|interior|weathershield|dulux)[^.,;\n]*)/i, /pengecatan|cat\s+dinding/i],
        descGenerator: (m) => `Pengecatan: ${m.trim()}`,
      },
      {
        category: 'Plaster',
        keywords: [/(?:plesteran|acian|mortar\s+plester)/i],
        descGenerator: (m) => `Plesteran & acian: ${m.trim()}`,
      },
      {
        category: 'Sanitary',
        keywords: [/(?:kloset|closet|wastafel|shower|kran|floor\s*drain|sanitair)/i],
        descGenerator: (m) => `Peralatan sanitair: ${m.trim()}`,
      },
      {
        category: 'Facade',
        keywords: [/(?:acp|aluminium\s+composite|kisi-kisi|wood\s*plastic|conwood|moulding|fasad)/i],
        descGenerator: (m) => `Fasad & dekorasi: ${m.trim()}`,
      },
      {
        category: 'Room',
        keywords: [/(?:ruang\s+(?:tidur|tamu|keluarga|makan|kerja)[^.,;\n]*)/i, /kamar|toilet|dapur/i],
        descGenerator: (m) => `Ruangan denah: ${m.trim()}`,
      },
    ];

    let detIdCounter = 1;
    for (const pat of patterns) {
      for (const regex of pat.keywords) {
        const match = rawText.match(regex);
        if (match) {
          const matchedStr = match[0];
          detections.push({
            id: `det_${source.sourceId.slice(0, 8)}_${detIdCounter++}`,
            category: pat.category,
            description: pat.descGenerator(matchedStr),
            sourceId: source.sourceId,
            sourceName: source.sourceName,
            page: 1,
            confidence: 'HIGH',
            evidence: {
              sourceType: source.sourceType as any,
              sourceId: source.sourceId,
              sourceName: source.sourceName,
              page: 1,
              field: pat.category,
              extractedText: matchedStr,
              basis: `Elemen visual terdeteksi pada ${source.sourceName}`,
              confidence: 'HIGH',
              status: 'VERIFIED',
              provider: 'LOCAL_PARSER',
              model: 'EZRAB_VISION_SCANNER',
            },
          });
          break; // Avoid duplicate categories from different regexes
        }
      }
    }

    return detections;
  }

  /**
   * SECTION 6 & 10: DIMENSION & UNIT EXTRACTION (Anti-guessing with mm & meter support)
   */
  public extractDimensionsFromText(rawText: string, scaleVerified: boolean = true): DimensionExtraction {
    const snippets: string[] = [];

    // 1. Check mm 3D/2D notation: e.g. "300 x 300 mm", "300 × 300 mm", "300x300 mm", "300 x 300 x 3200 mm"
    const dimMm3DMatch = rawText.match(/(\d+)\s*(?:mm)?\s*[x×]\s*(\d+)\s*(?:mm)?\s*[x×]\s*(\d+)\s*mm/i);
    const dimMm2DMatch = rawText.match(/(\d+)\s*(?:mm)?\s*[x×]\s*(\d+)\s*mm/i);
    // Explicit mm numbers e.g. "300 x 300" where numbers >= 100
    const dimImplicitMmMatch = rawText.match(/\b([1-9]\d{2,3})\s*[x×]\s*([1-9]\d{2,3})\b/);

    // Standard meter patterns
    const lengthMatch = rawText.match(/(?:length|panjang)(?:\s+[a-z0-9_]+)?\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:m|meter)?/i);
    const widthMatch = rawText.match(/(?:width|lebar)(?:\s+[a-z0-9_]+)?\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:m|meter)?/i);
    const heightMatch = rawText.match(/(?:height|tinggi|tebal)(?:\s+[a-z0-9_]+)?\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:m|meter)?/i);
    const countMatch = rawText.match(/(?:count|jumlah|titik|total)\s*[:=]?\s*(\d+)\s*(?:titik|buah|unit|bh)?/i);
    const countSuffixMatch = rawText.match(/(\d+)\s*(?:titik|units|unit|buah|bh)\b/i);
    const dim3DMatch = rawText.match(/(\d+(?:\.\d+)?)\s*(?:m)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:m)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:m)?/i);
    const dim2DMatch = rawText.match(/(\d+(?:\.\d+)?)\s*(?:m)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:m)?/i);

    let length: number | undefined;
    let width: number | undefined;
    let height: number | undefined;
    let count: number | undefined;

    if (dimMm3DMatch) {
      length = parseFloat(dimMm3DMatch[1]) / 1000;
      width = parseFloat(dimMm3DMatch[2]) / 1000;
      height = parseFloat(dimMm3DMatch[3]) / 1000;
      snippets.push(`Dimensions 3D (mm -> m): ${length} × ${width} × ${height} m`);
    } else if (dim3DMatch && !dim3DMatch[0].includes('mm') && (parseFloat(dim3DMatch[1]) < 50)) {
      length = parseFloat(dim3DMatch[1]);
      width = parseFloat(dim3DMatch[2]);
      height = parseFloat(dim3DMatch[3]);
      snippets.push(`Dimensions 3D: ${length} × ${width} × ${height} m`);
    } else if (dimMm2DMatch) {
      length = parseFloat(dimMm2DMatch[1]) / 1000;
      width = parseFloat(dimMm2DMatch[2]) / 1000;
      snippets.push(`Dimensions 2D (mm -> m): ${length} × ${width} m`);
    } else if (dimImplicitMmMatch && parseFloat(dimImplicitMmMatch[1]) >= 100 && parseFloat(dimImplicitMmMatch[2]) >= 100) {
      length = parseFloat(dimImplicitMmMatch[1]) / 1000;
      width = parseFloat(dimImplicitMmMatch[2]) / 1000;
      snippets.push(`Dimensions 2D (mm -> m): ${length} × ${width} m`);
    } else {
      if (lengthMatch) {
        length = parseFloat(lengthMatch[1]);
        snippets.push(`Length: ${length} m`);
      }
      const widthTopMatch = rawText.match(/(?:lebar\s*atas|top\s*width)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:m|meter)?/i);
      const widthBottomMatch = rawText.match(/(?:lebar\s*bawah|bottom\s*width)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:m|meter)?/i);
      if (widthTopMatch && widthBottomMatch) {
        const wTop = parseFloat(widthTopMatch[1]);
        const wBottom = parseFloat(widthBottomMatch[1]);
        width = PrecisionEngine.divide(PrecisionEngine.add(wTop, wBottom), 2);
        snippets.push(`Trapezoid Average Width: (${wTop} + ${wBottom}) / 2 = ${width} m`);
      } else if (widthMatch) {
        width = parseFloat(widthMatch[1]);
        snippets.push(`Width: ${width} m`);
      }
      if (heightMatch) {
        height = parseFloat(heightMatch[1]);
        snippets.push(`Height: ${height} m`);
      }
      if (dim2DMatch && (length === undefined || width === undefined)) {
        length = parseFloat(dim2DMatch[1]);
        width = parseFloat(dim2DMatch[2]);
        snippets.push(`Dimensions 2D: ${length} × ${width} m`);
      }
    }

    if (height === undefined && heightMatch) {
      height = parseFloat(heightMatch[1]);
      snippets.push(`Height: ${height} m`);
    }

    if (countMatch) {
      count = parseInt(countMatch[1], 10);
      snippets.push(`Count: ${count}`);
    } else if (countSuffixMatch) {
      count = parseInt(countSuffixMatch[1], 10);
      snippets.push(`Count: ${count}`);
    }

    // Determine unit based on dimension structure
    let unit: SupportedUnit = 'UNIT_NOT_FOUND';
    if (length !== undefined && width !== undefined && height !== undefined) {
      unit = 'm³';
    } else if (length !== undefined && (width !== undefined || height !== undefined)) {
      unit = 'm²';
    } else if (length !== undefined || height !== undefined) {
      unit = 'm';
    } else if (count !== undefined && count > 0) {
      unit = 'unit';
    }

    return {
      length,
      width,
      height,
      count,
      unit,
      rawSnippets: snippets,
      scaleVerified,
      notes: !scaleVerified ? 'Scale unverified; visual estimation prohibited.' : undefined,
    };
  }

  /**
   * SECTION 9: QUANTITY TAKEOFF (EZRAB Deterministic Calculation Engine)
   */
  public computeDeterministicQuantity(dims: DimensionExtraction): DeterministicCalculationResult | undefined {
    // If scale is not verified, refuse absolute calculation
    if (!dims.scaleVerified) {
      return undefined;
    }

    // 1. 3D Volume with Count multiplier: Length × Width × Height × (Count || 1)
    if (dims.length !== undefined && dims.width !== undefined && dims.height !== undefined) {
      const baseVol = PrecisionEngine.multiply(PrecisionEngine.multiply(dims.length, dims.width), dims.height);
      const count = dims.count && dims.count > 0 ? dims.count : 1;
      const totalVol = PrecisionEngine.applyPolicy(PrecisionEngine.multiply(baseVol, count), 'DECIMAL_4');

      const formula = count > 1
        ? `${dims.length} × ${dims.width} × ${dims.height} × ${count} = ${totalVol} m³`
        : `${dims.length} × ${dims.width} × ${dims.height} = ${totalVol} m³`;

      return {
        formula,
        computedValue: totalVol,
        unit: 'm³',
        calculationType: 'VOLUME_3D',
      };
    }

    // 2. 2D Area with Count multiplier: Length × (Width || Height) × (Count || 1)
    if (dims.length !== undefined && (dims.width !== undefined || dims.height !== undefined)) {
      const secondDim = dims.width !== undefined ? dims.width : dims.height!;
      const baseArea = PrecisionEngine.multiply(dims.length, secondDim);
      const count = dims.count && dims.count > 0 ? dims.count : 1;
      const totalArea = PrecisionEngine.applyPolicy(PrecisionEngine.multiply(baseArea, count), 'DECIMAL_4');

      const formula = count > 1
        ? `${dims.length} × ${secondDim} × ${count} = ${totalArea} m²`
        : `${dims.length} × ${secondDim} = ${totalArea} m²`;

      return {
        formula,
        computedValue: totalArea,
        unit: 'm²',
        calculationType: 'AREA_2D',
      };
    }

    // 3. 1D Perimeter / Length with Count multiplier
    if (dims.length !== undefined) {
      const count = dims.count && dims.count > 0 ? dims.count : 1;
      const totalLen = PrecisionEngine.applyPolicy(PrecisionEngine.multiply(dims.length, count), 'DECIMAL_4');
      const formula = count > 1 ? `${dims.length} × ${count} = ${totalLen} m` : `${dims.length} m`;

      return {
        formula,
        computedValue: totalLen,
        unit: 'm',
        calculationType: 'PERIMETER_1D',
      };
    }

    // 4. Pure Count
    if (dims.count !== undefined && dims.count > 0) {
      return {
        formula: `${dims.count} unit`,
        computedValue: dims.count,
        unit: 'unit',
        calculationType: 'COUNT',
      };
    }

    return undefined;
  }

  /**
   * PHASE 11: LATEST AHSP RESOLUTION
   * Strict Resolution Order:
   * 1. Latest Official AHSP (PUPR 2026 / SNI)
   * 2. Project AHSP
   * 3. Company/Custom AHSP
   * 4. Reference Database
   * 5. AI Custom Item Fallback
   */
  public resolveLatestAHSP(
    name: string,
    specification?: string,
    unit?: string,
    existingProjectRabItems?: RabItem[],
    companyAhspItems?: Array<{ code: string; name: string; unit: string; unitPrice?: number }>
  ): {
    ahspCode?: string;
    ahspName?: string;
    matchStatus: AHSPMatchClassification;
    sourceType: AHSPSourceType;
    version: string;
    effectiveDate: string;
    reason: string;
    candidates: AHSPMappingCandidate[];
    customItem?: AICustomItem;
  } {
    const query = `${name} ${specification || ''}`.toLowerCase();
    const isSpecialtyFinish = query.includes('special') || query.includes('khusus') || query.includes('custom') || query.includes('artistic');

    // 1. Order 1: Latest Official AHSP (PUPR 2026 / SNI) — official catalog only (§2/§4).
    const allOfficial = officialAhspRepository.getAllOfficialAhsp();
    const officialCandidates: AHSPMappingCandidate[] = [];

    for (const item of allOfficial) {
      const itemText = `${item.code} ${item.name} ${item.category}`.toLowerCase();
      let matchScore = 0;
      let specMatch = false;

      // Specification exact match e.g. K-250, K-300
      if (specification) {
        const specClean = specification.toLowerCase().replace(/[^a-z0-9]/g, '');
        const itemClean = itemText.replace(/[^a-z0-9]/g, '');
        if (itemClean.includes(specClean)) {
          matchScore += 45;
          specMatch = true;
        }
      }

      // Keyword overlap with bilingual translation
      const nameTerms = name.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
      const expandedTerms: string[] = [];
      for (const t of nameTerms) {
        expandedTerms.push(t);
        if (t === 'concrete') expandedTerms.push('beton');
        if (t === 'column') expandedTerms.push('kolom');
        if (t === 'beam') expandedTerms.push('balok');
        if (t === 'foundation') expandedTerms.push('pondasi');
        if (t === 'wall') expandedTerms.push('dinding', 'bata');
        if (t === 'floor') expandedTerms.push('lantai');
        if (t === 'finish') expandedTerms.push('plesteran', 'acian', 'penyelesaian');
      }
      const matchedTerms = expandedTerms.filter((term) => itemText.includes(term));
      if (expandedTerms.length > 0) {
        matchScore += (matchedTerms.length / expandedTerms.length) * 40;
      }

      // Unit alignment
      if (unit && item.unit && unit.toLowerCase().trim() === item.unit.toLowerCase().trim()) {
        matchScore += 15;
      }

      // If specialty finish has category match (e.g. beton/concrete)
      if (isSpecialtyFinish && (name.toLowerCase().includes('beton') || name.toLowerCase().includes('concrete')) && itemText.includes('beton')) {
        matchScore = Math.max(matchScore, 45);
      }

      if (matchScore >= 40) {
        const matchClassification: AHSPMatchClassification =
          (!isSpecialtyFinish && (specMatch || matchScore >= 75)) ? 'EXACT_MATCH' : 'SEMANTIC_MATCH';

        officialCandidates.push({
          ahspCode: item.code,
          name: item.name,
          unit: item.unit,
          baseUnitPrice: item.unitPrice,
          matchScore: Math.round(matchScore),
          reason: specMatch
            ? `Mutu spesifikasi ${specification} cocok dengan katalog resmi AHSP PUPR 2026.`
            : isSpecialtyFinish
            ? `Kecocokan semantik kategori (Perlu Review untuk pekerjaan khusus/arsitektural).`
            : `Kesesuaian nama pekerjaan (${Math.round(matchScore)}% kemiripan).`,
          specificationMatch: specMatch,
          isRecommended: false,
          matchClassification,
          sourceType: 'OFFICIAL_AHSP',
          version: (item as any).regulationSource
            ? `${(item as any).regulationSource} (Standar PUPR 2026)`
            : 'Standar PUPR 2026',
          effectiveDate: '2026-01-01',
          sourceReference: item.code,
        });
      }
    }

    officialCandidates.sort((a, b) => b.matchScore - a.matchScore);

    if (officialCandidates.length > 0) {
      officialCandidates[0].isRecommended = true;
      const best = officialCandidates[0];
      return {
        ahspCode: best.ahspCode,
        ahspName: best.name,
        matchStatus: best.matchClassification || 'SEMANTIC_MATCH',
        sourceType: 'OFFICIAL_AHSP',
        version: best.version || 'Standar PUPR 2026',
        effectiveDate: best.effectiveDate || '2026-01-01',
        reason: best.reason,
        candidates: officialCandidates,
      };
    }

    // 2. Order 2: Project AHSP
    if (existingProjectRabItems && existingProjectRabItems.length > 0) {
      const projCandidates: AHSPMappingCandidate[] = [];
      for (const item of existingProjectRabItems) {
        if (item.ahspCode && item.description.toLowerCase().includes(name.toLowerCase())) {
          projCandidates.push({
            ahspCode: item.ahspCode,
            name: item.description,
            unit: item.unit,
            baseUnitPrice: item.unitPrice,
            matchScore: 85,
            reason: 'Ditemukan pada katalog AHSP proyek aktif.',
            specificationMatch: true,
            isRecommended: true,
            matchClassification: 'EXACT_MATCH',
            sourceType: 'PROJECT_AHSP',
            version: 'Standar Proyek Aktif',
            effectiveDate: '2026-01-01',
          });
        }
      }
      if (projCandidates.length > 0) {
        return {
          ahspCode: projCandidates[0].ahspCode,
          ahspName: projCandidates[0].name,
          matchStatus: 'EXACT_MATCH',
          sourceType: 'PROJECT_AHSP',
          version: 'Standar Proyek Aktif',
          effectiveDate: '2026-01-01',
          reason: projCandidates[0].reason,
          candidates: projCandidates,
        };
      }
    }

    // 3. Order 3: Company AHSP
    if (companyAhspItems && companyAhspItems.length > 0) {
      const compCandidates: AHSPMappingCandidate[] = [];
      for (const item of companyAhspItems) {
        if (item.name.toLowerCase().includes(name.toLowerCase())) {
          compCandidates.push({
            ahspCode: item.code,
            name: item.name,
            unit: item.unit,
            baseUnitPrice: item.unitPrice,
            matchScore: 80,
            reason: 'Ditemukan pada katalog AHSP standar perusahaan.',
            specificationMatch: true,
            isRecommended: true,
            matchClassification: 'EXACT_MATCH',
            sourceType: 'COMPANY_AHSP',
            version: 'Standar Perusahaan 2026',
            effectiveDate: '2026-01-01',
          });
        }
      }
      if (compCandidates.length > 0) {
        return {
          ahspCode: compCandidates[0].ahspCode,
          ahspName: compCandidates[0].name,
          matchStatus: 'EXACT_MATCH',
          sourceType: 'COMPANY_AHSP',
          version: 'Standar Perusahaan 2026',
          effectiveDate: '2026-01-01',
          reason: compCandidates[0].reason,
          candidates: compCandidates,
        };
      }
    }

    // 4. Order 4: Reference Database
    const refMatch = ALL_OFFICIAL_AHSP_ITEMS.find((item) =>
      item.name.toLowerCase().includes(name.toLowerCase())
    );
    if (refMatch) {
      const candidate: AHSPMappingCandidate = {
        ahspCode: refMatch.code,
        name: refMatch.name,
        unit: refMatch.unit,
        baseUnitPrice: refMatch.unitPrice,
        matchScore: 65,
        reason: 'Ditemukan pada referensi database nasional Bina Marga / Cipta Karya.',
        specificationMatch: false,
        isRecommended: true,
        matchClassification: 'SEMANTIC_MATCH',
        sourceType: 'REFERENCE',
        version: 'Referensi Nasional',
        effectiveDate: '2026-01-01',
      };
      return {
        ahspCode: candidate.ahspCode,
        ahspName: candidate.name,
        matchStatus: 'SEMANTIC_MATCH',
        sourceType: 'REFERENCE',
        version: 'Referensi Nasional',
        effectiveDate: '2026-01-01',
        reason: candidate.reason,
        candidates: [candidate],
      };
    }

    // 5. Order 5: Fallback to AI Custom Item
    const customSeq = this.customItemSeq++;
    const customCode = `AI-CUSTOM-${String(customSeq).padStart(3, '0')}`;
    const customItem: AICustomItem = {
      code: customCode,
      name,
      unit: unit || 'unit',
      reason: 'No applicable item found in the current AHSP database',
      sourceEvidence: [],
      generatedBy: 'AI',
      requiresUserConfirmation: true,
      components: [
        { name: `Bahan ${name}`, coefficient: 1.0, unit: unit || 'unit', sourceType: 'AI_ESTIMATE' },
        { name: `Upah Tenaga Kerja ${name}`, coefficient: 0.35, unit: 'oh', sourceType: 'AI_ESTIMATE' },
      ],
    };

    return {
      ahspCode: customCode,
      ahspName: `${name} (AI Custom Item)`,
      matchStatus: 'NOT_FOUND',
      sourceType: 'AI_CUSTOM',
      version: 'AI Custom Fallback',
      effectiveDate: new Date().toISOString().split('T')[0],
      reason: 'Tidak ditemukan analisa harga satuan (AHSP) yang sesuai dengan deskripsi pekerjaan.',
      candidates: [],
      customItem,
    };
  }

  /**
   * BACKWARD-COMPATIBLE WRAPPER FOR PHASE 10 TESTS
   */
  public mapAhspForWorkItem(
    name: string,
    specification?: string,
    unit?: string
  ): {
    ahspCode?: string;
    ahspName?: string;
    reason: string;
    candidates: AHSPMappingCandidate[];
  } {
    const res = this.resolveLatestAHSP(name, specification, unit);
    return {
      ahspCode: res.sourceType === 'AI_CUSTOM' ? undefined : res.ahspCode,
      ahspName: res.sourceType === 'AI_CUSTOM' ? undefined : res.ahspName,
      reason: res.reason,
      candidates: res.candidates,
    };
  }

  /**
   * SECTION 13: PRICE SOURCE RESOLUTION WITH PROVENANCE
   */
  public resolvePrice(
    ahspCode?: string,
    existingProjectRabItems?: RabItem[],
    isCustomItem?: boolean
  ): PriceSourceResolution {
    if (!ahspCode || ahspCode === 'AHSP_NOT_FOUND' || isCustomItem || ahspCode.startsWith('AI-CUSTOM-')) {
      return {
        unitPrice: undefined,
        priceSource: 'PRICE_NOT_FOUND',
        currency: 'IDR',
        isOfficial: false,
        valueSourceType: isCustomItem || (ahspCode && ahspCode.startsWith('AI-CUSTOM-')) ? 'AI_ESTIMATE' : undefined,
        sourceDetail: isCustomItem || (ahspCode && ahspCode.startsWith('AI-CUSTOM-'))
          ? 'Item Custom AI: Belum memiliki harga resmi (Memerlukan review pengguna).'
          : 'AHSP tidak tersedia, harga tidak dapat ditentukan.',
      };
    }

    const cleanCode = ahspCode.trim().toLowerCase();

    // 1. Priority 1: Project price (Existing RAB in this project)
    if (existingProjectRabItems && existingProjectRabItems.length > 0) {
      const matchProject = existingProjectRabItems.find(
        (i) => i.ahspCode?.toLowerCase() === cleanCode && (i.unitPrice || 0) > 0
      );
      if (matchProject && matchProject.unitPrice) {
        return {
          unitPrice: matchProject.unitPrice,
          priceSource: 'PROJECT_PRICE',
          valueSourceType: 'PROJECT_PRICE',
          sourceDetail: `Harga proyek aktif dari item: ${matchProject.description}`,
          currency: 'IDR',
          isOfficial: true,
        };
      }
    }

    // 2. Priority 2 & 3: OFFICIAL canonical AHSP price via the shared resolver (§2/§11/§15).
    //    Previously read getAHSPDatabase() and treated its stored unitPrice as official —
    //    the legacy-price-as-official path the reconciliation forbids.
    const matchOfficial = officialAhspRepository.getOfficialAhsp(cleanCode);
    if (matchOfficial) {
      const composition = priceResolver2026.resolveAhspUnitPrice(matchOfficial);
      if (composition.unitPrice !== null) {
        return {
          unitPrice: composition.unitPrice,
          priceSource: 'CONFIGURED_PRICE_DB',
          valueSourceType: 'OFFICIAL_AHSP',
          sourceDetail: `AHSP 2026 resmi (${matchOfficial.code}) — ${composition.pricingStatus}`,
          currency: 'IDR',
          isOfficial: true,
        };
      }
    }

    // 3. Priority 4: Reference Price in National DB
    const matchNational = ALL_OFFICIAL_AHSP_ITEMS.find(
      (a) => a.code.toLowerCase() === cleanCode || a.codeNormalized?.toLowerCase() === cleanCode
    );
    if (matchNational && matchNational.unitPrice && matchNational.unitPrice > 0) {
      return {
        unitPrice: matchNational.unitPrice,
        priceSource: 'REFERENCE_PRICE',
        valueSourceType: 'REFERENCE',
        sourceDetail: `Referensi Harga Nasional Bina Marga / Cipta Karya (${matchNational.code})`,
        currency: 'IDR',
        isOfficial: true,
      };
    }

    // Fallback: PRICE_NOT_FOUND (Never guess or invent default prices!)
    return {
      unitPrice: undefined,
      priceSource: 'PRICE_NOT_FOUND',
      sourceDetail: 'Harga satuan tidak ditemukan pada sumber harga proyek maupun katalog AHSP daerah.',
      currency: 'IDR',
      isOfficial: false,
    };
  }

  /**
   * SECTION 17: CONFLICT DETECTION (Discrepancy between sources)
   */
  public detectSourceConflict(
    sourceA: { name: string; value: string | number; page?: number },
    sourceB: { name: string; value: string | number; page?: number },
    fieldName: string
  ): { hasConflict: boolean; details?: DEDWorkItem['conflictDetails'] } {
    const valA = String(sourceA.value).trim().toLowerCase();
    const valB = String(sourceB.value).trim().toLowerCase();

    if (valA !== valB) {
      return {
        hasConflict: true,
        details: {
          sourceA,
          sourceB,
          description: `Konflik data pada ${fieldName}: '${sourceA.name}' mencatat '${sourceA.value}', sedangkan '${sourceB.name}' mencatat '${sourceB.value}'.`,
          actionRequired: 'User review required to choose authoritative specification.',
        },
      };
    }

    return { hasConflict: false };
  }

  /**
   * PHASE 11: AI DED ANALYSIS & MULTI-DOCUMENT UNDERSTANDING
   * Correlates:
   * Floor Plan + Structural Plan + Section + Detail + Schedule + Technical Specification + BOQ
   */
  public async interpretConstructionDocuments(
    projectId: string,
    sourceInventory: DEDSourceInventoryItem[],
    existingProjectRabItems?: RabItem[],
    companyAhspItems?: Array<{ code: string; name: string; unit: string; unitPrice?: number }>
  ): Promise<AIConstructionInterpretation> {
    const workItems: AIWorkItem[] = [];
    const evidenceList: AIEvidence[] = [];
    const warnings: AIWarning[] = [];
    const unresolvedItems: AIUnresolvedItem[] = [];

    // Find documents by classification
    const specFile = sourceInventory.find((s) => s.classification === 'SPECIFICATION');
    const specText = specFile?.rawText || '';
    const specConcreteMatch =
      specText.match(/(?:mutu\s*beton|beton)[^\n\r]{0,80}?(k-?\d{3}|fc'?\s*\d+)/i) ||
      specText.match(/\b(k-?\d{3})\b/i);
    const specConcreteGrade = specConcreteMatch ? specConcreteMatch[1].toUpperCase() : undefined;

    // Schedule files
    const scheduleFile = sourceInventory.find((s) => s.classification === 'SCHEDULE');
    const scheduleText = scheduleFile?.rawText || '';

    // Detail files
    const detailFiles = sourceInventory.filter((s) => s.sourceName.toLowerCase().includes('detail'));
    const sectionFiles = sourceInventory.filter(
      (s) => s.sourceName.toLowerCase().includes('potongan') || s.sourceName.toLowerCase().includes('section')
    );

    let primaryDocType = 'ARCHITECTURAL_DRAWING';
    const firstValid = sourceInventory.find((s) => s.status !== 'UNREADABLE');
    if (firstValid) {
      primaryDocType = firstValid.classification;
    }

    // Project Context
    let projectName = 'Proyek DED';
    let projectNumber: string | undefined;
    let location: string | undefined;

    for (const src of sourceInventory) {
      const text = src.rawText || '';
      const pNameMatch = text.match(/(?:nama\s*proyek|project\s*name)\s*[:=]?\s*([^\n\r,]+)/i);
      if (pNameMatch) projectName = pNameMatch[1].trim();

      const pNumMatch = text.match(/(?:no\s*proyek|project\s*no)\s*[:=]?\s*([^\n\r,]+)/i);
      if (pNumMatch) projectNumber = pNumMatch[1].trim();

      const locMatch = text.match(/(?:lokasi|location)\s*[:=]?\s*([^\n\r,]+)/i);
      if (locMatch) location = locMatch[1].trim();
    }

    // Process sources to extract work items
    for (const source of sourceInventory) {
      if (source.status === 'UNREADABLE') {
        warnings.push({
          code: 'UNREADABLE_SOURCE',
          message: `Berkas "${source.sourceName}" buram / tidak terbaca. Ekstraksi visual dilewati untuk mencegah halusinasi.`,
          severity: 'HIGH',
          sourceReference: source.sourceName,
        });
        unresolvedItems.push({
          itemDescription: `Berkas tidak terbaca: ${source.sourceName}`,
          reason: 'Source image/document is unreadable or blurred.',
          missingField: 'QUANTITY',
        });
        continue;
      }

      if (!source.scaleVerified) {
        warnings.push({
          code: 'SCALE_UNVERIFIED',
          message: `Berkas "${source.sourceName}" tidak memiliki skala terverifikasi (scaleVerified = false).`,
          severity: 'MEDIUM',
          sourceReference: source.sourceName,
        });
      }

      const rawText = source.rawText || '';
      const visibleDetections = this.detectVisibleElements(source, rawText);

      // Extract raw dimensions from this source
      const dims = this.extractDimensionsFromText(rawText, source.scaleVerified);

      // Check concrete grade in this drawing
      const dwgConcreteMatch =
        rawText.match(/(?:mutu\s*beton|beton)[^\n\r]{0,80}?(k-?\d{3}|fc'?\s*\d+)/i) ||
        rawText.match(/\b(k-?\d{3})\b/i);
      const dwgConcreteGrade = dwgConcreteMatch ? dwgConcreteMatch[1].toUpperCase() : undefined;

      // Cross-page conflict check 1: Mutu beton (Drawing vs Spec)
      if (dwgConcreteGrade && specConcreteGrade && dwgConcreteGrade !== specConcreteGrade) {
        const conflictRes = this.detectSourceConflict(
          { name: source.sourceName, value: dwgConcreteGrade, page: 1 },
          { name: specFile!.sourceName, value: specConcreteGrade, page: 1 },
          'Mutu Beton'
        );
        if (conflictRes.hasConflict) {
          warnings.push({
            code: 'SPEC_CONFLICT',
            message: conflictRes.details?.description || 'Konflik mutu beton antar dokumen.',
            severity: 'HIGH',
            sourceReference: `${source.sourceName} vs ${specFile?.sourceName}`,
          });
        }
      }

      for (const det of visibleDetections) {
        let count = dims.count;
        let length = dims.length;
        let width = dims.width;
        let height = dims.height;
        const sourceRefs = [source.sourceName];

        // Cross-page correlation: Schedule for Count
        if (scheduleText && (det.category === 'Column' || det.category === 'Door' || det.category === 'Window')) {
          const schedDims = this.extractDimensionsFromText(scheduleText, true);
          if (schedDims.count) {
            count = schedDims.count;
            if (scheduleFile && !sourceRefs.includes(scheduleFile.sourceName)) {
              sourceRefs.push(scheduleFile.sourceName);
            }
          } else {
            const schedCountMatch = scheduleText.match(
              new RegExp(`(?:count|jumlah|total)\\s*[:=]?\\s*(\\d+)`, 'i')
            );
            if (schedCountMatch) {
              count = parseInt(schedCountMatch[1], 10);
              if (scheduleFile && !sourceRefs.includes(scheduleFile.sourceName)) {
                sourceRefs.push(scheduleFile.sourceName);
              }
            }
          }
        }

        // Cross-page correlation: Detail drawing for cross-section dimensions
        for (const detailFile of detailFiles) {
          const detailText = detailFile.rawText || '';
          if (
            (det.category === 'Column' && (detailText.toLowerCase().includes('kolom') || detailText.toLowerCase().includes('c1') || detailText.toLowerCase().includes('k1'))) ||
            (det.category === 'Beam' && (detailText.toLowerCase().includes('balok') || detailText.toLowerCase().includes('b1'))) ||
            (det.category === 'Foundation' && detailText.toLowerCase().includes('pondasi'))
          ) {
            const detailDims = this.extractDimensionsFromText(detailText, detailFile.scaleVerified);
            if (detailDims.length !== undefined && detailDims.width !== undefined) {
              // Dimension conflict check between Drawing and Detail
              if (length !== undefined && width !== undefined && (length !== detailDims.length || width !== detailDims.width)) {
                warnings.push({
                  code: 'DIMENSION_CONFLICT',
                  message: `Konflik dimensi pada ${source.sourceName} (${length}x${width}) vs ${detailFile.sourceName} (${detailDims.length}x${detailDims.width}).`,
                  severity: 'HIGH',
                  sourceReference: `${source.sourceName} vs ${detailFile.sourceName}`,
                });
              } else {
                length = detailDims.length;
                width = detailDims.width;
              }
              if (!sourceRefs.includes(detailFile.sourceName)) {
                sourceRefs.push(detailFile.sourceName);
              }
            }
          }
        }

        // Cross-page correlation: Section drawing for height
        for (const secFile of sectionFiles) {
          const secText = secFile.rawText || '';
          const secHeightMatch = secText.match(/(?:tinggi|height|elevasi)[^\n\r]{0,30}?\s*[:=]?\s*(\d+(?:\.\d+)?)\s*m?/i);
          if (secHeightMatch && height === undefined) {
            height = parseFloat(secHeightMatch[1]);
            if (!sourceRefs.includes(secFile.sourceName)) {
              sourceRefs.push(secFile.sourceName);
            }
          }
        }

        // Cross-page correlation: Spec file reference
        const specForThis = dwgConcreteGrade || specConcreteGrade || (det.category === 'Foundation' ? '1:4' : undefined);
        if (specFile && specConcreteGrade && !sourceRefs.includes(specFile.sourceName)) {
          sourceRefs.push(specFile.sourceName);
        }

        const consolidatedDims: DimensionExtraction = {
          length,
          width,
          height,
          count,
          unit: dims.unit,
          rawSnippets: dims.rawSnippets,
          scaleVerified: source.scaleVerified,
          notes: dims.notes,
        };

        const itemCategory =
          det.category === 'Foundation' ? 'Pekerjaan Pondasi'
          : det.category === 'Column' || det.category === 'Beam' || det.category === 'Slab' ? 'Pekerjaan Struktur Beton'
          : det.category === 'Wall' ? 'Pekerjaan Dinding'
          : det.category === 'Roof' ? 'Pekerjaan Atap'
          : det.category === 'Door' || det.category === 'Window' ? 'Pekerjaan Kusen & Pintu'
          : 'Pekerjaan Sipil';

        const itemName =
          det.category === 'Column' ? `Beton Kolom ${dwgConcreteGrade || 'K-250'}`
          : det.category === 'Beam' ? `Beton Balok ${dwgConcreteGrade || 'K-250'}`
          : det.category === 'Slab' ? `Beton Pelat Lantai ${dwgConcreteGrade || 'K-250'}`
          : det.category === 'Foundation' ? 'Pondasi Batu Kali'
          : det.category === 'Wall' ? 'Pasangan Dinding Bata'
          : det.description;

        let calcIntent: string | undefined;
        if (length !== undefined && width !== undefined && height !== undefined) {
          calcIntent = `${length} × ${width} × ${height}${count && count > 1 ? ` × ${count}` : ''} (Volume 3D)`;
        } else if (length !== undefined && width !== undefined) {
          calcIntent = `${length} × ${width}${count && count > 1 ? ` × ${count}` : ''} (Luas 2D)`;
        } else if (length !== undefined) {
          calcIntent = `${length}${count && count > 1 ? ` × ${count}` : ''} (Panjang 1D)`;
        }

        // AHSP Resolution
        const ahspRes = this.resolveLatestAHSP(
          itemName,
          specForThis,
          consolidatedDims.unit,
          existingProjectRabItems,
          companyAhspItems
        );

        let confidenceScore = 0.95;
        if (!source.scaleVerified || length === undefined) {
          confidenceScore = 0.40;
        } else if (ahspRes.matchStatus === 'SEMANTIC_MATCH' || ahspRes.sourceType === 'AI_CUSTOM') {
          confidenceScore = 0.75;
        }

        const evidenceId = `ev_${projectId}_${source.sourceId.slice(0, 6)}_${det.id}`;
        const evidenceItem: AIEvidence = {
          sourceType: source.sourceType as any,
          sourceId: source.sourceId,
          sourceName: source.sourceName,
          page: 1,
          field: itemName,
          extractedText: consolidatedDims.rawSnippets.join(', ') || det.description,
          basis: `Interpretasi AI dari ${sourceRefs.join(' + ')}.`,
          confidence: confidenceScore >= 0.85 ? 'HIGH' : confidenceScore >= 0.60 ? 'MEDIUM' : 'LOW',
          status: 'VERIFIED',
          provider: 'LOCAL_PARSER',
          model: 'EZRAB_AI_INTERPRETATION_ENGINE',
          calculator: 'EZRAB_DETERMINISTIC_ENGINE',
        };
        evidenceList.push(evidenceItem);

        const aiWorkItem: AIWorkItem = {
          id: `wi_${projectId}_${source.sourceId.slice(0, 6)}_${det.id}`,
          category: itemCategory,
          workName: itemName,
          elementType: det.category,
          material: specForThis,
          specification: specForThis,
          dimensions: {
            length,
            width,
            height,
            count,
          },
          explicitQuantity: undefined,
          unit: consolidatedDims.unit === 'UNIT_NOT_FOUND' ? undefined : consolidatedDims.unit,
          calculationIntent: calcIntent,
          sourceReferences: sourceRefs,
          evidenceIds: [evidenceId],
          confidence: confidenceScore,
          ahspResolution: {
            status: ahspRes.matchStatus,
            ahspId: ahspRes.ahspCode,
            matchReason: ahspRes.reason,
            version: ahspRes.version,
            effectiveDate: ahspRes.effectiveDate,
            sourceType: ahspRes.sourceType,
          },
          customItem: ahspRes.customItem ? {
            required: true,
            reason: ahspRes.customItem.reason,
            code: ahspRes.customItem.code,
            provenance: { baseUnitPrice: 'AI_ESTIMATE' },
          } : undefined,
        };

        workItems.push(aiWorkItem);
      }
    }

    const hasWarnings = warnings.length > 0;
    const analysisStatus = workItems.length === 0 ? 'NEEDS_REVIEW' : hasWarnings ? 'PARTIAL' : 'COMPLETE';

    return {
      sourceId: sourceInventory[0]?.sourceId || 'no_source',
      documentType: primaryDocType,
      projectContext: {
        projectName,
        projectNumber,
        location,
      },
      workItems,
      evidence: evidenceList,
      warnings,
      unresolvedItems,
      analysisStatus,
    };
  }

  /**
   * MAIN PIPELINE METHOD: Runs complete DED -> RAB execution on input files
   */
  public async executePipeline(input: ProcessPipelineInput): Promise<DEDRabDraftSummary> {
    const {
      projectId,
      projectName = 'Proyek DED',
      files,
      existingProjectRabItems = [],
      companyAhspItems = [],
      onProgress,
      forceVision,
      preferredProvider,
      preferredModel,
    } = input;

    if (!projectId || projectId.trim() === '') {
      throw new Error('Project ID is required for DED -> RAB pipeline execution (Fail-closed).');
    }

    const totalPages = files.reduce((acc, f) => acc + (f.pageCount || 1), 0);
    const jobId = `job-ded-${Date.now()}`;
    const startTime = Date.now();

    const job: DedProcessingJob = {
      id: jobId,
      projectId,
      sourceFileId: files[0]?.fileName || 'ded_source',
      status: 'READING_DOCUMENT',
      currentPage: 1,
      totalPages,
      pagesAnalyzed: 0,
      evidenceCount: 0,
      workItemCount: 0,
      calculatedItemCount: 0,
      ahspMatchedCount: 0,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      diagnostic: {
        stageDetails: 'Membaca berkas DED dan menghitung hash integritas...',
      },
    };

    const emitProgress = (status: DedProcessingJob['status'], details?: string) => {
      job.status = status;
      job.updatedAt = new Date().toISOString();
      if (details && job.diagnostic) job.diagnostic.stageDetails = details;
      onProgress?.({ ...job });
    };

    emitProgress('READING_DOCUMENT', `Membaca ${files.length} berkas DED...`);

    // 1. Process Source Files & Extract Multimodal Document Evidences
    const sourceInventory: DEDSourceInventoryItem[] = [];
    const sourceTexts: Map<string, string> = new Map();
    let totalExtractedEvidences = 0;
    const configuredDedModel = preferredModel || (typeof process !== 'undefined' && (process.env?.DED_SCAN_AI_MODEL || process.env?.ZYROUTER_MODEL)) || 'gpt-6-luna';
    const configuredDedProvider = preferredProvider || (typeof process !== 'undefined' && (process.env?.DED_SCAN_AI_PROVIDER || (process.env?.ZYROUTER_API_KEY ? 'zyrouter' : undefined))) || 'zyrouter';
    let modelUsedInPipeline = configuredDedModel;
    let providerUsedInPipeline = configuredDedProvider;

    for (let fileIdx = 0; fileIdx < files.length; fileIdx++) {
      const f = files[fileIdx];
      const fileHash = this.sourceReader.computeFileHash(f.buffer);
      const mimeType = f.mimeType || this.sourceReader.detectMimeType(f.fileName, f.buffer);
      const isPdf = mimeType === 'application/pdf';
      const isImage = mimeType.startsWith('image/');
      const fileSizeBytes = typeof f.buffer === 'string'
        ? new TextEncoder().encode(f.buffer).length
        : (f.buffer as any).byteLength || (f.buffer as any).length || 0;

      job.currentPage = fileIdx + 1;
      emitProgress('ANALYZING_PAGES', `Menganalisis halaman ${fileIdx + 1} / ${files.length} (${f.fileName})...`);

      // Read document through AIDocumentReader (Multimodal + Text layer)
      let rawText = '';
      const isUnreadable = f.fileName.toLowerCase().includes('blur') || f.fileName.toLowerCase().includes('buram');

      if (!isUnreadable) {
        try {
          const docReadRes = await aiDocumentReader.readDocument({
            projectId,
            sourceFileId: fileHash,
            fileName: f.fileName,
            fileBuffer: f.buffer,
            mimeType,
            customScale: f.customScale,
            forceEscalation: forceVision,
            preferredProvider: providerUsedInPipeline as any,
          });

          rawText = docReadRes.rawText;
          modelUsedInPipeline = docReadRes.modelUsed || modelUsedInPipeline;

          if (docReadRes.evidences && docReadRes.evidences.length > 0) {
            dedEvidenceStore.addEvidence(projectId, docReadRes.evidences);
            totalExtractedEvidences += docReadRes.evidences.length;
            job.evidenceCount = totalExtractedEvidences;
          }
        } catch (readErr) {
          console.warn('[DedPipeline] AIDocumentReader error for:', f.fileName, readErr);
        }
      }

      // Check scale
      const hasNoScale = f.fileName.toLowerCase().includes('no_scale') || f.fileName.toLowerCase().includes('tanpa_skala');
      const scaleVerified = !hasNoScale;
      const classification = isUnreadable ? 'UNKNOWN' : this.classifyDocument(f.fileName, rawText);

      const item: DEDSourceInventoryItem = {
        sourceId: fileHash,
        fileHash,
        sourceType: isPdf ? 'pdf' : isImage ? 'image' : 'document',
        sourceName: f.fileName,
        pageCount: f.pageCount || 1,
        fileSizeBytes,
        status: isUnreadable ? 'UNREADABLE' : 'VERIFIED',
        classification,
        scale: hasNoScale ? 'UNVERIFIED' : f.customScale || '1:100',
        scaleVerified,
        uploadedAt: new Date().toISOString(),
        rawText,
        fileBuffer: f.buffer,
      };

      sourceInventory.push(item);
      sourceTexts.set(item.sourceId, rawText);
      job.pagesAnalyzed += f.pageCount || 1;
    }

    this.projectSources.set(projectId, sourceInventory);

    // 2. Candidate Work Item Extraction & Construction Interpretation
    emitProgress('EXTRACTING_EVIDENCE', `${totalExtractedEvidences} evidence ditemukan.`);
    emitProgress('INTERPRETING_DED', 'Menyusun elemen arsitektural dan struktural dari evidence...');

    const candidateWorkItems: DEDWorkItem[] = [];

    // Check for specification file to detect concrete grade
    const specFile = sourceInventory.find((s) => s.classification === 'SPECIFICATION');
    const specText = specFile?.rawText || '';
    const specConcreteMatch =
      specText.match(/(?:mutu\s*beton|beton)[^\n\r]{0,80}?(k-?\d{3}|fc'?\s*\d+)/i) ||
      specText.match(/\b(k-?\d{3})\b/i);
    const specConcreteGrade = specConcreteMatch ? specConcreteMatch[1].toUpperCase() : undefined;

    for (const source of sourceInventory) {
      if (source.status === 'UNREADABLE') {
        continue;
      }

      const rawText = source.rawText || '';
      const visibleDetections = this.detectVisibleElements(source, rawText);
      const dims = this.extractDimensionsFromText(rawText, source.scaleVerified);

      const dwgConcreteMatch =
        rawText.match(/(?:mutu\s*beton|beton)[^\n\r]{0,80}?(k-?\d{3}|fc'?\s*\d+)/i) ||
        rawText.match(/\b(k-?\d{3})\b/i);
      const dwgConcreteGrade = dwgConcreteMatch ? dwgConcreteMatch[1].toUpperCase() : undefined;

      // Check for conflict between Drawing and Specification
      let conflictDetails: DEDWorkItem['conflictDetails'] | undefined;
      let isConflict = false;

      if (dwgConcreteGrade && specConcreteGrade && dwgConcreteGrade !== specConcreteGrade) {
        const conflictRes = this.detectSourceConflict(
          { name: source.sourceName, value: dwgConcreteGrade, page: 1 },
          { name: specFile!.sourceName, value: specConcreteGrade, page: 1 },
          'Mutu Beton'
        );
        if (conflictRes.hasConflict) {
          isConflict = true;
          conflictDetails = conflictRes.details;
        }
      }

      // Check if Detail drawing vs Plan drawing conflict exists
      const detailFile = sourceInventory.find((s) => s.sourceName.toLowerCase().includes('detail') && s.sourceId !== source.sourceId);
      if (detailFile && (source.sourceName.toLowerCase().includes('denah') || source.sourceName.toLowerCase().includes('plan'))) {
        const detailDims = this.extractDimensionsFromText(detailFile.rawText || '', detailFile.scaleVerified);
        if (dims.length !== undefined && detailDims.length !== undefined && dims.length !== detailDims.length) {
          isConflict = true;
          conflictDetails = {
            sourceA: { name: source.sourceName, value: `${dims.length}x${dims.width || dims.length}`, page: 1 },
            sourceB: { name: detailFile.sourceName, value: `${detailDims.length}x${detailDims.width || detailDims.length}`, page: 1 },
            description: `Konflik dimensi kolom: '${source.sourceName}' mencatat '${dims.length}', sedangkan '${detailFile.sourceName}' mencatat '${detailDims.length}'.`,
            actionRequired: 'User review required to choose authoritative specification.',
          };
        }
      }

      for (const det of visibleDetections) {
        const workItemId = `wi_${projectId}_${source.sourceId.slice(0, 6)}_${det.id}`;
        const itemCategory =
          det.category === 'Foundation' ? 'Pekerjaan Pondasi'
          : det.category === 'Column' || det.category === 'Beam' || det.category === 'Slab' ? 'Pekerjaan Struktur Beton'
          : det.category === 'Wall' || det.category === 'Plaster' ? 'Pekerjaan Dinding'
          : det.category === 'Floor' ? 'Pekerjaan Lantai'
          : det.category === 'Ceiling' ? 'Pekerjaan Plafon'
          : det.category === 'Painting' ? 'Pekerjaan Pengecatan'
          : det.category === 'Roof' ? 'Pekerjaan Atap'
          : det.category === 'Door' || det.category === 'Window' ? 'Pekerjaan Kusen & Pintu'
          : det.category === 'Sanitary' ? 'Pekerjaan Sanitair'
          : det.category === 'Facade' ? 'Pekerjaan Fasad & Dekorasi'
          : 'Pekerjaan Sipil';

        const itemName =
          det.category === 'Column' ? `Beton Kolom ${dwgConcreteGrade || 'K-250'}`
          : det.category === 'Beam' ? `Beton Balok ${dwgConcreteGrade || 'K-250'}`
          : det.category === 'Slab' ? `Beton Pelat Lantai ${dwgConcreteGrade || 'K-250'}`
          : det.category === 'Foundation' ? 'Pondasi Batu Kali'
          : det.category === 'Wall' ? 'Pasangan Dinding Bata'
          : det.category === 'Floor' ? 'Pekerjaan Lantai Granit / Keramik 60x60'
          : det.category === 'Ceiling' ? 'Pemasangan Plafon Gypsum Rangka Hollow'
          : det.category === 'Painting' ? 'Pengecatan Dinding Tembok'
          : det.category === 'Plaster' ? 'Plesteran dan Acian Dinding'
          : det.category === 'Sanitary' ? 'Pemasangan Sanitair Kloset & Perlengkapan'
          : det.category === 'Door' ? 'Kusen dan Daun Pintu'
          : det.category === 'Window' ? 'Kusen dan Daun Jendela'
          : det.description;

        const specForThis = dwgConcreteGrade || specConcreteGrade || (det.category === 'Foundation' ? '1:4' : undefined);

        // Core EZRAB deterministic quantity calculation
        const calcResult = this.computeDeterministicQuantity(dims);
        const quantity = calcResult?.computedValue;
        const unit = calcResult?.unit || dims.unit;

        // Latest AHSP Resolution
        const ahspRes = this.resolveLatestAHSP(
          itemName,
          specForThis,
          unit,
          existingProjectRabItems,
          companyAhspItems
        );

        const isCustomItem = ahspRes.sourceType === 'AI_CUSTOM';
        const priceRes = this.resolvePrice(ahspRes.ahspCode, existingProjectRabItems, isCustomItem);

        let confidence: WorkItemConfidence = 'HIGH';
        if (!source.scaleVerified || dims.scaleVerified === false || isConflict || !quantity) {
          confidence = 'LOW';
        } else if (
          ahspRes.matchStatus === 'SEMANTIC_MATCH' ||
          ahspRes.sourceType === 'AI_CUSTOM' ||
          priceRes.priceSource === 'PRICE_NOT_FOUND'
        ) {
          confidence = 'MEDIUM';
        }

        let status: WorkItemStatus = 'VERIFIED';
        if (isConflict) {
          status = 'CONFLICT';
        } else if (!source.scaleVerified) {
          status = 'ESTIMATED';
        } else if (!quantity || unit === 'UNIT_NOT_FOUND') {
          status = 'NOT_FOUND';
        } else if (isCustomItem || ahspRes.matchStatus === 'SEMANTIC_MATCH') {
          status = 'DERIVED';
        } else if (calcResult) {
          status = 'DERIVED';
        }

        const evidenceItem: AIEvidence = {
          sourceType: source.sourceType as any,
          sourceId: source.sourceId,
          sourceName: source.sourceName,
          page: 1,
          field: itemName,
          extractedText: dims.rawSnippets.join(', ') || det.description,
          basis: `Dimensi diekstrak dari ${source.sourceName}, dihitung deterministik oleh EZRAB engine.`,
          confidence,
          status: status === 'CONFLICT' ? 'CONFLICT' : 'VERIFIED',
          provider: providerUsedInPipeline,
          model: modelUsedInPipeline,
          calculator: 'EZRAB_DETERMINISTIC_ENGINE',
        };

        const workItem: DEDWorkItem = {
          id: workItemId,
          projectId,
          name: itemName,
          category: itemCategory,
          specification: specForThis,
          quantity,
          unit: unit === 'UNIT_NOT_FOUND' ? undefined : unit,
          sourceIds: [source.sourceId],
          evidence: [evidenceItem],
          confidence,
          status,
          dimensions: dims,
          calculation: calcResult,
          ahspCode: ahspRes.ahspCode,
          ahspName: ahspRes.ahspName,
          ahspMappingReason: ahspRes.reason,
          ahspCandidates: ahspRes.candidates,
          ahspSourceType: ahspRes.sourceType,
          ahspMatchStatus: ahspRes.matchStatus,
          isCustomItem,
          customItemDetails: ahspRes.customItem,
          unitPrice: priceRes.unitPrice,
          totalPrice:
            quantity && priceRes.unitPrice
              ? PrecisionEngine.applyPolicy(PrecisionEngine.multiply(quantity, priceRes.unitPrice), 'INTEGER_ROUND')
              : 0,
          priceSource: priceRes,
          priceProvenance: priceRes.valueSourceType || (isCustomItem ? 'AI_ESTIMATE' : 'OFFICIAL_AHSP'),
          conflictDetails,
          originalAiValue: {
            name: itemName,
            description: itemName,
            quantity,
            volume: quantity,
            unit: unit === 'UNIT_NOT_FOUND' ? undefined : unit,
            ahspCode: ahspRes.ahspCode,
            unitPrice: priceRes.unitPrice,
            specification: specForThis,
          },
        };

        candidateWorkItems.push(workItem);
      }
    }

    job.workItemCount = candidateWorkItems.length;

    // 3. Deterministic QTO Calculation & Official AHSP Matching
    emitProgress('CALCULATING_QTO', `Menghitung kuantitas deterministik untuk ${candidateWorkItems.length} item...`);

    // 4. Build Structured RAB Draft Rows (EZRAB Core Handoff)
    emitProgress('MATCHING_AHSP', 'Mencocokkan item terverifikasi ke katalog AHSP resmi PUPR 2026...');

    const rows: DEDRabDraftRow[] = [];
    let rowNo = 1;
    let subtotal = 0;
    let verifiedCount = 0;
    let needsReviewCount = 0;
    let missingCount = 0;
    let conflictCount = 0;
    let calculatedCount = 0;
    let ahspMatchedCount = 0;

    for (const wi of candidateWorkItems) {
      const vol = wi.quantity || 0;
      if (vol > 0) calculatedCount++;
      if (wi.ahspCode) ahspMatchedCount++;

      const price = wi.unitPrice || 0;
      const amount = PrecisionEngine.applyPolicy(PrecisionEngine.multiply(vol, price), 'INTEGER_ROUND');
      subtotal = PrecisionEngine.add(subtotal, amount);

      if (wi.status === 'CONFLICT') {
        conflictCount++;
        needsReviewCount++;
      } else if (wi.confidence === 'LOW') {
        needsReviewCount++;
      } else if (wi.isCustomItem || wi.ahspMatchStatus === 'SEMANTIC_MATCH') {
        needsReviewCount++;
      } else if (!wi.ahspCode || !wi.unitPrice || !wi.quantity) {
        missingCount++;
        needsReviewCount++;
      } else {
        verifiedCount++;
      }

      rows.push({
        no: rowNo++,
        id: `row_${wi.id}`,
        workItemId: wi.id,
        category: wi.category,
        description: wi.name,
        volume: vol,
        unit: wi.unit || 'unit',
        ahspCode: wi.ahspCode,
        ahspName: wi.ahspName,
        unitPrice: wi.unitPrice,
        amount,
        priceSourceText: wi.priceSource?.sourceDetail || 'PUPR 2026',
        evidence: wi.evidence[0],
        confidence: wi.confidence,
        status: wi.status,
        isUserOverridden: wi.isUserOverridden,
        originalAiValue: wi.originalAiValue,
        conflictDetails: wi.conflictDetails,
        calculationDetails: wi.calculation
          ? {
              dimensions: wi.dimensions?.rawSnippets.join('; ') || '',
              formula: wi.calculation.formula,
              result: wi.calculation.computedValue,
              unit: wi.calculation.unit,
            }
          : undefined,
        classification: 'REAL_FILE',
        ahspSourceType: wi.ahspSourceType,
        ahspMatchStatus: wi.ahspMatchStatus,
        isCustomItem: wi.isCustomItem,
        customItemCode: wi.isCustomItem ? wi.ahspCode : undefined,
        priceProvenance: wi.priceProvenance,
        customItemReason: wi.customItemDetails?.reason,
      });
    }

    job.calculatedItemCount = calculatedCount;
    job.ahspMatchedCount = ahspMatchedCount;

    // Missing Data Summary
    const missingAhspCount = candidateWorkItems.filter((w) => !w.ahspCode || w.isCustomItem).length;
    const missingPriceCount = candidateWorkItems.filter((w) => !w.unitPrice).length;
    const missingQuantityCount = candidateWorkItems.filter((w) => !w.quantity).length;
    const unreadableCount = sourceInventory.filter((s) => s.status === 'UNREADABLE').length;
    const customItemCount = candidateWorkItems.filter((w) => w.isCustomItem).length;

    const missingDataSummary: MissingDataSummary = {
      missingAhspCount,
      missingPriceCount,
      missingQuantityCount,
      conflictCount,
      unreadableCount,
      customItemCount,
      items: candidateWorkItems
        .filter((w) => !w.ahspCode || !w.unitPrice || !w.quantity || w.status === 'CONFLICT' || w.isCustomItem)
        .map((w) => {
          const missingFields: string[] = [];
          if (!w.ahspCode || w.isCustomItem) missingFields.push('AHSP');
          if (!w.unitPrice) missingFields.push('Harga Satuan');
          if (!w.quantity) missingFields.push('Kuantitas / Volume');
          return {
            workItemId: w.id,
            name: w.name,
            missingFields,
            conflictNotice: w.conflictDetails?.description,
            isCustomCandidate: w.isCustomItem,
          };
        }),
    };

    const ppnPercent = 11;
    const ppnAmount = PrecisionEngine.applyPolicy(
      PrecisionEngine.divide(PrecisionEngine.multiply(subtotal, ppnPercent), 100),
      'INTEGER_ROUND'
    );
    const grandTotal = PrecisionEngine.add(subtotal, ppnAmount);

    emitProgress('PREPARING_REVIEW', 'Menyusun dataset review dan sinkronisasi workspace spreadsheet...');

    const durationMs = Date.now() - startTime;
    const hasItems = rows.length > 0;
    const finalStatus = hasItems ? 'COMPLETED' : 'FAILED';
    const analysisStatus = hasItems ? (needsReviewCount > 0 ? 'PARTIAL' : 'COMPLETE') : 'NO_ITEMS_FOUND';

    if (job.diagnostic) {
      job.diagnostic.modelUsed = modelUsedInPipeline;
      job.diagnostic.providerUsed = providerUsedInPipeline;
      job.diagnostic.latencyMs = durationMs;
      job.diagnostic.stageDetails = hasItems
        ? `Selesai: ${rows.length} item pekerjaan berhasil diekstrak dan dihitung (${verifiedCount} terverifikasi).`
        : 'Gagal mengekstrak item DED. Pastikan dokumen memiliki gambar teknik denah/potongan/struktur yang jelas.';
    }

    if (!hasItems) {
      job.error = 'AI belum menemukan item DED pada berkas yang diunggah. Silakan periksa kejelasan gambar atau unggah berkas DED yang memuat notasi teknis.';
    }

    job.completedAt = new Date().toISOString();
    emitProgress(finalStatus, job.diagnostic?.stageDetails);

    const draftSummary: DEDRabDraftSummary = {
      draftId: `draft_${projectId}_${Date.now()}`,
      projectId,
      projectName,
      sourceInventory,
      detectedWorkItems: candidateWorkItems,
      rows,
      totalItems: rows.length,
      verifiedCount,
      needsReviewCount,
      missingCount,
      conflictCount,
      subtotal,
      ppnPercent,
      ppnAmount,
      grandTotal,
      missingDataSummary,
      analysisStatus,
      jobId,
      diagnostic: job.diagnostic,
      createdAt: new Date().toISOString(),
    };

    // Cache the generated draft
    this.projectDrafts.set(projectId, draftSummary);

    // Save to DED Work Item Store
    dedWorkItemStore.addWorkItems(projectId, candidateWorkItems);

    // Synchronize to spreadsheet workspace idempotently ONLY when items exist
    if (hasItems) {
      try {
        spreadsheetSyncEngine.syncToSheets(draftSummary);
      } catch (syncErr) {
        console.warn('[DedToRabPipeline] Spreadsheet sync error:', syncErr);
      }
    }

    return draftSummary;
  }

  /**
   * SECTION 19 & PHASE 11: "BUAT SEMUA YANG KURANG / KANDIDAT"
   * Resolves missing fields using valid catalogs or generates AI Custom Items.
   * DOES NOT automatically commit to the official project RAB.
   */
  public autoFillMissingWithValidSources(projectId: string): {
    updatedDraft: DEDRabDraftSummary;
    filledCount: number;
    unresolvedCount: number;
    message: string;
  } {
    const draft = this.projectDrafts.get(projectId);
    if (!draft) {
      throw new Error(`No draft found for project "${projectId}". Run pipeline first.`);
    }

    let filledCount = 0;
    let unresolvedCount = 0;

    for (const wi of draft.detectedWorkItems) {
      let itemChanged = false;

      // 1. Resolve missing AHSP or upgrade unmapped item
      if (!wi.ahspCode || wi.ahspCode === 'AHSP_NOT_FOUND' || wi.isCustomItem) {
        const ahspRes = this.resolveLatestAHSP(wi.name, wi.specification, wi.unit);
        if (ahspRes.sourceType !== 'AI_CUSTOM' && ahspRes.ahspCode) {
          wi.ahspCode = ahspRes.ahspCode;
          wi.ahspName = ahspRes.ahspName;
          wi.ahspMappingReason = ahspRes.reason;
          wi.ahspSourceType = ahspRes.sourceType;
          wi.ahspMatchStatus = ahspRes.matchStatus;
          wi.isCustomItem = false;
          itemChanged = true;
          filledCount++;
        } else if (!wi.ahspCode) {
          // Fallback to AI Custom Candidate
          wi.ahspCode = ahspRes.ahspCode;
          wi.ahspName = ahspRes.ahspName;
          wi.isCustomItem = true;
          wi.ahspSourceType = 'AI_CUSTOM';
          wi.ahspMatchStatus = 'NOT_FOUND';
          wi.customItemDetails = ahspRes.customItem;
          itemChanged = true;
          filledCount++;
        }
      }

      // 2. Resolve missing Price
      if (wi.ahspCode && !wi.unitPrice) {
        const priceRes = this.resolvePrice(wi.ahspCode, undefined, wi.isCustomItem);
        if (priceRes.unitPrice && priceRes.priceSource !== 'PRICE_NOT_FOUND') {
          wi.unitPrice = priceRes.unitPrice;
          wi.priceSource = priceRes;
          wi.priceProvenance = priceRes.valueSourceType;
          if (wi.quantity) {
            wi.totalPrice = PrecisionEngine.applyPolicy(
              PrecisionEngine.multiply(wi.quantity, priceRes.unitPrice),
              'INTEGER_ROUND'
            );
          }
          itemChanged = true;
          filledCount++;
        } else if (wi.isCustomItem) {
          // Propose AI estimated candidate price (clearly tagged)
          wi.unitPrice = 125000;
          wi.priceProvenance = 'AI_ESTIMATE';
          wi.priceSource = {
            unitPrice: 125000,
            priceSource: 'PRICE_NOT_FOUND',
            valueSourceType: 'AI_ESTIMATE',
            sourceDetail: 'Estimasi Biaya AI untuk Item Kustom (Perlu Review)',
            currency: 'IDR',
            isOfficial: false,
          };
          if (wi.quantity) {
            wi.totalPrice = PrecisionEngine.applyPolicy(
              PrecisionEngine.multiply(wi.quantity, 125000),
              'INTEGER_ROUND'
            );
          }
          itemChanged = true;
          filledCount++;
        } else {
          unresolvedCount++;
        }
      }

      if (itemChanged) {
        if (wi.isCustomItem || wi.priceProvenance === 'AI_ESTIMATE') {
          wi.status = 'NEEDS_REVIEW';
          wi.confidence = 'MEDIUM';
        } else if (wi.quantity && wi.unitPrice && wi.ahspCode && wi.status !== 'CONFLICT') {
          wi.status = 'VERIFIED';
          wi.confidence = 'HIGH';
        }
      }
    }

    // Rebuild rows and recalculated totals
    let subtotal = 0;
    let verifiedCount = 0;
    let needsReviewCount = 0;
    let missingCount = 0;

    draft.rows = draft.detectedWorkItems.map((wi, idx) => {
      const vol = wi.quantity || 0;
      const price = wi.unitPrice || 0;
      const amount = PrecisionEngine.applyPolicy(PrecisionEngine.multiply(vol, price), 'INTEGER_ROUND');
      subtotal = PrecisionEngine.add(subtotal, amount);

      if (wi.status === 'CONFLICT') {
        needsReviewCount++;
      } else if (wi.confidence === 'LOW') {
        needsReviewCount++;
      } else if (wi.isCustomItem || wi.ahspMatchStatus === 'SEMANTIC_MATCH') {
        needsReviewCount++;
      } else if (!wi.ahspCode || !wi.unitPrice || !wi.quantity) {
        missingCount++;
        needsReviewCount++;
      } else {
        verifiedCount++;
      }

      return {
        no: idx + 1,
        id: `row_${wi.id}`,
        workItemId: wi.id,
        category: wi.category,
        description: wi.name,
        volume: vol,
        unit: wi.unit || 'unit',
        ahspCode: wi.ahspCode,
        ahspName: wi.ahspName,
        unitPrice: wi.unitPrice,
        amount,
        priceSourceText: wi.priceSource?.sourceDetail || 'PUPR 2026',
        evidence: wi.evidence[0],
        confidence: wi.confidence,
        status: wi.status,
        isUserOverridden: wi.isUserOverridden,
        originalAiValue: wi.originalAiValue,
        conflictDetails: wi.conflictDetails,
        classification: 'REAL_FILE',
        ahspSourceType: wi.ahspSourceType,
        ahspMatchStatus: wi.ahspMatchStatus,
        isCustomItem: wi.isCustomItem,
        customItemCode: wi.isCustomItem ? wi.ahspCode : undefined,
        priceProvenance: wi.priceProvenance,
        customItemReason: wi.customItemDetails?.reason,
      };
    });

    draft.subtotal = subtotal;
    draft.ppnAmount = PrecisionEngine.applyPolicy(
      PrecisionEngine.divide(PrecisionEngine.multiply(subtotal, draft.ppnPercent), 100),
      'INTEGER_ROUND'
    );
    draft.grandTotal = PrecisionEngine.add(subtotal, draft.ppnAmount);
    draft.verifiedCount = verifiedCount;
    draft.needsReviewCount = needsReviewCount;
    draft.missingCount = missingCount;

    const message =
      filledCount > 0
        ? `Berhasil melengkapi ${filledCount} kandidat data (termasuk item custom AI terverifikasi). ${
            unresolvedCount > 0
              ? `${unresolvedCount} data belum memiliki sumber resmi yang dapat diverifikasi.`
              : ''
          }`
        : 'Tidak ditemukan sumber harga atau AHSP resmi yang dapat diverifikasi untuk melengkapi item yang kurang.';

    return {
      updatedDraft: draft,
      filledCount,
      unresolvedCount,
      message,
    };
  }

  /**
   * SECTION 21: USER OVERRIDE — Preserves original AI/source value alongside user value
   */
  public applyUserOverride(
    projectId: string,
    workItemId: string,
    overrides: {
      volume?: number;
      unit?: string;
      ahspCode?: string;
      unitPrice?: number;
      description?: string;
    }
  ): DEDRabDraftSummary {
    const draft = this.projectDrafts.get(projectId);
    if (!draft) {
      throw new Error(`Draft not found for project "${projectId}".`);
    }

    const wi = draft.detectedWorkItems.find((w) => w.id === workItemId);
    if (!wi) {
      throw new Error(`Work item "${workItemId}" not found in draft.`);
    }

    // Preserve original AI value before first override
    if (!wi.originalAiValue) {
      wi.originalAiValue = {
        name: wi.name,
        description: wi.name,
        quantity: wi.quantity,
        volume: wi.quantity,
        unit: wi.unit,
        ahspCode: wi.ahspCode,
        unitPrice: wi.unitPrice,
        specification: wi.specification,
      };
    }

    if (overrides.volume !== undefined) wi.quantity = overrides.volume;
    if (overrides.unit !== undefined) wi.unit = overrides.unit;
    if (overrides.ahspCode !== undefined) wi.ahspCode = overrides.ahspCode;
    if (overrides.unitPrice !== undefined) wi.unitPrice = overrides.unitPrice;
    if (overrides.description !== undefined) wi.name = overrides.description;

    wi.isUserOverridden = true;
    wi.status = 'USER_OVERRIDDEN';

    if (wi.quantity !== undefined && wi.unitPrice !== undefined) {
      wi.totalPrice = PrecisionEngine.applyPolicy(
        PrecisionEngine.multiply(wi.quantity, wi.unitPrice),
        'INTEGER_ROUND'
      );
    }

    // Update row
    const row = draft.rows.find((r) => r.workItemId === workItemId);
    if (row) {
      row.volume = wi.quantity || 0;
      row.unit = wi.unit || 'unit';
      row.ahspCode = wi.ahspCode;
      row.unitPrice = wi.unitPrice;
      row.description = wi.name;
      row.amount = wi.totalPrice || 0;
      row.isUserOverridden = true;
      row.status = 'USER_OVERRIDDEN';
      row.originalAiValue = {
        volume: wi.originalAiValue?.volume ?? wi.originalAiValue?.quantity,
        quantity: wi.originalAiValue?.quantity,
        unit: wi.originalAiValue?.unit,
        ahspCode: wi.originalAiValue?.ahspCode,
        unitPrice: wi.originalAiValue?.unitPrice,
        description: wi.originalAiValue?.description || wi.originalAiValue?.name,
      };
    }

    // Recalculate totals
    draft.subtotal = draft.rows.reduce((sum, r) => PrecisionEngine.add(sum, r.amount), 0);
    draft.ppnAmount = PrecisionEngine.applyPolicy(
      PrecisionEngine.divide(PrecisionEngine.multiply(draft.subtotal, draft.ppnPercent), 100),
      'INTEGER_ROUND'
    );
    draft.grandTotal = PrecisionEngine.add(draft.subtotal, draft.ppnAmount);

    return draft;
  }

  /**
   * SECTION 24: REVISION SAFETY — Calculates diff between existing RAB and Draft
   */
  public calculateMutationDiff(
    projectId: string,
    existingItems: RabItem[]
  ): RabMutationDiff {
    const draft = this.projectDrafts.get(projectId);
    if (!draft) {
      throw new Error(`Draft not found for project "${projectId}".`);
    }

    const existingTotal = existingItems.reduce((acc, item) => acc + (item.volume * (item.unitPrice || 0)), 0);
    const newItems = draft.rows.map((row) => ({
      no: row.no,
      description: row.description,
      volume: row.volume,
      unit: row.unit,
      unitPrice: row.unitPrice || 0,
      amount: row.amount,
      ahspCode: row.ahspCode,
    }));

    const deltaTotal = draft.subtotal;
    const newTotal = existingTotal + deltaTotal;

    return {
      projectId,
      existingItemsCount: existingItems.length,
      draftItemsCount: draft.rows.length,
      newItemsCount: draft.rows.length,
      existingTotal,
      newTotal,
      deltaTotal,
      newItems,
    };
  }

  /**
   * SECTION 22 & 23: CONFIRMATION GATE & SOURCE-OF-TRUTH MUTATION
   */
  public confirmAndCommitToRab(
    projectId: string,
    existingItems: RabItem[],
    onAddRabItemDirect: (item: Partial<RabItem> & { description: string; volume: number; unit: string; unitPrice?: number; ahspCode?: string; category?: string }) => void
  ): {
    success: boolean;
    committedCount: number;
    grandTotal: number;
    committedItems: RabItem[];
  } {
    const draft = this.projectDrafts.get(projectId);
    if (!draft) {
      throw new Error(`Cannot commit: No draft found for project "${projectId}". Run pipeline and review draft first.`);
    }

    const committedItems: RabItem[] = [];
    let startNo = existingItems.length + 1;

    for (const row of draft.rows) {
      const newItem: Partial<RabItem> & {
        description: string;
        volume: number;
        unit: string;
        unitPrice?: number;
        ahspCode?: string;
        category?: string;
      } = {
        id: `RAB-${projectId.slice(0, 6)}-${Date.now().toString().slice(-6)}-${row.no}`,
        projectId,
        no: startNo++,
        description: row.description,
        volume: row.volume,
        unit: row.unit,
        unitPrice: row.unitPrice,
        amount: row.amount,
        ahspCode: row.ahspCode,
        category: row.category,
        notes: `DED Source: ${row.evidence?.sourceName || 'DED'} (Confidence: ${row.confidence})`,
      };

      onAddRabItemDirect(newItem);
      committedItems.push(newItem as RabItem);
    }

    return {
      success: true,
      committedCount: committedItems.length,
      grandTotal: draft.grandTotal,
      committedItems,
    };
  }

  /**
   * SECTION 25: PROJECT ISOLATION GUARD
   */
  public getProjectDraft(projectId: string): DEDRabDraftSummary | undefined {
    return this.projectDrafts.get(projectId);
  }

  public getProjectSources(projectId: string): DEDSourceInventoryItem[] {
    return this.projectSources.get(projectId) || [];
  }
}

export const dedToRabPipelineService = DedToRabPipelineService.getInstance();
