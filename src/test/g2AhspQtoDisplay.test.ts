/**
 * Batch G2 — label jam kerja, data AHSP/QTO, nilai proyek (D-19,
 * D-20, D-26, D-53, D-56, D-58, D-69, D-85).
 *
 * D-19 (P3): label upah "(OH/7)" vs hitungan 8 jam — label kini
 *   diturunkan per baris dari workHoursPerDay (19 baris memang 7h,
 *   66 baris 8h; label selimut "8h" akan berbohong untuk 19 baris).
 *   Hitungan TIDAK diubah; standar jam kerja (7h vs 8h) tetap OD-19.
 * D-20 (P3): label alat bertabrakan (7 JAM / 8 Jam / 200 jam /
 *   tersimpan 160 jam) — label kini mengikuti basis tersimpan.
 * D-26 (P3): spasi hilang — TIDAK TEREPRODUKSI kecuali "MasukDaftar"
 *   (sudah diperbaiki G1/D-08); tes ini mengunci pin itu + pola
 *   yang disapu tetap ber-spasi.
 * D-53 (P3): typo judul AHSP — DIBLOKIR (verbatim di master JSON
 *   SE DJBK 47/2026; koreksi butuh bukti PDF). Tes ini MENGUNCI
 *   typo tetap ada — perbaikan diam-diam tanpa bukti akan ketahuan.
 * D-56 (P3): "Reset Semua Filter" tidak mereset domain.
 * D-58 (P3): pill salin kode kosong + toast sukses palsu.
 * D-69 (P3): detail QTO menampilkan konstanta mentah SYNCED_TO_RAB.
 * D-85 (P3): NILAI ESTIMASI daftar proyek membaca cache totalRab
 *   (3 penulis, semantik bertabrakan) — kini total kanonis live;
 *   anggaran pembuatan disimpan sebagai estimatedBudget.
 *
 * Jalankan: npx tsx src/test/g2AhspQtoDisplay.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
// tsx menjalankan berkas ini sebagai ESM: __dirname tidak tersedia.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..');
const REPO = path.join(__dirname, '..', '..');

import { MASTER_LABOR_ROSTER_49 } from '../domain/labor/laborMasterData49';
import { MASTER_EQUIPMENT_ROSTER } from '../domain/equipment/equipmentDatabaseService';

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

console.log('g2AhspQtoDisplay (D-19, D-20, D-26, D-53, D-56, D-58, D-69, D-85):');

// --- D-19 ------------------------------------------------------------------
test('D-19: roster upah = 85 baris (19 × 7h, 66 × 8h) — label selimut akan berbohong', () => {
  assertEq(MASTER_LABOR_ROSTER_49.length, 85, 'labor rows');
  const h7 = MASTER_LABOR_ROSTER_49.filter((r) => r.workHoursPerDay === 7).length;
  const h8 = MASTER_LABOR_ROSTER_49.filter((r) => r.workHoursPerDay === 8).length;
  assertEq(h7, 19, '7h rows');
  assertEq(h8, 66, '8h rows');
});
test('D-19: cek audit — 750.000/8 = 93.750 (OJ dihitung di 8h untuk baris 8h)', () => {
  const row = MASTER_LABOR_ROSTER_49.find((r) => r.id === 'LAB-MAN-000');
  assert(row, 'LAB-MAN-000 must exist');
  assertEq(row.workHoursPerDay, 8, 'LAB-MAN-000 is an 8h row');
  assertEq(row.basePriceOH / row.workHoursPerDay, row.basePriceOJ, 'OJ = OH / workHoursPerDay');
  assertEq(row.basePriceOJ, 93750, 'audit check value');
});
test('D-19: label upah diturunkan per baris dari workHoursPerDay (source-level)', () => {
  const src = readSrc('components/materials/LaborTableView.tsx');
  assert(src.includes('{lab.workHoursPerDay} Jam/Hari'), 'per-row hours label missing');
  assert(src.includes('OH/{lab.workHoursPerDay}'), 'per-row OJ label missing');
});

// --- D-20 ------------------------------------------------------------------
test('D-20: roster alat = 37 item; rasio hari/jam = 8 untuk 32 item; bulanan tersimpan di 10', () => {
  assertEq(MASTER_EQUIPMENT_ROSTER.length, 37, 'equipment rows');
  const ratio8 = MASTER_EQUIPMENT_ROSTER.filter(
    (r) => Math.abs(r.rentalPricePerDay / r.rentalPricePerHour - 8) < 0.001,
  ).length;
  assertEq(ratio8, 32, 'day/hour ratio == 8');
  const storedMonthly = MASTER_EQUIPMENT_ROSTER.filter(
    (r) => r.rentalPricePerMonth != null && r.rentalPricePerMonth > 0,
  ).length;
  assertEq(storedMonthly, 10, 'stored monthly rates');
});
test('D-20: label alat mengikuti basis tersimpan (source-level)', () => {
  const eq = readSrc('components/materials/EquipmentTableView.tsx');
  assert(eq.includes('Sewa / Hari (8 Jam)'), 'day header must say 8 Jam');
  const insp = readSrc('components/materials/MaterialInspectorPanel.tsx');
  assert(insp.includes('Sewa Bulanan (160 jam · 20 hari kerja)'), 'stored monthly basis label missing');
  assert(insp.includes('Sewa Bulanan (200 jam · 25 hari kerja, estimasi)'), 'fallback monthly basis label missing');
  assert(insp.includes('adjustedRate.monthlyBasis'), 'inspector must branch on monthlyBasis');
  const svc = readSrc('domain/equipment/equipmentDatabaseService.ts');
  assert(svc.includes("monthlyBasis: 'stored' | 'fallback'"), 'getAdjustedRate must report monthlyBasis');
});

// --- D-26 ------------------------------------------------------------------
test('D-26: pin "MasukDaftar" tetap diperbaiki (G1/D-08) — tombol tidak berdempetan', () => {
  const src = readSrc('components/landing/exact/AiShowcase.tsx');
  assert(!src.includes('>Masuk</button><button'), 'Masuk/Daftar buttons must not be adjacent');
});
test('D-26: pola yang disapu tetap ber-spasi (bukan konkatenasi)', () => {
  const rekap = readSrc('components/estimator/EstimatorRekapitulasiView.tsx');
  // Rumus total: bagian kondisional " + D" / " + E" membawa spasi
  // sendiri — bila spasi itu hilang, judul menjadi "…C+D+E".
  assert(rekap.includes('A + B + C'), 'rekap formula base must keep spaced operators');
  assert(rekap.includes('" + D"'), 'PPN part must carry its leading space');
  assert(rekap.includes('" + E"'), 'PPh part must carry its leading space');
});

// --- D-53 (BLOCKED pin) ----------------------------------------------------
test('D-53: 4 typo master JSON TETAP ADA (diblokir — koreksi butuh bukti PDF SE DJBK 47/2026)', () => {
  const raw = fs.readFileSync(
    path.join(REPO, 'data/ahsp2026/validated/ahsp_2026_master.json'),
    'utf8',
  );
  const master = JSON.parse(raw) as { items: Array<{ code: string; description: string }> };
  const byCode = new Map(master.items.map((i) => [i.code, i.description]));
  // Bila salah satu typo HILANG, seseorang "memperbaiki" data tanpa
  // bukti sumber — tes ini sengaja gagal dalam kasus itu.
  assertEq(
    byCode.get('1.2.1.2.1'),
    'Penggalian 1 m3 tanh biasa sedalam > 0 s.d 1 m secara semi mekanis',
    '1.2.1.2.1 (p.181) must still carry "tanh"',
  );
  assertEq(
    byCode.get('1.2.2.1.4'),
    'Penggalian 1 m3 pasir sedalam > 3 m tiap tambahan dalam 1 msecara manual',
    '1.2.2.1.4 (p.184) must still carry "1 msecara"',
  );
  assertEq(
    byCode.get('1.2.2.2.4'),
    'Penggalian 1 m3 pasir sedalam > 3 m secara semi mekanis untuk setiap tambahan dalm 1 m',
    '1.2.2.2.4 (p.186) must still carry "dalm"',
  );
  assertEq(
    byCode.get('1.1.3.3'),
    'Tebas tebang 1 m 2 tanaman/tumbuhan ∅ >5 s.d. 15 cm',
    '1.1.3.3 (p.167) must still carry "1 m 2"',
  );
});

// --- D-56 ------------------------------------------------------------------
test('D-56: reset filter menghapus domain + status harga + halaman (source-level)', () => {
  const src = readSrc('components/ahsp/AhspExplorerView.tsx');
  const idx = src.indexOf('const handleResetAllFilters');
  assert(idx >= 0, 'handleResetAllFilters missing');
  const block = src.slice(idx, idx + 600);
  assert(block.includes("setSelectedDomain('ALL')"), 'reset must clear domain');
  assert(block.includes("setPriceStatusFilter('ALL')"), 'reset must clear price status');
  assert(block.includes('setCurrentPage(1)'), 'reset must return to page 1');
  assertEq(countOccurrences(src, 'onClick={handleResetAllFilters}'), 2, 'both reset buttons must use the shared handler');
});

// --- D-58 ------------------------------------------------------------------
test('D-58: tidak ada pill salin untuk kode kosong; toast jujur (source-level)', () => {
  const src = readSrc('components/ahsp/AhspExplorerView.tsx');
  assert(src.includes('Kode tidak tersedia'), 'honest empty-code state missing');
  assert(
    src.includes('Item ini belum memiliki kode analisa.'),
    'empty-code copy must toast an honest message, never a success',
  );
});

// --- D-69 ------------------------------------------------------------------
test('D-69: detail QTO memakai qtoStatusLabel (bukan konstanta mentah) — source-level', () => {
  // QtoRekapVolumeView tidak bisa diimpor tsx (impor aset .jpg) —
  // pemetaan diuji lewat sumber + definisi fungsinya.
  const src = readSrc('components/qto/QtoRekapVolumeView.tsx');
  assert(
    src.includes("export function qtoStatusLabel(status: string | null | undefined): string"),
    'qtoStatusLabel helper missing',
  );
  assert(
    src.includes("return status === 'SYNCED_TO_RAB' ? 'Terhubung' : 'Terhitung';"),
    'status mapping must be SYNCED_TO_RAB → Terhubung, else Terhitung',
  );
  assert(!src.includes('{activeSelectedItem.status}</span>'), 'raw status constant must not be rendered');
  assertEq(
    countOccurrences(src, 'qtoStatusLabel(activeSelectedItem.status)'),
    3,
    'badge (2 branches) + detail row must all use the helper',
  );
});

// --- D-85 ------------------------------------------------------------------
test('D-85: daftar proyek memakai total kanonis live (bukan cache totalRab)', () => {
  const src = readSrc('components/projects/AllProjectsView.tsx');
  assert(src.includes('computeProjectInfoTotal'), 'must use the canonical total helper');
  assert(src.includes('listRabValues'), 'per-project live values memo missing');
  assert(src.includes('getListRabValue'), 'live lookup missing');
  assert(!src.includes('getRabValue('), 'stored-cache getRabValue must be gone');
  assert(!src.includes('p.totalRab'), 'list must not read the stored totalRab cache');
});
test('D-85: anggaran pembuatan disimpan sebagai estimatedBudget, BUKAN totalRab', () => {
  const modal = readSrc('components/projects/CreateProjectModal.tsx');
  assert(modal.includes('estimatedBudget: budgetNumber'), 'creation budget must go to estimatedBudget');
  assert(!modal.includes('totalRab: budgetNumber'), 'creation budget must not pose as totalRab');
  const types = readSrc('types/index.ts');
  assert(types.includes('estimatedBudget?: number'), 'Project type must carry estimatedBudget');
  // Dokumen lapangan terbelah baris + penanda '*' komentar — kupas
  // keduanya sebelum cocok.
  const flat = types.replace(/^\s*\*\s?/gm, '').replace(/\s+/g, ' ');
  assert(flat.includes('BUKAN total RAB terhitung'), 'field doc must warn it is not a computed total');
});

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
