/**
 * EZRAB PROJECT COPILOT — AI TOOL REGISTRY TYPES
 * 
 * Strict contracts for tool definitions, permission tiers, schema validation,
 * and deterministic execution.
 */

import type { AIActionProposal, UnifiedProjectContext } from '../../unifiedProjectContext';
import type { RabItem, Project } from '../../../types';

export type AIToolCategory =
  | 'project'
  | 'rab'
  | 'volume'
  | 'ahsp'
  | 'material'
  | 'price'
  | 'ded'
  | 'document'
  | 'schedule'
  | 'finance'
  | 'calculation'
  | 'report'
  | 'export';

export type AIToolMode = 'information' | 'suggestion' | 'action';

export interface AIToolValidationResult {
  valid: boolean;
  errors?: string[];
}

export interface AIToolSchema<T = unknown> {
  validate: (input: unknown) => AIToolValidationResult;
  describe?: () => Record<string, unknown>;
}

export interface AIToolExecutionContext {
  projectId: string;
  conversationId: string;
  userId?: string;
  organizationId?: string;
  project?: Project | null;
  rabItems?: RabItem[];
  unifiedContext?: UnifiedProjectContext;
  onAddRabItemDirect?: (item: any) => void;
  metadata?: Record<string, unknown>;
}

export interface AIToolExecutionSuccess<T = unknown> {
  success: true;
  result: T;
  proposal?: AIActionProposal;
  provenance: {
    source: string;
    sourceType: string;
    timestamp: string;
  };
}

export interface AIToolExecutionError {
  success: false;
  errorCode:
    | 'PROJECT_NOT_FOUND'
    | 'PROJECT_ISOLATION_ERROR'
    | 'PERMISSION_DENIED'
    | 'TOOL_NOT_FOUND'
    | 'INVALID_ARGUMENT'
    | 'PRICE_NOT_FOUND'
    | 'AHSP_NOT_FOUND'
    | 'DOCUMENT_INCOMPLETE'
    | 'PROVIDER_ERROR'
    | 'CALCULATION_ERROR'
    | 'ACTION_REQUIRES_APPROVAL'
    | 'EXECUTION_FAILED'
    | 'ROGUE_AHSP_REJECTED'
    | 'IDEMPOTENCY_DUPLICATE';
  message: string;
  retryable?: boolean;
  details?: unknown;
}

export type AIToolExecutionResponse<T = unknown> =
  | AIToolExecutionSuccess<T>
  | AIToolExecutionError;

export interface AIToolDefinition<TInput = any, TOutput = any> {
  name: string;
  description: string;
  category: AIToolCategory;
  mode: AIToolMode;
  requiresApproval: boolean;
  mutation: boolean;
  schema?: AIToolSchema<TInput>;
  execute: (input: TInput, context: AIToolExecutionContext) => Promise<AIToolExecutionResponse<TOutput>>;
}
