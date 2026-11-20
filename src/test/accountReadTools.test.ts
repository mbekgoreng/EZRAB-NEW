/**
 * EZRAB — FULL ACCOUNT INTELLIGENCE FASE B §12.2 item 3:
 * TOOL BACA DOMAIN AKUN SERVER (5 tool).
 *
 * Membuktikan: registrasi 5 tool di EZRAB_AI_TOOLS + registry kanonis
 * (permission read-only, tanpa proyek, tanpa approval, idempotent false
 * agar data live tidak diputar-ulang dari trail); endpoint server yang
 * benar dipanggil dengan Bearer token sesi; perilaku jujur saat belum
 * masuk / backend tidak tersedia / jaringan gagal / bukan admin;
 * agregasi get_account_summary; argumen identitas dari LLM diabaikan;
 * pertumbuhan daftar tool LLM tetap dalam anggaran prompt.
 *
 * Kelas bukti: mock terkendali (fetcher + token + resolver workspace
 * disuntik via setAccountApiDeps; localStorage shim). TIDAK ADA
 * panggilan jaringan nyata, TIDAK ADA sesi Supabase nyata.
 * Jalankan: npx --yes tsx src/test/accountReadTools.test.ts
 */

import { strict as assert } from 'assert';
import {
  getToolDefinition,
  listAvailableTools,
  executeTool,
  __resetToolRegistryForTests,
} from '../ai-tools/ezrab-ai/toolRegistry';
import { EZRAB_AI_TOOLS, getToolListText, runTool } from '../ai-tools/ezrab-ai/tools';
import {
  setAccountApiDeps,
  type AccountApiDeps,
} from '../ai-tools/ezrab-ai/accountApiClient';
import type { BalanceFetcher } from '../ai-credits/serverBalance';

/* ---------------- localStorage shim (pola Fase 2/3/4/5) ---------------- */
const store: Record<string, string> = {};
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
};
(globalThis as { window?: unknown }).window = globalThis;

function resetAll(): void {
  for (const k of Object.keys(store)) delete store[k];
  __resetToolRegistryForTests();
  setAccountApiDeps(null);
}

/* ---------------- runner (pola C4) ---------------- */
let passed = 0;
let failed = 0;
const failedNames: string[] = [];
function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(() => fn())
    .then(() => { passed += 1; console.log(`  ✓ ${name}`); })
    .catch((e) => {
      failed += 1;
      failedNames.push(name);
      console.log(`  ✗ ${name} — ${(e as Error).message}`);
    });
}

/* ---------------- fixture server (bentuk respons nyata) ---------------- */

const BALANCE_BODY = {
  success: true,
  balance: {
    subscriptionAvailable: 5000,
    topupAvailable: 200,
    bonusAvailable: 50,
    freeOnceAvailable: 100,
    reserved: 0,
    total: 5350,
  },
  freeOnceGranted: true,
  simulated: false,
};

const SUBSCRIPTION_BODY = {
  success: true,
  subscription: {
    planId: 'professional',
    status: 'ACTIVE',
    periodStart: '2026-11-01T00:00:00.000Z',
    periodEnd: '2026-12-01T00:00:00.000Z',
    graceEndsAt: null,
    lastOrderId: 'ord-fixture-1',
  },
  entitlementPlanId: 'professional',
};

const USAGE_BODY = {
  success: true,
  usage: [
    {
      id: 'op-1',
      feature: 'CHAT',
      model: 'Ezrab-flash-v1',
      tokens_in: 1200,
      tokens_out: 800,
      credits_charged: 25,
      status: 'actual',
      created_at: 1794000000000,
    },
    {
      id: 'op-2',
      feature: 'DED',
      model: 'Ezrab-pro',
      tokens_in: 9000,
      tokens_out: 4000,
      credits_charged: null,
      status: 'pending',
      created_at: 1793900000000,
    },
  ],
  simulated: false,
};

