/**
 * New-project flow gaps B/C/D (2026-11-26, Step 3 Magic AI).
 *
 * Owner requirement (mockup di-ACC 2026-11-26): sesudah pengguna memilih
 * jenis RAB, chat menanyakan SATU follow-up terpenting per jenis —
 * lantai untuk rumah, clear height untuk gudang — lalu satu pertanyaan
 * kondisi lahan, lalu ringkasan sebelum draft.
 *
 *  GAP B — Rumah Tinggal: "Berapa lantai?" ditanya SEKALI (chip
 *    1/2/3/4+); jawaban tersimpan sebagai floors; tanpa jawaban, floors
 *    tetap UNKNOWN dan asumsi 1 lantai yang terlabel tetap berlaku
 *    (keputusan hardening owner 2026-11-26 — default draft TIDAK
 *    berubah, pertanyaan non-blokir).
 *  GAP C — Gudang: clear height ditanyakan juga di alur bare-chip
 *    (luas dijawab di dalam intake) lewat prompt gabungan
 *    warehouse-system; jawaban tersimpan (sistem + heightM).
 *  GAP D — Ketuk chip sapaan telanjang ("Rumah Tinggal", "Gudang", …)
 *    mencapai gerbang intake deterministik — bukan pipeline live-AI.
 *    Tes ini menggerakkan JALUR KETUK yang sama dengan live tap
 *    (seed greeting → tryGreetingRabType, fungsi yang dipanggil submit
 *    saat awaitingRabType aktif) TANPA memanggil gerbang
 *    (universalIntakeGate/projectIntakeGate/rabSummaryResult) langsung.
 *
 * Jalankan: npx --yes vitest run src/test/newProjectGapsBCD.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import {
  buildNewProjectGreeting,
  buildNewProjectGreetingSuggestions,
  NEW_PROJECT_GREETING_SUGGESTIONS,
  type NewProjectFormInput,
} from '../ai-tools/ezrab-ai/newProjectMagicPrompt';
import {
  executeIntent,
  universalIntakeGate,
  tryContinueUniversalContext,
  tryGreetingRabType,
  continueRabNeeds,
  clearProjectContext,
  clearUniversalContext,
  getUniversalContextState,
  getLastRabNeeds,
  setLastRabNeeds,
} from '../ai-tools/ezrab-ai/actionRegistry';
import { extractUniversalContext, selectNextQuestion } from '../ai-tools/ezrab-ai/universalIntake';

const mockCtx = {
  navigate: () => {},
  currentMenu: 'ezrab-ai',
  activeProject: null,
  projects: [],
  projectTotal: null,
};
const ctxFor = (rawText: string) => ({ ...mockCtx, rawText }) as never;
type Res = { message: string; awaitRabNeeds?: boolean; awaitProjectConcept?: boolean; actions?: Array<{ label: string; action: { kind: string; intent?: string; param?: string } }> };
const exec = (text: string): Res =>
  executeIntent(routeIntent(text).intent as never, undefined, ctxFor(text)) as Res;
const count = (text: string, re: RegExp): number => (text.match(re) ?? []).length;

beforeEach(() => {
  clearProjectContext();
  clearUniversalContext();
  setLastRabNeeds(null);
});

describe('Gap B — lantai rumah ditanya sekali, jawaban tersimpan', () => {
  it('ringkasan pertama rumah: "Berapa lantai?" tepat 1× + chip 1/2/3/4+', () => {
    const r1 = exec('Buatkan RAB rumah tinggal');
    expect(count(r1.message, /Berapa lantai\?/g)).toBe(1);
    const chips = (r1.actions ?? []).filter((a) => a.action.param?.startsWith('floors:'));
    expect(chips.map((c) => c.label)).toEqual(['1 lantai', '2 lantai', '3 lantai', '4+ lantai']);
    expect(r1.message).toContain('1 lantai (asumsi');
  });

  it('jawaban ketikan "3 lantai" → floors=3 tersimpan; pertanyaan tidak diulang', () => {
    exec('Buatkan RAB rumah tinggal');
    const r2 = continueRabNeeds('3 lantai', null);
    expect(getLastRabNeeds()?.floors).toBe(3);
    expect(r2.message).toContain('Jumlah lantai: 3 lantai');
    expect(count(r2.message, /Berapa lantai\?/g)).toBe(0);
  });

  it('jawaban chip floors:3 / floors:4 → floors tersimpan (jalur tombol RAB_NEEDS_REFINE)', () => {
    exec('Buatkan RAB rumah tinggal');
    const r3 = executeIntent('RAB_NEEDS_REFINE', 'floors:3', ctxFor('')) as Res;
    expect(getLastRabNeeds()?.floors).toBe(3);
    expect(r3.message).toContain('Jumlah lantai: 3 lantai');
    const r4 = executeIntent('RAB_NEEDS_REFINE', 'floors:4', ctxFor('')) as Res;
    expect(getLastRabNeeds()?.floors).toBe(4);
    expect(r4.message).toContain('Jumlah lantai: 4 lantai');
  });

  it('tanpa jawaban lantai: floors UNKNOWN + asumsi 1 lantai terlabel utuh', () => {
    const r1 = exec('Buatkan RAB rumah tinggal');
    expect(getLastRabNeeds()?.floors).toBeNull();
    expect(r1.message).toContain('1 lantai (asumsi — tidak disebutkan; koreksi bila berbeda)');
    // Jawaban lain (luas) tanpa lantai: lantai tetap UNKNOWN, tidak
    // pernah ditanya ulang.
    const r2 = continueRabNeeds('luas bangunan 120 m2', null);
    expect(getLastRabNeeds()?.floors).toBeNull();
    expect(count(r2.message, /Berapa lantai\?/g)).toBe(0);
  });

  it('lantai sudah disebut di awal → tidak ditanya (langsung draft parametrik)', () => {
    // Permintaan lengkap merute CREATE_RAB_DIRECT (draft parametrik),
    // bukan ringkasan kebutuhan — jadi tidak ada state lastRabNeeds;
    // yang dipin: pertanyaan lantai TIDAK muncul dan lantai yang
    // disebut dipakai draft ("2 lantai" di judul RAB awal).
    const r1 = exec('Buatkan RAB rumah tinggal 2 lantai luas 120 m2');
    expect(count(r1.message, /Berapa lantai\?/g)).toBe(0);
    expect(r1.message).toContain('2 lantai');
  });
});

describe('Gap C — clear height gudang di alur bare-chip', () => {
  it('bare-chip: luas → sistem + clear height (tepat 1×) → jawaban tersimpan', () => {
    const t1 = universalIntakeGate('Buatkan RAB gudang', false, null);
    expect(t1?.message).toContain('luas bangunan total');
    const t2 = tryContinueUniversalContext('luas bangunan 500 m2', null);
    expect(t2?.message).toContain('clear height');
    expect(count(t2?.message ?? '', /clear height/g)).toBe(1);
    const keys = getUniversalContextState()?.askedKeys ?? [];
    expect(keys.filter((k) => k === 'warehouse-system').length).toBe(1);
    const t3 = tryContinueUniversalContext('portal frame, clear height 8 m', null);
    expect(getUniversalContextState()?.answers['warehouse-system']).toBe('portal frame');
    expect(getUniversalContextState()?.heightM).toBe(8);
    // Sesudah terjawab: sistem tidak ditanya ulang; kuesioner tetap jalan.
    expect(t3?.message ?? '').not.toContain('clear height');
    expect(t3?.message).toContain('kuesioner');
  });

  it('luas sudah di pesan pertama: sistem + clear height tetap pertanyaan pertama', () => {
    expect(selectNextQuestion(extractUniversalContext('buatkan rab gudang 500 m2'))?.key)
      .toBe('warehouse-system');
    expect(selectNextQuestion(extractUniversalContext('buatkan rab gudang 500 m2'))?.prompt(
      extractUniversalContext('buatkan rab gudang 500 m2'),
    )).toContain('clear height');
  });

  it('hanya clear height tanpa sistem: tinggi tersimpan, sistem tercatat belum teresolusi (tidak diulang)', () => {
    universalIntakeGate('Buatkan RAB gudang', false, null);
    tryContinueUniversalContext('luas bangunan 500 m2', null);
    const t3 = tryContinueUniversalContext('clear height 7,5 m', null);
    expect(getUniversalContextState()?.heightM).toBe(7.5);
    expect(getUniversalContextState()?.answers['warehouse-system']).toBeUndefined();
    expect(t3?.message ?? '').not.toContain('clear height');
  });
});

describe('Gap D — ketuk chip sapaan mencapai gerbang deterministik', () => {
  it('prasyarat: label chip telanjang merute UNKNOWN (inilah celahnya)', () => {
    for (const chip of NEW_PROJECT_GREETING_SUGGESTIONS) {
      expect(routeIntent(chip).intent).toBe('UNKNOWN');
    }
  });

  it('seed greeting → tap tiap chip → pertanyaan follow-up deterministik (tanpa gerbang langsung)', () => {
    // Seed: sapaan + chip dari form proyek baru (jalur modal Step 3).
    const form: NewProjectFormInput = { name: 'Proyek Baru', buildingType: 'Gudang & Pabrik' };
    const greeting = buildNewProjectGreeting(form);
    const suggestions = buildNewProjectGreetingSuggestions(form);
    expect(greeting).toContain('Proyek Baru');
    expect(suggestions).toHaveLength(6);
    expect(suggestions[0]).toBe('Gudang');
    // Tap: tiap chip lewat tryGreetingRabType — fungsi yang dipanggil
    // submit() saat awaitingRabType aktif (jalur ketuk live).
    const expected: Record<string, string> = {
      'Rumah Tinggal': 'Berapa lantai?',
      'Landscape & Taman': 'Landscape seperti apa',
      'Gudang': 'luas bangunan total',
      'Drainase': 'panjang',
      'Jembatan': 'bentang jembatan',
      'Renovasi': 'Bagian mana saja yang ingin direnovasi',
    };
    for (const chip of suggestions) {
      clearProjectContext();
      clearUniversalContext();
      setLastRabNeeds(null);
      const res = tryGreetingRabType(chip, null);
      expect(res).not.toBeNull();
      expect(res?.message).toContain(expected[chip]);
    }
  });

  it('tap chip "Rumah Tinggal": ringkasan rumah + pertanyaan lantai (Gap B ikut jalan)', () => {
    const res = tryGreetingRabType('Rumah Tinggal', null);
    expect(res?.message).toContain('Berapa lantai?');
    expect(res?.message).toContain('1 lantai (asumsi');
    expect(res?.awaitRabNeeds).toBe(true);
    expect(getLastRabNeeds()?.floors).toBeNull();
  });

  it('tap chip "Gudang": pertanyaan luas, lalu clear height (Gap C ikut jalan)', () => {
    const res = tryGreetingRabType('Gudang', null);
    expect(res?.message).toContain('luas bangunan total');
    const t2 = tryContinueUniversalContext('luas bangunan 500 m2', null);
    expect(t2?.message).toContain('clear height');
  });

  it('bukan chip → null (submit normal tidak terganggu)', () => {
    expect(tryGreetingRabType('Buatkan RAB rumah tinggal', null)).toBeNull();
    expect(tryGreetingRabType('Gudang besar', null)).toBeNull();
    expect(tryGreetingRabType('halo', null)).toBeNull();
    expect(tryGreetingRabType('', null)).toBeNull();
  });

  it('ketikan kategori saat sapaan menunggu (huruf kecil) ikut dirutekan', () => {
    const res = tryGreetingRabType('gudang', null);
    expect(res?.message).toContain('luas bangunan total');
  });
});
