/**
 * chatIso3cInflight.test.ts — STAGE 3 S3-C (F-ISO-5 in-flight project
 * switching, 2026-11-23): balasan dari request yang dikirim di proyek A,
 * bila resolve sesudah pengguna pindah ke proyek B, WAJIB pulang ke
 * percakapan ASALNYA (A) — tidak boleh tersimpan/tampil di B, tidak
 * boleh menimpa/menghapus snapshot B, dan tidak boleh membuat hasil
 * valid hilang lewat perebutan flag busy.
 *
 * Gaya plain-tsx: `npx --yes tsx src/test/chatIso3cInflight.test.ts`
 *
 * METODE (pola probe S3-C + ISO5): lapisan view adalah komponen React
 * (tidak dapat dijalankan langsung di tsx), jadi suite ini MEMODELKAN
 * view secara setia terhadap view.tsx PASCA-PERBAIKAN (refs, efek dalam
 * urutan deklarasi, closure render) di atas MODUL ASLI:
 * executionRuntime, unifiedConversationStore, actionRegistry,
 * draftPersistence, toolRegistry, universalRab, tempProject,
 * aiResponseTiming. Yang dimodelkan (bukan modul asli): state komponen
 * (messages/busy/activeExec/awaitingConcept), refs, efek-efek view,
 * persistMessage/persistActiveDraft (logika disalin setia incl. F1/F5),
 * ensurer proyek-draft (tiruan hint-aware, pola ISO4/B53), dan provider
 * AI (mock terkontrol dengan delay).
 *
 * JANGKAR KODE (view.tsx pasca-S3-C):
 *   - resolveSendScope/isScopeDisplayed :1030/:1043 — rantai migrasi
 *     B5-3 + cek tampil; persistMessage 2-parameter :1060 (signature
 *     DIPIN F-04) + helper persistMessageScoped — scope HANYA lewat
 *     override sekali-pakai.
 *   - efek muat-percakapan: peta migrasi dicatat :911-917.
 *   - efek langganan eksekusi :841 — busy/activeExec dimiliki VIEW
 *     (fallback getAnyActiveExecution).
 *   - endExec :2662 — membersihkan activeExec yang selesai.
 *   - noteCancelledIfNeeded :2682 + postAssistant :2829 — tulis ke
 *     scope kirim (F1/F5, penjaga plan W15).
 *   - cabang LLM: sendScope sesudah gate isCurrent; persist via
 *     override; lastAiErrorMessageIdRef bersyarat tampil; finally
 *     berjaga :3886 (F2).
 *   - getRetryPrompt :4649 — prompt tercap percakapan (S3);
 *     stopActiveExecution :4674 — fallback lintas-percakapan (F3).
 *   - executionRuntime.ts: getAnyActiveExecution :529 +
 *     hasAnyActiveExecution :542 (pengecualian awalan modal).
 *   - toolRegistry.ts hook F-ISO-4 — teruskan scope sebagai petunjuk
 *     ensurer (F4); tempProject.ts — preferredProjectId opsional.
 *
 * Pemetaan ke skenario tugas (§6.4 + §6.2):
 *   S3C-01 §6.4(1) balasan A tidak memutasi B · S3C-02 §6.2 new chat
 *   saat berjalan · S3C-03 §6.2 gagal + retry tercap · S3C-04 §6.2
 *   dibatalkan sebelum switch · S3C-05 §6.2 stop sesudah switch (S4b)
 *   · S3C-06 §6.4(6) out-of-order via UI (submit B diblokir) ·
 *   S3C-07 §6.4(6) out-of-order via jendela remount (forced overlap)
 *   · S3C-08 §6.2 finally vs busy (S5b) · S3C-09 §6.4(1)+F5 cabang
 *   deterministik · S3C-10 §6.4(1) draft tool F4 · S3C-11 F4
 *   fail-closed · S3C-12 gerbang DEFECT-1 T7a · S3C-13 migrasi lalu
 *   switch · S3C-14 §6.4(2)(3) snapshot B utuh · S3C-15 §6.4(5)(7)
 *   pulih A + F-ISO-5 utuh · S3C-16 kontrol supersede · S3C-17 helper
 *   runtime · S3C-18 W13 catatan batal tertunda · S3C-19 W18/W19
 *   fire-and-forget · S3C-20 satu-tab tidak berubah.
 *
 * BATAS UJI (jujur): model view, bukan React nyata — urutan efek
 * mengikuti urutan deklarasi + commit lanjutan (didokumentasikan per
 * efek); verifikasi browser tetap wajib (lihat laporan S3-C §8).
 * Cabang sinkron (tanpa await) tidak diuji ulang — tidak ada jendela
 * switch di antara kirim dan tulisnya.
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

/* ---------- localStorage shim (node — pola probe S3-C) ---------- */
const storageMap = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => (storageMap.has(k) ? (storageMap.get(k) as string) : null),
  setItem: (k: string, v: string) => { storageMap.set(k, String(v)); },
  removeItem: (k: string) => void storageMap.delete(k),
  clear: () => storageMap.clear(),
  key: (i: number) => Array.from(storageMap.keys())[i] ?? null,
  get length() { return storageMap.size; },
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const JALAN_TEXT = 'Buatkan RAB jalan beton sepanjang 2 km';
const NON_CHAT_PREFIXES = ['spreadsheet-modal:'];

type Msg = { role: 'user' | 'assistant'; content: string; ts: number };
type SendScope = { conversationId: string; projectId: string };

