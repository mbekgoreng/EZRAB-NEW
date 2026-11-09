// Suite: Mesin status langganan — transisi murni dari peristiwa pembayaran
// dan sapuan waktu; grace 3 hari; proyeksi hak (entitlement).
// Jalankan dari root repo: npx --yes tsx src/test/subscriptionMachine.test.ts
import {
  GRACE_MS,
  addMonths,
  createSubscriptionState,
  applyPaymentSucceeded,
  applyPaymentFailed,
  applyCancellation,
  sweepSubscription,
  effectiveStatus,
  entitlementPlanId,
} from '../../api/_lib/subscriptionMachine.js';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

const T0 = Date.UTC(2026, 10, 9, 0, 0, 0);
const P1 = addMonths(T0, 1);
const DAY = 24 * 60 * 60 * 1000;

console.log('=== Pembuatan & pembayaran ===');
const fresh = createSubscriptionState({ planId: 'starter', at: T0, periodMonths: 1, orderId: 'o1' });
check('state awal ACTIVE', fresh.status === 'ACTIVE');
check('periode [T0, +1 bulan]', fresh.periodStart === T0 && fresh.periodEnd === P1);
check('tanpa grace', fresh.graceEndsAt === null);

const renewed = applyPaymentSucceeded(fresh, { at: T0 + 10 * DAY, periodMonths: 1, orderId: 'o2' });
check('bayar di tengah periode → periode baru mulai di periodEnd lama', renewed.periodStart === P1 && renewed.periodEnd === addMonths(P1, 1));
check('tetap ACTIVE', renewed.status === 'ACTIVE');

const expiredState = { ...fresh, status: 'EXPIRED' as const };
const reactivated = applyPaymentSucceeded(expiredState, { at: P1 + 40 * DAY, periodMonths: 1, orderId: 'o3' });
check('reaktivasi dari EXPIRED → periode mulai sekarang', reactivated.status === 'ACTIVE' && reactivated.periodStart === P1 + 40 * DAY);

console.log('=== Kegagalan pembayaran & sapuan waktu ===');
const failed = applyPaymentFailed(fresh, { at: T0 + 5 * DAY });
check('gagal bayar → PAST_DUE', failed.status === 'PAST_DUE');
check('graceEndsAt = periodEnd + 3 hari', failed.graceEndsAt === P1 + GRACE_MS && GRACE_MS === 3 * DAY);
check('PAST_DUE sebelum periodEnd tetap PAST_DUE (hak utuh)', effectiveStatus(failed, P1 - 1) === 'PAST_DUE');
check('PAST_DUE lewat periodEnd → GRACE', effectiveStatus(failed, P1 + 1) === 'GRACE');
check('GRACE lewat graceEndsAt → EXPIRED', effectiveStatus(failed, P1 + GRACE_MS + 1) === 'EXPIRED');
check('sweep berantai PAST_DUE → EXPIRED dalam satu sapuan jauh', effectiveStatus(failed, P1 + 30 * DAY) === 'EXPIRED');

const sweptActive = sweepSubscription(fresh, P1 + 1);
check('ACTIVE lewat periodEnd → GRACE (periodEnd + 3 hari)', sweptActive.status === 'GRACE' && sweptActive.graceEndsAt === P1 + GRACE_MS);
check('ACTIVE sebelum periodEnd tidak berubah', sweepSubscription(fresh, P1 - 1) === fresh);
check('input tidak dimutasi sweep', fresh.status === 'ACTIVE');

console.log('=== Pembatalan ===');
const cancelled = applyCancellation(fresh, { at: T0 + 2 * DAY });
check('batal → CANCELLED', cancelled.status === 'CANCELLED');
check('CANCELLED masih berhak sampai periodEnd', entitlementPlanId(cancelled, P1 - 1) === 'starter');
check('CANCELLED lewat periodEnd → EXPIRED → hak free', entitlementPlanId(cancelled, P1 + 1) === 'free');

console.log('=== Proyeksi hak ===');
check('ACTIVE → plan langganan', entitlementPlanId(fresh, T0) === 'starter');
check('GRACE → plan langganan (belum diputus)', entitlementPlanId(failed, P1 + DAY) === 'starter');
check('EXPIRED → free', entitlementPlanId({ ...fresh, status: 'EXPIRED' as const }, T0) === 'free');
check('tanpa langganan → free', entitlementPlanId(null, T0) === 'free');
check('effectiveStatus null → null', effectiveStatus(null, T0) === null);

console.log('=== Trial (dorman di v1, mesin mendukung) ===');
const trial = createSubscriptionState({ planId: 'pro', at: T0, trialEnd: T0 + 30 * DAY, orderId: 't1' });
check('dengan trialEnd → TRIALING', trial.status === 'TRIALING');
check('trial lewat tanpa bayar → GRACE', effectiveStatus(trial, T0 + 30 * DAY + 1) === 'GRACE');
const trialPaid = applyPaymentSucceeded(trial, { at: T0 + 3 * DAY, periodMonths: 1, orderId: 't2' });
check('trial dibayar → ACTIVE', trialPaid.status === 'ACTIVE' && trialPaid.trialEnd === null);

console.log(`\nHasil: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);
