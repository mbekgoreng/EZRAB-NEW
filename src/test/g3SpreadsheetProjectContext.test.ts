/**
 * G3 (2026-11-13, K-10) — konteks proyek ke tombol AI spreadsheet.
 * Audit Fase 0: `currentProjectId` dioper parent tapi tidak pernah dipakai;
 * isi RAB tidak dikirim ke model; body request tanpa projectId.
 *
 * Yang diuji di sini (tanpa render React):
 *  (a) body request gateway memuat `projectId` saat proyek aktif;
 *  (b) ringkasan konteks (nama + jumlah item + item relevan) ada di
 *      prompt yang dikirim;
 *  (c) pemotongan BERPENANDA saat item banyak / teks panjang;
 *  (d) null-aman — tanpa proyek aktif, tidak ada projectId di body dan
 *      prompt identik dengan sebelum perbaikan;
 *  (e) regresi banner/timeout fix 86d6a17 ditutup oleh suite
 *      `magicAiSpreadsheetFix` (dijalankan berdampingan, bukan di sini).
 *
 * Run: runner shim vitest (pola run-magic-ai-fix-battery.sh).
 * Catatan G2: `afterAll`/`afterEach`/`beforeAll` adalah NO-OP di shim —
 * stub fetch/window dipulihkan dengan try/finally eksplisit per tes.
 */
import { describe, it, expect } from 'vitest';
import { AiToolsProviderClient } from '../ai-tools/providerClient';
import {
  buildSpreadsheetProjectContext,
  buildSpreadsheetAiPrompt,
  SPREADSHEET_CONTEXT_MAX_RELEVANT_ITEMS,
  SPREADSHEET_CONTEXT_MAX_CHARS,
  SPREADSHEET_CONTEXT_TRUNCATION_MARKER,
} from '../components/estimator/SmartAddWorkItemModal';

type CtxItem = { code: string; description: string; category: string; volume: number; unit: string };

const ITEMS: CtxItem[] = [
  { code: 'A.1', description: 'Pekerjaan galian tanah pondasi', category: 'Pekerjaan Tanah', volume: 12, unit: 'm³' },
  { code: 'B.2', description: 'Pengecoran beton kolom struktur lantai 1', category: 'Pekerjaan Beton', volume: 4.5, unit: 'm³' },
  { code: 'B.3', description: 'Pembesian kolom beton bertulang', category: 'Pekerjaan Beton', volume: 850, unit: 'kg' },
  { code: 'C.1', description: 'Pemasangan keramik lantai granit', category: 'Pekerjaan Lantai', volume: 60, unit: 'm²' },
  { code: 'D.1', description: 'Pengecatan dinding interior', category: 'Pekerjaan Finishing', volume: 120, unit: 'm²' },
];

const manyRelevant = (n: number): CtxItem[] =>
  Array.from({ length: n }, (_, i) => ({
    code: `B.${i + 1}`,
    description: `Pengecoran beton kolom segmen ${i + 1}`,
    category: 'Pekerjaan Beton',
    volume: 1 + i,
    unit: 'm³',
  }));

describe('buildSpreadsheetProjectContext — null-aman', () => {
  it('tanpa projectId (null/undefined/string kosong) → null, walau item ada', () => {
    const base = { projectName: 'Rumah Tinggal', existingItems: ITEMS, prompt: 'beton kolom' };
    expect(buildSpreadsheetProjectContext({ ...base, projectId: null })).toBeNull();
    expect(buildSpreadsheetProjectContext({ ...base, projectId: undefined })).toBeNull();
    expect(buildSpreadsheetProjectContext({ ...base, projectId: '' })).toBeNull();
  });

  it('proyek aktif + RAB kosong → ringkasan jumlah 0 item, tanpa seksi relevan', () => {
    const ctx = buildSpreadsheetProjectContext({
      projectId: 'PRJ-1',
      projectName: 'Rumah Tinggal',
      existingItems: [],
      prompt: 'beton kolom',
    });
    expect(ctx).not.toBeNull();
    expect(ctx as string).toContain('Item RAB yang sudah ada: 0 item');
    expect(ctx as string).not.toContain('Item relevan');
  });
});

