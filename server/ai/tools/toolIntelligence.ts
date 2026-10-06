import { ClassifiedIntentResult } from '../intent/intentTypes';
import { toolRegistry, ToolDefinition } from '../../tools/toolRegistry';
import { actionProposalManager, ActionProposal } from './actionProposalManager';
import { knowledgeRetriever } from '../knowledge/knowledgeRetriever';

export interface ToolDecisionResult {
  toolName?: string;
  isMutating: boolean;
  requiresConfirmation: boolean;
  canExecuteDirectly: boolean;
  actionProposal?: ActionProposal;
  directExecutionResult?: any;
  explanation: string;
}

export class ToolIntelligence {
  private static instance: ToolIntelligence;

  public static getInstance(): ToolIntelligence {
    if (!ToolIntelligence.instance) {
      ToolIntelligence.instance = new ToolIntelligence();
    }
    return ToolIntelligence.instance;
  }

  /**
   * Evaluates classified intent and entities to choose the optimal safe tool.
   * Enforces READ vs WRITE policies and ActionProposal generation.
   */
  public async evaluateAndDispatch(
    intentResult: ClassifiedIntentResult,
    ctx: { workspaceId: string; projectId: string; userId: string; userRole?: string }
  ): Promise<ToolDecisionResult> {
    const { intent, entities, suggestedTool } = intentResult;

    // Mapping intent to authoritative tool name
    let toolName = suggestedTool;
    if (!toolName) {
      switch (intent) {
        case 'RAB_TOTAL':
          toolName = 'get_rab_total';
          break;
        case 'QTO_CALCULATE':
          toolName = 'calculate_volume';
          break;
        case 'AHSP_SEARCH':
          toolName = 'search_ahsp';
          break;
        case 'RAB_ITEM_CREATE':
          toolName = 'create_rab_item';
          break;
        case 'RAB_ITEM_UPDATE':
          toolName = 'update_rab_item';
          break;
        case 'RAB_ITEM_DELETE':
          toolName = 'delete_rab_item';
          break;
        case 'RAB_VALIDATE':
          toolName = 'validate_rab';
          break;
        case 'S_CURVE_QUERY':
          toolName = 'get_kurva_s';
          break;
        case 'PROJECT_INFO':
          toolName = 'get_project';
          break;
        case 'PROJECT_LIST':
          toolName = 'list_projects';
          break;
        default:
          break;
      }
    }

    if (!toolName) {
      return {
        isMutating: false,
        requiresConfirmation: false,
        canExecuteDirectly: false,
        explanation: 'Tidak ada tool khusus yang diperlukan untuk permintaan ini.'
      };
    }

    const toolDef = toolRegistry.get(toolName);
    if (!toolDef) {
      return {
        isMutating: false,
        requiresConfirmation: false,
        canExecuteDirectly: false,
        explanation: `Tool '${toolName}' belum terdaftar dalam registry.`
      };
    }

    // 1. MUTATING (WRITE / DELETE) TOOLS -> Generate ActionProposal (Confirmation Required)
    if (toolDef.requiresConfirmation || toolDef.category === 'MUTATE' || intentResult.isMutatingAction) {
      // Validate AHSP safety for item creation
      let validatedAhspCode = entities.ahspCode;
      let ahspVerificationNote = '';

      if (entities.workItem && !validatedAhspCode) {
        const ahspCheck = knowledgeRetriever.resolveAhspItem(entities.workItem);
        if (ahspCheck.verified && ahspCheck.value) {
          validatedAhspCode = ahspCheck.value.code;
        } else {
          ahspVerificationNote = 'Item belum terhubung ke AHSP baku PUPR. Disimpan sebagai estimasi awal (Perlu Verifikasi).';
        }
      }

      const proposalParams = {
        name: entities.workItem || 'Pekerjaan Baru',
        volume: entities.volume || 1,
        unit: entities.unit || 'ls',
        unitPrice: entities.price || 0,
        code: validatedAhspCode,
        category: entities.category || 'PEKERJAAN STRUKTUR',
        verificationNote: ahspVerificationNote
      };

      const proposal = actionProposalManager.createProposal({
        toolName,
        projectId: ctx.projectId,
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        parameters: proposalParams,
        title: `Rancangan: ${proposalParams.name}`,
        description: `Penambahan item ${proposalParams.name} (${proposalParams.volume} ${proposalParams.unit}) ke RAB proyek.`,
        riskLevel: toolName.includes('delete') ? 'HIGH' : 'MEDIUM'
      });

      return {
        toolName,
        isMutating: true,
        requiresConfirmation: true,
        canExecuteDirectly: false,
        actionProposal: proposal,
        explanation: `Aksi '${toolName}' memerlukan konfirmasi sebelum mengubah data proyek.`
      };
    }

    // 2. READ / ANALYZE TOOLS -> Execute Directly through Safe Execution Engine
    try {
      const execResult = await toolRegistry.executeSafe(toolName, { projectId: ctx.projectId, ...entities }, {
        workspaceId: ctx.workspaceId,
        projectId: ctx.projectId,
        userId: ctx.userId,
        userRole: ctx.userRole || 'ESTIMATOR'
      });

      return {
        toolName,
        isMutating: false,
        requiresConfirmation: false,
        canExecuteDirectly: true,
        directExecutionResult: execResult.result,
        explanation: `Tool '${toolName}' berhasil dieksekusi secara deterministik.`
      };
    } catch (err: any) {
      return {
        toolName,
        isMutating: false,
        requiresConfirmation: false,
        canExecuteDirectly: false,
        explanation: `Eksekusi tool gagal: ${err.message}`
      };
    }
  }
}

export const toolIntelligence = ToolIntelligence.getInstance();
