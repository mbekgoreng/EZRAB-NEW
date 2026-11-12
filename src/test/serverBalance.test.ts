// Suite: Saldo server sebagai sumber tampilan (B11/D14, Gelombang 2) —
// src/ai-credits/serverBalance.ts di atas fetch TIRUAN (tanpa jaringan,
// tanpa database live): pemetaan payload ledger → CreditBalance,
// validasi fail-closed, penolakan respons simulasi, dan pemetaan paket.
// Jalankan dari root repo: npx --yes tsx src/test/serverBalance.test.ts
import {
  fetchServerBalance,
  mapPlanIdToCreditPlan,
  mapServerBalanceToCreditBalance,
  unavailableBalance,
  type BalanceFetcher,
} from '../ai-credits/serverBalance';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

const PAYLOAD = {
  accountId: 'acc-1',
  subscriptionAvailable: 5000,
  topupAvailable: 1500,
  bonusAvailable: 0,
  freeOnceAvailable: 100,
  reserved: 0,
  total: 6600,
};

console.log('=== Pemetaan payload → CreditBalance ===');
{
  const b = mapServerBalanceToCreditBalance(PAYLOAD, 'starter');
  check('total dipertahankan (6600)', b?.total === 6600);
  check('bucket dipetakan per jenis', b?.subscription === 5000 && b?.topup === 1500 && b?.bonus === 0);
  check('freeOnce DIPISAH (100), tidak dilebur ke top-up', b?.freeOnce === 100 && b?.topup === 1500);
  check('plan diteruskan', b?.plan === 'starter');
  check('currency CREDIT', b?.currency === 'CREDIT');
}

console.log('=== Payload malformed → null (fail-closed) ===');
{
  check('null → null', mapServerBalanceToCreditBalance(null, 'free') === null);
  check('field hilang → null', mapServerBalanceToCreditBalance({ ...PAYLOAD, total: undefined }, 'free') === null);
  check('negatif → null', mapServerBalanceToCreditBalance({ ...PAYLOAD, topupAvailable: -5 }, 'free') === null);
  check('pecahan → null', mapServerBalanceToCreditBalance({ ...PAYLOAD, total: 6600.5 }, 'free') === null);
  check('string → null', mapServerBalanceToCreditBalance({ ...PAYLOAD, total: '6600' }, 'free') === null);
}

console.log('=== Pemetaan ID paket kanonis → CreditPlan ===');
{
  check('professional → pro', mapPlanIdToCreditPlan('professional') === 'pro');
  check('starter/business/free identitas', mapPlanIdToCreditPlan('starter') === 'starter'
    && mapPlanIdToCreditPlan('business') === 'business' && mapPlanIdToCreditPlan('free') === 'free');
  check('tak dikenal → free (fail-closed)', mapPlanIdToCreditPlan('platinum') === 'free'
    && mapPlanIdToCreditPlan(undefined) === 'free' && mapPlanIdToCreditPlan(null) === 'free');
}

console.log('=== unavailableBalance: nol + free ===');
{
  const z = unavailableBalance();
  check('semua bucket 0', z.total === 0 && z.subscription === 0 && z.topup === 0 && z.bonus === 0 && z.freeOnce === 0);
  check('plan free', z.plan === 'free');
}

function stubFetcher(routes: Record<string, { ok: boolean; status: number; body: unknown } | Error>): BalanceFetcher {
  return async (input: string) => {
    const route = routes[input];
    if (route instanceof Error) throw route;
    if (!route) return { ok: false, status: 404, json: async () => ({ success: false, error: 'NOT_FOUND' }) };
    return { ok: route.ok, status: route.status, json: async () => route.body };
  };
}

console.log('=== fetchServerBalance (fetch tiruan) ===');
{
  const okFetch = stubFetcher({
    '/api/credits/balance': { ok: true, status: 200, body: { success: true, balance: PAYLOAD, freeOnceGranted: false, simulated: false } },
    '/api/credits/subscription': { ok: true, status: 200, body: { success: true, subscription: { planId: 'professional', status: 'ACTIVE' }, entitlementPlanId: 'professional' } },
  });
  const r = await fetchServerBalance('token-nyata', okFetch);
  check('sukses → ok + saldo server', r.ok === true && r.ok && r.balance.total === 6600);
  check('paket dari entitlementPlanId (professional → pro)', r.ok === true && r.ok && r.balance.plan === 'pro');
  check('freeOnceGranted diteruskan', r.ok === true && r.ok && r.freeOnceGranted === false);
}
{
  const r = await fetchServerBalance(null, stubFetcher({}));
  check('tanpa token → NO_TOKEN', r.ok === false && !r.ok && r.error === 'NO_TOKEN');
}
{
  const down = stubFetcher({
    '/api/credits/balance': { ok: false, status: 503, body: { success: false, error: 'CREDITS_NOT_CONFIGURED' } },
    '/api/credits/subscription': { ok: false, status: 503, body: { success: false, error: 'BILLING_NOT_CONFIGURED' } },
  });
  const r = await fetchServerBalance('token-nyata', down);
  check('balance 503 → error jujur diteruskan', r.ok === false && !r.ok && r.error === 'CREDITS_NOT_CONFIGURED');
}
{
  const netErr = stubFetcher({ '/api/credits/balance': new Error('boom') });
  const r = await fetchServerBalance('token-nyata', netErr);
  check('jaringan gagal → NETWORK_ERROR', r.ok === false && !r.ok && r.error === 'NETWORK_ERROR');
}
{
  const sim = stubFetcher({
    '/api/credits/balance': { ok: true, status: 200, body: { success: true, balance: PAYLOAD, simulated: true } },
    '/api/credits/subscription': { ok: true, status: 200, body: { success: true, entitlementPlanId: 'free' } },
  });
  const r = await fetchServerBalance('token-nyata', sim);
  check('respons simulated:true DITOLAK', r.ok === false && !r.ok && r.error === 'SIMULATED_RESPONSE_REJECTED');
}
{
  const bad = stubFetcher({
    '/api/credits/balance': { ok: true, status: 200, body: { success: true, balance: { ...PAYLOAD, total: -1 } } },
    '/api/credits/subscription': { ok: true, status: 200, body: { success: true, entitlementPlanId: 'free' } },
  });
  const r = await fetchServerBalance('token-nyata', bad);
  check('payload malformed → MALFORMED_BALANCE', r.ok === false && !r.ok && r.error === 'MALFORMED_BALANCE');
}
{
  const subDown = stubFetcher({
    '/api/credits/balance': { ok: true, status: 200, body: { success: true, balance: PAYLOAD, simulated: false } },
    '/api/credits/subscription': { ok: false, status: 503, body: { success: false, error: 'BILLING_NOT_CONFIGURED' } },
  });
  const r = await fetchServerBalance('token-nyata', subDown);
  check('subscription gagal → saldo tetap dipakai, plan fail-closed free',
    r.ok === true && r.ok && r.balance.total === 6600 && r.balance.plan === 'free');
}
{
  const subUnknown = stubFetcher({
    '/api/credits/balance': { ok: true, status: 200, body: { success: true, balance: PAYLOAD, simulated: false } },
    '/api/credits/subscription': { ok: true, status: 200, body: { success: true, entitlementPlanId: 'platinum' } },
  });
  const r = await fetchServerBalance('token-nyata', subUnknown);
  check('entitlementPlanId asing → plan free', r.ok === true && r.ok && r.balance.plan === 'free');
}

console.log(`\nHasil: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);
