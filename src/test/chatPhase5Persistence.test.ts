/**
 * chatPhase5Persistence.test.ts — GATE 1 (5A): Persistensi Intake &
 * Recovery (Phase 5 Workflow Integration, direktif owner 2026-11-12
 * 11:45 WIB §3 + §10 Gate 1).
 *
 * Gaya plain-tsx: `npx --yes tsx src/test/chatPhase5Persistence.test.ts`
 *
 * Setiap tes memakai JALUR NYATA (store + registry + runtime), bukan
 * mock jalur: executeIntent/tryContinueUniversalContext/
 * generateUniversalFromBrief (registry) + saveIntakeContext/loadDraft
 * (draftPersistence) + begin/finishExecution (executionRuntime) +
 * unifiedConversationStore (riwayat). Simulasi "reload" = bersihkan
 * singleton in-memory (clearUniversalContext + setLastUniversalDraft +
 * __resetExecutionRuntimeForTests) TANPA menyentuh storage — persis
 * seperti proses browser baru atas localStorage yang sama. Simulasi
 * "efek view" = pemanggilan saveIntakeContext/persistActiveDraft yang
 * sama persis dengan yang dilakukan view.tsx pada titik commitnya.
 *
 * Klasifikasi per ID: VERIFIED PASS / VERIFIED FAIL / PARTIAL /
 * BLOCKED / NOT RUN (lihat laporan gate1-persistence-recovery.md).
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
const read = (rel: string): string => readFileSync(`${process.cwd()}/${rel}`, 'utf-8');

/* ---------- localStorage shim (node) ---------- */
type StorageShim = ReturnType<typeof makeStorage>;
function makeStorage() {
  const map = new Map<string, string>();
  let failNextSet: Error | null = null;
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      if (failNextSet) {
        const e = failNextSet;
        failNextSet = null;
        throw e;
      }
      map.set(k, String(v));
    },
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
    /** Uji: gagalkan setItem BERIKUTNYA dengan error ini (sekali). */
    failNextSetWith: (e: Error) => {
      failNextSet = e;
    },
    /** Uji: gagalkan SEMUA setItem berikutnya sampai dipulihkan. */
    failAll: false,
    raw: map,
  };
}
const storage: StorageShim = makeStorage();
(globalThis as Record<string, unknown>).localStorage = storage;

