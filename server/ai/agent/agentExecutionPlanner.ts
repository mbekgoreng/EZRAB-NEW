import { ClassifiedIntentResult, ExtractedEntities, IntentCategory } from '../intent/intentTypes';
import { AuthoritativeSessionContext } from '../context/contextTypes';
import { ExecutionPlan, ExecutionPlanStep } from './agentTypes';
import { toolRegistry } from '../../tools/toolRegistry';

export class AgentExecutionPlanner {
  private static instance: AgentExecutionPlanner;

  public static getInstance(): AgentExecutionPlanner {
    if (!AgentExecutionPlanner.instance) {
      AgentExecutionPlanner.instance = new AgentExecutionPlanner();
    }
    return AgentExecutionPlanner.instance;
  }

  /**
   * Builds an explicit, deterministic ExecutionPlan for the given intent and context.
   */
  public plan(
    intentResult: ClassifiedIntentResult,
    ctx: AuthoritativeSessionContext
  ): ExecutionPlan {
    const { intent, entities, suggestedTool, isMutatingAction } = intentResult;
    const steps: ExecutionPlanStep[] = [];
    const dependencies: Record<string, string[]> = {};
    const warnings: string[] = [];

    // Map intent to primary tool name
    let primaryTool = suggestedTool;
    if (!primaryTool) {
      primaryTool = this.resolveToolFromIntent(intent);
    }

    if (!primaryTool) {
      return {
        intent,
        steps: [],
        dependencies: {},
        warnings: ['Tidak ada tool deterministik yang diperlukan untuk intent ini.'],
        requiresConfirmation: false,
        isMultiStep: false
      };
    }

    const toolDef = toolRegistry.get(primaryTool);
    const category = toolDef?.category || (isMutatingAction ? 'MUTATE' : 'READ');
    const requiresConfirmation = Boolean(toolDef?.requiresConfirmation || category === 'MUTATE' || isMutatingAction);

    // Validate required arguments based on intent
    const resolvedArgs: Record<string, any> = {
      projectId: ctx.projectId,
      ...entities
    };

    if (intent === 'RAB_ITEM_CREATE') {
      if (!entities.volume && !entities.length) {
        warnings.push('Volume pekerjaan belum ditentukan secara spesifik.');
      }
      resolvedArgs.name = entities.workItem || 'Pekerjaan Tambahan';
      resolvedArgs.volume = entities.volume || 1;
      resolvedArgs.unit = entities.unit || 'm2';
      resolvedArgs.unitPrice = entities.price || 0;
      resolvedArgs.category = entities.category || 'Pekerjaan Struktur';
    }

    if (intent === 'QTO_CALCULATE') {
      resolvedArgs.element = entities.workItem || entities.material || 'volume_struktur';
      resolvedArgs.length = entities.length || 0;
      resolvedArgs.width = entities.width || 0;
      resolvedArgs.height = entities.height || 0;
    }

    if (intent === 'PRICE_SEARCH' || intent === 'MATERIAL_SEARCH' || intent === 'AHSP_SEARCH') {
      resolvedArgs.query = entities.material || entities.workItem || entities.searchKeyword || intentResult.rawQuery;
    }

    const step1: ExecutionPlanStep = {
      id: `step_${Date.now()}_1`,
      stepNumber: 1,
      toolName: primaryTool,
      category,
      description: toolDef?.description || `Eksekusi aksi ${primaryTool}`,
      arguments: resolvedArgs,
      requiresConfirmation,
      status: 'PENDING'
    };

    steps.push(step1);

    return {
      intent,
      steps,
      dependencies,
      warnings,
      requiresConfirmation,
      estimatedCostImpact: (resolvedArgs.volume || 0) * (resolvedArgs.unitPrice || 0),
      isMultiStep: false
    };
  }

  private resolveToolFromIntent(intent: IntentCategory): string | undefined {
    switch (intent) {
      case 'RAB_TOTAL':
        return 'get_rab_summary';
      case 'RAB_ITEM_SEARCH':
        return 'search_rab_items';
      case 'RAB_ITEM_CREATE':
        return 'create_rab_item';
      case 'RAB_ITEM_UPDATE':
        return 'update_rab_item';
      case 'RAB_ITEM_DELETE':
        return 'delete_rab_item';
      case 'RAB_VALIDATE':
        return 'audit_rab';
      case 'RAB_RECALCULATE':
        return 'recalculate_rab';
      case 'QTO_CALCULATE':
        return 'calculate_volume';
      case 'QTO_QUERY':
        return 'get_qto';
      case 'AHSP_SEARCH':
        return 'search_ahsp';
      case 'AHSP_DETAIL':
        return 'get_ahsp_detail';
      case 'PRICE_SEARCH':
      case 'MATERIAL_SEARCH':
        return 'search_material_price';
      case 'LABOR_PRICE_SEARCH':
        return 'search_labor_price';
      case 'EQUIPMENT_PRICE_SEARCH':
        return 'search_equipment_price';
      case 'PROJECT_INFO':
        return 'get_project';
      case 'PROJECT_LIST':
        return 'list_projects';
      case 'PROJECT_CREATE':
        return 'create_project';
      case 'S_CURVE_QUERY':
      case 'SCHEDULE_QUERY':
        return 'get_project_progress';
      case 'PROJECT_REPORT':
        return 'create_project_report';
      default:
        return undefined;
    }
  }
}

export const agentExecutionPlanner = AgentExecutionPlanner.getInstance();
