// Suite: Sprint 3 Tugas 1 — konkurensi transaksional ledger (P0).
// Run: npx --yes tsx src/test/creditConcurrencySprint3.test.ts
//
// Membuktikan perilaku wajib Sprint 3 pada jalur withLedger
// (billingStore.js) + domain creditLedger.js:
//   serialisasi per-akun in-process, validasi invarian pra-flush,
//   kompensasi flush, dan konflik idempotensi eksplisit.
//
// KEJUJURAN CAKUPAN: tes ini membuktikan atomisitas IN-PROCESS pada satu
// instance Node. Ia TIDAK membuktikan konkurensi terdistribusi lintas
// instance serverless — kontrak otoritatifnya adalah RPC SQL
// transaksional (migration 20261110, diperbaiki Sprint 3 Tugas 2,
// NOT RUNTIME VERIFIED: PostgreSQL lokal tidak tersedia).
//
// Konkurensi dibuat DETERMINISTIK: gerbang deferred eksplisit (bukan
// sleep) menahan pemanggil pertama di dalam load; pemanggil kedua
// diantrikan oleh mutex per-akun dalam urutan pemanggilan (akuisisi
// berjalan sinkron saat withLedger dipanggil).
import { createCreditLedger } from '../../api/_lib/creditLedger.js';
import { reconcileAccountData } from '../../api/_lib/creditReconciliation.js';
import {
  InMemoryBillingRepository,
  loadLedgerSnapshot,
  flushLedgerSnapshot,
  withLedger,
} from '../../api/_lib/billingStore.js';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

const T0 = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const TARIFF = '2026-11-02.1';
const CTX = { ownerUserId: 'u1', workspaceId: 'ws1' };

