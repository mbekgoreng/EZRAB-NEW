/**
 * DED-to-RAB — WBS Catalog Alignment Tests (2026-10-28)
 * Mengunci penyelarasan katalog WBS dengan work-classification.md:
 *  - kategori bangunan lama tidak berubah (kode + nama + level),
 *  - interior mendapat BGN-12 (bukan "Lain-lain"),
 *  - bendung/irigasi mendapat BDM/IRG baik lewat katalog langsung
 *    maupun lewat fallback lintas katalog (proyek campuran),
 *  - jalan/drainase/jembatan/dinding penahan terpetakan benar,
 *  - kategori tak dikenal mempertahankan label & identitas item,
 *  - kategori + provenance bertahan lewat persistensi JSON dan
 *    finalisasi ke RAB (bukan hanya di layar hasil).
 *
 * Yang TIDAK diuji di sini (tidak ada infra UI test): render React
 * panel WBS dan grouping FullAiResultView (perubahan satu baris kunci
 * grup) — keduanya diverifikasi lewat tsc + review, bukan tes ini.
 */
import { getWbsCatalog } from '../ai-tools/ded-ai-estimate/wbsCatalog';
import { classifyToWbs, groupByWbs } from '../ai-tools/ded-ai-estimate/wbsClassifier';
import { mapDedAiItemToRabInput } from '../ai-tools/ded-ai-estimate/finalizeMapping';
import { createRabItemRecord } from '../engine/rab/rabItemFactory';
import type { DedAiItem } from '../ai-tools/ded-ai-estimate/types';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; } else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}
const codeOf = (name: string, pt: string) => classifyToWbs(mkItem({ name }), pt).node?.code;
const mkItem = (over: Partial<DedAiItem>): DedAiItem => ({
  id: 't1', name: 'Test', category: 'Test', units: 'm3', quantity: 1,
  quantitySource: 'DED_GEOMETRIC', unitPrice: 100000, priceSource: 'AI_ESTIMATE',
  subtotal: 100000, sourcePages: [], provenance: [], stage: 'CALCULATED', ...over,
} as DedAiItem);

console.log('=== 1. Kompatibilitas mundur: kode & nama lama utuh ===');
const legacy: Array<[string, string, string]> = [
  ['BANGUNAN', 'BGN-01', 'Pekerjaan Persiapan'], ['BANGUNAN', 'BGN-02', 'Pekerjaan Tanah'],
  ['BANGUNAN', 'BGN-03', 'Pekerjaan Pondasi'], ['BANGUNAN', 'BGN-04', 'Pekerjaan Struktur'],
  ['BANGUNAN', 'BGN-05', 'Pekerjaan Dinding'], ['BANGUNAN', 'BGN-06', 'Pekerjaan Atap'],
  ['BANGUNAN', 'BGN-07', 'Pekerjaan Lantai'], ['BANGUNAN', 'BGN-08', 'Kusen, Pintu & Jendela'],
  ['BANGUNAN', 'BGN-09', 'Pekerjaan Finishing'], ['BANGUNAN', 'BGN-10', 'Pekerjaan MEP'],
  ['BANGUNAN', 'BGN-11', 'Pekerjaan Luar'],
  ['JALAN', 'JLN-01', 'Pekerjaan Persiapan'], ['JALAN', 'JLN-02', 'Pekerjaan Tanah'],
  ['JALAN', 'JLN-03', 'Pekerjaan Drainase'], ['JALAN', 'JLN-04', 'Lapis Fondasi'],
  ['JALAN', 'JLN-05', 'Pekerjaan Perkerasan'], ['JALAN', 'JLN-06', 'Struktur Pelengkap'],
  ['JALAN', 'JLN-07', 'Perlengkapan Jalan'],
  ['BANGUNAN AIR', 'DRN-01', 'Pekerjaan Persiapan'], ['BANGUNAN AIR', 'DRN-02', 'Pekerjaan Tanah'],
  ['BANGUNAN AIR', 'DRN-03', 'Pekerjaan Struktur'],
  ['JEMBATAN', 'JMB-01', 'Pekerjaan Persiapan'], ['JEMBATAN', 'JMB-02', 'Struktur Bawah'],
  ['JEMBATAN', 'JMB-03', 'Struktur Atas'],
];
for (const [pt, code, name] of legacy) {
  const node = getWbsCatalog(pt).find((n) => n.code === code);
  check(`${code} tetap ${name}`, node?.name === name && node?.level === 'kelompok', `got ${node?.name}`);
}
check('GEDUNG masih berbagi katalog BANGUNAN (termasuk BGN-12)',
  getWbsCatalog('GEDUNG').some((n) => n.code === 'BGN-12'));
check('katalog lama tidak diganti namanya: BGN-04 tetap Pekerjaan Struktur',
  getWbsCatalog('BANGUNAN').find((n) => n.code === 'BGN-04')?.name === 'Pekerjaan Struktur');

