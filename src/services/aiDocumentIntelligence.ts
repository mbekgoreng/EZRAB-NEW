import type { Project, RabItem, ScheduleTask } from '../types';
import { DOCUMENT_REGISTRY } from '../document-engine/registry';
import { classifyDocumentFields } from '../document-engine/templateEngine';
import type { DocumentDefinition, DocumentRecord, ProjectMasterData } from '../document-engine/types';
import type { DocumentRepository } from '../document-engine/repository';

export interface AiDocumentContext {
  projectId: string;
  project: Project;
  rabItems: RabItem[];
  scheduleTasks: ScheduleTask[];
  documents: DocumentRecord[];
  availableSources: string[];
}

export interface AiDocumentPlanItem {
  definitionId: string;
  name: string;
  status: 'READY' | 'DRAFT' | 'INCOMPLETE' | 'NOT_CREATED';
  missingFields: string[];
  sources: string[];
}

export interface AiDocumentPlan { projectId: string; items: AiDocumentPlanItem[]; missingFields: string[]; requiresConfirmation: true; }

const valueMissing = (record: DocumentRecord | undefined, id: string) => {
  const values = record?.userFieldValues || record?.values || {};
  return !String(values[id] ?? '').trim();
};

export function buildAiDocumentContext(project: Project, input: Partial<AiDocumentContext> = {}): AiDocumentContext {
  // The project id is mandatory and is copied into every derived operation.
  return { projectId: project.id, project, rabItems: input.rabItems || [], scheduleTasks: input.scheduleTasks || [], documents: (input.documents || []).filter(d => d.projectId === project.id), availableSources: ['project', ...(input.rabItems?.length ? ['rab', 'boq'] : []), ...(input.scheduleTasks?.length ? ['schedule'] : [])] };
}

export function planProjectDocuments(context: AiDocumentContext, definitions: DocumentDefinition[] = DOCUMENT_REGISTRY): AiDocumentPlan {
  const items = definitions.map(definition => {
    const record = context.documents.find(d => d.definitionId === definition.id);
    const fields = classifyDocumentFields(definition);
    const missingFields = fields.userFields.filter(field => field.required !== false && valueMissing(record, field.id)).map(field => field.label);
    const status: AiDocumentPlanItem['status'] = !record ? 'NOT_CREATED' : missingFields.length ? 'INCOMPLETE' : record.status === 'EXPORTED' || record.status === 'COMPLETE' ? 'READY' : 'DRAFT';
    return { definitionId: definition.id, name: definition.name, status, missingFields, sources: definition.dependencies || ['project'] };
  });
  return { projectId: context.projectId, items, missingFields: [...new Set(items.flatMap(item => item.missingFields))], requiresConfirmation: true };
}

export function mapTemplateFields(definition: DocumentDefinition): Record<string, 'AUTO' | 'USER' | 'OPTIONAL' | 'CONDITIONAL'> {
  const classified = classifyDocumentFields(definition);
  return Object.fromEntries([
    ...classified.autoFields.map(field => [field.id, 'AUTO']),
    ...classified.userFields.map(field => [field.id, 'USER']),
    ...classified.optionalFields.map(field => [field.id, 'OPTIONAL']),
  ]) as Record<string, 'AUTO' | 'USER' | 'OPTIONAL' | 'CONDITIONAL'>;
}

export function createDraftDocumentsAfterConfirmation(context: AiDocumentContext, repository: DocumentRepository, definitionIds: string[]): DocumentRecord[] {
  const created: DocumentRecord[] = [];
  for (const definitionId of definitionIds) {
    const definition = DOCUMENT_REGISTRY.find(definitionItem => definitionItem.id === definitionId);
    if (!definition || repository.getDocument(definitionId)) continue;
    const now = new Date().toISOString();
    const record: DocumentRecord = { id: `${definitionId}-REV-00`, definitionId, documentId: definitionId, projectId: context.projectId, status: 'DRAFT', data: {}, sourceData: { project: true }, values: {}, userFieldValues: {}, revision: 0, createdAt: now, updatedAt: now };
    repository.saveDocument(record);
    created.push(record);
  }
  return created;
}

export interface DocumentReviewFinding { documentIds: string[]; field: string; message: string; source: string; }

export function reviewDocumentConsistency(context: AiDocumentContext): DocumentReviewFinding[] {
  const findings: DocumentReviewFinding[] = [];
  const projectName = context.project.name;
  for (const record of context.documents) {
    const values = { ...(record.values || {}), ...(record.userFieldValues || {}) };
    for (const [field, value] of Object.entries(values)) {
      if (typeof value === 'string' && value.trim() && /project|proyek/i.test(field) && value.trim() !== projectName) findings.push({ documentIds: [record.definitionId], field, message: `Nilai tidak sama dengan project aktif: ${value}`, source: 'Project Master → name' });
    }
  }
  return findings;
}

export type { ProjectMasterData };