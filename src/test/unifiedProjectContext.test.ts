import assert from 'node:assert';
import {
  buildUnifiedProjectContext,
  createInformationProposal,
  createSuggestionProposal,
  createActionProposal,
  validateActionSafety,
  ProjectIsolationError,
  ActionSafetyViolationError,
  type ContextDomainKey,
} from '../services/unifiedProjectContext';
import type { Project, RabItem, ScheduleTask, KurvaSDataPoint, QTOItem, WorkItem } from '../types';
import type { ProjectPersonnel, ProjectEquipment, ProjectJsaItem, ProjectRkkData, ProjectAhspItem } from '../project-data/types';
import type { DocumentRecord } from '../document-engine/types';

console.log('\n================================================================');
console.log('🏗️ EZRAB PHASE B — UNIFIED PROJECT CONTEXT & ACTION SAFETY TEST');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function runTest(desc: string, fn: () => void) {
  try {
    fn();
    console.log(`  [PASS] ${desc}`);
    passCount++;
  } catch (err: any) {
    console.error(`  [FAIL] ${desc}: ${err.message}`);
    failCount++;
  }
}

// FIXTURES
const projectA: Project = {
  id: 'proj-alpha-001',
  name: 'Pembangunan Gedung Wisma Atlet',
  location: 'Jakarta Pusat',
  clientName: 'Kementerian PUPR',
  startDate: '2026-04-01',
  targetDate: '2026-10-31',
  buildingType: 'Gedung Kantor',
  status: 'DRAFT',
  progress: 15,
  totalRab: 5000000000,
  costSummary: {
    directCost: 4000000000,
    overheadPercent: 5,
    overheadAmount: 200000000,
    profitPercent: 10,
    profitAmount: 400000000,
    contingencyPercent: 0,
    contingencyAmount: 0,
    directorMarkupPercent: 0,
    directorMarkupNominal: 0,
    directorMarkupTotal: 0,
    showMarkupToEditor: false,
    showMarkupToClient: false,
    subtotalBeforeTax: 4600000000,
    taxPercent: 11,
    taxAmount: 506000000,
    grandTotal: 5106000000,
    costPerM2: 2553000,
  },
  sections: [],
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
};

const rabItemsA: RabItem[] = [
  {
    id: 'rab-item-1',
    no: 1,
    code: 'A.1.1',
    category: 'Pekerjaan Struktur',
    description: 'Pengecoran Beton Kolom K-300',
    volume: 120,
    unit: 'm3',
    unitPrice: 1250000,
    amount: 150000000,
    totalPrice: 150000000,
    ahspCode: 'A.1.1',
  },
  {
    id: 'rab-item-2',
    no: 2,
    code: 'A.1.2',
    category: 'Pekerjaan Struktur',
    description: 'Pembesian Ulir D16',
    volume: 15000,
    unit: 'kg',
    unitPrice: 16500,
    amount: 247500000,
    totalPrice: 247500000,
    ahspCode: 'A.1.2',
  },
];

const scheduleTasksA: ScheduleTask[] = [
  {
    id: 'task-a1',
    projectId: 'proj-alpha-001',
    name: 'Pekerjaan Tanah & Pondasi',
    category: 'Struktur Bawah',
    weightPercent: 30,
    startDate: '2026-04-01',
    endDate: '2026-06-01',
    startWeek: 1,
    endWeek: 8,
    durationWeeks: 8,
    actualProgressPercent: 50,
    status: 'ON_TRACK',
  },
  {
    id: 'task-a2',
    projectId: 'proj-alpha-001',
    name: 'Pekerjaan Struktur Atas',
    category: 'Struktur Atas',
    weightPercent: 70,
    startDate: '2026-06-02',
    endDate: '2026-10-31',
    startWeek: 9,
    endWeek: 30,
    durationWeeks: 22,
    actualProgressPercent: 0,
    status: 'PENDING',
  },
];

const kurvaSA: KurvaSDataPoint[] = [
  {
    weekIndex: 1,
    weekLabel: 'Minggu 1',
    startDate: '2026-04-01',
    endDate: '2026-04-07',
    plannedWeeklyPercent: 2.5,
    cumulativePlannedPercent: 2.5,
    plannedWeeklyCost: 125000000,
    cumulativePlannedCost: 125000000,
    actualProgressPercent: 3.0,
  },
];

const personnelA: ProjectPersonnel[] = [
  {
    id: 'pers-1',
    projectId: 'proj-alpha-001',
    name: 'Ir. Budi Santoso, MT',
    position: 'Project Manager',
    qualification: 'S2 Teknik Sipil / Ahli Madya',
    experience: '12 Tahun',
    createdAt: '2026-03-01',
    updatedAt: '2026-03-01',
  },
];

