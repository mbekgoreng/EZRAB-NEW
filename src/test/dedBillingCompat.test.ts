// Suite: Kompatibilitas reservasi & settlement DED (Sprint 3 Tugas 5) —
// HANYA terhadap adapter dorman api/_lib/dedBillingAdapter.js + executor
// tiruan deterministik, di atas ledger Gen-2 nyata. TIDAK ada berkas DED
// yang diimpor/diubah; pipeline DED nyata tidak dilibatkan sama sekali.
// Kontrak yang diuji: flat 500/650/800 = plafon reservasi per run, BUKAN
// tagihan final; final = settlement token v1.1 dari usage aktual.
// Jalankan dari root repo: npx --yes tsx src/test/dedBillingCompat.test.ts
import { createAiMeteringBoundary, AI_METERING_ENV_FLAG } from '../../api/_lib/aiMetering.js';
import {
  createDedBillingAdapter,
  dedReservationEstimate,
  DED_FLAT_RESERVATION_CREDITS,
} from '../../api/_lib/dedBillingAdapter.js';
import { createCreditLedger, createMemoryLedgerStore } from '../../api/_lib/creditLedger.js';
import { EZRAB_DRAFT_TARIFFS } from '../../api/_lib/creditPricing.js';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

const T0 = 1_700_000_000_000;
const CTX = { accountId: 'acct-ded-1', workspaceId: 'ws-1', userId: 'user-1' };

function freshSetup(balance = 5000) {
  const store = createMemoryLedgerStore();
  const ledger = createCreditLedger(store);
  ledger.grantSubscription({
    accountId: CTX.accountId, amount: balance, periodStart: T0, periodEnd: T0 + 30 * 24 * 3600 * 1000,
    idempotencyKey: 'ded-sub-1', now: T0,
  });
  const boundary = createAiMeteringBoundary({
    ledger, env: { [AI_METERING_ENV_FLAG]: 'true' }, now: () => T0,
  });
  const adapter = createDedBillingAdapter({ boundary });
  return { store, ledger, boundary, adapter };
}

// Usage kecil: (2000 + 1000*3)/200 = 25 kredit per berkas.
const smallUsage = { tokensIn: 2000, tokensOut: 1000, tokensCached: 0 };
const okExecutor = (usageByFile?: Record<string, any>) => async (file: any) => ({
  provider: 'gemini', model: 'gemini-3.5-flash-lite',
  usage: (usageByFile && usageByFile[file.id]) || smallUsage,
  result: `hasil-${file.id}`,
});
const files = (...ids: string[]) => ids.map((id) => ({ id }));

console.log('=== Konstanta flat: rujuk-silang dua sumber DED yang ada ===');
for (const c of ['simple', 'medium', 'complex'] as const) {
  check(`flat ${c} = tarif draft creditPricing (${DED_FLAT_RESERVATION_CREDITS[c]})`,
    EZRAB_DRAFT_TARIFFS.tariffs[`ded-ai/${c}`].target === DED_FLAT_RESERVATION_CREDITS[c]);
  check(`estimasi reservasi ${c}`, dedReservationEstimate(c).estimatedCredits === DED_FLAT_RESERVATION_CREDITS[c]);
}
check('kompleksitas asing ditolak', dedReservationEstimate('raksasa' as any).ok === false);

console.log('=== Multi-berkas: SATU operasi per batch, estimasi agregat = flat kategori ===');
{
  const { ledger, adapter } = freshSetup();
  const res: any = await adapter.runDedBatch({
    context: CTX, complexity: 'medium', files: files('a', 'b', 'c'),
    idempotencyKey: 'ded-multi-00001', executor: okExecutor(),
  });
  check('SETTLED', res.status === 'SETTLED');
  check('tepat satu operasi ledger untuk 3 berkas', (ledger as any).store.operations.size === 1);
  check('estimasi agregat = 650 (flat medium, BUKAN 3x650)', res.record.estimatedCredits === 650);
  check('settle aktual agregat = 3 x 25 = 75', res.settledCredits === 75);
  check('sisa reservasi dilepas = 650 - 75 = 575', res.releasedCredits === 575);
  check('saldo turun tepat 75', ledger.getBalance(CTX.accountId, T0).total === 5000 - 75);
  check('flat TIDAK menjadi tagihan final (75 != 650)', res.settledCredits !== 650);
}

