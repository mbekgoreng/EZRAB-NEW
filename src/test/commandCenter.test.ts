/**
 * Test: Command Center P0 — intent routing & action registry
 *
 * CATATAN PERUBAHAN SPESIFIKASI (Chat-to-RAB Workspace, Fase 2, 2026-10-21):
 * Tes 1, 2, dan 5 diubah SENGAJA mengikuti spesifikasi baru — permintaan RAB
 * yang diketik pengguna TIDAK lagi membuka wizard/studio otomatis, melainkan
 * menampilkan ringkasan kebutuhan (CREATE_RAB_SUMMARY) dengan tombol eksplisit
 * "Buka Workspace Desain & RAB". Wizard/studio hanya terbuka oleh klik tombol.
 * Baseline lama tidak dihapus diam-diam: ekspektasi lama dicatat di komentar.
 *
 * CATATAN PERUBAHAN SPESIFIKASI (2026-10-22, desain owner): tes 5a diubah
 * SENGAJA — permintaan BERTIPE TERDAFTAR tidak lagi langsung menghasilkan
 * tabel dari teks ketikan, melainkan KARTU PILIHAN (ringkasan spek +
 * "Pakai Template" / "Pakai AI Full"). Tabel RAB + tombol Push kini lahir
 * dari klik "Pakai Template" (intent GENERATE_RAB_TEMPLATE, tes 5a2) dengan
 * hasil yang identik dengan jalur direct lama. Permintaan spesifikasi bebas
 * tanpa tipe tetap langsung generate (suite freeSpecRab.test.ts).
 *
 * CATATAN PERUBAHAN SPESIFIKASI (2026-10-23, permintaan user): tes 5b diubah
 * SENGAJA — pekerjaan non-bangunan BERPETA SUBTIPE (jalan/drainase/jembatan)
 * tidak lagi langsung menerima tombol jalur. Chat bertanya balik subtipe
 * dulu ("Jalan apa?" / "Drainase / saluran apa?") dengan tombol subtipe;
 * kartu jalur (Pakai template / Full AI / Dari gambar DED) tampil SESUDAH
 * subtipe dipilih atau disebut di teks. Skenario lengkap: describe
 * "Klarifikasi subtipe RAB" di bawah.
 *
 * CATATAN PERUBAHAN SPESIFIKASI (2026-10-23, permintaan owner "pakai Full
 * AI → AI mengerjakan semua DI CHAT AI"): tes 5a diubah SENGAJA — tombol
 * kedua kartu pilihan kini "Pakai AI Full" intent RAB_FULL_AI dengan param
 * teks asal kartu (sebelumnya OPEN_DESIGN_WORKSPACE + prompt desain keluar
 * chat). Case RAB_FULL_AI kini mencoba komposisi deterministik lebih dulu
 * (tabel lengkap + tombol Push ke Spreadsheet RAB); fullAiPrompt (jalur
 * LLM) hanya fallback bila komposisi tidak bisa dibuat. Skenario: describe
 * "Full AI di chat" (S12–S13) di bawah.
 */
