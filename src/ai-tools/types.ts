/**
 * EZRAB AI TOOLS — Shared Types & Structured Errors
 *
 * All three AI products (EZRAB AI, DED AI Estimate, Dokumen AI) use:
 * - A structured success envelope `{ success: true, ... }`
 * - A structured error envelope `{ success: false, errorCode, stage, message, retryable }`
 *
 * ABSOLUTE RULES (Task D):
 * - No silent fallback: `catch → []` / `catch → null` / zero-results-on-failure are FORBIDDEN.
 * - Errors carry `errorCode`, `stage`, and `message` so the UI can react precisely.
 * - Returns must NEVER look like `Rp0 + SUCCESS`. If an AI cannot compute, it must FAIL
 *   with a structured error, not produce a fake success.
 */

export type AIToolsErrorCode =
  | 'READ_FAILED'
  | 'PDF_RENDER_ERROR'
  | 'PARSE_FAILED'
  | 'ANALYSIS_FAILED'
  | 'MODEL_ERROR'
  | 'MODEL_PROVIDER_404'
  | 'MODEL_TIMEOUT'
  | 'EMPTY_RESPONSE'
  | 'MALFORMED_JSON'
  | 'NO_DATA'
  | 'NO_CALCULABLE_ITEMS'
  | 'PROJECT_TYPE_UNSUPPORTED'
  | 'MODEL_MISMATCH'
  | 'INTERNAL';

export interface AIToolsStructuredError {
  success: false;
  errorCode: AIToolsErrorCode;
  stage: string;
  message: string;
  details?: string[];
  retryable: boolean;
}

export function aiToolsError(
  errorCode: AIToolsErrorCode,
  stage: string,
  message: string,
  extra?: Partial<AIToolsStructuredError>
): AIToolsStructuredError {
  return {
    success: false,
    errorCode,
    stage,
    message,
    retryable: false,
    ...extra,
  };
}

export function isAIToolsError(value: unknown): value is AIToolsStructuredError {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as any).success === false &&
      typeof (value as any).errorCode === 'string' &&
      typeof (value as any).stage === 'string'
  );
}