function deferred() {
  let resolve: any;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

/** Repo dengan gerbang deferred pada load pertama sesudah di-arm. */
class GatedLoadRepo extends InMemoryBillingRepository {
  gate: any = null;
  armGate() {
    const g = { entered: deferred(), release: deferred(), used: false };
    this.gate = g;
    return g;
  }
  async loadLedgerRows(accountId: string) {
    if (this.gate && !this.gate.used) {
      this.gate.used = true;
      this.gate.entered.resolve();
      await this.gate.release.promise;
    }
    return super.loadLedgerRows(accountId);
  }
}

/** Repo yang gagal menyisipkan entri ledger tepat satu kali. */
class FlakyEntryRepo extends InMemoryBillingRepository {
  failEntry = false;
  async insertEntryRow(row: any) {
    if (this.failEntry) {
      this.failEntry = false;
      const e: any = new Error('simulated_transient_entry_failure');
      e.code = 'SIMULATED_FAILURE';
      throw e;
    }
    return super.insertEntryRow(row);
  }
}

async function stateOf(repo: any, acct: string) {
  const snap: any = await loadLedgerSnapshot(repo, acct, CTX);
  const batches = [...snap.store.batches.values()].map((b: any) => JSON.parse(JSON.stringify(b)));
  const entries = snap.store.ledger.map((e: any) => ({ ...e }));
  const operations = [...snap.store.operations.values()].map((o: any) => JSON.parse(JSON.stringify(o)));
  return { snap, batches, entries, operations };
}
function invariantOk(batches: any[]) {
  return batches.every((b) => b.grantedAmount === b.remainingAmount + b.reservedAmount + b.consumedAmount + b.expiredAmount
    && b.remainingAmount >= 0 && b.reservedAmount >= 0 && b.consumedAmount >= 0 && b.expiredAmount >= 0);
}
async function healthy(repo: any, acct: string) {
  const s = await stateOf(repo, acct);
  // Basis waktu rekonsiliasi = jam dinding repository (created_at baris
  // operasi diisi repository, bukan `now` domain T0) — bila T0 dipakai,
  // operasi RESERVED yang sah akan terflag STUCK secara keliru.
  const rec = reconcileAccountData(
    { batches: s.batches, ledgerEntries: s.entries, operations: s.operations, orders: [] },
    { now: Date.now() },
  );
  return rec.healthy;
}
function reserveVia(repo: any, acct: string, est: number, key: string, now = T0) {
  return withLedger(repo, acct, CTX, (l: any) => {
    const op: any = l.createOperation({ accountId: acct, feature: 'chat-ai/fast', estimatedCredits: est, idempotencyKey: `${key}:op`, now });
    if (!op.ok) return op;
    return l.reserve(op.operation.id, { accountId: acct, idempotencyKey: `${key}:res`, now });
  });
}
async function seedTopUp(repo: any, acct: string, amount: number, key = 'seed') {
  return withLedger(repo, acct, CTX, (l: any) =>
    l.grantTopUp({ accountId: acct, amount, paymentRef: key, idempotencyKey: key, now: T0 }));
}

// =======================================================================
console.log('=== Tes 1 (Regresi Phase 2-A): dua grant FREE_ONCE konkuren ===');
{
  const repo = new GatedLoadRepo();
  const acct = 's3-t1';
  const gate = repo.armGate();
  const p1: any = withLedger(repo as any, acct, CTX, (l: any) => l.grantFreeOnce({ accountId: acct, now: T0 }));
  const p2: any = withLedger(repo as any, acct, CTX, (l: any) => l.grantFreeOnce({ accountId: acct, now: T0 }));
  await gate.entered.promise; // p1 terbukti berada di dalam siklusnya
  gate.release.resolve();
  const [r1, r2] = await Promise.all([p1, p2]);
  const s = await stateOf(repo, acct);
  check('kedua pemanggil kembali ok (kedua = replay idempoten)', r1.ok === true && r2.ok === true && r2.duplicate === true);
  check('tepat satu batch FREE_ONCE', s.batches.filter((b: any) => b.type === 'FREE_ONCE').length === 1);
  check('tepat satu entri GRANT (nol batch yatim)', s.entries.filter((e: any) => e.kind === 'GRANT').length === 1);
  check('saldo batch = 100', s.batches[0].grantedAmount === 100 && s.batches[0].remainingAmount === 100);
  check('invarian batch', invariantOk(s.batches));
  check('rekonsiliasi healthy', await healthy(repo, acct));
}
console.log('=== Tes 1b: reproduksi manual Phase 2-A di level flush (snapshot basi) ===');
{
  const repo = new InMemoryBillingRepository();
  const acct = 's3-t1b';
  const snapA: any = await loadLedgerSnapshot(repo as any, acct, CTX);
  const snapB: any = await loadLedgerSnapshot(repo as any, acct, CTX);
  createCreditLedger(snapA.store).grantFreeOnce({ accountId: acct, now: T0 });
  createCreditLedger(snapB.store).grantFreeOnce({ accountId: acct, now: T0 });
  await flushLedgerSnapshot(repo as any, snapA);
  let flushBError: any = null;
  try { await flushLedgerSnapshot(repo as any, snapB); } catch (e) { flushBError = e; }
  const s = await stateOf(repo, acct);
  check('flush basi ditolak pra-tulis dengan UNIQUE_VIOLATION', flushBError != null && flushBError.code === 'UNIQUE_VIOLATION');
  check('keadaan akhir tetap tepat 1 batch + 1 GRANT (bukan 2 batch yatim)',
    s.batches.length === 1 && s.entries.filter((e: any) => e.kind === 'GRANT').length === 1);
  check('rekonsiliasi healthy', await healthy(repo, acct));
}

// =======================================================================
console.log('=== Tes 2: dua grant bonus konkuren, kunci idempotensi sama ===');
{
  const repo = new InMemoryBillingRepository();
  const acct = 's3-t2';
  const grant = () => withLedger(repo as any, acct, CTX, (l: any) =>
    l.grantBonus({ accountId: acct, amount: 250, campaignRef: 'camp', expiresAt: T0 + 10 * DAY, idempotencyKey: 'bonus-key', now: T0 }));
  const [r1, r2]: any[] = await Promise.all([grant(), grant()]);
  const s = await stateOf(repo, acct);
  check('satu grant + satu replay', r1.ok === true && r2.ok === true && r2.duplicate === true);
  check('tepat satu batch BONUS 250', s.batches.length === 1 && s.batches[0].type === 'BONUS' && s.batches[0].grantedAmount === 250);
  check('tepat satu entri GRANT', s.entries.filter((e: any) => e.kind === 'GRANT').length === 1);
  check('invarian + rekonsiliasi', invariantOk(s.batches) && (await healthy(repo, acct)));
}

// =======================================================================
console.log('=== Tes 3 (Regresi Phase 2-B): dua reservasi 80 konkuren atas saldo 100 ===');
{
  const repo = new GatedLoadRepo();
  const acct = 's3-t3';
  await seedTopUp(repo, acct, 100);
  const gate = repo.armGate();
  const p1: any = reserveVia(repo, acct, 80, 'r-a');
  const p2: any = reserveVia(repo, acct, 80, 'r-b');
  await gate.entered.promise;
  gate.release.resolve();
  const [r1, r2] = await Promise.all([p1, p2]);
  const s = await stateOf(repo, acct);
  const reservedOps = s.operations.filter((o: any) => o.status === 'RESERVED');
  check('tepat satu reservasi sukses', (r1.ok === true) !== (r2.ok === true) && r1.ok === true);
  check('yang kalah ditolak INSUFFICIENT_BALANCE (bukan sukses tak terdukung)', r2.ok === false && r2.error === 'INSUFFICIENT_BALANCE');
  check('total ter-reserve persis 80 (bukan 160)', s.batches[0].reservedAmount === 80 && s.batches[0].remainingAmount === 20);
  check('tepat satu operasi RESERVED; alokasi tersimpan = 80',
    reservedOps.length === 1 && reservedOps[0].allocations.reduce((a: number, x: any) => a + x.amount, 0) === 80);
  check('invarian + rekonsiliasi', invariantOk(s.batches) && (await healthy(repo, acct)));
}

// =======================================================================
console.log('=== Tes 4: reservasi konkuren lintas banyak batch ===');
{
  const repo = new InMemoryBillingRepository();
  const acct = 's3-t4';
  await withLedger(repo as any, acct, CTX, (l: any) => {
    l.grantSubscription({ accountId: acct, amount: 50, periodStart: T0, periodEnd: T0 + 30 * DAY, idempotencyKey: 'sub', now: T0 });
    l.grantBonus({ accountId: acct, amount: 50, campaignRef: 'c', expiresAt: T0 + 10 * DAY, idempotencyKey: 'bon', now: T0 });
    l.grantTopUp({ accountId: acct, amount: 50, paymentRef: 't', idempotencyKey: 'top', now: T0 });
    return { ok: true };
  });
  const [r1, r2]: any[] = await Promise.all([
    reserveVia(repo, acct, 100, 'multi-a'),
    reserveVia(repo, acct, 100, 'multi-b'),
  ]);
  const s = await stateOf(repo, acct);
  const totalReserved = s.batches.reduce((a: number, b: any) => a + b.reservedAmount, 0);
  check('satu reservasi 100 sukses, satu ditolak', r1.ok === true && r2.ok === false && r2.error === 'INSUFFICIENT_BALANCE');
  check('reservasi pemenang membentang 2 batch pertama Phase 5.1 (SUBSCRIPTION 50 + BONUS 50)',
    r1.allocations.length === 2 && totalReserved === 100);
  check('batch TOP_UP tidak tersentuh', s.batches.find((b: any) => b.type === 'TOP_UP').reservedAmount === 0);
  check('invarian + rekonsiliasi', invariantOk(s.batches) && (await healthy(repo, acct)));
}

// =======================================================================
console.log('=== Tes 5: settle + release konkuren → tepat satu outcome terminal ===');
{
  const repo = new InMemoryBillingRepository();
  const acct = 's3-t5';
  await seedTopUp(repo, acct, 100);
  const r: any = await reserveVia(repo, acct, 80, 'race-term');
  check('setup reservasi ok', r.ok === true);
  const before = await stateOf(repo, acct);
  const opId = before.operations.find((o: any) => o.status === 'RESERVED').id;
  const [s1, s2]: any[] = await Promise.all([
    withLedger(repo as any, acct, CTX, (l: any) => l.settle(opId, { accountId: acct, actualCredits: 60, usageEvidence: { t: 1 }, tariffVersion: TARIFF, idempotencyKey: 'settle-race', now: T0 })),
    withLedger(repo as any, acct, CTX, (l: any) => l.release(opId, { accountId: acct, idempotencyKey: 'release-race', now: T0 })),
  ]);
  const s = await stateOf(repo, acct);
  const op = s.operations.find((o: any) => o.id === opId);
  check('settle (pemanggil pertama) menang', s1.ok === true && s1.settledCredits === 60);
  check('release sesudah settle → INVALID_STATE', s2.ok === false && s2.error === 'INVALID_STATE');
  check('operasi berakhir SETTLED (satu terminal sah)', op.status === 'SETTLED');
  check('konsumsi tepat 60 sekali; sisa 20 kembali; entri CONSUME tunggal',
    s.batches[0].consumedAmount === 60 && s.batches[0].remainingAmount === 40
    && s.entries.filter((e: any) => e.kind === 'CONSUME').length === 1);
  check('invarian + rekonsiliasi', invariantOk(s.batches) && (await healthy(repo, acct)));
}

// =======================================================================
console.log('=== Tes 6: expiry + reservasi konkuren → hasil serial yang sah ===');
{
  // 6a: sweep lebih dulu → reservasi atas batch kedaluwarsa ditolak.
  const repo = new InMemoryBillingRepository();
  const acct = 's3-t6a';
  await withLedger(repo as any, acct, CTX, (l: any) =>
    l.grantBonus({ accountId: acct, amount: 100, campaignRef: 'c', expiresAt: T0 + DAY, idempotencyKey: 'bon', now: T0 }));
  const [e1, r1]: any[] = await Promise.all([
    withLedger(repo as any, acct, CTX, (l: any) => l.applyExpirations({ accountId: acct, now: T0 + 2 * DAY })),
    reserveVia(repo, acct, 80, 'after-exp', T0 + 2 * DAY),
  ]);
  const s = await stateOf(repo, acct);
  check('sweep mengekspirasi 100', e1.ok === true && e1.totalExpired === 100);
  check('reservasi sesudah sweep ditolak INSUFFICIENT_BALANCE', r1.ok === false && r1.error === 'INSUFFICIENT_BALANCE');
  check('batch: expired 100, reserved 0', s.batches[0].expiredAmount === 100 && s.batches[0].reservedAmount === 0);
  check('invarian + rekonsiliasi', invariantOk(s.batches) && (await healthy(repo, acct)));

  // 6b: reservasi lebih dulu → sweep tidak menyentuh porsi ter-reserve.
  const repo2 = new InMemoryBillingRepository();
  const acct2 = 's3-t6b';
  await withLedger(repo2 as any, acct2, CTX, (l: any) =>
    l.grantBonus({ accountId: acct2, amount: 100, campaignRef: 'c', expiresAt: T0 + DAY, idempotencyKey: 'bon', now: T0 }));
  const [r2, e2]: any[] = await Promise.all([
    reserveVia(repo2, acct2, 80, 'before-exp', T0),
    withLedger(repo2 as any, acct2, CTX, (l: any) => l.applyExpirations({ accountId: acct2, now: T0 + 2 * DAY })),
  ]);
  const s2 = await stateOf(repo2, acct2);
  check('reservasi sebelum expiry sukses', r2.ok === true);
  check('sweep hanya mengekspirasi sisa bebas 20; reserved 80 utuh',
    e2.totalExpired === 20 && s2.batches[0].reservedAmount === 80 && s2.batches[0].expiredAmount === 20);
  check('invarian + rekonsiliasi', invariantOk(s2.batches) && (await healthy(repo2, acct2)));
}

// =======================================================================
console.log('=== Tes 7: grant webhook duplikat konkuren (top-up + bonus pendamping) ===');
{
  const repo = new InMemoryBillingRepository();
  const acct = 's3-t7';
  // Meniru persis cabang top-up billingService.handleNotification.
  const webhookGrant = () => withLedger(repo as any, acct, CTX, (l: any) => {
    const top: any = l.grantTopUp({ accountId: acct, amount: 3000, paymentRef: 'order-1', idempotencyKey: 'order-1', actor: 'midtrans-webhook', now: T0 });
    if (!top.ok) return top;
    const bon: any = l.grantBonus({ accountId: acct, amount: 600, campaignRef: 'topup-3600', idempotencyKey: 'order-1:bonus', actor: 'midtrans-webhook', now: T0 });
    return bon.ok ? top : bon;
  });
  const [w1, w2]: any[] = await Promise.all([webhookGrant(), webhookGrant()]);
  const s = await stateOf(repo, acct);
  check('webhook pertama grant, kedua replay', w1.ok === true && w2.ok === true && w2.duplicate === true);
  check('tepat 2 batch (1 top-up 3000 + 1 bonus 600), 2 entri GRANT',
    s.batches.length === 2 && s.entries.filter((e: any) => e.kind === 'GRANT').length === 2);
  check('total saldo 3600 (tidak dobel)', s.batches.reduce((a: number, b: any) => a + b.remainingAmount, 0) === 3600);
  check('invarian + rekonsiliasi', invariantOk(s.batches) && (await healthy(repo, acct)));
}

// =======================================================================
console.log('=== Tes 8: settle duplikat konkuren → konsumsi tidak ganda ===');
{
  const repo = new InMemoryBillingRepository();
  const acct = 's3-t8';
  await seedTopUp(repo, acct, 500);
  const r: any = await reserveVia(repo, acct, 200, 'dup-settle');
  const before = await stateOf(repo, acct);
  const opId = before.operations.find((o: any) => o.status === 'RESERVED').id;
  const settle = (key: string) => withLedger(repo as any, acct, CTX, (l: any) =>
    l.settle(opId, { accountId: acct, actualCredits: 120, usageEvidence: { t: 3 }, tariffVersion: TARIFF, idempotencyKey: key, now: T0 }));
  const [s1, s2]: any[] = await Promise.all([settle('settle-a'), settle('settle-b')]);
  const s = await stateOf(repo, acct);
  check('settle pertama ok; kedua duplicate tanpa efek', s1.ok === true && s2.ok === true && s2.duplicate === true);
  check('consumed tepat 120 sekali', s.batches[0].consumedAmount === 120
    && s.entries.filter((e: any) => e.kind === 'CONSUME').length === 1);
  check('invarian + rekonsiliasi', invariantOk(s.batches) && (await healthy(repo, acct)));
}

// =======================================================================
console.log('=== Tes 9: retry sesudah kegagalan transaksi → tanpa keadaan parsial ===');
{
  const repo = new FlakyEntryRepo();
  const acct = 's3-t9';
  repo.failEntry = true; // sisipan entri GRANT pertama gagal di tengah flush
  let firstError: any = null;
  try {
    await withLedger(repo as any, acct, CTX, (l: any) =>
      l.grantTopUp({ accountId: acct, amount: 700, paymentRef: 'retry-1', idempotencyKey: 'retry-1', now: T0 }));
  } catch (e) { firstError = e; }
  const mid = await stateOf(repo, acct);
  check('kegagalan flush terpropagasi', firstError != null && firstError.code === 'SIMULATED_FAILURE');
  check('nol keadaan parsial: batch sisipan terkompensasi, jurnal kosong',
    mid.batches.length === 0 && mid.entries.length === 0);
  const retry: any = await withLedger(repo as any, acct, CTX, (l: any) =>
    l.grantTopUp({ accountId: acct, amount: 700, paymentRef: 'retry-1', idempotencyKey: 'retry-1', now: T0 }));
  const s = await stateOf(repo, acct);
  check('retry berhasil tepat satu grant 700', retry.ok === true && s.batches.length === 1
    && s.batches[0].grantedAmount === 700 && s.entries.filter((e: any) => e.kind === 'GRANT').length === 1);
  check('invarian + rekonsiliasi', invariantOk(s.batches) && (await healthy(repo, acct)));
}

// =======================================================================
console.log('=== Tes 10: kunci idempotensi sama, payload finansial berbeda → konflik eksplisit ===');
{
  const repo = new InMemoryBillingRepository();
  const acct = 's3-t10';
  const g1: any = await withLedger(repo as any, acct, CTX, (l: any) =>
    l.grantTopUp({ accountId: acct, amount: 500, paymentRef: 'k10', idempotencyKey: 'k10', now: T0 }));
  const g2: any = await withLedger(repo as any, acct, CTX, (l: any) =>
    l.grantTopUp({ accountId: acct, amount: 999, paymentRef: 'k10', idempotencyKey: 'k10', now: T0 }));
  const g3: any = await withLedger(repo as any, acct, CTX, (l: any) =>
    l.grantTopUp({ accountId: acct, amount: 500, paymentRef: 'k10', idempotencyKey: 'k10', now: T0 }));
  const s = await stateOf(repo, acct);
  check('grant pertama ok', g1.ok === true);
  check('payload berbeda → IDEMPOTENCY_CONFLICT eksplisit', g2.ok === false && g2.error === 'IDEMPOTENCY_CONFLICT');
  check('payload sama → replay duplicate yang sah', g3.ok === true && g3.duplicate === true);
  check('keadaan tidak berubah oleh konflik: 1 batch 500, 1 entri GRANT',
    s.batches.length === 1 && s.batches[0].grantedAmount === 500 && s.entries.filter((e: any) => e.kind === 'GRANT').length === 1);
  // Konflik juga berlaku untuk pembuatan operasi (estimasi berbeda).
  const { createCreditLedger, createMemoryLedgerStore } = await import('../../api/_lib/creditLedger.js');
  const l = createCreditLedger(createMemoryLedgerStore());
  const o1: any = l.createOperation({ accountId: 'X', feature: 'chat-ai/fast', estimatedCredits: 100, idempotencyKey: 'opk', now: T0 });
  const o2: any = l.createOperation({ accountId: 'X', feature: 'chat-ai/fast', estimatedCredits: 200, idempotencyKey: 'opk', now: T0 });
  check('createOperation payload berbeda → IDEMPOTENCY_CONFLICT', o1.ok === true && o2.ok === false && o2.error === 'IDEMPOTENCY_CONFLICT');
  check('invarian + rekonsiliasi', invariantOk(s.batches) && (await healthy(repo, acct)));
}

console.log(`\nHASIL SPRINT 3 TUGAS 1: ${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
