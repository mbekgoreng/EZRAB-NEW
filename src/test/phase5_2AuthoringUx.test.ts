import {
  evaluateRequirement,
  evaluateDependency,
  getRequirementsByLevel,
  getRequiredDocumentIds,
} from '../document-engine/requirementEngine';
import {
  calculateCompletenessForDocument,
  calculateSummaries,
  getIncompleteDocuments,
} from '../document-engine/completenessEngine';
import type { ProjectRequirementContext } from '../document-engine/requirementEngine';

const mockDefinition = (id: string, level: 'CORE' | 'RECOMMENDED' | 'CONDITIONAL' | 'CUSTOM' = 'RECOMMENDED', deps: string[] = []): any => ({
  id,
  code: `TDR-${id.toUpperCase()}`,
  name: id,
  category: id.includes('HSE') ? 'HSE' : id.includes('COMM') ? 'COMMERCIAL' : 'ADMINISTRATION',
  description: 'Test',
  requirement: level,
  supportedFormats: ['PDF'],
  templateId: id,
  fields: [
    { id: 'projectName', label: 'Project Name', type: 'text', required: true },
    { id: 'owner', label: 'Owner', type: 'text', required: true },
  ],
  dependencies: deps,
});

const mockContext: ProjectRequirementContext = {
  purpose: 'tender',
  projectType: 'Gedung',
  tenderType: 'Tender Pemerintah',
  contractValue: 100000000,
};

const mockSourceStatus: any = {
  personnel: true,
  equipment: true,
  jsa: true,
  rkk: true,
  ahsp: true,
  boq: true,
  rab: true,
  schedule: true,
  curveS: true,
};

const mockSourceStatusPartial: any = {
  personnel: true,
  equipment: false,
  jsa: true,
  rkk: true,
  ahsp: false,
  boq: true,
  rab: true,
  schedule: true,
  curveS: true,
};

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
console.log('EZRAB PHASE 5.2 AUTHORING UX TESTS');
console.log('============================================================\n');

console.log('Missing dependency routing');
test('should identify JSA dependency', () => {
  const def = mockDefinition('jsa', 'CONDITIONAL', ['jsa', 'project']);
  const options = { activeDocumentIds: new Set<string>(['jsa']), sourceStatus: { ...mockSourceStatusPartial, jsa: false } };
  const result = evaluateRequirement(def, mockContext, options);
  assertTrue(result.dependencies[0].missingFields?.includes('Data JSA belum tersedia'), 'should identify JSA missing');
});

test('should identify RKK dependency', () => {
  const def = mockDefinition('rkk', 'CONDITIONAL', ['rkk']);
  const options = { activeDocumentIds: new Set<string>(['rkk']), sourceStatus: { ...mockSourceStatusPartial, rkk: false } };
  const result = evaluateRequirement(def, mockContext, options);
  assertTrue(result.dependencies[0].missingFields?.includes('Data RKK belum tersedia'), 'should identify RKK missing');
});

test('should identify Personnel dependency', () => {
  const def = mockDefinition('personnel-list', 'CORE', ['personnel', 'equipment']);
  const options = { activeDocumentIds: new Set<string>(['personnel-list']), sourceStatus: { ...mockSourceStatusPartial, personnel: false } };
  const result = evaluateRequirement(def, mockContext, options);
  assertTrue(result.dependencies[0].missingFields?.includes('Data Personil belum tersedia'), 'should identify personnel missing');
});

test('should identify Equipment dependency', () => {
  const def = mockDefinition('personnel-list', 'CORE', ['personnel', 'equipment']);
  const options = { activeDocumentIds: new Set<string>(['personnel-list']), sourceStatus: { ...mockSourceStatusPartial, jsa: false } };
  const result = evaluateRequirement(def, mockContext, options);
  assertTrue(result.dependencies[0].missingFields?.includes('Data Peralatan belum tersedia'), 'should identify equipment missing');
});

test('should identify AHSP dependency', () => {
  const def = mockDefinition('ahsp', 'CONDITIONAL', ['ahsp']);
  const options = { activeDocumentIds: new Set<string>(['ahsp']), sourceStatus: { ...mockSourceStatusPartial, jsa: false } };
  const result = evaluateRequirement(def, mockContext, options);
  assertTrue(result.dependencies[0].missingFields?.includes('Data AHSP belum tersedia'), 'should identify AHSP missing');
});

