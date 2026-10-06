import { AgentTraceRecord, AgentExecutionState } from './agentTypes';
import { IntentCategory } from '../intent/intentTypes';

export class AgentTraceService {
  private static instance: AgentTraceService;
  private traces: Map<string, AgentTraceRecord> = new Map();
  private maxTraces = 2000;

  public static getInstance(): AgentTraceService {
    if (!AgentTraceService.instance) {
      AgentTraceService.instance = new AgentTraceService();
    }
    return AgentTraceService.instance;
  }

  /**
   * Start a new agent trace without logging passwords, tokens, or raw secrets.
   */
  public startTrace(params: {
    requestId: string;
    userId: string;
    workspaceId: string;
    projectId?: string;
    intent?: IntentCategory;
  }): AgentTraceRecord {
    const traceId = `trc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const record: AgentTraceRecord = {
      traceId,
      requestId: params.requestId,
      userId: params.userId,
      workspaceId: params.workspaceId,
      projectId: params.projectId,
      intent: params.intent || 'UNKNOWN',
      state: 'RECEIVED',
      selectedProvider: 'none',
      toolsSelected: [],
      sources: [],
      durationMs: 0,
      success: true,
      timestamp: new Date().toISOString()
    };

    this.traces.set(traceId, record);
    this.pruneOldTraces();
    return record;
  }

  public updateTrace(
    traceId: string,
    updates: Partial<Omit<AgentTraceRecord, 'traceId' | 'requestId' | 'timestamp'>>
  ): void {
    const existing = this.traces.get(traceId);
    if (!existing) return;
    Object.assign(existing, updates);
  }

  public completeTrace(
    traceId: string,
    state: AgentExecutionState,
    success: boolean,
    durationMs: number,
    error?: { code: string; message: string }
  ): AgentTraceRecord | undefined {
    const record = this.traces.get(traceId);
    if (!record) return undefined;

    record.state = state;
    record.success = success;
    record.durationMs = durationMs;
    if (error) {
      record.errorCode = error.code;
      record.errorMessage = error.message;
    }

    return record;
  }

  public getTrace(traceId: string): AgentTraceRecord | undefined {
    return this.traces.get(traceId);
  }

  public getRecentTraces(limit = 50): AgentTraceRecord[] {
    return Array.from(this.traces.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  private pruneOldTraces(): void {
    if (this.traces.size > this.maxTraces) {
      const keys = Array.from(this.traces.keys()).slice(0, 100);
      for (const k of keys) {
        this.traces.delete(k);
      }
    }
  }
}

export const agentTraceService = AgentTraceService.getInstance();
