/**
 * Test: Gerbang klarifikasi MATERIAL sebelum draft RAB (perintah owner
 * 2026-11-10).
 *
 * Kasus pemicu (screenshot owner): "buatkan rab pemasangan rangka atap
 * dengan lebar 5 x 9" langsung disusun menjadi draft template "Sistem
 * Atap Metal Standing Seam + Insulasi (Bangunan Komersial)" tanpa pernah
 * menanyakan bahan. Owner: "saya ingin ketika bertanya seperti ini ezrab
 * ai menanyakan kembali secara detail material apa bahan apa".
 *
 * Skenario:
 *  (a) permintaan atap generik + dimensi → PERTANYAAN klarifikasi bahan
 *      (bukan draft), pilihan = template NYATA katalog;
 *  (b) jawaban (klik tombol / ketik) → draft mengikuti jawaban persis;
 *      jawaban bahan TANPA template (baja ringan) → jawaban jujur +
 *      jalur Full AI berbahan itu, BUKAN draft template lain;
 *  (c) bahan disebut sejak awal → tanpa tanya ulang: yang bertemplate
 *      langsung draft; yang belum bertemplate langsung jawaban jujur;
 *  (d) afirmasi "itu aja" di tengah klarifikasi → draft dengan ASUMSI
 *      TERBUKA tercantum di dalam draft (aturan afirmasi owner 2026-11-06);
 *  (e) alur lama tidak berubah: jalan (jalur universal) & rumah
 *      (ringkasan kebutuhan) berperilaku persis baseline;
 *  (f) kejujuran harga utuh: item tanpa harga tetap berlabel
 *      "Harga belum tersedia", tidak ada harga karangan dari klarifikasi.
 */
import { describe, it, expect } from 'vitest';
import {
  executeIntent, tryContinueRabMaterial, getPendingRabMaterial,
} from '../ai-tools/ezrab-ai/actionRegistry';
import {
  RAB_MATERIAL_GROUPS, classifyMaterialText, materialGroupForScope,
} from '../ai-tools/ezrab-ai/rabMaterialClarify';
import { RabTemplateService } from '../services/rabTemplateService';

const mockCtx = {
  navigate: () => {},
  currentMenu: 'ezrab-ai',
  activeProject: null,
  projects: [],
  projectTotal: null,
};

const ctxFor = (rawText: string) => ({ ...mockCtx, rawText }) as never;
const OWNER_TEXT = 'buatkan rab pemasangan rangka atap dengan lebar 5 x 9';

function askRoof() {
  return executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor(OWNER_TEXT));
}

