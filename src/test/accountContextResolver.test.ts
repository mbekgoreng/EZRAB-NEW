// Suite: Account Context Resolver (Fase B) — konteks akun server-backed
// untuk Chat AI. Membuktikan: identitas HANYA dari parameter (JWT
// terverifikasi), bentuk ketujuh seksi + label freshness, degradasi
// jujur (tanpa repo / bukan anggota / bukan admin / tanpa akun), dan
// TIDAK ADA data proyek/RAB/QTO/dokumen/jadwal/keuangan di output (D1).
// Repository = InMemory (baris berbentuk DB); ledger via withLedger.
// Tidak ada jaringan/DB nyata, tidak ada panggilan provider.
// Jalankan dari root repo: npx --yes tsx src/test/accountContextResolver.test.ts
import { resolveAccountContext } from '../../api/_lib/accountContextResolver.js';
import { InMemoryBillingRepository, withLedger } from '../../api/_lib/billingStore.js';
import { InMemoryInvitationRepository } from '../../api/_lib/invitations/repository.js';

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

const NOW = Date.parse('2026-11-20T09:00:00.000Z');
const OWNER = { userId: 'user-owner', email: 'owner@example.id' };
const ESTIMATOR = { userId: 'user-est', email: 'est@example.id' };
const STRANGER = { userId: 'user-stranger', email: 's@example.id' };
const WS1 = 'ws-11111111-2222-3333-4444-555555555555';
const WS2 = 'ws-22222222-3333-4444-5555-666666666666';

function setupFull(opts: { withAccount?: boolean } = {}) {
  const billing = new InMemoryBillingRepository();
  const invitations = new InMemoryInvitationRepository();
  billing.seedMembership(WS1, OWNER.userId, 'SUPER_ADMIN');
  billing.seedMembership(WS1, ESTIMATOR.userId, 'ESTIMATOR');
  invitations.seedWorkspace(WS1, 'PT Contoh Konstruksi');
  invitations.seedMembership(WS1, OWNER.userId, 'SUPER_ADMIN');
  invitations.seedMembership(WS1, ESTIMATOR.userId, 'ESTIMATOR');
  const account = opts.withAccount === false ? null : billing.seedAccount(WS1, OWNER.userId);
  return { billing, invitations, account };
}

async function seedLedger(billing: any, accountId: string) {
  // Free-once 100 + top-up 500 → total 600; satu operasi CREATED (pending).
  await withLedger(billing, accountId, { ownerUserId: OWNER.userId, workspaceId: WS1 }, (l: any) => {
    const g1 = l.grantFreeOnce({ accountId, now: NOW });
    if (!g1.ok) throw new Error('grantFreeOnce gagal di fixture');
    const g2 = l.grantTopUp({ accountId, amount: 500, paymentRef: 'EZR-TOP-x1', idempotencyKey: 'topup-x1', actor: 'midtrans-webhook', now: NOW });
    if (!g2.ok) throw new Error('grantTopUp gagal di fixture');
    const op = l.createOperation({ accountId, estimatedCredits: 25, feature: 'chat-ai/fast', idempotencyKey: 'op-x1', now: NOW });
    if (!op.ok) throw new Error('createOperation gagal di fixture');
    return { ok: true };
  });
}

async function seedSubscription(billing: any, accountId: string, overrides: any = {}) {
  await billing.insertSubscription({
    workspace_id: WS1,
    account_id: accountId,
    plan_id: 'professional',
    status: 'ACTIVE',
    period_start: new Date(Date.parse('2026-11-01T00:00:00.000Z')).toISOString(),
    period_end: new Date(Date.parse('2026-12-01T00:00:00.000Z')).toISOString(),
    trial_end: null,
    grace_ends_at: null,
    last_order_id: 'EZR-SUB-abc123',
    ...overrides,
  });
}

