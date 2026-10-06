/**
 * Drawing Graph Builder (Phase 6.2)
 *
 * Transforms the Page Inventory into a rich Drawing Relationship Graph:
 * Project -> Building -> Floor -> Zone -> Discipline -> Drawing Set -> Drawing -> Page -> Evidence.
 *
 * Preserves strict multi-floor awareness, cross-reference linking, and conflict detection.
 */

import {
  DrawingGraph,
  DrawingEntity,
  DrawingDisciplineType,
  BuildingAwarenessNode,
  FloorAwarenessNode,
  ZoneNode,
  DrawingSetNode,
  CrossReferenceEvidence,
  DrawingConflictCandidate,
  DrawingRelationship
} from '../../src/domain/document/drawingGraphTypes';
import { DocumentSet, DocumentPageInventoryItem } from '../../src/domain/document/documentSetTypes';
import { CrossReferenceDetector } from './crossReferenceDetector';
import { DrawingRelationshipEngine } from './drawingRelationshipEngine';
import { DrawingConflictDetector } from './drawingConflictDetector';

export class DrawingGraphBuilder {
  private static instance: DrawingGraphBuilder;
  private xrefDetector: CrossReferenceDetector;
  private relationshipEngine: DrawingRelationshipEngine;
  private conflictDetector: DrawingConflictDetector;

  private constructor() {
    this.xrefDetector = CrossReferenceDetector.getInstance();
    this.relationshipEngine = DrawingRelationshipEngine.getInstance();
    this.conflictDetector = DrawingConflictDetector.getInstance();
  }

  public static getInstance(): DrawingGraphBuilder {
    if (!DrawingGraphBuilder.instance) {
      DrawingGraphBuilder.instance = new DrawingGraphBuilder();
    }
    return DrawingGraphBuilder.instance;
  }

  /**
   * Map page discipline from Phase 6.1 into 12 Phase 6.2 Drawing Disciplines
   */
  public mapDiscipline(disc: string | null | undefined, text: string, fileName: string): DrawingDisciplineType {
    const raw = `${disc || ''} ${text} ${fileName}`.toLowerCase();
    if (raw.includes('fire') || raw.includes('hydrant') || raw.includes('sprinkler') || raw.includes('pemadam')) return 'FIRE';
    if (raw.includes('landscape') || raw.includes('taman') || raw.includes('lansekap')) return 'LANDSCAPE';
    if (raw.includes('road') || raw.includes('jalan') || raw.includes('perkerasan') || raw.includes('aspal')) return 'ROAD';
    if (raw.includes('bridge') || raw.includes('jembatan') || raw.includes('abutment') || raw.includes('girder')) return 'BRIDGE';
    if (raw.includes('water') || raw.includes('drainase') || raw.includes('saluran air') || raw.includes('stp') || raw.includes('wwtp')) return 'WATER';
    if (raw.includes('plumbing') || raw.includes('plambing') || raw.includes('sanitasi') || raw.includes('air bersih') || raw.includes('air kotor')) return 'PLUMBING';
    if (raw.includes('electrical') || raw.includes('listrik') || raw.includes('penerangan') || raw.includes('panel')) return 'ELECTRICAL';
    if (raw.includes('mechanical') || raw.includes('mekanikal') || raw.includes('hvac') || raw.includes('tata udara') || raw.includes('ac')) return 'MECHANICAL';
    if (raw.includes('civil') || raw.includes('sipil') || raw.includes('cut and fill') || raw.includes('tanah')) return 'CIVIL';
    if (raw.includes('structur') || raw.includes('struktur') || raw.includes('pembesian') || raw.includes('pondasi') || raw.includes('balok') || raw.includes('kolom')) return 'STRUCTURAL';
    if (raw.includes('arch') || raw.includes('arsitektur') || raw.includes('denah') || raw.includes('tampak') || raw.includes('potongan') || raw.includes('pintu')) return 'ARCHITECTURAL';
    return 'OTHER';
  }

