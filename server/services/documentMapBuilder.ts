/**
 * Document Map Builder (Phase 6.1)
 *
 * Assembles a structured hierarchical Document Map (Project -> Building -> Floor -> Discipline -> Pages)
 * and discovers cross-referencing relationships between drawing sheets (e.g. Plan to Detail, Plan to Section).
 */

import {
  DocumentMap,
  BuildingNode,
  FloorNode,
  DisciplineGroup,
  DocumentPageInventoryItem,
  PageRelationship
} from '../../src/domain/document/documentSetTypes';
import { DocumentDiscipline } from '../../src/domain/document/types';

export class DocumentMapBuilder {
  private static instance: DocumentMapBuilder;

  private constructor() {}

  public static getInstance(): DocumentMapBuilder {
    if (!DocumentMapBuilder.instance) {
      DocumentMapBuilder.instance = new DocumentMapBuilder();
    }
    return DocumentMapBuilder.instance;
  }

  /**
   * Build complete hierarchical Document Map from classified pages
   */
  public buildDocumentMap(params: {
    documentSetId: string;
    projectId: string;
    projectName: string;
    pages: DocumentPageInventoryItem[];
  }): DocumentMap {
    const { documentSetId, projectId, projectName, pages } = params;

    const buildingMap = new Map<string, Map<string, Map<DocumentDiscipline, DocumentPageInventoryItem[]>>>();
    const relationships: PageRelationship[] = [];
    const unassigned: DocumentPageInventoryItem[] = [];

    // Group pages by Building -> Floor -> Discipline
    for (const page of pages) {
      const bldName = page.metadata.building || 'Gedung Utama';
      const floorName = page.metadata.floor || 'Lantai 1';
      const discipline: DocumentDiscipline = page.metadata.discipline || 'ARCHITECTURE';

      if (!buildingMap.has(bldName)) {
        buildingMap.set(bldName, new Map());
      }
      const floorMap = buildingMap.get(bldName)!;

      if (!floorMap.has(floorName)) {
        floorMap.set(floorName, new Map());
      }
      const discMap = floorMap.get(floorName)!;

      if (!discMap.has(discipline)) {
        discMap.set(discipline, []);
      }
      discMap.get(discipline)!.push(page);
    }

    // Discover cross-page relationships (e.g., Detail references Plan, Revision supersedes)
    const planPages = pages.filter(p => p.classification.pageRole === 'FLOOR_PLAN' || p.classification.pageRole === 'STRUCTURAL_PLAN');
    const detailPages = pages.filter(p => p.classification.pageRole === 'DETAIL' || p.classification.pageRole === 'STRUCTURAL_DETAIL' || p.classification.pageRole === 'MEP_DETAIL');
    const schedulePages = pages.filter(p => p.classification.pageRole === 'DOOR_SCHEDULE' || p.classification.pageRole === 'WINDOW_SCHEDULE' || p.classification.pageRole === 'MATERIAL_SCHEDULE');

    // 1. Link Details to Plans on same floor/discipline
    for (const plan of planPages) {
      for (const det of detailPages) {
        if (det.metadata.floor === plan.metadata.floor || det.metadata.building === plan.metadata.building) {
          relationships.push({
            sourcePageId: det.pageId,
            targetPageId: plan.pageId,
            relationshipType: 'DETAILS_OF_PLAN',
            description: `Detail '${det.metadata.title || det.metadata.drawingNumber}' merujuk pada denah '${plan.metadata.title || plan.metadata.drawingNumber}'.`,
            confidence: 0.90
          });
        }
      }
      for (const sched of schedulePages) {
        relationships.push({
          sourcePageId: sched.pageId,
          targetPageId: plan.pageId,
          relationshipType: 'SCHEDULE_OF_PLAN',
          description: `Skedul kusen/material '${sched.metadata.title}' melengkapi denah '${plan.metadata.title}'.`,
          confidence: 0.88
        });
      }
    }

    // 2. Link Superseded Revisions
    for (const page of pages) {
      if (page.isSuperseded && page.supersededByPageId) {
        relationships.push({
          sourcePageId: page.supersededByPageId,
          targetPageId: page.pageId,
          relationshipType: 'SUPERSEDES_REVISION',
          description: `Revisi terbaru (${page.metadata.revision}) menggantikan lembar versi sebelumnya.`,
          confidence: 0.99
        });
      }
    }

    // Construct Node Hierarchies
    const buildings: BuildingNode[] = [];

    for (const [bldName, floorMap] of buildingMap.entries()) {
      const floors: FloorNode[] = [];

      for (const [flName, discMap] of floorMap.entries()) {
        const disciplines: Record<DocumentDiscipline, DisciplineGroup> = {
          ARCHITECTURE: { discipline: 'ARCHITECTURE', pageCount: 0, pages: [] },
          STRUCTURE: { discipline: 'STRUCTURE', pageCount: 0, pages: [] },
          MEP: { discipline: 'MEP', pageCount: 0, pages: [] },
          CIVIL: { discipline: 'CIVIL', pageCount: 0, pages: [] },
          SPECIFICATION: { discipline: 'SPECIFICATION', pageCount: 0, pages: [] },
          BOQ: { discipline: 'BOQ', pageCount: 0, pages: [] },
          GENERAL: { discipline: 'GENERAL', pageCount: 0, pages: [] }
        };

        for (const [disc, pList] of discMap.entries()) {
          disciplines[disc] = {
            discipline: disc,
            pageCount: pList.length,
            pages: pList
          };
        }

        floors.push({
          floorId: `fl_${flName.toLowerCase().replace(/\s+/g, '_')}`,
          floorName: flName,
          disciplines
        });
      }

      buildings.push({
        buildingId: `bld_${bldName.toLowerCase().replace(/\s+/g, '_')}`,
        buildingName: bldName,
        floors
      });
    }

    return {
      documentSetId,
      projectId,
      projectName,
      totalBuildings: buildings.length,
      totalFloors: buildings.reduce((acc, b) => acc + b.floors.length, 0),
      totalClassifiedPages: pages.filter(p => p.classification.pageRole !== 'UNKNOWN').length,
      buildings,
      relationships,
      unassignedPages: unassigned,
      generatedAt: new Date().toISOString()
    };
  }
}

export const documentMapBuilder = DocumentMapBuilder.getInstance();
