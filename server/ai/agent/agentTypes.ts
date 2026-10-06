import { ClassifiedIntentResult, ExtractedEntities, IntentCategory } from '../intent/intentTypes';
import { AuthoritativeSessionContext } from '../context/contextTypes';
import { ActionProposal } from '../tools/actionProposalManager';
import { ProvenanceValue } from '../knowledge/knowledgeTypes';

export type AgentExecutionState =
  | 'RECEIVED'
  | 'CLASSIFIED'
  | 'CONTEXT_RESOLVED'
  | 'PLANNED'
  | 'WAITING_CONFIRMATION'
  | 'EXECUTING'
  | 'VALIDATING'
  | 'COMPLETED'
  | 'CLASSIFICATION_FAILED'
  | 'CONTEXT_FAILED'
  | 'PERMISSION_DENIED'
  | 'INVALID_ARGUMENTS'
  | 'TOOL_FAILED'
  | 'VALIDATION_FAILED'
  | 'CANCELLED'
  | 'TIMEOUT';

export interface AgentRequest {
  requestId: string;
  userId: string;
  workspaceId: string;
  projectId?: string;
  userRole?: string;
  message: string;
  currentPage?: string;
  module?: string;
  conversationId?: string;
  attachments?: Array<{ id: string; name: string; type: string; url?: string }>;
  clientMessageId?: string;
  idempotencyKey?: string;
}

export interface ExecutionPlanStep {
  id: string;
  stepNumber: number;
  toolName: string;
  category: 'READ' | 'ANALYZE' | 'MUTATE';
  description: string;
  arguments: Record<string, any>;
  requiresConfirmation: boolean;
  status: 'PENDING' | 'WAITING_CONFIRMATION' | 'EXECUTING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
  result?: any;
  error?: string;
}

export interface ExecutionPlan {
  intent: IntentCategory;
  steps: ExecutionPlanStep[];
  dependencies: Record<string, string[]>;
  warnings: string[];
  requiresConfirmation: boolean;
  estimatedCostImpact?: number;
  isMultiStep: boolean;
}

export interface AgentTraceRecord {
  traceId: string;
  requestId: string;
  userId: string;
  workspaceId: string;
  projectId?: string;
  intent: IntentCategory;
  state: AgentExecutionState;
  selectedProvider: 'ezrab_core' | 'local_ai' | 'hermes' | 'external' | 'none';
  model?: string;
  toolsSelected: string[];
  executionPlan?: ExecutionPlan;
  actionProposalId?: string;
  durationMs: number;
  sources: string[];
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  timestamp: string;
}

export interface AgentResponse {
  success: boolean;
  requestId: string;
  traceId: string;
  conversationId: string;
  state: AgentExecutionState;
  intent: IntentCategory;
  answer: string;
  provider: 'ezrab_core' | 'local_ai' | 'hermes' | 'external' | 'none';
  model?: string | null;
  toolCallsExecuted: Array<{ toolName: string; result: any; durationMs?: number }>;
  actionProposal?: ActionProposal | null;
  provenance: Array<ProvenanceValue<any>>;
  requiresConfirmation: boolean;
  warnings: string[];
  followUpSuggestions?: string[];
  clarificationOptions?: string[];
  meta: {
    durationMs: number;
    sources: string[];
    isDeterministic: boolean;
    projectIsolated: boolean;
  };
}
