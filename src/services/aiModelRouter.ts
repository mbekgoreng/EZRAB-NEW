/**
 * EZRAB AI Model Router for DED -> RAB Pipeline (Section 2)
 *
 * Implements the AI Model Strategy:
 * - Primary Document Reader: gemini-3.5-flash-lite (fast, low-cost, high-volume parsing).
 * - Escalation Model: gemini-3.8-flash (triggered strictly on complexity, cross-page references,
 *   conflicting dimensions, ambiguous evidence, low confidence, or validation failures).
 * - Configurable selection and budget awareness.
 */

export interface ModelRouterConfig {
  primaryReaderModel: string;
  escalationModel: string;
  escalationConfidenceThreshold: number;
  enableAutomaticEscalation: boolean;
}

export interface EscalationContext {
  pageNumber?: number;
  isComplexDrawing?: boolean;
  crossPageReferences?: boolean;
  hasConflict?: boolean;
  isAmbiguous?: boolean;
  confidence?: number;
  firstPassFailed?: boolean;
  reason?: string;
}

export interface SelectedRoute {
  model: string;
  isEscalated: boolean;
  reason: string;
}

export class AIModelRouter {
  private static instance: AIModelRouter;

  private config: ModelRouterConfig = {
    primaryReaderModel: 'gemini-3.5-flash-lite',
    escalationModel: 'gemini-3.8-flash',
    escalationConfidenceThreshold: 0.75,
    enableAutomaticEscalation: true,
  };

  private constructor() {}

  public static getInstance(): AIModelRouter {
    if (!AIModelRouter.instance) {
      AIModelRouter.instance = new AIModelRouter();
    }
    return AIModelRouter.instance;
  }

  public setConfig(newConfig: Partial<ModelRouterConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): ModelRouterConfig {
    return { ...this.config };
  }

  /**
   * Returns the primary document reader model for standard parsing
   */
  public chooseDocumentReader(): string {
    return this.config.primaryReaderModel;
  }

  /**
   * Returns the escalation model for complex reasoning
   */
  public getEscalationModel(): string {
    return this.config.escalationModel;
  }

  /**
   * Determines if a task / page / work item warrants escalation
   */
  public shouldEscalate(context: EscalationContext): boolean {
    if (!this.config.enableAutomaticEscalation) {
      return false;
    }

    if (context.hasConflict || context.isAmbiguous || context.firstPassFailed) {
      return true;
    }

    if (context.isComplexDrawing || context.crossPageReferences) {
      return true;
    }

    if (context.confidence !== undefined && context.confidence < this.config.escalationConfidenceThreshold) {
      return true;
    }

    return false;
  }

  /**
   * Routes a page extraction request with automatic or explicit escalation
   */
  public routePageExtraction(context: EscalationContext = {}): SelectedRoute {
    if (this.shouldEscalate(context)) {
      return {
        model: this.config.escalationModel,
        isEscalated: true,
        reason: context.reason || 'Escalated due to complex drawing, low confidence, or cross-page reference',
      };
    }

    return {
      model: this.config.primaryReaderModel,
      isEscalated: false,
      reason: 'Standard document reading via primary model',
    };
  }

  /**
   * Escalates a specific page for deeper multi-page / high-resolution analysis
   */
  public escalatePage(pageNumber: number, reason: string): SelectedRoute {
    return {
      model: this.config.escalationModel,
      isEscalated: true,
      reason: `Page ${pageNumber} escalated: ${reason}`,
    };
  }

  /**
   * Escalates a specific work item when dimensions or material specifications are ambiguous
   */
  public escalateWorkItem(workItemName: string, reason: string): SelectedRoute {
    return {
      model: this.config.escalationModel,
      isEscalated: true,
      reason: `Work item '${workItemName}' escalated: ${reason}`,
    };
  }
}

export const aiModelRouter = AIModelRouter.getInstance();
