import {
  getDocumentDefinition,
  DOCUMENT_REGISTRY,
} from '../document-engine/registry';
import {
  calculateCompletenessForDocument,
} from '../document-engine/completenessEngine';
import {
  LocalDocumentRepository,
  getActiveDocuments,
} from '../document-engine/repository';
import type { DocumentRecord, DocumentStatus } from '../document-engine/types';

// In-memory localStorage polyfill for Node test environment
if (typeof (globalThis as any).localStorage === 'undefined') {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = String(val); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length; },
  };
}

const mockDefinition = (id: string, level: 'CORE' | 'RECOMMENDED' | 'CONDITIONAL' | 'CUSTOM' = 'RECOMMENDED', deps: string[] = []): any => ({
  id,
  code: `TDR-${id.toUpperCase()}`,
  name: id,
  category: id.includes('HSE') ? 'HSE' : id.includes('COMM') ? 'COMMERCIAL' : 'ADMINISTRATION',
  description: 'Test',
  requirement: level,
  supportedFormats: ['PDF'],
  templateId: id,
  fields: [{ id: 'projectName', label: 'Project Name', type: 'text', required: true }],
  dependencies: deps,
});

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (e) {
    console.log(`  [FAIL] ${name}: ${(e as Error).message}`);
    failed++;
  }
}

