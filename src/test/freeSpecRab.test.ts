/**
 * freeSpecRab.test.ts — RAB langsung dari SPESIFIKASI BEBAS + kartu pilihan
 * template (perintah & desain owner 2026-10-22).
 *
 * Cakupan:
 * - Router: spek terukur (dimensi/luas) → CREATE_RAB_DIRECT; tanpa spek →
 *   CREATE_RAB_SUMMARY; non-rumah & permintaan desain tidak digeser.
 * - Parser: dimensi 5x10 & "6 x 12", luas bangunan + luas lahan eksplisit
 *   (lahan TIDAK terbaca sebagai bangunan), lantai angka & kata bilangan,
 *   KT/KM pola repo, wilayah "di Bogor", regresi type terdaftar (parser
 *   bebas menolaknya), tanpa spek → null.
 * - Generate: item lintas divisi, total == Σ jumlah item, label kejujuran
 *   engine dipertahankan, daftar asumsi transparan (termasuk aturan owner
 *   "Asumsi: 1 lantai (tidak disebutkan)"), indeks wilayah mengubah harga
 *   secara konsisten (Jawa Barat = 0,95 × DKI Jakarta).
 * - Registry: type terdaftar → kartu pilihan (tanpa tabel); klik semantik
 *   GENERATE_RAB_TEMPLATE → tabel seperti jalur lama; spek bebas → tabel
 *   langsung TANPA pilihan template.
 * - Payload push: bentuk baris kompatibel dengan push-rab existing
 *   (generation.workItems yang sama dipakai view.pushDirectRabToSpreadsheet).
 *
 * CATATAN REMEDIASI (2026-10-22, audit S7/S7b + D1 + Fase 8):
 * - S7: "lahan 8x12" sebelumnya terbaca sebagai TAPAK BANGUNAN 96 m² —
 *   kini dimensi lahan (luas lahan 96 m², dicatat, belum dimodelkan) dan
 *   tidak pernah menjadi basis bangunan; "bangunan 5x10" = dimensi
 *   bangunan; "lantai 2" (S7b) sebelumnya menghasilkan floors=10
 *   (menelan ekor dimensi) — kini 2 lantai.
 * - D1: kartu pilihan kini berlabel asal (Dari Anda/Asumsi), menampilkan
 *   KT/KM default template + baris "Luas bangunan" eksplisit, dan koreksi
 *   chat pra-pilih (continueRabChoice) memperbarui kartu + konteks jalur.
 */
import { describe, it, expect } from 'vitest';
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import { executeIntent, continueRabChoice, getPendingRabChoice } from '../ai-tools/ezrab-ai/actionRegistry';
import { parseFreeSpec, buildSpecRab, parseLandAreaM2, parseLandDims, resolveLandAreaM2 } from '../ai-tools/ezrab-ai/specRab';
import { extractRabNeeds } from '../ai-tools/ezrab-ai/rabNeeds';
import { formatDirectRabMessage, getLastDirectRab } from '../ai-tools/ezrab-ai/directRab';

const mockCtx = {
  navigate: () => {},
  currentMenu: 'ezrab-ai',
  activeProject: null,
  projects: [],
  projectTotal: null,
};

describe('router — spesifikasi bebas', () => {
  it('dimensi "5x10" → CREATE_RAB_DIRECT', () => {
    expect(routeIntent('buatkan rab rumah 5x10').intent).toBe('CREATE_RAB_DIRECT');
    expect(routeIntent('buatkan rab rumah ukuran 6 x 12').intent).toBe('CREATE_RAB_DIRECT');
  });

  it('luas bangunan eksplisit → CREATE_RAB_DIRECT', () => {
    expect(routeIntent('buatkan rab rumah luas bangunan 50 m2').intent).toBe('CREATE_RAB_DIRECT');
    expect(routeIntent('buatkan rab rumah 90 m2').intent).toBe('CREATE_RAB_DIRECT');
  });

  it('tanpa spesifikasi terukur → tetap CREATE_RAB_SUMMARY (fallback tidak berubah)', () => {
    expect(routeIntent('buatkan rab rumah').intent).toBe('CREATE_RAB_SUMMARY');
    expect(routeIntent('buatkan rab rumah 2 lantai').intent).toBe('CREATE_RAB_SUMMARY');
  });

  it('non-rumah berdimensi tidak digeser ke DIRECT', () => {
    expect(routeIntent('buatkan rab gedung 5x10').intent).toBe('CREATE_RAB_SUMMARY');
    expect(routeIntent('buatkan rab drainase').intent).toBe('CREATE_RAB_SUMMARY');
  });

  it('"buatkan desain rumah 5x10" TIDAK menjadi DIRECT (permintaan desain)', () => {
    expect(routeIntent('buatkan desain rumah 5x10').intent).not.toBe('CREATE_RAB_DIRECT');
    expect(routeIntent('buat desain rumah 90 m2').intent).toBe('CREATE_RAB_SUMMARY');
  });

  it('regresi: type terdaftar tetap CREATE_RAB_DIRECT', () => {
    expect(routeIntent('buatkan saya rab rumah type 70 2 lantai').intent).toBe('CREATE_RAB_DIRECT');
    expect(routeIntent('buatkan rab rumah tipe 36').intent).toBe('CREATE_RAB_DIRECT');
  });
});

