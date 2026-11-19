/**
 * Skill Engine — Executor (BARU, Phase 2 Workstream 3).
 *
 * Suite tsx polos (BUKAN vitest — jalankan: npx tsx src/test/skillEngineExecutor.test.ts).
 *
 * Yang dibuktikan (dengan handler stub — tanpa provider, tanpa AI berbayar):
 *  A. Jalur bahagia + validasi input/output + metadata pemakaian (termasuk
 *     atribusi userId pasca-flip AUTH; tanpa medan billing apa pun).
 *  B. Penegakan peran (taksonomi server; peran demo gagal tertutup K-16;
 *     tanpa peran hanya skill terbuka), langganan, kanal Copilot jawab-saja.
 *  C. Alur approval dua fase (awaiting-approval -> resume; runId terikat;
 *     kedaluwarsa TTL; runId salah ditolak).
 *  D. Pembatalan, retry berbatas, timeout, serialisasi tulis per proyek,
 *     eksekusi paralel read-only (Keputusan A).
 *  E. State run + resume + restore sesudah reload (jujur: running -> failed).
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildToolCatalog,
  createValidatedRegistry,
  type ToolCatalog,
} from '../ai-tools/skill-engine/skillRegistry';
import { QUICK_ACTION_SKILL_DEFINITIONS } from '../ai-tools/skill-engine/quickActionSkillDefinitions';
import { COMMAND_SKILL_DEFINITIONS } from '../ai-tools/skill-engine/commandSkillDefinitions';
import {
  SkillExecutor,
  SkillExecutionError,
  validateAgainstSchema,
} from '../ai-tools/skill-engine/skillExecutor';
import { SkillStateStore } from '../ai-tools/skill-engine/skillState';
import { InMemoryUsageSink } from '../ai-tools/skill-engine/usageMetadata';
import { createExecutionContext } from '../ai-tools/skill-engine/executionContext';
import type {
  ExecutionContext,
  SkillDefinition,
  SkillHandler,
} from '../ai-tools/skill-engine/types';

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

/* Katalog live diekstrak dari source (pola yang sama dengan suite registry). */
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
    out.set(name, { name, permission: (pm?.[1] ?? 'read-only') as 'read-only' | 'draft' | 'consequential', available: true });
  }
  for (const m of regSrc.matchAll(/name: '([a-z0-9_]+)',/g)) {
    const name = m[1];
    if (out.has(name)) continue;
    const seg = regSrc.slice(m.index, m.index + 1200);
    const perm = seg.match(/permission: '([a-z-]+)'/)?.[1];
    const avail = seg.match(/available: (true|false)/)?.[1];
    if (perm) out.set(name, { name, permission: perm as 'read-only' | 'draft' | 'consequential', available: avail !== 'false' });
  }
  return [...out.values()];
}

const LIVE_CATALOG: ToolCatalog = buildToolCatalog(extractLiveTools());
const REGISTRY = createValidatedRegistry(
  [...QUICK_ACTION_SKILL_DEFINITIONS, ...COMMAND_SKILL_DEFINITIONS],
  LIVE_CATALOG,
);

function ctx(overrides: Partial<ExecutionContext> & { skillId: string }): ExecutionContext {
  const { skillId, ...rest } = overrides;
  return createExecutionContext({
    skillId,
    projectId: 'proj-1',
    conversationId: 'conv-1',
    userId: 'user-supabase-123',
    callerRole: 'ESTIMATOR',
    subscription: 'FREE',
    channel: 'chat-ai',
    ...rest,
  });
}

const AUDIT_INPUT = { rabSource: 'CURRENT_PROJECT', auditFocus: 'ALL' };
const AUDIT_OUTPUT = { summary: 'Audit selesai.', findingCount: 2, findings: [] };
const RECALC_INPUT = { scope: 'ALL_RAB' };
const RECALC_OUTPUT = { summary: 'Rekalkulasi selesai.', grandTotalBefore: 100, grandTotalAfter: 110, changedItems: 3 };
const DED_INPUT = { documentSource: 'UPLOAD_PDF' };
const DED_OUTPUT = { summary: 'DED dianalisis.', itemCount: 5, items: [] };

function stub(output: Record<string, unknown>, usage?: { tokensIn?: number; tokensOut?: number }): SkillHandler {
  return async () => ({ output, usage });
}

