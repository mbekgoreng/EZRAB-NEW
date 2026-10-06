/**
 * EZRAB AI Cost-Aware Router & Budget Guard (Phase 9.3)
 *
 * Implements the CHEAP-FIRST POLICY:
 * "EZRAB must use the CHEAPEST SUITABLE AI MODEL for each task, NOT automatically use the strongest model."
 *
 * Enforces:
 * 1. Capability Compatibility (Strict: e.g. Vision requirement rejects text-only models like Atria/Mercury regardless of price).
 * 2. Quality Requirement (Tier matching & controlled escalation).
 * 3. Health & Key Pool availability (No cooldown, under budget).
 * 4. Cost minimization among compatible models.
 * 5. Budget Guards (MAX_AI_COST_PER_REQUEST / MAX_AI_COST_PER_TASK / MAX_AI_COST_PER_DAY / MAX_AI_COST_PER_PROJECT).
 */

import {
  AICapability,
  AIModelDefinition,
  AIQualityTier,
  ModelSelectionCriteria,
  SelectedModelRoute,
  AICostEstimate,
  TaskRoutingType,
  ProviderId,
} from './aiProviderTypes';
import { aiProviderRegistry } from './aiProviderRegistry';

const TIER_ORDER: Record<AIQualityTier, number> = {
  ULTRA_CHEAP: 1,
  CHEAP: 2,
  BALANCED: 3,
  PREMIUM: 4,
  FRONTIER: 5,
};

export interface BudgetGuardConfig {
  maxCostPerRequestUsd: number;
  maxCostPerTaskUsd: number;
  maxCostPerDayUsd: number;
  maxCostPerProjectUsd: number;
}

export class AICostRouter {
  private static instance: AICostRouter;

  private budgetConfig: BudgetGuardConfig = {
    maxCostPerRequestUsd: 0.50, // Default max 50 cents per single request
    maxCostPerTaskUsd: 1.00,
    maxCostPerDayUsd: 10.00,
    maxCostPerProjectUsd: 50.00,
  };

  private projectUsageTracker: Map<string, number> = new Map();
  private dailyUsageTracker: { date: string; amount: number } = {
    date: new Date().toISOString().slice(0, 10),
    amount: 0,
  };

  private constructor() {}

  public static getInstance(): AICostRouter {
    if (!AICostRouter.instance) {
      AICostRouter.instance = new AICostRouter();
    }
    return AICostRouter.instance;
  }

  public setBudgetConfig(config: Partial<BudgetGuardConfig>): void {
    this.budgetConfig = { ...this.budgetConfig, ...config };
  }

  public getBudgetConfig(): BudgetGuardConfig {
    return { ...this.budgetConfig };
  }

  /**
   * Estimates cost for a specific model based on input and output tokens.
   */
  public estimateModelCost(
    model: AIModelDefinition,
    inputTokens = 1500,
    outputTokens = 500
  ): AICostEstimate {
    if (model.inputCostPerMillion === undefined || model.outputCostPerMillion === undefined) {
      return {
        providerId: model.providerId,
        modelId: model.id,
        qualityTier: model.qualityTier,
        estimatedInputTokens: inputTokens,
        estimatedOutputTokens: outputTokens,
        estimatedCostUsd: 0.0,
        isUnknown: true,
      };
    }

    const inputCost = (inputTokens / 1_000_000) * model.inputCostPerMillion;
    const outputCost = (outputTokens / 1_000_000) * model.outputCostPerMillion;
    const totalCost = Number((inputCost + outputCost).toFixed(6));

    return {
      providerId: model.providerId,
      modelId: model.id,
      qualityTier: model.qualityTier,
      estimatedInputTokens: inputTokens,
      estimatedOutputTokens: outputTokens,
      estimatedCostUsd: totalCost,
      isUnknown: false,
    };
  }

  /**
   * Determines required capabilities based on task and source type.
   */
  public resolveRequiredCapabilities(criteria: ModelSelectionCriteria): AICapability[] {
    const profile = aiProviderRegistry.getTaskProfile(criteria.task);
    const caps = new Set<AICapability>(profile.requiredCapabilities);

    if (criteria.requiredCapabilities) {
      criteria.requiredCapabilities.forEach((c) => caps.add(c));
    }

    if (criteria.sourceType === 'image' || criteria.sourceType === 'drawing') {
      caps.add('VISION');
      caps.add('IMAGE');
    } else if (criteria.sourceType === 'scanned_pdf') {
      caps.add('VISION');
      caps.add('OCR');
    } else if (criteria.sourceType === 'pdf') {
      caps.add('PDF');
    }

    return Array.from(caps);
  }

