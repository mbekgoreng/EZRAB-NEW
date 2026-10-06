import { buildReadOnlyProjectContext } from '../services/aiProjectContext';
import type { Project, RabItem } from '../types';

const project: Project = {
  id: 'PRJ-CONTEXT-01',
  name: 'Proyek Context',
  location: 'Jakarta',
  status: 'in_progress',
  sections: [],
  costSummary: {
    directCost: 0, overheadPercent: 0, overheadAmount: 0, profitPercent: 0,
    profitAmount: 0, contingencyPercent: 0, contingencyAmount: 0,
    directorMarkupPercent: 0, directorMarkupNominal: 0, directorMarkupTotal: 0,
    showMarkupToEditor: false, showMarkupToClient: false, subtotalBeforeTax: 0,
    taxPercent: 0, taxAmount: 0, grandTotal: 0, costPerM2: 0,
  },
  createdAt: '2026-09-13T00:00:00.000Z',
};

const rab: RabItem[] = [{
  id: 'RAB-01', projectId: project.id, no: 1, code: 'BETON-01',
  category: 'Struktur', description: 'Beton bertulang', volume: 10, unit: 'm3',
  unitPrice: 1000000, amount: 10000000, totalPrice: 10000000,
}];

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runAiProjectContextTests(): void {
  const context = buildReadOnlyProjectContext({ project, rabItems: rab, question: 'Berapa total RAB beton?' });
  assert(context.project.available, 'active project is included');
  assert(context.rab.available && context.rab.total === 10000000, 'RAB total is derived from supplied items');
  assert(context.rab.items.length === 1, 'relevant RAB item is included');
  assert(context.metadata.is_read_only, 'context is explicitly read-only');
  assert(JSON.stringify(context).indexOf('OPENAI_API_KEY') === -1, 'context contains no credential fields');

  const withoutProject = buildReadOnlyProjectContext({ project: null, question: 'status proyek' });
  assert(!withoutProject.project.available, 'missing project is unavailable');
  assert(withoutProject.rab.total === null, 'missing project never invents a RAB total');

  const withoutRab = buildReadOnlyProjectContext({ project, rabItems: [], question: 'total RAB' });
  assert(withoutRab.rab.available, 'an empty but available RAB collection is represented');
  assert(withoutRab.rab.total === 0, 'empty RAB is zero, not fabricated');
}

runAiProjectContextTests();
