/**
 * Phase 6.4: Template Entity Mapping Engine
 *
 * Maps Canonical Entities to Adaptive WBS Nodes using the Construction Knowledge Graph.
 * Calculates explicit Mapping Coverage metrics (NEVER calling it "accuracy").
 * Enforces Unmapped integrity (never force-fitting entities into incorrect WBS).
 */

import { CanonicalEntity } from '../../src/domain/document/canonicalEntityTypes';
import {
  AdaptiveWbsNode,
  EntityWbsMapping,
  MappingCoverageSummary,
  EntityMappingStatus
} from '../../src/domain/document/templateMappingTypes';
import { ConstructionKnowledgeGraph } from './constructionKnowledgeGraph';

export interface EntityMappingInput {
  projectId: string;
  entities: CanonicalEntity[];
  adaptiveWBS: AdaptiveWbsNode[];
}

export class TemplateEntityMappingEngine {
  /**
   * Map canonical entities to adaptive WBS hierarchy.
   */
  public static mapEntitiesToWBS(input: EntityMappingInput): {
    mappedEntities: EntityWbsMapping[];
    unmappedEntities: EntityWbsMapping[];
    allMappings: EntityWbsMapping[];
    coverage: MappingCoverageSummary;
    updatedWBS: AdaptiveWbsNode[];
  } {
    const { projectId, entities, adaptiveWBS } = input;
    const allMappings: EntityWbsMapping[] = [];
    const mappedEntities: EntityWbsMapping[] = [];
    const unmappedEntities: EntityWbsMapping[] = [];
    const unmappedEntityIds: string[] = [];
    const needsReviewEntityIds: string[] = [];

    // Flatten active WBS nodes for easy searching
    const flatWbsNodes = this.flattenWbsNodes(adaptiveWBS);
    const nodeCountMap = new Map<string, number>();

    let mappedCount = 0;
    let unmappedCount = 0;
    let ambiguousCount = 0;
    let needsReviewCount = 0;
    let conflictCount = 0;

    for (const ent of entities) {
      // If entity itself is marked duplicate or superseded, handle gracefully
      if (ent.isDuplicate || ent.isSuperseded) {
        continue;
      }

      const knowledgeLink = ConstructionKnowledgeGraph.resolveKnowledgeLink(ent);
      let targetWbs: AdaptiveWbsNode | null = null;
      let status: EntityMappingStatus = 'UNMAPPED';
      let confidence = 0.5;
      let reasoning = '';
      let suggestedAhsp = ent.elementType;

      if (knowledgeLink) {
        // Try finding matching WBS node by suggested code prefix or category keywords
        targetWbs = this.findMatchingWbsNode(flatWbsNodes, knowledgeLink.suggestedWbsCodePrefix, knowledgeLink.targetWbsCategory);
        if (targetWbs) {
          status = 'MAPPED';
          confidence = 0.92;
          reasoning = `Matched via Construction Knowledge Graph to '${targetWbs.title}' (${targetWbs.code}). Method: ${knowledgeLink.constructionMethod}.`;
          suggestedAhsp = knowledgeLink.defaultAhspCode || suggestedAhsp;
        } else {
          // If knowledge link exists but template WBS does not have corresponding category
          status = 'NEEDS_REVIEW';
          confidence = 0.6;
          reasoning = `Entity '${ent.name}' resolved as ${knowledgeLink.targetWbsCategory}, but active template lacks a specific matching WBS branch.`;
          needsReviewEntityIds.push(ent.entityId);
          needsReviewCount++;
        }
      } else {
        // Fallback: heuristic match against active WBS titles
        const fallbackMatch = this.findHeuristicWbsMatch(flatWbsNodes, ent);
        if (fallbackMatch) {
          targetWbs = fallbackMatch.node;
          status = fallbackMatch.isHighConfidence ? 'MAPPED' : 'AMBIGUOUS';
          confidence = fallbackMatch.confidence;
          reasoning = fallbackMatch.reasoning;
          if (status === 'AMBIGUOUS') ambiguousCount++;
        } else {
          status = 'UNMAPPED';
          confidence = 0.2;
          reasoning = `No matching construction method or WBS category found in active template for '${ent.name}' (${ent.elementType}).`;
          unmappedEntityIds.push(ent.entityId);
          unmappedCount++;
        }
      }

      if (ent.resolutionStatus === 'CONFLICT') {
        status = 'CONFLICT';
        conflictCount++;
        needsReviewEntityIds.push(ent.entityId);
      }

      if (status === 'MAPPED') {
        mappedCount++;
        if (targetWbs) {
          nodeCountMap.set(targetWbs.code, (nodeCountMap.get(targetWbs.code) || 0) + 1);
        }
      }

      const mapping: EntityWbsMapping = {
        mappingId: `map_${ent.entityId}`,
        entityId: ent.entityId,
        entityIdentifier: ent.identifier || 'ITEM',
        entityName: ent.name,
        elementType: ent.elementType,
        floor: ent.location?.floor || 'General',
        building: ent.location?.building || 'Main',
        wbsCode: targetWbs ? targetWbs.code : undefined,
        wbsTitle: targetWbs ? targetWbs.title : undefined,
        workCategory: knowledgeLink ? knowledgeLink.targetWbsCategory : (ent.discipline || 'GENERAL'),
        status,
        confidence,
        constructionMethod: knowledgeLink?.constructionMethod,
        suggestedAhspCode: suggestedAhsp,
        reasoning,
        sourceDrawings: ent.drawingReferences || []
      };

      allMappings.push(mapping);
      if (status === 'MAPPED') {
        mappedEntities.push(mapping);
      } else {
        unmappedEntities.push(mapping);
      }
    }

    // Update mappedEntityCount on WBS nodes recursively
    const updatedWBS = this.applyCountsToWBS(adaptiveWBS, nodeCountMap);

    const totalActive = allMappings.length;
    const coveragePercentage = totalActive > 0 ? Number(((mappedCount / totalActive) * 100).toFixed(1)) : 100.0;

    const coverage: MappingCoverageSummary = {
      totalEntities: totalActive,
      mappedCount,
      unmappedCount,
      ambiguousCount,
      needsReviewCount,
      conflictCount,
      coveragePercentage,
      unmappedEntityIds,
      needsReviewEntityIds
    };

    return {
      mappedEntities,
      unmappedEntities,
      allMappings,
      coverage,
      updatedWBS
    };
  }