  /**
   * Evaluates if a model satisfies all required capabilities.
   */
  public isModelCapable(model: AIModelDefinition, requiredCaps: AICapability[]): boolean {
    return requiredCaps.every((cap) => model.capabilities.includes(cap));
  }

  /**
   * Check budget limits before execution.
   */
  public checkBudgetGuard(
    estimatedCostUsd: number,
    projectId?: string
  ): { allowed: boolean; reason?: string } {
    // 1. Single Request Guard
    if (estimatedCostUsd > this.budgetConfig.maxCostPerRequestUsd) {
      return {
        allowed: false,
        reason: `COST_LIMIT_REACHED: Estimasi biaya ($${estimatedCostUsd}) melebihi batas per permintaan ($${this.budgetConfig.maxCostPerRequestUsd}).`,
      };
    }

    // 2. Task Guard
    if (estimatedCostUsd > this.budgetConfig.maxCostPerTaskUsd) {
      return {
        allowed: false,
        reason: `COST_LIMIT_REACHED: Estimasi biaya ($${estimatedCostUsd}) melebihi batas per tugas ($${this.budgetConfig.maxCostPerTaskUsd}).`,
      };
    }

    // 3. Daily Guard
    const today = new Date().toISOString().slice(0, 10);
    if (this.dailyUsageTracker.date !== today) {
      this.dailyUsageTracker = { date: today, amount: 0 };
    }
    if (this.dailyUsageTracker.amount + estimatedCostUsd > this.budgetConfig.maxCostPerDayUsd) {
      return {
        allowed: false,
        reason: `COST_LIMIT_REACHED: Penggunaan harian ($${this.dailyUsageTracker.amount}) melebihi kuota harian ($${this.budgetConfig.maxCostPerDayUsd}).`,
      };
    }

    // 4. Project Guard
    if (projectId) {
      const currentProjectSpend = this.projectUsageTracker.get(projectId) || 0;
      if (currentProjectSpend + estimatedCostUsd > this.budgetConfig.maxCostPerProjectUsd) {
        return {
          allowed: false,
          reason: `COST_LIMIT_REACHED: Penggunaan proyek '${projectId}' ($${currentProjectSpend}) melebihi pagu anggaran proyek ($${this.budgetConfig.maxCostPerProjectUsd}).`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Records usage for project and daily budget tracking.
   */
  public recordUsage(actualCostUsd: number, projectId?: string): void {
    const today = new Date().toISOString().slice(0, 10);
    if (this.dailyUsageTracker.date !== today) {
      this.dailyUsageTracker = { date: today, amount: 0 };
    }
    this.dailyUsageTracker.amount += actualCostUsd;

    if (projectId) {
      const current = this.projectUsageTracker.get(projectId) || 0;
      this.projectUsageTracker.set(projectId, current + actualCostUsd);
    }
  }

  /**
   * CORE OPTIMIZER: Selects the CHEAPEST suitable model that satisfies all capability and quality requirements.
   *
   * Selection Priority:
   * 1. Capability compatibility (Strict: text-only models rejected for vision tasks).
   * 2. Source correctness & evidence requirements.
   * 3. Quality requirement.
   * 4. Provider availability (Key pool with active non-cooldown key).
   * 5. Cost minimization among compatible candidates.
   */
  public selectBestModel(criteria: ModelSelectionCriteria): SelectedModelRoute {
    const profile = aiProviderRegistry.getTaskProfile(criteria.task);
    const requiredCaps = this.resolveRequiredCapabilities(criteria);
    const targetTier = criteria.qualityRequirement || profile.defaultQualityTier;
    const minTierValue = TIER_ORDER[targetTier] || 1;

    const inputTokens = criteria.estimatedInputTokens || 1500;
    const outputTokens = criteria.estimatedOutputTokens || 500;

    // Filter all enabled models from enabled providers
    const allProviders = aiProviderRegistry.getAllProviders().filter((p) => p.enabled);
    const candidateModels: Array<{
      model: AIModelDefinition;
      costEstimate: AICostEstimate;
      keyAlias: string;
      tierValue: number;
    }> = [];

    for (const provider of allProviders) {
      // If forced provider is specified, filter strictly
      if (criteria.forceProviderId && provider.id !== criteria.forceProviderId) {
        continue;
      }

      for (const model of provider.models) {
        if (!model.enabled) continue;

        // If forced model is specified, match strictly
        if (criteria.forceModelId && model.id !== criteria.forceModelId) {
          continue;
        }

        // 1. CAPABILITY CHECK (Strict Rule: NO CAPABILITY -> REJECT)
        if (!this.isModelCapable(model, requiredCaps)) {
          continue;
        }

        // 2. QUALITY TIER CHECK (Must meet or exceed minimum required tier)
        const modelTierValue = TIER_ORDER[model.qualityTier] || 1;
        if (modelTierValue < minTierValue) {
          continue;
        }

        // 3. KEY POOL AVAILABILITY CHECK
        const costEstimate = this.estimateModelCost(model, inputTokens, outputTokens);
        const key = aiProviderRegistry.selectAvailableKey(provider.id, costEstimate.estimatedCostUsd);
        if (!key) {
          // Provider/Key is on cooldown or budget exceeded
          continue;
        }

        // 4. MAX COST CEILING CHECK (if specified by caller)
        if (criteria.maxCostUsd && costEstimate.estimatedCostUsd > criteria.maxCostUsd) {
          continue;
        }

        candidateModels.push({
          model,
          costEstimate,
          keyAlias: key.id,
          tierValue: modelTierValue,
        });
      }
    }

    if (candidateModels.length === 0) {
      throw new Error(
        `AI_NO_SUITABLE_MODEL: Tidak ada model AI yang memenuhi kapabilitas [${requiredCaps.join(
          ', '
        )}] dan tier [${targetTier}] dengan provider yang aktif.`
      );
    }

    // 5. SORT BY CHEAPEST SUITABLE MODEL FIRST
    // Sort Priority:
    // A. Preferred provider match (if specified in criteria or task profile)
    // B. Lowest adequate quality tier first (don't jump to FRONTIER if CHEAP satisfies requirement)
    // C. Lowest total estimated cost
    const preferredProvider = criteria.preferredProvider || profile.preferredProviderId;

    candidateModels.sort((a, b) => {
      // Match lowest adequate quality tier first
      if (a.tierValue !== b.tierValue) {
        return a.tierValue - b.tierValue;
      }
      // If same tier, pick strictly cheapest cost
      if (a.costEstimate.estimatedCostUsd !== b.costEstimate.estimatedCostUsd) {
        return a.costEstimate.estimatedCostUsd - b.costEstimate.estimatedCostUsd;
      }
      // Preferred provider preference
      if (preferredProvider) {
        if (a.model.providerId === preferredProvider && b.model.providerId !== preferredProvider) {
          return -1;
        }
        if (b.model.providerId === preferredProvider && a.model.providerId !== preferredProvider) {
          return 1;
        }
      }
      return 0;
    });

    const chosen = candidateModels[0];

    // Budget Guard Check
    const budgetCheck = this.checkBudgetGuard(chosen.costEstimate.estimatedCostUsd, criteria.projectId);
    if (!budgetCheck.allowed) {
      throw new Error(budgetCheck.reason || 'COST_LIMIT_REACHED');
    }

    const isEscalated = chosen.tierValue > minTierValue;

    return {
      providerId: chosen.model.providerId,
      modelId: chosen.model.id,
      qualityTier: chosen.model.qualityTier,
      keyAlias: chosen.keyAlias,
      capabilities: chosen.model.capabilities,
      costEstimate: chosen.costEstimate,
      escalated: isEscalated,
      escalationReason: isEscalated ? `Tier elevated to meet required capabilities [${requiredCaps.join(', ')}]` : undefined,
      pipelineStage: 'SINGLE_SHOT',
      reason: `Selected cheapest suitable model ${chosen.model.id} for task ${criteria.task} with quality tier ${chosen.model.qualityTier}`,
      capabilityMatch: true,
    };
  }
}

export const aiCostRouter = AICostRouter.getInstance();
