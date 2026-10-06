/**
 * Processing Job Tracker (EZRAB DED -> RAB V2)
 *
 * Responsibilities:
 * - Real asynchronous job progression without fake timers.
 * - Granular telemetry across all 11 stages.
 * - Emits real-time progress callbacks to the UI.
 */

import { PipelineStage, PipelineProgressEvent, DedProcessingMode, DedPipelineEventType } from '../types';
import { zyrouterClient } from '../ai/zyrouterClient';

export type JobProgressCallback = (event: PipelineProgressEvent) => void;

export interface JobTrackerOptions {
  mode?: DedProcessingMode;
  provider?: string;
  reasoningLevel?: 'low' | 'medium' | 'high';
}

export class ProcessingJobTracker {
  private job: PipelineProgressEvent;
  private onProgressCallback?: JobProgressCallback;
  private startTimestamp: number;

  constructor(
    jobId: string,
    projectId: string,
    totalPages: number,
    aiModel: string,
    onProgress?: JobProgressCallback,
    options?: JobTrackerOptions
  ) {
    this.startTimestamp = Date.now();
    this.onProgressCallback = onProgress;
    this.job = {
      jobId,
      projectId,
      stage: 'QUEUED',
      eventType: 'DED_INGEST_STARTED',
      mode: options?.mode,
      provider: options?.provider,
      reasoningLevel: options?.reasoningLevel,
      currentPage: 0,
      totalPages,
      pagesAnalyzed: 0,
      evidenceCount: 0,
      dedItemCount: 0,
      qtoCount: 0,
      ahspCount: 0,
      priceCount: 0,
      priceResolvedCount: 0,
      priceReferenceCount: 0,
      aiModel,
      aiRequests: 0,
      aiSuccessful: 0,
      aiFailed: 0,
      fallbackCount: 0,
      stageDetails: 'Job terdaftar dalam antrean pemrosesan DED...',
      durationMs: 0,
    };
    this.emit();
  }

  public emitPipelineEvent(
    eventType: DedPipelineEventType,
    details: string,
    extra?: Partial<PipelineProgressEvent>
  ): void {
    this.job.eventType = eventType;
    this.job.stageDetails = details;
    if (extra) {
      Object.assign(this.job, extra);
    }
    this.job.durationMs = Date.now() - this.startTimestamp;
    this.emit();
  }

  public updateStage(stage: PipelineStage, details: string): void {
    this.job.stage = stage;
    this.job.stageDetails = details;
    
    // Auto-map stage to eventType if not already explicitly set
    const stageEventMap: Partial<Record<PipelineStage, DedPipelineEventType>> = {
      INGESTING: 'DED_INGEST_STARTED',
      RENDERING: 'PAGE_RENDER_STARTED',
      ANALYZING: 'AI_ANALYSIS_STARTED',
      EXTRACTING_EVIDENCE: 'EVIDENCE_CREATED',
      BUILDING_ITEMS: 'DED_ITEM_CREATED',
      CALCULATING_QTO: 'QTO_STARTED',
      MATCHING_AHSP: 'AHSP_STARTED',
      RESOLVING_PRICES: 'PRICE_STARTED',
      READY_FOR_REVIEW: 'REVIEW_READY',
    };

    if (stageEventMap[stage]) {
      this.job.eventType = stageEventMap[stage]!;
    }

    this.job.durationMs = Date.now() - this.startTimestamp;
    this.emit();
  }

  public updatePageProgress(current: number, total: number, details?: string): void {
    this.job.currentPage = current;
    this.job.totalPages = total;
    if (details) this.job.stageDetails = details;
    this.job.durationMs = Date.now() - this.startTimestamp;
    this.emit();
  }

  public incrementAiStats(success: boolean): void {
    this.job.aiRequests++;
    if (success) {
      this.job.aiSuccessful++;
    } else {
      this.job.aiFailed++;
    }
    this.job.durationMs = Date.now() - this.startTimestamp;
    this.emit();
  }

  public incrementFallback(): void {
    this.job.fallbackCount = (this.job.fallbackCount || 0) + 1;
    this.job.durationMs = Date.now() - this.startTimestamp;
    this.emit();
  }

  public updateCounts(counts: {
    evidenceCount?: number;
    dedItemCount?: number;
    qtoCount?: number;
    ahspCount?: number;
    priceCount?: number;
    priceResolvedCount?: number;
    priceReferenceCount?: number;
  }): void {
    if (counts.evidenceCount !== undefined) this.job.evidenceCount = counts.evidenceCount;
    if (counts.dedItemCount !== undefined) this.job.dedItemCount = counts.dedItemCount;
    if (counts.qtoCount !== undefined) this.job.qtoCount = counts.qtoCount;
    if (counts.ahspCount !== undefined) this.job.ahspCount = counts.ahspCount;
    if (counts.priceCount !== undefined) this.job.priceCount = counts.priceCount;
    if (counts.priceResolvedCount !== undefined) this.job.priceResolvedCount = counts.priceResolvedCount;
    if (counts.priceReferenceCount !== undefined) this.job.priceReferenceCount = counts.priceReferenceCount;
    this.job.durationMs = Date.now() - this.startTimestamp;
    this.emit();
  }

  public updateRenderingStats(rendered: number, nonEmpty: number): void {
    this.job.renderedPages = rendered;
    this.job.nonEmptyPages = nonEmpty;
    this.job.durationMs = Date.now() - this.startTimestamp;
    this.emit();
  }

  public updateCacheStats(hits: number, misses: number): void {
    this.job.cacheHits = hits;
    this.job.cacheMisses = misses;
    this.job.durationMs = Date.now() - this.startTimestamp;
    this.emit();
  }

  public fail(errorMessage: string): void {
    this.job.stage = 'FAILED';
    this.job.error = errorMessage;
    this.job.stageDetails = `Gagal: ${errorMessage}`;
    this.job.durationMs = Date.now() - this.startTimestamp;
    this.emit();
  }

  public complete(details: string = 'Pipeline selesai.'): void {
    this.job.stage = 'COMPLETED';
    this.job.stageDetails = details;
    this.job.durationMs = Date.now() - this.startTimestamp;
    this.emit();
  }

  public getSnapshot(): PipelineProgressEvent {
    const rawResponses = zyrouterClient ? zyrouterClient.getTelemetryHistory() : [];
    return {
      ...this.job,
      durationMs: Date.now() - this.startTimestamp,
      rawResponses,
    };
  }

  private emit(): void {
    if (this.onProgressCallback) {
      try {
        this.onProgressCallback({ ...this.job });
      } catch (err) {
        console.warn('[ProcessingJobTracker] Error in progress callback:', err);
      }
    }
  }
}
