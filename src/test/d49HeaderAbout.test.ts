/**
 * D-49 (P3) — header button "Ezrab Chat AI v 01.00" is a no-op.
 * Batch E (EZRAB FULL REPAIR) — OD-18 option (a): About/version panel.
 *
 * Pins the fix (source-structural — this sandbox has no React renderer):
 * - the header title is a real <button> (focusable, labelled) that opens
 *   an About panel — no static no-op div remains;
 * - the panel shows the actual version (single source of truth, the
 *   locked 'V 01.00' label), the live AI mode, the active project, and
 *   the stored-conversation count — no invented numbers;
 * - the panel closes via veil click, Tutup button, and Escape;
 * - the button keeps the exact gradient-text look (CSS reset only
 *   removes native button chrome; focus stays visible).
 *
 * Run: npx tsx src/test/d49HeaderAbout.test.ts
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
const notContains = (src: string, needle: string, m: string) => {
  if (src.includes(needle)) throw new Error(`${m}: must NOT contain ${JSON.stringify(needle)}`);
};
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

import { EZRAB_CHAT_AI_VERSION } from '../ai-tools/ezrab-ai/chatUiPersistence';

const view = read('../ai-tools/ezrab-ai/view.tsx');
const css = read('../ai-tools/ezrab-ai/ezrab-ai-chat.css');

test('D-49: header title is a real button with an action (no static no-op div)', () => {
  notContains(view, '<div className="ezchat2-name">', 'static no-op div is gone');
  contains(view, 'className="ezchat2-name ezchat2-namebtn"', 'title is a button with the name styling');
  contains(view, 'onClick={() => setAboutOpen(true)}', 'button opens the About panel');
  contains(view, 'aria-label="Tentang Ezrab Chat AI"', 'button is labelled for assistive tech');
  contains(view, 'title="Tentang Ezrab Chat AI"', 'button has a hover tooltip');
});

test('D-49: header still shows the locked version label from one source', () => {
  ok(EZRAB_CHAT_AI_VERSION === '01.00', 'version constant is 01.00');
  contains(view, '<span className="ezchat2-ver">V {EZRAB_CHAT_AI_VERSION}</span>', 'header renders V 01.00 from the constant');
});

test('D-49: About panel shows real version + mode + project info', () => {
  contains(view, '{aboutOpen && (', 'panel renders on state');
  contains(view, 'aria-label="Tentang Ezrab Chat AI"', 'panel is a labelled dialog');
  contains(view, '<div className="row"><span>Versi</span><strong>V {EZRAB_CHAT_AI_VERSION}</strong></div>', 'panel shows the version');
  contains(view, "<div className=\"row\"><span>Mode AI</span><strong>{mode === 'fast' ? 'Cepat' : 'Mendalam'}</strong></div>", 'panel shows the live mode');
  contains(view, "<div className=\"row\"><span>Proyek aktif</span><strong>{effProject?.name ?? 'Tanpa proyek aktif'}</strong></div>", 'panel shows the active project (honest empty state)');
  contains(view, '<div className="row"><span>Percakapan tersimpan</span><strong>{historyItems.length} percakapan</strong></div>', 'panel shows the real stored-conversation count');
  contains(view, 'Percakapan tersimpan lokal di perangkat ini.', 'panel states the local-only storage honestly');
});

test('D-49: About panel closes via Tutup, veil, and Escape', () => {
  const pStart = view.indexOf('{aboutOpen && (');
  ok(pStart > -1, 'panel exists');
  const panel = view.slice(pStart, view.indexOf('{creditTopUpOpen &&', pStart));
  contains(panel, 'onClick={() => setAboutOpen(false)}', 'veil click closes the panel');
  contains(panel, '>Tutup</button>', 'Tutup button present');
  contains(view, "if (e.key === 'Escape') setAboutOpen(false);", 'Escape closes the panel');
});

test('D-49: header button keeps the gradient look and a visible focus state', () => {
  contains(css, 'button.ezchat2-name {', 'button reset rule exists');
  contains(css, 'cursor: pointer;', 'button shows a pointer cursor');
  contains(css, 'button.ezchat2-name:focus-visible {', 'focus-visible rule exists');
  contains(css, 'outline: 2px solid var(--ez-color-primary);', 'keyboard focus is visible');
});

console.log(failures === 0 ? `\nALL D-49 HEADER ABOUT TESTS PASSED (${passes}/${passes + failures})` : `\n${failures} TEST(S) FAILED (${passes} passed)`);
process.exit(failures === 0 ? 0 : 1);