const equipmentA: ProjectEquipment[] = [
  {
    id: 'eq-1',
    projectId: 'proj-alpha-001',
    name: 'Tower Crane 50M',
    type: 'Alat Angkat',
    quantity: 1,
    capacity: '5 Ton',
    condition: 'Baik',
    createdAt: '2026-03-01',
    updatedAt: '2026-03-01',
  },
];

const jsaA: ProjectJsaItem[] = [
  {
    id: 'jsa-1',
    projectId: 'proj-alpha-001',
    activity: 'Pengecoran Beton di Ketinggian',
    hazard: 'Jatuh dari ketinggian, tertimpa bucket',
    risk: 'Cedera berat / fatalitas',
    control: 'Full body harness, safety net, barricade area kerja',
    responsiblePerson: 'HSE Officer',
    createdAt: '2026-03-01',
    updatedAt: '2026-03-01',
  },
];

const rkkA: ProjectRkkData[] = [
  {
    id: 'rkk-1',
    projectId: 'proj-alpha-001',
    organization: 'PT Konstruksi Utama Indonesia',
    hsePersonnel: 'Ahmad Fauzi, SKM',
    safetyObjectives: 'Zero Fatal Accident & 100% Kepatuhan APD',
    riskControls: 'Induksi harian, TBM, Inspeksi berkala',
    createdAt: '2026-03-01',
    updatedAt: '2026-03-01',
  },
];

const documentsA: DocumentRecord[] = [
  {
    id: 'offer-letter-REV-00',
    definitionId: 'offer-letter',
    documentId: 'offer-letter',
    projectId: 'proj-alpha-001',
    status: 'COMPLETE',
    data: {},
    sourceData: { project: true, rab: true },
    values: {},
    userFieldValues: {
      'signatory.name': 'Ir. Hendra Wijaya',
      'letter.number': '001/SPH/KU/IV/2026',
    },
    revision: 0,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
  },
];

// --- TEST SUITES ---

console.log('--- [1] Project-Scoped Fail-Safe & Isolation ---');

runTest('Fails closed if projectId is empty string', () => {
  assert.throws(
    () => buildUnifiedProjectContext({ projectId: '', project: null }),
    (err: any) => err instanceof ProjectIsolationError
  );
});

runTest('Fails closed if projectId is whitespace', () => {
  assert.throws(
    () => buildUnifiedProjectContext({ projectId: '   ', project: null }),
    (err: any) => err instanceof ProjectIsolationError
  );
});

runTest('Fails closed if target projectId does not match project.id', () => {
  assert.throws(
    () => buildUnifiedProjectContext({ projectId: 'proj-beta-999', project: projectA }),
    (err: any) => err instanceof ProjectIsolationError && err.message.includes('PROJECT_ISOLATION_ERROR')
  );
});

runTest('Builds valid context when projectId matches project.id', () => {
  const ctx = buildUnifiedProjectContext({
    projectId: 'proj-alpha-001',
    project: projectA,
    requestedDomains: ['project'],
  });
  assert.strictEqual(ctx.projectId, 'proj-alpha-001');
  assert.strictEqual(ctx.project.name, 'Pembangunan Gedung Wisma Atlet');
  assert.strictEqual(ctx.domains.project, 'AVAILABLE');
});

runTest('Handles null project gracefully by setting status to MISSING', () => {
  const ctx = buildUnifiedProjectContext({
    projectId: 'proj-unregistered-404',
    project: null,
    requestedDomains: ['project'],
  });
  assert.strictEqual(ctx.domains.project, 'MISSING');
  assert.strictEqual(ctx.project.name, 'Proyek Tidak Ditemukan');
});

console.log('\n--- [2] Lazy & Selective Context Loading ---');

runTest('Loads only requested domains and marks non-requested as NOT_REQUESTED', () => {
  const ctx = buildUnifiedProjectContext({
    projectId: 'proj-alpha-001',
    project: projectA,
    requestedDomains: ['project', 'rab'],
    rabItems: rabItemsA,
  });

  assert.strictEqual(ctx.domains.project, 'AVAILABLE');
  assert.strictEqual(ctx.domains.rab, 'AVAILABLE');
  assert.strictEqual(ctx.domains.schedule, 'NOT_REQUESTED');
  assert.strictEqual(ctx.domains.personnel, 'NOT_REQUESTED');
  assert.strictEqual(ctx.domains.equipment, 'NOT_REQUESTED');
  assert.strictEqual(ctx.domains.jsa, 'NOT_REQUESTED');
  assert.strictEqual(ctx.domains.rkk, 'NOT_REQUESTED');
  assert.strictEqual(ctx.schedule, undefined);
  assert.strictEqual(ctx.personnel, undefined);
  assert.strictEqual(ctx.equipment, undefined);
});