async function main(): Promise<void> {
  console.log('chatIso3cInflight.test (STAGE 3 S3-C — in-flight project switching)');
  const R = '../ai-tools/ezrab-ai';
  const rt = await import(`${R}/executionRuntime`);
  const storeMod = await import('../services/ai/conversation/unifiedConversationStore');
  const store = storeMod.unifiedConversationStore as {
    getOrCreateActiveConversation: (pid: string) => { id: string; messages: Array<{ role: string; content: string }> };
    createConversation: (pid: string, title: string) => { id: string };
    setActiveConversationId: (pid: string, cid: string) => void;
    appendMessage: (cid: string, pid: string, m: { role: string; content: string }) => { id: string };
    updateMessage: (cid: string, pid: string, mid: string, patch: { content: string }) => unknown;
    getConversation: (cid: string, pid: string) => { id: string; title?: string; projectId: string; messages: Array<{ id: string; role: string; content: string; createdAt?: string; timestamp?: number }> } | null;
    listConversations: (pid: string) => Array<{ id: string; messages: Array<{ role: string; content: string }> }>;
  };
  const reg = await import(`${R}/actionRegistry`);
  const dp = await import(`${R}/draftPersistence`);
  const { routeIntent } = await import(`${R}/intentRouter`);
  const timing = await import('../ai-tools/aiResponseTiming');
  const toolReg = await import(`${R}/toolRegistry`);
  const rab = await import(`${R}/universalRab`);
  const tp = await import(`${R}/tempProject`);

  // ---------------- Store proyek palsu + ensurer tiruan (hint-aware) ----------------
  // Model setia ensureDraftProject view.tsx:1539 PASCA-S3-C: petunjuk scope
  // (F4) mengalahkan proyek live; tanpa petunjuk → perilaku B5-3 persis.
  interface FakeProject { id: string; name: string; status: string; creationMethod?: string; description?: string }
  const fakeStore = {
    projects: [] as FakeProject[],
    seq: 0,
    seed(id: string, name: string) {
      const p: FakeProject = { id, name, status: 'active' };
      this.projects.push(p);
      return p;
    },
    create(data: Partial<FakeProject> & { name: string }): FakeProject {
      const p: FakeProject = { id: `PRJ-S3C-TEMP-${++this.seq}`, status: 'draft', ...data };
      this.projects.unshift(p);
      return p;
    },
    find(id: string) { return this.projects.find((p) => p.id === id) ?? null; },
    reset() { this.projects = []; /* seq TIDAK di-reset: id temp unik se-suite */ },
  };
  let ensurerCalls: Array<{ preferredProjectId: string | null; liveProjectAtCall: string | null; draftTitle: string }> = [];

  // ---------------- Model view (setia pada view.tsx PASCA-S3-C) ----------------
  const view = {
    effProjectId: null as string | null,
    messages: [] as Msg[],
    busy: false,
    activeExec: null as { requestId: string } | null,
    activeConvId: null as string | null,
    awaitingConcept: false,
    convIdRef: null as string | null,
    storeProjectIdRef: '__ezrab_ai_global__',
    liveProjectRef: null as { id: string; name: string } | null,
    lastAiPromptRef: null as string | null,
    lastAiPromptConversationIdRef: null as string | null,
    lastAiErrorMessageIdRef: null as string | null,
    retryReplacesMessageIdRef: null as string | null,
    prevProjectIdForIntakeRef: undefined as string | null | undefined,
    intakeRestoredForRef: new Set<string>(),
    skipIntakeRestoreForRef: null as string | null,
    pendingConversationMigrationRef: null as { fromProjectId: string; fromConversationId: string; toProjectId: string } | null,
    migratedConversationRef: new Map<string, { toConversationId: string; toProjectId: string }>(),
    persistScopeOverrideRef: null as SendScope | null,
    draftUpdatedAtRef: null as string | null,
    scenario: '',
  };
  const setMessages = (next: Msg[]) => { view.messages = next; };
  const appendMessageUi = (m: Msg) => { view.messages = [...view.messages, m]; };

  // resolveSendScope — salinan setia view.tsx:1030.
  const resolveSendScope = (captured: SendScope): SendScope => {
    let scope = captured;
    const seen = new Set<string>([captured.conversationId]);
    for (let hop = 0; hop < 8; hop++) {
      const next = view.migratedConversationRef.get(scope.conversationId);
      if (!next || seen.has(next.toConversationId)) break;
      seen.add(next.toConversationId);
      scope = { conversationId: next.toConversationId, projectId: next.toProjectId };
    }
    return scope;
  };
  const isScopeDisplayed = (scope: SendScope): boolean => view.convIdRef === scope.conversationId;

  // persistMessage — salinan setia view.tsx:1060 PASCA-S3-C (signature
  // 2-parameter DIPIN chatPerbaikanSemuaA F-04; scope HANYA lewat
  // override sekali-pakai; tanpa override → perilaku live DEFECT-1).
  const persistMessage = (role: 'user' | 'assistant', content: string): string | null => {
    const effectiveScope = view.persistScopeOverrideRef ?? null;
    const projectId = effectiveScope ? effectiveScope.projectId : view.storeProjectIdRef;
    const convId = effectiveScope ? effectiveScope.conversationId : view.convIdRef;
    try {
      if (!convId) return null;
      if (role === 'assistant' && view.retryReplacesMessageIdRef) {
        const replacesId = view.retryReplacesMessageIdRef;
        view.retryReplacesMessageIdRef = null;
        try {
          store.updateMessage(convId, projectId, replacesId, { content });
          return replacesId;
        } catch { /* jatuh ke append biasa */ }
      }
      const stored = store.appendMessage(convId, projectId, { role, content });
      return stored?.id ?? null;
    } catch {
      return null;
    }
  };

  // persistMessageScoped — salinan setia helper view.tsx PASCA-S3-C.
  const persistMessageScoped = (role: 'user' | 'assistant', content: string, scope?: SendScope | null): string | null => {
    if (!scope) return persistMessage(role, content);
    view.persistScopeOverrideRef = scope;
    try {
      return persistMessage(role, content);
    } finally {
      view.persistScopeOverrideRef = null;
    }
  };

  // persistActiveDraft — inti view.tsx:1405 PASCA-S3-C (F5: conversationId
  // dari scope kirim; penjaga S3-A null-baseline dimodelkan setia).
  const persistActiveDraftModel = (capturedEffProjectId: string | null, stage: string, conversationId?: string | null) => {
    const d = rab.getLastUniversalDraft(capturedEffProjectId);
    if (!d || !capturedEffProjectId) return { saved: false, reason: !d ? 'getLastUniversalDraft=null' : 'tanpa effProject' };
    if (view.draftUpdatedAtRef === null) {
      const existing = dp.peekPersistedDraft(capturedEffProjectId);
      if (existing) {
        const loaded = dp.loadDraft(capturedEffProjectId);
        if (loaded.ok && loaded.draft.id === d.id && dp.draftFingerprint(loaded.draft) === dp.draftFingerprint(d)) {
          view.draftUpdatedAtRef = loaded.meta.updatedAt;
        } else {
          return { saved: false, reason: 'S3-A-guard: baseline-null + record-ada' };
        }
      }
    }
    const res = dp.saveDraft({
      draft: d, projectId: capturedEffProjectId,
      conversationId: conversationId ?? view.convIdRef,
      workflowStage: stage, savedBy: 'autosave',
      expectedUpdatedAt: view.draftUpdatedAtRef,
    });
    if (res.ok) view.draftUpdatedAtRef = res.updatedAt;
    return { saved: res.ok, draftId: d.id, projectId: capturedEffProjectId, conversationIdUsed: conversationId ?? view.convIdRef, error: res.ok ? null : (res as { error?: string }).error };
  };

  // Ensurer tiruan — model setia ensureDraftProject view.tsx:1539 (F4).
  const fakeEnsurer = (draft: { title: string }, preferredProjectId?: string | null) => {
    ensurerCalls.push({ preferredProjectId: preferredProjectId ?? null, liveProjectAtCall: view.liveProjectRef?.id ?? null, draftTitle: draft.title });
    if (preferredProjectId) {
      const hinted = fakeStore.find(preferredProjectId);
      if (hinted) return { id: hinted.id, name: hinted.name, created: false };
      return null;
    }
    const live = view.liveProjectRef;
    if (live) return { id: live.id, name: live.name, created: false };
    const created = fakeStore.create({
      name: tp.tempProjectNameForDraft(draft.title),
      status: 'draft',
      creationMethod: tp.TEMP_PROJECT_CREATION_METHOD,
      description: tp.tempProjectDescriptionForDraft(draft.title),
    });
    if (view.convIdRef) {
      view.pendingConversationMigrationRef = {
        fromProjectId: view.storeProjectIdRef,
        fromConversationId: view.convIdRef,
        toProjectId: created.id,
      };
    }
    view.skipIntakeRestoreForRef = created.id;
    if ('parts' in draft && 'id' in draft) {
      try {
        const res = dp.saveDraft({
          draft: draft as never, projectId: created.id,
          conversationId: view.convIdRef, workflowStage: 'autosave', savedBy: 'autosave',
        });
        if (res.ok) view.draftUpdatedAtRef = res.updatedAt;
      } catch { /* persist gagal — autosave berikutnya mencoba lagi */ }
    }
    return { id: created.id, name: created.name, created: true };
  };

  // Efek muat-percakapan view.tsx:870-920 PASCA-S3-C (migrasi + peta).
  const loadConversationEffect = () => {
    const storeProjectId = view.effProjectId ?? '__ezrab_ai_global__';
    let migrated = false;
    let migrationConsumed: { fromConversationId: string; toProjectId: string } | null = null;
    const migration = view.pendingConversationMigrationRef;
    if (migration && migration.toProjectId === storeProjectId) {
      view.pendingConversationMigrationRef = null;
      migrationConsumed = migration;
      try {
        const source = store.getConversation(migration.fromConversationId, migration.fromProjectId);
        if (source && source.messages.length > 0) {
          const target = store.createConversation(migration.toProjectId, source.title || 'Percakapan Copilot');
          for (const m of source.messages) {
            store.appendMessage(target.id, migration.toProjectId, {
              id: m.id, role: m.role, content: m.content,
              createdAt: m.createdAt, timestamp: m.timestamp,
            } as never);
          }
          migrated = true;
        }
      } catch { /* gagal migrasi = percakapan baru kosong */ }
    }
    try {
      const conv = store.getOrCreateActiveConversation(storeProjectId);
      if (migrationConsumed) {
        view.migratedConversationRef.set(migrationConsumed.fromConversationId, {
          toConversationId: conv.id,
          toProjectId: storeProjectId,
        });
      }
      view.convIdRef = conv.id;
      view.activeConvId = conv.id;
      // mergeRestoredChatActions disederhanakan: model tidak punya tombol
      // aksi pada pesan (tidak memengaruhi isi/teks riwayat).
      setMessages((conv.messages ?? []).filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content, ts: Date.now() })));
      void migrated;
    } catch { /* storage failure non-fatal */ }
  };
  // Efek Tier 2 (F-ISO-5, tidak diubah S3-C).
  const tier2Effect = () => {
    const prevId = view.prevProjectIdForIntakeRef;
    view.prevProjectIdForIntakeRef = view.effProjectId ?? null;
    if (prevId === undefined) return 'mount-pertama: skip';
    if (prevId === (view.effProjectId ?? null)) return 'proyek sama: skip';
    const ictx = reg.getUniversalContextState();
    if (!ictx || !ictx.projectId || ictx.projectId !== prevId) return 'singleton bukan milik proyek lama: skip';
    reg.clearUniversalContext();
    view.awaitingConcept = false;
    view.intakeRestoredForRef.delete(prevId);
    return `CLEARED singleton proyek ${prevId}`;
  };
  // Efek pulih intake (termasuk skip-once B5-3).
  const restoreIntakeEffect = () => {
    if (!view.effProjectId) return 'tanpa proyek: skip';
    if (view.skipIntakeRestoreForRef === view.effProjectId) {
      view.skipIntakeRestoreForRef = null;
      return 'skip-once B5-3';
    }
    if (reg.getUniversalContextState()) return 'singleton non-null: skip';
    if (view.intakeRestoredForRef.has(view.effProjectId)) return 'sudah dipulihkan sesi ini: skip';
    view.intakeRestoredForRef.add(view.effProjectId);
    const loaded = dp.loadIntakeContext(view.effProjectId);
    if (!loaded.ok) return `load gagal: ${loaded.error}`;
    const draftRec = dp.peekPersistedDraft(view.effProjectId);
    if (!dp.shouldRestoreIntakeSnapshot(loaded, draftRec)) return 'shouldRestore menolak';
    reg.restoreUniversalContext(loaded.ctx, view.effProjectId);
    if (!loaded.generatedDraftId) view.awaitingConcept = true;
    appendMessageUi({ role: 'assistant', content: `Konteks proyek ${loaded.ctx.primary?.label ?? 'ini'} dipulihkan dari sesi sebelumnya.`, ts: Date.now() });
    return `RESTORED primary=${loaded.ctx.primary?.id ?? null}`;
  };
  // Efek langganan eksekusi view.tsx:841 PASCA-S3-C (F2/F3: view-owned).
  const subscribeEffect = () => {
    if (!view.activeConvId) return;
    const current = rt.getActiveExecution(view.activeConvId);
    const viewLive = current ?? rt.getAnyActiveExecution(NON_CHAT_PREFIXES);
    view.activeExec = viewLive ? { requestId: viewLive.requestId } : null;
    view.busy = viewLive !== null;
  };
  // Ganti proyek: urutan efek = urutan deklarasi + commit lanjutan.
  const switchProject = (newId: string | null) => {
    const prevId = view.effProjectId;
    view.effProjectId = newId;
    view.liveProjectRef = newId ? { id: newId, name: `Proyek ${newId}` } : null;
    view.storeProjectIdRef = newId ?? '__ezrab_ai_global__'; // efek sync ref
    loadConversationEffect();
    const t2 = tier2Effect();
    const rs = restoreIntakeEffect();
    subscribeEffect(); // commit berikut
    void prevId;
    return { tier2: t2, restore: rs, busyAfter: view.busy };
  };
  const mountAt = (projectId: string | null) => {
    view.effProjectId = projectId;
    view.liveProjectRef = projectId ? { id: projectId, name: `Proyek ${projectId}` } : null;
    view.storeProjectIdRef = projectId ?? '__ezrab_ai_global__';
    loadConversationEffect();
    tier2Effect();
    restoreIntakeEffect();
    subscribeEffect();
  };
  const resetView = (scenario: string) => {
    view.scenario = scenario;
    view.effProjectId = null;
    view.messages = [];
    view.busy = false;
    view.activeExec = null;
    view.activeConvId = null;
    view.awaitingConcept = false;
    view.convIdRef = null;
    view.storeProjectIdRef = '__ezrab_ai_global__';
    view.liveProjectRef = null;
    view.lastAiPromptRef = null;
    view.lastAiPromptConversationIdRef = null;
    view.lastAiErrorMessageIdRef = null;
    view.retryReplacesMessageIdRef = null;
    view.prevProjectIdForIntakeRef = undefined;
    view.intakeRestoredForRef = new Set();
    view.skipIntakeRestoreForRef = null;
    view.pendingConversationMigrationRef = null;
    view.migratedConversationRef = new Map();
    view.persistScopeOverrideRef = null;
    view.draftUpdatedAtRef = null;
    rt.__resetExecutionRuntimeForTests();
    reg.clearUniversalContext();
    if (typeof (reg as { clearProjectContext?: () => void }).clearProjectContext === 'function') {
      (reg as { clearProjectContext: () => void }).clearProjectContext();
    }
    rab.setLastUniversalDraft(null, null);
    toolReg.__resetToolRegistryForTests();
    fakeStore.reset();
    ensurerCalls = [];
  };

  // Intake terpandu via registry (pola ISO5) + efek simpan (F-ISO-1).
  const mockCtx = (projectId: string | null) => ({
    navigate: () => undefined, currentMenu: 'ezrab-ai',
    activeProject: projectId ? { id: projectId, name: `Proyek ${projectId}` } : null,
    projects: [], projectTotal: 0, projectItems: null,
  }) as unknown as Parameters<typeof reg.executeIntent>[2];
  const viewSaveEffect = (effProjectId: string) => {
    const ictx = reg.getUniversalContextState();
    if (!ictx) return 'SKIP null';
    if (ictx.projectId && ictx.projectId !== effProjectId) return 'SKIP F-ISO-1';
    const r = dp.saveIntakeContext(effProjectId, ictx);
    return r.ok ? 'SAVED' : `FAIL ${r.error}`;
  };
  const setupIntake = (text: string, projectId: string) => {
    const routed = routeIntent(text);
    const res = reg.executeIntent(routed.intent, routed.param, { ...mockCtx(projectId), rawText: text });
    viewSaveEffect(projectId);
    return { intent: routed.intent, awaitConcept: (res as { awaitProjectConcept?: boolean }).awaitProjectConcept === true };
  };

  // Mock AI terkontrol: resolve/reject sesudah delay (signal diabaikan —
  // seperti mock probe; waitForMinimum ASLI yang menangani sinyal).
  const mockAi = (delayMs: number, reply: string, fail: boolean): Promise<{ success: boolean; reply: string }> =>
    new Promise((resolve, reject) => setTimeout(() => (fail ? reject(new Error('mock provider failure')) : resolve({ success: true, reply })), delayMs));

  // Pabrik closure eksekusi per-submit (ensureExec/endExec/
  // noteCancelledIfNeeded — salinan setia view.tsx:2654-2700 PASCA-S3-C).
  const createExecScope = () => {
    let exec: ReturnType<typeof rt.beginExecution> | null = null;
    let cancelNoted = false;
    const ensureExec = () => {
      if (!exec) {
        const convId = view.convIdRef ?? store.getOrCreateActiveConversation(view.storeProjectIdRef).id;
        exec = rt.beginExecution(convId, view.storeProjectIdRef);
        // Notifikasi beginExecution → listener langganan mengisi activeExec.
        const current = view.activeConvId ? rt.getActiveExecution(view.activeConvId) : null;
        const viewLive = current ?? rt.getAnyActiveExecution(NON_CHAT_PREFIXES);
        view.activeExec = viewLive ? { requestId: viewLive.requestId } : null;
      }
      return exec;
    };
    const endExec = (outcome: 'completed' | 'failed' = 'completed', error?: string) => {
      if (!exec) return;
      const finishedId = exec.record.requestId;
      rt.finishExecution(exec.record.requestId, outcome, error);
      exec = null;
      const nextActive = rt.getAnyActiveExecution(NON_CHAT_PREFIXES);
      if (view.activeExec && view.activeExec.requestId === finishedId) {
        view.activeExec = nextActive ? { requestId: nextActive.requestId } : null;
      }
    };
    const noteCancelledIfNeeded = () => {
      if (!exec || cancelNoted) return;
      const rec = rt.getExecution(exec.record.requestId);
      if (rec?.status !== 'cancelled') return;
      cancelNoted = true;
      const text = 'Permintaan dibatalkan.';
      const cancelScope = resolveSendScope({ conversationId: exec.record.conversationId, projectId: exec.record.projectId });
      if (isScopeDisplayed(cancelScope)) appendMessageUi({ role: 'assistant', content: text, ts: Date.now() });
      persistMessageScoped('assistant', text, cancelScope);
    };
    return { ensureExec, endExec, noteCancelledIfNeeded, getExec: () => exec };
  };

  // ---- Model cabang LLM submit PASCA-S3-C ----
  // `force` = jendela remount/reset (busy state ter-reset saat eksekusi
  // hidup) — SATU-SATUNYA jalan dua submit tumpang-tindih; dipakai hanya
  // S3C-07/08 untuk membuktikan F1/F2 bertahan di jendela itu.
  const submitLlm = async (text: string, opts: { delayMs: number; fail?: boolean; reply?: string; minDelayMs?: number; force?: boolean }) => {
    const { delayMs, fail = false, force = false } = opts;
    const replyText = opts.reply ?? `JAWABAN-AI-untuk: ${text}`;
    if (view.busy && !force) return { blocked: true as const, reason: 'busy' };
    view.retryReplacesMessageIdRef = null;
    const content = text;
    const entry: Msg = { role: 'user', content: text, ts: Date.now() };
    setMessages([...view.messages, entry]);
    persistMessage('user', entry.content);
    view.busy = true;
    const { ensureExec, endExec, noteCancelledIfNeeded } = createExecScope();
    const timingStart = Date.now();
    view.lastAiPromptRef = content;
    view.lastAiPromptConversationIdRef = view.convIdRef;
    const llmExec = ensureExec();
    const captured = {
      requestId: llmExec.record.requestId,
      recordConversationId: llmExec.record.conversationId,
      recordProjectId: llmExec.record.projectId,
    };
    const sendPromise = mockAi(delayMs, replyText, fail);
    try {
      const res = await timing.waitForMinimum(timingStart, opts.minDelayMs ?? 10, sendPromise, llmExec.signal);
      const isCurrentAtResolve = llmExec.isCurrent();
      if (!isCurrentAtResolve) {
        noteCancelledIfNeeded();
        endExec();
        return { ...captured, blocked: false as const, outcome: 'discarded-stale-or-cancelled', isCurrentAtResolve };
      }
      // S3-C (F1): scope kirim + tampil-bersyarat.
      const sendScope = resolveSendScope({ conversationId: llmExec.record.conversationId, projectId: llmExec.record.projectId });
      const replyDisplayed = isScopeDisplayed(sendScope);
      if (replyDisplayed) appendMessageUi({ role: 'assistant', content: res.reply, ts: Date.now() });
      view.persistScopeOverrideRef = sendScope;
      const persistedReplyId = persistMessage('assistant', res.reply);
      view.persistScopeOverrideRef = null;
      if (replyDisplayed) view.lastAiErrorMessageIdRef = res.success ? null : persistedReplyId;
      endExec(res.success ? 'completed' : 'failed', res.success ? undefined : res.reply);
      return { ...captured, blocked: false as const, outcome: 'delivered', isCurrentAtResolve, persistedReplyId, replyDisplayed };
    } catch (err: unknown) {
      const isAbort = timing.isAbortError(err);
      if (isAbort) {
        noteCancelledIfNeeded();
        endExec();
        return { ...captured, blocked: false as const, outcome: 'aborted', isCurrentAtResolve: llmExec.isCurrent() };
      }
      // gateWait di catch (minimum sudah berlalu; sinyal tidak abort) —
      // setara cek isCurrent.
      if (!llmExec.isCurrent()) {
        noteCancelledIfNeeded();
        endExec();
        return { ...captured, blocked: false as const, outcome: 'discarded-stale-or-cancelled', isCurrentAtResolve: false };
      }
      const errMsg = `AI gagal menjawab: ${(err as Error)?.message ?? 'kesalahan tak dikenal'}`;
      const errScope = resolveSendScope({ conversationId: llmExec.record.conversationId, projectId: llmExec.record.projectId });
      const errDisplayed = isScopeDisplayed(errScope);
      if (errDisplayed) appendMessageUi({ role: 'assistant', content: errMsg, ts: Date.now() });
      const persistedErrId = persistMessageScoped('assistant', errMsg, errScope);
      if (errDisplayed) view.lastAiErrorMessageIdRef = persistedErrId;
      endExec('failed', errMsg);
      return { ...captured, blocked: false as const, outcome: 'error-delivered', isCurrentAtResolve: llmExec.isCurrent(), errDisplayed };
    } finally {
      endExec();
      // S3-C (F2): finally berjaga — busy hanya kosong bila tidak ada
      // eksekusi chat lain yang hidup.
      if (!rt.hasAnyActiveExecution(NON_CHAT_PREFIXES)) view.busy = false;
    }
  };

  // ---- Model cabang deterministik + postAssistant PASCA-S3-C ----
  const submitDeterministic = async (text: string, localReply: string, minMs: number, hooks?: { beforeGateResolve?: () => void }) => {
    if (view.busy) return { blocked: true as const, reason: 'busy' };
    const capturedEffProjectId = view.effProjectId;
    const entry: Msg = { role: 'user', content: text, ts: Date.now() };
    setMessages([...view.messages, entry]);
    persistMessage('user', entry.content);
    view.busy = true;
    const { ensureExec, endExec, noteCancelledIfNeeded, getExec } = createExecScope();
    const timingStart = Date.now();
    const h = ensureExec();
    try {
      await timing.waitForMinimum(timingStart, minMs, Promise.resolve(), h.signal);
    } catch {
      endExec();
      view.busy = false;
      return { blocked: false as const, outcome: 'gate-aborted', capturedEffProjectId };
    }
    if (hooks?.beforeGateResolve) hooks.beforeGateResolve();
    const isCurrentAtGate = h.isCurrent();
    if (!isCurrentAtGate) {
      noteCancelledIfNeeded();
      endExec();
      view.busy = false;
      return { blocked: false as const, outcome: 'gate-stale', capturedEffProjectId, isCurrentAtGate };
    }
    // postAssistant PASCA-S3-C (F1/F5 + penjaga plan W15 dimodelkan
    // sebagai flag: plan hanya ditandai bila kartu tampil).
    const sendExec = getExec();
    const sendScope = sendExec ? resolveSendScope({ conversationId: sendExec.record.conversationId, projectId: sendExec.record.projectId }) : undefined;
    const replyDisplayed = !sendScope || isScopeDisplayed(sendScope);
    if (replyDisplayed) appendMessageUi({ role: 'assistant', content: localReply, ts: Date.now() });
    persistMessageScoped('assistant', localReply, sendScope);
    const autosave = persistActiveDraftModel(capturedEffProjectId, 'autosave', sendScope?.conversationId);
    endExec();
    // Cabang deterministik menutup busy tanpa syarat (perilaku view:
    // setBusy(false) di cabang — aman karena dalam satu mount tidak ada
    // submit kedua yang bisa hidup; jendela remount/reset didokumentasi
    // sebagai batasan laporan S3-C).
    view.busy = false;
    return { blocked: false as const, outcome: 'delivered', capturedEffProjectId, isCurrentAtGate, autosave, replyDisplayed };
  };

  // newChat — view.tsx (guard busy, tidak diubah S3-C).
  const newChatModel = () => {
    if (view.busy) return { ok: false as const, reason: 'busy-guard' };
    setMessages([]);
    view.awaitingConcept = false;
    const conv = store.createConversation(view.storeProjectIdRef, 'Percakapan baru');
    store.setActiveConversationId(view.storeProjectIdRef, conv.id);
    view.convIdRef = conv.id;
    view.activeConvId = conv.id;
    return { ok: true as const, convId: conv.id };
  };
  // stopActiveExecution — view.tsx:4674 PASCA-S3-C (F3).
  const stopModel = () => {
    const rec = view.activeExec
      ?? (view.activeConvId ? rt.getActiveExecution(view.activeConvId) : null)
      ?? rt.getAnyActiveExecution(NON_CHAT_PREFIXES);
    if (!rec) return { cancelled: false as const, reason: 'no-active-exec' };
    rt.cancelExecution(rec.requestId);
    return { cancelled: true as const, requestId: rec.requestId };
  };
  // getRetryPrompt — view.tsx:4649 PASCA-S3-C (prompt tercap percakapan).
  const getRetryPromptModel = (): string | null => {
    if (view.lastAiPromptRef && view.lastAiPromptConversationIdRef === view.convIdRef) return view.lastAiPromptRef;
    for (let i = view.messages.length - 1; i >= 0; i--) {
      if (view.messages[i].role === 'user' && view.messages[i].content.trim()) return view.messages[i].content;
    }
    return null;
  };
  // Fire-and-forget generik — model `post` requestDocSummary / pesan
  // gagal exportProject PASCA-S3-C (W18/W19: scope ditangkap saat panggil).
  const postAfterDelayModel = async (text: string, delayMs: number) => {
    const scopeAtRequest = view.convIdRef
      ? { conversationId: view.convIdRef, projectId: view.storeProjectIdRef }
      : null;
    await sleep(delayMs);
    const scope = scopeAtRequest ? resolveSendScope(scopeAtRequest) : null;
    if (!scope || isScopeDisplayed(scope)) appendMessageUi({ role: 'assistant', content: text, ts: Date.now() });
    persistMessageScoped('assistant', text, scope);
    return { scope };
  };

  // Dump isi store per proyek (semua percakapan).
  const dumpStore = (pid: string) => store.listConversations(pid).map((c) => ({
    conv: c.id.slice(0, 44),
    messages: c.messages.map((m) => `${m.role}:${m.content.slice(0, 50)}`),
  }));
  const storeHas = (pid: string, needle: string) =>
    store.listConversations(pid).some((c) => c.messages.some((m) => m.content.includes(needle)));
  const singleton = () => {
    const s = reg.getUniversalContextState();
    return s ? `${s.primary?.id ?? '?'}/${s.projectId ?? 'null'}` : 'null';
  };
  const snapJson = (pid: string) => {
    const rec = dp.peekIntakeContext(pid);
    return rec ? JSON.stringify(rec.context) : null;
  };

  tp.setDraftProjectEnsurer(fakeEnsurer as never);

  // ============ S3C-01 (S1): balasan LLM A pulang ke A, B utuh ============
  await check('S3C-01 reply A homes to A; B store/UI untouched; visible on return', async () => {
    resetView('S3C-01');
    fakeStore.seed('PRJ-S3C-A-01', 'Proyek A'); fakeStore.seed('PRJ-S3C-B-01', 'Proyek B');
    mountAt('PRJ-S3C-A-01');
    const convA = view.convIdRef as string;
    const p = submitLlm('Berapa biaya jalan beton 2 km?', { delayMs: 300, reply: 'JAWABAN-A-UNIK-01' });
    await sleep(60);
    switchProject('PRJ-S3C-B-01');
    const convB = view.convIdRef as string;
    assert(convB !== convA, 'percakapan B berbeda dari A');
    assert(view.busy === true, `busy view tetap true sesudah switch (dapat ${view.busy}) — efek langganan F2`);
    const res = await p;
    assert(res.outcome === 'delivered', `outcome=${(res as { outcome?: string }).outcome}`);
    assert(storeHas('PRJ-S3C-A-01', 'JAWABAN-A-UNIK-01'), 'store A harus berisi balasan A');
    assert(!storeHas('PRJ-S3C-B-01', 'JAWABAN-A-UNIK-01'), 'store B TIDAK boleh berisi balasan A');
    assert(!view.messages.some((m) => m.content.includes('JAWABAN-A-UNIK-01')), 'UI B TIDAK boleh menampilkan balasan A');
    assert(view.messages.every((m) => m.role !== 'assistant' || !m.content.includes('JAWABAN-A')), 'UI B tanpa balasan A');
    switchProject('PRJ-S3C-A-01');
    assert(view.messages.some((m) => m.role === 'assistant' && m.content.includes('JAWABAN-A-UNIK-01')),
      'kembali ke A: balasan A tampil dari store');
    const orderA = store.getConversation(convA, 'PRJ-S3C-A-01')?.messages.map((m) => m.role) ?? [];
    assert(JSON.stringify(orderA) === JSON.stringify(['user', 'assistant']), `urutan store A [user,assistant], dapat ${JSON.stringify(orderA)}`);
  });

  // ============ S3C-02 (S2): newChat diblokir di B saat A berjalan ============
  await check('S3C-02 newChat blocked in B while A runs; allowed after resolve', async () => {
    resetView('S3C-02');
    fakeStore.seed('PRJ-S3C-A-02', 'Proyek A'); fakeStore.seed('PRJ-S3C-B-02', 'Proyek B');
    mountAt('PRJ-S3C-A-02');
    const p = submitLlm('Pertanyaan panjang A', { delayMs: 300, reply: 'JAWABAN-A-UNIK-02' });
    await sleep(60);
    switchProject('PRJ-S3C-B-02');
    const blocked = newChatModel();
    assert(blocked.ok === false && blocked.reason === 'busy-guard', `newChat di B harus ditolak busy (dapat ${JSON.stringify(blocked)})`);
    const res = await p;
    assert(res.outcome === 'delivered', 'balasan A terkirim');
    assert(view.busy === false, 'busy kosong sesudah resolve');
    const allowed = newChatModel();
    assert(allowed.ok === true, 'newChat diizinkan sesudah resolve');
    assert(!storeHas('PRJ-S3C-B-02', 'JAWABAN-A-UNIK-02'), 'store B bersih dari balasan A');
  });

  // ============ S3C-03 (S3): error A pulang ke A; retry tercap ============
  await check('S3C-03 error homes to A; error-id ref unset in B; retry prompt scoped', async () => {
    resetView('S3C-03');
    fakeStore.seed('PRJ-S3C-A-03', 'Proyek A'); fakeStore.seed('PRJ-S3C-B-03', 'Proyek B');
    mountAt('PRJ-S3C-A-03');
    const p = submitLlm('Pertanyaan yang gagal', { delayMs: 250, fail: true });
    await sleep(60);
    switchProject('PRJ-S3C-B-03');
    const res = await p;
    assert(res.outcome === 'error-delivered', `outcome=${(res as { outcome?: string }).outcome}`);
    assert((res as { errDisplayed?: boolean }).errDisplayed === false, 'error tidak ditampilkan di B');
    assert(storeHas('PRJ-S3C-A-03', 'AI gagal menjawab'), 'pesan error tersimpan di A');
    assert(!storeHas('PRJ-S3C-B-03', 'AI gagal menjawab'), 'pesan error TIDAK boleh tersimpan di B');
    assert(view.lastAiErrorMessageIdRef === null, 'lastAiErrorMessageIdRef tetap null saat error pulang (tanpa tampil)');
    assert(getRetryPromptModel() === null, 'retry prompt di B: prompt A tidak bisa dipakai (fallback scan UI B kosong)');
    // Di B, kirim prompt B sendiri lalu gagal → retry prompt harus prompt B.
    const p2 = submitLlm('Pertanyaan B gagal', { delayMs: 150, fail: true });
    const res2 = await p2;
    assert(res2.outcome === 'error-delivered', 'error B terkirim');
    assert((res2 as { errDisplayed?: boolean }).errDisplayed === true, 'error B ditampilkan di B');
    assert(view.lastAiErrorMessageIdRef !== null, 'error-id ref diset untuk error yang tampil di B');
    assert(getRetryPromptModel() === 'Pertanyaan B gagal', `retry prompt = prompt B, dapat "${getRetryPromptModel()}"`);
    switchProject('PRJ-S3C-A-03');
    assert(view.lastAiErrorMessageIdRef !== null, 'ref error B bertahan di ref (tidak dipakai ulang — retry hanya tampil bila error tampil di percakapan aktif)');
    assert(getRetryPromptModel() === 'Pertanyaan yang gagal', 'kembali ke A: retry prompt jatuh ke scan pesan tampil = prompt A');
  });

  // ============ S3C-04 (S4a): cancel sebelum switch → catatan di A saja ============
  await check('S3C-04 cancel before switch: note lands in A only; no reply anywhere', async () => {
    resetView('S3C-04');
    fakeStore.seed('PRJ-S3C-A-04', 'Proyek A'); fakeStore.seed('PRJ-S3C-B-04', 'Proyek B');
    mountAt('PRJ-S3C-A-04');
    const p = submitLlm('Batalkan saya', { delayMs: 500, reply: 'JAWABAN-A-UNIK-04' });
    await sleep(100);
    const stopped = stopModel();
    assert(stopped.cancelled === true, 'stop di A membatalkan eksekusi');
    switchProject('PRJ-S3C-B-04');
    const res = await p;
    assert(res.outcome === 'discarded-stale-or-cancelled' || res.outcome === 'aborted',
      `outcome=${(res as { outcome?: string }).outcome}`);
    assert(!storeHas('PRJ-S3C-A-04', 'JAWABAN-A-UNIK-04') && !storeHas('PRJ-S3C-B-04', 'JAWABAN-A-UNIK-04'),
      'balasan tidak boleh tersimpan di mana pun');
    assert(storeHas('PRJ-S3C-A-04', 'Permintaan dibatalkan'), 'catatan batal tersimpan di A');
    assert(!storeHas('PRJ-S3C-B-04', 'Permintaan dibatalkan'), 'catatan batal TIDAK boleh di B');
    assert(!view.messages.some((m) => m.content.includes('dibatalkan')), 'UI B tanpa catatan batal');
  });

  // ============ S3C-05 (S4b): stop sesudah switch menjangkau A ============
  await check('S3C-05 stop after switch reaches A request (F3); note homes to A', async () => {
    resetView('S3C-05');
    fakeStore.seed('PRJ-S3C-A-05', 'Proyek A'); fakeStore.seed('PRJ-S3C-B-05', 'Proyek B');
    mountAt('PRJ-S3C-A-05');
    const p = submitLlm('Stop saya dari B', { delayMs: 500, reply: 'JAWABAN-A-UNIK-05' });
    await sleep(60);
    switchProject('PRJ-S3C-B-05');
    assert(view.activeExec !== null, 'activeExec view tetap menunjuk eksekusi A sesudah switch (tombol Stop aktif)');
    const stopped = stopModel();
    assert(stopped.cancelled === true, `stop di B harus membatalkan request A (dapat ${JSON.stringify(stopped)})`);
    const res = await p;
    assert(res.outcome === 'discarded-stale-or-cancelled' || res.outcome === 'aborted',
      `outcome=${(res as { outcome?: string }).outcome}`);
    assert(!storeHas('PRJ-S3C-A-05', 'JAWABAN-A-UNIK-05') && !storeHas('PRJ-S3C-B-05', 'JAWABAN-A-UNIK-05'),
      'balasan tidak boleh tersimpan');
    assert(storeHas('PRJ-S3C-A-05', 'Permintaan dibatalkan'), 'catatan batal pulang ke A');
    assert(!storeHas('PRJ-S3C-B-05', 'Permintaan dibatalkan'), 'catatan batal tidak di B');
    assert(!view.messages.some((m) => m.content.includes('dibatalkan')), 'UI B tanpa catatan batal');
    assert(view.busy === false, 'busy kosong sesudah pembatalan');
  });

  // ============ S3C-06 (S5 via UI): submit B diblokir; urutan benar ============
  await check('S3C-06 submit B blocked while A runs; after resolve B works, stores ordered', async () => {
    resetView('S3C-06');
    fakeStore.seed('PRJ-S3C-A-06', 'Proyek A'); fakeStore.seed('PRJ-S3C-B-06', 'Proyek B');
    mountAt('PRJ-S3C-A-06');
    const convA = view.convIdRef as string;
    const pA = submitLlm('Pertanyaan lambat A', { delayMs: 300, reply: 'JAWABAN-A-UNIK-06' });
    await sleep(60);
    switchProject('PRJ-S3C-B-06');
    const convB = view.convIdRef as string;
    const pBBlocked = submitLlm('Pertanyaan cepat B', { delayMs: 50, reply: 'JAWABAN-B-UNIK-06' });
    const blocked = await pBBlocked;
    assert(blocked.blocked === true, 'submit B harus diblokir saat A berjalan (busy milik view)');
    assert(!storeHas('PRJ-S3C-B-06', 'Pertanyaan cepat B'), 'prompt B yang diblokir tidak boleh tersimpan');
    await pA;
    const pB = submitLlm('Pertanyaan cepat B', { delayMs: 50, reply: 'JAWABAN-B-UNIK-06' });
    const resB = await pB;
    assert(resB.outcome === 'delivered', 'submit B kedua berhasil sesudah A selesai');
    const orderA = store.getConversation(convA, 'PRJ-S3C-A-06')?.messages.map((m) => m.role) ?? [];
    const orderB = store.getConversation(convB, 'PRJ-S3C-B-06')?.messages.map((m) => m.role) ?? [];
    assert(JSON.stringify(orderA) === JSON.stringify(['user', 'assistant']), `store A [user,assistant], dapat ${JSON.stringify(orderA)}`);
    assert(JSON.stringify(orderB) === JSON.stringify(['user', 'assistant']), `store B [user,assistant], dapat ${JSON.stringify(orderB)}`);
    assert(!storeHas('PRJ-S3C-B-06', 'JAWABAN-A-UNIK-06'), 'store B tanpa balasan A');
    assert(storeHas('PRJ-S3C-B-06', 'JAWABAN-B-UNIK-06'), 'store B berisi balasan B');
  });

  // ============ S3C-07 (S5 forced): overlap via jendela remount, tetap pulang ============
  await check('S3C-07 forced overlap out-of-order still routes home; B order clean', async () => {
    resetView('S3C-07');
    fakeStore.seed('PRJ-S3C-A-07', 'Proyek A'); fakeStore.seed('PRJ-S3C-B-07', 'Proyek B');
    mountAt('PRJ-S3C-A-07');
    const convA = view.convIdRef as string;
    const pA = submitLlm('Pertanyaan lambat A', { delayMs: 500, reply: 'JAWABAN-A-UNIK-07' });
    await sleep(60);
    switchProject('PRJ-S3C-B-07');
    const convB = view.convIdRef as string;
    // Jendela remount: busy ter-reset eksternal (mis. reloadChat/reset state)
    // saat eksekusi A masih hidup — force mensimulasikan submit B lolos.
    view.busy = false;
    const pB = submitLlm('Pertanyaan cepat B', { delayMs: 50, reply: 'JAWABAN-B-UNIK-07', force: true });
    const [resA, resB] = await Promise.all([pA, pB]);
    assert(resA.outcome === 'delivered' && resB.outcome === 'delivered', 'kedua balasan terkirim');
    const rolesB = store.getConversation(convB, 'PRJ-S3C-B-07')?.messages.map((m) => m.content.slice(0, 24)) ?? [];
    assert(JSON.stringify(rolesB) === JSON.stringify(['Pertanyaan cepat B', 'JAWABAN-B-UNIK-07']),
      `store B [prompt B, jawaban B], dapat ${JSON.stringify(rolesB)}`);
    const rolesA = store.getConversation(convA, 'PRJ-S3C-A-07')?.messages.map((m) => m.content.slice(0, 24)) ?? [];
    assert(rolesA.includes('JAWABAN-A-UNIK-07'), `store A berisi balasan A, dapat ${JSON.stringify(rolesA)}`);
    // UI B: setelah B resolve, kembali ke A menampilkan balasan A.
    switchProject('PRJ-S3C-A-07');
    assert(view.messages.some((m) => m.content.includes('JAWABAN-A-UNIK-07')), 'kembali ke A: balasan A tampil');
    assert(!view.messages.some((m) => m.content.includes('JAWABAN-B-UNIK-07')), 'UI A tanpa balasan B');
  });

  // ============ S3C-08 (S5b): finally A tidak membersihkan busy B ============
  await check('S3C-08 A finally does not clear busy while B runs; third submit blocked; B reply kept', async () => {
    resetView('S3C-08');
    fakeStore.seed('PRJ-S3C-A-08', 'Proyek A'); fakeStore.seed('PRJ-S3C-B-08', 'Proyek B');
    mountAt('PRJ-S3C-A-08');
    const pA = submitLlm('Pertanyaan A cepat', { delayMs: 200, reply: 'JAWABAN-A-UNIK-08' });
    await sleep(60);
    switchProject('PRJ-S3C-B-08');
    view.busy = false; // jendela remount
    const pB = submitLlm('Pertanyaan B lambat', { delayMs: 700, reply: 'JAWABAN-B-UNIK-08', force: true });
    await pA; // A resolve saat B masih berjalan
    await sleep(30);
    assert(view.busy === true, `busy harus tetap true saat B berjalan (dapat ${view.busy}) — finally A berjaga`);
    const third = await submitLlm('Submit ketiga B', { delayMs: 50, reply: 'JAWABAN-B3-08' });
    assert(third.blocked === true, 'submit ketiga di B harus diblokir saat B berjalan');
    const resB = await pB;
    assert(resB.outcome === 'delivered', 'balasan B pertama terkirim (tidak dibuang supersede)');
    assert(storeHas('PRJ-S3C-B-08', 'JAWABAN-B-UNIK-08'), 'store B berisi balasan B');
    assert(!storeHas('PRJ-S3C-B-08', 'JAWABAN-B3-08'), 'store B tanpa balasan submit ketiga');
    assert(view.busy === false, 'busy kosong sesudah B selesai');
  });

  // ============ S3C-09 (S6 + F5): balasan deterministik pulang; draft di A ============
  await check('S3C-09 deterministic reply homes; draft saved under A with conv A', async () => {
    resetView('S3C-09');
    fakeStore.seed('PRJ-S3C-A-09', 'Proyek A'); fakeStore.seed('PRJ-S3C-B-09', 'Proyek B');
    mountAt('PRJ-S3C-A-09');
    const convA = view.convIdRef as string;
    // Bangun draft universal di A (jalur registry) agar persistActiveDraft punya isi.
    const setup = setupIntake(JALAN_TEXT, 'PRJ-S3C-A-09');
    assert(setup.awaitConcept === true, 'intake universal menunggu konsep');
    const draftRes = rab.buildUniversalDraft('Buatkan RAB jalan beton 2 km', undefined, { projectId: 'PRJ-S3C-A-09' });
    assert(draftRes.kind === 'draft', `buildUniversalDraft kind=draft, dapat ${draftRes.kind}`);
    assert(rab.getLastUniversalDraftProjectId() === 'PRJ-S3C-A-09', 'draft terikat ke A');
    const p = submitDeterministic('Tampilkan ringkasan draft', 'RINGKASAN-DETERMINISTIK-09', 300);
    await sleep(60);
    switchProject('PRJ-S3C-B-09');
    const res = await p;
    assert(res.outcome === 'delivered', `outcome=${(res as { outcome?: string }).outcome}`);
    assert((res as { replyDisplayed?: boolean }).replyDisplayed === false, 'balasan deterministik tidak ditampilkan di B');
    assert(storeHas('PRJ-S3C-A-09', 'RINGKASAN-DETERMINISTIK-09'), 'balasan deterministik tersimpan di A');
    assert(!storeHas('PRJ-S3C-B-09', 'RINGKASAN-DETERMINISTIK-09'), 'balasan deterministik tidak di B');
    assert(!view.messages.some((m) => m.content.includes('RINGKASAN-DETERMINISTIK-09')), 'UI B tanpa balasan deterministik');
    assert((res as { autosave?: { saved?: boolean; conversationIdUsed?: string | null } }).autosave?.saved === true,
      `autosave draft harus sukses, dapat ${JSON.stringify((res as { autosave?: unknown }).autosave)}`);
    const rec = dp.peekPersistedDraft('PRJ-S3C-A-09');
    assert(rec !== null, 'draft A tercatat di draftPersistence');
    assert(rec?.conversationId === convA, `draft A conversationId = conv A (dapat ${rec?.conversationId}) — F5`);
    assert(dp.peekPersistedDraft('PRJ-S3C-B-09') === null, 'tidak ada draft di B');
  });

  // ============ S3C-10 (S7/F4): draft tool diikat scope A, bukan live B ============
  await check('S3C-10 tool draft binds to scope A (hint), not live B; no temp project', async () => {
    resetView('S3C-10');
    fakeStore.seed('PRJ-S3C-A-10', 'Proyek A'); fakeStore.seed('PRJ-S3C-B-10', 'Proyek B');
    mountAt('PRJ-S3C-A-10');
    setupIntake(JALAN_TEXT, 'PRJ-S3C-A-10');
    switchProject('PRJ-S3C-B-10'); // live = B, tapi scope tool = A
    assert(view.liveProjectRef?.id === 'PRJ-S3C-B-10', 'live project = B saat pemanggilan tool');
    const res = await toolReg.executeTool({
      toolName: 'build_universal_draft',
      args: { text: JALAN_TEXT },
      projectId: 'PRJ-S3C-A-10',
      actor: 'model',
      channel: 'chat-ai',
      idempotencyKey: 's3c-10',
    });
    assert((res as { ok?: boolean }).ok === true, `executeTool ok, dapat ${JSON.stringify(res).slice(0, 200)}`);
    assert(ensurerCalls.length >= 1, 'ensurer dipanggil');
    const hintCall = ensurerCalls.find((c) => c.preferredProjectId === 'PRJ-S3C-A-10');
    assert(hintCall !== undefined, `ensurer menerima petunjuk A, dapat ${JSON.stringify(ensurerCalls)}`);
    assert(fakeStore.projects.every((p) => !p.id.startsWith('PRJ-S3C-TEMP-')), 'tidak ada proyek sementara dibuat (scope A eksis)');
    assert(rab.getLastUniversalDraftProjectId() === 'PRJ-S3C-A-10', 'draft terikat ke proyek scope A (bukan live B)');
    assert(dp.peekPersistedDraft('PRJ-S3C-B-10') === null, 'tidak ada draft di proyek live B');
    // Persistensi terjadi lewat autosave view sesudah kembali ke A
    // (autosave di B tidak membaca draft yang terikat ke A).
    const convA = store.getOrCreateActiveConversation('PRJ-S3C-A-10').id;
    switchProject('PRJ-S3C-A-10');
    const saved = persistActiveDraftModel('PRJ-S3C-A-10', 'autosave');
    assert(saved.saved === true, `autosave di A menyimpan draft, dapat ${JSON.stringify(saved)}`);
    const rec = dp.peekPersistedDraft('PRJ-S3C-A-10');
    assert(rec !== null, 'draft tersimpan di bawah proyek scope A');
    assert(rec?.conversationId === convA, `draft A conversationId = conv A (dapat ${rec?.conversationId})`);
  });

  // ============ S3C-11 (F4 fail-closed): petunjuk ke proyek hilang ============
  await check('S3C-11 hint to deleted project: ensurer returns null, draft unbound, tool ok', async () => {
    resetView('S3C-11');
    fakeStore.seed('PRJ-S3C-A-11', 'Proyek A'); fakeStore.seed('PRJ-S3C-B-11', 'Proyek B');
    mountAt('PRJ-S3C-A-11');
    switchProject('PRJ-S3C-B-11'); // live = B
    const res = await toolReg.executeTool({
      toolName: 'build_universal_draft',
      args: { text: JALAN_TEXT },
      projectId: 'PRJ-DELETED',
      actor: 'model',
      channel: 'chat-ai',
      idempotencyKey: 's3c-11',
    });
    assert((res as { ok?: boolean }).ok === true, 'tool tetap ok walau binding gagal');
    const hintCall = ensurerCalls.find((c) => c.preferredProjectId === 'PRJ-DELETED');
    assert(hintCall !== undefined, `ensurer menerima petunjuk PRJ-DELETED, dapat ${JSON.stringify(ensurerCalls)}`);
    assert(rab.getLastUniversalDraftProjectId() === null, 'draft tetap tak-terikat (fail-closed, bukan ikat ke B)');
    assert(fakeStore.projects.every((p) => !p.id.startsWith('PRJ-S3C-TEMP-')), 'tidak ada proyek sementara dibuat untuk petunjuk hilang');
    assert(dp.peekPersistedDraft('PRJ-S3C-B-11') === null, 'tidak ada draft di proyek live B');
    assert(dp.peekPersistedDraft('PRJ-DELETED') === null, 'tidak ada draft di proyek yang hilang');
  });

  // ============ S3C-12 (gerbang DEFECT-1 T7a): migrasi global→temp ============
  await check('S3C-12 DEFECT-1 gate: global→temp migration; reply lands in temp conv; reload restores full text', async () => {
    resetView('S3C-12');
    mountAt(null); // pengiriman global (tanpa proyek aktif)
    const convGlobal = view.convIdRef as string;
    const longPrompt = `RAB jalan beton 2 km. ${'x'.repeat(10503)}`;
    assert(longPrompt.length === 10525, `prompt panjang 10.525 karakter (dapat ${longPrompt.length})`);
    const p = submitLlm(longPrompt, { delayMs: 400, reply: 'JAWABAN-TEMP-12' });
    await sleep(60);
    // Di tengah penerbangan: draft pertama berhasil → ensurer B5-3
    // membuat proyek sementara (tanpa petunjuk = jalur chat-draft).
    const ensured = fakeEnsurer({ title: 'RAB Jalan Beton' });
    assert(ensured.created === true, 'proyek sementara dibuat');
    const tempId = ensured.id;
    switchProject(tempId); // efek muat mengonsumsi migrasi + mencatat peta
    assert(view.migratedConversationRef.has(convGlobal), 'peta migrasi mencatat global→temp');
    const res = await p;
    assert(res.outcome === 'delivered', `outcome=${(res as { outcome?: string }).outcome}`);
    const mapEntry = view.migratedConversationRef.get(convGlobal) as { toConversationId: string; toProjectId: string };
    assert(mapEntry.toProjectId === tempId, 'peta menunjuk proyek temp');
    const tempConv = store.getConversation(mapEntry.toConversationId, tempId);
    assert(tempConv !== null, 'percakapan temp ada');
    assert(tempConv?.messages.length === 2, `percakapan temp berisi [prompt, balasan], dapat ${tempConv?.messages.length} pesan`);
    assert(tempConv?.messages[0].role === 'user' && tempConv.messages[0].content.length === 10525,
      'salinan prompt di temp utuh 10.525 karakter');
    assert(tempConv?.messages[1].content === 'JAWABAN-TEMP-12', 'balasan mendarat di percakapan temp');
    const globalConv = store.getConversation(convGlobal, '__ezrab_ai_global__');
    assert(globalConv?.messages.length === 1, 'percakapan global hanya berisi prompt (salinan, bukan pindahan)');
    assert(!globalConv?.messages.some((m) => m.content.includes('JAWABAN-TEMP-12')), 'balasan TIDAK di percakapan global');
    // Reload: view segar, storage utuh → teks penuh pulih.
    resetView('S3C-12-reload');
    mountAt(tempId);
    assert(view.messages.length === 2, `sesudah reload: 2 pesan tampil, dapat ${view.messages.length}`);
    assert(view.messages[0].content.length === 10525, `prompt sesudah reload utuh 10.525 karakter (dapat ${view.messages[0].content.length})`);
    assert(view.messages[1].content === 'JAWABAN-TEMP-12', 'balasan sesudah reload tampil');
  });

  // ============ S3C-13: migrasi lalu switch — balasan ke temp, bukan B ============
  await check('S3C-13 migration then switch: reply goes to temp conv, not global, not B', async () => {
    resetView('S3C-13');
    fakeStore.seed('PRJ-S3C-B-13', 'Proyek B');
    mountAt(null);
    const convGlobal = view.convIdRef as string;
    const p = submitLlm('Pertanyaan global lalu pindah', { delayMs: 400, reply: 'JAWABAN-TEMP-13' });
    await sleep(60);
    const ensured = fakeEnsurer({ title: 'RAB Jalan Beton' });
    const tempId = ensured.id;
    switchProject(tempId); // migrasi dikonsumsi
    await sleep(30);
    switchProject('PRJ-S3C-B-13'); // lalu pindah ke B sebelum resolve
    const res = await p;
    assert(res.outcome === 'delivered', `outcome=${(res as { outcome?: string }).outcome}`);
    assert(storeHas(tempId, 'JAWABAN-TEMP-13'), 'balasan mendarat di percakapan temp (target migrasi)');
    assert(!storeHas('__ezrab_ai_global__', 'JAWABAN-TEMP-13'), 'balasan TIDAK di percakapan global asal');
    assert(!storeHas('PRJ-S3C-B-13', 'JAWABAN-TEMP-13'), 'balasan TIDAK di B');
    assert(!view.messages.some((m) => m.content.includes('JAWABAN-TEMP-13')), 'UI B tanpa balasan');
    switchProject(tempId);
    assert(view.messages.some((m) => m.content.includes('JAWABAN-TEMP-13')), 'kembali ke temp: balasan tampil bersama promptnya');
    void convGlobal;
  });

  // ============ S3C-14 (§6.4 2/3): snapshot B utuh saat balasan A resolve ============
  await check('S3C-14 intake snapshot B + singleton B intact after A reply resolves', async () => {
    resetView('S3C-14');
    fakeStore.seed('PRJ-S3C-A-14', 'Proyek A'); fakeStore.seed('PRJ-S3C-B-14', 'Proyek B');
    mountAt('PRJ-S3C-A-14');
    setupIntake(JALAN_TEXT, 'PRJ-S3C-A-14');
    const snapA0 = snapJson('PRJ-S3C-A-14');
    const p = submitLlm('Pertanyaan A', { delayMs: 300, reply: 'JAWABAN-A-UNIK-14' });
    await sleep(60);
    switchProject('PRJ-S3C-B-14');
    setupIntake('Buatkan RAB kandang sapi 17 x 9 m', 'PRJ-S3C-B-14');
    const snapB0 = snapJson('PRJ-S3C-B-14');
    const singleB0 = singleton();
    assert(singleB0.endsWith('/PRJ-S3C-B-14'), `singleton = B sebelum resolve (dapat ${singleB0})`);
    const res = await p;
    assert(res.outcome === 'delivered', 'balasan A terkirim');
    assert(snapJson('PRJ-S3C-B-14') === snapB0, 'snapshot intake B TIDAK berubah oleh balasan A');
    assert(singleton() === singleB0, `singleton tetap B (dapat ${singleton()})`);
    assert(snapJson('PRJ-S3C-A-14') === snapA0, 'snapshot intake A juga utuh (PRESERVE)');
    assert(!storeHas('PRJ-S3C-B-14', 'JAWABAN-A-UNIK-14'), 'store B tanpa balasan A');
    assert(!view.messages.some((m) => m.content.includes('JAWABAN-A-UNIK-14')), 'UI B tanpa balasan A');
  });

  // ============ S3C-15 (§6.4 5/7): kembali ke A — snapshot A pulih + F-ISO-5 utuh ============
  await check('S3C-15 return to A restores snapshot A + reply; snapshot B preserved', async () => {
    resetView('S3C-15');
    fakeStore.seed('PRJ-S3C-A-15', 'Proyek A'); fakeStore.seed('PRJ-S3C-B-15', 'Proyek B');
    mountAt('PRJ-S3C-A-15');
    setupIntake(JALAN_TEXT, 'PRJ-S3C-A-15');
    const p = submitLlm('Pertanyaan A', { delayMs: 300, reply: 'JAWABAN-A-UNIK-15' });
    await sleep(60);
    switchProject('PRJ-S3C-B-15');
    setupIntake('Buatkan RAB kandang sapi 17 x 9 m', 'PRJ-S3C-B-15');
    const snapB0 = snapJson('PRJ-S3C-B-15');
    await p;
    switchProject('PRJ-S3C-A-15'); // Tier 2 membersihkan singleton B; pulih memulihkan A
    assert(singleton().endsWith('/PRJ-S3C-A-15'), `singleton kembali ke A (dapat ${singleton()})`);
    assert(view.awaitingConcept === true, 'awaitingConcept A dipulihkan (snapshot tanpa generatedDraftId)');
    assert(view.messages.some((m) => m.content.includes('JAWABAN-A-UNIK-15')), 'balasan A tampil sesudah kembali');
    assert(view.messages.some((m) => m.content.includes('dipulihkan dari sesi sebelumnya')), 'pesan pemulihan intake tampil');
    assert(snapJson('PRJ-S3C-B-15') === snapB0, 'snapshot B TIDAK dihapus oleh ganti proyek (F-ISO-5 PRESERVE)');
    assert(storeHas('PRJ-S3C-A-15', 'JAWABAN-A-UNIK-15'), 'store A berisi balasan A');
  });

  // ============ S3C-16 (kontrol): supersede dalam satu percakapan tetap jalan ============
  await check('S3C-16 control: same-conversation supersede still works', async () => {
    resetView('S3C-16');
    fakeStore.seed('PRJ-S3C-A-16', 'Proyek A');
    mountAt('PRJ-S3C-A-16');
    const convA = view.convIdRef as string;
    const p1 = submitLlm('Pertanyaan pertama', { delayMs: 400, reply: 'JAWABAN-PERTAMA-16', force: true });
    await sleep(60);
    const p2 = submitLlm('Pertanyaan kedua', { delayMs: 100, reply: 'JAWABAN-KEDUA-16', force: true });
    const [res1, res2] = await Promise.all([p1, p2]);
    assert(res1.outcome === 'discarded-stale-or-cancelled', `submit pertama dibuang supersede (dapat ${(res1 as { outcome?: string }).outcome})`);
    assert(res2.outcome === 'delivered', 'submit kedua terkirim');
    const msgs = store.getConversation(convA, 'PRJ-S3C-A-16')?.messages.map((m) => m.content) ?? [];
    assert(JSON.stringify(msgs) === JSON.stringify(['Pertanyaan pertama', 'Pertanyaan kedua', 'JAWABAN-KEDUA-16']),
      `store A [user1, user2, jawaban2], dapat ${JSON.stringify(msgs)}`);
    assert(!storeHas('PRJ-S3C-A-16', 'Permintaan dibatalkan'), 'supersede tidak menulis catatan batal');
    assert(view.busy === false, 'busy kosong di akhir');
  });

  // ============ S3C-17: helper runtime F2/F3 ============
  await check('S3C-17 runtime helpers: most-recent, modal exclusion, supersede/finish filtering', async () => {
    resetView('S3C-17');
    assert(rt.getAnyActiveExecution() === null, 'awal: tidak ada eksekusi aktif');
    assert(rt.hasAnyActiveExecution() === false, 'awal: hasAny=false');
    const a = rt.beginExecution('conv-a', 'P-A');
    const b = rt.beginExecution('conv-b', 'P-B');
    assert(rt.hasAnyActiveExecution() === true, 'hasAny=true sesudah 2 begin');
    assert(rt.getAnyActiveExecution()?.requestId === b.record.requestId, 'paling baru = B (terakhir dimulai)');
    const m = rt.beginExecution('spreadsheet-modal:P-A', 'P-A');
    assert(rt.getAnyActiveExecution()?.requestId === m.record.requestId, 'tanpa pengecualian: modal paling baru terpilih');
    assert(rt.getAnyActiveExecution(NON_CHAT_PREFIXES)?.requestId === b.record.requestId, 'dengan pengecualian: modal dilewati, B terpilih');
    assert(rt.hasAnyActiveExecution(NON_CHAT_PREFIXES) === true, 'hasAny dengan pengecualian = true (chat masih hidup)');
    const b2 = rt.beginExecution('conv-b', 'P-B'); // supersede b
    assert(rt.getAnyActiveExecution(NON_CHAT_PREFIXES)?.requestId === b2.record.requestId, 'yang tersupersede tidak terpilih; penggantinya terpilih');
    rt.finishExecution(a.record.requestId, 'completed');
    rt.finishExecution(b2.record.requestId, 'completed');
    assert(rt.hasAnyActiveExecution(NON_CHAT_PREFIXES) === false, 'sesudah chat selesai: hasAny dengan pengecualian = false (modal tidak mengunci busy)');
    assert(rt.hasAnyActiveExecution() === true, 'tanpa pengecualian: modal masih dihitung');
    rt.finishExecution(m.record.requestId, 'completed');
    assert(rt.getAnyActiveExecution() === null, 'akhir: tidak ada eksekusi aktif');
    void a;
  });

  // ============ S3C-18 (W13): catatan batal tertunda pulang ke A ============
  await check('S3C-18 deferred cancel note (W13) lands in A only after switch', async () => {
    resetView('S3C-18');
    fakeStore.seed('PRJ-S3C-A-18', 'Proyek A'); fakeStore.seed('PRJ-S3C-B-18', 'Proyek B');
    mountAt('PRJ-S3C-A-18');
    const p = submitLlm('Batalkan tertunda', { delayMs: 400, reply: 'JAWABAN-A-UNIK-18' });
    await sleep(100); // sesudah minimum 10ms — pembatalan tidak menolak wait
    const stopped = stopModel();
    assert(stopped.cancelled === true, 'stop membatalkan eksekusi A');
    await sleep(50);
    switchProject('PRJ-S3C-B-18'); // pindah sebelum resolve
    const res = await p;
    assert(res.outcome === 'discarded-stale-or-cancelled' || res.outcome === 'aborted',
      `outcome=${(res as { outcome?: string }).outcome}`);
    assert(storeHas('PRJ-S3C-A-18', 'Permintaan dibatalkan'), 'catatan batal tertunda tersimpan di A');
    assert(!storeHas('PRJ-S3C-B-18', 'Permintaan dibatalkan'), 'catatan batal TIDAK di B');
    assert(!view.messages.some((m) => m.content.includes('dibatalkan')), 'UI B tanpa catatan batal');
    assert(!storeHas('PRJ-S3C-A-18', 'JAWABAN-A-UNIK-18') && !storeHas('PRJ-S3C-B-18', 'JAWABAN-A-UNIK-18'), 'balasan tidak tersimpan');
  });

  // ============ S3C-19 (W18/W19): fire-and-forget pulang ke scope panggil ============
  await check('S3C-19 fire-and-forget post (W18/W19) homes to captured scope', async () => {
    resetView('S3C-19');
    fakeStore.seed('PRJ-S3C-A-19', 'Proyek A'); fakeStore.seed('PRJ-S3C-B-19', 'Proyek B');
    mountAt('PRJ-S3C-A-19');
    const p = postAfterDelayModel('RINGKASAN-DOKUMEN-19', 300);
    await sleep(60);
    switchProject('PRJ-S3C-B-19');
    await p;
    assert(storeHas('PRJ-S3C-A-19', 'RINGKASAN-DOKUMEN-19'), 'post fire-and-forget tersimpan di A');
    assert(!storeHas('PRJ-S3C-B-19', 'RINGKASAN-DOKUMEN-19'), 'post TIDAK di B');
    assert(!view.messages.some((m) => m.content.includes('RINGKASAN-DOKUMEN-19')), 'UI B tanpa post');
    switchProject('PRJ-S3C-A-19');
    assert(view.messages.some((m) => m.content.includes('RINGKASAN-DOKUMEN-19')), 'kembali ke A: post tampil');
  });

  // ============ S3C-20: satu-tab tidak berubah ============
  await check('S3C-20 single-tab unchanged: display + persist + busy + newChat + second submit', async () => {
    resetView('S3C-20');
    fakeStore.seed('PRJ-S3C-A-20', 'Proyek A');
    mountAt('PRJ-S3C-A-20');
    const convA = view.convIdRef as string;
    const res = await submitLlm('Pertanyaan biasa', { delayMs: 100, reply: 'JAWABAN-A-UNIK-20' });
    assert(res.outcome === 'delivered', 'balasan terkirim');
    assert((res as { replyDisplayed?: boolean }).replyDisplayed === true, 'balasan ditampilkan');
    assert(view.messages.some((m) => m.content === 'JAWABAN-A-UNIK-20'), 'UI menampilkan balasan');
    assert(storeHas('PRJ-S3C-A-20', 'JAWABAN-A-UNIK-20'), 'store berisi balasan');
    assert(view.busy === false, 'busy kosong sesudah selesai');
    assert(view.activeExec === null, 'activeExec null sesudah selesai');
    const nc = newChatModel();
    assert(nc.ok === true, 'newChat diizinkan sesudah selesai');
    const res2 = await submitLlm('Pertanyaan kedua', { delayMs: 80, reply: 'JAWABAN-A2-20' });
    assert(res2.outcome === 'delivered', 'submit kedua terkirim');
    const msgs2 = store.getConversation(nc.convId, 'PRJ-S3C-A-20')?.messages.map((m) => m.role) ?? [];
    assert(JSON.stringify(msgs2) === JSON.stringify(['user', 'assistant']), `percakapan baru [user,assistant], dapat ${JSON.stringify(msgs2)}`);
    const det = await submitDeterministic('Ringkasan lokal', 'RINGKASAN-LOKAL-20', 50);
    assert(det.outcome === 'delivered' && (det as { replyDisplayed?: boolean }).replyDisplayed === true, 'cabang deterministik satu-tab tampil');
    assert(storeHas('PRJ-S3C-A-20', 'RINGKASAN-LOKAL-20'), 'balasan deterministik tersimpan');
    void convA;
  });
}

main()
  .then(() => {
    console.log(`\nchatIso3cInflight: ${passed} passed, ${failed} failed${failures.length ? ` — FAILURES: ${failures.join(', ')}` : ''}`);
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((e: unknown) => {
    console.error('chatIso3cInflight crashed:', e instanceof Error ? e.stack ?? e.message : e);
    process.exit(1);
  });