const INVITATIONS_BODY = {
  success: true,
  invitations: [
    {
      id: 'inv-1',
      workspaceId: 'ws-test-1',
      email: 'estimator@contoh.id',
      inviteeName: 'Budi Estimator',
      role: 'ESTIMATOR',
      status: 'PENDING',
      emailStatus: 'sent',
      emailProvider: 'resend',
      projectIds: [],
      resendOf: null,
      createdBy: 'u-owner',
      createdAt: '2026-11-18T00:00:00.000Z',
      expiresAt: '2026-11-19T00:00:00.000Z',
      acceptedAt: null,
    },
    {
      id: 'inv-2',
      workspaceId: 'ws-test-1',
      email: 'diterima@contoh.id',
      inviteeName: 'Sari Diterima',
      role: 'REVIEWER',
      status: 'ACCEPTED',
      emailStatus: 'sent',
      emailProvider: 'resend',
      projectIds: [],
      resendOf: null,
      createdBy: 'u-owner',
      createdAt: '2026-11-10T00:00:00.000Z',
      expiresAt: '2026-11-11T00:00:00.000Z',
      acceptedAt: '2026-11-10T06:00:00.000Z',
    },
  ],
};

interface RecordedCall {
  url: string;
  auth: string | undefined;
}

function makeFetcher(
  overrides: Record<string, { ok: boolean; status: number; body: unknown } | Error> = {},
): { fetcher: BalanceFetcher; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const table: Record<string, { ok: boolean; status: number; body: unknown } | Error> = {
    '/api/credits/balance': { ok: true, status: 200, body: BALANCE_BODY },
    '/api/credits/subscription': { ok: true, status: 200, body: SUBSCRIPTION_BODY },
    ...overrides,
  };
  const fetcher: BalanceFetcher = async (input, init) => {
    const url = String(input);
    calls.push({ url, auth: init?.headers?.Authorization });
    const key = url.split('?')[0];
    let entry = table[url] ?? table[key];
    if (entry === undefined && key === '/api/credits/usage') {
      entry = { ok: true, status: 200, body: USAGE_BODY };
    }
    if (entry === undefined && key === '/api/invitations/list') {
      entry = { ok: true, status: 200, body: INVITATIONS_BODY };
    }
    if (entry === undefined) {
      return { ok: false, status: 404, json: async () => ({ success: false, error: 'NOT_FOUND' }) };
    }
    if (entry instanceof Error) throw entry;
    return { ok: entry.ok, status: entry.status, json: async () => entry.body };
  };
  return { fetcher, calls };
}

function installDeps(fetcher: BalanceFetcher, opts: Partial<AccountApiDeps> = {}): void {
  setAccountApiDeps({
    fetcher,
    getAccessToken: opts.getAccessToken ?? (async () => 'tok-test-session'),
    resolveWorkspaceId: opts.resolveWorkspaceId ?? (async () => 'ws-test-1'),
  });
}

const ACCOUNT_TOOLS = [
  'get_credit_balance',
  'get_subscription',
  'get_usage_history',
  'list_invitations',
  'get_account_summary',
] as const;

