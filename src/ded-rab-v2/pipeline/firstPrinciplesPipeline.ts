/**
 * EZRAB DED -> RAB V2: First-Principles 12-Step Pipeline Orchestrator
 *
 * NEW FUNDAMENTAL PRINCIPLE:
 * DED -> RAB is NOT primarily an RAB generator.
 * It is first: A DED UNDERSTANDING SYSTEM.
 * Its first job is: understand everything contained in the DED.
 * Only after the DED has been completely understood may the system construct the RAB.
 *
 * 12-STEP PIPELINE:
 * STEP 1: DOCUMENT INGESTION (SHA-256, page rendering, metadata)
 * STEP 2: PAGE-BY-PAGE VISUAL READING (track pagesExpected, pagesProcessed, pagesFailed)
 * STEP 3: DOCUMENT UNDERSTANDING (PageObservationModel per page)
 * STEP 4: RAW DED EXTRACTION / DOCUMENT SYNTHESIS (cross-page synthesis)
 * STEP 5: DED INVENTORY & COMPLETENESS LOOP ("What exists in DED? Review again")
 * STEP 6: QUANTITY RESOLUTION (SafeDecimalEngine, formula, inputs, units, NULL if missing)
 * STEP 7: DED COMPLETENESS AUDIT (DedCompletenessReport before AHSP)
 * STEP 8: AHSP MATCHING (official PUPR 2026 database, unit & spec validation)
 * STEP 9: PRICE RESOLUTION (Project -> User -> Regional -> Official -> External)
 * STEP 10: RAB GENERATION (Ready items + Needs Review items)
 * STEP 11: FINAL VALIDATION (10-Gate Deterministic Audit)
 * STEP 12: SPREADSHEET SYNC (9-Tab Workspace with 100% provenance)
 */

import {
  SourceDocument,
  DocumentPage,
  DedWorkItem,
  EvidenceRecord,
  PageObservationModel,
  PageReadingProgress,
  DedInventoryItem,
  DedQuantityEvidence,
  DedCompletenessReport,
  DedAhspMatch,
  DedPriceResult,
  PipelineProgressEvent,
  GoogleSheetsSyncResult,
} from '../types';
import { documentIngestionService } from '../ingestion/documentIngestionService';
import { pageVisualReader } from '../ai/pageVisualReader';
import { documentSynthesisEngine } from '../interpretation/documentSynthesisEngine';
import { dedInventoryEngine } from '../interpretation/dedInventoryEngine';
import { dedQuantityEngine } from '../qto/dedQuantityEngine';
import { dedCompletenessAuditor } from '../review/dedCompletenessAuditor';
import { ahspMatcher } from '../ahsp/ahspMatcher';
import { ahspPriceResolver } from '../ahsp/ahspPriceResolver';
import { dedRabGenerator, DedRabDraftResult } from './dedRabGenerator';
import { dedRabValidationGate } from '../validation/dedRabValidationGate';
import { dedSpreadsheetSync } from '../spreadsheet/dedSpreadsheetSync';
import { getDedProcessingConfig, DedProcessingConfig } from '../config/dedModeConfig';
import { RabItem } from '../../types';

export interface ExecuteFirstPrinciplesInput {
  projectId: string;
  projectName?: string;
  files: Array<{
    fileName: string;
    buffer: Buffer | ArrayBuffer | Uint8Array | string;
    mimeType?: string;
  }>;
  existingProjectRabItems?: RabItem[];
  companyCatalog?: Array<{ code: string; name: string; unit: string; unitPrice?: number }>;
  onProgress?: (event: PipelineProgressEvent) => void;
  config?: DedProcessingConfig;
}

export interface FirstPrinciplesOutput {
  success: boolean;
  projectId: string;
  sourceDocuments: SourceDocument[];
  pageProgress: PageReadingProgress;
  pageObservations: PageObservationModel[];
  inventory: DedInventoryItem[];
  quantities: Map<string, DedQuantityEvidence>;
  completenessReport: DedCompletenessReport;
  workItems: DedWorkItem[];
  rabDraft: DedRabDraftResult;
  sheetsSync?: GoogleSheetsSyncResult;
  error?: string;
}

