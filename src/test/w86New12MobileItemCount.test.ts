/**
 * NEW-12 (observasi browser regression 2026-11-14, §5) — kartu
 * ringkasan dashboard mobile menampilkan "0 ITEM RAB" sementara
 * header RAB/QTO mobile menampilkan "214 item terhitung" (213 pada
 * profil pristine) untuk proyek yang sama.
 *
 * Akar penyebab (cacat nyata, bukan artefak profil): MobileHomeV3
 * menjumlah `(p as unknown as { totalItems?: number }).totalItems`
 * — tetapi `totalItems` HANYA ada di `ProjectVersion`
 * (types/index.ts), tidak pernah di `Project`, dan tidak ada jalur
 * yang menuliskannya ke objek proyek → selalu undefined → 0 untuk
 * SEMUA profil. Field kanonis jumlah item proyek adalah
 * `itemsCount` (cache turunan: dipelihara ProjectContext saat item
 * berubah, direkonsiliasi `reconcileProjectSummaries`, seed demo
 * 213) — selaras dengan stat "Total Nilai" yang mempercayai cache
 * turunan `totalRab`.
 *
 * Perbaikan: MobileHomeV3 menjumlah `p.itemsCount`. Tes ini
 * mengunci field yang benar + konsistensi seed (itemsCount demo ==
 * jumlah item RAB demo == angka yang ditampilkan spreadsheet).
 *
 * Jalankan: npx tsx src/test/w86New12MobileItemCount.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
// tsx menjalankan berkas ini sebagai ESM: __dirname tidak tersedia.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..');

import {
  PREMIUM_DEMO_PROJECT,
  PREMIUM_DEMO_RAB_ITEMS,
} from '../data/premiumDemoData';

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

console.log('w86New12MobileItemCount (NEW-12):');

test('MobileHomeV3 menjumlah p.itemsCount (bukan totalItems)', () => {
  const src = readSrc('components/mobile/MobileV3.tsx');
  assert(
    src.includes('acc + (p.itemsCount || 0)'),
    'MobileHomeV3 must sum p.itemsCount across projects',
  );
});

test('MobileHomeV3 tidak lagi membaca totalItems dari objek Project', () => {
  const src = readSrc('components/mobile/MobileV3.tsx');
  // Cast lama `(p as unknown as { totalItems?: number })` adalah
  // akar penyebab: field itu tidak ada di Project.
  assert(
    !src.includes('{ totalItems?: number }'),
    'the totalItems cast on Project must be gone (NEW-12 root cause)',
  );
  assert(
    !src.includes(').totalItems || 0'),
    'no Project-level totalItems read may remain in MobileV3',
  );
});

test('interface Project mendeklarasikan itemsCount dan TIDAK totalItems', () => {
  const src = readSrc('types/index.ts');
  const start = src.indexOf('export interface Project {');
  assert(start >= 0, 'Project interface missing');
  // Blok Project berakhir di penutup pertama "}\n" setelah awal —
  // interface ini tidak punya interface bersarang.
  const end = src.indexOf('\n}\n', start);
  const block = src.slice(start, end);
  assert(block.includes('itemsCount?: number'), 'Project must declare itemsCount');
  assert(!block.includes('totalItems'), 'Project must not declare totalItems (it lives on ProjectVersion only)');
});

test('seed demo: itemsCount proyek == jumlah item RAB demo (213)', () => {
  assertEq(PREMIUM_DEMO_RAB_ITEMS.length, 213, 'demo RAB item count');
  assertEq(PREMIUM_DEMO_PROJECT.itemsCount, 213, 'demo project itemsCount seed');
  assertEq(
    PREMIUM_DEMO_PROJECT.itemsCount,
    PREMIUM_DEMO_RAB_ITEMS.length,
    'seed itemsCount must equal the item list the spreadsheet renders',
  );
});

test('reconcileProjectSummaries menulis itemsCount dari jumlah item nyata', () => {
  const src = readSrc('lib/demoSeed.ts');
  assert(
    src.includes('itemsCount: projectItems.length'),
    'reconcile must rebuild itemsCount from the real item records',
  );
  assert(
    src.includes('project.itemsCount === projectItems.length'),
    'reconcile must treat a matching itemsCount as fresh',
  );
});

test('ProjectContext memperbarui itemsCount saat item RAB berubah', () => {
  const src = readSrc('context/ProjectContext.tsx');
  assert(
    src.includes('itemsCount: pItems.length'),
    'ProjectContext recalc must refresh itemsCount from the item list',
  );
});

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
