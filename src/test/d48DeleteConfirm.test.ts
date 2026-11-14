/**
 * D-48 (P2) — conversation delete has no confirmation.
 * Batch E (EZRAB FULL REPAIR).
 *
 * Pins the fix (same in-app dialog pattern as Batch A's D-68/D-84 —
 * no window.confirm):
 * - the history trash button opens a confirm dialog (pending state),
 *   never deletes directly;
 * - confirm deletes exactly the pending conversation (mutation
 *   unchanged) and closes; cancel closes without deleting;
 * - the dialog names the conversation + message count, warns the
 *   delete is permanent (memories go with it), and states that other
 *   conversations are untouched;
 * - store-level: deleting one conversation preserves unrelated
 *   conversations and their messages.
 *
 * Run: npx tsx src/test/d48DeleteConfirm.test.ts
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
const notContains = (src: string, needle: string, m: string) => {
  if (src.includes(needle)) throw new Error(`${m}: must NOT contain ${JSON.stringify(needle)}`);
};
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// --- storage shim ---
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

async function main(): Promise<void> {
  const view = read('../ai-tools/ezrab-ai/view.tsx');

  await test('D-48: trash button opens a confirm dialog (pending state), never deletes directly', () => {
    contains(view, 'const [pendingDeleteConv, setPendingDeleteConv] = useState<HistoryItem | null>(null);', 'pending-delete state');
    const btnIdx = view.indexOf('onClick={() => setPendingDeleteConv(h)}');
    ok(btnIdx > -1, 'trash button opens the dialog');
    const btnWindow = view.slice(Math.max(0, btnIdx - 300), btnIdx);
    contains(btnWindow, 'className="ezhist-del"', 'button is the history-row trash button');
    notContains(btnWindow, 'deleteHistoryItem(', 'trash button must not delete directly (dialog first)');
    contains(view.slice(btnIdx, btnIdx + 200), 'disabled={busy}', 'trash disabled while busy (mutation guard is honest)');
  });

  await test('D-48: dialog names the conversation, the count, and the permanent impact', () => {
    contains(view, '{pendingDeleteConv && (', 'dialog renders on pending state');
    contains(view, 'aria-label="Konfirmasi hapus percakapan"', 'dialog labelled');
    contains(view, '<h3>Hapus percakapan ini?</h3>', 'dialog asks the question');
    contains(view, '{pendingDeleteConv.title}', 'dialog names the conversation');
    contains(view, '({pendingDeleteConv.messageCount} pesan)', 'dialog names the message count');
    contains(view, 'beserta memori yang dipelajari dari percakapan ini', 'dialog warns memories are deleted too');
    contains(view, 'tidak dapat dibatalkan', 'dialog states the delete is permanent');
    contains(view, 'Percakapan lain tidak berubah', 'dialog states unrelated conversations are untouched');
  });

  await test('D-48: dialog confirm deletes exactly the pending conversation', () => {
    const dStart = view.indexOf('{pendingDeleteConv && (');
    ok(dStart > -1, 'dialog exists');
    const dialog = view.slice(dStart, view.indexOf('Panel Tentang/version', dStart));
    contains(dialog, 'const id = pendingDeleteConv.id; setPendingDeleteConv(null); deleteHistoryItem(id);', 'confirm deletes the pending id and closes');
    ok(/>\s*Hapus\s*</.test(dialog), 'confirm button labelled Hapus');
  });

  await test('D-48: dialog cancel closes WITHOUT deleting (conversation preserved)', () => {
    const dStart = view.indexOf('{pendingDeleteConv && (');
    const dialog = view.slice(dStart, view.indexOf('Panel Tentang/version', dStart));
    contains(dialog, 'onClick={() => setPendingDeleteConv(null)}>Batal</button>', 'cancel only closes the dialog');
    const cancelIdx = dialog.indexOf('setPendingDeleteConv(null)}>Batal');
    const cancelWindow = dialog.slice(Math.max(0, cancelIdx - 150), cancelIdx);
    notContains(cancelWindow, 'deleteHistoryItem', 'cancel path must not call the mutation');
  });

  await test('D-48: delete mutation itself is unchanged (store delete + release)', () => {
    const hStart = view.indexOf('const deleteHistoryItem = (id: string) => {');
    ok(hStart > -1, 'deleteHistoryItem exists');
    const hBody = view.slice(hStart, view.indexOf('const submit = async', hStart));
    contains(hBody, 'unifiedConversationStore.deleteConversation(id, storeProjectId);', 'mutation still deletes via the canonical store');
    contains(hBody, 'releaseConversation(id);', 'mutation still releases the execution record');
    contains(hBody, 'if (wasActive) newChat();', 'deleting the active conversation opens a fresh one');
    contains(hBody, 'else refreshHistory();', 'deleting another conversation refreshes the list');
  });

  await test('D-48: memory delete button is untouched (separate concern)', () => {
    // The second ezhist-del (memory panel) still deletes memories
    // directly — D-48 is about CONVERSATIONS only; do not conflate.
    contains(view, 'title="Hapus memori"', 'memory delete button still present');
    contains(view, 'deleteMemory(m.memoryId,', 'memory delete path unchanged');
  });

  // --- Store-level: delete preserves unrelated conversations ---------------
  const storeMod = await import('../services/ai/conversation/unifiedConversationStore');
  const { UnifiedConversationStore } = storeMod;

  await test('D-48: store delete removes one conversation, preserves the others', () => {
    UnifiedConversationStore.resetInstance();
    storageMap.clear();
    const store = UnifiedConversationStore.getInstance();
    const a = store.createConversation('proj-1', 'Percakapan A');
    const b = store.createConversation('proj-1', 'Percakapan B');
    const c = store.createConversation('proj-1', 'Percakapan C');
    store.appendMessage(a.id, 'proj-1', { role: 'user', content: 'pesan A' });
    store.appendMessage(b.id, 'proj-1', { role: 'user', content: 'pesan B' });
    store.appendMessage(c.id, 'proj-1', { role: 'user', content: 'pesan C' });
    ok(store.deleteConversation(b.id, 'proj-1') === true, 'delete reports success');
    const remaining = store.listConversations('proj-1');
    ok(remaining.length === 2, 'two conversations remain');
    ok(remaining.some((x: { id: string }) => x.id === a.id), 'A preserved');
    ok(remaining.some((x: { id: string }) => x.id === c.id), 'C preserved');
    ok(!remaining.some((x: { id: string }) => x.id === b.id), 'B gone');
    const keptA = store.getConversation(a.id, 'proj-1');
    ok(keptA?.messages.length === 1 && keptA.messages[0].content === 'pesan A', "A's messages intact");
    ok(store.deleteConversation('tidak-ada', 'proj-1') === false, 'deleting a missing id reports false (no crash)');
  });

  await test('D-48: deleting the active conversation clears the active pointer', () => {
    UnifiedConversationStore.resetInstance();
    storageMap.clear();
    const store = UnifiedConversationStore.getInstance();
    const a = store.createConversation('proj-1', 'Percakapan A');
    store.setActiveConversationId('proj-1', a.id);
    ok(store.getActiveConversationId('proj-1') === a.id, 'active pointer set');
    store.deleteConversation(a.id, 'proj-1');
    ok(store.getActiveConversationId('proj-1') === null, 'active pointer cleared after delete');
  });

  console.log(failures === 0 ? `\nALL D-48 DELETE CONFIRM TESTS PASSED (${passes}/${passes + failures})` : `\n${failures} TEST(S) FAILED (${passes} passed)`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
