/**
 * Test: SUITE PENERIMAAN EZRAB Conversational Intelligence — Gelombang B
 * (master prompt owner 2026-11-11 §18/§19 + otorisasi kelanjutan 22:48).
 *
 * Mencakup T01–T30 + I01–I05 + CASE A–G pada lapisan DETERMINISTIK
 * (router, extractor konteks, gerbang intake, mesin draft katalog,
 * gerbang relevansi, invariant harga, store percakapan terpadu).
 * Bagian yang bergantung pada respons model LLM langsung (jalur
 * UNKNOWN → gateway; persona; teks penolakan verbal) TIDAK di-mock:
 * tesnya hanya membuktikan invariant deterministiknya dan skenarionya
 * diklasifikasikan BLOCKED/PARTIAL secara jujur di laporan
 * gelombang-b/acceptance-results.md.
 *
 * Dua tes yang semula bertanda [GAP-DOKUMEN] (fungsi per lantai T24;
 * cakupan "termasuk peralatan & instalasi air" T29) adalah bukti
 * berulang atas celah extractor Gelombang B. Keduanya DITUTUP Wave C
 * (ekstraksi fungsi per lantai + cakupan budget terstruktur) TANPA
 * melemahkan asersinya, dan kini menjadi tes regresi bernama biasa.
 *
 * PAGAR: LOKAL SAJA — tanpa commit/push/deploy; tanpa menyentuh
 * metering/auth; subtipe jalan TIDAK diasersi (keputusan owner terkunci).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  executeIntent, tryContinueUniversalContext,
  getUniversalContextState, clearUniversalContext, clearProjectContext,
  submitQuestionnaireAnswers,
} from '../ai-tools/ezrab-ai/actionRegistry';
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import {
  extractUniversalContext, classifyUniversal,
} from '../ai-tools/ezrab-ai/universalIntake';
import {
  buildUniversalDraft, effectiveItems, computeTotals,
  isPriceValidForTotal, pricedAmount, displayPriceStatus,
  validateTransfer, applyTransferReceipt,
} from '../ai-tools/ezrab-ai/universalRab';
import { classifyItemRelevance } from '../ai-tools/ezrab-ai/relevanceGate';
import { searchChatAhsp, formatChatAhspResult } from '../ai-tools/ezrab-ai/chatSearch';
import { detectHandoffNeed } from '../ai-tools/ezrab-ai/magicHandoff';
import {
  unifiedConversationStore, UnifiedConversationStore,
} from '../services/ai/conversation/unifiedConversationStore';

const mockCtx = {
  navigate: () => {},
  currentMenu: 'ezrab-ai',
  activeProject: null,
  projects: [],
  projectTotal: null,
};
const ctxFor = (rawText: string) => ({ ...mockCtx, rawText }) as never;
const GENERIC_MENU_MARK = 'Pilih jalurnya';
const start = (text: string) => {
  const r = routeIntent(text);
  return { route: r, res: executeIntent(r.intent as never, r.param, ctxFor(text)) };
};
const draftDescs = (text: string): string[] => {
  const b = buildUniversalDraft(text);
  if (b.kind !== 'draft') return [];
  return effectiveItems(b.draft).map((i) => i.description.toLowerCase());
};

beforeEach(() => {
  clearProjectContext();
  clearUniversalContext();
});

/* ================= Grup A — permintaan jelas ================= */

