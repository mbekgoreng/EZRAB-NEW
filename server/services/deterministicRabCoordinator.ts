/**
 * Phase 6.5: Deterministic RAB Coordinator
 *
 * Coordinates the full Phase 6.5 pipeline:
 * Canonical Entities -> Work Items -> Deterministic QTO -> Authoritative AHSP -> Price DB -> RAB Draft.
 * Enforces Preview Gating (No automatic database finalization without user confirmation).
 * Enforces Tenant and Project Isolation.
 */

import { CanonicalEntity } from '../../src/domain/document/canonicalEntityTypes';
import { TemplateMappingContext } from '../../src/domain/document/templateMappingTypes';
import { DeterministicRabDraftSummary } from '../../src/domain/document/deterministicRabTypes';
import { DeterministicRabDraftEngine } from './deterministicRabDraftEngine';

export interface ProcessRabDraftInput {
  projectId: string;
  projectName?: string;
  tenantId?: string;
  entities: CanonicalEntity[];
  templateContext?: TemplateMappingContext;
  ppnPercent?: number;
  allowAiEstimatedPrice?: boolean;
}

export class DeterministicRabCoordinator {
  private static instance: DeterministicRabCoordinator;
  private cache: Map<string, DeterministicRabDraftSummary> = new Map();

  private constructor() {}

  public static getInstance(): DeterministicRabCoordinator {
    if (!DeterministicRabCoordinator.instance) {
      DeterministicRabCoordinator.instance = new DeterministicRabCoordinator();
    }
    return DeterministicRabCoordinator.instance;
  }

  /**
   * Process and assemble deterministic RAB Draft.
   */
  public async processRabDraft(input: ProcessRabDraftInput): Promise<DeterministicRabDraftSummary> {
    const {
      projectId,
      projectName = 'Proyek Konstruksi',
      tenantId = 'default_tenant',
      entities,
      templateContext,
      ppnPercent = 11,
      allowAiEstimatedPrice = false
    } = input;

    const cacheKey = `${tenantId}:${projectId}`;

    const summary = DeterministicRabDraftEngine.getInstance().generateRabDraft({
      projectId,
      projectName,
      templateContext,
      entities,
      ppnPercent,
      allowAiEstimatedPrice
    });

    this.cache.set(cacheKey, summary);
    return summary;
  }

  public getCachedDraft(projectId: string, tenantId: string = 'default_tenant'): DeterministicRabDraftSummary | undefined {
    return this.cache.get(`${tenantId}:${projectId}`);
  }

  /**
   * Finalize RAB Draft after explicit human confirmation gate.
   */
  public finalizeRabDraft(projectId: string, tenantId: string = 'default_tenant'): DeterministicRabDraftSummary {
    const draft = this.getCachedDraft(projectId, tenantId);
    if (!draft) {
      throw new Error(`RAB Draft for project '${projectId}' not found in review workspace.`);
    }

    draft.isFinalized = true;
    this.cache.set(`${tenantId}:${projectId}`, draft);
    return draft;
  }

  public clearCache(tenantId?: string): void {
    if (!tenantId) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${tenantId}:`)) {
        this.cache.delete(key);
      }
    }
  }
}
