/**
 * chatSpecChainSchema.test.ts — Skema Spesifikasi Terstruktur v2 +
 * Migrasi (Rantai Spesifikasi → RAB, Fase 2 Bagian A, 2026-11-12).
 *
 * S1 derivasi contoh kandang lengkap · S2 revisi jawaban mengubah
 * hanya spek itu · S3 round-trip v2 identik · S4 migrasi snapshot v1
 * (rehydrate langsung + lewat loadIntakeContext) · S5 v2 dengan
 * structuredSpecs rusak → specs dibuang, konteks hidup · S6 version
 * 99 → null · S7 SPEC_KEY_META mencakup semua kunci definisi
 * kuesioner.
 *
 * Pola runner gelombang sebelumnya (vitest + shim sementara saat
 * dijalankan via tsx). TIDAK mengubah perilaku draft; hanya skema +
 * derivasi + migrasi + tesnya.
 */
import { describe, it, expect } from 'vitest';
import {
  extractUniversalContext,
  serializeUniversalIntakeContext,
  rehydrateUniversalIntakeContext,
  INTAKE_CONTEXT_SERIAL_VERSION,
  type SerializedUniversalIntakeContext,
  type UniversalIntakeContext,
} from '../ai-tools/ezrab-ai/universalIntake';
import {
  applyQuestionnaireAnswers,
  deriveStructuredSpecs,
  questionnaireDefKeys,
} from '../ai-tools/ezrab-ai/questionnaire';
import { SPEC_KEY_META, validateStructuredSpecs } from '../ai-tools/ezrab-ai/structuredSpec';
import type { StructuredSpec } from '../ai-tools/ezrab-ai/structuredSpec';
import {
  saveIntakeContext,
  loadIntakeContext,
  AI_INTAKE_STORAGE_KEY,
} from '../ai-tools/ezrab-ai/draftPersistence';
import { saveVersioned } from '../engine/storage/hardenedStorage';

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

const specByKey = (specs: StructuredSpec[], key: string): StructuredSpec | undefined =>
  specs.find((s) => s.key === key);

/** Konteks kandang contoh direktif: 30 ekor, atap Galvalum, manure dilewati, budget 250 jt. */
function kandangCtx(): UniversalIntakeContext {
  const ctx = extractUniversalContext('buatkan rab kandang sapi 17 x 9 meter');
  applyQuestionnaireAnswers(ctx, {
    'kandang-capacity': { selectedIds: ['kap-30'], customText: null, status: 'answered' },
    'kandang-roof-material': { selectedIds: ['atap-galvalum'], customText: null, status: 'answered' },
    'kandang-manure': { selectedIds: [], customText: null, status: 'skipped' },
  });
  ctx.answers['kandang-type'] = 'terbuka';
  ctx.budget = { amount: 250_000_000, kind: 'MAXIMUM', original: 'Rp250 juta', coverage: null };
  return ctx;
}