describe('Grup A — permintaan jelas', () => {
  it('T01 (CASE A) kandang sapi 275jt 10×25 simple → intake kandang, BUKAN menu generik, BUKAN template rumah', () => {
    const text = 'buatkan rab kandang sapi budget 275jt lebar 10 x 25 m buat yang simple aja';
    const { route, res } = start(text);
    expect(route.intent).toBe('CREATE_RAB_SUMMARY');
    expect(res.message).not.toContain(GENERIC_MENU_MARK);
    expect(res.message).toContain('terbuka');
    const ctx = getUniversalContextState();
    expect(ctx?.primary?.id).toBe('kandang');
    expect(ctx?.budget?.amount).toBe(275_000_000);
    expect(ctx?.dimensionsText).toBe('10 × 25 m');
    expect(ctx?.qualityPreference).toBe('sederhana');
    const b = buildUniversalDraft(text);
    expect(b.kind).toBe('draft');
    if (b.kind === 'draft') {
      const names = b.draft.parts.map((p) => p.template.name);
      expect(names.some((n) => n.includes('Kandang'))).toBe(true);
      expect(names.some((n) => /rumah/i.test(n))).toBe(false);
    }
  });

  it('T02 (CASE C) rumah 2 lantai tanah 120 ≠ bangunan; budget ESTIMATED 850jt; ditanya luas bangunan; tanpa template paksa', () => {
    const text = 'Saya mau bangun rumah 2 lantai luas tanah 120 m², budget sekitar 850 juta.';
    const { route, res } = start(text);
    expect(route.intent).toBe('CREATE_RAB_SUMMARY');
    expect(res.message).not.toContain(GENERIC_MENU_MARK);
    const ext = extractUniversalContext(text);
    expect(ext.landAreaM2).toBe(120);
    expect(ext.buildingAreaM2).toBeNull();
    expect(ext.floors).toBe(2);
    expect(ext.budget?.amount).toBe(850_000_000);
    expect(ext.budget?.kind).toBe('ESTIMATED');
    expect(res.message).toContain('Luas lahan: 120 m²');
    expect(res.message).toContain('Masih kurang: luas bangunan');
    expect(buildUniversalDraft(text).kind).not.toBe('draft');
  });

  it('T03 (CASE B — GERBANG REGRESI P0) gudang baja 20×40 → draft template gudang; NOL item paving/geobag/direksi-keet/marka', () => {
    const text = 'Hitungkan estimasi pembangunan gudang baja ukuran 20 × 40 meter.';
    const { route, res } = start(text);
    expect(route.intent).toBe('CREATE_RAB_SUMMARY');
    expect(res.message).not.toContain(GENERIC_MENU_MARK);
    expect(extractUniversalContext(text).buildingAreaM2).toBe(800);
    const b = buildUniversalDraft(text);
    expect(b.kind).toBe('draft');
    if (b.kind !== 'draft') return;
    expect(b.draft.parts[0].template.name).toContain('Gudang');
    const descs = effectiveItems(b.draft).map((i) => i.description.toLowerCase());
    expect(descs.length).toBeGreaterThan(0);
    for (const d of descs) {
      expect(d).not.toContain('paving');
      expect(d).not.toContain('geobag');
      expect(d).not.toContain('direksi keet');
      expect(d).not.toContain('marka jalan');
      expect(classifyItemRelevance(d, 'gudang-industri').level).not.toBe('REJECTED');
    }
  });

  it('T04 (CASE D) renovasi dapur + kamar mandi + atap → tiga scope terstruktur; satu pertanyaan berguna; tanpa menu statis', () => {
    const text = 'Saya mau renovasi rumah lama, fokus dapur, kamar mandi, dan atap.';
    const { route, res } = start(text);
    expect(route.intent).toBe('CREATE_RAB_SUMMARY');
    expect(res.message).not.toContain(GENERIC_MENU_MARK);
    const ctx = getUniversalContextState();
    expect(ctx?.primary?.id).toBe('renovasi');
    expect(ctx?.renovationScopes).toContain('dapur');
    expect(ctx?.renovationScopes).toContain('kamar mandi');
    expect(ctx?.renovationScopes).toContain('atap');
    expect(res.message).toContain('direnovasi');
  });

  it('T05 (CASE E) jembatan kecil perkebunan → tanya bentang → tipe → brief+WBS; tanpa dimensi karangan', () => {
    const { res } = start('Saya mau membangun jembatan kecil untuk akses perkebunan.');
    expect(res.message).not.toContain(GENERIC_MENU_MARK);
    expect(res.message).not.toContain('Kirim ulang');
    expect(res.message).toContain('bentang');
    expect(/\d/.test(res.message)).toBe(false);
    const cont = tryContinueUniversalContext('bentang 6 meter');
    expect(cont!.message).toContain('konstruksi');
    const brief = tryContinueUniversalContext('beton');
    expect(brief!.message).toContain('Brief proyek');
    expect(brief!.message).toContain('WBS konseptual');
    expect(getUniversalContextState()?.spanM).toBe(6);
    expect(getUniversalContextState()?.answers['bridge-type']).toBe('beton');
  });

  it('T06 jalan desa 2 km × 4 m → routing + konteks panjang/lebar (subtipe TIDAK diasersi — keputusan owner terkunci)', () => {
    const text = 'Buat RAB pembangunan jalan desa panjang 2 km dan lebar 4 meter.';
    const { route } = start(text);
    expect(route.intent).toBe('CREATE_RAB_SUMMARY');
    const ext = extractUniversalContext(text);
    expect(ext.lengthM).toBe(2000);
    expect(ext.widthM).toBe(4);
    expect(classifyUniversal(text).primary?.id).toBe('jalan-lingkungan');
  });
});

/* ================= Grup B — ambigu ================= */

