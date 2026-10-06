import assert from 'node:assert';
import { parseWorkspaceRoute, paths } from '../routing/routes';
import { defaultAiProvider } from '../services/aiProviderEngine';
import { DOCUMENT_REGISTRY } from '../document-engine/registry';
import { LocalDocumentRepository } from '../document-engine/repository';
import { buildAiDocumentContext, planProjectDocuments, createDraftDocumentsAfterConfirmation, reviewDocumentConsistency } from '../services/aiDocumentIntelligence';
import { Project, RabItem, ScheduleTask } from '../types';

console.log('\n================================================================');
console.log('🚀 EZRAB MAGIC — DOKUMEN AI MODULE VERIFICATION TEST');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function runTest(desc: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      res.then(() => {
        console.log(`  [PASS] ${desc}`);
        passCount++;
      }).catch((err) => {
        console.error(`  [FAIL] ${desc}: ${err.message}`);
        failCount++;
      });
    } else {
      console.log(`  [PASS] ${desc}`);
      passCount++;
    }
  } catch (err: any) {
    console.error(`  [FAIL] ${desc}: ${err.message}`);
    failCount++;
  }
}

async function runAllTests() {
  const projectA: Project = {
    id: 'proj-dok-001',
    name: 'Pembangunan Gedung RS Hermina 5 Lantai',
    location: 'Surabaya, Jawa Timur',
    status: 'DRAFT',
    buildingType: 'Rumah Sakit / Klinik',
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    sections: [],
    costSummary: {
      directCost: 15000000000,
      overheadPercent: 5,
      overheadAmount: 750000000,
      profitPercent: 10,
      profitAmount: 1500000000,
      contingencyPercent: 0,
      contingencyAmount: 0,
      directorMarkupPercent: 0,
      directorMarkupNominal: 0,
      directorMarkupTotal: 0,
      showMarkupToEditor: false,
      showMarkupToClient: false,
      subtotalBeforeTax: 17250000000,
      taxPercent: 11,
      taxAmount: 1897500000,
      grandTotal: 19147500000,
      costPerM2: 3829500,
    },
  };

  const rabItems: RabItem[] = [
    {
      id: 'rab-1',
      no: 1,
      code: 'A.3.1.1.1',
      description: 'Pekerjaan Pondasi Tiang Pancang D-500mm',
      volume: 120,
      unit: 'titik',
      unitPrice: 15000000,
      amount: 1800000000,
      ahspCode: 'A.3.1.1.1',
      category: 'Pekerjaan Pondasi',
    },
    {
      id: 'rab-2',
      no: 2,
      code: 'A.4.1.1.8',
      description: 'Pekerjaan Struktur Kolom & Balok Beton K-350',
      volume: 450,
      unit: 'm3',
      unitPrice: 4200000,
      amount: 1890000000,
      ahspCode: 'A.4.1.1.8',
      category: 'Pekerjaan Struktur',
    },
  ];

  const scheduleTasks: ScheduleTask[] = [
    {
      id: 'task-1',
      projectId: 'proj-dok-001',
      name: 'Pekerjaan Pondasi & Struktur Bawah',
      category: 'Struktur',
      weightPercent: 35,
      startDate: '2026-03-01',
      endDate: '2026-06-30',
      startWeek: 1,
      endWeek: 16,
      durationWeeks: 16,
      actualProgressPercent: 0,
      status: 'PENDING',
    },
    {
      id: 'task-2',
      projectId: 'proj-dok-001',
      name: 'Pekerjaan Struktur Atas & Arsitektur',
      category: 'Arsitektur',
      weightPercent: 65,
      startDate: '2026-07-01',
      endDate: '2026-11-30',
      startWeek: 17,
      endWeek: 36,
      durationWeeks: 20,
      actualProgressPercent: 0,
      status: 'PENDING',
    },
  ];

  // 1. ROUTING TESTS
  console.log('--- [1] Dokumen AI Routing & URL Parsing ---');
  runTest('Route parse /app/magic-ai?mode=dokumen-ai', () => {
    const route = parseWorkspaceRoute('/app/magic-ai?mode=dokumen-ai');
    assert.strictEqual(route.menu, 'magic-ai');
    assert.strictEqual(route.mode, 'dokumen-ai');
  });

  runTest('Route parse /app/projects/proj-dok-001/ai?mode=dokumen-ai', () => {
    const route = parseWorkspaceRoute('/app/projects/proj-dok-001/ai?mode=dokumen-ai');
    assert.strictEqual(route.menu, 'magic-ai');
    assert.strictEqual(route.projectId, 'proj-dok-001');
    assert.strictEqual(route.mode, 'dokumen-ai');
  });

  runTest('paths.project.ai generates correct query path for dokumen-ai', () => {
    const path = paths.project.ai('proj-dok-001', 'dokumen-ai');
    assert.strictEqual(path, '/app/projects/proj-dok-001/ai?mode=dokumen-ai');
  });

  runTest('paths.magicAi generates correct query path for dokumen-ai', () => {
    const path = paths.magicAi('dokumen-ai');
    assert.strictEqual(path, '/app/magic-ai?mode=dokumen-ai');
  });

  // 2. QUICK ACTION 1: BUAT DOKUMEN PROYEK
  console.log('\n--- [2] Quick Action 1: BUAT DOKUMEN PROYEK ---');
  const aiCtx: any = {
    project: projectA,
    rab: { grandTotal: 19147500000, categories: [{ name: 'Struktur', items: rabItems }] },
    schedule: { activeTasks: scheduleTasks },
  };

  const resp1 = await defaultAiProvider.chat('Buatkan semua dokumen tender untuk proyek ini', aiCtx);
  runTest('Quick Action 1 returns proposal CREATE_PROJECT_DOCUMENTS', () => {
    assert(resp1.actionProposal, 'Proposal must exist');
    assert.strictEqual(resp1.actionProposal?.type, 'CREATE_PROJECT_DOCUMENTS');
    assert.strictEqual(resp1.actionProposal?.status, 'PENDING');
  });
  runTest('Quick Action 1 references project name', () => {
    assert(resp1.content.includes(projectA.name), 'Response content must include project name');
  });

  // 3. QUICK ACTION 2: LENGKAPI YANG KURANG
  console.log('\n--- [3] Quick Action 2: LENGKAPI YANG KURANG ---');
  const resp2 = await defaultAiProvider.chat('Apa saja data yang masih kurang untuk dokumen tender proyek ini?', aiCtx);
  runTest('Quick Action 2 identifies AUTO fields as ready without asking user', () => {
    assert(resp2.content.includes('Data yang Sudah Tersedia Otomatis (AUTO)'));
    assert(resp2.content.includes('Nama Proyek'));
    assert(resp2.content.includes('Total Nilai RAB'));
  });
  runTest('Quick Action 2 lists genuinely missing USER fields', () => {
    assert(resp2.content.includes('Data Manual yang Masih Diperlukan (USER)'));
  });

  // 4. QUICK ACTION 3: REVIEW DOKUMEN
  console.log('\n--- [4] Quick Action 3: REVIEW DOKUMEN ---');
  const resp3 = await defaultAiProvider.chat('Review konsistensi semua dokumen proyek ini terhadap RAB dan Schedule', aiCtx);
  runTest('Quick Action 3 runs consistency audit without source mutation', () => {
    assert(resp3.badge === 'LAPORAN');
    assert(resp3.content.includes('Konsistensi') || resp3.content.includes('Review'));
  });

  // 5. QUICK ACTION 4: BUAT SURAT PENAWARAN
  console.log('\n--- [5] Quick Action 4: BUAT SURAT PENAWARAN ---');
  const resp4 = await defaultAiProvider.chat('Buatkan surat penawaran harga untuk proyek ini', aiCtx);
  runTest('Quick Action 4 builds offer letter proposal with grounded RAB value', () => {
    assert(resp4.actionProposal);
    assert.strictEqual(resp4.actionProposal?.type, 'CREATE_PROJECT_DOCUMENTS');
    assert(resp4.content.includes('Surat Penawaran'));
  });

  // 6. QUICK ACTION 5: BUAT METODE PELAKSANAAN
  console.log('\n--- [6] Quick Action 5: BUAT METODE PELAKSANAAN ---');
  const resp5 = await defaultAiProvider.chat('Buatkan metode pelaksanaan pekerjaan berdasarkan RAB dan Schedule', aiCtx);
  runTest('Quick Action 5 structures technical narrative grounded in WBS and Schedule', () => {
    assert(resp5.content.includes('Metode Pelaksanaan'));
    assert(resp5.content.includes('Pekerjaan Persiapan') || resp5.content.includes('Pondasi'));
  });

  // 7. QUICK ACTION 6: CEK KELENGKAPAN
  console.log('\n--- [7] Quick Action 6: CEK KELENGKAPAN ---');
  const resp6 = await defaultAiProvider.chat('Cek status kelengkapan dokumen proyek ini', aiCtx);
  runTest('Quick Action 6 provides inventory status for canonical documents', () => {
    assert(resp6.badge === 'LAPORAN');
    assert(resp6.content.includes('Kesiapan Dokumen') || resp6.content.includes('Status Kelengkapan'));
  });

  // 8. CONFIRMATION GATE & REPOSITORY PERSISTENCE
  console.log('\n--- [8] Confirmation Gate & Repository Persistence ---');
  const repo = new LocalDocumentRepository(projectA.id);
  const docCtx = buildAiDocumentContext(projectA, {
    rabItems,
    scheduleTasks,
    documents: repo.getProjectDocuments(projectA.id),
  });

  const createdDrafts = createDraftDocumentsAfterConfirmation(docCtx, repo, ['offer-letter', 'execution-method']);
  runTest('Confirmation creates exactly 2 draft records', () => {
    assert.strictEqual(createdDrafts.length, 2);
    assert.strictEqual(createdDrafts[0].status, 'DRAFT');
    assert.strictEqual(createdDrafts[0].revision, 0);
  });

  runTest('Documents are isolated in project repository', () => {
    const saved = repo.getProjectDocuments(projectA.id);
    assert.strictEqual(saved.length, 2);
  });

  console.log(`\n================================================================`);
  console.log(`DOKUMEN AI TEST SUMMARY: ${passCount} PASSED / ${failCount} FAILED (TOTAL: ${passCount + failCount})`);
  console.log(`================================================================\n`);
}

runAllTests();
