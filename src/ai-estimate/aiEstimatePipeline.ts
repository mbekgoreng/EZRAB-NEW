/**
 * EZRAB AI ESTIMATE 2.0 — Main Pipeline
 *
 * Single architecture with dual mode:
 * - FAST   : Gemini 3.5 Flash-Lite (Speed + Preliminary Estimate)
 * - DETAIL : Gemini 3.8 Flash (Depth + Completeness + Traceability)
 *
 * CRITICAL PRINCIPLES:
 * 1. AI ESTIMATE IS NOT AHSP. All prices are labelled AI_ESTIMATE.
 * 2. Deterministic calculation: subtotal = quantity × unitPrice.
 * 3. Quantity Sanity Gate: Physical plausibility checking; extreme quantities BLOCKED.
 * 4. Missing != Zero: Missing quantity or price strictly yields subtotal = null.
 * 5. Full auditability: Every item has quantitySource, priceSource, dimensions, and formula.
 *
 * DOES NOT CALL:
 * - AHSP matcher or AHSP price resolver
 * - Material database calculation
 * - Deterministic EZRAB cost engine
 */

import {
  AiEstimateWorkItem,
  AiEstimateOutput,
  AiEstimateProgressEvent,
  AiEstimatePipelineStage,
  AiEstimateQuantitySource,
  AiEstimatePriceSource,
  AiEstimateItemStatus,
  QuantitySanityStatus,
} from './types';
import { AiEstimateCalculator } from './aiEstimateCalculator';
import { AiEstimateSanityCheck } from './aiEstimateSanityCheck';
import { QuantitySanityGate } from './quantitySanityGate';
import {
  AiEstimateAnalysisMode,
  AI_ESTIMATE_MODELS,
  getAiEstimateModelConfig,
} from './modelConfig';

// Reuse existing DED reading infrastructure
import { DedPageInfo, DedContextMemory, FullAiWorkItem } from '../ded-rab-v3/types';
import { dedDocumentReader } from '../ded-rab-v3/reading/dedDocumentReader';
import { dedDocumentSynthesizer, DocumentSynthesisSummary } from '../ded-rab-v3/reading/dedDocumentSynthesizer';
import { dedWorkInventoryEngine } from '../ded-rab-v3/inventory/dedWorkInventoryEngine';
import { crossPageResolver } from '../ded-rab-v3/evidence/crossPageResolver';
import { duplicateDetector } from '../ded-rab-v3/evidence/duplicateDetector';
import { dedQuantityReasoningEngine } from '../ded-rab-v3/reasoning/dedQuantityReasoningEngine';
import { PdfPageService } from '../ded-rab-v2/ingestion/pdfPageService';
import { aiProviderClient } from '../ded-rab-v3/ai/aiProviderClient';

export interface AiEstimatePipelineOptions {
  projectId: string;
  projectName: string;
  files: Array<{
    fileName: string;
    buffer: ArrayBuffer | Uint8Array | Buffer | string;
    mimeType?: string;
  }>;
  region?: string;
  mode?: AiEstimateAnalysisMode;
  onProgress?: (event: AiEstimateProgressEvent) => void;
}

export class AiEstimatePipeline {
  private static instance: AiEstimatePipeline;

  private constructor() {}

  public static getInstance(): AiEstimatePipeline {
    if (!AiEstimatePipeline.instance) {
      AiEstimatePipeline.instance = new AiEstimatePipeline();
    }
    return AiEstimatePipeline.instance;
  }

