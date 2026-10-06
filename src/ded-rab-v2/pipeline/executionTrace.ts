/**
 * EZRAB — Internal Execution Trace Engine (Master Prompt Section 3)
 *
 * Records deterministic, granular telemetry for autonomous DED -> RAB runs:
 * AI_RAB_RUN_START
 *   -> DED_READ
 *   -> DED_PAGE_ANALYSIS
 *   -> WORK_ITEM_DISCOVERY
 *   -> QUANTITY_RESOLUTION
 *   -> AHSP_RESOLUTION
 *   -> MATERIAL_RESOLUTION
 *   -> LABOR_RESOLUTION
 *   -> PRICE_RESOLUTION
 *   -> CALCULATION
 *   -> VALIDATION
 *   -> SELF_REPAIR
 *   -> FINAL_VALIDATION
 *   -> RAB_READY
 *
 * Note: This trace is for internal diagnostics and audit trail only.
 */

export type ExecutionTraceStage =
  | 'AI_RAB_RUN_START'
  | 'DED_READ'
  | 'DED_PAGE_ANALYSIS'
  | 'WORK_ITEM_DISCOVERY'
  | 'QUANTITY_RESOLUTION'
  | 'AHSP_RESOLUTION'
  | 'MATERIAL_RESOLUTION'
  | 'LABOR_RESOLUTION'
  | 'PRICE_RESOLUTION'
  | 'CALCULATION'
  | 'VALIDATION'
  | 'SELF_REPAIR'
  | 'FINAL_VALIDATION'
  | 'RAB_READY';

export interface StageTraceRecord {
  stage: ExecutionTraceStage;
  status: 'STARTED' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  itemCount: number;
  resolvedCount: number;
  unresolvedCount: number;
  errors: string[];
  metadata?: Record<string, any>;
}

export interface DedExecutionTrace {
  runId: string;
  projectId: string;
  executionMode: 'AI_RAB' | 'EZRAB_STANDARD';
  location?: { province: string; city: string; year: number };
  startedAt: string;
  completedAt?: string;
  totalDurationMs?: number;
  stages: StageTraceRecord[];
  summary: {
    totalItems: number;
    resolvedItems: number;
    unresolvedItems: number;
    grandTotal: number;
    selfRepairRuns: number;
    isCleanPass: boolean;
  };
}

export class ExecutionTraceTracker {
  private trace: DedExecutionTrace;

  constructor(
    runId: string,
    projectId: string,
    executionMode: 'AI_RAB' | 'EZRAB_STANDARD' = 'AI_RAB',
    location?: { province: string; city: string; year: number }
  ) {
    this.trace = {
      runId,
      projectId,
      executionMode,
      location,
      startedAt: new Date().toISOString(),
      stages: [],
      summary: {
        totalItems: 0,
        resolvedItems: 0,
        unresolvedItems: 0,
        grandTotal: 0,
        selfRepairRuns: 0,
        isCleanPass: true,
      },
    };
  }

  public startStage(stage: ExecutionTraceStage, itemCount: number = 0, metadata?: Record<string, any>): void {
    const startedAt = new Date().toISOString();
    this.trace.stages.push({
      stage,
      status: 'STARTED',
      startedAt,
      itemCount,
      resolvedCount: 0,
      unresolvedCount: itemCount,
      errors: [],
      metadata,
    });
  }

  public completeStage(
    stage: ExecutionTraceStage,
    result: {
      itemCount?: number;
      resolvedCount?: number;
      unresolvedCount?: number;
      errors?: string[];
      metadata?: Record<string, any>;
    } = {}
  ): void {
    const completedAt = new Date().toISOString();
    let target = this.trace.stages.find((s) => s.stage === stage && s.status === 'STARTED');
    if (!target) {
      this.startStage(stage, result.itemCount || 0);
      target = this.trace.stages[this.trace.stages.length - 1];
    }

    const startMs = new Date(target.startedAt).getTime();
    const endMs = new Date(completedAt).getTime();

    target.status = (result.errors && result.errors.length > 0 && (result.resolvedCount || 0) === 0) ? 'FAILED' : 'COMPLETED';
    target.completedAt = completedAt;
    target.durationMs = Math.max(0, endMs - startMs);
    if (result.itemCount !== undefined) target.itemCount = result.itemCount;
    if (result.resolvedCount !== undefined) target.resolvedCount = result.resolvedCount;
    if (result.unresolvedCount !== undefined) target.unresolvedCount = result.unresolvedCount;
    if (result.errors) target.errors = [...target.errors, ...result.errors];
    if (result.metadata) target.metadata = { ...target.metadata, ...result.metadata };
  }

  public failStage(stage: ExecutionTraceStage, error: string): void {
    const completedAt = new Date().toISOString();
    let target = this.trace.stages.find((s) => s.stage === stage && s.status === 'STARTED');
    if (!target) {
      this.startStage(stage);
      target = this.trace.stages[this.trace.stages.length - 1];
    }
    const startMs = new Date(target.startedAt).getTime();
    const endMs = new Date(completedAt).getTime();

    target.status = 'FAILED';
    target.completedAt = completedAt;
    target.durationMs = Math.max(0, endMs - startMs);
    target.errors.push(error);
  }

  public finalizeTrace(summary: Partial<DedExecutionTrace['summary']>): DedExecutionTrace {
    this.trace.completedAt = new Date().toISOString();
    const startMs = new Date(this.trace.startedAt).getTime();
    const endMs = new Date(this.trace.completedAt).getTime();
    this.trace.totalDurationMs = Math.max(0, endMs - startMs);

    this.trace.summary = {
      ...this.trace.summary,
      ...summary,
    };

    return this.trace;
  }

  public getTrace(): DedExecutionTrace {
    return this.trace;
  }
}

// Registry to store recent execution traces per project
class ExecutionTraceRegistry {
  private static instance: ExecutionTraceRegistry;
  private traces: Map<string, DedExecutionTrace> = new Map();

  private constructor() {}

  public static getInstance(): ExecutionTraceRegistry {
    if (!ExecutionTraceRegistry.instance) {
      ExecutionTraceRegistry.instance = new ExecutionTraceRegistry();
    }
    return ExecutionTraceRegistry.instance;
  }

  public setTrace(projectId: string, trace: DedExecutionTrace): void {
    this.traces.set(projectId, trace);
  }

  public getLatestTrace(projectId: string): DedExecutionTrace | undefined {
    return this.traces.get(projectId);
  }
}

export const executionTraceRegistry = ExecutionTraceRegistry.getInstance();
