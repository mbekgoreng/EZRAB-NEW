/**
 * P0 FULL REPAIR (2026-11-13) — handoff spreadsheet → Chat AI.
 *
 * Menguji `src/ai-tools/ezrab-ai/spreadsheetHandoff.ts` + wiring-nya:
 *  (a) payload memuat projectId + conversationId + spesifikasi (prompt)
 *      + item proyek (konteks G3) + draftId (bila ada);
 *  (b) batas G3 dihormati (≤8 item, ≤2.000 karakter, pemotongan
 *      berpenanda);
 *  (c) projectId lintas-proyek ditolak;
 *  (d) alur satu-item lama tetap bekerja sebagai fallback;
 *  (e) satu klik = satu handoff (tanpa eksekusi ganda);
 *  (f) round-trip entry kanonis lewat openEzrabAI (mode rab-generator,
 *      prefill — bukan autosend, sekali-pakai).
 *
 * Pola runner/shim: JANGAN andalkan afterAll/afterEach (no-op di shim)
 * untuk pemulihan — reset entry lewat beforeEach.
 *
 * Jalankan: npx --yes tsx src/test/__runner.mjs x "src/test/p0SpreadsheetHandoff.test.ts"
 * (dengan shim vitest sementara, pola run-targeted.sh G1–G3).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import {
  buildSpreadsheetHandoffPayload,
  boundSpreadsheetHandoffContext,
  createSpreadsheetHandoffGuard,
  executeSpreadsheetHandoff,
  spreadsheetHandoffKey,
  SPREADSHEET_HANDOFF_MAX_RELEVANT_ITEMS,
  SPREADSHEET_HANDOFF_MAX_CHARS,
  SPREADSHEET_HANDOFF_TRUNCATION_MARKER,
  SPREADSHEET_HANDOFF_GUARD_TTL_MS,
  type SpreadsheetHandoffPayload,
} from '../ai-tools/ezrab-ai/spreadsheetHandoff';
import {
  buildSpreadsheetProjectContext,
  mapAiGeneratedItem,
  SPREADSHEET_CONTEXT_MAX_RELEVANT_ITEMS,
  SPREADSHEET_CONTEXT_MAX_CHARS,
  SPREADSHEET_CONTEXT_TRUNCATION_MARKER,
} from '../components/estimator/SmartAddWorkItemModal';
import {
  consumePendingAiEntry,
  consumePendingEzrabAiEntry,
  clearPendingAiEntry,
  clearPendingEzrabAiEntry,
} from '../ai-tools/aiNavigation';

// Mock window untuk navigateTo + event (pola aiUnification.test.ts).
let lastUrl = '';
const dispatched: string[] = [];
(global as any).window = {
  history: {
    pushState: (_s: unknown, _t: string, url: string) => { lastUrl = url; },
    replaceState: (_s: unknown, _t: string, url: string) => { lastUrl = url; },
  },
  dispatchEvent: (e: { type?: string }) => { dispatched.push(e?.type ?? 'event'); return true; },
  addEventListener: () => {},
  removeEventListener: () => {},
};

beforeEach(() => {
  clearPendingAiEntry();
  clearPendingEzrabAiEntry();
  dispatched.length = 0;
  lastUrl = '';
});

const PROJ = 'PRJ-DEMO-PREMIUM-01';
const CONV = 'conv-aktif-123';
const PROMPT = 'Tambahkan waterproofing kamar mandi 12 m2';

function relevantItems(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    code: `WP.${String(i + 1).padStart(2, '0')}`,
    description: `Waterproofing kamar mandi lantai ${i + 1}`,
    category: 'Pekerjaan Waterproofing',
    volume: 12,
    unit: 'm²',
  }));
}

function fullPayload(): SpreadsheetHandoffPayload {
  const context = buildSpreadsheetProjectContext({
    projectId: PROJ,
    projectName: 'Rumah Tinggal 2 Lantai — EZRAB Premium Demo',
    existingItems: relevantItems(3),
    prompt: PROMPT,
  });
  const built = buildSpreadsheetHandoffPayload({
    prompt: PROMPT,
    projectId: PROJ,
    activeProjectId: PROJ,
    projectName: 'Rumah Tinggal 2 Lantai — EZRAB Premium Demo',
    conversationId: CONV,
    projectContext: context,
    projectItemCount: 213,
    draft: {
      draftId: 'draft-77',
      projectId: PROJ,
      version: 4,
      updatedAt: '2026-11-13T10:00:00.000Z',
      conversationId: CONV,
    },
  });
  expect(built.ok).toBe(true);
  if (!built.ok) throw new Error('unreachable');
  return built.payload;
}

/* ================================================================== */
/* (a) Isi payload                                                     */
/* ================================================================== */