  /**
   * Execute the AI Estimate 2.0 pipeline in FAST or DETAIL mode.
   */
  public async execute(options: AiEstimatePipelineOptions): Promise<AiEstimateOutput> {
    const startTime = Date.now();
    const jobId = `ai-estimate-${Date.now()}`;
    const mode: AiEstimateAnalysisMode = options.mode || 'FAST';
    const modelConfig = getAiEstimateModelConfig(mode);
    const { projectId, projectName, files, onProgress } = options;

    const notify = (
      stage: AiEstimatePipelineStage,
      stageLabel: string,
      percent: number,
      message: string,
      counts?: { pagesRead?: number; totalPages?: number; itemsFound?: number }
    ) => {
      if (onProgress) {
        onProgress({
          stage,
          stageLabel,
          percent,
          message,
          pagesRead: counts?.pagesRead || 0,
          totalPages: counts?.totalPages || 0,
          itemsFound: counts?.itemsFound || 0,
        });
      }
    };

    try {
      notify('INITIALIZING', `Memulai ${modelConfig.title}...`, 5, `Menyiapkan mesin estimasi (${modelConfig.modelName})...`);

      // ================================================================
      // STAGE 1: EXTRACT PAGES FROM PDF
      // ================================================================
      const pdfService = PdfPageService.getInstance();
      const rawPages: DedPageInfo[] = [];

      for (const file of files) {
        if (file.mimeType?.includes('pdf') || file.fileName.toLowerCase().endsWith('.pdf')) {
          const docPages = await pdfService.extractPages(`doc-${Date.now()}`, file.buffer, file.fileName);
          for (const dp of docPages) {
            rawPages.push({
              pageNumber: dp.pageNumber,
              drawingTitle: dp.drawingTitle || `Halaman ${dp.pageNumber}`,
              drawingType: dp.drawingType as any,
              scale: dp.scale,
              scaleVerified: dp.scaleVerified,
              nativeText: dp.nativeText || '',
              imageDataBase64: dp.imageDataUrl,
              width: dp.width,
              height: dp.height,
              readStatus: 'PENDING',
            });
          }
        }
      }

      if (rawPages.length === 0) {
        console.error('[AI-ESTIMATE-TRACE] PDF_EXTRACTION_ZERO_PAGES: Stage: EXTRACTION');
        throw new Error('AI_ESTIMATE_EMPTY_RESULT: Tidak ada halaman yang berhasil diekstrak dari dokumen DED (Stage: EXTRACTION)');
      }

      const totalPages = rawPages.length;
      const pagesWithText = rawPages.filter(p => (p.nativeText || '').trim().length > 0).length;
      const pagesWithImages = rawPages.filter(p => Boolean(p.imageDataBase64)).length;

      console.log('[AI-ESTIMATE-TRACE] PDF:', {
        filename: files[0]?.fileName || 'unknown.pdf',
        size: files[0]?.buffer ? (typeof files[0].buffer === 'string' ? files[0].buffer.length : (files[0].buffer as any).byteLength || (files[0].buffer as any).length || 0) : 0,
        pageCount: totalPages,
      });

      console.log('[AI-ESTIMATE-TRACE] EXTRACTION:', {
        pagesLoaded: totalPages,
        pagesWithText,
        pagesWithImages,
        imagesGenerated: pagesWithImages,
      });

      // ================================================================
      // BRANCH BY ANALYSIS MODE: FAST vs DETAIL
      // ================================================================
      let estimateItems: AiEstimateWorkItem[];
      let synthesis: DocumentSynthesisSummary;

      if (mode === 'FAST') {
        // --- FAST MODE (Gemini 3.5 Flash-Lite) ---
        const fastResult = await this.executeFastModeInternal({
          projectId,
          projectName,
          rawPages,
          totalPages,
          region: options.region,
          notify,
        });
        estimateItems = fastResult.items;
        synthesis = fastResult.synthesis;
      } else {
        // --- DETAIL MODE (Gemini 3.8 Flash) ---
        const detailResult = await this.executeDetailModeInternal({
          projectId,
          projectName,
          rawPages,
          totalPages,
          region: options.region,
          notify,
        });
        estimateItems = detailResult.items;
        synthesis = detailResult.synthesis;
      }

      if (!estimateItems || estimateItems.length === 0) {
        console.error('[AI-ESTIMATE-TRACE] PARSER: 0 items detected from DED. Stage: PARSER');
        throw new Error('AI_ESTIMATE_EMPTY_RESULT: Parser returned 0 items from DED (Stage: PARSER)');
      }

      // ================================================================
      // FINAL STAGE: SANITY GATE & DETERMINISTIC TOTALS
      // ================================================================
      notify(
        mode === 'FAST' ? 'CALCULATING_TOTALS' : 'BUILD_ESTIMATE' as any,
        mode === 'FAST' ? 'Menyusun RAB' : 'Menyusun estimasi',
        90,
        'Mengevaluasi kewajaran fisik dan menghitung subtotal deterministik...',
        { pagesRead: totalPages, totalPages, itemsFound: estimateItems.length }
      );

      // 1. Physical Quantity Sanity Gate
      QuantitySanityGate.evaluateAll(estimateItems);

      const quantityCandidates = estimateItems.length;
      const acceptedQuantity = estimateItems.filter(i => i.quantityStatus === 'ACCEPTED' && i.quantity !== null && i.quantity > 0).length;
      const lowConfidenceQuantity = estimateItems.filter(i => i.confidence === 'LOW').length;
      const blockedQuantity = estimateItems.filter(i => i.quantityStatus === 'BLOCKED_FROM_TOTAL').length;

      console.log('[AI-ESTIMATE-TRACE] QUANTITY:', {
        quantityCandidates,
        acceptedQuantity,
        lowConfidenceQuantity,
        blockedQuantity,
      });

      // 2. Deterministic Subtotals & Arithmetic
      AiEstimateCalculator.calculateAllSubtotals(estimateItems);

      const priceCandidates = estimateItems.length;
      const resolvedPrice = estimateItems.filter(i => i.unitPrice !== null && i.unitPrice !== undefined && i.unitPrice > 0).length;
      const unresolvedPrice = estimateItems.filter(i => i.unitPrice === null || i.unitPrice === undefined).length;

      console.log('[AI-ESTIMATE-TRACE] PRICE:', {
        priceCandidates,
        resolvedPrice,
        unresolvedPrice,
      });

      // 3. Absurdity and Anomaly Checks
      const warnings = AiEstimateSanityCheck.runAllChecks(estimateItems);

      // 4. Summaries & Breakdown
      const summary = AiEstimateCalculator.buildSummary(estimateItems);
      const categoryBreakdown = AiEstimateCalculator.buildCategoryBreakdown(estimateItems);
      const stats = AiEstimateCalculator.buildStats(estimateItems);

      const validItems = estimateItems.filter(i => i.status === 'VALID').length;
      const blockedItems = estimateItems.filter(i => i.status === 'BLOCKED').length;
      const unresolvedItems = estimateItems.filter(i => i.status === 'UNRESOLVED').length;
      const subtotalItems = estimateItems.filter(i => i.subtotal !== null && i.subtotal !== undefined && i.subtotal > 0).length;

      console.log('[AI-ESTIMATE-TRACE] CALCULATION:', {
        validItems,
        blockedItems,
        unresolvedItems,
        subtotalItems,
        total: summary.estimatedTotal,
      });

      const durationSec = +((Date.now() - startTime) / 1000).toFixed(1);

      notify('COMPLETE', 'Estimasi Selesai', 100,
        `Estimasi selesai (${mode}): ${estimateItems.length} pekerjaan, Total: Rp ${summary.estimatedTotal.toLocaleString('id-ID')}`,
        { pagesRead: totalPages, totalPages, itemsFound: estimateItems.length }
      );

      return {
        success: true,
        jobId,
        projectId,
        projectName,
        analysisMode: mode,
        executionDurationSec: durationSec,
        workItems: estimateItems,
        summary,
        categoryBreakdown,
        warnings,
        stats,
        totalPagesRead: totalPages,
      };
    } catch (err: any) {
      console.error(`[AiEstimatePipeline] Execution failed (${mode}):`, err);
      notify('FAILED', 'Terjadi kesalahan', 0, err.message);

      return {
        success: false,
        jobId,
        projectId,
        projectName,
        analysisMode: mode,
        executionDurationSec: +((Date.now() - startTime) / 1000).toFixed(1),
        workItems: [],
        summary: {
          estimatedTotal: 0,
          rangeLow: 0,
          rangeHigh: 0,
          confidence: 'LOW',
          status: 'PRELIMINARY',
        },
        categoryBreakdown: [],
        warnings: [],
        stats: {
          totalItems: 0,
          detectedItems: 0,
          inferredItems: 0,
          assumedItems: 0,
          unresolvedItems: 0,
          acceptedItems: 0,
          blockedItems: 0,
          warningCount: 0,
          highConfidenceCount: 0,
          mediumConfidenceCount: 0,
          lowConfidenceCount: 0,
        },
        totalPagesRead: 0,
        error: err.message,
      };
    }
  }