  /**
   * Normalize floor names for precise floor awareness
   */
  public normalizeFloor(rawFloor: string | null | undefined, rawText: string): string {
    if (rawFloor) {
      const lower = rawFloor.toLowerCase().trim();
      if (lower.includes('basement 2') || lower.includes('b2')) return 'Basement 2';
      if (lower.includes('basement') || lower.includes('b1')) return 'Basement';
      if (lower.includes('ground') || lower.includes('dasar')) return 'Ground Floor';
      if (lower.includes('rooftop')) return 'Rooftop';
      if (lower.includes('atap') || lower.includes('roof')) return 'Roof';
      if (lower.includes('lantai 4') || lower.includes('lt. 4') || lower.includes('floor 4') || lower === '4') return 'Floor 4';
      if (lower.includes('lantai 3') || lower.includes('lt. 3') || lower.includes('floor 3') || lower === '3') return 'Floor 3';
      if (lower.includes('lantai 2') || lower.includes('lt. 2') || lower.includes('floor 2') || lower === '2') return 'Floor 2';
      if (lower.includes('lantai 1') || lower.includes('lt. 1') || lower.includes('floor 1') || lower === '1') return 'Floor 1';
      if (rawFloor.startsWith('Lantai')) return rawFloor.replace('Lantai ', 'Floor ');
      return rawFloor;
    }
    const text = (rawText || '').toLowerCase();
    if (text.includes('basement 2') || text.includes('b2')) return 'Basement 2';
    if (text.includes('basement') || text.includes('b1')) return 'Basement';
    if (text.includes('ground') || text.includes('dasar')) return 'Ground Floor';
    if (text.includes('rooftop')) return 'Rooftop';
    if (text.includes('atap') || text.includes('roof')) return 'Roof';
    if (text.includes('lantai 4') || text.includes('lt. 4') || text.includes('floor 4')) return 'Floor 4';
    if (text.includes('lantai 3') || text.includes('lt. 3') || text.includes('floor 3')) return 'Floor 3';
    if (text.includes('lantai 2') || text.includes('lt. 2') || text.includes('floor 2')) return 'Floor 2';
    if (text.includes('lantai 1') || text.includes('lt. 1') || text.includes('floor 1')) return 'Floor 1';
    return 'Floor 1';
  }