async function seedOrders(billing: any, accountId: string, n: number) {
  for (let i = 0; i < n; i++) {
    await billing.insertOrder({
      order_id: `EZR-SUB-ord${i}`,
      workspace_id: WS1,
      account_id: accountId,
      created_by: OWNER.userId,
      kind: 'SUBSCRIPTION',
      item_id: 'sub-professional',
      plan_id: 'professional',
      amount_idr: 79999,
      credits_snapshot: 10000,
      status: i === 0 ? 'PAID' : 'PENDING',
      snap_token: null,
      redirect_url: null,
      created_at: new Date(NOW - i * 86400000).toISOString(),
    });
  }
}

async function seedInvitations(invitations: any) {
  await invitations.insertInvitation({
    workspace_id: WS1,
    email: 'baru@example.id',
    invitee_name: 'Baru',
    role: 'ESTIMATOR',
    token_hash: 'hash-1',
    status: 'PENDING',
    email_status: 'sent',
    email_provider: 'resend',
    project_ids: [],
    created_by: OWNER.userId,
    expires_at: new Date(Date.parse('2026-11-27T00:00:00.000Z')).toISOString(),
  });
  await invitations.insertInvitation({
    workspace_id: WS1,
    email: 'lama@example.id',
    invitee_name: 'Lama',
    role: 'EDITOR',
    token_hash: 'hash-2',
    status: 'PENDING',
    email_status: 'not_sent',
    email_provider: null,
    project_ids: [],
    created_by: OWNER.userId,
    expires_at: new Date(Date.parse('2026-11-25T00:00:00.000Z')).toISOString(),
  });
}

// ---------------------------------------------------------------- R1
console.log('\n[R1] Identitas HANYA dari parameter (sesi terverifikasi)');
{
  const { billing, invitations } = setupFull();
  const ctx = await resolveAccountContext({
    identity: OWNER, workspaceId: WS1, billingRepo: billing, invitationRepo: invitations, nowMs: NOW,
  });
  check('identity.userId = parameter (bukan dari repo)', ctx.identity.userId === OWNER.userId);
  check('identity.email = parameter', ctx.identity.email === OWNER.email);
  check('identity freshness live', ctx.identity.freshness === 'live');

  // Identitas asing tidak pernah "diperbaiki" menjadi anggota workspace.
  const stranger = await resolveAccountContext({
    identity: STRANGER, workspaceId: WS1, billingRepo: billing, invitationRepo: invitations, nowMs: NOW,
  });
  check('stranger: identitas tetap milik stranger', stranger.identity.userId === STRANGER.userId);
  check('stranger: workspace NOT_A_MEMBER', stranger.workspace.freshness === 'unavailable' && (stranger.workspace as any).reason === 'NOT_A_MEMBER');
  check('stranger: tanpa nama workspace (anti-IDOR)', !JSON.stringify(stranger).includes('PT Contoh Konstruksi'));

  // Tanpa identitas → throw fail-closed.
  let threw = '';
  try {
    await resolveAccountContext({ identity: null as any, billingRepo: billing, nowMs: NOW });
  } catch (e: any) { threw = e?.message ?? ''; }
  check('tanpa identity → throw ACCOUNT_CONTEXT_IDENTITY_REQUIRED', threw === 'ACCOUNT_CONTEXT_IDENTITY_REQUIRED');
  threw = '';
  try {
    await resolveAccountContext({ identity: { userId: '' }, billingRepo: billing, nowMs: NOW });
  } catch (e: any) { threw = e?.message ?? ''; }
  check('userId kosong → throw', threw === 'ACCOUNT_CONTEXT_IDENTITY_REQUIRED');

  // Demo/anonim ditolak fail-closed (pertahanan berlapis).
  const demo = await resolveAccountContext({
    identity: { userId: OWNER.userId, email: OWNER.email, isAnonymous: true },
    workspaceId: WS1, billingRepo: billing, invitationRepo: invitations, nowMs: NOW,
  });
  check('demo: workspace DEMO_RESTRICTED', demo.workspace.freshness === 'unavailable' && (demo.workspace as any).reason === 'DEMO_RESTRICTED');
  check('demo: identitas tetap live (JWT valid, hak ditolak)', demo.identity.freshness === 'live');
}

