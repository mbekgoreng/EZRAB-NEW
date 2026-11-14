/**
 * s8ServerCancellation.test.ts — §8 KANSELASI EKSEKUSI + HARDENING RUNTIME (ARS-08)
 * Program: EZRAB FINAL INTEGRITY REPAIR & RELEASE READINESS (follow-up P0–P6).
 *
 * Yang dibuktikan:
 *  S8-A `isCurrent()` false untuk record TERMINAL (lubang gerbang hasil
 *    terlambat: sebelumnya handle yang dibatalkan tetap "current" karena
 *    cancel tidak mengubah latest/superseded).
 *  S8-B Gerbang hasil terlambat: cancel → finish/emit no-op, result tidak
 *    tersimpan; perilaku transport waitForMinimum sesudah minimum berlalu
 *    (tidak melempar saat sinyal dibatalkan — alasan gerbang view harus
 *    memeriksa keaslian); view mencatat "Permintaan dibatalkan." pada
 *    cabang !isCurrent (pin sumber).
 *  S8-C `pruneStaleExecutions()`: supersede segar TIDAK disentuh (pin
 *    NAV-03/F6-L2/P5A-12 dipertahankan); supersede basi diinterupsi +
 *    sinyal di-abort; record terminal non-latest tanpa result dihapus;
 *    record latest, eksekusi aktif, dan record ber-`result` (pratinjau
 *    modal = "draft aktif") TIDAK PERNAH disentuh.
 *  S8-D Kanselasi server NYATA didukung transport + stack provider:
 *    executeAI dengan sinyal pre-aborted → 0 panggilan provider +
 *    CLIENT_DISCONNECTED; abort di tengah attempt → attempt berhenti +
 *    errorClass 'aborted' + selesai cepat; tanpa sinyal perilaku lama utuh.
 *    (0 panggilan provider nyata — fetch di-stub total.)
 *  S8-E Metering: gerbang MATI → bypass total (nol reservasi yang bisa
 *    dilepas); gerbang MENYALA tanpa boundary/konteks → fail-closed dan
 *    provider TIDAK dipanggil; dengan boundary nyata, hasil gagal
 *    (termasuk CLIENT_DISCONNECTED) → reservasi dilepas PENUH (RELEASED).
 *  S8-F Pin sumber: mekanisme disconnect gateway ada di kode; TIDAK ADA
 *    handler yang menyuntikkan meteringBoundary (reservasi tidak dapat
 *    ada di jalur produksi hari ini); service memeriksa abort sebelum
 *    fetch + tiap tool call; executionRuntime tidak mengimpor store
 *    draft/percakapan (prune tidak dapat menghapus draft).
 *
 * Pola runner/shim: JANGAN andalkan afterAll/afterEach/beforeAll (no-op
 * di shim). Reset runtime + pulihkan env/fetch lewat try/finally per tes.
 * Env/fetch dimutasi hanya di kelompok S8-D/S8-E dan dipulihkan di
 * finally masing-masing tes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  beginExecution,
  finishExecution,
  cancelExecution,
  emitExecutionStage,
  getExecution,
  getActiveExecution,
  getLastExecution,
  pruneStaleExecutions,
  EXECUTION_STALE_AFTER_MS,
  __resetExecutionRuntimeForTests,
} from '../ai-tools/ezrab-ai/executionRuntime';
import { waitForMinimum } from '../ai-tools/aiResponseTiming';
import { executeAI } from '../../api/_lib/aiGateway.js';
import {
  runChatFastWithMetering,
  CHAT_FAST_FEATURE_KEY,
} from '../../api/_lib/chatFastMetering.js';
import {
  createAiMeteringBoundary,
  AI_METERING_ENV_FLAG,
} from '../../api/_lib/aiMetering.js';
import { createCreditLedger, createMemoryLedgerStore } from '../../api/_lib/creditLedger.js';

const CONV = 'conv-s8';
const CONV_B = 'conv-s8-b';
const PROJ = 'proj-s8';
const read = (rel: string): string => readFileSync(`${process.cwd()}/${rel}`, 'utf-8');
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const FAR_FUTURE = (extra = 1000): number => Date.now() + EXECUTION_STALE_AFTER_MS + extra;

describe('S8-A — isCurrent() false untuk record terminal', () => {
  it('handle aktif adalah current', () => {
    __resetExecutionRuntimeForTests();
    const h = beginExecution(CONV, PROJ);
    expect(h.isCurrent()).toBe(true);
    expect(getActiveExecution(CONV)?.requestId).toBe(h.record.requestId);
  });

  it('LUBANG YANG DIPERBAIKI: handle yang dibatalkan BUKAN current', () => {
    __resetExecutionRuntimeForTests();
    const h = beginExecution(CONV, PROJ);
    expect(h.isCurrent()).toBe(true);
    cancelExecution(h.record.requestId);
    // Sebelum S8: true (cancel tidak mengubah latest/superseded) —
    // hasil terlambat lolos gerbang view.
    expect(h.isCurrent()).toBe(false);
    expect(getActiveExecution(CONV)).toBeNull();
  });

  it('handle yang sudah finish (completed/failed) BUKAN current', () => {
    __resetExecutionRuntimeForTests();
    const h1 = beginExecution('conv-s8-a1', PROJ);
    finishExecution(h1.record.requestId, 'completed');
    expect(h1.isCurrent()).toBe(false);
    const h2 = beginExecution('conv-s8-a2', PROJ);
    finishExecution(h2.record.requestId, 'failed', 'rusak');
    expect(h2.isCurrent()).toBe(false);
  });

  it('handle tersupersede BUKAN current; handle baru current (perilaku lama utuh)', () => {
    __resetExecutionRuntimeForTests();
    const h1 = beginExecution(CONV, PROJ);
    const h2 = beginExecution(CONV, PROJ);
    expect(h1.isCurrent()).toBe(false);
    expect(h2.isCurrent()).toBe(true);
    expect(getExecution(h1.record.requestId)?.superseded).toBe(true);
  });
});

describe('S8-B — gerbang hasil terlambat sesudah cancel', () => {
  it('cancel → finish terlambat no-op: status tetap cancelled, result TIDAK tersimpan', () => {
    __resetExecutionRuntimeForTests();
    const h = beginExecution(CONV, PROJ);
    cancelExecution(h.record.requestId);
    const late = finishExecution(h.record.requestId, 'completed', undefined, { item: 'x' });
    expect(late?.status).toBe('cancelled');
    expect(late?.result).toBeUndefined();
    expect(getExecution(h.record.requestId)?.result).toBeUndefined();
  });

  it('cancel → emisi tahap sesudahnya no-op; cancel kedua idempotent', () => {
    __resetExecutionRuntimeForTests();
    const h = beginExecution(CONV, PROJ);
    cancelExecution(h.record.requestId);
    expect(emitExecutionStage(h.record.requestId, 'validating')).toBeNull();
    expect(getExecution(h.record.requestId)?.stage).toBe('cancelled');
    const again = cancelExecution(h.record.requestId);
    expect(again?.status).toBe('cancelled');
  });

  it('transport: waitForMinimum sesudah minimum berlalu TIDAK melempar saat sinyal dibatalkan', async () => {
    // Jendela lubang S8-B: minimum 2–4 dtk sudah berlalu, provider masih
    // berjalan, pengguna menekan Berhenti. waitForMinimum mengembalikan
    // promise hasil apa adanya (tanpa cek sinyal) — fetch yang di-abort
    // membuat sendPromise resolve dengan error terstruktur, BUKAN throw.
    // Karena itu gerbang view (isCurrent) adalah satu-satunya penahan —
    // dan isCurrent yang true-sesudah-cancel adalah lubangnya.
    const ctl = new AbortController();
    const sendPromise = (async () => {
      await sleep(10);
      return { success: false, reply: 'Proses AI memakan waktu terlalu lama dan dibatalkan.' };
    })();
    ctl.abort();
    const startedAt = Date.now() - 10_000; // minimum sudah lama berlalu
    let threw = false;
    let out: unknown = null;
    try {
      out = await waitForMinimum(startedAt, 2000, sendPromise, ctl.signal);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect((out as { success: boolean }).success).toBe(false);
    // ...dan gerbang runtime kini menahannya: eksekusi yang dibatalkan
    // bukan current, sehingga view mengembalikan tanpa menulis apa pun.
    __resetExecutionRuntimeForTests();
    const h = beginExecution(CONV, PROJ);
    cancelExecution(h.record.requestId);
    expect(h.isCurrent()).toBe(false);
  });

  it('view: cabang !isCurrent mencatat penanda cancel (bukan pesan gagal); persist tetap sesudah cek', () => {
    const view = read('src/ai-tools/ezrab-ai/view.tsx');
    const submitSection = view.slice(view.indexOf('const sendPromise = ezrabAiService.send'));
    const idxCurrent = submitSection.indexOf('llmExec.isCurrent()');
    const idxPersist = submitSection.indexOf("persistMessage('assistant', res.reply)");
    expect(idxCurrent).not.toBe(-1);
    expect(idxPersist).toBeGreaterThan(idxCurrent);
    // S8: penanda cancel dipanggil DI DALAM cabang !isCurrent, sebelum
    // endExec/return — pembatalan eksplisit dicatat jujur, bukan diam
    // dan bukan pesan gagal.
    const branch = submitSection.slice(idxCurrent, idxPersist);
    expect(branch).toContain('noteCancelledIfNeeded()');
    expect(branch.indexOf('noteCancelledIfNeeded()')).toBeLessThan(branch.indexOf('endExec()'));
    expect(view).toContain('Permintaan dibatalkan.');
  });
});

describe('S8-C — pruneStaleExecutions: bersih-basi tanpa menyentuh yang sah', () => {
  it('supersede SEGAR tidak disentuh prune (pin NAV-03/F6-L2/P5A-12 dipertahankan)', () => {
    __resetExecutionRuntimeForTests();
    const a = beginExecution(CONV, PROJ);
    const b = beginExecution(CONV, PROJ);
    const report = pruneStaleExecutions();
    expect(report.interrupted).toEqual([]);
    expect(report.removed).toEqual([]);
    expect(getExecution(a.record.requestId)?.status).toBe('generating');
    expect(a.signal.aborted).toBe(false);
    expect(getExecution(a.record.requestId)?.superseded).toBe(true);
    // beginExecution ketiga juga tidak menginterupsi supersede segar.
    const c = beginExecution(CONV, PROJ);
    expect(a.signal.aborted).toBe(false);
    expect(getExecution(a.record.requestId)?.status).toBe('generating');
    expect(getExecution(b.record.requestId)?.status).toBe('generating');
    expect(c.isCurrent()).toBe(true);
  });

  it('supersede BASI diinterupsi: status interrupted + sinyal di-abort + tahap terakhir dipertahankan', () => {
    __resetExecutionRuntimeForTests();
    const a = beginExecution(CONV, PROJ);
    emitExecutionStage(a.record.requestId, 'contacting-model');
    const b = beginExecution(CONV, PROJ);
    const report = pruneStaleExecutions(undefined, FAR_FUTURE());
    expect(report.interrupted).toEqual([a.record.requestId]);
    const rec = getExecution(a.record.requestId);
    expect(rec?.status).toBe('interrupted');
    expect(rec?.superseded).toBe(true);
    expect(a.signal.aborted).toBe(true);
    // BUKAN 'cancelled': tidak ada pembatalan pengguna — view tidak boleh
    // menampilkan penanda "Permintaan dibatalkan." yang keliru.
    expect(rec?.status).not.toBe('cancelled');
    // Tahap terakhir yang nyata dipertahankan (tidak ada tahap 'interrupted').
    expect(rec?.stage).toBe('contacting-model');
    expect(rec?.completedAt).not.toBeNull();
    // Eksekusi baru tidak tersentuh.
    expect(b.isCurrent()).toBe(true);
    expect(getActiveExecution(CONV)?.requestId).toBe(b.record.requestId);
  });

  it('record yang diinterupsi bersifat terminal: finish/emit sesudahnya no-op', () => {
    __resetExecutionRuntimeForTests();
    const a = beginExecution(CONV, PROJ);
    beginExecution(CONV, PROJ);
    pruneStaleExecutions(undefined, FAR_FUTURE());
    const fin = finishExecution(a.record.requestId, 'completed', undefined, { item: 'x' });
    expect(fin?.status).toBe('interrupted');
    expect(fin?.result).toBeUndefined();
    expect(emitExecutionStage(a.record.requestId, 'validating')).toBeNull();
    expect(a.isCurrent()).toBe(false);
  });

  it('record terminal non-latest tanpa result dihapus; previous (PER-02) dipertahankan sampai gilirannya', () => {
    __resetExecutionRuntimeForTests();
    const a = beginExecution(CONV, PROJ);
    finishExecution(a.record.requestId, 'completed');
    const b = beginExecution(CONV, PROJ);
    // A masih ada saat B dimulai (previous dipertahankan — pin PER-02).
    expect(getExecution(a.record.requestId)).not.toBeNull();
    finishExecution(b.record.requestId, 'completed');
    const c = beginExecution(CONV, PROJ);
    // C dimulai → A (terminal, non-latest, tanpa result) dibersihkan.
    expect(getExecution(a.record.requestId)).toBeNull();
    expect(getExecution(b.record.requestId)).not.toBeNull();
    expect(c.isCurrent()).toBe(true);
  });

  it('record terminal latest TIDAK dihapus prune', () => {
    __resetExecutionRuntimeForTests();
    const a = beginExecution(CONV, PROJ);
    finishExecution(a.record.requestId, 'completed');
    const report = pruneStaleExecutions(undefined, FAR_FUTURE());
    expect(report.removed).toEqual([]);
    expect(getExecution(a.record.requestId)?.status).toBe('completed');
    expect(getLastExecution(CONV)?.requestId).toBe(a.record.requestId);
  });

  it('record ber-`result` (pratinjau modal = draft aktif) TIDAK PERNAH dihapus prune', () => {
    __resetExecutionRuntimeForTests();
    const key = `spreadsheet-modal:${PROJ}`;
    const h = beginExecution(key, PROJ);
    finishExecution(h.record.requestId, 'completed', undefined, { item: 'pratinjau-AI', prompt: 'p' });
    const h2 = beginExecution(key, PROJ);
    finishExecution(h2.record.requestId, 'completed');
    // Sapuan prune LANGSUNG: h adalah terminal non-latest BER-result →
    // prune mempertahankannya (aturan result di pass 2).
    // Catatan kejujuran: loop pembersih PRA-ADA di beginExecution
    // menghapus record terminal non-previous saat generasi ketiga
    // dimulai — termasuk record ber-result lama. Itu perilaku pra-ada
    // di luar prune dan tidak berdampak: modal hanya membaca latest
    // (getActiveExecution/getLastExecution), sehingga pratinjau aktif
    // tidak pernah hilang lewat jalur itu. Lihat LAPORAN-S8 §5.
    const report = pruneStaleExecutions(undefined, FAR_FUTURE());
    expect(report.removed).toEqual([]);
    expect(report.removed).not.toContain(h.record.requestId);
    const kept = getExecution(h.record.requestId);
    expect(kept).not.toBeNull();
    expect(kept?.result).toEqual({ item: 'pratinjau-AI', prompt: 'p' });
  });

  it('eksekusi aktif yang bukan superseded TIDAK PERNAH diinterupsi, betapa pun tuanya', () => {
    __resetExecutionRuntimeForTests();
    const a = beginExecution(CONV, PROJ);
    const report = pruneStaleExecutions(undefined, FAR_FUTURE(60_000));
    expect(report.interrupted).toEqual([]);
    expect(getExecution(a.record.requestId)?.status).toBe('generating');
    expect(a.signal.aborted).toBe(false);
    expect(a.isCurrent()).toBe(true);
  });

  it('prune per-percakapan hanya menyentuh percakapan itu; laporan berisi requestId persis', () => {
    __resetExecutionRuntimeForTests();
    const a1 = beginExecution(CONV, PROJ);
    beginExecution(CONV, PROJ);
    const b1 = beginExecution(CONV_B, PROJ);
    beginExecution(CONV_B, PROJ);
    const report = pruneStaleExecutions(CONV, FAR_FUTURE());
    expect(report.interrupted).toEqual([a1.record.requestId]);
    expect(getExecution(a1.record.requestId)?.status).toBe('interrupted');
    expect(getExecution(b1.record.requestId)?.status).toBe('generating');
    expect(b1.signal.aborted).toBe(false);
  });

  it('prune tidak menyentuh draft aktif: latest + pratinjau + pesan store utuh sesudah sapuan global', () => {
    __resetExecutionRuntimeForTests();
    // Draft aktif = latest record ber-result (modal) + eksekusi aktif lain.
    const key = `spreadsheet-modal:${PROJ}`;
    const modal = beginExecution(key, PROJ);
    finishExecution(modal.record.requestId, 'completed', undefined, { item: 'draft-aktif', prompt: 'p' });
    const chat = beginExecution(CONV, PROJ);
    const stale = beginExecution(CONV_B, PROJ);
    beginExecution(CONV_B, PROJ); // stale tersupersede
    const report = pruneStaleExecutions(undefined, FAR_FUTURE());
    expect(report.interrupted).toEqual([stale.record.requestId]);
    // Draft aktif utuh: pratinjau modal + eksekusi chat tidak tersentuh.
    expect(getExecution(modal.record.requestId)?.result).toEqual({ item: 'draft-aktif', prompt: 'p' });
    expect(getExecution(chat.record.requestId)?.status).toBe('generating');
    expect(chat.signal.aborted).toBe(false);
    expect(getActiveExecution(CONV)?.requestId).toBe(chat.record.requestId);
    // Struktural: executionRuntime TIDAK MEMILIKI impor sama sekali
    // (nol baris import) — ia tidak mengimpor store draft/percakapan
    // mana pun, sehingga prune tidak memiliki jalan untuk menghapus
    // draft. (Nama store hanya disebut di KOMENTAR dokumentasi.)
    const rt = read('src/ai-tools/ezrab-ai/executionRuntime.ts');
    const importLines = rt.split('\n').filter((l) => l.startsWith('import '));
    expect(importLines).toEqual([]);
  });
});

describe('S8-D — kanselasi server didukung stack provider (fetch stub, 0 provider nyata)', () => {
  const PROVIDER_KEY_RE = /^(GEMINI|CROWN|ATMO|ZYROUTER|ZROUTER|DAHL|RIVER|ATRIA|GEMINI_OAI|ARXPAY)/;
  function isolateProviderEnv(): () => void {
    const saved: Record<string, string | undefined> = {};
    for (const k of Object.keys(process.env)) {
      if (PROVIDER_KEY_RE.test(k)) {
        saved[k] = process.env[k];
        delete process.env[k];
      }
    }
    process.env.GEMINI_API_KEY_1 = 'dummy-s8-key';
    return () => {
      delete process.env.GEMINI_API_KEY_1;
      for (const [k, v] of Object.entries(saved)) {
        if (v !== undefined) process.env[k] = v;
      }
    };
  }
  function stubFetch(behavior: 'hang' | 'valid'): { calls: Array<{ url: string; aborted: boolean }> } {
    const calls: Array<{ url: string; aborted: boolean }> = [];
    const savedFetch = globalThis.fetch;
    (globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: unknown, init?: { signal?: AbortSignal }) => {
      const url = String(input);
      const rec = { url, aborted: false };
      calls.push(rec);
      const sig = init?.signal;
      if (sig && typeof sig.addEventListener === 'function') {
        sig.addEventListener('abort', () => { rec.aborted = true; }, { once: true });
      }
      if (behavior === 'hang') {
        return new Promise<never>((_resolve, reject) => {
          if (sig?.aborted) {
            const e = new Error('The operation was aborted');
            e.name = 'AbortError';
            reject(e);
            return;
          }
          sig?.addEventListener('abort', () => {
            const e = new Error('The operation was aborted');
            e.name = 'AbortError';
            reject(e);
          }, { once: true });
        });
      }
      return {
        ok: true,
        text: async () => '',
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'STUB-OK-S8' }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
        }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    (calls as unknown as { __restore: () => void }).__restore = () => {
      (globalThis as unknown as { fetch: typeof fetch }).fetch = savedFetch;
    };
    return calls;
  }
  const restoreFetch = (calls: { __restore?: () => void }): void => {
    calls.__restore?.();
  };

  it('sinyal pre-aborted → 0 panggilan provider + CLIENT_DISCONNECTED (leg-1 tidak dimulai)', async () => {
    const restoreEnv = isolateProviderEnv();
    const calls = stubFetch('hang');
    try {
      const ctl = new AbortController();
      ctl.abort();
      const r = await executeAI({ message: 'halo', mode: 'chat', signal: ctl.signal });
      expect(calls.length).toBe(0);
      expect(r.ok).toBe(false);
      expect((r as { errorCode?: string }).errorCode).toBe('CLIENT_DISCONNECTED');
      expect((r as { aborted?: boolean }).aborted).toBe(true);
      expect((r as { attempts: Array<{ provider: string; errorClass: string }> }).attempts).toHaveLength(1);
      expect((r as { attempts: Array<{ provider: string }> }).attempts[0].provider).toBe('gateway');
    } finally {
      restoreFetch(calls);
      restoreEnv();
    }
  });

  it('abort di tengah attempt → fetch di-abort + leg berikutnya tidak dimulai + selesai cepat', async () => {
    const restoreEnv = isolateProviderEnv();
    const calls = stubFetch('hang');
    try {
      const ctl = new AbortController();
      const p = executeAI({ message: 'halo', mode: 'chat', signal: ctl.signal });
      for (let i = 0; i < 200 && calls.length === 0; i++) await sleep(25);
      expect(calls.length).toBe(1);
      const t0 = Date.now();
      ctl.abort();
      const r = await p;
      const elapsed = Date.now() - t0;
      expect(calls.length).toBe(1);
      expect(calls[0].aborted).toBe(true);
      expect((r as { attempts: Array<{ errorClass: string }> }).attempts[0].errorClass).toBe('aborted');
      expect((r as { errorCode?: string }).errorCode).toBe('CLIENT_DISCONNECTED');
      expect(elapsed).toBeLessThan(8000);
    } finally {
      restoreFetch(calls);
      restoreEnv();
    }
  });

  it('tanpa sinyal: perilaku lama utuh (sukses leg Gemini, tanpa abort)', async () => {
    const restoreEnv = isolateProviderEnv();
    const calls = stubFetch('valid');
    try {
      const r = await executeAI({ message: 'halo', mode: 'chat' });
      expect(r.ok).toBe(true);
      expect((r as { provider?: string }).provider).toBe('gemini');
      expect((r as { content?: string }).content).toBe('STUB-OK-S8');
      expect(calls.length).toBe(1);
      expect(calls[0].aborted).toBe(false);
    } finally {
      restoreFetch(calls);
      restoreEnv();
    }
  });
});

describe('S8-E — metering: tanpa reservasi saat gerbang mati; lepas-penuh saat gagal', () => {
  const T0 = 1_700_000_000_000;
  const DAY = 24 * 3600 * 1000;
  const CTX = { accountId: 'acct-s8-1', workspaceId: 'ws-s8', userId: 'user-s8' };
  const ON = { [AI_METERING_ENV_FLAG]: 'true' };
  const OFF = { [AI_METERING_ENV_FLAG]: 'false' };
  function freshOn() {
    const store = createMemoryLedgerStore();
    const ledger = createCreditLedger(store);
    ledger.grantSubscription({
      accountId: CTX.accountId, amount: 5000, periodStart: T0, periodEnd: T0 + 30 * DAY,
      idempotencyKey: `sub-${CTX.accountId}`, now: T0,
    });
    const boundary = createAiMeteringBoundary({ ledger, env: ON, now: () => T0 });
    return { store, ledger, boundary };
  }

  it('gerbang MATI → bypass total: boundary tidak dipanggil, nol reservasi', async () => {
    let boundaryCalls = 0;
    const throwingBoundary = {
      runMeteredOperation(): never {
        boundaryCalls += 1;
        throw new Error('boundary TIDAK boleh dipanggil saat gerbang mati');
      },
    };
    let execCalls = 0;
    const out = await runChatFastWithMetering({
      mode: 'chat',
      productId: 'EZRAB_AI',
      env: OFF,
      context: CTX,
      boundary: throwingBoundary,
      requestId: 'req-s8-off',
      message: 'halo',
      systemPrompt: '',
      execute: async () => {
        execCalls += 1;
        return { ok: true, content: 'x', provider: 'gemini', model: 'm' };
      },
    });
    expect((out as { metered: boolean }).metered).toBe(false);
    expect((out as { bypassed?: boolean }).bypassed).toBe(true);
    expect(boundaryCalls).toBe(0);
    expect(execCalls).toBe(1);
  });

  it('gerbang MENYALA tanpa boundary → fail-closed, provider TIDAK dipanggil', async () => {
    let execCalls = 0;
    const out = await runChatFastWithMetering({
      mode: 'chat',
      productId: 'EZRAB_AI',
      env: ON,
      context: CTX,
      boundary: null,
      requestId: 'req-s8-noboundary',
      message: 'halo',
      systemPrompt: '',
      execute: async () => {
        execCalls += 1;
        return { ok: true, content: 'x' };
      },
    });
    expect((out as { metered: boolean }).metered).toBe(true);
    expect((out as { ok: boolean }).ok).toBe(false);
    expect((out as { error?: string }).error).toBe('METERING_BOUNDARY_UNAVAILABLE');
    expect(execCalls).toBe(0);
  });

  it('gerbang MENYALA tanpa konteks tepercaya → fail-closed AUTH_CONTEXT_REQUIRED', async () => {
    const { boundary } = freshOn();
    let execCalls = 0;
    const out = await runChatFastWithMetering({
      mode: 'chat',
      productId: 'EZRAB_AI',
      env: ON,
      context: null,
      boundary,
      requestId: 'req-s8-noctx',
      message: 'halo',
      systemPrompt: '',
      execute: async () => {
        execCalls += 1;
        return { ok: true, content: 'x' };
      },
    });
    expect((out as { error?: string }).error).toBe('AUTH_CONTEXT_REQUIRED');
    expect(execCalls).toBe(0);
  });

  it('dengan boundary nyata: hasil gagal (CLIENT_DISCONNECTED) → reservasi dilepas PENUH (RELEASED)', async () => {
    const { ledger, boundary } = freshOn();
    const before = ledger.getBalance(CTX.accountId, T0);
    expect(before.reserved).toBe(0);
    const failedGatewayResult = {
      ok: false, error: 'Client disconnected', errorCode: 'CLIENT_DISCONNECTED',
      aborted: true, requestId: 'req-s8-disc', attempts: [],
    };
    const out = await runChatFastWithMetering({
      mode: 'chat',
      productId: 'EZRAB_AI',
      env: ON,
      context: CTX,
      boundary,
      requestId: 'req-s8-disc',
      message: 'halo, ini pesan yang dibatalkan di tengah jalan',
      systemPrompt: '',
      execute: async () => failedGatewayResult,
    });
    expect((out as { metered: boolean }).metered).toBe(true);
    expect((out as { ok: boolean }).ok).toBe(false);
    expect((out as { status?: string }).status).toBe('RELEASED');
    expect((out as { result?: unknown }).result).toBe(failedGatewayResult);
    const rec = boundary.findByIdempotencyKey(CTX.accountId, 'chatfast-req-s8-disc');
    expect(rec?.status).toBe('RELEASED');
    const after = ledger.getBalance(CTX.accountId, T0);
    expect(after.reserved).toBe(0);
    expect(after.total).toBe(before.total);
  });
});

describe('S8-F — pin sumber: mekanisme kanselasi + pagar metering + cek abort service', () => {
  it('gateway: pengamat disconnect + propagasi sinyal + CLIENT_DISCONNECTED ada di kode', () => {
    const gw = read('api/_lib/aiGateway.js');
    expect(gw).toContain("res.on('close'");
    expect(gw).toContain('!res.writableFinished');
    expect(gw).toContain('linkExternalAbort');
    expect(gw).toContain('signal: disconnectCtl.signal');
    expect(gw).toContain('CLIENT_DISCONNECTED');
    expect(gw).toContain("event: 'client_disconnected'");
  });

  it('TIDAK ADA handler yang menyuntikkan meteringBoundary/konteks → reservasi tidak dapat ada di jalur produksi', () => {
    for (const f of ['api/ai/chat.js', 'api/ai/tools/execute.js', 'api/ai/multi-provider/execute.js']) {
      const src = read(f);
      expect(src).not.toContain('meteringBoundary');
      expect(src).not.toContain('meteringContext');
    }
    expect(CHAT_FAST_FEATURE_KEY).toBe('chat-ai/fast');
  });

  it('service: throwIfAborted sebelum fetch dan sebelum tiap tool call', () => {
    const svc = read('src/ai-tools/ezrab-ai/service.ts');
    const hits = svc.split('throwIfAborted()').length - 1;
    expect(hits).toBeGreaterThanOrEqual(2);
    expect(svc).toContain('signal: request.signal');
  });

  it('transport klien: satu fetch non-streaming + json utuh (tanpa SSE ke klien)', () => {
    const pc = read('src/ai-tools/providerClient.ts');
    expect(pc).toContain("fetch('/api/ai/tools/execute'");
    expect(pc).toContain('resp.json()');
    const gw = read('api/_lib/aiGateway.js');
    expect(gw).toContain('stream: false');
  });

  it('tidak ada endpoint kanselasi eksplisit berbasis request-id (kanselasi = disconnect TCP)', () => {
    // Pin kejujuran: tidak ada rute /api/ai/cancel (atau sejenis) di repo —
    // kanselasi server HANYA lewat disconnect, bukan perintah eksplisit.
    const chatJs = read('api/ai/chat.js');
    const execJs = read('api/ai/tools/execute.js');
    expect(chatJs).not.toContain('cancel');
    expect(execJs).not.toContain('cancel');
    const gw = read('api/_lib/aiGateway.js');
    // Gateway mengenal 'cancel' hanya sebagai kata 'cancelled' pada status
    // internal, bukan sebagai endpoint/perintah klien.
    expect(gw).not.toContain('/cancel');
  });
});
