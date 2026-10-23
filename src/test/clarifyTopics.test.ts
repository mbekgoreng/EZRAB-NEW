/**
 * Test: Klarifikasi Topik (peraturan owner 2026-10-23)
 *
 * Pertanyaan telanjang/ambigu ("ahsp", "cek harga", "template", "rab")
 * TIDAK diteruskan ke LLM untuk ditebak — router mengarah ke
 * CLARIFY_TOPIC (lokal), registry menampilkan kartu pilihan, pilihan
 * meminta query (awaitClarify), dan query dijawab deterministik dari
 * data EZRAB (repository AHSP / resolver harga / katalog template).
 * Perintah spesifik yang sudah ada TIDAK boleh tertelan klarifikasi.
 */
import { describe, it, expect } from 'vitest';
import { detectClarifyTopic } from '../ai-tools/ezrab-ai/clarifyTopics';
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import { executeIntent, type ChatActionContext } from '../ai-tools/ezrab-ai/actionRegistry';

const mockCtx: ChatActionContext = {
  navigate: () => {},
  currentMenu: 'ezrab-ai',
  activeProject: null,
  projects: [],
  projectTotal: null,
};

describe('detectClarifyTopic — bentuk telanjang tertangkap', () => {
  it('ahsp: semua bentuk telanjang', () => {
    for (const s of ['ahsp', 'ahsp 2026', 'cek ahsp', 'apa itu ahsp', 'ahsp itu apa', 'jelaskan ahsp', 'tentang ahsp', 'apa itu ahsp 2026']) {
      expect(detectClarifyTopic(s), s).toBe('ahsp');
    }
  });

  it('harga: tanpa nama objek', () => {
    for (const s of ['harga', 'cek harga', 'harga satuan', 'info harga']) {
      expect(detectClarifyTopic(s), s).toBe('harga');
    }
  });

  it('template: tanpa nama spesifik', () => {
    for (const s of ['template', 'template rab', 'cari template']) {
      expect(detectClarifyTopic(s), s).toBe('template');
    }
  });

  it('rab: tanpa objek sama sekali', () => {
    for (const s of ['rab', 'buatkan rab', 'buat rab', 'minta rab']) {
      expect(detectClarifyTopic(s), s).toBe('rab');
    }
  });
});

describe('detectClarifyTopic — bentuk spesifik TIDAK tertangkap', () => {
  it('ada objek/kode/angka → null', () => {
    expect(detectClarifyTopic('cek harga semen')).toBeNull();
    expect(detectClarifyTopic('buatkan rab rumah type 45')).toBeNull();
    expect(detectClarifyTopic('hitung volume balok')).toBeNull();
    expect(detectClarifyTopic('cari ahsp beton k-225')).toBeNull();
    expect(detectClarifyTopic('harga semen')).toBeNull();
    expect(detectClarifyTopic('template rumah')).toBeNull();
    expect(detectClarifyTopic('buka ahsp')).toBeNull();
    expect(detectClarifyTopic('')).toBeNull();
  });
});

describe('routeIntent — klarifikasi vs regresi perintah spesifik', () => {
  it('"ahsp" → CLARIFY_TOPIC (lokal, bukan LLM)', () => {
    const r = routeIntent('ahsp');
    expect(r.intent).toBe('CLARIFY_TOPIC');
    expect(r.param).toBe('ahsp');
    expect(r.localOnly).toBe(true);
  });

  it('"apa itu ahsp 2026" → CLARIFY_TOPIC ahsp (bukan SEARCH_AHSP "2026")', () => {
    const r = routeIntent('apa itu ahsp 2026');
    expect(r.intent).toBe('CLARIFY_TOPIC');
    expect(r.param).toBe('ahsp');
  });

  it('"harga" / "template" / "minta rab" / "rab" → CLARIFY_TOPIC', () => {
    expect(routeIntent('harga').intent).toBe('CLARIFY_TOPIC');
    expect(routeIntent('template').intent).toBe('CLARIFY_TOPIC');
    expect(routeIntent('minta rab').intent).toBe('CLARIFY_TOPIC');
    expect(routeIntent('rab').intent).toBe('CLARIFY_TOPIC');
  });

  it('regresi: perintah spesifik tidak tertelan klarifikasi', () => {
    expect(routeIntent('buatkan rab rumah type 45').intent).toBe('CREATE_RAB_DIRECT');
    expect(routeIntent('buatkan rab jalan hotmix 1 km').intent).toBe('CREATE_RAB_SUMMARY');
    expect(routeIntent('hitung volume balok 6x0.3x0.5').intent).toBe('CALCULATE');
    // "buatkan rab" tetap jalur CREATE_RAB_CLARIFY lama (sudah tanya balik).
    expect(routeIntent('buatkan rab').intent).toBe('CREATE_RAB_CLARIFY');
    // Navigasi eksplisit tetap navigasi.
    expect(routeIntent('buka template rab').intent).toBe('OPEN_TEMPLATE');
    expect(routeIntent('cari ahsp beton').intent).toBe('SEARCH_AHSP');
  });
});

