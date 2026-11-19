/**
 * Skill Engine — Architecture Guard (FASE 3, 2026-11-19).
 *
 * Pin ARKITEKTUR AI CORE saat ini secara statis (tanpa impor kode repo,
 * tanpa provider, tanpa DOM). Dijalankan dengan Node polos:
 *
 *   node src/test/skillEngineArchitectureGuard.mjs
 *
 * Yang dijaga:
 *  A. SATU AI Core kanonis — Magic AI = mode presentasi Chat AI, satu
 *     conversation store, satu builder konteks, satu registry tool live.
 *  B. Perbaikan Fase 0 yang sudah mendarat (G1/K-04, G2-F1, K-12, NEW-01)
 *     tidak hilang diam-diam oleh refactor berikut.
 *  C. Pohon mati tetap mati (tidak ada importer produksi baru).
 *  D. Duplikasi yang DIKETAHUI (K-06 dua interpreter/service kirim,
 *     6 situs kirim provider, kontrak Quick Action yang toolName-nya
 *     menggantung) dicatat sebagai keadaan — BUKAN sebagai ideal.
 *     Bila migrasi Skill Engine menutup salah satunya, perbarui tes
 *     ini SECARA SADAR di commit yang sama (jangan hapus diam-diam).
 *  E. Pohon server Express tetap dorman di deployment Vercel.
 *
 * Tes ini SENGAJA .mjs + tanpa impor repo: tsc tidak pernah melihatnya
 * dan ia tidak dapat merusak gerbang build apa pun.
 *
 * AMANDEMEN PHASE 2 W3 (2026-11-19, koordinator; HEAD 77924d5):
 * Dua pin Fase 3 berubah karena keadaan arsitektur BERUBAH — bukan karena
 * tesnya salah. Keduanya diperbarui SECARA SADAR di sini, dengan alasan:
 *
 *  A9 — Lapisan skill MENDARAT (Phase 2 W3, berkas baru di
 *  src/ai-tools/skill-engine/ + 3 suite skillEngine*.test.ts). Pin lama
 *  ("belum ada lapisan skill") kini salah secara faktual. Pin BARU:
 *  lapisan skill ada di PERSIS SATU tempat — semua berkas produksi yang
 *  menyebut SkillDefinition/skillRegistry/registerSkill harus berada di
 *  bawah src/ai-tools/skill-engine/. Lapisan skill kedua di tempat lain
 *  tetap gagal. (A13 memin modul entry-nya.)
 *
 *  A11 — Gerbang identitas DI-FLIP (8a03451, grant owner: AUTH_ENABLED
 *  false -> true, Preview 1rcg7qi5n). Pin lama ("AUTH_ENABLED masih
 *  false") kini basi. Pin BARU: flag true + matriks mode auth ada
 *  (resolveAuthMode + 'real-login'/'failsafe-demo'). ALASAN ARSITEKTUR
 *  (bukan sekadar flip ekspektasi): flip ini mengaktifkan IDENTITAS
 *  (login Supabase nyata, userId riil) — BUKAN otorisasi. Diverifikasi
 *  W3: tidak ada derivasi peran dari Supabase (tanpa lookup
 *  user_metadata/app_metadata peran), peran tetap dari demo roleAccounts
 *  atau tidak ada, gateway tetap tidak memverifikasi projectId. Maka:
 *  model izin skill TIDAK berubah (taksonomi server + fail-closed peran
 *  demo + jembatan tanpa-peran transisional); yang BERUBAH hanya
 *  atribusi — metadata pemakaian + approval kini membawa userId riil
 *  (dipin A14). Isolasi tenant (A10) tetap 0 — K-03 tetap terbuka.
 *  Lihat src/ai-tools/skill-engine/MIGRATION-PLAN.md §6.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = resolve(ROOT, 'src');
const API = resolve(ROOT, 'api');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function read(rel) {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

function linesOf(rel) {
  return read(rel).split('\n');
}

/** Semua berkas .ts/.tsx di bawah dir (rekursif), path relatif thd ROOT. */
function walkTs(dir, out = []) {
  for (const ent of readdirSync(dir)) {
    const p = resolve(dir, ent);
    const st = statSync(p);
    if (st.isDirectory()) walkTs(p, out);
    else if (/\.(ts|tsx)$/.test(ent)) out.push(p.slice(ROOT.length + 1).replaceAll('\\', '/'));
  }
  return out;
}

const prodTs = walkTs(SRC).filter((f) => !f.startsWith('src/test/'));
const prodTsContent = new Map();
function content(rel) {
  if (!prodTsContent.has(rel)) prodTsContent.set(rel, read(rel));
  return prodTsContent.get(rel);
}

