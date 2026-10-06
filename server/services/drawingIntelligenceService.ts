/**
 * Drawing Intelligence Service (Phase 6.2)
 *
 * Coordinates Drawing Graph generation, Multi-Document context synthesis,
 * Cross-Reference navigation, and Human-in-the-loop Conflict Resolution.
 *
 * Core Principle:
 * Page != Entity | Page != Work Item | Page != RAB
 * Strict Tenant Isolation & Zero Silent Mutation.
 */

import {
  DrawingGraph,
  MultiDocumentContext,
  CrossReferenceEvidence,
  DrawingConflictCandidate,
  DrawingDisciplineType
} from '../../src/domain/document/drawingGraphTypes';
import { DocumentSetService } from './documentSetService';
import { DocumentSecurityGuard } from '../security/documentSecurityGuard';
import { DrawingGraphBuilder } from './drawingGraphBuilder';

export class DrawingIntelligenceService {
  private static instance: DrawingIntelligenceService;
  private docSetService: DocumentSetService;
  private securityGuard: DocumentSecurityGuard;
  private graphBuilder: DrawingGraphBuilder;

  // In-memory Graph Cache
  private graphStore = new Map<string, DrawingGraph>();

  private constructor() {
    this.docSetService = DocumentSetService.getInstance();
    this.securityGuard = DocumentSecurityGuard.getInstance();
    this.graphBuilder = DrawingGraphBuilder.getInstance();
  }

  public static getInstance(): DrawingIntelligenceService {
    if (!DrawingIntelligenceService.instance) {
      DrawingIntelligenceService.instance = new DrawingIntelligenceService();
    }
    return DrawingIntelligenceService.instance;
  }

  /**
   * Generate or retrieve the Drawing Relationship Graph for a Document Set
   */
  public async getOrGenerateDrawingGraph(params: {
    workspaceId: string;
    projectId: string;
    documentSetId: string;
  }): Promise<DrawingGraph> {
    const { workspaceId, projectId, documentSetId } = params;

    // 1. Tenant security validation
    this.securityGuard.validateTenantAccess({ projectId, workspaceId });

    // Check store cache
    const cacheKey = `${workspaceId}_${projectId}_${documentSetId}`;
    if (this.graphStore.has(cacheKey)) {
      return this.graphStore.get(cacheKey)!;
    }

    // 2. Fetch DocumentSet from Phase 6.1
    const docSet = this.docSetService.getDocumentSet({ workspaceId, projectId, documentSetId });
    if (!docSet || docSet.projectId !== projectId || docSet.workspaceId !== workspaceId) {
      throw new Error(`DocumentSet ${documentSetId} not found or access denied.`);
    }

    // 3. Build Graph
    const graph = this.graphBuilder.buildDrawingGraph(docSet);
    this.graphStore.set(cacheKey, graph);

    return graph;
  }

  /**
   * Synthesize Multi-Document Context across multiple DED files, Specs, and BOQ
   */
  public async getMultiDocumentContext(params: {
    workspaceId: string;
    projectId: string;
    documentSetId: string;
  }): Promise<MultiDocumentContext> {
    const { workspaceId, projectId, documentSetId } = params;

    const graph = await this.getOrGenerateDrawingGraph({ workspaceId, projectId, documentSetId });
    const docSet = this.docSetService.getDocumentSet({ workspaceId, projectId, documentSetId })!;

    const documentTypesPresent = {
      architectural: false,
      structural: false,
      mep: false,
      specifications: false,
      boq: false
    };

    const fileSummaries = docSet.documents.map(doc => {
      const lower = doc.fileName.toLowerCase();
      let disc: DrawingDisciplineType = 'OTHER';

      if (lower.includes('arch') || lower.includes('arsitektur') || lower.includes('denah')) {
        disc = 'ARCHITECTURAL';
        documentTypesPresent.architectural = true;
      } else if (lower.includes('struct') || lower.includes('struktur') || lower.includes('pembesian')) {
        disc = 'STRUCTURAL';
        documentTypesPresent.structural = true;
      } else if (lower.includes('mep') || lower.includes('plumbing') || lower.includes('listrik') || lower.includes('mekanikal')) {
        disc = 'MEP';
        documentTypesPresent.mep = true;
      } else if (lower.includes('spec') || lower.includes('spesifikasi') || lower.includes('rks')) {
        disc = 'OTHER';
        documentTypesPresent.specifications = true;
      } else if (lower.includes('boq') || lower.includes('rab') || lower.includes('bq')) {
        disc = 'OTHER';
        documentTypesPresent.boq = true;
      }

      return {
        fileName: doc.fileName,
        discipline: disc,
        pageCount: doc.pageCount,
        revision: doc.revision
      };
    });

    return {
      projectId,
      workspaceId,
      documentSetId,
      documentTypesPresent,
      totalFiles: docSet.documents.length,
      fileSummaries,
      drawingGraph: graph
    };
  }

  /**
   * Resolve a detected conflict with human audit rationale
   */
  public async resolveConflict(params: {
    workspaceId: string;
    projectId: string;
    documentSetId: string;
    conflictId: string;
    status: 'REVISION_RESOLVED' | 'CONSISTENT';
    humanAuditNotes: string;
  }): Promise<DrawingConflictCandidate> {
    const { workspaceId, projectId, documentSetId, conflictId, status, humanAuditNotes } = params;
    const graph = await this.getOrGenerateDrawingGraph({ workspaceId, projectId, documentSetId });

    const conflict = graph.conflicts.find(c => c.conflictId === conflictId);
    if (!conflict) {
      throw new Error(`Conflict ${conflictId} not found in drawing graph.`);
    }

    conflict.status = status;
    conflict.humanAuditNotes = humanAuditNotes;

    // Check if drawing can be restored to VALIDATED
    const hasRemainingActive = graph.conflicts.some(c => 
      c.status === 'CONFLICT' && 
      (c.sourceDrawingId === conflict.sourceDrawingId || c.conflictingDrawingId === conflict.sourceDrawingId)
    );
    if (!hasRemainingActive && graph.drawings[conflict.sourceDrawingId]) {
      graph.drawings[conflict.sourceDrawingId].status = 'VALIDATED';
    }

    return conflict;
  }

  /**
   * Query cross references with floor awareness
   */
  public async queryCrossReferences(params: {
    workspaceId: string;
    projectId: string;
    documentSetId: string;
    floor?: string;
    category?: string;
    identifier?: string;
  }): Promise<CrossReferenceEvidence[]> {
    const graph = await this.getOrGenerateDrawingGraph(params);
    return graph.crossReferences.filter(x => {
      if (params.floor && x.floor !== params.floor) return false;
      if (params.category && x.category !== params.category) return false;
      if (params.identifier && x.identifier.toUpperCase() !== params.identifier.toUpperCase()) return false;
      return true;
    });
  }

  /**
   * Reset store (useful for unit tests)
   */
  public clearStore(): void {
    this.graphStore.clear();
  }
}
