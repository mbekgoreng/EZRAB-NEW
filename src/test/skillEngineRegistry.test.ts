/**
 * Skill Engine — Registry + migrasi kontrak (BARU, Phase 2 Workstream 3).
 *
 * Suite tsx polos (BUKAN vitest — jalankan: npx tsx src/test/skillEngineRegistry.test.ts).
 *
 * Yang dibuktikan:
 *  A. Validasi startup registry: duplikat id, tool tak dikenal / tak tersedia,
 *     skema hilang, peran tak valid (termasuk peran demo K-16), langganan tak
 *     valid, deklarasi paralel tak aman, retry mutasi, timeout, versi, id,
 *     estimasi biaya tanpa basis ukur, pelanggaran isolasi FULL_AI.
 *  B. Migrasi: kesepuluh kontrak Quick Action terpetakan sebagai skill,
 *     tanpa SATU PUN referensi tool menggantung — setiap allowedTool
 *     diverifikasi terhadap registry tool LIVE yang diekstrak dari source
 *     tools.ts + toolRegistry.ts (bukan snapshot), dan kesepuluh toolName
 *     kontrak terbukti tidak ada di registry live.
 *  C. Pendaftaran 13 skill perintah deterministik + handlerRef menunjuk
 *     berkas yang ADA.
 *  D. ExecutionContext: format id, korelasi traceId, validasi fail-closed.
 *
 * Tanpa provider, tanpa DOM, tanpa impor modul berat (ekstraksi tool live
 * membaca source sebagai teks, pola yang sama dengan architecture guard).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildToolCatalog,
  createValidatedRegistry,
  SkillRegistry,
  SkillValidationError,
  validateSkillDefinition,
  type ToolCatalog,
} from '../ai-tools/skill-engine/skillRegistry';
import {
  QUICK_ACTION_SKILL_DEFINITIONS,
  QUICK_ACTION_TOOL_MAPPING,
  quickActionContractToSkillDefinition,
} from '../ai-tools/skill-engine/quickActionSkillDefinitions';
import { COMMAND_SKILL_DEFINITIONS } from '../ai-tools/skill-engine/commandSkillDefinitions';
import {
  createExecutionContext,
  deriveChildContext,
  validateExecutionContext,
} from '../ai-tools/skill-engine/executionContext';
import type { SkillDefinition } from '../ai-tools/skill-engine/types';
import { QUICK_ACTION_CONTRACTS } from '../data/quickActionContracts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    passed++;
    console.log(`✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function expectThrow(
  name: string,
  fn: () => unknown,
  code: string,
): void {
  try {
    fn();
    check(name, false, 'tidak throw');
  } catch (e) {
    check(
      name,
      e instanceof SkillValidationError && e.code === code,
      e instanceof Error ? `${e.name}:${(e as SkillValidationError).code ?? e.message}` : String(e),
    );
  }
}

/* ------------------------------------------------------------------ */
/* Ekstraksi registry tool LIVE dari source (bukan snapshot)            */
/* ------------------------------------------------------------------ */
function extractLiveTools(): Array<{
  name: string;
  permission: 'read-only' | 'draft' | 'consequential';
  available: boolean;
}> {
  const toolsSrc = readFileSync(resolve(ROOT, 'src/ai-tools/ezrab-ai/tools.ts'), 'utf8');
  const regSrc = readFileSync(resolve(ROOT, 'src/ai-tools/ezrab-ai/toolRegistry.ts'), 'utf8');
  const out = new Map<string, { name: string; permission: 'read-only' | 'draft' | 'consequential'; available: boolean }>();
  const schemaBlock = regSrc.slice(regSrc.indexOf('CHAT_TOOL_SCHEMAS'));
  for (const m of toolsSrc.matchAll(/name: '([a-z0-9_]+)',/g)) {
    const name = m[1];
    const pm = schemaBlock.match(new RegExp(`${name}: \\{\\s*\\n\\s*permission: '([a-z-]+)'`));
    const permission = (pm?.[1] ?? 'read-only') as 'read-only' | 'draft' | 'consequential';
    out.set(name, { name, permission, available: true });
  }
  for (const m of regSrc.matchAll(/name: '([a-z0-9_]+)',/g)) {
    const name = m[1];
    if (out.has(name)) continue;
    const seg = regSrc.slice(m.index, m.index + 1200);
    const perm = seg.match(/permission: '([a-z-]+)'/)?.[1];
    const avail = seg.match(/available: (true|false)/)?.[1];
    if (perm) {
      out.set(name, {
        name,
        permission: perm as 'read-only' | 'draft' | 'consequential',
        available: avail !== 'false',
      });
    }
  }
  return [...out.values()];
}