function makeExecutor(
  handlers: Map<string, SkillHandler>,
  extra?: { sleep?: (ms: number) => Promise<void> },
): { executor: SkillExecutor; state: SkillStateStore; usage: InMemoryUsageSink } {
  const state = new SkillStateStore();
  const usage = new InMemoryUsageSink();
  const executor = new SkillExecutor(REGISTRY, {
    handlers,
    stateStore: state,
    usageSink: usage,
    sleep: extra?.sleep,
  });
  return { executor, state, usage };
}

/* ------------------------------------------------------------------ */
/* A. Jalur bahagia + validasi + metadata                              */
/* ------------------------------------------------------------------ */
console.log('\n[A] Jalur bahagia + validasi + metadata');

{
  const { executor, state, usage } = makeExecutor(
    new Map([['audit-rab', stub(AUDIT_OUTPUT, { tokensIn: 300, tokensOut: 100 })]]),
  );
  const res = await executor.execute('audit-rab', AUDIT_INPUT, ctx({ skillId: 'audit-rab' }));
  check('audit-rab selesai (CLIENT diizinkan kontrak)', res.status === 'completed' && res.attempts === 1);
  check('output handler diteruskan', (res.output as { findingCount: number }).findingCount === 2);
  const run = state.getRun(res.runId);
  check('state run = completed', run?.status === 'completed' && run.attempts === 1);
  const records = usage.listBySkill('audit-rab');
  check('metadata pemakaian tercatat 1x', records.length === 1);
  check('metadata: userId riil teratribusi (pasca-flip AUTH)', records[0]?.userId === 'user-supabase-123');
  check('metadata: 400 token -> 2 kredit (1 kredit = 200 token)', records[0]?.estimatedCredits === 2);
  check(
    'metadata: TANPA medan billing (tanpa debit/saldo/charge)',
    records[0] !== undefined &&
      !('debit' in records[0]) && !('balance' in records[0]) && !('charge' in records[0]) && !('deduct' in records[0]),
  );
  check('metadata: requestId + traceId terkorelasi dengan run',
    records[0]?.requestId === run?.requestId && records[0]?.traceId === run?.traceId);
}
{
  // Token tidak dilaporkan -> estimasi null (bukan 0, bukan karangan).
  const { executor, usage } = makeExecutor(new Map([['audit-rab', stub(AUDIT_OUTPUT)]]));
  await executor.execute('audit-rab', AUDIT_INPUT, ctx({ skillId: 'audit-rab' }));
  check('tanpa token terukur -> estimatedCredits null', usage.list()[0]?.estimatedCredits === null);
}
{
  const { executor } = makeExecutor(new Map([['audit-rab', stub(AUDIT_OUTPUT)]]));
  const res = await executor.execute('audit-rab', { rabSource: 'CURRENT_PROJECT' }, ctx({ skillId: 'audit-rab' }));
  check('input tak lengkap -> INVALID_INPUT', res.status === 'failed' && res.errorCode === 'INVALID_INPUT');
  const res2 = await executor.execute('audit-rab', { rabSource: 'NOPE', auditFocus: 'ALL' }, ctx({ skillId: 'audit-rab' }));
  check('nilai select di luar enum -> INVALID_INPUT', res2.status === 'failed' && res2.errorCode === 'INVALID_INPUT');
  const res3 = await executor.execute('skill-tak-ada', {}, ctx({ skillId: 'skill-tak-ada' }));
  check('skill tak dikenal -> SKILL_NOT_FOUND', res3.status === 'failed' && res3.errorCode === 'SKILL_NOT_FOUND');
}
{
  const { executor } = makeExecutor(new Map([['audit-rab', stub({})]]));
  const res = await executor.execute('audit-rab', AUDIT_INPUT, ctx({ skillId: 'audit-rab' }));
  check('output handler tak sesuai skema -> OUTPUT_VALIDATION_FAILED',
    res.status === 'failed' && res.errorCode === 'OUTPUT_VALIDATION_FAILED');
}
{
  const { executor } = makeExecutor(new Map());
  const res = await executor.execute('audit-rab', AUDIT_INPUT, ctx({ skillId: 'audit-rab' }));
  check('skill tanpa handler -> HANDLER_NOT_REGISTERED (jujur, tanpa pura-pura jalan)',
    res.status === 'failed' && res.errorCode === 'HANDLER_NOT_REGISTERED');
}
{
  // Validasi skema murni: min/max/pattern.
  const errs = validateAgainstSchema(
    [
      { name: 'n', type: 'number', required: true, min: 1, max: 10 },
      { name: 's', type: 'string', required: true, pattern: '^A.+$' },
    ],
    { n: 20, s: 'Bxx' },
    'input',
  );
  check('validateAgainstSchema: min/max + pattern ditegakkan', errs.length === 2, errs.join(' | '));
}

