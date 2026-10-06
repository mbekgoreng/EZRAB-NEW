/**
 * EZRAB FULL AI DED INTELLIGENCE ENGINE V3.0
 * Master Pipeline Coordinator: End-to-End Autonomous Construction Intelligence
 *
 * Flow:
 * DED → FULL DOCUMENT READING → FULL DOCUMENT UNDERSTANDING → COMPLETE WORK INVENTORY
 * → CROSS-PAGE REASONING → QUANTITY REASONING → AHSP REASONING → PRICE RESOLUTION
 * → AI SELF REVIEW → FINAL VALIDATION → RAB READY
 */

import {
  DedContextMemory,
  DedPageInfo,
  FullAiWorkItem,
  FullAiDedRabOutput,
  EngineProgressEvent,
} from '../types';
import { dedDocumentReader } from '../reading/dedDocumentReader';
import { dedDocumentSynthesizer, DocumentSynthesisSummary } from '../reading/dedDocumentSynthesizer';
import { dedWorkInventoryEngine } from '../inventory/dedWorkInventoryEngine';
import { dedMissingInformationLoop } from '../reasoning/dedMissingInformationLoop';
import { dedQuantityReasoningEngine } from '../reasoning/dedQuantityReasoningEngine';
import { dedAhspReasoningEngine } from '../ahsp/dedAhspReasoningEngine';
import { dedPriceResolutionEngine } from '../pricing/dedPriceResolutionEngine';
import { dedSelfReviewEngine } from '../review/dedSelfReviewEngine';
import { crossPageResolver } from '../evidence/crossPageResolver';
import { duplicateDetector } from '../evidence/duplicateDetector';
import { dedAiResolutionEngine } from '../ai/dedAiResolutionEngine';
import { PdfPageService } from '../../ded-rab-v2/ingestion/pdfPageService';
import { SafeDecimalEngine } from '../../engine/safeDecimalEngine';

export interface ExecutePipelineOptions {
  projectId: string;
  projectName: string;
  files: Array<{
    fileName: string;
    buffer: ArrayBuffer | Uint8Array | Buffer | string;
    mimeType?: string;
  }>;
  region?: string;
  onProgress?: (event: EngineProgressEvent) => void;
}

export class FullAiDedRabPipeline {
  private static instance: FullAiDedRabPipeline;

  private constructor() {}

  public static getInstance(): FullAiDedRabPipeline {
    if (!FullAiDedRabPipeline.instance) {
      FullAiDedRabPipeline.instance = new FullAiDedRabPipeline();
    }
    return FullAiDedRabPipeline.instance;
  }

