/**
 * Test: AI Conversational Intelligence Gelombang A (master prompt owner
 * 2026-11-11 22:26) — Fase 2–6.
 *  Fase 2: pesan pertama bersinyal proyek TIDAK dibalas menu generik
 *          (5 skenario §0 + parafrase berbeda kata).
 *  Fase 3: budget terstruktur persisten (MAXIMUM/ESTIMATED), koreksi
 *          field tunggal (T23/T25), tanah ≠ bangunan (T02).
 *  Fase 4: satu pertanyaan paling relevan per kategori (kandang
 *          terbuka/tertutup, jembatan bentang→tipe).
 *  Fase 5: gerbang relevansi — draft gudang baja tanpa item
 *          paving/jalan/geobag/direksi-keet liar; warehouse → template
 *          gudang (bukan kantor); kecocokan kata lemah = LOW.
 *  Fase 6: kategori non-katalog masuk percakapan kontekstual + WBS
 *          konseptual berlabel; renovasi multi-scope terstruktur.
 * PAGAR: LOKAL SAJA — tanpa commit/push/deploy/billing.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  executeIntent, tryContinueUniversalContext,
  getUniversalContextState, clearUniversalContext, clearProjectContext,
} from '../ai-tools/ezrab-ai/actionRegistry';
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import {
  extractUniversalContext, parseBudgetMention,
} from '../ai-tools/ezrab-ai/universalIntake';
import { buildUniversalDraft, effectiveItems } from '../ai-tools/ezrab-ai/universalRab';
import { classifyItemRelevance } from '../ai-tools/ezrab-ai/relevanceGate';

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
  return executeIntent(r.intent as never, r.param, ctxFor(text));
};

beforeEach(() => {
  clearProjectContext();
  clearUniversalContext();
});

describe('Fase 2 — AI-first: sinyal proyek tidak jatuh ke menu generik', () => {
  it('S1 kandang sapi → pertanyaan kandang terbuka/tertutup, BUKAN menu generik', () => {
    const res = start('buatkan rab kandang sapi budget 275jt lebar 10 x 25 m buat yang simple aja');
    expect(res.message).not.toContain(GENERIC_MENU_MARK);
    expect(res.message).toContain('terbuka');
    expect(getUniversalContextState()?.primary?.id).toBe('kandang');
    expect(getUniversalContextState()?.budget?.amount).toBe(275_000_000);
  });

  it('S1 parafrase (lembu, hitungkan, anggaran maksimal) → kontekstual + budget MAXIMUM', () => {
    const res = start('tolong hitungkan rab kandang lembu anggaran maksimal 300 juta, ukuran 12 kali 30 meter, model sederhana');
    expect(res.message).not.toContain(GENERIC_MENU_MARK);
    const ctx = getUniversalContextState();
    expect(ctx?.primary?.id).toBe('kandang');
    expect(ctx?.budget?.amount).toBe(300_000_000);
    expect(ctx?.budget?.kind).toBe('MAXIMUM');
    expect(ctx?.dimensionsText).toContain('12');
  });

  it('S5 jembatan kecil → bertanya bentang (percakapan hidup), BUKAN "kirim ulang"', () => {
    const res = start('buatkan rab jembatan kecil untuk akses perkebunan');
    expect(res.message).not.toContain(GENERIC_MENU_MARK);
    expect(res.message).not.toContain('Kirim ulang');
    expect(res.message).toContain('bentang');
    // Lanjutan diskusi teknis: jawab bentang → tanya tipe konstruksi.
    const cont = tryContinueUniversalContext('bentang 6 meter');
    expect(cont!.message).toContain('konstruksi');
    // Jawab tipe → brief memuat WBS konseptual berlabel + bentang tercatat.
    const brief = tryContinueUniversalContext('beton');
    expect(brief!.message).toContain('Brief proyek');
    expect(brief!.message).toContain('WBS konseptual');
    expect(brief!.message).toContain('6');
  });

  it('S5 parafrase (perlu rab jembatan desa) → bukan UNKNOWN/menu', () => {
    expect(routeIntent('perlu rab jembatan desa kecil buat akses ke kebun').intent).toBe('CREATE_RAB_SUMMARY');
  });

  it('S4 renovasi multi-scope → scope gabungan terstruktur, bukan menu', () => {
    const res = start('buatkan rab renovasi dapur dan kamar mandi dan atap');
    expect(res.message).not.toContain(GENERIC_MENU_MARK);
    const ctx = getUniversalContextState();
    expect(ctx?.renovationScopes).toContain('dapur');
    expect(ctx?.renovationScopes).toContain('kamar mandi');
    expect(ctx?.renovationScopes).toContain('atap');
  });

  it('S4 parafrase (minta rab perbaikan…) → bukan UNKNOWN', () => {
    expect(routeIntent('minta rab perbaikan dapur, toilet, sama atap rumah saya').intent).not.toBe('UNKNOWN');
  });

  it('S2 parafrase (hunian, dana sekitar) → bukan menu generik; budget ESTIMATED terbaca di konteks universal', () => {
    const res = start('bikin rab hunian dua lantai di lahan 120 meter persegi dana sekitar 900 juta');
    expect(res.message).not.toContain(GENERIC_MENU_MARK);
    const uctx = extractUniversalContext('bikin rab hunian dua lantai di lahan 120 meter persegi dana sekitar 900 juta');
    expect(uctx.budget?.amount).toBe(900_000_000);
    expect(uctx.budget?.kind).toBe('ESTIMATED');
  });

  it('"buatkan rab" tanpa sinyal apa pun TETAP menu generik (jalur ambigu tidak berubah)', () => {
    const res = executeIntent('CREATE_RAB_CLARIFY', undefined, ctxFor('buatkan rab'));
    expect(res.message).toContain(GENERIC_MENU_MARK);
  });
});

describe('Fase 3 — konteks universal: budget, koreksi, tanah≠bangunan', () => {
  it('T02: "tanah 120 m2" menjadi luas LAHAN, bukan luas bangunan', () => {
    const ctx = extractUniversalContext('buatkan rab rumah 2 lantai tanah 120 m2 budget 850jt');
    expect(ctx.landAreaM2).toBe(120);
    expect(ctx.buildingAreaM2).toBeNull();
    expect(ctx.floors).toBe(2);
    expect(ctx.budget?.amount).toBe(850_000_000);
  });

  it('T23: koreksi budget = field tunggal; nilai lama jadi riwayat, konteks lain utuh', () => {
    const a = extractUniversalContext('buatkan rab gudang 20x40 m budget 500jt');
    const b = extractUniversalContext('budgetnya bukan 500jt, tapi maksimal 450jt', a);
    expect(b.budget?.amount).toBe(450_000_000);
    expect(b.budget?.kind).toBe('MAXIMUM');
    expect(b.budgetHistory.map((h) => h.amount)).toContain(500_000_000);
    expect(b.dimensionsText).toBe(a.dimensionsText);
    expect(b.corrections.some((c) => c.key === 'budget')).toBe(true);
  });

  it('T25: koreksi panjang 500→750 m; lebar yang menyusul tidak menghapus panjang baru', () => {
    const a = extractUniversalContext('buatkan rab jalan beton sepanjang 500 meter');
    const b = extractUniversalContext('panjangnya bukan 500 meter, tapi 750 meter', a);
    expect(b.lengthM).toBe(750);
    expect(b.corrections.some((c) => c.key === 'length')).toBe(true);
    const c = extractUniversalContext('lebarnya 4 meter', b);
    expect(c.lengthM).toBe(750);
    expect(c.widthM).toBe(4);
  });

  it('parseBudgetMention: miliar/jt/Rp penuh + kualifier', () => {
    expect(parseBudgetMention('budget 1,5 miliar')?.amount).toBe(1_500_000_000);
    expect(parseBudgetMention('anggaran sekitar 250 jt')?.kind).toBe('ESTIMATED');
    expect(parseBudgetMention('dana mentok 75 juta')?.kind).toBe('MAXIMUM');
    expect(parseBudgetMention('budget Rp275.000.000')?.amount).toBe(275_000_000);
  });
});

describe('Fase 5 — gerbang relevansi (tidak terkalibrasi, aturan eksplisit)', () => {
  it('kecocokan kata semata TIDAK cukup: gudang semen / muat dari gudang = LOW', () => {
    expect(classifyItemRelevance('Pembuatan gudang semen', 'gudang-industri').level).toBe('LOW');
    expect(classifyItemRelevance('Muat barang dari gudang ke truk', 'gudang-industri').level).toBe('LOW');
  });

  it('item jalan/paving pada proyek gudang = REJECTED; dengan permintaan jalan eksplisit = lolos', () => {
    expect(classifyItemRelevance('Pemasangan Paving Block K-300', 'gudang-industri').level).toBe('REJECTED');
    expect(classifyItemRelevance('Pemasangan Paving Block K-300', 'gudang-industri', ['jalan']).level).not.toBe('REJECTED');
    expect(classifyItemRelevance('Pengadaan Geobag untuk perkuatan', 'gudang-industri').level).toBe('REJECTED');
    expect(classifyItemRelevance('Pembuatan Direksi Keet', 'gudang-industri').level).toBe('REJECTED');
    expect(classifyItemRelevance('Fabrikasi & Ereksi Struktur Rangka Baja Profil WF', 'gudang-industri').level).toBe('HIGH');
  });

  it('draft gudang baja (3 varian kata) TANPA item paving/jalan/geobag/direksi-keet liar', () => {
    for (const text of [
      'buatkan rab gudang baja 20x40 m',
      'buatkan rab warehouse rangka baja ukuran 15 x 30 meter',
      'buatkan rab gudang baja ukuran 12 x 24 m',
    ]) {
      const b = buildUniversalDraft(text);
      expect(b.kind).toBe('draft');
      if (b.kind !== 'draft') continue;
      const descs = effectiveItems(b.draft).map((i) => i.description.toLowerCase());
      for (const d of descs) {
        expect(d).not.toContain('paving');
        expect(d).not.toContain('geobag');
        expect(d).not.toContain('direksi keet');
        expect(d).not.toContain('marka jalan');
      }
      // Template terpilih harus keluarga gudang, bukan kantor.
      expect(b.draft.parts[0].template.name.toLowerCase()).toContain('gudang');
    }
  });
});

describe('Fase 6 — kategori non-katalog & workflow kontekstual', () => {
  it('jawaban kandang "terbuka" tercatat terstruktur dan lanjut ke brief', () => {
    start('buatkan rab kandang sapi budget 275jt lebar 10 x 25 m buat yang simple aja');
    const cont = tryContinueUniversalContext('kandang terbuka');
    expect(getUniversalContextState()?.answers['kandang-type']).toBe('terbuka');
    expect(cont!.message).toContain('Brief proyek');
    expect(cont!.message).toContain('WBS konseptual');
    expect(cont!.message).toContain('275');
  });

  it('rekomendasi workflow TIDAK tampil sebagai 4 metode pada respons pertama bersinyal', () => {
    const res = start('buatkan rab gudang baja 20x40 m');
    expect(res.message).not.toContain(GENERIC_MENU_MARK);
  });
});