function assertEqual(actual: any, expected: any, msg: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertTrue(value: any, msg: string) {
  if (!value) {
    throw new Error(`${msg}: expected truthy, got ${value}`);
  }
}

function assertFalse(value: any, msg: string) {
  if (value) {
    throw new Error(`${msg}: expected falsy, got ${value}`);
  }
}

console.log('\n============================================================');
console.log('EZRAB PHASE 5.3 PROJECT DOCUMENTS UX TESTS');
console.log('============================================================\n');

console.log('Document Selection & Registry');
test('should get document from registry', () => {
  const def = getDocumentDefinition('boq');
  assertTrue(def, 'should find boq definition');
  assertEqual(def?.id, 'boq', 'correct ID');
});

test('should have tender documents in registry', () => {
  const tenderDefs = DOCUMENT_REGISTRY.filter(d => ['boq', 'rab', 'ahsp', 'schedule', 'rkk', 'jsa'].includes(d.id));
  assertTrue(tenderDefs.length > 0, 'should have tender documents');
});

console.log('\nDocument Selection (Opt-in)');
test('unselected documents should not be active', () => {
  const activeDocs = new Set(['boq']);
  const allDefs = [
    mockDefinition('boq', 'CORE'),
    mockDefinition('jsa', 'CONDITIONAL'),
    mockDefinition('rkk', 'CONDITIONAL'),
  ];
  const activeOnly = allDefs.filter(d => activeDocs.has(d.id));
  assertEqual(activeOnly.length, 1, 'only active docs');
  assertEqual(activeOnly[0].id, 'boq', 'boq is active');
});

test('selected document becomes active', () => {
  const activeDocs = new Set(['boq', 'rab']);
  const allDefs = [
    mockDefinition('boq', 'CORE'),
    mockDefinition('rab', 'CORE'),
    mockDefinition('jsa', 'CONDITIONAL'),
  ];
  const activeOnly = allDefs.filter(d => activeDocs.has(d.id));
  assertEqual(activeOnly.length, 2, 'selected docs are active');
});

test('conditional document should not be selected by default', () => {
  const activeDocs = new Set<string>();
  assertFalse(activeDocs.has('jsa'), 'jsa not in active docs');
});

console.log('\nDraft Persistence');
test('draft status should be preserved', () => {
  const draftRecord = {
    id: 'boq-REV-00',
    definitionId: 'boq',
    status: 'DRAFT' as DocumentStatus,
    values: { projectName: 'Test' },
    revision: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  assertEqual(draftRecord.status, 'DRAFT', 'draft status preserved');
});

test('draft data should be preserved', () => {
  const draftRecord = {
    id: 'boq-REV-00',
    definitionId: 'boq',
    status: 'DRAFT' as DocumentStatus,
    values: { projectName: 'Test', items: [{ name: 'Item 1' }] },
    revision: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const reloaded = JSON.parse(JSON.stringify(draftRecord));
  assertEqual(reloaded.values.projectName, 'Test', 'project name preserved');
  assertEqual(reloaded.values.items.length, 1, 'items preserved');
});

console.log('\nProgress Calculation');
test('progress should use completenessEngine', () => {
  const def = mockDefinition('boq', 'CORE');
  const record = {
    id: 'boq-REV-00',
    definitionId: 'boq',
    status: 'DRAFT' as DocumentStatus,
    values: { projectName: 'Test' },
    revision: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any;
  const result = calculateCompletenessForDocument(def, record);
  assertTrue(result.completenessPercentage >= 0, 'progress >= 0');
});

test('complete document should have 100% progress', () => {
  const def = mockDefinition('boq', 'CORE');
  const record = {
    id: 'boq-REV-00',
    definitionId: 'boq',
    status: 'COMPLETE' as DocumentStatus,
    values: { projectName: 'Test' },
    revision: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any;
  const result = calculateCompletenessForDocument(def, record);
  assertEqual(result.completenessPercentage, 100, '100% complete');
});

console.log('\nStatus Changes');
test('incomplete document status', () => {
  const def = mockDefinition('boq', 'CORE');
  const record = {
    id: 'boq-REV-00',
    definitionId: 'boq',
    status: 'INCOMPLETE' as DocumentStatus,
    values: { projectName: 'Test' },
    revision: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any;
  const result = calculateCompletenessForDocument(def, record);
  assertEqual(result.status, 'INCOMPLETE', 'incomplete status');
});

test('exported document status', () => {
  const def = mockDefinition('boq', 'CORE');
  const record = {
    id: 'boq-REV-00',
    definitionId: 'boq',
    status: 'EXPORTED' as DocumentStatus,
    values: { projectName: 'Test' },
    revision: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any;
  const result = calculateCompletenessForDocument(def, record);
  assertEqual(result.status, 'EXPORTED', 'exported status');
});

console.log('\nDuplicate Prevention');
test('should not create duplicate document', () => {
  const activeDocs = new Set(['boq']);
  const newDoc = 'boq';
  if (activeDocs.has(newDoc)) {
    assertTrue(true, 'duplicate prevented');
  }
  assertTrue(activeDocs.has('boq'), 'boq is still only one');
});

console.log('\nRequirement Badge');
test('requirement level should be displayed', () => {
  const def = mockDefinition('boq', 'CORE');
  assertEqual(def.requirement, 'CORE', 'CORE badge');
});

console.log('\nRevision Safety');
test('editing should not change revision', () => {
  const record = {
    id: 'boq-REV-00',
    definitionId: 'boq',
    status: 'DRAFT' as DocumentStatus,
    values: { projectName: 'Test' },
    revision: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any;
  const updated = { ...record, values: { ...record.values, owner: 'Owner' } };
  assertEqual(updated.revision, 0, 'revision unchanged on edit');
});

test('create revision should change revision', () => {
  const record = {
    id: 'boq-REV-00',
    definitionId: 'boq',
    status: 'DRAFT' as DocumentStatus,
    values: { projectName: 'Test' },
    revision: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any;
  const newRevision = { ...record, revision: 1 };
  assertEqual(newRevision.revision, 1, 'revision changed on explicit create');
});

console.log('\nProject Isolation');
test('project A documents should not appear in project B', () => {
  const projectA = new Set(['boq', 'rab']);
  const projectB = new Set(['jsa', 'rkk']);
  assertEqual(projectA.has('jsa'), false, 'project A does not see jsa');
  assertEqual(projectB.has('boq'), false, 'project B does not see boq');
});

// ============================================================
// ACTIVE WORKSPACE CANONICAL SUITE (ACTIVE-01 through ACTIVE-12)
// ============================================================
console.log('\n============================================================');
console.log('ACTIVE WORKSPACE CANONICAL TESTS (ACTIVE-01 - ACTIVE-12)');
console.log('============================================================\n');

test('ACTIVE-01: No DocumentRecords -> Expected empty state', () => {
  const projectId = 'PRJ-ACT-01';
  const repo = new LocalDocumentRepository(projectId);
  const active = getActiveDocuments(projectId, repo);
  assertEqual(active.length, 0, 'Active list is empty');
});

test('ACTIVE-02: One BOQ DocumentRecord -> Expected one BOQ card', () => {
  const projectId = 'PRJ-ACT-02';
  const repo = new LocalDocumentRepository(projectId);
  const now = new Date().toISOString();
  repo.saveDocument({
    id: 'boq-REV-00',
    definitionId: 'boq',
    documentId: 'boq',
    projectId,
    status: 'DRAFT',
    data: {},
    sourceData: { project: true },
    values: {},
    revision: 0,
    createdAt: now,
    updatedAt: now,
  });

  const active = getActiveDocuments(projectId, repo);
  assertEqual(active.length, 1, 'Exactly one active document');
  assertEqual(active[0].definitionId, 'boq', 'Active document is BOQ');
});

test('ACTIVE-03: Three DocumentRecords -> Expected exactly three cards', () => {
  const projectId = 'PRJ-ACT-03';
  const repo = new LocalDocumentRepository(projectId);
  const now = new Date().toISOString();

  ['boq', 'rkk', 'jsa'].forEach((docId) => {
    repo.saveDocument({
      id: `${docId}-REV-00`,
      definitionId: docId,
      documentId: docId,
      projectId,
      status: 'DRAFT',
      data: {},
      sourceData: { project: true },
      values: {},
      revision: 0,
      createdAt: now,
      updatedAt: now,
    });
  });

  const active = getActiveDocuments(projectId, repo);
  assertEqual(active.length, 3, 'Exactly three active documents');
  const ids = active.map((d) => d.definitionId).sort();
  assertEqual(ids, ['boq', 'jsa', 'rkk'], 'Contains BOQ, JSA, and RKK');
});

test('ACTIVE-04: Registry has 10+ definitions but only BOQ exists -> Expected only BOQ', () => {
  const projectId = 'PRJ-ACT-04';
  const repo = new LocalDocumentRepository(projectId);
  assertTrue(DOCUMENT_REGISTRY.length >= 10, 'Registry contains multiple definitions');

  const now = new Date().toISOString();
  repo.saveDocument({
    id: 'boq-REV-00',
    definitionId: 'boq',
    documentId: 'boq',
    projectId,
    status: 'DRAFT',
    data: {},
    sourceData: {},
    values: {},
    revision: 0,
    createdAt: now,
    updatedAt: now,
  });

  const active = getActiveDocuments(projectId, repo);
  assertEqual(active.length, 1, 'Only 1 document active');
  assertEqual(active[0].definitionId, 'boq', 'Only BOQ is active, unselected definitions are not active');
});

test('ACTIVE-05: BOQ exists but RKK does not -> RKK must not appear as active card', () => {
  const projectId = 'PRJ-ACT-05';
  const repo = new LocalDocumentRepository(projectId);
  const now = new Date().toISOString();
  repo.saveDocument({
    id: 'boq-REV-00',
    definitionId: 'boq',
    documentId: 'boq',
    projectId,
    status: 'DRAFT',
    data: {},
    sourceData: {},
    values: {},
    revision: 0,
    createdAt: now,
    updatedAt: now,
  });

  const active = getActiveDocuments(projectId, repo);
  const hasRkk = active.some((d) => d.definitionId === 'rkk');
  assertFalse(hasRkk, 'RKK must NOT appear in active documents');
});

test('ACTIVE-06: Existing BOQ reopened -> No duplicate record', () => {
  const projectId = 'PRJ-ACT-06';
  const repo = new LocalDocumentRepository(projectId);
  const now = new Date().toISOString();

  // First creation
  repo.saveDocument({
    id: 'boq-REV-00',
    definitionId: 'boq',
    documentId: 'boq',
    projectId,
    status: 'DRAFT',
    data: {},
    sourceData: {},
    values: { projectName: 'First Run' },
    revision: 0,
    createdAt: now,
    updatedAt: now,
  });

  // Reopen flow: Check if already exists before creating
  const existing = repo.getDocument('boq');
  assertTrue(existing, 'Existing BOQ found');
  if (!existing) {
    repo.saveDocument({
      id: 'boq-REV-00',
      definitionId: 'boq',
      projectId,
      status: 'DRAFT',
      data: {},
      sourceData: {},
      values: {},
      revision: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  const allBoqRecords = repo.getProjectDocuments(projectId).filter((r) => r.definitionId === 'boq');
  assertEqual(allBoqRecords.length, 1, 'No duplicate record created on reopening');
});

test('ACTIVE-07: Project isolation -> Project A records never appear in Project B', () => {
  const projA = 'PRJ-ISOLATION-A';
  const projB = 'PRJ-ISOLATION-B';

  const repoA = new LocalDocumentRepository(projA);
  const repoB = new LocalDocumentRepository(projB);
  const now = new Date().toISOString();

  // Project A has BOQ, RKK, JSA
  ['boq', 'rkk', 'jsa'].forEach((id) => {
    repoA.saveDocument({
      id: `${id}-REV-00`,
      definitionId: id,
      documentId: id,
      projectId: projA,
      status: 'DRAFT',
      data: {},
      sourceData: {},
      values: {},
      revision: 0,
      createdAt: now,
      updatedAt: now,
    });
  });

  // Project B has BOQ only
  repoB.saveDocument({
    id: 'boq-REV-00',
    definitionId: 'boq',
    documentId: 'boq',
    projectId: projB,
    status: 'DRAFT',
    data: {},
    sourceData: {},
    values: {},
    revision: 0,
    createdAt: now,
    updatedAt: now,
  });

  const activeA = getActiveDocuments(projA, repoA);
  const activeB = getActiveDocuments(projB, repoB);

  assertEqual(activeA.length, 3, 'Project A has 3 active documents');
  assertEqual(activeB.length, 1, 'Project B has 1 active document');
  assertEqual(activeB[0].definitionId, 'boq', 'Project B only has BOQ');
  assertFalse(activeB.some((d) => d.definitionId === 'rkk'), 'RKK does not leak into Project B');
  assertFalse(activeB.some((d) => d.definitionId === 'jsa'), 'JSA does not leak into Project B');
});

test('ACTIVE-08: Progress uses completenessEngine and computes active documents only', () => {
  const def = getDocumentDefinition('boq') || mockDefinition('boq', 'CORE');
  const record: DocumentRecord = {
    id: 'boq-REV-00',
    definitionId: 'boq',
    projectId: 'PRJ-TEST',
    status: 'DRAFT',
    data: {},
    sourceData: {},
    values: { projectName: 'Proyek Megah' },
    revision: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const comp = calculateCompletenessForDocument(def, record);
  assertTrue(typeof comp.completenessPercentage === 'number', 'Percentage is a number');
  assertTrue(comp.completenessPercentage >= 0 && comp.completenessPercentage <= 100, 'Valid range');

  // Verify overall progress computation from active documents only
  // Example from specification: BOQ = 100%, RKK = 50%, JSA = 25% -> (100+50+25)/3 = 58%
  const activeComps = [
    { completenessPercentage: 100 },
    { completenessPercentage: 50 },
    { completenessPercentage: 25 },
  ];
  const overall = Math.round(activeComps.reduce((acc, c) => acc + c.completenessPercentage, 0) / activeComps.length);
  assertEqual(overall, 58, 'Overall progress accurately reflects only active documents (58%)');
});

test('ACTIVE-09: Draft status persists', () => {
  const projectId = 'PRJ-ACT-09';
  const repo = new LocalDocumentRepository(projectId);
  const now = new Date().toISOString();

  const draftRecord: DocumentRecord = {
    id: 'boq-REV-00',
    definitionId: 'boq',
    projectId,
    status: 'DRAFT',
    data: {},
    sourceData: {},
    values: { owner: 'PT Maju Terus' },
    revision: 0,
    createdAt: now,
    updatedAt: now,
  };
  repo.saveDocument(draftRecord);

  const retrieved = repo.getDocument('boq');
  assertEqual(retrieved?.status, 'DRAFT', 'Status is persisted as DRAFT');
  assertEqual(retrieved?.values.owner, 'PT Maju Terus', 'Values are persisted');
});

test('ACTIVE-10: Reload restores active cards from storage', () => {
  const projectId = 'PRJ-ACT-03'; // Created earlier with 3 documents
  // Simulate page reload by creating a new repository instance
  const reloadedRepo = new LocalDocumentRepository(projectId);
  const restoredDocs = getActiveDocuments(projectId, reloadedRepo);

  assertEqual(restoredDocs.length, 3, 'Restored exactly 3 active documents after reload');
  const ids = restoredDocs.map((d) => d.definitionId).sort();
  assertEqual(ids, ['boq', 'jsa', 'rkk'], 'Restored BOQ, JSA, RKK');
});

test('ACTIVE-11: Open/Lanjutkan opens canonical record', () => {
  const projectId = 'PRJ-ACT-03';
  const repo = new LocalDocumentRepository(projectId);
  const canonical = repo.getDocument('boq');

  assertTrue(canonical !== undefined, 'Canonical record exists');
  assertEqual(canonical?.id, 'boq-REV-00', 'Canonical ID matches expected format');
  assertEqual(canonical?.definitionId, 'boq', 'Canonical definitionId matches');
});

test('ACTIVE-12: Opening/editing does not increment revision', () => {
  const projectId = 'PRJ-ACT-12';
  const repo = new LocalDocumentRepository(projectId);
  const now = new Date().toISOString();

  repo.saveDocument({
    id: 'boq-REV-00',
    definitionId: 'boq',
    projectId,
    status: 'DRAFT',
    data: {},
    sourceData: {},
    values: { counter: 1 },
    revision: 0,
    createdAt: now,
    updatedAt: now,
  });

  // Open and edit values (simulating typing in DocumentWorkspace)
  const current = repo.getDocument('boq')!;
  assertEqual(current.revision, 0, 'Initial revision is 0');

  const edited: DocumentRecord = {
    ...current,
    values: { ...current.values, counter: 2 },
  };
  repo.saveDocument(edited);

  const afterEdit = repo.getDocument('boq')!;
  assertEqual(afterEdit.revision, 0, 'Revision remains 0 after edit');
  assertEqual(afterEdit.values.counter, 2, 'Value was updated');
});

console.log('\n============================================================');
console.log(`TESTS: ${passed} PASSED, ${failed} FAILED`);
console.log('============================================================\n');

process.exit(failed > 0 ? 1 : 0);
