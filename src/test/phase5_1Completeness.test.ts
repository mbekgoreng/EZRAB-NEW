import {
  calculateCompletenessForDocument,
  calculateSummaries,
  getIncompleteDocuments,
  groupByLevel,
} from '../document-engine/completenessEngine';

const mockDefinition = (id: string, level: 'CORE' | 'RECOMMENDED' | 'CONDITIONAL' | 'CUSTOM' = 'RECOMMENDED', deps: string[] = []): any => ({
  id,
  code: `TDR-${id.toUpperCase()}`,
  name: id,
  category: 'ADMINISTRATION',
  description: 'Test',
  requirement: level,
  supportedFormats: ['PDF'],
  templateId: id,
  fields: [
    { id: 'projectName', label: 'Project Name', type: 'text', required: true, sourceType: 'AUTO' },
    { id: 'owner', label: 'Owner', type: 'text', required: true, sourceType: 'AUTO' },
    { id: 'location', label: 'Location', type: 'text', required: true, sourceType: 'AUTO' },
    { id: 'letter.number', label: 'Nomor Surat', type: 'text', required: true, sourceType: 'USER' },
    { id: 'signatory.name', label: 'Nama Penandatangan', type: 'text', required: true, sourceType: 'USER' },
  ],
  userFields: [
    { id: 'letter.number', label: 'Nomor Surat', type: 'text', required: true, sourceType: 'USER' },
    { id: 'signatory.name', label: 'Nama Penandatangan', type: 'text', required: true, sourceType: 'USER' },
  ],
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
console.log('EZRAB PHASE 5.1 COMPLETENESS ENGINE TESTS');
console.log('============================================================\n');

console.log('Completeness calculation');
test('should report 0% for NOT_STARTED documents', () => {
  const def = mockDefinition('test', 'CORE');
  const result = calculateCompletenessForDocument(def, undefined);
  assertEqual(result.completenessPercentage, 0, 'percentage');
  assertEqual(result.status, 'NOT_STARTED', 'status');
});

test('should report 100% for COMPLETE documents', () => {
  const def = mockDefinition('test', 'CORE');
  const record = {
    id: 'test-REV-00',
    definitionId: 'test',
    status: 'COMPLETE',
    values: { projectName: 'Test', owner: 'Owner', location: 'Location' },
    revision: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any;
  const result = calculateCompletenessForDocument(def, record);
  assertEqual(result.completenessPercentage, 100, 'percentage');
  assertEqual(result.status, 'COMPLETE', 'status');
});

test('should report partial percentage for DRAFT with some fields filled', () => {
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
  const result = calculateCompletenessForDocument(def, record);
  assertTrue(result.completenessPercentage >= 0, 'percentage >= 0');
  assertTrue(result.completenessPercentage < 100, 'percentage < 100');
});

test('should report 100% for EXPORTED documents', () => {
  const def = mockDefinition('test', 'CORE');
  const record = {
    id: 'test-REV-00',
    definitionId: 'test',
    status: 'EXPORTED',
    values: { projectName: 'Test', owner: 'Owner', location: 'Location' },
    revision: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any;
  const result = calculateCompletenessForDocument(def, record);
  assertEqual(result.completenessPercentage, 100, 'percentage');
  assertEqual(result.status, 'EXPORTED', 'status');
});

console.log('\nCORE completeness calculation');
test('should identify CORE documents correctly', () => {
  const coreDef = mockDefinition('core', 'CORE');
  const recDef = mockDefinition('rec', 'RECOMMENDED');
  const coreResult = calculateCompletenessForDocument(coreDef, undefined);
  const recResult = calculateCompletenessForDocument(recDef, undefined);
  assertTrue(coreResult.isCore, 'core isCore');
  assertFalse(recResult.isCore, 'rec is not core');
});

test('should count CORE separately from overall', () => {
  const completions: any[] = [
    { definitionId: 'core1', status: 'COMPLETE', isCore: true, isRequired: true, completenessPercentage: 100, missingDependencies: [] },
    { definitionId: 'core2', status: 'INCOMPLETE', isCore: true, isRequired: true, completenessPercentage: 50, missingDependencies: [] },
    { definitionId: 'rec1', status: 'COMPLETE', isCore: false, isRequired: false, completenessPercentage: 100, missingDependencies: [] },
    { definitionId: 'rec2', status: 'COMPLETE', isCore: false, isRequired: false, completenessPercentage: 100, missingDependencies: [] },
  ];
  const summary = calculateSummaries(completions);
  assertEqual(summary.coreTotal, 2, 'coreTotal');
  assertEqual(summary.coreComplete, 1, 'coreComplete');
  assertEqual(summary.overallTotal, 2, 'overallTotal');
});

console.log('\nCompleteness with dependencies');
test('should reduce completeness when dependencies missing', () => {
  const def = mockDefinition('test', 'CORE');
  const record = { status: 'DRAFT', values: { projectName: 'Test', owner: 'Owner', location: 'Location' } } as any;
  const requirementResult = {
    definitionId: 'test',
    level: 'CORE',
    required: true,
    conditionsMet: true,
    dependencies: [{ name: 'test', status: 'INCOMPLETE', missingFields: ['Data Personil belum tersedia'] }],
  } as any;
  const result = calculateCompletenessForDocument(def, record, requirementResult);
  assertTrue(result.missingDependencies.length > 0, 'has missing dependencies');
});

test('should include dependency info in reason', () => {
  const def = mockDefinition('test', 'CORE');
  const record = { status: 'DRAFT', values: { projectName: 'Test', owner: 'Owner', location: 'Location' } } as any;
  const requirementResult = {
    definitionId: 'test',
    level: 'CORE',
    required: true,
    conditionsMet: true,
    dependencies: [{ name: 'test', status: 'INCOMPLETE', missingFields: ['Data Personil belum tersedia'] }],
  } as any;
  const result = calculateCompletenessForDocument(def, record, requirementResult);
  assertTrue(result.reason?.includes('Missing'), 'reason mentions Missing');
});

console.log('\nProject isolation');
test('should calculate completeness independently per project', () => {
  const def = mockDefinition('test', 'CORE');
  const recordA = {
    id: 'test-REV-00',
    definitionId: 'test',
    status: 'COMPLETE',
    values: { projectName: 'Project A', owner: 'Owner A', location: 'Location A' },
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
  assertEqual(compA.status, 'COMPLETE', 'statusA');
  assertEqual(compB.status, 'INCOMPLETE', 'statusB');
  assertEqual(compA.completenessPercentage, 100, 'percentageA');
  assertTrue(compB.completenessPercentage < 100, 'percentageB < 100');
});

console.log('\nIncomplete documents');
test('should filter only required incomplete documents', () => {
  const completions: any[] = [
    { definitionId: 'a', status: 'COMPLETE', isRequired: true, isCore: true },
    { definitionId: 'b', status: 'INCOMPLETE', isRequired: true, isCore: true },
    { definitionId: 'c', status: 'INCOMPLETE', isRequired: false, isCore: false },
    { definitionId: 'd', status: 'NOT_STARTED', isRequired: false, isCore: false },
  ];
  const incomplete = getIncompleteDocuments(completions);
  assertEqual(incomplete.length, 1, 'count');
  assertEqual(incomplete[0].definitionId, 'b', 'definitionId');
});

test('should handle empty list', () => {
  const incomplete = getIncompleteDocuments([]);
  assertEqual(incomplete.length, 0, 'count');
});

console.log('\nSummary calculation');
test('should handle empty input', () => {
  const summary = calculateSummaries([]);
  assertEqual(summary.coreTotal, 0, 'coreTotal');
  assertEqual(summary.coreComplete, 0, 'coreComplete');
  assertEqual(summary.overallPercentage, 0, 'overallPercentage');
});

test('should calculate correct percentages', () => {
  const completions: any[] = [
    { definitionId: 'a', status: 'COMPLETE', isCore: true, isRequired: true, completenessPercentage: 100, missingDependencies: [] },
    { definitionId: 'b', status: 'COMPLETE', isCore: true, isRequired: true, completenessPercentage: 100, missingDependencies: [] },
    { definitionId: 'c', status: 'COMPLETE', isCore: false, isRequired: true, completenessPercentage: 100, missingDependencies: [] },
  ];
  const summary = calculateSummaries(completions);
  assertEqual(summary.coreTotal, 2, 'coreTotal');
  assertEqual(summary.coreComplete, 2, 'coreComplete');
  assertEqual(summary.overallPercentage, 100, 'overallPercentage');
});

console.log('\nLevel grouping');
test('should group by requirement level', () => {
  const definitions = new Map([
    ['core', mockDefinition('core', 'CORE')],
    ['rec', mockDefinition('rec', 'RECOMMENDED')],
    ['cond', mockDefinition('cond', 'CONDITIONAL')],
    ['cust', mockDefinition('cust', 'CUSTOM')],
  ]);
  const completions: any[] = [
    { definitionId: 'core', status: 'COMPLETE', isCore: true, isRequired: true, completenessPercentage: 100, missingDependencies: [] },
    { definitionId: 'rec', status: 'COMPLETE', isCore: false, isRequired: false, completenessPercentage: 100, missingDependencies: [] },
    { definitionId: 'cond', status: 'INCOMPLETE', isCore: false, isRequired: true, completenessPercentage: 50, missingDependencies: [] },
    { definitionId: 'cust', status: 'NOT_STARTED', isCore: false, isRequired: false, completenessPercentage: 0, missingDependencies: [] },
  ];
  const groups = groupByLevel(completions, definitions);
  assertEqual(groups.CORE?.length, 1, 'CORE group');
  assertEqual(groups.RECOMMENDED?.length, 1, 'RECOMMENDED group');
  assertEqual(groups.CONDITIONAL?.length, 1, 'CONDITIONAL group');
  assertEqual(groups.CUSTOM?.length, 1, 'CUSTOM group');
});

test('should group RECOMMENDED by default for unknown levels', () => {
  const definitions = new Map();
  const completions: any[] = [
    { definitionId: 'unknown', status: 'COMPLETE', isCore: false, isRequired: false, completenessPercentage: 100, missingDependencies: [] },
  ];
  const groups = groupByLevel(completions, definitions);
  assertEqual(groups.RECOMMENDED?.length, 1, 'RECOMMENDED group');
});

console.log('\n============================================================');
console.log(`TESTS: ${passed} PASSED, ${failed} FAILED`);
console.log('============================================================\n');

process.exit(failed > 0 ? 1 : 0);
