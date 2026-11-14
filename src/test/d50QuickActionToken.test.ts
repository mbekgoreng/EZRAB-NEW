/**
 * D-50 (P2) — Quick Action leaks raw token + auto-sends.
 * Batch E (EZRAB FULL REPAIR).
 *
 * Pins the fix at three layers:
 * 1. Composition (pure module): a Quick Action composes ONLY the human
 *    prompt + a structured `quickActionId` — the internal token never
 *    appears in composed message text; unknown actions never compose.
 * 2. Router (MockAiProvider): the structured id drives routing without
 *    any token in the prompt; the legacy token regex survives only as
 *    a backward-compatible fallback for old callers.
 * 3. Wiring (source-structural): the chatbox click opens a confirm
 *    dialog (no auto-send); confirm sends structured; cancel sends
 *    nothing; coAssistantService strips legacy tokens before persist
 *    and forwards the id as server-side context; Chat AI strips legacy
 *    tokens from restored bubbles + derived history titles.
 *
 * Run: npx tsx src/test/d50QuickActionToken.test.ts
 */
import { existsSync, readFileSync } from 'node:fs';
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

// --- storage shim (engine/store modules may touch window at import) ---
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
  const tok = await import('../services/ai/quickActionToken');
  const engine = await import('../services/aiProviderEngine');

  // --- 1. Pure composition ---------------------------------------------
  await test('D-50: strip removes a leading token (case-insensitive)', () => {
    ok(tok.stripQuickActionToken('[QUICK_ACTION_TRIGGER:HITUNG_VOLUME] Bantu saya menghitung volume pekerjaan') === 'Bantu saya menghitung volume pekerjaan', 'token stripped');
    ok(tok.stripQuickActionToken('[quick_action_trigger:audit_rab] Bantu saya melakukan audit RAB') === 'Bantu saya melakukan audit RAB', 'lowercase token stripped');
    ok(tok.stripQuickActionToken('Bantu saya menghitung volume pekerjaan') === 'Bantu saya menghitung volume pekerjaan', 'clean text untouched');
    ok(tok.stripQuickActionToken('Teks [QUICK_ACTION_TRIGGER:HITUNG_VOLUME] di tengah') === 'Teks [QUICK_ACTION_TRIGGER:HITUNG_VOLUME] di tengah', 'only a LEADING token is stripped');
    ok(tok.stripQuickActionToken('') === '', 'empty stays empty');
  });

  await test('D-50: extract returns the action id, null when absent', () => {
    ok(tok.extractQuickActionToken('[QUICK_ACTION_TRIGGER:HITUNG_VOLUME] x') === 'HITUNG_VOLUME', 'id extracted');
    ok(tok.extractQuickActionToken('[quick_action_trigger:cari_ahsp] x') === 'CARI_AHSP', 'id upper-cased');
    ok(tok.extractQuickActionToken('Bantu saya menghitung volume') === null, 'no token → null');
  });

  await test('D-50: compose maps to a valid internal action, never a token', () => {
    const req = tok.composeQuickActionSend('HITUNG_VOLUME', 'Bantu saya menghitung volume pekerjaan');
    ok(req !== null, 'valid action composes');
    ok(req!.message === 'Bantu saya menghitung volume pekerjaan', 'message is the human prompt only');
    ok(!req!.message.includes('QUICK_ACTION_TRIGGER'), 'no token in composed message');
    ok(req!.quickActionId === 'HITUNG_VOLUME', 'structured id carried out-of-band');
    ok(req!.contract.label === 'Hitung Volume', 'contract resolved');
  });

  await test('D-50: compose strips a legacy token from the prompt', () => {
    const req = tok.composeQuickActionSend('AUDIT_RAB', '[QUICK_ACTION_TRIGGER:AUDIT_RAB] Bantu saya melakukan audit RAB');
    ok(req !== null, 'legacy prompt still composes');
    ok(req!.message === 'Bantu saya melakukan audit RAB', 'token stripped from composed message');
  });

  await test('D-50: compose refuses unknown actions and empty prompts', () => {
    ok(tok.composeQuickActionSend('TIDAK_ADA', 'Bantu saya menghitung volume') === null, 'unknown action → null (never sent)');
    ok(tok.composeQuickActionSend('', 'Bantu saya menghitung volume') === null, 'empty action → null');
    ok(tok.composeQuickActionSend('HITUNG_VOLUME', '   ') === null, 'empty prompt → null');
    ok(tok.composeQuickActionSend('HITUNG_VOLUME', '[QUICK_ACTION_TRIGGER:HITUNG_VOLUME]   ') === null, 'token-only prompt → null');
    ok(tok.resolveQuickActionContract('hitung_volume')?.actionId === 'HITUNG_VOLUME', 'contract lookup is case-insensitive');
    ok(tok.resolveQuickActionContract('TIDAK_ADA') === null, 'unknown contract → null');
  });

  await test('D-50: server context line carries the id without token brackets', () => {
    const contract = tok.resolveQuickActionContract('HITUNG_VOLUME')!;
    const line = tok.quickActionContextLine(contract);
    ok(line.includes('HITUNG_VOLUME'), 'id present');
    ok(line.includes('Hitung Volume'), 'label present');
    ok(!line.includes('[QUICK_ACTION_TRIGGER'), 'no token syntax in the context line');
  });

  // --- 2. Router ---------------------------------------------------------
  const ctx = { project: null, rabItems: [] } as unknown as Parameters<typeof engine.defaultAiProvider.chat>[1];

  await test('D-50: router receives the action id via structured field (no token in prompt)', async () => {
    const res = await engine.defaultAiProvider.chat(
      'Bantu saya menghitung volume pekerjaan', ctx, undefined, { quickActionId: 'HITUNG_VOLUME' },
    );
    ok(res.quickActionResponse?.actionId === 'HITUNG_VOLUME', 'dialogue opened for the structured id');
    ok(res.intent === 'VOLUME_CALCULATION', 'contract intent applied');
  });

  await test('D-50: structured id routes even when the prompt text would not match', async () => {
    const res = await engine.defaultAiProvider.chat(
      'tolong volume dong', ctx, undefined, { quickActionId: 'HITUNG_VOLUME' },
    );
    ok(res.quickActionResponse?.actionId === 'HITUNG_VOLUME', 'structured id drives routing, not text matching');
  });

  await test('D-50: structured id is case-insensitive', async () => {
    const res = await engine.defaultAiProvider.chat(
      'tolong audit', ctx, undefined, { quickActionId: 'audit_rab' },
    );
    ok(res.quickActionResponse?.actionId === 'AUDIT_RAB', 'lowercase structured id resolves');
  });

  await test('D-50: legacy token still routes (backward compat for old callers)', async () => {
    const res = await engine.defaultAiProvider.chat(
      '[QUICK_ACTION_TRIGGER:AUDIT_RAB] Bantu saya melakukan audit RAB', ctx,
    );
    ok(res.quickActionResponse?.actionId === 'AUDIT_RAB', 'legacy token fallback intact');
  });

  await test('D-50: unknown structured id never fabricates a dialogue', async () => {
    const res = await engine.defaultAiProvider.chat(
      'xyzzy tidak ada aksi', ctx, undefined, { quickActionId: 'TIDAK_ADA' },
    );
    ok(!res.quickActionResponse || res.quickActionResponse.actionId !== 'TIDAK_ADA', 'no dialogue for an unknown id');
  });

  // --- 3. Wiring: chatbox -------------------------------------------------
  const chatbox = read('../components/copilot/EzrabCoAssistantChatbox.tsx');

  await test('D-50: click opens a confirm dialog, never auto-sends', () => {
    notContains(chatbox, '[QUICK_ACTION_TRIGGER:', 'no token literal anywhere in the chatbox');
    contains(chatbox, 'const [pendingQuickAction, setPendingQuickAction]', 'pending-confirm state exists');
    const hStart = chatbox.indexOf('const handleQuickActionClick');
    ok(hStart > -1, 'click handler exists');
    const hBody = chatbox.slice(hStart, chatbox.indexOf('const handleConfirmQuickAction', hStart));
    contains(hBody, 'composeQuickActionSend(actionId, initialPrompt)', 'click composes via the validated path');
    contains(hBody, 'setPendingQuickAction({ ...composed, title })', 'click opens the dialog');
    notContains(hBody, 'coAssistantService.sendMessage', 'click must NOT call sendMessage');
    notContains(hBody, 'setMessages((prev) => [...prev, userMsg])', 'click must NOT add a user bubble before confirmation');
  });

  await test('D-50: dialog shows action + project context + credit note', () => {
    contains(chatbox, '{pendingQuickAction && (', 'dialog renders on pending state');
    contains(chatbox, 'aria-label="Konfirmasi tindakan cepat"', 'dialog labelled');
    contains(chatbox, '{pendingQuickAction.contract.label}', 'dialog shows the action label');
    contains(chatbox, '{pendingQuickAction.contract.description}', 'dialog shows the action description');
    contains(chatbox, "{currentProject?.name ?? 'Tanpa proyek aktif'}", 'dialog shows the project context');
    contains(chatbox, 'Permintaan ini dikirim ke AI dan dapat memakai kredit AI.', 'dialog names the credit cost');
  });

  await test('D-50: confirm sends structured (human prompt + quickActionId); cancel sends nothing', () => {
    const cStart = chatbox.indexOf('const handleConfirmQuickAction');
    ok(cStart > -1, 'confirm handler exists');
    const cBody = chatbox.slice(cStart, chatbox.indexOf('const handleQuickActionAnswer', cStart));
    contains(cBody, 'message: pending.message,', 'confirm sends the human prompt');
    contains(cBody, 'quickActionId: pending.quickActionId,', 'confirm sends the structured id');
    notContains(cBody, 'QUICK_ACTION_TRIGGER', 'confirm never builds a token');
    const dStart = chatbox.indexOf('{pendingQuickAction && (');
    const dialog = chatbox.slice(dStart, chatbox.indexOf('<style>', dStart));
    contains(dialog, 'onClick={() => setPendingQuickAction(null)}', 'cancel only closes the dialog');
    const cancelIdx = dialog.indexOf('setPendingQuickAction(null)}');
    const cancelWindow = dialog.slice(Math.max(0, cancelIdx - 200), cancelIdx);
    notContains(cancelWindow, 'sendMessage', 'cancel path must not call the send service');
    notContains(cancelWindow, 'handleConfirmQuickAction', 'cancel path must not confirm');
    contains(dialog, 'onClick={() => void handleConfirmQuickAction()}', 'Kirim button wired to confirm');
  });

  // --- 3. Wiring: coAssistantService --------------------------------------
  const service = read('../services/coAssistantService.ts');

  await test('D-50: service carries quickActionId and strips tokens before persist', () => {
    contains(service, 'quickActionId?: string;', 'structured field on the request');
    contains(service, 'const cleanMessage = stripQuickActionToken(trimmedMessage);', 'token stripped at the top of runSendMessage');
    contains(service, 'content: cleanMessage,', 'persisted message is the clean prompt');
    contains(service, 'quickActionContextLine(quickActionContract)', 'id forwarded as server-side context');
    notContains(service, '[QUICK_ACTION_TRIGGER:${', 'no token composition in the service');
    notContains(service, 'content: trimmedMessage,', 'raw message never persisted');
  });

  // --- 3. Wiring: Chat AI defence in depth --------------------------------
  const view = read('../ai-tools/ezrab-ai/view.tsx');

  await test('D-50: Chat AI strips legacy tokens from titles and restored bubbles', () => {
    contains(view, 'stripQuickActionToken(firstUser.content).slice(0, 60)', 'history-title fallback strips the token');
    const stripCount = view.split('stripQuickActionToken(m.content)').length - 1;
    ok(stripCount >= 3, `restore mappings strip the token (mount/load/reload), found ${stripCount}`);
    contains(view, 'stripQuickActionToken(lastStored.content)', 'interrupted-prompt derivation strips the token');
  });

  await test('D-50: dead twin is gone (no second leak path)', () => {
    ok(!existsSync(fileURLToPath(new URL('../components/copilot/EzrabAiAssistantFullView.tsx', import.meta.url))), 'EzrabAiAssistantFullView.tsx deleted (NEW-01)');
  });

  console.log(failures === 0 ? `\nALL D-50 QUICK ACTION TESTS PASSED (${passes}/${passes + failures})` : `\n${failures} TEST(S) FAILED (${passes} passed)`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
