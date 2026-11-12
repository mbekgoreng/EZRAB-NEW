/**
 * chatPhase5DedQto.test.ts — GATE 4 (5D): Integrasi DED & QTO
 * (Phase 5 Workflow Integration, direktif owner 2026-11-12 11:45 WIB
 * §6 + §10 Gate 4).
 *
 * Gaya plain-tsx: `npx --yes tsx src/test/chatPhase5DedQto.test.ts`
 *
 * Setiap tes memakai JALUR NYATA (ekstraktor DED kanonis + derive
 * spek + rekonsiliasi QTO + resolver harga kanonis + builder draft
 * kanonis + persistensi), bukan mock jalur. Simulasi "reload" =
 * bersihkan singleton in-memory TANPA menyentuh storage (pola Gate 1).
 *
 * Fixture DED = bentuk fixture C4-08 (Fase 4) yang DIPERLUAS
 * (bukan dokumen karangan baru): item Pondasi/Atap C4-08 + Galian
 * (mismatch C4-11), Beton kolom (unit mismatch C4-11), Atap metal
 * menerus (retrieval C4-10), zorblax kwintara (unresolved C4-09),
 * Urugan pasir (ASSUMPTION). Dimensi pengguna kanonis:
 * 10 x 8 m, kedalaman 0,5 m, 2 lantai, luas bangunan 160 m² —
 * sehingga ekspektasi QTO: galian 10×8×0,5 = 40 m³; atap 10×8 = 80 m².
 *
 * Klasifikasi per ID: VERIFIED PASS / VERIFIED FAIL / PARTIAL /
 * BLOCKED / NOT RUN (lihat laporan gate4-ded-qto.md).
 * Provider nyata: NOT RUN (0 panggilan).
 */
