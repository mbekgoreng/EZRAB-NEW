/**
 * chatIso5SnapshotPreservation.test.ts — F-ISO-5 (PRESERVE, keputusan
 * owner 2026-11-23): ganti proyek TIDAK PERNAH menghapus snapshot intake
 * proyek lain, dan snapshot yang dipertahankan PULIH saat kembali ke
 * proyek itu dalam sesi yang sama.
 *
 * Gaya plain-tsx: `npx --yes tsx src/test/chatIso5SnapshotPreservation.test.ts`
 *
 * Yang diuji lewat JALUR NYATA (registry + draftPersistence):
 * - Tier 1: cabang submit view tidak meneruskan pesan ke
 *   tryContinueUniversalContext bila singleton milik proyek lain
 *   (tidak ada merge, tidak ada drop); routing normal membentuk intake
 *   baru di proyek aktif.
 * - Tier 2: efek ganti-proyek membersihkan singleton milik proyek LAMA
 *   (memori saja — snapshot disk utuh), mengosongkan awaitingConcept,
 *   dan menghapus entri proyek lama dari intakeRestoredForRef sehingga
 *   efek pulih bisa jalan lagi saat kembali.
 * - Perilaku yang DIPERTAHANKAN: drop same-project (topik sengaja
 *   ditinggalkan di proyek yang sama), penjaga F-ISO-1 (efek simpan),
 *   penjaga F-ISO-3 (lapisan persistensi), mount pertama (tidak
 *   membersihkan), konteks tanpa cap (jalur lama/global).
 * - Situs drop kedua (projectIntakeGate :1055) tertutup BY CONSTRUCTION
 *   oleh Tier 2 — dibuktikan kontrol negatifnya di ISO5-11.
 * - Q-5: handler push-universal membaca draft lewat getter terikat
 *   proyek — draft konteks asing TIDAK PERNAH bisa ter-push ke proyek
 *   lain (pesan jujur "tidak ada draft aktif", bukan penulisan
 *   lintas-proyek); dan di bawah Tier 2 skenario itu tidak muncul.
 *
 * BATAS UJI (jujur): efek-efek React view (cabang submit Tier 1, efek
 * ganti-proyek Tier 2, efek simpan/pulih) dimodelkan di sini sebagai
 * fungsi murni yang MENIRU view.tsx baris-per-baris (nomor baris dikutip
 * di tiap model) — React asli tidak dapat berjalan di tsx polos, dan
 * efek sesungguhnya menjadi tugas verifikator UI (harness E2E). Yang
 * dibuktikan suite ini adalah perilaku REGISTRY + PERSISTENSI di bawah
 * logika view yang dimodelkan setia: penjaga memanggil fungsi nyata
 * (tryContinueUniversalContext, saveIntakeContext, loadIntakeContext,
 * shouldRestoreIntakeSnapshot, restoreUniversalContext,
 * clearUniversalContext, projectIntakeGate) dengan kondisi yang sama
 * persis seperti view. Bila logika view berubah, model di sini HARUS
 * ikut — dan sebaliknya, tes yang lolos di sini bukan bukti efek React
 * berjalan (itu tugas E2E Skenario A).
 *
 * BATAS UJI — konkurensi (ISO5-13): tsx berjalan satu utas dengan satu
 * shim localStorage — konkurensi ANTAR-TAB yang sesungguhnya (dua tab
 * menulis kunci yang sama) TIDAK dapat dimodelkan di sini; ISO5-13
 * adalah model terkuat yang ada (operasi berjalin cepat: ganti-kirim-
 * simpan-ganti tanpa jeda, dengan asersi integritas sesudah tiap
 * langkah). Optimistic concurrency antar-tab (expectedUpdatedAt /
 * DRAFT_VERSION_CONFLICT) dipin suite draftPersistenceHardening.
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

const A = 'PRJ-ISO5-A';
const B = 'PRJ-ISO5-B';
const C = 'PRJ-ISO5-C';
const JALAN_TEXT = 'Buatkan RAB jalan beton sepanjang 2 km';
const KANDANG_TEXT = 'Saya punya budget Rp300 juta. Bisa buatkan RAB kandang sapi?';
const LANDSCAPE_TEXT = 'Buatkan RAB landscape taman seluas 500 m2';

async function main(): Promise<void> {
  console.log('chatIso5SnapshotPreservation.test (F-ISO-5 PRESERVE)');
  const reg = await import('../ai-tools/ezrab-ai/actionRegistry');
  const dp = await import('../ai-tools/ezrab-ai/draftPersistence');
  const rab = await import('../ai-tools/ezrab-ai/universalRab');
  const { routeIntent } = await import('../ai-tools/ezrab-ai/intentRouter');

  /* ---------- State view yang dimodelkan (cermin useState/useRef) ---------- */
  let effProjectId: string | null = null; // cermin effProject?.id
  let awaitingConcept = false; // cermin useState view.tsx:524
  let prevProjectIdForIntake: string | null | undefined = undefined; // ref Tier 2
  let intakeRestoredFor = new Set<string>(); // cermin intakeRestoredForRef

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

  /* Tiruan setia efek simpan view.tsx:1387-1400 (DENGAN penjaga F-ISO-1). */
  const viewSaveEffect = (): string => {
    if (!effProjectId) return 'SKIP (tanpa effProject)';
    const ictx = reg.getUniversalContextState();
    if (!ictx) return 'SKIP (singleton null)';
    if (ictx.projectId && ictx.projectId !== effProjectId) return 'SKIP (F-ISO-1: milik proyek lain)';
    const r = dp.saveIntakeContext(effProjectId, ictx);
    return r.ok ? 'SAVED' : `FAIL ${r.error}`;
  };
  /* Tiruan setia efek pulih view.tsx:1416-1451 (tanpa skipIntakeRestore
   * B5-3 — tidak relevan di suite ini: tidak ada proyek sementara). */
  const viewRestoreEffect = (): string => {
    if (!effProjectId) return 'SKIP (tanpa effProject)';
    if (reg.getUniversalContextState()) return 'SKIP (singleton non-null)';
    if (intakeRestoredFor.has(effProjectId)) return 'SKIP (sudah dipulihkan mount ini)';
    intakeRestoredFor.add(effProjectId);
    const loaded = dp.loadIntakeContext(effProjectId);
    if (!loaded.ok) return `SKIP (load gagal: ${loaded.error})`;
    const draftRec = dp.peekPersistedDraft(effProjectId);
    if (!dp.shouldRestoreIntakeSnapshot(loaded, draftRec)) return 'SKIP (shouldRestore menolak)';
    reg.restoreUniversalContext(loaded.ctx, effProjectId);
    if (!loaded.generatedDraftId) awaitingConcept = true;
    return 'RESTORED';
  };
  /* Tiruan setia efek ganti-proyek Tier 2 BARU (view.tsx, dideklarasikan
   * SEBELUM efek pulih): bersihkan singleton milik proyek LAMA saja. */
  const viewSwitchEffect = (): string => {
    const prevId = prevProjectIdForIntake;
    prevProjectIdForIntake = effProjectId;
    if (prevId === undefined) return 'SKIP (mount pertama)';
    if (prevId === effProjectId) return 'SKIP (bukan pergantian)';
    const ictx = reg.getUniversalContextState();
    if (!ictx || !ictx.projectId || ictx.projectId !== prevId) return 'SKIP (bukan milik proyek lama)';
    reg.clearUniversalContext();
    awaitingConcept = false;
    intakeRestoredFor.delete(prevId);
    return 'CLEARED';
  };
  /* Satu commit ganti-proyek: efek berjalan dalam urutan deklarasi —
   * simpan → clear Tier 2 → pulih. */
  const switchProject = (id: string | null) => {
    effProjectId = id;
    const save = viewSaveEffect();
    const cleared = viewSwitchEffect();
    const restored = viewRestoreEffect();
    return { save, cleared, restored };
  };
  /* Tiruan setia cabang submit awaitingConcept view.tsx:2321+ (Tier 1):
   * singleton milik proyek lain TIDAK diteruskan ke
   * tryContinueUniversalContext. Mengembalikan hasil continue, atau
   * null bila pesan harus jatuh ke routing normal. */
  const continueBranch = (text: string) => {
    const liveIntake = reg.getUniversalContextState();
    const foreignIntake = !!liveIntake?.projectId && liveIntake.projectId !== effProjectId;
    const ctxRes = reg.tryContinueProjectContext(text) ?? (foreignIntake ? null : reg.tryContinueUniversalContext(text));
    if (ctxRes) {
      awaitingConcept = (ctxRes as { awaitProjectConcept?: boolean }).awaitProjectConcept === true;
      return ctxRes;
    }
    awaitingConcept = false;
    return null;
  };
  /* Kirim penuh: cabang continue (bila awaitingConcept) lalu routing
   * normal; efek simpan berjalan sesudah pesan (deps [messages]). */
  const submitGuarded = (text: string) => {
    if (awaitingConcept) {
      const ctxRes = continueBranch(text);
      if (ctxRes) {
        viewSaveEffect();
        return { via: 'continue' as const, res: ctxRes };
      }
    }
    const routed = routeIntent(text);
    const res = reg.executeIntent(routed.intent, routed.param, mockCtx(effProjectId, text));
    if ((res as { awaitProjectConcept?: boolean }).awaitProjectConcept) awaitingConcept = true;
    viewSaveEffect();
    return { via: 'routing' as const, res, routed };
  };

  const snap = (pid: string) => dp.peekIntakeContext(pid);
  const snapPrimary = (pid: string) => snap(pid)?.context.primaryId ?? null;
  const snapJson = (pid: string) => (snap(pid) ? JSON.stringify(snap(pid)!.context) : null);
  const singletonDesc = () => {
    const s = reg.getUniversalContextState();
    return s ? `${s.primary?.id ?? '?'}/${s.projectId ?? 'null'}` : 'null';
  };
  /* Alur baku: intake jalan hidup di B + tersimpan. Mengembalikan
   * updatedAt snapshot B untuk pembuktian "tidak berubah". */
  const startIntakeInB = () => {
    const sw = switchProject(B);
    assert(sw.cleared === 'SKIP (mount pertama)', `mount pertama harus SKIP clear, dapat "${sw.cleared}"`);
    const s = submitGuarded(JALAN_TEXT);
    assert(s.via === 'routing', 'intake jalan harus lewat routing normal');
    assert((s.res as { awaitProjectConcept?: boolean }).awaitProjectConcept === true, 'intake jalan harus menanyakan konsep (awaitProjectConcept)');
    assert(awaitingConcept === true, 'awaitingConcept harus true sesudah intake jalan');
    assert(singletonDesc() === `jalan-beton/${B}`, `singleton harus jalan-beton/${B}, dapat "${singletonDesc()}"`);
    assert(snapPrimary(B) === 'jalan-beton', 'snapshot B harus tersimpan (jalan-beton)');
    return snap(B)!.updatedAt;
  };

  const resetAll = () => {
    reg.clearUniversalContext();
    reg.clearProjectContext();
    rab.clearLastUniversalDraft();
    storage.clear();
    effProjectId = null;
    awaitingConcept = false;
    prevProjectIdForIntake = undefined;
    intakeRestoredFor = new Set<string>();
  };

  await check('ISO5-01 kirim di A TIDAK men-drop snapshot B (skenario probe baseline, pasca-perbaikan)', () => {
    resetAll();
    const updatedB = startIntakeInB();
    // PINDAH ke A: Tier 2 membersihkan singleton B dari memori.
    const sw = switchProject(A);
    assert(sw.cleared === 'CLEARED', `switch B→A harus CLEARED, dapat "${sw.cleared}"`);
    assert(singletonDesc() === 'null', 'singleton harus null sesudah switch');
    assert(awaitingConcept === false, 'awaitingConcept harus false sesudah switch');
    assert(snapPrimary(B) === 'jalan-beton', 'snapshot B harus UTUH sesudah switch');
    assert(snap(B)!.updatedAt === updatedB, 'snapshot B tidak boleh ditulis ulang saat switch');
    // KIRIM pesan baru di A (teks yang sama dengan probe baseline).
    const s = submitGuarded(KANDANG_TEXT);
    assert(s.via === 'routing', 'pesan di A harus lewat routing normal (bukan continue ke konteks B)');
    assert(snapPrimary(B) === 'jalan-beton', 'snapshot B harus TETAP UTUH sesudah kirim di A');
    assert(snap(B)!.updatedAt === updatedB, 'snapshot B tidak boleh berubah sesudah kirim di A');
    assert(snapPrimary(A) === 'kandang', 'snapshot A harus terbentuk (kandang)');
    assert(singletonDesc() === `kandang/${A}`, `singleton harus kandang/${A}, dapat "${singletonDesc()}"`);
    // Pertahanan berlapis (Tier 1 LANGSUNG): bila singleton asing MASIH
    // hidup saat kirim (seolah clear Tier 2 terlewat — mis. remount
    // tanpa ganti proyek), penjaga submit HARUS memblokir
    // tryContinueUniversalContext sehingga tidak ada drop.
    resetAll();
    const updatedB2 = startIntakeInB();
    effProjectId = A; // pindah proyek TANPA efek Tier 2 (simulasi celah)
    prevProjectIdForIntake = A;
    assert(singletonDesc() === `jalan-beton/${B}`, 'prasyarat lapis-2: singleton B masih hidup di A');
    assert(awaitingConcept === true, 'prasyarat lapis-2: awaitingConcept masih true');
    const blocked = continueBranch(KANDANG_TEXT);
    assert(blocked === null, 'cabang continue harus null (dihalau penjaga, bukan merge)');
    assert(snapPrimary(B) === 'jalan-beton', 'lapis-2: snapshot B TIDAK BOLEH ter-drop oleh penjaga Tier 1');
    assert(snap(B)!.updatedAt === updatedB2, 'lapis-2: snapshot B tidak berubah');
    assert(singletonDesc() === `jalan-beton/${B}`, 'lapis-2: singleton B tidak di-null-kan (tidak ada merge, tidak ada drop)');
    assert(awaitingConcept === false, 'lapis-2: awaitingConcept false sesudah halauan');
    const s2 = submitGuarded(KANDANG_TEXT);
    assert(s2.via === 'routing', 'lapis-2: pesan jatuh ke routing normal');
    assert(snapPrimary(A) === 'kandang', 'lapis-2: snapshot A terbentuk');
    assert(snapPrimary(B) === 'jalan-beton', 'lapis-2: snapshot B tetap utuh sesudah routing di A');
  });

  await check('ISO5-02 jawaban di A TIDAK digabung ke konteks B (kontaminasi percakapan tertutup)', () => {
    resetAll();
    const updatedB = startIntakeInB();
    const sw = switchProject(A);
    assert(sw.cleared === 'CLEARED', 'switch harus CLEARED');
    // Jawaban berbentuk lanjutan ("lebarnya 5 meter") di A: tanpa
    // konteks hidup, tidak ada yang digabung.
    submitGuarded('lebarnya 5 meter');
    assert(singletonDesc() === 'null', `singleton harus tetap null (tidak ada merge ke konteks B), dapat "${singletonDesc()}"`);
    assert(snapPrimary(B) === 'jalan-beton', 'snapshot B harus utuh');
    assert(snap(B)!.updatedAt === updatedB, 'snapshot B tidak boleh berubah');
    assert(snap(A) === null, 'tidak ada snapshot A dari jawaban tanpa konteks');
  });

  await check('ISO5-03 drop same-project TETAP bekerja (topik sengaja ditinggalkan di proyek yang sama)', () => {
    resetAll();
    startIntakeInB();
    // Perintah baru primer-berbeda DI PROYEK YANG SAMA (B): penjaga
    // Tier 1 meloloskan (bukan asing) → cabang drop :1663 berjalan.
    assert(awaitingConcept === true, 'prasyarat: awaitingConcept true');
    const ctxRes = continueBranch(KANDANG_TEXT);
    assert(ctxRes === null, 'perintah baru harus mengembalikan null (bukan merge)');
    assert(snap(B) === null, 'snapshot jalan B harus TER-DROP (perilaku same-project dipertahankan)');
    assert(singletonDesc() === 'null', 'singleton harus null sesudah drop same-project');
    assert(awaitingConcept === false, 'awaitingConcept harus false sesudah drop');
    // Routing normal sesudahnya membentuk intake kandang di B.
    const s = submitGuarded(KANDANG_TEXT);
    assert(s.via === 'routing', 'pesan sesudah drop lewat routing normal');
    assert(snapPrimary(B) === 'kandang', 'snapshot B kini kandang (intake baru di proyek yang sama)');
  });

  await check('ISO5-04 Tier 2: switch membersihkan singleton proyek lama, snapshot disk utuh, ref pulih dibersihkan', () => {
    resetAll();
    const updatedB = startIntakeInB();
    // Tandai B seolah pernah dipulihkan mount ini (agar penghapusan
    // entri ref oleh efek Tier 2 dapat dibuktikan).
    intakeRestoredFor.add(B);
    const sw = switchProject(A);
    assert(sw.cleared === 'CLEARED', `switch harus CLEARED, dapat "${sw.cleared}"`);
    assert(sw.restored.startsWith('SKIP'), `restore di A harus SKIP (tidak ada snapshot A), dapat "${sw.restored}"`);
    assert(singletonDesc() === 'null', 'singleton harus null');
    assert(awaitingConcept === false, 'awaitingConcept harus false');
    assert(!intakeRestoredFor.has(B), 'entri B harus dihapus dari intakeRestoredFor agar pulih bisa jalan saat kembali');
    assert(snapPrimary(B) === 'jalan-beton', 'snapshot B utuh');
    assert(snap(B)!.updatedAt === updatedB, 'snapshot B tidak ditulis ulang');
  });

  await check('ISO5-05 kembali ke B memulihkan snapshot DALAM SESI (tanpa reload)', () => {
    resetAll();
    startIntakeInB();
    switchProject(A);
    assert(singletonDesc() === 'null', 'singleton null di A');
    const back = switchProject(B);
    assert(back.restored === 'RESTORED', `kembali ke B harus RESTORED, dapat "${back.restored}"`);
    assert(singletonDesc() === `jalan-beton/${B}`, `singleton harus pulih jalan-beton/${B}, dapat "${singletonDesc()}"`);
    assert(awaitingConcept === true, 'awaitingConcept harus true lagi sesudah pulih (intake belum sampai draft)');
    assert(snapPrimary(B) === 'jalan-beton', 'snapshot B tetap ada');
    // Lanjutan di B kini digabung ke konteks B yang pulih (bukan ke A).
    const cont = continueBranch('lebarnya 5 meter');
    assert(cont !== null, 'jawaban di B harus digabung ke konteks B yang pulih');
    assert(singletonDesc() === `jalan-beton/${B}`, 'singleton tetap konteks B sesudah lanjutan');
  });

  await check('ISO5-06 mount pertama TIDAK membersihkan (snapshot sesi sebelumnya dipulihkan efek pulih)', () => {
    resetAll();
    // Sesi sebelumnya: intake jalan di B tersimpan, lalu "reload"
    // (singleton mati, storage utuh, state view segar).
    startIntakeInB();
    reg.clearUniversalContext();
    rab.clearLastUniversalDraft();
    effProjectId = null;
    awaitingConcept = false;
    prevProjectIdForIntake = undefined;
    intakeRestoredFor = new Set<string>();
    assert(singletonDesc() === 'null', 'prasyarat reload: singleton null');
    assert(snapPrimary(B) === 'jalan-beton', 'prasyarat reload: snapshot B ada di storage');
    const mount = switchProject(B);
    assert(mount.cleared === 'SKIP (mount pertama)', `mount pertama harus SKIP clear, dapat "${mount.cleared}"`);
    assert(mount.restored === 'RESTORED', `mount pertama harus RESTORED, dapat "${mount.restored}"`);
    assert(singletonDesc() === `jalan-beton/${B}`, 'konteks B pulih saat mount');
    assert(awaitingConcept === true, 'awaitingConcept true sesudah pulih di mount');
  });

  await check('ISO5-07 singleton TANPA CAP tidak dibersihkan saat ganti proyek (jalur lama/global)', () => {
    resetAll();
    // Intake tanpa proyek aktif (global): konteks tanpa cap projectId.
    effProjectId = null;
    prevProjectIdForIntake = null; // mount global sudah terjadi
    const s = submitGuarded(JALAN_TEXT);
    assert(s.via === 'routing', 'intake global lewat routing');
    const live = reg.getUniversalContextState();
    assert(live !== null, 'singleton global harus hidup');
    assert(live!.projectId == null, `konteks global harus tanpa cap, dapat "${live!.projectId}"`);
    assert(snap(B) === null && snap(A) === null, 'tanpa effProject, tidak ada snapshot disk (efek simpan butuh proyek)');
    // Buka proyek A: Tier 2 TIDAK boleh membersihkan (tanpa cap =
    // bukan "milik proyek lama"; membersihkannya menghilangkan intake
    // tanpa jejak karena tidak ada snapshotnya).
    const sw = switchProject(A);
    assert(sw.cleared === 'SKIP (bukan milik proyek lama)', `switch global→A harus SKIP clear, dapat "${sw.cleared}"`);
    assert(reg.getUniversalContextState() !== null, 'singleton tanpa cap harus TETAP HIDUP sesudah switch');
    assert(reg.getUniversalContextState()!.primary?.id === 'jalan-beton', 'konteks yang bertahan harus jalan-beton');
  });

  await check('ISO5-08 clear hanya untuk milik proyek lama: render ulang idem + singleton proyek ketiga tidak disentuh', () => {
    resetAll();
    startIntakeInB();
    // (a) "Render ulang" dengan proyek yang sama BUKAN pergantian.
    const same = switchProject(B);
    assert(same.cleared === 'SKIP (bukan pergantian)', `switch B→B harus SKIP, dapat "${same.cleared}"`);
    assert(singletonDesc() === `jalan-beton/${B}`, 'singleton B utuh sesudah render ulang idem');
    // (b) Singleton milik proyek KETIGA (bukan lama, bukan baru).
    reg.clearUniversalContext();
    const ctxC = { primary: { id: 'jalan-beton', label: 'Jalan Beton' }, projectId: C } as never;
    reg.restoreUniversalContext(ctxC, C);
    assert(singletonDesc() === `jalan-beton/${C}`, 'prasyarat: singleton milik C');
    const sw = switchProject(A);
    assert(sw.cleared === 'SKIP (bukan milik proyek lama)', `switch dengan singleton C harus SKIP, dapat "${sw.cleared}"`);
    assert(singletonDesc() === `jalan-beton/${C}`, 'singleton C tidak boleh disentuh');
  });

  await check('ISO5-09 delayed write: tulis terlambat di bawah kunci yang salah DITOLAK di dua lapis', () => {
    resetAll();
    const updatedB = startIntakeInB();
    // Siapkan snapshot A yang sudah ada (konten berbeda) agar
    // penimpaan dapat dideteksi.
    switchProject(A);
    submitGuarded(KANDANG_TEXT);
    const snapAJsonBefore = snapJson(A);
    const updatedA = snap(A)!.updatedAt;
    assert(snapAJsonBefore !== null, 'prasyarat: snapshot A ada');
    // (a) LAPIS PERSISTENSI (F-ISO-3): tulis terlambat dari sesi B —
    // konteks tercap B yang tiba-tiba ditulis di bawah kunci A.
    const staleCtxB = reg.getUniversalContextState(); // konteks A saat ini — ganti capnya
    assert(staleCtxB !== null && staleCtxB.projectId === A, 'prasyarat: singleton saat ini milik A');
    const forged = { ...staleCtxB, projectId: B } as never;
    const direct = dp.saveIntakeContext(A, forged);
    assert(direct.ok === false, 'saveIntakeContext(A, ctx-bercap-B) harus DITOLAK (F-ISO-3)');
    assert(snapJson(A) === snapAJsonBefore, 'snapshot A tidak boleh berubah oleh tulis terlambat');
    assert(snap(A)!.updatedAt === updatedA, 'updatedAt A tidak boleh berubah');
    // (b) LAPIS VIEW (F-ISO-1): efek simpan yang berjalan dengan
    // singleton asing (seolah efek lama berjalan terlambat sesudah
    // switch, sebelum clear) — harus SKIP, bukan menyimpan.
    reg.clearUniversalContext();
    const ctxB = { primary: { id: 'jalan-beton', label: 'Jalan Beton' }, projectId: B } as never;
    reg.restoreUniversalContext(ctxB, B);
    effProjectId = A; // efek simpan berjalan dengan effProject=A + singleton B
    const saveRes = viewSaveEffect();
    assert(saveRes === 'SKIP (F-ISO-1: milik proyek lain)', `efek simpan asing harus SKIP, dapat "${saveRes}"`);
    assert(snapJson(A) === snapAJsonBefore, 'snapshot A tetap utuh sesudah efek simpan terlambat');
    assert(snapPrimary(B) === 'jalan-beton' && snap(B)!.updatedAt === updatedB, 'snapshot B tetap utuh');
  });

  await check('ISO5-10 sesudah kembali ke B, simpan memperbarui snapshot B (bukan A)', () => {
    resetAll();
    startIntakeInB();
    switchProject(A);
    submitGuarded(KANDANG_TEXT);
    const snapAJson = snapJson(A);
    const beforeB = snapJson(B);
    const back = switchProject(B);
    assert(back.restored === 'RESTORED', 'kembali ke B harus RESTORED');
    const cont = continueBranch('lebarnya 5 meter');
    assert(cont !== null, 'jawaban harus digabung ke konteks B');
    const saveRes = viewSaveEffect();
    assert(saveRes === 'SAVED', `efek simpan di B harus SAVED, dapat "${saveRes}"`);
    assert(snapJson(B) !== beforeB, 'snapshot B harus diperbarui dengan jawaban baru');
    assert(snapPrimary(B) === 'jalan-beton', 'snapshot B tetap jalan-beton');
    assert(snapJson(A) === snapAJson, 'snapshot A tidak boleh berubah saat B diperbarui');
  });

  await check('ISO5-11 gerbang landscape (:1055) TIDAK BISA men-drop snapshot asing di bawah Tier 2 (+ kontrol negatif)', () => {
    resetAll();
    const updatedB = startIntakeInB();
    // Tier 2: switch membersihkan singleton B; gerbang landscape di A
    // tidak punya singleton asing untuk di-drop.
    switchProject(A);
    assert(singletonDesc() === 'null', 'prasyarat Tier 2: singleton null di A');
    const gate = reg.projectIntakeGate(LANDSCAPE_TEXT);
    assert(gate !== null, 'teks landscape harus mengaktifkan gerbang landscape');
    assert(snapPrimary(B) === 'jalan-beton', 'snapshot B harus UTUH sesudah gerbang landscape di A');
    assert(snap(B)!.updatedAt === updatedB, 'snapshot B tidak berubah');
    // KONTROL NEGATIF (mendokumentasikan MENGAPA Tier 2 diperlukan):
    // TANPA clear, singleton asing yang hidup MEMANG di-drop gerbang.
    resetAll();
    startIntakeInB();
    // Simulasikan Tier 1 saja: pindah proyek TANPA efek clear (state
    // view diubah manual, singleton B dibiarkan hidup).
    effProjectId = A;
    prevProjectIdForIntake = A;
    assert(singletonDesc() === `jalan-beton/${B}`, 'kontrol: singleton B masih hidup di A (tanpa Tier 2)');
    const gate2 = reg.projectIntakeGate(LANDSCAPE_TEXT);
    assert(gate2 !== null, 'kontrol: gerbang landscape aktif');
    assert(snap(B) === null, 'kontrol: tanpa Tier 2, gerbang landscape MEN-DROP snapshot B (vektor :1055 nyata)');
    assert(singletonDesc() === 'null', 'kontrol: singleton ikut di-null-kan gerbang');
  });

  await check('ISO5-12 Q-5: push-universal pada draft konteks asing — getter menolak, tanpa tulis lintas-proyek', () => {
    resetAll();
    // (a) Kontrak getter yang dipakai handler push (view.tsx
    // pushUniversalToSpreadsheetPreview + pushUniversalToSpreadsheet
    // membaca getLastUniversalDraft(effProject?.id) dan menjawab jujur
    // "tidak ada draft aktif" bila null).
    const built = rab.buildUniversalDraft('Buatkan RAB kandang sapi 17 x 9 m', undefined, { projectId: A });
    assert(built.kind === 'draft', 'prasyarat: draft kandang berhasil dibangun');
    assert(rab.getLastUniversalDraftProjectId() === A, 'draft terikat ke A');
    assert(rab.getLastUniversalDraft(B) === null, 'di proyek B, getter mengembalikan null — handler push tidak punya draft untuk ditulis');
    assert(rab.getLastUniversalDraft(A) !== null, 'di proyek A, draft terbaca normal');
    assert(rab.getLastUniversalDraft() !== null, 'getter tanpa proyek (jalur lama) tetap membaca draft');
    // (b) Di bawah Tier 2 skenario itu tidak muncul: konteks asing
    // sudah dibersihkan saat switch, jadi tidak ada draft yang bisa
    // dibangun dari konteks proyek lain di proyek ini.
    resetAll();
    startIntakeInB();
    switchProject(A);
    assert(singletonDesc() === 'null', 'prasyarat Tier 2: tidak ada konteks asing di A');
    submitGuarded('itu aja');
    assert(rab.getLastUniversalDraft() === null, 'tidak ada draft yang dibangun dari konteks asing di A');
    assert(snapPrimary(B) === 'jalan-beton', 'snapshot B utuh');
  });

  await check('ISO5-13 concurrent: operasi berjalin cepat antar-proyek — kedua snapshot utuh, tanpa kontaminasi', () => {
    resetAll();
    // T0: intake jalan di B.
    startIntakeInB();
    // T1: switch A + intake kandang di A (tanpa jeda).
    let sw = switchProject(A);
    assert(sw.cleared === 'CLEARED', 'T1: clear B');
    submitGuarded(KANDANG_TEXT);
    assert(snapPrimary(A) === 'kandang' && snapPrimary(B) === 'jalan-beton', 'T1: kedua snapshot ada');
    // T2: switch B + jawaban lanjutan di B (merge ke konteks B yang pulih).
    sw = switchProject(B);
    assert(sw.restored === 'RESTORED', 'T2: B pulih');
    const cB = continueBranch('lebarnya 5 meter');
    assert(cB !== null, 'T2: jawaban digabung ke B');
    viewSaveEffect();
    assert(snapPrimary(B) === 'jalan-beton', 'T2: B tetap jalan-beton');
    // T3: switch A + jawaban lanjutan di A (merge ke konteks A yang pulih).
    sw = switchProject(A);
    assert(sw.restored === 'RESTORED', 'T3: A pulih');
    assert(singletonDesc() === `kandang/${A}`, 'T3: singleton kandang/A');
    const cA = continueBranch('lebarnya 9 meter');
    assert(cA !== null, 'T3: jawaban digabung ke A');
    viewSaveEffect();
    assert(snapPrimary(A) === 'kandang', 'T3: A tetap kandang');
    // T4: switch B lagi — konteks B pulih dengan jawaban T2-nya.
    sw = switchProject(B);
    assert(sw.restored === 'RESTORED', 'T4: B pulih lagi');
    assert(singletonDesc() === `jalan-beton/${B}`, 'T4: singleton jalan-beton/B');
    // Keadaan akhir: kedua snapshot utuh dengan primer masing-masing.
    assert(snapPrimary(B) === 'jalan-beton', 'akhir: snapshot B jalan-beton');
    assert(snapPrimary(A) === 'kandang', 'akhir: snapshot A kandang');
    assert(snap(B)!.context.data.projectId === B, 'akhir: cap proyek B benar');
    assert(snap(A)!.context.data.projectId === A, 'akhir: cap proyek A benar');
  });

  await check('ISO5-14 repeated switching: 5 pulang-pergi — pulih BERHASIL di SETIAP kembalian', () => {
    resetAll();
    startIntakeInB();
    switchProject(A);
    submitGuarded(KANDANG_TEXT);
    switchProject(B);
    assert(singletonDesc() === `jalan-beton/${B}`, 'prasyarat: kembali ke B, konteks B pulih');
    const updatedB = snap(B)!.updatedAt;
    const updatedA = snap(A)!.updatedAt;
    for (let i = 1; i <= 5; i += 1) {
      const toA = switchProject(A);
      assert(toA.restored === 'RESTORED', `putaran ${i}: kembali ke A harus RESTORED, dapat "${toA.restored}"`);
      assert(singletonDesc() === `kandang/${A}`, `putaran ${i}: singleton kandang/A`);
      assert(awaitingConcept === true, `putaran ${i}: awaitingConcept true di A`);
      const toB = switchProject(B);
      assert(toB.restored === 'RESTORED', `putaran ${i}: kembali ke B harus RESTORED, dapat "${toB.restored}"`);
      assert(singletonDesc() === `jalan-beton/${B}`, `putaran ${i}: singleton jalan-beton/B`);
      assert(awaitingConcept === true, `putaran ${i}: awaitingConcept true di B`);
    }
    assert(snap(B)!.updatedAt === updatedB, 'snapshot B tidak ditulis ulang selama pulang-pergi murni');
    assert(snap(A)!.updatedAt === updatedA, 'snapshot A tidak ditulis ulang selama pulang-pergi murni');
    assert(snapPrimary(B) === 'jalan-beton' && snapPrimary(A) === 'kandang', 'kedua snapshot utuh sesudah 5 putaran');
  });

  console.log(`\nchatIso5SnapshotPreservation: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(`FAILURES: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
