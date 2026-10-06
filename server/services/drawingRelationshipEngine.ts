/**
 * Drawing Relationship Engine (Phase 6.2)
 *
 * Discovers and links relationships between drawings:
 * PRIMARY, DETAIL_OF, SECTION_OF, ELEVATION_OF, SCHEDULE_OF,
 * SPECIFICATION_OF, REFERENCE_OF, CALCULATION_OF, RELATED_TO,
 * SUPERSEDES, and DUPLICATES.
 */

import {
  DrawingEntity,
  DrawingRelationship,
  DrawingRelationshipType
} from '../../src/domain/document/drawingGraphTypes';

export class DrawingRelationshipEngine {
  private static instance: DrawingRelationshipEngine;

  private constructor() {}

  public static getInstance(): DrawingRelationshipEngine {
    if (!DrawingRelationshipEngine.instance) {
      DrawingRelationshipEngine.instance = new DrawingRelationshipEngine();
    }
    return DrawingRelationshipEngine.instance;
  }

  /**
   * Evaluate and construct relationships across a list of drawings
   */
  public discoverRelationships(drawings: DrawingEntity[]): DrawingRelationship[] {
    const relationships: DrawingRelationship[] = [];
    const relIdSet = new Set<string>();

    const addRel = (
      sourceDrawingId: string,
      targetDrawingId: string,
      type: DrawingRelationshipType,
      description: string,
      confidence: number,
      evidenceSnippets?: string[]
    ) => {
      if (sourceDrawingId === targetDrawingId) return;
      const key = `${sourceDrawingId}_${targetDrawingId}_${type}`;
      if (relIdSet.has(key)) return;
      relIdSet.add(key);

      const rel: DrawingRelationship = {
        relationshipId: `rel_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        sourceDrawingId,
        targetDrawingId,
        type,
        description,
        confidence,
        evidenceSnippets,
        createdAt: new Date().toISOString()
      };
      relationships.push(rel);

      // Mutate relationshipIds on source and target entities
      const src = drawings.find(d => d.drawingId === sourceDrawingId);
      const tgt = drawings.find(d => d.drawingId === targetDrawingId);
      if (src && !src.relationshipIds.includes(rel.relationshipId)) {
        src.relationshipIds.push(rel.relationshipId);
      }
      if (tgt && !tgt.relationshipIds.includes(rel.relationshipId)) {
        tgt.relationshipIds.push(rel.relationshipId);
      }
    };

    // 1. Group drawings by Building and Floor
    const primaryPlans = drawings.filter(d => 
      (d.title.toLowerCase().includes('denah') || d.title.toLowerCase().includes('plan')) &&
      !d.title.toLowerCase().includes('detail') &&
      !d.title.toLowerCase().includes('jadwal') &&
      !d.title.toLowerCase().includes('schedule')
    );

    for (const dwg of drawings) {
      const titleLower = dwg.title.toLowerCase();

      // A. Revisions: SUPERSEDES
      if (dwg.isSuperseded && dwg.supersededByDrawingId) {
        addRel(
          dwg.supersededByDrawingId,
          dwg.drawingId,
          'SUPERSEDES',
          `Revisi ${dwg.revision} digantikan oleh revisi terbaru`,
          0.99
        );
      }

      // B. Duplicates: DUPLICATES
      if (dwg.isDuplicate && dwg.duplicateOfDrawingId) {
        addRel(
          dwg.drawingId,
          dwg.duplicateOfDrawingId,
          'DUPLICATES',
          `Duplikasi dari lembar gambar ${dwg.duplicateOfDrawingId}`,
          0.95
        );
      }

      // C. Detail drawings: DETAIL_OF
      if (titleLower.includes('detail') || dwg.drawingNumber.startsWith('D-') || titleLower.includes('rincian')) {
        // Find matching primary plan in same building and floor (or whole building if foundation/roof)
        const matchedPlan = primaryPlans.find(p => 
          p.building === dwg.building &&
          (p.floor === dwg.floor || dwg.floor.toLowerCase().includes('pondasi') || dwg.floor.toLowerCase().includes('dasar') || dwg.title.toLowerCase().includes('pondasi')) &&
          p.discipline === dwg.discipline
        ) || primaryPlans.find(p => p.building === dwg.building && p.discipline === dwg.discipline);

        if (matchedPlan) {
          dwg.primaryDrawingId = matchedPlan.drawingId;
          addRel(
            dwg.drawingId,
            matchedPlan.drawingId,
            'DETAIL_OF',
            `Detail ${dwg.title} merinci denah/skema pada ${matchedPlan.drawingNumber} (${matchedPlan.title})`,
            0.92
          );
        }
      }

      // D. Sections: SECTION_OF
      if (titleLower.includes('potongan') || titleLower.includes('section') || dwg.drawingNumber.startsWith('S-') && titleLower.includes('potongan')) {
        const matchedPlan = primaryPlans.find(p => p.building === dwg.building && p.discipline === dwg.discipline);
        if (matchedPlan) {
          addRel(
            dwg.drawingId,
            matchedPlan.drawingId,
            'SECTION_OF',
            `Gambar potongan ${dwg.title} memotong denah ${matchedPlan.drawingNumber}`,
            0.90
          );
        }
      }

      // E. Elevations: ELEVATION_OF
      if (titleLower.includes('tampak') || titleLower.includes('elevation')) {
        const matchedPlan = primaryPlans.find(p => p.building === dwg.building && p.discipline === 'ARCHITECTURAL');
        if (matchedPlan) {
          addRel(
            dwg.drawingId,
            matchedPlan.drawingId,
            'ELEVATION_OF',
            `Gambar tampak ${dwg.title} memvisualisasikan elevasi eksterior ${matchedPlan.drawingNumber}`,
            0.88
          );
        }
      }

      // F. Schedules: SCHEDULE_OF
      if (titleLower.includes('jadwal') || titleLower.includes('schedule') || titleLower.includes('tabel pintu') || titleLower.includes('tabel pembesian')) {
        const matchedPlan = primaryPlans.find(p => 
          p.building === dwg.building && 
          (p.floor === dwg.floor || p.discipline === dwg.discipline)
        );
        if (matchedPlan) {
          addRel(
            dwg.drawingId,
            matchedPlan.drawingId,
            'SCHEDULE_OF',
            `Tabel jadwal ${dwg.title} mendata kuantitas elemen pada ${matchedPlan.drawingNumber}`,
            0.93
          );
        }
      }

      // G. Specifications: SPECIFICATION_OF
      if (titleLower.includes('spesifikasi') || titleLower.includes('spec') || dwg.discipline === 'OTHER' && titleLower.includes('syarat teknis')) {
        for (const plan of primaryPlans.filter(p => p.building === dwg.building)) {
          addRel(
            dwg.drawingId,
            plan.drawingId,
            'SPECIFICATION_OF',
            `Spesifikasi teknis menetapkan standar material untuk ${plan.drawingNumber}`,
            0.85
          );
        }
      }

      // H. Cross References Links: Connect drawings sharing cross references on the SAME floor & building
      for (const xref of dwg.crossReferences) {
        const matchingDrawings = drawings.filter(other => 
          other.drawingId !== dwg.drawingId &&
          other.building === dwg.building &&
          other.floor === dwg.floor &&
          other.crossReferences.some(otherXref => otherXref.identifier === xref.identifier && otherXref.category === xref.category)
        );

        for (const matched of matchingDrawings) {
          if (titleLower.includes('detail') && !matched.title.toLowerCase().includes('detail')) {
            addRel(
              dwg.drawingId,
              matched.drawingId,
              'DETAIL_OF',
              `Detail elemen ${xref.identifier} merinci penempatan pada ${matched.drawingNumber}`,
              0.94,
              [xref.contextSnippet]
            );
          } else if (titleLower.includes('jadwal') || titleLower.includes('schedule')) {
            addRel(
              dwg.drawingId,
              matched.drawingId,
              'SCHEDULE_OF',
              `Jadwal elemen ${xref.identifier} mengitemisasi komponen pada ${matched.drawingNumber}`,
              0.92,
              [xref.contextSnippet]
            );
          } else {
            addRel(
              dwg.drawingId,
              matched.drawingId,
              'RELATED_TO',
              `Keduanya memuat referensi elemen ${xref.identifier} (${xref.category}) pada ${dwg.floor}`,
              0.80,
              [xref.contextSnippet]
            );
          }
        }
      }
    }

    return relationships;
  }
}
