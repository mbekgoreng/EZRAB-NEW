/**
 * Batch 4 regression (P0): the Rekapitulasi ladder must equal the canonical
 * engine ladder for the same project.
 *
 * Root cause covered: EstimatorRekapitulasiView used to compute its own
 * ladder (direct + overhead% + taxes) and never read profitPercent, so for
 * the Premium Demo project it displayed Rp1.040.339.744 while the canonical
 * engine (project cards, Laporan, exports, AI context) produced
 * Rp1.089.879.733 for the SAME project. The view now delegates to
 * recalculateCostSummary; this suite locks the arithmetic with independent
 * expected values and guards the source against regressing to a hand-rolled
 * ladder.
 *
 * Run: bundle with esbuild and execute with node (house pattern).
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { recalculateCostSummary } from '../engine/unifiedProjectEngine';

let pass = 0,
  fail = 0;
const check = (label: string, cond: boolean, detail: string) => {
  if (cond) {
    pass++;
    console.log(`  [PASS] ${label}`);
  } else {
    fail++;
    console.log(`  [FAIL] ${label} — ${detail}`);
  }
};

console.log('B4-REKAP-1: tangga kanonis proyek demo premium (nilai ekspektasi independen)');
{
  // Direct cost and configuration as stored on the Premium Demo project.
  const items = [{ amount: 892612393, priceStatus: 'PRICE_RESOLVED' }] as never;
  const s = recalculateCostSummary(items, {
    overheadPercent: 5,
    profitPercent: 5,
    taxPercent: 11,
    ppnEnabled: true,
  } as never);
  // Independent arithmetic:
  //   overhead = round(892,612,393 x 5%)  = 44,630,620
  //   profit   = round(892,612,393 x 5%)  = 44,630,620
  //   subtotal = 981,873,633
  //   PPN      = round(981,873,633 x 11%) = 108,006,100
  //   grand    = 1,089,879,733
  check('overhead 44.630.620', s.overheadAmount === 44630620, `dapat ${s.overheadAmount}`);
  check('profit 44.630.620 (baris terpisah, bukan nol)', s.profitAmount === 44630620, `dapat ${s.profitAmount}`);
  check('subtotal sebelum pajak 981.873.633', s.subtotalBeforeTax === 981873633, `dapat ${s.subtotalBeforeTax}`);
  check('PPN 108.006.100', s.taxAmount === 108006100, `dapat ${s.taxAmount}`);
  check('grand total 1.089.879.733', s.grandTotal === 1089879733, `dapat ${s.grandTotal}`);
}

console.log('B4-REKAP-2: profit 0% eksplisit tidak mengarang keuntungan');
{
  const items = [{ amount: 200000000, priceStatus: 'PRICE_RESOLVED' }] as never;
  const s = recalculateCostSummary(items, {
    overheadPercent: 10,
    profitPercent: 0,
    taxPercent: 11,
    ppnEnabled: false,
  } as never);
  check('profitAmount 0', s.profitAmount === 0, `dapat ${s.profitAmount}`);
  check('grand = direct + overhead saja = 220.000.000', s.grandTotal === 220000000, `dapat ${s.grandTotal}`);
}

console.log('B4-REKAP-3: view Rekapitulasi memakai mesin kanonis (penjaga sumber)');
{
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(
    join(here, '../components/estimator/EstimatorRekapitulasiView.tsx'),
    'utf8'
  );
  check(
    'mengimpor & memanggil recalculateCostSummary',
    src.includes('recalculateCostSummary'),
    'tidak ditemukan di EstimatorRekapitulasiView.tsx'
  );
  check(
    'tidak ada lagi tangga tangan (direct * overheadPct)',
    !src.includes('(direct * overheadPct) / 100'),
    'pola lama masih ada'
  );
  check(
    'baris Keuntungan Pelaksana tampil terpisah',
    src.includes('Keuntungan Pelaksana'),
    'label baris profit tidak ditemukan'
  );
}

console.log(`\nbatch4RecapAlignment: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