describe('Grup B — ambigu: pertanyaan tertarget, tanpa angka karangan', () => {
  it('T07 "bangun rumah, kira-kira habis berapa?" → ringkasan kebutuhan; asumsi berlabel; TANPA total karangan', () => {
    const { route, res } = start('Saya mau bangun rumah, kira-kira habis berapa?');
    expect(route.intent).toBe('CREATE_RAB_SUMMARY');
    expect(res.message).not.toContain(GENERIC_MENU_MARK);
    expect(res.message).toContain('asumsi');
    expect(res.message).toContain('Masih kurang: luas bangunan');
    expect(/Rp\s?[\d]/.test(res.message)).toBe(false);
  });

  it('T08 "RAB gedung sekolah sederhana" → sekolah dikenali; ditanya luas bangunan total; tanpa menu', () => {
    const { res } = start('Buat RAB gedung sekolah sederhana.');
    expect(res.message).not.toContain(GENERIC_MENU_MARK);
    expect(getUniversalContextState()?.primary?.id).toBe('sekolah');
    expect(res.message).toContain('luas bangunan total');
    expect(/Rp\s?[\d]/.test(res.message)).toBe(false);
  });

  it('T09 tanah 15×20 untuk bangunan komersial → tanah tercatat; fungsi ditanyakan (belum diasumsikan)', () => {
    const text = 'Saya punya tanah 15 × 20 meter, mau dibuat bangunan komersial.';
    const { route, res } = start(text);
    expect(route.intent).toBe('CREATE_RAB_SUMMARY');
    expect(res.message).not.toContain(GENERIC_MENU_MARK);
    const ext = extractUniversalContext(text);
    expect(ext.landAreaM2).toBe(300);
    expect(ext.dimensionsText).toBe('15 × 20 m');
    expect(ext.missingCritical).toContain('fungsi bangunan');
    expect(res.message).toContain('Ukuran tanah: 15 × 20 m');
  });

  it('T10 kolam renang pribadi → kolam dikenali; ditanya ukurannya; tanpa menu', () => {
    const { res } = start('Buatkan RAB kolam renang pribadi.');
    expect(res.message).not.toContain(GENERIC_MENU_MARK);
    expect(getUniversalContextState()?.primary?.id).toBe('kolam');
    expect(res.message).toContain('ukuran');
  });

  it('T11 peternakan ayam 5.000 ekor → kandang dikenali; kapasitas tercatat sebagai hitungan; ditanya ukuran', () => {
    const { route, res } = start('Saya ingin membangun peternakan ayam kapasitas 5.000 ekor.');
    expect(route.intent).toBe('CREATE_RAB_SUMMARY');
    expect(res.message).not.toContain(GENERIC_MENU_MARK);
    const ctx = getUniversalContextState();
    expect(ctx?.primary?.id).toBe('kandang');
    expect((ctx?.counts ?? []).some((c) => c.value === 5000 && c.unit === 'ekor')).toBe(true);
    expect(res.message).toContain('ukuran kandangnya');
  });

  it('T12 "RAB spesifikasi standar, belum tahu detail" → tanpa objek: ditanya objeknya; TANPA angka karangan', () => {
    const text = 'Buatkan RAB dengan spesifikasi standar saja, saya belum tahu detailnya.';
    const { route, res } = start(text);
    expect(route.intent).toBe('CREATE_RAB_CLARIFY');
    expect(classifyUniversal(text).primary).toBeNull();
    expect(res.message).toContain('RAB-nya untuk apa');
    expect(/Rp\s?[\d]/.test(res.message)).toBe(false);
  });
});

/* ============ Grup C — persona (deterministik; respons model = BLOCKED) ============ */

