/**
 * chatQuestionnaireAdaptive.test.ts — Kuesioner Spesifikasi Adaptif
 * (Adaptive Questionnaire 2026-11-12).
 *
 * Membuktikan 15 area direktif §9 pada tingkat mesin/registry:
 * ekstraksi konteks, deteksi info hilang, seleksi sadar kategori,
 * pencegahan pertanyaan ganda, jawaban tunggal/ganda/khusus/dilewati,
 * persistensi konteks, pergantian proyek, pelestarian draf, pembaruan
 * budget, sinkronisasi Magic↔Chat (satu singleton konteks — kedua mode
 * adalah presentationMode atas tampilan & registry yang sama),
 * kontrak render kartu (pola pesan kaya yang ada), dan generate
 * deterministik sesudah konfirmasi. Bukti visual desktop/mobile
 * disediakan E2E browser (folder artefak tugas ini).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import {
  executeIntent,
  tryContinueUniversalContext,
  applyUniversalOption,
  generateUniversalFromBrief,
  submitQuestionnaireAnswers,
  getUniversalContextState,
  clearUniversalContext,
  type ChatActionContext,
} from '../ai-tools/ezrab-ai/actionRegistry';
import {
  getLastUniversalDraft,
  setLastUniversalDraft,
  effectiveItems,
  computeTotals,
  isPriceValidForTotal,
  pricedAmount,
} from '../ai-tools/ezrab-ai/universalRab';
import {
  extractUniversalContext,
  serializeUniversalIntakeContext,
  rehydrateUniversalIntakeContext,
  type QuestionnaireAnswerRecord,
} from '../ai-tools/ezrab-ai/universalIntake';
import {
  selectQuestionnaireQuestions,
  questionnaireUnresolvedLabels,
} from '../ai-tools/ezrab-ai/questionnaire';
import {
  saveIntakeContext,
  loadIntakeContext,
  peekIntakeContext,
  AI_INTAKE_STORAGE_KEY,
} from '../ai-tools/ezrab-ai/draftPersistence';
import { saveVersioned } from '../engine/storage/hardenedStorage';

const here = path.dirname(fileURLToPath(import.meta.url));
const readSrc = (rel: string) => fs.readFileSync(path.join(here, rel), 'utf8');

function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
}
(globalThis as Record<string, unknown>).localStorage = makeStorage();

const mockCtx = (): ChatActionContext => ({
  navigate: () => undefined,
  currentMenu: 'ezrab-ai',
  activeProject: null,
  projects: [],
  projectTotal: 0,
  projectItems: null,
});

const start = (text: string) => {
  const routed = routeIntent(text);
  return executeIntent(routed.intent, routed.param, { ...mockCtx(), rawText: text });
};

const keys = (ctx: NonNullable<ReturnType<typeof getUniversalContextState>>) =>
  selectQuestionnaireQuestions(ctx).map((q) => q.key);

beforeEach(() => {
  clearUniversalContext();
  setLastUniversalDraft(null);
  (globalThis.localStorage as ReturnType<typeof makeStorage>).clear();
});

/** Alur kandang direktif sampai kartu kuesioner tampil. */
function kandangSampaiKuesioner() {
  const r1 = start('Saya punya budget Rp300 juta. Bisa buatkan RAB kandang sapi?');
  const r2 = tryContinueUniversalContext('17 x 9 meter');
  const r3 = applyUniversalOption('kandang-terbuka');
  return { r1, r2, r3 };
}

const jawabKandangPenuh: Record<string, QuestionnaireAnswerRecord> = {
  'kandang-capacity': { selectedIds: ['kap-30'], customText: null, status: 'answered' },
  'kandang-roof-material': { selectedIds: ['atap-spandek'], customText: null, status: 'answered' },
  'kandang-floor': { selectedIds: ['lantai-beton-miring'], customText: null, status: 'answered' },
  'kandang-facilities': {
    selectedIds: ['fas-palung', 'fas-drainase'],
    customText: null,
    status: 'answered',
  },
  'kandang-manure': { selectedIds: [], customText: null, status: 'skipped' },
};

