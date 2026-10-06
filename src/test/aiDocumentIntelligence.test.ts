import { DOCUMENT_REGISTRY } from '../document-engine/registry';
import { LocalDocumentRepository } from '../document-engine/repository';
import { buildAiDocumentContext, createDraftDocumentsAfterConfirmation, mapTemplateFields, planProjectDocuments, reviewDocumentConsistency } from '../services/aiDocumentIntelligence';

const project: any = { id: 'project-a', name: 'Rumah A', location: 'Jakarta', status: 'in_progress' };
const context = buildAiDocumentContext(project, { rabItems: [{ id: 'r1', projectId: 'project-a', description: 'Beton', totalPrice: 10 } as any], scheduleTasks: [] });
if (context.projectId !== 'project-a' || context.documents.some(document => document.projectId !== 'project-a')) throw new Error('AI context crossed project boundary');
const plan = planProjectDocuments(context, DOCUMENT_REGISTRY.filter(definition => ['offer-letter', 'boq'].includes(definition.id)));
if (!plan.requiresConfirmation || plan.items.length !== 2 || !plan.items.every(item => item.status === 'NOT_CREATED')) throw new Error('Document planner did not produce a confirmation-gated plan');
if (mapTemplateFields(DOCUMENT_REGISTRY.find(definition => definition.id === 'offer-letter')!)['projectName'] !== 'AUTO') throw new Error('Template AUTO mapping missing');
const repository = new LocalDocumentRepository('project-a'); repository.clearAll();
if (repository.getProjectDocuments('project-a').length !== 0) throw new Error('Repository fixture not isolated');
const created = createDraftDocumentsAfterConfirmation(context, repository, ['boq']);
if (created.length !== 1 || created[0].status !== 'DRAFT' || created[0].revision !== 0) throw new Error('Confirmed draft was not created through document repository');
if (createDraftDocumentsAfterConfirmation(context, repository, ['boq']).length !== 0) throw new Error('Planner created duplicate document');
const findings = reviewDocumentConsistency({ ...context, documents: [{ ...created[0], userFieldValues: {}, values: { projectName: 'Project B' } }] });
if (findings.length !== 1 || findings[0].source !== 'Project Master → name') throw new Error('Consistency reviewer missed project mismatch');
console.log('AI Document Intelligence tests: PASS');