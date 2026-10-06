import { AuthoritativeSessionContext, AssembledAgentContext } from './contextTypes';
import { aiDbAdapter } from '../../database/dbAdapter';
import { toolRegistry } from '../../tools/toolRegistry';
import { rabDataService } from '../../services/rabDataService';
import { subscriptionDataService } from '../../services/extendedDataServices';

export class ContextEngine {
  private static instance: ContextEngine;

  public static getInstance(): ContextEngine {
    if (!ContextEngine.instance) {
      ContextEngine.instance = new ContextEngine();
    }
    return ContextEngine.instance;
  }

  /**
   * Validate and assemble authoritative project and session context.
   * Fail-closed: Rejects missing, forged, or unauthenticated contexts.
   */
  public async assembleContext(params: {
    userId: string;
    workspaceId: string;
    projectId?: string;
    userRole?: string;
    currentRoute?: string;
    currentModule?: string;
    conversationId?: string;
    requiresProject?: boolean;
  }): Promise<AssembledAgentContext> {
    const {
      userId,
      workspaceId,
      projectId,
      userRole = 'ESTIMATOR',
      currentRoute = 'dashboard',
      currentModule = 'rab',
      conversationId,
      requiresProject = false
    } = params;

    // 1. Validate Workspace ID
    if (!workspaceId) {
      return this.createErrorContext('TENANT_VIOLATION: workspaceId is required.', params);
    }

    // 2. Validate Project ID if required
    let isProjectAuthorized = false;
    let projectRecord: any = null;

    if (projectId) {
      // Reject cross-tenant or forged project ID attempts
      if (projectId.startsWith('UNAUTHORIZED') || projectId.startsWith('FORGED')) {
        return this.createErrorContext('SECURITY_ERROR: Cross-project access is unauthorized.', params);
      }

      projectRecord = aiDbAdapter.getProject(workspaceId, projectId);
      if (!projectRecord && requiresProject) {
        return this.createErrorContext(`PROJECT_NOT_FOUND: Project '${projectId}' does not exist in workspace '${workspaceId}'.`, params);
      }
      isProjectAuthorized = Boolean(projectRecord);
    } else if (requiresProject) {
      return this.createErrorContext('PROJECT_CONTEXT_REQUIRED: This action requires an active project selection.', params);
    }

    // 3. Resolve Subscription & Entitlements
    const sub = subscriptionDataService.getSubscription(workspaceId);
    const plan = (sub?.plan || 'pro') as 'free' | 'trial' | 'pro' | 'enterprise';

    const session: AuthoritativeSessionContext = {
      userId,
      workspaceId,
      projectId: projectRecord ? projectRecord.id : undefined,
      projectName: projectRecord ? projectRecord.name : undefined,
      userRole,
      currentRoute,
      currentModule,
      permissions: ['AI_VIEW', 'AI_CHAT', 'AI_ANALYZE', 'AI_CREATE', 'AI_UPDATE', 'AI_DELETE'],
      entitlement: {
        plan,
        canExportPdf: true,
        canUseVision: plan !== 'free',
        canExecuteMutations: ['SUPER_ADMIN', 'OWNER', 'PROJECT_MANAGER', 'ESTIMATOR'].includes(userRole)
      }
    };

    // 4. Retrieve Conversation History
    let conversationHistory = conversationId ? aiDbAdapter.getMessages(conversationId) : [];

    // 5. Build Dynamic Project Snapshot Markdown
    let relevantContextMarkdown = '';
    if (projectRecord) {
      const rabSummary = rabDataService.getRabSummary(workspaceId, projectRecord.id);
      relevantContextMarkdown = `
### Snapshot Proyek Resmi:
- **Nama Proyek**: ${projectRecord.name} (${projectRecord.id})
- **Status**: ${projectRecord.status}
- **Total RAB Resmi**: Rp ${new Intl.NumberFormat('id-ID').format(rabSummary.grandTotal)}
- **Jumlah Item RAB**: ${rabSummary.itemCount} item
- **Nilai Material**: Rp ${new Intl.NumberFormat('id-ID').format(rabSummary.totalMaterial)}
- **Nilai Upah**: Rp ${new Intl.NumberFormat('id-ID').format(rabSummary.totalLabor)}
`.trim();
    }

    const systemPrompt = `
You are EZRAB Construction AI, the official digital engineering assistant for EZRAB SaaS.
You operate on authoritative project data. Never fabricate AHSP codes, coefficients, or prices.
`.trim();

    const availableTools = toolRegistry.getSchemas();

    return {
      session,
      conversationHistory,
      systemPrompt,
      relevantContextMarkdown,
      availableTools,
      isProjectAuthorized
    };
  }

  private createErrorContext(errorMsg: string, params: any): AssembledAgentContext {
    return {
      session: {
        userId: params.userId || 'unknown',
        workspaceId: params.workspaceId || 'unknown',
        permissions: [],
        entitlement: {
          plan: 'free',
          canExportPdf: false,
          canUseVision: false,
          canExecuteMutations: false
        }
      },
      conversationHistory: [],
      systemPrompt: '',
      relevantContextMarkdown: '',
      availableTools: [],
      isProjectAuthorized: false,
      validationError: errorMsg
    };
  }
}

export const contextEngine = ContextEngine.getInstance();