  /**
   * FAST MODE EXECUTION (Gemini 3.5 Flash-Lite)
   * Speed + Useful preliminary estimate.
   * Progress:
   * 1. Membaca DED
   * 2. Mengenali pekerjaan
   * 3. Menghitung estimasi
   * 4. Menyusun RAB
   */
  private async executeFastModeInternal(args: {
    projectId: string;
    projectName: string;
    rawPages: DedPageInfo[];
    totalPages: number;
    region?: string;
    notify: (stage: any, label: string, pct: number, msg: string, counts?: any) => void;
  }): Promise<{ items: AiEstimateWorkItem[]; synthesis: DocumentSynthesisSummary }> {
    const { projectId, projectName, rawPages, totalPages, region, notify } = args;

    // STEP 1: Membaca DED (Fast key sheet selection)
    notify('READING_PAGES', 'Membaca DED', 15, `Memindai ${totalPages} lembar dokumen untuk lembar arsitektur & struktur utama...`, { totalPages });

    // Select key sheets: denah, tampak, potongan, pondasi/struktur
    const keyPages: DedPageInfo[] = [];
    const keywords = ['denah', 'tampak', 'potongan', 'pondasi', 'sloof', 'struktur', 'atap', 'lantai'];

    for (const p of rawPages) {
      const titleLower = (p.drawingTitle || '').toLowerCase();
      const textLower = (p.nativeText || '').toLowerCase();
      const isKey = keywords.some(k => titleLower.includes(k) || textLower.includes(k));
      if (isKey || keyPages.length < 4) {
        keyPages.push(p);
      }
      if (keyPages.length >= 8) break; // Limit to key sheets for speed
    }

    const pagesToRead = keyPages.length > 0 ? keyPages : rawPages.slice(0, 6);
    const context: DedContextMemory = dedDocumentReader.createEmptyContext(projectId, projectName, totalPages);

    for (let i = 0; i < pagesToRead.length; i++) {
      const page = pagesToRead[i];
      notify(
        'READING_PAGES',
        'Membaca DED',
        15 + Math.round(((i + 1) / pagesToRead.length) * 20),
        `Membaca Lembar ${page.pageNumber}: "${page.drawingTitle}"...`,
        { pagesRead: i + 1, totalPages }
      );
      const pageResult = await dedDocumentReader.readPage(page, totalPages);
      dedDocumentReader.integratePageIntoContext(context, page, pageResult);
    }

    // STEP 2: Mengenali pekerjaan (WBS & Components)
    notify('WORK_BREAKDOWN', 'Mengenali pekerjaan', 45, 'Mengidentifikasi komponen struktur, arsitektur, dan finishing...', {
      pagesRead: pagesToRead.length,
      totalPages,
    });

    const synthesis = await dedDocumentSynthesizer.synthesize(context);
    let v3Items = await dedWorkInventoryEngine.discoverWorkInventory(context, synthesis);
    const dedup = duplicateDetector.deduplicate(v3Items);
    v3Items = dedup.items;

    // STEP 3: Menghitung estimasi (Quantities & Unit Prices)
    notify('QUANTITY_ESTIMATION', 'Menghitung estimasi', 65, 'Menghitung volume pekerjaan dan mengestimasi harga satuan awal...', {
      pagesRead: pagesToRead.length,
      totalPages,
      itemsFound: v3Items.length,
    });

    dedQuantityReasoningEngine.resolveQuantities(v3Items, context, synthesis);
    const items = this.convertToEstimateItems(v3Items);

    // Fast AI Price Estimation using quick model (Gemini 3.5 Flash-Lite)
    await this.estimatePricesWithAI(items, synthesis, region, 'quick');

    return { items, synthesis };
  }