const LIVE_TOOLS = extractLiveTools();
const LIVE_NAMES = new Set(LIVE_TOOLS.map((t) => t.name));
const LIVE_CATALOG: ToolCatalog = buildToolCatalog(LIVE_TOOLS);

console.log(`[INFO] Registry tool live yang diekstrak: ${LIVE_TOOLS.length} tool ` +
  `(${LIVE_TOOLS.filter((t) => t.available).length} tersedia, ` +
  `${LIVE_TOOLS.filter((t) => !t.available).length} ditutup)`);

/* ------------------------------------------------------------------ */
/* A. Validasi startup registry                                        */
/* ------------------------------------------------------------------ */
console.log('\n[A] Validasi startup registry');

const SMALL_CATALOG: ToolCatalog = buildToolCatalog([
  { name: 'read_tool', permission: 'read-only', available: true },
  { name: 'draft_tool', permission: 'draft', available: true },
  { name: 'closed_tool', permission: 'read-only', available: false },
]);

function baseDef(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    id: 'test-skill',
    version: '1.0.0',
    displayName: 'Test Skill',
    description: 'Skill uji.',
    triggers: [{ kind: 'intent', value: 'TEST_INTENT' }],
    inputSchema: { fields: [{ name: 'q', type: 'string', required: true }] },
    outputSchema: { fields: [{ name: 'summary', type: 'string', required: true }] },
    allowedTools: ['read_tool'],
    allowedRoles: ['SUPER_ADMIN', 'ESTIMATOR', 'DIREKSI', 'CLIENT'],
    requiredSubscription: 'FREE',
    approvalPolicy: { requiresApproval: false, approver: 'user' },
    timeoutPolicy: { timeoutMs: 30_000 },
    retryPolicy: { maxAttempts: 2, backoffMs: 100, retryableErrors: ['PROVIDER_TIMEOUT'] },
    riskLevel: 'READ_ONLY',
    parallelSafe: true,
    usageMetadata: { observability: true, estimatedCostBasis: 'UNMEASURED', estimatedCredits: null, notes: 'tes' },
    source: { kind: 'custom', ref: 'test' },
    enabled: true,
    ...overrides,
  };
}

{
  const reg = new SkillRegistry(SMALL_CATALOG);
  reg.register(baseDef());
  check('definisi sah terdaftar', reg.has('test-skill'));
  expectThrow('duplikat id ditolak', () => reg.register(baseDef()), 'DUPLICATE_SKILL_ID');
  check('validateAll bersih sesudah registrasi sah', reg.validateAll().length === 0);
}