describe('parser spesifikasi bebas', () => {
  it('dimensi 5x10: tapak 50 m², lantai default 1 (tidak disebutkan)', () => {
    const s = parseFreeSpec('buatkan rab rumah 5x10')!;
    expect(s).not.toBeNull();
    expect(s.dims).toEqual({ p: 5, l: 10 });
    expect(s.footprintArea).toBe(50);
    expect(s.totalArea).toBe(50);
    expect(s.areaSource).toBe('dims');
    expect(s.floors).toBe(1);
    expect(s.floorsMentioned).toBe(false);
  });

  it('"6 x 12" dengan spasi + "dua lantai" (kata bilangan) + KT/KM + wilayah', () => {
    const s = parseFreeSpec('buatkan rab rumah 6 x 12, dua lantai, 3 kamar tidur, 2 kamar mandi, di Bogor')!;
    expect(s.dims).toEqual({ p: 6, l: 12 });
    expect(s.floors).toBe(2);
    expect(s.floorsMentioned).toBe(true);
    expect(s.totalArea).toBe(144);
    expect(s.bedrooms).toBe(3);
    expect(s.bathrooms).toBe(2);
    expect(s.location).toBe('Bogor');
  });

  it('pola ringkas "3 KT 2 KM" terbaca', () => {
    const s = parseFreeSpec('buatkan rab rumah 3 KT 2 KM ukuran 7x11')!;
    expect(s.bedrooms).toBe(3);
    expect(s.bathrooms).toBe(2);
    expect(s.footprintArea).toBe(77);
  });

  it('luas bangunan + luas lahan eksplisit: lahan BUKAN luas bangunan', () => {
    const s = parseFreeSpec('buatkan rab rumah luas bangunan 50 m2 luas lahan 90 m2')!;
    expect(s.areaSource).toBe('explicit');
    expect(s.explicitBuildingArea).toBe(50);
    expect(s.totalArea).toBe(50);
    expect(s.landAreaM2).toBe(90);
    expect(parseLandAreaM2('luas tanah 120 m2')).toBe(120);
    expect(parseLandAreaM2('buatkan rab rumah 5x10')).toBeNull();
  });

  it('luas lahan saja (tanpa basis bangunan) → null', () => {
    expect(parseFreeSpec('buatkan rab rumah luas lahan 90 m2')).toBeNull();
  });

  it('type yang BELUM terdaftar (54) menjadi basis luas konvensi tipe', () => {
    const s = parseFreeSpec('buatkan rab rumah type 54')!;
    expect(s.areaSource).toBe('type');
    expect(s.typeNumber).toBe(54);
    expect(s.footprintArea).toBe(54);
    expect(s.totalArea).toBe(54);
  });

  it('regresi: type TERDAFTAR ditolak parser bebas (milik jalur kartu pilihan)', () => {
    expect(parseFreeSpec('buatkan rab rumah type 45')).toBeNull();
    expect(parseFreeSpec('buatkan saya rab rumah type 70 2 lantai')).toBeNull();
    expect(buildSpecRab('buatkan rab rumah type 45')).toBeNull();
  });

  it('tanpa spek / bukan rumah → null', () => {
    expect(parseFreeSpec('buatkan rab rumah')).toBeNull();
    expect(parseFreeSpec('buatkan rab rumah 2 lantai')).toBeNull();
    expect(parseFreeSpec('buatkan rab gedung 5x10')).toBeNull();
    expect(parseFreeSpec('buatkan rab jalan 5x10')).toBeNull();
  });
});