  private static flattenWbsNodes(nodes: AdaptiveWbsNode[]): AdaptiveWbsNode[] {
    const list: AdaptiveWbsNode[] = [];
    for (const node of nodes) {
      list.push(node);
      if (node.children && node.children.length > 0) {
        list.push(...this.flattenWbsNodes(node.children));
      }
    }
    return list;
  }

  private static findMatchingWbsNode(
    nodes: AdaptiveWbsNode[],
    prefix: string,
    categoryKey: string
  ): AdaptiveWbsNode | null {
    // 1. Direct code prefix match
    const prefixMatch = nodes.find(n => n.code.startsWith(prefix) || prefix.startsWith(n.code));
    if (prefixMatch) return prefixMatch;

    // 2. Keyword match in title
    const catWords = categoryKey.toLowerCase().split('_');
    const keywordMatch = nodes.find(n => {
      const titleLower = n.title.toLowerCase();
      return catWords.some(w => w.length > 3 && titleLower.includes(w));
    });

    return keywordMatch || null;
  }

  private static findHeuristicWbsMatch(
    nodes: AdaptiveWbsNode[],
    ent: CanonicalEntity
  ): { node: AdaptiveWbsNode; isHighConfidence: boolean; confidence: number; reasoning: string } | null {
    const entName = ent.name.toLowerCase();
    const entType = ent.elementType.toLowerCase();

    for (const node of nodes) {
      const nodeTitle = node.title.toLowerCase();
      if (entName.length > 3 && nodeTitle.includes(entName)) {
        return {
          node,
          isHighConfidence: true,
          confidence: 0.85,
          reasoning: `Direct name match with WBS node '${node.title}'.`
        };
      }
      if (entType.length > 3 && nodeTitle.includes(entType)) {
        return {
          node,
          isHighConfidence: false,
          confidence: 0.7,
          reasoning: `Element type '${ent.elementType}' matches WBS '${node.title}'.`
        };
      }
    }

    return null;
  }

  private static applyCountsToWBS(
    nodes: AdaptiveWbsNode[],
    counts: Map<string, number>
  ): AdaptiveWbsNode[] {
    return nodes.map(node => {
      const directCount = counts.get(node.code) || 0;
      let childrenCount = 0;
      let updatedChildren: AdaptiveWbsNode[] | undefined = undefined;

      if (node.children && node.children.length > 0) {
        updatedChildren = this.applyCountsToWBS(node.children, counts);
        childrenCount = updatedChildren.reduce((sum, c) => sum + c.mappedEntityCount, 0);
      }

      return {
        ...node,
        mappedEntityCount: directCount + childrenCount,
        children: updatedChildren
      };
    });
  }
}