expectThrow('id bukan kebab-case ditolak', () => new SkillRegistry(SMALL_CATALOG).register(baseDef({ id: 'Test_Skill' })), 'INVALID_SKILL_ID');
expectThrow('versi bukan semver ditolak', () => new SkillRegistry(SMALL_CATALOG).register(baseDef({ version: '1.0' })), 'INVALID_VERSION');
expectThrow('tool tak dikenal ditolak', () => new SkillRegistry(SMALL_CATALOG).register(baseDef({ allowedTools: ['nope_tool'] })), 'UNKNOWN_TOOL');
expectThrow('tool tak tersedia ditolak', () => new SkillRegistry(SMALL_CATALOG).register(baseDef({ allowedTools: ['closed_tool'] })), 'UNAVAILABLE_TOOL');
expectThrow(
  'inputSchema hilang ditolak',
  () => new SkillRegistry(SMALL_CATALOG).register(baseDef({ inputSchema: undefined as unknown as SkillDefinition['inputSchema'] })),
  'MISSING_INPUT_SCHEMA',
);
expectThrow(
  'outputSchema kosong ditolak',
  () => new SkillRegistry(SMALL_CATALOG).register(baseDef({ outputSchema: { fields: [] } })),
  'MISSING_OUTPUT_SCHEMA',
);
expectThrow(
  'peran demo (K-16) ditolak',
  () => new SkillRegistry(SMALL_CATALOG).register(baseDef({ allowedRoles: ['qs' as unknown as SkillDefinition['allowedRoles'][number]] })),
  'INVALID_ROLE',
);
expectThrow(
  'peran tak dikenal ditolak',
  () => new SkillRegistry(SMALL_CATALOG).register(baseDef({ allowedRoles: ['ADMIN' as unknown as SkillDefinition['allowedRoles'][number]] })),
  'INVALID_ROLE',
);
expectThrow(
  'langganan tak dikenal ditolak',
  () => new SkillRegistry(SMALL_CATALOG).register(baseDef({ requiredSubscription: 'ULTIMATE' as unknown as SkillDefinition['requiredSubscription'] })),
  'INVALID_SUBSCRIPTION',
);
expectThrow(
  'parallelSafe + MUTATION ditolak',
  () => new SkillRegistry(SMALL_CATALOG).register(baseDef({ riskLevel: 'MUTATION', parallelSafe: true, retryPolicy: { maxAttempts: 1, backoffMs: 0, retryableErrors: [] } })),
  'UNSAFE_PARALLEL',
);
expectThrow(
  'parallelSafe + tool draft ditolak',
  () => new SkillRegistry(SMALL_CATALOG).register(baseDef({ allowedTools: ['draft_tool'], parallelSafe: true })),
  'UNSAFE_PARALLEL',
);
expectThrow(
  'skill mutasi maxAttempts 2 ditolak (tanpa retry buta)',
  () => new SkillRegistry(SMALL_CATALOG).register(baseDef({ riskLevel: 'MUTATION', parallelSafe: false, retryPolicy: { maxAttempts: 2, backoffMs: 0, retryableErrors: [] } })),
  'INVALID_RETRY',
);
expectThrow(
  'timeout di bawah minimum ditolak',
  () => new SkillRegistry(SMALL_CATALOG).register(baseDef({ timeoutPolicy: { timeoutMs: 500 } })),
  'INVALID_TIMEOUT',
);
expectThrow(
  'timeout di atas maksimum ditolak',
  () => new SkillRegistry(SMALL_CATALOG).register(baseDef({ timeoutPolicy: { timeoutMs: 600_000 } })),
  'INVALID_TIMEOUT',
);
expectThrow(
  'UNMEASURED + estimasi kredit non-null ditolak (anti-fabrikasi)',
  () => new SkillRegistry(SMALL_CATALOG).register(baseDef({ usageMetadata: { observability: true, estimatedCostBasis: 'UNMEASURED', estimatedCredits: 25, notes: 'karangan' } })),
  'UNMEASURED_COST_ESTIMATE',
);
expectThrow(
  'OBSERVED tanpa angka ditolak',
  () => new SkillRegistry(SMALL_CATALOG).register(baseDef({ usageMetadata: { observability: true, estimatedCostBasis: 'OBSERVED', estimatedCredits: null, notes: 'x' } })),
  'UNMEASURED_COST_ESTIMATE',
);
expectThrow(
  'isolasi FULL_AI: katalog kanonis ditolak',
  () => new SkillRegistry(SMALL_CATALOG).register(baseDef({ dedMode: 'FULL_AI', dataSources: ['canonical-ahsp-catalog'] })),
  'DED_ISOLATION_VIOLATION',
);
{
  // FULL_AI + sumber terbuka = sah; EZRAB_AI + katalog = sah.
  const reg = new SkillRegistry(SMALL_CATALOG);
  reg.register(baseDef({ id: 'full-ai-ok', dedMode: 'FULL_AI', dataSources: ['quantity-services', 'document-parser'] }));
  reg.register(baseDef({ id: 'ezrab-ai-ok', dedMode: 'EZRAB_AI', dataSources: ['canonical-ahsp-catalog', 'canonical-pricing'] }));
  check('isolasi DED: FULL_AI+sumber terbuka sah, EZRAB_AI+katalog sah', reg.has('full-ai-ok') && reg.has('ezrab-ai-ok'));
}
expectThrow(
  'approver bukan user ditolak',
  () => new SkillRegistry(SMALL_CATALOG).register(baseDef({ approvalPolicy: { requiresApproval: true, approver: 'model' as unknown as 'user' } })),
  'APPROVAL_REQUIRED',
);
{
  const errs = validateSkillDefinition(baseDef({ id: 'BAD ID', version: 'x' }), SMALL_CATALOG);
  check('validateSkillDefinition murni mengumpulkan >1 error', errs.length >= 2, `${errs.length} error`);
}
{
  let threw = false;
  try {
    buildToolCatalog([
      { name: 'dup', permission: 'read-only', available: true },
      { name: 'dup', permission: 'read-only', available: true },
    ]);
  } catch {
    threw = true;
  }
  check('buildToolCatalog menolak duplikat tool', threw);
}

