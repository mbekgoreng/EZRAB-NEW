/**
 * chatIso4LifecycleS3d.test.ts — STAGE 3 S3-D (Outcome B): pin lifecycle
 * commit `build_universal_draft` + batasan yang diketahui sebagai tes
 * integrasi registry-level.
 *
 * Gaya plain-tsx: `npx --yes tsx src/test/chatIso4LifecycleS3d.test.ts`
 *
 * KEPUTUSAN GERBANG (S3D-DISCOVERY.md §5): **Outcome B — tool tetap
 * laten by design.** Tool ini TIDAK ditawarkan ke model di prompt
 * produksi mana pun (Chat AI hanya EZRAB_AI_TOOLS — 30 tool, tanpa
 * pembangun draft; Copilot read-only by design; orkestrator tidak
 * dapat mengeksekusi langkah generate-draft lewat UI; Magic AI/DED/
 * DocAI tanpa jalur tool). Suite ini TIDAK mengekspos tool ke prompt
 * atau model mana pun — ia hanya mem-pin perilaku registry yang sudah
 * ada, termasuk batasan-batasannya.
 *
 * Yang di-pin (kasus S3D-L01..S3D-L16 + S3D-G4, dipetakan 1:1 ke probe
 * baseline `evidence/baseline/scripts/probe-s3d-lifecycle.ts`):
 * - urutan commit: finishRecord → hook F-ISO-4 → setLast → return
 *   (L-01); gagal / validasi-gagal / replay tanpa binding (L-02, L-03,
 *   L-06); commit segar → proyek sementara + tersimpan (L-05);
 *   setter null-vs-undefined (L-08); ensurer gagal → tool tetap ok
 *   (L-09); autosave + ganti proyek tidak bocor (L-10, L-11);
 *   persistMessage ke percakapan temp (L-14).
 * - BATASAN TERDOKUMENTASI (bukan perilaku ideal — tes mem-pin perilaku
 *   SAAT INI sebagai pendeteksi perubahan; bila perbaikan mendarat,
 *   tes ini SENGAJA MERAH sampai diperbarui bersama keputusan owner):
 *   R1 dua panggilan sekuensial tanpa flush render → 2 proyek
 *   sementara (L-12); R2 dua panggilan konkuren → hook mengikat draft
 *   kedua, draft pertama yatim (L-13); G1 trail tidak mencatat proyek
 *   hasil ensuring (L-01); G2 storage down → commit ok tetapi audit +
 *   persistensi hilang diam-diam, replay mati (L-04); G3 live-bind
 *   tidak tersimpan sampai autosave berikutnya, cabang LLM tidak
 *   meng-autosave (L-10); G4 recordResultToMemory no-op untuk commit
 *   tanpa proyek aktif (S3D-G4); G5 tanpa allowlist — tool yang tidak
 *   diiklankan tetap dieksekusi di kanal chat-ai DAN copilot (L-16);
 *   E.8 toolCreateRabDraft tanpa hook + jendela bocor autosave (L-15).
 *
 * LABEL BATASAN (berlaku untuk seluruh verifikasi F-ISO-4):
 *   F-ISO-4 BROWSER E2E NOT VERIFIED — TOOL REMAINS LATENT BY DESIGN
 * Hook F-ISO-4 terbukti di level registry (suite ini + ISO4 14/14),
 * BUKAN lewat browser — tidak ada skenario E2E yang dapat memicu tool
 * ini dari UI produksi, dan Skenario B master prompt tidak dapat
 * dijalankan sebagaimana ditulis tanpa expose (yang dilarang Outcome B).
 *
 * BATAS UJI (jujur): ensurer, store proyek, flush render, efek migrasi,
 * persistActiveDraft, dan persistMessage adalah MODEL setia pada
 * view.tsx (pola probe S3-D + ISO4) — bukan React yang berjalan. Yang
 * terbukti deterministik di level registry (R2, urutan
 * finishRecord→hook, replay, setter, validasi, allowlist) tidak
 * bergantung pada model. Yang bergantung pada model: R1 (cabang
 * flush/tidak-flush — hasil browser nyata adalah salah satu cabang,
 * belum dibuktikan yang mana) dan L-14 (urutan migrasi vs persist).
 * Satu utas, satu tab; multi-tab adalah S3-A, bukan S3-D.
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

/* ---------- localStorage shim (node) + saklar "storage down" ---------- */
let throwOnSet = false;
function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      if (throwOnSet) throw new Error('QuotaExceededError (simulasi storage down)');
      map.set(k, String(v));
    },
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
/* Judul draft deterministik dari teks (buildUniversalDraft): kandang →
 * "Pertanian & Perkebunan", gudang → "Gudang" — dipakai sebagai
 * diskriminator identitas draft di L-13 (R2). */