describe('Adaptive Questionnaire — ekstraksi & deteksi info hilang', () => {
  it('konteks terekstrak dari pesan direktif: proyek kandang + budget tercatat, dimensi hilang terdeteksi', () => {
    const ctx = extractUniversalContext('Saya punya budget Rp300 juta. Bisa buatkan RAB kandang sapi?');
    expect(ctx.primary?.id).toBe('kandang');
    expect(ctx.budget?.amount).toBe(300_000_000);
    expect(ctx.missingCritical.join(' ')).toContain('ukuran kandang');
  });

  it('seleksi kuesioner kandang = lima spesifikasi material contoh direktif', () => {
    const ctx = extractUniversalContext('buatkan rab kandang sapi 17 x 9 meter');
    expect(keys(ctx)).toEqual([
      'kandang-capacity',
      'kandang-roof-material',
      'kandang-floor',
      'kandang-facilities',
      'kandang-manure',
    ]);
  });

  it('semua spesifikasi lengkap di pesan pertama → seleksi kosong secara sah', () => {
    const ctx = extractUniversalContext(
      'buatkan rab kandang sapi 30 ekor atapnya spandek lantainya beton ada palung pakan dan bak penampungan kotoran',
    );
    expect(ctx.primary?.id).toBe('kandang');
    expect(keys(ctx)).toEqual([]);
  });

  it('dimensi tanpa budget: alur tetap berjalan, budget tetap null (tidak dikarang)', () => {
    const ctx = extractUniversalContext('buatkan rab kandang sapi 17 x 9 meter');
    expect(ctx.budget).toBeNull();
    expect(keys(ctx).length).toBeGreaterThan(0);
  });
});

describe('Adaptive Questionnaire — seleksi sadar kategori', () => {
  it('jalan mendapat pertanyaan jalan, bukan pertanyaan kandang/gedung', () => {
    const ctx = extractUniversalContext('buatkan rab jalan desa panjang 500 meter lebar 4 meter');
    const ks = keys(ctx);
    expect(ks).toContain('road-pavement');
    expect(ks).toContain('road-drainage');
    expect(ks.some((k) => k.startsWith('kandang-'))).toBe(false);
    expect(ks.some((k) => k.startsWith('building-'))).toBe(false);
  });

  it('drainase, gudang, kolam, taman, renovasi masing-masing mendapat setnya sendiri', () => {
    expect(keys(extractUniversalContext('buatkan rab drainase lingkungan panjang 300 meter'))).toContain('drainage-material');
    expect(keys(extractUniversalContext('buatkan rab gudang industri 30 x 15 meter'))).toContain('warehouse-floor');
    expect(keys(extractUniversalContext('buatkan rab kolam renang 8 x 4 meter'))).toContain('pool-type');
    expect(keys(extractUniversalContext('buatkan rab taman kota luas 1000 m2'))).toContain('landscape-irrigation');
    // Renovasi: pertanyaan kuesioner menunggu cakupan renovasi terjawab
    // dulu di lapisan percakapan — setnya terdaftar untuk kategori ini.
    const renov = extractUniversalContext('buatkan rab renovasi rumah luas 90 m2');
    renov.renovationScopes = ['struktur'];
    expect(keys(renov)).toContain('renovation-condition');
  });

  it('gedung (kantor) mendapat pertanyaan pondasi/atap/grade/MEP', () => {
    const ctx = extractUniversalContext('buatkan rab kantor 2 lantai luas bangunan 240 m2 di surabaya');
    const ks = keys(ctx);
    expect(ks).toEqual(expect.arrayContaining(['building-foundation', 'building-roof-type', 'building-finish-grade', 'building-mep-scope']));
  });
});

