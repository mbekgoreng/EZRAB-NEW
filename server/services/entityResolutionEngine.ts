/**
 * Entity Resolution & Anti-Duplicate Engine (Phase 6.3)
 *
 * Resolves raw extractions & cross-references into Canonical Entities.
 *
 * Principles:
 * RAW EXTRACTION != PHYSICAL ENTITY
 * Evidence != Entity
 * Page != Entity
 * Entity != Work Item
 * Work Item != RAB Item
 *
 * Enforces Floor Awareness, Source Hierarchy Priority, and Anti-Duplication.
 */

import {
  CanonicalEntity,
  EntityEvidence,
  EntityResolutionStatus,
  EntityResolutionSummary
} from '../../src/domain/document/canonicalEntityTypes';
import { DrawingGraph, DrawingEntity } from '../../src/domain/document/drawingGraphTypes';
import { DocumentSet, DocumentPageInventoryItem } from '../../src/domain/document/documentSetTypes';
import { EvidenceExtractor } from './evidenceExtractor';
import { QuantityDeduplicationEngine } from './quantityDeduplicationEngine';

export class EntityResolutionEngine {
  private static instance: EntityResolutionEngine;
  private evidenceExtractor: EvidenceExtractor;
  private deduplicationEngine: QuantityDeduplicationEngine;

  private constructor() {
    this.evidenceExtractor = EvidenceExtractor.getInstance();
    this.deduplicationEngine = QuantityDeduplicationEngine.getInstance();
  }

  public static getInstance(): EntityResolutionEngine {
    if (!EntityResolutionEngine.instance) {
      EntityResolutionEngine.instance = new EntityResolutionEngine();
    }
    return EntityResolutionEngine.instance;
  }

