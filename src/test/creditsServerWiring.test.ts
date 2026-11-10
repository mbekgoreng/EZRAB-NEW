// Suite: Wiring credits server (D18(ii)/(iii), 2026-11-10) —
// api/_lib/billingAccountService.js di atas InMemoryBillingRepository:
// resolusi/otorisasi workspace, provisioning akun, grant Free-once
// idempoten di jalur wiring, saldo membaca batch ledger, riwayat usage
// dari operasi ledger, dan kontrak 503 jujur handler saat env absen.
// Jalankan dari root repo: npx --yes tsx src/test/creditsServerWiring.test.ts

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

// @ts-ignore — plain JS server modules
const { InMemoryBillingRepository, withLedger } = await import('../../api/_lib/billingStore.js');
// @ts-ignore — plain JS server module
const svc = await import('../../api/_lib/billingAccountService.js');

const WS = 'ws-wiring-1';
const USER = 'user-wiring-1';
const TARIFF = '2026-11-02.1';
const T0 = 1_730_000_000_000;

function freshRepo() {
  const repo = new InMemoryBillingRepository();
  repo.seedMembership(WS, USER, 'SUPER_ADMIN');
  return repo;
}
// Bentuk hasil authenticateRequest() yang lolos (security.js): ok + user.
const auth = { ok: true, user: { id: USER } } as any;

console.log('=== Resolusi & otorisasi workspace ===');
{
  const repo = freshRepo();
  const ok = await svc.resolveWorkspaceAccess(repo, auth, WS, 'billing:read');
  check('anggota SUPER_ADMIN + workspace eksplisit → ok', ok.ok === true && ok.workspaceId === WS);
  const noWs = await svc.resolveWorkspaceAccess(repo, auth, null, 'billing:read');
  check('tanpa workspaceId → resolusi dari keanggotaan tunggal', noWs.ok === true && noWs.workspaceId === WS);
  const stranger = await svc.resolveWorkspaceAccess(repo, { ok: true, user: { id: 'user-asing' } }, WS, 'billing:read');
  check('bukan anggota → ditolak', stranger.ok === false);
  const noUser = await svc.resolveWorkspaceAccess(repo, { user: null }, WS, 'billing:read');
  check('tanpa principal → 401 AUTH_REQUIRED', noUser.ok === false && noUser.status === 401);
  const repo2 = freshRepo();
  repo2.seedMembership('ws-lain', USER, 'SUPER_ADMIN');
  const ambiguous = await svc.resolveWorkspaceAccess(repo2, auth, null, 'billing:read');
  check('dua keanggotaan tanpa workspaceId → 400 WORKSPACE_AMBIGUOUS', ambiguous.ok === false && ambiguous.status === 400);
}

console.log('=== Provisioning akun + Free-once idempoten (D18(iii)) ===');
{
  const repo = freshRepo();
  const account = await svc.getOrCreateBillingAccount(repo, WS, USER);
  check('akun dibuat untuk workspace', !!account?.id && account.workspace_id === WS);
  const again = await svc.getOrCreateBillingAccount(repo, WS, USER);
  check('get-or-create ulang → akun yang sama', again.id === account.id);

  const first = await svc.ensureFreeOnceGrant(repo, account, { actorUserId: USER, workspaceId: WS, now: T0 });
  check('grant pertama ok', first.ok === true);
  check('grant pertama = penerbitan baru', first.granted === true);
  check('saldo sesudah grant: freeOnceAvailable 100', first.balance?.freeOnceAvailable === 100);
  check('saldo sesudah grant: total 100', first.balance?.total === 100);

  const second = await svc.ensureFreeOnceGrant(repo, account, { actorUserId: USER, workspaceId: WS, now: T0 + 1000 });
  check('grant kedua = replay (bukan penerbitan baru)', second.ok === true && second.granted === false);
  check('saldo tetap 100 sesudah replay', second.balance?.total === 100);

  const rows = await repo.loadLedgerRows(account.id);
  const freeBatches = rows.batchRows.filter((b: any) => b.type === 'FREE_ONCE');
  const grantEntries = rows.entryRows.filter((e: any) => e.kind === 'GRANT');
  check('tepat SATU batch FREE_ONCE terpersisten', freeBatches.length === 1);
  check('tepat SATU entri GRANT terpersisten', grantEntries.length === 1);
}

