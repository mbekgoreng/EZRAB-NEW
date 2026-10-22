/**
 * KURVA S ESTIMATOR SPREADSHEET — kejujuran data (lanjutan Fase 4 Laporan).
 *
 * Yang dipastikan:
 *  1. lib/kurvaSHonesty.evaluateEstimatorKurvaS: tanpa item RAB → TIDAK
 *     tersedia (NO_ITEMS); item ada tetapi total biaya efektif nol →
 *     TIDAK tersedia (NO_WEIGHTS — seluruh bobot kategori nol, kurva 0%
 *     datar akan terbaca sebagai fakta palsu); item berharga → tersedia,
 *     dengan resolusi biaya yang sama seperti komponen (amount, atau
 *     volume × unitPrice).
 *  2. EstimatorKurvaSView (render statis): keadaan tanpa data menampilkan
 *     panel "Data Kurva S Tidak Tersedia" dan TIDAK menampilkan kurva,
 *     tabel distribusi, maupun "Total Biaya Rencana"; keadaan berdata
 *     menampilkan kurva nyata + total biaya rencana dari item.
 *
 * Jalankan: npx tsx src/test/estimatorKurvaS.test.ts
 */

import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EstimatorKurvaSView } from '../components/estimator/EstimatorKurvaSView';
import { evaluateEstimatorKurvaS } from '../lib/kurvaSHonesty';
import { formatCurrencyIDR } from '../calculations/decimalEngine';
import type { RabItem } from '../types';

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

/** Normalisasi spasi non-breaking dari Intl ("Rp 1.500" -> "Rp 1.500"). */
function norm(html: string): string {
  return html.replace(/ /g, ' ');
}

function item(over: Partial<RabItem>): RabItem {
  return {
    id: 'i-x',
    projectId: 'p-x',
    code: 'X.1',
    description: 'Item uji',
    category: 'Pekerjaan Umum',
    volume: 0,
    unit: 'ls',
    unitPrice: 0,
    amount: 0,
    ...over,
  } as RabItem;
}

function render(items: RabItem[]): string {
  return norm(
    renderToStaticMarkup(
      React.createElement(EstimatorKurvaSView as any, {
        currentProject: null,
        items,
      })
    )
  );
}

function main(): void {
  console.log('\n[1] evaluateEstimatorKurvaS — kriteria ketersediaan:');
  const none = evaluateEstimatorKurvaS([]);
  check('tanpa item → available=false', none.available === false);
  check('tanpa item → reason NO_ITEMS', none.reason === 'NO_ITEMS');
  check('tanpa item → totalAmount 0', none.totalAmount === 0);

  const nullish = evaluateEstimatorKurvaS(null);
  check('items null → NO_ITEMS', nullish.available === false && nullish.reason === 'NO_ITEMS');

  const zeroPriced = evaluateEstimatorKurvaS([
    item({ amount: 0, volume: 0, unitPrice: 0 }),
    item({ amount: 0, volume: 10, unitPrice: 0 }),
  ]);
  check('item ada, semua biaya nol → NO_WEIGHTS', zeroPriced.available === false && zeroPriced.reason === 'NO_WEIGHTS');
  check('NO_WEIGHTS → totalAmount dilaporkan 0', zeroPriced.totalAmount === 0);

  const viaVolume = evaluateEstimatorKurvaS([item({ amount: 0, volume: 10, unitPrice: 50000 })]);
  check('amount kosong → volume × unitPrice dihitung (500.000)', viaVolume.available === true && viaVolume.totalAmount === 500000);

  const viaAmount = evaluateEstimatorKurvaS([item({ amount: 2500000 })]);
  check('amount langsung → tersedia', viaAmount.available === true && viaAmount.reason === null && viaAmount.totalAmount === 2500000);

  const mixed = evaluateEstimatorKurvaS([item({ amount: 0 }), item({ amount: 1000 })]);
  check('campuran nol + berharga → tersedia', mixed.available === true && mixed.totalAmount === 1000);

  console.log('\n[2] EstimatorKurvaSView — tanpa data: panel, bukan kurva 0%:');
  const htmlEmpty = render([]);
  check('panel "Data Kurva S Tidak Tersedia" tampil', htmlEmpty.includes('Data Kurva S Tidak Tersedia'));
  check('alasan NO_ITEMS tampil', htmlEmpty.includes('belum memiliki item RAB'));
  check('TIDAK ada "Total Biaya Rencana" (Rp0 tidak disajikan sebagai fakta)', !htmlEmpty.includes('Total Biaya Rencana'));
  check('TIDAK ada grafik kurva (estkurva-line)', !htmlEmpty.includes('estkurva-line'));
  check('TIDAK ada tabel distribusi bobot', !htmlEmpty.includes('Distribusi Bobot Pekerjaan Mingguan'));

  const htmlZero = render([item({ category: 'Pekerjaan Tanah', amount: 0, volume: 5, unitPrice: 0 })]);
  check('item tak berharga → panel tampil', htmlZero.includes('Data Kurva S Tidak Tersedia'));
  check('alasan NO_WEIGHTS tampil', htmlZero.includes('total biaya rencana masih nol'));
  check('item tak berharga → TIDAK ada "Total Biaya Rencana"', !htmlZero.includes('Total Biaya Rencana'));
  check('item tak berharga → TIDAK ada grafik kurva', !htmlZero.includes('estkurva-line'));

  console.log('\n[3] EstimatorKurvaSView — berdata: kurva nyata tidak berubah:');
  const priced = [
    item({ category: 'Pekerjaan Tanah', amount: 3000000 }),
    item({ category: 'Pekerjaan Struktur', amount: 0, volume: 2, unitPrice: 500000 }),
  ];
  const htmlPriced = render(priced);
  check('panel TIDAK tampil', !htmlPriced.includes('Data Kurva S Tidak Tersedia'));
  check('"Total Biaya Rencana" tampil', htmlPriced.includes('Total Biaya Rencana'));
  check(
    'total = jumlah biaya item (Rp4.000.000)',
    htmlPriced.includes(norm(formatCurrencyIDR(4000000))),
    `mengharapkan "${norm(formatCurrencyIDR(4000000))}"`
  );
  check('grafik kurva digambar (estkurva-line)', htmlPriced.includes('estkurva-line'));
  check('tabel distribusi bobot tampil', htmlPriced.includes('Distribusi Bobot Pekerjaan Mingguan'));
  check('kedua kategori tampil di tabel', htmlPriced.includes('Pekerjaan Tanah') && htmlPriced.includes('Pekerjaan Struktur'));
  check('baris kumulatif tampil', htmlPriced.includes('Bobot Rencana Kumulatif'));

  console.log(`\nHasil: ${passed} lolos, ${failed} gagal`);
  if (failed > 0) {
    console.log('GAGAL:', failures.join(' | '));
    process.exit(1);
  }
  console.log('SEMUA TES KURVA S ESTIMATOR LOLOS');
}

main();
