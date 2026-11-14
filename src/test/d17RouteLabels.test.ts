/**
 * D-17 (Batch G1, P3) — Judul tab "EZRAB — EZRAB" karena routeLabel
 * tidak punya label untuk 'rab-informasi-proyek' dan 'harga-proyek'.
 *
 * Batch ini juga menemukan instans KETIGA yang luput dari audit:
 * 'desain-rab' adalah menu live (routeForMenu + WorkspaceView
 * ChatToRabWorkspace) tanpa label — ikut diperbaiki di sini, kelas
 * defek yang sama.
 *
 * Tes ini mengunci SEMUA menu yang bisa dikembalikan
 * parseWorkspaceRoute dengan status 'ok' — bukan hanya dua yang
 * dilaporkan audit — agar menu baru tanpa label langsung ketahuan.
 * 'enterprise' dikecualikan: status-nya 'not-found', dan App.tsx
 * memakai judul 'Halaman Tidak Ditemukan' untuk itu (routeLabel
 * tidak pernah dipakai).
 *
 * Jalankan: npx tsx src/test/d17RouteLabels.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
// tsx menjalankan berkas ini sebagai ESM: __dirname tidak tersedia.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import {
  parseWorkspaceRoute,
  routeForMenu,
  routeLabel,
  type WorkspaceRoute,
} from '../routing/routes';

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
function ok(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}
function eq(actual: unknown, expected: unknown, msg: string): void {
  if (actual !== expected) {
    throw new Error(`${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const labelFor = (menu: string) =>
  routeLabel({ scope: 'project', menu, status: 'ok' } as WorkspaceRoute);

console.log('D-17 — Setiap menu punya label judul tab:');

console.log('\n[1] Dua label yang dilaporkan audit:');
test("'rab-informasi-proyek' → 'Informasi Proyek'", () => {
  eq(labelFor('rab-informasi-proyek'), 'Informasi Proyek', 'label');
});
test("'harga-proyek' → 'Harga Proyek'", () => {
  eq(labelFor('harga-proyek'), 'Harga Proyek', 'label');
});

console.log('\n[2] Rute persis dari laporan audit:');
test('/app/estimate?tab=informasi-proyek → judul "Informasi Proyek — EZRAB"', () => {
  const route = parseWorkspaceRoute('/app/estimate?tab=informasi-proyek');
  eq(route.menu, 'rab-informasi-proyek', 'menu ter-parse');
  eq(routeLabel(route), 'Informasi Proyek', 'label');
  ok(`${routeLabel(route)} — EZRAB` !== 'EZRAB — EZRAB', 'judul masih EZRAB — EZRAB');
});
test('/app/resources?type=project-price → judul "Harga Proyek — EZRAB"', () => {
  const route = parseWorkspaceRoute('/app/resources?type=project-price');
  eq(route.menu, 'harga-proyek', 'menu ter-parse');
  eq(routeLabel(route), 'Harga Proyek', 'label');
});
test('/app/projects/:id/resources?type=project-price → sama', () => {
  const route = parseWorkspaceRoute('/app/projects/p1/resources?type=project-price');
  eq(route.menu, 'harga-proyek', 'menu ter-parse');
  eq(routeLabel(route), 'Harga Proyek', 'label');
});

console.log('\n[3] Instans ketiga (luput dari audit):');
test("'desain-rab' → 'Desain RAB'", () => {
  eq(labelFor('desain-rab'), 'Desain RAB', 'label');
});
test('/app/desain-rab ter-parse ok dan berlabel', () => {
  const route = parseWorkspaceRoute('/app/desain-rab');
  eq(route.status, 'ok', 'status');
  eq(route.menu, 'desain-rab', 'menu');
  eq(routeLabel(route), 'Desain RAB', 'label');
});

console.log('\n[4] SEMUA menu hasil parse status-ok punya label non-default:');
// Kumpulkan semua menu yang bisa dikembalikan parseWorkspaceRoute
// dengan status 'ok': dari routeForMenu (semua kasusnya) + daftar
// path yang di-parse langsung.
test('setiap menu routeForMenu (round-trip parse) berlabel', () => {
  const menus = [
    'dashboard', 'proyek', 'rab-estimasi', 'rab-informasi-proyek',
    'rab-spreadsheet', 'rab-rekapitulasi', 'rab-analisa-harga',
    'rab-kurva-s', 'rab-catatan', 'rab-pengaturan', 'daftar-pekerjaan',
    'ezrab-ai', 'desain-rab', 'ded-ai', 'dokumen-ai', 'kredit-ai',
    'magic-ai', 'ai-assistant', 'qto-vc', 'template-rab', 'ahsp-2026',
    'database-material', 'database-upah', 'database-alat',
    'harga-proyek', 'suppliers', 'qto', 'manajemen-proyek', 'jadwal',
    'kurva-s', 'laporan', 'boq', 'rekapitulasi', 'dokumen-tender',
    'keuangan-proyek', 'subscription', 'pengaturan', 'blog-admin',
  ];
  const unlabeled: string[] = [];
  for (const menu of menus) {
    const url = routeForMenu(menu);
    const parsed = parseWorkspaceRoute(url);
    if (parsed.status !== 'ok') {
      unlabeled.push(`${menu} (parse ${url} → ${parsed.status})`);
      continue;
    }
    if (routeLabel(parsed) === 'EZRAB') unlabeled.push(`${menu} (menu ${parsed.menu})`);
  }
  ok(unlabeled.length === 0, `menu tanpa label: ${unlabeled.join(', ')}`);
});
test('fallback "EZRAB" hanya untuk menu yang benar-benar tak dikenal', () => {
  eq(labelFor('menu-yang-tidak-ada'), 'EZRAB', 'fallback harus tetap ada');
});

console.log('\n[5] routeLabel dipakai App.tsx untuk judul tab:');
test('App.tsx memakai routeLabel(route) — EZRAB', () => {
  const appSrc = fs.readFileSync(path.join(__dirname, '../App.tsx'), 'utf8');
  ok(
    appSrc.includes('`${routeLabel(workspaceRoute)} — EZRAB`'),
    'App.tsx tidak lagi memakai routeLabel untuk judul'
  );
});

console.log(`\nd17RouteLabels.test: ${passes} PASS, ${failures} FAIL`);
process.exit(failures ? 1 : 0);