describe('executeIntent — kartu & pilihan klarifikasi', () => {
  it('CLARIFY_TOPIC ahsp → ≥3 tombol, ada navigate ahsp-2026 dan pick explain', () => {
    const res = executeIntent('CLARIFY_TOPIC', 'ahsp', mockCtx);
    expect(res.ok).toBe(true);
    expect(res.message).toContain('maksud Anda yang mana');
    expect(res.actions!.length).toBeGreaterThanOrEqual(3);
    expect(
      res.actions!.some((a) => a.action.kind === 'navigate' && a.action.menu === 'ahsp-2026'),
    ).toBe(true);
    expect(
      res.actions!.some(
        (a) => a.action.kind === 'intent' && a.action.intent === 'CLARIFY_PICK' && a.action.param === 'ahsp:explain',
      ),
    ).toBe(true);
  });

  it('CLARIFY_TOPIC harga/template/rab → kartu masing-masing terbangun', () => {
    for (const topic of ['harga', 'template', 'rab']) {
      const res = executeIntent('CLARIFY_TOPIC', topic, mockCtx);
      expect(res.ok, topic).toBe(true);
      expect(res.actions!.length, topic).toBeGreaterThanOrEqual(3);
    }
    const rab = executeIntent('CLARIFY_TOPIC', 'rab', mockCtx);
    expect(
      rab.actions!.some(
        (a) => a.action.kind === 'intent' && a.action.intent === 'CREATE_RAB_SUMMARY' && a.action.param === 'buatkan rab jalan',
      ),
    ).toBe(true);
  });

  it('CLARIFY_PICK ahsp:explain → definisi AHSP deterministik', () => {
    const res = executeIntent('CLARIFY_PICK', 'ahsp:explain', mockCtx);
    expect(res.ok).toBe(true);
    expect(res.message).toContain('Analisa Harga Satuan');
    expect(res.awaitClarify).toBeUndefined();
  });

  it('CLARIFY_PICK ahsp:search → awaitClarify ahsp', () => {
    const res = executeIntent('CLARIFY_PICK', 'ahsp:search', mockCtx);
    expect(res.ok).toBe(true);
    expect(res.awaitClarify).toBe('ahsp');
  });

  it('CLARIFY_PICK harga:material / template:search → mode menunggu yang benar', () => {
    expect(executeIntent('CLARIFY_PICK', 'harga:material', mockCtx).awaitClarify).toBe('harga-material');
    expect(executeIntent('CLARIFY_PICK', 'harga:upah', mockCtx).awaitClarify).toBe('harga-upah');
    expect(executeIntent('CLARIFY_PICK', 'harga:alat', mockCtx).awaitClarify).toBe('harga-alat');
    expect(executeIntent('CLARIFY_PICK', 'template:search', mockCtx).awaitClarify).toBe('template');
  });
});

describe('executeIntent — CLARIFY_QUERY dijawab dari data nyata', () => {
  it('mode ahsp, query "beton" → hasil berkode AHSP, tanpa Rp0 karangan', () => {
    const res = executeIntent('CLARIFY_QUERY', 'beton', { ...mockCtx, clarifyMode: 'ahsp' });
    expect(res.ok).toBe(true);
    // Kode analisa tampil dalam kurung siku, pola tool cari_ahsp.
    expect(res.message).toMatch(/\[\d[\d.]*\]/);
    expect(res.message).not.toContain('Rp0');
    // Sukses → mode menunggu selesai; tombol katalog + cari lagi tersedia.
    expect(res.awaitClarify).toBeUndefined();
    expect(
      res.actions!.some((a) => a.action.kind === 'navigate' && a.action.menu === 'ahsp-2026'),
    ).toBe(true);
  });

  it('mode ahsp, query mustahil → jujur tidak ditemukan + tetap menunggu', () => {
    const res = executeIntent('CLARIFY_QUERY', 'zxqwkj', { ...mockCtx, clarifyMode: 'ahsp' });
    expect(res.ok).toBe(true);
    expect(res.message).toContain('Tidak ditemukan AHSP');
    expect(res.awaitClarify).toBe('ahsp');
  });

  it('mode template, query "rumah" → daftar template nyata + tombol katalog', () => {
    const res = executeIntent('CLARIFY_QUERY', 'rumah', { ...mockCtx, clarifyMode: 'template' });
    expect(res.ok).toBe(true);
    expect(res.message).toContain('Template yang cocok');
    expect(
      res.actions!.some((a) => a.action.kind === 'navigate' && a.action.menu === 'template-rab'),
    ).toBe(true);
  });

  it('mode harga-material, query mustahil → belum tersedia (bukan Rp0) + tetap menunggu', () => {
    const res = executeIntent('CLARIFY_QUERY', 'zxqwkjmaterial', { ...mockCtx, clarifyMode: 'harga-material' });
    expect(res.message).toContain('belum tersedia');
    expect(res.message).not.toContain('Rp0');
    expect(res.awaitClarify).toBe('harga-material');
  });

  it('tanpa mode aktif → ditolak jujur', () => {
    const res = executeIntent('CLARIFY_QUERY', 'beton', mockCtx);
    expect(res.ok).toBe(false);
  });
});