/* ------------------------------------------------------------------ */
/* B. Peran, langganan, kanal                                          */
/* ------------------------------------------------------------------ */
console.log('\n[B] Peran, langganan, kanal');

{
  const handlers = new Map<string, SkillHandler>([
    ['audit-rab', stub(AUDIT_OUTPUT)],
    ['recalculate', stub(RECALC_OUTPUT)],
    ['analisis-ded', stub(DED_OUTPUT)],
  ]);
  const { executor } = makeExecutor(handlers);
  const clientAudit = await executor.execute('audit-rab', AUDIT_INPUT, ctx({ skillId: 'audit-rab', callerRole: 'CLIENT' }));
  check('CLIENT boleh audit-rab (kontrak mengizinkan)', clientAudit.status === 'completed');
  const clientRecalc = await executor.execute('recalculate', RECALC_INPUT,
    ctx({ skillId: 'recalculate', callerRole: 'CLIENT', subscription: 'FREE' }));
  // recalculate butuh approval — tanpa approval hasilnya awaiting-approval BUKAN penolakan peran.
  // Untuk menguji peran, sertakan approval pada percobaan kedua di bawah; di sini pastikan
  // hasilnya BUKAN ROLE_NOT_ALLOWED yang tertunda: peran diperiksa SEBELUM approval.
  check('CLIENT + recalculate ditolak peran SEBELUM approval (ROLE_NOT_ALLOWED)',
    clientRecalc.status === 'failed' && clientRecalc.errorCode === 'ROLE_NOT_ALLOWED');
  const estimatorRecalc = await executor.execute('recalculate', RECALC_INPUT,
    ctx({ skillId: 'recalculate', callerRole: 'ESTIMATOR' }));
  check('ESTIMATOR + recalculate lolos peran (menunggu approval)',
    estimatorRecalc.status === 'awaiting-approval');
  const demo = await executor.execute('audit-rab', AUDIT_INPUT, ctx({ skillId: 'audit-rab', callerRole: 'qs' }));
  check("peran demo 'qs' gagal tertutup (ROLE_NOT_MAPPED, K-16)",
    demo.status === 'failed' && demo.errorCode === 'ROLE_NOT_MAPPED');
  const unknown = await executor.execute('audit-rab', AUDIT_INPUT, ctx({ skillId: 'audit-rab', callerRole: 'ADMIN' }));
  check('peran tak dikenal gagal tertutup (ROLE_NOT_MAPPED)',
    unknown.status === 'failed' && unknown.errorCode === 'ROLE_NOT_MAPPED');
  const noRoleOpen = await executor.execute('audit-rab', AUDIT_INPUT,
    ctx({ skillId: 'audit-rab', callerRole: null, userId: null }));
  check('tanpa peran: skill terbuka (semua peran) tetap jalan (jembatan transisional)',
    noRoleOpen.status === 'completed');
  const noRoleRestricted = await executor.execute('recalculate', RECALC_INPUT,
    ctx({ skillId: 'recalculate', callerRole: null, userId: null }));
  check('tanpa peran: skill terbatas ditolak (ROLE_REQUIRED)',
    noRoleRestricted.status === 'failed' && noRoleRestricted.errorCode === 'ROLE_REQUIRED');
  const freeDed = await executor.execute('analisis-ded', DED_INPUT,
    ctx({ skillId: 'analisis-ded', subscription: 'FREE' }));
  check('FREE + analisis-ded (PRO) -> SUBSCRIPTION_REQUIRED',
    freeDed.status === 'failed' && freeDed.errorCode === 'SUBSCRIPTION_REQUIRED');
  const proDed = await executor.execute('analisis-ded', DED_INPUT,
    ctx({ skillId: 'analisis-ded', subscription: 'PRO' }));
  check('PRO + analisis-ded jalan', proDed.status === 'completed');
  const nullSub = await executor.execute('analisis-ded', DED_INPUT,
    ctx({ skillId: 'analisis-ded', subscription: null }));
  check('langganan null dianggap FREE (demo) -> PRO ditolak',
    nullSub.status === 'failed' && nullSub.errorCode === 'SUBSCRIPTION_REQUIRED');
}
{
  const handlers = new Map<string, SkillHandler>([
    ['audit-rab', stub(AUDIT_OUTPUT)],
    ['recalculate', stub(RECALC_OUTPUT)],
  ]);
  const { executor } = makeExecutor(handlers);
  const copilotRead = await executor.execute('audit-rab', AUDIT_INPUT,
    ctx({ skillId: 'audit-rab', channel: 'copilot' }));
  check('Copilot + skill read-only jalan', copilotRead.status === 'completed');
  const copilotWrite = await executor.execute('recalculate', RECALC_INPUT,
    ctx({ skillId: 'recalculate', channel: 'copilot' }));
  check('Copilot + skill mutasi DIBLOKIR (CHANNEL_BLOCKED, kanal jawab-saja)',
    copilotWrite.status === 'failed' && copilotWrite.errorCode === 'CHANNEL_BLOCKED');
}