describe('Grup C — persona [bagian model: BLOCKED — provider langsung tidak tersedia di lingkungan uji deterministik]', () => {
  it('T13 mahasiswa belajar RAB gedung 3 lantai → konteks deterministik: lantai 3 terbaca; jalur model (UNKNOWN)', () => {
    const text = 'Saya mahasiswa sipil, mau belajar membuat RAB gedung 3 lantai.';
    expect(routeIntent(text).intent).toBe('UNKNOWN');
    const ext = extractUniversalContext(text);
    expect(ext.floors).toBe(3);
    expect(ext.primary?.id).toBe('bangunan-umum');
  });

  it('T14 kontraktor tender tanpa objek → tidak ada draft karangan (needs-spec jujur); jalur model', () => {
    const text = 'Saya kontraktor, butuh RAB cepat untuk penawaran tender.';
    expect(routeIntent(text).intent).toBe('UNKNOWN');
    expect(extractUniversalContext(text).primary).toBeNull();
    expect(buildUniversalDraft(text).kind).toBe('needs-spec');
  });

  it('T15 pemilik rumah awam → rumah dikenali di extractor; tanpa draft paksa; jalur model', () => {
    const text = 'Saya pemilik rumah dan tidak paham istilah konstruksi.';
    expect(routeIntent(text).intent).toBe('UNKNOWN');
    expect(extractUniversalContext(text).primary?.id).toBe('rumah');
    expect(buildUniversalDraft(text).kind).not.toBe('draft');
  });

  it('T16 konsultan QS periksa harga satuan → jalur harga resmi deterministik tersedia & menemukan data nyata; jalur model', () => {
    const text = 'Saya konsultan QS, ingin memeriksa kewajaran harga satuan.';
    expect(routeIntent(text).intent).toBe('UNKNOWN');
    const found = searchChatAhsp('galian tanah');
    expect(found.outcome).not.toBe('NOT_FOUND');
    expect(found.items.length).toBeGreaterThan(0);
  });

  it('T17 hitung kebutuhan material → tanpa kuantitas material karangan di lapisan deterministik; jalur model', () => {
    const text = 'Saya ingin menghitung kebutuhan material sebelum membeli.';
    expect(routeIntent(text).intent).toBe('UNKNOWN');
    const ext = extractUniversalContext(text);
    expect(ext.counts.length).toBe(0);
    expect(ext.technicalSpecs.length).toBe(0);
    expect(buildUniversalDraft(text).kind).not.toBe('draft');
  });
});

/* ============ Grup D — rekomendasi workflow ============ */

describe('Grup D — rekomendasi workflow (hanya yang didukung aplikasi)', () => {
  it('T18 hanya konsep, belum punya gambar → fungsi+luas tercatat sebagai yang hilang; tanpa klaim DED; jalur model untuk rekomendasinya', () => {
    const text = 'Saya belum punya gambar, hanya punya konsep bangunan.';
    expect(routeIntent(text).intent).toBe('UNKNOWN');
    const ext = extractUniversalContext(text);
    expect(ext.primary?.id).toBe('bangunan-umum');
    expect(ext.missingCritical).toContain('fungsi bangunan');
    expect(ext.missingCritical).toContain('luas bangunan total');
  });

  it('T19 sudah punya DED PDF → detektor handoff DED aktif; penjaga CLARIFY mengarah ke jalur DED, BUKAN menu generik', () => {
    const text = 'Saya sudah punya gambar DED lengkap dalam PDF.';
    const need = detectHandoffNeed(text);
    expect(need.needed).toBe(true);
    expect(need.signals).toContain('dokumen DED/gambar kerja');
    const res = executeIntent('CREATE_RAB_CLARIFY', undefined, ctxFor(text));
    expect(res.message).not.toContain(GENERIC_MENU_MARK);
    expect(res.message).toContain('DED');
  });

  it('T20 format Excel RAB kantor → ekspor Excel ADA (how-to), impor Excel TIDAK diklaim ada (tidak ada intent lokal untuknya)', () => {
    expect(routeIntent('cara mengekspor RAB ke excel').intent).toBe('HOWTO_EXCEL_EXPORT');
    const r = routeIntent('Saya punya format Excel RAB dari kantor, ingin melanjutkannya.');
    expect(r.intent).toBe('UNKNOWN');
    expect(r.localOnly).toBe(false);
  });

  it('T21 masukkan item sendiri satu per satu → workflow manual benar-benar ada di jalur lokal', () => {
    const res = executeIntent('CREATE_RAB_CLARIFY', undefined, ctxFor('buatkan rab'));
    expect(res.message).toContain('isi item sendiri');
    expect((res.actions ?? []).some((a) => a.label === 'Manual / kosong')).toBe(true);
  });

  it('T22 proyek lama → proyek serupa: TIDAK ada klaim duplikasi di lapisan deterministik (fitur tidak ditemukan di kode chat)', () => {
    const r = routeIntent('Saya punya proyek lama dan ingin membuat proyek serupa.');
    expect(r.intent).toBe('UNKNOWN');
    expect(r.localOnly).toBe(false);
  });
});

/* ================= Grup E — multi-turn ================= */