  /**
   * DETAIL MODE EXECUTION (Gemini 3.8 Flash)
   * Depth + Completeness + Traceability.
   * Progress:
   * 1. Membaca gambar
   * 2. Memahami struktur proyek
   * 3. Mengukur pekerjaan
   * 4. Memeriksa konsistensi
   * 5. Menyusun estimasi
   */
  private async executeDetailModeInternal(args: {
    projectId: string;
    projectName: string;
    rawPages: DedPageInfo[];
    totalPages: number;
    region?: string;
    notify: (stage: any, label: string, pct: number, msg: string, counts?: any) => void;
  }): Promise<{ items: AiEstimateWorkItem[]; synthesis: DocumentSynthesisSummary }> {
    const { projectId, projectName, rawPages, totalPages, region, notify } = args;

    // STEP 1: Membaca gambar (All sheets thorough analysis)
    notify('READING_PAGES', 'Membaca gambar', 10, `Menganalisis visual seluruh ${totalPages} lembar DED dengan Gemini 3.8 Flash...`, { totalPages });

    const context: DedContextMemory = dedDocumentReader.createEmptyContext(projectId, projectName, totalPages);

    for (let i = 0; i < rawPages.length; i++) {
      const page = rawPages[i];
      notify(
        'READING_PAGES',
        'Membaca gambar',
        10 + Math.round(((i + 1) / totalPages) * 25),
        `Memindai Halaman ${page.pageNumber}/${totalPages}: "${page.drawingTitle}"...`,
        { pagesRead: i + 1, totalPages }
      );
      const pageResult = await dedDocumentReader.readPage(page, totalPages);
      dedDocumentReader.integratePageIntoContext(context, page, pageResult);
    }

    // STEP 2: Memahami struktur proyek (Cross-sheet correlation)
    notify('UNDERSTANDING_DED', 'Memahami struktur proyek', 40, 'Mengkorelasikan denah, potongan, jadwal penulangan & MEP...', {
      pagesRead: totalPages,
      totalPages,
    });

    const synthesis = await dedDocumentSynthesizer.synthesize(context);
    crossPageResolver.resolve(context);

    // STEP 3: Mengukur pekerjaan (Work inventory & geometry reconstruction)
    notify('WORK_BREAKDOWN', 'Mengukur pekerjaan', 55, 'Ekstraksi dimensi penampang, bentang balok, dan luas permukaan...', {
      pagesRead: totalPages,
      totalPages,
    });

    let v3Items = await dedWorkInventoryEngine.discoverWorkInventory(context, synthesis);
    const dedup = duplicateDetector.deduplicate(v3Items);
    v3Items = dedup.items;

    dedQuantityReasoningEngine.resolveQuantities(v3Items, context, synthesis);
    const items = this.convertToEstimateItems(v3Items);

    // STEP 4: Memeriksa konsistensi (Duplicate detection & unit verification)
    notify('SANITY_CHECK', 'Memeriksa konsistensi', 75, 'Cross-check gambar, verifikasi satuan dimensi, dan konsistensi harga...', {
      pagesRead: totalPages,
      totalPages,
      itemsFound: items.length,
    });

    // Deep AI Price Estimation using advanced model (Gemini 3.8 Flash)
    await this.estimatePricesWithAI(items, synthesis, region, 'advanced');

    return { items, synthesis };
  }