/* ------------------------------------------------------------------ */
/* C. Approval dua fase                                                */
/* ------------------------------------------------------------------ */
console.log('\n[C] Approval dua fase');

{
  const { executor, state } = makeExecutor(new Map([['recalculate', stub(RECALC_OUTPUT)]]));
  const first = await executor.execute('recalculate', RECALC_INPUT, ctx({ skillId: 'recalculate' }));
  check('tanpa approval -> awaiting-approval (BUKAN gagal)', first.status === 'awaiting-approval' && first.runId !== '');
  check('state run = awaiting-approval', state.getRun(first.runId)?.status === 'awaiting-approval');
  check('run awaiting-approval dapat dilanjutkan (resume point)',
    state.getResumableRun(first.runId)?.runId === first.runId);
  const wrongRun = await executor.execute('recalculate', RECALC_INPUT, ctx({ skillId: 'recalculate' }), {
    resumeRunId: first.runId,
    approval: { actor: 'user', approvedAt: new Date().toISOString(), runId: 'run-salah' },
  });
  check('approval runId lain ditolak (APPROVAL_MISMATCH)',
    wrongRun.status === 'failed' && wrongRun.errorCode === 'APPROVAL_MISMATCH');
  // Run pertama sudah failed -> kasus kedaluwarsa memakai run baru.
  const fresh2 = await executor.execute('recalculate', RECALC_INPUT, ctx({ skillId: 'recalculate' }));
  const expired = await executor.execute('recalculate', RECALC_INPUT, ctx({ skillId: 'recalculate' }), {
    resumeRunId: fresh2.runId,
    approval: { actor: 'user', approvedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(), runId: fresh2.runId },
  });
  check('approval kedaluwarsa TTL ditolak (APPROVAL_EXPIRED)',
    expired.status === 'failed' && expired.errorCode === 'APPROVAL_EXPIRED');
  // Kasus sukses memakai run baru.
  const fresh = await executor.execute('recalculate', RECALC_INPUT, ctx({ skillId: 'recalculate' }));
  const approved = await executor.execute('recalculate', RECALC_INPUT, ctx({ skillId: 'recalculate' }), {
    resumeRunId: fresh.runId,
    approval: { actor: 'user', approvedAt: new Date().toISOString(), runId: fresh.runId, approvedByUserId: 'user-supabase-123' },
  });
  check('resume + approval sah -> completed', approved.status === 'completed' && approved.runId === fresh.runId);
  check('run completed TIDAK dapat dilanjutkan lagi', state.getResumableRun(fresh.runId) === null);
  const badResume = await executor.execute('recalculate', RECALC_INPUT, ctx({ skillId: 'recalculate' }), {
    resumeRunId: 'run-tak-ada',
    approval: { actor: 'user', approvedAt: new Date().toISOString(), runId: 'run-tak-ada' },
  });
  check('resume run tak ada -> RESUME_INVALID', badResume.status === 'failed' && badResume.errorCode === 'RESUME_INVALID');
}
{
  // topup-credit (perintah): approval wajib karena bersentuhan uang.
  const { executor } = makeExecutor(new Map([['topup-credit', stub({ summary: 'Top-up simulasi.', credits: 100 })]]));
  const first = await executor.execute('topup-credit', { amount: 100 }, ctx({ skillId: 'topup-credit' }));
  check('topup-credit tanpa approval -> awaiting-approval', first.status === 'awaiting-approval');
  const done = await executor.execute('topup-credit', { amount: 100 }, ctx({ skillId: 'topup-credit' }), {
    resumeRunId: first.runId,
    approval: { actor: 'user', approvedAt: new Date().toISOString(), runId: first.runId },
  });
  check('topup-credit + approval -> completed', done.status === 'completed');
}