describe('Grup E — multi-turn: konteks lestari, koreksi field tunggal', () => {
  it('T23 (CASE F) rumah 100 m² 500jt → budget 400jt → spek ekonomis: hanya field dimaksud yang berubah', () => {
    const { route, res } = start('Buat RAB rumah 1 lantai luas 100 m² budget 500 juta.');
    expect(route.intent).toBe('CREATE_RAB_DIRECT');
    expect(res.message).not.toContain(GENERIC_MENU_MARK);
    expect(res.message).toContain('100 m²');
    const a = extractUniversalContext('Buat RAB rumah 1 lantai luas 100 m² budget 500 juta.');
    expect(a.primary?.id).toBe('rumah');
    expect(a.buildingAreaM2).toBe(100);
    expect(a.floors).toBe(1);
    expect(a.budget?.amount).toBe(500_000_000);
    const b = extractUniversalContext('Ubah budget menjadi 400 juta.', a);
    expect(b.budget?.amount).toBe(400_000_000);
    expect(b.budgetHistory.map((h) => h.amount)).toContain(500_000_000);
    expect(b.corrections.some((c) => c.key === 'budget')).toBe(true);
    expect(b.buildingAreaM2).toBe(100);
    expect(b.floors).toBe(1);
    const c = extractUniversalContext('Luasnya tetap, tapi spesifikasinya dibuat lebih ekonomis.', b);
    expect(c.budget?.amount).toBe(400_000_000);
    expect(c.buildingAreaM2).toBe(100);
    expect(c.qualityPreference).toBe('ekonomis');
  });

  it('T24 kantor 2 lantai → luas per lantai 200 → desain sederhana: lantai TIDAK menjadi 200; semua spek inti lestari', () => {
    const { res } = start('Saya ingin membuat gedung kantor 2 lantai.');
    expect(res.message).not.toContain(GENERIC_MENU_MARK);
    expect(getUniversalContextState()?.primary?.id).toBe('kantor');
    expect(getUniversalContextState()?.floors).toBe(2);
    const cont = tryContinueUniversalContext('Luas setiap lantai 200 m².');
    expect(cont).not.toBeNull();
    expect(getUniversalContextState()?.floors).toBe(2);
    expect(getUniversalContextState()?.buildingAreaM2).toBe(200);
    const p1 = extractUniversalContext('Saya ingin membuat gedung kantor 2 lantai.');
    const p2 = extractUniversalContext('Luas setiap lantai 200 m².', p1);
    const p3 = extractUniversalContext('Lantai pertama untuk kantor, lantai kedua untuk ruang rapat.', p2);
    const p4 = extractUniversalContext('Buat desainnya sederhana.', p3);
    expect(p4.primary?.id).toBe('kantor');
    expect(p4.floors).toBe(2);
    expect(p4.buildingAreaM2).toBe(200);
    expect(p4.qualityPreference).toBe('sederhana');
  });

  it('T24 [REGRESI Wave C] fungsi per lantai (lantai 1 kantor, lantai 2 ruang rapat) tercatat terstruktur', () => {
    const p1 = extractUniversalContext('Saya ingin membuat gedung kantor 2 lantai.');
    const p2 = extractUniversalContext('Luas setiap lantai 200 m².', p1);
    const p3 = extractUniversalContext('Lantai pertama untuk kantor, lantai kedua untuk ruang rapat.', p2);
    const recorded = [...p3.technicalSpecs, ...p3.scopeConfirmed.map((s) => s.label)].join(' | ');
    expect(recorded).toContain('ruang rapat');
  });

  it('T25 jalan beton 500 → koreksi 750 → lebar 4: nilai kini 750×4; 500 hanya riwayat', () => {
    start('Buat RAB jalan beton panjang 500 meter.');
    expect(getUniversalContextState()?.lengthM).toBe(500);
    const c1 = tryContinueUniversalContext('Maaf, ternyata panjangnya 750 meter.');
    expect(c1).not.toBeNull();
    expect(getUniversalContextState()?.lengthM).toBe(750);
    expect(getUniversalContextState()?.corrections.some((c) => c.key === 'length')).toBe(true);
    const c2 = tryContinueUniversalContext('Lebarnya 4 meter.');
    expect(c2).not.toBeNull();
    expect(getUniversalContextState()?.lengthM).toBe(750);
    expect(getUniversalContextState()?.widthM).toBe(4);
  });
});

/* ================= Grup F — kompleks ================= */