// ---------------------------------------------------------------- R2
console.log('\n[R2] Bentuk penuh: ketujuh seksi live untuk owner');
{
  const { billing, invitations, account } = setupFull();
  await seedLedger(billing, account.id);
  await seedSubscription(billing, account.id);
  await seedOrders(billing, account.id, 7);
  await seedInvitations(invitations);
  const ctx = await resolveAccountContext({
    identity: OWNER, billingRepo: billing, invitationRepo: invitations, nowMs: NOW,
  });
  check('generatedAt ISO', typeof ctx.generatedAt === 'string' && !Number.isNaN(Date.parse(ctx.generatedAt)));
  check('workspace live + nama + peran', ctx.workspace.freshness === 'live' && (ctx.workspace as any).name === 'PT Contoh Konstruksi' && (ctx.workspace as any).role === 'SUPER_ADMIN');
  check('workspace status ACTIVE', (ctx.workspace as any).status === 'ACTIVE');
  check('workspaceId ter-resolusi otomatis (tanpa target)', (ctx.workspace as any).workspaceId === WS1);
  check('subscription live + plan professional ACTIVE', ctx.subscription.freshness === 'live' && (ctx.subscription as any).subscription?.planId === 'professional' && (ctx.subscription as any).subscription?.status === 'ACTIVE');
  check('entitlementPlanId professional', (ctx.subscription as any).entitlementPlanId === 'professional');
  check('credits live + total 600 (100 free-once + 500 top-up)', ctx.credits.freshness === 'live' && (ctx.credits as any).balance?.total === 600);
  check('credits bucket freeOnce 100 / topup 500', (ctx.credits as any).balance?.freeOnceAvailable === 100 && (ctx.credits as any).balance?.topupAvailable === 500);
  check('usage live + 1 operasi pending chat-ai/fast', ctx.usage.freshness === 'live' && (ctx.usage as any).count === 1 && (ctx.usage as any).recent[0]?.feature === 'chat-ai/fast' && (ctx.usage as any).recent[0]?.status === 'pending');
  check('orders live + dibatasi 5 dari 7', ctx.orders.freshness === 'live' && (ctx.orders as any).count === 5 && (ctx.orders as any).recent.length === 5);
  check('order terbaru = ord0 PAID Rp79.999', (ctx.orders as any).recent[0]?.orderId === 'EZR-SUB-ord0' && (ctx.orders as any).recent[0]?.status === 'PAID' && (ctx.orders as any).recent[0]?.amountIdr === 79999);
  check('invitations live + 2 pending dari 2 total', ctx.invitations.freshness === 'live' && (ctx.invitations as any).pending === 2 && (ctx.invitations as any).total === 2);
  check('invitation terbaru memuat email + role (tanpa token hash)', (ctx.invitations as any).recent[0]?.email === 'baru@example.id' && !JSON.stringify(ctx.invitations).includes('hash-1'));
}

// ---------------------------------------------------------------- R3
console.log('\n[R3] Non-admin: undangan tidak terlihat, sisanya live');
{
  const { billing, invitations, account } = setupFull();
  await seedLedger(billing, account.id);
  await seedInvitations(invitations);
  const ctx = await resolveAccountContext({
    identity: ESTIMATOR, workspaceId: WS1, billingRepo: billing, invitationRepo: invitations, nowMs: NOW,
  });
  check('estimator: workspace live + peran ESTIMATOR', ctx.workspace.freshness === 'live' && (ctx.workspace as any).role === 'ESTIMATOR');
  check('estimator: invitations unavailable NOT_WORKSPACE_ADMIN', ctx.invitations.freshness === 'unavailable' && (ctx.invitations as any).reason === 'NOT_WORKSPACE_ADMIN');
  check('estimator: email undangan TIDAK bocor', !JSON.stringify(ctx).includes('baru@example.id') && !JSON.stringify(ctx).includes('lama@example.id'));
  check('estimator: credits tetap live', ctx.credits.freshness === 'live');
}