console.log('=== 2. Interior ===');
check('kitchen set → BGN-12-B', codeOf('Kitchen set dapur', 'BANGUNAN') === 'BGN-12-B' || classifyToWbs(mkItem({ name: 'Kitchen set dapur', category: 'Pekerjaan Interior' }), 'BANGUNAN').node?.code === 'BGN-12-B', `got ${classifyToWbs(mkItem({ name: 'Kitchen set dapur', category: 'Pekerjaan Interior' }), 'BANGUNAN').node?.code}`);
check('lemari pakaian → BGN-12-A', classifyToWbs(mkItem({ name: 'Lemari pakaian jati', category: 'Pekerjaan Interior' }), 'BANGUNAN').node?.code === 'BGN-12-A');
check('partisi interior → BGN-12-C (bukan plafon)', classifyToWbs(mkItem({ name: 'Partisi interior gypsum', category: 'Pekerjaan Interior' }), 'BANGUNAN').node?.code === 'BGN-12-C');
check('furnitur → BGN-12-D', classifyToWbs(mkItem({ name: 'Furnitur ruang tamu', category: 'Pekerjaan Interior' }), 'BANGUNAN').node?.code === 'BGN-12-D');
check('lantai dapur tetap lantai (tidak dicuri interior)', classifyToWbs(mkItem({ name: 'Lantai dapur keramik', category: 'Pekerjaan Lantai' }), 'BANGUNAN').node?.code === 'BGN-07');

console.log('=== 3. Bendung & irigasi: katalog langsung ===');
check('tubuh bendung → BDM-05-A', classifyToWbs(mkItem({ name: 'Beton tubuh bendung', category: 'Struktur beton' }), 'BENDUNGAN').node?.code === 'BDM-05-A');
check('cofferdam → BDM-03', classifyToWbs(mkItem({ name: 'Cofferdam sungai', category: 'Pengalihan Sungai' }), 'BENDUNGAN').node?.code === 'BDM-03');
check('kolam olak → BDM-05-B', classifyToWbs(mkItem({ name: 'Kolam olak beton', category: 'Struktur beton' }), 'BENDUNGAN').node?.code === 'BDM-05-B');
check('spillway → BDM-08-A', classifyToWbs(mkItem({ name: 'Spillway beton', category: 'Spillway' }), 'BENDUNGAN').node?.code === 'BDM-08-A');
check('saluran irigasi → IRG-03', classifyToWbs(mkItem({ name: 'Saluran irigasi primer', category: 'Saluran Irigasi' }), 'IRIGASI').node?.code === 'IRG-03');
check('bangunan bagi → IRG-04', classifyToWbs(mkItem({ name: 'Bangunan bagi tersier', category: 'Bangunan Bagi' }), 'IRIGASI').node?.code === 'IRG-04');
check('sifon → IRG-06-A', classifyToWbs(mkItem({ name: 'Sifon beton', category: 'Sifon' }), 'IRIGASI').node?.code === 'IRG-06-A');

console.log('=== 4. Bendung & irigasi: fallback lintas katalog (proyek campuran) ===');
check('tubuh bendung di BANGUNAN AIR → BDM-05-A (bukan struktur drainase)',
  classifyToWbs(mkItem({ name: 'Beton tubuh bendung', category: 'Struktur beton' }), 'BANGUNAN AIR').node?.code === 'BDM-05-A');
check('saluran irigasi di BANGUNAN AIR → IRG-03 (bukan saluran drainase)',
  classifyToWbs(mkItem({ name: 'Saluran irigasi sekunder', category: 'Saluran Irigasi' }), 'BANGUNAN AIR').node?.code === 'IRG-03');
check('cofferdam di BANGUNAN → BDM-03',
  classifyToWbs(mkItem({ name: 'Cofferdam', category: '' }), 'BANGUNAN').node?.code === 'BDM-03');
check('pagar di JALAN → BGN-11-A (pagar tetap pagar; nama kelompoknya generik, bukan kategori tak terkait)',
  classifyToWbs(mkItem({ name: 'Pagar pengaman', category: 'Perlengkapan Jalan' }), 'JALAN').node?.code === 'BGN-11-A');

console.log('=== 5. Jalan, drainase, jembatan, penahan ===');
check('bahu + trotoar → JLN-07-C', classifyToWbs(mkItem({ name: 'Bahu jalan dan trotoar', category: 'Perlengkapan Jalan' }), 'JALAN').node?.code === 'JLN-07-C');
check('pengujian kepadatan → JLN-08', classifyToWbs(mkItem({ name: 'Pengujian kepadatan lapangan', category: 'Pengujian' }), 'JALAN').node?.code === 'JLN-08');
check('pipa distribusi di BANGUNAN AIR → DRN-03-D', classifyToWbs(mkItem({ name: 'Pemasangan pipa distribusi', category: 'Jaringan Pipa' }), 'BANGUNAN AIR').node?.code === 'DRN-03-D');
check('abutment → JMB-02-A', classifyToWbs(mkItem({ name: 'Abutment jembatan', category: 'Struktur Bawah' }), 'JEMBATAN').node?.code === 'JMB-02-A');
check('oprit → JMB-03-C', classifyToWbs(mkItem({ name: 'Oprit jembatan', category: 'Struktur Atas' }), 'JEMBATAN').node?.code === 'JMB-03-C');
check('dinding penahan → JLN-06-B', classifyToWbs(mkItem({ name: 'Dinding penahan tanah', category: 'Struktur Pelengkap' }), 'JALAN').node?.code === 'JLN-06-B');
check('paving halaman tetap BGN-11-B (tidak dicuri trotoar jalan)',
  classifyToWbs(mkItem({ name: 'Paving block halaman', category: 'Halaman & Parkir' }), 'BANGUNAN').node?.code === 'BGN-11-B');