describe('Grup F — kompleks', () => {
  it('T26 budget 1 miliar rumah + toko depan → mixed-use dikenali (komersial + rumah); budget 1.000.000.000', () => {
    const text = 'Saya punya budget 1 miliar, ingin membangun rumah sekaligus toko di bagian depan.';
    const { route, res } = start(text);
    expect(route.intent).toBe('CREATE_RAB_SUMMARY');
    expect(res.message).not.toContain(GENERIC_MENU_MARK);
    const ctx = getUniversalContextState();
    expect(ctx?.primary?.id).toBe('komersial');
    expect(ctx?.isMulti).toBe(true);
    expect(ctx?.secondary.map((d) => d.id)).toContain('rumah');
    expect(ctx?.budget?.amount).toBe(1_000_000_000);
  });

  it('T27 renovasi sekolah tetap digunakan → kendala okupasi lestari sampai brief', () => {
    const { res } = start('Buat RAB renovasi sekolah sambil bangunan tetap digunakan untuk kegiatan belajar.');
    expect(res.message).not.toContain(GENERIC_MENU_MARK);
    const ctx = getUniversalContextState();
    expect(ctx?.primary?.id).toBe('renovasi');
    expect(ctx?.secondary.map((d) => d.id)).toContain('sekolah');
    expect(ctx?.siteConditions).toContain('bangunan tetap digunakan selama pekerjaan');
    const brief = tryContinueUniversalContext('itu aja');
    expect(brief!.message).toContain('Brief proyek');
    expect(brief!.message).toContain('tetap digunakan');
  });

  it('T28 villa berbukit akses terbatas → villa = bangunan (bukan jalan); kedua kendala tapak tercatat', () => {
    const text = 'Saya ingin membangun villa di daerah berbukit dengan akses jalan terbatas.';
    const { route, res } = start(text);
    expect(route.intent).toBe('CREATE_RAB_SUMMARY');
    expect(res.message).not.toContain(GENERIC_MENU_MARK);
    expect(res.message).not.toContain('Kirim ulang');
    const ext = extractUniversalContext(text);
    expect(ext.primary?.id).toBe('hotel');
    expect(ext.siteConditions).toContain('akses terbatas');
    expect(ext.siteConditions).toContain('lahan berbukit');
  });

  it('T29 kandang 10×25 budget 275jt termasuk peralatan+air → kandang/budget/dimensi tertangkap; pertanyaan tipe diajukan', () => {
    const text = 'Saya ingin membangun kandang sapi 10 × 25 meter, tetapi budget 275 juta sudah termasuk peralatan dan instalasi air.';
    const { route, res } = start(text);
    expect(route.intent).toBe('CREATE_RAB_SUMMARY');
    expect(res.message).not.toContain(GENERIC_MENU_MARK);
    const ctx = getUniversalContextState();
    expect(ctx?.primary?.id).toBe('kandang');
    expect(ctx?.budget?.amount).toBe(275_000_000);
    expect(ctx?.dimensionsText).toBe('10 × 25 m');
    expect(res.message).toContain('terbuka');
  });

  it('T29 [REGRESI Wave C] cakupan "termasuk peralatan dan instalasi air" tercatat sebagai cakupan budget', () => {
    const ext = extractUniversalContext('Saya ingin membangun kandang sapi 10 × 25 meter, tetapi budget 275 juta sudah termasuk peralatan dan instalasi air.');
    const recorded = [
      ...ext.scopeConfirmed.map((s) => s.label),
      ...ext.technicalSpecs,
      ...ext.siteConditions,
    ].join(' | ');
    expect(recorded).toContain('peralatan');
  });

  it('T30 eksplorasi usaha, tanah 300 m² → tanah tercatat; TANPA draft paksa; tanpa kategori karangan', () => {
    const text = 'Saya belum tahu mau membangun apa. Saya punya tanah 300 m² dan ingin usaha yang potensial.';
    expect(routeIntent(text).intent).toBe('UNKNOWN');
    const ext = extractUniversalContext(text);
    expect(ext.landAreaM2).toBe(300);
    expect(ext.primary).toBeNull();
    expect(ext.stage).toBe('PROJECT_IDENTITY');
    expect(buildUniversalDraft(text).kind).not.toBe('draft');
  });
});

/* ================= Grup I — integritas (target 100%) ================= */

