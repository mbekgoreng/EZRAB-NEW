import { toolRegistry } from '../../tools/toolRegistry';

export interface ActionProposal {
  id: string;
  action: string;
  toolName: string;
  projectId: string;
  workspaceId: string;
  userId: string;
  parameters: Record<string, any>;
  preview: {
    title: string;
    description: string;
    impactSummary: string;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    beforeState?: any;
    afterState?: any;
  };
  requiresConfirmation: boolean;
  isExecuted: boolean;
  isInvalidated: boolean;
  createdAt: string;
  expiresAt: string;
}

export class ActionProposalManager {
  private static instance: ActionProposalManager;
  private proposals: Map<string, ActionProposal> = new Map();
  private readonly defaultTtlMs = 15 * 60 * 1000; // 15 minutes

  public static getInstance(): ActionProposalManager {
    if (!ActionProposalManager.instance) {
      ActionProposalManager.instance = new ActionProposalManager();
    }
    return ActionProposalManager.instance;
  }

  /**
   * Create a structured Action Proposal bound to specific project and workspace
   */
  public createProposal(params: {
    toolName: string;
    projectId: string;
    workspaceId: string;
    userId: string;
    parameters: Record<string, any>;
    title?: string;
    description?: string;
    impactSummary?: string;
    riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  }): ActionProposal {
    const id = `prop_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();
    const toolDef = toolRegistry.get(params.toolName);

    const proposal: ActionProposal = {
      id,
      action: params.toolName,
      toolName: params.toolName,
      projectId: params.projectId,
      workspaceId: params.workspaceId,
      userId: params.userId,
      parameters: params.parameters,
      preview: {
        title: params.title || `Usulan Eksekusi: ${params.toolName}`,
        description: params.description || toolDef?.description || `Tindakan ${params.toolName}`,
        impactSummary: params.impactSummary || 'Perubahan akan diterapkan pada database proyek.',
        riskLevel: params.riskLevel || (params.toolName.includes('delete') ? 'HIGH' : 'MEDIUM')
      },
      requiresConfirmation: toolDef ? toolDef.requiresConfirmation : true,
      isExecuted: false,
      isInvalidated: false,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + this.defaultTtlMs).toISOString()
    };

    this.proposals.set(id, proposal);
    return proposal;
  }

  public getProposal(id: string): ActionProposal | undefined {
    return this.proposals.get(id);
  }

  /**
   * Invalidate proposals when project is switched or user leaves context
   */
  public invalidateProjectProposals(workspaceId: string, projectId: string): void {
    for (const prop of this.proposals.values()) {
      if (prop.workspaceId === workspaceId && prop.projectId === projectId && !prop.isExecuted) {
        prop.isInvalidated = true;
      }
    }
  }

  /**
   * Execute confirmed proposal with strict tenant & expiration validation
   */
  public async executeConfirmedProposal(
    proposalId: string,
    ctx: { workspaceId: string; projectId: string; userId: string; userRole?: string }
  ): Promise<{ success: boolean; result: any; message: string }> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      throw new Error(`Action Proposal '${proposalId}' not found.`);
    }

    if (proposal.isExecuted) {
      throw new Error(`Action Proposal '${proposalId}' has already been executed.`);
    }

    if (proposal.isInvalidated) {
      throw new Error(`Action Proposal '${proposalId}' is no longer valid due to a context switch.`);
    }

    if (new Date(proposal.expiresAt).getTime() < Date.now()) {
      throw new Error(`Action Proposal '${proposalId}' has expired.`);
    }

    // Strict Tenant and Project validation: Never execute Proposal A on Project B
    if (proposal.workspaceId !== ctx.workspaceId || proposal.projectId !== ctx.projectId) {
      throw new Error('SECURITY_ERROR: Proposal project binding mismatch. Cross-project execution forbidden.');
    }

    const toolDef = toolRegistry.get(proposal.toolName);
    if (!toolDef) {
      throw new Error(`Tool '${proposal.toolName}' is not registered.`);
    }

    // Execute through Safe Tool Execution Engine
    const execResult = await toolRegistry.executeSafe(proposal.toolName, proposal.parameters, {
      workspaceId: ctx.workspaceId,
      projectId: ctx.projectId,
      userId: ctx.userId,
      userRole: ctx.userRole || 'ESTIMATOR'
    });

    proposal.isExecuted = true;

    return {
      success: true,
      result: execResult.result,
      message: `Tindakan '${proposal.toolName}' berhasil dikonfirmasi dan diterapkan.`
    };
  }

  /**
   * Cancel an ActionProposal cleanly
   */
  public cancelProposal(
    proposalId: string,
    ctx: { workspaceId: string; projectId: string }
  ): { success: boolean; message: string } {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      throw new Error(`Action Proposal '${proposalId}' not found.`);
    }
    if (proposal.workspaceId !== ctx.workspaceId || proposal.projectId !== ctx.projectId) {
      throw new Error('SECURITY_ERROR: Proposal project binding mismatch.');
    }
    proposal.isInvalidated = true;
    return {
      success: true,
      message: `Proposal '${proposalId}' telah dibatalkan.`
    };
  }
}

export const actionProposalManager = ActionProposalManager.getInstance();