  /**
   * Convert FullAiWorkItem to standard Section 6 compliant AiEstimateWorkItem.
   */
  private convertToEstimateItems(v3Items: FullAiWorkItem[]): AiEstimateWorkItem[] {
    return v3Items.map((item, idx) => {
      const category = this.mapCategory(item.category);

      let quantitySource: AiEstimateQuantitySource = 'DED_GEOMETRIC';
      let detectionType: AiEstimateWorkItem['detectionType'] = 'DRAWING_CONFIRMED';
      let detectionStatus: AiEstimateWorkItem['detectionStatus'] = 'DETECTED';

      if (item.quantity === null) {
        quantitySource = 'UNRESOLVED';
        detectionStatus = 'UNRESOLVED';
        detectionType = 'UNKNOWN';
      } else if (item.quantityConfidence === 'LOW') {
        quantitySource = 'ASSUMPTION';
        detectionType = 'AI_ASSUMPTION';
        detectionStatus = 'ASSUMED';
      } else if (item.quantityConfidence === 'MEDIUM') {
        quantitySource = 'AI_INFERENCE';
        detectionType = 'DRAWING_INFERRED';
        detectionStatus = 'INFERRED';
      } else {
        quantitySource = 'DED_GEOMETRIC';
        detectionType = 'DRAWING_CONFIRMED';
        detectionStatus = 'DETECTED';
      }

      const confidence = item.quantityConfidence === 'UNRESOLVED' ? 'LOW'
        : (item.quantityConfidence as AiEstimateWorkItem['confidence']) || 'MEDIUM';

      const initialQty = item.quantity;
      const initialStatus: QuantitySanityStatus = initialQty === null ? 'UNRESOLVED' : 'ACCEPTED';
      const itemStatus: AiEstimateItemStatus = initialQty === null ? 'UNRESOLVED' : 'VALID';

      const dimensionsStr = item.sourceEvidence?.length
        ? item.sourceEvidence.join(', ')
        : `${initialQty !== null ? initialQty.toLocaleString('id-ID') : '-'} ${item.quantityUnit || 'm2'}`;

      const formulaStr = item.quantityFormula || (item.sourceEvidence?.length
        ? item.sourceEvidence.join('; ')
        : `Volume geometri ${item.name} (${item.quantityUnit || 'm2'})`);

      return {
        id: `ai-est-${idx + 1}`,
        category,
        item: item.name,
        workName: item.name,
        specification: item.specification || item.name,
        description: item.specification || item.name,
        quantity: initialQty,
        rawQuantity: initialQty,
        acceptedQuantity: initialQty,
        unit: item.quantityUnit || 'm2',
        unitPrice: null,
        subtotal: null,
        estimatedUnitPrice: null,
        estimatedSubtotal: null,
        quantitySource,
        priceSource: 'AI_ESTIMATE',
        confidence,
        sourcePages: item.sourcePages || [],
        sourceEvidence: dimensionsStr || (item.sourcePages?.length ? `DED Hal ${item.sourcePages.join(', ')}` : 'DED Blueprint'),
        dimensions: dimensionsStr,
        formula: formulaStr,
        assumptions: item.sourceEvidence || [],
        warnings: [],
        status: itemStatus,
        quantityStatus: initialStatus,
        priceStatus: 'PRICE_UNRESOLVED',
        detectionType,
        detectionStatus,
        provenance: {
          quantitySource,
          priceSource: 'AI_ESTIMATE',
          subtotalSource: 'UNRESOLVED',
          totalSource: 'UNRESOLVED',
        },
      };
    });
  }

