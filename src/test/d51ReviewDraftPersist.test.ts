/**
 * D-51 (P2) — "Review draft" message not persisted.
 * NEW-02 (P2) — persistMessage silently swallows all errors.
 * Batch E (EZRAB FULL REPAIR).
 *
 * D-51 STATUS: NOT REPRODUCED in HEAD code. The persist wiring
 * (openReviewPanel → appendLocalAssistant → persistMessage →
 * unifiedConversationStore.appendMessage → localStorage) is present
 * and correct. This suite proves the STORE-LEVEL contract the wiring
 * depends on — the injection persists, survives a remount, and the
 * history count becomes 1 — and proves the NEW-02 instrumentation
 * that makes a live failure observable. The live repro on Preview
 * (discriminating the three hypotheses: silent persist failure /
 * scope confusion / "Baru" sequence artifact) is still pending and
 * must use this instrumentation; D-51 stays NOT REPRODUCED until
 * that live attempt runs.
 *
 * NEW-02 pins both failure channels:
 * (a) thrown errors (e.g. ProjectIsolationError from a stale convId)
 *     → structured console warning + user-facing banner text;
 * (b) storage-write failures (quota) which never throw → the store's
 *     getLastSaveResult() exposes them to persistMessage, which
 *     surfaces them the same way.
 *
 * Run: npx tsx src/test/d51ReviewDraftPersist.test.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let failures = 0;
let passes = 0;
const test = (name: string, fn: () => void | Promise<void>) => {
  return Promise.resolve()
    .then(fn)
    .then(() => { passes++; console.log(`✓ ${name}`); })
    .catch((e: any) => { failures++; console.error(`✗ ${name}: ${e.message}`); });
};
const ok = (c: boolean, m: string) => { if (!c) throw new Error(m); };
const contains = (src: string, needle: string, m: string) => {
  if (!src.includes(needle)) throw new Error(`${m}: missing ${JSON.stringify(needle)}`);
};
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// --- storage shim with failure injection (repo precedent: chatPhase5Persistence) ---
const storageMap = new Map<string, string>();
let failNextSet: Error | null = null;
const storage = {
  getItem: (k: string) => (storageMap.has(k) ? (storageMap.get(k) as string) : null),
  setItem: (k: string, v: string) => {
    if (failNextSet) {
      const e = failNextSet;
      failNextSet = null;
      throw e;
    }
    storageMap.set(k, String(v));
  },
  removeItem: (k: string) => { storageMap.delete(k); },
  clear: () => storageMap.clear(),
  key: (i: number) => Array.from(storageMap.keys())[i] ?? null,
  get length() { return storageMap.size; },
};
(globalThis as Record<string, unknown>).localStorage = storage;
(globalThis as Record<string, unknown>).window = globalThis;

const REVIEW_TEXT = 'Belum ada draft RAB aktif untuk ditinjau — susun draft dulu lewat chat (mis. "buatkan RAB rumah 120 m²"), lalu buka Review draft.';

async function main(): Promise<void> {
  const storeMod = await import('../services/ai/conversation/unifiedConversationStore');
  const diag = await import('../ai-tools/ezrab-ai/persistDiagnostics');
  const { UnifiedConversationStore } = storeMod;

  const freshStore = () => {
    UnifiedConversationStore.resetInstance();
    storageMap.clear();
    failNextSet = null;
    return UnifiedConversationStore.getInstance();
  };

  // --- D-51: the injection persists through the store ----------------------
  await test('D-51: review-draft injection persists — history count becomes 1', () => {
    const store = freshStore();
    // Exact sequence of openReviewPanel (no draft) → appendLocalAssistant
    // → persistMessage('assistant', …) → store.appendMessage.
    const conv = store.getOrCreateActiveConversation('proj-1');
    const stored = store.appendMessage(conv.id, 'proj-1', { role: 'assistant', content: REVIEW_TEXT });
    ok(stored?.id, 'append returns a stored message id');
    const list = store.listConversations('proj-1');
    ok(list.length === 1, 'one conversation in scope');
    ok((list[0].messages ?? []).length === 1, 'history reports 1 pesan (not 0)');
    ok(list[0].messages[0].content === REVIEW_TEXT, 'stored content is the review text verbatim');
    ok(list[0].messages[0].role === 'assistant', 'stored as an assistant message');
  });

  await test('D-51: injected message survives unmount/remount (storage round-trip)', () => {
    const store = freshStore();
    const conv = store.getOrCreateActiveConversation('proj-1');
    store.appendMessage(conv.id, 'proj-1', { role: 'assistant', content: REVIEW_TEXT });
    // "Remount" = drop the in-memory singleton, reload from the same storage.
    UnifiedConversationStore.resetInstance();
    const reloaded = UnifiedConversationStore.getInstance();
    const list = reloaded.listConversations('proj-1');
    ok(list.length === 1, 'conversation reloaded from storage');
    ok((list[0].messages ?? []).length === 1, 'message count still 1 after remount');
    ok(list[0].messages[0].content === REVIEW_TEXT, 'message content intact after remount');
  });

  await test('D-51: global vs project scope are separate lists by design (hypothesis b)', () => {
    const store = freshStore();
    const globalConv = store.getOrCreateActiveConversation('__ezrab_ai_global__');
    store.appendMessage(globalConv.id, '__ezrab_ai_global__', { role: 'assistant', content: REVIEW_TEXT });
    ok(store.listConversations('__ezrab_ai_global__')[0].messages.length === 1, 'global scope has the injection');
    ok(store.listConversations('proj-1').length === 0, 'project scope does not see the global injection (separate lists — a live repro must check the scope it injected into)');
  });

  // --- NEW-02: failure channel (a) — thrown errors -------------------------
  await test('NEW-02: stale-conversation append throws ProjectIsolationError (hypothesis a mechanism)', () => {
    const store = freshStore();
    const convA = store.createConversation('proj-A', 'Percakapan A');
    let thrown: unknown = null;
    try {
      // A stale convIdRef (conversation of project A) used with project B.
      store.appendMessage(convA.id, 'proj-B', { role: 'assistant', content: REVIEW_TEXT });
    } catch (e) {
      thrown = e;
    }
    ok(thrown !== null, 'isolation violation throws (it must never fail silently)');
    ok(String((thrown as Error).message).includes('PROJECT_ISOLATION_ERROR'), 'error names the isolation breach');
    ok(diag.describePersistError(thrown) === 'isolation', 'diagnostics classifies it as isolation');
  });

  await test('NEW-02: thrown failure is logged structurally and returns user-facing text', () => {
    const warned: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => { warned.push(args.map(String).join(' ')); };
    try {
      const err = new Error('PROJECT_ISOLATION_ERROR: Cannot access conversation conv-x belonging to project proj-A from project context proj-B');
      (err as { name: string }).name = 'ProjectIsolationError';
      const msg = diag.reportPersistFailure(err, {
        role: 'assistant', conversationId: 'conv-x', projectId: 'proj-B', operation: 'appendMessage',
      });
      ok(msg.includes('tidak tersimpan'), 'user text says the message was NOT saved');
      ok(msg.includes('proyek lain'), 'user text names the isolation cause');
      ok(warned.some((w) => w.includes('[ezrab-ai] persistMessage gagal')), 'structured warning logged');
      ok(warned.some((w) => w.includes('"kind":"isolation"')), 'warning carries the failure kind');
      ok(warned.some((w) => w.includes('"operation":"appendMessage"')), 'warning carries the operation');
    } finally {
      console.warn = origWarn;
    }
  });

  // --- NEW-02: failure channel (b) — storage-write failures ----------------
  await test('NEW-02: quota failure is exposed via getLastSaveResult (never silently ok)', () => {
    const store = freshStore();
    const conv = store.getOrCreateActiveConversation('proj-1');
    ok(store.getLastSaveResult()?.ok === true, 'baseline save succeeds');
    const quota = new Error('QuotaExceededError: storage full');
    quota.name = 'QuotaExceededError';
    failNextSet = quota;
    const stored = store.appendMessage(conv.id, 'proj-1', { role: 'assistant', content: REVIEW_TEXT });
    ok(stored?.id, 'in-memory append still succeeds (message visible in-session)');
    const last = store.getLastSaveResult();
    ok(last !== null && last.ok === false, 'last save result reports failure');
    ok(last?.reason === 'QUOTA_EXCEEDED', 'failure reason is QUOTA_EXCEEDED');
    ok(typeof last?.message === 'string' && last.message.length > 0, 'user-facing message present');
    // Self-healing: the next successful save clears the failure.
    store.appendMessage(conv.id, 'proj-1', { role: 'user', content: 'lanjut' });
    ok(store.getLastSaveResult()?.ok === true, 'next successful save reports ok again');
  });

  await test('NEW-02: save failure is logged and returns the storage message', () => {
    const warned: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => { warned.push(args.map(String).join(' ')); };
    try {
      const msg = diag.reportPersistSaveFailure(
        { reason: 'QUOTA_EXCEEDED', message: 'Penyimpanan browser penuh. Data tidak tersimpan.' },
        { role: 'user', conversationId: 'conv-1', projectId: 'proj-1', operation: 'appendMessage' },
      );
      ok(msg === 'Penyimpanan browser penuh. Data tidak tersimpan.', 'storage layer message reused verbatim');
      ok(warned.some((w) => w.includes('"channel":"save"')), 'warning names the save channel');
      ok(warned.some((w) => w.includes('"kind":"quota"')), 'warning carries the quota kind');
    } finally {
      console.warn = origWarn;
    }
  });

  // --- Wiring: view.tsx ------------------------------------------------------
  const view = read('../ai-tools/ezrab-ai/view.tsx');

  await test('D-51: review-draft wiring is present (openReviewPanel → persistMessage)', () => {
    contains(view, "appendLocalAssistant('Belum ada draft RAB aktif untuk ditinjau", 'no-draft review posts the assistant message');
    contains(view, "persistMessage('assistant', content);", 'appendLocalAssistant persists the message');
    contains(view, 'unifiedConversationStore.appendMessage(convId, storeProjectId, {', 'persistMessage writes to the canonical store');
  });

  await test('NEW-02: persistMessage surfaces failures (log + banner state), never silent null', () => {
    const pStart = view.indexOf('const persistMessage = ');
    ok(pStart > -1, 'persistMessage exists');
    const pBody = view.slice(pStart, view.indexOf('/* ---- Persistensi draft tahan-refresh', pStart));
    contains(pBody, 'getLastSaveResult()', 'persist checks the last save result (storage channel)');
    contains(pBody, 'reportPersistSaveFailure(', 'save failure reported');
    contains(pBody, 'reportPersistFailure(err,', 'thrown failure reported');
    contains(pBody, 'setPersistError(', 'failure state set for the UI');
    contains(view, '{persistError && (', 'persist-error banner renders on failure state');
    contains(view, 'role="alert"', 'banner is an alert landmark');
    contains(view, 'onClick={() => { setPersistError(null); reloadChat(); }}', 'banner offers Muat Ulang recovery');
  });

  console.log(failures === 0 ? `\nALL D-51/NEW-02 PERSIST TESTS PASSED (${passes}/${passes + failures})` : `\n${failures} TEST(S) FAILED (${passes} passed)`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
