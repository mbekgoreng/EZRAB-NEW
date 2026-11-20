/**
 * accountContextSections.test.ts — FASE B (Full Account Intelligence):
 * seksi AKUN di builder kanonis + modul klien accountContext + wiring
 * service.ts.
 *
 * Membuktikan:
 *  (a) tanpa accountSection, builder IDENTIK dengan sebelumnya (pin
 *      Fase 1/P3A tidak berubah — dataBlock sama persis, anggaran
 *      ringkasan/riwayat sama persis);
 *  (b) dengan accountSection, seksi muncul utuh di blok DATA (sesudah
 *      QTO, sebelum ringkasan), ber-cap keras 1.200 dengan pemotongan
 *      berpenanda, dan total prompt tetap ≤ 16.000 (biaya diserap
 *      anggaran riwayat lewat probe overhead);
 *  (c) formatAccountSection: ringkas, memuat fakta server, TIDAK
 *      pernah memuat userId mentah, melabeli seksi 'unavailable' jujur;
 *  (d) fetchAccountContext: fail-closed (token, jaringan, bentuk);
 *  (e) resolveAccountSectionForSend: tanpa sesi → tanpa seksi; gagal
 *      fetch → seksi 'tidak tersedia'; cache TTL 120 dtk berlabel
 *      'cached'; TIDAK PERNAH melempar;
 *  (f) service.ts: accountSection passthrough sampai ke prompt provider;
 *      tanpa seksi, prompt tidak mengandung seksi akun.
 *
 * Jalankan: npx vitest run src/test/accountContextSections.test.ts
 * Provider nyata NOT RUN; 0 panggilan jaringan (fetch disuntikkan).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildCanonicalContext,
  assembleChatPrompt,
  CANONICAL_ACCOUNT_BUDGET,
  CANONICAL_TOTAL_PROMPT_BUDGET,
} from '../ai-tools/ezrab-ai/canonicalContext';
import { getToolListText } from '../ai-tools/ezrab-ai/tools';
import {
  ACCOUNT_CONTEXT_ENDPOINT,
  ACCOUNT_UNAVAILABLE_SECTION,
  clearAccountContextCache,
  fetchAccountContext,
  formatAccountSection,
  markSnapshotCached,
  resolveAccountSectionForSend,
  type AccountContextSnapshot,
} from '../ai-tools/ezrab-ai/accountContext';
import { ezrabAiService } from '../ai-tools/ezrab-ai/service';
import { aiToolsProviderClient, type AiToolsResult } from '../ai-tools/providerClient';

const USER_UUID = 'user-11111111-2222-3333-4444-555555555555';

function fullSnapshot(): AccountContextSnapshot {
  return {
    generatedAt: '2026-11-20T09:00:00.000Z',
    identity: { freshness: 'live', userId: USER_UUID, email: 'owner@example.id' },
    workspace: { freshness: 'live', workspaceId: 'ws-1', name: 'PT Contoh Konstruksi', role: 'SUPER_ADMIN', status: 'ACTIVE', billingAdmin: true },
    subscription: {
      freshness: 'live',
      subscription: {
        planId: 'professional', status: 'ACTIVE',
        periodStart: '2026-11-01T00:00:00.000Z', periodEnd: '2026-12-01T00:00:00.000Z',
        graceEndsAt: null, lastOrderId: 'EZR-SUB-abc123',
      },
      entitlementPlanId: 'professional',
    },
    credits: {
      freshness: 'live',
      balance: {
        accountId: 'acct-1', subscriptionAvailable: 8000, topupAvailable: 350,
        bonusAvailable: 100, freeOnceAvailable: 0, reserved: 0, total: 8450,
      },
      reason: null,
    },
    usage: {
      freshness: 'live',
      recent: [
        { id: 'op-1', feature: 'chat-ai/fast', model: 'Ezrab-flash-v1', credits_charged: 25, status: 'actual', created_at: Date.parse('2026-11-20T08:00:00.000Z') },
      ],
      count: 1,
    },
    orders: {
      freshness: 'live',
      recent: [
        { orderId: 'EZR-SUB-abc123', kind: 'SUBSCRIPTION', itemId: 'sub-professional', planId: 'professional', amountIdr: 79999, status: 'PAID', createdAt: '2026-11-01T00:00:00.000Z', paidAt: '2026-11-01T00:05:00.000Z' },
      ],
      count: 1,
    },
    invitations: {
      freshness: 'live',
      pending: 2,
      total: 3,
      recent: [
        { email: 'estimator@example.id', role: 'ESTIMATOR', status: 'PENDING', expiresAt: '2026-11-27T00:00:00.000Z', createdAt: '2026-11-20T00:00:00.000Z' },
      ],
    },
  };
}

function degradedSnapshot(): AccountContextSnapshot {
  const s = fullSnapshot();
  return {
    ...s,
    workspace: { freshness: 'live', workspaceId: 'ws-1', name: null, role: 'ESTIMATOR', status: 'ACTIVE', billingAdmin: false },
    subscription: { freshness: 'live', subscription: null, entitlementPlanId: 'free' },
    credits: { freshness: 'live', balance: null, reason: 'NO_BILLING_ACCOUNT' },
    usage: { freshness: 'live', recent: [], count: 0 },
    orders: { freshness: 'live', recent: [], count: 0 },
    invitations: { freshness: 'unavailable', reason: 'NOT_WORKSPACE_ADMIN' },
  };
}

const BASE_MESSAGES = [{ role: 'user' as const, content: 'Berapa saldo kredit saya?' }];
const RESERVED = assembleChatPrompt('', getToolListText()).length;

describe('B1 — tanpa seksi akun: builder IDENTIK dengan sebelumnya', () => {
  it('null vs undefined vs string kosong: dataBlock sama persis, anggaran akun 0', () => {
    const a = buildCanonicalContext({ projectId: 'P-B1', messages: BASE_MESSAGES, reservedChars: RESERVED });
    const b = buildCanonicalContext({ projectId: 'P-B1', messages: BASE_MESSAGES, accountSection: null, reservedChars: RESERVED });
    const c = buildCanonicalContext({ projectId: 'P-B1', messages: BASE_MESSAGES, accountSection: '', reservedChars: RESERVED });
    expect(a.dataBlock).toBe(b.dataBlock);
    expect(a.dataBlock).toBe(c.dataBlock);
    expect(a.report.budget.account).toBe(0);
    expect(a.report.sections.account.chars).toBe(0);
    expect(a.report.sections.account.included).toBe(0);
    expect(a.dataBlock).not.toContain('AKUN & LANGGANAN');
  });

  it('anggaran ringkasan/riwayat tidak berubah (pin P3A-02: reserved 7.747 → ringkasan 1.153)', () => {
    const built = buildCanonicalContext({
      projectId: 'P-B1', messages: BASE_MESSAGES, reservedChars: 7_747,
    });
    expect(built.report.budget.summary).toBe(1_153);
    expect(built.report.budget.facts).toBe(4_000);
    expect(built.report.budget.memory).toBe(1_500);
  });
});

describe('B2 — dengan seksi akun: muncul utuh, ber-cap, total ≤ 16.000', () => {
  const section = formatAccountSection(fullSnapshot());

  it('seksi muncul di blok DATA sesudah QTO dan sebelum ringkasan', () => {
    const built = buildCanonicalContext({
      projectId: 'P-B2', messages: BASE_MESSAGES, accountSection: section, reservedChars: RESERVED,
    });
    expect(built.dataBlock).toContain('AKUN & LANGGANAN');
    expect(built.dataBlock).toContain('owner@example.id');
    expect(built.dataBlock).toContain('Professional');
    const qtoIdx = built.dataBlock.indexOf('PEMERIKSAAN QTO');
    const akunIdx = built.dataBlock.indexOf('AKUN & LANGGANAN');
    const ringkasanIdx = built.dataBlock.indexOf('RINGKASAN PERCAKAPAN');
    expect(qtoIdx).toBeGreaterThan(-1);
    expect(akunIdx).toBeGreaterThan(qtoIdx);
    expect(ringkasanIdx).toBeGreaterThan(akunIdx);
    expect(built.report.budget.account).toBe(CANONICAL_ACCOUNT_BUDGET);
    expect(built.report.sections.account.included).toBe(1);
    expect(built.report.sections.account.truncated).toBe(false);
  });

  it('seksi terformat full < cap 1.200 (target formatter)', () => {
    expect(section.length).toBeLessThan(CANONICAL_ACCOUNT_BUDGET);
    expect(formatAccountSection(degradedSnapshot()).length).toBeLessThan(CANONICAL_ACCOUNT_BUDGET);
    expect(ACCOUNT_UNAVAILABLE_SECTION.length).toBeLessThan(CANONICAL_ACCOUNT_BUDGET);
  });

  it('seksi > 1.200 dipotong berpenanda (kepala hadir, ekor hilang, laporan ada)', () => {
    const long = `KEPALA-AKUN-UNIK ${'x'.repeat(2_000)} EKOR-AKUN-UNIK`;
    const built = buildCanonicalContext({
      projectId: 'P-B2', messages: BASE_MESSAGES, accountSection: long, reservedChars: RESERVED,
    });
    expect(built.report.sections.account.truncated).toBe(true);
    expect(built.dataBlock).toContain('KEPALA-AKUN-UNIK');
    expect(built.dataBlock).not.toContain('EKOR-AKUN-UNIK');
    expect(built.dataBlock).toContain('…[dipotong demi batas konteks');
    expect(built.report.truncations.some((t) => t.startsWith('akun dipotong'))).toBe(true);
  });

  it('skenario kaya + seksi akun + probe alat asli: prompt ≤ 16.000, riwayat menyerap biaya', () => {
    const longHistory = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `pesan ${i} tentang RAB rumah 2 lantai 180 m2 budget Rp850 juta `.repeat(6),
    }));
    const base = {
      projectId: 'P-B2',
      messages: longHistory,
      projectSummaryText: 'Rumah tinggal 2 lantai, 180 m2, Probolinggo.',
      draftSummary: { title: 'RAB Rumah', version: 3, partCount: 5, itemCount: 42 },
      memorySection: 'Preferensi: bata merah. '.repeat(20),
      objectiveSection: 'Susun RAB kasar dalam budget.',
      dedSection: 'DED: 12 ruangan. '.repeat(20),
      qtoSection: 'QTO: beton 28 m3. '.repeat(20),
      reservedChars: RESERVED,
    };
    const before = buildCanonicalContext(base);
    const after = buildCanonicalContext({ ...base, accountSection: section });
    const promptBefore = assembleChatPrompt(before.dataBlock, getToolListText());
    const promptAfter = assembleChatPrompt(after.dataBlock, getToolListText());
    expect(promptBefore.length).toBeLessThanOrEqual(CANONICAL_TOTAL_PROMPT_BUDGET);
    expect(promptAfter.length).toBeLessThanOrEqual(CANONICAL_TOTAL_PROMPT_BUDGET);
    // Biaya seksi diserap anggaran riwayat (bukan ringkasan — ringkasan tak berubah).
    expect(after.report.budget.summary).toBe(before.report.budget.summary);
    expect(after.report.budget.history).toBeLessThan(before.report.budget.history);
    // Delta = seksi + label + 2 pemisah '\n' dari join (sebelum label & sesudah seksi).
    expect(promptAfter.length - promptBefore.length).toBe(section.length + 'AKUN & LANGGANAN (server — identitas terverifikasi + fakta billing; angka di sini adalah fakta, bukan perkiraan):\n'.length + 1);
    expect(after.dataBlock).toContain('owner@example.id');
  });

  it('userId diteruskan ke scope laporan (authenticated vs anonymous)', () => {
    const authed = buildCanonicalContext({
      projectId: 'P-B2', messages: BASE_MESSAGES, userId: USER_UUID,
      accountSection: section, reservedChars: RESERVED,
    });
    expect(authed.report.scope.userId).toBe(USER_UUID);
    expect(authed.report.scope.userIdentity).toBe('authenticated');
    const anon = buildCanonicalContext({ projectId: 'P-B2', messages: BASE_MESSAGES, reservedChars: RESERVED });
    expect(anon.report.scope.userId).toBeNull();
    expect(anon.report.scope.userIdentity).toBe('anonymous-tanpa-identitas');
  });
});

describe('B3 — formatAccountSection: fakta server, tanpa userId mentah', () => {
  it('snapshot full: memuat email, workspace, paket, kredit, order, undangan', () => {
    const text = formatAccountSection(fullSnapshot());
    expect(text).toContain('owner@example.id');
    expect(text).toContain('PT Contoh Konstruksi');
    expect(text).toContain('SUPER_ADMIN');
    expect(text).toContain('Professional (ACTIVE');
    expect(text).toContain('8.450 total');
    expect(text).toContain('langganan 8.000');
    expect(text).toContain('chat-ai/fast 25 kredit');
    expect(text).toContain('EZR-SUB-abc123');
    expect(text).toContain('Rp79.999');
    expect(text).toContain('2 pending dari 3 total');
    expect(text).toContain('estimator@example.id');
  });

  it('userId mentah TIDAK PERNAH masuk teks seksi', () => {
    expect(formatAccountSection(fullSnapshot())).not.toContain(USER_UUID);
    expect(formatAccountSection(degradedSnapshot())).not.toContain(USER_UUID);
  });

  it('snapshot terdegradasi: label jujur per seksi, tanpa angka karangan', () => {
    const text = formatAccountSection(degradedSnapshot());
    expect(text).toContain('Free (tanpa langganan aktif)');
    expect(text).toContain('belum ada akun billing tercatat');
    expect(text).toContain('belum ada operasi tercatat');
    expect(text).toContain('belum ada order tercatat');
    expect(text).toContain('Undangan: tidak tersedia (hanya admin workspace)');
    expect(text).not.toContain('Rp0');
    expect(text).not.toContain('0 total');
  });

  it('fromCache: header menyebut cache + umur', () => {
    const text = formatAccountSection(fullSnapshot(), { fromCache: true, cacheAgeMs: 45_000 });
    expect(text).toContain('cache 45 dtk lalu');
    expect(formatAccountSection(fullSnapshot())).toContain('live');
  });

  it('markSnapshotCached: live → cached, unavailable tetap', () => {
    const marked = markSnapshotCached(degradedSnapshot());
    expect(marked.identity.freshness).toBe('cached');
    expect(marked.workspace.freshness).toBe('cached');
    expect(marked.invitations.freshness).toBe('unavailable');
    // Snapshot asli tidak dimutasi.
    expect(degradedSnapshot().identity.freshness).toBe('live');
  });
});

describe('B4 — fetchAccountContext: fail-closed', () => {
  it('tanpa token → NO_TOKEN tanpa fetch', async () => {
    let calls = 0;
    const fetcher = (async () => { calls++; return { ok: true, status: 200, json: async () => ({}) }; }) as never;
    const res = await fetchAccountContext(null, fetcher);
    expect(res).toEqual({ ok: false, error: 'NO_TOKEN' });
    expect(calls).toBe(0);
  });

  it('sukses: GET + Bearer ke endpoint account-context, snapshot dikembalikan', async () => {
    const seen: Array<{ input: string; init: unknown }> = [];
    const snap = fullSnapshot();
    const fetcher = (async (input: string, init?: unknown) => {
      seen.push({ input, init });
      return { ok: true, status: 200, json: async () => ({ success: true, ...snap }) };
    }) as never;
    const res = await fetchAccountContext('tok-abc', fetcher);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.snapshot.identity.email).toBe('owner@example.id');
    expect(seen).toHaveLength(1);
    expect(seen[0].input).toBe(ACCOUNT_CONTEXT_ENDPOINT);
    expect(seen[0].init).toMatchObject({ method: 'GET', headers: { Authorization: 'Bearer tok-abc' } });
  });

  it('jaringan melempar → NETWORK_ERROR; HTTP 503 → error; success:false → error', async () => {
    const throwing = (async () => { throw new Error('down'); }) as never;
    expect(await fetchAccountContext('t', throwing)).toEqual({ ok: false, error: 'NETWORK_ERROR' });
    const http503 = (async () => ({ ok: false, status: 503, json: async () => ({ success: false, error: 'CREDITS_NOT_CONFIGURED' }) })) as never;
    expect(await fetchAccountContext('t', http503)).toEqual({ ok: false, error: 'CREDITS_NOT_CONFIGURED' });
    const notSuccess = (async () => ({ ok: true, status: 200, json: async () => ({ success: false, error: 'AUTH_REQUIRED' }) })) as never;
    expect(await fetchAccountContext('t', notSuccess)).toEqual({ ok: false, error: 'AUTH_REQUIRED' });
  });

  it('snapshot malformed (seksi hilang / tanpa identitas) → MALFORMED_ACCOUNT_CONTEXT', async () => {
    const missing = (async () => ({ ok: true, status: 200, json: async () => ({ success: true, identity: { freshness: 'live', userId: 'u' } }) })) as never;
    expect(await fetchAccountContext('t', missing)).toEqual({ ok: false, error: 'MALFORMED_ACCOUNT_CONTEXT' });
    const noIdentity = (async () => {
      const snap = fullSnapshot() as Record<string, unknown>;
      delete snap.identity;
      return { ok: true, status: 200, json: async () => ({ success: true, ...snap }) };
    }) as never;
    expect(await fetchAccountContext('t', noIdentity)).toEqual({ ok: false, error: 'MALFORMED_ACCOUNT_CONTEXT' });
  });
});

describe('B5 — resolveAccountSectionForSend: sesi, gagal fetch, cache', () => {
  beforeEach(() => {
    clearAccountContextCache();
  });

  const sessionOk = async () => ({ accessToken: 'tok-abc', userId: USER_UUID });
  const sessionNone = async () => ({ accessToken: null, userId: null });

  function okFetcher(snap: AccountContextSnapshot = fullSnapshot()) {
    let calls = 0;
    const fetcher = (async () => {
      calls++;
      return { ok: true, status: 200, json: async () => ({ success: true, ...snap }) };
    }) as never;
    return { fetcher, calls: () => calls };
  }

  it('tanpa sesi → section null, userId null, reason NO_SESSION (tanpa fetch)', async () => {
    const { fetcher, calls } = okFetcher();
    const res = await resolveAccountSectionForSend({ fetcher, getSessionToken: sessionNone });
    expect(res).toEqual({ section: null, userId: null, fromCache: false, reason: 'NO_SESSION' });
    expect(calls()).toBe(0);
  });

  it('sesi + fetch ok → seksi terformat, userId snapshot, reason OK', async () => {
    const { fetcher } = okFetcher();
    const res = await resolveAccountSectionForSend({ fetcher, getSessionToken: sessionOk });
    expect(res.reason).toBe('OK');
    expect(res.fromCache).toBe(false);
    expect(res.userId).toBe(USER_UUID);
    expect(res.section).toContain('owner@example.id');
    expect(res.section).toContain('8.450 total');
  });

  it('sesi + fetch gagal → seksi tidak-tersedia berlabel, userId sesi tetap ada', async () => {
    const failing = (async () => { throw new Error('down'); }) as never;
    const res = await resolveAccountSectionForSend({ fetcher: failing, getSessionToken: sessionOk });
    expect(res.reason).toBe('FETCH_FAILED');
    expect(res.section).toBe(ACCOUNT_UNAVAILABLE_SECTION);
    expect(res.userId).toBe(USER_UUID);
  });

  it('cache TTL: panggilan kedua dalam 120 dtk tidak fetch ulang + berlabel cache; sesudah TTL fetch ulang', async () => {
    const { fetcher, calls } = okFetcher();
    const t0 = Date.now();
    const first = await resolveAccountSectionForSend({ fetcher, getSessionToken: sessionOk, nowMs: t0 });
    expect(first.reason).toBe('OK');
    expect(calls()).toBe(1);
    const second = await resolveAccountSectionForSend({ fetcher, getSessionToken: sessionOk, nowMs: t0 + 60_000 });
    expect(second.reason).toBe('CACHED');
    expect(second.fromCache).toBe(true);
    expect(second.section).toContain('cache 1 mnt lalu');
    expect(calls()).toBe(1);
    const third = await resolveAccountSectionForSend({ fetcher, getSessionToken: sessionOk, nowMs: t0 + 121_000 });
    expect(third.reason).toBe('OK');
    expect(third.fromCache).toBe(false);
    expect(calls()).toBe(2);
  });

  it('getSessionToken melempar → NO_SESSION (tidak pernah throw ke pemanggil)', async () => {
    const { fetcher } = okFetcher();
    const res = await resolveAccountSectionForSend({
      fetcher,
      getSessionToken: async () => { throw new Error('supabase down'); },
    });
    expect(res.reason).toBe('NO_SESSION');
    expect(res.section).toBeNull();
  });
});

describe('B6 — service.ts: accountSection sampai ke prompt provider', () => {
  beforeEach(() => {
    clearAccountContextCache();
  });

  it('passthrough accountSection muncul di prompt yang diterima provider', async () => {
    const original = aiToolsProviderClient.execute.bind(aiToolsProviderClient);
    const captured: Array<Record<string, unknown>> = [];
    (aiToolsProviderClient as any).execute = async (req: Record<string, unknown>): Promise<AiToolsResult> => {
      captured.push(req);
      return { success: true, content: 'baik', structured: null, requestId: 'stub' };
    };
    try {
      const res = await ezrabAiService.send({
        messages: [{ role: 'user', content: 'Berapa saldo saya?' }],
        accountSection: formatAccountSection(fullSnapshot()),
      });
      expect(res.success).toBe(true);
      expect(captured).toHaveLength(1);
      const prompt = String(captured[0].prompt);
      expect(prompt).toContain('AKUN & LANGGANAN');
      expect(prompt).toContain('owner@example.id');
      expect(prompt.length).toBeLessThanOrEqual(CANONICAL_TOTAL_PROMPT_BUDGET);
    } finally {
      (aiToolsProviderClient as any).execute = original;
    }
  });

  it('tanpa accountSection dan tanpa sesi: prompt tanpa seksi akun (perilaku lama)', async () => {
    const original = aiToolsProviderClient.execute.bind(aiToolsProviderClient);
    const captured: Array<Record<string, unknown>> = [];
    (aiToolsProviderClient as any).execute = async (req: Record<string, unknown>): Promise<AiToolsResult> => {
      captured.push(req);
      return { success: true, content: 'baik', structured: null, requestId: 'stub' };
    };
    try {
      const res = await ezrabAiService.send({
        messages: [{ role: 'user', content: 'Halo' }],
      });
      expect(res.success).toBe(true);
      expect(captured).toHaveLength(1);
      expect(String(captured[0].prompt)).not.toContain('AKUN & LANGGANAN');
    } finally {
      (aiToolsProviderClient as any).execute = original;
    }
  });
});