  /**
   * Map category names to standard construction categories.
   */
  private mapCategory(v3Category: string): string {
    const cat = v3Category.toLowerCase();

    if (cat.includes('persiapan') || cat.includes('tanah') || cat.includes('galian') || cat.includes('urugan')) return 'Pekerjaan Tanah';
    if (cat.includes('pondasi') || cat.includes('beton bawah') || cat.includes('aanstamping')) return 'Pondasi';
    if (cat.includes('struktur') || cat.includes('sloof') || cat.includes('kolom') || cat.includes('ring') || cat.includes('balok') || cat.includes('beton bertulang') || cat.includes('pembesian') || cat.includes('bekisting')) return 'Struktur';
    if (cat.includes('dinding') || cat.includes('bata') || cat.includes('plester') || cat.includes('acian')) return 'Dinding';
    if (cat.includes('atap') || cat.includes('kuda') || cat.includes('spandek') || cat.includes('nok')) return 'Atap';
    if (cat.includes('plafon') || cat.includes('gypsum')) return 'Plafon';
    if (cat.includes('lantai') || cat.includes('keramik')) return 'Lantai';
    if (cat.includes('kusen') || cat.includes('pintu') || cat.includes('jendela')) return 'Pintu & Jendela';
    if (cat.includes('sanitair') || cat.includes('plumbing') || cat.includes('pipa') || cat.includes('kloset') || cat.includes('elektrikal') || cat.includes('listrik') || cat.includes('lampu') || cat.includes('saklar')) return 'MEP';
    if (cat.includes('cat') || cat.includes('pengecatan') || cat.includes('finishing')) return 'Pengecatan & Finishing';

    return v3Category || 'Lain-lain';
  }