  /**
   * Resolve all drawing elements and evidence in a DrawingGraph to Canonical Entities
   */
  public resolveEntities(graph: DrawingGraph, docSet: DocumentSet): EntityResolutionSummary {
    const pagesMap = new Map<string, DocumentPageInventoryItem>();
    for (const page of docSet.pages) {
      pagesMap.set(page.pageId, page);
    }

    // 1. Extract raw evidence from all drawings
    const allEvidence: EntityEvidence[] = [];
    for (const dwg of Object.values(graph.drawings)) {
      const dwgEvidences = this.evidenceExtractor.extractEvidenceFromDrawing(dwg, pagesMap);
      allEvidence.push(...dwgEvidences);
    }

    // 2. Group evidence by Physical Identity Key:
    // Building + Floor + Zone + ElementType + Identifier
    // (Floor Awareness Guarantee: K1 Floor 1 and K1 Floor 2 produce different keys)
    const entityGroups = new Map<string, {
      building: string;
      floor: string;
      zone: string | null;
      identifier: string;
      category: string;
      drawings: DrawingEntity[];
      evidences: EntityEvidence[];
    }>();

    for (const dwg of Object.values(graph.drawings)) {
      for (const xref of dwg.crossReferences) {
        const groupKey = `${dwg.building}___${dwg.floor}___${dwg.zone || 'ALL'}___${xref.category}___${xref.identifier}`;
        
        if (!entityGroups.has(groupKey)) {
          entityGroups.set(groupKey, {
            building: dwg.building,
            floor: dwg.floor,
            zone: dwg.zone,
            identifier: xref.identifier,
            category: xref.category,
            drawings: [],
            evidences: []
          });
        }

        const group = entityGroups.get(groupKey)!;
        if (!group.drawings.some(d => d.drawingId === dwg.drawingId)) {
          group.drawings.push(dwg);
        }

        // Match evidence for this drawing and xref
        const matchedEvs = allEvidence.filter(e => 
          e.drawingId === dwg.drawingId && 
          e.extractedValue.identifier === xref.identifier
        );
        for (const ev of matchedEvs) {
          if (!group.evidences.some(existing => existing.evidenceId === ev.evidenceId)) {
            group.evidences.push(ev);
          }
        }
      }
    }

    // 3. Assemble Canonical Entities & Run Resolution
    const canonicalEntities: CanonicalEntity[] = [];
    const resolutionLog: EntityResolutionSummary['resolutionLog'] = [];
    let deduplicatedCount = 0;
    let conflictCount = 0;
    let duplicateNeutralizedCount = 0;
    let supersededNeutralizedCount = 0;

    for (const [groupKey, group] of entityGroups.entries()) {
      const isDuplicate = group.drawings.every(d => d.isDuplicate);
      const isSuperseded = group.drawings.every(d => d.isSuperseded);

      if (isDuplicate) duplicateNeutralizedCount++;
      if (isSuperseded) supersededNeutralizedCount++;

      // Sort evidence by Source Priority (1: Detail, 2: Section, 3: Struct Plan, 4: Arch Plan, 5: Spec)
      const sortedEvidences = [...group.evidences].sort((a, b) => a.sourcePriority - b.sourcePriority);

      // Active evidences from non-superseded drawings take absolute precedence
      const activeEvidences = sortedEvidences.filter(e => {
        const dwg = graph.drawings[e.drawingId];
        return dwg ? !dwg.isSuperseded : true;
      });
      const candidateEvidences = activeEvidences.length > 0 ? activeEvidences : sortedEvidences;

      // Extract canonical parameters following Source Priority hierarchy on active evidence
      const canonicalDim = candidateEvidences.find(e => e.extractedValue.dimensions)?.extractedValue.dimensions;
      const canonicalMaterial = candidateEvidences.find(e => e.extractedValue.material)?.extractedValue.material;
      const canonicalRebar = candidateEvidences.find(e => e.extractedValue.rebar)?.extractedValue.rebar;
      const canonicalGrid = candidateEvidences.find(e => e.extractedValue.grid)?.extractedValue.grid;

      // Deduplicate quantities across evidence sources (Plan, Schedule, Detail)
      const deduplicationRes = this.deduplicationEngine.deduplicateQuantities(
        sortedEvidences,
        isSuperseded,
        isDuplicate
      );

      if (deduplicationRes.isDeduplicated) {
        deduplicatedCount++;
      }

      // Determine Resolution Status
      let resolutionStatus: EntityResolutionStatus = 'SAME_ENTITY';
      let conflictDescription: string | undefined = undefined;

      if (isDuplicate) {
        resolutionStatus = 'POTENTIAL_DUPLICATE';
      } else if (isSuperseded) {
        resolutionStatus = 'SAME_ENTITY'; // Revisions tracked under same entity lineage
      } else if (deduplicationRes.hasConflict) {
        resolutionStatus = 'CONFLICT';
        conflictDescription = deduplicationRes.conflictDescription;
        conflictCount++;
      } else if (group.evidences.length > 1) {
        resolutionStatus = 'SAME_ENTITY';
      } else {
        resolutionStatus = 'SAME_ENTITY';
      }

      const entityId = `cent_${graph.projectId}_${group.identifier}_${group.floor.replace(/\s+/g, '_')}_${group.building.replace(/\s+/g, '_')}`;

      // Link evidence entityId
      for (const ev of sortedEvidences) {
        ev.entityId = entityId;
      }

      const entity: CanonicalEntity = {
        entityId,
        projectId: graph.projectId,
        buildingId: `bld_${group.building.replace(/\s+/g, '_')}`,
        floorId: `flr_${group.floor.replace(/\s+/g, '_')}`,
        zoneId: group.zone ? `zn_${group.zone.replace(/\s+/g, '_')}` : null,
        discipline: group.drawings[0]?.discipline || 'STRUCTURAL',
        elementType: group.category,
        name: `${group.category} ${group.identifier} (${group.floor})`,
        identifier: group.identifier,
        drawingReferences: group.drawings.map(d => d.drawingNumber),
        evidenceIds: sortedEvidences.map(e => e.evidenceId),
        evidences: sortedEvidences,
        location: {
          grid: canonicalGrid,
          floor: group.floor,
          building: group.building,
          zone: group.zone,
          description: `${group.building} - ${group.floor}${group.zone ? ` (${group.zone})` : ''}`
        },
        geometry: {
          shape: group.category === 'COLUMN' || group.category === 'FOUNDATION' ? 'RECTANGULAR' : 'LINEAR'
        },
        dimensions: canonicalDim,
        material: canonicalMaterial,
        rebar: canonicalRebar,
        quantityCandidates: deduplicationRes.candidates,
        canonicalQuantity: {
          quantity: deduplicationRes.canonicalQuantity,
          unit: deduplicationRes.unit,
          source: deduplicationRes.source,
          confidence: deduplicationRes.confidence,
          isDeduplicated: deduplicationRes.isDeduplicated
        },
        identityConfidence: sortedEvidences.length > 1 ? 0.96 : 0.88,
        resolutionStatus,
        isDuplicate,
        isSuperseded,
        conflictDescription,
        provenance: {
          sourceDrawings: group.drawings.map(d => d.drawingNumber),
          sourcePages: Array.from(new Set(sortedEvidences.map(e => `${e.fileName} (p.${e.pageNumber})`))),
          detectedAt: new Date().toISOString()
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      canonicalEntities.push(entity);

      resolutionLog.push({
        entityId,
        action: `Resolved ${group.category} ${group.identifier} across ${sortedEvidences.length} evidence sources`,
        status: resolutionStatus,
        reason: deduplicationRes.isDeduplicated
          ? `Deduplicated ${deduplicationRes.candidates.length} quantity occurrences to canonical value ${deduplicationRes.canonicalQuantity}`
          : resolutionStatus === 'CONFLICT'
          ? deduplicationRes.conflictDescription || 'Conflicting values'
          : `Canonical entity established from drawing set`
      });
    }

    // 4. Check for duplicate entity cross-pointers
    for (const ent of canonicalEntities) {
      if (ent.isDuplicate) {
        const canonical = canonicalEntities.find(other => 
          other.identifier === ent.identifier && 
          other.location.floor === ent.location.floor && 
          other.location.building === ent.location.building && 
          !other.isDuplicate && 
          other.entityId !== ent.entityId
        );
        if (canonical) {
          ent.duplicateOfEntityId = canonical.entityId;
        }
      }
      if (ent.isSuperseded) {
        const newer = canonicalEntities.find(other => 
          other.identifier === ent.identifier && 
          other.location.floor === ent.location.floor && 
          other.location.building === ent.location.building && 
          !other.isSuperseded && 
          other.entityId !== ent.entityId
        );
        if (newer) {
          ent.supersededByEntityId = newer.entityId;
        }
      }
    }

    const supersededDrawingsCount = Object.values(graph.drawings).filter(d => d.isSuperseded).length;
    const duplicateDrawingsCount = Object.values(graph.drawings).filter(d => d.isDuplicate).length;

    return {
      projectId: graph.projectId,
      totalRawEvidence: allEvidence.length,
      totalCanonicalEntities: canonicalEntities.length,
      totalDeduplicatedQuantityItems: deduplicatedCount,
      totalConflicts: conflictCount,
      totalDuplicatesNeutralized: Math.max(duplicateNeutralizedCount, duplicateDrawingsCount),
      totalSupersededNeutralized: Math.max(supersededNeutralizedCount, supersededDrawingsCount),
      entities: canonicalEntities,
      workItems: [],
      resolutionLog,
      generatedAt: new Date().toISOString()
    };
  }
}
