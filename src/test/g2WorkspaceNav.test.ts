/**
 * Batch G2 — navigasi workspace & label (D-15, D-18, D-21, D-22,
 * D-32, D-36).
 *
 * D-15 (P3): H1 terpotong di bawah sticky bar — tidak ada reset
 *   scroll saat navigasi (kontainer scroll adalah .pf-main, bukan
 *   window). Perbaikan: resetMainScroll di setActiveMenu + efek
 *   sinkronisasi route (hanya saat menu berubah).
 * D-18 (P3): opsi wilayah ganda di combobox (hardcoded + daftar 38).
 * D-21 (P3): semua tab resources berbagi H1 "Material & Harga".
 * D-22 (P3): label sidebar "Tutorial" vs "Tutorial EZRAB".
 * D-32 (P3): keluar via menu akun mengakhiri sesi, via sidebar
 *   tidak — diseragamkan ke logoutAll (OD-01(a)).
 * D-36 (P2): widget "Progres Kamu" menutupi tombol "Lihat Semua".
 *
 * Sebagian besar tes ini source-level (komponen React tidak bisa
 * diimpor tsx karena aset/CSS) — dinyatakan jujur sebagai
 * source-level; yang bisa diuji lewat data (daftar provinsi)
 * diuji lewat data. Perilaku DOM sesungguhnya (scroll ter-reset,
 * widget tidak menutupi) butuh browser — verifikasi fase regresi
 * browser (OD-13).
 *
 * Jalankan: npx tsx src/test/g2WorkspaceNav.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
// tsx menjalankan berkas ini sebagai ESM: __dirname tidak tersedia.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..');

import { INDONESIA_38_PROVINCES } from '../domain/material/nationalRegionDatabase';

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
function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

console.log('g2WorkspaceNav (D-15, D-18, D-21, D-22, D-32, D-36):');

// --- D-15 ------------------------------------------------------------------
test('D-15: WorkspaceView me-reset scroll kontainer utama saat navigasi', () => {
  const src = readSrc('components/dashboard/WorkspaceView.tsx');
  assert(src.includes('mainScrollRef'), 'mainScrollRef missing');
  assert(src.includes('resetMainScroll'), 'resetMainScroll missing');
  assert(src.includes('mainScrollRef.current?.scrollTo({ top: 0 })'), 'scroll reset to top missing');
  assert(src.includes('prevRouteMenuRef'), 'route-change guard missing');
  assert(
    src.includes('prevRouteMenuRef.current !== route.menu'),
    'reset must only fire when route.menu changes (not on every recalc)',
  );
});

// --- D-18 ------------------------------------------------------------------
test('D-18: daftar provinsi kanonis = 38 nama unik, tanpa "Indonesia"', () => {
  assertEq(INDONESIA_38_PROVINCES.length, 38, 'province count');
  const names = INDONESIA_38_PROVINCES.map((p) => p.name);
  assertEq(new Set(names).size, 38, 'province names must be unique');
  assert(!names.includes('Indonesia'), '"Indonesia" must not be in the province list');
  assert(names.includes('Jawa Barat'), 'sanity: Jawa Barat present');
});
test('D-18: combobox wilayah memakai SATU sumber (tanpa opsi hardcoded ganda)', () => {
  const src = readSrc('components/materials/MaterialDatabaseView.tsx');
  assertEq(
    countOccurrences(src, '<option value="Indonesia">Indonesia</option>'),
    2,
    '"Indonesia" option must appear exactly twice (filter + form select)',
  );
  assert(
    !src.includes('<option value="Jawa Barat">'),
    'hardcoded province options must be gone',
  );
  assertEq(
    countOccurrences(src, 'INDONESIA_38_PROVINCES.map((p) => ('),
    2,
    'both selects must render from the single 38-list',
  );
});

// --- D-21 ------------------------------------------------------------------
test('D-21: peta judul per tab lengkap & berbeda-beda', () => {
  const src = readSrc('components/materials/MaterialDatabaseView.tsx');
  // 8 anggota tipe (6 dengan tab UI + REGIONS/QUALITY_COVERAGE yang
  // saat ini dormant — map wajib total agar lookup tidak undefined).
  const expected: Record<string, string> = {
    MATERIALS: 'Material & Harga',
    LABOR: 'Upah',
    EQUIPMENT: 'Peralatan',
    PROJECT_PRICE: 'Harga Proyek',
    BRANDS: 'Merek',
    SUPPLIERS: 'Pemasok',
    REGIONS: 'Wilayah',
    QUALITY_COVERAGE: 'Cakupan Kualitas',
  };
  for (const [tab, title] of Object.entries(expected)) {
    assert(src.includes(`${tab}: '${title}'`), `tab ${tab} must map to '${title}'`);
  }
  const titles = Object.values(expected);
  assertEq(new Set(titles).size, titles.length, 'tab titles must be distinct');
});
test('D-21: H1 + breadcrumb memakai judul tab AKTIF (bukan hardcoded)', () => {
  const src = readSrc('components/materials/MaterialDatabaseView.tsx');
  assert(
    countOccurrences(src, 'MATERIAL_DATABASE_TAB_TITLES[activeCategoryTab]') >= 2,
    'H1 and breadcrumb leaf must derive from the active tab title',
  );
});

// --- D-22 ------------------------------------------------------------------
test('D-22: tooltip + label sidebar memakai SATU kunci (tutorial_ezrab)', () => {
  const src = readSrc('components/layout/Sidebar.tsx');
  assert(
    countOccurrences(src, "t('nav.tutorial_ezrab')") >= 3,
    'aria-label + tooltip + visible label must all use nav.tutorial_ezrab',
  );
  assertEq(
    countOccurrences(src, "t('nav.tutorial')"),
    0,
    'the short nav.tutorial key must not be used in the sidebar anymore',
  );
});

// --- D-32 ------------------------------------------------------------------
test('D-32: sidebar keluar memakai logoutAll yang sama dengan menu akun (OD-01(a))', () => {
  const ws = readSrc('components/dashboard/WorkspaceView.tsx');
  assert(ws.includes('const handleExitWorkspace = useCallback'), 'handleExitWorkspace missing');
  assert(ws.includes('await logoutAll({'), 'sidebar exit must call logoutAll');
  assert(ws.includes('onExitWorkspace={handleExitWorkspace}'), 'handler must be passed to Sidebar');
  const sb = readSrc('components/layout/Sidebar.tsx');
  assert(sb.includes('onExitWorkspace?: () => void'), 'Sidebar prop missing');
  assert(sb.includes('if (onExitWorkspace) onExitWorkspace();'), 'exit button must prefer onExitWorkspace');
  const top = readSrc('components/navigation/TopBar.tsx');
  assert(top.includes('logoutAll'), 'TopBar must still use logoutAll (the uniform path)');
});

// --- D-36 ------------------------------------------------------------------
test('D-36: checklist mulai MINIMIZED bila tanpa preferensi tersimpan', () => {
  const src = readSrc('components/onboarding/FirstProjectChecklist.tsx');
  const idx = src.indexOf('const [minimized, setMinimized] = useState(() => {');
  assert(idx >= 0, 'minimized initializer missing');
  const block = src.slice(idx, idx + 800);
  assert(block.includes("stored === '1'"), 'stored preference must still win');
  assert(block.includes('return true;'), 'default without stored preference must be minimized');
});
test('D-36: seksi terakhir dashboard punya clearance 96px (di atas pill 44px)', () => {
  for (const f of [
    'components/dashboard/EzrabAiDashboardView.tsx',
    'components/dashboard/EzrabAiDashboardViewClassic.tsx',
  ]) {
    const src = readSrc(f);
    assert(src.includes("paddingBottom: '96px'"), `${f}: 96px clearance missing`);
  }
});

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