  /**
   * Use AI to estimate unit prices for all items.
   * FAST mode uses 'quick' capability (Gemini 3.5 Flash-Lite).
   * DETAIL mode uses 'advanced' capability (Gemini 3.8 Flash).
   */
  private async estimatePricesWithAI(
    items: AiEstimateWorkItem[],
    synthesis: DocumentSynthesisSummary,
    region?: string,
    capabilityMode: 'quick' | 'advanced' = 'quick'
  ): Promise<void> {
    const itemsList = items.map((item, idx) => ({
      idx,
      name: item.workName,
      category: item.category,
      unit: item.unit,
      quantity: item.quantity,
      description: item.specification || item.description,
    }));

    const prompt = `Anda adalah Senior Cost Estimator konstruksi Indonesia.

TUGAS: Berikan ESTIMASI harga satuan untuk setiap pekerjaan konstruksi di bawah ini.

PENTING:
- Ini adalah ESTIMASI, bukan harga resmi AHSP atau database.
- Semua harga harus dilabeli AI_ESTIMATE.
- Berikan harga dalam Rupiah (IDR) yang masuk akal untuk wilayah ${region || 'Indonesia'}.
- Harga mencerminkan estimasi all-in (material + upah tukang + alat wajar).
- JANGAN memberikan harga yang identik untuk pekerjaan yang berbeda.
- Jika item tidak memiliki informasi cukup untuk dihargai secara wajar, kembalikan null untuk estimatedUnitPrice.

INFORMASI PROYEK:
- Tipe Bangunan: ${synthesis.buildingType}
- Luas: ~${synthesis.totalFloorAreaM2} m²
- Tahun referensi: 2024-2026

SANITY RANGE HARGA WAJAR:
- Galian tanah: Rp80.000 - Rp150.000 /m3
- Pondasi batu kali: Rp700.000 - Rp1.200.000 /m3
- Beton bertulang sloof/kolom/ringbalk: Rp3.000.000 - Rp6.500.000 /m3
- Pasangan dinding bata/hebel: Rp100.000 - Rp190.000 /m2
- Plesteran + acian: Rp65.000 - Rp120.000 /m2
- Rangka atap baja ringan + penutup atap: Rp220.000 - Rp450.000 /m2
- Plafon gypsum rangka hollow: Rp85.000 - Rp160.000 /m2
- Keramik lantai: Rp160.000 - Rp380.000 /m2
- Cat dinding: Rp35.000 - Rp75.000 /m2

DAFTAR PEKERJAAN:
${JSON.stringify(itemsList, null, 2)}

FORMAT JAWABAN (JSON array murni):
[
  { "idx": 0, "estimatedUnitPrice": 950000, "confidence": "HIGH", "reasoning": "Estimasi pondasi batu kali standar" }
]`;

    try {
      const chatRes = await aiProviderClient.executeChat({
        prompt,
        mode: capabilityMode,
        jsonMode: true,
      });

      const response = chatRes?.content;
      if (response && typeof response === 'string') {
        const parsed = this.parseAiPriceResponse(response, items.length);

        for (const priceResult of parsed) {
          if (priceResult.idx >= 0 && priceResult.idx < items.length) {
            const item = items[priceResult.idx];
            if (typeof priceResult.estimatedUnitPrice === 'number' && priceResult.estimatedUnitPrice > 0) {
              item.estimatedUnitPrice = priceResult.estimatedUnitPrice;
              item.unitPrice = priceResult.estimatedUnitPrice;
              item.priceSource = 'AI_ESTIMATE';
              item.priceStatus = 'PRICE_ESTIMATED';

              if (item.provenance) {
                item.provenance.priceSource = 'AI_ESTIMATE';
              }

              if (priceResult.confidence) {
                const conf = priceResult.confidence.toUpperCase();
                if (conf === 'HIGH' || conf === 'MEDIUM' || conf === 'LOW') {
                  if (conf === 'LOW' || item.confidence === 'LOW') item.confidence = 'LOW';
                  else if (conf === 'MEDIUM' || item.confidence === 'MEDIUM') item.confidence = 'MEDIUM';
                }
              }

              if (priceResult.reasoning) {
                item.assumptions.push(`Estimasi Harga: ${priceResult.reasoning}`);
              }
            }
          }
        }

        console.log('[AI-ESTIMATE-TRACE] PRICE_PARSED:', {
          rawResponses: 1,
          parsedResponses: parsed.length > 0 ? 1 : 0,
          detectedPrices: parsed.length,
          totalItems: items.length,
        });
      }
    } catch (err: any) {
      console.error(`[AI-ESTIMATE-TRACE] PRICE_ESTIMATION_ERROR: ${err.message}. Stage: PRICE`);
      console.warn('[AiEstimatePipeline] AI price estimation call warning:', err);
    }

    // MISSING != ZERO: For any items still without prices, strictly mark as UNRESOLVED
    for (const item of items) {
      if (item.estimatedUnitPrice === null || item.estimatedUnitPrice === undefined || item.estimatedUnitPrice <= 0) {
        item.estimatedUnitPrice = null;
        item.unitPrice = null;
        item.priceStatus = 'PRICE_UNRESOLVED';
        item.priceSource = 'UNRESOLVED';
        if (item.provenance) {
          item.provenance.priceSource = 'UNRESOLVED';
        }
        if (item.status === 'VALID') {
          item.status = 'UNRESOLVED';
        }
      } else {
        item.unitPrice = item.estimatedUnitPrice;
        item.priceStatus = 'PRICE_ESTIMATED';
        item.priceSource = 'AI_ESTIMATE';
      }
    }
  }

