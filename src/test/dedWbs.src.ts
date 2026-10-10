/**
 * WBS Tests — klasifikasi, anti-duplikasi, subtotal konsisten
 * Run: npx esbuild src/test/dedWbs.src.ts --bundle --platform=node --format=cjs --outfile=/tmp/dedwbs.cjs && node /tmp/dedwbs.cjs
 */
import { getWbsCatalog } from '../ai-tools/ded-ai-estimate/wbsCatalog';
import { classifyToWbs, groupByWbs, getOptionalCandidates } from '../ai-tools/ded-ai-estimate/wbsClassifier';
import { DedAiItem } from '../ai-tools/ded-ai-estimate/types';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

function mkItem(over: Partial<DedAiItem>): DedAiItem {
  return {
    id: 'test-1', name: 'Test', category: 'Test', units: 'm3',
    quantity: 1, quantitySource: 'DED_GEOMETRIC', unitPrice: 100000,
    priceSource: 'AI_ESTIMATE', subtotal: 100000, sourcePages: [],
    provenance: [], stage: 'CALCULATED',
    ...over,
  } as DedAiItem;
}

console.log('=== WBS TESTS ===');
console.log('');

// 1. Katalog tersedia per kategori
console.log('1. Katalog');
check('1.1 BANGUNAN ada', getWbsCatalog('BANGUNAN').length > 0);
check('1.2 JALAN ada', getWbsCatalog('JALAN').length > 0);
check('1.3 BANGUNAN AIR ada', getWbsCatalog('BANGUNAN AIR').length > 0);
check('1.4 JEMBATAN ada', getWbsCatalog('JEMBATAN').length > 0);
const bgnGroups = getWbsCatalog('BANGUNAN').filter((n) => n.level === 'kelompok');
check('1.5 BANGUNAN punya 11 kelompok', bgnGroups.length === 11, `got ${bgnGroups.length}`);
// WBS jalan tidak dipakai untuk bangunan
const jlnCodes = new Set(getWbsCatalog('JALAN').map((n) => n.code));
const bgnCodes = new Set(getWbsCatalog('BANGUNAN').map((n) => n.code));
check('1.6 katalog jalan ≠ katalog bangunan', !jlnCodes.has('BGN-04'));
console.log('');

// 2. Klasifikasi
console.log('2. Klasifikasi');
const kolom = mkItem({ name: 'Kolom Praktis 15x15', category: 'Struktur' });
const c1 = classifyToWbs(kolom, 'BANGUNAN');
check('2.1 kolom → BGN-04-B', c1.node?.code === 'BGN-04-B', `got ${c1.node?.code}`);

const lapisAus = mkItem({ name: 'Lapis Aus AC-WC', category: 'Perkerasan Jalan', units: 'm2' });
const c2 = classifyToWbs(lapisAus, 'JALAN');
check('2.2 lapis aus → JLN-05-A', c2.node?.code === 'JLN-05-A', `got ${c2.node?.code}`);

// Satu item = satu kelompok (tidak duplikat)
const dinding = mkItem({ name: 'Dinding Bata Merah', category: 'Dinding', units: 'm2' });
const c3 = classifyToWbs(dinding, 'BANGUNAN');
check('2.3 dinding hanya satu kode', c3.node?.code === 'BGN-05-A', `got ${c3.node?.code}`);

// Rumah tanpa plafon → tidak ada item plafon (bukan error)
const noPlafon = mkItem({ name: 'Rangka Atap Baja Ringan', category: 'Atap', units: 'm2' });
const c4 = classifyToWbs(noPlafon, 'BANGUNAN');
check('2.4 rangka atap → BGN-06-A (bukan plafon)', c4.node?.code === 'BGN-06-A', `got ${c4.node?.code}`);
console.log('');

// 3. Status
console.log('3. Status');
const identified = mkItem({ quantitySource: 'DED_EXPLICIT' });
check('3.1 DED_EXPLICIT → IDENTIFIED', classifyToWbs(identified, 'BANGUNAN').status === 'IDENTIFIED');
const derived = mkItem({ quantitySource: 'DERIVED' });
check('3.2 DERIVED → DERIVED', classifyToWbs(derived, 'BANGUNAN').status === 'DERIVED');
const inference = mkItem({ quantitySource: 'AI_INFERENCE' });
check('3.3 AI_INFERENCE → NEEDS_CONFIRM', classifyToWbs(inference, 'BANGUNAN').status === 'NEEDS_CONFIRM');
const unresolved = mkItem({ quantity: null, quantitySource: 'UNRESOLVED' });
check('3.4 UNRESOLVED → NEEDS_CONFIRM', classifyToWbs(unresolved, 'BANGUNAN').status === 'NEEDS_CONFIRM');
console.log('');