import { readFileSync } from 'node:fs';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  PASS ${name}`);
    })
    .catch((e: unknown) => {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      failures.push(name);
      console.log(`  FAIL ${name}: ${msg}`);
    });
}
const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(msg);
};
const eq = (a: unknown, b: unknown, msg: string) => {
  const ja = JSON.stringify(a);
  const jb = JSON.stringify(b);
  if (ja !== jb) throw new Error(`${msg}\n  expected: ${jb}\n  actual:   ${ja}`);
};

/* ---------- localStorage shim (node) — pola Gate 1 ---------- */
function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
    raw: map,
  };
}
type StorageShim = ReturnType<typeof makeStorage>;
const storage: StorageShim = makeStorage();
(globalThis as Record<string, unknown>).localStorage = storage;

/* ---------- Fixture DED (perluasan C4-08) ---------- */
const NOW = '2026-11-12T14:00:00.000Z';
const PROJECT_5D = 'PRJ-5D-A';
/** Dimensi pengguna kanonis: 10 x 8 m, kedalaman 0,5 m, 2 lantai. */
const USER_DIMS = { lengthM: 10, widthM: 8, depthM: 0.5, heightM: null, buildingAreaM2: 160, landAreaM2: null, thicknessM: null, floors: 2 };

const dedItem = (o: Record<string, unknown>) => o;

const DED_OUTPUT = {
  success: true,
  jobId: 'job-5d-1',
  projectType: 'BANGUNAN',
  mode: 'DETAIL',
  policy: 'FULL_AI',
  projectName: 'Gedung Contoh DED',
  fileName: 'DED-Gedung-Contoh.pdf',
  pageCount: 4,
  grandTotal: 0,
  categorySummaries: [],
  coverage: { totalItems: 7, itemsWithQuantity: 6, itemsWithPrice: 0, itemsFullyResolved: 0, itemsUnresolved: 7 },
  partial: true,
  items: [
    dedItem({
      // C4-08: pondasi 12 m³ (tebal asumsi) — ekspektasi user 40 m³ → MISMATCH.
      id: 'i1', name: 'Pondasi batu kali', category: 'Pondasi', units: 'm3', quantity: 12,
      quantitySource: 'DED_GEOMETRIC', unitPrice: null, priceSource: 'UNRESOLVED', subtotal: null,
      sourcePages: [1], provenance: ['DED p.1'], stage: 'QUANTITY',
      derivation: {
        formulaType: 'galian_volume', result: 12, resultUnit: 'm3', validationStatus: 'ok',
        inputs: [
          { name: 'panjang', value: 10, unit: 'm', source: 'DED' },
          { name: 'lebar', value: 8, unit: 'm', source: 'DED' },
          { name: 'tebal', value: 0.15, unit: 'm', source: 'ASSUMPTION' },
        ],
      },
    }),
    dedItem({
      // C4-08: kuantitas hilang → MISSING (bukan 0).
      id: 'i2', name: 'Pekerjaan atap', category: 'Atap', units: 'm2', quantity: null,
      quantitySource: 'UNRESOLVED', unitPrice: null, priceSource: 'UNRESOLVED', subtotal: null,
      sourcePages: [2], provenance: ['DED p.2'], stage: 'PARSE',
    }),
    dedItem({
      // C4-11: galian 90 m³ vs ekspektasi user 40 m³ → MISMATCH.
      id: 'i3', name: 'Galian tanah pondasi', category: 'Galian', units: 'm3', quantity: 90,
      quantitySource: 'DED_GEOMETRIC', unitPrice: null, priceSource: 'UNRESOLVED', subtotal: null,
      sourcePages: [1], provenance: ['DED p.1'], stage: 'QUANTITY',
      derivation: {
        formulaType: 'galian_volume', result: 90, resultUnit: 'm3', validationStatus: 'ok',
        inputs: [
          { name: 'panjang', value: 10, unit: 'm', source: 'DED' },
          { name: 'lebar', value: 8, unit: 'm', source: 'DED' },
          { name: 'kedalaman', value: 1.125, unit: 'm', source: 'DED' },
        ],
      },
    }),
    dedItem({
      // C4-11: unit diminta m3 (derivasi) vs unit item m2 → UNIT_MISMATCH.
      // Input 'tinggi' ASSUMPTION → spek ded-height berstatus ASSUMPTION.
      id: 'i4', name: 'Beton kolom', category: 'Struktur', units: 'm2', quantity: 7.65,
      quantitySource: 'DED_GEOMETRIC', unitPrice: null, priceSource: 'UNRESOLVED', subtotal: null,
      sourcePages: [3], provenance: ['DED p.3'], stage: 'QUANTITY',
      derivation: {
        formulaType: 'volume', result: 7.65, resultUnit: 'm3', validationStatus: 'ok',
        inputs: [
          { name: 'tinggi', value: 3.5, unit: 'm', source: 'ASSUMPTION' },
        ],
      },
    }),
    dedItem({
      // C4-10: 80 m² = 10×8 → OK; retrieval menemukan AHSP 3.1.3.8.
      id: 'i5', name: 'Atap metal menerus', category: 'Atap', units: 'm2', quantity: 80,
      quantitySource: 'DED_EXPLICIT', unitPrice: null, priceSource: 'UNRESOLVED', subtotal: null,
      sourcePages: [2], provenance: ['DED p.2'], stage: 'QUANTITY',
    }),
    dedItem({
      // C4-09: unit tak-terturunkan + query tak dikenal → CANNOT_CHECK + unresolved.
      id: 'i6', name: 'zorblax kwintara', category: 'Lainnya', units: 'ls', quantity: 5,
      quantitySource: 'DED_EXPLICIT', unitPrice: null, priceSource: 'UNRESOLVED', subtotal: null,
      sourcePages: [4], provenance: ['DED p.4'], stage: 'QUANTITY',
    }),
    dedItem({
      // 40 m³ = 10×8×0,5 (cocok) TAPI kedalaman ASSUMPTION → ASSUMPTION.
      id: 'i7', name: 'Urugan pasir', category: 'Urugan', units: 'm3', quantity: 40,
      quantitySource: 'DED_GEOMETRIC', unitPrice: null, priceSource: 'UNRESOLVED', subtotal: null,
      sourcePages: [1], provenance: ['DED p.1'], stage: 'QUANTITY',
      derivation: {
        formulaType: 'galian_volume', result: 40, resultUnit: 'm3', validationStatus: 'ok',
        inputs: [
          { name: 'panjang', value: 10, unit: 'm', source: 'DED' },
          { name: 'lebar', value: 8, unit: 'm', source: 'DED' },
          { name: 'kedalaman', value: 0.5, unit: 'm', source: 'ASSUMPTION' },
        ],
      },
    }),
  ],
} as unknown as Parameters<typeof import('../ai-tools/ezrab-ai/dedUnderstanding')['extractSpecsFromDedOutput']>[0];

async function main(): Promise<void> {
  console.log('chatPhase5DedQto.test (GATE 4 / 5D)');
  const ded = await import('../ai-tools/ezrab-ai/dedQtoIntegration');
  const { extractSpecsFromDedOutput } = await import('../ai-tools/ezrab-ai/dedUnderstanding');
  const { validateStructuredSpecs, isValidDedSpec } = await import('../ai-tools/ezrab-ai/structuredSpec');
  const { deriveStructuredSpecs } = await import('../ai-tools/ezrab-ai/questionnaire');
  const intake = await import('../ai-tools/ezrab-ai/universalIntake');
  const rab = await import('../ai-tools/ezrab-ai/universalRab');
  const dp = await import('../ai-tools/ezrab-ai/draftPersistence');
  const { retrieveDomainCandidates, verifyAhspCandidate } = await import(
    '../ai-tools/ezrab-ai/constructionDomainRetrieval'
  );
  const { officialAhspRepository } = await import(
    '../data/nationalCostDatabase/officialAhspRepository'
  );
  const reg = await import('../ai-tools/ezrab-ai/actionRegistry');
  const { routeIntent } = await import('../ai-tools/ezrab-ai/intentRouter');

  const attachFresh = () => {
    const r = ded.attachDedToProject(PROJECT_5D, DED_OUTPUT as never);
    assert(r.ok && r.attachment, `attach harus ok: ${r.message}`);
    return r.attachment!;
  };

  console.log('== 5D-01 — provenans sumber per spek dipertahankan ==');
  await check('5D-01 spek DED membawa provenans berkas + halaman + item', () => {
    const result = extractSpecsFromDedOutput(DED_OUTPUT, NOW);
    const len = result.specs.find((s) => s.key === 'ded-length');
    assert(len, 'ded-length harus terekstrak');
    assert(len!.value === 10, `ded-length harus 10, dapat ${len!.value}`);
    assert(len!.source === 'DED', 'sumber harus DED');
    assert(
      (len!.provenance ?? '').includes('DED-Gedung-Contoh.pdf') &&
        (len!.provenance ?? '').includes('hal. 1') &&
        (len!.provenance ?? '').includes('Pondasi batu kali'),
      `provenans harus menyebut berkas+halaman+item, dapat: ${len!.provenance}`,
    );
    // Spek DED valid menurut validator skema (kunci + sumber DED dikenal).
    assert(validateStructuredSpecs(result.specs) !== null, 'spek hasil DED harus lolos validasi skema');
    assert(result.specs.every((s) => isValidDedSpec(s)), 'setiap spek hasil DED harus lolos isValidDedSpec');
  });
  await check('5D-01 halaman tak tersedia → frasa halaman dihilangkan, bukan dikarang', () => {
    const out = {
      ...DED_OUTPUT,
      fileName: undefined,
      items: [
        {
          id: 'x1', name: 'Pondasi uji', units: 'm3', quantity: 5,
          derivation: {
            formulaType: 'galian_volume', result: 5, resultUnit: 'm3',
            inputs: [{ name: 'panjang', value: 5, unit: 'm', source: 'DED' }],
          },
        },
      ],
    } as never;
    const result = extractSpecsFromDedOutput(out, NOW);
    const len = result.specs.find((s) => s.key === 'ded-length');
    assert(len, 'ded-length harus terekstrak tanpa halaman');
    assert(!(len!.provenance ?? '').includes('hal.'), `provenans tidak boleh mengarang halaman: ${len!.provenance}`);
    assert((len!.provenance ?? '').includes('Pondasi uji'), 'provenans tetap menyebut item');
  });

  console.log('== 5D-02 — spek DED mendarat di structuredSpec + konteks intake ==');
  await check('5D-02 derive: ded-length/ded-width/ded-height masuk structuredSpec (sumber DED)', () => {
    const ctx = intake.emptyUniversalIntake();
    ctx.dedSpecs = ded.sanitizeDedSpecs(ded.dedSpecsFromAttachment(attachFresh()).specs);
    const specs = deriveStructuredSpecs(ctx);
    const len = specs.find((s) => s.key === 'ded-length');
    const wid = specs.find((s) => s.key === 'ded-width');
    const hei = specs.find((s) => s.key === 'ded-height');
    assert(len && len.value === 10 && len.source === 'DED' && len.status === 'CONFIRMED', 'ded-length=10 DED CONFIRMED');
    assert(wid && wid.value === 8 && wid.source === 'DED', 'ded-width=8 DED');
    assert(hei && hei.value === 3.5 && hei.source === 'DED' && hei.status === 'ASSUMPTION', 'ded-height=3.5 DED ASSUMPTION');
    // Satu spek per kunci — tidak ada kunci ganda.
    const keys = specs.map((s) => s.key);
    eq(new Set(keys).size, keys.length, 'derive tidak boleh menghasilkan kunci ganda');
  });
  await check('5D-02 serialize→rehydrate: dedSpecs selamat round-trip', () => {
    const ctx = intake.emptyUniversalIntake();
    ctx.dedSpecs = ded.sanitizeDedSpecs(ded.dedSpecsFromAttachment(attachFresh()).specs);
    const restored = intake.rehydrateUniversalIntakeContext(
      intake.serializeUniversalIntakeContext(ctx),
    );
    assert(restored, 'rehydrate harus berhasil');
    const len = restored!.dedSpecs.find((s) => s.key === 'ded-length');
    assert(len && len.value === 10 && len.source === 'DED', 'ded-length selamat round-trip');
    assert((len!.provenance ?? '').includes('DED-Gedung-Contoh.pdf'), 'provenans selamat round-trip');
    // Derive dari konteks hasil restore tetap mengeluarkan spek DED.
    assert(
      deriveStructuredSpecs(restored!).some((s) => s.key === 'ded-length' && s.value === 10),
      'derive pasca-restore tetap mengeluarkan ded-length',
    );
  });
  await check('5D-02 draft: spek DED (merge) masuk draft.structuredSpecs', () => {
    const merged = ded.mergeDedSpecsIntoSpecs([], ded.dedSpecsFromAttachment(attachFresh()).specs);
    const res = rab.buildUniversalDraft('Buatkan RAB gedung 10 x 8 m 2 lantai', undefined, {
      structuredSpecs: merged.merged,
      projectId: PROJECT_5D,
    });
    assert(res.kind === 'draft', `draft harus tersusun, dapat ${res.kind}`);
    if (res.kind !== 'draft') return;
    const len = res.draft.structuredSpecs?.find((s) => s.key === 'ded-length');
    assert(len && len.value === 10 && len.source === 'DED', 'draft.structuredSpecs memuat ded-length DED');
  });
  await check('5D-02E2E executeIntent: DED terlampir → draft membawa dedQto + tombol koreksi', () => {
    storage.clear();
    attachFresh();
    reg.clearUniversalContext();
    rab.setLastUniversalDraft(null);
    const routed = routeIntent('Buatkan RAB gedung 10 x 8 m 2 lantai, pondasi kedalaman 0,5 m');
    const ctx = {
      navigate: () => undefined,
      currentMenu: 'ezrab-ai',
      activeProject: { id: PROJECT_5D, name: 'Proyek 5D' },
      projects: [],
      projectTotal: 0,
      projectItems: null,
      rawText: 'Buatkan RAB gedung 10 x 8 m 2 lantai, pondasi kedalaman 0,5 m',
    } as unknown as Parameters<typeof reg.executeIntent>[2];
    const res = reg.executeIntent(routed.intent, routed.param, ctx);
    assert(res && res.ok, `executeIntent harus ok, dapat ${JSON.stringify(res)?.slice(0, 200)}`);
    const draft = rab.getLastUniversalDraft(PROJECT_5D);
    assert(draft, 'draft harus tersusun lewat executeIntent');
    assert(draft!.dedQto, 'draft harus membawa dedQto');
    assert((draft!.dedQto?.checks.length ?? 0) === 7, `dedQto harus punya 7 checks, dapat ${draft!.dedQto?.checks.length}`);
    assert(draft!.dedQto?.summary.mismatch === 2, `mismatch harus 2, dapat ${draft!.dedQto?.summary.mismatch}`);
    const kinds = (res.actions ?? []).map((a) => (a.action as { kind: string }).kind);
    assert(kinds.includes('qto-correction-confirm'), `aksi harus memuat qto-correction-confirm, dapat ${kinds.join(',')}`);
    assert(kinds.includes('qto-correction-reject'), 'aksi harus memuat qto-correction-reject');
  });

  console.log('== 5D-03 — DED / USER / ASSUMPTION terbedakan end-to-end ==');
  await check('5D-03 jawaban user menang per kunci; ASSUMPTION DED tetap ASSUMPTION', () => {
    const ctx = intake.emptyUniversalIntake();
    ctx.dedSpecs = ded.sanitizeDedSpecs(ded.dedSpecsFromAttachment(attachFresh()).specs);
    ctx.answers = { 'ded-length': '12' };
    const specs = deriveStructuredSpecs(ctx);
    const len = specs.filter((s) => s.key === 'ded-length');
    eq(len.length, 1, 'ded-length harus muncul tepat sekali (tanpa duplikat)');
    assert(len[0].value === 12, `nilai user (12) harus menang, dapat ${len[0].value}`);
    assert(len[0].source === 'percakapan', 'sumber pemenang harus percakapan (user)');
    assert(len[0].supersedes === 'ded-spec:ded-length', 'jejak supersedes harus tercatat');
    // Nilai DED asli tetap tersimpan di ctx.dedSpecs (tidak ditimpa).
    assert(ctx.dedSpecs.find((s) => s.key === 'ded-length')?.value === 10, 'nilai DED asli (10) tetap di dedSpecs');
    // ASSUMPTION tetap ASSUMPTION di derive.
    const hei = specs.find((s) => s.key === 'ded-height');
    assert(hei && hei.status === 'ASSUMPTION' && hei.source === 'DED', 'ded-height tetap ASSUMPTION/DED');
  });

  console.log('== 5D-04 — hilang tetap hilang / null / unresolved ==');
  await check('5D-04 tanpa dimensi user: tidak ada ekspektasi yang dikarang', () => {
    const att = attachFresh();
    const { checks } = ded.reconcileDedQto(att, ded.dimsFromIntakeContext(null));
    // Tanpa dimensi: expected null di semua check yang bisa dibandingkan;
    // MISSING (atap) + UNIT_MISMATCH (beton) tetap terdeteksi dari data DED sendiri.
    assert(checks.every((c) => c.expectedFromUserDimensions == null), 'tanpa dimensi, tidak ada ekspektasi');
    const verdicts = new Set(checks.map((c) => c.verdict));
    assert(!verdicts.has('OK') && !verdicts.has('MISMATCH'), 'tanpa dimensi tidak boleh ada OK/MISMATCH');
    assert(checks.find((c) => c.description === 'Pekerjaan atap')?.verdict === 'MISSING', 'atap tetap MISSING');
    assert(checks.find((c) => c.description === 'Beton kolom')?.verdict === 'UNIT_MISMATCH', 'beton tetap UNIT_MISMATCH');
    assert(checks.find((c) => c.description === 'Galian tanah pondasi')?.verdict === 'CANNOT_CHECK', 'galian CANNOT_CHECK tanpa dimensi');
  });
  await check('5D-04 kuantitas null tetap null; harga hilang tetap unresolved', () => {
    const att = attachFresh();
    const { checks } = ded.reconcileDedQto(att, USER_DIMS);
    const atap = checks.find((c) => c.description === 'Pekerjaan atap');
    assert(atap && atap.quantity === null && atap.verdict === 'MISSING', 'kuantitas atap tetap null + MISSING');
    // Retrieval kanonis langsung (pola C4-09): zorblax unresolved, tanpa kandidat karangan.
    const res = retrieveDomainCandidates(['zorblax kwintara']);
    assert(res.unresolvedQueries.includes('zorblax kwintara'), 'zorblax tetap unresolved');
    assert(res.ahspCandidates.length === 0, 'tidak boleh ada kandidat karangan untuk zorblax');
    // Review harga DED dibatasi cap 5 item — 7 item tanpa harga → 2 belum di-review (dinyatakan, bukan Rp0).
    const prices = ded.resolveDedItemPrices(att);
    assert(prices.unreviewedCount === 2, `unreviewedCount harus 2, dapat ${prices.unreviewedCount}`);
    assert(prices.reviews.every((r) => r.unresolved || r.candidates.length > 0), 'setiap review: unresolved atau berkandidat');
  });

  console.log('== 5D-05 — unit mismatch memblokir (tanpa konversi diam-diam) ==');
  await check('5D-05 Beton kolom UNIT_MISMATCH: tanpa usulan, apply ditolak, harga null', () => {
    const att = attachFresh();
    const { checks } = ded.reconcileDedQto(att, USER_DIMS);
    const beton = checks.find((c) => c.description === 'Beton kolom');
    assert(beton && beton.verdict === 'UNIT_MISMATCH', `beton harus UNIT_MISMATCH, dapat ${beton?.verdict}`);
    const proposals = ded.proposeQtoCorrections(att, checks);
    assert(!proposals.some((p) => p.description === 'Beton kolom'), 'UNIT_MISMATCH tidak boleh menghasilkan usulan koreksi');
    // Pertahanan berlapis: apply dengan usulan karangan untuk check
    // bukan-MISMATCH DITOLAK (bukan hanya UI yang menyembunyikannya).
    const fake = {
      id: 'qto:i4', itemId: 'i4', description: 'Beton kolom',
      dedQuantity: 7.65, dedUnit: 'm2', expectedQuantity: 7.65, expectedUnit: 'm2',
      basis: 'karangan', checkDetail: 'karangan',
    };
    const applied = ded.applyQtoCorrection(att, fake, checks);
    assert(!applied.ok, `apply untuk UNIT_MISMATCH harus ditolak: ${applied.message}`);
    // Resolver harga kanonis: unit mismatch → harga null (pola C4-11).
    const item = officialAhspRepository.getOfficialAhsp('3.1.3.8');
    assert(item, 'kode 3.1.3.8 harus ada');
    const cand = verifyAhspCandidate(item as never, 'm3');
    assert(cand.priceStatus === 'UNIT_MISMATCH' && cand.unitPrice === null, 'harga diblokir pada unit mismatch');
  });

  console.log('== 5D-06 — keenam verdict QTO dengan angka kedua sisi ==');
  await check('5D-06 OK/MISMATCH/MISSING/ASSUMPTION/UNIT_MISMATCH/CANNOT_CHECK benar + angka', () => {
    const att = attachFresh();
    const { checks } = ded.reconcileDedQto(att, USER_DIMS);
    const byName = (n: string) => checks.find((c) => c.description === n)!;
    const pondasi = byName('Pondasi batu kali');
    assert(pondasi.verdict === 'MISMATCH' && pondasi.quantity === 12 && pondasi.expectedFromUserDimensions === 40, 'Pondasi MISMATCH 12 vs 40');
    const galian = byName('Galian tanah pondasi');
    assert(galian.verdict === 'MISMATCH' && galian.quantity === 90 && galian.expectedFromUserDimensions === 40, 'Galian MISMATCH 90 vs 40');
    const atap = byName('Pekerjaan atap');
    assert(atap.verdict === 'MISSING' && atap.quantity === null, 'Atap MISSING null');
    const metal = byName('Atap metal menerus');
    assert(metal.verdict === 'OK' && metal.quantity === 80 && metal.expectedFromUserDimensions === 80, 'Atap metal OK 80 vs 80');
    const urugan = byName('Urugan pasir');
    assert(urugan.verdict === 'ASSUMPTION' && urugan.quantity === 40 && urugan.expectedFromUserDimensions === 40, 'Urugan ASSUMPTION 40 vs 40');
    const beton = byName('Beton kolom');
    assert(beton.verdict === 'UNIT_MISMATCH' && beton.quantity === 7.65, 'Beton UNIT_MISMATCH');
    const zor = byName('zorblax kwintara');
    assert(zor.verdict === 'CANNOT_CHECK' && zor.quantity === 5, 'zorblax CANNOT_CHECK');
    const summary = ded.summarizeDedQtoChecks(checks);
    eq(summary, { total: 7, ok: 1, mismatch: 2, missing: 1, assumption: 1, unitMismatch: 1, cannotCheck: 1 }, 'ringkasan verdict');
    // Detail mismatch menyebut ANGKA KEDUA SISI (bukan sekadar "tidak cocok").
    assert(/90 m3/.test(galian.detail) && /40\.00 m3/.test(galian.detail), `detail Galian menyebut 90 & 40: ${galian.detail}`);
  });

  console.log('== 5D-07 — konfirmasi menerapkan, penolakan mempertahankan nilai asal ==');
  await check('5D-07 konfirmasi Galian: 90→40 USER_INPUT, re-check OK, idempotent', () => {
    const att = attachFresh();
    const { checks } = ded.reconcileDedQto(att, USER_DIMS);
    const proposal = ded.pendingQtoCorrections(att, checks).find((p) => p.itemId === 'i3');
    assert(proposal && proposal.expectedQuantity === 40, 'usulan Galian harus 40');
    const applied = ded.applyQtoCorrection(att, proposal!, checks);
    assert(applied.ok, `apply harus ok: ${applied.message}`);
    const item = applied.attachment.items.find((i) => i.id === 'i3');
    assert(item && item.quantity === 40, 'kuantitas Galian menjadi 40');
    assert(item!.quantitySource === 'USER_INPUT', 'sumber menjadi USER_INPUT (keputusan user)');
    assert((item!.quantityNote ?? '').includes('90'), 'nilai DED asli (90) tercatat di quantityNote');
    const decision = applied.attachment.decisions.find((d) => d.itemId === 'i3');
    assert(decision && decision.action === 'confirmed' && decision.originalQuantity === 90 && decision.correctedQuantity === 40, 'keputusan tercatat append-only');
    // Re-check sesudah koreksi: OK.
    const fresh = ded.reconcileDedQto(applied.attachment, USER_DIMS);
    assert(fresh.checks.find((c) => c.description === 'Galian tanah pondasi')?.verdict === 'OK', 're-check Galian harus OK');
    // Idempotent: apply lagi → alreadyApplied, bukan keputusan ganda.
    const again = ded.applyQtoCorrection(applied.attachment, proposal!, fresh.checks);
    assert(again.ok && again.alreadyApplied, 'apply kedua harus alreadyApplied');
    assert(again.attachment.decisions.filter((d) => d.itemId === 'i3').length === 1, 'tidak ada keputusan ganda');
  });
  await check('5D-07 penolakan Pondasi: nilai DED 12 dipertahankan + keputusan tercatat', () => {
    const att = attachFresh();
    const { checks } = ded.reconcileDedQto(att, USER_DIMS);
    const proposal = ded.pendingQtoCorrections(att, checks).find((p) => p.itemId === 'i1');
    assert(proposal, 'usulan Pondasi harus ada');
    const rejected = ded.rejectQtoCorrection(att, proposal!);
    assert(rejected.ok, `reject harus ok: ${rejected.message}`);
    const item = rejected.attachment.items.find((i) => i.id === 'i1');
    assert(item && item.quantity === 12 && item.quantitySource === 'DED_GEOMETRIC', 'Pondasi tetap 12 m³ DED_GEOMETRIC');
    const decision = rejected.attachment.decisions.find((d) => d.itemId === 'i1');
    assert(decision && decision.action === 'rejected' && decision.originalQuantity === 12, 'penolakan tercatat');
    // Usulan yang ditolak tidak ditawarkan lagi.
    const fresh = ded.reconcileDedQto(rejected.attachment, USER_DIMS);
    assert(!ded.pendingQtoCorrections(rejected.attachment, fresh.checks).some((p) => p.itemId === 'i1'), 'usulan ditolak tidak muncul lagi');
  });
  await check('5D-07c dims tersimpan di dedQto: handler tombol bekerja TANPA konteks hidup (temuan E2E run 1)', () => {
    // Jalur cepat tidak pernah membuat singleton + generate
    // membersihkan singleton — handler tombol TIDAK BOLEH bergantung
    // pada dimensi hidup. Alur tiruan setia handler view.tsx:
    const att = attachFresh();
    const { checks } = ded.reconcileDedQto(att, USER_DIMS);
    const dedQto = ded.buildDedQtoDraftInfo(att, checks, USER_DIMS);
    assert(dedQto.dims?.lengthM === 10 && dedQto.dims?.depthM === 0.5, 'dims tersimpan di dedQto');
    // Dimensi hidup KOSONG (singleton null) → resolve jatuh ke dedQto.dims.
    const resolved = ded.resolveQtoDims(ded.dimsFromIntakeContext(null), dedQto);
    assert(resolved?.lengthM === 10 && resolved?.depthM === 0.5, 'resolveQtoDims jatuh ke dims draft');
    const { checks: fresh } = ded.reconcileDedQto(att, resolved!);
    const proposal = ded.pendingQtoCorrections(att, fresh).find((p) => p.itemId === 'i3');
    assert(proposal && proposal.expectedQuantity === 40, 'usulan Galian ditemukan lewat dims draft');
    const applied = ded.applyQtoCorrection(att, proposal!, fresh);
    assert(applied.ok, 'apply lewat dims draft harus ok');
    // Jalur patch (TANPA dims sama sekali): konfirmasi → OK, eksak.
    const decision = applied.attachment.decisions.find((d) => d.itemId === 'i3')!;
    const patched = ded.patchDedQtoChecksAfterDecision(checks, decision);
    assert(patched.find((c) => c.description === 'Galian tanah pondasi')?.verdict === 'OK', 'patch: Galian → OK');
    assert(patched.find((c) => c.description === 'Pondasi batu kali')?.verdict === 'MISMATCH', 'patch: item lain tidak berubah');
    assert(ded.resolveQtoDims(ded.dimsFromIntakeContext(null), null) === null, 'tanpa dims apa pun → null (jujur)');
  });

  console.log('== 5D-08 — revisi spek DED via pratinjau + konfirmasi ==');
  await check('5D-08 pratinjau tidak mengubah apa pun; konfirmasi → user menang + supersedes', () => {
    const ctx = intake.emptyUniversalIntake();
    ctx.dedSpecs = ded.sanitizeDedSpecs(ded.dedSpecsFromAttachment(attachFresh()).specs);
    const before = deriveStructuredSpecs(ctx).find((s) => s.key === 'ded-length');
    assert(before && before.value === 10, 'sebelum revisi: 10');
    const built = ded.buildDedSpecRevisionPreview(ctx.dedSpecs, 'ded-length', 12);
    assert(built.ok && built.preview, `pratinjau harus ok: ${built.message}`);
    assert(built.preview!.oldValue === 10 && built.preview!.newValue === 12, 'pratinjau before/after 10→12');
    // Pratinjau saja: konteks TIDAK berubah.
    assert(deriveStructuredSpecs(ctx).find((s) => s.key === 'ded-length')?.value === 10, 'pratinjau tidak mengubah konteks');
    assert(!ctx.answers['ded-length'], 'pratinjau tidak menulis answers');
    // Konfirmasi: jawaban user tercatat; derive menunjukkan 12 'percakapan'.
    const next = ded.applyDedSpecRevision(ctx, built.preview!);
    const after = deriveStructuredSpecs(next).find((s) => s.key === 'ded-length');
    assert(after && after.value === 12 && after.source === 'percakapan', 'sesudah konfirmasi: 12 percakapan');
    assert(after!.supersedes === 'ded-spec:ded-length', 'supersedes tercatat');
    // DED asli UTUH di dedSpecs (konteks lama maupun baru).
    assert(next.dedSpecs.find((s) => s.key === 'ded-length')?.value === 10, 'dedSpecs tetap 10');
    assert(ctx.dedSpecs.find((s) => s.key === 'ded-length')?.value === 10, 'konteks lama tidak termutasi');
    // Parser perintah: kedua bentuk dikenali; bukan perintah → null.
    assert(ded.parseDedSpecRevisionCommand('ubah panjang DED jadi 12 m')?.value === 12, 'parser bentuk 1');
    assert(ded.parseDedSpecRevisionCommand('panjang DED seharusnya 12,5 m')?.value === 12.5, 'parser bentuk 2 + koma desimal');
    assert(ded.parseDedSpecRevisionCommand('ubah panjang jadi 12 m') === null, 'tanpa kata DED → bukan revisi DED');
    assert(ded.parseDedSpecRevisionCommand('buatkan RAB gedung 10 x 8 m') === null, 'bukan perintah revisi → null');
  });
  await check('5D-08 revisi kunci tanpa spek DED / nilai sama → ditolak jujur', () => {
    const ctx = intake.emptyUniversalIntake();
    ctx.dedSpecs = ded.sanitizeDedSpecs(ded.dedSpecsFromAttachment(attachFresh()).specs);
    const noSpec = ded.buildDedSpecRevisionPreview(ctx.dedSpecs, 'ded-area', 120);
    assert(!noSpec.ok && !noSpec.preview, 'tanpa spek DED untuk kunci itu → gagal jujur');
    const same = ded.buildDedSpecRevisionPreview(ctx.dedSpecs, 'ded-length', 10);
    assert(!same.ok, 'nilai sama dengan DED → gagal jujur');
  });

  console.log('== 5D-09 — DED tidak menimpa spek user terkonfirmasi (dan sebaliknya) ==');
  await check('5D-09 merge: spek user menang; spek DED baru tetap mendarat', () => {
    const userSpec = {
      key: 'ded-length', kind: 'dimension', label: 'Panjang (dari DED)', value: 12,
      status: 'CONFIRMED', source: 'percakapan', updatedAt: NOW,
    } as never;
    const merged = ded.mergeDedSpecsIntoSpecs([userSpec], ded.dedSpecsFromAttachment(attachFresh()).specs);
    const len = merged.merged.filter((s) => s.key === 'ded-length');
    eq(len.length, 1, 'ded-length tepat sekali sesudah merge');
    assert(len[0].value === 12 && len[0].source === 'percakapan', 'spek user (12) menang atas DED (10)');
    assert(merged.skippedDedKeys.includes('ded-length'), 'spek DED yang kalah dicatat di skippedDedKeys');
    const wid = merged.merged.find((s) => s.key === 'ded-width');
    assert(wid && wid.value === 8 && wid.source === 'DED', 'spek DED tanpa tandingan user tetap mendarat');
  });

  console.log('== 5D-10 — retrieval + resolusi harga kanonis dengan provenans ==');
  await check('5D-10 "Atap metal menerus" → AHSP 3.1.3.8 ter-resolver OFFICIAL (pola C4-10)', () => {
    const att = attachFresh();
    const prices = ded.resolveDedItemPrices(att);
    const metal = prices.reviews.find((r) => r.name === 'Atap metal menerus');
    assert(metal && !metal.unresolved, 'atap metal harus ter-resolver');
    const cand = metal!.candidates.find((c) => c.code === '3.1.3.8');
    assert(cand, `3.1.3.8 harus jadi kandidat, dapat: ${metal!.candidates.map((c) => c.code).join(',')}`);
    // Harga dari resolver kanonis (observasi run ini: Rp123.274 — bukan
    // angka yang dipatok tes; C4-10 sendiri hanya menegaskan > 0).
    assert(cand!.unitPrice != null && cand!.unitPrice > 0, `harga 3.1.3.8 harus ter-resolver > 0, dapat ${cand!.unitPrice}`);
    assert(/officialAhspRepository/.test(cand!.provenance), 'provenans menyebut sumber resmi');
    assert(cand!.priceStatus === 'FULL', `status harus FULL, dapat ${cand!.priceStatus}`);
    // Retrieval kanonis langsung (pola C4-10).
    const res = retrieveDomainCandidates(['atap metal menerus']);
    assert(res.ahspCandidates.some((c) => c.code === '3.1.3.8'), 'retrieval kanonis menemukan 3.1.3.8');
    assert(res.unresolvedQueries.length === 0, 'query dikenal tidak unresolved');
  });

  console.log('== 5D-11 — round-trip persistensi dedQto ==');
  await check('5D-11 saveDraft/loadDraft: dedQto (checks + decisions) pulih utuh', () => {
    storage.clear();
    const att = attachFresh();
    const { checks } = ded.reconcileDedQto(att, USER_DIMS);
    const proposal = ded.pendingQtoCorrections(att, checks).find((p) => p.itemId === 'i3')!;
    const corrected = ded.applyQtoCorrection(att, proposal, checks).attachment;
    const fresh = ded.reconcileDedQto(corrected, USER_DIMS);
    const dedQto = ded.buildDedQtoDraftInfo(corrected, fresh.checks);
    const res = rab.buildUniversalDraft('Buatkan RAB gedung 10 x 8 m 2 lantai', undefined, {
      projectId: PROJECT_5D,
      dedQto,
    });
    assert(res.kind === 'draft', 'draft harus tersusun');
    if (res.kind !== 'draft') return;
    const saved = dp.saveDraft({ draft: res.draft, projectId: PROJECT_5D, conversationId: null, workflowStage: 'autosave', savedBy: 'autosave' });
    assert(saved.ok, `saveDraft harus ok: ${saved.ok ? '' : (saved as { error?: string }).error}`);
    // Simulasi reload: singleton mati, storage utuh.
    rab.setLastUniversalDraft(null);
    const loaded = dp.loadDraft(PROJECT_5D);
    assert(loaded.ok, 'loadDraft harus ok');
    if (!loaded.ok) return;
    assert(loaded.draft.dedQto, 'dedQto pulih bersama draft');
    assert(loaded.draft.dedQto!.checks.length === 7, '7 checks pulih');
    assert(loaded.draft.dedQto!.decisions.length === 1, '1 keputusan pulih');
    assert(loaded.draft.dedQto!.decisions[0].action === 'confirmed', 'keputusan confirmed pulih');
    assert(loaded.draft.dedQto!.checks.find((c) => c.description === 'Galian tanah pondasi')?.verdict === 'OK', 're-check OK pulih');
    // Total RAB kanonis TIDAK berubah oleh lapisan dedQto.
    assert(loaded.draft.estimatedTotal === res.draft.estimatedTotal, 'total identik sebelum/sesudah persistensi');
  });
  await check('5D-11 fingerprint: simpan ulang identik → dedup; ubah keputusan → tulis baru', () => {
    storage.clear();
    const att = attachFresh();
    const { checks } = ded.reconcileDedQto(att, USER_DIMS);
    const dedQto = ded.buildDedQtoDraftInfo(att, checks);
    const res = rab.buildUniversalDraft('Buatkan RAB gedung 10 x 8 m 2 lantai', undefined, {
      projectId: PROJECT_5D,
      dedQto,
    });
    assert(res.kind === 'draft', 'draft harus tersusun');
    if (res.kind !== 'draft') return;
    const s1 = dp.saveDraft({ draft: res.draft, projectId: PROJECT_5D, conversationId: null, workflowStage: 'autosave', savedBy: 'autosave' });
    assert(s1.ok && !s1.deduplicated, 'simpan pertama harus tulis baru');
    const s2 = dp.saveDraft({ draft: res.draft, projectId: PROJECT_5D, conversationId: null, workflowStage: 'autosave', savedBy: 'autosave' });
    assert(s2.ok && s2.deduplicated, 'simpan ulang identik harus deduplicated');
    // Hanya keputusan dedQto yang berubah (total/isi RAB sama) → tulis baru.
    const proposal = ded.pendingQtoCorrections(att, checks).find((p) => p.itemId === 'i3')!;
    const corrected = ded.applyQtoCorrection(att, proposal, checks).attachment;
    const fresh = ded.reconcileDedQto(corrected, USER_DIMS);
    const draft2 = { ...res.draft, dedQto: ded.buildDedQtoDraftInfo(corrected, fresh.checks) };
    const s3 = dp.saveDraft({ draft: draft2, projectId: PROJECT_5D, conversationId: null, workflowStage: 'autosave', savedBy: 'autosave' });
    assert(s3.ok && !s3.deduplicated, 'perubahan keputusan dedQto saja harus memicu tulis baru (fingerprint memuat dedQto)');
  });

  console.log('== 5D-12 — brief + pesan draft menampilkan label DED/QTO ==');
  await check('5D-12 brief: seksi DED + label [DED]/[ASUMSI]/[KONFLIK] terbedakan', () => {
    const ctx = intake.emptyUniversalIntake();
    ctx.dedSpecs = ded.sanitizeDedSpecs(ded.dedSpecsFromAttachment(attachFresh()).specs);
    // Dimensi user BERBEDA dari DED (panjang 12 vs 10) → konflik >10%.
    const withDims = intake.extractUniversalContext('Buatkan RAB gedung 12 x 8 m 2 lantai', ctx);
    const lines = intake.buildUniversalBriefLines(withDims);
    const text = lines.join('\n');
    assert(text.includes('**Data dari DED**'), 'brief memuat seksi Data dari DED');
    assert(/\[DED\]/.test(text), 'brief memuat label [DED]');
    assert(/\[ASUMSI\]/.test(text), 'brief memuat label [ASUMSI] (ded-height)');
    assert(/\[KONFLIK\]/.test(text), 'brief memuat label [KONFLIK] (panjang 10 vs 12)');
    assert(/10/.test(text) && /12/.test(text), 'brief menyebut angka kedua sisi konflik');
  });
  await check('5D-12 pesan draft: seksi DED/QTO + label verdict terbedakan', () => {
    const att = attachFresh();
    const { checks } = ded.reconcileDedQto(att, USER_DIMS);
    const dedQto = ded.buildDedQtoDraftInfo(att, checks);
    const res = rab.buildUniversalDraft('Buatkan RAB gedung 10 x 8 m 2 lantai', undefined, {
      projectId: PROJECT_5D,
      dedQto,
    });
    assert(res.kind === 'draft', 'draft harus tersusun');
    if (res.kind !== 'draft') return;
    const msg = rab.formatUniversalDraftMessage(res.draft);
    assert(msg.includes('Rekonsiliasi DED/QTO'), 'pesan memuat seksi Rekonsiliasi DED/QTO');
    assert(/\[QTO MISMATCH\]/.test(msg), 'pesan memuat label [QTO MISMATCH]');
    assert(/\[DIBLOKIR\]/.test(msg), 'pesan memuat label [DIBLOKIR] (unit mismatch)');
    assert(/\[QTO HILANG\]/.test(msg), 'pesan memuat label [QTO HILANG] (kuantitas null)');
    assert(/90 m3/.test(msg) && /40/.test(msg), 'pesan menyebut angka kedua sisi mismatch Galian');
    // formatDedQtoDraftLines langsung: tanpa keputusan, tidak ada baris
    // keputusan yang dikarang (tidak ada [QTO TERKOREKSI]/[QTO DITOLAK]).
    const lines = ded.formatDedQtoDraftLines(dedQto);
    assert(!lines.some((l) => /TERKOREKSI|DITOLAK/.test(l)), 'tanpa keputusan: tidak ada baris keputusan karangan');
  });

  console.log('== S5D — asersi sumber (wiring nyata, bukan mock) ==');
  await check('S5D view Chat AI mengonsumsi lampiran + melewatkan dedSection/qtoSection ke send', () => {
    const src = readFileSync(new URL('../ai-tools/ezrab-ai/view.tsx', import.meta.url), 'utf8');
    assert(src.includes('loadDedAttachment'), 'view memakai loadDedAttachment');
    assert(src.includes('consumeDedAttachment'), 'view punya efek konsumsi lampiran');
    assert(src.includes('dedSection: dedSectionForSend'), 'view melewatkan dedSection ke send');
    assert(src.includes('qtoSection: qtoSectionForSend'), 'view melewatkan qtoSection ke send');
    assert(src.includes("kind: 'qto-correction-confirm'"), 'view menangani konfirmasi koreksi QTO');
    assert(src.includes("kind: 'ded-spec-confirm'"), 'view menangani konfirmasi revisi spek DED');
  });
  await check('S5D actionRegistry menggabung spek DED + rekonsiliasi di universalResultFor', () => {
    const src = readFileSync(new URL('../ai-tools/ezrab-ai/actionRegistry.ts', import.meta.url), 'utf8');
    assert(src.includes('mergeDedSpecsIntoSpecs'), 'universalResultFor memakai mergeDedSpecsIntoSpecs');
    assert(src.includes('buildDedQtoDraftInfo'), 'universalResultFor membangun dedQto');
    assert(src.includes('pendingQtoCorrections'), 'universalResultFor menghitung koreksi menunggu');
  });
  await check('S5D tanpa pipeline DED kedua + tanpa panggilan provider di dedQtoIntegration', () => {
    const src = readFileSync(new URL('../ai-tools/ezrab-ai/dedQtoIntegration.ts', import.meta.url), 'utf8');
    assert(!/fetch\s*\(/.test(src), 'dedQtoIntegration tidak memanggil fetch');
    assert(!/providerClient/.test(src), 'dedQtoIntegration tidak memakai providerClient');
    assert(!/axios/.test(src), 'dedQtoIntegration tidak memakai axios');
    // Ekstraksi DED dipakai dari modul kanonis (impor), bukan ditulis ulang.
    assert(src.includes("from './dedUnderstanding'"), 'ekstraksi diimpor dari dedUnderstanding kanonis');
    assert(!/function extractSpecsFromDedOutput/.test(src), 'tidak ada definisi ekstraktor kedua');
    assert(!/function checkQtoAgainstUserDimensions/.test(src), 'tidak ada mesin banding QTO kedua');
  });

  console.log(`\nchatPhase5DedQto: ${passed} lolos, ${failed} gagal${failures.length > 0 ? ` — gagal: ${failures.join(', ')}` : ''}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