/* ------------------------------------------------------------------ */
/* B. Migrasi Quick Action — tanpa referensi menggantung               */
/* ------------------------------------------------------------------ */
console.log('\n[B] Migrasi Quick Action -> SkillDefinition');

check('live tool count >= 38 (pin arsitektur Fase 3)', LIVE_TOOLS.length >= 38, `${LIVE_TOOLS.length}`);
check(
  '4 tool tak tersedia terdeteksi (wizard_server dkk.)',
  ['wizard_server', 'llm_memory_extraction', 'resume_server_execution', 'present_questionnaire'].every(
    (n) => LIVE_TOOLS.some((t) => t.name === n && !t.available),
  ),
);

const CONTRACT_IDS = Object.keys(QUICK_ACTION_CONTRACTS);
check('kontrak asal = 10', CONTRACT_IDS.length === 10, CONTRACT_IDS.join(', '));
check('definisi skill migrasi = 10', QUICK_ACTION_SKILL_DEFINITIONS.length === 10);

for (const contract of Object.values(QUICK_ACTION_CONTRACTS)) {
  const def = quickActionContractToSkillDefinition(contract);
  check(
    `migrasi ${contract.actionId}: id + versi + peran + langganan disalin`,
    def.version === contract.version &&
      def.requiredSubscription === contract.requiredSubscription &&
      JSON.stringify([...def.allowedRoles].sort()) === JSON.stringify([...contract.allowedRoles].sort()) &&
      def.riskLevel === contract.riskLevel &&
      def.approvalPolicy.requiresApproval === contract.requiresConfirmation,
  );
  check(
    `migrasi ${contract.actionId}: toolName kontrak '${contract.toolName}' TIDAK ADA di registry live (menggantung, terdokumentasi)`,
    !LIVE_NAMES.has(contract.toolName ?? ''),
    contract.toolName ?? '(tanpa toolName)',
  );
  check(
    `migrasi ${contract.actionId}: unsupportedToolReference tercatat`,
    def.unsupportedToolReference?.contractTool === contract.toolName,
  );
  const dangling = def.allowedTools.filter((t) => !LIVE_NAMES.has(t));
  check(
    `migrasi ${contract.actionId}: allowedTools [${def.allowedTools.join(', ') || '-'}] semuanya tool live (tanpa referensi menggantung)`,
    dangling.length === 0,
    dangling.join(', '),
  );
  check(
    `migrasi ${contract.actionId}: allowedTools TIDAK memuat toolName kontrak mentah`,
    !def.allowedTools.includes(contract.toolName ?? ''),
  );
  const mapping = QUICK_ACTION_TOOL_MAPPING[contract.actionId];
  check(
    `migrasi ${contract.actionId}: pemetaan tool terdokumentasi (${mapping.unsupported.resolution})`,
    JSON.stringify([...mapping.liveTools].sort()) === JSON.stringify([...def.allowedTools].sort()),
  );
  check(
    `migrasi ${contract.actionId}: usage UNMEASURED + estimasi null (tanpa angka karangan)`,
    def.usageMetadata.estimatedCostBasis === 'UNMEASURED' && def.usageMetadata.estimatedCredits === null,
  );
  check(
    `migrasi ${contract.actionId}: trigger quick-action + intent kontrak`,
    def.triggers.some((t) => t.kind === 'quick-action' && t.value === contract.actionId) &&
      def.triggers.some((t) => t.kind === 'intent' && t.value === contract.intent),
  );
}

