/**
 * EZRAB — PHASE 4.4 PRODUCTION INTEGRATION & ACCEPTANCE TESTS
 *
 * Verification coverage:
 * 1. Source Persistence (CRUD per domain: Personnel, Equipment, JSA, RKK, AHSP)
 * 2. Reload Persistence (Simulated reload retains exact data from ezrab:project:{projectId}:*)
 * 3. Strict Project Isolation (Project A !== Project B by entity ID & projectId, DocumentData isolation)
 * 4. Source -> Integration Adapter -> DocumentData Flow
 * 5. Dynamic Dependency Validation (Fail-closed on missing dependencies; PASS when populated)
 * 6. Real Export E2E (PDF, DOCX, XLSX, Export History)
 * 7. Canonical AHSP Bridge verification (Catalog selection -> Repository -> Adapter)
 */

import { ProjectDataRepository, createProjectEntity } from '../project-data/repository';
import type {
  ProjectPersonnel,
  ProjectEquipment,
  ProjectJsaItem,
  ProjectRkkData,
  ProjectAhspItem,
} from '../project-data/types';
import {
  saveProjectAhspFromCatalog,
  listProjectAhspItems,
  saveCustomProjectAhsp,
  removeProjectAhspItem,
} from '../project-data/ahspBridge';
import { mapPersonnelRows } from '../document-engine/integrations/personnelIntegration';
import { mapEquipmentRows } from '../document-engine/integrations/equipmentIntegration';
import { mapJsaRows } from '../document-engine/integrations/jsaIntegration';
import { mapRkkRows } from '../document-engine/integrations/rkkIntegration';
import { mapAhspRows } from '../document-engine/integrations/ahspIntegration';
import { buildDocumentData } from '../document-engine/documentData';
import { validateDocument } from '../document-engine/validationEngine';
import { renderDocument } from '../document-engine/renderer';
import { exportDocument } from '../document-engine/exportService';
import { LocalDocumentRepository } from '../document-engine/repository';
import { DOCUMENT_REGISTRY, getDocumentDefinition } from '../document-engine/registry';
import { EMPTY_MASTER_DATA, type ProjectMasterData } from '../document-engine/types';
import type { NationalAHSPItem } from '../data/nationalCostDatabase/types';