async function main(): Promise<void> {
  console.log('\n[FASE B] TOOL BACA DOMAIN AKUN SERVER');

  await test('B-RT-01 registrasi: 5 tool ada di EZRAB_AI_TOOLS + registry (read-only, tanpa proyek, tanpa approval)', () => {
    resetAll();
    assert.equal(EZRAB_AI_TOOLS.length, 30, `EZRAB_AI_TOOLS = 30 (aktual ${EZRAB_AI_TOOLS.length})`);
    for (const name of ACCOUNT_TOOLS) {
      const inTools = EZRAB_AI_TOOLS.find((t) => t.name === name);
      assert.ok(inTools, `${name} ada di EZRAB_AI_TOOLS`);
      assert.ok(inTools!.description.length > 20, `${name}: deskripsi bermakna`);
      const def = getToolDefinition(name);
      assert.ok(def, `${name} terdaftar di registry`);
      assert.equal(def!.permission, 'read-only', `${name}: permission read-only`);
      assert.equal(def!.requiresProject, false, `${name}: tidak butuh proyek`);
      assert.equal(def!.available, true, `${name}: tersedia`);
      assert.equal(def!.idempotent, false, `${name}: idempotent false (data live tidak diputar-ulang)`);
      assert.equal(def!.sideEffect, 'external-call', `${name}: sideEffect external-call`);
      assert.equal(typeof def!.invoke, 'function', `${name}: punya invoke`);
    }
    const available = listAvailableTools().map((d) => d.name);
    for (const name of ACCOUNT_TOOLS) assert.ok(available.includes(name), `${name} masuk daftar tersedia`);
  });

  await test('B-RT-02 anggaran prompt: 5 definisi baru menambah < 800 karakter ke daftar tool LLM', () => {
    resetAll();
    const lines = ACCOUNT_TOOLS.map((n) => {
      const t = EZRAB_AI_TOOLS.find((x) => x.name === n)!;
      return `- ${t.name}: ${t.description}`;
    });
    // Tiap baris + '\n' pemisah (kecuali baris pertama sudah terhitung
    // lewat join) — ukur persis seperti getToolListText menyusunnya.
    const growth = lines.join('\n').length + 1; // +1: newline sebelum baris pertama yang ditambahkan
    console.log(`    (pertumbuhan daftar tool: ${growth} karakter; total getToolListText: ${getToolListText().length})`);
    assert.ok(growth < 800, `pertumbuhan ${growth} < 800 karakter`);
  });

  await test('B-RT-03 get_credit_balance: endpoint benar + Bearer sesi + angka server apa adanya', async () => {
    resetAll();
    const { fetcher, calls } = makeFetcher();
    installDeps(fetcher);
    const exec = await executeTool({ toolName: 'get_credit_balance', args: {}, actor: 'model', channel: 'chat-ai' });
    assert.equal(exec.ok, true, 'eksekusi ok tanpa approval');
    assert.equal(exec.record.status, 'succeeded', 'status succeeded');
    assert.ok(exec.output!.includes('5.350'), `output memuat total 5.350 — aktual: ${exec.output}`);
    assert.ok(exec.output!.includes('Professional'), 'output memuat paket dari server');
    assert.ok(exec.output!.includes('data live server'), 'output berlabel live');
    assert.ok(!exec.output!.startsWith('ERROR:'), 'bukan output ERROR');
    const balanceCall = calls.find((c) => c.url === '/api/credits/balance');
    assert.ok(balanceCall, 'GET /api/credits/balance dipanggil');
    assert.equal(balanceCall!.auth, 'Bearer tok-test-session', 'header Bearer dari token sesi');
  });

  await test('B-RT-04 get_subscription: status + paket dilaporkan apa adanya dari server', async () => {
    resetAll();
    const { fetcher, calls } = makeFetcher();
    installDeps(fetcher);
    const exec = await executeTool({ toolName: 'get_subscription', args: {}, actor: 'model', channel: 'chat-ai' });
    assert.equal(exec.ok, true, 'eksekusi ok');
    assert.ok(exec.output!.includes('Professional'), 'paket Professional');
    assert.ok(exec.output!.includes('ACTIVE'), 'status ACTIVE');
    assert.ok(exec.output!.includes('data live server'), 'berlabel live');
    assert.ok(calls.some((c) => c.url === '/api/credits/subscription'), 'GET /api/credits/subscription dipanggil');
    // Tanpa klaim penegakan hak paket:
    assert.ok(!/terkunci|tidak dapat memakai|dibatasi paket/i.test(exec.output!), 'tidak mengklaim penegakan hak paket');
  });

  await test('B-RT-05 get_usage_history: limit dari argumen + baris terbaru dulu', async () => {
    resetAll();
    const { fetcher, calls } = makeFetcher();
    installDeps(fetcher);
    const exec = await executeTool({ toolName: 'get_usage_history', args: { jumlah: 2 }, actor: 'model', channel: 'chat-ai' });
    assert.equal(exec.ok, true, 'eksekusi ok');
    assert.ok(calls.some((c) => c.url === '/api/credits/usage?limit=2'), `limit=2 dipakai — panggilan: ${calls.map((c) => c.url).join(', ')}`);
    assert.ok(exec.output!.includes('CHAT'), 'baris CHAT tampil');
    assert.ok(exec.output!.includes('25 kredit'), 'kredit tercatat tampil');
    assert.ok(exec.output!.includes('menunggu rekonsiliasi'), 'status pending dilabeli jujur');
    assert.ok(exec.output!.includes('biaya rupiah'), 'keterbatasan biaya provider dinyatakan');
  });

  await test('B-RT-06 get_usage_history tanpa argumen memakai limit default 10', async () => {
    resetAll();
    const { fetcher, calls } = makeFetcher();
    installDeps(fetcher);
    const exec = await executeTool({ toolName: 'get_usage_history', args: {}, actor: 'model', channel: 'chat-ai' });
    assert.equal(exec.ok, true, 'eksekusi ok');
    assert.ok(calls.some((c) => c.url === '/api/credits/usage?limit=10'), 'limit default 10');
  });

  await test('B-RT-07 list_invitations: workspaceId dari resolver + filter ALL + hitungan status', async () => {
    resetAll();
    const { fetcher, calls } = makeFetcher();
    installDeps(fetcher);
    const exec = await executeTool({ toolName: 'list_invitations', args: {}, actor: 'model', channel: 'chat-ai' });
    assert.equal(exec.ok, true, 'eksekusi ok');
    assert.ok(
      calls.some((c) => c.url === '/api/invitations/list?workspaceId=ws-test-1&filter=ALL'),
      `URL list benar — panggilan: ${calls.map((c) => c.url).join(', ')}`,
    );
    assert.ok(exec.output!.includes('estimator@contoh.id'), 'email undangan tampil');
    assert.ok(exec.output!.includes('menunggu'), 'status PENDING dilabeli');
    assert.ok(exec.output!.includes('diterima'), 'status ACCEPTED dilabeli');
    assert.ok(exec.output!.includes('1 menunggu, 1 diterima'), 'hitungan per status benar');
  });

  await test('B-RT-08 get_account_summary: agregasi balance + subscription + usage (bentuk ringkasan)', async () => {
    resetAll();
    const { fetcher, calls } = makeFetcher();
    installDeps(fetcher);
    const exec = await executeTool({ toolName: 'get_account_summary', args: {}, actor: 'model', channel: 'chat-ai' });
    assert.equal(exec.ok, true, 'eksekusi ok');
    assert.ok(exec.output!.includes('Saldo kredit: 5.350'), 'saldo teragregasi');
    assert.ok(exec.output!.includes('Langganan: paket Professional, status ACTIVE'), 'langganan teragregasi');
    assert.ok(exec.output!.includes('2 operasi terakhir'), 'pemakaian teragregasi');
    assert.ok(exec.output!.includes('jendela 10 operasi terakhir, bukan total seumur akun'), 'jendela pemakaian dilabeli jujur');
    assert.ok(calls.some((c) => c.url === '/api/credits/balance'), 'balance dibaca');
    assert.ok(calls.some((c) => c.url === '/api/credits/subscription'), 'subscription dibaca');
    assert.ok(calls.some((c) => c.url.startsWith('/api/credits/usage')), 'usage dibaca');
  });

  await test('B-RT-09 belum masuk: jawaban jujur, TANPA panggilan jaringan, TANPA angka karangan', async () => {
    resetAll();
    const { fetcher, calls } = makeFetcher();
    installDeps(fetcher, { getAccessToken: async () => null });
    for (const name of ACCOUNT_TOOLS) {
      const exec = await executeTool({ toolName: name, args: {}, actor: 'model', channel: 'chat-ai' });
      assert.equal(exec.ok, true, `${name}: jawaban jujur tetap ok (bukan kegagalan eksekusi)`);
      assert.ok(exec.output!.includes('belum masuk'), `${name}: menyebut belum masuk — aktual: ${exec.output}`);
      assert.ok(!exec.output!.startsWith('ERROR:'), `${name}: bukan output ERROR`);
    }
    assert.equal(calls.length, 0, 'tidak ada panggilan jaringan tanpa sesi');
  });

  await test('B-RT-10 backend belum terkonfigurasi (503): gagal jujur, bukan angka simulasi', async () => {
    resetAll();
    const { fetcher } = makeFetcher({
      '/api/credits/balance': { ok: false, status: 503, body: { success: false, error: 'CREDITS_NOT_CONFIGURED' } },
    });
    installDeps(fetcher);
    const exec = await executeTool({ toolName: 'get_credit_balance', args: {}, actor: 'model', channel: 'chat-ai' });
    assert.equal(exec.ok, true, 'jawaban jujur tetap ok');
    assert.ok(exec.output!.includes('backend akun server belum aktif'), `pesan 503 jujur — aktual: ${exec.output}`);
    assert.ok(!/\d+\.\d+|\d{3,} kredit/.test(exec.output!), 'tidak ada angka saldo yang dikarang');
  });

  await test('B-RT-11 jaringan gagal + respons simulasi ditolak', async () => {
    resetAll();
    const { fetcher } = makeFetcher({
      '/api/credits/balance': new Error('boom'),
    });
    installDeps(fetcher);
    const net = await executeTool({ toolName: 'get_credit_balance', args: {}, actor: 'model', channel: 'chat-ai' });
    assert.ok(net.output!.includes('tidak dapat dihubungi'), `pesan jaringan — aktual: ${net.output}`);

    resetAll();
    const sim = makeFetcher({
      '/api/credits/balance': { ok: true, status: 200, body: { ...BALANCE_BODY, simulated: true } },
    });
    installDeps(sim.fetcher);
    const simExec = await executeTool({ toolName: 'get_credit_balance', args: {}, actor: 'model', channel: 'chat-ai' });
    assert.ok(simExec.output!.includes('tidak dapat dibaca'), `respons simulasi ditolak — aktual: ${simExec.output}`);
    assert.ok(!simExec.output!.includes('5.350'), 'angka simulasi tidak pernah tampil');
  });

  await test('B-RT-12 list_invitations 403: hanya admin — pesan jujur, bukan daftar kosong palsu', async () => {
    resetAll();
    const { fetcher } = makeFetcher({
      '/api/invitations/list': { ok: false, status: 403, body: { success: false, error: 'FORBIDDEN' } },
    });
    installDeps(fetcher);
    const exec = await executeTool({ toolName: 'list_invitations', args: {}, actor: 'model', channel: 'chat-ai' });
    assert.equal(exec.ok, true, 'jawaban jujur tetap ok');
    assert.ok(exec.output!.includes('hanya admin workspace'), `pesan 403 jujur — aktual: ${exec.output}`);
  });

  await test('B-RT-13 workspace tak dapat ditentukan: list dibatalkan sebelum fetch undangan', async () => {
    resetAll();
    const { fetcher, calls } = makeFetcher();
    installDeps(fetcher, { resolveWorkspaceId: async () => null });
    const exec = await executeTool({ toolName: 'list_invitations', args: {}, actor: 'model', channel: 'chat-ai' });
    assert.ok(exec.output!.includes('workspace akun belum dapat ditentukan'), `pesan workspace — aktual: ${exec.output}`);
    assert.ok(!calls.some((c) => c.url.includes('/api/invitations/')), 'endpoint undangan tidak dipanggil tanpa workspaceId');
  });

  await test('B-RT-14 argumen identitas dari LLM diabaikan total (tidak masuk URL/header)', async () => {
    resetAll();
    const { fetcher, calls } = makeFetcher();
    installDeps(fetcher);
    const exec = await executeTool({
      toolName: 'get_credit_balance',
      args: { user_id: 'u-evil', workspace_id: 'ws-evil', role: 'SUPER_ADMIN' },
      actor: 'model',
      channel: 'chat-ai',
    });
    assert.equal(exec.ok, true, 'eksekusi ok');
    assert.ok(exec.output!.includes('5.350'), 'data sesi nyata yang dipakai');
    for (const c of calls) {
      assert.ok(!c.url.includes('evil'), `URL bebas identitas LLM: ${c.url}`);
      assert.ok(c.auth === 'Bearer tok-test-session', 'auth tetap token sesi');
    }
  });

  await test('B-RT-15 tanpa replay: dua panggilan berurutan sama-sama fetch ulang (data live)', async () => {
    resetAll();
    const { fetcher, calls } = makeFetcher();
    installDeps(fetcher);
    const first = await executeTool({ toolName: 'get_credit_balance', args: {}, actor: 'model', channel: 'chat-ai' });
    const second = await executeTool({ toolName: 'get_credit_balance', args: {}, actor: 'model', channel: 'chat-ai' });
    assert.equal(first.ok, true, 'panggilan pertama ok');
    assert.equal(second.ok, true, 'panggilan kedua ok');
    assert.equal(second.record.replayed, false, 'panggilan kedua bukan replay');
    const balanceCalls = calls.filter((c) => c.url === '/api/credits/balance').length;
    assert.equal(balanceCalls, 2, `balance di-fetch 2x (aktual ${balanceCalls})`);
  });

  await test('B-RT-16 runTool async: invoke Promise tersalurkan lewat runTool + wrapChatTool', async () => {
    resetAll();
    const { fetcher } = makeFetcher();
    installDeps(fetcher);
    const out = await runTool('get_subscription', {});
    assert.equal(typeof out, 'string', 'runTool mengembalikan string (setelah await)');
    assert.ok((out as string).includes('Professional'), 'isi subscription benar');
    const syncOut = runTool('subtotal', { volume: 2, unitPrice: 1000 });
    assert.equal(typeof syncOut, 'string', 'tool sinkron lama tetap sinkron');
  });

  await test('B-RT-17 validasi input: jumlah di luar 1..20 diblokir SEBELUM fetch', async () => {
    resetAll();
    const { fetcher, calls } = makeFetcher();
    installDeps(fetcher);
    const over = await executeTool({ toolName: 'get_usage_history', args: { jumlah: 99 }, actor: 'model', channel: 'chat-ai' });
    assert.equal(over.ok, false, 'jumlah 99 ditolak');
    assert.equal(over.errorCode, 'INPUT_VALIDATION_FAILED', 'kode validasi');
    assert.equal(over.record.status, 'blocked', 'status blocked');
    const wrongType = await executeTool({ toolName: 'get_usage_history', args: { jumlah: 'lima' }, actor: 'model', channel: 'chat-ai' });
    assert.equal(wrongType.ok, false, 'jumlah string ditolak');
    assert.equal(calls.length, 0, 'tidak ada fetch untuk input tak valid');
  });

  await test('B-RT-18 respons malformed: usage bukan array → gagal jujur', async () => {
    resetAll();
    const { fetcher } = makeFetcher({
      '/api/credits/usage': { ok: true, status: 200, body: { success: true, usage: 'bukan-array' } },
    });
    installDeps(fetcher);
    const exec = await executeTool({ toolName: 'get_usage_history', args: {}, actor: 'model', channel: 'chat-ai' });
    assert.ok(exec.output!.includes('tidak dapat dibaca'), `pesan malformed — aktual: ${exec.output}`);
  });

  await test('B-RT-19 ringkasan parsial: satu domain gagal, domain lain tetap tampil', async () => {
    resetAll();
    const { fetcher } = makeFetcher({
      '/api/credits/usage': { ok: false, status: 503, body: { success: false, error: 'CREDITS_NOT_CONFIGURED' } },
    });
    installDeps(fetcher);
    const exec = await executeTool({ toolName: 'get_account_summary', args: {}, actor: 'model', channel: 'chat-ai' });
    assert.equal(exec.ok, true, 'ringkasan tetap ok');
    assert.ok(exec.output!.includes('Saldo kredit: 5.350'), 'saldo tetap tampil saat usage gagal');
    assert.ok(exec.output!.includes('Pemakaian tidak tersedia'), 'kegagalan usage dilabeli per-domain');
  });

  console.log(`\n[FASE B] ${passed} lolos, ${failed} gagal${failedNames.length ? ` — gagal: ${failedNames.join(', ')}` : ''}`);
  resetAll();
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
