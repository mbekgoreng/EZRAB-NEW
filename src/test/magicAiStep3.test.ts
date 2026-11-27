/**
 * Magic AI Step 3 — alur proyek baru (2026-11-26).
 *
 * Yang dipin di sini (tanpa live AI, tanpa vite build):
 *  1. ENTRY: openEzrabAI mode 'rab-generator' membawa `greeting` +
 *     `greetingSuggestions` dari modal; prompt tetap prefill (bukan
 *     autosend). Konsumsi + seed-nya sendiri hidup di view.tsx
 *     (takePendingEntry + efek seed greeting) — komponen React itu
 *     tidak dirender harness ini; seed-nya diverifikasi lewat tsc +
 *     cek browser oleh induk. Tes ini memin kontrak entry-nya.
 *  2. FOLLOW-UP per kategori lewat gerbang yang sudah ada (tanpa
 *     mengubah gerbang): pertanyaan pertama + urutan + tepat-sekali
 *     per chip (Rumah Tinggal, Landscape & Taman, Gudang, Drainase,
 *     Jembatan, Renovasi).
 *  3. SITE generik universal (site-condition, non-kritis): ditanyakan
 *     sekali, tidak pernah diulang, tidak menggandakan pertanyaan
 *     kondisi jalan/landscape; jawaban ditangkap SITE_PATTERNS lewat
 *     extractProjectContext (tanpa duplikasi pola).
 *  4. D5: budget dari prompt sintesis modal ("anggaran maksimal
 *     Rp…") tetap memicu overBudgetAskBack lewat alur baru — jalur
 *     cepat maupun jalur intake → brief → generate (3 opsi, tanpa
 *     Push, draft belum final).
 *
 * Jalankan: npx --yes vitest run src/test/magicAiStep3.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  openEzrabAI,
  peekPendingEzrabAiEntry,
  peekPendingAiEntry,
  clearPendingEzrabAiEntry,
  clearPendingAiEntry,
} from '../ai-tools/aiNavigation';
import {
  buildNewProjectMagicPrompt,
  buildNewProjectGreeting,
  buildNewProjectGreetingSuggestions,
  NEW_PROJECT_GREETING_SUGGESTIONS,
  type NewProjectFormInput,
} from '../ai-tools/ezrab-ai/newProjectMagicPrompt';
import {
  extractUniversalContext,
  selectNextQuestion,
} from '../ai-tools/ezrab-ai/universalIntake';
import {
  executeIntent,
  universalIntakeGate,
  projectIntakeGate,
  tryContinueUniversalContext,
  tryContinueProjectContext,
  clearProjectContext,
  clearUniversalContext,
  getUniversalContextState,
  getLastRabNeeds,
} from '../ai-tools/ezrab-ai/actionRegistry';
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';

// Mock window untuk navigateTo + event (pola aiUnification.test.ts).
const dispatched: string[] = [];
let lastUrl = '';
(global as unknown as { window: unknown }).window = {
  history: {
    pushState: (_s: unknown, _t: string, url: string) => { lastUrl = url; },
    replaceState: (_s: unknown, _t: string, url: string) => { lastUrl = url; },
  },
  dispatchEvent: (e: { type?: string }) => { dispatched.push(e?.type ?? 'event'); return true; },
  addEventListener: () => {},
  removeEventListener: () => {},
};

const mockCtx = {
  navigate: () => {},
  currentMenu: 'ezrab-ai',
  activeProject: null,
  projects: [],
  projectTotal: null,
};
const ctxFor = (rawText: string) => ({ ...mockCtx, rawText }) as never;
type Res = { message: string; awaitProjectConcept?: boolean; awaitRabNeeds?: boolean; awaitBudgetDecision?: boolean; actions?: Array<{ label: string; action: { kind: string } }> };
const exec = (text: string): Res =>
  executeIntent(routeIntent(text).intent as never, undefined, ctxFor(text)) as Res;
const hasPush = (res: Res): boolean =>
  (res.actions ?? []).some((a) => a.action.kind === 'push-universal');
const count = (text: string, re: RegExp): number => (text.match(re) ?? []).length;

const GUDANG_FORM: NewProjectFormInput = {
  name: 'Gudang Probolinggo',
  buildingType: 'Gudang & Pabrik',
  buildingAreaM2: 500,
  floorCount: 1,
  maxBudgetRp: 100_000_000,
};

beforeEach(() => {
  clearProjectContext();
  clearUniversalContext();
  clearPendingAiEntry();
  clearPendingEzrabAiEntry();
  dispatched.length = 0;
  lastUrl = '';
});

describe('Step 3 — entry greeting (aiNavigation)', () => {
  it('rab-generator membawa greeting + 6 chip; prompt tetap prefill', () => {
    const greeting = buildNewProjectGreeting(GUDANG_FORM);
    const suggestions = buildNewProjectGreetingSuggestions(GUDANG_FORM);
    const prompt = buildNewProjectMagicPrompt(GUDANG_FORM);
    expect(suggestions).toHaveLength(6);
    expect(suggestions[0]).toBe('Gudang');
    expect(suggestions.slice().sort()).toEqual([...NEW_PROJECT_GREETING_SUGGESTIONS].sort());
    expect(greeting).toContain('Gudang Probolinggo');
    expect(greeting).toContain('Anggaran maksimal Rp100.000.000');
    expect(prompt).toContain('Anggaran maksimal Rp100.000.000');

    openEzrabAI({
      mode: 'rab-generator',
      prompt,
      projectId: 'proj-step3',
      projectName: 'Gudang Probolinggo',
      source: 'create-project',
      greeting,
      greetingSuggestions: suggestions,
    });

    const modeEntry = peekPendingEzrabAiEntry();
    expect(modeEntry?.mode).toBe('rab-generator');
    expect(modeEntry?.ctx.greeting).toBe(greeting);
    expect(modeEntry?.ctx.greetingSuggestions).toEqual(suggestions);
    expect(modeEntry?.ctx.projectId).toBe('proj-step3');
    // Prompt tetap prefill: entry klasik membawa initialPrompt tanpa
    // sendMode autosend; tidak ada yang terkirim otomatis.
    const classic = peekPendingAiEntry();
    expect(classic?.ctx.initialPrompt).toBe(prompt);
    expect(classic?.ctx.sendMode).not.toBe('autosend');
    expect(lastUrl).toContain('ezrab-ai');
  });

  it('tanpa greeting: entry tidak membawa greeting (perilaku lama utuh)', () => {
    openEzrabAI({ mode: 'chat', projectId: 'proj-A', projectName: 'Gedung A', source: 'dashboard' });
    expect(peekPendingEzrabAiEntry()?.ctx.greeting).toBeUndefined();
    expect(peekPendingEzrabAiEntry()?.ctx.greetingSuggestions).toBeUndefined();
  });
});

describe('Step 3 — follow-up per kategori (gerbang yang sudah ada)', () => {
  it('Gudang: luas dulu; sistem + clear height bila luas sudah disebut; luas tidak ditanya ulang', () => {
    const t1 = universalIntakeGate('Buatkan RAB gudang', false, null);
    expect(t1?.message).toContain('luas bangunan total');
    // Jalur multi-giliran: luas dijawab → giliran berikut bukan luas lagi.
    const t2 = tryContinueUniversalContext('luas bangunan 500 m2', null);
    expect(t2?.message ?? '').not.toContain('Berapa perkiraan **luas bangunan total**');
    expect(getUniversalContextState()?.buildingAreaM2).toBe(500);
    // Bila luas sudah disebut di pesan pertama, giliran sistem yang
    // ditanya — prompt-nya sekaligus menanyakan clear height (pin §8:
    // TIDAK ADA pertanyaan clear-height terpisah).
    expect(selectNextQuestion(extractUniversalContext('buatkan rab gudang 500 m2'))?.key)
      .toBe('warehouse-system');
    expect(selectNextQuestion(extractUniversalContext('buatkan rab gudang 500 m2'))?.prompt(
      extractUniversalContext('buatkan rab gudang 500 m2'),
    )).toContain('clear height');
  });

  it('Jembatan: bentang lalu tipe konstruksi, masing-masing tepat sekali', () => {
    const t1 = universalIntakeGate('Buatkan RAB jembatan', false, null);
    expect(t1?.message).toContain('bentang jembatan');
    const t2 = tryContinueUniversalContext('bentang 20 meter', null);
    expect(t2?.message).toMatch(/beton.*baja.*kayu/s);
    const asked = getUniversalContextState()?.askedKeys ?? [];
    expect(asked.filter((k) => k === 'bridge-span').length).toBe(1);
    expect(asked.filter((k) => k === 'bridge-type').length).toBe(1);
    const t3 = tryContinueUniversalContext('beton', null);
    expect(t3?.message ?? '').not.toContain('bentang jembatan');
    expect(t3?.message ?? '').not.toContain('mau konstruksi');
    const askedAfter = getUniversalContextState()?.askedKeys ?? [];
    expect(askedAfter.filter((k) => k === 'bridge-span').length).toBe(1);
    expect(askedAfter.filter((k) => k === 'bridge-type').length).toBe(1);
  });

  it('Drainase: tanpa panjang → minta panjang; dengan panjang → tanya tipe saluran', () => {
    const bare = exec('Buatkan RAB drainase');
    expect(bare.message).toContain('panjang');
    expect(selectNextQuestion(extractUniversalContext('buatkan rab drainase sepanjang 500 meter'))?.key)
      .toBe('drainage-type');
    const prompt = selectNextQuestion(
      extractUniversalContext('buatkan rab drainase sepanjang 500 meter'),
    )?.prompt(extractUniversalContext('buatkan rab drainase sepanjang 500 meter')) ?? '';
    expect(prompt).toContain('U-ditch pracetak');
  });

  it('Renovasi: lingkup dulu', () => {
    expect(selectNextQuestion(extractUniversalContext('Buatkan RAB renovasi rumah'))?.key)
      .toBe('renovation-scope');
    const t1 = universalIntakeGate('Buatkan RAB renovasi rumah', false, null);
    expect(t1?.message).toContain('Bagian mana saja yang ingin direnovasi');
  });

  it('Landscape & Taman: konsep → fasilitas → kondisi lahan tepat 1× → pratinjau; gerbang universal tidak mengambil alih', () => {
    expect(universalIntakeGate('Buatkan RAB landscape taman', false, null)).toBeNull();
    const t1 = projectIntakeGate('Buatkan RAB landscape taman', null);
    expect(t1?.message).toContain('Landscape seperti apa');
    // Konsep custom tidak membawa fasilitas bawaan → pertanyaan
    // fasilitas tampil (bukan dilewati seperti konsep bernama yang
    // sudah mengimplikasikan satu fasilitas).
    const t2 = executeIntent('RAB_CONCEPT_SELECT', 'custom', ctxFor('')) as Res;
    expect(t2.message).toContain('Fasilitas apa saja yang dibutuhkan');
    const t3 = tryContinueProjectContext('jogging track dan area duduk', null);
    expect(t3?.message).toContain('Bagaimana kondisi lahan eksistingnya?');
    const t4 = tryContinueProjectContext('lahan miring', null);
    expect(t4?.message).toContain('Pratinjau RAB');
    expect(t4?.message).toContain('lahan berkontur/miring');
    const all = [t1?.message ?? '', t2.message, t3?.message ?? '', t4?.message ?? ''].join('\n');
    expect(count(all, /Bagaimana kondisi lahan eksistingnya\?/g)).toBe(1);
  });

  it('Landscape & Taman: konsep bernama mengimplikasikan fasilitas → site langsung ditanya 1×', () => {
    const t1 = projectIntakeGate('Buatkan RAB landscape taman', null);
    expect(t1?.message).toContain('Landscape seperti apa');
    const t2 = tryContinueProjectContext('taman kota', null);
    expect(t2?.message).toContain('Bagaimana kondisi lahan eksistingnya?');
    const t3 = tryContinueProjectContext('jogging track dan area duduk', null);
    expect(t3?.message).toContain('Pratinjau RAB');
    const t4 = tryContinueProjectContext('lahan miring', null);
    expect(t4?.message).toContain('lahan berkontur/miring');
    const all = [t1?.message ?? '', t2?.message ?? '', t3?.message ?? '', t4?.message ?? ''].join('\n');
    expect(count(all, /Bagaimana kondisi lahan eksistingnya\?/g)).toBe(1);
  });

  it('Rumah Tinggal: lantai DITANYA sekali (chip 1/2/3/4+) + asumsi 1 lantai tetap terlabel bila tak dijawab', () => {
    // PIN DIPERBARUI 2026-11-26 (owner requirement — mockup Step 3
    // di-ACC: "tanyakan jumlah lantai untuk rumah"): perilaku lama
    // ("lantai diasumsikan 1, bukan ditanya") DIGANTI — ringkasan kini
    // menanyakan "Berapa lantai?" SEKALI dengan chip 1/2/3/4+,
    // SEMENTARA baris asumsi 1 lantai yang terlabel tetap tampil dan
    // floors tetap UNKNOWN (null) bila tak dijawab (keputusan hardening
    // owner 2026-11-26: default draft TIDAK berubah, pertanyaan
    // non-blokir). Jawaban + penyimpanan diuji di
    // newProjectGapsBCD.test.ts (Gap B).
    const r1 = exec('Buatkan RAB rumah tinggal');
    expect(r1.message).toContain('1 lantai (asumsi');
    expect(r1.message).toContain('Masih kurang: luas bangunan');
    expect(r1.message).toContain('Berapa lantai?');
    expect(r1.message.match(/Berapa lantai\?/g)).toHaveLength(1);
    expect(r1.awaitRabNeeds).toBe(true);
    const floorChips = (r1.actions ?? []).filter(
      (a) => a.action.kind === 'intent'
        && (a.action as { intent?: string }).intent === 'RAB_NEEDS_REFINE'
        && typeof (a.action as { param?: string }).param === 'string'
        && ((a.action as { param?: string }).param as string).startsWith('floors:'),
    );
    expect(floorChips.map((c) => c.label)).toEqual(['1 lantai', '2 lantai', '3 lantai', '4+ lantai']);
    expect(floorChips.map((c) => (c.action as { param?: string }).param)).toEqual(['floors:1', 'floors:2', 'floors:3', 'floors:4']);
    // Tanpa jawaban lantai: floors tetap UNKNOWN (null).
    expect(getLastRabNeeds()?.floors).toBeNull();
  });
});

describe('Step 3 — pertanyaan kondisi lahan/tapak generik (universal)', () => {
  it('ditanyakan sebagai pertanyaan pertama bila semua kritis sudah terpenuhi; non-kritis', () => {
    const ctx = extractUniversalContext('buatkan rab jembatan beton bentang 12 m lebar 7 m');
    const q = selectNextQuestion(ctx);
    expect(q?.key).toBe('site-condition');
    expect(q?.critical).toBe(false);
    expect(ctx.missingCritical).not.toContain('kondisi lahan/tapak eksisting');
    expect(ctx.unresolved).toContain('kondisi lahan/tapak eksisting');
  });

  it('jawaban ditangkap SITE_PATTERNS (reuse, tanpa duplikasi pola) lalu tidak ditanya ulang', () => {
    const ctx = extractUniversalContext('buatkan rab jembatan beton bentang 12 m lebar 7 m');
    expect(selectNextQuestion(ctx)?.key).toBe('site-condition');
    const answered = extractUniversalContext('lahan miring', ctx);
    expect(answered.siteConditions).toContain('lahan berkontur/miring');
    expect(selectNextQuestion(answered)).toBeNull();
    const revitalisasi = extractUniversalContext(
      'buatkan rab jembatan beton bentang 12 m lebar 7 m revitalisasi',
    );
    expect(revitalisasi.siteConditions).toContain('perlu pembongkaran sebagian');
    expect(selectNextQuestion(revitalisasi)).toBeNull();
  });

  it('lewat jalur gerbang (clarify): ditanya 1×, jawaban "itu aja" tidak mengulang', () => {
    // Kasus yang semua kritisnya terpenuhi dari teks (listrik: daya +
    // lantai) sehingga pertanyaan pertama yang tersisa adalah site.
    // Jembatan lengkap tidak bisa dipakai di sini: gerbang subtype
    // melepasnya ke jalur cepat bila bentang sudah ada.
    const t1 = universalIntakeGate('buatkan rab instalasi listrik 100 kva 3 lantai', true, null);
    expect(t1?.message).toContain('kondisi lahan/tapaknya');
    // Kunci tercatat tepat sekali sesudah diajukan …
    const keysAfterT1 = [...(getUniversalContextState()?.askedKeys ?? [])];
    expect(keysAfterT1.filter((k) => k === 'site-condition').length).toBe(1);
    // … dan "itu aja" pada tahap PROJECT_REVIEW berarti setuju &
    // generate (afirmasi owner) — bukan mengulang pertanyaan site:
    // konteks intake dikonsumsi draft, tidak ada yang tersisa untuk
    // ditanya ulang.
    const t2 = tryContinueUniversalContext('itu aja', null);
    expect(t2?.message ?? '').not.toContain('kondisi lahan/tapaknya');
    expect(t2?.message ?? '').toContain('draft RAB');
    expect(getUniversalContextState()).toBeNull();
  });

  it('jalan tetap memakai pertanyaan kondisinya sendiri — tidak tanya ganda', () => {
    expect(selectNextQuestion(extractUniversalContext('buatkan rab jalan panjang 2 km lebar 6 m'))?.key)
      .toBe('road-condition');
  });
});

describe('Step 3 — D5 lewat alur baru (budget dari prompt sintesis modal)', () => {
  it('jalur cepat: prompt sintesis OVER → tanya-balik 3 opsi, tanpa Push, draft belum final', () => {
    const prompt = buildNewProjectMagicPrompt(GUDANG_FORM);
    const live = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor(prompt));
    expect(live.awaitBudgetDecision).toBe(true);
    expect(hasPush(live)).toBe(false);
    expect(live.message).toContain('MELEBIHI anggaran');
    expect(live.message).toContain('Rp100.000.000');
    expect(live.message).toContain('Kurangi lingkup');
    expect(live.message).toContain('Tambah budget');
    expect(live.message).toContain('Ganti spek/material');
  });

  it('jalur intake: chip → luas → sistem+clear height → kuesioner → brief → generate → tanya-balik', () => {
    // ALUR DIPERBARUI 2026-11-26 (owner requirement — mockup Step 3
    // di-ACC: "tanyakan ... clear height untuk gudang", Gap C):
    // giliran sesudah luas kini menanyakan sistem struktur + clear
    // height (warehouse-system, gabungan — BUKAN pertanyaan terpisah,
    // pin §8 utuh); kuesioner bergeser satu giliran kemudian. D5
    // (tanya-balik budget OVER) tidak berubah.
    const t1 = exec('Buatkan RAB gudang anggaran maksimal Rp100.000.000');
    expect(t1.message).toContain('luas bangunan total');
    const t2 = tryContinueUniversalContext('luas bangunan 500 m2', null);
    expect(t2?.message).toContain('clear height');
    expect(t2?.message ?? '').not.toContain('kuesioner');
    const t3 = tryContinueUniversalContext('portal frame, clear height 8 m', null);
    expect(t3?.message).toContain('kuesioner');
    expect(getUniversalContextState()?.answers['warehouse-system']).toBe('portal frame');
    expect(getUniversalContextState()?.heightM).toBe(8);
    const t4 = tryContinueUniversalContext('itu aja', null);
    expect(t4?.message).toContain('Brief proyek');
    const gen = executeIntent('RAB_INTAKE_GENERATE', undefined, ctxFor('')) as Res;
    expect(gen.awaitBudgetDecision).toBe(true);
    expect(hasPush(gen)).toBe(false);
    expect(gen.message).toContain('MELEBIHI anggaran');
    expect(gen.message).toContain('Kurangi lingkup');
  });
});
