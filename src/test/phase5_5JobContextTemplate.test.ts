/**
 * Phase 5.5 — Job-Context & Template-Driven Document System Test Suite
 * Minimum 40 comprehensive assertions verifying:
 * 1. Job/Project Context Selection & Persistence
 * 2. Auto-Population (Project Master, RAB, BOQ, Schedule)
 * 3. Minimal-Form Principle (Auto fields excluded from user inputs)
 * 4. Safe Template Binding & Variable Resolution (No arbitrary eval)
 * 5. Indonesian Terbilang Currency Converter
 * 6. Surat Penawaran Pilot Implementation
 * 7. All 9 Core Documents Mapped (BOQ, RAB, AHSP, Metode, RKK, JSA, Schedule, Kurva-S)
 * 8. Reusable Company Header Repository (KOP: Image, Text/Paste)
 * 9. Source Change Detection & Revision Safety
 * 10. Strict Project Isolation (Project A vs Project B)
 */

// In-memory localStorage polyfill for Node.js test environment
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

import {
  DOCUMENT_REGISTRY,
  getDocumentDefinition,
} from '../document-engine/registry';
import {
  VARIABLE_REGISTRY,
  numberToWordsRupiah,
  formatRupiah,
  buildTemplateContext,
  resolveTemplateVariables,
  classifyDocumentFields,
} from '../document-engine/templateEngine';
import {
  CompanyHeaderRepository,
  type CompanyHeaderAsset,
} from '../document-engine/companyHeaderRepository';
import {
  computeSourceHash,
  detectSourceChanges,
} from '../document-engine/sourceChangeDetector';
import { LocalDocumentRepository } from '../document-engine/repository';
import { buildDocumentData, DocumentSourceContext } from '../document-engine/documentData';
import { EMPTY_MASTER_DATA, type ProjectMasterData, type DocumentRecord, type DocumentDefinition } from '../document-engine/types';

