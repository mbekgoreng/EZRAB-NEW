/**
 * EZRAB Multi-Provider AI & Cost Optimizer Types (Phase 9.3)
 *
 * Core abstractions for multi-provider routing, dynamic model discovery,
 * key pools, capability resolution, cost estimation, and evidence attribution.
 */

export type ProviderId = 'gemini' | 'atria' | 'inception' | 'zrouter' | 'ezrab_core' | string;

export type ModelId = string;

export type AICapability =
  | 'TEXT'
  | 'VISION'
  | 'IMAGE'
  | 'PDF'
  | 'OCR'
  | 'DRAWING'
  | 'REASONING'
  | 'STRUCTURED_OUTPUT'
  | 'LONG_CONTEXT'
  | 'TOOL_USE';

export type AIQualityTier =
  | 'ULTRA_CHEAP'
  | 'CHEAP'
  | 'BALANCED'
  | 'PREMIUM'
  | 'FRONTIER';

export type KeyStatus =
  | 'AVAILABLE'
  | 'IN_USE'
  | 'COOLDOWN'
  | 'FAILED'
  | 'DISABLED';

export type ProviderHealth =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'UNAVAILABLE'
  | 'UNKNOWN';

export type ProviderHealthStatus =
  | 'SUCCESS'
  | 'RATE_LIMITED'
  | 'AUTH_ERROR'
  | 'TIMEOUT'
  | 'SERVER_ERROR'
  | 'UNSUPPORTED'
  | 'INVALID_RESPONSE';

export type ProviderConnectivityClassification =
  | 'REAL_PROVIDER'
  | 'MOCK_PROVIDER'
  | 'FIXTURE'
  | 'DETERMINISTIC'
  | 'NOT_TESTED';

export interface AIModelDefinition {
  id: string;
  providerId: ProviderId;
  name?: string;
  capabilities: AICapability[];
  inputCostPerMillion: number; // USD per 1M tokens
  outputCostPerMillion: number; // USD per 1M tokens
  contextWindow?: number;
  enabled: boolean;
  qualityTier: AIQualityTier;
  availability?: 'AVAILABLE' | 'DEGRADED' | 'UNAVAILABLE';
  supportsStructuredOutput?: boolean;
  supportsEvidence?: boolean;
  supportsVision?: boolean;
  supportsPdf?: boolean;
  supportsOcr?: boolean;
  supportsReasoning?: boolean;
  recommendedFor?: string[];
  maxTokens?: number;
}

export interface AIProviderDefinition {
  id: ProviderId;
  name: string;
  enabled: boolean;
  capabilities: AICapability[];
  models: AIModelDefinition[];
  priority?: number;
  baseUrl?: string;
  isCustomGateway?: boolean;
}

export interface AIKeyPoolEntry {
  id: string; // Identifier alias (e.g. 'gemini-key-1', 'atria-key-5', never the raw secret)
  providerId: ProviderId;
  keyIndex: number;
  status: KeyStatus;
  enabled: boolean;
  priority: number;
  monthlyBudget?: number; // In USD
  dailyBudget?: number; // In USD
  currentUsageMonth?: number; // In USD
  currentUsageDay?: number; // In USD
  cooldownUntil?: number; // Epoch timestamp ms
  lastHealthStatus?: ProviderHealthStatus;
  lastUsedAt?: number;
  lastUsedTimestamp?: number;
  failureCount?: number;
}

export type TaskRoutingType =
  | 'CHAT'
  | 'PROJECT_QA'
  | 'PDF_READING'
  | 'DED_READING'
  | 'DRAWING_ANALYSIS'
  | 'RECEIPT_READING'
  | 'RAB_ANALYSIS'
  | 'DOCUMENT_WRITING'
  | 'DOCUMENT_REVIEW'
  | 'COMPLEX_REASONING'
  | 'SIMPLE_TEXT_CLASSIFICATION'
  | 'DETERMINISTIC_CALCULATION'
  // Backward compatibility aliases
  | 'BACA_DENAH'
  | 'BACA_PDF_DED'
  | 'BACA_NOTA'
  | 'COMPLEX_ARCHITECTURAL_REASONING';

export interface TaskProfile {
  task: TaskRoutingType;
  requiredCapabilities: AICapability[];
  defaultQualityTier: AIQualityTier;
  preferredProviderId?: ProviderId;
  allowEscalation: boolean;
  description: string;
}

export interface AIEvidenceRequirement {
  requireSourceGrounding: boolean;
  requireCitation: boolean;
  requireBoundingBox?: boolean;
  allowedStatuses: Array<'VERIFIED' | 'DERIVED' | 'INFERRED' | 'ESTIMATED' | 'NOT_FOUND'>;
}

export interface ModelSelectionCriteria {
  task: TaskRoutingType;
  requiredCapabilities?: AICapability[];
  qualityRequirement?: AIQualityTier;
  maxCostUsd?: number;
  sourceType?: 'pdf' | 'image' | 'drawing' | 'text' | 'scanned_pdf' | 'structured';
  projectId?: string;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
  forceModelId?: string;
  forceProviderId?: ProviderId;
  preferredProvider?: ProviderId;
  evidenceRequired?: boolean;
  complexity?: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface AICostEstimate {
  providerId: ProviderId;
  modelId: string;
  qualityTier: AIQualityTier;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
  isUnknown?: boolean;
}

export interface AIExecutionUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  actualCostUsd: number;
  durationMs: number;
}

export interface SelectedModelRoute {
  providerId: ProviderId;
  modelId: string;
  qualityTier: AIQualityTier;
  keyAlias: string;
  capabilities: AICapability[];
  costEstimate: AICostEstimate;
  escalated: boolean;
  escalationReason?: string;
  pipelineStage?: 'SINGLE_SHOT' | 'EXTRACTION_ONLY' | 'REASONING_AFTER_EXTRACTION';
  reason?: string;
  capabilityMatch?: boolean;
}

export interface MultiProviderExecutionEvidence {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  page?: number;
  region?: { x: number; y: number; width: number; height: number };
  field?: string;
  extractedText?: string;
  extractedValue?: unknown;
  basis?: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'VERIFIED' | 'DERIVED' | 'INFERRED' | 'ESTIMATED' | 'NOT_FOUND';

  // Multi-Provider Attribution
  extractorProvider?: ProviderId;
  extractorModel?: string;
  reasonerProvider?: ProviderId;
  reasonerModel?: string;
  calculatorEngine?: string; // 'EZRAB_DETERMINISTIC_ENGINE'
}