describe('Adaptive Questionnaire — alur terpandu & penerapan jawaban', () => {
  it('alur direktif: budget → tanya dimensi → 153 m² tercatat → tanya tipe → KUESIONER tampil (bukan langsung brief)', () => {
    const { r1, r2, r3 } = kandangSampaiKuesioner();
    expect(r1.message).toContain('ukuran kandang');
    expect(r2?.message ?? '').toContain('terbuka');
    const ctx = getUniversalContextState();
    expect(ctx?.facts.some((f) => f.value.includes('17 × 9'))).toBe(true);
    expect(r3.questionnaire).toBeDefined();
    expect(r3.questionnaire?.questions.map((q) => q.key)).toEqual([
      'kandang-capacity',
      'kandang-roof-material',
      'kandang-floor',
      'kandang-facilities',
      'kandang-manure',
    ]);
    expect(r3.message).toContain('kartu kuesioner');
    expect(r3.message).not.toContain('Brief proyek');
  });

  it('jawaban tunggal diterapkan: jawaban + spek teknis + fakta TERKONFIRMASI', () => {
    kandangSampaiKuesioner();
    const res = submitQuestionnaireAnswers(jawabKandangPenuh);
    const ctx = getUniversalContextState();
    expect(ctx?.answers['kandang-roof-material']).toBe('Spandek');
    expect(ctx?.technicalSpecs).toContain('penutup atap: Spandek');
    expect(ctx?.counts.some((c) => c.unit === 'ekor' && c.value === 30)).toBe(true);
    const roofFact = ctx?.facts.find((f) => f.key === 'answer-kandang-roof-material');
    expect(roofFact?.status).toBe('USER_CONFIRMED');
    expect(res.message).toContain('Brief proyek');
    expect(res.message).toContain('Spesifikasi dari kuesioner');
  });

  it('jawaban ganda (multi) menjadi cakupan terkonfirmasi, bukan spek bebas', () => {
    kandangSampaiKuesioner();
    submitQuestionnaireAnswers(jawabKandangPenuh);
    const ctx = getUniversalContextState();
    const labels = (ctx?.scopeConfirmed ?? []).map((s) => s.label);
    expect(labels).toContain('Palung pakan & tempat minum ternak');
    expect(labels).toContain('Drainase & penampungan kotoran kandang');
  });

  it('jawaban khusus (teks bebas) diterima apa adanya & menjadi kapasitas', () => {
    kandangSampaiKuesioner();
    submitQuestionnaireAnswers({
      ...jawabKandangPenuh,
      'kandang-capacity': { selectedIds: [], customText: '45 ekor', status: 'answered' },
    });
    const ctx = getUniversalContextState();
    expect(ctx?.answers['kandang-capacity']).toBe('45 ekor');
    expect(ctx?.counts.some((c) => c.unit === 'ekor' && c.value === 45)).toBe(true);
  });

  it('jawaban dilewati tercatat BELUM TERSELESAIKAN & tidak ditanyakan ulang', () => {
    kandangSampaiKuesioner();
    submitQuestionnaireAnswers(jawabKandangPenuh);
    const ctx = getUniversalContextState();
    expect(ctx?.questionnaire.answers['kandang-manure']?.status).toBe('skipped');
    expect(questionnaireUnresolvedLabels(ctx!)).toContain('pengelolaan kotoran ternak');
    expect(keys(ctx!)).not.toContain('kandang-manure');
    expect(keys(ctx!)).toEqual([]);
  });

  it('pencegahan ganda: pertanyaan terjawab tidak pernah dipilih lagi; jejak percakapan utuh', () => {
    kandangSampaiKuesioner();
    const before = [...(getUniversalContextState()?.askedKeys ?? [])];
    submitQuestionnaireAnswers(jawabKandangPenuh);
    const ctx = getUniversalContextState();
    expect(ctx?.askedKeys).toEqual(before);
    expect(ctx?.questionnaire.status).toBe('submitted');
    expect(keys(ctx!)).toEqual([]);
  });

  it('validasi menolak kiriman tidak sah TANPA mengubah konteks (atomik)', () => {
    kandangSampaiKuesioner();
    const res = submitQuestionnaireAnswers({
      'kandang-roof-material': { selectedIds: ['opsi-ngawur'], customText: null, status: 'answered' },
    });
    expect(res.questionnaire).toBeDefined();
    const ctx = getUniversalContextState();
    expect(ctx?.answers['kandang-roof-material']).toBeUndefined();
    expect(ctx?.questionnaire.status).toBe('presented');
  });

  it('jawaban diubah sesudah terkirim: nilai lama diganti, koreksi tercatat, cakupan lama bersih', () => {
    kandangSampaiKuesioner();
    submitQuestionnaireAnswers(jawabKandangPenuh);
    submitQuestionnaireAnswers({
      ...jawabKandangPenuh,
      'kandang-roof-material': { selectedIds: ['atap-galvalum'], customText: null, status: 'answered' },
      'kandang-facilities': { selectedIds: ['fas-air'], customText: null, status: 'answered' },
    });
    const ctx = getUniversalContextState();
    expect(ctx?.answers['kandang-roof-material']).toBe('Galvalum');
    expect(ctx?.technicalSpecs.filter((s) => s.startsWith('penutup atap:'))).toEqual(['penutup atap: Galvalum']);
    expect(ctx?.corrections.some((c) => c.key === 'kuesioner:kandang-roof-material')).toBe(true);
    const labels = (ctx?.scopeConfirmed ?? []).map((s) => s.label);
    expect(labels).not.toContain('Palung pakan & tempat minum ternak');
    expect(labels).toContain('Instalasi air kandang');
  });

  it('afirmasi "itu aja" saat kuesioner tampil = lewati kuesioner → brief (BUKAN lompat generate)', () => {
    kandangSampaiKuesioner();
    const res = tryContinueUniversalContext('itu aja');
    const ctx = getUniversalContextState();
    expect(ctx?.questionnaire.status).toBe('submitted');
    expect(res?.message ?? '').toContain('Brief proyek');
    expect(getLastUniversalDraft()).toBeNull();
  });
});

