/**
 * D-45 (P3) — DED mode selection doesn't persist across reload.
 * Batch E (EZRAB FULL REPAIR).
 *
 * Pins the persistence layer (pure module, storage-shimmed) and the
 * wiring (source-structural):
 * - the selected mode (EZRAB_AI / FULL_AI) is saved on card click and
 *   restored into a fresh session after reload;
 * - invalid/absent values fall back to the C2 default (EZRAB_AI);
 * - EXACTLY TWO modes remain available — the persistence work must
 *   never introduce a third mode or revive a retired label.
 *
 * Run: npx tsx src/test/d45DedModePersist.test.ts
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
  DED_AI_MODE_STORAGE_KEY,
  loadPersistedDedMode,
  savePersistedDedMode,
} from '../ai-tools/ded-ai-estimate/dedModePersistence';
import { DED_RAB_AI_MODES, DEFAULT_DED_RAB_AI_MODE } from '../ai-tools/ded-ai-estimate/dedMode';
import { DED_MODE_CARDS } from '../ai-tools/ded-ai-estimate/dedModeUi';

const reset = () => storageMap.clear();

// --- Persistence layer ------------------------------------------------------
test('D-45: fresh session defaults to EZRAB AI MODE (C2) when nothing is stored', () => {
  reset();
  ok(loadPersistedDedMode() === 'EZRAB_AI', 'absent → EZRAB_AI');
  ok(DEFAULT_DED_RAB_AI_MODE === 'EZRAB_AI', 'C2 default is EZRAB_AI');
});

test('D-45: FULL AI MODE survives a reload simulation', () => {
  reset();
  ok(savePersistedDedMode('FULL_AI') === true, 'save reports success');
  ok(loadPersistedDedMode() === 'FULL_AI', 'FULL_AI restored after reload');
  ok(savePersistedDedMode('EZRAB_AI') === true, 'switch back saves');
  ok(loadPersistedDedMode() === 'EZRAB_AI', 'EZRAB_AI restored after reload');
});

test('D-45: invalid stored values fall back to EZRAB AI (never a third mode)', () => {
  reset();
  storageMap.set(DED_AI_MODE_STORAGE_KEY, 'FULL_AI_V2');
  ok(loadPersistedDedMode() === 'EZRAB_AI', 'unknown mode → default');
  storageMap.set(DED_AI_MODE_STORAGE_KEY, 'full_ai');
  ok(loadPersistedDedMode() === 'EZRAB_AI', 'wrong case → default (strict validation)');
  storageMap.set(DED_AI_MODE_STORAGE_KEY, 'Estimasi Full AI');
  ok(loadPersistedDedMode() === 'EZRAB_AI', 'retired label → default');
  storageMap.set(DED_AI_MODE_STORAGE_KEY, '');
  ok(loadPersistedDedMode() === 'EZRAB_AI', 'empty → default');
});

// --- Exactly two modes ------------------------------------------------------
test('D-45: exactly two DED modes exist (no third mode introduced)', () => {
  ok(DED_RAB_AI_MODES.length === 2, `DED_RAB_AI_MODES has 2 entries, got ${DED_RAB_AI_MODES.length}`);
  ok(DED_RAB_AI_MODES.includes('EZRAB_AI') && DED_RAB_AI_MODES.includes('FULL_AI'), 'the two modes are EZRAB_AI + FULL_AI');
  ok(DED_MODE_CARDS.length === 2, `DED_MODE_CARDS has 2 cards, got ${DED_MODE_CARDS.length}`);
  const cardModes = DED_MODE_CARDS.map((c) => c.mode).sort();
  ok(cardModes[0] === 'EZRAB_AI' && cardModes[1] === 'FULL_AI', 'cards are exactly the two modes');
});

// --- Wiring -----------------------------------------------------------------
const parentView = read('../ai-tools/ded-ai-estimate/view.tsx');
const inputView = read('../ai-tools/ded-ai-estimate/DedAiInputView.tsx');

test('D-45: parent session initialises from the persisted mode (policy/engine derived)', () => {
  contains(parentView, 'const persistedMode = loadPersistedDedMode();', 'session init loads the persisted mode');
  contains(parentView, 'dedMode: persistedMode,', 'session carries the restored mode');
  contains(parentView, 'policy: policyForMode(persistedMode),', 'policy derived from the restored mode (C1)');
  contains(parentView, "fullAi: persistedMode === 'FULL_AI',", 'engine flag derived from the restored mode (C1)');
  notContains(parentView, 'dedMode: DEFAULT_DED_RAB_AI_MODE,', 'fresh sessions no longer hardcode the default');
});

test('D-45: mode card click persists the selection', () => {
  contains(inputView, 'const changeDedMode = (next: DedRabAiMode) => {', 'change handler exists');
  contains(inputView, 'savePersistedDedMode(next);', 'change persists');
  contains(inputView, 'onClick={() => changeDedMode(card.mode)}', 'card wired to the handler');
});

console.log(failures === 0 ? `\nALL D-45 DED MODE PERSISTENCE TESTS PASSED (${passes}/${passes + failures})` : `\n${failures} TEST(S) FAILED (${passes} passed)`);
process.exit(failures === 0 ? 0 : 1);