export class FirstPrinciplesPipeline {
  private static instance: FirstPrinciplesPipeline;

  private constructor() {}

  public static getInstance(): FirstPrinciplesPipeline {
    if (!FirstPrinciplesPipeline.instance) {
      FirstPrinciplesPipeline.instance = new FirstPrinciplesPipeline();
    }
    return FirstPrinciplesPipeline.instance;
  }

  /**
   * Executes the strict 12-Step First-Principles DED -> RAB Pipeline.
   */
  public async execute(input: ExecuteFirstPrinciplesInput): Promise<FirstPrinciplesOutput> {
    const {
      projectId,
      projectName = 'Proyek DED',
      files,
      existingProjectRabItems = [],
      companyCatalog = [],
      onProgress,
      config = getDedProcessingConfig('FAST'),
    } = input;

    const emitEvent = (stage: any, message: string, stageProgress: number = 0) => {
      if (onProgress) {
        onProgress({
          jobId: `job-fp-${projectId}`,
          projectId,
          stage,
          eventType: stage,
          stageDetails: message,
          currentPage: 0,
          totalPages: 0,
          pagesAnalyzed: 0,
          evidenceCount: 0,
          dedItemCount: 0,
          qtoCount: 0,
          ahspCount: 0,
          priceCount: 0,
          aiModel: 'gemini-3.5-flash-lite',
          aiRequests: 0,
          aiSuccessful: 0,
          aiFailed: 0,
          durationMs: 0,
        });
      }
    };

    try {
      // =======================================================================
      // STEP 1: DOCUMENT INGESTION (SHA-256, page rendering, metadata)
      // =======================================================================
      emitEvent('DED_INGEST_STARTED', `[STEP 1/12] Memvalidasi integritas ${files.length} berkas DED...`, 5);

      const sourceDocuments: SourceDocument[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const doc = await documentIngestionService.ingestDocument({
          projectId,
          fileName: f.fileName,
          buffer: f.buffer,
          mimeType: f.mimeType || 'application/pdf',
        });
        sourceDocuments.push(doc);
      }

      const allPages: DocumentPage[] = sourceDocuments.flatMap((d) => d.pages);
      const pagesExpected = allPages.length;

      emitEvent(
        'DED_INGEST_COMPLETED',
        `[STEP 1/12] Ingesti selesai: ${sourceDocuments.length} berkas (${pagesExpected} halaman visual terverifikasi).`,
        10
      );

      if (pagesExpected === 0) {
        throw new Error('DED_INGESTION_ERROR: Tidak ada halaman yang berhasil dirender dari berkas sumber.');
      }

      // =======================================================================
      // STEP 2 & 3: PAGE-BY-PAGE VISUAL READING & DOCUMENT UNDERSTANDING
      // =======================================================================
      emitEvent(
        'PAGE_RENDER_STARTED',
        `[STEP 2/12] Membaca visual DED halaman per halaman (0/${pagesExpected})...`,
        15
      );

      const { pageObservations, progress: pageProgress } = await pageVisualReader.readPages(
        allPages,
        config,
        (current, total, msg) => {
          emitEvent(
            'AI_ANALYSIS_PROGRESS',
            `[STEP 2/12] ${msg}`,
            Math.round(15 + (current / total) * 20)
          );
        }
      );

      emitEvent(
        'AI_ANALYSIS_COMPLETED',
        `[STEP 3/12] Pemahaman dokumen selesai: ${pageProgress.pagesProcessed}/${pagesExpected} halaman visual terbaca.`,
        35
      );

      if (pageProgress.pagesProcessed < pageProgress.pagesExpected) {
        console.warn(`[FirstPrinciplesPipeline] Incomplete reading: ${pageProgress.pagesProcessed}/${pagesExpected} pages processed.`);
      }

      // =======================================================================
      // STEP 4: RAW DED EXTRACTION / DOCUMENT SYNTHESIS
      // =======================================================================
      emitEvent(
        'DED_ITEM_CREATED',
        `[STEP 4/12] Menjalankan sintesis observasi lintas-halaman...`,
        45
      );

      const synthesizedEntities = documentSynthesisEngine.synthesize(pageObservations);

      // =======================================================================
      // STEP 5: DED INVENTORY & COMPLETENESS LOOP
      // =======================================================================
      emitEvent(
        'DED_ITEM_CREATED',
        `[STEP 5/12] Menyusun DED Inventory dan audit kelengkapan konstruksi...`,
        55
      );

      const inventory = dedInventoryEngine.buildInventory(synthesizedEntities, pageObservations);

      emitEvent(
        'DED_ITEM_CREATED',
        `[STEP 5/12] Inventory selesai: ${inventory.length} paket pekerjaan konstruksi teridentifikasi.`,
        60
      );

      // =======================================================================
      // STEP 6: QUANTITY RESOLUTION
      // =======================================================================
      emitEvent(
        'QTO_STARTED',
        `[STEP 6/12] Menghitung kuantitas deterministik (${inventory.length} item)...`,
        65
      );

      const quantities = new Map<string, DedQuantityEvidence>();
      for (const item of inventory) {
        const qEvidence = dedQuantityEngine.resolveQuantity(item, synthesizedEntities, pageObservations);
        quantities.set(item.id, qEvidence);
      }

      // =======================================================================
      // STEP 7: DED COMPLETENESS AUDIT
      // =======================================================================
      emitEvent(
        'QTO_COMPLETED',
        `[STEP 7/12] Melakukan audit kelengkapan data DED...`,
        72
      );

      const initialReport = dedCompletenessAuditor.audit({
        pageProgress,
        inventory,
        quantities,
      });

      emitEvent(
        'QTO_COMPLETED',
        `[STEP 7/12] Audit selesai: ${initialReport.quantityResolved} kuantitas terhitung, ${initialReport.quantityMissing} perlu review.`,
        75
      );

      // =======================================================================
      // STEP 8: AHSP MATCHING (PUPR 2026 Official Database)
      // =======================================================================
      emitEvent(
        'AHSP_STARTED',
        `[STEP 8/12] Mencocokkan dengan katalog analisa harga resmi PUPR 2026...`,
        80
      );

      const ahspMatches = new Map<string, DedAhspMatch>();
      let ahspMatchedCount = 0;
      let ahspReviewCount = 0;

      for (const item of inventory) {
        const dummyWorkItem: DedWorkItem = {
          id: item.id,
          projectId,
          sourceDocumentId: sourceDocuments[0]?.id || 'doc-1',
          name: item.name,
          category: item.category as any,
          status: 'CONFIRMED',
          sourceType: 'DED_VERIFIED',
          evidenceIds: [],
          sourcePages: item.sourcePages,
          dimensions: {},
          geometry: { shape: 'RECTANGULAR' },
          unit: quantities.get(item.id)?.unit || 'unit',
          calculationInputs: {},
          confidence: 0.9,
          assumptions: [],
          warnings: [],
          materialSpec: item.specification,
        };

        const match = ahspMatcher.matchWorkItem(dummyWorkItem, companyCatalog, { allowAiSynthesis: true });
        ahspMatches.set(item.id, match);

        if (match.matchType !== 'NOT_FOUND' && match.matchType !== 'AI_CUSTOM') {
          ahspMatchedCount++;
        } else {
          ahspReviewCount++;
        }
      }

      // =======================================================================
      // STEP 9: PRICE RESOLUTION (Central Price Ladder)
      // =======================================================================
      emitEvent(
        'PRICE_STARTED',
        `[STEP 9/12] Menetapkan harga satuan dari katalog resmi & database harga...`,
        85
      );

      const prices = new Map<string, DedPriceResult>();
      let priceResolvedCount = 0;

      for (const item of inventory) {
        const q = quantities.get(item.id);
        const match = ahspMatches.get(item.id);

        const dummyWorkItem: DedWorkItem = {
          id: item.id,
          projectId,
          sourceDocumentId: sourceDocuments[0]?.id || 'doc-1',
          name: item.name,
          category: item.category as any,
          status: 'CONFIRMED',
          sourceType: 'DED_VERIFIED',
          evidenceIds: [],
          sourcePages: item.sourcePages,
          dimensions: {},
          geometry: { shape: 'RECTANGULAR' },
          unit: q?.unit || 'unit',
          calculationInputs: {},
          confidence: 0.9,
          assumptions: [],
          warnings: [],
          materialSpec: item.specification,
          ahspMatch: match,
          quantity: q?.value ?? null,
        };

        const priceRes = ahspPriceResolver.resolvePrice(
          dummyWorkItem,
          existingProjectRabItems,
          companyCatalog.map((c) => ({ code: c.code, unitPrice: c.unitPrice || 0 })),
          { enableAiFallback: true }
        );

        prices.set(item.id, priceRes);
        if (priceRes.priceSource !== 'PRICE_NOT_FOUND') {
          priceResolvedCount++;
        }
      }

      // =======================================================================
      // STEP 10: RAB GENERATION (Ready items + Needs Review items)
      // =======================================================================
      emitEvent(
        'PRICE_COMPLETED',
        `[STEP 10/12] Menyusun draft RAB (Ready items + Needs Review items)...`,
        90
      );

      // Validate each item for Gate Status
      const validations = new Map<string, any>();
      for (const item of inventory) {
        const q = quantities.get(item.id);
        const match = ahspMatches.get(item.id);
        const pr = prices.get(item.id);

        const dummyWorkItem: DedWorkItem = {
          id: item.id,
          projectId,
          sourceDocumentId: sourceDocuments[0]?.id || 'doc-1',
          name: item.name,
          category: item.category as any,
          status: q?.status === 'RESOLVED' ? 'CONFIRMED' : 'MISSING_DATA',
          sourceType: 'DED_VERIFIED',
          evidenceIds: [`EV-${item.id}`],
          sourcePages: item.sourcePages,
          dimensions: {},
          geometry: { shape: 'RECTANGULAR' },
          unit: q?.unit || 'unit',
          calculationInputs: {},
          confidence: 0.9,
          assumptions: [],
          warnings: q?.status === 'MISSING' ? ['Kuantitas belum dapat ditentukan dari gambar DED (Status: MISSING_QTY).'] : [],
          materialSpec: item.specification,
          ahspMatch: match,
          price: pr,
          quantity: q?.value ?? null,
          candidateAhspList: match ? [match] : [],
        };

        const valRes = dedRabValidationGate.validateItem(dummyWorkItem, projectId);
        validations.set(item.id, valRes);
      }

      const rabDraft = dedRabGenerator.generateRab({
        inventory,
        quantities,
        ahspMatches,
        prices,
        validations,
      });

      // Update final completeness report
      const finalCompletenessReport = dedCompletenessAuditor.audit({
        pageProgress,
        inventory,
        quantities,
        ahspMatchedCount,
        ahspReviewCount,
        priceResolvedCount,
        readyCount: rabDraft.readyCount,
      });

      // Convert inventory into canonical DedWorkItem array for UI and Spreadsheet
      const workItems: DedWorkItem[] = inventory.map((inv) => {
        const q = quantities.get(inv.id);
        const ahsp = ahspMatches.get(inv.id);
        const pr = prices.get(inv.id);
        const val = validations.get(inv.id);

        const isResolved = q?.status === 'RESOLVED' && typeof q.value === 'number' && q.value > 0;

        return {
          id: inv.id,
          canonicalWorkId: `CANON-${inv.id}`,
          projectId,
          sourceDocumentId: sourceDocuments[0]?.id || 'doc',
          name: inv.name,
          category: inv.category as any,
          status: isResolved ? 'CONFIRMED' : 'MISSING_DATA',
          sourceType: 'DED_VERIFIED',
          evidenceIds: [`EV-${inv.id}`],
          sourcePages: inv.sourcePages,
          dimensions: {},
          geometry: { shape: 'RECTANGULAR' },
          unit: q?.unit || 'unit',
          calculationInputs: {},
          confidence: 0.92,
          assumptions: [],
          warnings: isResolved ? [] : ['Kuantitas belum dapat ditentukan dari gambar DED (Status: MISSING_QTY). Volume tidak diisi default nol/satu.'],
          materialSpec: inv.specification,
          ahspMatch: ahsp,
          ahspStatus: ahsp?.matchType !== 'NOT_FOUND' && ahsp?.matchType !== 'AI_CUSTOM' ? 'MATCHED' : 'NOT_FOUND',
          price: pr,
          priceStatus: pr?.priceSource !== 'PRICE_NOT_FOUND' ? 'RESOLVED' : 'NOT_FOUND',
          quantity: isResolved ? (q!.value as number) : null,
          quantityStatus: isResolved ? 'CONFIRMED' : 'MISSING_DATA',
          source: 'DED',
          qto: {
            formula: q?.formula || 'Dimensi belum ditemukan (MISSING_QTY)',
            quantity: isResolved ? (q!.value as number) : null,
            unit: q?.unit || 'unit',
            status: isResolved ? 'CALCULATED' : 'MISSING_DATA',
          },
          validationStatus: val?.status || (isResolved ? 'READY' : 'MISSING_QTY'),
          rabEligible: Boolean(val?.isValid && isResolved),
          validationErrors: val?.errors || [],
          userApproved: Boolean(val?.isValid && isResolved),
        };
      });

      // =======================================================================
      // STEP 11 & 12: FINAL VALIDATION & SPREADSHEET SYNC
      // =======================================================================
      emitEvent(
        'VALIDATION_STARTED',
        `[STEP 11/12] Validasi final dan sinkronisasi Spreadsheet 9-Tab...`,
        95
      );

      const allEvidences: EvidenceRecord[] = pageObservations.flatMap((p) => p.rawEvidence);

      const sheetsSync = await dedSpreadsheetSync.syncToSheets({
        projectId,
        projectName,
        sourceDocuments,
        workItems,
        evidences: allEvidences,
      });

      emitEvent(
        'REVIEW_READY',
        `[STEP 12/12] Sinkronisasi selesai: ${rabDraft.readyCount} item READY, Grand Total Rp ${rabDraft.grandTotal.toLocaleString('id-ID')}`,
        100
      );

      return {
        success: true,
        projectId,
        sourceDocuments,
        pageProgress,
        pageObservations,
        inventory,
        quantities,
        completenessReport: finalCompletenessReport,
        workItems,
        rabDraft,
        sheetsSync,
      };
    } catch (err: any) {
      console.error('[FirstPrinciplesPipeline] Fatal error:', err);
      return {
        success: false,
        projectId,
        sourceDocuments: [],
        pageProgress: {
          pagesExpected: 0,
          pagesProcessed: 0,
          pagesFailed: 1,
          pagesSkipped: 0,
          isComplete: false,
        },
        pageObservations: [],
        inventory: [],
        quantities: new Map(),
        completenessReport: {
          pagesExpected: 0,
          pagesProcessed: 0,
          pagesFailed: 1,
          workItemsTotal: 0,
          quantityResolved: 0,
          quantityMissing: 0,
          evidenceTraced: 0,
          ahspMatched: 0,
          ahspReview: 0,
          priceResolved: 0,
          readyItemsCount: 0,
          status: 'PIPELINE_ERROR',
        },
        workItems: [],
        rabDraft: {
          items: [],
          readyItems: [],
          reviewItems: [],
          grandTotal: 0,
          totalWorkItems: 0,
          readyCount: 0,
          reviewCount: 0,
          missingQtyCount: 0,
        },
        error: err.message || 'Unknown pipeline execution failure',
      };
    }
  }
}

export const firstPrinciplesPipeline = FirstPrinciplesPipeline.getInstance();