describe('P0 — isi payload handoff', () => {
  it('memuat projectId + conversationId + prompt + konteks + draft', () => {
    const p = fullPayload();
    expect(p.source).toBe('spreadsheet');
    expect(p.mode).toBe('rab-generator');
    expect(p.projectId).toBe(PROJ);
    expect(p.projectName).toBe('Rumah Tinggal 2 Lantai — EZRAB Premium Demo');
    expect(p.conversationId).toBe(CONV);
    expect(p.prompt).toBe(PROMPT);
    expect(p.projectItemCount).toBe(213);
    expect(p.projectContext).toContain('Rumah Tinggal 2 Lantai');
    expect(p.projectContext).toContain('Item RAB yang sudah ada: 3 item');
    expect(p.projectContext).toContain('Waterproofing kamar mandi lantai 1');
    expect(p.draft?.draftId).toBe('draft-77');
    expect(p.draft?.version).toBe(4);
    expect(p.draft?.conversationId).toBe(CONV);
    expect(p.createdAt).toBeGreaterThan(0);
  });

  it('draft null bila belum ada draft tersimpan (bukan draft karangan)', () => {
    const built = buildSpreadsheetHandoffPayload({
      prompt: PROMPT,
      projectId: PROJ,
      activeProjectId: PROJ,
      projectItemCount: 0,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) throw new Error('unreachable');
    expect(built.payload.draft).toBeNull();
    expect(built.payload.conversationId).toBeNull();
  });

  it('tanpa proyek aktif (null == null) tetap valid — handoff global, tanpa konteks', () => {
    const built = buildSpreadsheetHandoffPayload({
      prompt: PROMPT,
      projectId: null,
      activeProjectId: null,
      projectItemCount: 0,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) throw new Error('unreachable');
    expect(built.payload.projectId).toBeNull();
    expect(built.payload.projectContext).toBeNull();
  });

  it('prompt kosong ditolak (EMPTY_PROMPT)', () => {
    const built = buildSpreadsheetHandoffPayload({
      prompt: '   ',
      projectId: PROJ,
      activeProjectId: PROJ,
      projectItemCount: 0,
    });
    expect(built.ok).toBe(false);
    if (built.ok) throw new Error('unreachable');
    expect(built.reason).toBe('EMPTY_PROMPT');
  });
});

/* ================================================================== */
/* (b) Batas G3                                                        */
/* ================================================================== */

describe('P0 — batas G3 dihormati', () => {
  it('cermin batas handoff SAMA dengan konstanta G3 (drift guard)', () => {
    expect(SPREADSHEET_HANDOFF_MAX_RELEVANT_ITEMS).toBe(SPREADSHEET_CONTEXT_MAX_RELEVANT_ITEMS);
    expect(SPREADSHEET_HANDOFF_MAX_CHARS).toBe(SPREADSHEET_CONTEXT_MAX_CHARS);
    expect(SPREADSHEET_HANDOFF_TRUNCATION_MARKER).toBe(SPREADSHEET_CONTEXT_TRUNCATION_MARKER);
    expect(SPREADSHEET_HANDOFF_MAX_RELEVANT_ITEMS).toBe(8);
    expect(SPREADSHEET_HANDOFF_MAX_CHARS).toBe(2000);
  });

  it('konteks dari builder G3: maks 8 item relevan + catatan terpotong berpenanda', () => {
    const context = buildSpreadsheetProjectContext({
      projectId: PROJ,
      projectName: 'Demo',
      existingItems: relevantItems(20),
      prompt: PROMPT,
    });
    expect(context).not.toBeNull();
    const itemLines = (context ?? '').split('\n').filter((l) => l.startsWith('- ['));
    expect(itemLines).toHaveLength(8);
    expect(context).toContain('12 item relevan lainnya tidak ditampilkan');
    expect(context).toContain(SPREADSHEET_CONTEXT_TRUNCATION_MARKER);
    const built = buildSpreadsheetHandoffPayload({
      prompt: PROMPT,
      projectId: PROJ,
      activeProjectId: PROJ,
      projectContext: context,
      projectItemCount: 20,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) throw new Error('unreachable');
    expect(built.payload.projectContext).toBe(context);
    expect((built.payload.projectContext ?? '').length).toBeLessThanOrEqual(2000);
  });

  it('konteks overlong dari jalur lain dipotong berpenanda (pertahanan berlapis)', () => {
    const overlong = `x`.repeat(2500);
    const bounded = boundSpreadsheetHandoffContext(overlong);
    expect(bounded).not.toBeNull();
    expect(bounded!.length).toBeLessThanOrEqual(
      SPREADSHEET_HANDOFF_MAX_CHARS + SPREADSHEET_HANDOFF_TRUNCATION_MARKER.length + 1,
    );
    expect(bounded).toContain(SPREADSHEET_HANDOFF_TRUNCATION_MARKER);
    expect(bounded!.startsWith('x'.repeat(2000))).toBe(true);
  });

  it('konteks tepat di batas TIDAK dipotong (tanpa penanda palsu)', () => {
    const exact = 'y'.repeat(2000);
    expect(boundSpreadsheetHandoffContext(exact)).toBe(exact);
    expect(boundSpreadsheetHandoffContext(null)).toBeNull();
  });
});

/* ================================================================== */
/* (c) Penolakan lintas-proyek                                         */
/* ================================================================== */

describe('P0 — penolakan lintas-proyek', () => {
  it('projectId != proyek aktif ditolak (CROSS_PROJECT)', () => {
    const built = buildSpreadsheetHandoffPayload({
      prompt: PROMPT,
      projectId: 'proj-A',
      activeProjectId: 'proj-B',
      projectItemCount: 0,
    });
    expect(built.ok).toBe(false);
    if (built.ok) throw new Error('unreachable');
    expect(built.reason).toBe('CROSS_PROJECT');
    expect(built.message).toContain('proyek yang salah');
  });

  it('tanpa proyek vs proyek aktif ditolak', () => {
    const built = buildSpreadsheetHandoffPayload({
      prompt: PROMPT,
      projectId: null,
      activeProjectId: PROJ,
      projectItemCount: 0,
    });
    expect(built.ok).toBe(false);
    if (built.ok) throw new Error('unreachable');
    expect(built.reason).toBe('CROSS_PROJECT');
  });

  it('draft dari proyek lain ditolak meski projectId cocok', () => {
    const built = buildSpreadsheetHandoffPayload({
      prompt: PROMPT,
      projectId: PROJ,
      activeProjectId: PROJ,
      projectItemCount: 0,
      draft: {
        draftId: 'draft-asing',
        projectId: 'proj-LAIN',
        version: 1,
        updatedAt: '2026-11-13T10:00:00.000Z',
        conversationId: null,
      },
    });
    expect(built.ok).toBe(false);
    if (built.ok) throw new Error('unreachable');
    expect(built.reason).toBe('CROSS_PROJECT');
  });
});

/* ================================================================== */
/* (d) Fallback satu-item tetap utuh                                   */
/* ================================================================== */

describe('P0 — fallback satu-item tetap utuh', () => {
  const modalSrc = readFileSync(
    new URL('../components/estimator/SmartAddWorkItemModal.tsx', import.meta.url),
    'utf8',
  );

  it('handler + tombol satu-item tetap terpasang', () => {
    expect(modalSrc).toContain('const handleGenerateAiItem = async ()');
    expect(modalSrc).toContain('onClick={handleGenerateAiItem}');
    expect(modalSrc).toContain('Analisis dengan AI');
    // Panggilan LLM satu-item (client.execute + jsonMode) tidak dihapus.
    expect(modalSrc).toContain('client.execute<Record<string, unknown>>');
    expect(modalSrc).toContain('jsonMode: true');
  });

  it('handler handoff memanggil builder + eksekutor, BUKAN client.execute', () => {
    const at = modalSrc.indexOf('const handleHandoffToChatAi = async ()');
    expect(at).toBeGreaterThan(-1);
    const nextAt = modalSrc.indexOf('const handleSaveAiItem = async ()', at);
    const handlerSrc = modalSrc.slice(at, nextAt);
    expect(handlerSrc).toContain('buildSpreadsheetHandoffPayload');
    expect(handlerSrc).toContain('executeSpreadsheetHandoff');
    expect(handlerSrc).toContain('handoffGuardRef.current.claim(key)');
    // Handoff tidak memanggil LLM sendiri — nol client.execute di handler.
    expect(handlerSrc).not.toContain('client.execute');
    expect(handlerSrc).not.toContain('new AiToolsProviderClient');
  });

  it('tombol handoff terpasang sebagai jalur utama di mode AI', () => {
    expect(modalSrc).toContain('onClick={handleHandoffToChatAi}');
    expect(modalSrc).toContain('Lanjutkan di Chat AI');
    // Tombol handoff mendahului tombol fallback di JSX (jalur utama).
    expect(modalSrc.indexOf('onClick={handleHandoffToChatAi}')).toBeLessThan(
      modalSrc.indexOf('onClick={handleGenerateAiItem}'),
    );
  });

  it('mapAiGeneratedItem fallback tetap null-aman (F5 tidak regresi)', () => {
    const mapped = mapAiGeneratedItem(
      { description: 'Waterproofing', category: 'WP' },
      { fallbackDescription: PROMPT, category: 'Pekerjaan Waterproofing', code: 'AI.01' },
    );
    expect(mapped.volume).toBeNull();
    expect(mapped.unitPrice).toBeNull();
    expect(mapped.description).toBe('Waterproofing');
    const withValues = mapAiGeneratedItem(
      { description: 'WP', volume: 12, unit: 'm²', unitPrice: 50000 },
      { fallbackDescription: PROMPT, category: 'WP', code: 'AI.01' },
    );
    expect(withValues.volume).toBe(12);
    expect(withValues.unitPrice).toBe(50000);
  });
});

/* ================================================================== */
/* (e) Satu klik = satu handoff                                        */
/* ================================================================== */

describe('P0 — satu klik = satu handoff', () => {
  it('klaim ganda kunci sama ditolak dalam jendela TTL', () => {
    const guard = createSpreadsheetHandoffGuard();
    const key = spreadsheetHandoffKey(PROJ, PROMPT);
    expect(guard.claim(key, 1000)).toBe(true);
    expect(guard.claim(key, 1000)).toBe(false);
    expect(guard.claim(key, 1000 + SPREADSHEET_HANDOFF_GUARD_TTL_MS - 1)).toBe(false);
  });

  it('kunci berbeda (proyek/prompt lain) tidak saling blokir', () => {
    const guard = createSpreadsheetHandoffGuard();
    expect(guard.claim(spreadsheetHandoffKey(PROJ, PROMPT), 1000)).toBe(true);
    expect(guard.claim(spreadsheetHandoffKey(PROJ, 'pekerjaan lain'), 1000)).toBe(true);
    expect(guard.claim(spreadsheetHandoffKey('proj-LAIN', PROMPT), 1000)).toBe(true);
  });

  it('release membuka klaim untuk percobaan ulang langsung', () => {
    const guard = createSpreadsheetHandoffGuard();
    const key = spreadsheetHandoffKey(PROJ, PROMPT);
    expect(guard.claim(key, 1000)).toBe(true);
    guard.release(key);
    expect(guard.claim(key, 1000)).toBe(true);
  });

  it('klaim kedaluwarsa sesudah TTL sehingga handoff sah berikutnya jalan', () => {
    const guard = createSpreadsheetHandoffGuard();
    const key = spreadsheetHandoffKey(PROJ, PROMPT);
    expect(guard.claim(key, 1000)).toBe(true);
    expect(guard.claim(key, 1000 + SPREADSHEET_HANDOFF_GUARD_TTL_MS)).toBe(true);
  });

  it('kunci menormalisasi spasi prompt (klik ganda spasi beda tetap satu)', () => {
    expect(spreadsheetHandoffKey(PROJ, '  Tambahkan   waterproofing  ')).toBe(
      spreadsheetHandoffKey(PROJ, 'Tambahkan waterproofing'),
    );
  });
});

/* ================================================================== */
/* (f) Round-trip entry kanonis                                        */
/* ================================================================== */

describe('P0 — round-trip entry kanonis (openEzrabAI)', () => {
  it('entry mode membawa identitas handoff lengkap', () => {
    executeSpreadsheetHandoff(fullPayload());
    const ez = consumePendingEzrabAiEntry();
    expect(ez).not.toBeNull();
    expect(ez?.mode).toBe('rab-generator');
    expect(ez?.projectId).toBe(PROJ);
    expect(ez?.projectName).toBe('Rumah Tinggal 2 Lantai — EZRAB Premium Demo');
    expect(ez?.source).toBe('estimator');
    expect(ez?.handoffSource).toBe('spreadsheet');
    expect(ez?.conversationId).toBe(CONV);
    expect(ez?.draftId).toBe('draft-77');
    expect(ez?.draftVersion).toBe(4);
    expect(ez?.draftUpdatedAt).toBe('2026-11-13T10:00:00.000Z');
    expect(ez?.projectItemCount).toBe(213);
    expect(ez?.projectContext).toContain('Waterproofing kamar mandi lantai 1');
    expect(ez?.prompt).toBe(PROMPT);
  });

  it('entry klasik: prompt prefill mentah (tanpa blok konteks di input)', () => {
    executeSpreadsheetHandoff(fullPayload());
    consumePendingEzrabAiEntry();
    const entry = consumePendingAiEntry('chat_agent');
    expect(entry).not.toBeNull();
    expect(entry?.initialPrompt).toBe(PROMPT);
    expect(entry?.initialPrompt).not.toContain('KONTEKS PROYEK');
    // Prefill default — TIDAK autosend (tanpa tinjauan user).
    expect(entry?.sendMode).toBeUndefined();
    expect(entry?.projectId).toBe(PROJ);
  });

  it('entry sekali-pakai: konsumsi kedua kosong', () => {
    executeSpreadsheetHandoff(fullPayload());
    expect(consumePendingEzrabAiEntry()).not.toBeNull();
    expect(consumePendingAiEntry('chat_agent')).not.toBeNull();
    expect(consumePendingEzrabAiEntry()).toBeNull();
    expect(consumePendingAiEntry('chat_agent')).toBeNull();
  });

  it('navigasi ke Chat AI proyek yang benar', () => {
    executeSpreadsheetHandoff(fullPayload());
    expect(lastUrl).toContain('/ezrab-ai');
    expect(lastUrl).toContain(PROJ);
    expect(dispatched).toContain('ezrab:ai-entry');
    expect(dispatched).toContain('ezrab:navigate');
  });

  it('tanpa draft: medan draft null (bukan karangan) di entry', () => {
    const built = buildSpreadsheetHandoffPayload({
      prompt: PROMPT,
      projectId: PROJ,
      activeProjectId: PROJ,
      conversationId: CONV,
      projectItemCount: 5,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) throw new Error('unreachable');
    executeSpreadsheetHandoff(built.payload);
    const ez = consumePendingEzrabAiEntry();
    expect(ez?.draftId).toBeNull();
    expect(ez?.draftVersion).toBeNull();
    expect(ez?.conversationId).toBe(CONV);
  });
});

/* ================================================================== */
/* Kontrak-sumber: aiNavigation aditif, view.tsx tak disentuh logika   */
/* ================================================================== */

describe('P0 — kontrak-sumber navigasi', () => {
  it('openEzrabAI tetap satu-satunya resolver (tanpa loop, tanpa duplikat)', () => {
    const navSrc = readFileSync(
      new URL('../ai-tools/aiNavigation.ts', import.meta.url),
      'utf8',
    );
    const calls = (navSrc.match(/openEzrabAI\(/g) || []).length;
    // 1x deklarasi + 0 pemanggilan-diri (pola aiUnification 10b).
    expect(calls).toBe(1);
    expect(navSrc).toContain('handoffSource?:');
    expect(navSrc).toContain('conversationId?: string | null');
    expect(navSrc).toContain('draftId?: string | null');
  });

  it('view.tsx TIDAK diubah logikanya oleh P0 (hanya dibaca)', () => {
    // Penanda: wiring konsumsi entry + binding G1 tetap seperti G1–G3.
    // (Tes ini mendokumentasikan batas cakupan; perubahan view.tsx oleh
    // P0 harus 0 — diverifikasi juga lewat git diff di laporan.)
    const viewSrc = readFileSync(
      new URL('../ai-tools/ezrab-ai/view.tsx', import.meta.url),
      'utf8',
    );
    expect(viewSrc).toContain('consumePendingEzrabAiEntry()');
    expect(viewSrc).toContain('checkTransferApprovalBinding(pendingTransferApprovalRef.current, d, effProject.id)');
    expect(viewSrc).not.toContain('spreadsheetHandoff');
  });
});