describe('generate RAB spesifikasi bebas', () => {
  it('"buatkan rab rumah 5x10": item lintas divisi, volume > 0, total == Σ item', () => {
    const r = buildSpecRab('buatkan rab rumah 5x10')!;
    expect(r).not.toBeNull();
    expect(r.sourceKind).toBe('spec');
    expect(r.displayLabel).toBe('Rumah 5×10 m');
    expect(r.totalArea).toBe(50);
    expect(r.floors).toBe(1);
    expect(r.calc.items.length).toBeGreaterThanOrEqual(15);
    const categories = new Set(r.calc.items.map((i) => i.category));
    expect(categories.size).toBeGreaterThanOrEqual(5);
    for (const it of r.calc.items) {
      expect(it.volume).toBeGreaterThan(0);
      expect(it.unit.trim().length).toBeGreaterThan(0);
    }
    const sum = r.calc.items.reduce((s, it) => s + (it.totalPrice || 0), 0);
    expect(Math.abs(sum - r.calc.totalDirectCost)).toBeLessThan(1);
    expect(r.calc.totalDirectCost).toBeGreaterThan(0);
  });

  it('label kejujuran engine dipertahankan persis (status total + harga tak tersedia)', () => {
    // REMEDIASI S2/Fase 8: ekspektasi berubah dari INDICATIVE -> INCOMPLETE
    // karena perilaku engine memang berubah — item yang belum berharga
    // kini jujur belum berharga (fallback datar Rp150.000 dihapus),
    // sehingga total adalah total PARSIAL dan tidak boleh lagi berlabel
    // INDICATIVE final.
    // PEMBARUAN WS-1: hitungan item tak berharga 10 -> 6. Empat kode
    // terpetakan ke entri benchmark yang identitasnya terbukti sama
    // (bouwplank, keramik 40x40, rangka atap, genteng metal); 6 kode lain
    // tetap PRICE_UNAVAILABLE (termasuk plesteran 1:4 dan kloset, yang
    // kandidat pemetaannya DITOLAK karena identitas berbeda).
    // Aseri diikat ke kontrak engine (status + daftar item tak berharga),
    // bukan ke redaksi kalimat lapisan pesan yang sedang dikerjakan
    // jalur paralel di ezrab-ai/*.
    const r = buildSpecRab('buatkan rab rumah 5x10')!;
    expect(r.generation.totalStatus).toBe('INCOMPLETE');
    expect(r.generation.unpricedItemCount).toBe(6);
    const msg = formatDirectRabMessage(r);
    expect(msg).toContain('| No | Uraian | Volume | Satuan | Harga Satuan | Jumlah |');
    expect(msg).toContain('Status total: **INCOMPLETE**');
    expect(msg).toContain('Push ke Spreadsheet RAB');
  });

  it('asumsi transparan: lantai default owner + basis template + tapak', () => {
    const r = buildSpecRab('buatkan rab rumah 5x10')!;
    expect(r.assumptions.some((a) => a.includes('Asumsi: 1 lantai (tidak disebutkan)'))).toBe(true);
    expect(r.assumptions.some((a) => a.includes('template parametrik'))).toBe(true);
    expect(r.assumptions.some((a) => a.includes('5 × 10 m'))).toBe(true);
    const msg = formatDirectRabMessage(r);
    expect(msg).toContain('**Asumsi yang dipakai**');
    expect(msg).toContain('Asumsi: 1 lantai (tidak disebutkan)');
  });

  it('luas lahan dicatat sebagai asumsi terbuka: belum memengaruhi hitungan', () => {
    const r = buildSpecRab('buatkan rab rumah 5x10 luas lahan 90 m2')!;
    expect(r.assumptions.some((a) => a.includes('Luas lahan 90 m² dicatat'))).toBe(true);
    expect(r.assumptions.some((a) => a.includes('belum memengaruhi hitungan'))).toBe(true);
  });

  it('wilayah "di Bogor": indeks Jawa Barat mengubah harga konsisten (0,95 × Jakarta)', () => {
    const jkt = buildSpecRab('buatkan rab rumah 6x12 dua lantai')!;
    const bgr = buildSpecRab('buatkan rab rumah 6x12 dua lantai di Bogor')!;
    expect(jkt.region).toBe('DKI Jakarta');
    expect(bgr.region).toBe('Jawa Barat');
    expect(bgr.floors).toBe(2);
    expect(bgr.totalArea).toBe(144);
    expect(bgr.calc.totalDirectCost).toBeLessThan(jkt.calc.totalDirectCost);
    const ratio = bgr.calc.totalDirectCost / jkt.calc.totalDirectCost;
    expect(Math.abs(ratio - 0.95)).toBeLessThan(0.02);
  });

  it('luas bangunan eksplisit + KT/KM disebut: tanpa asumsi default kamar', () => {
    const r = buildSpecRab('buatkan rab rumah luas bangunan 50 m2, 3 kamar tidur, 2 kamar mandi')!;
    expect(r.totalArea).toBe(50);
    expect(r.assumptions.some((a) => a.includes('luas TOTAL seluruh lantai'))).toBe(true);
    expect(r.assumptions.some((a) => a.includes('mengikuti default basis template'))).toBe(false);
    // Dimensi tidak disebut → diturunkan proporsi 1:2 dan dinyatakan.
    expect(r.assumptions.some((a) => a.includes('proporsi 1 : 2'))).toBe(true);
  });

  it('type 54 (belum terdaftar) ter-generate dengan asumsi konvensi tipe', () => {
    const r = buildSpecRab('buatkan rab rumah type 54')!;
    expect(r).not.toBeNull();
    expect(r.calc.items.length).toBeGreaterThanOrEqual(15);
    expect(r.assumptions.some((a) => a.includes('Type 54 belum memiliki template terdaftar'))).toBe(true);
  });

  it('3 lantai → null (di luar model engine; pemanggil jatuh ke ringkasan)', () => {
    expect(buildSpecRab('buatkan rab rumah 5x10 3 lantai')).toBeNull();
  });

  it('payload push kompatibel: workItems siap dipetakan seperti view existing', () => {
    const r = buildSpecRab('buatkan rab rumah 5x10')!;
    // Pemetaan yang sama persis dengan pushDirectRabToSpreadsheet di view.tsx.
    const payload = r.generation.workItems
      .filter((w) => Number.isFinite(w.quantity) && w.quantity > 0)
      .map((wi) => ({
        description: `[Chat AI] ${wi.name}`,
        volume: wi.quantity,
        unit: wi.unit,
        code: wi.ahspCode ?? wi.workItemId,
        category: wi.category,
        priceStatus: 'PRICE_UNRESOLVED' as const,
        volumeSource: 'AI_GENERATED' as const,
        ...(wi.ahspCode ? { ahspCode: wi.ahspCode } : {}),
      }));
    expect(payload.length).toBeGreaterThanOrEqual(15);
    for (const p of payload) {
      expect(p.description.startsWith('[Chat AI] ')).toBe(true);
      expect(p.volume).toBeGreaterThan(0);
      expect(p.unit.trim().length).toBeGreaterThan(0);
      expect(typeof p.code).toBe('string');
      expect(p.code.length).toBeGreaterThan(0);
    }
    // Hasil terakhir tersimpan untuk tombol Push (mekanisme existing).
    expect(getLastDirectRab()).toBe(r);
  });
});

