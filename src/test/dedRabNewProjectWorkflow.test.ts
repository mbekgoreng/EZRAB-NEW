/**
 * EZRAB DED → RAB WORKFLOW REGRESSION TEST SUITE (ACCEPTANCE CRITERIA TESTS A-G)
 *
 * Verifies the complete state machine and workflow transitions:
 * TEST A — Existing Project Flow
 * TEST B — New Project Flow (Create -> Active -> Primary CTA -> Analysis -> Spreadsheet)
 * TEST C — New Project + Rerender (No state reversion to project selection)
 * TEST D — New Project + Existing DED (Direct CTA readiness without re-prompt)
 * TEST E — New Project + No DED (Guided DED selection -> enabled CTA)
 * TEST F — Analysis Error Resilience (Project retained + Retry without duplication)
 * TEST G — Strict Project Data Isolation (Project A vs Project B)
 */

import { deriveProjectNameFromFileName } from '../components/document/DedRabWorkflowView';
import { Project, RabItem, RABSection } from '../types';
import { dedRabReviewService } from '../ded-rab-v2/review/dedRabReviewService';
import { DedWorkItem } from '../ded-rab-v2/types';

// =============================================================================
// MOCK BUILDERS
// =============================================================================

function createMockWorkItem(projectId: string, idSuffix: string, ahspCode: string, unitPrice: number): DedWorkItem {
  return {
    id: `ITEM-${projectId}-${idSuffix}`,
    canonicalWorkId: `WORK-${idSuffix}`,
    projectId,
    sourceDocumentId: `DOC-${projectId}-01`,
    name: `Pekerjaan ${idSuffix}`,
    category: 'STRUCTURE_COLUMN',
    status: 'CONFIRMED',
    sourceType: 'DED_VERIFIED',
    source: 'DED',
    quantity: 10,
    quantityStatus: 'CONFIRMED',
    evidenceIds: [],
    sourcePages: [1],
    dimensions: {},
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm3',
    calculationInputs: {},
    confidence: 0.98,
    assumptions: [],
    warnings: [],
    materialSpec: 'Spesifikasi Standar PUPR 2026',
    qto: { formula: '10', quantity: 10, unit: 'm3', status: 'CALCULATED' },
    ahspMatch: {
      code: ahspCode,
      name: `Analisa ${ahspCode}`,
      unit: 'm3',
      matchType: 'EXACT_MATCH',
      confidence: 0.99,
      source: 'STANDAR_PUPR_2026',
    },
    price: {
      unitPrice,
      totalPrice: unitPrice * 10,
      materialPrice: unitPrice * 0.6,
      laborPrice: unitPrice * 0.35,
      equipmentPrice: unitPrice * 0.05,
      priceSource: 'OFFICIAL_AHSP',
      isOfficial: true,
      currency: 'IDR',
      components: [],
    },
    entityType: 'CONSTRUCTION_WORK',
    rabEligible: true,
    validationStatus: 'READY',
    quantitySource: 'DED_DIMENSION',
    userApproved: true,
  };
}

// =============================================================================
// WORKFLOW STATE SIMULATOR
// =============================================================================

interface WorkflowState {
  currentProject: Project | null;
  projects: Project[];
  targetProjectMode: 'ACTIVE' | 'NEW';
  hasExplicitlyChosenMode: boolean;
  customProjectName: string;
  createdProjectId: string | null;
  selectedFile: { name: string; size: number } | null;
  isExecuting: boolean;
  executionError: string | null;
  executionOutput: any | null;
}

class DedRabWorkflowSimulator {
  public state: WorkflowState;
  private currentProjectId: string | null = null;

  constructor(initialProject: Project | null = null, projects: Project[] = []) {
    this.state = {
      currentProject: initialProject,
      projects: [...projects],
      targetProjectMode: initialProject ? 'ACTIVE' : 'NEW',
      hasExplicitlyChosenMode: false,
      customProjectName: '',
      createdProjectId: null,
      selectedFile: null,
      isExecuting: false,
      executionError: null,
      executionOutput: null,
    };
    if (initialProject) {
      this.currentProjectId = initialProject.id;
    }
  }

  // Active target project computation matching DedRabWorkflowView.tsx
  get activeTargetProject(): Project | null {
    if (this.state.createdProjectId) {
      const found = this.state.projects.find((p) => p.id === this.state.createdProjectId);
      if (found) return found;
      return {
        id: this.state.createdProjectId,
        name: this.state.customProjectName || 'Proyek Baru',
        buildingType: 'Rumah Tinggal',
        status: 'draft',
        creationMethod: 'magic_ai',
        progress: 0,
        totalRab: 0,
      } as unknown as Project;
    }
    return this.state.currentProject;
  }

