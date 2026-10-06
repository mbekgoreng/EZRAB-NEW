/**
 * EZRAB AI Core — Standard Agent Contracts, Types, and Observability Schema
 *
 * Implements Step 6 & Step 8 of the AI Agent Architecture:
 * Strict isolation, structured multi-step reasoning, controlled mutation safeguards,
 * action preview contracts, and privacy-safe observability traces.
 */

export type AgentTaskStatus =
  | 'PENDING'
  | 'PLANNING'
  | 'EXECUTING_TOOLS'
  | 'AWAITING_CONFIRMATION'
  | 'VALIDATING'
  | 'MUTATING'
  | 'COMPLETED'
  | 'REFUSED'
  | 'FAILED';

export type AgentIntentCategory =
  | 'QUERY_RAB'
  | 'MUTATE_RAB'
  | 'QUERY_QTO'
  | 'CALCULATE_QTO'
  | 'SEARCH_AHSP'
  | 'ADOPT_AHSP'
  | 'QUERY_PRICE'
  | 'OVERRIDE_PRICE'
  | 'QUERY_SCHEDULE'
  | 'AUDIT_ANOMALIES'
  | 'GENERATE_REPORT'
  | 'EXPORT_PACKAGE'
  | 'AUTOMATIC_RAB_START'
  | 'GENERAL_HELP'
  | 'SECURITY_REFUSAL';

export interface AgentTask {
  taskId: string;
  userMessage: string;
  projectId: string;
  workspaceId: string;
  userId: string;
  userRole?: string;
  currentPage: string;
  intent: AgentIntentCategory;
  complexity: 'SIMPLE' | 'COMPOUND' | 'HIGH_RISK';
  requiresTools: boolean;
  requiresExternalKnowledge: boolean;
  status: AgentTaskStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AgentIntent {
  category: AgentIntentCategory;
  confidence: number;
  extractedEntities: {
    wbsSection?: string;
    ahspCode?: string;
    volume?: number;
    unit?: string;
    unitPrice?: number;
    resourceName?: string;
    targetProjectId?: string;
    rawText?: string;
  };
  requiresConfirmation: boolean;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface AgentPlanStep {
  stepIndex: number;
  toolName: string;
  description: string;
  parameters: Record<string, any>;
  expectedOutput: string;
  dependsOnSteps?: number[];
  requiresConfirmation: boolean;
}

export interface AgentPlan {
  planId: string;
  taskId: string;
  goal: string;
  steps: AgentPlanStep[];
  dependencies: Record<string, string[]>;
  estimatedRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  requiresConfirmation: boolean;
  createdAt: string;
}

export interface AgentContext {
  workspaceId: string;
  projectId: string;
  projectName?: string;
  userId: string;
  userRole: string;
  systemPrompt: string;
  relevantContextMarkdown: string;
  activeWbsCategories: string[];
  totalRabNominal?: number;
  totalRabItemsCount?: number;
  sessionHistorySummary?: string;
}

export interface AgentToolCall {
  callId: string;
  toolName: string;
  arguments: Record<string, any>;
  timestamp: string;
  stepIndex?: number;
}

export interface AgentToolResult {
  callId: string;
  toolName: string;
  success: boolean;
  result?: any;
  error?: string;
  durationMs: number;
  dataCount?: number;
}

export interface AgentActionPreview {
  actionId: string;
  toolName: string;
  title: string;
  summary: string;
  diffSummary?: {
    field: string;
    before: any;
    after: any;
  }[];
  costImpact?: number;
  affectedItemCount?: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  requiresConfirmation: boolean;
}

export interface AgentAction {
  actionId: string;
  taskId: string;
  toolName: string;
  arguments: Record<string, any>;
  source: 'LOCAL_AI' | 'EXTERNAL_AI' | 'RULE_ENGINE' | 'USER_PROMPT';
  confidence: number;
  preview: AgentActionPreview;
  requiresConfirmation: boolean;
  validationStatus: 'PENDING' | 'VALID' | 'INVALID' | 'FLAGGED';
  executedAt?: string;
  status: 'PROPOSED' | 'CONFIRMED' | 'REJECTED' | 'EXECUTED' | 'FAILED';
}

export interface AgentValidationResult {
  isValid: boolean;
  violations: string[];
  warnings: string[];
  projectIsolationVerified: boolean;
  rolePermissionGranted: boolean;
  ahspIntegrityMaintained: boolean; // Confirms no invented fake official AHSP codes
  priceCalculationVerified: boolean; // Confirms safe decimal arithmetic
}

export interface AgentError {
  code: string;
  message: string;
  technicalDetail?: string;
  retryable: boolean;
  failedStepIndex?: number;
  timestamp: string;
}

export interface AgentExecutionResult {
  success: boolean;
  taskId: string;
  answer: string;
  actions: AgentAction[];
  toolResults: AgentToolResult[];
  provider: 'OLLAMA_LOCAL' | 'OPENAI_EXTERNAL' | 'ROUTER_EXTERNAL' | 'MOCK';
  model: string;
  confidence: number;
  escalated: boolean;
  escalationReason?: string;
  traceId: string;
  error?: AgentError;
  durationMs: number;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AgentTrace {
  traceId: string;
  taskId: string;
  projectId: string;
  workspaceId: string;
  userId: string;
  intent: string;
  selectedProvider: string;
  model: string;
  toolsCalled: string[];
  executionDurationMs: number;
  escalationReason?: string;
  validationResult: AgentValidationResult;
  mutationExecuted: boolean;
  error?: string;
  timestamp: string;
}
