/**
 * D-46 (P3) — composer draft lost on in-app navigation.
 * D-47 (P3) — chat Mode AI selection doesn't persist across reload.
 * Batch E (EZRAB FULL REPAIR).
 *
 * Pins the persistence layer (pure module, storage-shimmed) and the
 * view wiring (source-structural — this sandbox has no React renderer):
 * - D-46: draft saved per conversation, restored on mount / conversation
 *   switch, cleared on send; never leaks across conversations/projects.
 * - D-47: mode saved on change, restored on mount; invalid values fall
 *   back to 'fast' (Cepat).
 * - Reload simulation = fresh reads from the same storage (module
 *   functions are stateless; a browser reload re-runs the same loads).
 *
 * Run: npx tsx src/test/d46d47ChatPersistence.test.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let failures = 0;
let passes = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passes++; console.log(`✓ ${name}`); }
  catch (e: any) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const ok = (c: boolean, m: string) => { if (!c) throw new Error(m); };
const contains = (src: string, needle: string, m: string) => {
  if (!src.includes(needle)) throw new Error(`${m}: missing ${JSON.stringify(needle)}`);
};
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// --- storage shim (must exist before any persistence call) ---
const storageMap = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => (storageMap.has(k) ? (storageMap.get(k) as string) : null),
  setItem: (k: string, v: string) => { storageMap.set(k, String(v)); },
  removeItem: (k: string) => { storageMap.delete(k); },
  clear: () => storageMap.clear(),
  key: (i: number) => Array.from(storageMap.keys())[i] ?? null,
  get length() { return storageMap.size; },
};
(globalThis as Record<string, unknown>).window = globalThis;

import {
  CHAT_AI_MODE_KEY,
  CHAT_DRAFT_KEY_PREFIX,
  EZRAB_CHAT_AI_VERSION,
  chatDraftKey,
  clearChatDraft,
  loadChatAiMode,
  loadChatDraft,
  saveChatAiMode,
  saveChatDraft,
} from '../ai-tools/ezrab-ai/chatUiPersistence';

const reset = () => storageMap.clear();

// --- D-47: mode ------------------------------------------------------------
test('D-47: mode defaults to fast when nothing is stored', () => {
  reset();
  ok(loadChatAiMode() === 'fast', 'absent → fast');
});

test('D-47: mode survives a reload simulation (Mendalam stays Mendalam)', () => {
  reset();
  ok(saveChatAiMode('advanced') === true, 'save reports success');
  // "Reload" = fresh read from the same storage.
  ok(loadChatAiMode() === 'advanced', 'advanced restored after reload');
  ok(saveChatAiMode('fast') === true, 'switch back saves');
  ok(loadChatAiMode() === 'fast', 'fast restored after reload');
});

test('D-47: invalid stored mode falls back to fast (never crashes, never invents)', () => {
  reset();
  storageMap.set(CHAT_AI_MODE_KEY, 'mendalam');
  ok(loadChatAiMode() === 'fast', 'unknown string → fast');
  storageMap.set(CHAT_AI_MODE_KEY, 'ADVANCED');
  ok(loadChatAiMode() === 'fast', 'wrong case → fast (strict validation)');
  storageMap.set(CHAT_AI_MODE_KEY, '');
  ok(loadChatAiMode() === 'fast', 'empty → fast');
});

// --- D-46: draft ------------------------------------------------------------
test('D-46: draft survives a reload/navigation simulation', () => {
  reset();
  ok(saveChatDraft('conv-1', 'proj-1', 'buatkan RAB rumah 120 m2') === true, 'save reports success');
  ok(loadChatDraft('conv-1', 'proj-1') === 'buatkan RAB rumah 120 m2', 'draft restored from storage');
  // "Remount" = fresh read from the same storage.
  ok(loadChatDraft('conv-1', 'proj-1') === 'buatkan RAB rumah 120 m2', 'draft still there on second read');
});

test('D-46: drafts are isolated per conversation (no cross-talk)', () => {
  reset();
  saveChatDraft('conv-A', 'proj-1', 'draft A');
  saveChatDraft('conv-B', 'proj-1', 'draft B');
  ok(loadChatDraft('conv-A', 'proj-1') === 'draft A', 'A keeps its draft');
  ok(loadChatDraft('conv-B', 'proj-1') === 'draft B', 'B keeps its draft');
  ok(loadChatDraft('conv-C', 'proj-1') === '', 'conversation without a draft → empty');
  ok(chatDraftKey('conv-A') === `${CHAT_DRAFT_KEY_PREFIX}conv-A`, 'key namespaced per conversation');
});

test('D-46: draft never restores into a different project scope', () => {
  reset();
  saveChatDraft('conv-1', 'proj-1', 'draft proyek 1');
  ok(loadChatDraft('conv-1', 'proj-2') === '', 'project mismatch → empty (no leak)');
  ok(loadChatDraft('conv-1', 'proj-1') === 'draft proyek 1', 'owning project still restores');
});

test('D-46: empty draft clears the key; clear removes it (send path)', () => {
  reset();
  saveChatDraft('conv-1', 'proj-1', 'sementara');
  ok(saveChatDraft('conv-1', 'proj-1', '') === true, 'empty save clears');
  ok(loadChatDraft('conv-1', 'proj-1') === '', 'cleared draft → empty');
  ok(!storageMap.has(chatDraftKey('conv-1')), 'key removed, not an empty record');
  saveChatDraft('conv-1', 'proj-1', 'lagi');
  ok(clearChatDraft('conv-1') === true, 'clear reports success');
  ok(loadChatDraft('conv-1', 'proj-1') === '', 'cleared draft → empty');
});

test('D-46: malformed draft records fail safe (empty, no throw)', () => {
  reset();
  storageMap.set(chatDraftKey('conv-1'), 'bukan-json{');
  ok(loadChatDraft('conv-1', 'proj-1') === '', 'malformed JSON → empty');
  storageMap.set(chatDraftKey('conv-1'), JSON.stringify({ text: 123 }));
  ok(loadChatDraft('conv-1', 'proj-1') === '', 'non-string text → empty');
  storageMap.set(chatDraftKey('conv-1'), JSON.stringify({ text: 'ok' }));
  ok(loadChatDraft('conv-1', 'proj-1') === 'ok', 'record without projectId still restores (legacy tolerance)');
  ok(loadChatDraft('', 'proj-1') === '', 'missing conversation id → empty');
  ok(saveChatDraft('', 'proj-1', 'x') === false, 'missing conversation id → save refused');
});

test('D-49: version constant is the locked header label', () => {
  ok(EZRAB_CHAT_AI_VERSION === '01.00', 'version is 01.00 (header must show V 01.00)');
});

// --- Wiring: view.tsx -------------------------------------------------------
const view = read('../ai-tools/ezrab-ai/view.tsx');

test('D-47: view restores the mode at mount and persists on change', () => {
  contains(view, "useState<'fast' | 'advanced'>(() => loadChatAiMode())", 'lazy init from the loader');
  contains(view, 'const changeChatMode = (next: \'fast\' | \'advanced\') => {', 'change handler exists');
  contains(view, 'saveChatAiMode(next);', 'change persists');
  contains(view, 'onChange={(e) => changeChatMode(e.target.value as \'fast\' | \'advanced\')}', 'select wired to the handler');
});

test('D-46: view saves the draft while typing and restores it per conversation', () => {
  contains(view, 'saveDraftSoon(e.target.value);', 'textarea onChange schedules a draft save');
  contains(view, 'loadChatDraft(activeConvId, storeProjectId)', 'restore effect reads the active conversation draft');
  contains(view, 'if (draft && !inputRef.current) setInput(draft);', 'restore never clobbers existing input');
  contains(view, 'saveChatDraft(convIdRef.current, storeProjectIdRef.current, inputRef.current)', 'unmount flush saves the last keystrokes');
  contains(view, 'saveDraftSoon(injectedPrompt.text);', 'injected prefill is also saved as a draft');
});

test('D-46: view clears the draft on send, not on retry', () => {
  contains(view, 'if (echo) clearDraftNow();', 'echo send clears the draft');
  const sStart = view.indexOf('const submit = async');
  ok(sStart > -1, 'submit exists');
  const sBody = view.slice(sStart, view.indexOf('setBusy(true);', sStart));
  contains(sBody, 'if (echo) setInput(\'\');', 'echo send clears the input');
  contains(sBody, 'if (echo) clearDraftNow();', 'echo send clears the stored draft');
});

console.log(failures === 0 ? `\nALL D-46/D-47 CHAT PERSISTENCE TESTS PASSED (${passes}/${passes + failures})` : `\n${failures} TEST(S) FAILED (${passes} passed)`);
process.exit(failures === 0 ? 0 : 1);
