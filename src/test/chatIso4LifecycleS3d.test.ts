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
 *   L-06); commit segar → binding proyek yang SUDAH ADA, tersimpan
 *   HANYA sesudah autosave (L-05, G3); setter null-vs-undefined
 *   (L-08); ensurer gagal → tool tetap ok (L-09); autosave + ganti
 *   proyek tidak bocor (L-10, L-11); persistMessage ke percakapan
 *   proyek aktif (L-14).
 * - BATASAN TERDOKUMENTASI (bukan perilaku ideal — tes mem-pin perilaku
 *   SAAT INI sebagai pendeteksi perubahan; bila perbaikan mendarat,
 *   tes ini SENGAJA MERAH sampai diperbarui bersama keputusan owner):
 *   R1 DITUTUP §4.5 (L-12 ditulis ulang — tanpa pembuatan proyek
 *   implisit, jendela "2 proyek sementara" tidak lagi ada); R2 dua
 *   panggilan konkuren → hook mengikat draft kedua, draft pertama
 *   yatim (L-13); G1 trail tidak mencatat proyek hasil ensuring
 *   (L-01); G2 storage down → commit ok tetapi audit + persistensi
 *   hilang diam-diam, replay mati (L-04); G3 live-bind tidak
 *   tersimpan sampai autosave berikutnya, cabang LLM tidak
 *   meng-autosave (L-10); G4 recordResultToMemory no-op untuk commit
 *   tanpa proyek aktif (S3D-G4); G5 **DITUTUP P1 (WC-03)** — allowlist
 *   model-callable mendarat 2026-11-24 (direktif owner): model yang
 *   mengemisikan build_universal_draft kini DITOLAK di kedua kanal
 *   (L-16 ditulis ulang untuk mem-pin penolakan itu); E.8
 *   toolCreateRabDraft tanpa hook + jendela bocor autosave (L-15).
 *
 * PASCA-P1 (WC-03 + §4.5): execDraft memakai aktor 'system' (jalur
 * orkestrator internal yang sah) — model TIDAK BOLEH memanggil tool
 * ini. PASCA-FAST-TRACK §3(g) (W-AUTH2, 2026-11-24): tiruan ensurer
 * mengikuti KONTRAK §4.5 — mengembalikan proyek aktif yang SUDAH ADA
 * (dari liveProjectRef, cermin view.tsx) atau null; TIDAK PERNAH
 * membuat proyek, TIDAK PERNAH memanggil saveDraft, TIDAK mencatat
 * migrasi. Versi lama suite ini memakai double pembuat proyek
 * sementara; penjaga level-registry di
 * tempProject.setDraftProjectEnsurer kini MEMBUANG hasil ensurer yang
 * mengembalikan created:true, sehingga seluruh asersi "proyek
 * sementara" DIPERBARUI ke §4.5 (R1 DITUTUP sebagai konsekuensi
 * langsung — tidak ada lagi pembuatan implisit yang bisa berlomba).
 * Ensurer view produksi pasca-§4.5 tidak pernah membuat proyek (dipin
 * chatTempProjectB53 + p1AuthzConfirmation §5).
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

  /* ----- ensurer tiruan view.tsx PASCA-§4.5 (membaca liveProjectRef) -----
   * Fast Track §3(g): mengembalikan proyek aktif yang SUDAH ADA, atau
   * null — TIDAK PERNAH membuat proyek, TIDAK PERNAH memanggil
   * saveDraft, TIDAK mencatat migrasi (ketiganya milik aliran lain
   * pasca-§4.5: pembuatan hanya lewat konfirmasi push eksplisit;
   * penyimpanan lewat autosave; migrasi lewat efek muat percakapan).
   * Pembacaan liveProjectRef (bukan store.current) dipertahankan —
   * model render React yang jujur: proyek yang baru aktif tetapi
   * rendernya belum flush belum terlihat ensurer. */
  let ensurerCalls = 0;
  let lastSaveOk: boolean | null = null;
  let trailVisibleInsideEnsurer: boolean | null = null;
  let currentKey: string | null = null;
  let currentScope: string | null = null;
  const fakeEnsurer = (_draft: { title: string }) => {
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
    return null;
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
  const execDraft = (text: string, opts: { projectId?: string | null; argsProjectId?: string | null; key: string; channel?: string; actor?: 'system' | 'model' }) => {
    currentKey = opts.key;
    currentScope = opts.projectId ?? null;
    return reg.executeTool({
      toolName: 'build_universal_draft',
      args: opts.argsProjectId ? { text, projectId: opts.argsProjectId } : { text },
      projectId: opts.projectId ?? null,
      // WC-03: default 'system' (jalur orkestrator); 'model' hanya untuk
      // L-16 yang mem-pin penolakan allowlist.
      actor: opts.actor ?? 'system',
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
    // §4.5: G1 didemonstrasikan dengan proyek yang SUDAH ADA (bukan
    // proyek sementara buatan ensurer).
    const live = store.create({ name: 'Proyek Live' });
    store.flushRender();
    const r = await execDraft(KANDANG, { key: nextKey('L01') });
    assert(r.ok === true, 'eksekusi harus ok');
    assert(r.record.status === 'succeeded' || r.record.status === 'partially-succeeded', `status harus sukses/parsial, dapat "${r.record.status}"`);
    assert(trailVisibleInsideEnsurer === true, 'record trail succeeded/partially-succeeded SUDAH harus terlihat dari dalam ensurer (finishRecord mendahului ensuring)');
    assert(ensurerCalls === 1, `ensurer 1×, dapat ${ensurerCalls}×`);
    assert(store.projects.length === 1, 'tepat 1 proyek (yang sudah ada — tanpa proyek baru)');
    const binding = rab.getLastUniversalDraftProjectId();
    assert(binding === live.id, 'binding harus ke proyek yang sudah ada');
    // G1 (BATASAN TERDOKUMENTASI): record trail memakai projectId SCOPE
    // (null), bukan proyek hasil ensuring — commit tool yang mengikat
    // draft ke proyek tercatat di bawah __no-project__ dan tidak dapat
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
    // §4.5: prasyarat memakai proyek yang SUDAH ADA (binding non-vacuous).
    const live = store.create({ name: 'Proyek Live' });
    store.flushRender();
    const first = await execDraft(KANDANG, { key: nextKey('L03a') });
    assert(first.ok === true, 'draft pertama harus ok');
    assert(rab.getLastUniversalDraftProjectId() === live.id, 'prasyarat: draft pertama terikat ke proyek live');
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
    // §4.5: binding memakai proyek yang SUDAH ADA; ensurer §4.5 tidak
    // memanggil saveDraft (penyimpanan hanya lewat autosave).
    const live = store.create({ name: 'Proyek Live' });
    store.flushRender();
    throwOnSet = true; // semua saveVersioned gagal diam-diam (QUOTA/UNKNOWN)
    const l04key = nextKey('L04');
    const r = await execDraft(KANDANG, { key: l04key });
    assert(r.ok === true, 'G2: commit TETAP ok walau storage down');
    assert(ensurerCalls === 1, 'ensurer tetap dipanggil 1×');
    const binding = rab.getLastUniversalDraftProjectId();
    assert(binding === live.id, 'binding ke proyek live tetap dibuat walau storage down (binding adalah state memori, bukan storage)');
    assert(lastSaveOk === null, 'ensurer §4.5 tidak memanggil saveDraft');
    const trail = reg.listToolExecutions(null, 200) as Array<unknown>;
    assert(trail.length === 0, 'G2: trail KOSONG — audit hilang diam-diam');
    assert(dp.loadDraft(live.id).ok === false, 'G2: draft tidak tersimpan (persistensi hilang diam-diam)');
    // Retry kunci SAMA: tanpa trail, replay tidak mungkin → invoke ulang.
    // (§4.5: retry TIDAK membuat proyek — ensurer hanya mengikat ulang
    // ke proyek live yang sama; mekanisme "proyek ke-2" R1 sudah tidak ada.)
    const retry = await execDraft(KANDANG, { key: l04key });
    assert((retry.record as { replayed?: boolean }).replayed !== true, 'G2: retry kunci sama TIDAK ter-replay (trail hilang)');
    assert(retry.ok === true, 'retry tetap ok');
    assert(store.projects.length === 1, 'retry tidak membuat proyek (§4.5 — hanya proyek live yang sudah ada)');
    assert(ensurerCalls === 2, 'ensurer dipanggil ke-2 kalinya pada retry');
    assert(rab.getLastUniversalDraftProjectId() === live.id, 'retry mengikat ulang ke proyek live yang sama');
    throwOnSet = false;
    store.flushRender();
  });

  await check('S3D-L05 commit segar sukses → binding proyek yang sudah ada; tersimpan HANYA sesudah autosave (G3)', async () => {
    resetAll(); registerEnsurer();
    const live = store.create({ name: 'Proyek Live' });
    store.flushRender();
    const r = await execDraft(KANDANG, { key: nextKey('L05') });
    assert(r.ok === true, 'eksekusi harus ok');
    assert(r.record.status === 'succeeded' || r.record.status === 'partially-succeeded', `status harus sukses/parsial, dapat "${r.record.status}"`);
    assert(ensurerCalls === 1, 'ensurer 1×');
    assert(store.projects.length === 1, 'tepat 1 proyek (yang sudah ada — tanpa proyek baru)');
    assert(rab.getLastUniversalDraftProjectId() === live.id, 'binding harus ke proyek yang sudah ada');
    assert(lastSaveOk === null, 'G3: ensurer §4.5 TIDAK memanggil saveDraft');
    assert(dp.loadDraft(live.id).ok === false, 'G3: draft BELUM tersimpan sebelum autosave');
    const autosave = persistActiveDraftModel(live.id);
    assert(autosave.saved === true, 'autosave berikutnya menyimpan draft');
    assert(dp.loadDraft(live.id).ok, 'loadDraft proyek pengikat harus ok sesudah autosave');
    assert(pendingMigration === null, '§4.5: ensurer tidak mencatat migrasi percakapan (bukan lagi tugasnya)');
    store.flushRender();
  });

  await check('S3D-L06 replay idempotensi → tanpa binding ulang, tanpa proyek duplikat, singleton tidak dibangun ulang', async () => {
    resetAll(); registerEnsurer();
    const live = store.create({ name: 'Proyek Live' });
    store.flushRender();
    const key = nextKey('L06');
    const first = await execDraft(KANDANG, { key });
    assert(first.ok === true, 'eksekusi pertama harus ok');
    assert(rab.getLastUniversalDraftProjectId() === live.id, 'prasyarat: draft pertama terikat ke proyek live');
    rab.setLastUniversalDraft(null, null); // kosongkan: apakah replay membangun ulang?
    const second = await execDraft(KANDANG, { key });
    assert(second.ok === true, 'replay harus ok');
    assert((second.record as { replayed?: boolean }).replayed === true, 'eksekusi kedua harus replayed');
    assert(ensurerCalls === 1, `ensurer tetap 1× sesudah replay, dapat ${ensurerCalls}×`);
    assert(store.projects.length === 1, 'tetap 1 proyek sesudah replay (yang sudah ada)');
    assert(rab.getLastUniversalDraft() === null, 'replay TIDAK membangun ulang singleton');
    assert(dp.loadDraft(live.id).ok === false, 'G3: live-bind tidak menyimpan — replay tidak mengubah itu');
  });

  await check('S3D-L07 binding lama dipertahankan: args.projectId, draft kedua proyek sama, undefined mempertahankan', async () => {
    resetAll(); registerEnsurer();
    // (a) args.projectId → terikat ke sana, ensurer 0×.
    const a = await execDraft(KANDANG, { projectId: 'PROJ-ARGS-Y', argsProjectId: 'PROJ-ARGS-Y', key: nextKey('L07a') });
    assert(a.ok === true, 'eksekusi (a) harus ok');
    assert(rab.getLastUniversalDraftProjectId() === 'PROJ-ARGS-Y', 'binding (a) harus ke projectId args');
    assert(ensurerCalls === 0, `ensurer (a) 0×, dapat ${ensurerCalls}×`);
    // (b) draft kedua memakai proyek yang sama (render sempat flush).
    resetAll(); registerEnsurer();
    const liveB = store.create({ name: 'Proyek Live' });
    store.flushRender(); // React me-render antara dua pengiriman
    await execDraft(KANDANG, { key: nextKey('L07b1') });
    assert(rab.getLastUniversalDraftProjectId() === liveB.id, 'prasyarat: draft pertama terikat ke proyek live');
    const second = await execDraft(GUDANG, { key: nextKey('L07b2') });
    assert(second.ok === true, 'draft kedua harus ok');
    assert(store.projects.length === 1, 'draft kedua tidak boleh membuat proyek lagi');
    assert(rab.getLastUniversalDraftProjectId() === liveB.id, 'draft kedua terikat ke proyek yang sama');
    // (c) setLastUniversalDraft(d) tanpa argumen projectId (undefined)
    // mempertahankan ikatan lama.
    const d = rab.getLastUniversalDraft();
    rab.setLastUniversalDraft(d as never);
    assert(rab.getLastUniversalDraftProjectId() === liveB.id, 'undefined (argumen hilang) mempertahankan ikatan');
    rab.setLastUniversalDraft(d as never, undefined);
    assert(rab.getLastUniversalDraftProjectId() === liveB.id, 'undefined eksplisit mempertahankan ikatan');
  });

  await check('S3D-L08 setter null-vs-undefined: null eksplisit menghapus ikatan, undefined mempertahankan, null draft menghapus keduanya', async () => {
    resetAll(); registerEnsurer();
    const live = store.create({ name: 'Proyek Live' });
    store.flushRender();
    await execDraft(KANDANG, { key: nextKey('L08') });
    const liveId = rab.getLastUniversalDraftProjectId();
    const d = rab.getLastUniversalDraft();
    assert(d !== null && liveId !== null && liveId === live.id, 'prasyarat: draft terikat ada');
    rab.setLastUniversalDraft(d as never, null); // null EKSPLISIT → hapus ikatan
    assert(rab.getLastUniversalDraftProjectId() === null, 'null eksplisit menghapus ikatan');
    assert(rab.getLastUniversalDraft()?.id === d!.id, 'null eksplisit TIDAK menghapus draft');
    rab.setLastUniversalDraft(d as never, liveId); // pulihkan
    rab.setLastUniversalDraft(d as never); // undefined → pertahankan
    assert(rab.getLastUniversalDraftProjectId() === liveId, 'undefined mempertahankan ikatan');
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

  await check('S3D-L10 autosave pasca-commit: live-bind tidak tersimpan sampai autosave (G3); autosave proyek lain ditolak', async () => {
    resetAll(); registerEnsurer();
    // §4.5: SEMUA ikatan kini live-bind — kasus "temp" lama (ensurer
    // menyimpan SEKARANG) tidak lagi ada; satu-satunya perilaku adalah
    // G3: draft terikat belum tersimpan sampai autosave berikutnya.
    // Cabang balasan LLM TIDAK meng-autosave (view.tsx:3189-3212) —
    // G3 (BATASAN TERDOKUMENTASI): draft tool + proyek live mengendap
    // tak-tersimpan sampai pemicu berikutnya; hilang bila tab ditutup
    // sebelumnya. Menunggu O-S3D-6.
    const live = store.create({ name: 'Proyek Live' });
    store.flushRender();
    await execDraft(KANDANG, { key: nextKey('L10') });
    assert(rab.getLastUniversalDraftProjectId() === live.id, 'live: binding harus ke proyek live');
    assert(lastSaveOk === null, 'G3: ensurer live-bind TIDAK memanggil saveDraft');
    assert(dp.loadDraft(live.id).ok === false, 'G3: draft BELUM tersimpan sebelum autosave');
    const wrong = persistActiveDraftModel('PROJ-LAIN');
    assert(wrong.saved === false, 'autosave di bawah proyek lain DITOLAK');
    assert(dp.loadDraft('PROJ-LAIN').ok === false, 'tidak ada record di bawah proyek lain');
    const autosave = persistActiveDraftModel(live.id);
    assert(autosave.saved === true, 'live: autosave berikutnya menyimpan draft');
    assert(dp.loadDraft(live.id).ok === true, 'live: draft tersimpan sesudah autosave');
  });

  await check('S3D-L11 ganti proyek aktif sesudah commit → binding tetap proyek pengikat, autosave di bawah proyek lain ditolak', async () => {
    resetAll(); registerEnsurer();
    const live = store.create({ name: 'Proyek Live' });
    store.flushRender();
    await execDraft(KANDANG, { key: nextKey('L11') });
    assert(rab.getLastUniversalDraftProjectId() === live.id, 'prasyarat: draft terikat ke proyek live');
    const draftId = rab.getLastUniversalDraft()?.id ?? null;
    // Autosave dulu (live-bind tidak menyimpan — G3) agar ada record
    // yang bisa diperiksa keutuhannya di bawah proyek pengikat.
    const firstSave = persistActiveDraftModel(live.id);
    assert(firstSave.saved === true, 'prasyarat: autosave menyimpan draft di bawah proyek pengikat');
    // Pengguna pindah ke proyek lain (aksi UI → render terjadi).
    const other = store.create({ name: 'Proyek Lain' });
    store.setCurrent(other.id);
    assert(rab.getLastUniversalDraftProjectId() === live.id, 'binding tetap proyek pengikat sesudah ganti proyek');
    assert(rab.getLastUniversalDraft(other.id) === null, 'getter untuk proyek lain harus null');
    const save = persistActiveDraftModel(other.id);
    assert(save.saved === false, 'autosave di bawah proyek lain harus DITOLAK');
    assert(dp.loadDraft(other.id).ok === false, 'tidak ada record di bawah proyek lain');
    const loaded = dp.loadDraft(live.id);
    assert(loaded.ok && (loaded as { draft?: { id?: string } }).draft?.id === draftId, 'draft utuh di bawah proyek pengikat');
  });

  await check('S3D-L12 RACE R1 DITUTUP §4.5: dua panggilan sekuensial tanpa flush render → 0 proyek baru, kedua draft TAK TERIKAT', async () => {
    // R1 DITUTUP Fast Track §3(g) (keputusan §4.5 + penjaga registry).
    // Mekanisme lama: ensurer membaca liveProjectRef yang hanya
    // diperbarui saat render; createProject di hook #1 menjadwalkan
    // render, bukan sinkron — hook #2 melihat liveProjectRef = null →
    // proyek sementara KEDUA. Pasca-§4.5 ensurer TIDAK PERNAH membuat
    // proyek, sehingga jendela itu tidak lagi ada: dua panggilan tanpa
    // flush sama-sama tak terikat, 0 proyek. (Sisa jendela yang masih
    // nyata: proyek yang baru aktif tetapi rendernya belum flush belum
    // terlihat ensurer — draft tak terikat sampai commit berikutnya;
    // dipin di bawah sebagai (c).)
    // (a) TANPA proyek aktif: dua panggilan → 0 proyek, 2× ensurer,
    // kedua draft tak terikat.
    resetAll(); registerEnsurer();
    await execDraft(KANDANG, { key: nextKey('L12a1') });
    await execDraft(GUDANG, { key: nextKey('L12a2') });
    assert(store.projects.length === 0, `R1 ditutup: tanpa proyek aktif harus 0 proyek, dapat ${store.projects.length}`);
    assert(ensurerCalls === 2, `R1: ensurer 2×, dapat ${ensurerCalls}×`);
    assert(rab.getLastUniversalDraftProjectId() === null, 'R1: draft kedua TAK TERIKAT tanpa proyek aktif');
    assert(pendingMigration === null, 'R1: tanpa migrasi (ensurer §4.5 tidak mencatatnya)');
    // (b) DENGAN proyek aktif (flush di antara) → 1 proyek, binding sama.
    resetAll(); registerEnsurer();
    const live = store.create({ name: 'Proyek Live' });
    store.flushRender();
    await execDraft(KANDANG, { key: nextKey('L12b1') });
    await execDraft(GUDANG, { key: nextKey('L12b2') });
    assert(store.projects.length === 1, `R1 kontrol: dengan proyek aktif harus 1 proyek, dapat ${store.projects.length}`);
    assert(rab.getLastUniversalDraftProjectId() === live.id, 'R1 kontrol: binding ke proyek yang sama');
    // (c) Proyek baru aktif TETAPI render belum flush → ensurer belum
    // melihatnya (liveProjectRef basi) → draft tak terikat.
    resetAll(); registerEnsurer();
    store.create({ name: 'Proyek Baru Belum Flush' });
    // TIDAK ada flushRender — createProject menjadwalkan render.
    await execDraft(KANDANG, { key: nextKey('L12c') });
    assert(store.projects.length === 1, 'R1(c): proyek sudah ada di store (dibuat manual, bukan ensurer)');
    assert(rab.getLastUniversalDraftProjectId() === null, 'R1(c): draft TAK TERIKAT — ensurer membaca liveProjectRef yang belum flush');
    store.flushRender();
    await execDraft(GUDANG, { key: nextKey('L12c2') });
    assert(rab.getLastUniversalDraftProjectId() === store.projects[0].id, 'R1(c): sesudah flush, draft berikutnya terikat ke proyek itu');
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
    // §4.5: skenario kini memakai proyek yang SUDAH ADA (bukan temp).
    resetAll(); registerEnsurer();
    const live = store.create({ name: 'Proyek Live' });
    store.flushRender();
    const [ra, rb] = await Promise.all([
      execDraft(KANDANG, { key: nextKey('L13a') }),
      execDraft(GUDANG, { key: nextKey('L13b') }),
    ]);
    assert(ra.ok === true && rb.ok === true, 'kedua panggilan harus ok');
    assert(ensurerCalls === 1, `R2: ensurer 1× (hook kedua melihat draft sudah terikat), dapat ${ensurerCalls}×`);
    assert(store.projects.length === 1, 'R2: 1 proyek (yang sudah ada — tanpa proyek baru)');
    assert(rab.getLastUniversalDraftProjectId() === live.id, 'R2: binding ke proyek live');
    const singleton = rab.getLastUniversalDraft();
    // G3: live-bind tidak menyimpan — autosave dulu agar record ada.
    const autosave = persistActiveDraftModel(live.id);
    assert(autosave.saved === true, 'R2: autosave menyimpan draft terikat');
    const loaded = dp.loadDraft(live.id);
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

  await check('S3D-L14 urutan vs persistMessage: balasan tool dipersist di bawah percakapan proyek AKTIF (bila ada); tanpa proyek, global', async () => {
    // §4.5: tidak ada lagi "percakapan proyek sementara" — ensurer
    // tidak mencatat migrasi. Yang dipin: persistMessage me-resolve
    // proyek LIVE saat persist (DEFECT-1): (a) proyek aktif sebelum
    // commit → balasan di bawah kunci proyek itu; (b) tanpa proyek →
    // balasan di bawah kunci global. Migrasi percakapan antar-proyek
    // adalah efek muat view, di luar cakupan suite registry ini.
    // (a) Proyek aktif sebelum commit.
    resetAll(); registerEnsurer();
    const live = store.create({ name: 'Proyek Live' });
    store.flushRender();
    persistMessageModel('user', KANDANG);
    assert((conversations.get(convKey(live.id)) ?? []).length === 1, '(a) pesan user harus di bawah kunci proyek aktif');
    const r = await execDraft(KANDANG, { key: nextKey('L14a') });
    assert(r.ok === true, '(a) eksekusi harus ok');
    assert(rab.getLastUniversalDraftProjectId() === live.id, '(a) draft terikat ke proyek live');
    const reply = persistMessageModel('assistant', typeof r.output === 'string' ? (r.output as string).slice(0, 60) : '');
    assert(reply.key === convKey(live.id), '(a) balasan harus dipersist di bawah percakapan proyek live');
    const liveConv = conversations.get(convKey(live.id)) ?? [];
    assert(liveConv.length === 2 && liveConv[0].role === 'user' && liveConv[1].role === 'assistant', '(a) percakapan proyek live berisi pesan user + balasan tool');
    // (b) Tanpa proyek aktif: balasan di bawah kunci global.
    resetAll(); registerEnsurer();
    persistMessageModel('user', KANDANG);
    assert((conversations.get('__ezrab_ai_global__') ?? []).length === 1, '(b) pesan user harus di bawah kunci global sebelum commit');
    const r2 = await execDraft(KANDANG, { key: nextKey('L14b') });
    assert(r2.ok === true, '(b) eksekusi harus ok');
    assert(rab.getLastUniversalDraftProjectId() === null, '(b) draft TAK TERIKAT tanpa proyek (§4.5)');
    const reply2 = persistMessageModel('assistant', typeof r2.output === 'string' ? (r2.output as string).slice(0, 60) : '');
    assert(reply2.key === '__ezrab_ai_global__', '(b) balasan harus dipersist di bawah kunci global');
    assert(pendingMigration === null, '(b) tanpa migrasi (ensurer §4.5 tidak mencatatnya)');
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

  await check('S3D-L16 G5 DITUTUP (WC-03, P1): model-emitted build_universal_draft DITOLAK di kanal chat-ai DAN copilot', async () => {
    // G5 DITUTUP 2026-11-24 (WC-03, direktif owner — perbaikan yang
    // dinanti header suite ini: "tes ini SENGAJA MERAH sampai
    // diperbarui bersama keputusan owner"). scanToolCalls
    // (toolCallParser.ts) SENGAJA tetap mem-parse blok JSON apa pun —
    // penegakan terjadi di executeTool (langkah 1b), satu-satunya
    // titik eksekusi. build_universal_draft tidak ada di EZRAB_AI_TOOLS
    // maupun COPILOT_ALLOWED_TOOLS → ditolak di kedua kanal untuk
    // aktor 'model', SEBELUM invoke/hook (ensurer tidak dipanggil,
    // tanpa draft, tanpa proyek).
    resetAll(); registerEnsurer();
    const modelText = `Baik, saya susunkan draftnya.\n{"tool":"build_universal_draft","args":{"text":"${KANDANG}"}}\nSemoga membantu.`;
    const scan = tcp.scanToolCalls(modelText);
    assert(scan.calls.some((c: { toolName: string }) => c.toolName === 'build_universal_draft'), 'G5: scanToolCalls tetap mem-parse build_universal_draft dari teks model (parser tidak digerbang — penegakan di executeTool)');
    assert(scan.malformed === false, 'teks model harus ter-parse bersih (bukan malformed)');
    // Eksekusi persis seperti service.ts:237 (chat-ai) …
    const chatAi = await execDraft(KANDANG, { key: nextKey('L16a'), channel: 'chat-ai', actor: 'model' });
    assert(chatAi.ok === false, 'G5: executeTool model DITOLAK di kanal chat-ai');
    assert(chatAi.errorCode === 'TOOL_NOT_MODEL_CALLABLE', `G5: kode harus TOOL_NOT_MODEL_CALLABLE, dapat "${chatAi.errorCode}"`);
    assert(rab.getLastUniversalDraft() === null, 'G5: tanpa draft di kanal chat-ai');
    assert(store.projects.length === 0, 'G5: tanpa proyek di kanal chat-ai');
    assert(ensurerCalls === 0, 'G5: ensurer TIDAK dipanggil (ditolak sebelum hook)');
    // … dan seperti coAssistantService.ts:711 (copilot).
    resetAll(); registerEnsurer();
    const copilot = await execDraft(KANDANG, { key: nextKey('L16b'), channel: 'copilot', actor: 'model' });
    assert(copilot.ok === false, 'G5: executeTool model DITOLAK di kanal copilot');
    assert(copilot.errorCode === 'TOOL_NOT_MODEL_CALLABLE', `G5: kode harus TOOL_NOT_MODEL_CALLABLE di copilot, dapat "${copilot.errorCode}"`);
    assert(rab.getLastUniversalDraft() === null, 'G5: tanpa draft di kanal copilot');
    assert(store.projects.length === 0, 'G5: tanpa proyek di kanal copilot');
    assert(ensurerCalls === 0, 'G5: ensurer TIDAK dipanggil di kanal copilot');
    store.flushRender();
  });

  await check('S3D-G4 recordResultToMemory [BATASAN TERDOKUMENTASI]: commit tanpa proyek aktif tidak terekam di memori Fase 2', async () => {
    // G4 — BUKAN perilaku ideal. recordResultToMemory
    // (toolRegistry.ts:1140-1176) no-op bila record.projectId null —
    // dan record memakai projectId SCOPE, bukan proyek hasil ensuring.
    // Akibatnya: hasil tool draft tanpa scope proyek TIDAK pernah masuk
    // memori Fase 2 — BAHKAN bila draftnya terikat ke proyek live oleh
    // ensurer. Menunggu O-S3D-4 (trail + memori mencatat
    // ensuredProjectId).
    resetAll(); registerEnsurer();
    const live = store.create({ name: 'Proyek Live' });
    store.flushRender();
    const r = await execDraft(KANDANG, { key: nextKey('G4a') });
    assert(r.ok === true, 'eksekusi harus ok');
    assert(rab.getLastUniversalDraftProjectId() === live.id, 'prasyarat: draft terikat ke proyek live');
    const underLive = mem.listMemories({ userId: null, projectId: live.id, conversationId: null });
    assert(underLive.ok === true, 'listMemories harus ok');
    assert(underLive.ok && !underLive.value.some((m) => m.memoryKey === 'tool-result:build_universal_draft'), 'G4: TIDAK ada record memori tool-result di bawah proyek pengikat (record memakai scope null)');
    const globalScope = mem.listMemories({ userId: null, projectId: null, conversationId: null });
    assert(globalScope.ok === true, 'listMemories global harus ok');
    assert(globalScope.ok && !globalScope.value.some((m) => m.memoryKey === 'tool-result:build_universal_draft'), 'G4: TIDAK ada record memori tool-result di scope global juga (recordResultToMemory no-op)');
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
