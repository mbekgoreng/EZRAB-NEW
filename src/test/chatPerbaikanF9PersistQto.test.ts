/**
 * chatPerbaikanF9PersistQto.test.ts — GELOMBANG PERBAIKAN F9-PERSIST-1 +
 * F9-QTO-1 (perintah owner 2026-11-12 22:36 "Perbaiki dua cacatnya").
 *
 * Gaya plain-tsx: `npx --yes tsx src/test/chatPerbaikanF9PersistQto.test.ts`
 *
 * F9-PERSIST-1 (LAPORAN-AKHIR §3.2): handler transfer menulis record dua
 * kali (persistActiveDraft → T1, lalu markTransferred → T2) dan nilai
 * balik markTransferred DIABAIKAN, sehingga draftUpdatedAtRef tetap T1
 * dan semua autosave berikutnya gagal DRAFT_VERSION_CONFLICT. Perbaikan:
 * kedua situs transfer lewat helper syncTransferredMark yang
 * menyinkronkan ref dari nilai balik markTransferred (view.tsx).
 *
 * F9-QTO-1 (LAPORAN-AKHIR §3.1): snapshot multi-gedung ter-link yang
 * dipulihkan membawa lengthM: 50 (jalan akses) tanpa lebar/kedalaman;
 * resolveQtoDims mendahulukan dimensi hidup itu atas dedQto.dims yang
 * tersimpan benar (8×10×0,5) → Galian CANNOT_CHECK → tombol Terima
 * menjawab "sudah tidak menunggu". Perbaikan: resolveQtoDims
 * mengutamakan dims tersimpan; dimensi hidup hanya fallback
 * (dedQtoIntegration.ts). Satu-satunya pemanggil produksi
 * resolveQtoDims adalah handler koreksi QTO (view.tsx).
 *
 * Setiap tes memakai JALUR NYATA (builder draft kanonis + persistensi +
 * aktivasi revisi + rekonsiliasi QTO kanonis), bukan mock jalur.
 * Tiruan view (autosave/transfer) meniru setia urutan pemanggilan
 * view.tsx; sinkronisasi ref-nya ditegaskan juga lewat asersi sumber
 * (F9S-01) agar tiruan tidak bisa hijau di atas view yang belum
 * diperbaiki. Simulasi "reload" = bersihkan singleton in-memory TANPA
 * menyentuh storage (pola Gate 1).
 *
 * Fixture DED = fixture 5D VERBATIM (bukan dokumen karangan baru):
 * Galian 90 m³ vs ekspektasi 40 m³ → MISMATCH; Pondasi 12 m³ →
 * MISMATCH; Beton kolom UNIT_MISMATCH; dst. Dimensi tersimpan F9:
 * 8 x 10 m, kedalaman 0,5 m (8×10×0,5 = 40 m³ — sama dengan
 * USER_DIMS 5D 10×8×0,5).
 *
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
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
    raw: map,
  };
}
const storage = makeStorage();
(globalThis as Record<string, unknown>).localStorage = storage;

/** Putar hingga milidetik berganti — menjamin dua penulisan berurutan
 *  mendapat updatedAt ISO yang BERBEDA (T1 ≠ T2) secara deterministik,
 *  tanpa bergantung pada jeda antar-tulis. Maksimal 1 ms. */
function spinNextMs(): void {
  const start = Date.now();
  while (Date.now() === start) {
    /* sengaja kosong */
  }
}

const MULTI_TEXT =
  'buatkan RAB Gedung A 3 lantai 15 x 10 m + Gedung B 2 lantai 12 x 8 m, plus jalan akses sepanjang 50 m';
const MULTI_BUDGET_TEXT = `${MULTI_TEXT}, budget Rp 900 juta`;