// 5 kontrak dengan requiredParameters tanpa entri parametersSchema — dicatat, bukan ditambal.
{
  const expectedUndeclared: Record<string, string[]> = {
    HITUNG_VOLUME: ['dimensions'],
    CARI_AHSP: ['keyword'],
    CARI_HARGA: ['keyword'],
    ANALISIS_DED: ['analysisDiscipline'],
    BUAT_LAPORAN: ['period'],
  };
  for (const [actionId, params] of Object.entries(expectedUndeclared)) {
    const contract = QUICK_ACTION_CONTRACTS[actionId];
    const declared = new Set(contract.parametersSchema.map((p) => p.name));
    const missing = params.filter((p) => !declared.has(p));
    const def = QUICK_ACTION_SKILL_DEFINITIONS.find((d) => d.source.ref.endsWith(`#${actionId}`));
    check(
      `kesenjangan kontrak ${actionId}: [${params.join(', ')}] tanpa skema + tercatat di contractNotes`,
      missing.length === params.length &&
        (def?.contractNotes?.some((n) => n.includes('Kesenjangan kontrak asal')) ?? false),
    );
  }
  const clean = ['AUDIT_RAB', 'PERIKSA_KURVA_S', 'JELASKAN_ITEM', 'RECALCULATE', 'BANTUAN_FITUR'];
  for (const actionId of clean) {
    const contract = QUICK_ACTION_CONTRACTS[actionId];
    const declared = new Set(contract.parametersSchema.map((p) => p.name));
    const missing = contract.requiredParameters.filter((p) => !declared.has(p));
    check(`kontrak ${actionId}: semua requiredParameters punya skema`, missing.length === 0, missing.join(', '));
  }
}