describe('Adaptive Questionnaire — persistensi konteks', () => {
  it('serialisasi↔rehidrasi: keadaan kuesioner & jawaban pulih identik', () => {
    kandangSampaiKuesioner();
    submitQuestionnaireAnswers(jawabKandangPenuh);
    const ctx = getUniversalContextState()!;
    const restored = rehydrateUniversalIntakeContext(serializeUniversalIntakeContext(ctx));
    expect(restored?.primary?.id).toBe('kandang');
    expect(restored?.budget?.amount).toBe(300_000_000);
    expect(restored?.questionnaire.status).toBe('submitted');
    expect(restored?.answers['kandang-roof-material']).toBe('Spandek');
    expect(restored?.counts.some((c) => c.unit === 'ekor' && c.value === 30)).toBe(true);
  });

  it('save/load lewat lapisan persistensi draft (kunci saudara, amplop sama)', () => {
    kandangSampaiKuesioner();
    const ctx = getUniversalContextState()!;
    const saved = saveIntakeContext('PRJ-Q1', ctx);
    expect(saved.ok).toBe(true);
    const loaded = loadIntakeContext('PRJ-Q1');
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.ctx.primary?.id).toBe('kandang');
      expect(loaded.ctx.questionnaire.status).toBe('presented');
    }
    expect(peekIntakeContext('PRJ-Q1')).not.toBeNull();
  });

  it('fail-closed: versi skema tak dikenal tidak ditebak', () => {
    saveVersioned(AI_INTAKE_STORAGE_KEY, {
      'PRJ-X': {
        schemaVersion: 99,
        updatedAt: new Date().toISOString(),
        context: { version: 99, primaryId: 'kandang', secondaryIds: [], data: {} },
      },
    });
    const loaded = loadIntakeContext('PRJ-X');
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) expect(loaded.error).toBe('DRAFT_SCHEMA_UNSUPPORTED');
  });

  it('pergantian proyek: snapshot per proyek tidak tertukar', () => {
    const kandang = extractUniversalContext('buatkan rab kandang sapi 17 x 9 meter');
    const jalan = extractUniversalContext('buatkan rab jalan desa panjang 500 meter lebar 4 meter');
    saveIntakeContext('PRJ-A', kandang);
    saveIntakeContext('PRJ-B', jalan);
    const a = loadIntakeContext('PRJ-A');
    const b = loadIntakeContext('PRJ-B');
    expect(a.ok && a.ctx.primary?.id).toBe('kandang');
    expect(b.ok && b.ctx.primary?.id).toBe('jalan-lingkungan');
  });
});