import { describe, it, expect } from 'vitest';
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import { executeIntent, continueRabNeeds, tryContinueRabSubtype, buildFullAiPrompt, getPendingRabChoice } from '../ai-tools/ezrab-ai/actionRegistry';
import { getLastDirectRab } from '../ai-tools/ezrab-ai/directRab';
import { extractRabNeeds } from '../ai-tools/ezrab-ai/rabNeeds';
import { RAB_SUBTYPE_GROUPS, findSubtypeTemplates, detectSubtypeFromText } from '../ai-tools/ezrab-ai/rabSubtypes';
import { RabTemplateService } from '../services/rabTemplateService';
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
  it('5a. CREATE_RAB_DIRECT bertipe → kartu pilihan (BELUM ada tabel RAB) — desain owner 2026-10-22', () => {
    const ctx = { ...mockCtx, rawText: 'buatkan saya rab rumah type 70 2 lantai' } as never;
    const res = executeIntent('CREATE_RAB_DIRECT', undefined, ctx);
    expect(res.ok).toBe(true);
    // Teks ketikan TIDAK langsung generate: baru ringkasan spek + 2 pilihan.
    expect(res.message).not.toContain('| No | Uraian |');
    expect(res.message).toContain('Rumah Type 70');
    expect(res.message).toContain('2 lantai');
    const labels = (res.actions ?? []).map((a) => a.label);
    expect(labels).toEqual(['Pakai Template', 'Pakai AI Full']);
    const tpl = res.actions![0];
    if (tpl.action.kind === 'intent') {
      expect(tpl.action.intent).toBe('GENERATE_RAB_TEMPLATE');
      expect(tpl.action.param).toBe('buatkan saya rab rumah type 70 2 lantai');
    } else {
      throw new Error('Expected intent action for Pakai Template');
    }
    // "Pakai AI Full" (perubahan owner 2026-10-23): intent RAB_FULL_AI
    // dengan param teks asal kartu — pola sama dengan "Pakai Template";
    // spek terkoreksi terbawa lewat state pendingChoice, bukan string
    // prompt. Kliknya disusun deterministik di chat (tes S12).
    const ai = res.actions![1];
    if (ai.action.kind === 'intent') {
      expect(ai.action.intent).toBe('RAB_FULL_AI');
      expect(ai.action.param).toBe('buatkan saya rab rumah type 70 2 lantai');
    } else {
      throw new Error('Expected intent action for Pakai AI Full');
    }
  });

  it('5a3. Kartu pilihan 2 lantai: nama basis template TIDAK mengklaim "(1 Lantai)" (WS-2, temuan QA Fase 9)', () => {
    const ctx = { ...mockCtx, rawText: 'buatkan rab rumah type 45 2 lantai' } as never;
    const res = executeIntent('CREATE_RAB_DIRECT', undefined, ctx);
    expect(res.ok).toBe(true);
    expect(res.message).toContain('Jumlah lantai: 2 lantai');
    expect(res.message).toContain('(Rumah Tinggal Menengah Tipe 45)');
    expect(res.message).not.toContain('(1 Lantai)');
    // Kartu 1 lantai mempertahankan nama registri persis (klaimnya benar).
    const ctx1 = { ...mockCtx, rawText: 'buatkan rab rumah type 45' } as never;
    const res1 = executeIntent('CREATE_RAB_DIRECT', undefined, ctx1);
    expect(res1.message).toContain('Jumlah lantai: 1 lantai');
    expect(res1.message).toContain('(Rumah Tinggal Menengah Tipe 45 (1 Lantai))');
  });

  it('5a2. GENERATE_RAB_TEMPLATE (klik "Pakai Template"): tabel RAB detail + tombol Push — identik jalur direct lama', () => {
    const res = executeIntent('GENERATE_RAB_TEMPLATE', 'buatkan saya rab rumah type 70 2 lantai', mockCtx as never);
    expect(res.ok).toBe(true);
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

  it('5b. Pekerjaan non-bangunan tidak ditawari workspace desain rumah (2026-10-23: drainase bertanya subtipe dulu)', () => {
    const ctx = { ...mockCtx, rawText: 'buatkan rab drainase' } as never;
    const res = executeIntent('CREATE_RAB_SUMMARY', undefined, ctx);
    const labels = (res.actions ?? []).map((a) => a.label);
    expect(labels).not.toContain('Buka Workspace Desain & RAB');
    expect(res.openDesignStudio).toBeFalsy();
    // Alur baru: pertanyaan subtipe dulu — kartu jalur BELUM tampil.
    expect(res.awaitRabSubtype).toBe(true);
    expect(labels).toContain('U-Ditch Pracetak');
    expect(labels).not.toContain('Pakai template');
    // Sesudah subtipe dipilih → kartu jalur tampil (termasuk Pakai template).
    const card = executeIntent('RAB_SUBTYPE_SELECT', 'uditch', mockCtx as never);
    const cardLabels = (card.actions ?? []).map((a) => a.label);
    expect(cardLabels).toContain('Pakai template');
    expect(cardLabels).not.toContain('Buka Workspace Desain & RAB');
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

describe('Klarifikasi subtipe RAB (permintaan user 2026-10-23)', () => {
  it('S1. "buatkan saya rab jalan 1km" → pertanyaan "Jalan apa?" + tombol subtipe; kartu jalur BELUM tampil', () => {
    expect(routeIntent('buatkan saya rab jalan 1km').intent).toBe('CREATE_RAB_SUMMARY');
    const ctx = { ...mockCtx, rawText: 'buatkan saya rab jalan 1km' } as never;
    const res = executeIntent('CREATE_RAB_SUMMARY', undefined, ctx);
    expect(res.ok).toBe(true);
    expect(res.awaitRabSubtype).toBe(true);
    expect(res.message).toContain('Jalan apa?');
    // Kebutuhan yang sudah disebut tetap terbawa di ringkasan pertanyaan.
    expect(res.message).toContain('Panjang: 1 km (1.000 m)');
    const labels = (res.actions ?? []).map((a) => a.label);
    expect(labels).toContain('Hotmix / Aspal');
    expect(labels).toContain('Beton / Rigid');
    expect(labels).toContain('Paving Block');
    expect(labels).toContain('Makadam / Telford');
    // Kartu jalur TIDAK boleh muncul sebelum subtipe dipilih.
    expect(labels).not.toContain('Pakai template');
    expect(labels).not.toContain('Full AI');
    expect(res.openDesignStudio).toBeFalsy();
  });

  it('S2. Klik "Hotmix" → kartu jalur [Pakai template][Full AI][Dari gambar DED], kebutuhan terbawa (jalan, hotmix, 1 km)', () => {
    // Seed: pertanyaan subtipe aktif (state sekuensial antar-tes).
    executeIntent('CREATE_RAB_SUMMARY', undefined, { ...mockCtx, rawText: 'buatkan saya rab jalan 1km' } as never);
    const res = executeIntent('RAB_SUBTYPE_SELECT', 'hotmix', mockCtx as never);
    expect(res.ok).toBe(true);
    expect(res.awaitRabSubtype).toBeFalsy();
    const labels = (res.actions ?? []).map((a) => a.label);
    expect(labels).toEqual(['Pakai template', 'Full AI', 'Dari gambar DED']);
    expect(res.message).toContain('Jenis / subtipe: Hotmix / Aspal');
    expect(res.message).toContain('Panjang: 1 km (1.000 m)');
    // Full AI membawa konteks terkumpul sebagai prompt (jenis+subtipe+panjang).
    const fullAi = res.actions![1];
    if (fullAi.action.kind === 'intent') {
      expect(fullAi.action.intent).toBe('RAB_FULL_AI');
      expect(fullAi.action.param).toContain('Hotmix / Aspal');
      expect(fullAi.action.param).toContain('1 km');
    } else {
      throw new Error('Expected intent action for Full AI');
    }
    // Jalur DED tetap dipertahankan sebagai pilihan ketiga (navigasi ded-ai).
    const ded = res.actions![2];
    if (ded.action.kind === 'navigate') {
      expect(ded.action.menu).toBe('ded-ai');
    } else {
      throw new Error('Expected navigate action for DED');
    }
  });

  it('S3. "Pakai template" (hotmix) → daftar template NYATA dari katalog + query pencarian diteruskan', () => {
    executeIntent('CREATE_RAB_SUMMARY', undefined, { ...mockCtx, rawText: 'buatkan rab jalan hotmix 1 km' } as never);
    const res = executeIntent('RAB_PATH_TEMPLATE', undefined, mockCtx as never);
    expect(res.ok).toBe(true);
    // Template unggulan legacy yang benar-benar ada di katalog gabungan.
    expect(res.message).toContain('Jalan Aspal Hotmix (Flexible Pavement)');
    // Kata kunci pencarian subtipe diteruskan untuk diketik di katalog.
    expect(res.message).toContain('ketik "**aspal**"');
    const labels = (res.actions ?? []).map((a) => a.label);
    expect(labels).toContain('Buka Katalog Template');
    const open = res.actions![0];
    if (open.action.kind === 'navigate') {
      expect(open.action.menu).toBe('template-rab');
    } else {
      throw new Error('Expected navigate action for catalog');
    }
  });

  it('S4. Subtipe tanpa template (makadam) → jalur Template menjawab JUJUR + arahkan Full AI', () => {
    executeIntent('CREATE_RAB_SUMMARY', undefined, { ...mockCtx, rawText: 'buatkan rab jalan makadam 2 km' } as never);
    const res = executeIntent('RAB_PATH_TEMPLATE', undefined, mockCtx as never);
    expect(res.ok).toBe(true);
    expect(res.message).toContain('belum ada template');
    expect(res.message).toContain('Makadam / Telford');
    const labels = (res.actions ?? []).map((a) => a.label);
    expect(labels).toContain('Full AI');
    expect(labels).not.toContain('Buka Katalog Template');
  });

  it('S5. "buatkan rab jalan hotmix 1 km" → subtipe DISEBUT di teks: pertanyaan dilewati, langsung kartu jalur', () => {
    const ctx = { ...mockCtx, rawText: 'buatkan rab jalan hotmix 1 km' } as never;
    const res = executeIntent('CREATE_RAB_SUMMARY', undefined, ctx);
    expect(res.awaitRabSubtype).toBeFalsy();
    expect(res.message).not.toContain('Jalan apa?');
    const labels = (res.actions ?? []).map((a) => a.label);
    expect(labels).toEqual(['Pakai template', 'Full AI', 'Dari gambar DED']);
    expect(res.message).toContain('Jenis / subtipe: Hotmix / Aspal');
    expect(res.message).toContain('Panjang: 1 km (1.000 m)');
  });

  it('S6. Jawaban subtipe DIKETIK ("hotmix") selama pertanyaan aktif → kartu jalur; teks lain → null', () => {
    executeIntent('CREATE_RAB_SUMMARY', undefined, { ...mockCtx, rawText: 'buatkan rab jalan 500 m' } as never);
    // Pesan tanpa subtipe tidak dijawab sebagai subtipe (diproses normal oleh view).
    expect(tryContinueRabSubtype('buka daftar proyek')).toBeNull();
    const res = tryContinueRabSubtype('hotmix');
    expect(res).not.toBeNull();
    const labels = (res!.actions ?? []).map((a) => a.label);
    expect(labels).toEqual(['Pakai template', 'Full AI', 'Dari gambar DED']);
    // Panjang dari pesan awal (500 m) tetap terbawa.
    expect(res!.message).toContain('Panjang: 500 m');
    expect(res!.message).toContain('Hotmix / Aspal');
  });

  it('S7. Ekstraksi kebutuhan linear: "1 km" = panjang 1000 m, BUKAN 1 kamar mandi', () => {
    const n = extractRabNeeds('buatkan saya rab jalan 1km');
    expect(n.kind).toBe('jalan');
    expect(n.lengthM).toBe(1000);
    expect(n.bathrooms).toBeNull();
    const d = extractRabNeeds('buatkan rab drainase u-ditch 250 m');
    expect(d.kind).toBe('drainase');
    expect(d.lengthM).toBe(250);
    // Konteks rumah tidak berubah: "2 km" tetap kamar mandi (singkatan km).
    const h = extractRabNeeds('buatkan rab rumah 2 lantai 3 kt 2 km');
    expect(h.kind).toBe('rumah');
    expect(h.bathrooms).toBe(2);
    expect(h.lengthM).toBeNull();
  });

  it('S8. Deteksi subtipe dari teks per kategori', () => {
    expect(detectSubtypeFromText('jalan', 'buatkan rab jalan paving')?.id).toBe('paving');
    expect(detectSubtypeFromText('jalan', 'jalan rabat beton 500 m')?.id).toBe('beton');
    expect(detectSubtypeFromText('drainase', 'saluran u-ditch 100 m')?.id).toBe('uditch');
    expect(detectSubtypeFromText('jembatan', 'jembatan rangka baja')?.id).toBe('rangka-baja');
    expect(detectSubtypeFromText('rumah', 'rumah 2 lantai')).toBeNull();
  });

  it('S9. Jembatan: route → SUMMARY; tanpa subtipe bertanya "Jembatan apa?"', () => {
    expect(routeIntent('buatkan rab jembatan').intent).toBe('CREATE_RAB_SUMMARY');
    const res = executeIntent('CREATE_RAB_SUMMARY', undefined, { ...mockCtx, rawText: 'buatkan rab jembatan' } as never);
    expect(res.awaitRabSubtype).toBe(true);
    expect(res.message).toContain('Jembatan apa?');
    const labels = (res.actions ?? []).map((a) => a.label);
    expect(labels).toContain('Gelagar Beton');
    expect(labels).not.toContain('Buka Workspace Desain & RAB');
  });

  it('S10. Data grounding: setiap subtipe (kecuali makadam) punya ≥1 template NYATA di katalog; makadam = 0', () => {
    const all = RabTemplateService.getInstance().getAllTemplates();
    expect(all.length).toBeGreaterThanOrEqual(180 - 5); // katalog gabungan ±180
    for (const group of RAB_SUBTYPE_GROUPS) {
      for (const sub of group.subtypes) {
        const hits = findSubtypeTemplates(sub, all);
        if (sub.id === 'makadam') {
          expect(hits.length).toBe(0);
        } else {
          expect(hits.length).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('S11. Prompt Full AI menyusun kebutuhan terkumpul tanpa angka karangan', () => {
    const n = extractRabNeeds('buatkan rab jalan hotmix 1 km');
    n.subtypeId = 'hotmix';
    n.subtypeLabel = 'Hotmix / Aspal';
    const prompt = buildFullAiPrompt(n);
    expect(prompt).toContain('jalan / perkerasan');
    expect(prompt).toContain('Hotmix / Aspal');
    expect(prompt).toContain('1 km');
    expect(prompt).toContain('jangan mengarang angka');
  });
});

describe('Full AI di chat (permintaan owner 2026-10-23)', () => {
  it('S12. Rumah type 45: klik "Pakai AI Full" di kartu pilihan → tabel lengkap + Push (BUKAN prompt LLM)', () => {
    const ctx = { ...mockCtx, rawText: 'buatkan rab rumah type 45' } as never;
    const card = executeIntent('CREATE_RAB_DIRECT', undefined, ctx);
    expect(card.awaitRabChoice).toBe(true);
    const labels = (card.actions ?? []).map((a) => a.label);
    expect(labels).toEqual(['Pakai Template', 'Pakai AI Full']);
    const fullAi = card.actions![1];
    if (fullAi.action.kind !== 'intent') {
      throw new Error('Expected intent action for Pakai AI Full');
    }
    // Intent tombol kini RAB_FULL_AI (dulu OPEN_DESIGN_WORKSPACE keluar chat),
    // param = teks asal kartu seperti tombol "Pakai Template".
    expect(fullAi.action.intent).toBe('RAB_FULL_AI');
    expect(fullAi.action.param).toBe('buatkan rab rumah type 45');

    const res = executeIntent('RAB_FULL_AI', fullAi.action.param, mockCtx as never);
    expect(res.ok).toBe(true);
    // Komposisi deterministik: TIDAK ada fullAiPrompt (tidak diteruskan ke LLM).
    expect(res.fullAiPrompt).toBeUndefined();
    expect(res.message).toContain('| No | Uraian |');
    expect(res.message).toContain('Rumah Type 45');
    expect(res.message).toContain('Total RAB');
    const kinds = (res.actions ?? []).map((a) => a.action.kind);
    expect(kinds).toContain('push-rab');
    const resLabels = (res.actions ?? []).map((a) => a.label);
    expect(resLabels).toContain('Push ke Spreadsheet RAB');
    // State push terisi dari komposisi ini; kartu pilihan terkonsumsi
    // (paritas dengan GENERATE_RAB_TEMPLATE).
    const last = getLastDirectRab();
    expect(last).not.toBeNull();
    expect(last!.houseType).toBe(45);
    expect(getPendingRabChoice()).toBeNull();
  });

  it('S13. Jalan hotmix: klik "Full AI" di kartu jalur → TETAP fullAiPrompt (fallback LLM utuh)', () => {
    const ctx = { ...mockCtx, rawText: 'buatkan rab jalan hotmix 1 km' } as never;
    const card = executeIntent('CREATE_RAB_SUMMARY', undefined, ctx);
    const labels = (card.actions ?? []).map((a) => a.label);
    expect(labels).toEqual(['Pakai template', 'Full AI', 'Dari gambar DED']);
    const fullAi = card.actions![1];
    if (fullAi.action.kind !== 'intent') {
      throw new Error('Expected intent action for Full AI');
    }
    expect(fullAi.action.intent).toBe('RAB_FULL_AI');

    const res = executeIntent('RAB_FULL_AI', fullAi.action.param, mockCtx as never);
    expect(res.ok).toBe(true);
    // Infra belum punya mesin parametrik → fallback lama PERSIS: prompt
    // diteruskan view ke LLM, tanpa tabel karangan dan tanpa tombol Push.
    expect(res.fullAiPrompt).toBeDefined();
    expect(res.fullAiPrompt).toContain('Hotmix / Aspal');
    expect(res.fullAiPrompt).toContain('jangan mengarang angka');
    expect(res.message).toBe('Menyiapkan Full AI dari kebutuhan yang terkumpul…');
    expect(res.message).not.toContain('| No | Uraian |');
    const kinds = (res.actions ?? []).map((a) => a.action.kind);
    expect(kinds).not.toContain('push-rab');
  });
});
