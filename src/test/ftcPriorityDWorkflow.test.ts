/**
 * EZRAB FAST TRACK CONTINUATION — PRIORITY D (§7) WORKFLOW SUITE
 *
 * Verifies the AI/product workflow invariants for:
 *   WorkspaceView → MagicAiSuperView → DedRabWorkflowView → dedRabPipeline
 *
 * - S1: dedRabPipeline fail-closed guards (live import, NO live AI calls —
 *   the guards throw before any analysis service is reached).
 * - S2: DedRabWorkflowView source contracts (no implicit project creation,
 *   read-only hydration, empty-commit guard, persistence re-verification,
 *   fixed-tab navigation only).
 * - S3: MagicAiSuperView source contracts (pure shell: no project creation,
 *   no storage writes, no network; forwards project context + navigation).
 * - S4: dedRabPipeline source contracts (never creates projects, never
 *   navigates; persist failure is warn-only so the VIEW must re-verify).
 * - S5: Commit-guard simulator (empty commit preserves existing RAB items;
 *   non-empty commit is strictly project-scoped).
 * - S6: Handoff contracts (WorkspaceView → MagicAiSuperView props;
 *   DedRabWorkflowView → dedRabPipeline.execute arguments).
 *
 * Deterministic mocks/fixtures only. No live LLM, no network, no DB.
 * Run: npx --yes tsx src/test/ftcPriorityDWorkflow.test.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveProjectNameFromFileName } from '../components/document/DedRabWorkflowView';
import { dedRabPipeline, PipelineExecutionOutput } from '../ded-rab-v2/pipeline/dedRabPipeline';

// =============================================================================
// SOURCE READERS
// =============================================================================

// tsx menjalankan berkas ini sebagai ESM: __dirname tidak tersedia.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..');
function readSrc(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), 'utf8');
}

const workflowViewSrc = readSrc('components/document/DedRabWorkflowView.tsx');
const superViewSrc = readSrc('components/magic-ai/MagicAiSuperView.tsx');
const pipelineSrc = readSrc('ded-rab-v2/pipeline/dedRabPipeline.ts');
const workspaceViewSrc = readSrc('components/dashboard/WorkspaceView.tsx');

function sliceBetween(src: string, startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker);
  if (start < 0) return '';
  const end = src.indexOf(endMarker, start + startMarker.length);
  if (end < 0) return src.slice(start);
  return src.slice(start, end);
}

function countOccurrences(src: string, needle: string): number {
  return src.split(needle).length - 1;
}

// =============================================================================
// RUNNER
// =============================================================================

async function runFtcPriorityDTests() {
  console.log('======================================================================');
  console.log('EZRAB FTC PRIORITY D (§7) — AI/PRODUCT WORKFLOW VERIFICATION');
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

  // ===========================================================================
  // S1 — PIPELINE FAIL-CLOSED (live import, no AI reached)
  // ===========================================================================
  console.log('--- S1: dedRabPipeline fail-closed guards (no live AI) ---');

  let threwEmptyPid = false;
  try {
    await dedRabPipeline.execute({ projectId: '', files: [{ fileName: 'x.pdf', buffer: 'x' }] } as any);
  } catch (e: any) {
    threwEmptyPid = /Project ID is strictly required/.test(e?.message || '');
  }
  assert(threwEmptyPid, 'S1.1: execute() throws fail-closed on empty projectId');

  let threwBlankPid = false;
  try {
    await dedRabPipeline.execute({ projectId: '   ', files: [{ fileName: 'x.pdf', buffer: 'x' }] } as any);
  } catch (e: any) {
    threwBlankPid = /Project ID is strictly required/.test(e?.message || '');
  }
  assert(threwBlankPid, 'S1.2: execute() throws fail-closed on whitespace-only projectId');

  let threwEmptyFiles = false;
  try {
    await dedRabPipeline.execute({ projectId: 'PRJ-FTC-D-PROBE', files: [] } as any);
  } catch (e: any) {
    threwEmptyFiles = /No source files provided/.test(e?.message || '');
  }
  assert(threwEmptyFiles, 'S1.3: execute() throws fail-closed on empty files list');

  const fakeOutput = {
    success: true,
    jobId: 'job-ftc-d',
    projectId: 'PRJ-FTC-D-MEM',
    mode: 'FAST',
    sourceDocuments: [],
    workItems: [],
    evidences: [],
    reviewSummary: {},
    diagnostics: {},
  } as unknown as PipelineExecutionOutput;
  dedRabPipeline.setActiveResult('PRJ-FTC-D-MEM', fakeOutput);
  assert(
    dedRabPipeline.getActiveResult('PRJ-FTC-D-MEM') === fakeOutput,
    'S1.4: setActiveResult/getActiveResult round-trips in memory only'
  );
  assert(
    dedRabPipeline.getActiveResult('PRJ-FTC-D-UNKNOWN') === undefined,
    'S1.5: getActiveResult returns undefined for unknown project'
  );

  const persistedUnknown = await dedRabPipeline.getPersistedActiveResult('PRJ-FTC-D-NEVER-EXISTED');
  assert(persistedUnknown === undefined, 'S1.6: getPersistedActiveResult returns undefined for unknown project (no network)');

  // ===========================================================================
  // S2 — DEDRABWORKFLOWVIEW SOURCE CONTRACTS
  // ===========================================================================
  console.log('\n--- S2: DedRabWorkflowView source contracts ---');

  const startAnalysisSlice = sliceBetween(
    workflowViewSrc,
    'const handleStartAnalysis = async () => {',
    '// Handle Commit to Official Project RAB'
  );
  const commitSlice = sliceBetween(
    workflowViewSrc,
    'const handleCommitOfficialRab = (officialItems: RabItem[]) => {',
    '// Determine active step index'
  );
  const hydrationSlice = sliceBetween(
    workflowViewSrc,
    'HYDRATE PERSISTED SESSION ON MOUNT',
    'handleClearActiveAnalysis'
  );
  const createNewProjectSlice = sliceBetween(
    workflowViewSrc,
    'const handleCreateNewProject = () => {',
    '// Handler to pick an existing project'
  );
  const createAndOpenSlice = sliceBetween(
    workflowViewSrc,
    'const handleCreateAndOpenSpreadsheet = () => {',
    '// FTC Priority D'
  );

  assert(startAnalysisSlice.length > 0, 'S2.0: handleStartAnalysis slice located');
  assert(commitSlice.length > 0, 'S2.0b: handleCommitOfficialRab slice located');
  assert(hydrationSlice.length > 0, 'S2.0c: hydration slice located');

  // No implicit project creation anywhere in the analysis path.
  assert(
    !startAnalysisSlice.includes('createProject('),
    'S2.1: handleStartAnalysis contains NO createProject() call (no implicit creation)'
  );
  assert(
    startAnalysisSlice.includes('sebelum memulai analisis') && startAnalysisSlice.includes('setIsSelectingProject(true)'),
    'S2.2: handleStartAnalysis fail-closes with guidance + reopens project selector'
  );
  assert(
    countOccurrences(workflowViewSrc, 'createProject(') === 2,
    'S2.3: createProject() appears exactly 2x in the view (both explicit Step-1 buttons)',
    `found ${countOccurrences(workflowViewSrc, 'createProject(')}`
  );
  assert(
    createNewProjectSlice.includes('createProject('),
    'S2.4: handleCreateNewProject ("＋ Buat Proyek" button) still creates explicitly'
  );
  assert(
    createAndOpenSlice.includes('createProject('),
    'S2.5: handleCreateAndOpenSpreadsheet ("Buka Spreadsheet" button) still creates explicitly'
  );

  // Hydration is read-only: no persistent writes from the mount/read path.
  assert(!hydrationSlice.includes('syncOutputToProjectRab'), 'S2.6: hydration never calls syncOutputToProjectRab');
  assert(!hydrationSlice.includes('replaceProjectRabItems'), 'S2.7: hydration never calls replaceProjectRabItems');
  assert(!hydrationSlice.includes('bulkAddRabItems'), 'S2.8: hydration never calls bulkAddRabItems');
  assert(!hydrationSlice.includes('updateProject'), 'S2.9: hydration never calls updateProject');
  assert(!hydrationSlice.includes('createEstimateVersion'), 'S2.10: hydration never creates estimate versions');
  assert(!workflowViewSrc.includes('syncOutputToProjectRab'), 'S2.11: syncOutputToProjectRab helper removed entirely');

  // Empty commit can never wipe project RAB.
  assert(
    !workflowViewSrc.includes('handleCommitOfficialRab([])'),
    'S2.12: no call site passes an empty array to handleCommitOfficialRab'
  );
  assert(
    commitSlice.includes('officialItems.length === 0'),
    'S2.13: handleCommitOfficialRab has an empty-items guard'
  );
  assert(
    commitSlice.indexOf('officialItems.length === 0') < commitSlice.indexOf('replaceProjectRabItems(itemsToSave'),
    'S2.14: empty-items guard runs BEFORE any replaceProjectRabItems write'
  );
  assert(
    workflowViewSrc.includes("onCommitOfficialRab={() => setResultsViewMode('detail')}"),
    'S2.15: Split View "Lanjut ke AHSP & Harga" advances to Detail review instead of committing'
  );

  // No save/success claim without persistence confirmation.
  assert(
    startAnalysisSlice.includes('getLatestAnalysis') &&
      startAnalysisSlice.includes('Gagal memverifikasi persistensi'),
    'S2.16: handleStartAnalysis re-verifies persistence via getLatestAnalysis before showing results'
  );
  assert(
    startAnalysisSlice.indexOf('Gagal memverifikasi persistensi') <
      startAnalysisSlice.indexOf('setExecutionOutput(output)'),
    'S2.17: persistence verification precedes setExecutionOutput (no unconfirmed success)'
  );

  // Slash-only: fixed tab literals only, no NL navigation parsing.
  const navLiterals = Array.from(workflowViewSrc.matchAll(/onNavigateToTab\('([^']+)'\)/g)).map((m) => m[1]);
  assert(navLiterals.length > 0, 'S2.18: navigation call sites found in DedRabWorkflowView');
  assert(
    navLiterals.every((t) => t === 'rab-estimasi'),
    'S2.19: every onNavigateToTab target in DedRabWorkflowView is the fixed literal "rab-estimasi"',
    `found: ${navLiterals.join(', ')}`
  );
  assert(!/buka\s+(ahsp|game|rab|proyek|dokumen)/i.test(workflowViewSrc), 'S2.20: no NL navigation phrases ("buka ahsp/game/...") in DedRabWorkflowView');
  assert(!workflowViewSrc.includes('onKeyDown'), 'S2.21: no keyboard-command input in DedRabWorkflowView');

  // Helper still intact.
  assert(
    deriveProjectNameFromFileName(undefined) === 'Proyek Konstruksi Baru',
    'S2.22: deriveProjectNameFromFileName(undefined) falls back safely'
  );
  assert(
    deriveProjectNameFromFileName('GEDUNG-KANTOR-3LT_REV2.pdf') === 'Gedung Kantor 3lt',
    'S2.23: deriveProjectNameFromFileName strips REV suffix + title-cases'
  );

  // ===========================================================================
  // S3 — MAGICAISUPERVIEW SOURCE CONTRACTS
  // ===========================================================================
  console.log('\n--- S3: MagicAiSuperView source contracts ---');

  assert(!superViewSrc.includes('createProject'), 'S3.1: MagicAiSuperView never creates projects');
  assert(!superViewSrc.includes('localStorage'), 'S3.2: MagicAiSuperView performs no localStorage writes');
  assert(!superViewSrc.includes('sessionStorage'), 'S3.3: MagicAiSuperView performs no sessionStorage writes');
  assert(!superViewSrc.includes('fetch('), 'S3.4: MagicAiSuperView performs no network fetch');
  assert(!superViewSrc.includes('replaceProjectRabItems'), 'S3.5: MagicAiSuperView never writes RAB items');
  assert(!superViewSrc.includes('bulkAddRabItems'), 'S3.6: MagicAiSuperView never bulk-adds RAB items');

  const dashboardJsx = sliceBetween(superViewSrc, '<DedAnalysisDashboard', '/>');
  for (const prop of [
    'currentProject={currentProject}',
    'projects={projects}',
    'onSelectProject={onSelectProject}',
    'onNavigateToTab={onNavigateToTab}',
    'onBackToDashboard={onBackToDashboard}',
    'onOpenRabDetail={onOpenRabDetail}',
    'onCommitSuccess={',
  ]) {
    assert(dashboardJsx.includes(prop), `S3.7: MagicAiSuperView forwards ${prop.split('=')[0]} to DedAnalysisDashboard`);
  }

  const superNavLiterals = Array.from(superViewSrc.matchAll(/onNavigateToTab\('([^']+)'\)/g)).map((m) => m[1]);
  assert(
    superNavLiterals.length > 0 &&
      superNavLiterals.every((t) => t === 'ded-ai' || t === 'rab-spreadsheet'),
    'S3.8: every onNavigateToTab target in MagicAiSuperView is a fixed literal (ded-ai / rab-spreadsheet)',
    `found: ${superNavLiterals.join(', ')}`
  );
  assert(!/buka\s+(ahsp|game|rab|proyek|dokumen)/i.test(superViewSrc), 'S3.9: no NL navigation phrases in MagicAiSuperView');
  assert(!superViewSrc.includes('onKeyDown'), 'S3.10: no keyboard-command input in MagicAiSuperView');

  // ===========================================================================
  // S4 — PIPELINE SOURCE CONTRACTS
  // ===========================================================================
  console.log('\n--- S4: dedRabPipeline source contracts ---');

  assert(
    pipelineSrc.includes('Project ID is strictly required'),
    'S4.1: pipeline source contains the projectId fail-closed guard'
  );
  assert(
    pipelineSrc.includes('No source files provided'),
    'S4.2: pipeline source contains the files fail-closed guard'
  );
  assert(!pipelineSrc.includes('createProject'), 'S4.3: pipeline never creates projects');
  assert(!pipelineSrc.includes('ProjectContext'), 'S4.4: pipeline never touches ProjectContext');
  assert(!pipelineSrc.includes('onNavigateToTab'), 'S4.5: pipeline never navigates');
  assert(!/buka\s+(ahsp|game|rab|proyek|dokumen)/i.test(pipelineSrc), 'S4.6: no NL navigation phrases in pipeline');
  assert(
    pipelineSrc.includes('Non-blocking persistence warning'),
    'S4.7: pipeline documents persist failure as warn-only (view MUST re-verify — see S2.16)'
  );
  assert(
    !pipelineSrc.includes('replaceProjectRabItems') && !pipelineSrc.includes('bulkAddRabItems'),
    'S4.8: pipeline never writes project RAB items directly (commit path owns that)'
  );

  // ===========================================================================
  // S5 — COMMIT-GUARD SIMULATOR (mirrors handleCommitOfficialRab + store)
  // ===========================================================================
  console.log('\n--- S5: commit-guard simulator ---');

  type StoreRow = { id: string; projectId: string };
  let store: StoreRow[] = [
    { id: 'OLD-1', projectId: 'PRJ-A' },
    { id: 'OLD-2', projectId: 'PRJ-A' },
    { id: 'OLD-3', projectId: 'PRJ-B' },
  ];
  // Mirrors ProjectContext.replaceProjectRabItems: scoped replace per project.
  function replaceProjectRabItems(items: StoreRow[], pid: string) {
    store = [...store.filter((r) => r.projectId !== pid), ...items.map((i) => ({ ...i, projectId: pid }))];
  }
  // Mirrors the FTC-D guard at the top of handleCommitOfficialRab.
  function commitGuarded(officialItems: StoreRow[], pid: string): boolean {
    if (!officialItems || officialItems.length === 0) return false;
    replaceProjectRabItems(officialItems, pid);
    return true;
  }

  assert(commitGuarded([], 'PRJ-A') === false, 'S5.1: empty commit is a no-op (guard returns false)');
  assert(
    store.length === 3 && store.filter((r) => r.projectId === 'PRJ-A').length === 2,
    'S5.2: empty commit preserves ALL existing RAB items (no wipe)'
  );
  assert(commitGuarded([{ id: 'NEW-1', projectId: 'PRJ-A' }], 'PRJ-A') === true, 'S5.3: non-empty commit proceeds');
  assert(
    store.filter((r) => r.projectId === 'PRJ-A').length === 1 &&
      store.some((r) => r.id === 'NEW-1' && r.projectId === 'PRJ-A'),
    'S5.4: non-empty commit replaces ONLY the target project items'
  );
  assert(
    store.some((r) => r.id === 'OLD-3' && r.projectId === 'PRJ-B'),
    'S5.5: other project items untouched by commit (strict isolation)'
  );

  // ===========================================================================
  // S6 — HANDOFF CONTRACTS (static wiring checks)
  // ===========================================================================
  console.log('\n--- S6: handoff contracts ---');

  const superViewJsx = sliceBetween(workspaceViewSrc, '<MagicAiSuperView', '/>');
  for (const prop of [
    'currentProject={currentProject}',
    'projects={projects}',
    'onSelectProject={',
    'onNavigateToTab={',
    'onBackToDashboard={',
    'onOpenRabDetail={',
  ]) {
    assert(superViewJsx.includes(prop), `S6.1: WorkspaceView passes ${prop.split('=')[0]} to MagicAiSuperView`);
  }

  const executeSlice = sliceBetween(workflowViewSrc, 'dedRabPipeline.execute({', '});');
  for (const arg of [
    'projectId: targetProjectId',
    'projectName: targetProjectName',
    'mode: processingMode',
    'executionMode',
    'location:',
    'province: projectProvince',
    'city: projectCity',
    'files:',
  ]) {
    assert(executeSlice.includes(arg), `S6.2: DedRabWorkflowView passes ${arg.split(':')[0]} to dedRabPipeline.execute`);
  }
  assert(
    executeSlice.includes('fileName: selectedFile.name') && executeSlice.includes('buffer: fileBuffer'),
    'S6.3: uploaded DED file (name + buffer) is handed to the pipeline (intake preserved)'
  );
  assert(
    workflowViewSrc.includes("deriveProjectNameFromFileName(selectedFile.name)"),
    'S6.4: project name derivation from the uploaded filename is preserved in the flow'
  );

  // ===========================================================================
  // SUMMARY
  // ===========================================================================
  console.log('\n======================================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('======================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runFtcPriorityDTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