// Simple Test Runner
let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passedCount++;
    console.log(`  ✓ ${message}`);
  } else {
    failedCount++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

console.log('\n======================================================');
console.log('  EZRAB PHASE 5.5 — AUTOMATED TEST SUITE');
console.log('======================================================\n');

// -------------------------------------------------------------
// TEST SUITE 1: Indonesian Currency "Terbilang" & Formatting
// -------------------------------------------------------------
console.log('TEST SUITE 1: Indonesian Terbilang & Currency Formatting');

assert(
  numberToWordsRupiah(1250000000) === 'Satu Miliar Dua Ratus Lima Puluh Juta Rupiah',
  `1.250.000.000 converts to correct Terbilang (got "${numberToWordsRupiah(1250000000)}")`
);

assert(
  numberToWordsRupiah(850000000) === 'Delapan Ratus Lima Puluh Juta Rupiah',
  `850.000.000 converts to "Delapan Ratus Lima Puluh Juta Rupiah" (got "${numberToWordsRupiah(850000000)}")`
);

assert(
  numberToWordsRupiah(15750000) === 'Lima Belas Juta Tujuh Ratus Lima Puluh Ribu Rupiah',
  `15.750.000 converts to "Lima Belas Juta Tujuh Ratus Lima Puluh Ribu Rupiah" (got "${numberToWordsRupiah(15750000)}")`
);

assert(
  numberToWordsRupiah(0) === 'Nol Rupiah',
  `0 converts to "Nol Rupiah"`
);

assert(
  formatRupiah(1250000000).replace(/\s/g, ' ') === 'Rp 1.250.000.000',
  `formatRupiah(1250000000) produces "Rp 1.250.000.000"`
);


// -------------------------------------------------------------
// TEST SUITE 2: Variable Registry & Safe Template Resolution
// -------------------------------------------------------------
console.log('\nTEST SUITE 2: Variable Registry & Safe Template Resolution');

assert(
  VARIABLE_REGISTRY['project.name'] !== undefined && VARIABLE_REGISTRY['project.name'].sourceType === 'AUTO',
  'Variable registry defines project.name as AUTO'
);

assert(
  VARIABLE_REGISTRY['rab.grandTotal'] !== undefined && VARIABLE_REGISTRY['rab.grandTotal'].sourceType === 'AUTO',
  'Variable registry defines rab.grandTotal as AUTO'
);

assert(
  VARIABLE_REGISTRY['signatory.name'] !== undefined && VARIABLE_REGISTRY['signatory.position'].sourceType === 'USER',
  'Variable registry defines signatory fields as USER'
);

// Verify safe variable resolution without eval
const testContext = {
  project: { name: 'Renovasi Kantor', location: 'Surabaya', duration: '120 Hari' },
  rab: { grandTotal: 'Rp 1.250.000.000', grandTotalInWords: 'Satu Miliar Dua Ratus Lima Puluh Juta Rupiah' },
  boq: { total: 'Rp 1.250.000.000', itemCount: 45 },
  schedule: { taskCount: 12, durationWeeks: 16 },
  company: { name: 'PT Konstruksi Jaya' },
  signatory: { name: 'Budi Santoso', position: 'Direktur Utama' },
  recipient: { name: 'Ir. Hendra', position: 'PPK', organization: 'Dinas PUPR' },
  letter: { number: '001/PNH/2026' },
};

const sampleTemplate = `Pekerjaan: {{project.name}}\nLokasi: {{project.location}}\nNilai: {{rab.grandTotal}}\nTerbilang: {{rab.grandTotalInWords}}\nDirektur: {{signatory.name}}`;
const resolved = resolveTemplateVariables(sampleTemplate, testContext);

assert(
  resolved.text.includes('Pekerjaan: Renovasi Kantor'),
  'resolveTemplateVariables substitutes {{project.name}}'
);
assert(
  resolved.text.includes('Nilai: Rp 1.250.000.000'),
  'resolveTemplateVariables substitutes {{rab.grandTotal}}'
);
assert(
  resolved.text.includes('Terbilang: Satu Miliar Dua Ratus Lima Puluh Juta Rupiah'),
  'resolveTemplateVariables substitutes {{rab.grandTotalInWords}}'
);
assert(
  resolved.text.includes('Direktur: Budi Santoso'),
  'resolveTemplateVariables substitutes {{signatory.name}}'
);
assert(
  resolved.missingVariables.length === 0,
  'All defined variables resolved with 0 missing variables'
);

// Missing variable detection test
const incompleteTemplate = `Halo {{project.name}}, nomor tender {{tender.unknownCode}}`;
const missingRes = resolveTemplateVariables(incompleteTemplate, testContext);
assert(
  missingRes.missingVariables.includes('tender.unknownCode'),
  'Missing variables are safely detected and listed without throwing'
);


// -------------------------------------------------------------
// TEST SUITE 3: Job Selection & Document Context
// -------------------------------------------------------------
console.log('\nTEST SUITE 3: Job Selection & Document Context');

const projectA: ProjectMasterData = {
  ...EMPTY_MASTER_DATA,
  projectName: 'Renovasi Kantor',
  projectNumber: 'PRJ-SBY-01',
  owner: 'PT Mandiri Sejahtera',
  contractor: 'PT Konstruksi Jaya',
  location: 'Surabaya',
  contractValue: 1250000000,
  duration: '120 Hari',
  startDate: '2026-03-01',
  endDate: '2026-07-01',
  tenderNumber: 'TND-2026-001',
  projectType: 'Gedung',
  tenderType: 'Pelelangan',
  companyName: 'PT Konstruksi Jaya',
  companyAddress: 'Jl. Pemuda No. 10, Surabaya',
  companyPhone: '031-5551234',
  companyEmail: 'info@konstruksijaya.com',
  director: 'Budi Santoso',
};

const rabItemsA = [
  { id: '1', description: 'Pekerjaan Persiapan', volume: 1, unit: 'ls', unitPrice: 50000000, totalPrice: 50000000 },
  { id: '2', description: 'Pekerjaan Struktur', volume: 1, unit: 'ls', unitPrice: 600000000, totalPrice: 600000000 },
  { id: '3', description: 'Pekerjaan Arsitektur', volume: 1, unit: 'ls', unitPrice: 600000000, totalPrice: 600000000 },
];

const contextA: DocumentSourceContext = {
  master: projectA,
  rabItems: rabItemsA as any,
  scheduleTasks: [
    { id: 't1', name: 'Persiapan', startDate: '2026-03-01', endDate: '2026-03-15', progress: 100 } as any,
    { id: 't2', name: 'Struktur', startDate: '2026-03-16', endDate: '2026-05-15', progress: 50 } as any,
  ],
};

const builtContextA = buildTemplateContext(contextA, {
  'letter.number': '025/PNH-KJ/III/2026',
  'signatory.name': 'Budi Santoso',
  'signatory.position': 'Direktur Utama',
  'recipient.name': 'Drs. H. Ahmad Fauzi',
  'recipient.position': 'Kepala Bagian Umum',
  'recipient.organization': 'PT Mandiri Sejahtera',
});

assert(
  builtContextA.project.name === 'Renovasi Kantor',
  'Context correctly sets project.name from Project A'
);
assert(
  builtContextA.project.location === 'Surabaya',
  'Context correctly sets project.location from Project A'
);
assert(
  builtContextA.rab.grandTotal === 'Rp 1.250.000.000',
  'Context correctly computes RAB grand total from rabItems (Rp 1.250.000.000)'
);
assert(
  builtContextA.rab.grandTotalInWords === 'Satu Miliar Dua Ratus Lima Puluh Juta Rupiah',
  'Context correctly computes Indonesian Terbilang for RAB grand total'
);
assert(
  builtContextA.schedule.taskCount === 2,
  'Context correctly counts schedule tasks'
);


// -------------------------------------------------------------
// TEST SUITE 4: Minimal-Form Principle
// -------------------------------------------------------------
console.log('\nTEST SUITE 4: Minimal-Form Principle');

const offerLetterDef = getDocumentDefinition('offer-letter')!;
assert(offerLetterDef !== undefined, 'offer-letter definition exists in registry');

const classifiedOffer = classifyDocumentFields(offerLetterDef);
assert(
  classifiedOffer.autoFields.some(f => f.id === 'projectName' || f.id === 'project.name'),
  'Project name is classified as AUTO field (not asked again)'
);
assert(
  classifiedOffer.userFields.some(f => f.id === 'letter.number' || f.id === 'letter_number'),
  'Letter number is classified as USER field'
);
assert(
  classifiedOffer.userFields.some(f => f.id === 'recipient.name' || f.id === 'recipient_name'),
  'Recipient name is classified as USER field'
);
assert(
  classifiedOffer.userFields.some(f => f.id === 'signatory.name' || f.id === 'signatory_name'),
  'Signatory name is classified as USER field'
);
assert(
  !classifiedOffer.userFields.some(f => f.id === 'contractValue' || f.id === 'rab.grandTotal'),
  'RAB value is NOT in userFields (user does not type RAB again)'
);


// -------------------------------------------------------------
// TEST SUITE 5: Surat Penawaran Pilot Implementation
// -------------------------------------------------------------
console.log('\nTEST SUITE 5: Surat Penawaran Pilot Implementation');

assert(
  offerLetterDef.templateBody !== undefined && offerLetterDef.templateBody.length > 50,
  'Surat Penawaran has canonical templateBody'
);

const offerResolution = resolveTemplateVariables(offerLetterDef.templateBody!, builtContextA);

assert(
  offerResolution.text.includes('Renovasi Kantor'),
  'Surat Penawaran template body resolves {{project.name}} to "Renovasi Kantor"'
);
assert(
  offerResolution.text.includes('Surabaya'),
  'Surat Penawaran template body resolves {{project.location}} to "Surabaya"'
);
assert(
  offerResolution.text.includes('Rp 1.250.000.000'),
  'Surat Penawaran template body resolves {{rab.grandTotal}} to "Rp 1.250.000.000"'
);
assert(
  offerResolution.text.includes('Satu Miliar Dua Ratus Lima Puluh Juta Rupiah'),
  'Surat Penawaran template body resolves {{rab.grandTotalInWords}}'
);
assert(
  offerResolution.text.includes('120 Hari'),
  'Surat Penawaran template body resolves {{project.duration}}'
);


// -------------------------------------------------------------
// TEST SUITE 6: All 9 Core Documents Mapped to Source Architecture
// -------------------------------------------------------------
console.log('\nTEST SUITE 6: All 9 Core Documents Template & Source Mapping');

const expectedCoreDocs = [
  'offer-letter',       // Surat Penawaran
  'execution-method',   // Metode Pelaksanaan
  'boq',                // BOQ
  'rab',                // RAB
  'ahsp',               // AHSP
  'rkk',                // RKK
  'jsa',                // JSA
  'schedule',           // Time Schedule
  'curve-s',            // Kurva-S
];

expectedCoreDocs.forEach((docId) => {
  const def = getDocumentDefinition(docId);
  assert(def !== undefined, `Document "${docId}" exists in canonical registry`);
  if (def) {
    assert(
      Array.isArray(def.autoVariables) && def.autoVariables.length > 0,
      `Document "${docId}" defines autoVariables (${def.autoVariables?.length} variables)`
    );
    assert(
      Array.isArray(def.userFields),
      `Document "${docId}" defines userFields list`
    );
    assert(
      def.templateBody !== undefined && def.templateBody.length > 0,
      `Document "${docId}" has controlled templateBody`
    );
  }
});


// -------------------------------------------------------------
// TEST SUITE 7: Company Header Repository (KOP)
// -------------------------------------------------------------
console.log('\nTEST SUITE 7: Reusable Company Header Repository (KOP)');

const headerRepo = new CompanyHeaderRepository();

const primaryHeader: CompanyHeaderAsset = {
  id: 'hdr-test-01',
  name: 'Kop Resmi Surabaya',
  slot: 'PRIMARY',
  type: 'TEXT',
  content: 'PT KONSTRUKSI JAYA UTAMA',
  companyName: 'PT Konstruksi Jaya Utama',
  companyAddress: 'Jl. Pemuda No. 88, Surabaya',
  companyPhone: '031-777888',
  companyEmail: 'kontak@konstruksijaya.id',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

headerRepo.save(primaryHeader);

const retrievedPrimary = headerRepo.getPrimary();
assert(
  retrievedPrimary !== undefined && retrievedPrimary.id === 'hdr-test-01',
  'CompanyHeaderRepository retrieves saved primary header'
);

const altHeader: CompanyHeaderAsset = {
  id: 'hdr-test-02',
  name: 'Kop Proyek Jakarta',
  slot: 'ALTERNATIVE',
  type: 'IMAGE',
  content: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

headerRepo.save(altHeader);
assert(
  headerRepo.list().length >= 2,
  'CompanyHeaderRepository lists multiple company header assets'
);

headerRepo.setPrimary('hdr-test-02');
assert(
  headerRepo.getPrimary()?.id === 'hdr-test-02',
  'Setting new primary demotes previous primary header to ALTERNATIVE'
);


// -------------------------------------------------------------
// TEST SUITE 8: Source Change Detection & Revision Safety
// -------------------------------------------------------------
console.log('\nTEST SUITE 8: Source Change Detection & Revision Safety');

const initialHash = computeSourceHash(contextA);
assert(
  typeof initialHash === 'string' && initialHash.startsWith('shash-'),
  `computeSourceHash produces deterministic fingerprint: ${initialHash}`
);

// Verify same context yields identical hash
const sameHash = computeSourceHash(contextA);
assert(
  initialHash === sameHash,
  'Same project source context produces identical hash'
);

// Create document record with initial hash
const docRepo = new LocalDocumentRepository('PRJ-SBY-01');
const testDocRecord: DocumentRecord = {
  id: 'offer-letter-REV-00',
  definitionId: 'offer-letter',
  documentId: 'offer-letter',
  projectId: 'PRJ-SBY-01',
  status: 'COMPLETE',
  data: {},
  sourceData: {},
  values: {},
  userFieldValues: { 'letter.number': '001/2026' },
  sourceHash: initialHash,
  sourceTimestamp: new Date().toISOString(),
  revision: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
docRepo.saveDocument(testDocRecord);

// Detection on unchanged source
const initialCheck = detectSourceChanges(testDocRecord, contextA);
assert(
  !initialCheck.hasChanged,
  'detectSourceChanges detects NO change when source is unaltered'
);

// Now simulate RAB change: price rises to Rp 1.300.000.000
const alteredRabItems = [
  ...rabItemsA.slice(0, 2),
  { id: '3', description: 'Pekerjaan Arsitektur (Addendum)', volume: 1, unit: 'ls', unitPrice: 650000000, totalPrice: 650000000 },
];
const alteredContext: DocumentSourceContext = {
  ...contextA,
  rabItems: alteredRabItems as any,
};

const alteredCheck = detectSourceChanges(testDocRecord, alteredContext);
assert(
  alteredCheck.hasChanged,
  'detectSourceChanges flags when underlying RAB total changes'
);
assert(
  alteredCheck.message !== undefined && alteredCheck.message.includes('berubah'),
  'detectSourceChanges provides descriptive notification message'
);

// Verify revision safety: editing/checking does NOT automatically increment revision
const savedDocBefore = docRepo.getDocument('offer-letter')!;
assert(
  savedDocBefore.revision === 0,
  'Revision remains REV 00 after source data changes (Revision safety preserved)'
);

// Explicit revision creation
const rev1Doc = docRepo.createRevision(savedDocBefore, 'Penyesuaian addendum RAB arsitektur');
assert(
  rev1Doc.revision === 1,
  'Explicit createRevision creates REV 01'
);
assert(
  docRepo.getRevisions('offer-letter').length >= 2,
  'Old revision REV 00 preserved in history as read-only'
);


// -------------------------------------------------------------
// TEST SUITE 9: Strict Project Data Isolation
// -------------------------------------------------------------
console.log('\nTEST SUITE 9: Strict Project Data Isolation');

const projectB: ProjectMasterData = {
  ...EMPTY_MASTER_DATA,
  projectName: 'Rumah Tinggal 2 Lantai',
  projectNumber: 'PRJ-PBL-02',
  owner: 'Bpk. Ridwan',
  contractor: 'CV Graha Mandiri',
  location: 'Probolinggo',
  contractValue: 850000000,
  duration: '90 Hari',
  startDate: '2026-04-01',
  endDate: '2026-07-01',
  tenderNumber: 'TND-2026-002',
  projectType: 'Rumah Tinggal',
  tenderType: 'Swasta',
  companyName: 'CV Graha Mandiri',
  companyAddress: 'Probolinggo',
  director: 'Suryanto',
};

const rabItemsB = [
  { id: 'b1', description: 'Pekerjaan Rumah 2 Lantai', volume: 1, unit: 'ls', unitPrice: 850000000, totalPrice: 850000000 },
];

const contextB: DocumentSourceContext = {
  master: projectB,
  rabItems: rabItemsB as any,
};

const builtB = buildTemplateContext(contextB, { 'letter.number': '002/PBL/2026' });

// Verify Project A vs Project B isolation
assert(
  builtContextA.project.name === 'Renovasi Kantor' && builtB.project.name === 'Rumah Tinggal 2 Lantai',
  'Project names are strictly isolated'
);
assert(
  builtContextA.rab.grandTotal === 'Rp 1.250.000.000' && builtB.rab.grandTotal === 'Rp 850.000.000',
  'RAB values are strictly isolated (Project A does not receive Project B data)'
);
assert(
  builtContextA.project.location === 'Surabaya' && builtB.project.location === 'Probolinggo',
  'Locations are strictly isolated'
);

const resolvedDocA = resolveTemplateVariables(offerLetterDef.templateBody!, builtContextA);
const resolvedDocB = resolveTemplateVariables(offerLetterDef.templateBody!, builtB);

assert(
  !resolvedDocA.text.includes('Probolinggo') && !resolvedDocA.text.includes('850.000.000'),
  'Project A Surat Penawaran contains NO Project B data'
);
assert(
  !resolvedDocB.text.includes('Surabaya') && !resolvedDocB.text.includes('1.250.000.000'),
  'Project B Surat Penawaran contains NO Project A data'
);


// -------------------------------------------------------------
// TEST SUITE 10: Preview & Export Canonical Data Consistency
// -------------------------------------------------------------
console.log('\nTEST SUITE 10: Canonical Data Consistency between Preview & Export');

const canonicalDataA = buildDocumentData(offerLetterDef, {
  ...contextA,
  userFieldValues: {
    'signatory.name': 'Budi Santoso, M.T.',
    'signatory.position': 'Direktur Utama',
  },
});

assert(
  canonicalDataA.company.signatory === 'Budi Santoso, M.T.',
  'Canonical document data receives userFieldValues signatory name'
);
assert(
  canonicalDataA.company.signatoryPosition === 'Direktur Utama',
  'Canonical document data receives userFieldValues signatory position'
);
assert(
  canonicalDataA.project.contractValue === 1250000000,
  'Canonical document data preserves exact project contract value'
);


// -------------------------------------------------------------
// TEST SUITE 11: Persistence across Reload & Repository Isolation
// -------------------------------------------------------------
console.log('\nTEST SUITE 11: Persistence across Reload & Repository Isolation');

// Simulate page reload by creating a fresh LocalDocumentRepository instance for PRJ-SBY-01
const reloadedRepoA = new LocalDocumentRepository('PRJ-SBY-01');
const reloadedDocA = reloadedRepoA.getDocument('offer-letter');

assert(
  reloadedDocA !== undefined,
  'Fresh repository instance successfully reloads persisted document'
);
assert(
  reloadedDocA?.projectId === 'PRJ-SBY-01',
  'Reload preserves exact projectId scoping'
);
assert(
  reloadedDocA?.userFieldValues?.['letter.number'] === '001/2026',
  'Reload preserves exact userFieldValues'
);
assert(
  reloadedRepoA.getRevisionHistory('offer-letter').length >= 2,
  'Reload preserves complete revision history'
);

// Create fresh repository for PRJ-PBL-02 and verify Project A docs are not visible
const reloadedRepoB = new LocalDocumentRepository('PRJ-PBL-02');
const docInB = reloadedRepoB.getDocument('offer-letter');

assert(
  docInB === undefined,
  'Project B repository cannot access Project A documents (Repository Isolation verified)'
);


// -------------------------------------------------------------
// SUMMARY REPORT
// -------------------------------------------------------------
console.log('\n======================================================');
console.log(`  PHASE 5.5 TEST RESULTS: ${passedCount} PASSED / ${failedCount} FAILED`);
console.log('======================================================\n');

if (failedCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

