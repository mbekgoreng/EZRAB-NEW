/**
 * Test: Conversational Intelligence Upgrade — intake konteks proyek
 * (master prompt owner 2026-11-10, skenario §11 A–J).
 *
 * Kasus pemicu (screenshot owner): "BUATKAN SAYA RAB LANDSCAPE DENGAN
 * TOTAL LUAS 1 HEKTAR" dibalas menu generik 4 jalur padahal kategori +
 * luas sudah diberikan. Asisten harus mengenali intent, mengekstrak
 * konteks terstruktur, dan melanjutkan percakapan secara natural —
 * tidak me-restart workflow, tidak mengabaikan info yang sudah ada.
 *
 * Skenario:
 *  A landscape + 1 hektar → LANDSCAPE + 10.000 m² + pertanyaan konsep
 *    (BUKAN menu generik, BUKAN draft langsung).
 *  B "buatkan rab" → menu generik (di sini BENAR).
 *  C rumah 2 lantai 180 m² → ringkasan lama: residensial terisi, tidak
 *    ditanya ulang; intake landscape TIDAK mengintervensi.
 *  D taman kota 1 hektar di Surabaya + jogging track + playground →
 *    SEMUA atribut terekstrak; hanya pertanyaan kritis berikutnya.
 *  E tambah parkir + toilet → cakupan diperbarui TANPA restart.
 *  F koreksi "bukan 1 hektar, tapi 8.000 m²" → luas berubah, konteks
 *    lain utuh, pengakuan perubahan tampil.
 *  G "gunakan material premium" → ditanya spesifiknya (tidak dikarang).
 *  H "langsung buatkan" → pratinjau berlabel jujur (asumsi + tak
 *    teresolusi dinyatakan), disusul draft kanonis dari tombol generate.
 *  I "ini gambar DED-nya" → workflow DED yang ada (bukan menu generik,
 *    bukan intake landscape).
 *  J "gunakan template rab" → alur template (OPEN_TEMPLATE navigasi).
 *
 * PAGAR (master prompt): paket ini LOKAL SAJA — tanpa commit/push/
 * deploy/aktivasi billing.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  executeIntent, tryContinueProjectContext,
  getProjectContextState, clearProjectContext,
} from '../ai-tools/ezrab-ai/actionRegistry';
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import {
  parseAreaUnitM2, parseAreaMentionM2, extractProjectContext,
  LANDSCAPE_CONCEPTS, landscapeCatalogStatus, landscapeWorkPackages,
} from '../ai-tools/ezrab-ai/projectIntake';
import { RabTemplateService } from '../services/rabTemplateService';

const mockCtx = {
  navigate: () => {},
  currentMenu: 'ezrab-ai',
  activeProject: null,
  projects: [],
  projectTotal: null,
};
const ctxFor = (rawText: string) => ({ ...mockCtx, rawText }) as never;

const GENERIC_MENU_MARK = 'Pilih jalurnya';
const OWNER_A = 'BUATKAN SAYA RAB LANDSCAPE DENGAN TOTAL LUAS 1 HEKTAR';
const TEXT_D = 'Buatkan taman kota 1 hektar di Surabaya dengan jogging track dan playground';

beforeEach(() => {
  clearProjectContext();
});

describe('Konversi satuan luas (§2)', () => {
  it('1 hektar → 10.000 m², nilai asli dipertahankan', () => {
    const hit = parseAreaUnitM2('total luas 1 hektar');
    expect(hit?.valueM2).toBe(10000);
    expect(hit?.original).toBe('1 hektar');
  });
  it('2,5 hektar → 25.000 m²; 1 are → 100 m²', () => {
    expect(parseAreaUnitM2('lahan 2,5 hektar')?.valueM2).toBe(25000);
    expect(parseAreaUnitM2('lahan 1 are')?.valueM2).toBe(100);
  });
  it('koreksi "bukan X, tapi Y" → Y menang, X tercancel', () => {
    const hit = parseAreaMentionM2('luasnya bukan 1 hektar, tapi 8.000 m²');
    expect(hit?.valueM2).toBe(8000);
    expect(hit?.original).toBe('8.000 m²');
  });
  it('ekstraksi konteks: kategori LANDSCAPE + luas terkonversi', () => {
    const ctx = extractProjectContext(OWNER_A);
    expect(ctx.category).toBe('LANDSCAPE');
    expect(ctx.landAreaM2).toBe(10000);
    expect(ctx.landAreaOriginal).toBe('1 hektar');
  });
});

describe('Skenario A — landscape 1 hektar (kasus owner)', () => {
  it('route = CREATE_RAB_SUMMARY (bukan CREATE_RAB_CLARIFY)', () => {
    expect(routeIntent(OWNER_A).intent).toBe('CREATE_RAB_SUMMARY');
  });
  it('pertanyaan konsep + konteks terstruktur; BUKAN menu generik, BUKAN draft', () => {
    const res = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor(OWNER_A));
    expect(res.awaitProjectConcept).toBe(true);
    expect(res.message).toContain('10.000 m²');
    expect(res.message).toContain('Landscape seperti apa');
    expect(res.message).not.toContain(GENERIC_MENU_MARK);
    expect(res.message).not.toContain('| No |');
    const labels = (res.actions ?? []).map((a) => a.label);
    expect(labels).toEqual(expect.arrayContaining([
      'Taman publik', 'Landscape perumahan', 'Landscape komersial',
      'Landscape resort', 'Ruang terbuka hijau',
    ]));
    const st = getProjectContextState();
    expect(st?.category).toBe('LANDSCAPE');
    expect(st?.landAreaM2).toBe(10000);
    expect(st?.landAreaOriginal).toBe('1 hektar');
    expect(st?.stage).toBe('concept');
  });
});

describe('Skenario B — "buatkan rab" generik', () => {
  it('menu generik TETAP benar di sini', () => {
    expect(routeIntent('buatkan rab').intent).toBe('CREATE_RAB_CLARIFY');
    const res = executeIntent('CREATE_RAB_CLARIFY', undefined, ctxFor('buatkan rab'));
    expect(res.message).toContain(GENERIC_MENU_MARK);
    expect(getProjectContextState()).toBeNull();
  });
});

describe('Skenario C — rumah terukur (alur lama utuh)', () => {
  it('ringkasan kebutuhan lama: 2 lantai + 180 m² terisi, intake tidak intervensi', () => {
    const res = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('buatkan rab rumah 2 lantai luas bangunan 180 m2'));
    expect(res.message).toContain('rumah tinggal');
    expect(res.message).toContain('2 lantai');
    expect(res.message).toContain('180 m²');
    expect(res.awaitProjectConcept).toBeUndefined();
    expect(getProjectContextState()).toBeNull();
  });
});

describe('Skenario D→E→F — konteks multi-giliran', () => {
  function startD() {
    return executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor(TEXT_D));
  }
  it('D: semua atribut terekstrak; pertanyaan berikutnya = kondisi lahan (bukan konsep/fasilitas ulang)', () => {
    const res = startD();
    const st = getProjectContextState();
    expect(st?.category).toBe('PUBLIC_SPACE');
    expect(st?.conceptId).toBe('taman-publik');
    expect(st?.landAreaM2).toBe(10000);
    expect(st?.location).toBe('Surabaya');
    expect(st?.facilities).toEqual(expect.arrayContaining(['jogging-track', 'playground']));
    // Konsep & fasilitas sudah terjawab dari teks yang sama → yang
    // ditanya hanya pertanyaan kritis berikutnya.
    expect(res.message).toContain('kondisi lahan');
    expect(res.message).not.toContain('Landscape seperti apa');
    expect(res.message).not.toContain(GENERIC_MENU_MARK);
  });
  it('E: tambah parkir + toilet → diperbarui tanpa restart, pengakuan tampil', () => {
    startD();
    const res = tryContinueProjectContext('Tambahkan area parkir dan toilet umum');
    expect(res).not.toBeNull();
    expect(res!.message).toContain('Siap, saya perbarui:');
    const st = getProjectContextState();
    expect(st?.facilities).toEqual(expect.arrayContaining(['jogging-track', 'playground', 'toilet', 'parking']));
    expect(st?.landAreaM2).toBe(10000);
    expect(st?.location).toBe('Surabaya');
    expect(st?.conceptId).toBe('taman-publik');
  });
  it('F: koreksi luas → 8.000 m²; konsep/fasilitas/lokasi UTUH; pengakuan perubahan', () => {
    startD();
    tryContinueProjectContext('Tambahkan area parkir dan toilet umum');
    const res = tryContinueProjectContext('Luasnya bukan 1 hektar, tapi 8.000 m²');
    expect(res!.message).toContain('Siap, saya perbarui: Total luas: 8.000 m²');
    const st = getProjectContextState();
    expect(st?.landAreaM2).toBe(8000);
    expect(st?.conceptId).toBe('taman-publik');
    expect(st?.location).toBe('Surabaya');
    expect(st?.facilities).toHaveLength(4);
  });
  it('F→generate: draft kanonis memakai luas TERKOREKSI 8.000 m² + template Urban Park', () => {
    startD();
    tryContinueProjectContext('Tambahkan area parkir dan toilet umum');
    tryContinueProjectContext('Luasnya bukan 1 hektar, tapi 8.000 m²');
    const res = executeIntent('RAB_PROJECT_PREVIEW', 'generate', ctxFor(''));
    expect(res.message).toContain('luas 8.000 m²');
    expect(res.message).toContain('Taman Kota & Plaza Hijau');
    expect((res.actions ?? []).some((a) => a.action.kind === 'push-universal')).toBe(true);
    // Konteks dibersihkan HANYA setelah draft nyata tersusun.
    expect(getProjectContextState()).toBeNull();
  });
});

describe('Skenario G — "gunakan material premium"', () => {
  it('kualitas dicatat apa adanya; spesifikasinya DITANYAKAN, tidak dikarang', () => {
    executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('buatkan rab landscape luas 1 hektar'));
    tryContinueProjectContext('taman publik');
    const res = tryContinueProjectContext('gunakan material premium');
    expect(res!.message).toContain('tidak menebak spesifikasinya');
    expect(res!.message).toContain('Material atau bagian apa yang dimaksud');
    const st = getProjectContextState();
    expect(st?.qualityPreference).toBe('premium');
    // Kata kualitas itu sendiri BUKAN nama material.
    expect(st?.materialPreference).toBeNull();
    expect(st?.knownInformation.join(' ')).not.toContain('Material yang disebut: premium');
  });
});

describe('Skenario H — "langsung buatkan" (pratinjau jujur §8)', () => {
  it('pratinjau: ringkasan + 9 paket saran + tak teresolusi + asumsi berlabel; tanpa total karangan', () => {
    executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('buatkan rab landscape luas 1 hektar'));
    const res = tryContinueProjectContext('langsung buatkan rab lengkap');
    expect(res!.message).toContain('Pratinjau RAB');
    expect(res!.message).toContain('Paket pekerjaan yang disarankan');
    expect(res!.message).toContain('Item yang belum teresolusi');
    expect(res!.message).toContain('Asumsi yang memerlukan persetujuan');
    expect(res!.message).not.toContain('| No |');
    const st = getProjectContextState();
    expect(landscapeWorkPackages(st!)).toHaveLength(9);
  });
  it('generate dari pratinjau → draft katalog nyata (tabel + push-universal)', () => {
    executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('buatkan rab landscape luas 1 hektar'));
    tryContinueProjectContext('langsung buatkan rab lengkap');
    const res = executeIntent('RAB_PROJECT_PREVIEW', 'generate', ctxFor(''));
    expect(res.message).toContain('| No |');
    expect((res.actions ?? []).some((a) => a.action.kind === 'push-universal')).toBe(true);
  });
});

describe('Skenario I — DED eksplisit', () => {
  it('"ini gambar DED-nya" → ringkasan jalur DED + navigasi ded-ai; BUKAN menu generik, BUKAN intake', () => {
    const res = executeIntent('CREATE_RAB_CLARIFY', undefined, ctxFor('ini gambar ded-nya, buatkan rab'));
    expect(res.message).not.toContain(GENERIC_MENU_MARK);
    expect(res.message).toContain('DED');
    expect((res.actions ?? []).some((a) => a.action.kind === 'navigate' && a.action.menu === 'ded-ai')).toBe(true);
    expect(getProjectContextState()).toBeNull();
  });
});

describe('Skenario J — template eksplisit', () => {
  it('"gunakan template rab" → OPEN_TEMPLATE (alur katalog template)', () => {
    expect(routeIntent('gunakan template rab').intent).toBe('OPEN_TEMPLATE');
    const res = executeIntent('OPEN_TEMPLATE', undefined, ctxFor('gunakan template rab'));
    expect(res.navigated).toBe(true);
    // Kata "template" telanjang tetap klarifikasi topik (pola lama).
    expect(routeIntent('template').intent).toBe('CLARIFY_TOPIC');
  });
});

describe('Kejujuran katalog landscape (§6/§8)', () => {
  it('setiap templateId konsep ADA di katalog nyata; komersial & RTH membawa catatan jujur', () => {
    const svc = RabTemplateService.getInstance();
    for (const concept of LANDSCAPE_CONCEPTS) {
      if (concept.templateId) {
        expect(svc.getTemplateById(concept.templateId), concept.id).toBeTruthy();
      }
    }
    const komersial = LANDSCAPE_CONCEPTS.find((c) => c.id === 'landscape-komersial');
    const rth = LANDSCAPE_CONCEPTS.find((c) => c.id === 'ruang-terbuka-hijau');
    expect(komersial?.templateNote).toBeTruthy();
    expect(rth?.templateNote).toBeTruthy();
  });
  it('status katalog: tepat 6 template LANDSCAPE_SITE saat suite ini ditulis', () => {
    const ctx = extractProjectContext('buatkan rab landscape luas 1 hektar');
    ctx.conceptId = 'taman-publik';
    const status = landscapeCatalogStatus(ctx);
    expect(status.availableTemplateNames).toHaveLength(6);
    expect(status.conceptTemplateName).toContain('Taman Kota');
  });
});

describe('Alur tombol konsep → fasilitas → lokasi → kondisi → generate (contoh prompt §3)', () => {
  it('rangkaian penuh berakhir draft Urban Park dengan konteks bersih', () => {
    executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('buatkan rab landscape 1 hektar'));
    const q = executeIntent('RAB_CONCEPT_SELECT', 'taman-publik', ctxFor(''));
    expect(q.message).toContain('fasilitas');
    tryContinueProjectContext('ada jogging track, taman bermain anak, dan area parkir');
    tryContinueProjectContext('lokasinya di surabaya');
    tryContinueProjectContext('lahan kosong');
    const st = getProjectContextState();
    expect(st?.siteConditions).toContain('lahan kosong');
    const res = executeIntent('RAB_PROJECT_PREVIEW', 'generate', ctxFor(''));
    expect(res.message).toContain('Taman Kota & Plaza Hijau');
    expect((res.actions ?? []).some((a) => a.action.kind === 'push-universal')).toBe(true);
    expect(getProjectContextState()).toBeNull();
  });
  it('afirmasi "itu aja" di tengah intake → pratinjau (aturan afirmasi owner 2026-11-06)', () => {
    executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('buatkan rab landscape luas 1 hektar'));
    const res = tryContinueProjectContext('itu aja');
    expect(res!.message).toContain('Pratinjau RAB');
  });
});
