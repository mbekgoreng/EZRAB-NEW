import {
  evaluateRequirement,
  evaluateAllRequirements,
  evaluateDependency,
  getRequirementsByLevel,
  getRequiredDocumentIds,
} from '../document-engine/requirementEngine';
import {
  calculateCompletenessForDocument,
  calculateSummaries,
  getIncompleteDocuments,
  groupByLevel,
  getStatusLabel,
  getLevelLabel,
} from '../document-engine/completenessEngine';
import type { ProjectRequirementContext } from '../document-engine/requirementEngine';

const mockDefinition = (id: string, level: 'CORE' | 'RECOMMENDED' | 'CONDITIONAL' | 'CUSTOM' = 'RECOMMENDED', deps: string[] = []): any => ({
  id,
  code: `TDR-${id.toUpperCase()}`,
  name: id,
  category: 'ADMINISTRATION',
  description: 'Test',
  requirement: level,
  supportedFormats: ['PDF'],
  templateId: id,
  fields: [{ id: 'projectName', label: 'Project Name', type: 'text', required: true }],
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

const mockSourceStatusEmpty: any = {
  personnel: false,
  equipment: false,
  jsa: false,
  rkk: false,
  ahsp: false,
  boq: false,
  rab: false,
  schedule: false,
  curveS: false,
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
console.log('EZRAB PHASE 5.1 REQUIREMENT ENGINE TESTS');
console.log('============================================================\n');

console.log('CORE document requirements');
test('should mark CORE as required when selected', () => {
  const def = mockDefinition('test-core', 'CORE');
  const options = { activeDocumentIds: new Set<string>(['test-core']), sourceStatus: mockSourceStatus };
  const result = evaluateRequirement(def, mockContext, options);
  assertEqual(result.level, 'CORE', 'level');
  assertTrue(result.required, 'required');
});

test('should mark CORE as required by default for tender', () => {
  const def = mockDefinition('test-core', 'CORE');
  const options = { sourceStatus: mockSourceStatus };
  const result = evaluateRequirement(def, mockContext, options);
  assertTrue(result.required, 'required');
});

console.log('\nRECOMMENDED document requirements');
test('should mark RECOMMENDED as not required by default', () => {
  const def = mockDefinition('test-recommend', 'RECOMMENDED');
  const options = { activeDocumentIds: new Set<string>(['test-recommend']), sourceStatus: mockSourceStatus };
  const result = evaluateRequirement(def, mockContext, options);
  assertEqual(result.level, 'RECOMMENDED', 'level');
  assertFalse(result.required, 'required');
});

console.log('\nCONDITIONAL document requirements');
test('should mark CONDITIONAL as required when conditions met', () => {
  const def = mockDefinition('ahsp', 'CONDITIONAL', ['rab', 'project']);
  const options = { activeDocumentIds: new Set<string>(['ahsp']), sourceStatus: mockSourceStatus };
  const result = evaluateRequirement(def, mockContext, options);
  assertEqual(result.level, 'CONDITIONAL', 'level');
  assertTrue(result.conditionsMet, 'conditionsMet');
});

test('should mark CONDITIONAL as not required when source unavailable', () => {
  const def = mockDefinition('ahsp', 'CONDITIONAL', ['rab', 'project']);
  const options = { activeDocumentIds: new Set<string>(['ahsp']), sourceStatus: mockSourceStatusEmpty };
  const result = evaluateRequirement(def, mockContext, options);
  assertFalse(result.conditionsMet, 'conditionsMet');
});

console.log('\nCUSTOM document requirements');
test('should mark CUSTOM as required only when selected', () => {
  const def = mockDefinition('custom-doc', 'CUSTOM');
  const options = { activeDocumentIds: new Set<string>(['custom-doc']) };
  const result = evaluateRequirement(def, mockContext, options);
  assertEqual(result.level, 'CUSTOM', 'level');
  assertTrue(result.required, 'required');
});

test('should mark CUSTOM as not required when not selected', () => {
  const def = mockDefinition('custom-doc', 'CUSTOM');
  const options = { activeDocumentIds: new Set<string>() };
  const result = evaluateRequirement(def, mockContext, options);
  assertFalse(result.required, 'required');
});

console.log('\nDependency evaluation');
test('should report COMPLETE when all dependencies available', () => {
  const def = mockDefinition('test', 'RECOMMENDED', ['personnel', 'equipment', 'project']);
  const dependency = evaluateDependency(def, mockSourceStatus);
  assertEqual(dependency.status, 'COMPLETE', 'status');
});

test('should report INCOMPLETE when dependencies missing', () => {
  const def = mockDefinition('test', 'RECOMMENDED', ['personnel', 'equipment', 'project']);
  const dependency = evaluateDependency(def, mockSourceStatusEmpty);
  assertEqual(dependency.status, 'INCOMPLETE', 'status');
  assertTrue(dependency.missingFields, 'missingFields');
});

test('should list specific missing dependencies', () => {
  const def = mockDefinition('test', 'RECOMMENDED', ['personnel', 'equipment', 'project']);
  const dependency = evaluateDependency(def, { ...mockSourceStatusEmpty, personnel: true });
  assertTrue(dependency.missingFields?.includes('Data Peralatan belum tersedia'), 'should include equipment missing');
});

console.log('\nFiltering by level');
test('should return only CORE requirements', () => {
  const definitions = [
    mockDefinition('a', 'CORE'),
    mockDefinition('b', 'RECOMMENDED'),
    mockDefinition('c', 'CORE'),
    mockDefinition('d', 'CONDITIONAL'),
  ];
  const options = { activeDocumentIds: new Set<string>(['a', 'b', 'c', 'd']), sourceStatus: mockSourceStatus };
  const results = evaluateAllRequirements(definitions, mockContext, options);
  const cores = getRequirementsByLevel(results, 'CORE');
  assertEqual(cores.length, 2, 'CORE count');
  assertEqual(cores.map((r: any) => r.definitionId), ['a', 'c'], 'CORE IDs');
});

console.log('\nRequired document IDs');
test('should return all required document IDs', () => {
  const definitions = [
    mockDefinition('a', 'CORE'),
    mockDefinition('b', 'RECOMMENDED'),
    mockDefinition('c', 'CUSTOM'),
  ];
  const options = { activeDocumentIds: new Set<string>(['a', 'c']), sourceStatus: mockSourceStatus };
  const results = evaluateAllRequirements(definitions, mockContext, options);
  const ids = getRequiredDocumentIds(results);
  assertTrue(ids.includes('a'), 'should include a');
  assertTrue(ids.includes('c'), 'should include c');
  assertFalse(ids.includes('b'), 'should not include b');
});

console.log('\nProject isolation');
test('should produce independent results per project context', () => {
  const def = mockDefinition('test', 'CORE');
  const options1 = { activeDocumentIds: new Set<string>(['test']), sourceStatus: mockSourceStatus };
  const options2 = { activeDocumentIds: new Set<string>(['test']), sourceStatus: mockSourceStatusEmpty };
  const result1 = evaluateRequirement(def, mockContext, options1);
  const result2 = evaluateRequirement(def, mockContext, options2);
  assertEqual(result1.conditionsMet, result2.conditionsMet, 'different source status should give different results');
});

console.log('\nWorkflow isolation');
test('should handle different purposes independently', () => {
  const tenderContext: ProjectRequirementContext = { ...mockContext, purpose: 'tender' };
  const pbgContext: ProjectRequirementContext = { ...mockContext, purpose: 'pbg' };
  const def = mockDefinition('tender-doc', 'CORE');
  const options = { activeDocumentIds: new Set<string>(), sourceStatus: mockSourceStatus };
  const tenderResult = evaluateRequirement(def, tenderContext, options);
  const pbgResult = evaluateRequirement(def, pbgContext, options);
  assertTrue(tenderResult.required, 'tender should require CORE by default');
  assertFalse(pbgResult.required, 'pbg should not require CORE by default');
});

console.log('\n============================================================');
console.log(`TESTS: ${passed} PASSED, ${failed} FAILED`);
console.log('============================================================\n');

process.exit(failed > 0 ? 1 : 0);
