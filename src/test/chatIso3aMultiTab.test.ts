/**
 * chatIso3aMultiTab.test.ts — S3-A (Stage 3, 2026-11-23): konkurensi
 * multi-tab snapshot intake — revision guard per-proyek
 * (expectedUpdatedAt) + refresh + pesan jujur.
 *
 * Gaya plain-tsx: `npx --yes tsx src/test/chatIso3aMultiTab.test.ts`
 *
 * Yang diuji lewat JALUR NYATA (registry + draftPersistence):
 * - Guard tulis intake/home-state: saveIntakeContext/saveHomeState
 *   dengan baseline basi → INTAKE_VERSION_CONFLICT /
 *   HOME_STATE_VERSION_CONFLICT; tulisan basi TIDAK menimpa.
 * - Guard hapus: clearIntakeContext/clearHomeState dengan baseline
 *   basi → ditahan (false); drop dari tab basi tidak menghapus
 *   snapshot baru tab lain (outcome takeIntakeDropOutcome).
 * - Penanganan konflik view: topik sama → refresh + pesan; topik
 *   berbeda (divergen) → jangan adopsi, jangan tulis, pesan sekali.
 * - Refresh lintas-tab (listener): tab idle mengadopsi snapshot
 *   terbaru; singleton kosong diadopsi diam-diam.
 * - Penjaga P6b/P6c persistActiveDraft: baseline null + record ada
 *   → jangan simpan (kecuali isi identik → adopsi baseline).
 * - Dedupe + self-heal baseline: isi identik + baseline basi →
 *   sukses dedupe + baseline maju (tanpa konflik palsu).
 * - Perilaku yang DIPERTAHANKAN: dua tab proyek berbeda (P1),
 *   switch-kembali memulihkan terbaru (P5), drop same-project yang
 *   sah, restore satu-tab + dedupe.
 *
 * MODEL DUA TAB: satu instance registry (tab A, "tab yang diuji") +
 * "external writer" (tab B dimodelkan lewat pemanggilan langsung
 * draftPersistence dengan baseline-nya sendiri — yang penting dari
 * tab lain adalah TULISANNYA ke storage bersama, bukan singletonnya;
 * merge jawaban tab B dimodelkan dengan memuat snapshot lalu
 * mengubah medan jawaban — setara di lapisan persistensi dengan
 * merge registry, yang sudah dipin suite lain). Independensi dua
 * singleton (P0) DIBUKTIKAN probe baseline (probe-s3a-multitab.ts,
 * trik impor ?tab=A/?tab=B) dan TIDAK diulang di sini: trik impor
 * query tidak dipakai di dalam src/test/ agar tsc fase verifikasi
 * tidak memecahkan resolusi modul.
 *
 * BATAS UJI (jujur): efek-efek React view dimodelkan sebagai fungsi
 * murni yang MENIRU view.tsx baris-per-baris (pola yang sama dengan
 * chatIso5SnapshotPreservation.test.ts) — React asli tidak berjalan
 * di tsx polos; urutan commit efek sesungguhnya + storage event
 * browser nyata menjadi tugas verifikator UI (skenario browser di
 * laporan S3A-IMPLEMENTATION-REPORT.md). Interleave antar-proses
 * nyata (P4) tidak dapat dieksekusi satu utas — yang diuji adalah
 * mitigasi level API (guard + refresh + retry).
 */

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

/* ---------- localStorage shim (node — pola chatPhase5Persistence) ---------- */
function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => { map.set(k, String(v)); },
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() { return map.size; },
  };
}
const storage = makeStorage();
(globalThis as Record<string, unknown>).localStorage = storage;