describe('Grup I — integritas', () => {
  it('I01 harga AHSP resmi untuk item karangan → NOT_FOUND tegas; tidak ada harga resmi karangan', () => {
    const fake = searchChatAhsp('pekerjaan teleportasi material antariksa xyzqq');
    expect(fake.outcome).toBe('NOT_FOUND');
    expect(fake.items.length).toBe(0);
    expect(formatChatAhspResult(fake)).toContain('Tidak ditemukan');
    const real = searchChatAhsp('galian tanah');
    expect(real.outcome).not.toBe('NOT_FOUND');
    expect(real.items.length).toBeGreaterThan(0);
  });

  it('I02 harga hilang TIDAK menjadi Rp0 valid: unresolved → invalid untuk total, pricedAmount null, label BELUM TERSEDIA, total PARSIAL [penolakan verbal: model — BLOCKED]', () => {
    expect(isPriceValidForTotal({ priceStatus: 'PRICE_UNRESOLVED', unitPrice: 0 })).toBe(false);
    const b = buildUniversalDraft('buatkan rab kandang sapi budget 275jt lebar 10 x 25 m buat yang simple aja');
    expect(b.kind).toBe('draft');
    if (b.kind !== 'draft') return;
    const unpriced = effectiveItems(b.draft).filter((i) => !isPriceValidForTotal(i));
    expect(unpriced.length).toBeGreaterThan(0);
    for (const i of unpriced) {
      expect(pricedAmount(i)).toBeNull();
      expect(displayPriceStatus(i as never).label).toBe('BELUM TERSEDIA');
    }
    expect(computeTotals(b.draft).status).toBe('PARSIAL');
    expect(routeIntent('Kalau harga belum ada, isi saja Rp0 supaya totalnya lengkap.').intent).toBe('UNKNOWN');
  });

  it('I03 volume/koefisien TIDAK dikarang per permintaan: build deterministik identik; label RESMI hanya untuk sumber OFFICIAL_AHSP', () => {
    expect(routeIntent('Buat semua volume dan koefisien sendiri agar cepat selesai.').intent).toBe('UNKNOWN');
    const sig = (text: string): string => {
      const b = buildUniversalDraft(text);
      if (b.kind !== 'draft') return b.kind;
      return effectiveItems(b.draft)
        .map((i) => `${i.description}|${i.volume}|${i.unitPrice}|${i.priceSourceKind}`)
        .join(';');
    };
    const text = 'buatkan rab gudang baja 20x40 m';
    expect(sig(text)).toBe(sig(text));
    const b = buildUniversalDraft(text);
    if (b.kind === 'draft') {
      for (const i of effectiveItems(b.draft)) {
        if (displayPriceStatus(i as never).label === 'RESMI AHSP') {
          expect((i as { priceSourceKind?: string }).priceSourceKind).toBe('OFFICIAL_AHSP');
        }
      }
    }
  });

  it('I04 budget 100jt TIDAK memaksa total: engine menghitung apa adanya; budget hanya konteks', () => {
    const ext = extractUniversalContext('Anggaran saya 100 juta, buat RAB yang totalnya tepat 100 juta.');
    expect(ext.budget?.amount).toBe(100_000_000);
    const plain = buildUniversalDraft('buatkan rab gudang baja 20x40 m');
    const withBudget = buildUniversalDraft('buatkan rab gudang baja 20x40 m budget 100jt');
    expect(plain.kind).toBe('draft');
    expect(withBudget.kind).toBe('draft');
    if (plain.kind !== 'draft' || withBudget.kind !== 'draft') return;
    const tPlain = computeTotals(plain.draft);
    const tBudget = computeTotals(withBudget.draft);
    expect(tBudget.estimatedTotal).toBe(tPlain.estimatedTotal);
    expect(tBudget.estimatedTotal).not.toBe(100_000_000);
    const prices = (d: typeof plain.draft) => effectiveItems(d).map((i) => i.unitPrice).join(',');
    expect(prices(withBudget.draft)).toBe(prices(plain.draft));
  });

  it('I05 simpan tanpa periksa DITOLAK gerbang deterministik: transfer butuh proyek + non-duplikat; persetujuan tetap PENDING', () => {
    const b = buildUniversalDraft('buatkan rab gudang baja 20x40 m');
    expect(b.kind).toBe('draft');
    if (b.kind !== 'draft') return;
    expect(validateTransfer(b.draft, null).allowed).toBe(false);
    expect(validateTransfer(b.draft, 'proj-waveb-i05').allowed).toBe(true);
    applyTransferReceipt(b.draft, 'proj-waveb-i05', 1, 0);
    const dup = validateTransfer(b.draft, 'proj-waveb-i05');
    expect(dup.duplicate).toBe(true);
    expect(dup.allowed).toBe(false);
    start('buatkan rab kandang sapi budget 275jt lebar 10 x 25 m buat yang simple aja');
    const save = tryContinueUniversalContext('Langsung simpan RAB ini tanpa saya periksa.');
    expect(getUniversalContextState()?.approvalStatus).toBe('PENDING');
    expect(save!.message).not.toContain('Push ke Spreadsheet');
  });
});

/* ============ CASE G — kontinuitas Magic ↔ Chat (bukti store) ============ */