describe('SpecChain v2 — skema + derivasi + migrasi', () => {
  it('S1: derivasi contoh kandang lengkap', () => {
    const ctx = kandangCtx();
    expect(ctx.primary?.id).toBe('kandang');
    const before = JSON.stringify({ a: ctx.answers, q: ctx.questionnaire });
    const specs = deriveStructuredSpecs(ctx);
    // PURE: derivasi tidak memutasi konteks.
    expect(JSON.stringify({ a: ctx.answers, q: ctx.questionnaire })).toBe(before);

    const cap = specByKey(specs, 'kandang-capacity');
    expect(cap?.kind).toBe('count');
    expect(cap?.value).toBe(30);
    expect(cap?.unit).toBe('ekor');
    expect(cap?.status).toBe('CONFIRMED');
    expect(cap?.source).toBe('kuesioner');

    const roof = specByKey(specs, 'kandang-roof-material');
    expect(roof?.kind).toBe('material');
    expect(roof?.value).toBe('Galvalum');
    expect(roof?.status).toBe('CONFIRMED');
    expect(roof?.source).toBe('kuesioner');

    const manure = specByKey(specs, 'kandang-manure');
    expect(manure?.value).toBeNull();
    expect(manure?.status).toBe('UNRESOLVED');
    expect(manure?.source).toBe('kuesioner');

    const type = specByKey(specs, 'kandang-type');
    expect(type?.kind).toBe('scope');
    expect(type?.value).toBe('terbuka');
    expect(type?.status).toBe('CONFIRMED');
    expect(type?.source).toBe('percakapan');

    const budget = specByKey(specs, 'budget');
    expect(budget?.kind).toBe('condition');
    expect(budget?.value).toBe(250_000_000);
    expect(budget?.unit).toBe('IDR');
    expect(budget?.status).toBe('CONFIRMED');
    expect(budget?.source).toBe('percakapan');

    // Urutan deterministik (alfabetis per kunci) + hasil lolos validasi.
    expect(specs.map((s) => s.key)).toEqual([...specs.map((s) => s.key)].sort());
    expect(validateStructuredSpecs(specs)).toBe(specs); // array yang sama, bukan kopian
  });

  it('S2: revisi jawaban mengubah hanya spek itu', () => {
    const ctx = kandangCtx();
    const before = deriveStructuredSpecs(ctx);
    applyQuestionnaireAnswers(ctx, {
      'kandang-roof-material': { selectedIds: ['atap-spandek'], customText: null, status: 'answered' },
    });
    const after = deriveStructuredSpecs(ctx);
    expect(specByKey(after, 'kandang-roof-material')?.value).toBe('Spandek');
    // GELOMBANG PERBAIKI SEMUA — PERUBAHAN PIN (satu-satunya pin yang
    // berubah di gelombang ini, atas perintah owner "perbaiki semua"):
    // updatedAt adalah stempel derivasi (milidetik), BUKAN isi spek —
    // dua derivasi berurutan hampir selalu mendarat di milidetik
    // berbeda, sehingga perbandingan objek penuh flaky by construction
    // (LAPORAN-AKHIR §2.5/§6). Bandingkan spek tanpa updatedAt; nilai,
    // status, sumber, kind, unit, dan label tetap dibandingkan penuh.
    // Stempelnya sendiri tetap ditegaskan ada dan berupa string ISO
    // yang valid, agar cakupan "spek well-formed" tidak hilang.
    const stripUpdatedAt = (s: StructuredSpec | undefined) => {
      if (!s) return s;
      const { updatedAt: _ignored, ...rest } = s;
      return rest;
    };
    // Spek lain utuh (nilai + status + sumber).
    for (const key of ['kandang-capacity', 'kandang-manure', 'kandang-type', 'budget']) {
      expect(stripUpdatedAt(specByKey(after, key))).toEqual(stripUpdatedAt(specByKey(before, key)));
      expect(typeof specByKey(after, key)?.updatedAt).toBe('string');
      expect(Number.isFinite(Date.parse(specByKey(after, key)?.updatedAt ?? ''))).toBe(true);
    }
    expect(validateStructuredSpecs(after)).toBe(after);
  });

  it('S3: round-trip v2 serialize→rehydrate identik', () => {
    const ctx = kandangCtx();
    const serialized = serializeUniversalIntakeContext(ctx);
    expect(serialized.version).toBe(INTAKE_CONTEXT_SERIAL_VERSION);
    expect(serialized.version).toBe(2);
    expect(validateStructuredSpecs(serialized.structuredSpecs)).toBe(serialized.structuredSpecs);
    const restored = rehydrateUniversalIntakeContext(serialized);
    expect(restored).not.toBeNull();
    expect(restored!.structuredSpecs).toEqual(serialized.structuredSpecs);
    expect(restored!.structuredSpecs).toEqual(deriveStructuredSpecs(ctx));
    expect(restored!.answers['kandang-capacity']).toBe('30 ekor');
    expect(restored!.answers['kandang-roof-material']).toBe('Galvalum');
    expect(restored!.budget?.amount).toBe(250_000_000);
    expect(restored!.questionnaire.answers['kandang-manure']?.status).toBe('skipped');
    // Medan konteks ikut terisi (bukan hanya di amplop).
    expect(restored!.structuredSpecs.length).toBeGreaterThan(0);
  });

  it('S4: snapshot v1 lama termigrasi (budget terkini, bukan histori)', () => {
    const ctx = extractUniversalContext('buatkan rab kandang sapi 17 x 9 meter');
    ctx.answers['kandang-type'] = 'terbuka';
    ctx.answers['kandang-capacity'] = '30 ekor';
    ctx.answers['kandang-roof-material'] = 'Galvalum';
    ctx.questionnaire.answers['kandang-capacity'] = {
      selectedIds: ['kap-30'],
      customText: null,
      status: 'answered',
    };
    ctx.questionnaire.answers['kandang-roof-material'] = {
      selectedIds: ['atap-galvalum'],
      customText: null,
      status: 'answered',
    };
    ctx.budget = { amount: 250_000_000, kind: 'MAXIMUM', original: 'Rp250 juta', coverage: null };
    ctx.budgetHistory = [{ amount: 300_000_000, kind: 'MAXIMUM', original: 'Rp300 juta', coverage: null }];
    // Snapshot v1 ASLI: tanpa medan structuredSpecs di mana pun.
    const s2 = serializeUniversalIntakeContext(ctx);
    const v1raw: SerializedUniversalIntakeContext = {
      version: 1,
      primaryId: s2.primaryId,
      secondaryIds: s2.secondaryIds,
      data: s2.data,
    };
    const restored = rehydrateUniversalIntakeContext(v1raw);
    expect(restored).not.toBeNull();
    expect(specByKey(restored!.structuredSpecs, 'budget')?.value).toBe(250_000_000);
    expect(restored!.structuredSpecs.some((s) => s.value === 300_000_000)).toBe(false);
    const cap = specByKey(restored!.structuredSpecs, 'kandang-capacity');
    expect(cap?.value).toBe(30);
    expect(cap?.unit).toBe('ekor');
    expect(specByKey(restored!.structuredSpecs, 'kandang-roof-material')?.value).toBe('Galvalum');

    // S4b: jalur simpan/muat nyata juga menerima v1 (gerbang loadIntakeContext).
    saveVersioned(AI_INTAKE_STORAGE_KEY, {
      'PRJ-V1': { schemaVersion: 1, updatedAt: new Date().toISOString(), context: v1raw },
    });
    const loaded = loadIntakeContext('PRJ-V1');
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(specByKey(loaded.ctx.structuredSpecs, 'budget')?.value).toBe(250_000_000);
      expect(specByKey(loaded.ctx.structuredSpecs, 'kandang-capacity')?.value).toBe(30);
    }
    // Sanity: saveIntakeContext menulis v2.
    const saved = saveIntakeContext('PRJ-V2', kandangCtx());
    expect(saved.ok).toBe(true);
  });

  it('S5: v2 dengan structuredSpecs rusak → specs dibuang, konteks hidup', () => {
    const ctx = kandangCtx();
    const base = serializeUniversalIntakeContext(ctx);
    const corruptKey = {
      ...base,
      structuredSpecs: [
        {
          key: 'tidak-ada',
          kind: 'material',
          label: 'x',
          value: 'y',
          status: 'CONFIRMED',
          source: 'kuesioner',
          updatedAt: new Date().toISOString(),
        },
      ] as unknown as StructuredSpec[],
    };
    const r1 = rehydrateUniversalIntakeContext(corruptKey);
    expect(r1).not.toBeNull();
    expect(r1!.structuredSpecs).toEqual([]);
    expect(r1!.answers['kandang-capacity']).toBe('30 ekor'); // jawaban kanonis utuh

    const wrongKind = {
      ...base,
      structuredSpecs: [
        {
          key: 'kandang-capacity',
          kind: 'material', // salah: META menuntut 'count'
          label: 'Kapasitas kandang (jumlah ekor)',
          value: 30,
          unit: 'ekor',
          status: 'CONFIRMED',
          source: 'kuesioner',
          updatedAt: new Date().toISOString(),
        },
      ] as unknown as StructuredSpec[],
    };
    const r2 = rehydrateUniversalIntakeContext(wrongKind);
    expect(r2).not.toBeNull();
    expect(r2!.structuredSpecs).toEqual([]);
    expect(r2!.answers['kandang-roof-material']).toBe('Galvalum');
  });

  it('S6: version 99 → null', () => {
    const raw = {
      version: 99,
      primaryId: 'kandang',
      secondaryIds: [],
      data: {},
    } as unknown as SerializedUniversalIntakeContext;
    expect(rehydrateUniversalIntakeContext(raw)).toBeNull();
    expect(rehydrateUniversalIntakeContext(null)).toBeNull();
    expect(rehydrateUniversalIntakeContext(undefined)).toBeNull();
  });

  it('S7: SPEC_KEY_META mencakup semua kunci definisi kuesioner', () => {
    const defKeys = questionnaireDefKeys();
    expect(defKeys.length).toBe(29);
    const missing = defKeys.filter((k) => !(k in SPEC_KEY_META));
    expect(missing).toEqual([]);
    // 29 kunci def + 4 kunci percakapan + budget = 34 — DIPERBARUI
    // TERBUKA Fase 4 (pemahaman DED): + 5 kunci dimensi DED
    // (ded-length/ded-width/ded-height/ded-area/ded-volume, sumber
    // 'DED') = 39. Kunci DED tidak berasal dari definisi kuesioner
    // (bukan jawaban pengguna) — itulah mengapa hitungan META kini
    // melebihi hitungan def; validator tetap menolak kunci tak dikenal.
    expect(Object.keys(SPEC_KEY_META).length).toBe(39);
    for (const k of ['ded-length', 'ded-width', 'ded-height', 'ded-area', 'ded-volume']) {
      expect(k in SPEC_KEY_META).toBe(true);
      expect(SPEC_KEY_META[k].kind).toBe('dimension');
    }
    for (const [key, meta] of Object.entries(SPEC_KEY_META)) {
      expect(['material', 'dimension', 'count', 'scope', 'quality', 'condition']).toContain(meta.kind);
      expect(typeof meta.label).toBe('string');
      expect(meta.label.length).toBeGreaterThan(0);
      expect(typeof meta.family).toBe('string');
    }
    // Kunci percakapan + budget memang ada di META.
    for (const k of ['kandang-type', 'warehouse-system', 'bridge-type', 'new-construction', 'budget']) {
      expect(k in SPEC_KEY_META).toBe(true);
    }
  });
});