console.log('=== Kegagalan sebagian berkas: yang berhasil di-settle, yang gagal pra-provider gratis ===');
{
  const { ledger, adapter } = freshSetup();
  const executor = async (file: any) => {
    if (file.id === 'b') throw Object.assign(new Error('file rusak sebelum provider'), { code: 'LOCAL_PARSE_ERROR' });
    return { provider: 'gemini', model: 'gemini-3.5-flash-lite', usage: smallUsage, result: 'ok' };
  };
  const res: any = await adapter.runDedBatch({
    context: CTX, complexity: 'simple', files: files('a', 'b', 'c'),
    idempotencyKey: 'ded-partial-001', executor,
  });
  check('SETTLED dari 2 berkas berhasil', res.status === 'SETTLED' && res.settledCredits === 50);
  check('perFile mencatat 2 ok / 1 gagal', res.perFile.filter((f: any) => f.ok).length === 2 && res.perFile.filter((f: any) => !f.ok).length === 1);
  check('saldo turun tepat 50', ledger.getBalance(CTX.accountId, T0).total === 4950);
}

console.log('=== Kegagalan sebagian dengan usage tak dikenal -> review ===');
{
  const { adapter } = freshSetup();
  const executor = async (file: any) => {
    if (file.id === 'b') throw Object.assign(new Error('putus di tengah'), { code: 'STREAM_ABORT', usageKnown: false });
    return { provider: 'gemini', model: 'gemini-3.5-flash-lite', usage: smallUsage, result: 'ok' };
  };
  const res: any = await adapter.runDedBatch({
    context: CTX, complexity: 'simple', files: files('a', 'b'),
    idempotencyKey: 'ded-unkusage-01', executor,
  });
  check('REQUIRES_REVIEW', res.status === 'REQUIRES_REVIEW');
  check('tidak ada settledCredits', res.record.settledCredits === null);
}

console.log('=== Kegagalan workflow penuh -> release PENUH ===');
{
  const { ledger, adapter } = freshSetup();
  const res: any = await adapter.runDedBatch({
    context: CTX, complexity: 'complex', files: files('a', 'b'),
    idempotencyKey: 'ded-allfail-001',
    executor: async () => { throw Object.assign(new Error('semua gagal'), { code: 'PROVIDER_ERROR' }); },
  });
  check('status RELEASED', res.status === 'RELEASED');
  check('releasedCredits = 800 penuh', res.releasedCredits === 800);
  check('saldo pulih penuh', ledger.getBalance(CTX.accountId, T0).total === 5000);
  check('tidak ada konsumsi', ledger.listBatches(CTX.accountId).every((b: any) => b.consumedAmount === 0));
}

console.log('=== Timeout provider: tanpa hasil -> release; dengan hasil parsial -> review ===');
{
  const { ledger, adapter } = freshSetup();
  const res: any = await adapter.runDedBatch({
    context: CTX, complexity: 'simple', files: files('a'),
    idempotencyKey: 'ded-timeout-001',
    executor: async () => { throw Object.assign(new Error('timeout'), { code: 'PROVIDER_TIMEOUT' }); },
  });
  check('timeout nol hasil -> RELEASED penuh', res.status === 'RELEASED' && ledger.getBalance(CTX.accountId, T0).total === 5000);
}
{
  const { adapter } = freshSetup();
  const executor = async (file: any) => {
    if (file.id === 'b') throw Object.assign(new Error('timeout'), { code: 'PROVIDER_TIMEOUT' });
    return { provider: 'gemini', model: 'gemini-3.5-flash-lite', usage: smallUsage, result: 'ok' };
  };
  const res: any = await adapter.runDedBatch({
    context: CTX, complexity: 'simple', files: files('a', 'b'),
    idempotencyKey: 'ded-timeout-002', executor,
  });
  check('timeout dengan hasil parsial -> REQUIRES_REVIEW', res.status === 'REQUIRES_REVIEW');
}

console.log('=== Usage tak dikenal dari executor -> review ===');
{
  const { adapter } = freshSetup();
  const res: any = await adapter.runDedBatch({
    context: CTX, complexity: 'medium', files: files('a'),
    idempotencyKey: 'ded-nousage-001',
    executor: async () => ({ provider: 'zyrouter', model: 'geminiflash-3.8', usage: null, result: 'teks' }),
  });
  check('REQUIRES_REVIEW', res.status === 'REQUIRES_REVIEW');
  check('record reviewReason tercatat', typeof res.record.reviewReason === 'string' && res.record.reviewReason.length > 0);
}

