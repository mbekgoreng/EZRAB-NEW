import type { DocumentDefinition, DocumentRecord, DocumentStatus, ProjectMasterData } from './types';
export const getDocumentStatus = (definition: DocumentDefinition, values: Record<string, unknown>, exported = false): { status: DocumentStatus; filled: number; total: number; missing: string[] } => { const fields = definition.fields.filter(f => f.required); const missing = fields.filter(f => values[f.id] === undefined || values[f.id] === null || String(values[f.id]).trim() === '').map(f => f.label); const filled = fields.length - missing.length; return { status: exported ? 'EXPORTED' : filled === 0 ? 'NOT_STARTED' : missing.length ? 'INCOMPLETE' : 'COMPLETE', filled, total: fields.length, missing }; };
export const createDocumentRecord = (definition: DocumentDefinition, master: ProjectMasterData): DocumentRecord => {
  const values: Record<string, unknown> = {};
  definition.fields.forEach((f) => {
    if (f.id in master) values[f.id] = master[f.id as keyof ProjectMasterData];
  });
  const result = getDocumentStatus(definition, values);
  const now = new Date().toISOString();
  return {
    id: `${definition.id}-REV-00`,
    definitionId: definition.id,
    documentId: definition.id,
    projectId: master.projectNumber || undefined,
    status: result.status === 'NOT_STARTED' ? 'DRAFT' : result.status,
    data: values,
    sourceData: { project: true },
    values,
    revision: 0,
    createdAt: now,
    updatedAt: now,
  };
};