// ---------------------------------------------------------------- R4
console.log('\n[R4] Tanpa billing repo: degradasi jujur, tanpa throw');
{
  const ctx = await resolveAccountContext({
    identity: OWNER, workspaceId: WS1, billingRepo: null, invitationRepo: null, nowMs: NOW,
  });
  check('identitas tetap live', ctx.identity.freshness === 'live' && ctx.identity.userId === OWNER.userId);
  for (const key of ['workspace', 'subscription', 'credits', 'usage', 'orders', 'invitations'] as const) {
    check(`${key} unavailable BILLING_NOT_CONFIGURED`, (ctx as any)[key].freshness === 'unavailable' && (ctx as any)[key].reason === 'BILLING_NOT_CONFIGURED');
  }
}

// ---------------------------------------------------------------- R5
console.log('\n[R5] Tanpa invitation repo: undangan unavailable, nama workspace null');
{
  const { billing, account } = setupFull();
  await seedLedger(billing, account.id);
  const ctx = await resolveAccountContext({
    identity: OWNER, workspaceId: WS1, billingRepo: billing, invitationRepo: null, nowMs: NOW,
  });
  check('invitations unavailable INVITATIONS_NOT_CONFIGURED', ctx.invitations.freshness === 'unavailable' && (ctx.invitations as any).reason === 'INVITATIONS_NOT_CONFIGURED');
  check('workspace tetap live tetapi nama null', ctx.workspace.freshness === 'live' && (ctx.workspace as any).name === null);
  check('credits tetap live', ctx.credits.freshness === 'live');
}

// ---------------------------------------------------------------- R6/R7/R8
console.log('\n[R6–R8] Resolusi workspace: anggota / ambigu / IDOR / nonaktif');
{
  const { billing, invitations } = setupFull();
  // R6: tanpa keanggotaan sama sekali.
  const none = await resolveAccountContext({
    identity: STRANGER, billingRepo: billing, invitationRepo: invitations, nowMs: NOW,
  });
  check('tanpa membership: NOT_A_MEMBER', none.workspace.freshness === 'unavailable' && (none.workspace as any).reason === 'NOT_A_MEMBER');
  check('tanpa membership: subscription/credits ikut unavailable', none.subscription.freshness === 'unavailable' && none.credits.freshness === 'unavailable');

  // R7: dua keanggotaan aktif → ambigu tanpa target, jelas dengan target.
  billing.seedMembership(WS2, OWNER.userId, 'ESTIMATOR');
  const ambiguous = await resolveAccountContext({
    identity: OWNER, billingRepo: billing, invitationRepo: invitations, nowMs: NOW,
  });
  check('dua membership tanpa target: WORKSPACE_AMBIGUOUS', ambiguous.workspace.freshness === 'unavailable' && (ambiguous.workspace as any).reason === 'WORKSPACE_AMBIGUOUS');
  const explicit = await resolveAccountContext({
    identity: OWNER, workspaceId: WS2, billingRepo: billing, invitationRepo: invitations, nowMs: NOW,
  });
  check('target eksplisit WS2 ter-resolusi + peran ESTIMATOR', explicit.workspace.freshness === 'live' && (explicit.workspace as any).workspaceId === WS2 && (explicit.workspace as any).role === 'ESTIMATOR');

  // R8: target workspace orang lain → ditolak, tanpa data.
  const idor = await resolveAccountContext({
    identity: ESTIMATOR, workspaceId: WS2, billingRepo: billing, invitationRepo: invitations, nowMs: NOW,
  });
  check('IDOR: ESTIMATOR ke WS2 → NOT_A_MEMBER', idor.workspace.freshness === 'unavailable' && (idor.workspace as any).reason === 'NOT_A_MEMBER');

  // Keanggotaan nonaktif → ditolak.
  billing.seedMembership(WS1, STRANGER.userId, 'ESTIMATOR', { status: 'SUSPENDED' });
  const suspended = await resolveAccountContext({
    identity: STRANGER, workspaceId: WS1, billingRepo: billing, invitationRepo: invitations, nowMs: NOW,
  });
  check('membership SUSPENDED → MEMBERSHIP_INACTIVE', suspended.workspace.freshness === 'unavailable' && (suspended.workspace as any).reason === 'MEMBERSHIP_INACTIVE');
}

