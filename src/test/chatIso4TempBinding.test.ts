/**
 * chatIso4TempBinding.test.ts — F-ISO-4 (TEMPORARY, keputusan owner
 * 2026-11-23): draft tool-registry baru (build_universal_draft) diikat
 * ke proyek sementara SETELAH commit draft berhasil — lewat ensurer
 * B5-3 yang sama, di hook pasca-commit executeTool.
 *
 * Gaya plain-tsx: `npx --yes tsx src/test/chatIso4TempBinding.test.ts`
 *
 * Yang diuji lewat JALUR NYATA (toolRegistry.executeTool +
 * universalRab + draftPersistence + tempProject):
 * - positif: draft tool tanpa proyek → proyek sementara dibuat + draft
 *   terikat + tersimpan; dengan proyek aktif → terikat ke proyek itu;
 *   dengan args.projectId → terikat ke sana, ensurer tidak dipanggil.
 * - commit boundary: hanya invoke SEGAR yang sukses/parsial mengikat —
 *   gagal build, diblokir gerbang, timeout, replay idempotensi, dan
 *   tool lain TIDAK PERNAH memicu ensurer.
 * - fail-open: tanpa ensurer / ensurer melempar / ensurer null → hasil
 *   tool tetap ok, draft tetap tampil tanpa ikatan.
 * - perbaikan pendamping clear-on-null: build tanpa projectId tidak
 *   lagi mewarisi ikatan basi draft sebelumnya (C3).
 * - kebocoran autosave tertutup: draft terikat proyek sementara tidak
 *   bisa tersimpan di bawah proyek aktif lain (C4).
 * - retry sesudah kegagalan parsial asosiasi: percobaan kedua mengikat
 *   tanpa menduplikasi proyek (ISO4-13).
 *
 * BATAS UJI (jujur): ensurer di sini adalah TIRUAN view (store proyek
 * palsu + saveDraft nyata, pola chatTempProjectB53.test.ts) — ensurer
 * React asli di view.tsx (createProject konteks + migrasi percakapan +
 * efek muat) TIDAK dapat diuji tanpa React dan menjadi tugas
 * verifikator UI. Yang dibuktikan suite ini adalah perilaku REGISTRY
 * (hook dipanggil di titik yang benar, dengan kondisi yang benar) +
 * persistensi + penamaan. Jalur tool-registry saat ini LATEN di
 * produksi (build_universal_draft tidak ditawarkan ke model di prompt
 * mana pun — DISCOVERY §4.2) — hook bersifat preventif sampai wiring
 * prompt ada; suite ini membuktikan hook-nya, bukan wiring-nya.
 * toolCreateRabDraft (constructionTools, tanpa pemanggil produksi)
 * TIDAK melewati executeTool sehingga tidak ter-hook — di luar cakupan
 * keputusan (hanya perilaku clear-on-null-nya yang dipin ISO4-11).
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

const KANDANG = 'Buatkan RAB kandang sapi 17 x 9 m';
const GUDANG = 'Buatkan RAB gudang 20 x 40 m';
const GARBAGE = 'asdf qwer zxcv';

async function main(): Promise<void> {
  console.log('chatIso4TempBinding.test (F-ISO-4 TEMPORARY)');
  const toolReg = await import('../ai-tools/ezrab-ai/toolRegistry');
  const ct = await import('../ai-tools/ezrab-ai/constructionTools');
  const rab = await import('../ai-tools/ezrab-ai/universalRab');
  const dp = await import('../ai-tools/ezrab-ai/draftPersistence');
  const tp = await import('../ai-tools/ezrab-ai/tempProject');

  /* ---------- store proyek palsu (semantik ProjectContext, pola B5-3) ---------- */
  interface FakeProject {
    id: string;
    name: string;
    status: string;
    creationMethod?: string;
    description?: string;
  }
  class FakeProjectStore {
    projects: FakeProject[] = [];
    currentId: string | null = null;
    seq = 0;
    create(data: Partial<FakeProject> & { name: string }): FakeProject {
      const p: FakeProject = { id: `PRJ-ISO4-${++this.seq}`, status: 'draft', ...data };
      this.projects.unshift(p);
      this.currentId = p.id;
      return p;
    }
    get current(): FakeProject | null {
      return this.projects.find((p) => p.id === this.currentId) ?? null;
    }
    reset(): void {
      this.projects = [];
      this.currentId = null;
      this.seq = 0;
    }
  }
  const store = new FakeProjectStore();
  let ensurerCalls = 0;
  let lastSaveOk: boolean | null = null;

  /* Tiruan ensurer view.tsx: proyek aktif (bila ada) dipakai; bila
   * tidak, buat proyek sementara + persistenkan draft di bawahnya. */
  const fakeEnsurer: (draft: { title: string }) => { id: string; name: string; created: boolean } | null = (draft) => {
    ensurerCalls += 1;
    const live = store.current;
    if (live) return { id: live.id, name: live.name, created: false };
    const created = store.create({
      name: tp.tempProjectNameForDraft(draft.title),
      status: 'draft',
      creationMethod: tp.TEMP_PROJECT_CREATION_METHOD,
      description: tp.tempProjectDescriptionForDraft(draft.title),
    });
    if ('parts' in draft && 'id' in draft) {
      const res = dp.saveDraft({
        draft: draft as never,
        projectId: created.id,
        conversationId: null,
        workflowStage: 'autosave',
        savedBy: 'autosave',
      });
      lastSaveOk = res.ok;
    }
    return { id: created.id, name: created.name, created: true };
  };

  let keySeq = 0;
  const nextKey = (tag: string) => `iso4-${tag}-${++keySeq}`;
  const execDraft = (text: string, opts: { projectId?: string | null; argsProjectId?: string | null; key: string }) =>
    toolReg.executeTool({
      toolName: 'build_universal_draft',
      args: opts.argsProjectId ? { text, projectId: opts.argsProjectId } : { text },
      projectId: opts.projectId ?? null,
      actor: 'model',
      channel: 'chat-ai',
      idempotencyKey: opts.key,
    });
  /* Model setia persistActiveDraft view.tsx:1066-1080 (bagian intinya). */
  const persistActiveDraftModel = (effProjectId: string | null) => {
    const d = rab.getLastUniversalDraft(effProjectId);
    if (!d || !effProjectId) return { saved: false, reason: !d ? 'getLastUniversalDraft=null' : 'tanpa effProject' };
    const res = dp.saveDraft({ draft: d, projectId: effProjectId, conversationId: null, workflowStage: 'autosave', savedBy: 'autosave' });
    return { saved: res.ok, draftId: d.id, error: res.ok ? null : res.error };
  };

  const resetAll = () => {
    toolReg.__resetToolRegistryForTests();
    rab.clearLastUniversalDraft();
    tp.setDraftProjectEnsurer(null);
    store.reset();
    storage.clear();
    ensurerCalls = 0;
    lastSaveOk = null;
  };
  const registerEnsurer = () => {
    tp.setDraftProjectEnsurer(fakeEnsurer as never);
  };

  await check('ISO4-01 draft tool tanpa proyek → proyek sementara dibuat + draft terikat + tersimpan', async () => {
    resetAll();
    registerEnsurer();
    const r = await execDraft(KANDANG, { key: nextKey('01') });
    assert(r.ok === true, `eksekusi harus ok, dapat ok=${r.ok} error=${r.errorCode}`);
    assert(r.record.status === 'succeeded' || r.record.status === 'partially-succeeded', `status harus sukses/parsial, dapat "${r.record.status}"`);
    assert(ensurerCalls === 1, `ensurer harus dipanggil 1×, dapat ${ensurerCalls}×`);
    assert(store.projects.length === 1, `tepat 1 proyek harus dibuat, dapat ${store.projects.length}`);
    const p = store.projects[0];
    assert(/^RAB .+ \(Sementara\)$/.test(p.name), `nama harus berpola "RAB <judul> (Sementara)", dapat "${p.name}"`);
    assert(p.creationMethod === 'chat-ai', `creationMethod harus 'chat-ai', dapat "${p.creationMethod}"`);
    assert(store.currentId === p.id, 'proyek sementara harus menjadi proyek aktif');
    const d = rab.getLastUniversalDraft();
    assert(d !== null, 'singleton draft harus ada');
    assert(rab.getLastUniversalDraftProjectId() === p.id, 'draft harus terikat ke proyek sementara');
    assert(lastSaveOk === true, 'draft harus tersimpan (saveDraft ok)');
    const loaded = dp.loadDraft(p.id);
    assert(loaded.ok, 'loadDraft proyek sementara harus ok');
    assert(loaded.ok && loaded.draft.id === d!.id, 'draft tersimpan harus draft yang sama');
  });

  await check('ISO4-02 draft tool dengan proyek aktif → terikat ke proyek itu, 0 proyek baru', async () => {
    resetAll();
    registerEnsurer();
    const existing = store.create({ name: 'Proyek Existing' });
    const r = await execDraft(KANDANG, { key: nextKey('02') });
    assert(r.ok === true, 'eksekusi harus ok');
    assert(ensurerCalls === 1, `ensurer harus dipanggil 1× (untuk mengikat), dapat ${ensurerCalls}×`);
    assert(store.projects.length === 1, 'tidak boleh ada proyek baru');
    assert(store.currentId === existing.id, 'proyek aktif tidak boleh berganti');
    assert(rab.getLastUniversalDraftProjectId() === existing.id, 'draft harus terikat ke proyek aktif');
    assert(lastSaveOk === null, 'proyek live (bukan dibuat) → ensurer tidak memanggil saveDraft');
  });

  await check('ISO4-03 args membawa projectId → terikat ke sana, ensurer TIDAK dipanggil', async () => {
    resetAll();
    registerEnsurer();
    const r = await execDraft(KANDANG, { projectId: 'PROJ-ARGS-Y', argsProjectId: 'PROJ-ARGS-Y', key: nextKey('03') });
    assert(r.ok === true, 'eksekusi harus ok');
    assert(rab.getLastUniversalDraftProjectId() === 'PROJ-ARGS-Y', 'draft harus terikat ke projectId args');
    assert(ensurerCalls === 0, `ensurer tidak boleh dipanggil (draft sudah terikat), dapat ${ensurerCalls}×`);
    assert(store.projects.length === 0, 'tidak boleh ada proyek baru');
  });

  await check('ISO4-04 tanpa ensurer terdaftar: draft berhasil tanpa proyek (fail-open, perilaku lama)', async () => {
    resetAll();
    // Sengaja TIDAK registerEnsurer — permukaan tanpa view chat.
    const r = await execDraft(KANDANG, { key: nextKey('04') });
    assert(r.ok === true, 'draft harus tetap berhasil tanpa ensurer');
    assert(store.projects.length === 0, 'tanpa ensurer tidak boleh ada proyek');
    assert(rab.getLastUniversalDraft() !== null, 'draft tetap ada di singleton');
    assert(rab.getLastUniversalDraftProjectId() === null, 'draft tetap tanpa ikatan proyek');
  });

  await check('ISO4-05 build gagal (teks sampah) → 0 proyek, 0 ensurer, singleton null', async () => {
    resetAll();
    registerEnsurer();
    const r = await execDraft(GARBAGE, { key: nextKey('05') });
    assert(r.ok === false, 'teks sampah harus gagal');
    assert(r.record.status === 'failed', `status harus failed, dapat "${r.record.status}"`);
    assert(ensurerCalls === 0, `ensurer tidak boleh dipanggil saat build gagal, dapat ${ensurerCalls}×`);
    assert(store.projects.length === 0, 'tidak boleh ada proyek');
    assert(rab.getLastUniversalDraft() === null, 'singleton harus tetap null');
  });

  await check('ISO4-06 diblokir gerbang (validasi input + scope mismatch) → 0 proyek, 0 ensurer', async () => {
    resetAll();
    registerEnsurer();
    // (a) Input tak valid: tanpa teks (field wajib).
    const noText = await toolReg.executeTool({
      toolName: 'build_universal_draft', args: {}, projectId: null, actor: 'model', channel: 'chat-ai', idempotencyKey: nextKey('06a'),
    });
    assert(noText.ok === false, 'tanpa teks harus gagal');
    assert(noText.errorCode === 'INPUT_VALIDATION_FAILED', `kode harus INPUT_VALIDATION_FAILED, dapat "${noText.errorCode}"`);
    assert(ensurerCalls === 0, 'ensurer tidak boleh dipanggil saat validasi gagal');
    // (b) Scope mismatch: args menyebut proyek X, scope eksekusi Y.
    const mismatch = await toolReg.executeTool({
      toolName: 'build_universal_draft', args: { text: KANDANG, projectId: 'PROJ-X' }, projectId: 'PROJ-Y', actor: 'model', channel: 'chat-ai', idempotencyKey: nextKey('06b'),
    });
    assert(mismatch.ok === false, 'scope mismatch harus gagal');
    assert(mismatch.errorCode === 'PROJECT_SCOPE_MISMATCH', `kode harus PROJECT_SCOPE_MISMATCH, dapat "${mismatch.errorCode}"`);
    assert(ensurerCalls === 0, 'ensurer tidak boleh dipanggil saat scope mismatch');
    assert(store.projects.length === 0, 'tidak boleh ada proyek');
    assert(rab.getLastUniversalDraft() === null, 'singleton harus tetap null');
  });

  await check('ISO4-07 replay idempotensi → ensurer TIDAK dipanggil lagi, tanpa proyek kedua, singleton tidak dibangun ulang', async () => {
    resetAll();
    registerEnsurer();
    const key = nextKey('07');
    const first = await execDraft(KANDANG, { key });
    assert(first.ok === true, 'eksekusi pertama harus ok');
    assert(ensurerCalls === 1, 'ensurer 1× sesudah eksekusi pertama');
    assert(store.projects.length === 1, '1 proyek sesudah eksekusi pertama');
    const tempId = store.projects[0].id;
    assert(rab.getLastUniversalDraftProjectId() === tempId, 'draft pertama terikat ke proyek sementara');
    // Kosongkan singleton: apakah replay membangun ulang?
    rab.setLastUniversalDraft(null, null);
    const second = await execDraft(KANDANG, { key });
    assert(second.ok === true, 'replay harus ok');
    assert((second.record as { replayed?: boolean }).replayed === true, 'eksekusi kedua harus replayed');
    assert(ensurerCalls === 1, `ensurer tetap 1× sesudah replay, dapat ${ensurerCalls}×`);
    assert(store.projects.length === 1, 'tetap 1 proyek sesudah replay');
    assert(rab.getLastUniversalDraft() === null, 'replay TIDAK membangun ulang singleton');
    assert(dp.loadDraft(tempId).ok, 'draft pertama tetap tersimpan di bawah proyek sementara');
  });

  await check('ISO4-08 tool lain yang sukses TIDAK memicu ensurer (penjaga def.name)', async () => {
    resetAll();
    registerEnsurer();
    const r = await toolReg.executeTool({
      toolName: 'subtotal', args: { volume: 2, unitPrice: 100000 }, projectId: 'PROJ-ISO4-08', actor: 'model', channel: 'chat-ai', idempotencyKey: nextKey('08'),
    });
    assert(r.ok === true, 'subtotal harus ok');
    assert(r.record.status === 'succeeded', 'subtotal harus succeeded');
    assert(ensurerCalls === 0, `ensurer tidak boleh dipanggil tool lain, dapat ${ensurerCalls}×`);
    assert(store.projects.length === 0, 'tidak boleh ada proyek');
    assert(rab.getLastUniversalDraft() === null, 'singleton draft harus tetap null');
  });

  await check('ISO4-09 ensurer melempar (association persistence fails) → hasil tool tetap ok, draft tampil tanpa ikatan', async () => {
    resetAll();
    tp.setDraftProjectEnsurer(() => {
      throw new Error('createProject gagal (simulasi)');
    });
    const r = await execDraft(KANDANG, { key: nextKey('09') });
    assert(r.ok === true, 'hasil tool harus TETAP ok walau ensurer melempar');
    assert(r.record.status === 'succeeded' || r.record.status === 'partially-succeeded', 'status tetap sukses/parsial');
    assert(store.projects.length === 0, 'tidak ada proyek saat ensurer gagal');
    const d = rab.getLastUniversalDraft();
    assert(d !== null, 'draft tetap ada di singleton (tampil tanpa ikatan)');
    assert(rab.getLastUniversalDraftProjectId() === null, 'draft tetap tanpa ikatan');
  });

  await check('ISO4-10 partially-succeeded TETAP diikat (commit mencakup parsial)', async () => {
    resetAll();
    registerEnsurer();
    const r = await execDraft(KANDANG, { key: nextKey('10') });
    assert(r.ok === true, 'eksekusi harus ok');
    assert(r.record.status === 'partially-succeeded', `fixture kandang harus partially-succeeded (item tak berharga), dapat "${r.record.status}"`);
    assert(ensurerCalls === 1, 'ensurer harus dipanggil untuk draft parsial (commit)');
    assert(store.projects.length === 1, 'proyek sementara harus dibuat untuk draft parsial');
    assert(rab.getLastUniversalDraftProjectId() === store.projects[0].id, 'draft parsial harus terikat ke proyek sementara');
    assert(lastSaveOk === true, 'draft parsial harus tersimpan');
  });

  await check('ISO4-11 clear-on-null: build tanpa projectId TIDAK mewarisi ikatan basi (C3 tertutup)', async () => {
    resetAll();
    registerEnsurer();
    // (a) Dengan ensurer: draft baru terikat ke proyek sementara BARU,
    // bukan ke ikatan basi draft sebelumnya.
    const bound = ct.toolCreateRabDraft({ text: KANDANG, projectId: 'PROJ-BOUND-A' });
    assert(bound.kind === 'draft', 'prasyarat: draft terikat berhasil dibangun');
    assert(rab.getLastUniversalDraftProjectId() === 'PROJ-BOUND-A', 'prasyarat: ikatan PROJ-BOUND-A');
    const r = await execDraft(GUDANG, { key: nextKey('11a') });
    assert(r.ok === true, 'draft tool kedua harus ok');
    assert(rab.getLastUniversalDraftProjectId() !== 'PROJ-BOUND-A', 'ikatan basi TIDAK BOLEH diwarisi');
    assert(rab.getLastUniversalDraftProjectId() === store.projects[0].id, 'draft baru terikat ke proyek sementara (bukan ikatan basi)');
    // (b) Tanpa ensurer (clear-on-null murni, tanpa hook): ikatan null.
    resetAll();
    const bound2 = ct.toolCreateRabDraft({ text: KANDANG, projectId: 'PROJ-BOUND-A' });
    assert(bound2.kind === 'draft', 'prasyarat (b): draft terikat berhasil dibangun');
    const r2 = await execDraft(GUDANG, { key: nextKey('11b') });
    assert(r2.ok === true, 'draft tool harus ok tanpa ensurer');
    assert(rab.getLastUniversalDraftProjectId() === null, 'tanpa ensurer, draft tanpa projectId harus benar-benar tak-terikat (null, bukan warisan)');
  });

  await check('ISO4-12 kebocoran autosave tertutup: draft terikat proyek sementara TIDAK tersimpan di bawah proyek lain (C4)', async () => {
    resetAll();
    registerEnsurer();
    const r = await execDraft(KANDANG, { key: nextKey('12') });
    assert(r.ok === true, 'eksekusi harus ok');
    const tempId = store.projects[0].id;
    assert(rab.getLastUniversalDraftProjectId() === tempId, 'draft terikat ke proyek sementara');
    // Autosave di bawah proyek aktif LAIN (model persistActiveDraft):
    // getter menolak karena ikatan berbeda.
    assert(rab.getLastUniversalDraft('PROJ-B') === null, 'getLastUniversalDraft(PROJ-B) harus null (draft milik proyek sementara)');
    const save = persistActiveDraftModel('PROJ-B');
    assert(save.saved === false, `autosave di bawah PROJ-B harus TIDAK terjadi, dapat ${JSON.stringify(save)}`);
    assert(dp.loadDraft('PROJ-B').ok === false, 'tidak ada record draft di bawah PROJ-B');
    assert(dp.loadDraft(tempId).ok, 'draft tetap tersimpan di bawah proyek sementaranya');
  });

  await check('ISO4-13 retry after partial failure: asosiasi gagal lalu berhasil — tepat 1 proyek, draft terikat', async () => {
    resetAll();
    let attempts = 0;
    tp.setDraftProjectEnsurer(((draft: { title: string }) => {
      attempts += 1;
      if (attempts === 1) throw new Error('createProject gagal transient (simulasi)');
      return fakeEnsurer(draft);
    }) as never);
    // Percobaan 1: tool ok, asosiasi gagal (draft tampil tanpa ikatan).
    const first = await execDraft(KANDANG, { key: nextKey('13a') });
    assert(first.ok === true, 'percobaan 1 harus ok (kegagalan asosiasi bukan kegagalan tool)');
    assert(attempts === 1, 'ensurer dipanggil 1× pada percobaan 1');
    assert(store.projects.length === 0, '0 proyek sesudah percobaan 1 (ensurer melempar)');
    assert(rab.getLastUniversalDraftProjectId() === null, 'draft percobaan 1 tanpa ikatan');
    // Retry dengan kunci idempotensi BARU (permintaan baru): asosiasi
    // berhasil, tepat 1 proyek tercipta.
    const retry = await execDraft(KANDANG, { key: nextKey('13b') });
    assert(retry.ok === true, 'retry harus ok');
    assert((retry.record as { replayed?: boolean }).replayed !== true, 'retry kunci baru bukan replay');
    assert(attempts === 2, 'ensurer dipanggil ke-2 kalinya pada retry');
    assert(store.projects.length === 1, `tepat 1 proyek sesudah retry, dapat ${store.projects.length}`);
    assert(rab.getLastUniversalDraftProjectId() === store.projects[0].id, 'draft retry terikat ke proyek sementara');
    assert(lastSaveOk === true, 'draft retry tersimpan di bawah proyek sementara');
  });

  await check('ISO4-14 draft tool kedua memakai proyek sementara yang sama (tanpa proyek baru)', async () => {
    resetAll();
    registerEnsurer();
    const first = await execDraft(KANDANG, { key: nextKey('14a') });
    assert(first.ok === true, 'draft pertama harus ok');
    const tempId = store.projects[0].id;
    const firstDraftId = rab.getLastUniversalDraft()!.id;
    const second = await execDraft(GUDANG, { key: nextKey('14b') });
    assert(second.ok === true, 'draft kedua harus ok');
    assert(ensurerCalls === 2, `ensurer dipanggil 2× (sekali per draft), dapat ${ensurerCalls}×`);
    assert(store.projects.length === 1, 'draft kedua tidak boleh membuat proyek lagi');
    assert(rab.getLastUniversalDraftProjectId() === tempId, 'draft kedua terikat ke proyek sementara yang sama');
    assert(rab.getLastUniversalDraft()?.id !== firstDraftId, 'singleton harus memegang draft kedua (bukan pertama)');
    // Ensurer yang mengikat ke proyek LIVE tidak memanggil saveDraft
    // (cermin ensurer view B5-3 — penyimpanan terjadi lewat autosave
    // berikutnya, bukan di dalam ensurer): record tersimpan masih
    // draft pertama sampai autosave berjalan.
    const beforeAutosave = dp.loadDraft(tempId);
    assert(beforeAutosave.ok && beforeAutosave.draft.id === firstDraftId, 'sebelum autosave, record tersimpan masih draft pertama (ensurer live-bind tidak menyimpan)');
    const autosave = persistActiveDraftModel(tempId);
    assert(autosave.saved === true, 'autosave berikutnya harus menyimpan draft kedua');
    const loaded = dp.loadDraft(tempId);
    assert(loaded.ok, 'draft kedua tersimpan di bawah proyek sementara yang sama sesudah autosave');
    assert(loaded.ok && loaded.draft.id === rab.getLastUniversalDraft()!.id, 'record tersimpan harus draft kedua (terbaru) sesudah autosave');
  });

  console.log(`\nchatIso4TempBinding: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(`FAILURES: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