describe('Gerbang klarifikasi material (owner 2026-11-10)', () => {
  it('(a) kasus owner persis → pertanyaan bahan, BUKAN draft; ukuran terbawa', () => {
    const res = askRoof();
    expect(res.ok).toBe(true);
    expect(res.awaitRabMaterial).toBe(true);
    expect(res.message).toContain('Bahan rangka & penutup atapnya apa?');
    expect(res.message).toContain('5 × 9');
    expect(res.message).toContain('45 m²');
    // Bukan draft: tidak ada tabel item & tidak ada tombol Push.
    expect(res.message).not.toContain('| No |');
    const kinds = (res.actions ?? []).map((a) => a.action.kind);
    expect(kinds).not.toContain('push-universal');
    const labels = (res.actions ?? []).map((a) => a.label);
    expect(labels).toContain('Genteng keramik/tanah liat + rangka kayu');
    expect(labels).toContain('Metal standing seam + insulasi');
    expect(labels).toContain('Susun saja — pakai asumsi terbuka');
    expect(getPendingRabMaterial()?.rawText).toBe(OWNER_TEXT);
  });

  it('(a2) grounding: SETIAP opsi gerbang memetakan ke template yang BENAR-BENAR ada di katalog', () => {
    const svc = RabTemplateService.getInstance();
    for (const group of RAB_MATERIAL_GROUPS) {
      expect(group.options.length).toBeGreaterThan(0);
      for (const opt of group.options) {
        expect(svc.getTemplateById(opt.templateId), `${group.scopeId}/${opt.id}`).toBeDefined();
      }
    }
  });

  it('(b) klik "Genteng keramik/tanah liat + rangka kayu" → draft dari template ITU (bukan standing seam)', () => {
    askRoof();
    const res = executeIntent('RAB_MATERIAL_SELECT', 'genteng-kayu', mockCtx as never);
    expect(res.ok).toBe(true);
    expect(res.awaitRabMaterial).toBeFalsy();
    expect(res.message).toContain('| No |');
    expect(res.message).toContain('Atap Genteng Keramik Premium + Rangka Kayu Kelas I');
    expect(res.message).not.toContain('Template terpilih: [Atap & Waterproofing] "Sistem Atap Metal Standing Seam');
    // Jawaban tercatat terbuka di asumsi draft.
    expect(res.message).toContain('Bahan sesuai pilihan Anda pada klarifikasi');
    const kinds = (res.actions ?? []).map((a) => a.action.kind);
    expect(kinds).toContain('push-universal');
    expect(getPendingRabMaterial()).toBeNull();
  });

  it('(b2) jawaban DIKETIK "pakai kayu saja" → draft kuda-kuda kayu mengikuti jawaban', () => {
    askRoof();
    const res = tryContinueRabMaterial('pakai kayu saja');
    expect(res).not.toBeNull();
    expect(res!.message).toContain('Struktur Atap Kayu Kelas I/II Konvensional (Kuda-Kuda Kayu)');
    expect(getPendingRabMaterial()).toBeNull();
  });

  it('(b3) jawaban DIKETIK bahan tanpa template ("baja ringan + spandek") → jujur + Full AI berbahan itu', () => {
    askRoof();
    const res = tryContinueRabMaterial('baja ringan + spandek');
    expect(res).not.toBeNull();
    expect(res!.message).toContain('belum ada template-nya');
    expect(res!.message).not.toContain('| No |');
    const fullAi = (res!.actions ?? []).find((a) => a.action.kind === 'intent' && a.action.intent === 'RAB_FULL_AI');
    expect(fullAi).toBeDefined();
    if (fullAi && fullAi.action.kind === 'intent') {
      expect(fullAi.action.param).toContain('baja ringan');
      // Klik tombolnya → fallback prompt LLM (bukan komposisi template lain).
      const clicked = executeIntent('RAB_FULL_AI', fullAi.action.param, mockCtx as never);
      expect(clicked.fullAiPrompt).toContain('baja ringan');
    }
  });

  it('(c) bahan bertemplate disebut sejak awal ("atap genteng") → langsung draft, tanpa pertanyaan', () => {
    const res = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('buatkan rab atap genteng luas 120 m2'));
    expect(res.awaitRabMaterial).toBeFalsy();
    expect(res.message).toContain('Atap Genteng Keramik Premium + Rangka Kayu Kelas I');
    expect(res.message).toContain('| No |');
  });

  it('(c2) bahan tanpa template disebut sejak awal ("rangka atap baja ringan 5x9") → TANPA tanya ulang, TANPA draft salah bahan', () => {
    const res = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('buatkan rab rangka atap baja ringan 5x9'));
    expect(res.awaitRabMaterial).toBeFalsy();
    expect(res.message).not.toContain('Bahan rangka & penutup atapnya apa?');
    expect(res.message).not.toContain('| No |');
    expect(res.message).toContain('belum ada template-nya');
    expect(res.message).toContain('baja ringan');
    const labels = (res.actions ?? []).map((a) => a.label);
    expect(labels).toContain('Susun via Full AI');
    expect(labels).toContain('Pilih bahan katalog');
  });

  it('(d) afirmasi "itu aja" di tengah klarifikasi → draft + ASUMSI TERBUKA tercantum (aturan owner 2026-11-06)', () => {
    askRoof();
    const res = tryContinueRabMaterial('itu aja');
    expect(res).not.toBeNull();
    expect(res!.message).toContain('| No |');
    expect(res!.message).toContain('ASUMSI TERBUKA');
    expect(res!.message).toContain('Bahan belum ditentukan');
    expect(getPendingRabMaterial()).toBeNull();
  });

  it('(d2) klik tombol "Susun saja — pakai asumsi terbuka" → sama: draft + asumsi tercantum', () => {
    askRoof();
    const res = executeIntent('RAB_MATERIAL_SELECT', 'assume', mockCtx as never);
    expect(res.ok).toBe(true);
    expect(res.message).toContain('ASUMSI TERBUKA');
    expect(getPendingRabMaterial()).toBeNull();
  });

  it('(d3) teks tak terkait selama gerbang aktif → null (pemanggil memproses normal)', () => {
    askRoof();
    expect(tryContinueRabMaterial('buka daftar proyek')).toBeNull();
    // Gerbang dibersihkan manual agar tidak bocor ke tes berikutnya.
    tryContinueRabMaterial('itu aja');
  });

  it('(p) pondasi generik → pertanyaan jenis; klik Bore pile → draft bore pile', () => {
    const res = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('buatkan rab pondasi 24 titik'));
    expect(res.awaitRabMaterial).toBe(true);
    expect(res.message).toContain('Jenis pondasinya apa?');
    const picked = executeIntent('RAB_MATERIAL_SELECT', 'bore-pile', mockCtx as never);
    expect(picked.message).toContain('Pondasi Bored Pile Gedung (per Titik Bor)');
    expect(picked.message).toContain('Bahan sesuai pilihan Anda pada klarifikasi');
  });

  it('(p2) pondasi foot plat disebut sejak awal → jujur tanpa template (bukan mini pile diam-diam)', () => {
    const res = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('buatkan rab pondasi foot plat 20 titik'));
    expect(res.awaitRabMaterial).toBeFalsy();
    expect(res.message).toContain('belum ada template-nya');
    expect(res.message).not.toContain('| No |');
  });

  it('(e) jalan TIDAK berubah dari baseline: "jalan beton 1 km" tetap draft universal langsung', () => {
    const res = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('Buat RAB jalan beton sepanjang 1 km'));
    expect(res.ok).toBe(true);
    expect(res.awaitRabMaterial).toBeFalsy();
    expect(res.message).toContain('| No |');
    expect(res.message).toContain('Jalan Beton Semen (Rigid Pavement)');
  });

  it('(e2) rumah TIDAK masuk gerbang material: ringkasan kebutuhan seperti biasa', () => {
    const res = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('buatkan rab rumah tinggal di bogor'));
    expect(res.awaitRabMaterial).toBeFalsy();
    const kinds = (res.actions ?? []).map((a) => a.action.kind);
    expect(kinds).not.toContain('push-universal');
  });

  it('(f) kejujuran harga: draft hasil gerbang tetap melabeli item tanpa harga apa adanya', () => {
    askRoof();
    const res = tryContinueRabMaterial('itu aja');
    expect(res).not.toBeNull();
    // Template standing seam hasil asumsi memang punya 1 item zincalume
    // tanpa harga pada baseline — labelnya WAJIB tampil, bukan angka isi.
    expect(res!.message).toContain('Harga belum tersedia');
    expect(res!.message).toContain('BELUM TERSEDIA');
    expect(res!.message).toContain('Total terverifikasi');
  });

  it('klasifikasi teks: "genteng metal" = tanpa template (bukan opsi genteng); urutan deteksi benar', () => {
    const atap = materialGroupForScope('atap')!;
    expect(classifyMaterialText(atap, 'genteng metal').kind).toBe('untemplated');
    expect(classifyMaterialText(atap, 'genteng tanah liat').kind).toBe('option');
    expect(classifyMaterialText(atap, 'baja ringan').kind).toBe('untemplated');
    expect(classifyMaterialText(atap, 'standing seam').kind).toBe('option');
    expect(classifyMaterialText(atap, 'terserah').kind).toBe('none');
    const pondasi = materialGroupForScope('pondasi')!;
    expect(classifyMaterialText(pondasi, 'bore pile 24 titik').kind).toBe('option');
    expect(classifyMaterialText(pondasi, 'foot plat').kind).toBe('untemplated');
  });
});
