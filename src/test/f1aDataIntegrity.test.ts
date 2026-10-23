/**
 * F1a REGRESSION TEST — kejujuran data & integritas inti.
 *
 * Mencakup:
 *  1. Loader item RAB flagship menghormati array kosong tersimpan
 *     (menghapus semua item tidak boleh memunculkan kembali item contoh).
 *  2. Konsistensi seed flagship: grandTotal = subtotal + pajak, pajak =
 *     taxPercent × subtotal, directCost = Σ amount item.
 *  3. Recalculate spreadsheet mempertahankan harga null (amount tetap
 *     null, tidak pernah ditulis 0).
 *  4. Insert baris relatif terhadap item jangkar (di atas / di bawah).
 *  5. Duplikat proyek menyalin item RAB & QTO + mapping ter-remap.
 *  6. Insight dashboard menghitung item belum berharga resmi dari data.
 *  7. Pemeriksaan sumber: label persen Rekapitulasi dinamis & footer
 *     spreadsheet berlabel "Total Biaya Langsung".
 *
 * Jalankan: npx tsx src/test/f1aDataIntegrity.test.ts
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
import {
  resolveInitialRabItems,
  computeSeedCostSummary,
  consistentSeedCostSummary,
  markSeedProject,
} from '../lib/demoSeed';
import { cloneProjectItems } from '../lib/projectClone';
import {
  recalculateRabItemAmounts,
  insertRabItemRelative,
} from '../components/rab/rabCellEdit';
import {
  countUnpricedRabItems,
  isUnpricedOrReferenceItem,
} from '../lib/dashboardInsight';
import type { Project, QTOItem, QTOItemRABMapping, RabItem } from '../types';

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

function rabItem(over: Partial<RabItem>): RabItem {
  return {
    id: 'r1',
    no: 1,
    code: 'A.1',
    category: 'Pekerjaan Persiapan',
    sectionName: 'Pekerjaan Persiapan',
    description: 'Item contoh',
    volume: 10,
    unit: 'm',
    unitPrice: 1000,
    amount: 10000,
    totalPrice: 10000,
    projectId: 'P1',
    ...over,
  } as RabItem;
}

// ---------------------------------------------------------------------------
// 1. Loader flagship: array kosong tersimpan dihormati
// ---------------------------------------------------------------------------
console.log('\n[1] Loader item RAB flagship:');
const seedItems = [rabItem({ id: 'seed-1' }), rabItem({ id: 'seed-2' })];
check(
  'kunci ada + array kosong -> tetap kosong (tidak respawn)',
  resolveInitialRabItems({ ok: true, data: [] }, seedItems).length === 0
);
check(
  'kunci ada + item tersimpan -> item tersimpan dipakai',
  resolveInitialRabItems({ ok: true, data: [rabItem({ id: 'milik-user' })] }, seedItems)[0].id ===
    'milik-user'
);
check(
  'kunci belum ada (NOT_FOUND) -> seed flagship',
  resolveInitialRabItems({ ok: false }, seedItems) === seedItems
);
check(
  'data rusak (CORRUPT) -> fallback seed (perilaku lama)',
  resolveInitialRabItems({ ok: false }, seedItems) === seedItems
);

// ---------------------------------------------------------------------------
// 2. Konsistensi seed flagship
// ---------------------------------------------------------------------------
console.log('\n[2] Konsistensi costSummary seed:');
// Amount 7 item flagship (RAB-TROPIS-01..07 di ProjectContext).
const flagshipAmounts = [6038250, 5878840, 230000000, 258552000, 68870000, 91200000, 99750];
const flagshipItems = flagshipAmounts.map((amount) => ({ amount }));
const cs = computeSeedCostSummary(flagshipItems, { costPerM2: 2450000 });
const expectedDirect = flagshipAmounts.reduce((a, b) => a + b, 0);
check('directCost = Σ amount item', cs.directCost === expectedDirect, `${cs.directCost} vs ${expectedDirect}`);
check(
  'subtotal = direct + overhead 5% + profit 5%',
  cs.subtotalBeforeTax === cs.directCost + cs.overheadAmount + cs.profitAmount
);
check('taxAmount = 11% × subtotal', cs.taxAmount === Math.round(cs.subtotalBeforeTax * 0.11));
check('grandTotal = subtotal + taxAmount', cs.grandTotal === cs.subtotalBeforeTax + cs.taxAmount);
check(
  'taxAmount lama yang yatim (7.325.324) tidak terulang',
  cs.taxAmount !== 7325324
);

// Literal lama proyek lain (subtotal 8.859.459.458, pajak karangan 80.540.542):
const normalized = consistentSeedCostSummary({
  ...cs,
  subtotalBeforeTax: 8859459458,
  taxPercent: 11,
  taxAmount: 80540542,
  grandTotal: 8940000000,
});
check(
  'consistentSeedCostSummary menurunkan pajak dari subtotal',
  normalized.taxAmount === Math.round(8859459458 * 0.11) &&
    normalized.grandTotal === 8859459458 + normalized.taxAmount
);

// markSeedProject menandai demo + menyelaraskan totalRab
const fakeProject = {
  id: 'PX',
  name: 'Contoh',
  status: 'draft',
  sections: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  totalRab: 8940000000,
  costSummary: { ...cs, subtotalBeforeTax: 8859459458, taxPercent: 11, taxAmount: 80540542, grandTotal: 8940000000 },
} as unknown as Project;
const marked = markSeedProject(fakeProject);
check('markSeedProject: isDemo = true', marked.isDemo === true);
check(
  'markSeedProject: totalRab selaras grandTotal ternormalisasi',
  marked.totalRab === marked.costSummary.grandTotal &&
    marked.costSummary.grandTotal === 8859459458 + Math.round(8859459458 * 0.11)
);

// Pemeriksaan sumber: ProjectContext memakai jalur terhitung ini.
const ctxSource = readFileSync(
  resolve(__dirname, '../context/ProjectContext.tsx'),
  'utf8'
);
check(
  'ProjectContext: flagship memakai computeSeedCostSummary(DEFAULT_FLAGSHIP_RAB_ITEMS)',
  ctxSource.includes('computeSeedCostSummary(DEFAULT_FLAGSHIP_RAB_ITEMS')
);
check(
  'ProjectContext: portfolio diteruskan ke markSeedProject',
  ctxSource.includes(').map(markSeedProject)')
);
check(
  'ProjectContext: loader memakai resolveInitialRabItems',
  ctxSource.includes('resolveInitialRabItems(result, DEFAULT_FLAGSHIP_RAB_ITEMS)')
);
check(
  'ProjectContext: API duplicateProjectData terdaftar',
  ctxSource.includes('duplicateProjectData')
);

// ---------------------------------------------------------------------------
// 3. Recalculate mempertahankan null
// ---------------------------------------------------------------------------
console.log('\n[3] Recalculate spreadsheet:');
const unpriced = rabItem({ id: 'u1', unitPrice: null, amount: null, totalPrice: null, priceStatus: 'PRICE_UNRESOLVED' });
const priced = rabItem({ id: 'p1', volume: 3, unitPrice: 2500, amount: 1, totalPrice: 1 });
const zeroPriced = rabItem({ id: 'z1', volume: 5, unitPrice: 0, amount: 999, totalPrice: 999 });
const recalculated = recalculateRabItemAmounts([unpriced, priced, zeroPriced]);
check(
  'item harga null dilewati (amount tetap null)',
  recalculated[0].amount === null && recalculated[0].totalPrice === null
);
check('item berharga dihitung ulang', recalculated[1].amount === 7500 && recalculated[1].totalPrice === 7500);
check('harga eksplisit 0 tetap 0 (harga nyata)', recalculated[2].amount === 0);
check('item sumber tidak diubah', unpriced.amount === null && priced.amount === 1);

// ---------------------------------------------------------------------------
// 4. Insert relatif terhadap jangkar
// ---------------------------------------------------------------------------
console.log('\n[4] Insert baris relatif:');
const base = [rabItem({ id: 'a' }), rabItem({ id: 'b' }), rabItem({ id: 'c' })];
const newRow = rabItem({ id: 'baru', unitPrice: null, amount: null, totalPrice: null, priceStatus: 'PRICE_UNRESOLVED' });
const above = insertRabItemRelative(base, 'b', newRow, 'above');
check('di atas jangkar', above.map((i) => i.id).join(',') === 'a,baru,b,c');
const below = insertRabItemRelative(base, 'b', newRow, 'below');
check('di bawah jangkar', below.map((i) => i.id).join(',') === 'a,b,baru,c');
check(
  'jangkar tidak ditemukan -> append di akhir',
  insertRabItemRelative(base, 'tidak-ada', newRow, 'above').map((i) => i.id).join(',') === 'a,b,c,baru'
);
check('baris sisipan berharga null', newRow.unitPrice === null && newRow.amount === null);

// ---------------------------------------------------------------------------
// 5. Duplikat menyalin item + mapping
// ---------------------------------------------------------------------------
console.log('\n[5] Kloning data proyek:');
const srcRab = [
  rabItem({ id: 'rab-1', projectId: 'SRC', qtoItemId: 'qto-1' }),
  rabItem({ id: 'rab-2', projectId: 'SRC' }),
  rabItem({ id: 'rab-lain', projectId: 'LAIN' }),
];
const srcQto: QTOItem[] = [
  {
    id: 'qto-1',
    projectId: 'SRC',
    kode: 'QTO.01',
    uraian: 'Bowplank',
    quantity: 48,
    unit: "m'",
    status: 'CALCULATED',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as QTOItem,
];
const srcMappings: QTOItemRABMapping[] = [
  {
    id: 'map-1',
    projectId: 'SRC',
    qtoItemId: 'qto-1',
    rabItemId: 'rab-1',
    quantitySource: 'CALCULATOR',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as QTOItemRABMapping,
];
const cloned = cloneProjectItems(
  { rabItems: srcRab, qtoItems: srcQto, mappings: srcMappings },
  'SRC',
  'DST',
  (kind, oldId, idx) => `${kind}-new-${idx}`
);
check('hanya item proyek sumber yang disalin', cloned.rabItems.length === 2 && cloned.qtoItems.length === 1);
check(
  'id baru + projectId tujuan',
  cloned.rabItems.every((r) => r.projectId === 'DST' && r.id.startsWith('rab-new-')) &&
    cloned.qtoItems[0].projectId === 'DST'
);
check(
  'tautan RAB->QTO ter-remap ke salinan',
  cloned.rabItems[0].qtoItemId === cloned.qtoItems[0].id
);
check(
  'mapping ter-remap ke id salinan',
  cloned.mappings.length === 1 &&
    cloned.mappings[0].qtoItemId === cloned.qtoItems[0].id &&
    cloned.mappings[0].rabItemId === cloned.rabItems[0].id &&
    cloned.mappings[0].projectId === 'DST'
);
check('item sumber tidak berubah', srcRab[0].id === 'rab-1' && srcRab[0].projectId === 'SRC');

// ---------------------------------------------------------------------------
// 6. Insight dashboard dari data nyata
// ---------------------------------------------------------------------------
console.log('\n[6] Insight dashboard:');
const insightItems = [
  rabItem({ id: 'i1', priceSourceKind: 'OFFICIAL_AHSP', priceStatus: 'PRICE_RESOLVED' }),
  rabItem({ id: 'i2', unitPrice: null, amount: null, priceStatus: 'PRICE_UNRESOLVED' }),
  rabItem({ id: 'i3', priceSourceKind: 'MARKET_REFERENCE' }),
  rabItem({ id: 'i4', priceSourceKind: 'EZRAB_ASSUMPTION' }),
  rabItem({ id: 'i5', priceSourceKind: 'UNRESOLVED' }),
];
check('item resmi tidak dihitung', isUnpricedOrReferenceItem(insightItems[0]) === false);
check('hitungan = 4 dari 5', countUnpricedRabItems(insightItems) === 4);
check('tanpa item -> 0 (kartu disembunyikan)', countUnpricedRabItems([]) === 0);

// ---------------------------------------------------------------------------
// 7. Pemeriksaan sumber: Rekapitulasi & footer spreadsheet
// ---------------------------------------------------------------------------
console.log('\n[7] Label dinamis & footer jujur:');
const rekapSource = readFileSync(
  resolve(__dirname, '../components/estimator/EstimatorRekapitulasiView.tsx'),
  'utf8'
);
check(
  'Rekap: kunci grup sectionName || category (sama dengan spreadsheet)',
  rekapSource.includes('item.sectionName || item.category')
);
check('Rekap: tidak ada literal "(10%)"', !rekapSource.includes('(10%)'));
check('Rekap: tidak ada literal "(PPN 11%)"', !rekapSource.includes('(PPN 11%)'));
check('Rekap: label memakai variabel dinamis', rekapSource.includes('({overheadPct}%)') && rekapSource.includes('(PPN {ppnPct}%)'));

const footerSource = readFileSync(
  resolve(__dirname, '../components/estimator/SpreadsheetFooter.tsx'),
  'utf8'
);
check('Footer: label "Total Biaya Langsung"', footerSource.includes('Total Biaya Langsung'));
check('Footer: tidak ada kontrol pagination', !footerSource.includes('onPageChange?:') && !footerSource.includes('totalPages?:') && !footerSource.includes('ChevronLeft'));

const rabViewSource = readFileSync(
  resolve(__dirname, '../components/rab/RabEstimasiView.tsx'),
  'utf8'
);
check(
  'RabEstimasiView: totalPages hardcode dihapus',
  !rabViewSource.includes('totalPages={1}')
);
check(
  'RabEstimasiView: recalculate memakai helper null-safe',
  rabViewSource.includes('recalculateRabItemAmounts(projectRabItems)')
);

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('FAILED:', failures.join(' | '));
  process.exit(1);
}
