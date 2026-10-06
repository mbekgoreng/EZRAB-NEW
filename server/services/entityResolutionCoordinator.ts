/**
 * Entity Resolution Coordinator (Phase 6.3)
 *
 * Coordinates the full pipeline from Drawing Graph & Evidence to
 * Canonical Entities and Canonical Work Items with Strict Tenant Isolation.
 */

import {
  EntityResolutionSummary,
  CanonicalEntity,
  CanonicalWorkItem
} from '../../src/domain/document/canonicalEntityTypes';
import { DocumentSetService } from './documentSetService';
import { DrawingIntelligenceService } from './drawingIntelligenceService';
import { DocumentSecurityGuard } from '../security/documentSecurityGuard';
import { EntityResolutionEngine } from './entityResolutionEngine';
import { CanonicalWorkItemBuilder } from './canonicalWorkItemBuilder';

export class EntityResolutionCoordinator {
  private static instance: EntityResolutionCoordinator;
  private docSetService: DocumentSetService;
  private drawingIntelService: DrawingIntelligenceService;
  private securityGuard: DocumentSecurityGuard;
  private resolutionEngine: EntityResolutionEngine;
  private workItemBuilder: CanonicalWorkItemBuilder;

  // Cache
  private summaryStore = new Map<string, EntityResolutionSummary>();

  private constructor() {
    this.docSetService = DocumentSetService.getInstance();
    this.drawingIntelService = DrawingIntelligenceService.getInstance();
    this.securityGuard = DocumentSecurityGuard.getInstance();
    this.resolutionEngine = EntityResolutionEngine.getInstance();
    this.workItemBuilder = CanonicalWorkItemBuilder.getInstance();
  }

  public static getInstance(): EntityResolutionCoordinator {
    if (!EntityResolutionCoordinator.instance) {
      EntityResolutionCoordinator.instance = new EntityResolutionCoordinator();
    }
    return EntityResolutionCoordinator.instance;
  }

  /**
   * Run full Entity Resolution & Anti-Duplicate analysis on a Document Set
   */
  public async resolveDocumentSetEntities(params: {
    workspaceId: string;
    projectId: string;
    documentSetId: string;
  }): Promise<EntityResolutionSummary> {
    const { workspaceId, projectId, documentSetId } = params;

    // 1. Tenant security validation
    this.securityGuard.validateTenantAccess({ projectId, workspaceId });

    const cacheKey = `${workspaceId}_${projectId}_${documentSetId}`;
    if (this.summaryStore.has(cacheKey)) {
      return this.summaryStore.get(cacheKey)!;
    }

    // 2. Fetch DocumentSet and DrawingGraph
    const docSet = this.docSetService.getDocumentSet({ workspaceId, projectId, documentSetId });
    if (!docSet || docSet.projectId !== projectId || docSet.workspaceId !== workspaceId) {
      throw new Error(`DocumentSet ${documentSetId} not found or access denied.`);
    }

    const graph = await this.drawingIntelService.getOrGenerateDrawingGraph({
      workspaceId,
      projectId,
      documentSetId
    });

    // 3. Resolve Canonical Entities
    const summary = this.resolutionEngine.resolveEntities(graph, docSet);

    // 4. Build Canonical Work Items (strictly from canonical entities)
    summary.workItems = this.workItemBuilder.buildWorkItemsFromEntities(
      summary.entities,
      projectId
    );

    this.summaryStore.set(cacheKey, summary);
    return summary;
  }

  /**
   * Resolve an entity conflict with human audit feedback
   */
  public async resolveEntityConflict(params: {
    workspaceId: string;
    projectId: string;
    documentSetId: string;
    entityId: string;
    selectedQuantity: number;
    auditNotes: string;
  }): Promise<CanonicalEntity> {
    const { workspaceId, projectId, documentSetId, entityId, selectedQuantity, auditNotes } = params;
    const summary = await this.resolveDocumentSetEntities({ workspaceId, projectId, documentSetId });

    const entity = summary.entities.find(e => e.entityId === entityId);
    if (!entity) {
      throw new Error(`Entity ${entityId} not found.`);
    }

    entity.canonicalQuantity.quantity = selectedQuantity;
    entity.canonicalQuantity.source = `Human Resolution: ${auditNotes}`;
    entity.canonicalQuantity.isDeduplicated = true;
    entity.resolutionStatus = 'SAME_ENTITY';
    entity.conflictDescription = undefined;

    // Rebuild work items
    summary.workItems = this.workItemBuilder.buildWorkItemsFromEntities(
      summary.entities,
      projectId
    );

    return entity;
  }

  /**
   * Clear store for tests
   */
  public clearStore(): void {
    this.summaryStore.clear();
  }
}