  /**
   * Build Drawing Graph from Document Set
   */
  public buildDrawingGraph(docSet: DocumentSet): DrawingGraph {
    const graphId = `graph_${docSet.documentSetId}_${Date.now()}`;
    const drawingsMap: Record<string, DrawingEntity> = {};
    const drawingList: DrawingEntity[] = [];

    // 1. Group pages into Drawing Entities
    // Pages with same drawingNumber, building, revision, and floor form one DrawingEntity
    const pageGroups = new Map<string, DocumentPageInventoryItem[]>();

    for (const page of docSet.pages) {
      const dwgNo = page.metadata.drawingNumber || `DWG-P${page.pageNumber}`;
      const building = page.metadata.building || 'Gedung Utama';
      const floor = this.normalizeFloor(page.metadata.floor, page.extractedText);
      const rev = page.metadata.revision || 'REV 00';
      const groupKey = `${page.documentId}___${building}___${floor}___${dwgNo}___${rev}`;

      if (!pageGroups.has(groupKey)) {
        pageGroups.set(groupKey, []);
      }
      pageGroups.get(groupKey)!.push(page);
    }

    // 2. Instantiate DrawingEntities
    for (const [groupKey, pages] of pageGroups.entries()) {
      const primaryPage = pages[0];
      const dwgNo = primaryPage.metadata.drawingNumber || `DWG-P${primaryPage.pageNumber}`;
      const building = primaryPage.metadata.building || 'Gedung Utama';
      const floor = this.normalizeFloor(primaryPage.metadata.floor, primaryPage.extractedText);
      const rev = primaryPage.metadata.revision || 'REV 00';
      const discipline = this.mapDiscipline(primaryPage.metadata.discipline, primaryPage.extractedText, primaryPage.fileName);
      const drawingId = `dwg_${primaryPage.documentId}_${dwgNo.replace(/[^A-Z0-9]/gi, '_')}_${floor.replace(/\s+/g, '_')}_${rev.replace(/\s+/g, '_')}`;

      // Combine text and detect cross references
      const crossReferences: CrossReferenceEvidence[] = [];
      for (const p of pages) {
        const pageXrefs = this.xrefDetector.detectCrossReferences({
          drawingId,
          page: p,
          building,
          floor,
          zone: primaryPage.metadata.zone
        });
        crossReferences.push(...pageXrefs);
      }

      const isSuperseded = pages.some(p => p.isSuperseded);
      const isDuplicate = pages.some(p => p.duplicateStatus === 'POSSIBLE_DUPLICATE' || p.duplicateStatus === 'DUPLICATE_REFERENCE');

      const drawing: DrawingEntity = {
        drawingId,
        drawingNumber: dwgNo,
        title: primaryPage.metadata.title || primaryPage.fileName.replace(/\.[^/.]+$/, ''),
        discipline,
        building,
        floor,
        zone: primaryPage.metadata.zone || null,
        revision: rev,
        scale: primaryPage.metadata.scale || null,
        pageIds: pages.map(p => p.pageId),
        relationshipIds: [],
        crossReferences,
        isSuperseded,
        isDuplicate,
        status: isSuperseded ? 'SUPERSEDED' : isDuplicate ? 'DUPLICATE' : 'VALIDATED',
        createdAt: primaryPage.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      drawingsMap[drawingId] = drawing;
      drawingList.push(drawing);
    }

    // 3. Link superseded and duplicate target drawing IDs
    for (const dwg of drawingList) {
      if (dwg.isSuperseded) {
        const newer = drawingList.find(d => 
          d.drawingNumber === dwg.drawingNumber && 
          d.building === dwg.building && 
          d.floor === dwg.floor && 
          !d.isSuperseded && 
          d.drawingId !== dwg.drawingId
        );
        if (newer) {
          dwg.supersededByDrawingId = newer.drawingId;
        }
      }
      if (dwg.isDuplicate) {
        const canonical = drawingList.find(d => 
          d.drawingNumber === dwg.drawingNumber && 
          d.building === dwg.building && 
          d.floor === dwg.floor &&
          !d.isDuplicate && 
          d.drawingId !== dwg.drawingId
        );
        if (canonical) {
          dwg.duplicateOfDrawingId = canonical.drawingId;
        }
      }
    }

    // 4. Discover Drawing Relationships
    const relationships = this.relationshipEngine.discoverRelationships(drawingList);
    const relationshipsMap: Record<string, DrawingRelationship> = {};
    for (const rel of relationships) {
      relationshipsMap[rel.relationshipId] = rel;
    }

    // 5. Detect Drawing Conflicts
    const conflicts = this.conflictDetector.detectConflicts(drawingList);
    for (const conf of conflicts) {
      if (conf.status === 'CONFLICT') {
        const src = drawingsMap[conf.sourceDrawingId];
        const confDwg = drawingsMap[conf.conflictingDrawingId];
        if (src) src.status = 'CONFLICT';
        if (confDwg) confDwg.status = 'CONFLICT';
      }
    }

    // 6. Build Hierarchical Structure: Building -> Floor -> Zone -> Discipline -> DrawingSet -> Drawing
    const buildingsTree: Record<string, BuildingAwarenessNode> = {};
    const allXrefs: CrossReferenceEvidence[] = [];

    for (const dwg of drawingList) {
      allXrefs.push(...dwg.crossReferences);

      if (!buildingsTree[dwg.building]) {
        buildingsTree[dwg.building] = {
          buildingId: `bld_${dwg.building.replace(/\s+/g, '_')}`,
          buildingName: dwg.building,
          floors: {}
        };
      }
      const bNode = buildingsTree[dwg.building];

      if (!bNode.floors[dwg.floor]) {
        bNode.floors[dwg.floor] = {
          floorId: `flr_${dwg.floor.replace(/\s+/g, '_')}`,
          floorName: dwg.floor,
          zones: {},
          disciplines: {}
        };
      }
      const fNode = bNode.floors[dwg.floor];

      // Discipline node
      if (!fNode.disciplines[dwg.discipline]) {
        fNode.disciplines[dwg.discipline] = {
          drawingSetId: `set_${dwg.discipline}_${dwg.floor.replace(/\s+/g, '_')}`,
          name: `${dwg.discipline} Drawings`,
          discipline: dwg.discipline,
          drawings: []
        };
      }
      fNode.disciplines[dwg.discipline].drawings.push(dwg);

      // Zone node (if zone specified)
      const zoneName = dwg.zone || 'General Zone';
      if (!fNode.zones[zoneName]) {
        fNode.zones[zoneName] = {
          zoneId: `zn_${zoneName.replace(/\s+/g, '_')}`,
          zoneName: zoneName,
          disciplines: {}
        };
      }
      const zNode = fNode.zones[zoneName];
      if (!zNode.disciplines[dwg.discipline]) {
        zNode.disciplines[dwg.discipline] = {
          drawingSetId: `zset_${dwg.discipline}_${zoneName}`,
          name: `${dwg.discipline} - ${zoneName}`,
          discipline: dwg.discipline,
          drawings: []
        };
      }
      zNode.disciplines[dwg.discipline].drawings.push(dwg);
    }

    // Calculate total distinct floors and buildings
    let totalFloors = 0;
    for (const b of Object.values(buildingsTree)) {
      totalFloors += Object.keys(b.floors).length;
    }

    const duplicateCandidates = drawingList
      .filter(d => d.isDuplicate && d.duplicateOfDrawingId)
      .map(d => ({
        drawingId: d.drawingId,
        duplicateOfDrawingId: d.duplicateOfDrawingId!,
        reason: `Sheet with identical drawing number and text content`
      }));

    return {
      graphId,
      projectId: docSet.projectId,
      workspaceId: docSet.workspaceId,
      documentSetId: docSet.documentSetId,
      totalBuildings: Object.keys(buildingsTree).length,
      totalFloors,
      totalDrawings: drawingList.length,
      totalRelationships: relationships.length,
      totalCrossReferences: allXrefs.length,
      totalConflicts: conflicts.length,
      buildings: buildingsTree,
      drawings: drawingsMap,
      relationships: relationshipsMap,
      crossReferences: allXrefs,
      conflicts,
      duplicateCandidates,
      status: conflicts.some(c => c.status === 'CONFLICT') ? 'HAS_CONFLICTS' : 'PROCESSED',
      generatedAt: new Date().toISOString()
    };
  }
}
