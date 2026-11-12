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
 *
 * CATATAN PERUBAHAN SPESIFIKASI (Gelombang 2, 2026-11-13 — jalur
 * UNIVERSAL menggantikan desain klarifikasi 2026-10-23): desain "tanya
 * subtipe dulu" (5b, S1–S6, S9) dan kartu pilihan untuk tipe terdaftar
 * (5a, 5a3 — diganti exact-match direct 2026-10-27) sudah digantikan
 * jalur universal 2026-10-26. 12 pin yang mem-pin desain lama (5a, 5a3,
 * 5b, S1, S2, S3, S4, S5, S6, S9, S12, S13) DIPERBARUI TERBUKA di sini —
 * masing-masing dengan alasan satu baris di komentarnya. Perilaku produk
 * TIDAK diubah untuk menyesuaikan pin lama; pin lain (termasuk S7, S8,
 * S10, S11) TIDAK diubah.
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
  it('5a. CREATE_RAB_DIRECT bertipe TEPAT → langsung tabel RAB + Push (kartu pilihan diganti 2026-10-27)', () => {
    // DIPERBARUI TERBUKA (Gelombang 2, 2026-11-13 — jalur universal):
    // perbaikan exact-match 2026-10-27 (actionRegistry CREATE_RAB_DIRECT)
    // menggantikan kartu pilihan 2026-10-22 untuk permintaan bertipe
    // TERDAFTAR: tabel RAB + tombol Push lahir langsung dari teks
    // ketikan. Kartu pilihan HANYA bertahan untuk basis fallback-luas
    // (tanpa tipe — lihat S12). Pin lama (kartu pilihan untuk tipe
    // terdaftar) mem-pin desain yang sudah digantikan.
    const ctx = { ...mockCtx, rawText: 'buatkan saya rab rumah type 70 2 lantai' } as never;
    const res = executeIntent('CREATE_RAB_DIRECT', undefined, ctx);
    expect(res.ok).toBe(true);
    expect(res.awaitRabChoice).toBeFalsy();
    expect(res.message).toContain('| No | Uraian |');
    expect(res.message).toContain('Rumah Type 70');
    expect(res.message).toContain('2 lantai');
    expect(res.message).toContain('luas total ±140 m²');
    const labels = (res.actions ?? []).map((a) => a.label);
    expect(labels).toEqual(['Push ke Spreadsheet RAB', 'Buka Spreadsheet RAB', 'Buka Workspace Desain & RAB']);
    const kinds = (res.actions ?? []).map((a) => a.action.kind);
    expect(kinds).toContain('push-rab');
  });

  it('5a3. Tabel direct 2 lantai: nama basis template TIDAK mengklaim "(1 Lantai)" (WS-2, temuan QA Fase 9)', () => {
    // DIPERBARUI TERBUKA (Gelombang 2, 2026-11-13): substansi WS-2
    // TIDAK berubah — yang berubah hanya permukaan: nama basis kini
    // tampil di pesan tabel direct (bukan kartu pilihan yang sudah
    // digantikan 2026-10-27 untuk tipe terdaftar).
    const ctx = { ...mockCtx, rawText: 'buatkan rab rumah type 45 2 lantai' } as never;
    const res = executeIntent('CREATE_RAB_DIRECT', undefined, ctx);
    expect(res.ok).toBe(true);
    expect(res.message).toContain('Rumah Type 45 (2 lantai, luas total ±90 m²)');
    expect(res.message).toContain('(Rumah Tinggal Menengah Tipe 45)');
    expect(res.message).not.toContain('(1 Lantai)');
    // Tabel 1 lantai mempertahankan nama registri persis (klaimnya benar).
    const ctx1 = { ...mockCtx, rawText: 'buatkan rab rumah type 45' } as never;
    const res1 = executeIntent('CREATE_RAB_DIRECT', undefined, ctx1);
    expect(res1.message).toContain('Rumah Type 45 (1 lantai, luas total ±45 m²)');
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

  it('5b. Pekerjaan non-bangunan tidak ditawari workspace desain rumah (2026-10-26: drainase tanpa panjang → needs-spec universal)', () => {
    // DIPERBARUI TERBUKA (Gelombang 2, 2026-11-13 — jalur universal):
    // desain klarifikasi 2026-10-23 (tanya subtipe dulu) digantikan
    // jalur universal 2026-10-26: drainase tanpa panjang menjawab
    // needs-spec (meminta panjang), TANPA pertanyaan subtipe dan tanpa
    // tombol apa pun; RAB_SUBTYPE_SELECT tanpa konteks aktif menjawab
    // ok:false "Konteks pertanyaan subtipe sudah tidak aktif".
    const ctx = { ...mockCtx, rawText: 'buatkan rab drainase' } as never;
    const res = executeIntent('CREATE_RAB_SUMMARY', undefined, ctx);
    expect(res.ok).toBe(true);
    const labels = (res.actions ?? []).map((a) => a.label);
    expect(labels).not.toContain('Buka Workspace Desain & RAB');
    expect(res.openDesignStudio).toBeFalsy();
    expect(res.awaitRabSubtype).toBeFalsy();
    expect(res.message).toContain('Untuk Drainase & Saluran saya belum bisa menghitung volume secara bertanggung jawab');
    expect(res.message).toContain('panjang (meter)');
    expect(labels).not.toContain('U-Ditch Pracetak');
    expect(labels).not.toContain('Pakai template');
    // Tanpa pertanyaan subtipe yang aktif, pilih subtipe ditolak jujur.
    const card = executeIntent('RAB_SUBTYPE_SELECT', 'uditch', mockCtx as never);
    expect(card.ok).toBe(false);
    expect(card.message).toContain('Konteks pertanyaan subtipe sudah tidak aktif');
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

describe('Klarifikasi subtipe RAB (desain 2026-10-23 DIGANTIKAN jalur universal 2026-10-26 — Gelombang 2)', () => {
  it('S1. "buatkan saya rab jalan 1km" → draft universal langsung (Rigid Pavement, panjang 1.000 m) — tanpa "Jalan apa?"', () => {
    // DIPERBARUI TERBUKA (Gelombang 2, 2026-11-13 — jalur universal):
    // desain klarifikasi 2026-10-23 digantikan jalur universal
    // 2026-10-26: jalan dengan panjang cukup langsung menjadi draft
    // (template default Rigid Pavement bila subtipe tak disebut).
    // Pin lama ("Jalan apa?" + tombol subtipe) mem-pin desain lama.
    expect(routeIntent('buatkan saya rab jalan 1km').intent).toBe('CREATE_RAB_SUMMARY');
    const ctx = { ...mockCtx, rawText: 'buatkan saya rab jalan 1km' } as never;
    const res = executeIntent('CREATE_RAB_SUMMARY', undefined, ctx);
    expect(res.ok).toBe(true);
    expect(res.awaitRabSubtype).toBeFalsy();
    expect(res.message).not.toContain('Jalan apa?');
    expect(res.message).toContain('draft RAB **Jalan & Perkerasan**');
    expect(res.message).toContain('panjang 1.000 m');
    expect(res.message).toContain('Jalan Beton Semen (Rigid Pavement)');
    const labels = (res.actions ?? []).map((a) => a.label);
    expect(labels).toEqual(['Push ke Spreadsheet', 'Buka Spreadsheet RAB']);
    expect(labels).not.toContain('Hotmix / Aspal');
    expect(labels).not.toContain('Pakai template');
    expect(res.openDesignStudio).toBeFalsy();
  });

  it('S2. RAB_SUBTYPE_SELECT sesudah draft universal → ok:false (tidak ada pertanyaan subtipe yang aktif)', () => {
    // DIPERBARUI TERBUKA (Gelombang 2, 2026-11-13 — jalur universal):
    // jalur universal tidak pernah menyetel pendingSubtypeNeeds, jadi
    // klik subtipe sesudah seed jalan menjawab ok:false dengan pesan
    // "Konteks pertanyaan subtipe sudah tidak aktif" — bukan kartu
    // jalur. Pin lama mem-pin desain klarifikasi 2026-10-23.
    executeIntent('CREATE_RAB_SUMMARY', undefined, { ...mockCtx, rawText: 'buatkan saya rab jalan 1km' } as never);
    const res = executeIntent('RAB_SUBTYPE_SELECT', 'hotmix', mockCtx as never);
    expect(res.ok).toBe(false);
    expect(res.awaitRabSubtype).toBeFalsy();
    expect(res.message).toContain('Konteks pertanyaan subtipe sudah tidak aktif');
    expect((res.actions ?? []).length).toBe(0);
  });

  it('S3. RAB_PATH_TEMPLATE sesudah pertanyaan intake universal → ok:false (tidak ada konteks RAB jalur lama)', () => {
    // DIPERBARUI TERBUKA (Gelombang 2, 2026-11-13 — jalur universal):
    // "jalan hotmix 1 km" kini dijawab pertanyaan intake universal
    // (meminta lebar) yang tidak menyetel konteks jalur-template lama;
    // RAB_PATH_TEMPLATE tanpa konteks menjawab ok:false "Konteks
    // RAB-nya sudah tidak aktif". Pin lama mem-pin desain 2026-10-23.
    executeIntent('CREATE_RAB_SUMMARY', undefined, { ...mockCtx, rawText: 'buatkan rab jalan hotmix 1 km' } as never);
    const res = executeIntent('RAB_PATH_TEMPLATE', undefined, mockCtx as never);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('Konteks RAB-nya sudah tidak aktif');
    expect((res.actions ?? []).length).toBe(0);
  });

  it('S4. RAB_PATH_TEMPLATE sesudah pertanyaan intake universal (makadam) → ok:false, sama seperti hotmix', () => {
    // DIPERBARUI TERBUKA (Gelombang 2, 2026-11-13 — jalur universal):
    // sama seperti S3: tidak ada konteks jalur-template lama yang
    // aktif pada jalur universal; subtipe apa pun (termasuk makadam)
    // menjawab ok:false yang sama. Pin lama mem-pin desain 2026-10-23
    // (dan premis "makadam tanpa template" sudah tidak benar sejak
    // INFRA-ROAD-MACADAM / F.46 — lihat S10).
    executeIntent('CREATE_RAB_SUMMARY', undefined, { ...mockCtx, rawText: 'buatkan rab jalan makadam 2 km' } as never);
    const res = executeIntent('RAB_PATH_TEMPLATE', undefined, mockCtx as never);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('Konteks RAB-nya sudah tidak aktif');
    expect((res.actions ?? []).length).toBe(0);
  });

  it('S5. "buatkan rab jalan hotmix 1 km" → pertanyaan intake universal meminta LEBAR (bukan kartu jalur)', () => {
    // DIPERBARUI TERBUKA (Gelombang 2, 2026-11-13 — jalur universal):
    // subtipe disebut di teks tidak lagi memunculkan kartu jalur;
    // jalur universal mencatat subtipe + panjang lalu menanyakan
    // dimensi pasangan yang hilang (lebar jalan). Pin lama mem-pin
    // desain klarifikasi 2026-10-23.
    const ctx = { ...mockCtx, rawText: 'buatkan rab jalan hotmix 1 km' } as never;
    const res = executeIntent('CREATE_RAB_SUMMARY', undefined, ctx);
    expect(res.awaitRabSubtype).toBeFalsy();
    expect(res.message).not.toContain('Jalan apa?');
    expect(res.message).toContain('Jalan aspal / hotmix');
    expect(res.message).toContain('lebar jalan');
    expect(res.message).toContain('panjang pekerjaan 1.000 m');
    const labels = (res.actions ?? []).map((a) => a.label);
    expect(labels).toEqual(['Susun brief sekarang', 'Mulai manual']);
    expect(labels).not.toContain('Pakai template');
  });

  it('S6. tryContinueRabSubtype → null selalu (tidak ada pertanyaan subtipe yang pernah aktif)', () => {
    // DIPERBARUI TERBUKA (Gelombang 2, 2026-11-13 — jalur universal):
    // karena jalur universal tidak pernah membuka pertanyaan subtipe,
    // jawaban diketik apa pun ("hotmix" sekalipun) bukan lanjutan
    // subtipe — tryContinueRabSubtype mengembalikan null dan pesan
    // diproses normal oleh view. Pin lama mem-pin desain 2026-10-23.
    executeIntent('CREATE_RAB_SUMMARY', undefined, { ...mockCtx, rawText: 'buatkan rab jalan 500 m' } as never);
    expect(tryContinueRabSubtype('buka daftar proyek')).toBeNull();
    expect(tryContinueRabSubtype('hotmix')).toBeNull();
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

  it('S9. Jembatan: route → SUMMARY; tanpa bentang → pertanyaan intake universal meminta BENTANG', () => {
    // DIPERBARUI TERBUKA (Gelombang 2, 2026-11-13 — jalur universal):
    // "Jembatan apa?" (2026-10-23) digantikan pertanyaan intake
    // universal yang meminta dimensi yang hilang (bentang). Pin lama
    // mem-pin desain klarifikasi 2026-10-23.
    expect(routeIntent('buatkan rab jembatan').intent).toBe('CREATE_RAB_SUMMARY');
    const res = executeIntent('CREATE_RAB_SUMMARY', undefined, { ...mockCtx, rawText: 'buatkan rab jembatan' } as never);
    expect(res.awaitRabSubtype).toBeFalsy();
    expect(res.message).not.toContain('Jembatan apa?');
    expect(res.message).toContain('Jembatan');
    expect(res.message).toContain('bentang jembatan');
    const labels = (res.actions ?? []).map((a) => a.label);
    expect(labels).toEqual(['Susun brief sekarang', 'Mulai manual']);
    expect(labels).not.toContain('Gelagar Beton');
    expect(labels).not.toContain('Buka Workspace Desain & RAB');
  });

  it('S10. Data grounding: setiap subtipe punya ≥1 template NYATA di katalog (pengecualian makadam DIHAPUS)', () => {
    // DIPERBARUI TERBUKA (keputusan katalog owner 2026-11-12 03:41):
    // subtipe 'makadam' (label gabungan 'Telford / makadam' —
    // rabSubtypes.ts:78, detect mencakup telford) kini punya 1
    // template NYATA (INFRA-ROAD-MACADAM, F.46), jadi pengecualian
    // "makadam = 0" tidak lagi benar. Semua subtipe kini harus punya
    // ≥1 template. Bukan pelemahan: yang berubah adalah fakta
    // katalog atas perintah owner, bukan ambang tes. Subtipe tanpa
    // template kini TIDAK ADA — telford bukan id subtipe terpisah
    // (tergabung dalam id 'makadam').
    const all = RabTemplateService.getInstance().getAllTemplates();
    expect(all.length).toBeGreaterThanOrEqual(180 - 5); // katalog gabungan ±180
    for (const group of RAB_SUBTYPE_GROUPS) {
      for (const sub of group.subtypes) {
        const hits = findSubtypeTemplates(sub, all);
        expect(hits.length).toBeGreaterThanOrEqual(1);
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
  it('S12. Fallback luas 75 m²: klik "Pakai AI Full" di kartu pilihan → tabel lengkap + Push (BUKAN prompt LLM)', () => {
    // DIPERBARUI TERBUKA (Gelombang 2, 2026-11-13): kartu pilihan
    // HANYA bertahan untuk basis fallback-luas (teks menyebut luas
    // SAJA, tanpa tipe — directRab areaFallback); permintaan bertipe
    // terdaftar langsung direct sejak 2026-10-27 (lihat 5a). Seed
    // diganti 'luas bangunan 75 m2' (fallback → Type 70 terdekat);
    // substansi tes TIDAK berubah: klik Pakai AI Full menyusun
    // deterministik (tabel + Push, tanpa fullAiPrompt), state push
    // terisi, kartu terkonsumsi.
    const ctx = { ...mockCtx, rawText: 'buatkan rab rumah luas bangunan 75 m2' } as never;
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
    expect(fullAi.action.param).toBe('buatkan rab rumah luas bangunan 75 m2');

    const res = executeIntent('RAB_FULL_AI', fullAi.action.param, mockCtx as never);
    expect(res.ok).toBe(true);
    // Komposisi deterministik: TIDAK ada fullAiPrompt (tidak diteruskan ke LLM).
    expect(res.fullAiPrompt).toBeUndefined();
    expect(res.message).toContain('| No | Uraian |');
    expect(res.message).toContain('Rumah Type 70');
    expect(res.message).toContain('luas total ±75 m²');
    expect(res.message).toContain('Total RAB');
    const kinds = (res.actions ?? []).map((a) => a.action.kind);
    expect(kinds).toContain('push-rab');
    const resLabels = (res.actions ?? []).map((a) => a.label);
    expect(resLabels).toContain('Push ke Spreadsheet RAB');
    // State push terisi dari komposisi ini; kartu pilihan terkonsumsi
    // (paritas dengan GENERATE_RAB_TEMPLATE).
    const last = getLastDirectRab();
    expect(last).not.toBeNull();
    expect(last!.houseType).toBe(70);
    expect(getPendingRabChoice()).toBeNull();
  });

  it('S13. Jalan hotmix: RAB_FULL_AI dengan prompt terbangun → TETAP fullAiPrompt (fallback LLM utuh)', () => {
    // DIPERBARUI TERBUKA (Gelombang 2, 2026-11-13 — jalur universal):
    // kartu jalur 2026-10-23 (sumber tombol Full AI) sudah tidak ada —
    // "jalan hotmix 1 km" kini dijawab pertanyaan intake universal
    // (meminta lebar, tanpa tombol Full AI). Prompt Full AI kini
    // dibangun langsung lewat buildFullAiPrompt (helper yang sama
    // dengan yang dipakai kartu lama — lihat S11); substansi tes
    // TIDAK berubah: fallback LLM utuh (fullAiPrompt + pesan
    // "Menyiapkan Full AI…", tanpa tabel dan tanpa Push).
    // NETRALISASI STATE (state sekuensial antar-tes): kartu S12
    // menyetel lastRabNeeds ke kebutuhan rumah; RAB_FULL_AI akan
    // menyusun dari kebutuhan basi itu (kelas kebocoran lintas-topik
    // yang sama dengan yang diperbaiki 2026-11-08 untuk
    // universalResultFor — DILAPORKAN, tidak diperbaiki di blok ini).
    // Seed draft universal jalan 1 km membersihkan lastRabNeeds
    // (universalResultFor) sehingga fallback LLM teruji murni.
    const ctx = { ...mockCtx, rawText: 'buatkan rab jalan hotmix 1 km' } as never;
    const intake = executeIntent('CREATE_RAB_SUMMARY', undefined, ctx);
    expect(intake.message).toContain('lebar jalan');
    const intakeLabels = (intake.actions ?? []).map((a) => a.label);
    expect(intakeLabels).toEqual(['Susun brief sekarang', 'Mulai manual']);
    // Netralisasi: draft universal membersihkan lastRabNeeds basi.
    executeIntent('CREATE_RAB_SUMMARY', undefined, { ...mockCtx, rawText: 'buatkan saya rab jalan 1km' } as never);

    const n = extractRabNeeds('buatkan rab jalan hotmix 1 km');
    n.subtypeId = 'hotmix';
    n.subtypeLabel = 'Hotmix / Aspal';
    const prompt = buildFullAiPrompt(n);
    const res = executeIntent('RAB_FULL_AI', prompt, mockCtx as never);
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