console.log('=== Saldo membaca batch ledger (D18(ii)) ===');
{
  const repo = freshRepo();
  const account = await svc.getOrCreateBillingAccount(repo, WS, USER);
  await svc.ensureFreeOnceGrant(repo, account, { actorUserId: USER, workspaceId: WS, now: T0 });
  const bal = await svc.readBatchBalance(repo, account.id, T0);
  check('readBatchBalance: total 100 dari batch', bal.total === 100 && bal.freeOnceAvailable === 100);
  check('readBatchBalance: reserved 0', bal.reserved === 0);
}

console.log('=== Riwayat usage dari operasi ledger ===');
{
  const repo = freshRepo();
  const account = await svc.getOrCreateBillingAccount(repo, WS, USER);
  await svc.ensureFreeOnceGrant(repo, account, { actorUserId: USER, workspaceId: WS, now: T0 });
  const ctx = { ownerUserId: USER, workspaceId: WS };
  await withLedger(repo, account.id, ctx, (l: any) => {
    const op = l.createOperation({ accountId: account.id, feature: 'chat-ai/fast', estimatedCredits: 25, idempotencyKey: 'op-1', now: T0 });
    l.reserve(op.operation.id, { accountId: account.id, idempotencyKey: 'res-1', now: T0 });
    l.settle(op.operation.id, {
      accountId: account.id, actualCredits: 20, idempotencyKey: 'set-1', now: T0 + 10,
      tariffVersion: TARIFF,
      usageEvidence: { inputTokens: 1000, outputTokens: 500, model: 'test-model' },
    });
  });
  const usage = await svc.readUsageHistory(repo, account.id, 20);
  check('satu catatan usage terbaca', usage.length === 1);
  check('status SETTLED → actual', usage[0]?.status === 'actual');
  check('credits_charged = settled 20', usage[0]?.credits_charged === 20);
  check('token dari usageEvidence', usage[0]?.tokens_in === 1000 && usage[0]?.tokens_out === 500);
  check('model dari usageEvidence', usage[0]?.model === 'test-model');
  check('cost_status jujur UNDETERMINED', usage[0]?.cost_status === 'UNDETERMINED');
  const bal = await svc.readBatchBalance(repo, account.id, T0 + 20);
  check('saldo berkurang tepat 20 → 80', bal.total === 80);
}

console.log('=== Handler: env absen → 503 jujur (kontrak lama utuh) ===');
{
  const KEYS = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'MIDTRANS_SERVER_KEY', 'CREDITS_DB_CONFIGURED'];
  const saved: Record<string, string | undefined> = {};
  for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  // @ts-ignore — plain JS server module
  const handler = (await import('../../api/credits/[action].js')).default;
  // @ts-ignore — plain JS server module
  const usageHandler = (await import('../../api/credits/usage.js')).default;
  const mkRes = () => {
    const res: any = { statusCode: 0, payload: null,
      status(c: number) { res.statusCode = c; return res; },
      json(o: unknown) { res.payload = o; return res; },
      end() { return res; }, setHeader() { return res; } };
    return res;
  };
  const balRes = mkRes();
  await handler({ method: 'GET', headers: {}, query: { action: 'balance' } } as any, balRes);
  check('balance tanpa env Supabase → 503 CREDITS_NOT_CONFIGURED',
    balRes.statusCode === 503 && balRes.payload?.error === 'CREDITS_NOT_CONFIGURED');
  const useRes = mkRes();
  await usageHandler({ method: 'GET', headers: {}, query: {} } as any, useRes);
  check('usage tanpa env Supabase → 503 CREDITS_NOT_CONFIGURED',
    useRes.statusCode === 503 && useRes.payload?.error === 'CREDITS_NOT_CONFIGURED');
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
}

console.log(`\nHasil: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);