// ---------------------------------------------------------------- A. Satu AI Core
{
  const view = linesOf('src/ai-tools/ezrab-ai/view.tsx');
  const hasModeState = view.some((l) =>
    /presentationMode.*useState<'chat' \| 'magic'>/.test(l),
  );
  check(
    "A1: view.tsx mendeklarasikan presentationMode 'chat' | 'magic'",
    hasModeState,
  );

  const service = read('src/ai-tools/ezrab-ai/service.ts');
  check(
    'A2: service.ts (jalur kirim) tidak mengenal presentationMode — kirim buta-mode',
    !service.includes('presentationMode'),
  );

  const magicLines = view
    .map((l, i) => ({ l, n: i + 1 }))
    .filter(({ l }) => l.includes("presentationMode === 'magic'"));
  const allowed = /handoffOfferedRef|'EZRAB Magic AI'|&& \(/;
  const bad = magicLines.filter(({ l }) => !allowed.test(l));
  check(
    `A3: semua cabang presentationMode==='magic' (${magicLines.length}) hanya label/banner/handoff — tanpa cabang perilaku di jalur kirim`,
    magicLines.length > 0 && bad.length === 0,
    bad.map(({ n, l }) => `view.tsx:${n}: ${l.trim()}`).join(' | '),
  );

  check(
    'A4: magicHandoff.ts menegaskan SATU mesin percakapan kanonis',
    read('src/ai-tools/ezrab-ai/magicHandoff.ts').includes('SATU mesin percakapan kanonis'),
  );

  const sendSites = view.filter((l) => l.includes('ezrabAiService.send(')).length;
  check(
    'A5: view.tsx memanggil ezrabAiService.send tepat 1 situs',
    sendSites === 1,
    `ditemukan ${sendSites}`,
  );

  for (const [file, label] of [
    ['src/ai-tools/ezrab-ai/view.tsx', 'Chat AI (view)'],
    ['src/components/copilot/EzrabCoAssistantChatbox.tsx', 'Copilot mengambang'],
    ['src/services/coAssistantService.ts', 'CoAssistantService'],
  ]) {
    check(
      `A6: ${label} mengimpor unifiedConversationStore yang sama`,
      content(file).includes('unifiedConversationStore'),
    );
  }

  const keyHits = prodTs.filter((f) =>
    content(f).includes('ezrab_unified_conversations_v2'),
  );
  check(
    'A7: kunci store ezrab_unified_conversations_v2 hanya didefinisikan di unifiedConversationStore.ts',
    keyHits.length === 1 &&
      keyHits[0] === 'src/services/ai/conversation/unifiedConversationStore.ts',
    `ditemukan di: ${keyHits.join(', ')}`,
  );

  const ctxCallers = prodTs.filter(
    (f) =>
      f !== 'src/ai-tools/ezrab-ai/canonicalContext.ts' &&
      content(f).includes('buildCanonicalContext('),
  );
  check(
    'A8: buildCanonicalContext hanya dipanggil service.ts (Chat AI) + coAssistantService.ts (Copilot)',
    ctxCallers.length === 2 &&
      ctxCallers.includes('src/ai-tools/ezrab-ai/service.ts') &&
      ctxCallers.includes('src/services/coAssistantService.ts'),
    `pemanggil: ${ctxCallers.join(', ')}`,
  );

  const skillHits = prodTs.filter((f) =>
    /SkillDefinition|skillRegistry|registerSkill/.test(content(f)),
  );
  const skillOutsideEngine = skillHits.filter(
    (f) => !f.startsWith('src/ai-tools/skill-engine/'),
  );
  check(
    'A9: lapisan skill ada di PERSIS SATU tempat — semua berkas produksi yang menyebut SkillDefinition/skillRegistry/registerSkill harus di src/ai-tools/skill-engine/ (Phase 2 W3; lapisan skill kedua di tempat lain = gagal)',
    skillHits.length > 0 && skillOutsideEngine.length === 0,
    skillHits.length === 0
      ? 'lapisan skill hilang (0 hit)'
      : `di luar skill-engine/: ${skillOutsideEngine.join(', ')}`,
  );

  const tenantHits = prodTs
    .filter((f) => f.startsWith('src/ai-tools/'))
    .filter((f) => content(f).includes('tenantId'));
  check(
    'A10: tenantId masih 0 di src/ai-tools (K-03 terbuka — isolasi tenant belum ada)',
    tenantHits.length === 0,
    `ditemukan di: ${tenantHits.join(', ')}`,
  );

  const appTsx = read('src/App.tsx');
  const authMode = read('src/auth/authMode.ts');
  check(
    'A11: gerbang identitas TER-FLIP (8a03451, grant owner) — AUTH_ENABLED=true di App.tsx + matriks mode auth ada (resolveAuthMode + real-login/failsafe-demo)',
    /const AUTH_ENABLED = true;/.test(appTsx) &&
      appTsx.includes('resolveAuthMode(AUTH_ENABLED)') &&
      authMode.includes("export type AuthMode = 'open' | 'real-login' | 'failsafe-demo'") &&
      authMode.includes('real-login') &&
      authMode.includes('failsafe-demo'),
  );

  check(
    'A12: executionRuntime menegaskan "Bukan store kedua"',
    read('src/ai-tools/ezrab-ai/executionRuntime.ts').includes('Bukan store kedua'),
  );

  const skillEngineModules = [
    'types.ts',
    'skillRegistry.ts',
    'skillExecutor.ts',
    'skillRouter.ts',
    'quickActionSkillDefinitions.ts',
    'commandSkillDefinitions.ts',
    'executionContext.ts',
    'skillState.ts',
    'usageMetadata.ts',
    'dedIsolation.ts',
    'index.ts',
  ];
  const missingModules = skillEngineModules.filter(
    (m) => !existsSync(resolve(SRC, 'ai-tools/skill-engine', m)),
  );
  check(
    'A13: modul entry Skill Engine ada (11 modul di src/ai-tools/skill-engine/)',
    missingModules.length === 0,
    `hilang: ${missingModules.join(', ')}`,
  );

  check(
    'A14: kontrak identitas Skill Engine pasca-flip AUTH — ExecutionContext membawa userId, executor gagal tertutup pada peran tak terpeta (ROLE_NOT_MAPPED), metadata pemakaian mengatribusikan userId',
    read('src/ai-tools/skill-engine/types.ts').includes('userId: string | null') &&
      read('src/ai-tools/skill-engine/skillExecutor.ts').includes('ROLE_NOT_MAPPED') &&
      read('src/ai-tools/skill-engine/usageMetadata.ts').includes('userId: string | null'),
  );
}

// ------------------------------------------------- B. Perbaikan Fase 0 yang dipin
{
  const dp = read('src/ai-tools/ezrab-ai/draftPersistence.ts');
  check(
    'B1a: G1 — draftPersistence mengekspor TRANSFER_APPROVAL_TTL_MS + checkTransferApprovalBinding',
    dp.includes('TRANSFER_APPROVAL_TTL_MS') &&
      dp.includes('export function checkTransferApprovalBinding'),
  );
  check(
    'B1b: G1 — view.tsx memanggil checkTransferApprovalBinding di handler konfirmasi transfer',
    read('src/ai-tools/ezrab-ai/view.tsx').includes('checkTransferApprovalBinding('),
  );

  const cc = read('src/ai-tools/ezrab-ai/canonicalContext.ts');
  const dedIdx = cc.indexOf('const dedBudget');
  const summaryIdx = cc.indexOf('const summaryBudget');
  check(
    'B2: G2-F1 — canonicalContext mencadangkan DED SEBELUM ringkasan (dedBudget mendahului summaryBudget)',
    dedIdx > 0 && summaryIdx > dedIdx,
  );

  check(
    'B3: NEW-01 — EzrabAiAssistantFullView.tsx tetap terhapus',
    !existsSync(resolve(SRC, 'components/copilot/EzrabAiAssistantFullView.tsx')),
  );

  check(
    'B4: K-12 — providerClient mengirim header Idempotency-Key',
    read('src/ai-tools/providerClient.ts').includes("'Idempotency-Key'"),
  );
}

// ------------------------------------------------------- C. Pohon mati tetap mati
{
  const deadImporters = prodTs.filter((f) => {
    if (f.startsWith('src/services/ai/')) return false;
    return /services\/ai\/(core|orchestration|tools|actions)\//.test(content(f));
  });
  check(
    'C1: pohon mati src/services/ai/{core,orchestration,tools,actions} punya 0 importer produksi di luar dirinya',
    deadImporters.length === 0,
    `importer: ${deadImporters.join(', ')}`,
  );

  const panelImporters = prodTs.filter(
    (f) =>
      f !== 'src/components/copilot/EstimatingCopilotPanel.tsx' &&
      content(f).includes('EstimatingCopilotPanel'),
  );
  check(
    'C2: EstimatingCopilotPanel tetap tanpa importer (permukaan mati — bila dipasang, perbarui tes ini sadar)',
    panelImporters.length === 0,
    `importer: ${panelImporters.join(', ')}`,
  );

  const engineImporters = prodTs.filter(
    (f) =>
      f !== 'src/services/aiProviderEngine.ts' &&
      content(f).includes('aiProviderEngine'),
  );
  const engineOutsideDead = engineImporters.filter(
    (f) => !f.startsWith('src/services/ai/'),
  );
  check(
    'C3: aiProviderEngine (MockAiProvider) hanya diimpor pohon mati',
    engineOutsideDead.length === 0,
    `importer di luar pohon mati: ${engineOutsideDead.join(', ')}`,
  );
}

// ------------------------------------------- D. Duplikasi yang diketahui (keadaan)
{
  const execSites = prodTs.filter((f) => {
    if (f === 'src/ai-tools/providerClient.ts') return false;
    return linesOf(f).some(
      (l) =>
        (/aiToolsProviderClient\.execute(<[^>]+>)?\(/.test(l) ||
          /\.aiClient\.execute(<[^>]+>)?\(/.test(l)) &&
        !l.trimStart().startsWith('*') &&
        !l.trimStart().startsWith('//'),
    );
  });
  const knownExec = new Set([
    'src/ai-tools/ded-ai-estimate/service.ts',
    'src/ai-tools/ded-full-ai/service.ts',
    'src/ai-tools/document-ai/service.ts',
    'src/ai-tools/ezrab-ai/service.ts',
    'src/services/coAssistantService.ts',
  ]);
  const unexpected = execSites.filter((f) => !knownExec.has(f));
  const missing = [...knownExec].filter((f) => !execSites.includes(f));
  check(
    `D1: situs kirim provider langsung = 5 yang diketahui (Chat AI, Copilot, DED Est, DED Full, DocAI)`,
    unexpected.length === 0 && missing.length === 0,
    `tak terduga: ${unexpected.join(', ') || '-'}; hilang: ${missing.join(', ') || '-'}`,
  );

  check(
    'D2: SmartAddWorkItemModal memakai instans AiToolsProviderClient sendiri (situs kirim ke-6, spreadsheet)',
    read('src/components/estimator/SmartAddWorkItemModal.tsx').includes(
      'new AiToolsProviderClient()',
    ),
  );

  check(
    'D3: K-06 tercatat — dua interpreter masih ada (routeIntent Chat AI + detectIntent Copilot)',
    read('src/ai-tools/ezrab-ai/intentRouter.ts').includes('export function routeIntent') &&
      read('src/services/coAssistantService.ts').includes('detectIntent('),
  );

  const contracts = read('src/data/quickActionContracts.ts');
  const ids = [...contracts.matchAll(/actionId: '([A-Z_]+)',/g)].map((m) => m[1]);
  const expectedIds = [
    'AUDIT_RAB',
    'HITUNG_VOLUME',
    'CARI_AHSP',
    'CARI_HARGA',
    'ANALISIS_DED',
    'BUAT_LAPORAN',
    'PERIKSA_KURVA_S',
    'JELASKAN_ITEM',
    'RECALCULATE',
    'BANTUAN_FITUR',
  ];
  check(
    'D4: QUICK_ACTION_CONTRACTS = 10 kontrak yang diketahui',
    ids.length === 10 && expectedIds.every((id) => ids.includes(id)),
    `ditemukan ${ids.length}: ${ids.join(', ')}`,
  );
  for (const field of [
    'riskLevel',
    'requiresConfirmation',
    'allowedRoles',
    'requiredSubscription',
    'version',
    'parametersSchema',
    'requiredContext',
    'toolName',
  ]) {
    check(
      `D5: QuickActionContract membawa medan ${field}`,
      contracts.includes(field),
    );
  }

  check(
    'D6: toolName kontrak menggantung — audit_rab TIDAK ada di toolRegistry live (dicatat, bukan ideal)',
    !read('src/ai-tools/ezrab-ai/toolRegistry.ts').includes('audit_rab'),
  );

  const copilot = read('src/services/coAssistantService.ts');
  const isClientUses = copilot.split('\n').filter((l) => l.includes('isClient')).length;
  check(
    'D7: K-07 tercatat — isClient di coAssistantService hanya dihitung, tidak pernah dipakai',
    isClientUses === 1,
    `kemunculan isClient: ${isClientUses}`,
  );
}

// ------------------------------------------------------- E. Server Express dorman
{
  const apiFiles = walkTs(API);
  const serverImports = apiFiles.filter((f) =>
    /from\s+['"]\.\.\/(\.\.\/)?server\//.test(read(f)),
  );
  check(
    'E1: api/ (Vercel) tidak mengimpor apa pun dari server/ Express',
    serverImports.length === 0,
    `pengimpor: ${serverImports.join(', ')}`,
  );

  const pkg = JSON.parse(read('package.json'));
  const scripts = Object.values(pkg.scripts ?? {});
  check(
    'E2: tidak ada npm script yang menjalankan server/index.ts',
    !scripts.some((s) => String(s).includes('server/index')),
  );
}

console.log('');
if (failed === 0) {
  console.log(`ALL SKILL ENGINE ARCHITECTURE GUARD TESTS PASSED (${passed}/${passed})`);
} else {
  console.log(
    `SKILL ENGINE ARCHITECTURE GUARD: ${passed} passed, ${failed} FAILED — ${failures.join('; ')}`,
  );
  process.exit(1);
}