console.log('=== 6. Campuran, unknown, status, edit ===');
const mixed = [
  mkItem({ id: 'm1', name: 'Beton tubuh bendung', category: 'Struktur beton' }),
  mkItem({ id: 'm2', name: 'Kolom praktis', category: 'Struktur' }),
  mkItem({ id: 'm3', name: 'Lapis Aus AC-WC', category: 'Perkerasan', units: 'm2' }),
];
const mg = groupByWbs(mixed, 'BANGUNAN');
const mgCodes = new Set(mg.groups.map((g) => g.node.code));
check('campuran: semua item terkelompok (tidak ada yang hilang)',
  mg.groups.flatMap((g) => g.items).length + mg.unclassified.length === 3);
check('campuran: ada kelompok bendung (induk BDM-05, bukan subkelompok mentah)', mgCodes.has('BDM-05'));
check('campuran: ada kelompok bangunan', mgCodes.has('BGN-04'));
check('campuran: ada kelompok jalan (induk JLN-05, bukan subkelompok mentah)', mgCodes.has('JLN-05'));
check('campuran: kategori asli tiap item dipertahankan',
  mg.groups.flatMap((g) => g.items).every((it) => ['Struktur beton', 'Struktur', 'Perkerasan'].includes(it.category)));
const weird = mkItem({ name: 'Pekerjaan aneh tak dikenal xyz', category: 'Kategori Aneh' });
check('unknown: node null (bukan klasifikasi ngawur)', classifyToWbs(weird, 'BANGUNAN').node === null);
const wu = groupByWbs([weird], 'BANGUNAN');
check('unknown: masuk unclassified dengan label & identitas utuh',
  wu.unclassified.length === 1 && wu.unclassified[0].category === 'Kategori Aneh' && wu.unclassified[0].name === 'Pekerjaan aneh tak dikenal xyz' && wu.unclassified[0].quantity === 1);
check('status: ASSUMPTION bendung → NEEDS_CONFIRM + node BDM',
  (() => { const r = classifyToWbs(mkItem({ name: 'Beton tubuh bendung', category: 'Struktur beton', quantitySource: 'ASSUMPTION' }), 'BENDUNGAN'); return r.status === 'NEEDS_CONFIRM' && r.node?.code === 'BDM-05-A'; })());
check('edit: ganti nama regrouping (kolom → kitchen set)',
  classifyToWbs(mkItem({ name: 'Kitchen set dapur', category: 'Pekerjaan Interior' }), 'BANGUNAN').node?.code === 'BGN-12-B');
check('katalog tak dikenal fallback ke BANGUNAN (perilaku lama)',
  getWbsCatalog('UNKNOWN_XYZ').length === getWbsCatalog('BANGUNAN').length);
check('grouping kosong aman', (() => { const r = groupByWbs([], 'BENDUNGAN'); return r.groups.length === 0 && r.unclassified.length === 0; })());

console.log('=== 7. Persistensi & finalisasi ===');
const damItem = mkItem({ id: 'dam-1', name: 'Beton tubuh bendung', category: 'Struktur beton', quantity: 120, unitPrice: 1000000, subtotal: null });
const grouped = groupByWbs([damItem], 'BENDUNGAN');
const classified = [...grouped.groups.flatMap((g) => g.items), ...grouped.unclassified][0];
const roundTripped = JSON.parse(JSON.stringify(classified));
check('persistensi JSON: kategori + wbsCode + wbsName + wbsStatus utuh',
  roundTripped.category === 'Struktur beton' && roundTripped.wbsCode === 'BDM-05-A' && roundTripped.wbsName === 'Tubuh Bendung' && roundTripped.wbsStatus === 'DERIVED');
const rabInput = mapDedAiItemToRabInput(damItem, 'DATABASE');
check('finalisasi: mapping membawa kategori asli', rabInput?.category === 'Struktur beton');
const record = rabInput ? createRabItemRecord(rabInput) : null;
check('finalisasi: factory mempertahankan kategori + NEEDS_VERIFICATION untuk fallback AI',
  (record as any)?.category === 'Struktur beton' && (record as any)?.verificationStatus === 'NEEDS_VERIFICATION');
const intInput = mapDedAiItemToRabInput(mkItem({ name: 'Kitchen set dapur', category: 'Pekerjaan Interior', quantity: 1 }), 'DATABASE');
check('finalisasi interior: kategori dipertahankan',
  intInput?.category === 'Pekerjaan Interior');

console.log(`\n=== HASIL: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) process.exit(1);