async function main(): Promise<void> {
  console.log('chatIso4LifecycleS3d.test (STAGE 3 S3-D — Outcome B, lifecycle + batasan)');
  const reg = await import('../ai-tools/ezrab-ai/toolRegistry');
  const ct = await import('../ai-tools/ezrab-ai/constructionTools');
  const rab = await import('../ai-tools/ezrab-ai/universalRab');
  const dp = await import('../ai-tools/ezrab-ai/draftPersistence');
  const tp = await import('../ai-tools/ezrab-ai/tempProject');
  const tcp = await import('../ai-tools/ezrab-ai/toolCallParser');
  const mem = await import('../ai-tools/ezrab-ai/memory');

  /* ----- store proyek palsu dengan model render React (pola probe S3-D) -----
   * currentId = source of truth (state konteks, diperbarui sinkron oleh
   * create); liveProjectRef = yang dibaca ensurer — diperbarui HANYA
   * saat render (view.tsx:602-603). Kesenjangan inilah jendela R1. */
  interface FakeProject { id: string; name: string; status: string; creationMethod?: string; description?: string }
  class FakeProjectStore {
    projects: FakeProject[] = [];
    currentId: string | null = null;
    liveProjectRef: FakeProject | null = null;
    seq = 0;
    create(data: Partial<FakeProject> & { name: string }): FakeProject {
      const p: FakeProject = { id: `PRJ-S3D-${++this.seq}`, status: 'draft', ...data };
      this.projects.unshift(p);
      this.currentId = p.id;
      // liveProjectRef TIDAK diperbarui di sini: setState konteks
      // menjadwalkan render; ref baru sinkron sesudah render.
      return p;
    }
    get current(): FakeProject | null {
      return this.projects.find((p) => p.id === this.currentId) ?? null;
    }
    flushRender(): void { this.liveProjectRef = this.current; }
    setCurrent(id: string | null): void { this.currentId = id; this.flushRender(); } // aksi user = render terjadi
    reset(): void { this.projects = []; this.currentId = null; this.liveProjectRef = null; this.seq = 0; }
  }
  const store = new FakeProjectStore();

  /* ----- model percakapan + migrasi (view.tsx:824-827, 1179-1186) ----- */
  const conversations = new Map<string, Array<{ role: string; content: string }>>();
  const convKey = (projectId: string | null) => projectId ?? '__ezrab_ai_global__';
  const convId = 'conv-s3d-1';
  let pendingMigration: { fromProjectId: string; fromConversationId: string; toProjectId: string } | null = null;
  const persistMessageModel = (role: string, content: string) => {
    // Cermin DEFECT-1: resolve proyek LIVE saat persist (bukan saat kirim).
    const pid = store.currentId;
    const key = convKey(pid);
    const list = conversations.get(key) ?? [];
    list.push({ role, content });
    conversations.set(key, list);
    return { key, count: list.length };
  };
  const runMigrationEffectModel = () => {
    if (!pendingMigration) return { migrated: false };
    const from = conversations.get(convKey(pendingMigration.fromProjectId === '__ezrab_ai_global__' ? null : pendingMigration.fromProjectId));
    const m = pendingMigration;
    pendingMigration = null;
    if (!from || from.length === 0) return { migrated: false, to: m.toProjectId };
    const toKey = convKey(m.toProjectId);
    conversations.set(toKey, [...(conversations.get(toKey) ?? []), ...from]);
    return { migrated: true, moved: from.length, to: m.toProjectId };
  };

  /* ----- ensurer tiruan view.tsx:1151-1210 (membaca liveProjectRef) ----- */
  let ensurerCalls = 0;
  let lastSaveOk: boolean | null = null;
  let trailVisibleInsideEnsurer: boolean | null = null;
  let currentKey: string | null = null;
  let currentScope: string | null = null;
  const fakeEnsurer = (draft: { title: string }) => {
    ensurerCalls += 1;
    // L-01: apakah record trail 'succeeded' SUDAH ada saat hook berjalan?
    // (membuktikan finishRecord mendahului ensuring di dalam executeTool)
    try {
      const trail = reg.listToolExecutions(currentScope, 200) as Array<{ toolName: string; status: string; idempotencyKey: string }>;
      trailVisibleInsideEnsurer = trail.some(
        (rec) => rec.toolName === 'build_universal_draft'
          && (rec.status === 'succeeded' || rec.status === 'partially-succeeded')
          && rec.idempotencyKey === currentKey,
      );
    } catch { trailVisibleInsideEnsurer = null; }
    const live = store.liveProjectRef;
    if (live) return { id: live.id, name: live.name, created: false };
    const created = store.create({
      name: tp.tempProjectNameForDraft(draft.title),
      status: 'draft',
      creationMethod: tp.TEMP_PROJECT_CREATION_METHOD,
      description: tp.tempProjectDescriptionForDraft(draft.title),
    });
    if (convId) {
      pendingMigration = { fromProjectId: convKey(store.currentId === created.id ? null : store.currentId), fromConversationId: convId, toProjectId: created.id };
    }
    if (tp.isUniversalDraft(draft as never)) {
      try {
        const res = dp.saveDraft({ draft: draft as never, projectId: created.id, conversationId: convId, workflowStage: 'autosave', savedBy: 'autosave' });
        lastSaveOk = res.ok;
      } catch { lastSaveOk = false; }
    }
    return { id: created.id, name: created.name, created: true };
  };

  /* ----- model persistActiveDraft view.tsx:1066-1080 ----- */
  const persistActiveDraftModel = (effProjectId: string | null) => {
    const d = rab.getLastUniversalDraft(effProjectId);
    if (!d || !effProjectId) return { saved: false, reason: !d ? 'getLastUniversalDraft=null' : 'tanpa effProject' };
    const res = dp.saveDraft({ draft: d, projectId: effProjectId, conversationId: convId, workflowStage: 'autosave', savedBy: 'autosave' });
    return { saved: res.ok, draftId: d.id, error: res.ok ? null : (res as { error?: string }).error };
  };

  let keySeq = 0;
  const nextKey = (tag: string) => `s3d-${tag}-${++keySeq}`;
  const execDraft = (text: string, opts: { projectId?: string | null; argsProjectId?: string | null; key: string; channel?: string }) => {
    currentKey = opts.key;
    currentScope = opts.projectId ?? null;
    return reg.executeTool({
      toolName: 'build_universal_draft',
      args: opts.argsProjectId ? { text, projectId: opts.argsProjectId } : { text },
      projectId: opts.projectId ?? null,
      actor: 'model',
      channel: opts.channel ?? 'chat-ai',
      idempotencyKey: opts.key,
    });
  };

  const resetAll = () => {
    reg.__resetToolRegistryForTests();
    rab.clearLastUniversalDraft();
    tp.setDraftProjectEnsurer(null);
    store.reset();
    storage.clear();
    conversations.clear();
    pendingMigration = null;
    ensurerCalls = 0;
    lastSaveOk = null;
    trailVisibleInsideEnsurer = null;
    currentKey = null;
    currentScope = null;
    throwOnSet = false;
  };
  const registerEnsurer = () => tp.setDraftProjectEnsurer(fakeEnsurer as never);

  await check('S3D-L01 urutan commit: finishRecord mendahului ensuring; trail tidak mencatat proyek hasil ensuring (G1)', async () => {
    resetAll(); registerEnsurer();
    const r = await execDraft(KANDANG, { key: nextKey('L01') });
    assert(r.ok === true, 'eksekusi harus ok');
    assert(r.record.status === 'succeeded' || r.record.status === 'partially-succeeded', `status harus sukses/parsial, dapat "${r.record.status}"`);
    assert(trailVisibleInsideEnsurer === true, 'record trail succeeded/partially-succeeded SUDAH harus terlihat dari dalam ensurer (finishRecord mendahului ensuring)');
    assert(ensurerCalls === 1, `ensurer 1×, dapat ${ensurerCalls}×`);
    assert(store.projects.length === 1, 'tepat 1 proyek sementara');
    const binding = rab.getLastUniversalDraftProjectId();
    assert(binding === store.projects[0].id, 'binding harus ke proyek sementara');
    // G1 (BATASAN TERDOKUMENTASI): record trail memakai projectId SCOPE
    // (null), bukan proyek hasil ensuring — commit tool yang membuat
    // proyek sementara tercatat di bawah __no-project__ dan tidak dapat
    // ditelusur dari proyeknya. Menunggu O-S3D-4 (trail mencatat
    // ensuredProjectId).
    const trail = reg.listToolExecutions(null, 200) as Array<{ toolName: string; status: string; projectId: string | null }>;
    const mine = trail.find((t) => t.toolName === 'build_universal_draft' && (t.status === 'succeeded' || t.status === 'partially-succeeded'));
    assert(mine !== undefined, 'record trail harus ada');
    assert(mine!.projectId === null, `G1: trail projectId harus null (scope), dapat "${mine!.projectId}"`);
    assert(mine!.projectId !== binding, 'G1: trail projectId BERBEDA dari binding (celah keterlacakan)');
    store.flushRender();
  });

  await check('S3D-L02 invoke gagal (teks sampah) → 0 proyek, 0 ensurer, singleton null', async () => {
    resetAll(); registerEnsurer();
    const r = await execDraft(GARBAGE, { key: nextKey('L02') });
    assert(r.ok === false, 'teks sampah harus gagal');
    assert(r.record.status === 'failed', `status harus failed, dapat "${r.record.status}"`);
    assert(r.errorCode === 'OUTPUT_VALIDATION_FAILED', `kode harus OUTPUT_VALIDATION_FAILED, dapat "${r.errorCode}"`);
    assert(rab.getLastUniversalDraft() === null, 'singleton harus tetap null');
    assert(rab.getLastUniversalDraftProjectId() === null, 'binding harus null');
    assert(ensurerCalls === 0, `ensurer tidak boleh dipanggil saat build gagal, dapat ${ensurerCalls}×`);
    assert(store.projects.length === 0, 'tidak boleh ada proyek');
  });

  await check('S3D-L03 validasi output gagal sesudah draft terikat → singleton + binding + ensurer tidak berubah', async () => {
    resetAll(); registerEnsurer();
    const first = await execDraft(KANDANG, { key: nextKey('L03a') });
    assert(first.ok === true, 'draft pertama harus ok');
    store.flushRender();
    const boundId = rab.getLastUniversalDraft()?.id ?? null;
    const boundProject = rab.getLastUniversalDraftProjectId();
    const callsBefore = ensurerCalls;
    const bad = await execDraft(GARBAGE, { key: nextKey('L03b') });
    assert(bad.ok === false, 'panggilan sampah harus gagal');
    assert(bad.errorCode === 'OUTPUT_VALIDATION_FAILED', `kode harus OUTPUT_VALIDATION_FAILED, dapat "${bad.errorCode}"`);
    assert(rab.getLastUniversalDraft()?.id === boundId, 'singleton harus tetap memegang draft pertama');
    assert(rab.getLastUniversalDraftProjectId() === boundProject, 'binding harus tetap');
    assert(ensurerCalls === callsBefore, 'ensurer tidak boleh dipanggil lagi');
    // Catatan: build-sukses + validasi-output-gagal tidak tercapai untuk
    // tool ini — formatUniversalDraftMessage selalu diawali "Siap — ini
    // draft RAB …" (universalRab.ts:3672), tidak pernah kosong/"ERROR:";
    // satu-satunya jalur OUTPUT_VALIDATION_FAILED adalah string ERROR
    // invoke (kind!=draft) yang tidak pernah menulis singleton.
  });

  await check('S3D-L04 storage down (G2): commit tetap ok, trail kosong, saveDraft gagal, retry tidak ter-replay', async () => {
    resetAll(); registerEnsurer();
    throwOnSet = true; // semua saveVersioned gagal diam-diam (QUOTA/UNKNOWN)
    const l04key = nextKey('L04');
    const r = await execDraft(KANDANG, { key: l04key });
    assert(r.ok === true, 'G2: commit TETAP ok walau storage down');
    assert(ensurerCalls === 1, 'ensurer tetap dipanggil 1×');
    const binding = rab.getLastUniversalDraftProjectId();
    assert(binding !== null, 'binding tetap dibuat walau storage down');
    assert(lastSaveOk === false, 'G2: saveDraft ensurer gagal (storage down)');
    const trail = reg.listToolExecutions(null, 200) as Array<unknown>;
    assert(trail.length === 0, 'G2: trail KOSONG — audit hilang diam-diam');
    assert(dp.loadDraft(binding as string).ok === false, 'G2: draft tidak tersimpan (persistensi hilang diam-diam)');
    // Retry kunci SAMA: tanpa trail, replay tidak mungkin → invoke ulang.
    // (Dan tanpa flush render, retry membuat proyek ke-2 — mekanisme R1.)
    const retry = await execDraft(KANDANG, { key: l04key });
    assert((retry.record as { replayed?: boolean }).replayed !== true, 'G2: retry kunci sama TIDAK ter-replay (trail hilang)');
    assert(retry.ok === true, 'retry tetap ok');
    assert(store.projects.length === 2, 'G2+R1: retry tanpa flush membuat proyek sementara ke-2');
    assert(ensurerCalls === 2, 'ensurer dipanggil ke-2 kalinya pada retry');
    throwOnSet = false;
    store.flushRender();
  });

  await check('S3D-L05 commit segar sukses → binding proyek sementara + tersimpan + migrasi tercatat', async () => {
    resetAll(); registerEnsurer();
    const r = await execDraft(KANDANG, { key: nextKey('L05') });
    assert(r.ok === true, 'eksekusi harus ok');
    assert(r.record.status === 'succeeded' || r.record.status === 'partially-succeeded', `status harus sukses/parsial, dapat "${r.record.status}"`);
    assert(ensurerCalls === 1, 'ensurer 1×');
    assert(store.projects.length === 1, 'tepat 1 proyek');
    const temp = store.projects[0];
    assert(/^RAB .+ \(Sementara\)$/.test(temp.name), `nama harus berpola "RAB <judul> (Sementara)", dapat "${temp.name}"`);
    assert(temp.creationMethod === 'chat-ai', `creationMethod harus 'chat-ai', dapat "${temp.creationMethod}"`);
    assert(rab.getLastUniversalDraftProjectId() === temp.id, 'binding harus ke proyek sementara');
    assert(lastSaveOk === true, 'draft harus tersimpan oleh ensurer (saveDraft ok)');
    assert(dp.loadDraft(temp.id).ok, 'loadDraft proyek sementara harus ok');
    assert(pendingMigration?.toProjectId === temp.id, 'migrasi percakapan harus tercatat ke proyek sementara');
    store.flushRender();
  });

  await check('S3D-L06 replay idempotensi → tanpa binding ulang, tanpa proyek duplikat, singleton tidak dibangun ulang', async () => {
    resetAll(); registerEnsurer();
    const key = nextKey('L06');
    const first = await execDraft(KANDANG, { key });
    assert(first.ok === true, 'eksekusi pertama harus ok');
    store.flushRender();
    const tempId = store.projects[0].id;
    rab.setLastUniversalDraft(null, null); // kosongkan: apakah replay membangun ulang?
    const second = await execDraft(KANDANG, { key });
    assert(second.ok === true, 'replay harus ok');
    assert((second.record as { replayed?: boolean }).replayed === true, 'eksekusi kedua harus replayed');
    assert(ensurerCalls === 1, `ensurer tetap 1× sesudah replay, dapat ${ensurerCalls}×`);
    assert(store.projects.length === 1, 'tetap 1 proyek sesudah replay');
    assert(rab.getLastUniversalDraft() === null, 'replay TIDAK membangun ulang singleton');
    assert(dp.loadDraft(tempId).ok, 'draft pertama tetap tersimpan di bawah proyek sementara');
  });

  await check('S3D-L07 binding lama dipertahankan: args.projectId, draft kedua proyek sama, undefined mempertahankan', async () => {
    resetAll(); registerEnsurer();
    // (a) args.projectId → terikat ke sana, ensurer 0×.
    const a = await execDraft(KANDANG, { projectId: 'PROJ-ARGS-Y', argsProjectId: 'PROJ-ARGS-Y', key: nextKey('L07a') });
    assert(a.ok === true, 'eksekusi (a) harus ok');
    assert(rab.getLastUniversalDraftProjectId() === 'PROJ-ARGS-Y', 'binding (a) harus ke projectId args');
    assert(ensurerCalls === 0, `ensurer (a) 0×, dapat ${ensurerCalls}×`);
    // (b) draft kedua memakai proyek sementara yang sama (render sempat flush).
    resetAll(); registerEnsurer();
    await execDraft(KANDANG, { key: nextKey('L07b1') });
    store.flushRender(); // React me-render antara dua pengiriman
    const tempId = store.projects[0].id;
    const second = await execDraft(GUDANG, { key: nextKey('L07b2') });
    assert(second.ok === true, 'draft kedua harus ok');
    assert(store.projects.length === 1, 'draft kedua tidak boleh membuat proyek lagi');
    assert(rab.getLastUniversalDraftProjectId() === tempId, 'draft kedua terikat ke proyek sementara yang sama');
    // (c) setLastUniversalDraft(d) tanpa argumen projectId (undefined)
    // mempertahankan ikatan lama.
    const d = rab.getLastUniversalDraft();
    rab.setLastUniversalDraft(d as never);
    assert(rab.getLastUniversalDraftProjectId() === tempId, 'undefined (argumen hilang) mempertahankan ikatan');
    rab.setLastUniversalDraft(d as never, undefined);
    assert(rab.getLastUniversalDraftProjectId() === tempId, 'undefined eksplisit mempertahankan ikatan');
  });

  await check('S3D-L08 setter null-vs-undefined: null eksplisit menghapus ikatan, undefined mempertahankan, null draft menghapus keduanya', async () => {
    resetAll(); registerEnsurer();
    await execDraft(KANDANG, { key: nextKey('L08') });
    store.flushRender();
    const tempId = rab.getLastUniversalDraftProjectId();
    const d = rab.getLastUniversalDraft();
    assert(d !== null && tempId !== null, 'prasyarat: draft terikat ada');
    rab.setLastUniversalDraft(d as never, null); // null EKSPLISIT → hapus ikatan
    assert(rab.getLastUniversalDraftProjectId() === null, 'null eksplisit menghapus ikatan');
    assert(rab.getLastUniversalDraft()?.id === d!.id, 'null eksplisit TIDAK menghapus draft');
    rab.setLastUniversalDraft(d as never, tempId); // pulihkan
    rab.setLastUniversalDraft(d as never); // undefined → pertahankan
    assert(rab.getLastUniversalDraftProjectId() === tempId, 'undefined mempertahankan ikatan');
    rab.setLastUniversalDraft(null); // null draft → hapus keduanya
    assert(rab.getLastUniversalDraft() === null && rab.getLastUniversalDraftProjectId() === null, 'setLastUniversalDraft(null) menghapus draft + ikatan');
  });

  await check('S3D-L09 ensurer gagal (melempar / null) → hasil tool tetap ok, draft tampil tanpa ikatan', async () => {
    resetAll();
    tp.setDraftProjectEnsurer((() => { throw new Error('createProject gagal (simulasi)'); }) as never);
    const t = await execDraft(KANDANG, { key: nextKey('L09a') });
    assert(t.ok === true, 'ensurer melempar: hasil tool harus TETAP ok');
    assert(rab.getLastUniversalDraft() !== null && rab.getLastUniversalDraftProjectId() === null, 'ensurer melempar: draft tampil tanpa ikatan');
    assert(store.projects.length === 0, 'ensurer melempar: 0 proyek');
    resetAll();
    tp.setDraftProjectEnsurer((() => null) as never);
    const n = await execDraft(KANDANG, { key: nextKey('L09b') });
    assert(n.ok === true, 'ensurer null: hasil tool harus TETAP ok');
    assert(rab.getLastUniversalDraft() !== null && rab.getLastUniversalDraftProjectId() === null, 'ensurer null: draft tampil tanpa ikatan');
    assert(store.projects.length === 0, 'ensurer null: 0 proyek');
  });

  await check('S3D-L10 autosave pasca-commit: temp sudah tersimpan; live-bind tidak tersimpan sampai autosave (G3)', async () => {
    resetAll(); registerEnsurer();
    // (a) Kasus temp: ensurer SUDAH saveDraft saat commit.
    await execDraft(KANDANG, { key: nextKey('L10a') });
    store.flushRender();
    const tempId = store.projects[0].id;
    assert(dp.loadDraft(tempId).ok === true, 'temp: draft sudah tersimpan sebelum autosave (ensurer menyimpan SEKARANG)');
    const wrong = persistActiveDraftModel('PROJ-LAIN');
    assert(wrong.saved === false, 'temp: autosave di bawah proyek lain DITOLAK');
    assert(dp.loadDraft('PROJ-LAIN').ok === false, 'temp: tidak ada record di bawah proyek lain');
    // (b) Kasus proyek LIVE: ensurer mengikat TANPA saveDraft (cermin
    // view.tsx:1156-1157) — draft belum tersimpan sampai autosave
    // berikutnya; cabang balasan LLM TIDAK meng-autosave
    // (view.tsx:3189-3212). G3 (BATASAN TERDOKUMENTASI): draft tool +
    // proyek live mengendap tak-tersimpan sampai pemicu berikutnya;
    // hilang bila tab ditutup sebelumnya. Menunggu O-S3D-6.
    resetAll(); registerEnsurer();
    const live = store.create({ name: 'Proyek Live' });
    store.flushRender();
    await execDraft(KANDANG, { key: nextKey('L10b') });
    assert(rab.getLastUniversalDraftProjectId() === live.id, 'live: binding harus ke proyek live');
    assert(lastSaveOk === null, 'G3: ensurer live-bind TIDAK memanggil saveDraft');
    assert(dp.loadDraft(live.id).ok === false, 'G3: draft BELUM tersimpan sebelum autosave');
    const autosave = persistActiveDraftModel(live.id);
    assert(autosave.saved === true, 'live: autosave berikutnya menyimpan draft');
    assert(dp.loadDraft(live.id).ok === true, 'live: draft tersimpan sesudah autosave');
  });

  await check('S3D-L11 ganti proyek aktif sesudah commit → binding tetap temp, autosave di bawah proyek lain ditolak', async () => {
    resetAll(); registerEnsurer();
    await execDraft(KANDANG, { key: nextKey('L11') });
    store.flushRender();
    const tempId = store.projects[0].id;
    const draftId = rab.getLastUniversalDraft()?.id ?? null;
    // Pengguna pindah ke proyek lain (aksi UI → render terjadi).
    const other = store.create({ name: 'Proyek Lain' });
    store.setCurrent(other.id);
    assert(rab.getLastUniversalDraftProjectId() === tempId, 'binding tetap temp sesudah ganti proyek');
    assert(rab.getLastUniversalDraft(other.id) === null, 'getter untuk proyek lain harus null');
    const save = persistActiveDraftModel(other.id);
    assert(save.saved === false, 'autosave di bawah proyek lain harus DITOLAK');
    assert(dp.loadDraft(other.id).ok === false, 'tidak ada record di bawah proyek lain');
    const loaded = dp.loadDraft(tempId);
    assert(loaded.ok && (loaded as { draft?: { id?: string } }).draft?.id === draftId, 'draft utuh di bawah proyek sementara');
  });

  await check('S3D-L12 RACE R1 [BATASAN TERDOKUMENTASI]: dua panggilan sekuensial tanpa flush render → 2 proyek sementara; dengan flush → 1', async () => {
    // R1 — BUKAN perilaku ideal. Ensurer membaca liveProjectRef yang
    // hanya diperbarui saat render (view.tsx:602-603,1155); createProject
    // di hook #1 menjadwalkan render, bukan sinkron. Loop service
    // (service.ts:228-252) memanggil executeTool kedua dalam kelanjutan
    // microtask yang sama — bila render belum flush, ensurer melihat
    // liveProjectRef = null → proyek sementara KEDUA. Tes ini mem-pin
    // jendela itu agar perbaikan di masa depan (O-S3D-4: ensurer membaca
    // store proyek sinkron / serialisasi commit) terdeteksi sebagai
    // perubahan perilaku — tes ini SENGAJA MERAH sesudah perbaikan.
    // (a) TANPA flushRender di antara dua panggilan.
    resetAll(); registerEnsurer();
    await execDraft(KANDANG, { key: nextKey('L12a1') });
    // TIDAK ada flushRender — seperti loop service yang memanggil
    // executeTool kedua dalam kelanjutan microtask yang sama.
    await execDraft(GUDANG, { key: nextKey('L12a2') });
    assert(store.projects.length === 2, `R1: tanpa flush harus ada 2 proyek sementara, dapat ${store.projects.length}`);
    assert(ensurerCalls === 2, `R1: ensurer 2×, dapat ${ensurerCalls}×`);
    const temp2 = store.projects[0]; // unshift: terbaru di depan
    const temp1 = store.projects[1];
    assert(rab.getLastUniversalDraftProjectId() === temp2.id, 'R1: binding pindah ke proyek sementara ke-2');
    assert(dp.loadDraft(temp1.id).ok === true, 'R1: draft pertama tersimpan di bawah temp ke-1');
    assert(dp.loadDraft(temp2.id).ok === true, 'R1: draft kedua tersimpan di bawah temp ke-2');
    assert(pendingMigration?.toProjectId === temp2.id, 'R1: migrasi percakapan tertimpa ke temp ke-2');
    // (b) DENGAN flushRender di antara (render sempat jalan) → 1 proyek.
    resetAll(); registerEnsurer();
    await execDraft(KANDANG, { key: nextKey('L12b1') });
    store.flushRender();
    await execDraft(GUDANG, { key: nextKey('L12b2') });
    assert(store.projects.length === 1, `R1 kontrol: dengan flush harus 1 proyek, dapat ${store.projects.length}`);
    assert(rab.getLastUniversalDraftProjectId() === store.projects[0].id, 'R1 kontrol: binding ke proyek sementara yang sama');
  });

  await check('S3D-L13 RACE R2 [BATASAN TERDOKUMENTASI]: dua panggilan konkuren → hook mengikat draft kedua, draft pertama yatim', async () => {
    // R2 — BUKAN perilaku ideal. Hook F-ISO-4 membaca
    // getLastUniversalDraft() apa adanya, bukan draft yang dibangun
    // invoke-nya sendiri (hasil invoke hanya membawa {draftVersion,
    // title, itemCount}, tanpa id draft). Invoke berjalan sinkron
    // tetapi `await Promise.race(...)` (toolRegistry.ts:1329-1334)
    // menghasilkan titik yield SEBELUM validasi + hook; panggilan kedua
    // menimpa singleton di celah itu. Deterministik di level registry
    // (tanpa React). Perbaikan menunggu O-S3D-4 (hook ter-scope invoke).
    resetAll(); registerEnsurer();
    const [ra, rb] = await Promise.all([
      execDraft(KANDANG, { key: nextKey('L13a') }),
      execDraft(GUDANG, { key: nextKey('L13b') }),
    ]);
    assert(ra.ok === true && rb.ok === true, 'kedua panggilan harus ok');
    assert(ensurerCalls === 1, `R2: ensurer 1× (hook kedua melihat draft sudah terikat), dapat ${ensurerCalls}×`);
    assert(store.projects.length === 1, 'R2: 1 proyek sementara');
    const tempId = store.projects[0].id;
    assert(rab.getLastUniversalDraftProjectId() === tempId, 'R2: binding ke proyek sementara');
    const singleton = rab.getLastUniversalDraft();
    const loaded = dp.loadDraft(tempId);
    assert(singleton !== null, 'R2: singleton harus ada');
    assert(loaded.ok, 'R2: draft tersimpan harus ada');
    // Hook mengikat draft KEDUA (gudang): singleton + record tersimpan
    // adalah gudang, sementara output A (kandang) tetap dikembalikan ke
    // model — draft kandang yatim (tidak terikat, tidak tersimpan,
    // tidak dapat dipulihkan, tetapi teksnya tampil sebagai jawaban).
    assert(singleton!.title === 'Gudang', `R2: singleton harus draft KEDUA (Gudang), dapat "${singleton!.title}"`);
    assert((loaded as { draft: { id: string } }).draft.id === singleton!.id, 'R2: record tersimpan harus draft yang sama dengan singleton (kedua)');
    assert(typeof ra.output === 'string' && (ra.output as string).toLowerCase().includes('kandang'), 'R2: output A (kandang) tetap dikembalikan ke model');
    assert(typeof rb.output === 'string' && (rb.output as string).toLowerCase().includes('gudang'), 'R2: output B (gudang) dikembalikan ke model');
    store.flushRender();
  });

  await check('S3D-L14 urutan vs persistMessage: balasan tool dipersist di bawah percakapan proyek sementara', async () => {
    resetAll(); registerEnsurer();
    // Pesan user dipersist SEBELUM tool commit (kunci global, tanpa proyek).
    persistMessageModel('user', KANDANG);
    assert((conversations.get('__ezrab_ai_global__') ?? []).length === 1, 'pesan user harus di bawah kunci global sebelum commit');
    const r = await execDraft(KANDANG, { key: nextKey('L14') });
    assert(r.ok === true, 'eksekusi harus ok');
    const tempId = store.projects[0]?.id ?? null;
    assert(tempId !== null, 'proyek sementara harus dibuat');
    // Efek muat-percakapan berjalan sesudah re-render (migrasi).
    store.flushRender();
    const mig = runMigrationEffectModel();
    assert(mig.migrated === true, 'migrasi percakapan harus berjalan');
    // Balasan tool dipersist SESUDAH commit (cabang LLM view.tsx:3192):
    // persistMessage me-resolve proyek live → percakapan temp.
    const reply = persistMessageModel('assistant', typeof r.output === 'string' ? (r.output as string).slice(0, 60) : '');
    assert(reply.key === convKey(tempId), 'balasan harus dipersist di bawah percakapan temp');
    const tempConv = conversations.get(convKey(tempId)) ?? [];
    assert(tempConv.length === 2 && tempConv[0].role === 'user' && tempConv[1].role === 'assistant', 'percakapan temp harus berisi pesan user + balasan tool (pola DEFECT-1 berlaku untuk jalur tool pada model ini)');
  });

  await check('S3D-L15 toolCreateRabDraft [BATASAN TERDOKUMENTASI, E.8]: wrapper kedua tanpa hook — draft tak-terikat bocor lewat autosave', async () => {
    // E.8 (LAPORAN F-ISO-45 §E butir 8) — BUKAN perilaku ideal.
    // toolCreateRabDraft (constructionTools.ts:99-104) memanggil
    // buildUniversalDraft langsung, tanpa executeTool → tanpa hook
    // F-ISO-4 → tanpa ensurer. Tanpa pemanggil produksi (hanya tes
    // B-07–B-09), tetapi jendela bocornya terbuka: draft tak-terikat +
    // autosave di bawah proyek aktif APA PUN (getter lolos bila ikatan
    // null) → tersimpan di bawah proyek itu. Menunggu O-S3D-5 (hook /
    // depresiasi / dibiarkan dengan sadar).
    resetAll(); registerEnsurer();
    const live = store.create({ name: 'Proyek Aktif' });
    store.flushRender();
    const res = ct.toolCreateRabDraft({ text: KANDANG });
    assert(res.kind === 'draft', 'wrapper harus menghasilkan draft');
    assert(rab.getLastUniversalDraftProjectId() === null, 'E.8: binding null (tanpa hook)');
    assert(ensurerCalls === 0, `E.8: ensurer 0×, dapat ${ensurerCalls}×`);
    assert(store.projects.length === 1, 'E.8: tidak ada proyek sementara baru (hanya proyek aktif yang sudah ada)');
    const save = persistActiveDraftModel(live.id);
    assert(save.saved === true, 'E.8: autosave di bawah proyek aktif MENYIMPAN draft tak-terikat itu (jendela bocor)');
    assert(dp.loadDraft(live.id).ok === true, 'E.8: record draft ada di bawah proyek aktif');
  });

  await check('S3D-L16 tanpa allowlist (G5) [BATASAN TERDOKUMENTASI]: tool yang tidak diiklankan dieksekusi di kanal chat-ai DAN copilot', async () => {
    // G5 — BUKAN perilaku ideal. scanToolCalls (toolCallParser.ts:53-116)
    // menerima blok JSON {"tool": "<nama>", ...} apa pun dari teks model
    // TANPA memeriksa nama tool terhadap daftar yang diizinkan; kedua
    // situs produksi (service.ts:237, coAssistantService.ts:711)
    // meneruskan call.toolName langsung ke executeTool. Status "laten"
    // saat ini bergantung sepenuhnya pada model yang tidak
    // menghalusinasikan nama tool — bukan pada gerbang keamanan.
    // Klaim komentar coAssistantService.ts:703-706 ("tool tulis diblokir
    // registry per kanal") dan system prompt Copilot ("registry
    // memblokirnya") SALAH untuk tool ini: kanalnya memuat 'copilot'
    // dan permission-nya bukan 'consequential'. Menunggu O-S3D-4.
    resetAll(); registerEnsurer();
    const modelText = `Baik, saya susunkan draftnya.\n{"tool":"build_universal_draft","args":{"text":"${KANDANG}"}}\nSemoga membantu.`;
    const scan = tcp.scanToolCalls(modelText);
    assert(scan.calls.some((c: { toolName: string }) => c.toolName === 'build_universal_draft'), 'G5: scanToolCalls menerima build_universal_draft dari teks model (tanpa allowlist)');
    assert(scan.malformed === false, 'teks model harus ter-parse bersih (bukan malformed)');
    // Eksekusi persis seperti service.ts:237 (chat-ai) …
    const chatAi = await execDraft(KANDANG, { key: nextKey('L16a'), channel: 'chat-ai' });
    assert(chatAi.ok === true, 'G5: executeTool sukses di kanal chat-ai');
    assert(rab.getLastUniversalDraftProjectId() === store.projects[0]?.id, 'G5: binding ke proyek sementara di kanal chat-ai');
    // … dan seperti coAssistantService.ts:711 (copilot) — meski prompt
    // Copilot menyatakan jalur itu read-only + "registry memblokirnya".
    resetAll(); registerEnsurer();
    const copilot = await execDraft(KANDANG, { key: nextKey('L16b'), channel: 'copilot' });
    assert(copilot.ok === true, 'G5: executeTool sukses di kanal copilot (klaim "registry memblokir" SALAH untuk tool ini)');
    assert(rab.getLastUniversalDraftProjectId() === store.projects[0]?.id, 'G5: binding ke proyek sementara di kanal copilot');
    assert(ensurerCalls === 1, 'G5: ensurer dipanggil 1× di kanal copilot');
    store.flushRender();
  });

  await check('S3D-G4 recordResultToMemory [BATASAN TERDOKUMENTASI]: commit tanpa proyek aktif tidak terekam di memori Fase 2', async () => {
    // G4 — BUKAN perilaku ideal. recordResultToMemory
    // (toolRegistry.ts:1140-1176) no-op bila record.projectId null —
    // dan record memakai projectId SCOPE, bukan proyek hasil ensuring.
    // Akibatnya: hasil tool draft yang membuat proyek sementara TIDAK
    // pernah masuk memori Fase 2. Menunggu O-S3D-4 (trail + memori
    // mencatat ensuredProjectId).
    resetAll(); registerEnsurer();
    const r = await execDraft(KANDANG, { key: nextKey('G4a') });
    assert(r.ok === true, 'eksekusi harus ok');
    const tempId = store.projects[0]?.id ?? null;
    assert(tempId !== null, 'proyek sementara harus dibuat');
    const underTemp = mem.listMemories({ userId: null, projectId: tempId, conversationId: null });
    assert(underTemp.ok === true, 'listMemories harus ok');
    assert(underTemp.ok && !underTemp.value.some((m) => m.memoryKey === 'tool-result:build_universal_draft'), 'G4: TIDAK ada record memori tool-result di bawah proyek sementara hasil ensuring');
    // Kontrol positif: commit DENGAN scope proyek → memori terekam.
    resetAll(); registerEnsurer();
    const scoped = await execDraft(KANDANG, { projectId: 'PROJ-ARGS-Y', argsProjectId: 'PROJ-ARGS-Y', key: nextKey('G4b') });
    assert(scoped.ok === true, 'eksekusi kontrol harus ok');
    const underScope = mem.listMemories({ userId: null, projectId: 'PROJ-ARGS-Y', conversationId: null });
    assert(underScope.ok === true, 'listMemories kontrol harus ok');
    assert(underScope.ok && underScope.value.some((m) => m.memoryKey === 'tool-result:build_universal_draft'), 'G4 kontrol: record memori tool-result HARUS ada untuk commit ber-scope proyek');
  });

  console.log(`\nchatIso4LifecycleS3d: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(`FAILURES: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
