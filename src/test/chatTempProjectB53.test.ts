/**
 * chatTempProjectB53.test.ts — B5-3 (D-11, keputusan owner 2026-11-23)
 * sebagaimana DIREVISI §4.5 direktif hardening P1 (keputusan owner
 * 2026-11-24, menggantikan sebagian B5-3): TIDAK ADA lagi pembuatan
 * proyek implisit. Draft RAB boleh dibuat TANPA IKATAN PROYEK (draft
 * bukan proyek); proyek baru HANYA dibuat lewat konfirmasi eksplisit
 * §6 — di alur push/finalize (proposal "Buat proyek & konfirmasi
 * transfer") atau pembuatan manual lewat menu Proyek.
 *
 * Gaya plain-tsx: `npx --yes tsx src/test/chatTempProjectB53.test.ts`
 *
 * Yang diuji lewat JALUR NYATA (registry + draftPersistence + tempProject):
 * - positif (§4.5): draft pertama tanpa proyek aktif → 0 proyek baru,
 *   draft TIDAK TERIKAT (unbound), tetap berhasil + tombol push ada.
 * - draft unbound TIDAK tersimpan (saveDraft butuh projectId; snapshot
 *   intake butuh projectId) — konsekuensi jujur §4.5 yang dipin di sini:
 *   draft unbound hidup di singleton dan hilang saat reload.
 * - negatif: tanpa draft (menu generik / needs-spec / gerbang material /
 *   pertanyaan intake) → 0 proyek baru.
 * - dengan proyek aktif (dibuat eksplisit/di tengah intake) → draft
 *   terikat ke proyek itu, 0 proyek baru, tersimpan + snapshot tertaut.
 * - tanpa ensurer terdaftar → draft tetap berhasil tanpa proyek.
 * - rename + lengkapi proyek (yang dibuat eksplisit) lewat alur biasa.
 * - draft kedua memakai proyek eksplisit yang sama (tanpa proyek baru).
 * - reload: draft + konteks intake pulih dari storage proyek EKSPLISIT
 *   (prasyarat B5/B6) — BUKAN dari proyek sementara.
 *
 * BATAS UJI (jujur): ensurer di sini adalah TIRUAN view (store proyek palsu
 * + saveDraft nyata) — ensurer React asli di view.tsx (proyek live atau
 * null, TANPA createProject — §4.5) TIDAK dapat diuji tanpa React dan
 * menjadi tugas verifikator UI. Yang dibuktikan suite ini adalah
 * perilaku REGISTRY (hook dipanggil di titik yang benar, dengan kondisi
 * yang benar) + persistensi + penamaan. Tiruan store meniru semantik
 * ProjectContext.createProject/updateProject (prepend + jadikan aktif;
 * merge per id) — bila semantik itu berubah, tiruan ini harus ikut.
 * Alur push/finalize yang MEMBUAT proyek atas konfirmasi (§4.5) hidup di
 * view.tsx dan TIDAK dapat diuji di tsx polos — tugas verifikator UI;
 * suite p1AuthzConfirmation memin kontrak ensurer + perilaku unbound
 * di tingkat registry.
 *
 * DEFECT-1 (B53-13/14, fix 2026-11-23): race React-efek itu sendiri
 * (closure storeProjectId basi vs convIdRef live selama gateWait 5–10 dtk)
 * TIDAK dapat direproduksi di tsx polos tanpa React — verifikator UI yang
 * membuktikannya (skenario B + probe T7a). Yang DIPIN suite ini adalah
 * invarian tingkat store yang menjadi sandaran fix: (1) persist dengan
 * proyek BASI ke percakapan yang sudah bermigrasi PASTI melempar
 * ProjectIsolationError (mekanisme kehilangan pesan); (2) persist dengan
 * proyek yang di-resolve LIVE (proyek percakapan terkini) mendarat di
 * percakapan yang benar, dalam URUTAN mana pun (sebelum/sesudah migrasi).
 * Store percakapan di node murni in-memory (save/load storage di-skip
 * bila window undefined), jadi "reload" di sini = baca ulang dari store
 * yang sama, bukan round-trip localStorage — round-trip nyata juga tugas
 * verifikator UI.
 *
 * B53-D (keputusan owner 2026-11-23, tap "Cakup juga jalur direct-RAB",
 * direvisi §4.5): hook KEDUA di corong directRabTableResult — draft
 * direct pertama (CREATE_RAB_DIRECT, GENERATE_RAB_TEMPLATE, finalisasi
 * "itu aja") tanpa proyek aktif TIDAK LAGI membuat proyek: 0 proyek,
 * draft direct unbound, lastDirectRab tetap menjadi target push.
 * Negatif: kartu pilihan / ringkasan / di-luar-model (tanpa draft) →
 * 0 proyek.
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

/* ---------- store proyek palsu (semantik ProjectContext) ---------- */
interface FakeProject {
  id: string;
  name: string;
  status: string;
  client?: string;
  location?: string;
  buildingType?: string;
  creationMethod?: string;
  description?: string;
}
class FakeProjectStore {
  projects: FakeProject[] = [];
  currentId: string | null = null;
  seq = 0;
  create(data: Partial<FakeProject> & { name: string }): FakeProject {
    const p: FakeProject = {
      id: `PRJ-B53-${++this.seq}`,
      status: 'draft',
      ...data,
    };
    // createProject konteks: prepend sinkron + jadikan aktif.
    this.projects.unshift(p);
    this.currentId = p.id;
    return p;
  }
  update(id: string, patch: Partial<FakeProject>): boolean {
    const p = this.projects.find((x) => x.id === id);
    if (!p) return false;
    Object.assign(p, patch);
    return true;
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

async function main(): Promise<void> {
  console.log('chatTempProjectB53.test (B5-3 / D-11)');
  const reg = await import('../ai-tools/ezrab-ai/actionRegistry');
  const rab = await import('../ai-tools/ezrab-ai/universalRab');
  const direct = await import('../ai-tools/ezrab-ai/directRab');
  const dp = await import('../ai-tools/ezrab-ai/draftPersistence');
  const tp = await import('../ai-tools/ezrab-ai/tempProject');
  const { routeIntent } = await import('../ai-tools/ezrab-ai/intentRouter');
  const { clearLastRabIntentSpec } = await import('../ai-tools/ezrab-ai/rabIntentFlow');
  const ops = await import('../ai-tools/ezrab-ai/operations');
  const convStore = await import('../services/ai/conversation/unifiedConversationStore');

  /* ---------- DEFECT-1: tiruan setia efek migrasi view.tsx:832–877 ----------
   * Salin pesan percakapan sumber (proyek lama) ke percakapan baru di
   * bawah proyek tujuan, dengan id pesan yang sama persis. */
  const GLOBAL_PROJECT = '__ezrab_ai_global__';
  const freshConvStore = () => {
    convStore.UnifiedConversationStore.resetInstance();
    return convStore.UnifiedConversationStore.getInstance();
  };
  const migrateConversationLikeView = (
    s: ReturnType<typeof freshConvStore>,
    fromConversationId: string,
    fromProjectId: string,
    toProjectId: string,
  ) => {
    const source = s.getConversation(fromConversationId, fromProjectId);
    if (!source || source.messages.length === 0) return null;
    const target = s.createConversation(toProjectId, source.title || 'Percakapan Copilot');
    for (const m of source.messages) {
      s.appendMessage(target.id, toProjectId, {
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
        timestamp: m.timestamp,
      });
    }
    return target;
  };

  const store = new FakeProjectStore();

  /* Tiruan ensurer view.tsx PASCA-§4.5 (direktif owner 2026-11-24):
   * ensurer TIDAK PERNAH membuat proyek — ia mengembalikan proyek live
   * (bila ada) dengan created: false, atau null. Pembuatan proyek HANYA
   * lewat konfirmasi eksplisit §6 di alur push/finalize (view.tsx) atau
   * pembuatan manual — keduanya di luar jangkauan tsx polos. Draft
   * universal yang terikat ke proyek live tetap dipersistenkan (cermin
   * autosave ensurer asli); draft direct tidak punya record
   * UniversalDraft sehingga tidak memanggil saveDraft. */
  const fakeEnsurer: (draft: { title: string }) => {
    id: string; name: string; created: boolean;
  } | null = (draft) => {
    const live = store.current;
    if (!live) return null;
    if ('parts' in draft && 'id' in draft) {
      dp.saveDraft({
        draft: draft as never,
        projectId: live.id,
        conversationId: null,
        workflowStage: 'autosave',
        savedBy: 'autosave',
      });
    }
    return { id: live.id, name: live.name, created: false };
  };

  const resetAll = () => {
    reg.clearUniversalContext();
    reg.clearProjectContext();
    rab.clearLastUniversalDraft();
    direct.setLastDirectRab(null);
    reg.setLastRabNeeds(null);
    reg.clearPendingRabChoice();
    reg.clearPendingDirectConfirmations();
    clearLastRabIntentSpec();
    tp.setDraftProjectEnsurer(null);
    store.reset();
    storage.clear();
  };
  const registerEnsurer = () => {
    tp.setDraftProjectEnsurer(fakeEnsurer as never);
  };

  const mockCtx = (projectId: string | null, rawText = '') =>
    ({
      navigate: () => undefined,
      currentMenu: 'ezrab-ai',
      activeProject: projectId
        ? { id: projectId, name: store.projects.find((p) => p.id === projectId)?.name ?? projectId }
        : null,
      projects: [],
      projectTotal: 0,
      projectItems: null,
      rawText,
    }) as unknown as Parameters<typeof reg.executeIntent>[2];

  const start = (text: string, projectId: string | null = null) => {
    const routed = routeIntent(text);
    return reg.executeIntent(routed.intent, routed.param, mockCtx(projectId, text));
  };
  const hasPush = (res: { actions?: Array<{ action: { kind: string } }> } | null | undefined) =>
    !!res?.actions?.some((a) => a.action.kind === 'push-universal');
  const hasPushDirect = (res: { actions?: Array<{ action: { kind: string } }> } | null | undefined) =>
    !!res?.actions?.some((a) => a.action.kind === 'push-rab');

  /* Alur brief skenario B (B5 E2E): chat → tanya lebar → kuesioner →
   * brief → "Susun draft RAB". Mengembalikan hasil generate. */
  const driveBriefFlow = () => {
    const projectsBefore = store.projects.length;
    const res1 = start('Buat RAB jalan beton sepanjang 2 km');
    assert(res1.message.includes('lebar jalan'), 'langkah 1 harus menanyakan lebar jalan');
    const jawab = reg.tryContinueUniversalContext('lebarnya 5 meter');
    assert(jawab && jawab.questionnaire, 'jawaban lebar harus membuka kuesioner');
    const brief = reg.submitQuestionnaireAnswers({});
    assert(brief.message.includes('Brief proyek'), 'kuesioner harus menghasilkan brief');
    assert(!hasPush(brief), 'brief belum boleh membawa tombol push');
    assert(store.projects.length === projectsBefore, 'belum ada proyek BARU sebelum draft dibuat');
    return reg.executeIntent('RAB_INTAKE_GENERATE', undefined, mockCtx(null, 'susun'));
  };

  await check('B53-01 §4.5: brief → draft pertama tanpa proyek: 0 proyek, draft UNBOUND, tidak tersimpan', () => {
    resetAll();
    registerEnsurer();
    const draftRes = driveBriefFlow();
    assert(hasPush(draftRes), 'generate harus menghasilkan draft (tombol push)');
    const d = rab.getLastUniversalDraft();
    assert(d, 'singleton draft harus ada');
    assert(d!.title === 'Jalan & Perkerasan', `judul draft harus "Jalan & Perkerasan", dapat "${d!.title}"`);
    assert(store.projects.length === 0, `§4.5: TIDAK BOLEH ada proyek yang dibuat, dapat ${store.projects.length}`);
    assert(store.currentId === null, 'tidak ada proyek aktif');
    assert(draftRes.ensuredProjectId === undefined, 'ensuredProjectId harus kosong (tidak ada proyek)');
    assert(rab.getLastUniversalDraftProjectId() === null, 'draft harus TIDAK TERIKAT (unbound)');
    assert(!draftRes.message.includes('proyek sementara'), 'pesan draft TIDAK BOLEH menyebut proyek sementara');
    assert(!draftRes.message.includes('proyek dibuat otomatis'), 'pesan draft TIDAK BOLEH mengklaim pembuatan otomatis');
    // Konsekuensi jujur §4.5: draft unbound tidak tersimpan (saveDraft +
    // snapshot intake keduanya butuh projectId) — ia hidup di singleton.
    assert(storage.getItem(dp.AI_DRAFTS_STORAGE_KEY) === null, 'draft unbound TIDAK BOLEH tersimpan ke storage draft');
    assert(storage.getItem(dp.AI_INTAKE_STORAGE_KEY) === null, 'snapshot intake unbound TIDAK BOLEH tersimpan');
  });

  await check('B53-02 §4.5: jalur cepat (one-shot) tanpa proyek: 0 proyek, draft UNBOUND', () => {
    resetAll();
    registerEnsurer();
    const res = start('buatkan rab jalan beton 1 km lebar 6 m');
    assert(hasPush(res), 'pesan one-shot harus langsung menghasilkan draft');
    assert(store.projects.length === 0, `§4.5: TIDAK BOLEH ada proyek yang dibuat, dapat ${store.projects.length}`);
    assert(res.ensuredProjectId === undefined, 'ensuredProjectId harus kosong');
    assert(rab.getLastUniversalDraftProjectId() === null, 'draft harus TIDAK TERIKAT (unbound)');
    assert(!res.message.includes('proyek sementara'), 'pesan TIDAK BOLEH menyebut proyek sementara');
    assert(storage.getItem(dp.AI_DRAFTS_STORAGE_KEY) === null, 'draft unbound TIDAK BOLEH tersimpan');
  });

  await check('B53-15 §4.5 + F-ISO-2: proyek EKSPLISIT dulu, lalu one-shot — snapshot intake tertaut mendarat di proyek itu + pulih sesudah reload', () => {
    resetAll();
    registerEnsurer();
    // §4.5: proyek dibuat EKSPLISIT (simulasi pembuatan manual lewat menu
    // Proyek) SEBELUM draft — bukan oleh ensurer.
    const p = store.create({ name: 'Proyek Jalan Lingkungan' });
    const res = start('buatkan rab jalan beton 1 km lebar 6 m');
    assert(hasPush(res), 'pesan one-shot harus langsung menghasilkan draft');
    assert(store.projects.length === 1, 'tidak boleh ada proyek baru — proyek eksplisit dipakai');
    assert(res.ensuredProjectId === p.id, 'ensuredProjectId harus id proyek eksplisit');
    const d = rab.getLastUniversalDraft();
    assert(d, 'singleton draft harus ada');
    assert(rab.getLastUniversalDraftProjectId() === p.id, 'draft harus terikat ke proyek eksplisit');
    const snap = dp.peekIntakeContext(p.id);
    assert(snap !== null, 'snapshot intake harus mendarat di bawah proyek eksplisit');
    assert(snap!.generatedDraftId === d!.id, 'snapshot harus tertaut ke draft (generatedDraftId)');
    // Reload: singleton mati, storage utuh → konteks + draft pulih bersama.
    reg.clearUniversalContext();
    rab.clearLastUniversalDraft();
    const intake = dp.loadIntakeContext(p.id);
    assert(intake.ok, 'snapshot harus terbaca sesudah reload');
    assert(intake.ok && intake.generatedDraftId === d!.id, 'tautan snapshot→draft utuh sesudah reload');
    assert(
      intake.ok && dp.shouldRestoreIntakeSnapshot(
        { updatedAt: intake.updatedAt, generatedDraftId: intake.generatedDraftId },
        dp.peekPersistedDraft(p.id),
      ),
      'snapshot tertaut harus lolos keputusan pemulihan (prasyarat B5/B6)',
    );
    assert(dp.loadDraft(p.id).ok, 'draft tetap terbaca sesudah reload');
  });

  await check('B53-03 tanpa draft → 0 proyek: menu generik, pertanyaan intake, needs-spec, tak didukung', () => {
    resetAll();
    registerEnsurer();
    const generic = start('buatkan rab');
    assert(!hasPush(generic), 'rab tanpa objek tidak boleh menghasilkan draft');
    assert(store.projects.length === 0, 'menu generik tidak boleh membuat proyek');
    const tanya = start('Buat RAB jalan beton sepanjang 2 km');
    assert(!hasPush(tanya), 'pertanyaan intake tidak boleh menghasilkan draft');
    assert(store.projects.length === 0, 'pertanyaan intake tidak boleh membuat proyek');
    resetAll();
    registerEnsurer();
    const needs = start('buatkan RAB instalasi listrik rumah 3 kamar tidur');
    assert(!hasPush(needs), 'needs-spec tidak boleh menghasilkan draft');
    assert(store.projects.length === 0, 'needs-spec tidak boleh membuat proyek');
    resetAll();
    registerEnsurer();
    const tower = start('buatkan rab menara telekomunikasi 30 m');
    assert(!hasPush(tower), 'permintaan tak didukung tidak boleh menghasilkan draft');
    assert(store.projects.length === 0, 'permintaan tak didukung tidak boleh membuat proyek');
  });

  await check('B53-04 gerbang material (draft tertahan pertanyaan bahan) → 0 proyek', () => {
    resetAll();
    registerEnsurer();
    const res = start('buatkan rab atap luas 120 m2');
    assert(!hasPush(res), 'gerbang material tidak boleh menampilkan draft');
    assert(res.message.includes('bahannya perlu jelas'), 'pesan harus menanyakan bahan');
    assert(reg.getPendingRabMaterial() !== null, 'gerbang material harus aktif');
    assert(store.projects.length === 0, 'draft yang tertahan gerbang tidak boleh membuat proyek');
    // Bersihkan gerbang lewat jalur 'assume' TANPA ensurer (draft boleh
    // dibuat, proyek tidak) agar state tidak bocor ke tes berikut.
    tp.setDraftProjectEnsurer(null);
    const assumed = reg.executeIntent('RAB_MATERIAL_SELECT', 'assume', mockCtx(null, 'assume'));
    assert(hasPush(assumed), 'assume harus menghasilkan draft');
    assert(reg.getPendingRabMaterial() === null, 'gerbang harus bersih sesudah assume');
    assert(store.projects.length === 0, 'tanpa ensurer, draft assume tidak membuat proyek');
  });

  await check('B53-05 dengan proyek aktif: draft terikat ke proyek itu, 0 proyek baru', () => {
    resetAll();
    registerEnsurer();
    const existing = store.create({ name: 'Proyek Existing' });
    const res = start('buatkan rab jalan beton 1 km lebar 6 m', existing.id);
    assert(hasPush(res), 'draft harus tetap berhasil dengan proyek aktif');
    assert(store.projects.length === 1, 'tidak boleh ada proyek baru');
    assert(store.currentId === existing.id, 'proyek aktif tidak boleh berganti');
    assert(res.ensuredProjectId === undefined, 'tanpa ensure, ensuredProjectId harus kosong');
    assert(!res.message.includes('proyek sementara'), 'pesan tidak boleh menyebut proyek sementara');
    assert(rab.getLastUniversalDraftProjectId() === existing.id, 'draft harus terikat ke proyek aktif');
  });

  await check('B53-06 tanpa ensurer terdaftar: draft berhasil tanpa proyek (perilaku lama)', () => {
    resetAll();
    // Sengaja TIDAK registerEnsurer — permukaan tanpa view chat.
    const res = start('buatkan rab jalan beton 1 km lebar 6 m');
    assert(hasPush(res), 'draft harus tetap berhasil tanpa ensurer');
    assert(store.projects.length === 0, 'tanpa ensurer tidak boleh ada proyek');
    assert(res.ensuredProjectId === undefined, 'ensuredProjectId harus kosong');
    assert(rab.getLastUniversalDraft() !== null, 'draft tetap ada di singleton');
    assert(rab.getLastUniversalDraftProjectId() === null, 'draft tetap tanpa ikatan proyek');
  });

  await check('B53-07 §4.5: proyek EKSPLISIT bisa di-rename + dilengkapi lewat alur biasa', () => {
    resetAll();
    registerEnsurer();
    // §4.5: proyek dibuat EKSPLISIT (simulasi pembuatan manual) sebelum
    // draft — ensurer tidak lagi membuat proyek sementara.
    const p = store.create({ name: 'RAB Jalan & Perkerasan (Sementara)' });
    const draftRes = start('buatkan rab jalan beton 1 km lebar 6 m');
    assert(hasPush(draftRes), 'draft harus berhasil');
    assert(rab.getLastUniversalDraftProjectId() === p.id, 'draft terikat ke proyek eksplisit');
    // Rename lewat intent RENAME_PROJECT (dua langkah: tanya → KLIK TOMBOL
    // konfirmasi — P1-C: kirim-ulang teks tidak mengeksekusi), dengan
    // callback renameProject yang meniru view (cek daftar + updateProject).
    // P1-B: berjalan sebagai Estimator (gerbang kapabilitas).
    ops.setAssistantOperationContext({ actor: 'Penguji', writesEnabled: true });
    const renameCtx = {
      ...mockCtx(p.id, 'ubah nama proyek'),
      renameProject: (id: string, name: string) => store.update(id, { name }),
    } as unknown as Parameters<typeof reg.executeIntent>[2];
    const ask = reg.executeIntent('RENAME_PROJECT', 'Jalan Lingkungan Desa Suka', renameCtx);
    assert(ask.message.includes('Ganti nama proyek'), 'langkah 1 harus meminta konfirmasi');
    assert(store.projects[0].name === 'RAB Jalan & Perkerasan (Sementara)', 'nama belum boleh berubah sebelum konfirmasi');
    const done = reg.executeDirectConfirmation('RENAME_PROJECT', 'Jalan Lingkungan Desa Suka', renameCtx);
    assert(done.message.includes('diubah'), 'klik tombol konfirmasi harus mengonfirmasi perubahan');
    assert(store.projects[0].name === 'Jalan Lingkungan Desa Suka', 'nama harus berubah sesudah konfirmasi');
    ops.setAssistantOperationContext(null);
    // Lengkapi data lewat updateProject (yang dipakai EditProjectModal) —
    // tanpa pengecualian untuk proyek sementara.
    assert(store.update(p.id, { client: 'Pemdes Suka', location: 'Probolinggo', buildingType: 'Infrastruktur' }), 'update harus berhasil');
    const final = store.projects[0];
    assert(final.id === p.id, 'id proyek tidak berubah');
    assert(final.status === 'draft', 'status tetap draft');
    assert(final.client === 'Pemdes Suka' && final.location === 'Probolinggo' && final.buildingType === 'Infrastruktur', 'data pelengkap harus tersimpan');
    assert(!final.name.includes('(Sementara)'), 'proyek kini proyek biasa (tanpa penanda sementara)');
  });

  await check('B53-08 §4.5: draft kedua memakai proyek EKSPLISIT yang sama (tanpa proyek baru)', () => {
    resetAll();
    registerEnsurer();
    // §4.5: proyek dibuat EKSPLISIT sebelum draft pertama.
    const p = store.create({ name: 'Proyek Infrastruktur Desa' });
    const first = start('buatkan rab jalan beton 1 km lebar 6 m');
    assert(hasPush(first), 'draft pertama harus berhasil');
    assert(store.projects.length === 1, 'draft pertama tidak boleh membuat proyek');
    assert(rab.getLastUniversalDraftProjectId() === p.id, 'draft pertama terikat ke proyek eksplisit');
    // Simulasi keadaan view sesudah proyek dibuat: proyek aktif = eksplisit.
    const second = start('buatkan rab drainase U-Ditch 500 meter', p.id);
    assert(hasPush(second), 'draft kedua harus berhasil');
    assert(store.projects.length === 1, 'draft kedua tidak boleh membuat proyek lagi');
    assert(rab.getLastUniversalDraft()?.title === 'Drainase & Saluran', 'draft kedua harus drainase');
    assert(rab.getLastUniversalDraftProjectId() === p.id, 'draft kedua terikat ke proyek eksplisit yang sama');
    assert(second.ensuredProjectId === undefined, 'draft kedua tidak melalui ensure');
  });

  await check('B53-09 proyek dibuat di tengah intake: draft diikat ke proyek itu, tanpa proyek baru + tanpa pemberitahuan', () => {
    resetAll();
    registerEnsurer();
    const res1 = start('Buat RAB jalan beton sepanjang 2 km');
    assert(!hasPush(res1), 'langkah 1 belum draft');
    const jawab = reg.tryContinueUniversalContext('lebarnya 5 meter');
    assert(jawab && jawab.questionnaire, 'jawaban lebar harus membuka kuesioner');
    const brief = reg.submitQuestionnaireAnswers({});
    assert(brief.message.includes('Brief proyek'), 'harus sampai brief');
    // Pengguna membuat proyek lewat menu di tengah intake (sebelum generate).
    const live = store.create({ name: 'Proyek Dibuat di Tengah Jalan' });
    const draftRes = reg.executeIntent('RAB_INTAKE_GENERATE', undefined, mockCtx(null, 'susun'));
    assert(hasPush(draftRes), 'generate harus menghasilkan draft');
    assert(store.projects.length === 1, 'tidak boleh ada proyek baru — proyek live dipakai');
    assert(draftRes.ensuredProjectId === live.id, 'ensuredProjectId harus proyek live');
    assert(!draftRes.message.includes('proyek sementara'), 'tidak ada pemberitahuan proyek sementara (bukan proyek baru)');
    assert(rab.getLastUniversalDraftProjectId() === live.id, 'draft terikat ke proyek live');
  });

  await check('B53-10 ensurer gagal (lempar): draft tetap berhasil, 0 proyek, tanpa crash', () => {
    resetAll();
    tp.setDraftProjectEnsurer(() => {
      throw new Error('createProject gagal (simulasi)');
    });
    const res = start('buatkan rab jalan beton 1 km lebar 6 m');
    assert(hasPush(res), 'draft harus tetap berhasil walau ensurer gagal');
    assert(store.projects.length === 0, 'tidak ada proyek saat ensurer gagal');
    assert(res.ensuredProjectId === undefined, 'ensuredProjectId harus kosong');
    assert(rab.getLastUniversalDraft() !== null, 'draft tetap ada');
  });

  await check('B53-11 §4.5: reload — draft terikat proyek EKSPLISIT pulih dari storage; draft UNBOUND hilang', () => {
    resetAll();
    registerEnsurer();
    // (a) Proyek EKSPLISIT dulu, lalu brief → draft terikat + tersimpan.
    const p = store.create({ name: 'Proyek Jalan Lingkungan' });
    const draftRes = driveBriefFlow();
    assert(hasPush(draftRes), 'draft harus berhasil');
    assert(rab.getLastUniversalDraftProjectId() === p.id, 'draft harus terikat ke proyek eksplisit');
    const draftId = rab.getLastUniversalDraft()!.id;
    // Reload = bersihkan singleton in-memory TANPA menyentuh storage.
    reg.clearUniversalContext();
    rab.clearLastUniversalDraft();
    assert(rab.getLastUniversalDraft() === null, 'singleton draft harus kosong sesudah reload');
    const loaded = dp.loadDraft(p.id);
    assert(loaded.ok, 'draft harus dapat dimuat dari storage proyek eksplisit');
    assert(loaded.ok && loaded.draft.id === draftId, 'draft yang dimuat harus draft yang sama');
    // Tiruan efek pemulihan draft view.tsx: ikat ulang singleton.
    if (loaded.ok) rab.setLastUniversalDraft(loaded.draft, p.id);
    assert(rab.getLastUniversalDraft(p.id)?.id === draftId, 'draft pulih + terikat ke proyek eksplisit');
    const intake = dp.loadIntakeContext(p.id);
    assert(intake.ok, 'konteks intake harus dapat dimuat dari storage');
    assert(intake.ok && intake.generatedDraftId === draftId, 'konteks intake tertaut ke draft');
    assert(
      intake.ok && dp.shouldRestoreIntakeSnapshot(
        { updatedAt: intake.updatedAt, generatedDraftId: intake.generatedDraftId },
        dp.peekPersistedDraft(p.id),
      ),
      'keputusan pemulihan intake harus true (konteks pulih bersama draft)',
    );
    // (b) Konsekuensi jujur §4.5: draft UNBOUND (tanpa proyek) TIDAK
    // tersimpan — sesudah reload ia hilang. Dipin eksplisit agar
    // ketegangan ini tercatat, bukan tersembunyi.
    resetAll();
    registerEnsurer();
    const unbound = start('buatkan rab jalan beton 1 km lebar 6 m');
    assert(hasPush(unbound), 'draft unbound harus berhasil');
    assert(rab.getLastUniversalDraftProjectId() === null, 'draft harus unbound');
    const unboundId = rab.getLastUniversalDraft()!.id;
    reg.clearUniversalContext();
    rab.clearLastUniversalDraft();
    assert(rab.getLastUniversalDraft() === null, 'singleton kosong sesudah reload');
    assert(storage.getItem(dp.AI_DRAFTS_STORAGE_KEY) === null, 'tidak ada draft tersimpan untuk dipulihkan');
    assert(unboundId !== '', 'id draft unbound tercatat (sanity)');
  });

  await check('B53-12 penamaan proyek sementara', () => {
    assert(tp.tempProjectNameForDraft('Jalan & Perkerasan') === 'RAB Jalan & Perkerasan (Sementara)', 'nama dari judul draft');
    assert(tp.tempProjectNameForDraft('Gudang') === 'RAB Gudang (Sementara)', 'nama gudang');
    assert(tp.tempProjectNameForDraft('  Jalan & Perkerasan  ') === 'RAB Jalan & Perkerasan (Sementara)', 'judul dipangkas');
    assert(tp.tempProjectNameForDraft('') === 'Proyek RAB (Sementara)', 'judul kosong → fallback');
    assert(tp.tempProjectNameForDraft(null) === 'Proyek RAB (Sementara)', 'judul null → fallback');
    assert(tp.tempProjectNameForDraft(undefined) === 'Proyek RAB (Sementara)', 'judul undefined → fallback');
    assert(tp.TEMP_PROJECT_CREATION_METHOD === 'chat-ai', 'creationMethod chat-ai');
  });

  await check('B53-13 DEFECT-1: persist sesudah migrasi — proyek basi melempar isolasi, proyek live mendarat di percakapan temp', () => {
    resetAll();
    const s = freshConvStore();
    const tempProjectId = 'PRJ-B53-TEMP-13';
    // (1) Prompt user tersimpan di percakapan global SEBELUM migrasi
    // (persistMessage 'user' di submit — sebelum gateWait).
    const globalConv = s.getOrCreateActiveConversation(GLOBAL_PROJECT);
    s.appendMessage(globalConv.id, GLOBAL_PROJECT, { role: 'user', content: 'Buat RAB jalan beton 2 km' });
    assert(s.getConversation(globalConv.id, GLOBAL_PROJECT)!.messages.length === 1, 'percakapan global harus berisi 1 pesan user');
    // (2) Efek migrasi B5-3 berjalan selama gateWait: salin ke temp.
    const tempConv = migrateConversationLikeView(s, globalConv.id, GLOBAL_PROJECT, tempProjectId);
    assert(tempConv !== null, 'migrasi harus menghasilkan percakapan temp');
    assert(s.getConversation(tempConv!.id, tempProjectId)!.messages.length === 1, 'percakapan temp harus berisi salinan 1 pesan user');
    // (3) MEKANISME CACAT (pin): persist draft dengan proyek BASI
    // (closure storeProjectId global) ke percakapan temp PASTI melempar
    // ProjectIsolationError — inilah yang menelan pesan draft sebelum fix.
    let threwIsolation = false;
    try {
      s.appendMessage(tempConv!.id, GLOBAL_PROJECT, { role: 'assistant', content: 'DRAFT RAB (tabel…)' });
    } catch (e) {
      threwIsolation = e instanceof Error && e.message.includes('PROJECT_ISOLATION_ERROR');
    }
    assert(threwIsolation, 'persist proyek-basi ke percakapan temp harus melempar ProjectIsolationError');
    assert(s.getConversation(tempConv!.id, tempProjectId)!.messages.length === 1, 'lemparan isolasi tidak boleh menambah pesan');
    // (4) FIX: persist dengan proyek LIVE (proyek percakapan terkini)
    // mendarat di percakapan temp — riwayat utuh (user + draft).
    s.appendMessage(tempConv!.id, tempProjectId, { role: 'assistant', content: 'DRAFT RAB (tabel…)' });
    const after = s.getConversation(tempConv!.id, tempProjectId)!;
    assert(after.messages.length === 2, `percakapan temp harus berisi 2 pesan sesudah persist live, dapat ${after.messages.length}`);
    assert(after.messages[0].role === 'user' && after.messages[1].role === 'assistant', 'urutan pesan temp harus user lalu draft asisten');
    assert(after.messages[1].content.includes('DRAFT RAB'), 'pesan kedua temp harus pesan draft');
    // (5) Tanpa penghapusan/duplikasi: percakapan global tak tersentuh.
    const globalAfter = s.getConversation(globalConv.id, GLOBAL_PROJECT)!;
    assert(globalAfter.messages.length === 1 && globalAfter.messages[0].role === 'user', 'percakapan global harus tetap 1 pesan user');
    // (6) Yang dimuat view sesudah reload = percakapan aktif temp, utuh.
    const reloaded = s.getOrCreateActiveConversation(tempProjectId);
    assert(reloaded.id === tempConv!.id, 'percakapan aktif temp harus percakapan migrasi');
    assert(reloaded.messages.length === 2, 'riwayat temp pasca-reload harus utuh (2 pesan)');
  });

  await check('B53-14 DEFECT-1: persist SEBELUM migrasi ikut tersalin — urutan mana pun riwayat utuh', () => {
    resetAll();
    const s = freshConvStore();
    const tempProjectId = 'PRJ-B53-TEMP-14';
    // Draft dipersist ke percakapan global SEBELUM efek migrasi berjalan
    // (gateWait pendek / jalur non-RAB) — lalu migrasi menyalinnya.
    const globalConv = s.getOrCreateActiveConversation(GLOBAL_PROJECT);
    s.appendMessage(globalConv.id, GLOBAL_PROJECT, { role: 'user', content: 'Buat RAB jalan beton 2 km' });
    s.appendMessage(globalConv.id, GLOBAL_PROJECT, { role: 'assistant', content: 'DRAFT RAB (tabel…)' });
    const tempConv = migrateConversationLikeView(s, globalConv.id, GLOBAL_PROJECT, tempProjectId);
    assert(tempConv !== null, 'migrasi harus menghasilkan percakapan temp');
    const migrated = s.getConversation(tempConv!.id, tempProjectId)!;
    assert(migrated.messages.length === 2, `salinan migrasi harus membawa 2 pesan, dapat ${migrated.messages.length}`);
    assert(migrated.messages[1].role === 'assistant' && migrated.messages[1].content.includes('DRAFT RAB'), 'salinan harus membawa pesan draft');
    // Pesan sesudah migrasi (persist live) mendarat di temp, bukan global.
    s.appendMessage(tempConv!.id, tempProjectId, { role: 'user', content: 'lanjutkan' });
    assert(s.getConversation(tempConv!.id, tempProjectId)!.messages.length === 3, 'pesan pasca-migrasi harus mendarat di temp (3 pesan)');
    assert(s.getConversation(globalConv.id, GLOBAL_PROJECT)!.messages.length === 2, 'percakapan global harus tetap 2 pesan');
  });

  await check('B53-D01 §4.5: probe D one-shot (rumah tipe 36) tanpa proyek: 0 proyek, draft direct UNBOUND', () => {
    resetAll();
    registerEnsurer();
    const res = start('buatkan RAB rumah tipe 36 anggaran 120 juta');
    assert(hasPushDirect(res), 'probe D harus menghasilkan draft direct (tombol push-rab)');
    assert(/Total/.test(res.message), 'draft direct harus memuat total');
    const last = direct.getLastDirectRab();
    assert(last, 'lastDirectRab harus ada (target push)');
    assert(last!.displayLabel === 'Rumah Type 36', `displayLabel harus "Rumah Type 36", dapat "${last!.displayLabel}"`);
    assert(store.projects.length === 0, `§4.5: TIDAK BOLEH ada proyek yang dibuat, dapat ${store.projects.length}`);
    assert(res.ensuredProjectId === undefined, 'ensuredProjectId harus kosong');
    assert(!res.message.includes('proyek sementara'), 'pesan draft TIDAK BOLEH menyebut proyek sementara');
    assert(!res.message.includes('proyek dibuat otomatis'), 'pesan draft TIDAK BOLEH mengklaim pembuatan otomatis');
  });

  await check('B53-D02 §4.5: kartu pilihan → 0 proyek; klik "Pakai Template" (GENERATE_RAB_TEMPLATE) → draft direct, tetap 0 proyek', () => {
    resetAll();
    registerEnsurer();
    const card = start('buatkan rab rumah tipe 21');
    assert(!hasPushDirect(card), 'kartu pilihan tidak boleh menghasilkan draft');
    assert(reg.getPendingRabChoice() !== null, 'kartu pilihan harus aktif (pending)');
    assert(store.projects.length === 0, 'kartu pilihan (belum ada draft) tidak boleh membuat proyek');
    const gen = reg.executeIntent('GENERATE_RAB_TEMPLATE', 'buatkan rab rumah tipe 21', mockCtx(null, 'buatkan rab rumah tipe 21'));
    assert(hasPushDirect(gen), 'GENERATE_RAB_TEMPLATE harus menghasilkan draft direct');
    assert(reg.getPendingRabChoice() === null, 'pending harus terkonsumsi sesudah generate');
    assert(store.projects.length === 0, `§4.5: TIDAK BOLEH ada proyek yang dibuat, dapat ${store.projects.length}`);
    assert(gen.ensuredProjectId === undefined, 'ensuredProjectId harus kosong');
    assert(!gen.message.includes('proyek sementara'), 'pesan draft TIDAK BOLEH menyebut proyek sementara');
  });

  await check('B53-D03 direct dengan proyek aktif: 0 proyek baru, tanpa notice, draft terikat ke proyek itu', () => {
    resetAll();
    registerEnsurer();
    const existing = store.create({ name: 'Proyek Existing' });
    const res = start('buatkan RAB rumah tipe 36 anggaran 120 juta', existing.id);
    assert(hasPushDirect(res), 'draft direct harus tetap berhasil dengan proyek aktif');
    assert(store.projects.length === 1, 'tidak boleh ada proyek baru');
    assert(store.currentId === existing.id, 'proyek aktif tidak boleh berganti');
    assert(res.ensuredProjectId === existing.id, 'ensuredProjectId harus proyek aktif yang dipakai');
    assert(!res.message.includes('proyek sementara'), 'pesan tidak boleh menyebut proyek sementara');
  });

  await check('B53-D04 tanpa draft direct → 0 proyek: ringkasan tanpa spek, di-luar-model, kartu pilihan', () => {
    resetAll();
    registerEnsurer();
    const summary = start('buatkan rab rumah');
    assert(!hasPushDirect(summary), 'ringkasan tanpa spek tidak boleh menghasilkan draft');
    assert(store.projects.length === 0, 'ringkasan tidak boleh membuat proyek');
    resetAll();
    registerEnsurer();
    const outOfModel = start('buatkan rab rumah 5 lantai luas 300 m2');
    assert(!hasPushDirect(outOfModel), 'spek di-luar-model tidak boleh menghasilkan draft');
    assert(store.projects.length === 0, 'draft yang gagal dibangun tidak boleh membuat proyek');
    resetAll();
    registerEnsurer();
    const card = start('buatkan rab rumah tipe 120');
    assert(!hasPushDirect(card), 'kartu pilihan tidak boleh menghasilkan draft');
    assert(reg.getPendingRabChoice() !== null, 'kartu pilihan harus aktif');
    assert(store.projects.length === 0, 'kartu pilihan tidak boleh membuat proyek');
  });

  await check('B53-D05 direct tanpa ensurer: draft berhasil tanpa proyek (perilaku lama)', () => {
    resetAll();
    // Sengaja TIDAK registerEnsurer — permukaan tanpa view chat.
    const res = start('buatkan RAB rumah tipe 36 anggaran 120 juta');
    assert(hasPushDirect(res), 'draft direct harus tetap berhasil tanpa ensurer');
    assert(store.projects.length === 0, 'tanpa ensurer tidak boleh ada proyek');
    assert(res.ensuredProjectId === undefined, 'ensuredProjectId harus kosong');
    assert(direct.getLastDirectRab() !== null, 'draft direct tetap ada di singleton');
  });

  await check('B53-D06 direct, ensurer gagal (lempar): draft tetap berhasil, 0 proyek, tanpa crash', () => {
    resetAll();
    tp.setDraftProjectEnsurer(() => {
      throw new Error('createProject gagal (simulasi)');
    });
    const res = start('buatkan RAB rumah tipe 36 anggaran 120 juta');
    assert(hasPushDirect(res), 'draft direct harus tetap berhasil walau ensurer gagal');
    assert(store.projects.length === 0, 'tidak ada proyek saat ensurer gagal');
    assert(res.ensuredProjectId === undefined, 'ensuredProjectId harus kosong');
    assert(direct.getLastDirectRab() !== null, 'draft direct tetap ada');
  });

  await check('B53-D07 §4.5: finalisasi "itu aja" (continueRabFinalize → direct) tanpa proyek: draft direct, 0 proyek', () => {
    resetAll();
    registerEnsurer();
    const summary = reg.executeIntent('CREATE_RAB_SUMMARY', undefined, mockCtx(null, 'buatkan rab rumah 2 lantai luas 120 m2'));
    assert(!hasPushDirect(summary), 'ringkasan tidak boleh menghasilkan draft');
    assert(store.projects.length === 0, 'ringkasan tidak boleh membuat proyek');
    const fin = reg.continueRabFinalize('itu aja', null);
    assert(fin !== null, 'finalisasi harus menangani "itu aja"');
    assert(hasPushDirect(fin), 'finalisasi harus menghasilkan draft direct');
    assert(store.projects.length === 0, `§4.5: TIDAK BOLEH ada proyek yang dibuat, dapat ${store.projects.length}`);
    assert(fin!.ensuredProjectId === undefined, 'ensuredProjectId harus kosong');
    assert(!fin!.message.includes('proyek sementara'), 'pesan finalisasi TIDAK BOLEH menyebut proyek sementara');
  });

  await check('B53-D08 §4.5: draft direct kedua memakai proyek EKSPLISIT yang sama (tanpa proyek baru)', () => {
    resetAll();
    registerEnsurer();
    // §4.5: proyek dibuat EKSPLISIT sebelum draft pertama.
    const p = store.create({ name: 'Proyek Rumah Tinggal' });
    const first = start('buatkan RAB rumah tipe 36 anggaran 120 juta');
    assert(hasPushDirect(first), 'draft direct pertama harus berhasil');
    assert(store.projects.length === 1, 'draft pertama tidak boleh membuat proyek');
    assert(first.ensuredProjectId === p.id, 'draft pertama terikat ke proyek eksplisit');
    // Simulasi keadaan view sesudah proyek dibuat: proyek aktif = eksplisit.
    const second = start('buatkan rab rumah tipe 45', p.id);
    assert(hasPushDirect(second), 'draft direct kedua harus berhasil');
    assert(store.projects.length === 1, 'draft kedua tidak boleh membuat proyek lagi');
    assert(direct.getLastDirectRab()?.displayLabel === 'Rumah Type 45', 'draft kedua harus tipe 45');
    assert(second.ensuredProjectId === p.id, 'draft kedua terikat ke proyek eksplisit yang sama');
    assert(!second.message.includes('proyek sementara'), 'draft kedua tidak boleh memberitahu proyek baru');
  });

  console.log(`\nchatTempProjectB53: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(`FAILURES: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