/* ------------------------------------------------------------------ */
/* D. Cancel, retry, timeout, serialisasi, paralel                     */
/* ------------------------------------------------------------------ */
console.log('\n[D] Cancel, retry, timeout, serialisasi, paralel');

{
  // Retry: gagal 2x (retryable) lalu sukses — definisi custom maxAttempts 3.
  const customDef: SkillDefinition = {
    id: 'flaky-read',
    version: '1.0.0',
    displayName: 'Flaky Read',
    description: 'Skill uji retry.',
    triggers: [{ kind: 'intent', value: 'FLAKY' }],
    inputSchema: { fields: [] },
    outputSchema: { fields: [{ name: 'summary', type: 'string', required: true }] },
    allowedTools: [],
    allowedRoles: ['SUPER_ADMIN', 'ESTIMATOR', 'DIREKSI', 'CLIENT'],
    requiredSubscription: 'FREE',
    approvalPolicy: { requiresApproval: false, approver: 'user' },
    timeoutPolicy: { timeoutMs: 30_000 },
    retryPolicy: { maxAttempts: 3, backoffMs: 1, retryableErrors: ['TRANSIENT_PROVIDER_ERROR'] },
    riskLevel: 'READ_ONLY',
    parallelSafe: true,
    usageMetadata: { observability: true, estimatedCostBasis: 'UNMEASURED', estimatedCredits: null, notes: 'tes' },
    source: { kind: 'custom', ref: 'test' },
    enabled: true,
  };
  const reg = createValidatedRegistry([customDef], LIVE_CATALOG);
  let calls = 0;
  const flakyRetryable: SkillHandler = async () => {
    calls++;
    if (calls < 3) {
      const err = new Error('provider timeout') as Error & { code?: string };
      err.code = 'TRANSIENT_PROVIDER_ERROR';
      throw err;
    }
    return { output: { summary: 'ok' } };
  };
  const state = new SkillStateStore();
  const ex = new SkillExecutor(reg, { handlers: new Map([['flaky-read', flakyRetryable]]), stateStore: state, sleep: async () => {} });
  const res = await ex.execute('flaky-read', {}, ctx({ skillId: 'flaky-read' }));
  check('retry: gagal retryable 2x lalu sukses -> completed, attempts 3',
    res.status === 'completed' && res.attempts === 3 && calls === 3);
}
{
  // Non-retryable: berhenti di percobaan pertama.
  const customDef: SkillDefinition = {
    id: 'strict-read',
    version: '1.0.0',
    displayName: 'Strict Read',
    description: 'Skill uji non-retry.',
    triggers: [{ kind: 'intent', value: 'STRICT' }],
    inputSchema: { fields: [] },
    outputSchema: { fields: [{ name: 'summary', type: 'string', required: true }] },
    allowedTools: [],
    allowedRoles: ['SUPER_ADMIN', 'ESTIMATOR', 'DIREKSI', 'CLIENT'],
    requiredSubscription: 'FREE',
    approvalPolicy: { requiresApproval: false, approver: 'user' },
    timeoutPolicy: { timeoutMs: 30_000 },
    retryPolicy: { maxAttempts: 3, backoffMs: 1, retryableErrors: ['TRANSIENT_PROVIDER_ERROR'] },
    riskLevel: 'READ_ONLY',
    parallelSafe: true,
    usageMetadata: { observability: true, estimatedCostBasis: 'UNMEASURED', estimatedCredits: null, notes: 'tes' },
    source: { kind: 'custom', ref: 'test' },
    enabled: true,
  };
  const reg = createValidatedRegistry([customDef], LIVE_CATALOG);
  let calls = 0;
  const boom: SkillHandler = async () => {
    calls++;
    throw new Error('validasi permanen');
  };
  const ex = new SkillExecutor(reg, { handlers: new Map([['strict-read', boom]]), sleep: async () => {} });
  const res = await ex.execute('strict-read', {}, ctx({ skillId: 'strict-read' }));
  check('non-retryable: gagal permanen di attempts 1 (tanpa retry)',
    res.status === 'failed' && res.attempts === 1 && calls === 1);
}
{
  // Retryable tapi selalu gagal -> berhenti di maxAttempts.
  const customDef: SkillDefinition = {
    id: 'always-fail',
    version: '1.0.0',
    displayName: 'Always Fail',
    description: 'Skill uji kehabisan retry.',
    triggers: [{ kind: 'intent', value: 'ALWAYS_FAIL' }],
    inputSchema: { fields: [] },
    outputSchema: { fields: [{ name: 'summary', type: 'string', required: true }] },
    allowedTools: [],
    allowedRoles: ['SUPER_ADMIN', 'ESTIMATOR', 'DIREKSI', 'CLIENT'],
    requiredSubscription: 'FREE',
    approvalPolicy: { requiresApproval: false, approver: 'user' },
    timeoutPolicy: { timeoutMs: 30_000 },
    retryPolicy: { maxAttempts: 2, backoffMs: 1, retryableErrors: ['TRANSIENT_PROVIDER_ERROR'] },
    riskLevel: 'READ_ONLY',
    parallelSafe: true,
    usageMetadata: { observability: true, estimatedCostBasis: 'UNMEASURED', estimatedCredits: null, notes: 'tes' },
    source: { kind: 'custom', ref: 'test' },
    enabled: true,
  };
  const reg = createValidatedRegistry([customDef], LIVE_CATALOG);
  let calls = 0;
  const failerRetryable: SkillHandler = async () => {
    calls++;
    const err = new Error('transien') as Error & { code?: string };
    err.code = 'TRANSIENT_PROVIDER_ERROR';
    throw err;
  };
  const ex = new SkillExecutor(reg, { handlers: new Map([['always-fail', failerRetryable]]), sleep: async () => {} });
  const res = await ex.execute('always-fail', {}, ctx({ skillId: 'always-fail' }));
  check('retryable selalu gagal -> failed di attempts 2 (= maxAttempts)',
    res.status === 'failed' && res.attempts === 2 && calls === 2);
  check('kode domain diteruskan apa adanya (bukan label generik)',
    res.errorCode === 'TRANSIENT_PROVIDER_ERROR', res.errorCode ?? '');
}
{
  // Timeout: handler tidur lebih lama dari timeoutMs skill.
  const customDef: SkillDefinition = {
    id: 'slow-read',
    version: '1.0.0',
    displayName: 'Slow Read',
    description: 'Skill uji timeout.',
    triggers: [{ kind: 'intent', value: 'SLOW' }],
    inputSchema: { fields: [] },
    outputSchema: { fields: [{ name: 'summary', type: 'string', required: true }] },
    allowedTools: [],
    allowedRoles: ['SUPER_ADMIN', 'ESTIMATOR', 'DIREKSI', 'CLIENT'],
    requiredSubscription: 'FREE',
    approvalPolicy: { requiresApproval: false, approver: 'user' },
    timeoutPolicy: { timeoutMs: 1000 },
    retryPolicy: { maxAttempts: 1, backoffMs: 0, retryableErrors: [] },
    riskLevel: 'READ_ONLY',
    parallelSafe: true,
    usageMetadata: { observability: true, estimatedCostBasis: 'UNMEASURED', estimatedCredits: null, notes: 'tes' },
    source: { kind: 'custom', ref: 'test' },
    enabled: true,
  };
  const reg = createValidatedRegistry([customDef], LIVE_CATALOG);
  const slow: SkillHandler = async () => {
    await new Promise((r) => setTimeout(r, 5000));
    return { output: { summary: 'terlambat' } };
  };
  const ex = new SkillExecutor(reg, { handlers: new Map([['slow-read', slow]]) });
  const t0 = Date.now();
  const res = await ex.execute('slow-read', {}, ctx({ skillId: 'slow-read' }));
  const dt = Date.now() - t0;
  check('handler melebihi timeout -> SKILL_TIMEOUT (~1 dtk, bukan 5 dtk)',
    res.status === 'failed' && res.errorCode === 'SKILL_TIMEOUT' && dt < 3000, `${dt} ms`);
}
{
  // Pembatalan: abort di tengah handler lambat.
  const { executor, state } = makeExecutor(new Map([
    ['audit-rab', (async (_input, _ctx, signal) => {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => resolve(), 5000);
        signal.addEventListener('abort', () => {
          clearTimeout(t);
          reject(new SkillExecutionError('CANCELLED', 'dibatalkan handler'));
        }, { once: true });
      });
      return { output: AUDIT_OUTPUT };
    }) as SkillHandler],
  ]));
  const controller = new AbortController();
  const promise = executor.execute('audit-rab', AUDIT_INPUT, ctx({ skillId: 'audit-rab' }), { signal: controller.signal });
  setTimeout(() => controller.abort(), 30);
  const res = await promise;
  check('abort di tengah eksekusi -> cancelled', res.status === 'cancelled');
  check('state run cancelled', state.getRun(res.runId)?.status === 'cancelled');
  const preAborted = new AbortController();
  preAborted.abort();
  const res2 = await executor.execute('audit-rab', AUDIT_INPUT, ctx({ skillId: 'audit-rab' }), { signal: preAborted.signal });
  check('signal sudah aborted sebelum jalan -> cancelled tanpa memanggil handler',
    res2.status === 'cancelled' && res2.attempts === 0);
}
{
  // Serialisasi tulis per proyek: dua skill mutasi di proyek sama jalan BERURUTAN.
  const events: string[] = [];
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const slowMutate = (label: string): SkillHandler => async () => {
    events.push(`start:${label}`);
    await sleep(80);
    events.push(`end:${label}`);
    return { output: { summary: `selesai ${label}` } };
  };
  const { executor } = makeExecutor(new Map([
    ['create-project', slowMutate('A')],
    ['update-project-settings', slowMutate('B')],
  ]));
  const [ra, rb] = await Promise.all([
    executor.execute('create-project', { projectName: 'P-A' }, ctx({ skillId: 'create-project', projectId: 'proj-sama' })),
    executor.execute('update-project-settings', { settingKey: 'overhead', settingValue: 5 },
      ctx({ skillId: 'update-project-settings', projectId: 'proj-sama' })),
  ]);
  check('dua mutasi proyek sama: keduanya completed', ra.status === 'completed' && rb.status === 'completed');
  check('dua mutasi proyek sama: SERIAL (start B sesudah end A)',
    events.indexOf('start:B') > events.indexOf('end:A'), events.join(' > '));
}
{
  // Proyek berbeda: mutasi boleh bersamaan (lock per proyek).
  const events: string[] = [];
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const slowMutate = (label: string): SkillHandler => async () => {
    events.push(`start:${label}`);
    await sleep(80);
    events.push(`end:${label}`);
    return { output: { summary: `selesai ${label}` } };
  };
  const { executor } = makeExecutor(new Map([
    ['create-project', slowMutate('A')],
    ['update-project-settings', slowMutate('B')],
  ]));
  const [ra, rb] = await Promise.all([
    executor.execute('create-project', { projectName: 'P-A' }, ctx({ skillId: 'create-project', projectId: 'proj-1' })),
    executor.execute('update-project-settings', { settingKey: 'overhead', settingValue: 5 },
      ctx({ skillId: 'update-project-settings', projectId: 'proj-2' })),
  ]);
  check('dua mutasi proyek berbeda: keduanya completed', ra.status === 'completed' && rb.status === 'completed');
  check('dua mutasi proyek berbeda: PARALEL (start B sebelum end A)',
    events.indexOf('start:B') < events.indexOf('end:A'), events.join(' > '));
}
{
  // Lock timeout: antrean tulis yang macet gagal dengan LOCK_TIMEOUT (bukan gantung selamanya).
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const hog: SkillHandler = async () => {
    await sleep(400);
    return { output: { summary: 'hog selesai' } };
  };
  const quick: SkillHandler = async () => ({ output: { summary: 'quick' } });
  const { executor } = makeExecutor(new Map([
    ['create-project', hog],
    ['update-project-settings', quick],
  ]));
  const first = executor.execute('create-project', { projectName: 'P' }, ctx({ skillId: 'create-project', projectId: 'proj-lock' }));
  await sleep(20);
  const second = await executor.execute('update-project-settings', { settingKey: 'overhead', settingValue: 5 },
    ctx({ skillId: 'update-project-settings', projectId: 'proj-lock' }), { lockTimeoutMs: 50 });
  check('menunggu lock melewati batas -> LOCK_TIMEOUT', second.status === 'failed' && second.errorCode === 'LOCK_TIMEOUT');
  const firstRes = await first;
  check('pemegang lock pertama tetap selesai', firstRes.status === 'completed');
  // Antrean pulih: eksekusi berikutnya di proyek sama jalan normal.
  const third = await executor.execute('update-project-settings', { settingKey: 'overhead', settingValue: 5 },
    ctx({ skillId: 'update-project-settings', projectId: 'proj-lock' }));
  check('sesudah lock timeout, antrean proyek pulih (eksekusi berikutnya jalan)',
    third.status === 'completed');
}
{
  // Paralel read-only: dua skill parallelSafe jalan bersamaan + traceId sama.
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const events: string[] = [];
  const slowRead = (label: string): SkillHandler => async () => {
    events.push(`start:${label}`);
    await sleep(60);
    events.push(`end:${label}`);
    return { output: { summary: `selesai ${label}` } };
  };
  const { executor } = makeExecutor(new Map([
    ['credit-balance', slowRead('saldo')],
    ['summarize-document', slowRead('ringkas')],
  ]));
  const parentCtx = ctx({ skillId: 'credit-balance' });
  const results = await executor.executeParallel(
    [
      { skillId: 'credit-balance', input: {} },
      { skillId: 'summarize-document', input: {} },
    ],
    parentCtx,
  );
  check('paralel read-only: keduanya completed', results.every((r) => r.status === 'completed'));
  check('paralel read-only: tumpang tindih (start kedua sebelum end pertama)',
    events.indexOf('start:ringkas') < events.indexOf('end:saldo') ||
      events.indexOf('start:saldo') < events.indexOf('end:ringkas'), events.join(' > '));
  check('paralel read-only: traceId induk sama di kedua hasil',
    results[0].traceId === parentCtx.traceId && results[1].traceId === parentCtx.traceId);
  check('paralel read-only: requestId berbeda per request', results[0].requestId !== results[1].requestId);
}
{
  // Batch campuran (mutasi ikut) ditolak ATOMIK — tidak ada yang jalan.
  let calls = 0;
  const counting: SkillHandler = async () => {
    calls++;
    return { output: { summary: 'x' } };
  };
  const { executor } = makeExecutor(new Map([
    ['credit-balance', counting],
    ['create-project', counting],
  ]));
  let threw: unknown = null;
  try {
    await executor.executeParallel(
      [
        { skillId: 'credit-balance', input: {} },
        { skillId: 'create-project', input: { projectName: 'P' } },
      ],
      ctx({ skillId: 'credit-balance' }),
    );
  } catch (e) {
    threw = e;
  }
  check('batch campuran mutasi ditolak UNSAFE_PARALLEL_BATCH',
    threw instanceof SkillExecutionError && threw.code === 'UNSAFE_PARALLEL_BATCH');
  check('batch ditolak: TIDAK ADA handler yang dipanggil (atomik)', calls === 0, `${calls} panggilan`);
}