describe('Adaptive Questionnaire — draf, budget, dan generate deterministik', () => {
  it('pelestarian draf: kirim kuesioner tanpa konteks aktif tidak menyentuh draf yang ada', () => {
    kandangSampaiKuesioner();
    submitQuestionnaireAnswers(jawabKandangPenuh);
    const gen = generateUniversalFromBrief();
    expect(gen?.actions?.some((a) => a.action.kind === 'push-universal')).toBe(true);
    const draft = getLastUniversalDraft();
    expect(draft).not.toBeNull();
    const res = submitQuestionnaireAnswers(jawabKandangPenuh);
    expect(res.ok).toBe(false);
    expect(getLastUniversalDraft()?.id).toBe(draft?.id);
  });

  it('pembaruan budget sesudah kuesioner: hanya field budget berubah, jawaban utuh', () => {
    // Alur CASE F: konteks kandang dengan budget awal dari gate.
    start('buatkan rab kandang sapi budget 500 juta');
    tryContinueUniversalContext('20 x 12 meter');
    applyUniversalOption('kandang-terbuka');
    submitQuestionnaireAnswers(jawabKandangPenuh);
    // Frasa koreksi yang didukung parser budget yang berlaku (kasus
    // Gelombang B): "Ubah budget menjadi …".
    const res = tryContinueUniversalContext('Ubah budget menjadi 400 juta.');
    const ctx = getUniversalContextState();
    expect(ctx?.budget?.amount).toBe(400_000_000);
    expect(ctx?.answers['kandang-roof-material']).toBe('Spandek');
    expect(res?.message ?? '').toContain('400.000.000');
  });

  it('generate sesudah konfirmasi: draf deterministik, relevan kandang, tanpa item asing, provenans utuh', () => {
    const runOnce = () => {
      clearUniversalContext();
      setLastUniversalDraft(null);
      kandangSampaiKuesioner();
      submitQuestionnaireAnswers(jawabKandangPenuh);
      const gen = generateUniversalFromBrief();
      const draft = getLastUniversalDraft();
      return { gen, draft };
    };
    const first = runOnce();
    expect(first.gen?.actions?.some((a) => a.action.kind === 'push-universal')).toBe(true);
    const draft = first.draft;
    expect(draft).not.toBeNull();
    const items = effectiveItems(draft!);
    expect(items.length).toBeGreaterThan(0);
    // Gerbang relevansi: tidak ada item keluarga asing untuk konteks kandang.
    const haystack = items.map((i) => i.description.toLowerCase()).join(' | ');
    expect(haystack).not.toContain('paving');
    expect(haystack).not.toContain('aspal hotmix');
    expect(haystack).not.toContain('tanaman hias');
    // Provenans: harga tak teresolusi tidak pernah menyumbang angka
    // (bukan Rp0 yang menyamar) — jumlah berharga-nya null.
    for (const item of items) {
      expect(typeof item.priceStatus).toBe('string');
      if (!isPriceValidForTotal(item)) expect(pricedAmount(item)).toBeNull();
    }
    // Deterministik: alur identik menghasilkan total identik.
    const t1 = computeTotals(draft!);
    const second = runOnce();
    const t2 = computeTotals(second.draft!);
    expect(t2.verifiedTotal).toBe(t1.verifiedTotal);
    expect(t2.estimatedTotal).toBe(t1.estimatedTotal);
    expect(t2.status).toBe(t1.status);
  });

  it('sinkronisasi konteks: satu singleton yang sama dipakai gate, lanjutan, dan kirim kuesioner', () => {
    kandangSampaiKuesioner();
    const ctxRef = getUniversalContextState();
    submitQuestionnaireAnswers(jawabKandangPenuh);
    // Objek yang sama (bukan salinan per mode tampilan) — Magic & Chat
    // berbagi registry dan konteks ini.
    expect(getUniversalContextState()).toBe(ctxRef);
    expect(getUniversalContextState()?.questionnaire.status).toBe('submitted');
  });
});

describe('Adaptive Questionnaire — kontrak render kartu', () => {
  it('komponen kartu memakai payload, pilihan lewati, dan tombol kirim Bahasa Indonesia', () => {
    const card = readSrc('../ai-tools/ezrab-ai/questionnaireCard.tsx');
    expect(card).toContain('Belum ditentukan');
    expect(card).toContain('Kirim Jawaban &amp; Tinjau Brief');
    expect(card).toContain('Ubah jawaban');
    expect(card).toContain('payload.questions');
  });

  it('tampilan percakapan merender kartu dari field pesan + gaya responsif tersedia', () => {
    const view = readSrc('../ai-tools/ezrab-ai/view.tsx');
    expect(view).toContain('QuestionnaireCard');
    expect(view).toContain('handleQuestionnaireSubmit');
    expect(view).toContain('saveIntakeContext');
    expect(view).toContain('loadIntakeContext');
    const css = readSrc('../ai-tools/ezrab-ai/ezrab-ai-chat.css');
    expect(css).toContain('.ezq-card');
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*\.ezq-opt/);
  });
});
