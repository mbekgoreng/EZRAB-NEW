/**
 * NEW-01 (P2) — dead second conversation model.
 * Batch E (EZRAB FULL REPAIR).
 *
 * `EzrabAiAssistantFullView.tsx` (2,788 lines) was imported by
 * WorkspaceView but NEVER rendered; it carried its own ChatSession
 * model + localStorage key `ezrab_ai_workspace_sessions_v2`, a live
 * copy of the D-50 token leak, and a delete-with-confirm contradicting
 * D-48. It is DELETED. This suite pins the deletion and proves no
 * second conversation model remains.
 *
 * Verification evidence (2026-11-14, before deletion):
 * - sole importer: WorkspaceView.tsx:75 (import only, zero JSX usage);
 * - zero `<EzrabAiAssistantFullView` JSX usages anywhere in src (the
 *   one grep hit was the component's own `React.FC<…Props>` line);
 * - no route, no lazy/dynamic import, no other importer of its exports;
 * - its ChatSession/ChatMessage types had no other users;
 * - no other writer of its storage key.
 *
 * Deliberate exception: `src/auth/logoutAll.ts` still lists the old
 * key in its transient-cleanup list — it only REMOVES the key on
 * logout, cleaning stale data on users' browsers. That is cleanup,
 * not a second model, and its hardening tests still cover it.
 *
 * Run: npx tsx src/test/new01DeadConversationModel.test.ts
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let failures = 0;
let passes = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passes++; console.log(`✓ ${name}`); }
  catch (e: any) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const ok = (c: boolean, m: string) => { if (!c) throw new Error(m); };

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '..');
const read = (rel: string) => readFileSync(resolve(SRC, rel), 'utf8');

/** Recursively collect .ts/.tsx files under a dir (relative to SRC). */
function collectTs(dirRel: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(resolve(SRC, d))) {
      const rel = `${d}/${entry}`;
      const full = resolve(SRC, rel);
      if (statSync(full).isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(entry)) out.push(rel);
    }
  };
  walk(dirRel);
  return out;
}

test('NEW-01: EzrabAiAssistantFullView.tsx is gone', () => {
  ok(!existsSync(resolve(SRC, 'components/copilot/EzrabAiAssistantFullView.tsx')), 'file deleted');
});

test('NEW-01: WorkspaceView no longer imports or mentions it', () => {
  const ws = read('components/dashboard/WorkspaceView.tsx');
  ok(!ws.includes('EzrabAiAssistantFullView'), 'no import, no mention');
  ok(ws.includes('EzrabCoAssistantChatbox'), 'the live co-assistant panel is still imported');
});

test('NEW-01: no JSX usage of the dead view anywhere in src', () => {
  const offenders: string[] = [];
  for (const f of collectTs('.')) {
    if (f.startsWith('./test/')) continue;
    const src = read(f);
    if (src.includes('<EzrabAiAssistantFullView')) offenders.push(f);
  }
  ok(offenders.length === 0, `no JSX usage (offenders: ${offenders.join(', ') || 'none'})`);
});

test('NEW-01: no second ChatSession conversation model in the copilot surface', () => {
  const offenders: string[] = [];
  for (const f of collectTs('components/copilot')) {
    if (read(f).includes('ChatSession')) offenders.push(f);
  }
  ok(offenders.length === 0, `no ChatSession model left in components/copilot (offenders: ${offenders.join(', ') || 'none'})`);
});

test('NEW-01: the old storage key is written by nothing (logout cleanup only)', () => {
  const writers: string[] = [];
  const readers: string[] = [];
  for (const f of collectTs('.')) {
    if (f.startsWith('./test/')) continue;
    const src = read(f);
    if (!src.includes('ezrab_ai_workspace_sessions_v2')) continue;
    readers.push(f);
    if (/setItem\s*\(\s*['"]ezrab_ai_workspace_sessions_v2/.test(src)) writers.push(f);
  }
  ok(writers.length === 0, `nothing writes the old key (writers: ${writers.join(', ') || 'none'})`);
  ok(
    readers.length === 1 && readers[0] === './auth/logoutAll.ts',
    `only logoutAll references the old key (cleanup list), found: ${readers.join(', ') || 'none'}`,
  );
});

test('NEW-01: logout still cleans the legacy key (deliberate, documented)', () => {
  const logout = read('auth/logoutAll.ts');
  ok(logout.includes("'ezrab_ai_workspace_sessions_v2'"), 'key stays in the logout cleanup list for existing browsers');
});

test('NEW-01: markdown renderer docs no longer list the dead surface', () => {
  const md = read('ai-tools/ezrab-ai/markdown.tsx');
  ok(!md.includes('(view.tsx, EzrabCoAssistantChatbox, EzrabAiAssistantFullView)'), 'stale surface list updated');
  ok(md.includes('EzrabAiAssistantFullView dihapus Batch E / NEW-01'), 'deletion noted in the doc comment');
});

test('NEW-01: shellF6 no longer reads the deleted file', () => {
  const shell = read('test/shellF6.test.ts');
  ok(!shell.includes("read('components/copilot/EzrabAiAssistantFullView.tsx')"), 'shellF6 does not read the deleted file');
  ok(shell.includes('full view terhapus (NEW-01)'), 'shellF6 pins the deletion instead');
});

test('NEW-01: exactly one canonical conversation store key remains', () => {
  const store = read('services/ai/conversation/unifiedConversationStore.ts');
  ok(store.includes("const UNIFIED_CONVERSATIONS_KEY = 'ezrab_unified_conversations_v2';"), 'canonical key present in the store');
  const view = read('ai-tools/ezrab-ai/view.tsx');
  ok(view.includes('unifiedConversationStore'), 'Chat AI uses the canonical store');
  const chatbox = read('components/copilot/EzrabCoAssistantChatbox.tsx');
  ok(chatbox.includes('unifiedConversationStore'), 'Co-Assistant panel uses the canonical store');
});

console.log(failures === 0 ? `\nALL NEW-01 DEAD MODEL TESTS PASSED (${passes}/${passes + failures})` : `\n${failures} TEST(S) FAILED (${passes} passed)`);
process.exit(failures === 0 ? 0 : 1);