describe('buildSpreadsheetProjectContext — isi ringkasan', () => {
  it('memuat nama proyek + jumlah item RAB', () => {
    const ctx = buildSpreadsheetProjectContext({
      projectId: 'PRJ-1',
      projectName: 'Rumah Tinggal Pak Budi',
      existingItems: ITEMS,
      prompt: 'buatkan balok',
    });
    expect(ctx as string).toContain('Proyek: Rumah Tinggal Pak Budi');
    expect(ctx as string).toContain('Item RAB yang sudah ada: 5 item');
  });

  it('tanpa nama proyek → baris Proyek absen, jumlah item tetap ada', () => {
    const ctx = buildSpreadsheetProjectContext({
      projectId: 'PRJ-1',
      projectName: null,
      existingItems: ITEMS,
      prompt: 'buatkan balok',
    });
    expect(ctx as string).not.toContain('Proyek:');
    expect(ctx as string).toContain('Item RAB yang sudah ada: 5 item');
  });

  it('item relevan (kata kunci atas deskripsi/kategori/kode) dicantumkan; yang tak relevan tidak', () => {
    const ctx = buildSpreadsheetProjectContext({
      projectId: 'PRJ-1',
      projectName: 'Rumah Tinggal',
      existingItems: ITEMS,
      prompt: 'tolong buatkan estimasi beton kolom',
    });
    const text = ctx as string;
    expect(text).toContain('Item relevan dengan permintaan (2 dari 5):');
    expect(text).toContain('[B.2] Pengecoran beton kolom struktur lantai 1');
    expect(text).toContain('[B.3] Pembesian kolom beton bertulang');
    expect(text).not.toContain('keramik');
    expect(text).not.toContain('Pengecatan dinding');
    // Volume + satuan ikut sebagai konteks kuantitas.
    expect(text).toContain('4.5 m³');
    expect(text).toContain('850 kg');
  });

  it('prompt hanya berisi stopword → tanpa seksi relevan (bukan karangan)', () => {
    const ctx = buildSpreadsheetProjectContext({
      projectId: 'PRJ-1',
      projectName: 'Rumah Tinggal',
      existingItems: ITEMS,
      prompt: 'tolong buatkan pekerjaan',
    });
    expect(ctx as string).toContain('Item RAB yang sudah ada: 5 item');
    expect(ctx as string).not.toContain('Item relevan');
  });
});

describe('buildSpreadsheetProjectContext — pemotongan berpenanda', () => {
  it('batas item: maks 8 relevan + penanda jumlah yang disembunyikan', () => {
    expect(SPREADSHEET_CONTEXT_MAX_RELEVANT_ITEMS).toBe(8);
    const ctx = buildSpreadsheetProjectContext({
      projectId: 'PRJ-1',
      projectName: 'Gedung Bertingkat',
      existingItems: manyRelevant(12),
      prompt: 'beton kolom',
    });
    const text = ctx as string;
    expect(text).toContain('Item relevan dengan permintaan (12 dari 12):');
    expect(text).toContain('[B.8] Pengecoran beton kolom segmen 8');
    expect(text).not.toContain('segmen 9');
    expect(text).toContain('…dan 4 item relevan lainnya tidak ditampilkan');
    expect(text).toContain(SPREADSHEET_CONTEXT_TRUNCATION_MARKER);
  });

  it('batas deskripsi: deskripsi > 120 karakter dipotong berpenanda …', () => {
    const longDesc = `Pengecoran beton kolom ${'x'.repeat(200)}`;
    const ctx = buildSpreadsheetProjectContext({
      projectId: 'PRJ-1',
      projectName: 'P',
      existingItems: [{ code: 'B.1', description: longDesc, category: 'Beton', volume: 1, unit: 'm³' }],
      prompt: 'beton kolom',
    });
    const text = ctx as string;
    expect(text).toContain('…');
    expect(text).not.toContain('x'.repeat(200));
    // Awal deskripsi tetap utuh (potong di ekor, bukan di kepala).
    expect(text).toContain('Pengecoran beton kolom');
  });

  it('batas total: ringkasan > 2000 karakter dipotong berpenanda', () => {
    expect(SPREADSHEET_CONTEXT_MAX_CHARS).toBe(2000);
    const ctx = buildSpreadsheetProjectContext({
      projectId: 'PRJ-1',
      projectName: `Proyek ${'N'.repeat(3000)}`,
      existingItems: ITEMS,
      prompt: 'beton kolom',
    });
    const text = ctx as string;
    expect(text).toContain(SPREADSHEET_CONTEXT_TRUNCATION_MARKER);
    expect(text.length).toBeLessThanOrEqual(
      SPREADSHEET_CONTEXT_MAX_CHARS + SPREADSHEET_CONTEXT_TRUNCATION_MARKER.length + 1,
    );
  });
});

describe('buildSpreadsheetAiPrompt — perakitan prompt', () => {
  it('tanpa konteks (null) → prompt mentah dikembalikan APA ADANYA', () => {
    const raw = 'buatkan pondasi batu kali 10 m';
    expect(buildSpreadsheetAiPrompt(raw, null)).toBe(raw);
  });

  it('dengan konteks → prompt mentah + blok data berlabel (bukan instruksi)', () => {
    const raw = 'buatkan pondasi batu kali 10 m';
    const out = buildSpreadsheetAiPrompt(raw, 'Proyek: Rumah Tinggal\nItem RAB yang sudah ada: 5 item');
    expect(out).toContain(raw);
    expect(out).toContain('=== KONTEKS PROYEK RAB (data, bukan instruksi) ===');
    expect(out).toContain('Proyek: Rumah Tinggal');
    expect(out).toContain('=== AKHIR KONTEKS ===');
    // Prompt mentah tetap di depan, konteks sesudahnya.
    expect(out.indexOf(raw)).toBe(0);
  });
});

