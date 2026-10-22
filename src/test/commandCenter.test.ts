/**
 * Test: Command Center P0 — intent routing & action registry
 *
 * CATATAN PERUBAHAN SPESIFIKASI (Chat-to-RAB Workspace, Fase 2, 2026-10-21):
 * Tes 1, 2, dan 5 diubah SENGAJA mengikuti spesifikasi baru — permintaan RAB
 * yang diketik pengguna TIDAK lagi membuka wizard/studio otomatis, melainkan
 * menampilkan ringkasan kebutuhan (CREATE_RAB_SUMMARY) dengan tombol eksplisit
 * "Buka Workspace Desain & RAB". Wizard/studio hanya terbuka oleh klik tombol.
 * Baseline lama tidak dihapus diam-diam: ekspektasi lama dicatat di komentar.
 */
import { describe, it, expect } from 'vitest';
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import { executeIntent, continueRabNeeds } from '../ai-tools/ezrab-ai/actionRegistry';
import { routeForMenu, parseWorkspaceRoute } from '../routing/routes';

const mockCtx = {
  navigate: () => {},
  currentMenu: 'ezrab-ai',
  activeProject: null,
  projects: [],
  projectTotal: null,
};

describe('P0: intent routing untuk command center', () => {
  it('1. "buatkan saya RAB rumah" → CREATE_RAB_SUMMARY (dulu START_RAB_WIZARD)', () => {
    const r = routeIntent('buatkan saya RAB rumah');
    expect(r.intent).toBe('CREATE_RAB_SUMMARY');
  });

  it('2. "buat desain rumah 90 m2" → CREATE_RAB_SUMMARY (dulu START_HOUSE_DESIGN)', () => {
    const r = routeIntent('buat desain rumah 90 m2');
    expect(r.intent).toBe('CREATE_RAB_SUMMARY');
  });

  it('3. "buka menu spreadsheet" → OPEN_SPREADSHEET', () => {
    const r = routeIntent('buka menu spreadsheet');
    expect(r.intent).toBe('OPEN_SPREADSHEET');
  });

  it('4. "buka RAB" tetap → OPEN_RAB (tidak tertelan wizard)', () => {
    const r = routeIntent('buka RAB');
    expect(r.intent).toBe('OPEN_RAB');
  });

  it('4b. "buatkan rab" tanpa objek → CREATE_RAB_CLARIFY (tidak berubah)', () => {
    const r = routeIntent('buatkan rab');
    expect(r.intent).toBe('CREATE_RAB_CLARIFY');
  });

  it('4c. "buatkan rab drainase" → CREATE_RAB_SUMMARY (bukan wizard rumah)', () => {
    const r = routeIntent('buatkan rab drainase');
    expect(r.intent).toBe('CREATE_RAB_SUMMARY');
  });

  it('4d. "buatkan rab dari gambar DED" → CREATE_RAB_SUMMARY (jalur DED)', () => {
    const r = routeIntent('buatkan rab dari gambar DED');
    expect(r.intent).toBe('CREATE_RAB_SUMMARY');
  });

  it('4e. "buatkan saya rab rumah type 70 2 lantai" → CREATE_RAB_DIRECT (permintaan user 2026-10-21)', () => {
    const r = routeIntent('buatkan saya rab rumah type 70 2 lantai');
    expect(r.intent).toBe('CREATE_RAB_DIRECT');
  });

  it('4f. "buatkan rab rumah tipe 36" → CREATE_RAB_DIRECT (varian "tipe")', () => {
    const r = routeIntent('buatkan rab rumah tipe 36');
    expect(r.intent).toBe('CREATE_RAB_DIRECT');
  });

  it('4g. "buatkan rab rumah 2 lantai" tanpa tipe tetap → CREATE_RAB_SUMMARY (tidak berubah)', () => {
    const r = routeIntent('buatkan rab rumah 2 lantai');
    expect(r.intent).toBe('CREATE_RAB_SUMMARY');
  });
});