/* ---------- Fixture DED (verbatim fixture 5D) ---------- */
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
      id: 'i2', name: 'Pekerjaan atap', category: 'Atap', units: 'm2', quantity: null,
      quantitySource: 'UNRESOLVED', unitPrice: null, priceSource: 'UNRESOLVED', subtotal: null,
      sourcePages: [2], provenance: ['DED p.2'], stage: 'PARSE',
    }),
    dedItem({
      // Galian 90 m³ vs ekspektasi user 40 m³ → MISMATCH.
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
      id: 'i5', name: 'Atap metal menerus', category: 'Atap', units: 'm2', quantity: 80,
      quantitySource: 'DED_EXPLICIT', unitPrice: null, priceSource: 'UNRESOLVED', subtotal: null,
      sourcePages: [2], provenance: ['DED p.2'], stage: 'QUANTITY',
    }),
    dedItem({
      id: 'i6', name: 'zorblax kwintara', category: 'Lainnya', units: 'ls', quantity: 5,
      quantitySource: 'DED_EXPLICIT', unitPrice: null, priceSource: 'UNRESOLVED', subtotal: null,
      sourcePages: [4], provenance: ['DED p.4'], stage: 'QUANTITY',
    }),
    dedItem({
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

/** Dimensi tersimpan F9 (dedQto.dims): 8 x 10 m, kedalaman 0,5 m. */
const STORED_DIMS_F9 = { lengthM: 8, widthM: 10, depthM: 0.5, heightM: null, buildingAreaM2: 80, landAreaM2: null, thicknessM: null, floors: 1 };
/** Dimensi pengguna kanonis 5D: 10 x 8 m, kedalaman 0,5 m. */
const USER_DIMS_5D = { lengthM: 10, widthM: 8, depthM: 0.5, heightM: null, buildingAreaM2: 160, landAreaM2: null, thicknessM: null, floors: 2 };

async function main(): Promise<void> {
  console.log('chatPerbaikanF9PersistQto.test (GELOMBANG PERBAIKAN F9)');
  const rab = await import('../ai-tools/ezrab-ai/universalRab');
  const dp = await import('../ai-tools/ezrab-ai/draftPersistence');
  const rev = await import('../ai-tools/ezrab-ai/draftRevision');
  const ded = await import('../ai-tools/ezrab-ai/dedQtoIntegration');

  type Draft = ReturnType<typeof rab.buildUniversalDraft> extends { kind: 'draft'; draft: infer D }
    ? D
    : never;

  let pidCounter = 0;
  const nextPid = () => `PRJ-F9-${++pidCounter}`;
  const PROJECT_Q = 'PRJ-F9Q-A';

  const buildDraft = (text: string): Draft => {
    const res = rab.buildUniversalDraft(text);
    assert(res.kind === 'draft', `buildUniversalDraft kind=${res.kind} (${JSON.stringify(res).slice(0, 300)})`);
    return (res as { kind: 'draft'; draft: Draft }).draft;
  };

  /** Tiruan setia draftUpdatedAtRef view.tsx (satu mount view). */
  type ViewRef = { current: string | null };
  const newRef = (): ViewRef => ({ current: null });

  /** Tiruan setia persistActiveDraft view.tsx (autosave + transfer). */
  const viewPersist = (pid: string, ref: ViewRef, stage: string, savedBy: 'autosave' | 'transfer') => {
    const d = rab.getLastUniversalDraft(pid);
    assert(d, 'viewPersist: tidak ada draft singleton');
    const res = dp.saveDraft({
      draft: d!,
      projectId: pid,
      conversationId: null,
      workflowStage: stage,
      savedBy,
      expectedUpdatedAt: ref.current,
    });
    if (res.ok) ref.current = res.updatedAt;
    return res;
  };

  /** Tiruan setia helper syncTransferredMark view.tsx (PERBAIKAN):
   *  nilai balik markTransferred disinkronkan ke ref. */
  const viewSyncTransferredMark = (pid: string, ref: ViewRef, receipt: NonNullable<Draft['lastTransfer']>) => {
    const res = dp.markTransferred(pid, receipt);
    if (res.ok) ref.current = res.updatedAt;
    return res;
  };

  /** Tiruan perilaku LAMA (pra-perbaikan): nilai balik markTransferred
   *  diabaikan — dipakai hanya sebagai kontrol F9P-02. */
  const viewTransferBuggy = (pid: string, receipt: NonNullable<Draft['lastTransfer']>) => {
    dp.markTransferred(pid, receipt);
  };

  /** Transfer terverifikasi tiruan setia handler view.tsx: receipt
   *  dicatat pada objek draft → persist → tandai ter-transfer. */
  const viewTransfer = (pid: string, ref: ViewRef, pushed: number) => {
    const d = rab.getLastUniversalDraft(pid)!;
    d.lastTransfer = {
      projectId: pid, version: d.version, pushed, skipped: 0, at: new Date().toISOString(),
    } as NonNullable<Draft['lastTransfer']>;
    rab.setLastUniversalDraft(d, pid);
    spinNextMs();
    const p = viewPersist(pid, ref, 'transferred', 'transfer');
    assert(p.ok, `persist transfer gagal: ${JSON.stringify(p)}`);
    spinNextMs();
    const m = viewSyncTransferredMark(pid, ref, d.lastTransfer);
    assert(m.ok, `markTransferred gagal: ${JSON.stringify(m)}`);
    return { persistUpdatedAt: p.ok ? p.updatedAt : null, markUpdatedAt: m.ok ? m.updatedAt : null };
  };

  const previewOf = (draft: Draft, pid: string, text: string) => {
    const out = rev.buildRevisionPreview(draft, text, pid);
    assert(out.kind === 'preview', `buildRevisionPreview kind=${out.kind} (${JSON.stringify(out).slice(0, 400)})`);
    return (out as { kind: 'preview'; preview: rev.RevisionPreview }).preview;
  };

  const attachFresh = () => {
    const r = ded.attachDedToProject(PROJECT_Q, DED_OUTPUT as never);
    assert(r.ok && r.attachment, `attach harus ok: ${r.message}`);
    return r.attachment!;
  };

  /** Konteks intake multi-gedung F9 yang dipulihkan: lengthM 50
   *  (jalan akses) tingkat proyek, tanpa lebar/kedalaman — bentuk
   *  yang dibuktikan probe diag2 (lengthM: 50, widthM/depthM: null).
   *  Dua bangunan tanpa dimensi → fallback gedung-tunggal tidak jalan. */
  const staleMultiCtx = {
    lengthM: 50, widthM: null, depthM: null, heightM: null,
    buildingAreaM2: null, landAreaM2: null, floors: null,
    buildings: [{ id: 'A' }, { id: 'B' }],
  } as unknown as Parameters<typeof ded.dimsFromIntakeContext>[0];

  const resetAll = () => {
    rab.setLastUniversalDraft(null);
    storage.clear();
  };

  // ================= F9-PERSIST-1 =================
  console.log('== F9P — transfer tidak lagi meracuni persistensi ==');
  await check('F9P-01 sesudah markTransferred, ref autosave == updatedAt baru (T2) dan autosave berikutnya lolos', () => {
    resetAll();
    const pid = nextPid();
    const ref = newRef();
    const draft = buildDraft(MULTI_TEXT);
    rab.setLastUniversalDraft(draft, pid);
    const a = viewPersist(pid, ref, 'autosave', 'autosave');
    assert(a.ok, `autosave awal gagal: ${JSON.stringify(a)}`);
    const { persistUpdatedAt: t1, markUpdatedAt: t2 } = viewTransfer(pid, ref, 14);
    assert(t1 !== null && t2 !== null, 'kedua tulis harus mengembalikan updatedAt');
    assert(t1 !== t2, `T1 dan T2 harus berbeda (spinNextMs): T1=${t1} T2=${t2}`);
    // Inti perbaikan: ref == T2 (nilai balik markTransferred), bukan T1.
    eq(ref.current, t2, 'ref sesudah transfer harus == updatedAt markTransferred (T2)');
    const rec = dp.peekPersistedDraft(pid)!;
    eq(rec.updatedAt, t2, 'record tersimpan harus di T2');
    assert(rec.draftStatus === 'transferred', 'status transferred bertahan');
    // Autosave berikutnya (draft yang sama, isi berubah) lolos guard.
    const d2 = rab.getLastUniversalDraft(pid)!;
    d2.warnings = [...(d2.warnings ?? []), 'catatan pasca-transfer'];
    rab.setLastUniversalDraft(d2, pid);
    spinNextMs();
    const a2 = viewPersist(pid, ref, 'autosave', 'autosave');
    assert(a2.ok, `autosave pasca-transfer harus lolos (ref T2): ${JSON.stringify(a2)}`);
  });

  await check('F9P-02 KONTROL: tanpa sinkronisasi ref (perilaku lama), autosave gagal DRAFT_VERSION_CONFLICT', () => {
    resetAll();
    const pid = nextPid();
    const ref = newRef();
    const draft = buildDraft(MULTI_TEXT);
    rab.setLastUniversalDraft(draft, pid);
    const a = viewPersist(pid, ref, 'autosave', 'autosave');
    assert(a.ok, `autosave awal gagal: ${JSON.stringify(a)}`);
    // Transfer gaya LAMA: persist lalu markTransferred tanpa sync ref.
    const d = rab.getLastUniversalDraft(pid)!;
    d.lastTransfer = {
      projectId: pid, version: d.version, pushed: 14, skipped: 0, at: new Date().toISOString(),
    } as NonNullable<Draft['lastTransfer']>;
    rab.setLastUniversalDraft(d, pid);
    spinNextMs();
    const p = viewPersist(pid, ref, 'transferred', 'transfer');
    assert(p.ok, `persist transfer gagal: ${JSON.stringify(p)}`);
    const t1 = ref.current;
    spinNextMs();
    viewTransferBuggy(pid, d.lastTransfer);
    const t2 = dp.peekPersistedDraft(pid)!.updatedAt;
    assert(t1 !== t2, `kontrol butuh T1≠T2: T1=${t1} T2=${t2}`);
    assert(ref.current === t1, 'kontrol: ref tetap T1 (nilai balik diabaikan)');
    // Autosave berikutnya HARUS gagal — inilah mekanisme F9-PERSIST-1.
    const d2 = rab.getLastUniversalDraft(pid)!;
    d2.warnings = [...(d2.warnings ?? []), 'catatan pasca-transfer'];
    rab.setLastUniversalDraft(d2, pid);
    const a2 = viewPersist(pid, ref, 'autosave', 'autosave');
    assert(!a2.ok && a2.error === 'DRAFT_VERSION_CONFLICT', `kontrol: autosave harus ditolak konflik, dapat ${JSON.stringify(a2)}`);
  });

  await check('F9P-03 transfer → draft baru → autosave → revisi: record adalah draft BARU (identitas draftId+judul), revisi aktif', () => {
    resetAll();
    const pid = nextPid();
    const ref = newRef();
    // Leg A: draft pertama + transfer sukses.
    const draft1 = buildDraft(MULTI_TEXT);
    rab.setLastUniversalDraft(draft1, pid);
    const a1 = viewPersist(pid, ref, 'autosave', 'autosave');
    assert(a1.ok, `autosave draft1 gagal: ${JSON.stringify(a1)}`);
    viewTransfer(pid, ref, 14);
    // Leg B: draft BARU disusun (satu mount view yang sama, ref tetap).
    const draft2 = buildDraft(MULTI_BUDGET_TEXT);
    assert(draft2.id !== draft1.id, 'draft baru harus punya draftId berbeda');
    rab.setLastUniversalDraft(draft2, pid);
    spinNextMs();
    const a2 = viewPersist(pid, ref, 'autosave', 'autosave');
    assert(a2.ok, `autosave draft baru gagal (inilah F9-PERSIST-1): ${JSON.stringify(a2)}`);
    // REGRESI F9-B3: tegaskan IDENTITAS record tersimpan — bukan hanya
    // baseVersion===1 && !versionHistory seperti cek F9-B3 yang lolos
    // trivial di atas record draft lama.
    const rec = dp.peekPersistedDraft(pid)!;
    eq(rec.draftId, draft2.id, 'record tersimpan harus draft BARU (draftId)');
    eq(rec.title, draft2.title, 'record tersimpan harus draft BARU (judul)');
    assert(rec.draftId !== draft1.id, 'record TIDAK BOLEH lagi draft lama');
    assert(rec.baseVersion === 1 && !rec.versionHistory, 'draft baru v1 tanpa riwayat');
    // Leg C: pratinjau revisi dari draft baru → aktivasi lolos.
    const preview = previewOf(draft2, pid, 'gedung B jadi 3 lantai');
    const act = rev.activateRevision(pid, preview);
    assert(act.ok, `aktivasi revisi draft baru gagal: ${JSON.stringify(act)}`);
    const rec2 = dp.peekPersistedDraft(pid)!;
    eq(rec2.draftId, draft2.id, 'sesudah aktivasi record tetap draft baru');
    assert(rec2.baseVersion === 2, `baseVersion sesudah aktivasi=${rec2.baseVersion}, harap 2`);
    assert((rec2.versionHistory ?? []).length === 2, 'riwayat: seed v1 + v2');
  });

  // ================= F9-QTO-1 =================
  console.log('== F9Q — koreksi QTO tidak lagi dibayangi konteks usang ==');
  await check('F9Q-01 resolveQtoDims: dimensi hidup parsial {50,null,null} + dims tersimpan 8×10×0,5 → dims tersimpan menang', () => {
    resetAll();
    const att = attachFresh();
    const { checks } = ded.reconcileDedQto(att, STORED_DIMS_F9);
    const dedQto = ded.buildDedQtoDraftInfo(att, checks, STORED_DIMS_F9);
    const liveDims = ded.dimsFromIntakeContext(staleMultiCtx);
    eq(liveDims.lengthM, 50, 'konteks usang me-rehydrate ke lengthM 50');
    assert(liveDims.widthM == null && liveDims.depthM == null, 'konteks usang tanpa lebar/kedalaman');
    const resolved = ded.resolveQtoDims(liveDims, dedQto);
    assert(resolved !== null, 'resolve tidak boleh null bila dims tersimpan ada');
    eq(resolved!.lengthM, 8, 'dims tersimpan menang: lengthM 8, bukan 50');
    eq(resolved!.widthM, 10, 'dims tersimpan menang: widthM 10');
    eq(resolved!.depthM, 0.5, 'dims tersimpan menang: depthM 0,5');
  });

  await check('F9Q-02 tiruan setia handler koreksi: Galian DITEMUKAN (MISMATCH 90 vs 40) + Terima menerapkan 90→40', () => {
    resetAll();
    const att = attachFresh();
    // Rekonsiliasi saat draft disusun (dari dims tersimpan 8×10×0,5).
    const { checks } = ded.reconcileDedQto(att, STORED_DIMS_F9);
    const dedQto = ded.buildDedQtoDraftInfo(att, checks, STORED_DIMS_F9);
    // Handler: resolveQtoDims(dims hidup, dedQto) lalu rekomputasi.
    const resolved = ded.resolveQtoDims(ded.dimsFromIntakeContext(staleMultiCtx), dedQto);
    assert(resolved !== null, 'resolve tidak boleh null');
    const { checks: fresh } = ded.reconcileDedQto(att, resolved!);
    const galian = fresh.find((c) => c.description === 'Galian tanah pondasi')!;
    assert(galian, 'check Galian harus ada');
    eq(galian.verdict, 'MISMATCH', `Galian harus MISMATCH (bukan CANNOT_CHECK): ${galian.verdict}`);
    eq(galian.expectedFromUserDimensions, 40, 'ekspektasi Galian 8×10×0,5 = 40 m³');
    const proposal = ded.pendingQtoCorrections(att, fresh).find((p) => p.itemId === 'i3');
    assert(proposal, 'usulan koreksi Galian harus DITEMUKAN (bukan "sudah tidak menunggu")');
    assert(proposal!.id === 'qto:i3' && proposal!.expectedQuantity === 40, `usulan qto:i3 → 40, dapat ${JSON.stringify(proposal)}`);
    const applied = ded.applyQtoCorrection(att, proposal!, fresh);
    assert(applied.ok, `apply harus ok: ${applied.message}`);
    const item = applied.attachment.items.find((i) => i.id === 'i3');
    assert(item && item.quantity === 40, 'kuantitas Galian menjadi 40');
    assert(item!.quantitySource === 'USER_INPUT', 'sumber menjadi USER_INPUT');
    const decision = applied.attachment.decisions.find((d) => d.itemId === 'i3');
    assert(decision && decision.action === 'confirmed' && decision.originalQuantity === 90 && decision.correctedQuantity === 40, 'keputusan 90→40 tercatat');
    const recheck = ded.reconcileDedQto(applied.attachment, resolved!);
    assert(recheck.checks.find((c) => c.description === 'Galian tanah pondasi')?.verdict === 'OK', 're-check Galian harus OK');
    // KONTROL mekanisme: dengan dimensi hidup parsial SAJA (urutan lama),
    // Galian CANNOT_CHECK dan tidak ada usulan — inilah F9-QTO-1.
    const { checks: staleChecks } = ded.reconcileDedQto(att, ded.dimsFromIntakeContext(staleMultiCtx));
    eq(staleChecks.find((c) => c.description === 'Galian tanah pondasi')?.verdict, 'CANNOT_CHECK', 'kontrol: dims {50,null,null} → CANNOT_CHECK');
    assert(ded.pendingQtoCorrections(att, staleChecks).find((p) => p.itemId === 'i3') === undefined, 'kontrol: dims usang → usulan Galian tidak ditemukan');
  });

  await check('F9Q-03 alur terisolasi Gate 4 tetap bekerja: konteks hidup kosong → dims tersimpan → koreksi 90→40', () => {
    resetAll();
    const att = attachFresh();
    const { checks } = ded.reconcileDedQto(att, USER_DIMS_5D);
    const dedQto = ded.buildDedQtoDraftInfo(att, checks, USER_DIMS_5D);
    // Tiruan setia handler alur terisolasi (e2e-fase9-diag.cjs): singleton null.
    const resolved = ded.resolveQtoDims(ded.dimsFromIntakeContext(null), dedQto);
    assert(resolved?.lengthM === 10 && resolved?.depthM === 0.5, 'resolve jatuh ke dims draft');
    const { checks: fresh } = ded.reconcileDedQto(att, resolved!);
    const proposal = ded.pendingQtoCorrections(att, fresh).find((p) => p.itemId === 'i3');
    assert(proposal && proposal.expectedQuantity === 40, 'usulan Galian ditemukan lewat dims draft');
    const applied = ded.applyQtoCorrection(att, proposal!, fresh);
    assert(applied.ok, 'apply lewat dims draft harus ok');
    assert(applied.attachment.items.find((i) => i.id === 'i3')?.quantity === 40, 'Galian 90→40');
    const recheck = ded.reconcileDedQto(applied.attachment, resolved!);
    assert(recheck.checks.find((c) => c.description === 'Galian tanah pondasi')?.verdict === 'OK', 're-check Galian harus OK');
  });

  await check('F9Q-04 fallback dipertahankan: tanpa dims tersimpan → dimensi hidup; tanpa keduanya → null (jujur)', () => {
    resetAll();
    const att = attachFresh();
    const { checks } = ded.reconcileDedQto(att, USER_DIMS_5D);
    const dedQtoNoDims = ded.buildDedQtoDraftInfo(att, checks);
    assert(dedQtoNoDims.dims === undefined, 'dedQto tanpa argumen dims memang tak membawa dims');
    const liveFull = { lengthM: 10, widthM: 8, depthM: 0.5, heightM: null, buildingAreaM2: 160, landAreaM2: null };
    const r1 = ded.resolveQtoDims(liveFull, dedQtoNoDims);
    assert(r1 !== null && r1.lengthM === 10 && r1.depthM === 0.5, 'tanpa dims tersimpan → dimensi hidup dipakai');
    const r2 = ded.resolveQtoDims(liveFull, null);
    assert(r2 !== null && r2.lengthM === 10, 'tanpa dedQto sama sekali → dimensi hidup dipakai');
    assert(ded.resolveQtoDims(ded.dimsFromIntakeContext(null), null) === null, 'tanpa dims apa pun → null (jujur)');
    assert(ded.resolveQtoDims(ded.dimsFromIntakeContext(null), dedQtoNoDims) === null, 'hidup kosong + draft tanpa dims → null (jujur)');
  });

  // ================= ASERSI SUMBER + GUARD =================
  console.log('== F9S — asersi sumber + guard utuh ==');
  await check('F9S-01 perbaikan ter-wire di view + guard utuh + tanpa provider di jalur perbaikan', () => {
    const viewSrc = readFileSync(new URL('../ai-tools/ezrab-ai/view.tsx', import.meta.url), 'utf8');
    const dedSrc = readFileSync(new URL('../ai-tools/ezrab-ai/dedQtoIntegration.ts', import.meta.url), 'utf8');
    const dpSrc = readFileSync(new URL('../ai-tools/ezrab-ai/draftPersistence.ts', import.meta.url), 'utf8');
    const revSrc = readFileSync(new URL('../ai-tools/ezrab-ai/draftRevision.ts', import.meta.url), 'utf8');
    // PERSIST-1: kedua situs transfer lewat helper; helper sync ref.
    const callSites = (viewSrc.match(/syncTransferredMark\(d\.lastTransfer\)/g) ?? []).length;
    eq(callSites, 2, 'kedua situs transfer harus memakai syncTransferredMark');
    const bareMarks = (viewSrc.match(/markTransferred\(effProject\.id/g) ?? []).length;
    eq(bareMarks, 1, 'hanya helper yang memanggil markTransferred langsung (1×)');
    assert(
      /const syncTransferredMark[\s\S]{0,400}draftUpdatedAtRef\.current = res\.updatedAt/.test(viewSrc),
      'helper syncTransferredMark harus menyinkronkan ref dari nilai balik',
    );
    // QTO-1: urutan prioritas di resolveQtoDims — tersimpan dulu, hidup belakangan.
    const storedIdx = dedSrc.indexOf('hasAny(draftDedQto?.dims)');
    const liveIdx = dedSrc.indexOf('hasAny(liveDims)');
    assert(storedIdx !== -1 && liveIdx !== -1, 'resolveQtoDims harus memeriksa kedua sumber');
    assert(storedIdx < liveIdx, 'dims tersimpan harus diperiksa SEBELUM dimensi hidup');
    // Tanpa provider di jalur perbaikan.
    for (const [name, src] of [['dedQtoIntegration', dedSrc], ['draftPersistence', dpSrc], ['draftRevision', revSrc]] as const) {
      assert(!/fetch\s*\(/.test(src), `${name} tidak memanggil fetch`);
      assert(!/providerClient/.test(src), `${name} tidak memakai providerClient`);
    }
    // Guard optimistic-concurrency masih ada (sumber + perilaku).
    assert(dpSrc.includes('existing.updatedAt !== input.expectedUpdatedAt'), 'guard expectedUpdatedAt masih ada');
    assert(dpSrc.includes('DRAFT_VERSION_CONFLICT'), 'kode DRAFT_VERSION_CONFLICT masih ada');
    // Guard draftId revisi tidak berubah.
    assert(revSrc.includes('record.draftId !== preview.draftId'), 'guard draftId revisi tidak berubah');
    // Perilaku guard: expectedUpdatedAt basi (deterministik) ditolak.
    resetAll();
    const pid = nextPid();
    const draft = buildDraft(MULTI_TEXT);
    rab.setLastUniversalDraft(draft, pid);
    const s1 = dp.saveDraft({ draft, projectId: pid });
    assert(s1.ok, `saveDraft awal gagal: ${JSON.stringify(s1)}`);
    const stale = dp.saveDraft({ draft, projectId: pid, expectedUpdatedAt: '2000-01-01T00:00:00.000Z' });
    assert(!stale.ok && stale.error === 'DRAFT_VERSION_CONFLICT', `guard harus menolak expectedUpdatedAt basi: ${JSON.stringify(stale)}`);
  });

  console.log(`\nchatPerbaikanF9PersistQto: ${passed} lolos, ${failed} gagal${failures.length > 0 ? ` — gagal: ${failures.join(', ')}` : ''}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e: unknown) => {
  console.error('SUITE CRASH:', e);
  process.exitCode = 2;
});