  /**
   * Executes the full V3 pipeline.
   */
  public async execute(options: ExecutePipelineOptions): Promise<FullAiDedRabOutput> {
    const startTime = Date.now();
    const jobId = `job-v3-${Date.now()}`;
    const { projectId, projectName, files, onProgress, region } = options;

    const notify = (
      stage: EngineProgressEvent['stage'],
      stageNameId: string,
      percent: number,
      message: string,
      counts?: {
        pagesRead?: number;
        totalPages?: number;
        itemsDiscovered?: number;
        quantitiesResolved?: number;
        ahspMatched?: number;
        pricesResolved?: number;
        reviewIteration?: number;
      }
    ) => {
      if (onProgress) {
        onProgress({
          stage,
          stageNameId,
          percent,
          message,
          pagesRead: counts?.pagesRead || 0,
          totalPages: counts?.totalPages || 0,
          itemsDiscovered: counts?.itemsDiscovered || 0,
          quantitiesResolved: counts?.quantitiesResolved || 0,
          ahspMatched: counts?.ahspMatched || 0,
          pricesResolved: counts?.pricesResolved || 0,
          reviewIteration: counts?.reviewIteration || 1,
        });
      }
    };

    try {
      notify('INITIALIZING', 'Memulai AI Engine...', 5, 'Menyiapkan memori dokumen DED...');

      // 1. EXTRACT PAGES
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
        throw new Error('Tidak ada halaman yang berhasil diekstrak dari dokumen DED.');
      }

      const totalPages = rawPages.length;
      const context: DedContextMemory = dedDocumentReader.createEmptyContext(projectId, projectName, totalPages);

      // 2. STAGE 1: AI MEMBACA DED (ITERATIVE PAGE LOOP)
      notify(
        'READING_PAGES',
        'EZRAB sedang membaca DED...',
        15,
        `Membaca lembar gambar konstruksi (1/${totalPages})...`,
        { pagesRead: 0, totalPages }
      );

      for (let i = 0; i < rawPages.length; i++) {
        const page = rawPages[i];
        notify(
          'READING_PAGES',
          'EZRAB sedang membaca DED...',
          15 + Math.round(((i + 1) / totalPages) * 20),
          `Membaca Halaman ${page.pageNumber} dari ${totalPages}: "${page.drawingTitle}"...`,
          { pagesRead: i + 1, totalPages }
        );

        const pageResult = await dedDocumentReader.readPage(page, totalPages);
        dedDocumentReader.integratePageIntoContext(context, page, pageResult);
      }

      // 3. STAGE 2: AI MEMAHAMI DED (SYNTHESIS & CROSS-PAGE LINKING)
      notify(
        'SYNTHESIZING_DOCUMENT',
        'Menghubungkan detail gambar...',
        40,
        'Mengkorelasikan denah ruangan, tampak, potongan, dan jadwal kusen...',
        { pagesRead: totalPages, totalPages }
      );

      const synthesis: DocumentSynthesisSummary = await dedDocumentSynthesizer.synthesize(context);

      // STAGE 2B: CROSS-PAGE REASONING & ELEMENT RESOLUTION
      crossPageResolver.resolve(context);

      // 4. STAGE 3: AI MENEMUKAN PEKERJAAN (COMPLETE WORK INVENTORY)
      notify(
        'INVENTORY_DISCOVERY',
        'Menemukan pekerjaan...',
        50,
        'Menyusun daftar inventaris seluruh pekerjaan konstruksi dari gambar kerja...',
        { pagesRead: totalPages, totalPages }
      );

      let items: FullAiWorkItem[] = await dedWorkInventoryEngine.discoverWorkInventory(context, synthesis);

      // STAGE 3B: DUPLICATE DETECTION & MERGE (Prevent redundant occurrences)
      const dedupResult = duplicateDetector.deduplicate(items);
      items = dedupResult.items;

      notify(
        'INVENTORY_DISCOVERY',
        'Menemukan pekerjaan...',
        55,
        `Ditemukan ${items.length} mata pembayaran pekerjaan konstruksi (${dedupResult.duplicatesRemoved} duplikat digabungkan).`,
        { pagesRead: totalPages, totalPages, itemsDiscovered: items.length }
      );

      // 5. STAGE 4: AI QUESTION LOOP / MISSING INFO INVESTIGATION
      notify(
        'MISSING_INFO_SEARCH',
        'Menyisir detail gambar...',
        60,
        'Mencari data dimensi dan notasi detail pada seluruh lembar DED...',
        { pagesRead: totalPages, totalPages, itemsDiscovered: items.length }
      );

      for (const item of items) {
        if (item.sourcePages.length <= 1) {
          await dedMissingInformationLoop.resolveMissingInformation(item, context);
        }
      }

      // 6. STAGE 5: AI MENCARI QUANTITY (QUANTITY REASONING TAKEOFF)
      notify(
        'QUANTITY_REASONING',
        'Menghitung volume...',
        70,
        'Menghitung volume pekerjaan dengan formula fisik dan pembuktian gambar...',
        { pagesRead: totalPages, totalPages, itemsDiscovered: items.length }
      );

      dedQuantityReasoningEngine.resolveQuantities(items, context, synthesis);

      const resolvedQtyCount = items.filter((i) => i.quantity !== null && i.quantity > 0).length;

      // 7. STAGE 6: AI MEMERIKSA AHSP (OFFICIAL AHSP & UNIT SAFETY)
      notify(
        'AHSP_MATCHING',
        'Memeriksa AHSP...',
        80,
        'Mencocokkan analisa harga resmi 2026 dan memeriksa kompatibilitas satuan...',
        {
          pagesRead: totalPages,
          totalPages,
          itemsDiscovered: items.length,
          quantitiesResolved: resolvedQtyCount,
        }
      );

      dedAhspReasoningEngine.matchAhspForInventory(items, context);

      const matchedAhspCount = items.filter((i) => i.ahsp !== null).length;

      // 8. STAGE 7: AI MEMERIKSA HARGA (PRICE RESOLUTION)
      notify(
        'PRICE_RESOLUTION',
        'Menentukan harga satuan...',
        85,
        'Menetapkan harga satuan resmi dan menghitung total anggaran...',
        {
          pagesRead: totalPages,
          totalPages,
          itemsDiscovered: items.length,
          quantitiesResolved: resolvedQtyCount,
          ahspMatched: matchedAhspCount,
        }
      );

      dedPriceResolutionEngine.resolvePrices(items, context, projectId, region);

      // STAGE 7B: AI RESOLUTION DEEP INVESTIGATION (For any non-READY items)
      const unresolvedItems = items.filter((i) => i.status !== 'READY');
      if (unresolvedItems.length > 0) {
        notify(
          'SELF_REVIEW',
          'AI Resolution: Meneliti item yang belum lengkap...',
          88,
          `Melakukan investigasi mendalam untuk ${unresolvedItems.length} mata pembayaran yang belum lengkap...`,
          { itemsDiscovered: items.length }
        );
        await dedAiResolutionEngine.resolveUnresolvedItems(items, context, synthesis, projectId, region);
      }

      const resolvedPriceCount = items.filter((i) => i.price !== null && i.price.unitPrice > 0).length;

      // 9. STAGE 8: AI MEMERIKSA ULANG HASIL (MANDATORY SELF-REVIEW)
      notify(
        'SELF_REVIEW',
        'Memeriksa kembali hasil...',
        92,
        'Melakukan 10 pertanyaan audit mandiri dan mendeteksi anomali...',
        {
          pagesRead: totalPages,
          totalPages,
          itemsDiscovered: items.length,
          quantitiesResolved: resolvedQtyCount,
          ahspMatched: matchedAhspCount,
          pricesResolved: resolvedPriceCount,
          reviewIteration: 1,
        }
      );

      let selfReview = dedSelfReviewEngine.conductSelfReview(items, context, 1);

      if (selfReview.requiresCorrection) {
        // Fix stage: re-run resolution on corrected items
        notify(
          'SELF_REVIEW',
          'Melakukan koreksi hasil audit...',
          95,
          'Menerapkan koreksi audit otomatis pada baris RAB...',
          { reviewIteration: 2 }
        );
        dedPriceResolutionEngine.resolvePrices(items, context, projectId, region);
        selfReview = dedSelfReviewEngine.conductSelfReview(items, context, 2);
      }

      // 10. STAGE 9: RAB READY & GRAND TOTAL
      const readyWorkItems = items.filter((i) => i.status === 'READY');
      const unresolvedWorkItems = items.filter((i) => i.status !== 'READY');

      const grandTotalRab = readyWorkItems.reduce((acc, it) => {
        const itemTotal = (typeof it.price?.totalPrice === 'number' && it.price.totalPrice > 0)
          ? it.price.totalPrice
          : 0;
        return SafeDecimalEngine.safeAdd(acc, itemTotal);
      }, 0);

      notify(
        'RAB_READY',
        'RAB siap.',
        100,
        `RAB berhasil disusun: ${readyWorkItems.length} item siap, ${unresolvedWorkItems.length} item butuh review. Total: Rp ${grandTotalRab.toLocaleString('id-ID')}`,
        {
          pagesRead: totalPages,
          totalPages,
          itemsDiscovered: items.length,
          quantitiesResolved: resolvedQtyCount,
          ahspMatched: matchedAhspCount,
          pricesResolved: resolvedPriceCount,
        }
      );

      const durationSec = +((Date.now() - startTime) / 1000).toFixed(1);

      return {
        success: true,
        jobId,
        projectId,
        projectName,
        executionDurationSec: durationSec,
        context,
        workItems: items,
        readyWorkItems,
        unresolvedWorkItems,
        grandTotalRab,
        diagnostics: selfReview.diagnostics,
        selfReviewReport: selfReview.report,
      };
    } catch (err: any) {
      console.error('[FullAiDedRabPipeline] Execution failed:', err);
      notify('FAILED', 'Terjadi kesalahan sistem', 0, err.message);

      return {
        success: false,
        jobId,
        projectId,
        projectName,
        executionDurationSec: +((Date.now() - startTime) / 1000).toFixed(1),
        context: dedDocumentReader.createEmptyContext(projectId, projectName, 0),
        workItems: [],
        readyWorkItems: [],
        unresolvedWorkItems: [],
        grandTotalRab: 0,
        diagnostics: {
          pageCoverage: 0,
          workItemCoverage: 0,
          quantityCoverage: 0,
          ahspCoverage: 0,
          priceCoverage: 0,
          evidenceCoverage: 0,
        },
        selfReviewReport: {
          timestamp: Date.now(),
          iteration: 1,
          overallPassed: false,
          questions: [],
          correctionsExecuted: [],
          unresolvedCount: 0,
          readyCount: 0,
        },
        error: err.message,
      };
    }
  }
}

export const fullAiDedRabPipeline = FullAiDedRabPipeline.getInstance();
