// Suite: Operasi DETERMINISTIC_FREE tidak bisa masuk lifecycle debit
// (Sprint 3 Tugas 4) — memakai featureBillingMatrix + batas metering
// bersama (aiMetering.js) di atas ledger Gen-2 NYATA.
// Bukti yang ditegakkan per operasi deterministik:
//   (1) beginOperation DITOLAK DETERMINISTIC_FREE_NOT_METERABLE;
//   (2) jalur sah runDeterministic menjalankan fungsi lokal dan hasilnya
//       identik dengan pemanggilan langsung;
//   (3) NOL operasi dibuat, NOL reservasi, NOL entri ledger, saldo utuh.
// Fitur campuran: hanya tahap provider-backed yang termeter.
// Jalankan dari root repo: npx --yes tsx src/test/deterministic-free-metering.test.ts
import { createAiMeteringBoundary, AI_METERING_ENV_FLAG } from '../../api/_lib/aiMetering.js';
import { listFeaturesByClass } from '../../api/_lib/featureBillingMatrix.js';
import { createCreditLedger, createMemoryLedgerStore } from '../../api/_lib/creditLedger.js';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

const T0 = 1_700_000_000_000;
const CTX = { accountId: 'acct-free-1', workspaceId: 'ws-1', userId: 'user-1' };
const ON = { [AI_METERING_ENV_FLAG]: 'true' };

// Seluruh operasi deterministik: 11 kunci matriks §7 + kunci deterministik
// tambahan Tugas 4 (QTO, konversi satuan, validasi lokal, parsing murni,
// pencocokan harga master, review RAB lokal sebagaimana dikirim).
const DETERMINISTIC_KEYS = [
  ...listFeaturesByClass('DETERMINISTIC_FREE'),
  'qto-calculation',
  'unit-conversion',
  'local-validation',
  'document-parsing',
  'master-price-matching',
  'rab-review-local',
];

function freshBoundary(env?: any) {
  const store = createMemoryLedgerStore();
  const ledger = createCreditLedger(store);
  ledger.grantTopUp({
    accountId: CTX.accountId, amount: 1000, paymentRef: 'pay-free-1',
    idempotencyKey: 'free-top-1', now: T0,
  });
  const boundary = createAiMeteringBoundary({ ledger, env: env || ON, now: () => T0 });
  return { store, ledger, boundary };
}

function ledgerSnapshot(ledger: any) {
  return {
    entries: ledger.listLedger(CTX.accountId).length,
    operations: (ledger as any).store.operations.size as number,
    balance: ledger.getBalance(CTX.accountId, T0).total,
    reserved: ledger.getBalance(CTX.accountId, T0).reserved,
  };
}

console.log('=== Setiap operasi deterministik: ditolak dari lifecycle + nol efek ledger ===');
for (const key of DETERMINISTIC_KEYS) {
  const { ledger, boundary } = freshBoundary();
  const before = ledgerSnapshot(ledger);

  const attempt: any = boundary.beginOperation(CTX, {
    featureKey: key, idempotencyKey: `free-${key}-0001`,
    serverEstimate: { tokensIn: 1000, tokensOutAllowance: 1000 },
  });
  check(`${key}: beginOperation ditolak DETERMINISTIC_FREE_NOT_METERABLE`,
    attempt.ok === false && attempt.error === 'DETERMINISTIC_FREE_NOT_METERABLE');

  const ran: any = boundary.runDeterministic(CTX, { featureKey: key }, () => ({ computed: key }));
  check(`${key}: runDeterministic jalan, credits 0`, ran.ok === true && ran.chargeable === false && ran.credits === 0 && ran.result.computed === key);

  const after = ledgerSnapshot(ledger);
  check(`${key}: nol operasi dibuat`, after.operations === before.operations && boundary._recordCount() === 0);
  check(`${key}: nol reservasi & nol entri ledger baru`, after.reserved === 0 && after.entries === before.entries);
  check(`${key}: saldo utuh`, after.balance === before.balance);
}

console.log('=== Operasi deterministik tetap jalan saat gerbang MATI (perilaku identik) ===');
{
  const { ledger, boundary } = freshBoundary({});
  const before = ledgerSnapshot(ledger);
  const direct = 3 * 4 * 2.5; // contoh hitung volume lokal
  const ran: any = boundary.runDeterministic(CTX, { featureKey: 'volume-calculation' }, () => 3 * 4 * 2.5);
  check('hasil identik dengan hitungan langsung', ran.ok === true && ran.result === direct);
  check('nol operasi saat gerbang mati juga', ledgerSnapshot(ledger).operations === before.operations);
}

console.log('=== Sebaliknya: fitur AI tidak bisa menyelinap lewat jalur deterministik ===');
{
  const { boundary } = freshBoundary();
  const sneaky: any = boundary.runDeterministic(CTX, { featureKey: 'chat-ai/fast' }, () => 'gratis?');
  check('chat-ai/fast di runDeterministic ditolak', sneaky.ok === false && sneaky.error === 'NOT_DETERMINISTIC_FREE');
  const unknown: any = boundary.runDeterministic(CTX, { featureKey: 'ngawur' }, () => 1);
  check('fitur asing di runDeterministic -> UNKNOWN_FEATURE', unknown.ok === false && unknown.error === 'UNKNOWN_FEATURE');
}

console.log('=== Fitur campuran dua tahap: hanya tahap provider yang termeter ===');
{
  const { ledger, boundary } = freshBoundary();
  const before = ledgerSnapshot(ledger);

  // Tahap 1 (deterministik): parsing + QTO lokal — TIDAK membuat operasi.
  const parse: any = boundary.runDeterministic(CTX, { featureKey: 'document-parsing' }, () => ({ pages: 4, chars: 12000 }));
  const qto: any = boundary.runDeterministic(CTX, { featureKey: 'qto-calculation' }, () => ({ items: 12 }));
  check('tahap parsing + QTO gratis', parse.ok === true && qto.ok === true);
  check('sesudah tahap deterministik: tetap nol operasi', ledgerSnapshot(ledger).operations === before.operations);

  // Tahap 2 (provider-backed): analisis AI — SATU operasi termeter.
  const run: any = await boundary.runMeteredOperation(CTX, {
    featureKey: 'ai-document/analysis', idempotencyKey: 'mixed-run-00001',
    pricingFeatureKey: 'ai-document/complex',
    // ai-document/analysis FLAT_DRAFT lewat kunci harga kompleks (maks 250).
  } as any, async () => ({
    provider: 'gemini', model: 'gemini-3.5-flash-lite',
    usage: { tokensIn: 2000, tokensOut: 1000, tokensCached: 0 }, // aktual 25 kredit
    result: 'analisis',
  }));
  check('tahap AI SETTLED dari usage aktual (25, bukan flat 250)', run.status === 'SETTLED' && run.settledCredits === 25);
  const after = ledgerSnapshot(ledger);
  check('tepat SATU operasi dibuat untuk seluruh fitur campuran', after.operations === before.operations + 1);
  check('saldo hanya turun oleh tahap AI (25)', after.balance === before.balance - 25);
}

console.log(`\nHasil: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);