runTest('Loads full construction domain set on demand', () => {
  const allDomains: ContextDomainKey[] = [
    'project', 'ded', 'boq', 'rab', 'schedule', 'kurvaS', 'personnel', 'equipment', 'jsa', 'rkk', 'documents',
  ];
  const ctx = buildUnifiedProjectContext({
    projectId: 'proj-alpha-001',
    project: projectA,
    requestedDomains: allDomains,
    rabItems: rabItemsA,
    scheduleTasks: scheduleTasksA,
    kurvaSData: kurvaSA,
    personnel: personnelA,
    equipment: equipmentA,
    jsa: jsaA,
    rkk: rkkA,
    documents: documentsA,
  });

  assert.strictEqual(ctx.domains.project, 'AVAILABLE');
  assert.strictEqual(ctx.domains.rab, 'AVAILABLE');
  assert.strictEqual(ctx.domains.boq, 'AVAILABLE');
  assert.strictEqual(ctx.domains.schedule, 'AVAILABLE');
  assert.strictEqual(ctx.domains.kurvaS, 'AVAILABLE');
  assert.strictEqual(ctx.domains.personnel, 'AVAILABLE');
  assert.strictEqual(ctx.domains.equipment, 'AVAILABLE');
  assert.strictEqual(ctx.domains.jsa, 'AVAILABLE');
  assert.strictEqual(ctx.domains.rkk, 'AVAILABLE');
  assert.strictEqual(ctx.domains.documents, 'AVAILABLE');
});

console.log('\n--- [3] Source Status Distinction (EMPTY vs AVAILABLE vs MISSING) ---');

runTest('RAB status is EMPTY when empty array is provided', () => {
  const ctx = buildUnifiedProjectContext({
    projectId: 'proj-alpha-001',
    project: projectA,
    requestedDomains: ['rab'],
    rabItems: [],
  });
  assert.strictEqual(ctx.domains.rab, 'EMPTY');
  assert.strictEqual(ctx.rab?.itemCount, 0);
});

runTest('Schedule status is EMPTY when empty array is provided', () => {
  const ctx = buildUnifiedProjectContext({
    projectId: 'proj-alpha-001',
    project: projectA,
    requestedDomains: ['schedule'],
    scheduleTasks: [],
  });
  assert.strictEqual(ctx.domains.schedule, 'EMPTY');
  assert.strictEqual(ctx.schedule?.totalTasks, 0);
});

console.log('\n--- [4] Data Projection & Canonical Mapping ---');

runTest('RAB Adapter correctly calculates grandTotal and categorizes items', () => {
  const ctx = buildUnifiedProjectContext({
    projectId: 'proj-alpha-001',
    project: projectA,
    requestedDomains: ['rab'],
    rabItems: rabItemsA,
  });
  assert.strictEqual(ctx.rab?.itemCount, 2);
  assert.strictEqual(ctx.rab?.totalRab, 397500000);
  assert.strictEqual(ctx.rab?.categories.length, 1);
  assert.strictEqual(ctx.rab?.categories[0].name, 'Pekerjaan Struktur');
  assert.strictEqual(ctx.rab?.categories[0].total, 397500000);
  assert.strictEqual(ctx.rab?.categories[0].weightPercent, 100);
});

runTest('BOQ Adapter extracts items without pricing', () => {
  const ctx = buildUnifiedProjectContext({
    projectId: 'proj-alpha-001',
    project: projectA,
    requestedDomains: ['boq'],
    rabItems: rabItemsA,
  });
  assert.strictEqual(ctx.boq?.itemCount, 2);
  assert.strictEqual(ctx.boq?.items[0].description, 'Pengecoran Beton Kolom K-300');
  assert.strictEqual(ctx.boq?.items[0].volume, 120);
});

runTest('Schedule & Kurva S Adapters compute progress and deviation correctly', () => {
  const ctx = buildUnifiedProjectContext({
    projectId: 'proj-alpha-001',
    project: projectA,
    requestedDomains: ['schedule', 'kurvaS'],
    scheduleTasks: scheduleTasksA,
    kurvaSData: kurvaSA,
  });
  assert.strictEqual(ctx.schedule?.totalTasks, 2);
  assert.strictEqual(ctx.schedule?.activeTasksCount, 1);
  assert.strictEqual(ctx.kurvaS?.actualProgress, 3.0);
  assert.strictEqual(ctx.kurvaS?.plannedProgress, 2.5);
  assert.strictEqual(ctx.kurvaS?.deviation, 0.5);
  assert.strictEqual(ctx.kurvaS?.status, 'ON_TRACK');
});