// ---------------------------------------------------------------- R9
console.log('\n[R9] Tanpa akun billing: saldo null beralasan, riwayat kosong live');
{
  const { billing, invitations } = setupFull({ withAccount: false });
  const ctx = await resolveAccountContext({
    identity: OWNER, workspaceId: WS1, billingRepo: billing, invitationRepo: invitations, nowMs: NOW,
  });
  check('credits live + balance null + NO_BILLING_ACCOUNT', ctx.credits.freshness === 'live' && (ctx.credits as any).balance === null && (ctx.credits as any).reason === 'NO_BILLING_ACCOUNT');
  check('usage live + kosong', ctx.usage.freshness === 'live' && (ctx.usage as any).count === 0);
  check('orders live + kosong', ctx.orders.freshness === 'live' && (ctx.orders as any).count === 0);
  check('subscription null + entitlementPlanId free', ctx.subscription.freshness === 'live' && (ctx.subscription as any).subscription === null && (ctx.subscription as any).entitlementPlanId === 'free');
  check('TIDAK ada akun yang dibuat (baca-saja)', (await billing.getBillingAccountByWorkspace(WS1)) === null);
}

// ---------------------------------------------------------------- R10
console.log('\n[R10] Langganan kedaluwarsa: sweep → EXPIRED, hak kembali Free');
{
  const { billing, invitations, account } = setupFull();
  await seedSubscription(billing, account.id, {
    status: 'ACTIVE',
    period_start: new Date(Date.parse('2026-09-01T00:00:00.000Z')).toISOString(),
    period_end: new Date(Date.parse('2026-10-01T00:00:00.000Z')).toISOString(),
    grace_ends_at: new Date(Date.parse('2026-10-04T00:00:00.000Z')).toISOString(),
  });
  const ctx = await resolveAccountContext({
    identity: OWNER, workspaceId: WS1, billingRepo: billing, invitationRepo: invitations, nowMs: NOW,
  });
  check('status tersapu menjadi EXPIRED', (ctx.subscription as any).subscription?.status === 'EXPIRED');
  check('entitlementPlanId kembali free', (ctx.subscription as any).entitlementPlanId === 'free');
}

// ---------------------------------------------------------------- R11
console.log('\n[R11] TIDAK ADA data proyek/RAB/QTO/dokumen/jadwal/keuangan (D1)');
{
  const { billing, invitations, account } = setupFull();
  await seedLedger(billing, account.id);
  await seedSubscription(billing, account.id);
  await seedOrders(billing, account.id, 2);
  await seedInvitations(invitations);
  const ctx = await resolveAccountContext({
    identity: OWNER, billingRepo: billing, invitationRepo: invitations, nowMs: NOW,
  });
  const topKeys = Object.keys(ctx).sort();
  check('kunci top-level tepat 8 (generatedAt + 7 seksi)', JSON.stringify(topKeys) === JSON.stringify(['credits', 'generatedAt', 'identity', 'invitations', 'orders', 'subscription', 'usage', 'workspace']));
  const json = JSON.stringify(ctx);
  for (const forbidden of ['projectId', 'project_id', 'projectIds', 'rabItem', 'qto', 'dokumen', 'jadwal', 'keuangan', 'schedule', 'document']) {
    check(`output tidak mengandung '${forbidden}'`, !json.toLowerCase().includes(forbidden.toLowerCase()));
  }
}

console.log(`\nHasil: ${pass} lolos, ${fail} gagal`);
if (fail > 0) {
  console.log('GAGAL:', failures.join(' | '));
  process.exit(1);
}
console.log('SEMUA TEST ACCOUNT CONTEXT RESOLVER LOLOS');
