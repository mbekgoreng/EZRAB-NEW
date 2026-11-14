/**
 * D-16 (Batch G2, P2) — navigasi tur terpandu rusak: langkah 4
 * melompat ke 6 (target langkah 5 tersembunyi di submenu RAB yang
 * tertutup → auto-skip), tombol "Kembali" macet di 6/8.
 * D-86 (Batch G2, P3) — tutorial AHSP dari Settings terbuka di
 * langkah 2/5 di dashboard (langkah 1 tersembunyi di submenu
 * Database yang tertutup → auto-skip; langkah 2–5 salah rute ke
 * dashboard).
 *
 * Perbaikan: (a) langkah tur menyatakan submenu yang menampung
 * targetnya (`expandSubmenu`) — Spotlight & FeatureTutorialPlayer
 * membuka submenu itu lewat event sebelum menyorot; (b) skip
 * mengikuti ARAH navigasi (mundur → langkah sebelumnya; di langkah
 * 0 tampil kartu fallback, bukan lompat maju); (c) tutorial AHSP
 * dirombak: semua langkah di halaman AHSP dengan anchor nyata.
 *
 * Tes ini mengunci registry + kabel event + struktur skip searah.
 * Perilaku DOM sesungguhnya (submenu terbuka, spotlight berpindah)
 * butuh browser — dicatat sebagai verifikasi fase regresi browser
 * (OD-13), bukan diklaim di sini.
 *
 * Jalankan: npx tsx src/test/g2TourNavigation.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
// tsx menjalankan berkas ini sebagai ESM: __dirname tidak tersedia.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..');

import { getTutorial } from '../components/onboarding/tutorials/tutorialRegistry';
import { paths } from '../routing/routes';
import {
  EXPAND_SIDEBAR_SUBMENU_EVENT,
  expandSidebarSubmenu,
} from '../components/onboarding/sidebarSubmenuEvents';

let failures = 0;
let passes = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passes++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${(e as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}
function assertEq(actual: unknown, expected: unknown, msg: string): void {
  if (actual !== expected) {
    throw new Error(`${msg} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}
function readSrc(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), 'utf8');
}

console.log('g2TourNavigation (D-16, D-86):');

// --- Event bersama ---------------------------------------------------------
test('nama event expand submenu stabil', () => {
  assertEq(EXPAND_SIDEBAR_SUBMENU_EVENT, 'ezrab:expand-sidebar-submenu', 'event name');
});
test('expandSidebarSubmenu mendispatch CustomEvent dengan detail submenu', () => {
  const seen: Array<{ type: string; detail: unknown }> = [];
  const g = globalThis as unknown as { window?: unknown };
  const prevWindow = g.window;
  g.window = {
    dispatchEvent: (e: { type: string; detail: unknown }) => {
      seen.push({ type: e.type, detail: e.detail });
      return true;
    },
  };
  try {
    expandSidebarSubmenu('database');
    expandSidebarSubmenu('rab');
  } finally {
    if (prevWindow === undefined) delete g.window;
    else g.window = prevWindow;
  }
  assertEq(seen.length, 2, 'two events dispatched');
  assertEq(seen[0].type, EXPAND_SIDEBAR_SUBMENU_EVENT, 'event type');
  assertEq(seen[0].detail, 'database', 'first detail');
  assertEq(seen[1].detail, 'rab', 'second detail');
});
test('expandSidebarSubmenu aman tanpa window (lingkungan non-DOM)', () => {
  const g = globalThis as unknown as { window?: unknown };
  const prevWindow = g.window;
  if (prevWindow !== undefined) delete g.window;
  try {
    expandSidebarSubmenu('rab'); // tidak boleh throw
  } finally {
    if (prevWindow !== undefined) g.window = prevWindow;
  }
});

// --- Registry tutorial AHSP (D-86) -----------------------------------------
test('tutorial ahsp-2026: 5 langkah, semua di route AHSP', () => {
  const tut = getTutorial('ahsp-2026');
  assert(tut, 'tutorial ahsp-2026 must exist');
  assertEq(tut.steps.length, 5, 'step count');
  assertEq(tut.version, 3, 'version bumped after rewrite');
  const ahspRoute = paths.ahsp();
  tut.steps.forEach((s, i) => {
    assertEq(s.route, ahspRoute, `step ${i + 1} must route to AHSP page`);
  });
});
test('tutorial ahsp-2026 langkah 1: target menu + expand submenu database', () => {
  const tut = getTutorial('ahsp-2026');
  assert(tut, 'tutorial ahsp-2026 must exist');
  const s1 = tut.steps[0];
  assertEq(s1.target, '[data-tour="menu-ahsp-2026"]', 'step 1 target');
  assertEq(s1.expandSubmenu, 'database', 'step 1 must expand database submenu');
});
test('tutorial ahsp-2026 langkah 2–5: anchor nyata halaman AHSP (bukan dashboard)', () => {
  const tut = getTutorial('ahsp-2026');
  assert(tut, 'tutorial ahsp-2026 must exist');
  const expected = [
    '[data-tutorial="ahsp-search"]',
    '[data-tutorial="ahsp-domain"]',
    '[data-tutorial="ahsp-card"]',
    '[data-tutorial="ahsp-price"]',
  ];
  expected.forEach((target, k) => {
    assertEq(tut.steps[k + 1].target, target, `step ${k + 2} target`);
  });
  const dashboardRoute = paths.dashboard();
  assert(
    !tut.steps.some((s) => s.route === dashboardRoute),
    'no AHSP tutorial step may route to the dashboard (the D-86 mis-route)',
  );
  assert(
    !tut.steps.some((s) => s.target === '[data-tour="dashboard"]'),
    'no AHSP tutorial step may target the generic dashboard area',
  );
});
test('anchor tutorial AHSP ada di AhspExplorerView', () => {
  const src = readSrc('components/ahsp/AhspExplorerView.tsx');
  // search & domain: atribut statis; card & price: kondisional
  // (hanya kartu pertama — cardIndex === 0).
  for (const anchor of ['ahsp-search', 'ahsp-domain']) {
    assert(src.includes(`data-tutorial="${anchor}"`), `anchor ${anchor} missing in AhspExplorerView`);
  }
  for (const anchor of ['ahsp-card', 'ahsp-price']) {
    assert(
      src.includes(`cardIndex === 0 ? '${anchor}' : undefined`),
      `anchor ${anchor} missing (must be on first card only) in AhspExplorerView`,
    );
  }
});

// --- DashboardTour langkah 5 (D-16) ----------------------------------------
test('DashboardTour langkah 5 menyatakan expandSubmenu rab', () => {
  const src = readSrc('components/onboarding/DashboardTour.tsx');
  const idx = src.indexOf('[data-tour="menu-rab-spreadsheet"]');
  assert(idx >= 0, 'step 5 target missing');
  const block = src.slice(idx, idx + 300);
  assert(block.includes("expandSubmenu: 'rab'"), 'step 5 must declare expandSubmenu rab');
});
test('DashboardTour membangun langkah lewat buildSteps(t) yang dimemo (identitas stabil)', () => {
  const src = readSrc('components/onboarding/DashboardTour.tsx');
  assert(src.includes('buildSteps'), 'buildSteps missing');
  assert(src.includes('useMemo'), 'steps must be memoized (Spotlight re-resolves on identity change)');
});

// --- Spotlight: skip searah + expand + gate controlled mode -----------------
test('Spotlight: skip mengikuti arah (navDirectionRef) + fallback di langkah 0', () => {
  const src = readSrc('components/onboarding/Spotlight.tsx');
  assert(src.includes('navDirectionRef'), 'navDirectionRef missing');
  assert(src.includes('if (dir < 0)'), 'backward skip branch missing');
  assert(src.includes('expandSidebarSubmenu'), 'submenu expand call missing');
  assert(src.includes('expandTriedRef'), 'once-per-step expand guard missing');
});
test('Spotlight: gate autoSkipMissing untuk controlled mode (parent menangani skip)', () => {
  const src = readSrc('components/onboarding/Spotlight.tsx');
  assert(src.includes('autoSkipMissing'), 'autoSkipMissing prop missing');
  assert(src.includes('autoSkipMissing = true'), 'default must stay true (DashboardTour behavior unchanged)');
  assert(src.includes('if (!autoSkipMissing)'), 'gate in skipMissing missing');
});

// --- FeatureTutorialPlayer --------------------------------------------------
test('Player: goToStep expand submenu + skip searah via stepIndexRef', () => {
  const src = readSrc('components/onboarding/tutorials/FeatureTutorialPlayer.tsx');
  assert(src.includes('stepIndexRef'), 'stepIndexRef missing');
  assert(src.includes('expandSidebarSubmenu(step.expandSubmenu)'), 'player must expand submenu before waiting');
  assert(src.includes('direction < 0'), 'backward skip branch missing');
  assert(src.includes('attempt(i - 1)'), 'backward attempt missing');
  assert(src.includes('autoSkipMissing={false}'), 'player must disable Spotlight auto-skip');
  assert(src.includes('expandSubmenu: s.expandSubmenu'), 'expandSubmenu must pass through to Spotlight steps');
});

// --- Sidebar: listener + anchor fallback ------------------------------------
test('Sidebar mendengarkan event expand + menyediakan anchor menu induk', () => {
  const src = readSrc('components/layout/Sidebar.tsx');
  assert(src.includes('EXPAND_SIDEBAR_SUBMENU_EVENT'), 'Sidebar must listen for expand event');
  assert(src.includes('data-tour="menu-rab"'), 'RAB parent anchor missing');
  assert(src.includes('data-tour="menu-database"'), 'Database parent anchor missing');
});

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