describe('remediasi S7 — lahan vs bangunan', () => {
  it('"lahan 8x12" = dimensi LAHAN (96 m²), BUKAN tapak bangunan → tanpa basis bangunan = null', () => {
    expect(parseLandDims('buatkan rab rumah lahan 8x12')).toEqual({ p: 8, l: 12 });
    expect(resolveLandAreaM2('buatkan rab rumah lahan 8x12')).toBe(96);
    expect(parseFreeSpec('buatkan rab rumah lahan 8x12')).toBeNull();
  });

  it('"lahan 8x12 bangunan 5x10": tapak dari bangunan, lahan tercatat 96 m²', () => {
    const s = parseFreeSpec('buatkan rab rumah lahan 8x12 bangunan 5x10')!;
    expect(s).not.toBeNull();
    expect(s.dims).toEqual({ p: 5, l: 10 });
    expect(s.footprintArea).toBe(50);
    expect(s.landAreaM2).toBe(96);
  });

  it('"bangunan 5x10" = dimensi bangunan; tanpa lahan', () => {
    const s = parseFreeSpec('buatkan rab rumah bangunan 5x10')!;
    expect(s.dims).toEqual({ p: 5, l: 10 });
    expect(s.footprintArea).toBe(50);
    expect(s.landAreaM2).toBeNull();
  });

  it('"lahan 90 m2, bangunan 45 m2": keduanya terpisah benar', () => {
    const s = parseFreeSpec('buatkan rab rumah, lahan 90 m2, bangunan 45 m2')!;
    expect(s.landAreaM2).toBe(90);
    expect(s.explicitBuildingArea).toBe(45);
    expect(s.totalArea).toBe(45);
  });

  it('generate dengan lahan berdimensi: asumsi menyebut dimensi lahan + belum memengaruhi hitungan', () => {
    const r = buildSpecRab('buatkan rab rumah lahan 8x12 bangunan 5x10')!;
    expect(r).not.toBeNull();
    expect(r.totalArea).toBe(50);
    expect(r.assumptions.some((a) => a.includes('Luas lahan 96 m² (dari dimensi lahan 8 × 12 m)'))).toBe(true);
    expect(r.assumptions.some((a) => a.includes('belum memengaruhi hitungan'))).toBe(true);
  });

  it('S7b: "lantai 2" dikenali sebagai 2 lantai (bukan lagi 10 dari ekor dimensi)', () => {
    const s = parseFreeSpec('buatkan rab rumah 5x10 lantai 2')!;
    expect(s.floors).toBe(2);
    expect(s.floorsMentioned).toBe(true);
    const r = buildSpecRab('buatkan rab rumah 5x10 lantai 2')!;
    expect(r).not.toBeNull();
    expect(r.floors).toBe(2);
    expect(r.totalArea).toBe(100);
  });

  it('regresi bentuk kanonis: "2 lantai, 3 kamar tidur" tetap lantai 2 (bukan 3)', () => {
    expect(extractRabNeeds('2 lantai, 3 kamar tidur').floors).toBe(2);
    expect(extractRabNeeds('2 lantai 3 kamar tidur').floors).toBe(2);
    expect(extractRabNeeds('lantai 2').floors).toBe(2);
  });

  it('router + registry: "lahan 8x12" saja jatuh ke ringkasan (tidak mengarang RAB 96 m²)', () => {
    expect(routeIntent('buatkan rab rumah lahan 8x12').intent).toBe('CREATE_RAB_DIRECT');
    const ctx = { ...mockCtx, rawText: 'buatkan rab rumah lahan 8x12' } as never;
    const res = executeIntent('CREATE_RAB_DIRECT', undefined, ctx);
    expect(res.message).not.toContain('| No | Uraian |');
    expect(res.message).toContain('ringkasan kebutuhan');
  });
});