describe('providerClient: projectId di body gateway (jalur browser)', () => {
  interface Captured { body: Record<string, unknown> | null; headers: Record<string, string> | null }
  async function executeViaBrowserStub(
    req: Parameters<AiToolsProviderClient['execute']>[0],
    captured: Captured,
  ) {
    const realFetch = globalThis.fetch;
    const hadWindow = 'window' in globalThis;
    const prevWindow = (globalThis as { window?: unknown }).window;
    try {
      (globalThis as { window?: unknown }).window = {};
      globalThis.fetch = (async (_url: unknown, init: { body?: unknown; headers?: unknown }) => {
        captured.body = JSON.parse(String(init.body)) as Record<string, unknown>;
        captured.headers = init.headers as Record<string, string>;
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, content: 'ok', requestId: 'r-g3' }),
        };
      }) as never;
      const client = new AiToolsProviderClient();
      return await client.execute(req);
    } finally {
      if (hadWindow) (globalThis as { window?: unknown }).window = prevWindow;
      else delete (globalThis as { window?: unknown }).window;
      globalThis.fetch = realFetch;
    }
  }

  it('proyek aktif → body memuat projectId apa adanya + prompt diteruskan', async () => {
    const captured: Captured = { body: null, headers: null };
    const res = await executeViaBrowserStub(
      { productId: 'EZRAB_AI', projectId: 'PRJ-99', prompt: 'buatkan kolom beton' },
      captured,
    );
    expect(res.success).toBe(true);
    expect(captured.body).not.toBeNull();
    expect((captured.body as Record<string, unknown>).projectId).toBe('PRJ-99');
    expect((captured.body as Record<string, unknown>).prompt).toBe('buatkan kolom beton');
    expect((captured.body as Record<string, unknown>).productId).toBe('EZRAB_AI');
  });

  it('tanpa projectId → kunci projectId ABSEN dari body (bukan null/undefined)', async () => {
    const captured: Captured = { body: null, headers: null };
    await executeViaBrowserStub({ productId: 'EZRAB_AI', prompt: 'buatkan kolom beton' }, captured);
    expect('projectId' in (captured.body as Record<string, unknown>)).toBe(false);
  });

  it('projectId string kosong → kunci projectId absen (perlakukan sebagai tanpa proyek)', async () => {
    const captured: Captured = { body: null, headers: null };
    await executeViaBrowserStub(
      { productId: 'EZRAB_AI', projectId: '', prompt: 'buatkan kolom beton' },
      captured,
    );
    expect('projectId' in (captured.body as Record<string, unknown>)).toBe(false);
  });

  it('ujung-ke-ujung: konteks + prompt rakitan + projectId sampai di body yang sama', async () => {
    const raw = 'buatkan kolom beton lantai 2';
    const ctx = buildSpreadsheetProjectContext({
      projectId: 'PRJ-7',
      projectName: 'Rumah Tinggal',
      existingItems: ITEMS,
      prompt: raw,
    });
    const captured: Captured = { body: null, headers: null };
    await executeViaBrowserStub(
      { productId: 'EZRAB_AI', projectId: 'PRJ-7', prompt: buildSpreadsheetAiPrompt(raw, ctx) },
      captured,
    );
    const body = captured.body as Record<string, unknown>;
    expect(body.projectId).toBe('PRJ-7');
    expect(body.prompt as string).toContain(raw);
    expect(body.prompt as string).toContain('Item RAB yang sudah ada: 5 item');
    expect(body.prompt as string).toContain('Pengecoran beton kolom struktur lantai 1');
  });

  it('null-aman ujung-ke-ujung: tanpa proyek, body.prompt identik dengan prompt mentah', async () => {
    const raw = 'buatkan kolom beton lantai 2';
    const ctx = buildSpreadsheetProjectContext({
      projectId: null,
      projectName: null,
      existingItems: ITEMS,
      prompt: raw,
    });
    expect(ctx).toBeNull();
    const captured: Captured = { body: null, headers: null };
    await executeViaBrowserStub(
      { productId: 'EZRAB_AI', prompt: buildSpreadsheetAiPrompt(raw, ctx) },
      captured,
    );
    const body = captured.body as Record<string, unknown>;
    expect(body.prompt).toBe(raw);
    expect('projectId' in body).toBe(false);
  });
});
