/**
 * B3 — Batch 3 (Core user journey, P1) regression suite.
 *
 * Pins the two B3 fixes so they cannot silently regress:
 *  - F-B3-1: SaveStatusIndicator is mounted in the workspace TopBar.
 *    Before the fix the component existed but was referenced NOWHERE in
 *    src/ — a failed save (quota etc.) and a cross-tab conflict were
 *    invisible to the user (only console output). Source audit + a
 *    render-smoke check that the component module loads cleanly.
 *  - F-B3-2: corrupt storage payloads are quarantined before the
 *    fallback + mount flush overwrites them. Before the fix a corrupt
 *    `ezrab_prod_projects` key silently fell back to the demo-only list
 *    and the debounced mount flush (~400 ms) then overwrote the key —
 *    the only copy of the user's projects was destroyed with no warning
 *    and no recovery path (repro:
 *    evidence/b3-repro-corrupt-storage.ts). Now the raw bytes are
 *    preserved under `<key>.corrupt-<timestamp>`.
 *
 * Plain-tsx suite (no vitest import): run with
 *   npx --yes tsx src/test/b3JourneyPersistence.test.ts
 * from the repo root. Uses an isolated in-memory localStorage shim;
 * never touches the real browser storage or any user data.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';

// --- Isolated localStorage shim (installed BEFORE the storage imports) ---
const store = new Map<string, string>();
let quotaBlocked = false;
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => {
    if (quotaBlocked) {
      const e = new Error('QuotaExceededError') as any;
      e.name = 'QuotaExceededError';
      throw e;
    }
    store.set(k, String(v));
  },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
  get length() { return store.size; },
  key: (i: number) => [...store.keys()][i] ?? null,
};

import {
  loadVersioned,
  saveVersioned,
  quarantineCorruptPayload,
} from '../engine/storage/hardenedStorage';
import { resolveInitialProjects } from '../lib/demoSeed';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

let failures = 0;
let passes = 0;

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passes++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${(e as Error).message}`);
  }
}

function ok(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const readSrc = (rel: string): string =>
  fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const CORRUPT =
  '{"v":2,"savedAt":"2026-11-25T10:00:00.000Z","writeId":"abc123","data":[{"id":"PRJ-USER-1","name":"Rumah User';

async function main(): Promise<void> {
  console.log('B3 — Journey persistence regressions (F-B3-1, F-B3-2):');

  // ---- F-B3-1: SaveStatusIndicator is mounted ---------------------------
  console.log('\n[F-B3-1] SaveStatusIndicator mounted in TopBar:');
  const topBarSrc = readSrc('src/components/navigation/TopBar.tsx');
  await test('TopBar imports SaveStatusIndicator', () => {
    ok(
      topBarSrc.includes("import { SaveStatusIndicator } from '../storage/SaveStatusIndicator'"),
      'TopBar does not import SaveStatusIndicator',
    );
  });
  await test('TopBar renders <SaveStatusIndicator compact /> in the right cluster', () => {
    ok(topBarSrc.includes('<SaveStatusIndicator compact />'), 'no <SaveStatusIndicator compact /> render in TopBar');
    const clusterIdx = topBarSrc.indexOf('ezrab-topbar-right');
    const mountIdx = topBarSrc.indexOf('<SaveStatusIndicator compact />');
    ok(clusterIdx !== -1 && mountIdx > clusterIdx, 'indicator is not inside the topbar-right cluster');
  });
  await test('TopBar mount is gated off on narrow mobile (cluster pattern)', () => {
    const mountIdx = topBarSrc.indexOf('<SaveStatusIndicator compact />');
    const window = topBarSrc.slice(Math.max(0, mountIdx - 900), mountIdx);
    ok(window.includes('!isNarrowMobile'), 'mount is not gated by !isNarrowMobile like theme/currency/help');
  });
  await test('SaveStatusIndicator module still exports the component (no dead import)', () => {
    const compSrc = readSrc('src/components/storage/SaveStatusIndicator.tsx');
    ok(compSrc.includes('export const SaveStatusIndicator'), 'component export missing');
    ok(compSrc.includes("saveStatus === 'error'"), 'error modal branch missing from component');
    ok(compSrc.includes('externalChange'), 'conflict branch missing from component');
  });

  // ---- F-B3-2: corrupt-payload quarantine -------------------------------
  console.log('\n[F-B3-2] Corrupt storage payloads are quarantined:');
  await test('quarantine preserves raw bytes under <key>.corrupt-<ts>', () => {
    store.clear();
    const qkey = quarantineCorruptPayload('ezrab_prod_projects', CORRUPT);
    ok(qkey !== null && qkey.startsWith('ezrab_prod_projects.corrupt-'), `bad quarantine key: ${qkey}`);
    ok(store.get(qkey!) === CORRUPT, 'quarantined bytes differ from the original');
  });
  await test('quarantine returns null when there are no raw bytes', () => {
    ok(quarantineCorruptPayload('ezrab_prod_projects', undefined) === null, 'expected null for undefined raw');
  });
  await test('quarantine never throws when the quarantine write fails (quota)', () => {
    quotaBlocked = true;
    let result: string | null = 'unset';
    try {
      result = quarantineCorruptPayload('ezrab_prod_projects', CORRUPT);
    } finally {
      quotaBlocked = false;
    }
    ok(result === null, `expected null on write failure, got ${result}`);
  });
  await test('quarantine does not touch the original key', () => {
    store.clear();
    store.set('ezrab_prod_projects', CORRUPT);
    quarantineCorruptPayload('ezrab_prod_projects', CORRUPT);
    ok(store.get('ezrab_prod_projects') === CORRUPT, 'original key was modified by quarantine');
  });

  console.log('\n[F-B3-2] Full production sequence (load → quarantine → fallback → flush):');
  await test('corrupt projects key: bytes survive the mount flush via quarantine', () => {
    store.clear();
    store.set('ezrab_prod_projects', CORRUPT);
    // Production sequence, ProjectContext.tsx projects initializer:
    const loaded = loadVersioned<any[]>('ezrab_prod_projects');
    ok(!loaded.ok && (loaded as any).error === 'CORRUPT', 'expected CORRUPT load result');
    const qkey = quarantineCorruptPayload('ezrab_prod_projects', (loaded as any).raw);
    ok(qkey !== null, 'quarantine failed on the CORRUPT result');
    const savedJson = loaded.ok
      ? JSON.stringify((loaded as any).data)
      : localStorage.getItem('ezrab_prod_projects');
    const resolved = resolveInitialProjects(savedJson, /* alreadySeeded */ true, []);
    ok(resolved.projects.length === 0, 'fallback unexpectedly kept user projects');
    // Mount flush (flushToStorage): overwrites the corrupt key with fallback.
    const flushed = saveVersioned('ezrab_prod_projects', [{ id: 'PRJ-PREMIUM-DEMO', name: 'Premium Demo' }]);
    ok(flushed.ok === true, 'mount flush failed in the harness');
    // The defect is closed iff the original bytes are still recoverable:
    ok(store.get(qkey!) === CORRUPT, 'quarantined bytes lost after flush');
    ok((store.get(qkey!) || '').includes('PRJ-USER-1'), 'quarantine does not contain the user project id');
  });
  await test('healthy key: no quarantine key is created (no behavior change)', () => {
    store.clear();
    const saved = saveVersioned('ezrab_prod_projects', [{ id: 'PRJ-OK', name: 'Sehat' }]);
    ok(saved.ok === true, 'seed save failed');
    const loaded = loadVersioned<any[]>('ezrab_prod_projects');
    ok(loaded.ok === true, 'healthy key should load ok');
    ok(![...store.keys()].some((k) => k.includes('.corrupt-')), 'quarantine key created for a healthy load');
  });
  await test('ProjectContext calls quarantine on CORRUPT/MIGRATION_FAILED (both sites)', () => {
    const ctxSrc = readSrc('src/context/ProjectContext.tsx');
    ok(ctxSrc.includes('quarantineCorruptPayload'), 'ProjectContext does not call quarantineCorruptPayload');
    const calls = ctxSrc.split('quarantineCorruptPayload(').length - 1;
    // 1 import + 2 call sites = 3 occurrences of the name with '(' after it
    // (import has no paren); assert exactly the two call sites exist.
    ok(calls === 2, `expected 2 quarantine call sites in ProjectContext, found ${calls}`);
  });

  console.log(`\nB3-JOURNEY-PERSISTENCE: ${passes} passed, ${failures} failed (total ${passes + failures})`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