const P = 'PRJ-S3A-P';
const PA = 'PRJ-S3A-A';
const PB = 'PRJ-S3A-B';
const Q = 'PRJ-S3A-Q';
const JALAN_TEXT = 'Buatkan RAB jalan beton sepanjang 2 km';
const KANDANG_TEXT = 'Saya punya budget Rp300 juta. Bisa buatkan RAB kandang sapi?';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  console.log('chatIso3aMultiTab.test (S3-A multi-tab intake concurrency)');
  const reg = await import('../ai-tools/ezrab-ai/actionRegistry');
  const dp = await import('../ai-tools/ezrab-ai/draftPersistence');
  const ur = await import('../ai-tools/ezrab-ai/universalRab');
  const { routeIntent } = await import('../ai-tools/ezrab-ai/intentRouter');

  /* ---------- State view tab A yang dimodelkan (cermin useRef) ----------
   * Baseline intake TIDAK disimpan di model view: view ASLI membaca
   * baseline segar dari peta registry (getLastSeenIntakeVersion) —
   * satu-satunya sumber kebenaran per tab — dan mencatat tiap
   * simpan/bacanya ke sana (lihat dok getter di actionRegistry.ts).
   * Model di bawah meniru persis perilaku itu. */
  interface TabView {
    homeRef: string | null;
    draftRef: string | null;
    restored: Set<string>;
    homeRestored: Set<string>;
    awaiting: boolean;
    warned: Set<string>;
    messages: string[];
  }
  const freshView = (): TabView => ({
    homeRef: null,
    draftRef: null,
    restored: new Set(),
    homeRestored: new Set(),
    awaiting: false,
    warned: new Set(),
    messages: [],
  });

  const mockCtx = (projectId: string | null, rawText = '') =>
    ({
      navigate: () => undefined,
      currentMenu: 'ezrab-ai',
      activeProject: projectId ? { id: projectId, name: `Proyek ${projectId}` } : null,
      projects: [],
      projectTotal: 0,
      projectItems: null,
      rawText,
    }) as unknown as Parameters<typeof reg.executeIntent>[2];

  const submit = (text: string, projectId: string | null) => {
    const routed = routeIntent(text);
    const res = reg.executeIntent(routed.intent, routed.param, { ...mockCtx(projectId), rawText: text });
    return { routed, res };
  };

  /* Tiruan setia cabang submit awaitingConcept view.tsx (Tier 1). */
  const viewSubmitAwaiting = (tv: TabView, text: string, effProjectId: string) => {
    if (!tv.awaiting) return 'SKIP (awaitingConcept false)';
    const liveIntake = reg.getUniversalContextState();
    const foreignIntake = !!liveIntake?.projectId && liveIntake.projectId !== effProjectId;
    const projRes = reg.tryContinueProjectContext(text);
    const ctxRes = projRes ?? (foreignIntake ? null : reg.tryContinueUniversalContext(text));
    if (ctxRes) return 'MERGED (lanjut intake)';
    return foreignIntake ? 'SKIP-TRYCONTINUE (Tier 1)' : 'NULL (perintah baru: DROP + singleton=null, atau bukan lanjutan)';
  };

  /* Tiruan setia penanganan konflik simpan intake view.tsx
   * (handleIntakeSaveConflict): topik sama → refresh; divergen → tahan. */
  const handleIntakeSaveConflict = (tv: TabView, projectId: string, localCtx: NonNullable<ReturnType<typeof reg.getUniversalContextState>>): string => {
    const loaded = dp.loadIntakeContext(projectId);
    if (!loaded.ok) {
      const key = `${projectId}:unreadable:${reg.getLastSeenIntakeVersion(projectId) ?? 'null'}`;
      if (!tv.warned.has(key)) {
        tv.warned.add(key);
        tv.messages.push('KONFLIK-TAK-TERBACA');
      }
      return 'CONFLICT-UNREADABLE';
    }
    if (localCtx.primary?.id !== loaded.ctx.primary?.id) {
      const key = `${projectId}:${loaded.updatedAt}:divergent`;
      if (!tv.warned.has(key)) {
        tv.warned.add(key);
        tv.messages.push(`DIVERGEN: tab lain intake ${loaded.ctx.primary?.id ?? '?'} — intake tab ini belum tersimpan`);
      }
      return 'CONFLICT-DIVERGENT (lokal dipertahankan, baseline TIDAK maju)';
    }
    reg.noteIntakeSnapshotVersion(projectId, loaded.updatedAt);
    reg.restoreUniversalContext(loaded.ctx, projectId);
    if (!loaded.generatedDraftId) tv.awaiting = true;
    const key = `${projectId}:${loaded.updatedAt}:refreshed`;
    if (!tv.warned.has(key)) {
      tv.warned.add(key);
      tv.messages.push('REFRESH: konteks diperbarui dari tab lain — jawaban terakhir belum tersimpan');
    }
    return 'CONFLICT-REFRESHED';
  };

  /* Tiruan setia efek simpan intake view.tsx (baseline + drain outcome). */
  const viewSaveEffect = (tv: TabView, effProjectId: string): string => {
    const drop = reg.takeIntakeDropOutcome();
    if (drop && drop.projectId === effProjectId) tv.messages.push('DROP-DITAHAN: snapshot dipertahankan');
    const pc = reg.takeIntakePersistConflict();
    if (pc && pc.projectId === effProjectId) tv.messages.push('PERSIST-KONFLIK: snapshot tidak tersimpan');
    const ictx = reg.getUniversalContextState();
    if (!ictx) return 'SKIP (singleton null)';
    if (ictx.projectId && ictx.projectId !== effProjectId) return 'SKIP (penjaga F-ISO-1)';
    const res = dp.saveIntakeContext(effProjectId, ictx, undefined, { expectedUpdatedAt: reg.getLastSeenIntakeVersion(effProjectId) });
    if (res.ok) {
      reg.noteIntakeSnapshotVersion(effProjectId, res.updatedAt);
      return res.deduplicated ? 'DEDUP (isi sama, tanpa tulis)' : `SAVED updatedAt=${res.updatedAt}`;
    }
    if (res.error === 'INTAKE_VERSION_CONFLICT') return handleIntakeSaveConflict(tv, effProjectId, ictx);
    return `FAIL ${res.error}`;
  };

  /* Tiruan setia efek pulih intake view.tsx (last-seen di semua baca). */
  const viewRestoreEffect = (tv: TabView, effProjectId: string): string => {
    if (reg.getUniversalContextState()) return 'SKIP (singleton non-null)';
    if (tv.restored.has(effProjectId)) return 'SKIP (intakeRestoredForRef sudah pernah pulih)';
    tv.restored.add(effProjectId);
    const loaded = dp.loadIntakeContext(effProjectId);
    if (!loaded.ok) return `SKIP (load gagal: ${loaded.error})`;
    reg.noteIntakeSnapshotVersion(effProjectId, loaded.updatedAt);
    const draftRec = dp.peekPersistedDraft(effProjectId);
    if (!dp.shouldRestoreIntakeSnapshot(loaded, draftRec)) return 'SKIP (shouldRestore menolak — last-seen TERCATAT)';
    reg.restoreUniversalContext(loaded.ctx, effProjectId);
    if (!loaded.generatedDraftId) tv.awaiting = true;
    return `RESTORED primary=${loaded.ctx.primary?.id ?? null} widthM=${loaded.ctx.widthM ?? null} updatedAt=${loaded.updatedAt}`;
  };

  /* Tiruan setia refresh lintas-tab view.tsx (refreshIntakeFromExternal). */
  const viewListenerRefresh = (tv: TabView, projectId: string): string => {
    const loaded = dp.loadIntakeContext(projectId);
    if (!loaded.ok) return 'SKIP (load gagal)';
    if (loaded.updatedAt === reg.getLastSeenIntakeVersion(projectId)) return 'SKIP (sudah terbaru)';
    const local = reg.getUniversalContextState();
    if (local?.projectId && local.projectId !== projectId) return 'SKIP (singleton asing)';
    if (local && local.primary?.id !== loaded.ctx.primary?.id) return 'SKIP (divergen — jalur konflik yang memiliki)';
    reg.noteIntakeSnapshotVersion(projectId, loaded.updatedAt);
    reg.restoreUniversalContext(loaded.ctx, projectId);
    if (!loaded.generatedDraftId) tv.awaiting = true;
    if (!local) return 'REFRESHED (silent, singleton kosong)';
    const key = `${projectId}:${loaded.updatedAt}:ext`;
    if (!tv.warned.has(key)) {
      tv.warned.add(key);
      tv.messages.push('REFRESH-EXT: konteks diperbarui dari tab lain');
    }
    return 'REFRESHED + pesan';
  };

  /* Tiruan setia efek Tier 2 view.tsx (ganti proyek). */
  const viewTier2Switch = (tv: TabView, prevId: string): string => {
    const ictx = reg.getUniversalContextState();
    if (!ictx || !ictx.projectId || ictx.projectId !== prevId) return 'NO-OP (singleton bukan milik proyek lama)';
    reg.clearUniversalContext();
    tv.awaiting = false;
    tv.restored.delete(prevId);
    return 'CLEARED singleton proyek lama + ref pulih dihapus';
  };

  /* Tiruan setia persistActiveDraft view.tsx (penjaga P6b/P6c S3-A).
   * Draft diteruskan eksplisit (bukan lewat singleton universalRab)
   * karena singleton itu modul-bersama di tsx — penjaga yang diuji
   * (peek + loadDraft + sidik + tolak/adopsi) adalah kode yang sama
   * persis sesudah baris getLastUniversalDraft. */
  const viewPersistDraft = (tv: TabView, projectId: string, draft: Parameters<typeof dp.saveDraft>[0]['draft']): string => {
    if (tv.draftRef === null) {
      const existing = dp.peekPersistedDraft(projectId);
      if (existing) {
        const loaded = dp.loadDraft(projectId);
        if (
          loaded.ok &&
          loaded.draft.id === draft.id &&
          dp.draftFingerprint(loaded.draft) === dp.draftFingerprint(draft)
        ) {
          tv.draftRef = loaded.meta.updatedAt;
        } else {
          const warnKey = `${draft.id}:${draft.version}:DRAFT_BASELINE_UNKNOWN:${existing.updatedAt}`;
          if (!tv.warned.has(warnKey)) {
            tv.warned.add(warnKey);
            tv.messages.push('DRAFT-DITAHAN: record ada, baseline null — jangan timpa');
          }
          return 'REFUSED (baseline null + record ada)';
        }
      }
    }
    const res = dp.saveDraft({ draft, projectId, expectedUpdatedAt: tv.draftRef });
    if (res.ok) {
      tv.draftRef = res.updatedAt;
      return res.deduplicated ? 'DEDUP' : `SAVED updatedAt=${res.updatedAt}`;
    }
    return `FAIL ${res.error}`;
  };

  /* ---------- "Tab lain" (external writer): tulis langsung ke storage
   * bersama dengan baseline-nya sendiri — model setia tab browser
   * kedua di lapisan persistensi. ---------- */
  interface ExtWriter {
    intakeRef: string | null;
    homeRef: string | null;
  }
  const freshExt = (): ExtWriter => ({ intakeRef: null, homeRef: null });
  const extSaveIntake = (w: ExtWriter, projectId: string, ctx: Parameters<typeof dp.saveIntakeContext>[1]) => {
    const res = dp.saveIntakeContext(projectId, ctx, undefined, { expectedUpdatedAt: w.intakeRef });
    if (res.ok) w.intakeRef = res.updatedAt;
    return res;
  };
  const extLoadIntake = (w: ExtWriter, projectId: string) => {
    const loaded = dp.loadIntakeContext(projectId);
    if (loaded.ok) w.intakeRef = loaded.updatedAt;
    return loaded;
  };

  const snap = (pid: string) => {
    const rec = dp.peekIntakeContext(pid);
    if (!rec) return null;
    const d = rec.context.data as Record<string, unknown>;
    return {
      primaryId: rec.context.primaryId,
      widthM: (d as Record<string, unknown>).widthM ?? null,
      budgetAmount: ((d as Record<string, unknown>).budget as Record<string, unknown> | undefined)?.amount ?? null,
      updatedAt: rec.updatedAt,
      generatedDraftId: rec.generatedDraftId ?? null,
    };
  };
  const sing = () => {
    const s = reg.getUniversalContextState();
    return s ? { primary: s.primary?.id ?? null, projectId: s.projectId ?? null, widthM: s.widthM ?? null, budget: s.budget?.amount ?? null } : null;
  };

  const reset = () => {
    storage.clear();
    reg.clearUniversalContext();
    reg.setLastRabNeeds(null);
    reg.setPendingRabChoice(null);
    ur.setLastUniversalDraft(null);
    // Kosongkan outcome registry sekali-pakai yang mungkin tersisa.
    reg.takeIntakeDropOutcome();
    reg.takeIntakePersistConflict();
  };

  // ================= S3A-01: dua tab, proyek BERBEDA (P1 — tetap aman) =================
  await check('S3A-01 dua tab proyek berbeda: isolasi per-project key utuh', async () => {
    reset();
    const tv = freshView();
    const ext = freshExt();
    submit(JALAN_TEXT, PA);
    tv.awaiting = true;
    assert(viewSaveEffect(tv, PA).startsWith('SAVED'), 'tab A simpan PA');
    await sleep(2);
    // Tab B (external): intake kandang di PB — bangun ctx lewat registry
    // tidak mungkin (singleton dipakai A), jadi tulis record PB lewat
    // API dengan ctx kandang hasil submit terpisah (teks submit yang
    // terbukti di probe baseline P1).
    submit('Buatkan RAB kandang sapi untuk 20 ekor', PB); // NOTE: singleton A tertimpa — simpan PB lalu pulihkan A
    const kandangCtx = reg.getUniversalContextState();
    assert(kandangCtx !== null, 'ctx kandang terbentuk');
    const rB = extSaveIntake(ext, PB, kandangCtx as NonNullable<typeof kandangCtx>);
    assert(rB.ok, `tab B simpan PB: ${JSON.stringify(rB)}`);
    // Pulihkan singleton A dari snapshot PA (model restore tab A).
    reg.clearUniversalContext();
    const back = viewRestoreEffect(tv, PA);
    assert(back.startsWith('RESTORED'), `tab A pulih PA: ${back}`);
    await sleep(2);
    const resave = viewSaveEffect(tv, PA);
    assert(resave.startsWith('DEDUP') || resave.startsWith('SAVED'), `tab A simpan ulang PA tanpa konflik: ${resave}`);
    const sA = snap(PA);
    const sB = snap(PB);
    assert(sA?.primaryId === 'jalan-beton', `snapshot PA jalan-beton, dapat ${JSON.stringify(sA)}`);
    assert(sB !== null && sB.primaryId !== 'jalan-beton', `snapshot PB bukan jalan-beton, dapat ${JSON.stringify(sB)}`);
    assert(tv.messages.length === 0, `tanpa pesan konflik lintas-proyek, dapat ${JSON.stringify(tv.messages)}`);
  });

  // ================= S3A-02: stale write proyek sama DITOLAK + refresh (P2) =================
  await check('S3A-02 dua tab proyek sama: jawaban tab aktif TIDAK hilang (stale write ditolak, refresh)', async () => {
    reset();
    const tv = freshView();
    const ext = freshExt();
    submit(JALAN_TEXT, P);
    tv.awaiting = true;
    assert(viewSaveEffect(tv, P).startsWith('SAVED'), 'tab A simpan v1');
    await sleep(2);
    // Tab B: restore v1 → jawab "Lebar: 6 m" → simpan v2.
    const loadedB = extLoadIntake(ext, P);
    assert(loadedB.ok, 'tab B memuat v1');
    if (loadedB.ok) {
      loadedB.ctx.widthM = 6;
      const rB = extSaveIntake(ext, P, loadedB.ctx);
      assert(rB.ok, `tab B simpan v2: ${JSON.stringify(rB)}`);
    }
    assert(snap(P)?.widthM === 6, 'snapshot v2 widthM=6');
    await sleep(2);
    // Tab A (singleton MASIH v1): jawab "Budget Rp300 juta" → simpan.
    assert(viewSubmitAwaiting(tv, 'Budget Rp300 juta', P) === 'MERGED (lanjut intake)', 'tab A merge budget ke v1');
    const saveA = viewSaveEffect(tv, P);
    assert(saveA === 'CONFLICT-REFRESHED', `simpan basi tab A harus KONFLIK + refresh, dapat ${saveA}`);
    const final = snap(P);
    assert(final?.widthM === 6, `jawaban tab B (lebar 6 m) SELAMAT, dapat ${JSON.stringify(final)}`);
    assert(sing()?.widthM === 6, 'singleton tab A kini v2 (refresh)');
    assert(tv.messages.some((m) => m.startsWith('REFRESH:')), `pesan refresh diposting, dapat ${JSON.stringify(tv.messages)}`);
    // Simpan berikutnya (sesudah refresh) sukses — baseline sudah maju.
    // (DEDUP bila rehidrasi byte-identik, SAVED bila ada drift
    // rehidrasi — yang dipin adalah "tanpa konflik", bukan dedupe.)
    await sleep(2);
    const postRefresh = viewSaveEffect(tv, P);
    assert(postRefresh.startsWith('DEDUP') || postRefresh.startsWith('SAVED'), `simpan pasca-refresh tanpa konflik: ${postRefresh}`);
  });

  // ================= S3A-03: guard API saveIntakeContext =================
  await check('S3A-03 guard API: saveIntakeContext baseline basi → INTAKE_VERSION_CONFLICT; baseline cocok → ok', async () => {
    reset();
    const tv = freshView();
    submit(JALAN_TEXT, P);
    tv.awaiting = true;
    assert(viewSaveEffect(tv, P).startsWith('SAVED'), 'simpan v1');
    const t1 = reg.getLastSeenIntakeVersion(P) as string;
    await sleep(2);
    const loaded = dp.loadIntakeContext(P);
    assert(loaded.ok, 'load v1');
    if (loaded.ok) {
      loaded.ctx.widthM = 6;
      const r2 = dp.saveIntakeContext(P, loaded.ctx, undefined, { expectedUpdatedAt: t1 });
      assert(r2.ok, `simpan v2 dengan baseline T1: ${JSON.stringify(r2)}`);
    }
    const t2 = snap(P)?.updatedAt as string;
    assert(t2 !== t1, 'updatedAt berubah v1→v2');
    // Tulis basi dengan baseline T1 + isi BERBEDA → konflik.
    const stale = dp.loadIntakeContext(P);
    assert(stale.ok, 'load v2 untuk salinan basi');
    if (stale.ok) {
      stale.ctx.widthM = 9;
      const rStale = dp.saveIntakeContext(P, stale.ctx, undefined, { expectedUpdatedAt: t1 });
      assert(!rStale.ok && rStale.error === 'INTAKE_VERSION_CONFLICT', `tulis basi harus konflik, dapat ${JSON.stringify(rStale)}`);
    }
    assert(snap(P)?.widthM === 6, 'snapshot tetap v2 (widthM=6)');
    // Baseline cocok (T2) → tulis diizinkan.
    const fresh = dp.loadIntakeContext(P);
    if (fresh.ok) {
      fresh.ctx.widthM = 7;
      const rFresh = dp.saveIntakeContext(P, fresh.ctx, undefined, { expectedUpdatedAt: t2 });
      assert(rFresh.ok, `tulis baseline cocok harus ok: ${JSON.stringify(rFresh)}`);
    }
    assert(snap(P)?.widthM === 7, 'snapshot kini widthM=7');
    // Tanpa baseline (null) → perilaku lama (kompatibel pemanggil lama).
    const legacy = dp.loadIntakeContext(P);
    if (legacy.ok) {
      legacy.ctx.widthM = 8;
      const rLegacy = dp.saveIntakeContext(P, legacy.ctx);
      assert(rLegacy.ok, `tulis tanpa baseline tetap ok (legacy): ${JSON.stringify(rLegacy)}`);
    }
    assert(snap(P)?.widthM === 8, 'snapshot kini widthM=8');
  });

  // ================= S3A-04: stale delete DITAHAN (P3) =================
  await check('S3A-04 stale delete: cancel/perintah-baru tab basi TIDAK menghapus snapshot baru tab lain', async () => {
    reset();
    const tv = freshView();
    const ext = freshExt();
    submit(JALAN_TEXT, P);
    tv.awaiting = true;
    assert(viewSaveEffect(tv, P).startsWith('SAVED'), 'tab A simpan v1');
    await sleep(2);
    const loadedB = extLoadIntake(ext, P);
    assert(loadedB.ok, 'tab B memuat v1');
    if (loadedB.ok) {
      loadedB.ctx.widthM = 6;
      assert(extSaveIntake(ext, P, loadedB.ctx).ok, 'tab B simpan v2');
    }
    assert(snap(P)?.widthM === 6, 'snapshot v2 ada');
    await sleep(2);
    // Tab A (stale v1) kirim perintah baru → cabang drop registry.
    const dropRes = viewSubmitAwaiting(tv, KANDANG_TEXT, P);
    assert(dropRes.startsWith('NULL'), `perintah baru tab A memicu drop: ${dropRes}`);
    assert(sing() === null, 'singleton lokal tab A dibersihkan (niat pengguna dihormati)');
    const after = snap(P);
    assert(after !== null && after.widthM === 6, `snapshot v2 tab B SELAMAT dari drop basi, dapat ${JSON.stringify(after)}`);
    // Outcome dicatat + dikuras efek simpan menjadi pesan jujur.
    const outcome = reg.takeIntakeDropOutcome();
    assert(outcome !== null && outcome.projectId === P && outcome.held === true, `outcome drop-ditahan tercatat, dapat ${JSON.stringify(outcome)}`);
    assert(reg.takeIntakeDropOutcome() === null, 'outcome sekali-pakai (consume-once)');
  });

  // ================= S3A-05: cancel same-tab yang sah TETAP menghapus =================
  await check('S3A-05 cancel eksplisit satu-tab: drop dengan baseline cocok TETAP menghapus snapshot', async () => {
    reset();
    const tv = freshView();
    submit(JALAN_TEXT, P);
    tv.awaiting = true;
    assert(viewSaveEffect(tv, P).startsWith('SAVED'), 'simpan v1');
    assert(snap(P) !== null, 'snapshot ada');
    await sleep(2);
    const dropRes = viewSubmitAwaiting(tv, KANDANG_TEXT, P);
    assert(dropRes.startsWith('NULL'), `perintah baru memicu drop: ${dropRes}`);
    assert(snap(P) === null, 'snapshot TERHAPUS (drop sah, baseline cocok)');
    assert(reg.takeIntakeDropOutcome() === null, 'tanpa outcome ditahan untuk drop sah');
    // Simpan intake baru sesudah drop: tanpa record → tanpa guard → ok.
    submit(KANDANG_TEXT, P);
    tv.awaiting = true;
    assert(viewSaveEffect(tv, P).startsWith('SAVED'), 'intake baru tersimpan sesudah drop');
    assert(snap(P)?.primaryId !== 'jalan-beton', 'snapshot baru adalah kandang');
  });

  // ================= S3A-06: concurrent update — konflik lalu retry sukses =================
  await check('S3A-06 concurrent update: tulis kedua konflik → refresh → tulis ulang sukses; kunci peta utuh', async () => {
    reset();
    const tv = freshView();
    const ext = freshExt();
    submit(JALAN_TEXT, P);
    tv.awaiting = true;
    assert(viewSaveEffect(tv, P).startsWith('SAVED'), 'tab A simpan v1 P');
    // Jeda WAJIB: guard berbasis updatedAt resolusi milidetik — dua
    // tulis dalam ms yang sama tak terbedakan (keterbatasan yang sama
    // dengan guard draft yang sudah ada).
    await sleep(2);
    // Tab B menulis proyek LAIN (PA) berjalin — kunci P tidak hilang (P4 API-level).
    const loadedB = extLoadIntake(ext, P);
    assert(loadedB.ok, 'tab B memuat v1 P');
    if (loadedB.ok) {
      loadedB.ctx.widthM = 6;
      assert(extSaveIntake(ext, P, loadedB.ctx).ok, 'tab B simpan v2 P');
    }
    // Tab A juga punya snapshot PA (tulis berjalin antar-proyek).
    const ctxPA = { ...reg.getUniversalContextState(), projectId: PA } as NonNullable<ReturnType<typeof reg.getUniversalContextState>>;
    const rPA = dp.saveIntakeContext(PA, ctxPA);
    assert(rPA.ok, `simpan PA berjalin: ${JSON.stringify(rPA)}`);
    await sleep(2);
    // Tab A tulis basi ke P → konflik → refresh → jawab ulang → simpan sukses.
    assert(viewSubmitAwaiting(tv, 'Budget Rp300 juta', P) === 'MERGED (lanjut intake)', 'tab A merge budget');
    assert(viewSaveEffect(tv, P) === 'CONFLICT-REFRESHED', 'tulis basi konflik + refresh');
    assert(viewSubmitAwaiting(tv, 'Budget Rp300 juta', P) === 'MERGED (lanjut intake)', 'tab A mengulang jawaban sesudah refresh');
    await sleep(2);
    const retry = viewSaveEffect(tv, P);
    assert(retry.startsWith('SAVED'), `tulis ulang sesudah refresh sukses: ${retry}`);
    const final = snap(P);
    assert(final?.widthM === 6, `lebar tab B selamat: ${JSON.stringify(final)}`);
    assert(final?.budgetAmount === 300000000, `budget tab A (diulang) tersimpan: ${JSON.stringify(final)}`);
    assert(snap(PA) !== null, 'kunci PA selamat (tidak ada kunci peta hilang)');
  });

  // ================= S3A-07: listener refresh (P8) =================
  await check('S3A-07 tab idle me-refresh: listener mengadopsi snapshot terbaru + pesan (P8 tertutup)', async () => {
    reset();
    const tv = freshView();
    const ext = freshExt();
    submit(JALAN_TEXT, P);
    tv.awaiting = true;
    assert(viewSaveEffect(tv, P).startsWith('SAVED'), 'tab A simpan v1');
    await sleep(2);
    const loadedB = extLoadIntake(ext, P);
    if (loadedB.ok) {
      loadedB.ctx.widthM = 6;
      assert(extSaveIntake(ext, P, loadedB.ctx).ok, 'tab B simpan v2');
    }
    assert(sing()?.widthM !== 6, 'singleton tab A masih v1 sebelum refresh');
    const r = viewListenerRefresh(tv, P);
    assert(r === 'REFRESHED + pesan', `listener refresh: ${r}`);
    assert(sing()?.widthM === 6, 'singleton tab A kini v2');
    assert(reg.getLastSeenIntakeVersion(P) === snap(P)?.updatedAt, 'baseline tab A maju ke v2');
    assert(tv.messages.some((m) => m.startsWith('REFRESH-EXT:')), 'pesan refresh diposting');
    // Refresh kedua (tidak ada perubahan) = no-op, tanpa pesan ganda.
    const r2 = viewListenerRefresh(tv, P);
    assert(r2 === 'SKIP (sudah terbaru)', `refresh kedua no-op: ${r2}`);
    assert(tv.messages.filter((m) => m.startsWith('REFRESH-EXT:')).length === 1, 'pesan refresh hanya sekali');
  });

  // ================= S3A-08: intake divergen — jangan adopsi, jangan tulis =================
  await check('S3A-08 intake divergen: konflik topik-beda TIDAK me-refresh dan TIDAK menimpa', async () => {
    reset();
    const tv = freshView();
    const ext = freshExt();
    // Tab B lebih dulu: intake kandang di P, simpan v1-kandang.
    submit('Buatkan RAB kandang sapi untuk 20 ekor', P);
    const kandangCtx = reg.getUniversalContextState();
    assert(kandangCtx !== null, 'ctx kandang terbentuk');
    const rB = extSaveIntake(ext, P, kandangCtx as NonNullable<typeof kandangCtx>);
    assert(rB.ok, 'tab B simpan kandang v1');
    // Tab A: TIDAK PERNAH memuat (baseline null) — mulai intake jalan.
    // (Baseline null + record ada: simpan pertama TANPA guard di lapisan
    // API — tetapi tab A yang "sudah membaca" v0 lalu tab B maju adalah
    // kasus konfliknya; di sini tab A membaca snapshot LAMA dulu.)
    reg.clearUniversalContext();
    const loadedA = dp.loadIntakeContext(P);
    assert(loadedA.ok, 'tab A memuat snapshot kandang (last-seen v1)');
    if (loadedA.ok) {
      reg.noteIntakeSnapshotVersion(P, loadedA.updatedAt);
    }
    await sleep(2);
    // Tab B maju: kandang v2 (lebar kandang 6 m — medan widthM dipakai).
    const loadedB2 = extLoadIntake(ext, P);
    if (loadedB2.ok) {
      loadedB2.ctx.widthM = 6;
      assert(extSaveIntake(ext, P, loadedB2.ctx).ok, 'tab B simpan kandang v2');
    }
    // Tab A (tanpa restore — singleton kosong) mulai intake JALAN.
    submit(JALAN_TEXT, P);
    tv.awaiting = true;
    assert(sing()?.primary === 'jalan-beton', 'singleton tab A = jalan (divergen dari kandang)');
    const saveA = viewSaveEffect(tv, P);
    assert(saveA.startsWith('CONFLICT-DIVERGENT'), `simpan divergen harus konflik-divergen, dapat ${saveA}`);
    assert(snap(P)?.primaryId !== 'jalan-beton', 'snapshot kandang tab B TIDAK tertimpa jalan');
    assert(snap(P)?.widthM === 6, 'snapshot kandang v2 utuh');
    assert(sing()?.primary === 'jalan-beton', 'singleton lokal tab A (jalan) TIDAK diganti kandang');
    assert(reg.getLastSeenIntakeVersion(P) !== snap(P)?.updatedAt, 'baseline tab A TIDAK maju (fail-closed)');
    assert(tv.messages.some((m) => m.startsWith('DIVERGEN:')), 'pesan divergen diposting');
    // Konflik berulang: pesan tidak berulang (sekali per versi).
    await sleep(2);
    assert(viewSaveEffect(tv, P).startsWith('CONFLICT-DIVERGENT'), 'konflik berulang tetap divergen');
    assert(tv.messages.filter((m) => m.startsWith('DIVERGEN:')).length === 1, 'pesan divergen hanya sekali');
    // Jalan keluar: tab B menghapus snapshotnya → simpan tab A lolos.
    assert(dp.clearIntakeContext(P), 'tab B menghapus snapshot kandang');
    await sleep(2);
    assert(viewSaveEffect(tv, P).startsWith('SAVED'), 'sesudah snapshot hilang, simpan jalan sukses (self-heal)');
    assert(snap(P)?.primaryId === 'jalan-beton', 'snapshot kini jalan');
  });

  // ================= S3A-09: switch-kembali memulihkan terbaru (P5 — tetap aman) =================
  await check('S3A-09 switch proyek lalu kembali: memulihkan snapshot TERBARU tab lain (P5)', async () => {
    reset();
    const tv = freshView();
    const ext = freshExt();
    submit(JALAN_TEXT, P);
    tv.awaiting = true;
    assert(viewSaveEffect(tv, P).startsWith('SAVED'), 'tab A simpan v1 P');
    assert(viewTier2Switch(tv, P).startsWith('CLEARED'), 'switch P→Q membersihkan singleton');
    assert(sing() === null, 'singleton kosong sesudah switch');
    assert(snap(P) !== null, 'disk P utuh sesudah switch');
    await sleep(2);
    const loadedB = extLoadIntake(ext, P);
    if (loadedB.ok) {
      loadedB.ctx.widthM = 6;
      assert(extSaveIntake(ext, P, loadedB.ctx).ok, 'tab B (tetap di P) simpan v2');
    }
    const back = viewRestoreEffect(tv, P);
    assert(back.startsWith('RESTORED'), `kembali ke P memulihkan: ${back}`);
    assert(sing()?.widthM === 6, 'singleton kembali = v2 tab B');
    assert(reg.getLastSeenIntakeVersion(P) === snap(P)?.updatedAt, 'baseline selaras v2');
    await sleep(2);
    const postReturn = viewSaveEffect(tv, P);
    assert(postReturn.startsWith('DEDUP') || postReturn.startsWith('SAVED'), `simpan sesudah kembali tanpa konflik: ${postReturn}`);
  });

  // ================= S3A-10: reload/restore tab fresh =================
  await check('S3A-10 reload/restore: tab fresh memulihkan terbaru + simpan pertama ber-baseline sukses', async () => {
    reset();
    const ext = freshExt();
    // Kondisi awal: snapshot v2 sudah ada (dibuat tab lain).
    submit(JALAN_TEXT, P);
    const ctx0 = reg.getUniversalContextState();
    assert(ctx0 !== null, 'ctx terbentuk');
    assert(extSaveIntake(ext, P, ctx0 as NonNullable<typeof ctx0>).ok, 'tab lain simpan v1');
    await sleep(2);
    const loaded = extLoadIntake(ext, P);
    if (loaded.ok) {
      loaded.ctx.widthM = 6;
      assert(extSaveIntake(ext, P, loaded.ctx).ok, 'tab lain simpan v2');
    }
    // "Reload": singleton kosong + view fresh (ref null).
    reg.clearUniversalContext();
    const tv = freshView();
    const r = viewRestoreEffect(tv, P);
    assert(r.startsWith('RESTORED'), `restore: ${r}`);
    assert(sing()?.widthM === 6, 'singleton pulih = v2');
    assert(tv.awaiting === true, 'awaitingConcept aktif sesudah restore');
    assert(reg.getLastSeenIntakeVersion(P) === snap(P)?.updatedAt, 'last-seen tercatat saat restore');
    // Lanjutan jawaban + simpan pertama ber-baseline → sukses (tanpa konflik).
    assert(viewSubmitAwaiting(tv, 'Budget Rp300 juta', P) === 'MERGED (lanjut intake)', 'jawaban lanjutan merge');
    await sleep(2);
    const s = viewSaveEffect(tv, P);
    assert(s.startsWith('SAVED'), `simpan pertama ber-baseline sukses: ${s}`);
    assert(snap(P)?.widthM === 6 && snap(P)?.budgetAmount === 300000000, 'v3 memuat lebar + budget');
  });

  // ================= S3A-11: perilaku satu-tab tidak berubah =================
  await check('S3A-11 satu-tab: restore + autosave + dedupe persis seperti sebelum S3-A', async () => {
    reset();
    const tv = freshView();
    submit(JALAN_TEXT, P);
    tv.awaiting = true;
    const s1 = viewSaveEffect(tv, P);
    assert(s1.startsWith('SAVED'), `simpan pertama: ${s1}`);
    const s2 = viewSaveEffect(tv, P);
    assert(s2.startsWith('DEDUP'), `simpan ulang tanpa perubahan = dedupe: ${s2}`);
    assert(viewSubmitAwaiting(tv, 'Lebar: 6 m', P) === 'MERGED (lanjut intake)', 'jawaban merge');
    await sleep(2);
    const s3 = viewSaveEffect(tv, P);
    assert(s3.startsWith('SAVED'), `simpan sesudah jawaban: ${s3}`);
    assert(snap(P)?.widthM === 6, 'snapshot widthM=6');
    assert(tv.messages.length === 0, `tanpa pesan konflik satu-tab: ${JSON.stringify(tv.messages)}`);
    // Reload satu-tab: restore + simpan tanpa konflik.
    reg.clearUniversalContext();
    const tv2 = freshView();
    assert(viewRestoreEffect(tv2, P).startsWith('RESTORED'), 'restore satu-tab');
    const postReload = viewSaveEffect(tv2, P);
    assert(postReload.startsWith('DEDUP') || postReload.startsWith('SAVED'), `simpan sesudah restore tanpa konflik: ${postReload}`);
    assert(tv2.messages.length === 0, 'tanpa pesan konflik sesudah reload satu-tab');
  });

  // ================= S3A-12: dedupe self-heal baseline =================
  await check('S3A-12 dedupe self-heal: isi identik + baseline basi → sukses dedupe + baseline maju (tanpa konflik palsu)', async () => {
    reset();
    const tv = freshView();
    submit(JALAN_TEXT, P);
    tv.awaiting = true;
    assert(viewSaveEffect(tv, P).startsWith('SAVED'), 'simpan v1');
    const t1 = reg.getLastSeenIntakeVersion(P) as string;
    await sleep(2);
    // Tab lain "menyimpan" konten IDENTIK + linkage baru (generate):
    // updatedAt maju, isi konteks sama. Tulis linkage memakai SINGLETON
    // tab A langsung (bukan salinan rehidrasi) agar byte konteks
    // tersimpan identik persis dengan serialisasi singleton.
    const liveCtx = reg.getUniversalContextState() as NonNullable<ReturnType<typeof reg.getUniversalContextState>>;
    const r2 = dp.saveIntakeContext(P, liveCtx, { generatedDraftId: 'DRAFT-X', generatedAt: new Date().toISOString() });
    assert(r2.ok && !r2.deduplicated, `simpan linkage (isi sama, relasi baru) menulis: ${JSON.stringify(r2)}`);
    const t2 = snap(P)?.updatedAt as string;
    assert(t2 !== t1, 'updatedAt maju oleh linkage');
    // Tab A menyimpan konten identik (tanpa meta) dengan baseline T1:
    // dedupe membandingkan linkage — pemanggil tanpa meta MEMPERTAHANKAN
    // relasi bila konteks identik → dedupe sukses + baseline maju.
    const rA = dp.saveIntakeContext(P, reg.getUniversalContextState() as NonNullable<ReturnType<typeof reg.getUniversalContextState>>, undefined, { expectedUpdatedAt: t1 });
    assert(rA.ok && rA.deduplicated, `tulis identik + baseline basi harus DEDUP (bukan konflik): ${JSON.stringify(rA)}`);
    assert(rA.ok && rA.updatedAt === t2, 'dedupe mengembalikan updatedAt terbaru (baseline self-heal)');
    assert(snap(P)?.generatedDraftId === 'DRAFT-X', 'relasi draft dipertahankan dedupe');
  });

  // ================= S3A-13: home state guard (P7) =================
  await check('S3A-13 home state: stale write ditolak + refresh adopsi; stale clear ditahan (P7)', async () => {
    reset();
    const tv = freshView();
    const needsV1 = { kind: 'rumah', kindLabel: 'RUMAH-V1-TAB-A', functionId: null } as unknown as Parameters<typeof dp.saveHomeState>[1]['needs'];
    const needsV2 = { kind: 'rumah', kindLabel: 'RUMAH-V2-TAB-B', functionId: null } as unknown as Parameters<typeof dp.saveHomeState>[1]['needs'];
    // Tab A simpan V1 (baseline dicatat).
    const s1 = dp.saveHomeState(P, { needs: needsV1, intentSpec: null, pendingChoice: null }, { expectedUpdatedAt: tv.homeRef });
    assert(s1.ok, `simpan home V1: ${JSON.stringify(s1)}`);
    if (s1.ok) tv.homeRef = s1.updatedAt;
    const t1 = tv.homeRef as string;
    await sleep(2);
    // Tab B: baca V1 → simpan V2.
    const loadedB = dp.loadHomeState(P);
    assert(loadedB.ok, 'tab B load home V1');
    const s2 = dp.saveHomeState(P, { needs: needsV2, intentSpec: null, pendingChoice: null }, { expectedUpdatedAt: loadedB.ok ? loadedB.updatedAt : null });
    assert(s2.ok, `simpan home V2: ${JSON.stringify(s2)}`);
    const t2 = dp.peekHomeState(P)?.updatedAt as string;
    assert(t2 !== t1, 'updatedAt home maju');
    await sleep(2);
    // Tab A tulis basi V1 → konflik.
    const stale = dp.saveHomeState(P, { needs: needsV1, intentSpec: null, pendingChoice: null }, { expectedUpdatedAt: t1 });
    assert(!stale.ok && stale.error === 'HOME_STATE_VERSION_CONFLICT', `tulis home basi harus konflik, dapat ${JSON.stringify(stale)}`);
    assert((dp.peekHomeState(P)?.needs as unknown as { kindLabel?: string } | null)?.kindLabel === 'RUMAH-V2-TAB-B', 'home V2 selamat');
    // Refresh adopsi (model handleHomeStateSaveConflict): baca segar → adopsi.
    const fresh = dp.loadHomeState(P);
    assert(fresh.ok, 'load home segar');
    if (fresh.ok) {
      tv.homeRef = fresh.updatedAt;
      reg.setLastRabNeeds(fresh.state.needs, P);
    }
    assert((reg.getLastRabNeeds(P) as unknown as { kindLabel?: string } | null)?.kindLabel === 'RUMAH-V2-TAB-B', 'singleton home tab A kini V2');
    // Stale clear ditahan: clear dengan baseline T1 → false, record utuh.
    const heldClear = dp.clearHomeState(P, t1);
    assert(heldClear === false, 'clear home baseline basi DITAHAN');
    assert(dp.peekHomeState(P) !== null, 'record home utuh sesudah clear ditahan');
    // Clear dengan baseline cocok → true.
    const okClear = dp.clearHomeState(P, t2);
    assert(okClear === true, 'clear home baseline cocok menghapus');
    assert(dp.peekHomeState(P) === null, 'record home terhapus');
    // Clear record yang sudah tidak ada → false (bukan error).
    assert(dp.clearHomeState(P) === false, 'clear record tak-ada → false');
  });

  // ================= S3A-14/15/16: penjaga P6b/P6c draft =================
  const draftOf = (text: string) => {
    const res = ur.buildUniversalDraft(text);
    if (res.kind !== 'draft') throw new Error(`build gagal: ${res.kind}`);
    return res.draft;
  };

  await check('S3A-14 draft P6b: tab fresh (baseline null) + draft BARU → simpan DITOLAK, record lama selamat', async () => {
    reset();
    const tvAB = freshView();
    const d1 = draftOf('Buatkan RAB gedung kantor 3 lantai luas 900 m²');
    assert(viewPersistDraft(tvAB, P, d1).startsWith('SAVED'), 'tab A/B simpan draft v1');
    const storedId = dp.peekPersistedDraft(P)?.draftId;
    assert(storedId === d1.id, 'record = draft tab A/B');
    // Tab C fresh: baseline null, draft BARU (id berbeda).
    const tvC = freshView();
    const d2 = draftOf('buatkan RAB jalan beton sepanjang 1 km');
    assert(d2.id !== d1.id, 'draft tab C ber-id beda');
    const rC = viewPersistDraft(tvC, P, d2);
    assert(rC.startsWith('REFUSED'), `simpan tab C harus DITOLAK: ${rC}`);
    assert(dp.peekPersistedDraft(P)?.draftId === d1.id, 'record tab A/B SELAMAT (tidak tertimpa diam-diam)');
    assert(tvC.messages.some((m) => m.startsWith('DRAFT-DITAHAN:')), 'pesan penolakan diposting');
    // RAW saveDraft (tanpa penjaga view) MASIH menimpa — perilaku API
    // sengaja tidak diubah (dipin draftPersistenceHardening); penjaga
    // hidup di view. Buktikan pembedanya di sini agar tidak salah baca.
    const raw = dp.saveDraft({ draft: d2, projectId: P });
    assert(raw.ok, 'saveDraft mentah tanpa baseline tetap menimpa (kontrak API tidak berubah)');
    assert(dp.peekPersistedDraft(P)?.draftId === d2.id, '...tetapi itu jalur mentah, bukan persistActiveDraft');
  });

  await check('S3A-15 draft P6c: baseline null + versi-sama isi-beda → simpan DITOLAK', async () => {
    reset();
    const tvAB = freshView();
    const d3 = draftOf('buatkan RAB drainase U-Ditch sepanjang 500 meter');
    assert(viewPersistDraft(tvAB, P, d3).startsWith('SAVED'), 'simpan draft v1');
    const tvC = freshView();
    const d3mod = JSON.parse(JSON.stringify(d3)) as typeof d3;
    d3mod.assumptions = [...(d3mod.assumptions ?? []), 'ASUMSI DARI TAB ASING (versi sama, isi beda)'];
    assert(d3mod.id === d3.id && d3mod.version === d3.version, 'salinan: id + versi sama');
    const rC = viewPersistDraft(tvC, P, d3mod);
    assert(rC.startsWith('REFUSED'), `simpan versi-sama-isi-beda harus DITOLAK: ${rC}`);
    assert(!(dp.peekPersistedDraft(P)?.assumptions ?? []).includes('ASUMSI DARI TAB ASING (versi sama, isi beda)'), 'asumsi asing TIDAK tersimpan');
  });

  await check('S3A-16 draft: baseline null + isi IDENTIK → adopsi baseline + simpan (dedupe)', async () => {
    reset();
    const tvAB = freshView();
    const d1 = draftOf('Buatkan RAB gedung kantor 3 lantai luas 900 m²');
    assert(viewPersistDraft(tvAB, P, d1).startsWith('SAVED'), 'simpan draft v1');
    const storedUpdatedAt = dp.peekPersistedDraft(P)?.updatedAt as string;
    // Tab fresh memegang objek draft YANG SAMA (mis. singleton = draft tersimpan).
    const tvC = freshView();
    const rC = viewPersistDraft(tvC, P, d1);
    assert(rC === 'DEDUP', `simpan isi-identik harus adopsi + dedupe: ${rC}`);
    assert(tvC.draftRef === storedUpdatedAt, 'baseline tab C diadopsi dari record');
    assert(dp.peekPersistedDraft(P)?.draftId === d1.id, 'record tidak berubah');
    assert(tvC.messages.length === 0, 'tanpa pesan penolakan untuk isi identik');
  });

  // ================= S3A-17: intake baru sesudah generate (pin satu sumber kebenaran) =================
  await check('S3A-17 satu-tab: intake baru sesudah generate menimpa snapshot tertaut TANPA konflik palsu (P5A-23)', async () => {
    reset();
    const tv = freshView();
    // Alur kandang terpandu sampai brief (pola P5A-02) + generate.
    submit(KANDANG_TEXT, P);
    tv.awaiting = true;
    assert(viewSaveEffect(tv, P).startsWith('SAVED'), 'simpan awal kandang');
    assert(reg.tryContinueUniversalContext('17 x 9 meter') !== null, 'jawaban ukuran diterima');
    viewSaveEffect(tv, P);
    assert(reg.tryContinueUniversalContext('Kandang terbuka') !== null, 'jawaban tipe diterima');
    viewSaveEffect(tv, P);
    reg.submitQuestionnaireAnswers({
      'kandang-capacity': { selectedIds: ['kap-30'], customText: null, status: 'answered' },
      'kandang-roof-material': { selectedIds: ['atap-spandek'], customText: null, status: 'answered' },
      'kandang-floor': { selectedIds: ['lantai-beton-miring'], customText: null, status: 'answered' },
      'kandang-facilities': { selectedIds: ['fas-palung', 'fas-drainase'], customText: null, status: 'answered' },
      'kandang-manure': { selectedIds: [], customText: null, status: 'skipped' },
    });
    viewSaveEffect(tv, P);
    const gen = reg.generateUniversalFromBrief();
    assert(gen !== null && (gen.actions ?? []).some((a) => a.action.kind === 'push-universal'), 'generate dari brief menghasilkan draft');
    assert(sing() === null, 'singleton dibersihkan sesudah generate');
    const linked = snap(P);
    assert(linked !== null && linked.generatedDraftId !== null, `snapshot tertaut ke draft hasil generate: ${JSON.stringify(linked)}`);
    assert(reg.takeIntakePersistConflict() === null, 'tanpa konflik persist-generate (baseline registry selaras)');
    // Intake BARU topik lain di proyek yang sama — HARUS menimpa snapshot
    // tertaut (LWW satu-tab, dipin P5A-23), BUKAN konflik-divergen.
    // Desain dua-tracker (ref view + peta registry) GAGAL di sini: ref
    // view basi pra-generate vs storage pasca-generate → konflik palsu.
    await sleep(2);
    submit('Buatkan RAB kolam renang', P);
    tv.awaiting = true;
    const sNew = viewSaveEffect(tv, P);
    assert(sNew.startsWith('SAVED') || sNew.startsWith('DEDUP'), `simpan intake baru sukses tanpa konflik: ${sNew}`);
    const snapNew = snap(P);
    assert(snapNew?.primaryId === 'kolam', `snapshot baru = kolam: ${JSON.stringify(snapNew)}`);
    assert(snapNew?.generatedDraftId === null, 'konteks baru TIDAK mewarisi tautan draft lama');
    assert(tv.messages.length === 0, `tanpa pesan konflik satu-tab: ${JSON.stringify(tv.messages)}`);
  });

  // ================= ringkasan =================
  console.log(`\nchatIso3aMultiTab: ${passed} passed, ${failed} failed${failed ? ` [${failures.join(', ')}]` : ''}`);
  if (failed > 0) process.exit(1);
}

void main().catch((e) => {
  console.error('SUITE GAGAL:', e);
  process.exit(1);
});
