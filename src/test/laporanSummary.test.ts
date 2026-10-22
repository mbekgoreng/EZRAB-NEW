/**
 * FASE 1 — INTEGRITAS LAPORAN: tes derivasi ringkasan LaporanView.
 *
 * Memastikan angka ringkasan berasal dari data aktual:
 *  - proyek kosong → keadaan EMPTY, total null (bukan Rp 0),
 *  - proyek berisi data → total/kategori/volume terderivasi,
 *  - harga tidak tersedia (semua null) → UNPRICED, total null,
 *  - harga sebagian → PARTIAL, total hanya dari item berharga,
 *  - total valid nol tetap Rp 0 (angka, bukan null),
 *  - progress: berbobot dari tugas jadwal, fallback field proyek, atau null.
 *
 * Jalankan: npx tsx src/test/laporanSummary.test.ts
 */

import {
  computeLaporanSummary,
  resolveItemAmount,
  type LaporanSummaryItem,
} from '../lib/laporanSummary';
import type { ScheduleTask } from '../types';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function item(over: Partial<LaporanSummaryItem>): LaporanSummaryItem {
  return { category: 'Pekerjaan Utama', volume: null, unit: null, unitPrice: null, amount: null, ...over };
}

function task(over: Partial<ScheduleTask>): ScheduleTask {
  return {
    id: 't1',
    projectId: 'p1',
    name: 'Tugas',
    category: 'Umum',
    weightPercent: 0,
    startDate: '2026-09-01',
    endDate: '2026-09-28',
    startWeek: 1,
    endWeek: 4,
    durationWeeks: 4,
    actualProgressPercent: 0,
    status: 'PENDING',
    ...over,
  };
}

console.log('\n[1] resolveItemAmount:');
check('amount terekam menang (termasuk 0)', resolveItemAmount(item({ amount: 0, volume: 5, unitPrice: 100 })) === 0);
check('amount teresolusi dari volume × unitPrice', resolveItemAmount(item({ amount: null, volume: 2.5, unitPrice: 400 })) === 1000);
check('unitPrice null → null (bukan 0)', resolveItemAmount(item({ amount: null, volume: 10, unitPrice: null })) === null);
check('volume hilang → null', resolveItemAmount(item({ amount: null, volume: null, unitPrice: 100 })) === null);
check('amount NaN tidak dianggap berharga', resolveItemAmount(item({ amount: NaN, volume: 1, unitPrice: 50 })) === 50);

console.log('\n[2] Proyek kosong:');
{
  const s = computeLaporanSummary([], [], undefined);
  check('state EMPTY', s.rabTotalState === 'EMPTY');
  check('totalRabValue null (bukan 0)', s.totalRabValue === null);
  check('totalItems 0 & kategori 0', s.totalItems === 0 && s.categoryCount === 0);
  check('volume: 0 tercatat, satuan null', s.volumeItemCount === 0 && s.dominantVolumeUnit === null && s.totalVolume === 0);
  check('progress null tanpa tugas & tanpa field', s.progressPercent === null && s.progressSource === null);
}

console.log('\n[3] Proyek berisi data lengkap:');
{
  const items = [
    item({ category: 'Persiapan', volume: 100, unit: 'm³', amount: 3000000 }),
    item({ category: 'Persiapan', volume: 24, unit: 'm³', unitPrice: 50000 }),
    item({ category: 'Struktur', volume: 10, unit: 'm²', amount: 750000 }),
  ];
  const s = computeLaporanSummary(items, [], undefined);
  check('state COMPLETE', s.rabTotalState === 'COMPLETE');
  check('total = 3.000.000 + 1.200.000 + 750.000', s.totalRabValue === 4950000, `got ${s.totalRabValue}`);
  check('totalItems 3, kategori distinct 2', s.totalItems === 3 && s.categoryCount === 2);
  check('volume satuan dominan m³ (2 item) = 124', s.totalVolume === 124 && s.dominantVolumeUnit === 'm³', `got ${s.totalVolume} ${s.dominantVolumeUnit}`);
  check('1 item satuan lain tidak dijumlahkan', s.otherUnitItemCount === 1);
  check('tidak ada volume hilang', s.missingVolumeCount === 0 && s.volumeItemCount === 3);
}