// Pemetaan spesifik yang dijanjikan di laporan.
{
  const byId = new Map(QUICK_ACTION_SKILL_DEFINITIONS.map((d) => [d.id, d]));
  check('cari-ahsp memakai tool live cari_ahsp', byId.get('cari-ahsp')?.allowedTools.join(',') === 'cari_ahsp');
  check('cari-harga memakai tool live cari_harga', byId.get('cari-harga')?.allowedTools.join(',') === 'cari_harga');
  check('hitung-volume memakai tool live hitung_qto', byId.get('hitung-volume')?.allowedTools.join(',') === 'hitung_qto');
  check('jelaskan-item memakai tool live get_item_detail', byId.get('jelaskan-item')?.allowedTools.join(',') === 'get_item_detail');
  check(
    'audit-rab diuraikan ke 3 tool read-only',
    JSON.stringify([...(byId.get('audit-rab')?.allowedTools ?? [])].sort()) ===
      JSON.stringify(['analyze_draft_costs', 'get_project_items', 'get_unresolved_items']),
  );
  check('analisis-ded: PRO + tool extract_ded_specs',
    byId.get('analisis-ded')?.requiredSubscription === 'PRO' &&
      byId.get('analisis-ded')?.allowedTools.join(',') === 'extract_ded_specs');
  check('recalculate: MUTATION + approval + tanpa tool (engine deterministik)',
    byId.get('recalculate')?.riskLevel === 'MUTATION' &&
      byId.get('recalculate')?.approvalPolicy.requiresApproval === true &&
      (byId.get('recalculate')?.allowedTools.length ?? -1) === 0);
  check('buat-laporan: POTENTIAL_MUTATION + approval + tanpa tool',
    byId.get('buat-laporan')?.riskLevel === 'POTENTIAL_MUTATION' &&
      byId.get('buat-laporan')?.approvalPolicy.requiresApproval === true &&
      (byId.get('buat-laporan')?.allowedTools.length ?? -1) === 0);
  const parallelSafe = QUICK_ACTION_SKILL_DEFINITIONS.filter((d) => d.parallelSafe);
  check('8 skill read-only parallelSafe, 2 mutasi tidak', parallelSafe.length === 8 &&
    QUICK_ACTION_SKILL_DEFINITIONS.filter((d) => !d.parallelSafe).every((d) => d.riskLevel !== 'READ_ONLY'));
}

/* ------------------------------------------------------------------ */
/* C. Skill perintah deterministik + registry gabungan                 */
/* ------------------------------------------------------------------ */
console.log('\n[C] Skill perintah deterministik + registry gabungan');

check('definisi skill perintah = 13', COMMAND_SKILL_DEFINITIONS.length === 13, COMMAND_SKILL_DEFINITIONS.map((d) => d.id).join(', '));
{
  const intents = new Set<string>();
  for (const def of COMMAND_SKILL_DEFINITIONS) intents.add(def.handlerRef?.intent ?? '');
  check('13 intent deterministik terdaftar (DELETE_PROJECT_CONFIRM = langkah approval delete-project, bukan skill)',
    intents.size === 13 && !COMMAND_SKILL_DEFINITIONS.some((d) => d.id === 'delete-project-confirm'));
}
for (const def of COMMAND_SKILL_DEFINITIONS) {
  const modPath = resolve(ROOT, def.handlerRef?.module ?? '');
  check(
    `perintah ${def.id}: handlerRef menunjuk berkas yang ADA (${def.handlerRef?.module})`,
    !!def.handlerRef && existsSync(modPath),
  );
  check(
    `perintah ${def.id}: allowedTools kosong (handler deterministik, bukan tool-call)`,
    def.allowedTools.length === 0,
  );
}
{
  const topup = COMMAND_SKILL_DEFINITIONS.find((d) => d.id === 'topup-credit');
  check('topup-credit satu-satunya perintah yang requiresApproval (bersentuhan uang)',
    topup?.approvalPolicy.requiresApproval === true &&
      COMMAND_SKILL_DEFINITIONS.filter((d) => d.approvalPolicy.requiresApproval).length === 1);
  const localZero = COMMAND_SKILL_DEFINITIONS.filter((d) => d.usageMetadata.estimatedCostBasis === 'OBSERVED');
  check('11 perintah lokal berbiaya 0 struktural; 2 pemicu model UNMEASURED',
    localZero.length === 11 &&
      localZero.every((d) => d.usageMetadata.estimatedCredits === 0) &&
      COMMAND_SKILL_DEFINITIONS.filter((d) => d.usageMetadata.estimatedCostBasis === 'UNMEASURED').length === 2);
}

