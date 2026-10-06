/**
 * Observability Service for EZRAB AI CoAssistant (Priority 1)
 *
 * Provides structured telemetry and audit logging without leaking secrets, tokens, or raw PII.
 */

export interface TelemetryLogPayload {
  requestId: string;
  conversationId?: string;
  userId?: string;
  workspaceId?: string;
  projectId?: string;
  intent?: string;
  confidence?: number;
  workflow?: string;
  selectedTool?: string;
  validationError?: string;
  modelProvider?: string;
  latencyMs?: number;
  fallbackReason?: string;
  finalResponseType?: 'wizard' | 'static' | 'llm' | 'tool_proposal' | 'refused' | 'error';
  metadata?: Record<string, any>;
}

export class ObservabilityService {
  private static instance: ObservabilityService;
  private logBuffer: TelemetryLogPayload[] = [];
  private maxBufferSize = 500;

  private constructor() {}

  public static getInstance(): ObservabilityService {
    if (!ObservabilityService.instance) {
      ObservabilityService.instance = new ObservabilityService();
    }
    return ObservabilityService.instance;
  }

  /**
   * Mask user ID or sensitive identifiers (e.g. "usr_abc123xyz" -> "usr_***xyz")
   */
  public maskIdentifier(id?: string): string {
    if (!id) return 'anonymous';
    if (id.length <= 6) return '***';
    return `${id.substring(0, 3)}_***_${id.substring(id.length - 4)}`;
  }

  /**
   * Sanitize an arbitrary metadata payload to remove any sensitive keys
   */
  public sanitize(data: any): any {
    if (!data) return data;
    if (typeof data !== 'object') return data;

    const sensitiveKeyPatterns = [
      /password/i,
      /token/i,
      /secret/i,
      /api[_-]?key/i,
      /otp/i,
      /auth/i,
      /credential/i,
      /conn(ection)?_?string/i
    ];

    if (Array.isArray(data)) {
      return data.map(item => this.sanitize(item));
    }

    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (sensitiveKeyPatterns.some(p => p.test(key))) {
        sanitized[key] = '[REDACTED_SECRET]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitize(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  /**
   * Record structured telemetry log
   */
  public logTelemetry(payload: TelemetryLogPayload): void {
    const sanitizedPayload: TelemetryLogPayload = {
      requestId: payload.requestId,
      conversationId: payload.conversationId,
      userId: this.maskIdentifier(payload.userId),
      workspaceId: payload.workspaceId,
      projectId: payload.projectId,
      intent: payload.intent,
      confidence: payload.confidence,
      workflow: payload.workflow,
      selectedTool: payload.selectedTool,
      validationError: payload.validationError,
      modelProvider: payload.modelProvider,
      latencyMs: payload.latencyMs,
      fallbackReason: payload.fallbackReason,
      finalResponseType: payload.finalResponseType,
      metadata: this.sanitize(payload.metadata)
    };

    this.logBuffer.push(sanitizedPayload);
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer.shift();
    }

    // Output structured JSON in non-test runtime
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[AI-TELEMETRY] ${JSON.stringify(sanitizedPayload)}`);
    }
  }

  /**
   * Get recent telemetry entries for diagnostics or debugging
   */
  public getRecentLogs(limit: number = 50): TelemetryLogPayload[] {
    return this.logBuffer.slice(-limit);
  }

  /**
   * Clear buffer (useful for test isolation)
   */
  public clear(): void {
    this.logBuffer = [];
  }
}

export const observabilityService = ObservabilityService.getInstance();
