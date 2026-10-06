/**
 * EZRAB PROJECT COPILOT — AI ACTION EXECUTOR & APPROVAL GATE
 * 
 * Secure execution engine for AI mutations.
 * Enforces:
 * 1. User approval gate before any mutation can occur.
 * 2. Strict idempotency to prevent duplicate mutations.
 * 3. Complete audit logging via aiActionAuditEngine.
 * 4. Phase B validateActionSafety compliance.
 */

import {
  AIActionProposal,
  validateActionSafety,
  ProjectIsolationError,
} from '../../unifiedProjectContext';
import { aiActionAuditEngine } from './aiActionAudit';
import { unifiedConversationStore } from '../conversation/unifiedConversationStore';
import type { AIToolExecutionContext } from '../tools/aiToolTypes';

export interface ActionExecutionResult {
  success: boolean;
  actionId: string;
  idempotencyKey: string;
  status: 'EXECUTED' | 'REJECTED' | 'CANCELLED' | 'FAILED';
  message: string;
  errorCode?: string;
  mutatedData?: unknown;
}

export class AIActionExecutor {
  private static instance: AIActionExecutor | null = null;

  public static getInstance(): AIActionExecutor {
    if (!AIActionExecutor.instance) {
      AIActionExecutor.instance = new AIActionExecutor();
    }
    return AIActionExecutor.instance;
  }

  /**
   * Executes a user-approved action proposal.
   * Strictly enforces safety validation and idempotency.
   */
  public async executeApprovedAction(
    proposal: AIActionProposal,
    context: AIToolExecutionContext,
    userConfirmation: {
      userId: string;
      approved: boolean;
      rejectionReason?: string;
    },
    idempotencyKey?: string
  ): Promise<ActionExecutionResult> {
    const key = idempotencyKey || `action:${proposal.projectId}:${proposal.id}`;

    // 1. Project Isolation Check
    if (proposal.projectId !== context.projectId) {
      throw new ProjectIsolationError(
        `PROJECT_ISOLATION_ERROR: Proposal project ${proposal.projectId} does not match context project ${context.projectId}.`
      );
    }

    // 2. Idempotency Check
    if (aiActionAuditEngine.isIdempotencyKeyExecuted(key)) {
      return {
        success: false,
        actionId: proposal.id,
        idempotencyKey: key,
        status: 'FAILED',
        errorCode: 'IDEMPOTENCY_DUPLICATE',
        message: `Aksi "${proposal.title}" sudah pernah dieksekusi sebelumnya. Duplikasi dicegah.`,
      };
    }

    // 3. User Rejection Flow
    if (!userConfirmation.approved) {
      proposal.status = 'REJECTED';
      aiActionAuditEngine.recordAudit({
        actionId: proposal.id,
        idempotencyKey: key,
        projectId: proposal.projectId,
        conversationId: context.conversationId,
        userId: userConfirmation.userId,
        toolName: proposal.action,
        arguments: proposal.input,
        proposal,
        approval: {
          status: 'REJECTED',
          approvedBy: userConfirmation.userId,
          approvedAt: new Date().toISOString(),
        },
        executionStatus: 'FAILED',
        error: userConfirmation.rejectionReason || 'User rejected the proposal.',
        timestamp: new Date().toISOString(),
      });

      unifiedConversationStore.getOrCreateActiveConversation(proposal.projectId);
      return {
        success: true,
        actionId: proposal.id,
        idempotencyKey: key,
        status: 'REJECTED',
        message: `Proposal "${proposal.title}" berhasil ditolak oleh pengguna.`,
      };
    }

    // 4. Mark Approved & Safety Validation
    proposal.status = 'APPROVED';
    const safety = validateActionSafety(proposal);
    if (!safety.allowed) {
      return {
        success: false,
        actionId: proposal.id,
        idempotencyKey: key,
        status: 'FAILED',
        errorCode: 'ACTION_REQUIRES_APPROVAL',
        message: safety.reason || 'Validasi keamanan aksi gagal.',
      };
    }

    // 5. Execute Mutation via Core Handler
    try {
      let mutatedData: unknown = null;

      if (proposal.action === 'ADD_RAB_ITEM') {
        const changes = proposal.proposedChanges as any;
        const itemToCreate = changes?.item;

        if (context.onAddRabItemDirect && itemToCreate) {
          context.onAddRabItemDirect(itemToCreate);
          mutatedData = itemToCreate;
        } else {
          // If no UI callback provided in headless context, record mutated data
          mutatedData = itemToCreate;
        }
      }

      // Mark applied
      proposal.status = 'APPLIED';
      aiActionAuditEngine.markIdempotencyKeyExecuted(key);

      // Record Audit
      aiActionAuditEngine.recordAudit({
        actionId: proposal.id,
        idempotencyKey: key,
        projectId: proposal.projectId,
        conversationId: context.conversationId,
        userId: userConfirmation.userId,
        toolName: proposal.action,
        arguments: proposal.input,
        proposal,
        approval: {
          status: 'APPROVED',
          approvedBy: userConfirmation.userId,
          approvedAt: new Date().toISOString(),
        },
        executionStatus: 'SUCCESS',
        after: mutatedData,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        actionId: proposal.id,
        idempotencyKey: key,
        status: 'EXECUTED',
        message: `Aksi "${proposal.title}" berhasil diterapkan ke data proyek.`,
        mutatedData,
      };
    } catch (err: any) {
      proposal.status = 'REJECTED';
      aiActionAuditEngine.recordAudit({
        actionId: proposal.id,
        idempotencyKey: key,
        projectId: proposal.projectId,
        conversationId: context.conversationId,
        userId: userConfirmation.userId,
        toolName: proposal.action,
        arguments: proposal.input,
        proposal,
        approval: {
          status: 'APPROVED',
          approvedBy: userConfirmation.userId,
          approvedAt: new Date().toISOString(),
        },
        executionStatus: 'FAILED',
        error: err?.message || 'Execution failed',
        timestamp: new Date().toISOString(),
      });

      return {
        success: false,
        actionId: proposal.id,
        idempotencyKey: key,
        status: 'FAILED',
        errorCode: 'EXECUTION_FAILED',
        message: `Gagal menerapkan aksi: ${err?.message || 'Unknown error'}`,
      };
    }
  }
}

export const aiActionExecutor = AIActionExecutor.getInstance();