runTest('Document Adapter maps 19 registry definitions with existing status', () => {
  const ctx = buildUnifiedProjectContext({
    projectId: 'proj-alpha-001',
    project: projectA,
    requestedDomains: ['documents'],
    documents: documentsA,
  });
  assert.strictEqual(ctx.documents?.totalRegistered, 19);
  assert.strictEqual(ctx.documents?.createdCount, 1);
  const offerLetter = ctx.documents?.items.find((i) => i.definitionId === 'offer-letter');
  assert.strictEqual(offerLetter?.status, 'COMPLETE');
  assert.strictEqual(offerLetter?.completenessPercentage, 100);
});

console.log('\n--- [5] AI Action Engine Safety & Contracts ---');

runTest('INFORMATION proposal does not require approval and is not a mutation', () => {
  const info = createInformationProposal({
    projectId: 'proj-alpha-001',
    action: 'GET_RAB_SUMMARY',
    title: 'Informasi Total RAB',
    description: 'Nilai total RAB proyek adalah Rp 5.000.000.000',
  });
  assert.strictEqual(info.type, 'INFORMATION');
  assert.strictEqual(info.requiresApproval, false);
  assert.strictEqual(info.isMutation, false);
  const safety = validateActionSafety(info);
  assert.strictEqual(safety.allowed, true);
});

runTest('SUGGESTION proposal does not require approval and is not a mutation', () => {
  const sugg = createSuggestionProposal({
    projectId: 'proj-alpha-001',
    action: 'WARN_MISSING_DATA',
    title: 'Peringatan Data Perusahaan',
    description: 'Data NPWP perusahaan belum lengkap pada profil kontraktor.',
    warnings: ['NPWP Kosong'],
  });
  assert.strictEqual(sugg.type, 'SUGGESTION');
  assert.strictEqual(sugg.requiresApproval, false);
  assert.strictEqual(sugg.isMutation, false);
  const safety = validateActionSafety(sugg);
  assert.strictEqual(safety.allowed, true);
});

runTest('ACTION proposal strictly requires user approval and declares mutation', () => {
  const act = createActionProposal({
    projectId: 'proj-alpha-001',
    action: 'CREATE_DRAFT_DOCUMENT',
    title: 'Buat Draft Surat Penawaran',
    description: 'Menyusun dokumen Surat Penawaran resmi berdasarkan data master dan RAB.',
    target: { type: 'DOCUMENT', definitionId: 'offer-letter' },
    proposedChanges: { status: 'DRAFT', revision: 0 },
  });
  assert.strictEqual(act.type, 'ACTION');
  assert.strictEqual(act.requiresApproval, true);
  assert.strictEqual(act.isMutation, true);
  assert.strictEqual(act.status, 'PENDING');

  // Must be rejected when status is PENDING
  const safetyPending = validateActionSafety(act);
  assert.strictEqual(safetyPending.allowed, false);
  assert(safetyPending.reason?.includes('membutuhkan persetujuan pengguna'));

  // Once user approves
  act.status = 'APPROVED';
  const safetyApproved = validateActionSafety(act);
  assert.strictEqual(safetyApproved.allowed, true);
});

runTest('Rejects rogue proposals that declare mutation without approval', () => {
  const rogueProposal: any = {
    id: 'rogue-1',
    type: 'ACTION',
    projectId: 'proj-alpha-001',
    title: 'Rogue action',
    requiresApproval: false, // VIOLATION!
    isMutation: true,
    status: 'APPROVED',
  };
  assert.throws(
    () => validateActionSafety(rogueProposal),
    (err: any) => err instanceof ActionSafetyViolationError
  );
});

runTest('Rejects rogue INFORMATION proposals that attempt to declare mutation', () => {
  const rogueInfo: any = {
    id: 'rogue-2',
    type: 'INFORMATION',
    projectId: 'proj-alpha-001',
    title: 'Fake info with mutation',
    requiresApproval: false,
    isMutation: true, // VIOLATION!
    status: 'APPLIED',
  };
  assert.throws(
    () => validateActionSafety(rogueInfo),
    (err: any) => err instanceof ActionSafetyViolationError
  );
});

console.log('\n================================================================');
console.log(`PHASE B TEST SUMMARY: ${passCount} PASSED / ${failCount} FAILED (TOTAL: ${passCount + failCount})`);
console.log('================================================================\n');

if (failCount > 0) {
  process.exit(1);
}
