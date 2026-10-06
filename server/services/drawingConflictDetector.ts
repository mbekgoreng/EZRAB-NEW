/**
 * Drawing Conflict Detector (Phase 6.2)
 *
 * Scans cross-references across related drawings to detect dimensional,
 * material, and rebar reinforcement discrepancies.
 *
 * STRICT PRINCIPLE:
 * Never pick silently! Any ambiguity or mismatch is flagged with explicit status:
 * CONSISTENT, CONFLICT, REVISION_RESOLVED, or NEEDS_REVIEW.
 * Preserves Floor Awareness (Column K1 tapering across floors is expected, not a conflict).
 */

import {
  DrawingEntity,
  DrawingConflictCandidate,
  CrossReferenceEvidence
} from '../../src/domain/document/drawingGraphTypes';

export class DrawingConflictDetector {
  private static instance: DrawingConflictDetector;

  private constructor() {}

  public static getInstance(): DrawingConflictDetector {
    if (!DrawingConflictDetector.instance) {
      DrawingConflictDetector.instance = new DrawingConflictDetector();
    }
    return DrawingConflictDetector.instance;
  }

  /**
   * Detect conflicts across drawings
   */
  public detectConflicts(drawings: DrawingEntity[]): DrawingConflictCandidate[] {
    const conflicts: DrawingConflictCandidate[] = [];
    const processedPairs = new Set<string>();

    // 1. Group cross-references by: Building + Floor + Category + Identifier
    const xrefMap = new Map<string, { drawing: DrawingEntity; xref: CrossReferenceEvidence }[]>();

    for (const dwg of drawings) {
      for (const xref of dwg.crossReferences) {
        // Floor & Building awareness key
        const groupKey = `${dwg.building}___${dwg.floor}___${xref.category}___${xref.identifier}`;
        if (!xrefMap.has(groupKey)) {
          xrefMap.set(groupKey, []);
        }
        xrefMap.get(groupKey)!.push({ drawing: dwg, xref });
      }
    }

    // 2. Compare cross-reference parameters within the SAME floor and building
    for (const [groupKey, items] of xrefMap.entries()) {
      if (items.length < 2) continue;

      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i];
          const b = items[j];

          // Skip if same drawing
          if (a.drawing.drawingId === b.drawing.drawingId) continue;

          const pairKey = [a.drawing.drawingId, b.drawing.drawingId, a.xref.identifier].sort().join('___');
          if (processedPairs.has(pairKey)) continue;
          processedPairs.add(pairKey);

          const paramsA = a.xref.parameters || {};
          const paramsB = b.xref.parameters || {};

          // Check if one of them is superseded by revision
          const hasSuperseded = a.drawing.isSuperseded || b.drawing.isSuperseded;

          // A. Dimension Discrepancy
          if (paramsA.dimension && paramsB.dimension && paramsA.dimension !== paramsB.dimension) {
            const status = hasSuperseded ? 'REVISION_RESOLVED' : 'CONFLICT';
            conflicts.push({
              conflictId: `conf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              status,
              entityIdentifier: a.xref.identifier,
              building: a.drawing.building,
              floor: a.drawing.floor,
              discipline: a.drawing.discipline,
              sourceDrawingId: a.drawing.drawingId,
              sourceDescription: `${a.drawing.drawingNumber} (${a.drawing.title}): ${a.xref.category} ${a.xref.identifier} dimensi ${paramsA.dimension}`,
              conflictingDrawingId: b.drawing.drawingId,
              conflictingDescription: `${b.drawing.drawingNumber} (${b.drawing.title}): ${b.xref.category} ${b.xref.identifier} dimensi ${paramsB.dimension}`,
              discrepancyType: 'DIMENSION',
              suggestedResolution: hasSuperseded 
                ? `Discrepancy resolved by latest active revision (${a.drawing.isSuperseded ? b.drawing.revision : a.drawing.revision})`
                : `Verifikasi dimensi aktual ${a.xref.identifier} antara gambar denah dan detail/jadwal.`,
              detectedAt: new Date().toISOString()
            });
          }

          // B. Reinforcement Discrepancy
          if (paramsA.reinforcement && paramsB.reinforcement && paramsA.reinforcement !== paramsB.reinforcement) {
            const status = hasSuperseded ? 'REVISION_RESOLVED' : 'CONFLICT';
            conflicts.push({
              conflictId: `conf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              status,
              entityIdentifier: a.xref.identifier,
              building: a.drawing.building,
              floor: a.drawing.floor,
              discipline: a.drawing.discipline,
              sourceDrawingId: a.drawing.drawingId,
              sourceDescription: `${a.drawing.drawingNumber} (${a.drawing.title}): Pembesian ${paramsA.reinforcement}`,
              conflictingDrawingId: b.drawing.drawingId,
              conflictingDescription: `${b.drawing.drawingNumber} (${b.drawing.title}): Pembesian ${paramsB.reinforcement}`,
              discrepancyType: 'REINFORCEMENT',
              suggestedResolution: hasSuperseded
                ? `Resolved by active revision`
                : `Periksa spesifikasi pembesian utama pada gambar detail struktur pembesian.`,
              detectedAt: new Date().toISOString()
            });
          }

          // C. Concrete Quality / Material Discrepancy
          if (paramsA.concreteQuality && paramsB.concreteQuality && paramsA.concreteQuality !== paramsB.concreteQuality) {
            const status = hasSuperseded ? 'REVISION_RESOLVED' : 'NEEDS_REVIEW';
            conflicts.push({
              conflictId: `conf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              status,
              entityIdentifier: a.xref.identifier,
              building: a.drawing.building,
              floor: a.drawing.floor,
              discipline: a.drawing.discipline,
              sourceDrawingId: a.drawing.drawingId,
              sourceDescription: `${a.drawing.drawingNumber} (${a.drawing.title}): Mutu beton ${paramsA.concreteQuality}`,
              conflictingDrawingId: b.drawing.drawingId,
              conflictingDescription: `${b.drawing.drawingNumber} (${b.drawing.title}): Mutu beton ${paramsB.concreteQuality}`,
              discrepancyType: 'MATERIAL',
              suggestedResolution: `Gunakan mutu beton tertinggi atau konfirmasi dengan RKS/Spesifikasi Teknis.`,
              detectedAt: new Date().toISOString()
            });
          }
        }
      }
    }

    return conflicts;
  }
}