describe('remediasi D1 — kartu pilihan berlabel + koreksi pra-pilih', () => {
  it('kartu type 45 polos: Luas bangunan eksplisit + label Asumsi untuk lantai & KT/KM default', () => {
    const ctx = { ...mockCtx, rawText: 'buatkan rab rumah type 45' } as never;
    const res = executeIntent('CREATE_RAB_DIRECT', undefined, ctx);
    expect(res.awaitRabChoice).toBe(true);
    expect(res.message).toContain('Luas bangunan: 45 m² — Dari Anda');
    expect(res.message).toContain('Jumlah lantai: 1 lantai — Asumsi');
    expect(res.message).toContain('Kamar tidur: 2 — Asumsi (default template)');
    expect(res.message).toContain('Kamar mandi: 1 — Asumsi (default template)');
    expect(res.message).toContain('Koreksi langsung di chat');
    expect(res.message).not.toContain('Luas lahan');
  });

  it('kartu type 45 + lahan + Bogor: lahan & lokasi berlabel Dari Anda sebagai nilai berbeda', () => {
    const ctx = { ...mockCtx, rawText: 'buatkan rab rumah type 45 luas lahan 90 m2 di Bogor' } as never;
    const res = executeIntent('CREATE_RAB_DIRECT', undefined, ctx);
    expect(res.message).toContain('Luas bangunan: 45 m² — Dari Anda');
    expect(res.message).toContain('Luas lahan: 90 m² — Dari Anda');
    expect(res.message).toContain('belum memengaruhi hitungan RAB');
    expect(res.message).toContain('Lokasi: Bogor — Dari Anda → indeks harga Jawa Barat');
  });

  it('koreksi "2 lantai, 3 kamar tidur" memperbarui kartu; kedua jalur memakai spek terkoreksi', () => {
    const ctx = { ...mockCtx, rawText: 'buatkan rab rumah type 45 di Bogor' } as never;
    executeIntent('CREATE_RAB_DIRECT', undefined, ctx);
    const corr = continueRabChoice('2 lantai, 3 kamar tidur');
    expect(corr.awaitRabChoice).toBe(true);
    expect(corr.message).toContain('kartu pilihan saya perbarui');
    expect(corr.message).toContain('Jumlah lantai: 2 lantai — Dari Anda');
    expect(corr.message).toContain('Kamar tidur: 3 — Dari Anda');
    expect(corr.message).toContain('Kamar mandi: 1 — Asumsi (default template)');
    expect(corr.message).toContain('Luas bangunan: 45 m² per lantai (total ±90 m²)');
    expect(getPendingRabChoice()?.floors).toBe(2);
    // Jalur AI Full: prompt membawa spek terkoreksi.
    const ai = corr.actions![1];
    if (ai.action.kind === 'intent') {
      expect(ai.action.param).toContain('2 lantai');
      expect(ai.action.param).toContain('3 kamar tidur');
    } else {
      throw new Error('Expected intent action for Pakai AI Full');
    }
    // Jalur Template: generate memakai lantai terkoreksi, pending terkonsumsi.
    const gen = executeIntent('GENERATE_RAB_TEMPLATE', 'buatkan rab rumah type 45 di Bogor', mockCtx as never);
    expect(gen.message).toContain('Rumah Type 45 (2 lantai, luas total ±90 m²)');
    expect(getPendingRabChoice()).toBeNull();
  });
});