console.log('=== Usage aktual > reservasi -> overage ke review, TANPA debit otomatis ===');
{
  const { ledger, adapter } = freshSetup();
  // Per berkas: (50000 + 30000*3)/200 = 700 kredit > plafon simple 500.
  const res: any = await adapter.runDedBatch({
    context: CTX, complexity: 'simple', files: files('a'),
    idempotencyKey: 'ded-overage-001',
    executor: okExecutor({ a: { tokensIn: 50000, tokensOut: 30000, tokensCached: 0 } }),
  });
  check('REQUIRES_REVIEW', res.status === 'REQUIRES_REVIEW');
  check('overage = 700 - 500 = 200', res.overageCredits === 200 || res.record.overageCredits === 200);
  check('tidak ada konsumsi otomatis', ledger.listBatches(CTX.accountId).every((b: any) => b.consumedAmount === 0));
  check('review ledger terbuka (antrean manual)', ledger.listReviews(CTX.accountId, 'PENDING').length === 1);
}

console.log('=== Retry/idempotensi: kunci sama -> satu operasi, executor tidak jalan ulang ===');
{
  const { ledger, adapter } = freshSetup();
  let calls = 0;
  const executor = async (file: any) => {
    calls += 1;
    return { provider: 'gemini', model: 'gemini-3.5-flash-lite', usage: smallUsage, result: file.id };
  };
  const args = {
    context: CTX, complexity: 'medium' as const, files: files('a', 'b'),
    idempotencyKey: 'ded-retry-00001', executor,
  };
  const first: any = await adapter.runDedBatch(args);
  const second: any = await adapter.runDedBatch(args);
  check('operasi yang sama', first.record.operationId === second.record.operationId);
  check('replay duplicate', second.duplicate === true);
  check('executor hanya 2 panggilan total (bukan 4)', calls === 2);
  check('satu operasi ledger', (ledger as any).store.operations.size === 1);
  check('saldo hanya terdebit sekali (50)', ledger.getBalance(CTX.accountId, T0).total === 4950);
}

console.log('=== Konflik terminal settle vs release pada operasi DED yang sama ===');
{
  const { boundary, adapter } = freshSetup();
  const res: any = await adapter.runDedBatch({
    context: CTX, complexity: 'simple', files: files('a'),
    idempotencyKey: 'ded-conflict-01', executor: okExecutor(),
  });
  check('batch SETTLED', res.status === 'SETTLED');
  const lateRelease: any = boundary.releaseCredits(res.record.operationId);
  check('release sesudah settle ditolak ILLEGAL_TRANSITION', lateRelease.ok === false && lateRelease.error === 'ILLEGAL_TRANSITION');
  const lateSettle: any = boundary.settleCredits(res.record.operationId);
  check('settle ulang sesudah settle ditolak ILLEGAL_TRANSITION', lateSettle.ok === false && lateSettle.error === 'ILLEGAL_TRANSITION');
}

console.log('=== approvedMaxCredits di adapter: plafon persetujuan di bawah flat -> ditolak eksplisit ===');
{
  const { adapter } = freshSetup();
  const res: any = await adapter.runDedBatch({
    context: CTX, complexity: 'complex', files: files('a'),
    idempotencyKey: 'ded-cap-0000001', approvedMaxCredits: 100, executor: okExecutor(),
  });
  check('ESTIMATE_EXCEEDS_APPROVED_MAX (800 > 100)', res.ok === false && res.error === 'ESTIMATE_EXCEEDS_APPROVED_MAX');
}

console.log('=== Saldo kurang dari plafon -> run berhenti SEBELUM executor jalan ===');
{
  const { adapter } = freshSetup(300);
  let calls = 0;
  const res: any = await adapter.runDedBatch({
    context: CTX, complexity: 'simple', files: files('a'),
    idempotencyKey: 'ded-insuf-00001',
    executor: async () => { calls += 1; return { provider: 'g', model: 'm', usage: smallUsage, result: 'x' }; },
  });
  check('INSUFFICIENT_BALANCE', res.ok === false && res.error === 'INSUFFICIENT_BALANCE');
  check('executor TIDAK pernah dipanggil (beda dari perilaku DED hari ini)', calls === 0);
}

console.log(`\nHasil: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);