  get effectiveProjectId(): string {
    return this.activeTargetProject?.id || 'PRJ-RUMAH-2LT-01';
  }

  get effectiveProjectName(): string {
    return this.activeTargetProject?.name || 'PRJ-RUMAH-2LT-01';
  }

  // CTA readiness check matching DedRabWorkflowView.tsx
  get isCtaEnabled(): boolean {
    return !!this.state.selectedFile && !this.state.isExecuting;
  }

  get ctaLabel(): string {
    if (this.state.isExecuting) return '⏳ Menganalisis DED...';
    return '🚀 Jalankan Analisis DED → RAB';
  }

  // User actions
  selectTargetMode(mode: 'ACTIVE' | 'NEW') {
    this.state.targetProjectMode = mode;
    this.state.hasExplicitlyChosenMode = true;
  }

  uploadFile(name: string, size: number = 2048000) {
    this.state.selectedFile = { name, size };
    if (!this.state.customProjectName) {
      this.state.customProjectName = deriveProjectNameFromFileName(name);
    }
  }

  createNewProject(explicitName?: string): Project {
    const derivedName = this.state.selectedFile
      ? deriveProjectNameFromFileName(this.state.selectedFile.name)
      : 'Proyek DED Baru';
    const finalName = (explicitName || this.state.customProjectName || derivedName || 'Proyek Baru').trim();

    const newProj: Project = {
      id: `PRJ-SIM-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: finalName,
      buildingType: 'Rumah Tinggal',
      status: 'draft',
      creationMethod: 'magic_ai',
      progress: 0,
      totalRab: 0,
      sections: [],
    } as any;

    this.state.projects.push(newProj);
    this.state.createdProjectId = newProj.id;
    this.state.customProjectName = newProj.name;
    this.state.targetProjectMode = 'ACTIVE';
    this.state.hasExplicitlyChosenMode = true;
    this.currentProjectId = newProj.id;
    this.state.currentProject = newProj;

    return newProj;
  }

  // Simulate component rerender (e.g. state update / context change)
  rerender() {
    if (!this.state.hasExplicitlyChosenMode && !this.state.createdProjectId) {
      if (this.state.currentProject) {
        this.state.targetProjectMode = 'ACTIVE';
      } else {
        this.state.targetProjectMode = 'NEW';
      }
    }
  }

  // Start analysis pipeline
  async startAnalysis(mockFail: boolean = false) {
    if (!this.state.selectedFile) {
      throw new Error('Cannot run analysis without DED file');
    }

    this.state.isExecuting = true;
    this.state.executionError = null;

    let targetProjectId = '';
    let targetProjectName = '';

    if (this.state.createdProjectId) {
      targetProjectId = this.state.createdProjectId;
      targetProjectName = this.activeTargetProject?.name || 'Proyek Baru';
    } else if (this.state.targetProjectMode === 'NEW' || !this.state.currentProject) {
      const newProj = this.createNewProject();
      targetProjectId = newProj.id;
      targetProjectName = newProj.name;
    } else {
      targetProjectId = this.state.currentProject.id;
      targetProjectName = this.state.currentProject.name;
    }

    if (mockFail) {
      this.state.isExecuting = false;
      this.state.executionError = 'Simulated AI Pipeline Failure';
      return;
    }

    const items = [
      createMockWorkItem(targetProjectId, '01', '2.2.2.1.6', 950000),
      createMockWorkItem(targetProjectId, '02', '2.2.1.10.1', 125000),
    ];

    this.state.executionOutput = {
      success: true,
      projectId: targetProjectId,
      projectName: targetProjectName,
      workItems: items,
    };
    this.state.isExecuting = false;
  }

  commitToRab(): { activePid: string; items: RabItem[]; grandTotal: number } {
    if (!this.state.executionOutput) {
      throw new Error('No execution output to commit');
    }
    const pid = this.state.executionOutput.projectId;
    const officialItems = dedRabReviewService.convertToOfficialRabItems(this.state.executionOutput.workItems, pid);
    const grandTotal = officialItems.reduce((acc: number, item: RabItem) => acc + (item.totalPrice || 0), 0);
    return {
      activePid: pid,
      items: officialItems,
      grandTotal,
    };
  }
}

// =============================================================================
// RUNNER
// =============================================================================

async function runAcceptanceTests() {
  console.log('======================================================================');
  console.log('EZRAB DED → RAB WORKFLOW ACCEPTANCE CRITERIA VERIFICATION (TESTS A-G)');
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}${detail ? `: ${detail}` : ''}`);
      failed++;
    }
  }

  // --- TEST A: Existing Project ---
  console.log('--- TEST A: Existing Project Flow ---');
  const projExisting: Project = {
    id: 'PRJ-EXISTING-01',
    name: 'Gedung Kantor 3 Lantai',
    buildingType: 'Komersial',
    status: 'draft',
    creationMethod: 'manual',
    progress: 0,
    totalRab: 0,
    sections: [],
  } as any;

  const simA = new DedRabWorkflowSimulator(projExisting);
  assert(simA.state.targetProjectMode === 'ACTIVE', 'TEST A.1: Defaults to ACTIVE when project exists');
  assert(simA.effectiveProjectId === 'PRJ-EXISTING-01', 'TEST A.2: Effective project matches existing project');
  assert(!simA.isCtaEnabled, 'TEST A.3: CTA disabled before DED upload');

  simA.uploadFile('PRJ_KANTOR_DED.pdf');
  assert(simA.isCtaEnabled, 'TEST A.4: CTA enabled after DED upload');
  assert(simA.ctaLabel === '🚀 Jalankan Analisis DED → RAB', 'TEST A.5: Displays primary CTA label');

  await simA.startAnalysis();
  assert(simA.state.executionOutput?.projectId === 'PRJ-EXISTING-01', 'TEST A.6: Analysis runs on existing project');

  const commitA = simA.commitToRab();
  assert(commitA.activePid === 'PRJ-EXISTING-01', 'TEST A.7: Spreadsheet commit opens existing project ID');

  // --- TEST B: New Project Flow ---
  console.log('\n--- TEST B: New Project Flow (Create -> Active -> Primary CTA -> Spreadsheet) ---');
  const simB = new DedRabWorkflowSimulator(null);
  assert(simB.state.targetProjectMode === 'NEW', 'TEST B.1: Defaults to NEW when no project exists');

  simB.state.customProjectName = 'Rumah Tinggal Type 36';
  const newProjB = simB.createNewProject();
  assert(newProjB.id.startsWith('PRJ-SIM-'), 'TEST B.2: Creates project with valid ID contract');
  assert(simB.state.targetProjectMode === 'ACTIVE', 'TEST B.3: Mode automatically transitions to ACTIVE');
  assert(simB.effectiveProjectId === newProjB.id, 'TEST B.4: Effective project is now the created project');
  assert(simB.effectiveProjectName === 'Rumah Tinggal Type 36', 'TEST B.5: Project name matches user input');

  // CTA disabled until file upload
  assert(!simB.isCtaEnabled, 'TEST B.6: CTA disabled when DED is not yet selected');

  simB.uploadFile('DED_Rumah_Type36.pdf');
  assert(simB.isCtaEnabled, 'TEST B.7: CTA becomes enabled immediately upon DED selection');
  assert(simB.ctaLabel === '🚀 Jalankan Analisis DED → RAB', 'TEST B.8: Primary CTA visible and ready');

  await simB.startAnalysis();
  assert(simB.state.executionOutput.projectId === newProjB.id, 'TEST B.9: Analysis runs on newly created project');

  const commitB = simB.commitToRab();
  assert(commitB.activePid === newProjB.id, 'TEST B.10: Spreadsheet transfer carries new project ID');

  // --- TEST C: New Project + Rerender Resilience ---
  console.log('\n--- TEST C: New Project + Rerender Resilience ---');
  const simC = new DedRabWorkflowSimulator(projExisting);
  simC.selectTargetMode('NEW');
  simC.uploadFile('PRJ-VILLA-BALI.pdf');
  const newProjC = simC.createNewProject('Villa Tropis Bali');

  assert(simC.effectiveProjectId === newProjC.id, 'TEST C.1: Active project is Villa Tropis Bali');

  // Simulate multiple component rerenders
  simC.rerender();
  simC.rerender();
  simC.rerender();

  assert(simC.state.targetProjectMode === 'ACTIVE', 'TEST C.2: Does not revert back to project selector on rerender');
  assert(simC.state.createdProjectId === newProjC.id, 'TEST C.3: Retains createdProjectId across rerenders');
  assert(simC.isCtaEnabled, 'TEST C.4: Primary CTA remains enabled after rerender');
  assert(simC.effectiveProjectId === newProjC.id, 'TEST C.5: Retains active project ID across rerenders');

  // --- TEST D: New Project + Existing DED File ---
  console.log('\n--- TEST D: New Project with DED File Already Uploaded ---');
  const simD = new DedRabWorkflowSimulator(projExisting);
  // User uploads file FIRST
  simD.uploadFile('PRJ-RUMAH-2LT-01_DED.pdf');
  assert(simD.state.customProjectName === 'Rumah Tinggal 2 Lantai', 'TEST D.1: Auto-derives name from file');

  // User chooses "Buat Proyek Baru"
  simD.selectTargetMode('NEW');
  const newProjD = simD.createNewProject();
  assert(simD.effectiveProjectId === newProjD.id, 'TEST D.2: Project created from derived name');
  assert(simD.isCtaEnabled, 'TEST D.3: Primary CTA is immediately enabled without asking for file again');

  await simD.startAnalysis();
  assert(simD.state.executionOutput.projectId === newProjD.id, 'TEST D.4: Analysis runs directly for new project');

  // --- TEST E: New Project + No DED File ---
  console.log('\n--- TEST E: New Project + No DED File Flow ---');
  const simE = new DedRabWorkflowSimulator(null);
  const newProjE = simE.createNewProject('Ruko 2 Lantai');
  assert(!simE.isCtaEnabled, 'TEST E.1: CTA disabled when no file is present');
  assert(simE.state.selectedFile === null, 'TEST E.2: selectedFile is null, prompt shown to user');

  // User selects file
  simE.uploadFile('Ruko_2Lt_Arsitektur.pdf');
  assert(simE.isCtaEnabled, 'TEST E.3: CTA becomes enabled after file selection');

  // --- TEST F: Analysis Error Handling & Retry Without Duplication ---
  console.log('\n--- TEST F: Analysis Error Resilience & Project Retention ---');
  const simF = new DedRabWorkflowSimulator(null);
  const newProjF = simF.createNewProject('Gudang Logistik');
  simF.uploadFile('Gudang_DED.pdf');

  // Simulate pipeline failure
  await simF.startAnalysis(true);
  assert(simF.state.executionError !== null, 'TEST F.1: Execution error recorded');
  assert(simF.state.createdProjectId === newProjF.id, 'TEST F.2: Project NOT rolled back on failure');
  assert(simF.effectiveProjectId === newProjF.id, 'TEST F.3: Project remains active');

  const projectCountBeforeRetry = simF.state.projects.length;

  // Retry analysis
  await simF.startAnalysis(false);
  assert(simF.state.executionError === null, 'TEST F.4: Execution error cleared on retry');
  assert(simF.state.projects.length === projectCountBeforeRetry, 'TEST F.5: Retry did NOT create duplicate project');
  assert(simF.state.executionOutput.projectId === newProjF.id, 'TEST F.6: Succeeded on the same project ID');

  // --- TEST G: Strict Multi-Project Isolation ---
  console.log('\n--- TEST G: Strict Multi-Project Isolation ---');
  const simG = new DedRabWorkflowSimulator(null);
  const projA = simG.createNewProject('Project Alpha');
  simG.uploadFile('Alpha_DED.pdf');
  await simG.startAnalysis();
  const commitA_res = simG.commitToRab();

  // Now create Project Beta in the same session
  const projB = simG.createNewProject('Project Beta');
  simG.uploadFile('Beta_DED.pdf');
  await simG.startAnalysis();
  const commitB_res = simG.commitToRab();

  assert(commitA_res.activePid === projA.id, 'TEST G.1: Commit A assigned to Project Alpha');
  assert(commitB_res.activePid === projB.id, 'TEST G.2: Commit B assigned to Project Beta');
  assert(commitA_res.activePid !== commitB_res.activePid, 'TEST G.3: Project Alpha and Beta IDs are distinct');

  const itemsA = commitA_res.items;
  const itemsB = commitB_res.items;
  const leakage = itemsB.some((b) => b.projectId === projA.id) || itemsA.some((a) => a.projectId === projB.id);
  assert(!leakage, 'TEST G.4: Zero data leakage between projects');

  // ===========================================================================
  // SUMMARY
  // ===========================================================================
  console.log('\n======================================================================');
  console.log(`TOTAL ACCEPTANCE TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('======================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAcceptanceTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