{
  // Registry gabungan 23 skill tervalidasi terhadap katalog LIVE.
  const registry = createValidatedRegistry(
    [...QUICK_ACTION_SKILL_DEFINITIONS, ...COMMAND_SKILL_DEFINITIONS],
    LIVE_CATALOG,
  );
  check('registry gabungan 23 skill lulus validasi startup terhadap katalog live', registry.list().length === 23);
  check('validateAll() registry gabungan kosong', registry.validateAll().length === 0);
  check('findByTrigger intent CREATE_PROJECT -> create-project',
    registry.findByTrigger('intent', 'CREATE_PROJECT').map((d) => d.id).join(',') === 'create-project');
  check('findByTrigger quick-action AUDIT_RAB -> audit-rab',
    registry.findByTrigger('quick-action', 'AUDIT_RAB').map((d) => d.id).join(',') === 'audit-rab');
  check('findByTrigger DELETE_PROJECT_CONFIRM -> delete-project (langkah approval)',
    registry.findByTrigger('intent', 'DELETE_PROJECT_CONFIRM').map((d) => d.id).join(',') === 'delete-project');
  expectThrow('duplikat lintas-set ditolak', () => registry.register(QUICK_ACTION_SKILL_DEFINITIONS[0]), 'DUPLICATE_SKILL_ID');
}

/* ------------------------------------------------------------------ */
/* D. ExecutionContext                                                 */
/* ------------------------------------------------------------------ */
console.log('\n[D] ExecutionContext');

{
  const ctx = createExecutionContext({
    skillId: 'audit-rab',
    projectId: 'proj-1',
    conversationId: 'conv-1',
    userId: 'user-supabase-123',
    callerRole: 'ESTIMATOR',
    subscription: 'PRO',
    channel: 'chat-ai',
    input: { rabSource: 'CURRENT_PROJECT' },
  });
  check('requestId berawalan req-', ctx.requestId.startsWith('req-'));
  check('traceId berawalan trc-', ctx.traceId.startsWith('trc-'));
  check('contextVersion = 1', ctx.contextVersion === 1);
  check('userId riil diteruskan (pasca-flip AUTH)', ctx.userId === 'user-supabase-123');
  check('validasi konteks bersih', validateExecutionContext(ctx, { requireProject: true }).length === 0);
  const child = deriveChildContext(ctx, 'cari-ahsp');
  check('konteks anak: traceId sama, requestId baru',
    child.traceId === ctx.traceId && child.requestId !== ctx.requestId && child.skillId === 'cari-ahsp');
  const anon = createExecutionContext({ skillId: 'audit-rab', channel: 'test' });
  check('konteks anonim: userId/peran null secara jujur (sesi demo/failsafe)',
    anon.userId === null && anon.callerRole === null && anon.projectId === null);
  check('validasi: projectId wajib bila requireProject',
    validateExecutionContext(anon, { requireProject: true }).length > 0);
  check('validasi: requestId buruk ditolak',
    validateExecutionContext({ ...ctx, requestId: 'xxx' }).length > 0);
  check('validasi: channel tak dikenal ditolak',
    validateExecutionContext({ ...ctx, channel: 'sms' as unknown as typeof ctx.channel }).length > 0);
  const keyA = createExecutionContext({ skillId: 'audit-rab', projectId: 'p1', channel: 'test', input: { a: 1, b: 2 } }).idempotencyKey;
  const keyB = createExecutionContext({ skillId: 'audit-rab', projectId: 'p1', channel: 'test', input: { b: 2, a: 1 } }).idempotencyKey;
  check('kunci idempotensi deterministik (urutan kunci input tidak berpengaruh)', keyA === keyB);
}

console.log(`\n${failed === 0 ? 'SEMUA TES REGISTRY SKILL LULUS' : 'ADA TES GAGAL'} — lulus ${passed}, gagal ${failed}`);
if (failures.length) console.log('Gagal:', failures.join(' | '));
process.exit(failed === 0 ? 0 : 1);