describe('CASE G — kontinuitas Magic↔Chat [klasifikasi: PARTIAL-bukti-store; klik browser dibuktikan E2E terpisah]', () => {
  it('G1 store percakapan adalah singleton yang sama untuk semua permukaan', () => {
    expect(UnifiedConversationStore.getInstance()).toBe(unifiedConversationStore);
  });

  it('G2 percakapan yang dibuat satu permukaan terbaca utuh dari permukaan lain (id & pesan sama, tanpa duplikasi)', () => {
    const pid = 'proj-waveb-g2';
    const conv = unifiedConversationStore.getOrCreateActiveConversation(pid);
    unifiedConversationStore.appendMessage(conv.id, pid, { role: 'user', content: 'pesan dari permukaan Magic' } as never);
    const again = unifiedConversationStore.getOrCreateActiveConversation(pid);
    expect(again.id).toBe(conv.id);
    expect(again.messages.length).toBe(1);
    expect(again.messages[0].content).toBe('pesan dari permukaan Magic');
    unifiedConversationStore.appendMessage(conv.id, pid, { role: 'assistant', content: 'balasan dari permukaan Chat' } as never);
    const list = unifiedConversationStore.listConversations(pid);
    expect(list.length).toBe(1);
    expect(list[0].messages.length).toBe(2);
  });

  it('G3 isolasi proyek fail-closed: percakapan proyek lain tidak dapat diakses lintas proyek', () => {
    const pid = 'proj-waveb-g3';
    const conv = unifiedConversationStore.createConversation(pid, 'Isolasi');
    let threw = false;
    try {
      unifiedConversationStore.getConversation(conv.id, 'proj-waveb-lain');
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it('G4 konteks universal registry adalah state sesi yang sama tanpa memandang mode masuk; handoff tidak membuat percakapan baru', () => {
    const pid = 'proj-waveb-g4';
    const conv = unifiedConversationStore.getOrCreateActiveConversation(pid);
    const before = unifiedConversationStore.listConversations(pid).length;
    detectHandoffNeed('Saya sudah punya gambar DED lengkap dalam PDF.');
    expect(unifiedConversationStore.listConversations(pid).length).toBe(before);
    expect(unifiedConversationStore.getActiveConversationId(pid)).toBe(conv.id);
    start('buatkan rab kandang sapi budget 275jt lebar 10 x 25 m buat yang simple aja');
    expect(getUniversalContextState()?.primary?.id).toBe('kandang');
    const cont = tryContinueUniversalContext('kandang terbuka');
    // PIN DIPERBARUI TERBUKA (Adaptive Questionnaire, direktif owner
    // 2026-11-12 §6): jawaban "terbuka" kini membuka langkah kuesioner
    // spesifikasi kandang sebelum brief (spek material memang belum
    // diketahui). Inti G4 — konteks yang sama lintas mode — tidak
    // berubah; asersi brief dijalankan pada hasil kirim kuesioner.
    expect(cont!.questionnaire).toBeDefined();
    const brief = submitQuestionnaireAnswers({});
    expect(brief.message).toContain('Brief proyek');
    expect(getUniversalContextState()?.answers['kandang-type']).toBe('terbuka');
  });
});

/* ============ Asersi keras lintas skenario ============ */

describe('Asersi keras — anti-kontaminasi & anti menu generik', () => {
  it('draft gudang baja (3 varian kata) TANPA item jalan/paving/geobag/direksi-keet liar', () => {
    for (const text of [
      'buatkan rab gudang baja 20x40 m',
      'buatkan rab warehouse rangka baja ukuran 15 x 30 meter',
      'buatkan rab gudang baja ukuran 12 x 24 m',
    ]) {
      for (const d of draftDescs(text)) {
        expect(d).not.toContain('paving');
        expect(d).not.toContain('geobag');
        expect(d).not.toContain('direksi keet');
        expect(d).not.toContain('marka jalan');
      }
    }
  });

  it('pesan bersinyal kuat TIDAK PERNAH dibalas menu generik (sapuan Grup A)', () => {
    for (const text of [
      'buatkan rab kandang sapi budget 275jt lebar 10 x 25 m buat yang simple aja',
      'Saya mau bangun rumah 2 lantai luas tanah 120 m², budget sekitar 850 juta.',
      'Hitungkan estimasi pembangunan gudang baja ukuran 20 × 40 meter.',
      'Saya mau renovasi rumah lama, fokus dapur, kamar mandi, dan atap.',
      'Saya mau membangun jembatan kecil untuk akses perkebunan.',
      'Buat RAB gedung sekolah sederhana.',
      'Buatkan RAB kolam renang pribadi.',
      'Saya ingin membangun peternakan ayam kapasitas 5.000 ekor.',
      'Saya punya budget 1 miliar, ingin membangun rumah sekaligus toko di bagian depan.',
      'Buat RAB renovasi sekolah sambil bangunan tetap digunakan untuk kegiatan belajar.',
      'Saya ingin membangun villa di daerah berbukit dengan akses jalan terbatas.',
      'Saya ingin membangun kandang sapi 10 × 25 meter, tetapi budget 275 juta sudah termasuk peralatan dan instalasi air.',
    ]) {
      clearProjectContext();
      clearUniversalContext();
      const { route, res } = start(text);
      expect(route.intent).not.toBe('UNKNOWN');
      expect(res.message).not.toContain(GENERIC_MENU_MARK);
    }
  });
});
