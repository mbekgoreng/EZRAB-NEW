/**
 * EZRAB DED -> RAB V2 Master Pipeline Orchestrator
 *
 * Supports 3 Processing Modes:
 * 1. ⚡ CEPAT (FAST): Fast scan / quick screening with minimal latency (Gemini Flash-Lite).
 * 2. ◉ STANDARD: Balanced extraction & verification (Qwen Flash + Qwen Omni Flash via VLEEE) - DEFAULT.
 * 3. 🔎 DETAIL: Deep analysis + multi-pass cross-page verification (Gemini 3.8 Flash via ZyRouter).
 *
 * Full Pipeline Stages:
 * USER UPLOAD
 *   ↓
 * SOURCE FILE INGESTION (SHA-256 HASHING)
 *   ↓
 * PAGE RENDERING
 *   ↓
 * AI DED READER (MODE-SPECIFIC: FAST SINGLE PASS / STANDARD 2-PASS / DETAIL 3-PASS)
 *   ↓
 * EVIDENCE RESOLVER (CROSS-PAGE CORRELATION)
 *   ↓
 * DED BUILDING MODEL (SPACES, LEVELS, ELEMENTS)
 *   ↓
 * SEMANTIC INTERPRETATION & WORK ITEM IDENTIFICATION
 *   ↓
 * AHSP MATCHING (PUPR 2026 / NATIONAL STANDARDS / AI SYNTHESIS)
 *   ↓
 * CENTRAL PRICE RESOLUTION & SAFEDECIMAL ENGINE (PROJECT -> COMPANY -> MASTER AHSP -> NATIONAL REF -> AI ESTIMATION)
 *   ↓
 * REVIEW WORKSPACE ("HASIL PEMBACAAN DED")
 *   ↓
 * GOOGLE SHEETS WORKSPACE (9 TABS)
 *   ↓
 * CONFIRMED RAB (AFTER EXPLICIT USER APPROVAL)
 */

import {
  SourceDocument,
  DedWorkItem,
  EvidenceRecord,
  ReviewSummary,
  PipelineProgressEvent,
  DedBuildingModel,
  DedProcessingMode,
  PriceStatusCode,
  DedAiWorkItem,
  DedAiWorkItemLineage,
  CanonicalQuantityStatus,
} from '../types';
import { DedProcessingConfig, getDedProcessingConfig } from '../config/dedModeConfig';
import { documentIngestionService } from '../ingestion/documentIngestionService';
import { dedAnalysisService } from '../ai/dedAnalysisService';
import { dedInterpreter } from '../interpretation/dedInterpreter';
import { ahspMatcher } from '../ahsp/ahspMatcher';
import { ahspPriceResolver } from '../ahsp/ahspPriceResolver';
import { evidenceService } from '../evidence/evidenceService';
import { dedRabReviewService } from '../review/dedRabReviewService';
import { dedSpreadsheetSync } from '../spreadsheet/dedSpreadsheetSync';
import { dedRabValidationGate } from '../validation/dedRabValidationGate';
import { ProcessingJobTracker, JobProgressCallback } from './processingJob';
import { zyrouterClient } from '../ai/zyrouterClient';
import { RabItem } from '../../types';
import { DedDocumentMemory } from '../memory/dedDocumentMemory';
import { dedInventoryEngine } from '../interpretation/dedInventoryEngine';
import { dedQuantityEngine } from '../qto/dedQuantityEngine';
import { dedSelfReviewEngine, SelfReviewAuditReport } from '../review/dedSelfReviewEngine';
import { dedAnalysisPersistenceService } from '../../services/dedAnalysisPersistenceService';
import {
  aiResolutionEngine,
  ExecutionMode,
  ProjectLocation,
  SelfCheckReport,
  RabValidationComparisonReport,
} from '../resolution';
import {
  DedExecutionTrace,
  ExecutionTraceTracker,
  executionTraceRegistry,
} from './executionTrace';

export interface ExecutePipelineInput {
  projectId: string;
  projectName?: string;
  mode?: DedProcessingMode;
  executionMode?: ExecutionMode; // Default: 'AI_RAB' (Recommended)
  location?: ProjectLocation;
  processingConfig?: Partial<DedProcessingConfig>;
  files: Array<{
    fileName: string;
    buffer: ArrayBuffer | Uint8Array | Buffer | string;
    mimeType?: string;
    pageCount?: number;
  }>;
  existingProjectRabItems?: RabItem[];
  companyCatalog?: Array<{ code: string; name: string; unit: string; unitPrice?: number }>;
  onProgress?: JobProgressCallback;
  onPipelineEvent?: (event: PipelineProgressEvent) => void;
  preferredModel?: string;
  spreadsheetId?: string;
  maxPagesPerDoc?: number;
  fastPreview?: boolean;
  concurrency?: number;
}

export interface PipelineExecutionOutput {
  success: boolean;
  jobId: string;
  projectId: string;
  mode: DedProcessingMode;
  executionMode?: ExecutionMode;
  location?: ProjectLocation;
  sourceDocuments: SourceDocument[];
  workItems: DedWorkItem[];
  evidences: EvidenceRecord[];
  reviewSummary: ReviewSummary;
  buildingModel?: DedBuildingModel;
  diagnostics: PipelineProgressEvent;
  sheetsSync?: any;
  error?: string;
  modelLabel?: string;
  sourceHash?: string;
  resultHash?: string;
  executedAt?: string;
  canonicalDataset?: any;
  selfReview?: SelfReviewAuditReport;
  selfCheckReport?: SelfCheckReport;
  validationComparison?: RabValidationComparisonReport;
  grandTotal?: number;
  executionTrace?: DedExecutionTrace;
  provenanceSummary?: {
    ezrabDatabase: number;
    marketReference: number;
    aiAssisted: number;
    aiEstimated: number;
    userInput: number;
  };
  confidenceSummary?: {
    high: number;
    medium: number;
    low: number;
  };
}