// In-memory localStorage polyfill for Node test environment
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
  };
}

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (!condition) {
    console.error(`  [FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
    throw new Error(`Assertion failed: ${testName}`);
  }
  passedTests++;
  console.log(`  [PASS] ${testName}`);
}

async function runPhase4_4Tests() {
  console.log('========================================================');
  console.log('STARTING EZRAB PHASE 4.4 PRODUCTION ACCEPTANCE TESTS');
  console.log('========================================================\n');

  const projectIdA = 'PROJ-PH44-ALPHA';
  const projectIdB = 'PROJ-PH44-BETA';

  // ========================================================
  // [TEST GROUP 1] Source CRUD Persistence Per Domain
  // ========================================================
  console.log('[TEST GROUP 1] Source CRUD Persistence Per Domain');

  // 1.1 Personnel CRUD
  const personnelRepoA = new ProjectDataRepository<ProjectPersonnel>('personnel', projectIdA);
  const persItem1 = createProjectEntity<ProjectPersonnel>(projectIdA, {
    name: 'Ir. Hendra Saputra, S.T., M.T.',
    position: 'Project Manager',
    qualification: 'S2 Teknik Sipil / SKA Ahli Madya',
    experience: '12 Tahun',
    responsibility: 'Penanggung jawab operasional konstruksi di lapangan',
  });
  personnelRepoA.save(persItem1);
  assert(personnelRepoA.list().length === 1, 'Personnel: save and list 1 item');
  assert(personnelRepoA.list()[0].name === 'Ir. Hendra Saputra, S.T., M.T.', 'Personnel: name matches');

  personnelRepoA.update(persItem1.id, { experience: '15 Tahun' });
  assert(personnelRepoA.list()[0].experience === '15 Tahun', 'Personnel: update item');

  // 1.2 Equipment CRUD
  const equipmentRepoA = new ProjectDataRepository<ProjectEquipment>('equipment', projectIdA);
  const eqItem1 = createProjectEntity<ProjectEquipment>(projectIdA, {
    name: 'Excavator Komatsu PC200',
    type: 'Alat Berat Galian',
    quantity: 2,
    capacity: '0.93 m³ Bucket',
    condition: 'Baik (100% Siap Operasi)',
    owner: 'Milik Sendiri',
  });
  equipmentRepoA.save(eqItem1);
  assert(equipmentRepoA.list().length === 1, 'Equipment: save and list 1 item');
  assert(equipmentRepoA.list()[0].quantity === 2, 'Equipment: quantity matches');

  equipmentRepoA.update(eqItem1.id, { quantity: 3 });
  assert(equipmentRepoA.list()[0].quantity === 3, 'Equipment: update quantity');

  // 1.3 JSA CRUD
  const jsaRepoA = new ProjectDataRepository<ProjectJsaItem>('jsa', projectIdA);
  const jsaItem1 = createProjectEntity<ProjectJsaItem>(projectIdA, {
    activity: 'Pekerjaan Galian Tanah Struktur Kedalaman > 2m',
    hazard: 'Dinding tebing galian runtuh / longsor',
    risk: 'Tinggi',
    control: 'Pemasangan turap penahan tanah (sheet pile) dan sudut lereng aman (slope)',
    responsiblePerson: 'Ahli K3 Konstruksi',
    ppe: 'Helm Keselamatan, Sepatu Safety, Rompi Reflektif',
  });
  jsaRepoA.save(jsaItem1);
  assert(jsaRepoA.list().length === 1, 'JSA: save and list 1 item');
  assert(jsaRepoA.list()[0].hazard.includes('tebing galian runtuh'), 'JSA: hazard matches');

  // 1.4 RKK Structured CRUD
  const rkkRepoA = new ProjectDataRepository<ProjectRkkData>('rkk', projectIdA);
  const rkkItem1 = createProjectEntity<ProjectRkkData>(projectIdA, {
    organization: 'Direktur Utama -> Ahli K3 Konstruksi -> Pelaksana Lapangan',
    hsePersonnel: 'Ir. Ahmad Yusuf, S.T. (SKA 603 Ahli Madya K3)',
    safetyObjectives: 'Target Zero Fatality dan 100% Kepatuhan APD',
    riskControls: 'Toolbox meeting harian dan inspeksi mingguan',
    procedures: 'SOP Tanggap Darurat Bencana dan Pertolongan Pertama (P3K)',
  });
  rkkRepoA.save(rkkItem1);
  assert(rkkRepoA.list().length === 1, 'RKK: save and list 1 structured record');
  assert(rkkRepoA.list()[0].safetyObjectives!.includes('Zero Fatality'), 'RKK: safetyObjectives matches');

  // 1.5 AHSP Project CRUD
  const ahspItem1 = saveCustomProjectAhsp(projectIdA, {
    ahspCode: 'A.2.2.1.9',
    description: '1 m3 Galian Tanah Biasa Sedalam > 1m s.d 2m',
    unit: 'm3',
    coefficients: 1.0,
    materialCost: 0,
    laborCost: 85000,
    equipmentCost: 15000,
  });
  assert(listProjectAhspItems(projectIdA).length === 1, 'AHSP: save custom item');
  assert(listProjectAhspItems(projectIdA)[0].ahspCode === 'A.2.2.1.9', 'AHSP: code matches');

  // ========================================================
  // [TEST GROUP 2] Reload Persistence (Re-instantiate repository)
  // ========================================================
  console.log('\n[TEST GROUP 2] Reload Persistence Simulation');

  // Simulating fresh page load by creating new repository instances
  const freshPersonnelRepo = new ProjectDataRepository<ProjectPersonnel>('personnel', projectIdA);
  const freshEquipmentRepo = new ProjectDataRepository<ProjectEquipment>('equipment', projectIdA);
  const freshJsaRepo = new ProjectDataRepository<ProjectJsaItem>('jsa', projectIdA);
  const freshRkkRepo = new ProjectDataRepository<ProjectRkkData>('rkk', projectIdA);
  const freshAhspList = listProjectAhspItems(projectIdA);

  assert(freshPersonnelRepo.list().length === 1, 'Reload: Personnel retrieved from localStorage');
  assert(freshEquipmentRepo.list().length === 1, 'Reload: Equipment retrieved from localStorage');
  assert(freshJsaRepo.list().length === 1, 'Reload: JSA retrieved from localStorage');
  assert(freshRkkRepo.list().length === 1, 'Reload: RKK retrieved from localStorage');
  assert(freshAhspList.length === 1, 'Reload: AHSP retrieved from localStorage');

  // Verify key namespace convention
  assert(
    Boolean(localStorage.getItem(`ezrab:project:${projectIdA}:personnel`)),
    'Namespace: ezrab:project:{projectId}:personnel exists'
  );
  assert(
    Boolean(localStorage.getItem(`ezrab:project:${projectIdA}:equipment`)),
    'Namespace: ezrab:project:{projectId}:equipment exists'
  );
  assert(
    Boolean(localStorage.getItem(`ezrab:project:${projectIdA}:jsa`)),
    'Namespace: ezrab:project:{projectId}:jsa exists'
  );
  assert(
    Boolean(localStorage.getItem(`ezrab:project:${projectIdA}:rkk`)),
    'Namespace: ezrab:project:{projectId}:rkk exists'
  );
  assert(
    Boolean(localStorage.getItem(`ezrab:project:${projectIdA}:ahsp`)),
    'Namespace: ezrab:project:{projectId}:ahsp exists'
  );

  // ========================================================
  // [TEST GROUP 3] Strict Project Namespace Isolation
  // ========================================================
  console.log('\n[TEST GROUP 3] Strict Project Namespace Isolation');

  // Insert distinct data into Project B
  const personnelRepoB = new ProjectDataRepository<ProjectPersonnel>('personnel', projectIdB);
  const equipmentRepoB = new ProjectDataRepository<ProjectEquipment>('equipment', projectIdB);
  const jsaRepoB = new ProjectDataRepository<ProjectJsaItem>('jsa', projectIdB);
  const rkkRepoB = new ProjectDataRepository<ProjectRkkData>('rkk', projectIdB);

  const persItemB = createProjectEntity<ProjectPersonnel>(projectIdB, {
    name: 'Budi Santoso, S.T.',
    position: 'Site Engineer Beta',
    qualification: 'S1 Teknik Sipil',
  });
  personnelRepoB.save(persItemB);

  const eqItemB = createProjectEntity<ProjectEquipment>(projectIdB, {
    name: 'Dump Truck Hino 24T',
    type: 'Dump Truck',
    quantity: 5,
  });
  equipmentRepoB.save(eqItemB);

  const jsaItemB = createProjectEntity<ProjectJsaItem>(projectIdB, {
    activity: 'Pengecoran Beton Plat Lantai',
    hazard: 'Terjatuh dari ketinggian',
    risk: 'Tinggi',
    control: 'Safety harness & railing',
  });
  jsaRepoB.save(jsaItemB);

  const rkkItemB = createProjectEntity<ProjectRkkData>(projectIdB, {
    organization: 'Organisasi Proyek Beta',
    safetyObjectives: 'Zero Incident Beta Project',
  });
  rkkRepoB.save(rkkItemB);

  saveCustomProjectAhsp(projectIdB, {
    ahspCode: 'B.01.BETON',
    description: '1 m3 Beton K-300 Beta',
    unit: 'm3',
    coefficients: 1.0,
    materialCost: 900000,
    laborCost: 100000,
    equipmentCost: 50000,
  });

  // Verify Project A does NOT see Project B items
  const pListA = personnelRepoA.list();
  const pListB = personnelRepoB.list();
  assert(pListA.length === 1 && pListB.length === 1, 'Isolation: Both have 1 distinct item');
  assert(pListA[0].id !== pListB[0].id, 'Isolation: Entity IDs are strictly different');
  assert(pListA[0].projectId === projectIdA, 'Isolation: Item A projectId is A');
  assert(pListB[0].projectId === projectIdB, 'Isolation: Item B projectId is B');
  assert(!pListA.some((x) => x.id === pListB[0].id), 'Isolation: Project A list excludes Project B item');
  assert(!pListB.some((x) => x.id === pListA[0].id), 'Isolation: Project B list excludes Project A item');

  // Verify AHSP isolation
  const ahspListA = listProjectAhspItems(projectIdA);
  const ahspListB = listProjectAhspItems(projectIdB);
  assert(ahspListA[0].ahspCode === 'A.2.2.1.9', 'Isolation: AHSP A retains code A.2.2.1.9');
  assert(ahspListB[0].ahspCode === 'B.01.BETON', 'Isolation: AHSP B retains code B.01.BETON');
  assert(!ahspListA.some((x) => x.ahspCode === 'B.01.BETON'), 'Isolation: AHSP A does not contain AHSP B');

  // ========================================================
  // [TEST GROUP 4] Canonical AHSP Bridge (Catalog -> Project Ahsp)
  // ========================================================
  console.log('\n[TEST GROUP 4] Canonical AHSP Bridge (Catalog Selection)');

  const sampleCatalogItem: NationalAHSPItem = {
    id: 'CAT-AHSP-2026-001',
    code: 'A.4.1.1.4',
    codeNormalized: 'A.4.1.1.4',
    name: '1 m3 Pembongkaran Beton Bertulang',
    unit: 'm3',
    domain: 'CIPTA_KARYA',
    category: 'PEKERJAAN BETON',
    version: '2026',
    year: 2026,
    normativeStatus: 'Normatif',
    method: 'Semi-Mekanis',
    sourceId: 'DJBK-2026',
    sourceDocument: 'SE DJBK No. 47 Tahun 2026',
    status: 'VERIFIED',
    laborComponents: [],
    materialComponents: [],
    equipmentComponents: [],
    totalLabor: 180000,
    totalMaterial: 0,
    totalEquipment: 45000,
    unitPrice: 225000,
    lastUpdated: '2026-01-15',
    dataQualityScore: 100,
  };

  saveProjectAhspFromCatalog(projectIdA, sampleCatalogItem);
  const updatedAhspA = listProjectAhspItems(projectIdA);
  assert(updatedAhspA.length === 2, 'Bridge: Catalog item saved into Project A AHSP repo');
  const bridgedItem = updatedAhspA.find((x) => x.ahspCode === 'A.4.1.1.4');
  assert(Boolean(bridgedItem), 'Bridge: Catalog code A.4.1.1.4 found in project');
  assert(bridgedItem?.laborCost === 180000, 'Bridge: Labor cost mapped from catalog');
  assert(bridgedItem?.equipmentCost === 45000, 'Bridge: Equipment cost mapped from catalog');

  // ========================================================
  // [TEST GROUP 5] Source -> Integration Adapter -> DocumentData Flow
  // ========================================================
  console.log('\n[TEST GROUP 5] Source -> Integration Adapter -> DocumentData Flow');

  const mappedPersonnel = mapPersonnelRows(personnelRepoA.list());
  assert(mappedPersonnel.length === 1, 'Adapter: mapPersonnelRows maps exact count');
  assert(mappedPersonnel[0].name === 'Ir. Hendra Saputra, S.T., M.T.', 'Adapter: mapped name intact');
  assert(mappedPersonnel[0].position === 'Project Manager', 'Adapter: mapped position intact');

  const mappedEquipment = mapEquipmentRows(equipmentRepoA.list());
  assert(mappedEquipment.length === 1, 'Adapter: mapEquipmentRows maps exact count');
  assert(mappedEquipment[0].name === 'Excavator Komatsu PC200', 'Adapter: mapped equipment name intact');
  assert(mappedEquipment[0].quantity === 3, 'Adapter: mapped equipment quantity intact');

  const mappedJsa = mapJsaRows(jsaRepoA.list());
  assert(mappedJsa.length === 1, 'Adapter: mapJsaRows maps exact count');
  assert(mappedJsa[0].controlMeasure.includes('sheet pile'), 'Adapter: mapped control measure intact');

  const mappedRkk = mapRkkRows(rkkRepoA.list());
  assert(mappedRkk.length === 1, 'Adapter: mapRkkRows maps exact count');
  assert(mappedRkk[0].safetyObjectives!.includes('Zero Fatality'), 'Adapter: mapped safety objectives intact');

  const mappedAhsp = mapAhspRows(listProjectAhspItems(projectIdA));
  assert(mappedAhsp.length === 2, 'Adapter: mapAhspRows maps exact count (2 items)');

  // Build full DocumentData for JSA Document
  const jsaDef = getDocumentDefinition('jsa')!;
  const masterDataA: ProjectMasterData = {
    ...EMPTY_MASTER_DATA,
    projectName: 'Pembangunan Gedung Laboratorium Terpadu',
    projectNumber: projectIdA,
    owner: 'Universitas Indonesia',
    contractor: 'PT Ezrab Bangun Persada',
    location: 'Depok, Jawa Barat',
    contractValue: '12500000000',
    director: 'Ir. Ahmad Yusuf, S.T., M.T.',
    companyName: 'PT Ezrab Bangun Persada',
    companyAddress: 'Jl. Pemuda No. 45, Surabaya',
    companyPhone: '031-5551234',
    companyEmail: 'kontak@ezrab-persada.co.id',
  };

  const docDataJsa = buildDocumentData(jsaDef, {
    master: masterDataA,
    projectJsa: jsaRepoA.list(),
    projectPersonnel: personnelRepoA.list(),
    projectEquipment: equipmentRepoA.list(),
    projectRkk: rkkRepoA.list(),
    projectAhspItems: listProjectAhspItems(projectIdA),
  });

  assert(docDataJsa.jsa.length === 1, 'DocumentData: contains 1 JSA row');
  assert(String((docDataJsa.jsa[0] as any).activity).includes('Galian Tanah Struktur'), 'DocumentData: JSA activity intact');
  assert(docDataJsa.personnel.length === 1, 'DocumentData: contains 1 personnel row');
  assert(docDataJsa.equipment.length === 1, 'DocumentData: contains 1 equipment row');

  // Verify DocumentData Project Isolation: Project A DocumentData does NOT contain Project B items
  const docDataJsaB = buildDocumentData(jsaDef, {
    master: { ...masterDataA, projectName: 'Proyek Beta', projectNumber: projectIdB },
    projectJsa: jsaRepoB.list(),
  });
  assert(
    String((docDataJsa.jsa[0] as any).activity) !== String((docDataJsaB.jsa[0] as any).activity),
    'DocumentData Isolation: Content A !== Content B'
  );

  // ========================================================
  // [TEST GROUP 6] Dynamic Dependency Validation
  // ========================================================
  console.log('\n[TEST GROUP 6] Dynamic Dependency Validation');

  // 6.1 Empty JSA source -> FAIL on JSA document
  const emptyJsaDocData = buildDocumentData(jsaDef, {
    master: masterDataA,
    projectJsa: [], // Empty source!
  });
  const valEmptyJsa = validateDocument(jsaDef, emptyJsaDocData);
  assert(!valEmptyJsa.valid, 'Validation: Empty JSA source causes valid: false');
  assert(valEmptyJsa.errors.includes('Data JSA belum tersedia'), 'Validation: Specific error for missing JSA');

  // 6.2 Populated JSA source -> PASS on JSA document
  const valPopulatedJsa = validateDocument(jsaDef, docDataJsa);
  assert(valPopulatedJsa.valid, 'Validation: Populated JSA source causes valid: true');
  assert(valPopulatedJsa.errors.length === 0, 'Validation: 0 errors on populated JSA');

  // 6.3 Empty Personnel source -> FAIL on personnel-availability document
  const persAvailDef = getDocumentDefinition('personnel-availability')!;
  const emptyPersDocData = buildDocumentData(persAvailDef, {
    master: masterDataA,
    projectPersonnel: [], // Empty!
  });
  const valEmptyPers = validateDocument(persAvailDef, emptyPersDocData);
  assert(!valEmptyPers.valid, 'Validation: Empty personnel causes valid: false on personnel-availability');
  assert(valEmptyPers.errors.includes('Data Personil belum tersedia'), 'Validation: Specific error for missing personnel');

  // 6.4 Populated Personnel source -> PASS
  const popPersDocData = buildDocumentData(persAvailDef, {
    master: masterDataA,
    projectPersonnel: personnelRepoA.list(),
  });
  const valPopPers = validateDocument(persAvailDef, popPersDocData);
  assert(valPopPers.valid, 'Validation: Populated personnel causes valid: true');

  // 6.5 RKK Document Validation
  const rkkDef = getDocumentDefinition('rkk')!;
  const emptyRkkDocData = buildDocumentData(rkkDef, { master: masterDataA, projectRkk: [] });
  assert(!validateDocument(rkkDef, emptyRkkDocData).valid, 'Validation: Empty RKK causes valid: false');
  const popRkkDocData = buildDocumentData(rkkDef, { master: masterDataA, projectRkk: rkkRepoA.list() });
  assert(validateDocument(rkkDef, popRkkDocData).valid, 'Validation: Populated RKK causes valid: true');

  // ========================================================
  // [TEST GROUP 7] Real Export E2E (PDF, DOCX, XLSX, History)
  // ========================================================
  console.log('\n[TEST GROUP 7] Real Export E2E (PDF, DOCX, XLSX, History)');

  const docRepo = new LocalDocumentRepository(projectIdA);

  // Test E2E JSA Document Export (Supported: PDF, DOCX, XLSX)
  // 7.1 RenderedDocument Structural Verification
  const renderedJsa = renderDocument(jsaDef, docDataJsa);
  assert(Boolean(renderedJsa.metadata.project), 'Render: Project identity present');
  assert(renderedJsa.tables.length === 1, 'Render: JSA table contains 1 row');
  assert(Boolean(renderedJsa.tableColumns), 'Render: Table columns defined');
  assert(renderedJsa.signatures.length >= 1, 'Render: Signatures block structured');

  // 7.2 Export PDF
  const pdfResult = await exportDocument({
    definition: jsaDef,
    context: {
      master: masterDataA,
      projectJsa: jsaRepoA.list(),
    },
    format: 'PDF',
    repository: docRepo,
    triggerDownload: false,
  });
  assert(pdfResult.success, 'E2E: JSA PDF Export succeeded');
  assert(Boolean(pdfResult.blob), 'E2E: JSA PDF Blob generated');
  assert(pdfResult.filename.includes('TDR-HSE-003'), 'E2E: PDF filename contains doc code');

  // 7.3 Export DOCX
  const docxResult = await exportDocument({
    definition: jsaDef,
    context: {
      master: masterDataA,
      projectJsa: jsaRepoA.list(),
    },
    format: 'DOCX',
    repository: docRepo,
    triggerDownload: false,
  });
  assert(docxResult.success, 'E2E: JSA DOCX Export succeeded');
  assert(Boolean(docxResult.blob), 'E2E: JSA DOCX Blob generated');
  assert(docxResult.filename.endsWith('.docx'), 'E2E: DOCX filename ends with .docx');

  // 7.4 Export XLSX
  const xlsxResult = await exportDocument({
    definition: jsaDef,
    context: {
      master: masterDataA,
      projectJsa: jsaRepoA.list(),
    },
    format: 'XLSX',
    repository: docRepo,
    triggerDownload: false,
  });
  assert(xlsxResult.success, 'E2E: JSA XLSX Export succeeded');
  assert(Boolean(xlsxResult.blob), 'E2E: JSA XLSX Blob generated');
  assert(xlsxResult.filename.endsWith('.xlsx'), 'E2E: XLSX filename ends with .xlsx');

  // 7.5 Export History Verification
  const history = docRepo.getExportHistory(jsaDef.id);
  assert(history.length >= 3, 'History: Export history contains all 3 generated formats');
  assert(history.some((h) => h.format === 'PDF' && h.status === 'SUCCESS'), 'History: PDF SUCCESS logged');
  assert(history.some((h) => h.format === 'DOCX' && h.status === 'SUCCESS'), 'History: DOCX SUCCESS logged');
  assert(history.some((h) => h.format === 'XLSX' && h.status === 'SUCCESS'), 'History: XLSX SUCCESS logged');

  // ========================================================
  // [TEST GROUP 8] Deletion & Clean-up Verification
  // ========================================================
  console.log('\n[TEST GROUP 8] Source Deletion & Real-time Update');

  removeProjectAhspItem(projectIdA, sampleCatalogItem.id);
  // Also remove custom item
  removeProjectAhspItem(projectIdA, ahspItem1.id);
  assert(listProjectAhspItems(projectIdA).length <= 1, 'Delete: AHSP item removed from repository');

  console.log('\n========================================================');
  console.log(`PHASE 4.4 TEST SUMMARY: ${passedTests} PASSED, 0 FAILED out of ${totalTests} tests`);
  console.log('========================================================\n');
}

runPhase4_4Tests().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
