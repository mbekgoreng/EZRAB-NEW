/**
 * DED Analysis Service (EZRAB DED -> RAB V2)
 *
 * Implements 3-Mode Execution Strategy:
 * - FAST: Parallel single-pass page scan (Gemini Flash-Lite) with high concurrency & immediate progressive updates.
 * - STANDARD: Balanced two-pass multimodal reading (Qwen Flash + Qwen Omni Flash) - Default.
 * - DETAIL: Multi-pass deep reading + targeted 3rd pass with HIGH reasoning (Gemini 3.8 Flash) for ambiguous/conflicting items.
 *
 * Responsibilities:
 * - Bounded concurrency and SHA-256 caching.
 * - Smart triage (skips blank or non-technical cover sheets).
 * - Real progressive telemetry and failure tracking.
 */

import {
  SourceDocument,
  DocumentPage,
  RawPageAnalysisPass1,
  RawPageAnalysisPass2,
} from '../types';
import { DedProcessingConfig, getDedProcessingConfig } from '../config/dedModeConfig';
import { dedVisionReader } from './dedVisionReader';
import { ProcessingJobTracker } from '../pipeline/processingJob';
import { aiConcurrencyQueue } from './aiConcurrencyQueue';
import { dedPageCache } from './dedPageCache';
import { zyrouterClient } from './zyrouterClient';

export interface AnalysisOptions {
  config?: DedProcessingConfig;
  fastPreview?: boolean;
  concurrency?: number;
  onItemExtracted?: (item: any, evidence: any[]) => void;
}

export class DedAnalysisService {
  private static instance: DedAnalysisService;

  private constructor() {}

  public static getInstance(): DedAnalysisService {
    if (!DedAnalysisService.instance) {
      DedAnalysisService.instance = new DedAnalysisService();
    }
    return DedAnalysisService.instance;
  }