  /**
   * Parse AI price response robustly.
   */
  private parseAiPriceResponse(
    response: string,
    itemCount: number
  ): Array<{ idx: number; estimatedUnitPrice: number; confidence?: string; reasoning?: string }> {
    try {
      let jsonStr = response.trim();
      jsonStr = jsonStr.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

      const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        jsonStr = arrayMatch[0];
      }

      const parsed = JSON.parse(jsonStr);

      if (Array.isArray(parsed)) {
        return parsed
          .filter((item: any) => typeof item.idx === 'number' && typeof item.estimatedUnitPrice === 'number')
          .map((item: any) => ({
            idx: item.idx,
            estimatedUnitPrice: Math.round(item.estimatedUnitPrice),
            confidence: item.confidence,
            reasoning: item.reasoning,
          }));
      }
    } catch (err) {
      // Fallback regex line-by-line
      const results: Array<{ idx: number; estimatedUnitPrice: number; confidence?: string; reasoning?: string }> = [];
      const lines = response.split('\n');

      for (const line of lines) {
        const match = line.match(/"idx"\s*:\s*(\d+).*?"estimatedUnitPrice"\s*:\s*(\d+)/);
        if (match) {
          results.push({
            idx: parseInt(match[1]),
            estimatedUnitPrice: parseInt(match[2]),
          });
        }
      }

      return results;
    }

    return [];
  }
}

export const aiEstimatePipeline = AiEstimatePipeline.getInstance();