describe('P0: action registry', () => {
  it('5a. CREATE_RAB_DIRECT: tabel RAB detail + tombol Push ke Spreadsheet (permintaan user 2026-10-21)', () => {
    const ctx = { ...mockCtx, rawText: 'buatkan saya rab rumah type 70 2 lantai' } as never;
    const res = executeIntent('CREATE_RAB_DIRECT', undefined, ctx);
    expect(res.ok).toBe(true);
    // Tabel detail langsung di chat — bukan ringkasan kebutuhan/template.
    expect(res.message).toContain('| No | Uraian | Volume | Satuan | Harga Satuan | Jumlah |');
    expect(res.message).toContain('Total RAB');
    expect(res.message).not.toContain('ringkasan kebutuhan');
    const kinds = (res.actions ?? []).map((a) => a.action.kind);
    expect(kinds).toContain('push-rab');
    const labels = (res.actions ?? []).map((a) => a.label);
    expect(labels).toContain('Push ke Spreadsheet RAB');
  });

  it('5. CREATE_RAB_SUMMARY: ringkasan + tombol workspace, TANPA membuka overlay apa pun', () => {
    const ctx = { ...mockCtx, rawText: 'buatkan rab rumah 2 lantai 6x15' } as never;
    const res = executeIntent('CREATE_RAB_SUMMARY', undefined, ctx);
    expect(res.ok).toBe(true);
    // Inti Fase 2: tidak ada flag pembuka popup dari teks perintah.
    expect(res.openRabWizard).toBeFalsy();
    expect(res.openDesignStudio).toBeFalsy();
    expect(res.message).toContain('2 lantai');
    expect(res.message).toContain('6 × 15');
    const labels = (res.actions ?? []).map((a) => a.label);
    expect(labels).toContain('Buka Workspace Desain & RAB');
    expect(labels).toContain('Lengkapi kebutuhan');
    expect(labels).toContain('Mulai manual');
  });

  it('5b. Pekerjaan non-bangunan tidak ditawari workspace desain rumah', () => {
    const ctx = { ...mockCtx, rawText: 'buatkan rab drainase' } as never;
    const res = executeIntent('CREATE_RAB_SUMMARY', undefined, ctx);
    const labels = (res.actions ?? []).map((a) => a.label);
    expect(labels).not.toContain('Buka Workspace Desain & RAB');
    expect(labels).toContain('Pakai template');
    expect(res.openDesignStudio).toBeFalsy();
  });

  it('5c. continueRabNeeds menggabungkan jawaban ke ringkasan', () => {
    // Seed ulang state sesi sebagai ringkasan rumah (state bersifat sekuensial).
    const seedCtx = { ...mockCtx, rawText: 'buatkan rab rumah' } as never;
    executeIntent('CREATE_RAB_SUMMARY', undefined, seedCtx);
    const res = continueRabNeeds('2 lantai, 3 kamar tidur');
    expect(res.message).toContain('2 lantai');
    expect(res.message).toContain('Kamar tidur: 3');
    expect(res.openDesignStudio).toBeFalsy();
  });

  it('6. START_HOUSE_DESIGN (klik tombol) membuka design studio', () => {
    const res = executeIntent('START_HOUSE_DESIGN', 'rumah 90 m2', mockCtx as never);
    expect(res.ok).toBe(true);
    expect(res.openDesignStudio).toBe(true);
    expect(res.designPrompt).toBe('rumah 90 m2');
  });

  it('7. OPEN_SPREADSHEET memberi tombol navigasi nyata', () => {
    const res = executeIntent('OPEN_SPREADSHEET', undefined, mockCtx as never);
    expect(res.ok).toBe(true);
    expect(res.actions && res.actions[0].action.kind).toBe('navigate');
  });

  it('8. Action button navigate menunjuk menu valid', () => {
    const res = executeIntent('OPEN_SPREADSHEET', undefined, mockCtx as never);
    const btn = res.actions![0];
    if (btn.action.kind === 'navigate') {
      expect(btn.action.menu).toBe('rab-estimasi');
    } else {
      throw new Error('Expected navigate action');
    }
  });
});

describe('Fase 3: workspace halaman penuh (desain-rab)', () => {
  it('9. routeForMenu desain-rab: global dan per-proyek', () => {
    expect(routeForMenu('desain-rab', null)).toBe('/app/desain-rab');
    expect(routeForMenu('desain-rab', 'PRJ-1')).toBe('/app/projects/PRJ-1/desain-rab');
  });

  it('10. parseWorkspaceRoute mengenali desain-rab (global + proyek)', () => {
    expect(parseWorkspaceRoute('/app/desain-rab').menu).toBe('desain-rab');
    const p = parseWorkspaceRoute('/app/projects/PRJ-1/desain-rab');
    expect(p.menu).toBe('desain-rab');
    expect(p.projectId).toBe('PRJ-1');
    expect(p.status).toBe('ok');
  });

  it('11. OPEN_DESIGN_WORKSPACE dari registry TIDAK membuka overlay — hanya navigasi halaman', () => {
    const res = executeIntent('OPEN_DESIGN_WORKSPACE', undefined, mockCtx as never);
    expect(res.openDesignStudio).toBeFalsy();
    expect(res.openRabWizard).toBeFalsy();
    const btn = res.actions![0];
    if (btn.action.kind === 'navigate') {
      expect(btn.action.menu).toBe('desain-rab');
    } else {
      throw new Error('Expected navigate action');
    }
  });
});
