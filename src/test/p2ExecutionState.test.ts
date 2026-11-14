/**
 * P2 FULL REPAIR (2026-11-13) — state eksekusi nyata + pembatalan yang berfungsi.
 *
 * Yang dibuktikan (tanpa provider berbayar — semua tes memakai stub):
 *  (a) tahap eksekusi berubah mengikuti EVENT NYATA (bukan timer/label
 *      statis): runtime preparing → calculating → validating →
 *      awaiting-review, dan service memancarkan preparing →
 *      contacting-model → tahap-per-tool-call dari kirim deterministik
 *      lokal (provider di-stub);
 *  (b) pembatalan menghentikan langkah berikutnya dan tidak ada tulis
 *      sesudah cancel (loop tool melempar AbortError; finish sesudah
 *      cancel adalah no-op; gerbang commit modal menolak hasil basi);
 *  (c) satu klik kirim = satu eksekusi (klaim modal kedua ditolak;
 *      beginExecution kedua men-supersede yang pertama);
 *  (d) AbortSignal diteruskan ke client.execute di modal + tombol Stop
 *      memanggil abort (asersi sumber pada call site + perilaku
 *      cancelExecution pada runtime yang sama);
 *  (e) state eksekusi modal bertahan melintasi simulasi navigasi SPA
 *      (unsubscribe/remount tanpa abort; hasil tersimpan dibaca lagi);
 *  (f) hasil terlambat sesudah cancel diabaikan (tidak tersimpan,
 *      tidak di-commit).
 *
 * Pola runner/shim: JANGAN andalkan afterAll/afterEach (no-op di shim)
 * — stub provider dipulihkan di try/finally per tes; runtime di-reset
 * lewat beforeEach.
 *
 * Jalankan: npx --yes tsx src/test/__runner.mjs x "src/test/p2ExecutionState.test.ts"
 * (dengan shim vitest sementara, pola run-targeted.sh G1–G3).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  beginExecution,
  finishExecution,
  cancelExecution,
  getActiveExecution,
  getLastExecution,
  getExecution,
  subscribeExecution,
  emitExecutionStage,
  EXECUTION_STAGE_LABELS,
  __resetExecutionRuntimeForTests,
  type AiExecutionRecord,
} from '../ai-tools/ezrab-ai/executionRuntime';
import { ezrabAiService, stageForToolCall } from '../ai-tools/ezrab-ai/service';
import { aiToolsProviderClient, type AiToolsResult } from '../ai-tools/providerClient';
import {
  spreadsheetModalExecutionKey,
  claimSpreadsheetModalExecution,
  shouldCommitModalAiResult,
  mapAiGeneratedItem,
  type SpreadsheetModalAiResult,
} from '../components/estimator/SmartAddWorkItemModal';

const read = (rel: string): string => readFileSync(`${process.cwd()}/${rel}`, 'utf-8');

beforeEach(() => {
  __resetExecutionRuntimeForTests();
});

// --- Stub provider (pola chatCalcDeterministic): ganti execute, pulihkan
// di finally per tes — JANGAN andalkan afterAll (no-op di shim). ---
const originalExecute = aiToolsProviderClient.execute.bind(aiToolsProviderClient);
function restoreExecute(): void {
  (aiToolsProviderClient as any).execute = originalExecute;
}

const CONV = 'conv-p2-123';
const PROJ = 'PRJ-P2-01';

describe('P2-A — tahap eksekusi runtime mengikuti event nyata', () => {
  it('beginExecution mulai dari preparing dengan histori [preparing]', () => {
    const h = beginExecution(CONV, PROJ);
    expect(h.record.stage).toBe('preparing');
    expect(h.record.stageHistory).toHaveLength(1);
    expect(h.record.stageHistory[0].stage).toBe('preparing');
    expect(h.record.status).toBe('generating');
  });

  it('menyiapkan → menghitung → memvalidasi → menunggu review (alur deterministik lokal)', () => {
    const h = beginExecution(CONV, PROJ);
    emitExecutionStage(h.record.requestId, 'calculating-quantities');
    emitExecutionStage(h.record.requestId, 'validating');
    emitExecutionStage(h.record.requestId, 'awaiting-review');
    const rec = getExecution(h.record.requestId);
    expect(rec?.stage).toBe('awaiting-review');
    expect(rec?.stageHistory.map((e) => e.stage)).toEqual([
      'preparing',
      'calculating-quantities',
      'validating',
      'awaiting-review',
    ]);
    // finish 'completed' mempertahankan awaiting-review (hasil masih
    // menunggu keputusan pengguna — bukan 'completed' yang menutupnya).
    const done = finishExecution(h.record.requestId, 'completed');
    expect(done?.status).toBe('completed');
    expect(done?.stage).toBe('awaiting-review');
  });

  it('emisi tahap yang sama dua kali tidak menduplikasi histori', () => {
    const h = beginExecution(CONV, PROJ);
    emitExecutionStage(h.record.requestId, 'contacting-model');
    emitExecutionStage(h.record.requestId, 'contacting-model');
    const rec = getExecution(h.record.requestId);
    expect(rec?.stageHistory.map((e) => e.stage)).toEqual(['preparing', 'contacting-model']);
  });

  it('emisi sesudah finish/cancel adalah no-op (tidak ada tahap sesudah terminal)', () => {
    const h1 = beginExecution('conv-a', PROJ);
    finishExecution(h1.record.requestId, 'completed');
    expect(emitExecutionStage(h1.record.requestId, 'validating')).toBeNull();
    expect(getExecution(h1.record.requestId)?.stage).toBe('completed');

    const h2 = beginExecution('conv-b', PROJ);
    cancelExecution(h2.record.requestId);
    expect(emitExecutionStage(h2.record.requestId, 'validating')).toBeNull();
    expect(getExecution(h2.record.requestId)?.stage).toBe('cancelled');
  });

  it('cancel → status cancelled + tahap cancelled + signal aborted; finish sesudahnya no-op', () => {
    const h = beginExecution(CONV, PROJ);
    const out = cancelExecution(h.record.requestId);
    expect(out?.status).toBe('cancelled');
    expect(out?.stage).toBe('cancelled');
    expect(h.signal.aborted).toBe(true);
    const again = finishExecution(h.record.requestId, 'completed', undefined, { item: 'x' });
    expect(again?.status).toBe('cancelled');
    expect(again?.result).toBeUndefined();
  });

  it('finish failed → tahap failed; label setiap tahap terdefinisi (tanpa persen)', () => {
    const h = beginExecution(CONV, PROJ);
    const out = finishExecution(h.record.requestId, 'failed', 'rusak');
    expect(out?.stage).toBe('failed');
    for (const label of Object.values(EXECUTION_STAGE_LABELS)) {
      expect(label).not.toContain('%');
    }
    expect(EXECUTION_STAGE_LABELS['calculating-quantities']).toBe('Menghitung kuantitas…');
  });

  it('langganan remount menerima record terkini (tahap selamat dari unmount)', () => {
    const h = beginExecution(CONV, PROJ);
    const seen1: Array<AiExecutionRecord | null> = [];
    const unsub1 = subscribeExecution(CONV, (r) => seen1.push(r));
    emitExecutionStage(h.record.requestId, 'contacting-model');
    expect(seen1[seen1.length - 1]?.stage).toBe('contacting-model');
    // Simulasi unmount: unsubscribe SAJA — tidak meng-abort eksekusi.
    unsub1();
    expect(getActiveExecution(CONV)?.status).toBe('generating');
    // Simulasi remount: langganan baru langsung menerima keadaan terkini.
    const seen2: Array<AiExecutionRecord | null> = [];
    const unsub2 = subscribeExecution(CONV, (r) => seen2.push(r));
    expect(seen2).toHaveLength(1);
    expect(seen2[0]?.stage).toBe('contacting-model');
    expect(seen2[0]?.requestId).toBe(h.record.requestId);
    unsub2();
  });
});

describe('P2-B — satu kirim = satu eksekusi (tanpa duplikasi)', () => {
  it('beginExecution kedua men-supersede yang pertama; hanya terbaru yang current', () => {
    const h1 = beginExecution(CONV, PROJ);
    const h2 = beginExecution(CONV, PROJ);
    expect(h1.isCurrent()).toBe(false);
    expect(h2.isCurrent()).toBe(true);
    expect(getActiveExecution(CONV)?.requestId).toBe(h2.record.requestId);
    expect(getExecution(h1.record.requestId)?.superseded).toBe(true);
    // Eksekusi lama tidak boleh lagi memancarkan tahap.
    expect(emitExecutionStage(h1.record.requestId, 'validating')).toBeNull();
  });
});

describe('P2-C — pemetaan tool call → tahap', () => {
  it('tool bernama dipetakan ke tahap spesifik; tool lain ke running-tools', () => {
    expect(stageForToolCall('cari_ahsp')).toBe('mapping-ahsp');
    expect(stageForToolCall('cari_harga')).toBe('checking-prices');
    expect(stageForToolCall('hitung_qto')).toBe('calculating-quantities');
    expect(stageForToolCall('volume_persegi')).toBe('calculating-quantities');
    expect(stageForToolCall('luas_dinding')).toBe('calculating-quantities');
    expect(stageForToolCall('subtotal')).toBe('calculating-quantities');
    expect(stageForToolCall('persentase_level')).toBe('calculating-quantities');
    expect(stageForToolCall('cari_template_rab')).toBe('identifying-items');
    expect(stageForToolCall('get_project_total')).toBe('running-tools');
    expect(stageForToolCall('propose_add_item')).toBe('running-tools');
    expect(stageForToolCall('tool_tidak_ada')).toBe('running-tools');
  });
});

describe('P2-D — service.send memancarkan tahap dari event nyata (provider stub)', () => {
  it('jawaban teks biasa: preparing → contacting-model (tanpa tahap karangan)', async () => {
    (aiToolsProviderClient as any).execute = async (): Promise<AiToolsResult> =>
      ({ success: true, content: 'baik', structured: null, requestId: 'stub-1' });
    try {
      const stages: string[] = [];
      const res = await ezrabAiService.send({
        messages: [{ role: 'user', content: 'halo' }],
        onStage: (s: string) => stages.push(s),
      } as any);
      expect(res.success).toBe(true);
      expect(res.reply).toBe('baik');
      expect(stages).toEqual(['preparing', 'contacting-model']);
    } finally {
      restoreExecute();
    }
  });

  it('seksi DED ikut: reading-documents dipancarkan sesudah preparing', async () => {
    (aiToolsProviderClient as any).execute = async (): Promise<AiToolsResult> =>
      ({ success: true, content: 'baik', structured: null, requestId: 'stub-2' });
    try {
      const stages: string[] = [];
      await ezrabAiService.send({
        messages: [{ role: 'user', content: 'hitung dari DED ini' }],
        dedSection: 'DED: denah rumah 36 m2',
        onStage: (s: string) => stages.push(s),
      } as any);
      expect(stages).toEqual(['preparing', 'reading-documents', 'contacting-model']);
    } finally {
      restoreExecute();
    }
  });

  it('tool call dieksekusi: tahap per tool mengikuti nama tool (hitung → AHSP)', async () => {
    (aiToolsProviderClient as any).execute = async (): Promise<AiToolsResult> => ({
      success: true,
      content:
        '{"tool": "persentase_level", "args": {"kenaikan": 1, "jarak": 10}}\n' +
        '{"tool": "cari_ahsp", "args": {"kata_kunci": "beton"}}',
      structured: null,
      requestId: 'stub-3',
    });
    try {
      const stages: string[] = [];
      const res = await ezrabAiService.send({
        messages: [{ role: 'user', content: 'hitung level dan cari AHSP beton' }],
        onStage: (s: string) => stages.push(s),
      } as any);
      expect(res.success).toBe(true);
      expect(res.toolCalls).toHaveLength(2);
      expect(stages).toEqual([
        'preparing',
        'contacting-model',
        'calculating-quantities',
        'mapping-ahsp',
      ]);
      // Jawaban = output tool deterministik (bukan teks mentah model).
      expect(res.reply).toContain('Level =');
    } finally {
      restoreExecute();
    }
  });

  it('sinyal sudah aborted sebelum kirim → AbortError TANPA memanggil provider', async () => {
    let calls = 0;
    (aiToolsProviderClient as any).execute = async (): Promise<AiToolsResult> => {
      calls += 1;
      return { success: true, content: 'baik', structured: null, requestId: 'stub-4' };
    };
    try {
      const controller = new AbortController();
      controller.abort();
      let caught: any = null;
      try {
        await ezrabAiService.send({
          messages: [{ role: 'user', content: 'halo' }],
          signal: controller.signal,
        } as any);
      } catch (e: any) {
        caught = e;
      }
      expect(caught).not.toBeNull();
      expect(caught?.name).toBe('AbortError');
      expect(calls).toBe(0);
    } finally {
      restoreExecute();
    }
  });

  it('abort tiba sesudah provider merespons → loop tool berhenti (tidak ada tool dieksekusi)', async () => {
    let calls = 0;
    const controller = new AbortController();
    // Deterministik: stub meng-abort controller (closure) sebelum
    // resolve — meniru pengguna menekan Berhenti di jendela antara
    // fetch selesai dan loop tool dimulai.
    (aiToolsProviderClient as any).execute = async (): Promise<AiToolsResult> => {
      calls += 1;
      controller.abort();
      return {
        success: true,
        content: '{"tool": "persentase_level", "args": {"kenaikan": 1, "jarak": 10}}',
        structured: null,
        requestId: 'stub-5',
      };
    };
    try {
      let caught: any = null;
      try {
        await ezrabAiService.send({
          messages: [{ role: 'user', content: 'hitung level' }],
          signal: controller.signal,
        } as any);
      } catch (e: any) {
        caught = e;
      }
      expect(calls).toBe(1);
      expect(caught).not.toBeNull();
      expect(caught?.name).toBe('AbortError');
    } finally {
      restoreExecute();
    }
  });

  it('kunci idempotensi pemanggil diteruskan apa adanya ke provider (retry aman)', async () => {
    const seen: string[] = [];
    (aiToolsProviderClient as any).execute = async (req: any): Promise<AiToolsResult> => {
      seen.push(req?.idempotencyKey ?? '');
      return { success: true, content: 'baik', structured: null, requestId: 'stub-6' };
    };
    try {
      await ezrabAiService.send({
        messages: [{ role: 'user', content: 'halo' }],
        idempotencyKey: 'kunci-p2-123',
      } as any);
      expect(seen).toEqual(['kunci-p2-123']);
    } finally {
      restoreExecute();
    }
  });
});

describe('P2-E — eksekusi AI modal di runtime (klaim, commit, remount, hasil terlambat)', () => {
  it('kunci modal stabil per proyek dan berbeda antar proyek', () => {
    expect(spreadsheetModalExecutionKey(PROJ)).toBe(spreadsheetModalExecutionKey(PROJ));
    expect(spreadsheetModalExecutionKey(PROJ)).not.toBe(spreadsheetModalExecutionKey('PRJ-LAIN'));
    expect(spreadsheetModalExecutionKey(null)).toBe('spreadsheet-modal:__global__');
  });

  it('klaim kedua saat generasi berjalan ditolak (klik ganda tidak menduplikasi)', () => {
    const first = claimSpreadsheetModalExecution(PROJ);
    expect(first).not.toBeNull();
    expect(claimSpreadsheetModalExecution(PROJ)).toBeNull();
    expect(getActiveExecution(spreadsheetModalExecutionKey(PROJ))?.requestId)
      .toBe(first?.record.requestId);
    // Sesudah cancel, klaim baru diizinkan lagi (retry aman).
    cancelExecution(first!.record.requestId);
    const retry = claimSpreadsheetModalExecution(PROJ);
    expect(retry).not.toBeNull();
    expect(retry?.record.requestId).not.toBe(first?.record.requestId);
  });

  it('gerbang commit: aktif → true; sesudah cancel → false; sesudah supersede → false', () => {
    const h = claimSpreadsheetModalExecution(PROJ);
    expect(h).not.toBeNull();
    expect(shouldCommitModalAiResult(h!)).toBe(true);
    cancelExecution(h!.record.requestId);
    expect(shouldCommitModalAiResult(h!)).toBe(false);

    const h2 = claimSpreadsheetModalExecution(PROJ);
    expect(shouldCommitModalAiResult(h2!)).toBe(true);
    // Supersede paksa (jalur pertahanan — klaim normal mencegahnya):
    beginExecution(spreadsheetModalExecutionKey(PROJ), PROJ);
    expect(shouldCommitModalAiResult(h2!)).toBe(false);
  });

  it('hasil modal tersimpan di record dan bertahan melintasi simulasi tutup-buka modal', () => {
    const key = spreadsheetModalExecutionKey(PROJ);
    const h = claimSpreadsheetModalExecution(PROJ);
    expect(h).not.toBeNull();
    emitExecutionStage(h!.record.requestId, 'contacting-model');
    // Simulasi unmount di tengah generasi: unsubscribe tanpa abort.
    const seen: Array<AiExecutionRecord | null> = [];
    const unsub = subscribeExecution(key, (r) => seen.push(r));
    unsub();
    expect(getActiveExecution(key)?.stage).toBe('contacting-model');
    // Simulasi remount: langganan baru menerima keadaan terkini.
    const seen2: Array<AiExecutionRecord | null> = [];
    const unsub2 = subscribeExecution(key, (r) => seen2.push(r));
    expect(seen2[0]?.stage).toBe('contacting-model');
    unsub2();
    // Generasi selesai: hasil tersimpan di record runtime.
    const item = mapAiGeneratedItem(
      { description: 'Waterproofing kamar mandi', volume: 12, unit: 'm²', unitPrice: null },
      { fallbackDescription: 'waterproofing', category: 'Pekerjaan Waterproofing', code: 'AI.01' },
    );
    const result: SpreadsheetModalAiResult = { item, prompt: 'waterproofing kamar mandi 12 m2' };
    emitExecutionStage(h!.record.requestId, 'awaiting-review');
    finishExecution(h!.record.requestId, 'completed', undefined, result);
    // Simulasi buka modal lagi: record terakhir membawa hasil + tahap.
    const last = getLastExecution(key);
    expect(last?.status).toBe('completed');
    expect(last?.stage).toBe('awaiting-review');
    expect((last?.result as SpreadsheetModalAiResult)?.item.description)
      .toBe('Waterproofing kamar mandi');
    expect((last?.result as SpreadsheetModalAiResult)?.prompt)
      .toBe('waterproofing kamar mandi 12 m2');
  });

  it('hasil terlambat sesudah cancel TIDAK tersimpan dan TIDAK di-commit', () => {
    const h = claimSpreadsheetModalExecution(PROJ);
    expect(h).not.toBeNull();
    cancelExecution(h!.record.requestId);
    // Upaya finish terlambat (fetch basi yang akhirnya resolve):
    const out = finishExecution(h!.record.requestId, 'completed', undefined, {
      item: { description: 'BASI' },
      prompt: 'basi',
    });
    expect(out?.status).toBe('cancelled');
    expect(out?.result).toBeUndefined();
    expect(shouldCommitModalAiResult(h!)).toBe(false);
    expect(getLastExecution(spreadsheetModalExecutionKey(PROJ))?.result).toBeUndefined();
  });
});

describe('P2-F — wiring sumber (view + modal)', () => {
  it('view: onStage diteruskan ke service; validating + awaiting-review dipancarkan; label tahap tampil', () => {
    const view = read('src/ai-tools/ezrab-ai/view.tsx');
    // Pin diperbarui verifikator akhir 2026-11-13: handle tidak punya
    // properti requestId langsung (hanya record.requestId) — pin lama
    // mengunci kode yang meneruskan undefined ke emitExecutionStage.
    expect(view).toContain('onStage: (stage: ExecutionStage) => { emitExecutionStage(llmExec.record.requestId, stage); }');
    expect(view).toContain("emitExecutionStage(llmExec.record.requestId, 'validating')");
    expect(view).toContain("emitExecutionStage(llmExec.record.requestId, 'awaiting-review')");
    // Pin diperbarui S9 (2026-11-13, §9 butir 5): label tahap kini
    // diturunkan dari LOG EVENT lewat reportedExecutionStage
    // (reportedActiveStage), bukan dari field `stage` mentah — pin lama
    // 'EXECUTION_STAGE_LABELS[activeExec.stage]' mengunci pembacaan
    // langsung yang sengaja diganti penurun deterministik dari event.
    // Perilaku yang dipin SAMA (label tahap nyata tampil di gelembung
    // thinking; untuk record nyata reported === stage — dipin S9-5);
    // yang berubah hanya sumber turunannya, kini terbukti dari event.
    expect(view).toContain('reportedExecutionStage(activeExec)');
    expect(view).toContain('EXECUTION_STAGE_LABELS[reportedActiveStage]');
    // Logika transfer/approval G1 tidak tersentuh P2 (pin literal).
    expect(view).toContain('checkTransferApprovalBinding');
  });

  it('modal: AbortSignal + idempotencyKey ke client.execute; Stop meng-abort; klaim + gerbang commit dipakai', () => {
    const modal = read('src/components/estimator/SmartAddWorkItemModal.tsx');
    expect(modal).toContain('signal: handle.signal');
    expect(modal).toContain('idempotencyKey: handle.record.idempotencyKey');
    expect(modal).toContain('const handleStopAiGeneration = () => {');
    expect(modal).toContain('cancelExecution(rec.requestId)');
    expect(modal).toContain('claimSpreadsheetModalExecution(currentProjectId ?? null)');
    expect(modal).toContain('shouldCommitModalAiResult(handle)');
    expect(modal).toContain('subscribeExecution(modalKey, () => {');
    expect(modal).toContain('getLastExecution(modalKey)');
    // Handoff P0 + label P1 + konteks G3 tidak tersentuh P2 (pin literal).
    expect(modal).toContain('handleHandoffToChatAi');
    expect(modal).toContain('buildAiSuggestedRabItem');
    expect(modal).toContain('buildSpreadsheetProjectContext');
  });
});
