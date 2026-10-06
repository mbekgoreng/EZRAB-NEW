/**
 * Conflict Resolution Engine (Phase 6)
 *
 * Detects discrepancies between User Inputs, DED Drawings, and Estimating Database values.
 * Evaluates precedence rules and requires user authorization for material deviations.
 */

import {
  ConstructionEntity,
  ConflictRecord,
  ConflictPrecedenceRule
} from '../../src/domain/document/constructionEntityTypes';

export class ConflictResolutionEngine {
  private static instance: ConflictResolutionEngine;
  private conflicts: Map<string, ConflictRecord> = new Map();

  private constructor() {}

  public static getInstance(): ConflictResolutionEngine {
    if (!ConflictResolutionEngine.instance) {
      ConflictResolutionEngine.instance = new ConflictResolutionEngine();
    }
    return ConflictResolutionEngine.instance;
  }

  /**
   * Compare an entity with user overrides or baseline specifications
   */
  public detectConflicts(params: {
    projectId: string;
    entity: ConstructionEntity;
    userInputOverride?: Record<string, any>;
    tolerancePercent?: number;
  }): ConflictRecord[] {
    const { projectId, entity, userInputOverride, tolerancePercent = 2.0 } = params;
    const detected: ConflictRecord[] = [];

    if (!userInputOverride) return detected;

    for (const [key, userVal] of Object.entries(userInputOverride)) {
      const entityParam = entity.parameters[key];
      if (entityParam) {
        const docVal = Number(entityParam.value);
        const userNumVal = Number(userVal);

        if (!isNaN(docVal) && !isNaN(userNumVal) && docVal > 0) {
          const diffPct = Math.abs((userNumVal - docVal) / docVal) * 100;

          if (diffPct > tolerancePercent) {
            const conflictId = `cnf_${entity.entityId}_${key}_${Date.now()}`;
            const rule: ConflictPrecedenceRule = 'USER_OVERRIDE_DOCUMENT';

            const record: ConflictRecord = {
              conflictId,
              projectId,
              entityId: entity.entityId,
              entityName: entity.name,
              parameterKey: key,
              parameterName: entityParam.name,
              conflictingSources: [
                {
                  sourceType: 'DOCUMENT',
                  sourceId: entity.sourceDocumentId || 'doc_unknown',
                  sourceName: 'Gambar Kerja / DED',
                  pageNumber: entity.sourcePageNumber || 1,
                  value: docVal,
                  unit: entityParam.unit,
                  confidence: entityParam.confidence,
                  timestamp: new Date().toISOString()
                },
                {
                  sourceType: 'USER_INPUT',
                  sourceId: 'user_override',
                  sourceName: 'Input Langsung User',
                  value: userNumVal,
                  unit: entityParam.unit,
                  confidence: 1.0,
                  timestamp: new Date().toISOString()
                }
              ],
              differenceDescription: `Perbedaan nilai ${entityParam.name}: DED mencatat ${docVal} ${entityParam.unit || ''}, sedangkan User memasukkan ${userNumVal} ${entityParam.unit || ''} (Deviasi ${diffPct.toFixed(1)}%).`,
              recommendedValue: userNumVal,
              recommendedRule: rule,
              resolutionStatus: 'UNRESOLVED'
            };

            this.conflicts.set(conflictId, record);
            detected.push(record);
          }
        }
      }
    }

    return detected;
  }

  /**
   * Resolve conflict with chosen resolution
   */
  public resolveConflict(params: {
    conflictId: string;
    resolvedValue: number | string;
    resolvedBy: string;
    rationale?: string;
  }): ConflictRecord {
    const record = this.conflicts.get(params.conflictId);
    if (!record) {
      throw new Error(`Conflict record '${params.conflictId}' tidak ditemukan.`);
    }

    record.resolutionStatus = 'RESOLVED_BY_USER';
    record.resolvedValue = params.resolvedValue;
    record.resolvedBy = params.resolvedBy;
    record.resolvedAt = new Date().toISOString();
    record.resolutionRationale = params.rationale || 'Dikonfirmasi oleh Estimator.';

    return record;
  }

  /**
   * List unresolved conflicts for a project
   */
  public listUnresolvedConflicts(projectId: string): ConflictRecord[] {
    return Array.from(this.conflicts.values()).filter(
      c => c.projectId === projectId && c.resolutionStatus === 'UNRESOLVED'
    );
  }
}