describe('registry — pilihan template vs spek bebas', () => {
  it('type 45 + lahan + wilayah → kartu pilihan berisi ringkasan spek, TANPA tabel', () => {
    const ctx = { ...mockCtx, rawText: 'buatkan rab rumah type 45 luas lahan 90 m2 di Bogor' } as never;
    const res = executeIntent('CREATE_RAB_DIRECT', undefined, ctx);
    expect(res.ok).toBe(true);
    expect(res.message).not.toContain('| No | Uraian |');
    expect(res.message).toContain('Rumah Type 45');
    expect(res.message).toContain('Luas lahan: 90 m²');
    expect(res.message).toContain('Jawa Barat');
    const labels = (res.actions ?? []).map((a) => a.label);
    expect(labels).toEqual(['Pakai Template', 'Pakai AI Full']);
  });

  it('klik semantik "Pakai Template" (GENERATE_RAB_TEMPLATE) → tabel + Push, sama seperti jalur lama', () => {
    const res = executeIntent('GENERATE_RAB_TEMPLATE', 'buatkan rab rumah type 45', mockCtx as never);
    expect(res.ok).toBe(true);
    expect(res.message).toContain('| No | Uraian | Volume | Satuan | Harga Satuan | Jumlah |');
    expect(res.message).toContain('Type 45');
    const labels = (res.actions ?? []).map((a) => a.label);
    expect(labels).toContain('Push ke Spreadsheet RAB');
    expect(labels).toContain('Buka Spreadsheet RAB');
  });

  it('spek bebas 5x10 → tabel langsung, TIDAK ada pilihan template', () => {
    const ctx = { ...mockCtx, rawText: 'buatkan rab rumah 5x10' } as never;
    const res = executeIntent('CREATE_RAB_DIRECT', undefined, ctx);
    expect(res.ok).toBe(true);
    expect(res.message).toContain('| No | Uraian |');
    expect(res.message).toContain('Rumah 5×10 m');
    const labels = (res.actions ?? []).map((a) => a.label);
    expect(labels).not.toContain('Pakai Template');
    expect(labels).not.toContain('Pakai AI Full');
    expect(labels).toContain('Push ke Spreadsheet RAB');
  });

  it('tanpa spek sama sekali lewat DIRECT → jatuh ke ringkasan kebutuhan', () => {
    const ctx = { ...mockCtx, rawText: 'buatkan rab rumah' } as never;
    const res = executeIntent('CREATE_RAB_DIRECT', undefined, ctx);
    expect(res.message).not.toContain('| No | Uraian |');
    expect(res.message).toContain('ringkasan kebutuhan');
  });
});