console.log('\n[4] Harga tidak tersedia (semua null):');
{
  const items = [
    item({ category: 'DED', volume: 40, unit: 'm³', unitPrice: null, amount: null }),
    item({ category: 'DED', volume: 12, unit: 'm³', unitPrice: null, amount: null }),
  ];
  const s = computeLaporanSummary(items, [], undefined);
  check('state UNPRICED', s.rabTotalState === 'UNPRICED');
  check('totalRabValue null — TIDAK menyamar jadi Rp 0', s.totalRabValue === null);
  check('priced 0 / unpriced 2', s.pricedItemCount === 0 && s.unpricedItemCount === 2);
  check('volume tetap terderivasi jujur (52 m³)', s.totalVolume === 52 && s.volumeItemCount === 2);
}

console.log('\n[5] Harga sebagian:');
{
  const items = [
    item({ category: 'A', amount: 1000000 }),
    item({ category: 'A', unitPrice: null, amount: null }),
    item({ category: 'B', volume: 2, unitPrice: 250000 }),
    item({ category: 'B', unitPrice: null, amount: null }),
  ];
  const s = computeLaporanSummary(items, [], undefined);
  check('state PARTIAL', s.rabTotalState === 'PARTIAL');
  check('total hanya dari yang berharga (1.500.000)', s.totalRabValue === 1500000, `got ${s.totalRabValue}`);
  check('priced 2 dari 4', s.pricedItemCount === 2 && s.unpricedItemCount === 2 && s.totalItems === 4);
}

console.log('\n[6] Total valid nol:');
{
  const items = [item({ category: 'A', amount: 0 }), item({ category: 'A', volume: 3, unitPrice: 0 })];
  const s = computeLaporanSummary(items, [], undefined);
  check('state COMPLETE', s.rabTotalState === 'COMPLETE');
  check('totalRabValue === 0 (angka, bukan null)', s.totalRabValue === 0);
}

console.log('\n[7] Progress:');
{
  const tasks = [
    task({ weightPercent: 60, actualProgressPercent: 50 }),
    task({ weightPercent: 40, actualProgressPercent: 100 }),
  ];
  const s1 = computeLaporanSummary([], tasks, undefined);
  check('berbobot tugas: (60×50 + 40×100)/100 = 70', s1.progressPercent === 70, `got ${s1.progressPercent}`);
  check('sumber SCHEDULE_TASKS, 2 tugas', s1.progressSource === 'SCHEDULE_TASKS' && s1.scheduleTaskCount === 2);

  const s2 = computeLaporanSummary([], [], 35);
  check('fallback field proyek 35', s2.progressPercent === 35 && s2.progressSource === 'PROJECT_FIELD');

  const s3 = computeLaporanSummary([], [task({ weightPercent: 0, actualProgressPercent: 80 })], 25);
  check('bobot tugas 0 → fallback field (25)', s3.progressPercent === 25 && s3.progressSource === 'PROJECT_FIELD');

  const s4 = computeLaporanSummary([], tasks, 99);
  check('tugas jadwal mengalahkan field proyek', s4.progressPercent === 70 && s4.progressSource === 'SCHEDULE_TASKS');

  const s5 = computeLaporanSummary([], [], 140);
  check('field proyek dijepit ke 100', s5.progressPercent === 100);
}

console.log('\n[8] Volume: satuan campuran & volume hilang:');
{
  const items = [
    item({ volume: 10, unit: 'm³' }),
    item({ volume: null, unit: 'm³' }),
    item({ volume: NaN, unit: 'm²' }),
    item({ volume: 5, unit: 'm²' }),
    item({ volume: 7, unit: 'm²' }),
  ];
  const s = computeLaporanSummary(items, [], undefined);
  check('dominan m² (2 item) = 12', s.dominantVolumeUnit === 'm²' && s.totalVolume === 12, `got ${s.dominantVolumeUnit} ${s.totalVolume}`);
  check('volume tercatat 3, hilang 2 (null + NaN)', s.volumeItemCount === 3 && s.missingVolumeCount === 2);
  check('1 item di luar satuan dominan', s.otherUnitItemCount === 1);
}

console.log('\n[9] Kategori fallback:');
{
  const s = computeLaporanSummary([item({ category: '' }), item({ category: null }), item({ category: 'Struktur' })], [], undefined);
  check("kategori kosong/null → 'Pekerjaan Utama' (distinct 2)", s.categoryCount === 2, `got ${s.categoryCount}`);
}

console.log(`\nHasil: ${passed} lolos, ${failed} gagal`);
if (failed > 0) {
  console.log('GAGAL:', failures.join(', '));
  process.exit(1);
}
console.log('SEMUA TES LAPORAN SUMMARY LOLOS');
