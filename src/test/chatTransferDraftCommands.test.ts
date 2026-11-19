/**
 * EZRAB Chat AI — TRANSFER_DRAFT (Workstream B1, 2026-11-19, gap P2
 * audit perintah Ezrab AI).
 *
 * Perintah teks "transfer draft ke spreadsheet" menjalankan alur
 * push-preview yang SAMA seperti tombol Push (callback view →
 * pushUniversalToSpreadsheetPreview — pratinjau + tombol Konfirmasi
 * Transfer + pengikatan approval). Tanpa callback / tanpa draft aktif
 * → jawab jujur, tidak ada klaim transfer.
 *
 * Run: npx vitest run src/test/chatTransferDraftCommands.test.ts
 */
import { describe, it, expect } from 'vitest';
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import { executeIntent, type ChatActionContext } from '../ai-tools/ezrab-ai/actionRegistry';

const baseCtx = (over: Partial<ChatActionContext> = {}): ChatActionContext => ({
  navigate: () => {},
  currentMenu: 'ezrab-ai',
  activeProject: { id: 'proj-1', name: 'Proyek Satu' },
  projects: [{ id: 'proj-1', name: 'Proyek Satu' }],
  projectTotal: null,
  ...over,
});

describe('TRANSFER_DRAFT: routing', () => {
  it('B2-1. "transfer draft ke spreadsheet" → TRANSFER_DRAFT', () => {
    expect(routeIntent('transfer draft ke spreadsheet').intent).toBe('TRANSFER_DRAFT');
  });

  it('B2-2. "push draft ke spreadsheet" → TRANSFER_DRAFT', () => {
    expect(routeIntent('push draft ke spreadsheet').intent).toBe('TRANSFER_DRAFT');
  });

  it('B2-3. "pindahkan draft ke spreadsheet" → TRANSFER_DRAFT', () => {
    expect(routeIntent('pindahkan draft ke spreadsheet').intent).toBe('TRANSFER_DRAFT');
  });

  it('B2-4. "transfer draft" telanjang → TRANSFER_DRAFT', () => {
    expect(routeIntent('transfer draft').intent).toBe('TRANSFER_DRAFT');
  });

  it('B2-5. "tolong transfer draft ke spreadsheet" → TRANSFER_DRAFT (bukan HELP)', () => {
    expect(routeIntent('tolong transfer draft ke spreadsheet').intent).toBe('TRANSFER_DRAFT');
  });

  it('B2-6. "kirim draft ke spreadsheet" → TRANSFER_DRAFT', () => {
    expect(routeIntent('kirim draft ke spreadsheet').intent).toBe('TRANSFER_DRAFT');
  });

  it('B2-7. tidak membajak navigasi: "buka spreadsheet" → OPEN_SPREADSHEET', () => {
    expect(routeIntent('buka spreadsheet').intent).toBe('OPEN_SPREADSHEET');
  });

  it('B2-8. tidak membajak pembuatan RAB: "buatkan rab jalan hotmix 1 km" → CREATE_RAB_SUMMARY', () => {
    expect(routeIntent('buatkan rab jalan hotmix 1 km').intent).toBe('CREATE_RAB_SUMMARY');
  });
});

describe('TRANSFER_DRAFT: handler', () => {
  it('B2-9. tanpa callback → ok:false, jujur "belum bisa", tanpa klaim transfer', () => {
    const res = executeIntent('TRANSFER_DRAFT', undefined, baseCtx());
    expect(res.ok).toBe(false);
    expect(res.message).toContain('belum bisa');
    expect(res.message).toContain('Push ke Spreadsheet');
    expect(res.message).not.toContain('ditransfer');
  });

  it('B2-10. callback false (tidak ada draft) → pesan jujur + cara membuat draft', () => {
    let calls = 0;
    const res = executeIntent('TRANSFER_DRAFT', undefined, baseCtx({
      requestDraftTransferPreview: () => { calls++; return false; },
    }));
    expect(calls).toBe(1);
    expect(res.ok).toBe(true);
    expect(res.message).toContain('Tidak ada draft RAB yang aktif');
    expect(res.message).toContain('buatkan RAB');
  });

  it('B2-11. callback true → pratinjau ditampilkan + Konfirmasi Transfer disebut, tanpa klaim tulis', () => {
    let calls = 0;
    const res = executeIntent('TRANSFER_DRAFT', undefined, baseCtx({
      requestDraftTransferPreview: () => { calls++; return true; },
    }));
    expect(calls).toBe(1);
    expect(res.ok).toBe(true);
    expect(res.message).toContain('Pratinjau transfer draft');
    expect(res.message).toContain('Konfirmasi Transfer');
    expect(res.message).toContain('Tanpa klik konfirmasi, tidak ada item yang ditulis');
  });

  it('B2-12. callback melempar → ok:false, tanpa klaim', () => {
    const res = executeIntent('TRANSFER_DRAFT', undefined, baseCtx({
      requestDraftTransferPreview: () => { throw new Error('boom'); },
    }));
    expect(res.ok).toBe(false);
    expect(res.message).toContain('gagal ditampilkan');
  });
});