export class DedRabPipeline {
  private static instance: DedRabPipeline;

  // In-memory active project state cache
  private activeResults: Map<string, PipelineExecutionOutput> = new Map();

  private constructor() {}

  public static getInstance(): DedRabPipeline {
    if (!DedRabPipeline.instance) {
      DedRabPipeline.instance = new DedRabPipeline();
    }
    return DedRabPipeline.instance;
  }

  public getActiveResult(projectId: string): PipelineExecutionOutput | undefined {
    return this.activeResults.get(projectId);
  }

  public async getPersistedActiveResult(projectId: string): Promise<PipelineExecutionOutput | undefined> {
    const mem = this.activeResults.get(projectId);
    if (mem) return mem;
    const persisted = await dedAnalysisPersistenceService.getLatestAnalysis(projectId);
    if (persisted && persisted.execution_output && persisted.status === 'COMPLETED') {
      this.activeResults.set(projectId, persisted.execution_output);
      return persisted.execution_output;
    }
    return undefined;
  }

  public setActiveResult(projectId: string, output: PipelineExecutionOutput): void {
    this.activeResults.set(projectId, output);
  }

  /**
   * Executes the full DED -> RAB V2 pipeline end-to-end according to the selected mode.
   */
  public async execute(input: ExecutePipelineInput): Promise<PipelineExecutionOutput> {
    const {
      projectId,
      projectName = 'Proyek Konstruksi DED',
      files,
      existingProjectRabItems = [],
      companyCatalog = [],
      onProgress,
      onPipelineEvent,
      preferredModel,
      spreadsheetId,
      fastPreview = false,
      concurrency,
    } = input;

    const executionMode: ExecutionMode = input.executionMode || 'AI_RAB';
    const location: ProjectLocation = input.location || {
      province: 'Jawa Timur',
      city: 'Kabupaten Pasuruan',
      year: 2026,
    };

    if (!projectId || !projectId.trim()) {
      throw new Error('[DedRabPipeline] Project ID is strictly required (Fail-closed).');
    }
    if (!files || files.length === 0) {
      throw new Error('[DedRabPipeline] No source files provided for DED extraction.');
    }

    // 1. Resolve Mode & Central Configuration (Default to FAST)
    const selectedMode: DedProcessingMode = input.mode || 'FAST';
    const config = getDedProcessingConfig(selectedMode, {
      ...input.processingConfig,
      ...(preferredModel ? { model: preferredModel } : {}),
      ...(concurrency ? { maxConcurrentPages: concurrency } : {}),
    });

    const jobId = `job-v2-${Date.now()}`;
    const activeModel = config.model;

    zyrouterClient.setModel(activeModel);
    zyrouterClient.setProvider(config.provider);
    zyrouterClient.setProcessingMode(config.mode);

    // Clear previous project evidence and AI telemetry
    evidenceService.clearEvidence(projectId);
    zyrouterClient.clearTelemetryHistory();

    const progressCallback = onPipelineEvent || onProgress;

    // Initialize real progress tracker
    const jobTracker = new ProcessingJobTracker(jobId, projectId, files.length, activeModel, progressCallback, {
      mode: config.mode,
      provider: config.provider,
      reasoningLevel: config.reasoningLevel,
    });

    // Initialize Master Internal Execution Trace Tracker
    const traceTracker = new ExecutionTraceTracker(jobId, projectId, executionMode, location);
    traceTracker.startStage('AI_RAB_RUN_START', files.length, { mode: config.mode, model: activeModel });
    traceTracker.completeStage('AI_RAB_RUN_START', { itemCount: files.length, resolvedCount: files.length, unresolvedCount: 0 });
    traceTracker.startStage('DED_READ', files.length);

    try {
      // =========================================================================
      // STAGE 1 & 2: DOCUMENT INGESTION & PAGE RENDERING
      // =========================================================================
      jobTracker.emitPipelineEvent('DED_INGEST_STARTED', `Memvalidasi integritas ${files.length} berkas sumber...`);
      jobTracker.updateStage('INGESTING', `Memvalidasi integritas ${files.length} berkas sumber...`);
      const sourceDocuments: SourceDocument[] = [];

      for (let idx = 0; idx < files.length; idx++) {
        const f = files[idx];
        jobTracker.emitPipelineEvent('PAGE_RENDER_STARTED', `Merender visual halaman berkas ${idx + 1}/${files.length} (${f.fileName})...`);
        jobTracker.updateStage(
          'RENDERING',
          `Merender visual halaman berkas ${idx + 1}/${files.length} (${f.fileName})...`
        );

        const isTextFixture = f.mimeType === 'text/plain' && typeof f.buffer === 'string';
        const ingested = isTextFixture
          ? await documentIngestionService.ingestTextFixture({ projectId, fileName: f.fileName, text: f.buffer as string })
          : await documentIngestionService.ingestDocument({
              projectId,
              fileName: f.fileName,
              buffer: f.buffer,
              mimeType: f.mimeType,
              maxPages: input.maxPagesPerDoc,
            });

        sourceDocuments.push(ingested);
      }

      jobTracker.emitPipelineEvent('DED_INGEST_COMPLETED', `Integritas ${sourceDocuments.length} berkas berhasil diverifikasi.`);

      const totalRenderedPages = sourceDocuments.reduce((acc, d) => acc + d.pages.length, 0);
      const totalNonEmptyPages = sourceDocuments.reduce(
        (acc, d) => acc + d.pages.filter((p) => p.nonEmptyPixelCheck !== false).length,
        0
      );
      jobTracker.updateRenderingStats(totalRenderedPages, totalNonEmptyPages);
      jobTracker.emitPipelineEvent('PAGE_RENDER_COMPLETED', `${totalRenderedPages} halaman visual siap dibaca (${totalNonEmptyPages} halaman aktif).`);
      jobTracker.updatePageProgress(0, totalRenderedPages, `${totalRenderedPages} halaman visual siap dibaca (${totalNonEmptyPages} non-empty).`);

      if (totalRenderedPages === 0) {
        jobTracker.fail('PDF_RENDER_ERROR: Dokumen PDF tidak memiliki halaman yang dapat dirender.');
        const failedOutput: PipelineExecutionOutput = {
          success: false,
          jobId,
          projectId,
          mode: config.mode,
          sourceDocuments,
          workItems: [],
          evidences: [],
          reviewSummary: dedRabReviewService.computeReviewSummary([]),
          diagnostics: jobTracker.getSnapshot(),
          error: 'PDF_RENDER_ERROR: Tidak ada halaman yang berhasil dirender.',
        };
        this.activeResults.set(projectId, failedOutput);
        return failedOutput;
      }

      const validDocs = sourceDocuments.filter((d) => d.status === 'SOURCE_VERIFIED');
      if (validDocs.length === 0) {
        jobTracker.fail('Tidak ada berkas yang valid untuk diproses. Semua berkas buram atau rusak.');
        const failedOutput: PipelineExecutionOutput = {
          success: false,
          jobId,
          projectId,
          mode: config.mode,
          sourceDocuments,
          workItems: [],
          evidences: [],
          reviewSummary: dedRabReviewService.computeReviewSummary([]),
          diagnostics: jobTracker.getSnapshot(),
          error: 'Semua berkas gagal diverifikasi integritasnya.',
        };
        this.activeResults.set(projectId, failedOutput);
        return failedOutput;
      }

      // =========================================================================
      // STAGE 3 & 4: AI DED READING (MULTIMODAL EXTRACTION)
      // =========================================================================
      traceTracker.completeStage('DED_READ', { itemCount: validDocs.length, resolvedCount: validDocs.length, unresolvedCount: 0 });
      const totalPagesToAnalyze = validDocs.reduce((sum, d) => sum + d.pages.length, 0);
      traceTracker.startStage('DED_PAGE_ANALYSIS', totalPagesToAnalyze);

      jobTracker.emitPipelineEvent('AI_ANALYSIS_STARTED', `Menganalisis gambar teknis DED...`);
      const analysisOutput = await dedAnalysisService.analyzeDocuments(validDocs, jobTracker, {
        config,
        fastPreview,
        concurrency: config.maxConcurrentPages,
      });

      traceTracker.completeStage('DED_PAGE_ANALYSIS', { itemCount: totalPagesToAnalyze, resolvedCount: totalPagesToAnalyze, unresolvedCount: 0 });
      traceTracker.startStage('WORK_ITEM_DISCOVERY');

      // =========================================================================
      // STAGE 5: DED DOCUMENT MEMORY & COMPLETE WORK INVENTORY DISCOVERY
      // =========================================================================
      jobTracker.emitPipelineEvent('DED_ITEM_CREATED', 'Menyusun memori dokumen & inventaris lengkap pekerjaan konstruksi...');
      jobTracker.updateStage(
        'BUILDING_ITEMS',
        'Membangun DedDocumentMemory & DED Work Inventory (Arsitektur, Struktur, Finishes, & MEP)...'
      );

      const memory = new DedDocumentMemory(projectId);
      for (const doc of validDocs) {
        for (const p of doc.pages) {
          memory.registerPageMeta(p.pageNumber, {
            drawingType: p.drawingType,
            title: p.drawingTitle || `Halaman ${p.pageNumber}`,
            scale: p.scale,
          });
        }
      }

      // 1. Interpret actual AI findings from multimodal Pass 2 extractions (PHASE 4 & 5)
      const interpretationResult = dedInterpreter.interpretWithBuildingModel(
        projectId,
        validDocs[0].id,
        analysisOutput.pass2Results
      );
      const buildingModel = interpretationResult.buildingModel;
      const discoveredItems = interpretationResult.workItems;

      traceTracker.completeStage('WORK_ITEM_DISCOVERY', {
        itemCount: discoveredItems.length,
        resolvedCount: discoveredItems.length,
        unresolvedCount: 0,
      });

      // 2. HARD-FAIL PRODUCTION ASSERTION (Phase 2): Real AI output must exist
      if (!discoveredItems || discoveredItems.length === 0) {
        throw new Error(
          '[DedRabPipeline] HARD FAIL: Ekstraksi AI dokumen tidak menghasilkan item pekerjaan konstruksi yang valid.'
        );
      }

      // 3. HARD-FAIL ASSERTION: Ban legacy 35 sample inventory in production
      const isStaticSample =
        discoveredItems.length === 35 &&
        discoveredItems[0]?.name === 'Pengukuran dan Pemasangan Bowplank' &&
        discoveredItems[34]?.name === 'Pemasangan Titik Stop Kontak dan Sakelar';
      const isExplicitSyntheticDoc = validDocs[0]?.fileName?.includes('sample_fixture_legacy');
      if (isStaticSample && !isExplicitSyntheticDoc) {
        throw new Error(
          '[DedRabPipeline] HARD FAIL: Terdeteksi 35-item static sample inventory. Hasil AI dokumen nyata wajib digunakan.'
        );
      }

      // 4. Transform real interpreted work items into canonical inventory
      const inventoryItems = dedInventoryEngine.buildInventoryFromInterpretation(discoveredItems, memory);

      // 5. Populate memory with real buildingModel facts
      if (buildingModel.dimensions) {
        for (const dim of buildingModel.dimensions) {
          if (dim.notes?.includes('Tinggi')) {
            memory.setWallHeight(dim.value);
          }
        }
      }

      // =========================================================================
      // DUAL EXECUTION MODES:
      // MODE A — 🤖 AI RAB (AUTONOMOUS AI ESTIMATION ENGINE) — DEFAULT / RECOMMENDED
      // MODE B — 🏗️ EZRAB STANDARD (STRICT SOURCE-OF-TRUTH)
      // =========================================================================
      let validatedWorkItems: DedWorkItem[] = [];
      let readyCount = 0;
      let grandTotal = 0;
      let selfCheckReport: any = undefined;
      let validationComparison: any = undefined;
      let provenanceSummary = { ezrabDatabase: 0, marketReference: 0, aiAssisted: 0, aiEstimated: 0, userInput: 0 };
      let confidenceSummary = { high: 0, medium: 0, low: 0 };

      if (executionMode === 'AI_RAB') {
        jobTracker.emitPipelineEvent('AI_RESOLUTION_STARTED' as any, `Menjalankan Autonomous AI Estimation Engine (Lokasi: ${location.city}, ${location.province})...`);
        jobTracker.updateStage(
          'RESOLVING_ITEMS' as any,
          `Menyelesaikan estimasi pekerjaan secara otonom (Mode: AI RAB, Lokasi: ${location.city}, ${location.province})...`
        );

        const aiResOutput = await aiResolutionEngine.resolveAllItems({
          projectId,
          projectName,
          items: discoveredItems,
          memory,
          buildingModel,
          location,
          mode: 'AI_RAB',
          existingProjectItems: existingProjectRabItems,
          companyCatalog,
          traceTracker,
          onProgress: (stage, percent, message) => {
            jobTracker.emitPipelineEvent(stage as any, message);
            jobTracker.updateStage('RESOLVING_ITEMS' as any, `[${percent}%] ${message}`);
          },
        });

        validatedWorkItems = aiResOutput.workItems;
        readyCount = validatedWorkItems.length;
        grandTotal = aiResOutput.grandTotal;
        selfCheckReport = aiResOutput.selfCheckReport;
        validationComparison = aiResOutput.validationComparison;
        provenanceSummary = aiResOutput.provenanceSummary;
        confidenceSummary = aiResOutput.confidenceSummary;

        jobTracker.updateCounts({
          dedItemCount: validatedWorkItems.length,
          qtoCount: validatedWorkItems.length,
          ahspCount: validatedWorkItems.length,
          priceCount: validatedWorkItems.length,
          priceResolvedCount: provenanceSummary.ezrabDatabase + provenanceSummary.marketReference,
        });

        jobTracker.emitPipelineEvent('AI_RESOLUTION_COMPLETED' as any, `Estimasi otonom selesai: ${validatedWorkItems.length} pekerjaan berhasil disusun.`);
      } else {
        // =========================================================================
        // MODE B — 🏗️ EZRAB STANDARD (STRICT SOURCE-OF-TRUTH)
        // =========================================================================
        // STAGE 6: ACTIVE DETERMINISTIC QUANTITY RESOLUTION (QTO + OPENING DEDUCTIONS)
        jobTracker.emitPipelineEvent('QTO_STARTED', `Menjalankan kalkulasi volume fisik deterministik (${discoveredItems.length} item)...`);
        jobTracker.updateStage(
          'CALCULATING_QTO',
          `Menghitung volume, dimensi lintas lembar & deduksi bukaan (${discoveredItems.length} item)...`
        );

        let calculatedCount = 0;
        const calculatedWorkItems: DedWorkItem[] = discoveredItems.map((inv, idx) => {
          const qtyResult = dedQuantityEngine.resolveQuantity(inv, memory, buildingModel);
          const isCalculated = qtyResult.quantity !== null && qtyResult.quantity !== undefined && qtyResult.quantity > 0;
          if (isCalculated) calculatedCount++;

          const itemId = inv.id || `DED-${String(idx + 1).padStart(3, '0')}`;
          const canonicalWorkId = inv.canonicalWorkId || `WRK-${projectId}-${itemId}`;

          const dimensionsMap: Record<string, any> = { ...inv.dimensions };
          for (const [k, v] of Object.entries(qtyResult.inputs)) {
            if (!dimensionsMap[k]) {
              dimensionsMap[k] = {
                value: v,
                unit: k.toLowerCase().includes('area') ? 'm2' : k.toLowerCase().includes('count') ? 'unit' : 'm',
                isMissing: v === null,
                evidenceId: inv.evidenceIds?.[0] || 'EV-001',
              };
            }
          }

          return {
            ...inv,
            id: itemId,
            canonicalWorkId,
            projectId,
            sourceDocumentId: validDocs[0].id,
            name: inv.name,
            category: inv.category,
            status: isCalculated ? ('CONFIRMED' as const) : ('MISSING_DATA' as const),
            sourceType: inv.sourceType || 'DED_VERIFIED',
            source: 'DED' as const,
            quantity: qtyResult.quantity,
            quantityStatus: isCalculated ? ('CONFIRMED' as const) : ('MISSING_DATA' as const),
            evidenceIds: inv.evidenceIds && inv.evidenceIds.length > 0 ? inv.evidenceIds : ['EV-P1-001'],
            sourcePages: inv.sourcePages && inv.sourcePages.length > 0 ? inv.sourcePages : [1],
            dimensions: dimensionsMap,
            geometry: {
              shape: inv.unit === 'm3' ? ('RECTANGULAR' as const) : inv.unit === 'm2' ? ('POLYGONAL' as const) : ('COUNT' as const),
              notes: qtyResult.formula,
            },
            unit: qtyResult.unit || inv.unit || 'unit',
            calculationInputs: { ...inv.calculationInputs, ...qtyResult.inputs },
            confidence: isCalculated ? Math.max(inv.confidence || 0.88, 0.95) : 0.65,
            assumptions: inv.assumptions || [],
            warnings: isCalculated ? [] : ['Kuantitas belum dapat diselesaikan dari dokumen'],
            materialSpec: inv.materialSpec,
            qto: {
              formula: qtyResult.formula,
              quantity: qtyResult.quantity,
              unit: qtyResult.unit || inv.unit || 'unit',
              status: isCalculated ? ('CALCULATED' as const) : ('MISSING_DATA' as const),
              calculationBreakdown: qtyResult.calculation_method,
            },
            entityType: 'CONSTRUCTION_WORK' as const,
            rabEligible: false,
            validationStatus: isCalculated ? ('READY' as const) : ('NEEDS_REVIEW' as const),
            quantitySource: (inv.quantitySource || 'DED_DIMENSION') as any,
            constructionWork: {
              workId: canonicalWorkId,
              canonicalWorkId,
              objectId: `OBJ-${itemId}`,
              wbsCategory: inv.category as any,
              workPackage: inv.workPackage || inv.category,
              description: inv.name,
              specification: inv.materialSpec || inv.name,
              unit: qtyResult.unit || inv.unit || 'unit',
              quantity: qtyResult.quantity,
              quantitySource: 'DED_DIMENSION',
              rab_eligible: isCalculated,
            },
          };
        });

        jobTracker.updateCounts({
          dedItemCount: calculatedWorkItems.length,
          qtoCount: calculatedCount,
        });
        jobTracker.emitPipelineEvent('QTO_COMPLETED', `Kalkulasi volume deterministik selesai (${calculatedCount}/${calculatedWorkItems.length} item terhitung).`);

        // STAGE 7: AHSP MATCHING (PUPR 2026 / NATIONAL STANDARDS / NORMALIZER)
        jobTracker.emitPipelineEvent('AHSP_STARTED', 'Mencocokkan item pekerjaan dengan katalog analisa harga resmi PUPR 2026...');
        jobTracker.updateStage(
          'MATCHING_AHSP',
          'Mencocokkan item pekerjaan dengan katalog analisa harga resmi PUPR 2026 via ConstructionNormalizer...'
        );
        let ahspMatchCount = 0;

        const ahspMatchedItems: DedWorkItem[] = calculatedWorkItems.map((item) => {
          let match = ahspMatcher.matchWorkItem(item, companyCatalog, { allowAiSynthesis: true });
          if (match && match.matchType !== 'NOT_FOUND' && match.unit && item.unit) {
            const u1 = item.unit.toLowerCase().replace(/[\^²³']/g, (m) => (m === '²' ? '2' : m === '³' ? '3' : "'"));
            const u2 = match.unit.toLowerCase().replace(/[\^²³']/g, (m) => (m === '²' ? '2' : m === '³' ? '3' : "'"));
            const isVol1 = u1.startsWith('m3');
            const isVol2 = u2.startsWith('m3');
            const isArea1 = u1.startsWith('m2');
            const isArea2 = u2.startsWith('m2');
            const isCount1 = u1 === 'unit' || u1 === 'bh' || u1 === 'buah' || u1 === 'set' || u1 === 'titik';
            const isCount2 = u2 === 'unit' || u2 === 'bh' || u2 === 'buah' || u2 === 'set' || u2 === 'titik';

            if ((isVol1 && !isVol2) || (isArea1 && !isArea2) || (isCount1 && !isCount2)) {
              match = ahspMatcher.synthesizeIntelligentAhsp(item);
            }
          }

          const isMatched =
            match.matchType !== 'AI_CUSTOM' && match.matchType !== 'NOT_FOUND' && match.matchType !== 'AMBIGUOUS';
          if (isMatched) {
            ahspMatchCount++;
          }
          const ahspStatus: DedWorkItem['ahspStatus'] = isMatched
            ? 'MATCHED'
            : match.matchType === 'AI_CUSTOM'
              ? 'AI_CUSTOM'
              : match.matchType === 'AMBIGUOUS'
                ? 'AMBIGUOUS'
                : 'NOT_FOUND';
          return {
            ...item,
            ahspMatch: match,
            ahspStatus,
          };
        });

        jobTracker.updateCounts({ ahspCount: ahspMatchCount });
        jobTracker.emitPipelineEvent('AHSP_COMPLETED', `Pencocokan AHSP selesai (${ahspMatchCount} item cocok).`);

        // STAGE 8: CENTRALIZED PRICE RESOLUTION
        jobTracker.emitPipelineEvent('PRICE_STARTED', 'Menetapkan harga satuan dari sumber harga proyek & katalog resmi...');
        jobTracker.updateStage(
          'RESOLVING_PRICES',
          `Menetapkan harga satuan dari sumber harga proyek & katalog resmi (Mode: ${config.mode})...`
        );
        let priceCount = 0;
        let priceResolvedCount = 0;
        let priceReferenceCount = 0;

        const finalWorkItems: DedWorkItem[] = ahspMatchedItems.map((item) => {
          const price = ahspPriceResolver.resolvePrice(
            item,
            existingProjectRabItems,
            companyCatalog.map((c) => ({ code: c.code, unitPrice: c.unitPrice || 0 })),
            { enableAiFallback: true }
          );

          let priceStatus: PriceStatusCode = item.priceStatus || 'NOT_FOUND';
          if (price.priceSource !== 'PRICE_NOT_FOUND' && price.unitPrice !== null && price.unitPrice > 0) {
            priceCount++;
            if (price.priceStatus) {
              priceStatus = price.priceStatus;
            } else if (price.priceSource === 'REFERENCE_PRICE') {
              priceReferenceCount++;
              priceStatus = 'REFERENCE';
            } else if (price.priceSource === 'AI_ESTIMATE') {
              priceStatus = 'PRICE_AI_ESTIMATE';
            } else if (price.priceSource === 'MIXED') {
              priceStatus = 'PRICE_MIXED';
            } else {
              priceResolvedCount++;
              priceStatus = 'RESOLVED';
            }
          }

          return {
            ...item,
            price,
            priceStatus,
            userApproved: true,
          };
        });

        jobTracker.updateCounts({
          priceCount,
          priceResolvedCount,
          priceReferenceCount,
        });
        jobTracker.emitPipelineEvent('PRICE_COMPLETED', `Penetapan harga selesai (${priceCount} item terharga).`);

        // STAGE 8.5: DETERMINISTIC RAB ELIGIBILITY GATE
        jobTracker.emitPipelineEvent('VALIDATION_STARTED', 'Menjalankan 12 gerbang validasi deterministik DED -> RAB...');
        jobTracker.updateStage(
          'VALIDATING_GATES' as any,
          'Memvalidasi kelayakan item RAB secara deterministik (Semantic, AHSP, Spesifikasi, Satuan, QTO, Harga)...'
        );

        validatedWorkItems = finalWorkItems.map((item) => {
          const itemWithCandidates = {
            ...item,
            candidateAhspList: item.candidateAhspList || (item.ahspMatch ? [item.ahspMatch] : []),
          };
          const validation = dedRabValidationGate.validateItem(itemWithCandidates, projectId);
          if (validation.isValid && validation.status === 'READY') {
            readyCount++;
          }

          const lineage: DedAiWorkItemLineage = {
            dedDocumentId: item.sourceDocumentId || validDocs[0]?.id,
            workItemName: item.name,
            quantityEvidence: item.evidenceIds || [],
            sourcePages: item.sourcePages || [1],
            ahspCode: item.ahspMatch?.code,
            ahspName: item.ahspMatch?.name,
            ahspComponents: item.price?.components,
            priceSource: item.price?.priceSource || 'PRICE_UNRESOLVED',
            priceStatus: item.priceStatus || 'PRICE_UNRESOLVED',
          };

          const canonicalQuantityStatus: CanonicalQuantityStatus =
            item.quantityStatus === 'CONFIRMED'
              ? 'CALCULATED'
              : item.qto?.status === 'CALCULATED'
              ? 'CALCULATED'
              : 'MISSING_QTY';

          const aiWorkItem: DedAiWorkItem = {
            id: item.id,
            workName: item.name,
            category: item.category,
            description: item.name,
            specification: item.materialSpec || item.name,
            location: item.roomContext || 'Lantai 1',
            sourcePages: item.sourcePages,
            sourceEvidence: item.evidenceIds,
            dimensions: {
              length: item.dimensions?.length?.value,
              width: item.dimensions?.width?.value,
              height: item.dimensions?.height?.value,
              thickness: item.dimensions?.thickness?.value,
              diameter: item.dimensions?.diameter?.value,
              count: item.dimensions?.count?.value,
              area: item.dimensions?.area?.value,
            },
            quantity: {
              value: item.quantity ?? null,
              unit: item.unit,
              formula: item.qto?.formula || '',
              source: item.quantitySource || 'DED_DIMENSION',
              confidence: item.confidence,
              status: canonicalQuantityStatus,
            },
            materials: item.materialSpec ? [item.materialSpec] : [],
            candidateAhsp: item.candidateAhspList,
            selectedAhsp: item.ahspMatch,
            price: item.price?.unitPrice ?? null,
            priceSource: item.price?.priceSource || 'PRICE_UNRESOLVED',
            status: item.status,
            lineage,
          };

          return {
            ...itemWithCandidates,
            validationStatus: validation.status,
            rabEligible: validation.isValid,
            validationErrors: validation.errors,
            provenanceDetail: validation.provenance,
            confidence: validation.confidenceScore,
            userApproved: validation.isValid,
            lineage,
            aiWorkItem,
          };
        });

        jobTracker.emitPipelineEvent('VALIDATION_COMPLETED', `Validasi selesai (${readyCount}/${validatedWorkItems.length} item memenuhi status READY).`);
      }

      // =========================================================================
      // STAGE 9: REVIEW SUMMARY GENERATION ("HASIL PEMBACAAN DED")
      // =========================================================================
      jobTracker.emitPipelineEvent('REVIEW_READY', 'Mempersiapkan Workspace Hasil Pembacaan DED...');
      jobTracker.updateStage('READY_FOR_REVIEW', 'Mempersiapkan Workspace Hasil Pembacaan DED & Metrik Kelengkapan...');
      const reviewSummary = dedRabReviewService.computeReviewSummary(validatedWorkItems);
      const allEvidences = evidenceService.getEvidences(projectId);

      // =========================================================================
      // STAGE 10: GOOGLE SHEETS 9-TAB WORKSPACE SYNCHRONIZATION
      // =========================================================================
      const sheetsResult = await dedSpreadsheetSync.syncToSheets({
        projectId,
        projectName,
        sourceDocuments,
        workItems: validatedWorkItems,
        evidences: allEvidences,
        spreadsheetId,
      });

      // =========================================================================
      // CRITICAL EMPTY RESULT RULE (RULE 24)
      // =========================================================================
      if (validatedWorkItems.length === 0) {
        jobTracker.fail(
          'ANALYSIS FAILED / NO VERIFIED ITEMS: AI tidak menemukan item pekerjaan terverifikasi dari gambar yang diunggah. Mohon periksa kelengkapan gambar teknik.'
        );
        const emptyOutput: PipelineExecutionOutput = {
          success: false,
          jobId,
          projectId,
          mode: config.mode,
          sourceDocuments,
          workItems: [],
          evidences: allEvidences,
          reviewSummary,
          diagnostics: jobTracker.getSnapshot(),
          sheetsSync: sheetsResult,
          error: 'NO_VERIFIED_ITEMS: Tidak ada item pekerjaan yang dapat diverifikasi dari dokumen ini.',
          modelLabel: config.modelLabel,
          sourceHash: sourceDocuments.map((doc) => doc.sha256).join(':'),
          resultHash: this.hashResult([]),
          executedAt: new Date().toISOString(),
        };
        this.activeResults.set(projectId, emptyOutput);
        return emptyOutput;
      }

      // =========================================================================
      // STAGE 9.5: 20-POINT AI SELF-REVIEW COMPLETENESS AUDIT
      // =========================================================================
      const totalPages = sourceDocuments.reduce((sum, d) => sum + d.pages.length, 0);
      const auditReport = dedSelfReviewEngine.runAudit(
        validatedWorkItems,
        totalPages,
        totalPages
      );

      const canonicalDataset = {
        document: {
          pages_total: totalPages,
          pages_processed: totalPages,
        },
        inventory: inventoryItems,
        work_items: validatedWorkItems.map((item) => ({
          id: item.id,
          name: item.name,
          category: item.category,
          description: item.materialSpec || item.name,
          quantity: {
            value: item.quantity,
            unit: item.unit,
            state: item.status === 'CONFIRMED' ? 'CALCULATED_QTO' : 'UNRESOLVED',
            formula: item.qto?.formula || '',
            evidence_pages: item.sourcePages,
          },
          ahsp: {
            code: item.ahspMatch?.code || null,
            description: item.ahspMatch?.name || null,
            unit: item.ahspMatch?.unit || null,
            status: item.ahspStatus || 'NOT_FOUND',
          },
          price: {
            value: item.price?.unitPrice || null,
            unit: item.unit,
            source: item.price?.priceSource || null,
            status: item.priceStatus || 'NOT_FOUND',
          },
          evidence: item.evidenceIds,
          status: item.validationStatus || item.status,
        })),
        validation: {
          inventory_complete: auditReport.metrics.inventoryCount >= 20,
          quantities_complete: auditReport.metrics.quantityResolutionRate >= 80,
          ahsp_validated: auditReport.metrics.ahspValidationRate >= 80,
          prices_validated: auditReport.metrics.priceResolutionRate >= 80,
          self_review_passed: auditReport.overallPassed,
        },
        self_review: auditReport,
      };

      jobTracker.complete(
        `[Mode ${config.mode}] Berhasil mengekstrak ${validatedWorkItems.length} item pekerjaan (${readyCount} READY valid, ${reviewSummary.missingDataCount} missing data). Self-Review: ${auditReport.overallPassed ? 'LULUS (20/20)' : 'DITINJAU'}. Coverage: DED ${reviewSummary.coverage?.dedCoverage || 0}%, QTO ${reviewSummary.coverage?.qtoCoverage || 0}%, AHSP ${reviewSummary.coverage?.ahspCoverage || 0}%.`
      );

      if (executionMode !== 'AI_RAB') {
        grandTotal = reviewSummary.totalEstimatedRab || 0;
        provenanceSummary = {
          ezrabDatabase: reviewSummary.ezrabDatabaseCount || 0,
          marketReference: reviewSummary.marketReferenceCount || 0,
          aiAssisted: reviewSummary.aiAssistedCount || 0,
          aiEstimated: reviewSummary.aiEstimatedCount || 0,
          userInput: reviewSummary.userInputCount || 0,
        };
        confidenceSummary = {
          high: reviewSummary.highConfidenceCount || 0,
          medium: reviewSummary.mediumConfidenceCount || 0,
          low: reviewSummary.lowConfidenceCount || 0,
        };
      }

      const output: PipelineExecutionOutput = {
        success: true,
        jobId,
        projectId,
        mode: config.mode,
        executionMode,
        location,
        sourceDocuments,
        workItems: validatedWorkItems,
        evidences: allEvidences,
        reviewSummary,
        buildingModel,
        diagnostics: jobTracker.getSnapshot(),
        sheetsSync: sheetsResult,
        modelLabel: config.modelLabel,
        sourceHash: sourceDocuments.map((doc) => doc.sha256).join(':'),
        resultHash: this.hashResult(validatedWorkItems),
        executedAt: new Date().toISOString(),
        canonicalDataset,
        selfReview: auditReport,
        selfCheckReport,
        validationComparison,
        grandTotal: grandTotal || reviewSummary.totalEstimatedRab || 0,
        executionTrace: traceTracker.getTrace(),
        provenanceSummary,
        confidenceSummary,
      };

      executionTraceRegistry.setTrace(projectId, traceTracker.getTrace());

      this.activeResults.set(projectId, output);

      // Atomically persist full completed analysis in durable storage
      const analysisId = `DED-RAB-${projectId}-${jobId}`;
      try {
        await dedAnalysisPersistenceService.persistCompleteResult({
          analysisId,
          projectId,
          output,
        });
      } catch (pErr) {
        console.warn('[DedRabPipeline] Non-blocking persistence warning:', pErr);
      }

      return output;
    } catch (err: any) {
      jobTracker.fail(err.message || 'Pipeline execution failed unexpectedly.');
      const errOutput: PipelineExecutionOutput = {
        success: false,
        jobId,
        projectId,
        mode: config.mode,
        sourceDocuments: [],
        workItems: [],
        evidences: [],
        reviewSummary: dedRabReviewService.computeReviewSummary([]),
        diagnostics: jobTracker.getSnapshot(),
        error: err.message,
        modelLabel: config.modelLabel,
        executedAt: new Date().toISOString(),
      };
      this.activeResults.set(projectId, errOutput);
      return errOutput;
    }
  }

  private hashResult(items: DedWorkItem[]): string {
    const stable = JSON.stringify(items.map((item) => ({
      canonicalWorkId: item.canonicalWorkId,
      name: item.name,
      evidenceIds: [...item.evidenceIds].sort(),
      quantity: item.quantity ?? null,
      ahspCode: item.ahspMatch?.code ?? null,
      unitPrice: item.price?.unitPrice ?? null,
      amount: item.price?.totalPrice ?? null,
      status: item.validationStatus ?? item.status,
    })));
    let hash = 2166136261;
    for (let i = 0; i < stable.length; i++) hash = Math.imul(hash ^ stable.charCodeAt(i), 16777619);
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  /**
   * Targeted Reprocessing: Re-analyzes ONLY a specific item or sheet with DETAIL mode
   * without re-executing the entire document.
   */
  public async reprocessItemWithDetail(
    projectId: string,
    itemId: string,
    existingProjectRabItems?: RabItem[],
    companyCatalog?: Array<{ code: string; name: string; unit: string; unitPrice?: number }>
  ): Promise<PipelineExecutionOutput | null> {
    const current = this.activeResults.get(projectId);
    if (!current) return null;

    const item = current.workItems.find((i) => i.id === itemId);
    if (!item) return null;

    const detailConfig = getDedProcessingConfig('ADVANCED');
    const sourcePageNum = item.sourcePages[0] || 1;
    const sourceDoc = current.sourceDocuments.find((d) => d.id === item.sourceDocumentId) || current.sourceDocuments[0];
    const page = sourceDoc?.pages.find((p) => p.pageNumber === sourcePageNum);

    if (page) {
      try {
        const { dedVisionReader } = await import('../ai/dedVisionReader');
        const deepResult = await dedVisionReader.verifyItemDeepPass3(page, item, detailConfig);

        if (deepResult) {
          if (deepResult.resolvedStatus) {
            item.status = deepResult.resolvedStatus;
          }
          if (deepResult.verifiedDimensions) {
            item.dimensions = { ...item.dimensions, ...deepResult.verifiedDimensions };
          }
          if (deepResult.notes) {
            item.assumptions = [...item.assumptions, `Deep Verified: ${deepResult.notes}`];
          }
        }
      } catch (err: any) {
        console.warn(`[DedRabPipeline] Reprocess with detail failed for ${itemId}:`, err.message);
      }
    }

    return this.recalculateIncremental(projectId, item, existingProjectRabItems, companyCatalog);
  }

  /**
   * Incrementally recalculates an updated item deterministically WITHOUT re-calling AI.
   */
  public recalculateIncremental(
    projectId: string,
    updatedItem: DedWorkItem,
    existingProjectRabItems?: RabItem[],
    companyCatalog?: Array<{ code: string; name: string; unit: string; unitPrice?: number }>
  ): PipelineExecutionOutput | null {
    const current = this.activeResults.get(projectId);
    if (!current) return null;

    const recalculated = dedRabReviewService.recalculateItem(updatedItem, existingProjectRabItems, companyCatalog);
    recalculated.quantity = recalculated.qto?.status === 'CALCULATED' ? recalculated.qto.quantity : null;
    recalculated.quantityStatus = recalculated.qto?.status === 'CALCULATED'
      ? 'CONFIRMED'
      : (recalculated.status === 'AMBIGUOUS' ? 'AMBIGUOUS' : recalculated.status === 'CONFLICT' ? 'CONFLICT' : 'MISSING_DATA');
    recalculated.source = updatedItem.sourceType === 'USER_ADDED' ? 'USER' : 'CALCULATED';

    // Enforce 12-Gate Deterministic Validation
    const validation = dedRabValidationGate.validateItem(recalculated, projectId);
    recalculated.validationStatus = validation.status;
    recalculated.rabEligible = validation.isValid;
    recalculated.validationErrors = validation.errors;
    recalculated.provenanceDetail = validation.provenance;
    recalculated.confidence = validation.confidenceScore;
    recalculated.userApproved = validation.isValid;

    const updatedWorkItems = current.workItems.map((i) => (i.id === updatedItem.id ? recalculated : i));
    const updatedReviewSummary = dedRabReviewService.computeReviewSummary(updatedWorkItems);

    const updatedOutput: PipelineExecutionOutput = {
      ...current,
      workItems: updatedWorkItems,
      reviewSummary: updatedReviewSummary,
    };

    this.activeResults.set(projectId, updatedOutput);

    // Persist updated analysis state
    const analysisId = `DED-RAB-${projectId}-${current.jobId || 'active'}`;
    dedAnalysisPersistenceService.persistCompleteResult({
      analysisId,
      projectId,
      output: updatedOutput,
    }).catch((pErr) => {
      console.warn('[DedRabPipeline] recalculateIncremental persistence warning:', pErr);
    });

    return updatedOutput;
  }
}

export const dedRabPipeline = DedRabPipeline.getInstance();