  /**
   * Analyzes all pages of all documents according to the chosen processing mode.
   */
  public async analyzeDocuments(
    documents: SourceDocument[],
    jobTracker?: ProcessingJobTracker,
    options?: AnalysisOptions
  ): Promise<{
    pass1Results: Map<string, RawPageAnalysisPass1>; // pageId -> pass1
    pass2Results: RawPageAnalysisPass2[];
  }> {
    const config = options?.config || getDedProcessingConfig('STANDARD');
    const mode = config.mode;
    const pass1Results = new Map<string, RawPageAnalysisPass1>();
    const pass2Results: RawPageAnalysisPass2[] = [];

    // Set concurrency
    const effectiveConcurrency = options?.concurrency || config.maxConcurrentPages || 4;
    aiConcurrencyQueue.setConcurrency(effectiveConcurrency);

    // Sync client state
    zyrouterClient.setModel(config.model);
    zyrouterClient.setProvider(config.provider);
    zyrouterClient.setProcessingMode(mode);

    // Collect all valid pages
    const validPages: Array<{ doc: SourceDocument; page: DocumentPage }> = [];
    for (const doc of documents) {
      if (doc.status !== 'SOURCE_VERIFIED') continue;
      for (const page of doc.pages) {
        if (page.nonEmptyPixelCheck === false) {
          console.log(`[DedAnalysisService] Melewati halaman kosong/blank: Dokumen ${doc.fileName} Halaman ${page.pageNumber}`);
          continue;
        }
        validPages.push({ doc, page });
      }
    }

    const totalPages = validPages.length;

    jobTracker?.emitPipelineEvent('AI_ANALYSIS_STARTED', `Vision model aktif: ${config.modelLabel || config.model} (${mode}).`);

    // =========================================================================
    // MODE 1: FAST SCAN (SINGLE-PASS HIGH-CONCURRENCY PIPELINE)
    // =========================================================================
    if (mode === 'FAST') {
      jobTracker?.updateStage(
        'ANALYZING',
        `[Mode CEPAT] Memindai ${totalPages} halaman secara paralel (Single-Pass Bounded Concurrency: ${effectiveConcurrency} workers)...`
      );

      let fastCompleted = 0;

      const fastTasks = validPages.map(({ doc, page }) => {
        const cacheKey = dedPageCache.generateKey(doc.id, page.pageNumber, page.imageDataUrl, config.model, 1);
        const fingerprint = `fast_${page.id}_${config.model}`;

        return aiConcurrencyQueue.enqueue(fingerprint, async () => {
          // 1. Cache lookup
          const cachedPass1 = dedPageCache.get<RawPageAnalysisPass1>(`${cacheKey}_p1`);
          const cachedPass2 = dedPageCache.get<RawPageAnalysisPass2>(`${cacheKey}_p2`);
          if (cachedPass1 && cachedPass2) {
            pass1Results.set(page.id, cachedPass1);
            pass2Results.push(cachedPass2);
            fastCompleted++;
            jobTracker?.updatePageProgress(
              fastCompleted,
              totalPages,
              `[Cache Hit] Scan Cepat: Halaman ${page.pageNumber}/${doc.pages.length} (${cachedPass1.drawingType})`
            );
            const totalEv = pass2Results.reduce((acc, r) => acc + r.evidences.length, 0);
            const totalIt = pass2Results.reduce((acc, r) => acc + r.candidateItems.length, 0);
            jobTracker?.updateCounts({ evidenceCount: totalEv, dedItemCount: totalIt });
            return;
          }

          // 2. Fast single-pass execution
          try {
            const { pass1, pass2 } = await dedVisionReader.extractPageFast(page, config);
            dedPageCache.set(`${cacheKey}_p1`, doc.id, page.pageNumber, dedPageCache.computeHash(page.imageDataUrl), config.model, pass1);
            dedPageCache.set(`${cacheKey}_p2`, doc.id, page.pageNumber, dedPageCache.computeHash(page.imageDataUrl), config.model, pass2);

            pass1Results.set(page.id, pass1);
            pass2Results.push(pass2);
            jobTracker?.incrementAiStats(true);

            // Progressive callback
            if (options?.onItemExtracted) {
              pass2.candidateItems.forEach((item) => {
                options.onItemExtracted!(item, pass2.evidences);
              });
            }

            const totalEv = pass2Results.reduce((acc, r) => acc + r.evidences.length, 0);
            const totalIt = pass2Results.reduce((acc, r) => acc + r.candidateItems.length, 0);
            jobTracker?.updateCounts({ evidenceCount: totalEv, dedItemCount: totalIt });

            jobTracker?.emitPipelineEvent(
              'AI_PAGE_COMPLETED',
              `Selesai menganalisis halaman ${page.pageNumber}/${doc.pages.length}`,
              {
                completedPageIndex: page.pageNumber,
                latestFindings: pass2.candidateItems.map((item) => ({
                  name: item.name,
                  status: item.status === 'CONFIRMED' ? 'Quantity ditemukan' : 'Perlu verifikasi',
                  pageNumber: page.pageNumber,
                })),
              }
            );
          } catch (err: any) {
            jobTracker?.incrementAiStats(false);
            console.warn(`[DedAnalysisService Fast] Failed on page ${page.id}:`, err.message);
          } finally {
            fastCompleted++;
            jobTracker?.updatePageProgress(
              fastCompleted,
              totalPages,
              `Membaca halaman ${page.pageNumber}/${doc.pages.length} (${doc.fileName})...`
            );
          }
        });
      });

      await Promise.all(fastTasks);

      const cacheStats = dedPageCache.getStats();
      jobTracker?.updateCacheStats(cacheStats.hits, cacheStats.misses);

      return { pass1Results, pass2Results };
    }

    // =========================================================================
    // ADVANCED (and backward-compatible STANDARD/DETAIL): contextual multi-pass
    // reading. The result contract and every deterministic downstream stage are
    // identical to FAST; only this extraction/reasoning strategy differs.
    // =========================================================================
    let pass1Completed = 0;
    let pass2Completed = 0;

    // PASS 1: Page Understanding & Classification
    jobTracker?.updateStage(
      'ANALYZING',
      `[Mode ${mode}] Pass 1: Memahami struktur & klasifikasi ${totalPages} halaman gambar...`
    );

    const pass1Tasks = validPages.map(({ doc, page }) => {
      const cacheKey = dedPageCache.generateKey(doc.id, page.pageNumber, page.imageDataUrl, config.model, 1);
      const fingerprint = `pass1_${page.id}_${config.model}`;

      return aiConcurrencyQueue.enqueue(fingerprint, async () => {
        // 1. Cache lookup
        const cached = dedPageCache.get<RawPageAnalysisPass1>(cacheKey);
        if (cached) {
          pass1Results.set(page.id, cached);
          pass1Completed++;
          jobTracker?.updatePageProgress(
            pass1Completed,
            totalPages,
            `[Cache Hit] Pass 1: Halaman ${page.pageNumber}/${doc.pages.length} (${cached.drawingType})`
          );
          return cached;
        }

        // 2. Vision API execution
        try {
          const pass1 = await dedVisionReader.analyzePagePass1(page, config);
          dedPageCache.set(cacheKey, doc.id, page.pageNumber, dedPageCache.computeHash(page.imageDataUrl), config.model, pass1);
          pass1Results.set(page.id, pass1);
          jobTracker?.incrementAiStats(true);
        } catch (err: any) {
          jobTracker?.incrementAiStats(false);
          console.warn(`[DedAnalysisService] Pass 1 failed on page ${page.id}:`, err.message);
        } finally {
          pass1Completed++;
          jobTracker?.updatePageProgress(
            pass1Completed,
            totalPages,
            `Pass 1: Membaca struktur halaman ${page.pageNumber}/${doc.pages.length} (${doc.fileName})...`
          );
        }
      });
    });

    await Promise.all(pass1Tasks);

    // PASS 2: Work Item & Evidence Extraction on Relevant Sheets
    jobTracker?.updateStage(
      'EXTRACTING_EVIDENCE',
      `[Mode ${mode}] Pass 2: Ekstraksi geometri, dimensi & bukti teknis dari lembar gambar...`
    );

    // Smart Triage: filter out sheets that don't contain actionable technical elements
    const eligiblePages = validPages.filter(({ page }) => {
      const pass1 = pass1Results.get(page.id);
      if (!pass1) return true;

      // Skip Cover
      if (pass1.drawingType === 'COVER') {
        return false;
      }

      // In fast preview, only analyze Floor Plans, Site Plans, and Roof Plans
      if (options?.fastPreview) {
        return (
          pass1.drawingType === 'FLOOR_PLAN' ||
          pass1.drawingType === 'SITE_PLAN' ||
          pass1.drawingType === 'ROOF_PLAN' ||
          pass1.drawingType === 'STRUCTURAL_PLAN'
        );
      }

      return true;
    });

    const pass2Tasks = eligiblePages.map(({ doc, page }) => {
      const pass1 = pass1Results.get(page.id);
      const pass1Context: RawPageAnalysisPass1 = pass1 || {
        pageNumber: page.pageNumber,
        drawingType: page.drawingType || 'FLOOR_PLAN',
        drawingTitle: page.drawingTitle || `Lembar ${page.pageNumber}`,
        scale: page.scale || '1:100',
        scaleVerified: page.scaleVerified,
        confidence: 0.9,
        notes: [],
        gridLines: [],
        constructionElementsFound: [],
      };

      const cacheKey = dedPageCache.generateKey(doc.id, page.pageNumber, page.imageDataUrl, config.model, 2);
      const fingerprint = `pass2_${page.id}_${config.model}`;

      return aiConcurrencyQueue.enqueue(fingerprint, async () => {
        // 1. Cache lookup
        const cached = dedPageCache.get<RawPageAnalysisPass2>(cacheKey);
        if (cached) {
          pass2Results.push(cached);
          pass2Completed++;
          jobTracker?.updatePageProgress(
            pass2Completed,
            eligiblePages.length,
            `[Cache Hit] Pass 2: Halaman ${page.pageNumber}/${doc.pages.length} (${pass1Context.drawingType})`
          );
          const totalEv = pass2Results.reduce((acc, r) => acc + r.evidences.length, 0);
          const totalIt = pass2Results.reduce((acc, r) => acc + r.candidateItems.length, 0);
          jobTracker?.updateCounts({ evidenceCount: totalEv, dedItemCount: totalIt });
          return cached;
        }

        // 2. Vision API extraction
        try {
          const pass2 = await dedVisionReader.extractItemsAndEvidencePass2(page, pass1Context, config);
          dedPageCache.set(cacheKey, doc.id, page.pageNumber, dedPageCache.computeHash(page.imageDataUrl), config.model, pass2);
          pass2Results.push(pass2);
          jobTracker?.incrementAiStats(true);

          if (options?.onItemExtracted) {
            pass2.candidateItems.forEach((item) => {
              options.onItemExtracted!(item, pass2.evidences);
            });
          }

          const totalEv = pass2Results.reduce((acc, r) => acc + r.evidences.length, 0);
          const totalIt = pass2Results.reduce((acc, r) => acc + r.candidateItems.length, 0);
          jobTracker?.updateCounts({ evidenceCount: totalEv, dedItemCount: totalIt });

          jobTracker?.emitPipelineEvent(
            'AI_PAGE_COMPLETED',
            `Selesai menganalisis halaman ${page.pageNumber}/${doc.pages.length}`,
            {
              completedPageIndex: page.pageNumber,
              latestFindings: pass2.candidateItems.map((item) => ({
                name: item.name,
                status: item.status === 'CONFIRMED' ? 'Quantity ditemukan' : 'Perlu verifikasi',
                pageNumber: page.pageNumber,
              })),
            }
          );
        } catch (err: any) {
          jobTracker?.incrementAiStats(false);
          console.warn(`[DedAnalysisService] Pass 2 failed on page ${page.id}:`, err.message);
        } finally {
          pass2Completed++;
          jobTracker?.updatePageProgress(
            pass2Completed,
            eligiblePages.length,
            `Mengekstrak item DED halaman ${page.pageNumber}/${doc.pages.length} (${pass1Context.drawingType})...`
          );
        }
      });
    });

    await Promise.all(pass2Tasks);

    // =========================================================================
    // ADVANCED / DETAIL MODE TARGETED PASS 3: DEEP VERIFICATION ON AMBIGUOUS ITEMS
    // =========================================================================
    if ((mode === 'ADVANCED' || mode === 'DETAIL') && config.enableAmbiguityResolution) {
      const ambiguousSheets = eligiblePages.filter(({ page }) => {
        const p2 = pass2Results.find((r) => r.pageNumber === page.pageNumber);
        if (!p2) return false;
        return p2.candidateItems.some(
          (i) => i.status === 'AMBIGUOUS' || i.status === 'CONFLICT' || i.status === 'MISSING_DATA'
        );
      });

      if (ambiguousSheets.length > 0) {
        jobTracker?.updateStage(
          'EXTRACTING_EVIDENCE',
          `Menjalankan verifikasi mendalam pada ${ambiguousSheets.length} lembar untuk resolusi ambiguitas...`
        );

        for (const { page } of ambiguousSheets) {
          const p2 = pass2Results.find((r) => r.pageNumber === page.pageNumber);
          if (!p2) continue;

          for (const item of p2.candidateItems) {
            if (item.status === 'AMBIGUOUS' || item.status === 'CONFLICT') {
              try {
                const deepRes = await dedVisionReader.verifyItemDeepPass3(page, item, config);
                if (deepRes && deepRes.resolvedStatus) {
                  item.status = deepRes.resolvedStatus;
                  if (deepRes.verifiedDimensions) {
                    item.dimensions = { ...item.dimensions, ...deepRes.verifiedDimensions };
                  }
                  if (deepRes.notes) {
                    item.notes = `${item.notes || ''} [Deep Verified: ${deepRes.notes}]`.trim();
                  }
                }
              } catch (err: any) {
                console.warn(`[DedAnalysisService Detail Pass 3] Deep pass skipped for item ${item.name}:`, err.message);
              }
            }
          }
        }
      }
    }

    const finalCacheStats = dedPageCache.getStats();
    jobTracker?.updateCacheStats(finalCacheStats.hits, finalCacheStats.misses);

    return {
      pass1Results,
      pass2Results,
    };
  }
}

export const dedAnalysisService = DedAnalysisService.getInstance();