async function main(): Promise<void> {
  console.log('chatPhase5Persistence.test (GATE 1 / 5A)');
  const reg = await import('../ai-tools/ezrab-ai/actionRegistry');
  const rab = await import('../ai-tools/ezrab-ai/universalRab');
  const dp = await import('../ai-tools/ezrab-ai/draftPersistence');
  const rt = await import('../ai-tools/ezrab-ai/executionRuntime');
  const { routeIntent } = await import('../ai-tools/ezrab-ai/intentRouter');
  const { deriveIdempotencyKey } = await import('../ai-tools/ezrab-ai/toolRegistry');
  const { unifiedConversationStore } = await import(
    '../services/ai/conversation/unifiedConversationStore'
  );
  const { serializeUniversalIntakeContext } = await import(
    '../ai-tools/ezrab-ai/universalIntake'
  );

  const PROJECT_A = 'PRJ-5A-A';
  const PROJECT_B = 'PRJ-5A-B';

  const mockCtx = (projectId: string | null) =>
    ({
      navigate: () => undefined,
      currentMenu: 'ezrab-ai',
      activeProject: projectId ? { id: projectId, name: `Proyek ${projectId}` } : null,
      projects: [],
      projectTotal: 0,
      projectItems: null,
    }) as unknown as Parameters<typeof reg.executeIntent>[2];

  const start = (text: string, projectId: string | null = PROJECT_A) => {
    const routed = routeIntent(text);
    return reg.executeIntent(routed.intent, routed.param, {
      ...mockCtx(projectId),
      rawText: text,
    });
  };

  const hasPush = (res: { actions?: Array<{ action: { kind: string } }> } | null | undefined) =>
    !!res?.actions?.some((a) => a.action.kind === 'push-universal');

  /** Tiruan setia efek simpan intake view.tsx (jalan sesudah render). */
  const viewSaveEffect = (projectId: string) => {
    const ictx = reg.getUniversalContextState();
    if (!ictx) return 'SKIP';
    const res = dp.saveIntakeContext(projectId, ictx);
    return res.ok ? (res.deduplicated ? 'DEDUP' : 'SAVED') : `FAIL ${res.error}`;
  };

  /** Tiruan setia persistActiveDraft('autosave') view.tsx. */
  const viewAutosaveDraft = (projectId: string) => {
    const d = rab.getLastUniversalDraft(projectId);
    if (!d) return 'SKIP';
    const res = dp.saveDraft({
      draft: d,
      projectId,
      conversationId: null,
      workflowStage: 'autosave',
      savedBy: 'autosave',
    });
    return res.ok ? (res.deduplicated ? 'DEDUP' : 'SAVED') : `FAIL ${res.error}`;
  };

  /** Simulasi reload: singleton in-memory mati, storage utuh. */
  const simulateReload = () => {
    reg.clearUniversalContext();
    rab.setLastUniversalDraft(null);
    rt.__resetExecutionRuntimeForTests();
  };

  const resetAll = () => {
    simulateReload();
    storage.clear();
  };

  /** Alur kandang terpandu sampai brief (kuesioner terkirim penuh). */
  const kandangSampaiBrief = (projectId: string = PROJECT_A) => {
    const r1 = start('Saya punya budget Rp300 juta. Bisa buatkan RAB kandang sapi?', projectId);
    viewSaveEffect(projectId);
    const r2 = reg.tryContinueUniversalContext('17 x 9 meter');
    viewSaveEffect(projectId);
    const r3 = reg.tryContinueUniversalContext('Kandang terbuka');
    viewSaveEffect(projectId);
    const r4 = reg.submitQuestionnaireAnswers({
      'kandang-capacity': { selectedIds: ['kap-30'], customText: null, status: 'answered' },
      'kandang-roof-material': { selectedIds: ['atap-spandek'], customText: null, status: 'answered' },
      'kandang-floor': { selectedIds: ['lantai-beton-miring'], customText: null, status: 'answered' },
      'kandang-facilities': { selectedIds: ['fas-palung', 'fas-drainase'], customText: null, status: 'answered' },
      'kandang-manure': { selectedIds: [], customText: null, status: 'skipped' },
    });
    viewSaveEffect(projectId);
    return { r1, r2, r3, r4 };
  };

  // ================= (1) PERSISTENSI SNAPSHOT =================
  await check('P5A-01 jalur cepat auto-draft: snapshot ADA, tertaut draft, 2 bangunan', () => {
    resetAll();
    const res = start(
      'Buatkan RAB proyek 2 gedung: gedung A 3 lantai 20 x 12 m dan gedung B 2 lantai 15 x 10 m, budget 500 juta',
    );
    assert(hasPush(res), 'jalur cepat menghasilkan draft (push-universal)');
    assert(reg.getUniversalContextState() === null, 'alur tidak dicegat: singleton tetap null');
    const snap = dp.peekIntakeContext(PROJECT_A);
    assert(snap !== null, 'snapshot intake ADA di storage sesudah auto-draft (dulu: tidak pernah mendarat)');
    const draft = rab.getLastUniversalDraft(PROJECT_A);
    assert(draft !== null, 'draft singleton ada');
    assert(snap!.generatedDraftId === draft!.id, 'snapshot tertaut ke draft yang dihasilkan');
    assert(snap!.generatedAt !== null && snap!.generatedAt !== undefined, 'generatedAt tercatat');
    const data = snap!.context.data as Record<string, unknown>;
    const buildings = data.buildings as Array<{ label?: string; floors?: number }>;
    assert(Array.isArray(buildings) && buildings.length === 2, 'snapshot memuat 2 bangunan');
    assert(buildings.some((b) => b.floors === 3) && buildings.some((b) => b.floors === 2), 'lantai 3 & 2 dipertahankan per bangunan');
    const budget = data.budget as { amount?: number } | null;
    assert(budget?.amount === 500_000_000, 'budget 500 jt tersimpan di snapshot');
    assert((data.projectId as string | null) === PROJECT_A, 'snapshot terikat proyek pemiliknya');
  });

  await check('P5A-02 jalur terpandu: snapshot final APPROVED + kuesioner + budgetHistory + koreksi + unresolved', () => {
    resetAll();
    kandangSampaiBrief();
    // Koreksi budget di brief (riwayat + koreksi tercatat).
    const upd = reg.tryContinueUniversalContext('Ubah budget menjadi 250 juta.');
    assert(upd !== null, 'koreksi budget diterima di brief');
    viewSaveEffect(PROJECT_A);
    const gen = reg.generateUniversalFromBrief();
    assert(hasPush(gen), 'generate dari brief menghasilkan draft');
    assert(reg.getUniversalContextState() === null, 'singleton dibersihkan sesudah generate (perilaku sesi dipin)');
    viewAutosaveDraft(PROJECT_A);
    const snap = dp.peekIntakeContext(PROJECT_A);
    assert(snap !== null, 'snapshot ADA sesudah generate');
    const data = snap!.context.data as Record<string, unknown>;
    assert(data.approvalStatus === 'APPROVED', 'snapshot adalah konteks final APPROVED (bukan PENDING pra-generate)');
    const q = data.questionnaire as { status?: string; answers?: Record<string, { status?: string }> };
    assert(q?.status === 'submitted', 'keadaan kuesioner submitted tersimpan');
    assert(q?.answers?.['kandang-capacity']?.status === 'answered', 'jawaban kapasitas tersimpan');
    assert(q?.answers?.['kandang-manure']?.status === 'skipped', 'jawaban yang dilewati tercatat skipped');
    const history = data.budgetHistory as Array<{ amount?: number }>;
    assert(Array.isArray(history) && history.some((h) => h.amount === 300_000_000), 'budgetHistory memuat nilai lama 300 jt');
    const corrections = data.corrections as Array<{ key?: string }>;
    assert(Array.isArray(corrections) && corrections.length > 0, 'riwayat koreksi tercatat');
    const budget = data.budget as { amount?: number } | null;
    assert(budget?.amount === 250_000_000, 'budget kini 250 jt');
    assert(Array.isArray(snap!.context.structuredSpecs) && snap!.context.structuredSpecs.length > 0, 'spek terstruktur v2 tersimpan');
    const draft = rab.getLastUniversalDraft(PROJECT_A);
    assert(snap!.generatedDraftId === draft!.id, 'snapshot tertaut ke draft');
    // Unresolved dihitung ulang saat rehidrasi (fakta turunan tidak disimpan).
    const loaded = dp.loadIntakeContext(PROJECT_A);
    assert(loaded.ok, 'snapshot termuat kembali');
    if (loaded.ok) {
      assert(
        loaded.ctx.unresolved.some((u) => /kotoran/i.test(u)) || loaded.ctx.questionnaire.answers['kandang-manure']?.status === 'skipped',
        'yang belum ditentukan (pengelolaan kotoran) tetap terlacak sesudah rehidrasi',
      );
    }
  });

  await check('P5A-03 isolasi proyek: snapshot & draft tidak tertukar antar proyek', () => {
    resetAll();
    start('Buatkan RAB proyek 2 gedung: gedung A 3 lantai 20 x 12 m dan gedung B 2 lantai 15 x 10 m, budget 500 juta', PROJECT_A);
    kandangSampaiBrief(PROJECT_B);
    reg.generateUniversalFromBrief();
    viewAutosaveDraft(PROJECT_B);
    const snapA = dp.peekIntakeContext(PROJECT_A);
    const snapB = dp.peekIntakeContext(PROJECT_B);
    assert(snapA !== null && snapB !== null, 'kedua proyek punya snapshot sendiri');
    assert(snapA!.context.primaryId !== snapB!.context.primaryId, 'isi snapshot berbeda per proyek');
    const draftA = rab.getLastUniversalDraft(PROJECT_A);
    const draftB = rab.getLastUniversalDraft(PROJECT_B);
    // Draft terakhir yang dibangun (B) terikat B; pembacaan lintas proyek null.
    assert(draftB !== null, 'draft B terbaca di proyek B');
    assert(rab.getLastUniversalDraft(PROJECT_A) === null || draftA?.id !== draftB?.id, 'draft B tidak bocor sebagai draft A');
    const loadedB = dp.loadIntakeContext(PROJECT_B);
    assert(loadedB.ok && loadedB.ctx.projectId === PROJECT_B, 'snapshot B terikat proyek B');
  });

  await check('P5A-04 konteks FRESH kini membawa projectId (cap celah ARS-06)', () => {
    resetAll();
    start('Saya punya budget Rp300 juta. Bisa buatkan RAB kandang sapi?');
    const ctx = reg.getUniversalContextState();
    assert(ctx !== null, 'konteks intake dibuat');
    assert(ctx!.projectId === PROJECT_A, `projectId tercap di intake fresh (dulu: null), dapat ${String(ctx!.projectId)}`);
    const draftBefore = rab.getLastUniversalDraft(PROJECT_A);
    assert(draftBefore === null, 'belum ada draft sebelum generate');
  });

  // ================= (2) RECOVERY RELOAD =================
  await check('P5A-05 reload sesudah generate terpandu: konteks + draft pulih identik', () => {
    resetAll();
    kandangSampaiBrief();
    reg.generateUniversalFromBrief();
    viewAutosaveDraft(PROJECT_A);
    const draftBefore = rab.getLastUniversalDraft(PROJECT_A)!;
    const snapBefore = dp.peekIntakeContext(PROJECT_A)!;
    const itemsBefore = rab.effectiveItems(draftBefore).length;
    simulateReload();
    assert(reg.getUniversalContextState() === null, 'singleton konteks mati sesudah reload');
    assert(rab.getLastUniversalDraft(PROJECT_A) === null, 'singleton draft mati sesudah reload');
    // Efek pemulihan draft view: loadDraft → setLastUniversalDraft.
    const loadedDraft = dp.loadDraft(PROJECT_A);
    assert(loadedDraft.ok, 'record draft termuat sesudah reload');
    if (loadedDraft.ok) {
      rab.setLastUniversalDraft(loadedDraft.draft, PROJECT_A);
      assert(loadedDraft.draft.id === draftBefore.id, 'draft yang pulih = draft yang sama (id)');
      assert(loadedDraft.draft.version === draftBefore.version, 'versi draft sama');
      assert(rab.effectiveItems(loadedDraft.draft).length === itemsBefore, 'item draft sama');
    }
    // Efek pemulihan intake view: penjaga tautan mengizinkan restore.
    const loaded = dp.loadIntakeContext(PROJECT_A);
    assert(loaded.ok, 'snapshot termuat sesudah reload');
    if (loaded.ok) {
      const draftRec = dp.peekPersistedDraft(PROJECT_A);
      assert(dp.shouldRestoreIntakeSnapshot(loaded, draftRec), 'penjaga pemulihan MENGIZINKAN snapshot tertaut');
      reg.restoreUniversalContext(loaded.ctx, PROJECT_A);
      const restored = reg.getUniversalContextState()!;
      assert(
        JSON.stringify(serializeUniversalIntakeContext(restored)) ===
          JSON.stringify(serializeUniversalIntakeContext(loaded.ctx)),
        'konteks pulih identik (round-trip serialisasi)',
      );
      assert(restored.approvalStatus === 'APPROVED', 'status APPROVED pulih');
      assert(restored.budget?.amount === 300_000_000, 'budget pulih');
      assert(restored.questionnaire.status === 'submitted', 'keadaan kuesioner pulih');
    }
    void snapBefore;
  });

  await check('P5A-06 reload sesudah auto-draft jalur cepat: snapshot + draft pulih', () => {
    resetAll();
    start('Buatkan RAB proyek 2 gedung: gedung A 3 lantai 20 x 12 m dan gedung B 2 lantai 15 x 10 m, budget 500 juta');
    viewAutosaveDraft(PROJECT_A);
    const draftId = rab.getLastUniversalDraft(PROJECT_A)!.id;
    simulateReload();
    const loaded = dp.loadIntakeContext(PROJECT_A);
    assert(loaded.ok, 'snapshot jalur cepat termuat sesudah reload');
    if (loaded.ok) {
      assert(loaded.generatedDraftId === draftId, 'tautan draft pulih');
      assert(loaded.ctx.buildings.length === 2, '2 bangunan pulih');
      assert(dp.shouldRestoreIntakeSnapshot(loaded, dp.peekPersistedDraft(PROJECT_A)), 'penjaga mengizinkan restore');
      reg.restoreUniversalContext(loaded.ctx, PROJECT_A);
    }
    const loadedDraft = dp.loadDraft(PROJECT_A);
    assert(loadedDraft.ok && loadedDraft.draft.id === draftId, 'draft pulih dengan id yang sama');
  });

  await check('P5A-07 reload di tengah intake (belum ada draft): snapshot pra-draft tetap pulih', () => {
    resetAll();
    start('Saya punya budget Rp300 juta. Bisa buatkan RAB kandang sapi?');
    viewSaveEffect(PROJECT_A);
    reg.tryContinueUniversalContext('17 x 9 meter');
    viewSaveEffect(PROJECT_A);
    simulateReload();
    const loaded = dp.loadIntakeContext(PROJECT_A);
    assert(loaded.ok, 'snapshot pra-draft termuat');
    if (loaded.ok) {
      assert(loaded.generatedDraftId === null, 'belum ada tautan draft (wajar: belum generate)');
      assert(dp.shouldRestoreIntakeSnapshot(loaded, dp.peekPersistedDraft(PROJECT_A)), 'tanpa record draft, restore diizinkan');
      reg.restoreUniversalContext(loaded.ctx, PROJECT_A);
      const ctx = reg.getUniversalContextState()!;
      assert(ctx.budget?.amount === 300_000_000, 'budget pulih');
      assert(ctx.dimensionsText === '17 × 9 m', 'dimensi teks pulih (pasangan L×W disimpan sebagai dimensionsText)');
      assert(ctx.primary?.id === 'kandang', 'kategori pulih');
    }
  });

  await check('P5A-08 penjaga pemulihan: snapshot TAK-TERKAIT yang lebih tua dari draft tetap ditolak', () => {
    // Perilaku lama dipertahankan: hanya snapshot tertaut yang lolos.
    assert(
      dp.shouldRestoreIntakeSnapshot(
        { updatedAt: '2026-11-12T00:00:00.000Z', generatedDraftId: null },
        { draftId: 'uni-lain', updatedAt: '2026-11-12T01:00:00.000Z' },
      ) === false,
      'snapshot tak-terkait + draft lebih baru → tolak',
    );
    assert(
      dp.shouldRestoreIntakeSnapshot(
        { updatedAt: '2026-11-12T02:00:00.000Z', generatedDraftId: null },
        { draftId: 'uni-lain', updatedAt: '2026-11-12T01:00:00.000Z' },
      ) === true,
      'snapshot lebih baru dari draft → pulihkan',
    );
    assert(
      dp.shouldRestoreIntakeSnapshot(
        { updatedAt: '2026-11-12T00:00:00.000Z', generatedDraftId: 'uni-sama' },
        { draftId: 'uni-sama', updatedAt: '2026-11-12T01:00:00.000Z' },
      ) === true,
      'snapshot tertaut meski lebih tua → pulihkan bersama draft',
    );
    assert(
      dp.shouldRestoreIntakeSnapshot(
        { updatedAt: '2026-11-12T00:00:00.000Z', generatedDraftId: 'uni-lain' },
        { draftId: 'uni-sama', updatedAt: '2026-11-12T01:00:00.000Z' },
      ) === false,
      'snapshot tertaut draft LAIN + draft lebih baru → tolak',
    );
  });

  // ================= (3) RECOVERY NAVIGASI SPA =================
  await check('P5A-09 navigasi SPA saat eksekusi berjalan: eksekusi + snapshot selamat', () => {
    resetAll();
    kandangSampaiBrief();
    const h = rt.beginExecution('conv-5a', PROJECT_A);
    let seenBefore: string[] = [];
    const unsub = rt.subscribeExecution('conv-5a', (rec) => {
      if (rec) seenBefore.push(rec.status);
    });
    unsub(); // = EzrabAiView unmount saat pindah menu
    assert(rt.getActiveExecution('conv-5a') !== null, 'eksekusi tetap aktif sesudah unsubscribe');
    assert(h.signal.aborted === false, 'signal tidak aborted oleh navigasi');
    assert(dp.peekIntakeContext(PROJECT_A) !== null, 'snapshot intake utuh selama navigasi');
    // Kembali ke Chat AI: langganan baru melihat status yang sama, lalu
    // menerima penyelesaian (langganan ini yang mewakili view yang kembali).
    let seenAfter: string[] = [];
    const unsub2 = rt.subscribeExecution('conv-5a', (rec) => {
      if (rec) seenAfter.push(rec.status);
    });
    assert(seenAfter.includes('generating'), 'remount melihat status generating');
    rt.finishExecution(h.record.requestId, 'completed');
    unsub2();
    assert(rt.getLastExecution('conv-5a')?.status === 'completed', 'eksekusi selesai normal sesudah navigasi');
    assert(seenAfter.includes('generating') && seenAfter.includes('completed'), 'langganan remount menerima generating → completed');
    void seenBefore;
  });

  // ================= (4) PENCEGAHAN RETRY GANDA / DUPLIKASI DRAFT =================
  await check('P5A-10 recovery + generate ulang: TEPAT SATU record draft per proyek', () => {
    resetAll();
    kandangSampaiBrief();
    reg.generateUniversalFromBrief();
    viewAutosaveDraft(PROJECT_A);
    const firstId = rab.getLastUniversalDraft(PROJECT_A)!.id;
    simulateReload();
    // Pulihkan draft + konteks seperti efek view.
    const ld = dp.loadDraft(PROJECT_A);
    assert(ld.ok, 'draft termuat');
    if (ld.ok) rab.setLastUniversalDraft(ld.draft, PROJECT_A);
    const li = dp.loadIntakeContext(PROJECT_A);
    assert(li.ok, 'snapshot termuat');
    if (li.ok) reg.restoreUniversalContext(li.ctx, PROJECT_A);
    // Pengguna meminta susun ulang dari konteks yang dipulihkan.
    const regen = reg.generateUniversalFromBrief();
    assert(hasPush(regen), 'generate ulang dari konteks pulih berhasil');
    const secondId = rab.getLastUniversalDraft(PROJECT_A)!.id;
    assert(secondId !== firstId, 'rebuild memakai id draft baru (id non-deterministik by design)');
    viewAutosaveDraft(PROJECT_A);
    // Storage: SATU record per proyek (ditulis timpa, bukan duplikat).
    const raw = storage.getItem(dp.AI_DRAFTS_STORAGE_KEY);
    assert(raw !== null, 'kunci draft ada');
    const envelope = JSON.parse(raw!) as { data: Record<string, { draftId: string }> };
    const keys = Object.keys(envelope.data);
    assert(keys.length === 1 && keys[0] === PROJECT_A, `tepat 1 record proyek di storage (dapat: ${keys.join(',')})`);
    assert(envelope.data[PROJECT_A].draftId === secondId, 'record menunjuk draft terbaru');
    // Snapshot ikut tertaut ulang ke draft terbaru.
    const snap = dp.peekIntakeContext(PROJECT_A);
    assert(snap!.generatedDraftId === secondId, 'snapshot tertaut ulang ke draft terbaru');
  });

  await check('P5A-11 autosave idempoten: simpan draft yang sama 2× → dedupe, savedCount tetap', () => {
    resetAll();
    kandangSampaiBrief();
    reg.generateUniversalFromBrief();
    const r1 = viewAutosaveDraft(PROJECT_A);
    const r2 = viewAutosaveDraft(PROJECT_A);
    assert(r1 === 'SAVED', `simpan pertama menulis (${r1})`);
    assert(r2 === 'DEDUP', `simpan kedua di-dedupe (${r2})`);
    const rec = dp.peekPersistedDraft(PROJECT_A)!;
    assert(rec.revisionMeta.savedCount === 1, 'savedCount tetap 1');
  });

  await check('P5A-12 retry runtime: submit baru menggantikan (superseded), bukan menduplikasi', () => {
    rt.__resetExecutionRuntimeForTests();
    const first = rt.beginExecution('conv-retry', PROJECT_A);
    const second = rt.beginExecution('conv-retry', PROJECT_A);
    assert(rt.getExecution(first.record.requestId)?.superseded === true, 'eksekusi lama ditandai superseded');
    assert(first.signal.aborted === false, 'eksekusi lama TIDAK di-abort paksa');
    assert(rt.getActiveExecution('conv-retry')?.requestId === second.record.requestId, 'hanya eksekusi terbaru yang aktif');
    assert(second.isCurrent(), 'handle baru isCurrent');
    assert(!first.isCurrent(), 'handle lama tidak lagi current');
    rt.finishExecution(first.record.requestId, 'completed');
    assert(rt.getLastExecution('conv-retry')?.requestId === second.record.requestId, 'finish lama tidak menimpa latest');
    const done1 = rt.finishExecution(second.record.requestId, 'completed');
    const done2 = rt.finishExecution(second.record.requestId, 'completed');
    assert(done1?.completedAt === done2?.completedAt, 'finish idempotent (completedAt tidak berubah)');
  });

  await check('P5A-13 kunci idempotensi deterministik registry stabil untuk argumen yang sama', () => {
    const k1 = deriveIdempotencyKey('cari_ahsp', PROJECT_A, { kata_kunci: 'beton' });
    const k2 = deriveIdempotencyKey('cari_ahsp', PROJECT_A, { kata_kunci: 'beton' });
    const k3 = deriveIdempotencyKey('cari_ahsp', PROJECT_A, { kata_kunci: 'baja' });
    const k4 = deriveIdempotencyKey('cari_ahsp', PROJECT_B, { kata_kunci: 'beton' });
    assert(k1 === k2, 'kunci sama untuk argumen yang sama');
    assert(k1 !== k3, 'kunci berbeda untuk argumen berbeda');
    assert(k1 !== k4, 'kunci berbeda antar proyek');
    assert(k1.startsWith('tool:cari_ahsp:'), 'format kunci deterministik toolRegistry dipakai (tanpa skema kedua)');
  });

  // ================= (5) KEGAGALAN PERSISTENSI =================
  await check('P5A-14 storage gagal (kuota): saveIntakeContext jujur gagal, state memori utuh, tanpa throw', () => {
    resetAll();
    start('Saya punya budget Rp300 juta. Bisa buatkan RAB kandang sapi?');
    const ctxBefore = reg.getUniversalContextState()!;
    const quotaErr = new Error('QuotaExceededError: storage penuh');
    quotaErr.name = 'QuotaExceededError';
    storage.failNextSetWith(quotaErr);
    let res: ReturnType<typeof dp.saveIntakeContext> | null = null;
    let threw = false;
    try {
      res = dp.saveIntakeContext(PROJECT_A, ctxBefore);
    } catch {
      threw = true;
    }
    assert(!threw, 'save tidak melempar saat storage gagal');
    assert(res !== null && !res.ok && res.error === 'DRAFT_QUOTA_EXCEEDED', `error jujur DRAFT_QUOTA_EXCEEDED (dapat: ${JSON.stringify(res)})`);
    const ctxAfter = reg.getUniversalContextState()!;
    assert(ctxAfter === ctxBefore, 'singleton konteks memori TIDAK tersentuh kegagalan simpan');
    assert(ctxAfter.budget?.amount === 300_000_000, 'isi konteks memori utuh');
    // Sesudah storage pulih, simpan berikutnya berhasil (tanpa kehilangan state).
    const retry = dp.saveIntakeContext(PROJECT_A, ctxAfter);
    assert(retry.ok, 'simpan ulang sesudah pulih berhasil');
  });

  await check('P5A-15 storage gagal SAAT generate: draft tetap tersusun, tanpa crash', () => {
    resetAll();
    kandangSampaiBrief();
    // Gagalkan SEMUA setItem selama generate (registry save + apa pun).
    const origSet = storage.setItem.bind(storage);
    let failAll = true;
    const quotaErr = new Error('QuotaExceededError: storage penuh');
    quotaErr.name = 'QuotaExceededError';
    (storage as unknown as { setItem: (k: string, v: string) => void }).setItem = (k: string, v: string) => {
      if (failAll) throw quotaErr;
      origSet(k, v);
    };
    let gen: ReturnType<typeof reg.generateUniversalFromBrief> | null = null;
    let threw = false;
    try {
      gen = reg.generateUniversalFromBrief();
    } catch {
      threw = true;
    } finally {
      failAll = false;
      (storage as unknown as { setItem: (k: string, v: string) => void }).setItem = origSet;
    }
    assert(!threw, 'generate tidak melempar saat storage gagal');
    assert(hasPush(gen), 'draft tetap tersusun meski snapshot gagal disimpan');
    assert(rab.getLastUniversalDraft(PROJECT_A) !== null, 'draft singleton ada');
    // Snapshot tidak mendarat (jujur) — tetapi generate tidak diklaim gagal.
    assert(dp.peekIntakeContext(PROJECT_A) === null || dp.peekIntakeContext(PROJECT_A)!.generatedDraftId === null, 'tidak ada snapshot palsu yang mengklaim tautan draft');
  });

  await check('P5A-16 envelope intake korup: load gagal-cepat jujur, tanpa throw, tanpa tebak', () => {
    resetAll();
    storage.setItem(dp.AI_INTAKE_STORAGE_KEY, '{bukan-json-valid');
    let res: ReturnType<typeof dp.loadIntakeContext> | null = null;
    let threw = false;
    try {
      res = dp.loadIntakeContext(PROJECT_A);
    } catch {
      threw = true;
    }
    assert(!threw, 'load tidak melempar pada envelope korup');
    assert(res !== null && !res.ok, 'load mengembalikan ok:false (bukan konteks tebakan)');
    assert(dp.peekIntakeContext(PROJECT_A) === null, 'peek mengembalikan null pada envelope korup');
  });

  // ================= (6) EKSEKUSI TERINTERUPSI =================
  await check('P5A-17 reload saat eksekusi berjalan: tidak ada eksekusi hantu; retry dimulai bersih', () => {
    rt.__resetExecutionRuntimeForTests();
    const h = rt.beginExecution('conv-inter', PROJECT_A);
    assert(rt.getActiveExecution('conv-inter') !== null, 'eksekusi aktif sebelum reload');
    simulateReload(); // = memori runtime hilang (reload browser)
    assert(rt.getActiveExecution('conv-inter') === null, 'tidak ada eksekusi hidup sesudah reload');
    assert(rt.getLastExecution('conv-inter') === null, 'tidak ada record hantu yang mengklaim selesai');
    assert(rt.getExecution(h.record.requestId) === null, 'record lama tidak terbaca lagi');
    // Retry manual (Coba Lagi): eksekusi baru yang bersih.
    const retry = rt.beginExecution('conv-inter', PROJECT_A);
    assert(retry.record.requestId !== h.record.requestId, 'retry memakai requestId baru');
    assert(retry.record.idempotencyKey !== h.record.idempotencyKey, 'retry memakai kunci idempotensi baru (permintaan baru yang jujur)');
    assert(rt.getActiveExecution('conv-inter')?.requestId === retry.record.requestId, 'retry menjadi eksekusi aktif');
    rt.finishExecution(retry.record.requestId, 'completed');
    assert(rt.getLastExecution('conv-inter')?.status === 'completed', 'retry selesai');
  });

  await check('P5A-18 status eksekusi terbedakan: completed / failed / cancelled / interrupted', () => {
    rt.__resetExecutionRuntimeForTests();
    const ok = rt.beginExecution('conv-ok', PROJECT_A);
    rt.finishExecution(ok.record.requestId, 'completed');
    const fail = rt.beginExecution('conv-fail', PROJECT_A);
    rt.finishExecution(fail.record.requestId, 'failed', 'gateway timeout');
    const cancel = rt.beginExecution('conv-cancel', PROJECT_A);
    rt.cancelExecution(cancel.record.requestId);
    const inter = rt.beginExecution('conv-inter2', PROJECT_A);
    void inter;
    simulateReload(); // interrupted = tidak ada record hidup + pesan user tanpa balasan
    assert(rt.getLastExecution('conv-ok') === null, 'reload menghapus record completed dari runtime (status selesai hidup di riwayat percakapan, bukan runtime)');
    // Dalam satu sesi (tanpa reload), ketiga status terminal terbaca berbeda:
    rt.__resetExecutionRuntimeForTests();
    const a = rt.beginExecution('c1', PROJECT_A);
    rt.finishExecution(a.record.requestId, 'completed');
    const b = rt.beginExecution('c2', PROJECT_A);
    rt.finishExecution(b.record.requestId, 'failed', 'err');
    const c = rt.beginExecution('c3', PROJECT_A);
    rt.cancelExecution(c.record.requestId);
    assert(rt.getLastExecution('c1')?.status === 'completed', 'completed terbaca');
    assert(rt.getLastExecution('c2')?.status === 'failed', 'failed terbaca + error tercatat');
    assert(rt.getLastExecution('c2')?.error === 'err', 'pesan error failed tercatat');
    assert(rt.getLastExecution('c3')?.status === 'cancelled', 'cancelled terbaca');
    // Finish terlambat tidak mengubah cancelled (lifecycle NAV-10, ditegaskan lagi).
    rt.finishExecution(c.record.requestId, 'completed');
    assert(rt.getLastExecution('c3')?.status === 'cancelled', 'cancelled tidak menjadi completed oleh finish terlambat');
  });

  await check('P5A-19 input derivasi INTERRUPTED di store nyata: pesan user terakhir tanpa balasan', () => {
    resetAll();
    const conv = unifiedConversationStore.getOrCreateActiveConversation(PROJECT_A);
    unifiedConversationStore.appendMessage(conv.id, PROJECT_A, { role: 'user', content: 'jelaskan pondasi foot plat' });
    const afterUser = unifiedConversationStore.getOrCreateActiveConversation(PROJECT_A);
    const msgs1 = afterUser.messages ?? [];
    const last1 = msgs1[msgs1.length - 1];
    assert(last1?.role === 'user', 'pesan terakhir = user (kondisi INTERRUPTED terpenuhi bila tanpa eksekusi hidup)');
    assert(rt.getActiveExecution(conv.id) === null, 'tidak ada eksekusi hidup (sesi baru sesudah reload)');
    // Sesudah balasan asisten tiba, kondisi INTERRUPTED hilang.
    unifiedConversationStore.appendMessage(conv.id, PROJECT_A, { role: 'assistant', content: 'Foot plat adalah…' });
    const afterAsst = unifiedConversationStore.getOrCreateActiveConversation(PROJECT_A);
    const msgs2 = afterAsst.messages ?? [];
    assert(msgs2[msgs2.length - 1]?.role === 'assistant', 'sesudah balasan, pesan terakhir = assistant (bukan interrupted)');
  });

  // ================= (7) RECOVERY EKSEKUSI SELESAI =================
  await check('P5A-20 hasil selesai tidak pernah dibuang: reload → draft + snapshot + riwayat utuh', () => {
    resetAll();
    kandangSampaiBrief();
    const gen = reg.generateUniversalFromBrief();
    assert(hasPush(gen), 'draft tersusun');
    viewAutosaveDraft(PROJECT_A);
    const conv = unifiedConversationStore.getOrCreateActiveConversation(PROJECT_A);
    unifiedConversationStore.appendMessage(conv.id, PROJECT_A, { role: 'user', content: 'Susun draft RAB' });
    unifiedConversationStore.appendMessage(conv.id, PROJECT_A, { role: 'assistant', content: gen.message });
    const draftBefore = rab.getLastUniversalDraft(PROJECT_A)!;
    const totalBefore = rab.computeTotals(draftBefore);
    simulateReload();
    const ld = dp.loadDraft(PROJECT_A);
    assert(ld.ok, 'draft termuat sesudah reload');
    if (ld.ok) {
      assert(rab.computeTotals(ld.draft).grandTotal === totalBefore.grandTotal, 'total draft tidak berubah sesudah reload');
      assert(ld.draft.parts.length === draftBefore.parts.length, 'part draft utuh');
    }
    const li = dp.loadIntakeContext(PROJECT_A);
    assert(li.ok && li.generatedDraftId === draftBefore.id, 'snapshot + tautan utuh');
    const convAfter = unifiedConversationStore.getOrCreateActiveConversation(PROJECT_A);
    const lastMsg = (convAfter.messages ?? [])[(convAfter.messages ?? []).length - 1];
    assert(lastMsg?.role === 'assistant' && lastMsg.content === gen.message, 'balasan selesai tetap di riwayat (tidak dibuang diam-diam)');
  });

  await check('P5A-21 draft ter-transfer tetap ter-transfer sesudah reload', () => {
    resetAll();
    kandangSampaiBrief();
    reg.generateUniversalFromBrief();
    viewAutosaveDraft(PROJECT_A);
    const draft = rab.getLastUniversalDraft(PROJECT_A)!;
    const receipt = { projectId: PROJECT_A, version: draft.version, at: new Date().toISOString() } as unknown as NonNullable<
      typeof draft.lastTransfer
    >;
    const marked = dp.markTransferred(PROJECT_A, receipt);
    assert(marked.ok, 'markTransferred berhasil');
    simulateReload();
    const ld = dp.loadDraft(PROJECT_A);
    assert(ld.ok && ld.meta.draftStatus === 'transferred', 'status transferred pulih sesudah reload');
  });

  // ================= (8) PERUBAHAN STATE BERSAMAAN =================
  await check('P5A-22 pulih → ubah (koreksi budget) → simpan: tidak ada data yang hilang', () => {
    resetAll();
    kandangSampaiBrief();
    reg.generateUniversalFromBrief();
    viewAutosaveDraft(PROJECT_A);
    simulateReload();
    const li = dp.loadIntakeContext(PROJECT_A);
    assert(li.ok, 'snapshot termuat');
    if (li.ok) reg.restoreUniversalContext(li.ctx, PROJECT_A);
    // Giliran baru sesudah pemulihan: koreksi budget.
    const upd = reg.tryContinueUniversalContext('Ubah budget menjadi 200 juta.');
    assert(upd !== null, 'konteks pulih menerima giliran lanjutan');
    viewSaveEffect(PROJECT_A);
    const snap = dp.peekIntakeContext(PROJECT_A)!;
    const data = snap.context.data as Record<string, unknown>;
    const budget = data.budget as { amount?: number } | null;
    assert(budget?.amount === 200_000_000, 'koreksi budget tersimpan');
    const history = data.budgetHistory as Array<{ amount?: number }>;
    assert(history.some((h) => h.amount === 300_000_000), 'riwayat budget lama tetap ada');
    const q = data.questionnaire as { answers?: Record<string, unknown> };
    assert(q?.answers?.['kandang-capacity'] !== undefined, 'jawaban kuesioner lama tetap ada');
    assert(data.approvalStatus === 'APPROVED', 'status APPROVED dipertahankan');
  });

  await check('P5A-23 tulis berselang: last-write-wins, tanpa korupsi; konteks baru membersihkan tautan basi', () => {
    resetAll();
    kandangSampaiBrief();
    reg.generateUniversalFromBrief();
    const snapLinked = dp.peekIntakeContext(PROJECT_A)!;
    assert(snapLinked.generatedDraftId !== null, 'snapshot awal tertaut draft');
    // Topik baru pada proyek yang sama (alur terpandu, BELUM generate):
    // konteks baru menimpa snapshot dan TIDAK mewarisi tautan draft lama.
    start('Buatkan RAB kolam renang', PROJECT_A);
    viewSaveEffect(PROJECT_A);
    const snapNew = dp.peekIntakeContext(PROJECT_A)!;
    assert(snapNew.context.primaryId === 'kolam', 'snapshot baru = konteks topik baru (kolam)');
    assert(snapNew.context.primaryId !== snapLinked.context.primaryId, 'snapshot baru menimpa yang lama (last-write-wins)');
    assert(
      snapNew.generatedDraftId === null || snapNew.generatedDraftId === undefined,
      'konteks baru TIDAK mewarisi tautan draft konteks lama',
    );
    // Tulis berurutan dengan isi sama → dedupe (tanpa tulis ulang).
    const ctx = reg.getUniversalContextState()!;
    const w1 = dp.saveIntakeContext(PROJECT_A, ctx);
    const w2 = dp.saveIntakeContext(PROJECT_A, ctx);
    assert(w1.ok && w2.ok && w2.deduplicated === true, 'tulis identik berurutan di-dedupe');
    const loaded = dp.loadIntakeContext(PROJECT_A);
    assert(loaded.ok, 'snapshot tetap terbaca sesudah tulis berselang');
  });

  await check('P5A-24 tulis antar-proyek berselang: tidak saling menimpa', () => {
    resetAll();
    start('Saya punya budget Rp300 juta. Bisa buatkan RAB kandang sapi?', PROJECT_A);
    viewSaveEffect(PROJECT_A);
    start('Buatkan RAB proyek 2 gedung: gedung A 3 lantai 20 x 12 m dan gedung B 2 lantai 15 x 10 m, budget 500 juta', PROJECT_B);
    start('Saya punya budget Rp100 juta. Bisa buatkan RAB kandang ayam?', PROJECT_A);
    viewSaveEffect(PROJECT_A);
    const snapA = dp.peekIntakeContext(PROJECT_A);
    const snapB = dp.peekIntakeContext(PROJECT_B);
    assert(snapA !== null && snapB !== null, 'kedua snapshot ada');
    assert(snapA!.context.primaryId === 'kandang', 'snapshot A tetap kandang');
    assert((snapB!.context.data as Record<string, unknown>).buildings !== undefined, 'snapshot B tetap multi-gedung');
  });

  await check('P5A-25 topik ditinggalkan: snapshot ikut digugurkan (bukan dibangkitkan lagi saat reload)', () => {
    resetAll();
    start('Saya punya budget Rp300 juta. Bisa buatkan RAB kandang sapi?');
    viewSaveEffect(PROJECT_A);
    assert(dp.peekIntakeContext(PROJECT_A) !== null, 'snapshot ada selama intake aktif');
    // Perintah baru yang jelas menggugurkan konteks (topik lain).
    const res = reg.tryContinueUniversalContext('buatkan rab gudang 1000 m2');
    assert(res === null, 'perintah baru mengembalikan null (konteks gugur)');
    assert(reg.getUniversalContextState() === null, 'singleton digugurkan');
    assert(dp.peekIntakeContext(PROJECT_A) === null, 'snapshot tersimpan ikut digugurkan');
  });

  // ================= ASERSI SUMBER =================
  await check('S5A-01 view: efek pemulihan memakai penjaga tautan (shouldRestoreIntakeSnapshot)', () => {
    const view = read('src/ai-tools/ezrab-ai/view.tsx');
    assert(view.includes('shouldRestoreIntakeSnapshot(loaded, draftRec)'), 'efek pemulihan memanggil penjaga tautan');
    assert(view.includes('linkedToDraft'), 'efek membedakan snapshot tertaut');
    assert(view.includes('dipulihkan bersama draftnya'), 'pesan pemulihan pasca-draft ada');
  });

  await check('S5A-02 view: cabang awaitingConcept memanggil persistActiveDraft (titik commit afirmasi)', () => {
    const view = read('src/ai-tools/ezrab-ai/view.tsx');
    const branchStart = view.indexOf('if (!forcedAi && awaitingConcept) {');
    assert(branchStart > 0, 'cabang awaitingConcept ditemukan');
    const branch = view.slice(branchStart, branchStart + 1200);
    assert(branch.includes("persistActiveDraft('autosave')"), 'cabang awaitingConcept meng-autosave draft');
  });

  await check('S5A-03 registry: generate menyimpan snapshot SEBELUM membersihkan singleton', () => {
    const regSrc = read('src/ai-tools/ezrab-ai/actionRegistry.ts');
    const fnStart = regSrc.indexOf('function generateFromUniversalContext');
    assert(fnStart > 0, 'generateFromUniversalContext ditemukan');
    const fn = regSrc.slice(fnStart, fnStart + 4500);
    const saveIdx = fn.indexOf('persistIntakeSnapshotNow(ctx');
    const clearIdx = fn.indexOf('universalCtx = null;');
    assert(saveIdx > 0, 'generate memanggil persistIntakeSnapshotNow');
    assert(clearIdx > saveIdx, 'simpan terjadi SEBELUM pembersihan singleton');
    assert(fn.includes('getLastUniversalDraft()?.id'), 'tautan draft dibaca dari singleton draft');
  });

  await check('S5A-04 registry: gerbang mencap projectId + menyimpan snapshot jalur cepat', () => {
    const regSrc = read('src/ai-tools/ezrab-ai/actionRegistry.ts');
    const gateStart = regSrc.indexOf('export function universalIntakeGate');
    assert(gateStart > 0, 'universalIntakeGate ditemukan');
    const gate = regSrc.slice(gateStart, gateStart + 6000);
    assert(gate.includes('projectId?: string | null'), 'gerbang menerima projectId');
    assert(gate.includes('ctx.projectId = projectId'), 'gerbang mencap konteks dengan projectId');
    assert(gate.includes('persistIntakeSnapshotNow(ctx)'), 'gerbang menyimpan snapshot jalur cepat');
    assert(regSrc.includes("universalIntakeGate(rawSummary, false, ctx.activeProject?.id ?? null)"), 'CREATE_RAB_SUMMARY meneruskan projectId ke gerbang');
  });

  await check('S5A-05 view: kunci idempotensi runtime diteruskan ke service.send', () => {
    const view = read('src/ai-tools/ezrab-ai/view.tsx');
    assert(view.includes('idempotencyKey: llmExec.record.idempotencyKey'), 'send memakai kunci runtime (satu kunci per pengiriman)');
  });

  await check('S5A-06 snapshot TIDAK memuat secret/token/kredensial', () => {
    resetAll();
    kandangSampaiBrief();
    reg.generateUniversalFromBrief();
    const raw = storage.getItem(dp.AI_INTAKE_STORAGE_KEY) ?? '';
    const lower = raw.toLowerCase();
    for (const needle of ['"token"', '"secret"', '"password"', '"api_key"', '"apikey"', '"credential"', '"authorization"']) {
      assert(!lower.includes(needle), `snapshot tidak memuat kunci ${needle}`);
    }
    assert(raw.length > 0, 'snapshot ada untuk diperiksa');
  });

  // S5A-07 (E2E Gate 1, temuan browser) — view meneruskan effProject
  // (proyek aktif nyata = currentProject ?? prop) sebagai activeProject
  // di SEMUA ChatActionContext untuk executeIntent. Prop mentah null
  // pada mount yang mengandalkan currentProject → registry menerima
  // null → gerbang tidak menyimpan snapshot (A3/A4/A5 GAGAL di E2E).
  await check('S5A-07 view: activeProject di semua konteks registry = effProject', () => {
    const view = read('src/ai-tools/ezrab-ai/view.tsx');
    const sites = view.match(/activeProject: effProject,/g) ?? [];
    assert(sites.length >= 9, `situs activeProject: effProject = ${sites.length}, harapkan >= 9`);
    assert(!/^\s+activeProject,$/m.test(view), 'masih ada shorthand activeProject mentah di view.tsx');
  });

  // S5A-08 (E2E Gate 1, temuan browser) — derivasi INTERRUPTED dibaca
  // dari riwayat TERSIMPAN (store), bukan state pesan: catatan pemulihan
  // efemeral (draft/intake) tidak boleh menutupi prompt yang terputus
  // (banner D1 tidak tampil di E2E karena catatan menjadi "pesan
  // terakhir" di state).
  await check('S5A-08 view: derivasi INTERRUPTED dari store, bukan state pesan', () => {
    const view = read('src/ai-tools/ezrab-ai/view.tsx');
    assert(view.includes('getOrCreateActiveConversation(storeProjectId)'), 'derivasi INTERRUPTED tidak membaca store');
    assert(view.includes("lastStored.role === 'user'"), 'derivasi tidak memeriksa peran pesan tersimpan terakhir');
    const deriv = view.slice(view.indexOf('Penanda INTERRUPTED'));
    assert(!deriv.slice(0, 2400).includes('messages[messages.length - 1]'), 'derivasi masih memakai messages[] terakhir');
  });

  resetAll();
  rt.__resetExecutionRuntimeForTests();
  console.log(`\nchatPhase5Persistence: ${passed} passed, ${failed} failed${failures.length ? ` — GAGAL: ${failures.join(', ')}` : ''}`);
  if (failed > 0) process.exit(1);
}

void main();