/* ------------------------------------------------------------------ */
/* E. State store: restore sesudah reload                              */
/* ------------------------------------------------------------------ */
console.log('\n[E] State store');

{
  const store = new SkillStateStore();
  const run = store.createRun({
    runId: 'run-1', skillId: 'audit-rab', requestId: 'req-1', traceId: 'trc-1',
    projectId: 'p1', conversationId: 'c1',
  });
  store.updateRun(run.runId, { status: 'running', attempts: 1 });
  check('listRuns memfilter per proyek', store.listRuns({ projectId: 'p1' }).length === 1);
  check('listRuns memfilter per status', store.listRuns({ status: 'running' }).length === 1);
  // Restore dengan adapter: run 'running' -> failed INTERRUPTED_BY_RELOAD.
  const saved = [...store.listRuns()];
  const adapter = {
    load: async () => saved,
    save: async () => {},
  };
  const store2 = new SkillStateStore(adapter);
  await store2.restore();
  const restored = store2.getRun('run-1');
  check("restore: run 'running' saat reload -> failed INTERRUPTED_BY_RELOAD (jujur)",
    restored?.status === 'failed' && restored.errorCode === 'INTERRUPTED_BY_RELOAD');
  const store3 = new SkillStateStore();
  const run3 = store3.createRun({
    runId: 'run-2', skillId: 'audit-rab', requestId: 'req-2', traceId: 'trc-2',
    projectId: 'p1', conversationId: 'c1',
  });
  store3.updateRun(run3.runId, { status: 'awaiting-approval' });
  const adapter2 = { load: async () => [store3.getRun('run-2')!], save: async () => {} };
  const store4 = new SkillStateStore(adapter2);
  await store4.restore();
  check("restore: run 'awaiting-approval' TETAP dapat dilanjutkan sesudah reload",
    store4.getResumableRun('run-2')?.runId === 'run-2');
}

console.log(`\n${failed === 0 ? 'SEMUA TES EXECUTOR SKILL LULUS' : 'ADA TES GAGAL'} — lulus ${passed}, gagal ${failed}`);
if (failures.length) console.log('Gagal:', failures.join(' | '));
process.exit(failed === 0 ? 0 : 1);