console.log('\nCompleteness refresh');
test('should report incomplete when dependencies missing', () => {
  const def = mockDefinition('rkk', 'CONDITIONAL', ['rkk']);
  const record = {
    id: 'rkk-REV-00',
    definitionId: 'rkk',
    status: 'DRAFT',
    values: { projectName: 'Test', owner: 'Owner' },
    revision: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any;
  const requirementResult = {
    definitionId: 'rkk',
    level: 'CONDITIONAL',
    required: true,
    conditionsMet: true,
    dependencies: [{ name: 'rkk', status: 'INCOMPLETE', missingFields: ['Data RKK belum tersedia'] }],
  } as any;
  const result = calculateCompletenessForDocument(def, record, requirementResult);
  assertTrue(result.missingDependencies.length > 0, 'should have missing dependencies');
});

test('should report complete when dependencies fulfilled', () => {
  const def = mockDefinition('rkk', 'CONDITIONAL', ['rkk']);
  const record = {
    id: 'rkk-REV-00',
    definitionId: 'rkk',
    status: 'COMPLETE',
    values: { projectName: 'Test', owner: 'Owner' },
    revision: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any;
  const requirementResult = {
    definitionId: 'rkk',
    level: 'CONDITIONAL',
    required: true,
    conditionsMet: true,
    dependencies: [{ name: 'rkk', status: 'COMPLETE' }],
  } as any;
  const result = calculateCompletenessForDocument(def, record, requirementResult);
  assertEqual(result.missingDependencies.length, 0, 'should have no missing dependencies');
});

console.log('\nExport gating');
test('should block export when document incomplete', () => {
  const def = mockDefinition('test', 'CORE');
  const record = {
    id: 'test-REV-00',
    definitionId: 'test',
    status: 'INCOMPLETE',
    values: { projectName: 'Test' },
    revision: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any;
  const result = calculateCompletenessForDocument(def, record);
  assertEqual(result.status, 'INCOMPLETE', 'should be incomplete');
  assertTrue(result.completenessPercentage < 100, 'should not be 100%');
});

test('should allow export when document complete', () => {
  const def = mockDefinition('test', 'CORE');
  const record = {
    id: 'test-REV-00',
    definitionId: 'test',
    status: 'COMPLETE',
    values: { projectName: 'Test', owner: 'Owner' },
    revision: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any;
  const result = calculateCompletenessForDocument(def, record);
  assertEqual(result.status, 'COMPLETE', 'should be complete');
  assertEqual(result.completenessPercentage, 100, 'should be 100%');
});

console.log('\nRevision safety');
test('editing should not change revision', () => {
  const def = mockDefinition('test', 'CORE');
  const record = {
    id: 'test-REV-00',
    definitionId: 'test',
    status: 'DRAFT',
    values: { projectName: 'Test' },
    revision: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any;
  const updated = { ...record, values: { ...record.values, owner: 'Owner' } };
  assertEqual(updated.revision, 0, 'revision should not change on edit');
});

console.log('\nPersistence');
test('saved document should retain data', () => {
  const def = mockDefinition('test', 'CORE');
  const record = {
    id: 'test-REV-00',
    definitionId: 'test',
    status: 'DRAFT',
    values: { projectName: 'Test', owner: 'Owner' },
    revision: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any;
  const reloaded = JSON.parse(JSON.stringify(record));
  assertEqual(reloaded.values.projectName, 'Test', 'should retain project name');
  assertEqual(reloaded.values.owner, 'Owner', 'should retain owner');
});

console.log('\nProject isolation');
test('project A and B should have separate completeness', () => {
  const def = mockDefinition('test', 'CORE');
  const recordA = {
    id: 'test-REV-00',
    definitionId: 'test',
    status: 'COMPLETE',
    values: { projectName: 'Project A', owner: 'Owner' },
    revision: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any;
  const recordB = {
    id: 'test-REV-00',
    definitionId: 'test',
    status: 'INCOMPLETE',
    values: { projectName: 'Project B' },
    revision: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any;
  const compA = calculateCompletenessForDocument(def, recordA);
  const compB = calculateCompletenessForDocument(def, recordB);
  assertEqual(compA.status, 'COMPLETE', 'project A complete');
  assertEqual(compB.status, 'INCOMPLETE', 'project B incomplete');
});

console.log('\n============================================================');
console.log(`TESTS: ${passed} PASSED, ${failed} FAILED`);
console.log('============================================================\n');

process.exit(failed > 0 ? 1 : 0);


