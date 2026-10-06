import { ExecutionPlanStep, AgentRequest } from './agentTypes';
import { AuthoritativeSessionContext } from '../context/contextTypes';
import { toolRegistry } from '../../tools/toolRegistry';
import { actionProposalManager, ActionProposal } from '../tools/actionProposalManager';
import { knowledgeRetriever } from '../knowledge/knowledgeRetriever';
import { ProvenanceValue } from '../knowledge/knowledgeTypes';

export interface StepExecutionResult {
  stepId: string;
  success: boolean;
  toolName: string;
  result?: any;
  actionProposal?: ActionProposal;
  provenance?: Array<ProvenanceValue<any>>;
  requiresConfirmation: boolean;
  error?: string;
}

export class AgentExecutor {
  private static instance: AgentExecutor;

  public static getInstance(): AgentExecutor {
    if (!AgentExecutor.instance) {
      AgentExecutor.instance = new AgentExecutor();
    }
    return AgentExecutor.instance;
  }

  /**
   * Executes an execution plan step following the READ vs WRITE execution policy.
   */
  public async executeStep(
    step: ExecutionPlanStep,
    ctx: AuthoritativeSessionContext
  ): Promise<StepExecutionResult> {
    const provenanceList: Array<ProvenanceValue<any>> = [];

    // 1. MUTATE Step -> Create ActionProposal (Requires Confirmation)
    if (step.category === 'MUTATE' || step.requiresConfirmation) {
      let validatedAhspCode = step.arguments.ahspCode || step.arguments.code;
      let ahspVerificationNote = '';

      if (step.arguments.name && !validatedAhspCode) {
        const ahspCheck = knowledgeRetriever.resolveAhspItem(step.arguments.name);
        provenanceList.push(ahspCheck);
        if (ahspCheck.verified && ahspCheck.value) {
          validatedAhspCode = ahspCheck.value.code;
        } else {
          ahspVerificationNote = 'Item belum dipetakan ke AHSP resmi PUPR 2026. Status: Perlu Verifikasi.';
        }
      }

      const proposal = actionProposalManager.createProposal({
        toolName: step.toolName,
        projectId: ctx.projectId,
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        parameters: {
          ...step.arguments,
          code: validatedAhspCode,
          ahspCode: validatedAhspCode,
          verificationNote: ahspVerificationNote
        },
        title: `Proposal: ${step.arguments.name || step.toolName}`,
        description: `Rancangan aksi ${step.toolName} pada proyek ${ctx.projectName || ctx.projectId}`,
        riskLevel: step.toolName.includes('delete') ? 'HIGH' : 'MEDIUM'
      });

      return {
        stepId: step.id,
        success: true,
        toolName: step.toolName,
        actionProposal: proposal,
        provenance: provenanceList,
        requiresConfirmation: true
      };
    }

    // 2. READ / ANALYZE Step -> Execute Deterministically
    try {
      const execResult = await toolRegistry.executeSafe(step.toolName, step.arguments, {
        workspaceId: ctx.workspaceId,
        projectId: ctx.projectId,
        userId: ctx.userId,
        userRole: ctx.userRole
      });

      provenanceList.push({
        value: execResult.result,
        source: 'ezrab_database',
        verified: true,
        confidence: 1.0,
        sourceReference: `EZRAB Core (${step.toolName})`
      });

      return {
        stepId: step.id,
        success: true,
        toolName: step.toolName,
        result: execResult.result,
        provenance: provenanceList,
        requiresConfirmation: false
      };
    } catch (err: any) {
      return {
        stepId: step.id,
        success: false,
        toolName: step.toolName,
        error: err.message || 'Eksekusi tool gagal.',
        provenance: provenanceList,
        requiresConfirmation: false
      };
    }
  }

  /**
   * Confirms and applies an ActionProposal to the authoritative project database.
   */
  public async confirmProposal(
    proposalId: string,
    ctx: { workspaceId: string; projectId: string; userId: string; userRole?: string }
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    return actionProposalManager.executeConfirmedProposal(proposalId, ctx);
  }

  /**
   * Cancels an existing ActionProposal cleanly.
   */
  public cancelProposal(
    proposalId: string,
    ctx: { workspaceId: string; projectId: string }
  ): { success: boolean; message: string } {
    return actionProposalManager.cancelProposal(proposalId, ctx);
  }
}

export const agentExecutor = AgentExecutor.getInstance();
