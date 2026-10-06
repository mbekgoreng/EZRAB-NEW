import type { DocumentDefinition, DocumentRequirementResult, DocumentRequirementDependency, RequirementLevel, DocumentStatus } from './types';

export interface ProjectRequirementContext {
  purpose?: 'tender' | 'pbg' | 'administrasi' | 'custom';
  projectType?: string;
  tenderType?: string;
  contractValue?: number;
  duration?: string;
  usesKSO?: boolean;
  usesSubcontractor?: boolean;
  signatoryType?: 'DIRECTOR' | 'AUTHORIZED';
}

export interface SourceStatus {
  personnel: boolean;
  equipment: boolean;
  jsa: boolean;
  rkk: boolean;
  ahsp: boolean;
  boq: boolean;
  rab: boolean;
  schedule: boolean;
  curveS: boolean;
}

export interface RequirementOptions {
  sourceStatus?: SourceStatus;
  activeDocumentIds?: Set<string>;
}

export const getSourceStatus = (sourceStatus?: SourceStatus): SourceStatus => ({
  personnel: !!sourceStatus?.personnel,
  equipment: !!sourceStatus?.equipment,
  jsa: !!sourceStatus?.jsa,
  rkk: !!sourceStatus?.rkk,
  ahsp: !!sourceStatus?.ahsp,
  boq: !!sourceStatus?.boq,
  rab: !!sourceStatus?.rab,
  schedule: !!sourceStatus?.schedule,
  curveS: !!sourceStatus?.curveS,
});

export const evaluateCondition = (definition: DocumentDefinition, context: ProjectRequirementContext, options?: RequirementOptions): { met: boolean; reason: string } => {
  const sourceStatus = getSourceStatus(options?.sourceStatus);
  const documentIds = options?.activeDocumentIds ?? new Set();
  const hasActiveDocument = documentIds.has(definition.id);
  const isHSEWorkflow = context.purpose === 'tender' || context.purpose === 'administrasi';
  const isHSERequired = (context.projectType || '').toLowerCase().includes('konstruksi') || 
    (context.tenderType || '').toLowerCase().includes('konstruksi');

  switch (definition.id) {
    case 'ahsp':
      if (!hasActiveDocument) {
        return { met: false, reason: 'Document not selected in tender checklist' };
      }
      if (!sourceStatus.rab) {
        return { met: false, reason: 'RAB data not available' };
      }
      return { met: true, reason: 'Document selected with RAB data available' };

    case 'curve-s':
    case 'kurva-s':
      if (!hasActiveDocument) {
        return { met: false, reason: 'Document not selected in tender checklist' };
      }
      if (!sourceStatus.schedule) {
        return { met: false, reason: 'Schedule data not available' };
      }
      return { met: true, reason: 'Document selected with schedule data available' };

    case 'rkk':
    case 'jsa':
    case 'ibpr':
      if (definition.category !== 'HSE') {
        return { met: true, reason: 'Non-HSE document, always applicable' };
      }
      if (!hasActiveDocument) {
        return { met: false, reason: 'Document not selected in tender checklist' };
      }
      if (!isHSERequired) {
        return { met: false, reason: 'HSE documentation not required for this project type' };
      }
      return { met: true, reason: 'HSE document required for construction project' };

    case 'personnel-availability':
    case 'personnel-list':
      if (!hasActiveDocument) {
        return { met: false, reason: 'Document not selected in tender checklist' };
      }
      return { met: true, reason: 'Document selected in tender checklist' };

    default:
      if (!hasActiveDocument) {
        return { met: false, reason: 'Document not selected in tender checklist' };
      }
      return { met: true, reason: 'Document selected in tender checklist' };
  }
};

export const evaluateDependency = (definition: DocumentDefinition, sourceStatus: SourceStatus): DocumentRequirementDependency => {
  const deps = (definition.dependencies || []).map((d) => d.toLowerCase());
  const missing: string[] = [];

  for (const dep of deps) {
    if (dep === 'project') {
      continue;
    }
    if (dep === 'boq' && !sourceStatus.boq) {
      missing.push('Data BOQ belum tersedia');
    } else if (dep === 'rab' && !sourceStatus.rab) {
      missing.push('Data RAB belum tersedia');
    } else if (dep === 'schedule' && !sourceStatus.schedule) {
      missing.push('Data Schedule belum tersedia');
    } else if ((dep === 'kurva-s' || dep === 'curve-s') && !sourceStatus.curveS) {
      missing.push('Data Kurva-S belum tersedia');
    } else if (dep === 'ahsp' && !sourceStatus.ahsp) {
      missing.push('Data AHSP belum tersedia');
    } else if (dep === 'rkk' && !sourceStatus.rkk) {
      missing.push('Data RKK belum tersedia');
    } else if (dep === 'jsa' && !sourceStatus.jsa) {
      missing.push('Data JSA belum tersedia');
    } else if (dep === 'personnel' && !sourceStatus.personnel) {
      missing.push('Data Personil belum tersedia');
    } else if (dep === 'equipment' && !sourceStatus.equipment) {
      missing.push('Data Peralatan belum tersedia');
    }
  }

  return {
    name: definition.id,
    status: missing.length > 0 ? 'INCOMPLETE' : 'COMPLETE',
    missingFields: missing.length > 0 ? missing : undefined,
  };
};

export const evaluateRequirement = (
  definition: DocumentDefinition,
  context: ProjectRequirementContext,
  options?: RequirementOptions
): DocumentRequirementResult => {
  const sourceStatus = getSourceStatus(options?.sourceStatus);
  const hasActiveDocument = options?.activeDocumentIds?.has(definition.id) ?? false;
  const isCore = definition.requirement === 'CORE';
  const isCondition = definition.requirement === 'CONDITIONAL';
  const isRecommended = definition.requirement === 'RECOMMENDED';
  const isCustom = definition.requirement === 'CUSTOM';

  const conditionResult = evaluateCondition(definition, context, options);
  const dependencies = evaluateDependency(definition, sourceStatus);

  let required: boolean;
  let reason: string | undefined;

  if (isCustom) {
    required = hasActiveDocument;
    reason = required ? 'Custom document selected by user' : 'Custom document not selected';
  } else if (isRecommended) {
    required = false;
    reason = 'Recommended but not mandatory';
  } else   if (isCore) {
    required = hasActiveDocument || context.purpose !== 'pbg';
    reason = hasActiveDocument ? 'Core document selected in checklist' : 'Core document required for tender/administration workflow';
  } else {
    required = conditionResult.met;
    reason = conditionResult.reason;
  }

  return {
    definitionId: definition.id,
    level: definition.requirement,
    required,
    reason,
    conditionsMet: conditionResult.met,
    dependencies: [dependencies],
  };
};

export const evaluateAllRequirements = (
  definitions: DocumentDefinition[],
  context: ProjectRequirementContext,
  options?: RequirementOptions
): DocumentRequirementResult[] => {
  return definitions.map((def) => evaluateRequirement(def, context, options));
};

export const getRequirementsByLevel = (
  results: DocumentRequirementResult[],
  level: RequirementLevel
): DocumentRequirementResult[] => {
  return results.filter((r) => r.level === level);
};

export const getRequiredDocumentIds = (
  results: DocumentRequirementResult[]
): string[] => {
  return results.filter((r) => r.required).map((r) => r.definitionId);
};
