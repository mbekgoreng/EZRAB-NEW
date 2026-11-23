/**
 * chatIsoLandscapeS3B.test.ts — STAGE 3 S3-B (2026-11-23): isolasi
 * lintas-proyek konteks landscape (`projectCtx`).
 *
 * Gaya plain-tsx: `npx --yes tsx src/test/chatIsoLandscapeS3B.test.ts`
 *
 * Discovery (S3B-DISCOVERY.md) membuktikan kontaminasi 17/17: jawaban di
 * proyek B digabung ke konteks landscape proyek A (S1), draft B dibangun
 * dari fakta A (S2), gerbang B memakai base A (S3/S3b), Tier 2 F-ISO-5
 * return dini karena universalCtx null (S1b), dan fakta A masuk payload
 * LLM B lewat riwayat (S9). Suite ini mem-pin PERBAIKANNYA:
 *
 * - S3B-01 konteks proyek yang benar digabung (same-project utuh + cap)
 * - S3B-02 konteks asing ditolak di penjaga submit (global tanpa cap +
 *          singleton asing yang dipaksakan hidup — pertahanan berlapis)
 * - S3B-03 null ditangani aman (builder tanpa klaim; pemanggil gerbang
 *          lama tanpa projectId mempertahankan perilaku lama)
 * - S3B-04 konteks basi ditolak sesudah switch (Tier 2 membersihkan;
 *          tidak ada kebangkitan saat kembali)
 * - S3B-05 respons async proyek sebelumnya diabaikan (pin S8: balasan
 *          landscape sinkron; snapshot kirim tidak membawa landscape)
 * - S3B-06 new chat tidak mewarisi landscape proyek lain; new chat
 *          same-project MEMPERTAHANKAN konteks (Q-S3B-3, konsisten
 *          dengan universal + Q-8)
 * - S3B-07 restore memvalidasi kepemilikan (loadConversation tidak
 *          membangkitkan konteks; store menolak baca lintas-proyek)
 * - S3B-08 binding proyek sementara tidak membocorkan konteks (generate
 *          asing/global-di-proyek ditolak tanpa ensurer dipanggil;
 *          generate global sah terikat ke proyek sementara dari
 *          faktanya sendiri)
 * - S3B-09 perilaku landscape valid utuh (alur penuh sampai draft)
 * - S3B-10 PAYLOAD AI FINAL: prompt B bebas penanda A sesudah skenario
 *          kontaminasi; builder menolak intake + conversationId asing
 * - S3B-11 gerbang mulai segar di proyek baru (S3/S3b tertutup)
 * - S3B-12 tombol konsep/pratinjau/generate menolak konteks asing
 *
 * BATAS UJI (jujur): efek React view (cabang submit, efek ganti-proyek
 * Tier 2, newChat, loadConversation) dimodelkan sebagai fungsi murni
 * yang MENIRU view.tsx baris-per-baris pasca-perbaikan S3-B (nomor baris
 * dikutip di tiap model) — React asli tidak dapat berjalan di tsx polos.
 * Efek simpan/pulih intake TIDAK dimodelkan: keduanya hanya membaca
 * universalCtx dan tidak pernah menyentuh projectCtx (landscape tidak
 * dipersistensi — S6 discovery). Yang dibuktikan suite ini adalah
 * perilaku REGISTRY + BUILDER di bawah logika view yang dimodelkan
 * setia. Efek React sesungguhnya menjadi tugas verifikator UI (E2E).
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

const A = 'PRJ-S3B-A';
const B = 'PRJ-S3B-B';
const LANDSCAPE_A = 'Buatkan taman kota 1 hektar di Surabaya dengan jogging track dan playground';
const LANDSCAPE_B = 'buatkan rab taman bermain 500 m2 di Malang';
const LANDSCAPE_GLOBAL = 'Buatkan taman kota 2 hektar di Batu dengan kolam ikan';
const ANSWER_B = 'Tambahkan area parkir dan toilet umum';
// Penanda fakta A — nilai yang tidak mungkin muncul kebetulan.
const MARK_A = [/surabaya/i, /10\.000/, /jogging track/i];
const hasMarkA = (s: string) => MARK_A.some((re) => re.test(s));

async function main(): Promise<void> {
  console.log('chatIsoLandscapeS3B.test (STAGE 3 S3-B — isolasi projectCtx)');
  const reg = await import('../ai-tools/ezrab-ai/actionRegistry');
  const dp = await import('../ai-tools/ezrab-ai/draftPersistence');
  const rab = await import('../ai-tools/ezrab-ai/universalRab');
  const cc = await import('../ai-tools/ezrab-ai/canonicalContext');
  const tp = await import('../ai-tools/ezrab-ai/tempProject');
  const { routeIntent } = await import('../ai-tools/ezrab-ai/intentRouter');
  const { unifiedConversationStore } = await import('../services/ai/conversation/unifiedConversationStore');

  /* ---------- State view yang dimodelkan (cermin useState/useRef) ---------- */
  let effProjectId: string | null = null;
  let awaitingConcept = false;
  let prevProjectIdForIntake: string | null | undefined = undefined;
  let activeConvId: string | null = null;

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

  /* Tiruan setia efek ganti-proyek Tier 2 view.tsx (cabang universal
   * F-ISO-5 + cabang landscape S3-B): keduanya independen — return dini
   * lama (bila universalCtx null) TIDAK BOLEH menghalangi cabang
   * landscape. Mount pertama + proyek sama: tanpa clear. */
  const viewSwitchEffect = (): string => {
    const prevId = prevProjectIdForIntake;
    prevProjectIdForIntake = effProjectId;
    if (prevId === undefined) return 'SKIP (mount pertama)';
    if (prevId === effProjectId) return 'SKIP (bukan pergantian)';
    const notes: string[] = [];
    const ictx = reg.getUniversalContextState();
    if (ictx && ictx.projectId && ictx.projectId === prevId) {
      reg.clearUniversalContext();
      awaitingConcept = false;
      notes.push('universal-cleared');
    }
    const pctx = reg.getProjectContextState();
    if (pctx && pctx.projectId && pctx.projectId === prevId) {
      reg.clearProjectContext();
      awaitingConcept = false;
      notes.push('landscape-cleared');
    }
    return notes.length ? notes.join('+') : 'SKIP (bukan milik proyek lama)';
  };
  const switchProject = (id: string | null) => {
    effProjectId = id;
    return viewSwitchEffect();
  };

  /* Tiruan setia cabang submit awaitingConcept view.tsx (Tier 1 F-ISO-5
   * + Tier 1 landscape S3-B): konteks landscape asing TIDAK diteruskan
   * ke tryContinueProjectContext; pesan jatuh ke routing normal. */
  const continueBranch = (text: string) => {
    const liveIntake = reg.getUniversalContextState();
    const foreignIntake = !!liveIntake?.projectId && liveIntake.projectId !== effProjectId;
    const liveProjectCtx = reg.getProjectContextState();
    const foreignProjectCtx = reg.isProjectContextForeign(liveProjectCtx, effProjectId ?? null);
    const ctxRes = (foreignProjectCtx ? null : reg.tryContinueProjectContext(text))
      ?? (foreignIntake ? null : reg.tryContinueUniversalContext(text));
    if (ctxRes) {
      awaitingConcept = (ctxRes as { awaitProjectConcept?: boolean }).awaitProjectConcept === true;
      return ctxRes;
    }
    awaitingConcept = false;
    return null;
  };
  /* Kirim penuh: cabang continue (bila awaitingConcept) lalu routing
   * normal — cermin submit view (tanpa pipeline LLM). */
  const submit = (text: string) => {
    if (awaitingConcept) {
      const ctxRes = continueBranch(text);
      if (ctxRes) return { via: 'continue' as const, res: ctxRes };
    }
    const routed = routeIntent(text);
    const res = reg.executeIntent(routed.intent, routed.param, mockCtx(effProjectId, text));
    if ((res as { awaitProjectConcept?: boolean }).awaitProjectConcept) awaitingConcept = true;
    return { via: 'routing' as const, res, routed };
  };

  /* Tiruan setia newChat view.tsx:2222 — TIDAK me-reset awaitingConcept,
   * TIDAK menyentuh singleton registry (Q-S3B-3: same-project
   * dipertahankan). */
  const newChat = () => {
    const storePid = effProjectId ?? '__ezrab_ai_global__';
    const conv = unifiedConversationStore.createConversation(storePid, 'Percakapan baru');
    unifiedConversationStore.setActiveConversationId(storePid, conv.id);
    activeConvId = conv.id;
    return conv.id;
  };
  /* Tiruan setia loadConversation view.tsx:2252 — idem: awaitingConcept
   * + singleton tidak disentuh; store menolak baca lintas-proyek. */
  const loadConversation = (id: string) => {
    const storePid = effProjectId ?? '__ezrab_ai_global__';
    const conv = unifiedConversationStore.getConversation(id, storePid);
    if (!conv) return null;
    unifiedConversationStore.setActiveConversationId(storePid, id);
    activeConvId = id;
    return conv;
  };

  /* Model rakitan payload LLM (view.tsx:3344 + service.ts:135-199):
   * intakeCtxForSend = getUniversalContextState() SAJA; projectId +
   * conversationId dari scope aktif; prompt = assembleChatPrompt. */
  const sendPayload = (messages: Array<{ role: 'user' | 'assistant'; content: string }>) => {
    const built = cc.buildCanonicalContext({
      projectId: effProjectId ?? null,
      conversationId: activeConvId ?? null,
      messages,
      intakeContext: reg.getUniversalContextState() ?? undefined,
    });
    return cc.assembleChatPrompt(built.dataBlock, 'ALAT: (uji)');
  };

  const dumpCtx = () => {
    const s = reg.getProjectContextState();
    return s
      ? {
          projectId: s.projectId ?? null, landAreaM2: s.landAreaM2, location: s.location,
          facilities: [...s.facilities], combinedText: s.combinedText, stage: s.stage,
          conceptId: s.conceptId,
          allocations: s.allocations.map((a) => ({ purpose: a.purpose, areaM2: a.areaM2 })),
        }
      : null;
  };

  /* ---------- Ensurer tiruan (pola chatTempProjectB53) ---------- */
  const tempCreated: Array<{ id: string; name: string }> = [];
  const fakeEnsurer = (draft: { title: string }) => {
    const created = {
      id: `TMP-S3B-${tempCreated.length + 1}`,
      name: tp.tempProjectNameForDraft(draft.title),
    };
    tempCreated.push(created);
    return { id: created.id, name: created.name, created: true };
  };

  const resetAll = () => {
    reg.clearUniversalContext();
    reg.clearProjectContext();
    rab.clearLastUniversalDraft();
    tp.setDraftProjectEnsurer(null);
    tempCreated.length = 0;
    storage.clear();
    effProjectId = null;
    awaitingConcept = false;
    prevProjectIdForIntake = undefined;
    activeConvId = null;
  };

  /* ================= S3B-01 — same-project: digabung + tercap ================= */
  await check('S3B-01 konteks proyek benar digabung + tercap proyeknya (same-project utuh)', () => {
    resetAll();
    switchProject(A);
    const s1 = submit(LANDSCAPE_A);
    assert(s1.via === 'routing', 'intake A harus lewat routing normal');
    assert(awaitingConcept === true, 'awaitingConcept harus true sesudah intake A');
    const afterA = dumpCtx();
    assert(afterA?.projectId === A, `konteks harus tercap ${A}, dapat ${afterA?.projectId}`);
    assert(afterA?.landAreaM2 === 10000, `luas harus 10000, dapat ${afterA?.landAreaM2}`);
    assert(afterA?.location === 'Surabaya', `lokasi harus Surabaya, dapat ${afterA?.location}`);
    const s2 = submit(ANSWER_B);
    assert(s2.via === 'continue', 'jawaban di A harus lewat continue');
    const afterAnswer = dumpCtx();
    assert(afterAnswer?.projectId === A, 'cap harus bertahan lewat merge');
    assert(afterAnswer?.landAreaM2 === 10000, 'luas A harus bertahan sesudah jawaban same-project');
    assert(afterAnswer?.location === 'Surabaya', 'lokasi A harus bertahan sesudah jawaban same-project');
    assert(
      (afterAnswer?.facilities ?? []).length >= 4,
      `fasilitas harus terakumulasi (≥4), dapat ${JSON.stringify(afterAnswer?.facilities)}`,
    );
    const msg = (s2.res as { message?: string }).message ?? '';
    assert(/10\.000/.test(msg) && /surabaya/i.test(msg), 'balasan same-project BOLEH menyebut fakta A (milik proyek ini)');
  });

  /* ============ S3B-02 — konteks asing ditolak di penjaga submit ============ */
  await check('S3B-02a konteks global (tanpa cap) ditolak merge begitu proyek aktif ada', () => {
    resetAll();
    switchProject(null); // global sejati, tanpa proyek aktif
    submit(LANDSCAPE_GLOBAL);
    assert(awaitingConcept === true, 'intake global harus menunggu konsep');
    assert(dumpCtx()?.projectId == null, 'konteks global harus tanpa cap');
    assert(dumpCtx()?.landAreaM2 === 20000, 'luas global harus 20000 (2 hektar)');
    // Lanjutan SELAMA global: masih boleh (global sejati berlanjut).
    const g2 = submit('tambahkan lampu taman');
    assert(g2.via === 'continue', 'jawaban selama global harus lewat continue');
    assert(dumpCtx()?.projectId == null, 'konteks global TIDAK BOLEH dicap retroaktif');
    // Pindah ke B: Tier 2 tidak membersihkan konteks tanpa cap (sengaja)
    // — penjaga submit yang menahan merge-nya.
    const sw = switchProject(B);
    assert(!sw.includes('landscape-cleared'), `Tier 2 tidak boleh clear konteks tanpa cap (dapat "${sw}")`);
    assert(dumpCtx() !== null, 'konteks global bertahan melewati switch (by design)');
    assert(awaitingConcept === true, 'awaitingConcept bertahan (Tier 2 tidak menyentuh tanpa-cap)');
    const sB = submit(ANSWER_B);
    const afterB = dumpCtx();
    // Penjaga menolak merge: jawaban B TIDAK masuk konteks global.
    assert(
      !(afterB?.combinedText ?? '').toLowerCase().includes('parkir'),
      'jawaban B tidak boleh digabung ke konteks global',
    );
    assert(
      !(afterB?.facilities ?? []).some((f) => /parkir|toilet/i.test(f)),
      'fasilitas B tidak boleh menempel ke konteks global',
    );
    if (sB.via === 'continue') {
      throw new Error('jawaban B tidak boleh lewat continue ke konteks global');
    }
  });

  await check('S3B-02b singleton asing yang dipaksakan hidup ditahan penjaga submit (lapis kedua)', () => {
    resetAll();
    switchProject(A);
    submit(LANDSCAPE_A);
    switchProject(B); // Tier 2 membersihkan (S3B-04) — tanam ulang asing
    assert(dumpCtx() === null, 'pra-kondisi: Tier 2 sudah membersihkan konteks A');
    // Tanam singleton tercap A seolah efek Tier 2 belum jalan (simulasi
    // pertahanan berlapis — penjaga submit harus menahannya sendiri).
    const planted = reg.projectIntakeGate(LANDSCAPE_A, A);
    assert(planted !== null, 'penanaman konteks A harus berhasil');
    awaitingConcept = true;
    assert(dumpCtx()?.projectId === A, 'konteks tertanam harus tercap A');
    const sB = submit(ANSWER_B);
    assert(sB.via !== 'continue', 'jawaban B tidak boleh lewat continue ke konteks A');
    const afterB = dumpCtx();
    assert(afterB?.landAreaM2 === 10000, 'konteks A tidak boleh berubah (tidak di-merge, tidak dihapus penjaga)');
    assert(
      !(afterB?.combinedText ?? '').toLowerCase().includes('parkir'),
      'jawaban B tidak boleh masuk combinedText konteks A',
    );
    assert(
      (afterB?.facilities ?? []).length === 2,
      `fasilitas A harus tetap 2 (jogging+playground), dapat ${JSON.stringify(afterB?.facilities)}`,
    );
    assert(awaitingConcept === false, 'awaitingConcept harus false sesudah continue ditolak');
  });

  /* ================= S3B-03 — null ditangani aman ================= */
  await check('S3B-03a builder: null = tanpa klaim (diizinkan, tanpa throw)', () => {
    resetAll();
    const uncappedIntake = { projectId: null, primary: null, secondary: [] };
    const r1 = cc.buildCanonicalContext({
      projectId: B,
      conversationId: `conv-${B}-1763987654321-abc12`,
      messages: [{ role: 'user', content: 'lanjutkan' }],
      intakeContext: uncappedIntake as never,
    });
    assert(typeof r1.dataBlock === 'string', 'intake tanpa cap + scope B harus lolos');
    const r2 = cc.buildCanonicalContext({
      projectId: B,
      conversationId: 'sesi-lokal-tanpa-pola',
      messages: [{ role: 'user', content: 'lanjutkan' }],
    });
    assert(typeof r2.dataBlock === 'string', 'conversationId non-conv harus lolos (tanpa klaim)');
    const r3 = cc.buildCanonicalContext({
      projectId: B,
      conversationId: 'conv-A',
      messages: [{ role: 'user', content: 'lanjutkan' }],
    });
    assert(typeof r3.dataBlock === 'string', 'conversationId conv- tanpa pola generator harus lolos');
    const cappedA = { projectId: A, primary: null, secondary: [] };
    const r4 = cc.buildCanonicalContext({
      projectId: null,
      messages: [{ role: 'user', content: 'lanjutkan' }],
      intakeContext: cappedA as never,
    });
    assert(typeof r4.dataBlock === 'string', 'scope null + intake tercap harus lolos (tanpa scope, tanpa klaim)');
  });

  await check('S3B-03b pemanggil gerbang lama (tanpa projectId) mempertahankan perilaku lama', () => {
    resetAll();
    switchProject(A);
    submit(LANDSCAPE_A);
    assert(dumpCtx()?.projectId === A, 'pra-kondisi: konteks tercap A');
    // Panggilan 1-argumen (tes/pemanggil lama): tanpa info scope —
    // base dipakai, cap dipertahankan, merge berjalan seperti dulu.
    const res = reg.projectIntakeGate('tambahkan lampu taman');
    assert(res !== null, 'gerbang lama harus tetap mengembalikan hasil');
    const after = dumpCtx();
    assert(after?.projectId === A, `cap A harus dipertahankan pemanggil lama, dapat ${after?.projectId}`);
    assert(after?.landAreaM2 === 10000, 'luas harus bertahan lewat merge pemanggil lama');
    assert(
      (after?.combinedText ?? '').toLowerCase().includes('lampu taman'),
      'teks baru harus ter-merge lewat pemanggil lama',
    );
  });

  await check('S3B-03c tryContinue tanpa konteks + isProjectContextForeign(null) aman', () => {
    resetAll();
    assert(reg.tryContinueProjectContext('apa saja') === null, 'tryContinue tanpa konteks harus null');
    assert(reg.isProjectContextForeign(null, A) === false, 'konteks null tidak asing');
    assert(reg.isProjectContextForeign(undefined, A) === false, 'konteks undefined tidak asing');
    assert(reg.isProjectContextForeign({ projectId: null } as never, null) === false, 'tanpa cap + tanpa proyek = bukan asing');
    assert(reg.isProjectContextForeign({ projectId: null } as never, B) === true, 'tanpa cap + proyek aktif = asing');
    assert(reg.isProjectContextForeign({ projectId: A } as never, A) === false, 'cap sama = bukan asing');
    assert(reg.isProjectContextForeign({ projectId: A } as never, B) === true, 'cap beda = asing');
    assert(reg.isProjectContextForeign({ projectId: A } as never, null) === true, 'cap proyek + global = asing');
  });

  /* ================= S3B-04 — basi ditolak sesudah switch ================= */
  await check('S3B-04 ganti proyek membersihkan landscape tercap lama; kembali tidak membangkitkan', () => {
    resetAll();
    switchProject(A);
    submit(LANDSCAPE_A);
    assert(awaitingConcept === true, 'pra-kondisi: menunggu konsep di A');
    const sw = switchProject(B);
    assert(sw.includes('landscape-cleared'), `Tier 2 harus clear landscape A (dapat "${sw}")`);
    assert(dumpCtx() === null, 'projectCtx harus null sesudah pindah ke B');
    assert(awaitingConcept === false, 'awaitingConcept harus false sesudah Tier 2 clear');
    // Bolak-balik: tidak ada kebangkitan (tanpa snapshot landscape).
    switchProject(A);
    switchProject(B);
    switchProject(A);
    assert(dumpCtx() === null, 'konteks A tidak boleh bangkit sesudah bolak-balik proyek');
    assert(awaitingConcept === false, 'awaitingConcept tetap false sesudah bolak-balik');
    // Intake baru di A mulai segar (tanpa sisa teks lama A maupun B).
    submit('buatkan rab taman 800 m2 di Probolinggo');
    const fresh = dumpCtx();
    assert(fresh?.projectId === A, 'intake baru di A harus tercap A');
    assert(fresh?.landAreaM2 === 800, `luas baru harus 800, dapat ${fresh?.landAreaM2}`);
    assert(fresh?.location === 'Probolinggo', `lokasi baru harus Probolinggo, dapat ${fresh?.location}`);
    assert(!hasMarkA(fresh?.combinedText ?? ''), 'combinedText baru tidak boleh mengandung penanda A lama');
    assert(!/malang/i.test(fresh?.combinedText ?? ''), 'combinedText baru tidak boleh mengandung teks B');
  });

  /* ============ S3B-05 — respons async proyek sebelumnya diabaikan ============ */
  await check('S3B-05 pin S8: landscape sinkron + snapshot kirim tidak membawa landscape', () => {
    resetAll();
    switchProject(A);
    submit(LANDSCAPE_A);
    // Snapshot kirim LLM (view.tsx:3344) hanya membaca universalCtx —
    // null selama intake landscape: landscape tidak pernah masuk
    // snapshot, jadi tidak ada "balasan async landscape" yang bisa
    // tiba sesudah ganti proyek.
    assert(reg.getUniversalContextState() === null, 'universalCtx harus null selama intake landscape');
    const res = reg.tryContinueProjectContext('tambahkan lampu taman');
    assert(res !== null, 'tryContinue harus mengembalikan hasil');
    assert(!(res instanceof Promise), 'tryContinueProjectContext harus sinkron (bukan Promise)');
    // Sesudah switch, tidak ada konteks yang bisa "dibalasi" telat:
    switchProject(B);
    assert(dumpCtx() === null, 'konteks A sudah dibersihkan Tier 2 — tidak ada target balasan telat');
    assert(reg.getUniversalContextState() === null, 'snapshot kirim di B tetap tanpa intake landscape');
  });

  /* ================= S3B-06 — new chat ================= */
  await check('S3B-06a new chat di proyek lain tidak mewarisi landscape proyek sebelumnya', () => {
    resetAll();
    switchProject(A);
    submit(LANDSCAPE_A);
    switchProject(B); // Tier 2 membersihkan
    const convB = newChat();
    assert(dumpCtx() === null, 'new chat di B tidak boleh membangkitkan konteks A');
    assert(awaitingConcept === false, 'awaitingConcept harus false di chat baru B');
    assert(convB.startsWith(`conv-${B}-`), `percakapan baru harus milik B, dapat ${convB}`);
    // Jawaban di chat baru B memulai intake segar, bukan lanjutan A.
    // Catatan parser (perilaku pra-ada, sama seperti probe baseline S3):
    // "500 m2" sesudah "taman bermain" dibaca sebagai ALOKASI fasilitas
    // (bukan luas total) — landAreaM2 segar adalah null, BUKAN 10000.
    const sB = submit(LANDSCAPE_B);
    const afterB = dumpCtx();
    assert(afterB?.projectId === B, 'intake di chat baru B harus tercap B');
    assert(afterB?.landAreaM2 !== 10000, `luas A (10000) tidak boleh bertahan di B, dapat ${afterB?.landAreaM2}`);
    assert(afterB?.location === 'Malang', `lokasi harus Malang, dapat ${afterB?.location}`);
    assert(
      (afterB?.allocations ?? []).some((a) => a.areaM2 === 500),
      `alokasi 500 m² milik B harus ada, dapat ${JSON.stringify(afterB?.allocations)}`,
    );
    assert(
      !(afterB?.facilities ?? []).includes('jogging-track'),
      'fasilitas khas A (jogging-track) tidak boleh ada di konteks B',
    );
    assert(!hasMarkA((sB.res as { message?: string }).message ?? ''), 'balasan di B tidak boleh menyebut fakta A');
  });

  await check('S3B-06b new chat SAME-PROJECT mempertahankan konteks landscape (pin Q-S3B-3)', () => {
    resetAll();
    switchProject(A);
    submit(LANDSCAPE_A);
    newChat(); // di proyek yang sama
    assert(dumpCtx()?.landAreaM2 === 10000, 'konteks same-project harus bertahan lewat newChat');
    assert(awaitingConcept === true, 'awaitingConcept same-project harus bertahan lewat newChat (konsisten universal)');
    const s2 = submit(ANSWER_B);
    assert(s2.via === 'continue', 'jawaban same-project sesudah newChat harus lewat continue');
    assert((dumpCtx()?.facilities ?? []).length >= 4, 'fasilitas harus terakumulasi same-project sesudah newChat');
  });

  /* ================= S3B-07 — restore memvalidasi kepemilikan ================= */
  await check('S3B-07 restore percakapan tidak membangkitkan konteks + store menolak lintas-proyek', () => {
    resetAll();
    switchProject(A);
    const convA = unifiedConversationStore.createConversation(A, 'Percakapan A');
    unifiedConversationStore.setActiveConversationId(A, convA.id);
    activeConvId = convA.id;
    submit(LANDSCAPE_A);
    switchProject(B); // Tier 2 membersihkan
    const convB = unifiedConversationStore.createConversation(B, 'Percakapan B');
    // Load percakapan B: konteks tetap null.
    const loadedB = loadConversation(convB.id);
    assert(loadedB?.id === convB.id, 'loadConversation B harus berhasil');
    assert(dumpCtx() === null, 'loadConversation di B tidak boleh membangkitkan konteks A');
    // Store menolak baca percakapan A dari scope B (S11d — pin ulang).
    let threw = '';
    try {
      unifiedConversationStore.getConversation(convA.id, B);
    } catch (e) {
      threw = (e as Error).message;
    }
    assert(/PROJECT_ISOLATION_ERROR/i.test(threw), `store harus menolak getConversation lintas-proyek (dapat "${threw}")`);
    // Kembali ke A + load percakapan A: konteks TIDAK bangkit (tanpa
    // snapshot landscape — yang dipulihkan hanya pesan, bukan konteks).
    switchProject(A);
    const loadedA = loadConversation(convA.id);
    assert(loadedA?.id === convA.id, 'loadConversation A harus berhasil');
    assert(dumpCtx() === null, 'loadConversation A tidak boleh membangkitkan konteks landscape lama');
    assert(awaitingConcept === false, 'awaitingConcept tetap false sesudah restore percakapan');
  });

  /* ================= S3B-08 — binding proyek sementara ================= */
  await check('S3B-08a generate konteks tercap A TANPA proyek aktif ditolak; ensurer tidak dipanggil', () => {
    resetAll();
    tp.setDraftProjectEnsurer(fakeEnsurer as never);
    switchProject(A);
    submit(LANDSCAPE_A);
    // Pindah ke global (tanpa proyek aktif): Tier 2 membersihkan karena
    // konteks tercap proyek LAMA (A) — tanam ulang untuk menguji
    // penjaga generate sebagai lapis kedua.
    switchProject(null);
    assert(dumpCtx() === null, 'pra-kondisi: Tier 2 clear saat pindah ke global');
    reg.projectIntakeGate(LANDSCAPE_A, A); // tanam asing
    const gen = reg.executeIntent('RAB_PROJECT_PREVIEW', 'generate', mockCtx(null));
    assert((gen as { ok?: boolean }).ok === false, 'generate konteks A tanpa proyek aktif harus ditolak');
    assert(
      /tidak aktif/i.test((gen as { message?: string }).message ?? ''),
      'penolakan harus memakai pesan "konteks tidak aktif" yang sudah ada',
    );
    assert(rab.getLastUniversalDraft() === null, 'tidak boleh ada draft dari konteks asing');
    assert(tempCreated.length === 0, 'ensurer TIDAK BOLEH dipanggil untuk generate asing (tanpa proyek sementara bocor)');
  });

  await check('S3B-08b generate konteks global DI PROYEK B ditolak (global = asing bila proyek aktif ada)', () => {
    resetAll();
    tp.setDraftProjectEnsurer(fakeEnsurer as never);
    switchProject(null);
    submit(LANDSCAPE_GLOBAL);
    assert(dumpCtx()?.projectId == null, 'pra-kondisi: konteks global tanpa cap');
    // Pindah ke B (konteks global bertahan — Tier 2 tidak menyentuh
    // tanpa-cap), lalu generate di B.
    switchProject(B);
    assert(dumpCtx() !== null, 'pra-kondisi: konteks global bertahan sesudah switch');
    const gen = reg.executeIntent('RAB_PROJECT_PREVIEW', 'generate', mockCtx(B));
    assert((gen as { ok?: boolean }).ok === false, 'generate konteks global di proyek B harus ditolak');
    assert(rab.getLastUniversalDraft() === null, 'tidak boleh ada draft dari konteks global di proyek B');
    assert(tempCreated.length === 0, 'ensurer tidak boleh dipanggil untuk generate yang ditolak');
  });

  await check('S3B-08c generate global TANPA proyek aktif sah: terikat proyek sementara dari faktanya sendiri', () => {
    resetAll();
    tp.setDraftProjectEnsurer(fakeEnsurer as never);
    switchProject(null);
    submit(LANDSCAPE_GLOBAL);
    const gen = reg.executeIntent('RAB_PROJECT_PREVIEW', 'generate', mockCtx(null));
    assert((gen as { ok?: boolean }).ok !== false, 'generate global tanpa proyek aktif harus diizinkan');
    const draft = rab.getLastUniversalDraft();
    assert(draft !== null, 'draft global harus tersusun');
    const binding = rab.getLastUniversalDraftProjectId ? rab.getLastUniversalDraftProjectId() : null;
    assert(binding === 'TMP-S3B-1', `draft harus terikat proyek sementara ensurer, dapat ${binding}`);
    assert(tempCreated.length === 1, 'ensurer harus dipanggil tepat 1×');
    const msg = (gen as { message?: string }).message ?? '';
    // Pesan generate mesin kanonis menyatakan luas terkonfirmasi (bukan
    // lokasi) — 20.000 m² adalah fakta konteks global itu sendiri.
    assert(/20\.000/.test(msg), 'pesan generate harus menyebut fakta global sendiri (luas 20.000 m²)');
    assert(!hasMarkA(msg), 'pesan generate global tidak boleh mengandung penanda A');
  });

  /* ================= S3B-09 — perilaku landscape valid utuh ================= */
  await check('S3B-09 alur penuh same-project sampai draft (cap bertahan tiap langkah)', () => {
    resetAll();
    switchProject(A);
    submit(LANDSCAPE_A);
    assert(dumpCtx()?.projectId === A, 'langkah 1: cap A');
    submit(ANSWER_B);
    assert(dumpCtx()?.projectId === A, 'langkah 2: cap A bertahan sesudah jawaban');
    const sel = reg.executeIntent('RAB_CONCEPT_SELECT', 'taman-publik', mockCtx(A));
    assert((sel as { ok?: boolean }).ok === true, 'pilih konsep same-project harus berhasil');
    assert(dumpCtx()?.conceptId === 'taman-publik', 'conceptId harus tercatat');
    assert(dumpCtx()?.projectId === A, 'langkah 3: cap A bertahan sesudah pilih konsep');
    const prev = reg.executeIntent('RAB_PROJECT_PREVIEW', undefined, mockCtx(A));
    assert((prev as { ok?: boolean }).ok === true, 'pratinjau same-project harus berhasil');
    assert(/10\.000/.test((prev as { message?: string }).message ?? ''), 'pratinjau menyebut luas proyek sendiri');
    const gen = reg.executeIntent('RAB_PROJECT_PREVIEW', 'generate', mockCtx(A));
    assert((gen as { ok?: boolean }).ok !== false, 'generate same-project harus berhasil');
    const draft = rab.getLastUniversalDraft();
    assert(draft !== null, 'draft harus tersusun');
    const binding = rab.getLastUniversalDraftProjectId ? rab.getLastUniversalDraftProjectId() : null;
    assert(binding === A, `draft harus terikat ${A}, dapat ${binding}`);
    assert(dumpCtx() === null, 'konteks dibersihkan sesudah generate sukses (perilaku lama)');
  });

  /* ================= S3B-10 — PAYLOAD AI FINAL ================= */
  await check('S3B-10a prompt B bebas penanda A sesudah skenario kontaminasi (riwayat B bersih)', () => {
    resetAll();
    switchProject(A);
    submit(LANDSCAPE_A);
    switchProject(B); // Tier 2 membersihkan — S1 tidak terjadi lagi
    const convB = unifiedConversationStore.createConversation(B, 'Percakapan B');
    unifiedConversationStore.setActiveConversationId(B, convB.id);
    activeConvId = convB.id;
    const sB = submit(LANDSCAPE_B);
    const replyB = (sB.res as { message?: string }).message ?? '';
    assert(!hasMarkA(replyB), `balasan di B tidak boleh menyebut fakta A (dapat: ${replyB.slice(0, 120)}…)`);
    // Rakitan payload persis seperti kirim LLM berikutnya di B.
    const prompt = sendPayload([
      { role: 'user', content: LANDSCAPE_B },
      { role: 'assistant', content: replyB },
      { role: 'user', content: 'lanjutkan' },
    ]);
    assert(!hasMarkA(prompt), 'prompt B TIDAK BOLEH mengandung penanda A (Surabaya/10.000/jogging track)');
    assert(/malang/i.test(prompt), 'prompt B harus mengandung fakta B sendiri (Malang)');
    assert(/500/.test(prompt), 'prompt B harus mengandung luas B sendiri (500)');
  });

  await check('S3B-10b builder menolak intakeContext tercap A pada scope B (S11c tertutup)', () => {
    resetAll();
    const uniCtxA = {
      intent: 'CREATE_RAB', projectId: A,
      primary: { id: 'jalan-beton', label: 'Jalan beton' }, secondary: [],
      isMulti: false, projectName: null, location: 'Surabaya', landAreaM2: 10000,
      landAreaOriginal: '1 hektar', buildingAreaM2: null, floors: null,
      floorFunctions: [], buildings: [], dimensionsText: null, lengthM: null,
      widthM: null, depthM: null, heightM: null, spanM: null, volumeM3: null,
      counts: [], scopeConfirmed: [], scopeRemoved: [],
    };
    let threw = '';
    try {
      cc.buildCanonicalContext({
        projectId: B,
        conversationId: `conv-${B}-1763987654321-abc12`,
        messages: [{ role: 'user', content: 'x' }],
        intakeContext: uniCtxA as never,
      });
    } catch (e) {
      threw = (e as Error).message;
    }
    assert(
      threw.includes('CANONICAL_CONTEXT_PROJECT_MISMATCH'),
      `builder harus throw MISMATCH untuk intake A + scope B (dapat "${threw}")`,
    );
    // Kontrol positif: intake tercap B + scope B lolos.
    const built = cc.buildCanonicalContext({
      projectId: B,
      conversationId: `conv-${B}-1763987654321-abc12`,
      messages: [{ role: 'user', content: 'x' }],
      intakeContext: { ...uniCtxA, projectId: B } as never,
    });
    assert(typeof built.dataBlock === 'string', 'intake tercap B + scope B harus lolos');
  });

  await check('S3B-10c builder menolak conversationId milik A pada scope B (S11b tertutup)', () => {
    resetAll();
    let threw = '';
    try {
      cc.buildCanonicalContext({
        projectId: B,
        conversationId: `conv-${A}-1763987654321-abc12`,
        messages: [{ role: 'user', content: 'x' }],
      });
    } catch (e) {
      threw = (e as Error).message;
    }
    assert(
      threw.includes('CANONICAL_CONTEXT_PROJECT_MISMATCH'),
      `builder harus throw MISMATCH untuk conv-A + scope B (dapat "${threw}")`,
    );
    // Kontrol positif: conv-B + scope B lolos; snapshot mismatch lama
    // tetap ditolak (S11a — pin ulang).
    const built = cc.buildCanonicalContext({
      projectId: B,
      conversationId: `conv-${B}-1763987654321-abc12`,
      messages: [{ role: 'user', content: 'x' }],
    });
    assert(built.report.scope.projectId === B, 'conv-B + scope B harus lolos');
    let snapThrew = '';
    try {
      cc.buildCanonicalContext({
        projectId: B,
        messages: [{ role: 'user', content: 'x' }],
        projectSnapshot: { projectId: A } as never,
      });
    } catch (e) {
      snapThrew = (e as Error).message;
    }
    assert(snapThrew.includes('CANONICAL_CONTEXT_PROJECT_MISMATCH'), 'snapshot A + scope B tetap ditolak (S11a)');
  });

  /* ================= S3B-11 — gerbang mulai segar ================= */
  await check('S3B-11a permintaan landscape baru di B lewat submit mulai segar (S3 tertutup)', () => {
    resetAll();
    switchProject(A);
    submit(LANDSCAPE_A);
    switchProject(B);
    const sB = submit(LANDSCAPE_B);
    assert(sB.via === 'routing', 'permintaan baru di B harus lewat routing (bukan continue ke A)');
    const afterB = dumpCtx();
    assert(afterB?.projectId === B, 'konteks baru harus tercap B');
    // "500 m2" di sini dibaca sebagai alokasi fasilitas (perilaku parser
    // pra-ada) — yang penting: luas A (10000) TIDAK bertahan.
    assert(afterB?.landAreaM2 !== 10000, `luas A tidak boleh bertahan di B, dapat ${afterB?.landAreaM2}`);
    assert(afterB?.location === 'Malang', `lokasi harus Malang, dapat ${afterB?.location}`);
    assert(
      (afterB?.allocations ?? []).some((a) => a.areaM2 === 500),
      `alokasi 500 m² milik B harus ada, dapat ${JSON.stringify(afterB?.allocations)}`,
    );
    assert(!hasMarkA(afterB?.combinedText ?? ''), 'combinedText B tidak boleh mengandung teks A');
    assert(
      !(afterB?.facilities ?? []).includes('jogging-track'),
      'fasilitas khas A (jogging-track) tidak boleh bertahan di konteks B',
    );
  });

  await check('S3B-11b projectIntakeGate langsung di B tidak memakai base A (S3b tertutup)', () => {
    resetAll();
    switchProject(A);
    submit(LANDSCAPE_A);
    switchProject(B);
    // Tanam ulang konteks A (simulasi awaitingConcept=false + singleton
    // asing hidup), lalu panggil gerbang langsung dengan scope B.
    reg.projectIntakeGate(LANDSCAPE_A, A);
    assert(dumpCtx()?.projectId === A, 'pra-kondisi: konteks A tertanam');
    const gateRes = reg.projectIntakeGate(LANDSCAPE_B, B);
    assert(gateRes !== null, 'gerbang B harus mengembalikan hasil');
    const afterB = dumpCtx();
    assert(afterB?.projectId === B, 'konteks hasil gerbang B harus tercap B');
    // "500 m2" dibaca sebagai alokasi fasilitas (perilaku parser
    // pra-ada) — yang penting: luas A (10000) TIDAK bertahan.
    assert(afterB?.landAreaM2 !== 10000, `luas A tidak boleh bertahan, dapat ${afterB?.landAreaM2}`);
    assert(afterB?.location === 'Malang', `lokasi harus Malang, dapat ${afterB?.location}`);
    assert(!hasMarkA(afterB?.combinedText ?? ''), 'combinedText gerbang B tidak boleh mengandung teks A');
  });

  /* ================= S3B-12 — tombol menolak konteks asing ================= */
  await check('S3B-12 tombol konsep/pratinjau/generate menolak konteks asing tanpa mutasi', () => {
    resetAll();
    switchProject(A);
    submit(LANDSCAPE_A);
    switchProject(B);
    reg.projectIntakeGate(LANDSCAPE_A, A); // tanam asing
    const before = dumpCtx();
    const sel = reg.executeIntent('RAB_CONCEPT_SELECT', 'taman-publik', mockCtx(B));
    assert((sel as { ok?: boolean }).ok === false, 'pilih konsep di B atas konteks A harus ditolak');
    assert(/tidak aktif/i.test((sel as { message?: string }).message ?? ''), 'penolakan memakai pesan yang sudah ada');
    assert(dumpCtx()?.conceptId === before?.conceptId, 'conceptId konteks A tidak boleh dimutasi penolakan');
    const prev = reg.executeIntent('RAB_PROJECT_PREVIEW', undefined, mockCtx(B));
    assert((prev as { ok?: boolean }).ok === false, 'pratinjau di B atas konteks A harus ditolak');
    assert(!hasMarkA((prev as { message?: string }).message ?? ''), 'pesan penolakan tidak boleh membocorkan fakta A');
    const gen = reg.executeIntent('RAB_PROJECT_PREVIEW', 'generate', mockCtx(B));
    assert((gen as { ok?: boolean }).ok === false, 'generate di B atas konteks A harus ditolak (S2 tertutup)');
    assert(rab.getLastUniversalDraft() === null, 'tidak boleh ada draft dari generate asing');
    assert(dumpCtx()?.landAreaM2 === 10000, 'konteks A tetap utuh (penjaga tidak menghapus — Tier 2 yang membersihkan)');
  });

  console.log(`\nRINGKASAN S3-B: ${passed} passed, ${failed} failed.`);
  if (failures.length) {
    console.log(`GAGAL: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('SUITE FATAL:', e);
  process.exit(1);
});