// 4. Grouping & subtotal
console.log('4. Grouping');
const items = [
  mkItem({ id: '1', name: 'Pondasi Batu Kali', category: 'Pondasi', quantity: 8.5, subtotal: 8075000 }),
  mkItem({ id: '2', name: 'Sloof 15x20', category: 'Struktur', quantity: 1.02, subtotal: 4590000 }),
  mkItem({ id: '3', name: 'Kolom Praktis', category: 'Struktur', quantity: 0.81, subtotal: 3645000 }),
  mkItem({ id: '4', name: 'Dinding Bata', category: 'Dinding', units: 'm2', quantity: 92.5, subtotal: 16187500 }),
];
const { groups, unclassified } = groupByWbs(items, 'BANGUNAN');
check('4.1 ada kelompok', groups.length > 0, `got ${groups.length}`);
// Subtotal kelompok = jumlah subtotal item (konsisten dengan kalkulator kanonis)
const totalFromGroups = groups.reduce((s, g) => s + g.subtotal, 0);
const totalFromItems = items.reduce((s, it) => s + (it.subtotal || 0), 0);
check('4.2 subtotal kelompok = total item', totalFromGroups === totalFromItems,
  `groups=${totalFromGroups}, items=${totalFromItems}`);
// Klasifikasi tidak mengubah quantity/provenance
check('4.3 quantity tidak berubah', groups.every((g) =>
  g.items.every((it) => {
    const orig = items.find((o) => o.id === it.id);
    return orig && it.quantity === orig.quantity && it.subtotal === orig.subtotal;
  })
));
console.log('');

// 5. Kelompok kosong tidak ditampilkan
console.log('5. Kelompok kosong');
const onlyPondasi = [mkItem({ id: '1', name: 'Pondasi Batu Kali', category: 'Pondasi' })];
const { groups: g5 } = groupByWbs(onlyPondasi, 'BANGUNAN');
const hasAtap = g5.some((g) => g.node.code === 'BGN-06');
check('5.1 kelompok atap tidak muncul jika kosong', !hasAtap);
check('5.2 hanya kelompok dengan item', g5.every((g) => g.items.length > 0));
console.log('');

// 6. Kandidat opsional tidak masuk total
console.log('6. Kandidat opsional');
const existingCodes = new Set(['BGN-03-A', 'BGN-04-A']);
const candidates = getOptionalCandidates('BANGUNAN', existingCodes);
check('6.1 ada kandidat', candidates.length > 0);
check('6.2 kandidat tidak termasuk yang sudah ada',
  candidates.every((c) => !existingCodes.has(c.code)));
check('6.3 kandidat level subkelompok', candidates.every((c) => c.level === 'subkelompok'));
console.log('');

// 7. Proyek tanpa pagar
console.log('7. Tanpa pagar');
const noPagarItems = [mkItem({ name: 'Pondasi', category: 'Pondasi' })];
const { groups: g7 } = groupByWbs(noPagarItems, 'BANGUNAN');
const hasPagar = g7.some((g) => g.node.code === 'BGN-11-A');
check('7.1 pagar tidak muncul otomatis', !hasPagar);
console.log('');

// 8. Jalan: jenis perkerasan berbeda
console.log('8. Jalan');
const acwc = mkItem({ name: 'Lapis Aus AC-WC', category: 'Perkerasan', units: 'm2' });
const acbc = mkItem({ name: 'Lapis Antara AC-BC', category: 'Perkerasan', units: 'm2' });
check('8.1 AC-WC → JLN-05-A', classifyToWbs(acwc, 'JALAN').node?.code === 'JLN-05-A');
check('8.2 AC-BC → JLN-05-B', classifyToWbs(acbc, 'JALAN').node?.code === 'JLN-05-B');
check('8.3 kode berbeda (tidak duplikat)', 
  classifyToWbs(acwc, 'JALAN').node?.code !== classifyToWbs(acbc, 'JALAN').node?.code);
console.log('');

console.log(`=== HASIL: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) process.exit(1);
