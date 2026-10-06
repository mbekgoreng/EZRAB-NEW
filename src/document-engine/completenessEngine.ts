import type { DocumentDefinition, DocumentRecord, DocumentStatus, DocumentRequirementResult, RequirementLevel, DocumentField } from './types';
import { classifyDocumentFields } from './templateEngine';

export interface DocumentCompletenessInfo {
  definitionId: string;
  status: DocumentStatus;
  isCore: boolean;
  isRequired: boolean;
  completenessPercentage: number;
  missingDependencies: string[];
  reason?: string;
}

export interface CompletenessSummary {
  coreTotal: number;
  coreComplete: number;
  coreIncomplete: number;
  coreNotStarted: number;
  overallTotal: number;
  overallComplete: number;
  overallPercentage: number;
  incompleteDocumentIds: string[];
  missingDependenciesCount: number;
}

export const getDocumentStatusFromRecord = (record: DocumentRecord | undefined): DocumentStatus => {
  if (!record) return 'NOT_STARTED';
  return record.status;
};

export const calculateFieldCompleteness = (
  definition: DocumentDefinition,
  record: DocumentRecord | undefined
): { filled: number; total: number; percentage: number } => {
  const classification = classifyDocumentFields(definition);
  const fields = classification.userFields; // Only USER fields count as fillable
  const recordValues = record?.userFieldValues ?? record?.values ?? {};
  const missing = fields.filter((f) => 
    recordValues[f.id] === undefined || 
    recordValues[f.id] === null || 
    String(recordValues[f.id]).trim() === ''
  );
  const filled = fields.length - missing.length;
  const percentage = fields.length > 0 ? Math.round((filled / fields.length) * 100) : 100;
  return { filled, total: fields.length, percentage };
};

export const calculateCompletenessForDocument = (
  definition: DocumentDefinition,
  record: DocumentRecord | undefined,
  requirementResult?: DocumentRequirementResult
): DocumentCompletenessInfo => {
  const fieldInfo = calculateFieldCompleteness(definition, record);
  const status = getDocumentStatusFromRecord(record);
  const isCore = definition.requirement === 'CORE';
  const isRequired = requirementResult?.required ?? false;

  let percentage = fieldInfo.percentage;
  let missingDependencies: string[] = [];

  if (requirementResult?.dependencies.length) {
    const deps = requirementResult.dependencies.flatMap((d) => d.missingFields || []);
    missingDependencies = deps;
    if (deps.length > 0) {
      percentage = Math.max(0, percentage - (deps.length * 10));
    }
  }

  if (status === 'NOT_STARTED') {
    percentage = 0;
  } else if (status === 'COMPLETE' || status === 'EXPORTED') {
    percentage = 100;
  } else if (status === 'INCOMPLETE') {
    percentage = Math.min(percentage, 80);
  }

  const reason: string | undefined = missingDependencies.length > 0
    ? `Missing: ${missingDependencies.join(', ')}`
    : fieldInfo.total === 0
    ? 'No required fields'
    : `${fieldInfo.filled}/${fieldInfo.total} fields filled`;

  return {
    definitionId: definition.id,
    status,
    isCore,
    isRequired,
    completenessPercentage: percentage,
    missingDependencies,
    reason,
  };
};

export const calculateSummaries = (
  completions: DocumentCompletenessInfo[]
): CompletenessSummary => {
  const coreDocs = completions.filter((c) => c.isCore && c.isRequired);
  const coreTotal = coreDocs.length;
  const coreComplete = coreDocs.filter((c) => c.status === 'COMPLETE' || c.status === 'EXPORTED').length;
  const coreIncomplete = coreDocs.filter((c) => c.status === 'INCOMPLETE').length;
  const coreNotStarted = coreDocs.filter((c) => c.status === 'NOT_STARTED' || c.status === 'DRAFT').length;

  const overallDocs = completions.filter((c) => c.isRequired);
  const overallTotal = overallDocs.length;
  const overallComplete = overallDocs.filter((c) => c.status === 'COMPLETE' || c.status === 'EXPORTED').length;
  const overallPercentage = overallTotal > 0 ? Math.round((overallComplete / overallTotal) * 100) : 0;

  const incompleteIds = completions
    .filter((c) => c.isRequired && (c.status === 'INCOMPLETE' || c.status === 'NOT_STARTED' || c.status === 'DRAFT'))
    .map((c) => c.definitionId);

  const missingDepsCount = completions.reduce((acc, c) => acc + c.missingDependencies.length, 0);

  return {
    coreTotal,
    coreComplete,
    coreIncomplete,
    coreNotStarted,
    overallTotal,
    overallComplete,
    overallPercentage,
    incompleteDocumentIds: incompleteIds,
    missingDependenciesCount: missingDepsCount,
  };
};

export const getIncompleteDocuments = (
  completions: DocumentCompletenessInfo[]
): DocumentCompletenessInfo[] => {
  return completions.filter((c) => c.isRequired && c.status !== 'COMPLETE' && c.status !== 'EXPORTED');
};

export const groupByLevel = (
  completions: DocumentCompletenessInfo[],
  definitions: Map<string, DocumentDefinition>
): Record<string, DocumentCompletenessInfo[]> => {
  const groups: Record<string, DocumentCompletenessInfo[]> = {
    CORE: [],
    RECOMMENDED: [],
    CONDITIONAL: [],
    CUSTOM: [],
  };

  for (const c of completions) {
    const def = definitions.get(c.definitionId);
    const level = def?.requirement ?? 'RECOMMENDED';
    groups[level] = groups[level] || [];
    groups[level].push(c);
  }

  return groups;
};

export const getStatusLabel = (status: DocumentStatus): string => {
  switch (status) {
    case 'NOT_STARTED':
      return 'Belum dibuat';
    case 'DRAFT':
      return 'Draft';
    case 'INCOMPLETE':
      return 'Belum lengkap';
    case 'COMPLETE':
      return 'Lengkap';
    case 'EXPORTED':
      return 'Exported';
    default:
      return status;
  }
};

export const getLevelLabel = (level: RequirementLevel): string => {
  switch (level) {
    case 'CORE':
      return 'Wajib';
    case 'RECOMMENDED':
      return 'Opsional';
    case 'CONDITIONAL':
      return 'Conditional';
    case 'CUSTOM':
      return 'Custom';
    default:
      return level;
  }
};
