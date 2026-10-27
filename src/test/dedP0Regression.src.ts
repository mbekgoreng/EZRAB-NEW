/**
 * FASE P0 Regression — klasifikasi halaman DED, kontrak 12 divisi, cakupan,
 * dan jejak seleksi halaman.
 *
 * Run: npx esbuild src/test/dedP0Regression.src.ts --bundle --platform=node
 *      --format=cjs --outfile=/tmp/dedp0.cjs && node /tmp/dedp0.cjs
 *
 * Kasus klasifikasi halaman memakai judul + kata isi NYATA dari fixture
 * rumah 1 lantai 32 halaman (~/workspace/user/files/pdf-gambar-rumah-1-lantai_compress.pdf,
 * file milik pengguna — TIDAK disalin ke repo). Ekspektasi diturunkan dari
 * judul yang terbaca pada PDF, bukan dari tebakan.
 */
import { classifyPageTitle } from '../ai-tools/ded-ai-estimate/parser';
import {
  DED_DIVISIONS, divisionCodeForWbs, buildDivisionCoverage, templateCandidatesForDivision,
} from '../ai-tools/ded-ai-estimate/divisions';
import { classifyToWbs } from '../ai-tools/ded-ai-estimate/wbsClassifier';
import { selectPagesWithTrace } from '../ai-tools/ded-ai-estimate/analysisTrace';
import { DedAiItem } from '../ai-tools/ded-ai-estimate/types';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

/* =====================================================================
 * 1. Klasifikasi halaman — 32 halaman fixture (judul nyata)
 * ===================================================================== */
console.log('\n== 1. Klasifikasi 32 halaman fixture ==');
const FIXTURE_PAGES: Array<{ page: number; text: string; expect: string }> = [
  { page: 1, text: 'GAMBAR GAMBAR ARSITEKTUR ARSITEKTUR', expect: 'HALAMAN' },
  { page: 2, text: 'DENAH DENAH 1:50 1:50 Kamar utama R. Keluarga R. Tamu KM/WC', expect: 'DENAH' },
  { page: 3, text: 'TAMPAK DEPAN TAMPAK DEPAN 1:50 1:50', expect: 'TAMPAK' },
  { page: 4, text: 'TAMPAK BELAKANG TAMPAK BELAKANG 1:50 1:50', expect: 'TAMPAK' },
  { page: 5, text: 'TAMPAK SAMPING KANAN TAMPAK SAMPING KANAN 1:50 1:50', expect: 'TAMPAK' },
  { page: 6, text: 'TAMPAK SAMPING KIRI TAMPAK SAMPING KIRI 1:50 Kaca Bening 5 mm', expect: 'TAMPAK' },
  { page: 7, text: 'Ruang Tamu Kamar POTONGAN A-A POTONGAN A-A 1:50 Ringbalk Atap Plafond', expect: 'POTONGAN' },
  { page: 8, text: 'POTONGAN B-B POTONGAN B-B 1:50 Kamar R. Makan Kaca Bening 5 mm', expect: 'POTONGAN' },
  { page: 9, text: 'DENAH KUSEN DENAH KUSEN 1:50 P1 P1 J1 J1 P2 P2 J2 J2 BV1', expect: 'JADWAL_KUSEN' },
  { page: 10, text: 'POT. X POT. X Skala 1 : 30 POT. Y Kusen Aluminium 4 " Doubel Multipleks 18 mm Finishing HPL', expect: 'DETAIL_KUSEN' },
  { page: 11, text: '2 2 0 0 3 3 8 8 Rangaka Jendela Aluminium Kusen Aluminium Kaca Bening 5 mm', expect: 'DETAIL_KUSEN' },
  { page: 12, text: 'DENAH KERAMIK DENAH KERAMIK 1:50 Keramik 40x40', expect: 'LANTAI' },
  { page: 13, text: 'DENAH PLAFOND DENAH PLAFOND 1:50 Gypsum +3.20 GRC', expect: 'PLAFOND' },
  { page: 14, text: 'DENAH ATAP DENAH ATAP 1:50 Atap Metal Spandek Kuda - Kuda Baja Ringan Reng Baja Ringan', expect: 'ATAP' },
  { page: 15, text: 'DETAIL ATAP DETAIL ATAP 1:30 Nok Spandek Plafond Gypsum Board T = 9 mm Rangka Kuda - Kuda', expect: 'ATAP' },
  { page: 16, text: 'TAMPAK A TAMPAK A 1:30 TAMPAK C TAMPAK B Keramik Unpolished 25 x 25', expect: 'TAMPAK' },
  { page: 17, text: 'GAMBAR GAMBAR STRUKTUR STRUKTUR', expect: 'STRUKTUR' },
  { page: 18, text: 'DENAH PONDASI DENAH PONDASI 1:50 1500', expect: 'STRUKTUR' },
  { page: 19, text: 'DETAIL A DETAIL A 1:20 DETAIL B Pondasi Batu Gunung Cor Lantai Kerja T = 50 mm Pasir Urug', expect: 'STRUKTUR' },
  { page: 20, text: 'DENAH SLOOF DENAH SLOOF 1:50 K.P K.P', expect: 'STRUKTUR' },
  { page: 21, text: 'DENAH SLOOF DENAH SLOOF 1:50 Sloof 15x20', expect: 'STRUKTUR' },
  { page: 22, text: 'DENAH RINGBALK ELV +4.00 DENAH RINGBALK ELV +4.00 1:50 Ringbalk', expect: 'STRUKTUR' },
  { page: 23, text: 'DENAH RINGBALK ELV +3.50 DENAH RINGBALK ELV +3.50 1:50', expect: 'STRUKTUR' },
  { page: 24, text: 'DENAH RINGBALK ELV +3.00 DENAH RINGBALK ELV +3.00 1:50', expect: 'STRUKTUR' },
  { page: 25, text: 'DENAH PELAT ELV +3.50 DENAH PELAT ELV +3.50 1:50', expect: 'STRUKTUR' },
  { page: 26, text: 'DENAH PELAT ELV +3.00 DENAH PELAT ELV +3.00 1:50 Pelat t = 10', expect: 'STRUKTUR' },
  { page: 27, text: 'GAMBAR GAMBAR MEKANIKAL & ELEKTRIKAL MEKANIKAL & ELEKTRIKAL', expect: 'MEP' },
  { page: 28, text: 'DENAH INSTALASI AIR BERSIH DENAH INSTALASI AIR BERSIH 1:50', expect: 'MEP_PLUMBING' },
  { page: 29, text: 'DENAH INSTALASI AIR KOTOR DENAH INSTALASI AIR KOTOR 1:50', expect: 'MEP_PLUMBING' },
  { page: 30, text: 'DENAH INSTALASI AIR KOTOR DENAH INSTALASI AIR KOTOR 1:50', expect: 'MEP_PLUMBING' },
  { page: 31, text: 'DENAH INSTALASI LISTRIK DENAH INSTALASI LISTRIK 1:50', expect: 'MEP_ELECTRICAL' },
  { page: 32, text: 'DENAH INSTALASI LISTRIK DENAH INSTALASI LISTRIK 1:50', expect: 'MEP_ELECTRICAL' },
];
const dist: Record<string, number> = {};
for (const fp of FIXTURE_PAGES) {
  const got = classifyPageTitle(fp.text);
  dist[got] = (dist[got] || 0) + 1;
  check(`1.p${fp.page} → ${fp.expect}`, got === fp.expect, `got ${got}`);
}
check('1.dist DENAH hanya 1 (dulu 16)', dist['DENAH'] === 1, JSON.stringify(dist));
check('1.dist STRUKTUR 10 (dulu 3)', dist['STRUKTUR'] === 10);
check('1.dist MEP_PLUMBING 3 (dulu MEP 0)', dist['MEP_PLUMBING'] === 3);
check('1.dist MEP_ELECTRICAL 2', dist['MEP_ELECTRICAL'] === 2);
check('1.dist JADWAL_KUSEN 1 (dulu 0)', dist['JADWAL_KUSEN'] === 1);
check('1.dist total 32', Object.values(dist).reduce((a, b) => a + b, 0) === 32);

/* =====================================================================
 * 2. Klasifikasi — variasi kapital, istilah gabungan, ambigu
 * ===================================================================== */
console.log('\n== 2. Variasi & kasus ambigu ==');
check('2.1 lowercase penuh', classifyPageTitle('denah instalasi air bersih 1:50') === 'MEP_PLUMBING');
check('2.2 Judul kapital campuran', classifyPageTitle('Denah Kusen dan Pintu') === 'JADWAL_KUSEN');
check('2.3 Detail Kusen eksplisit', classifyPageTitle('DETAIL KUSEN P1 Skala 1:20') === 'DETAIL_KUSEN');
check('2.4 Denah Plafon (satu f)', classifyPageTitle('Denah Plafon Gypsum') === 'PLAFOND');
check('2.5 DENAH LANTAI 1 tetap DENAH', classifyPageTitle('DENAH LANTAI 1 1:50') === 'DENAH');
check('2.6 DENAH WC → SANITAIR', classifyPageTitle('DENAH WC 1:50') === 'SANITAIR');
check('2.7 JADWAL KUSEN eksplisit', classifyPageTitle('JADWAL KUSEN DAN PINTU') === 'JADWAL_KUSEN');
check('2.8 DENAH SITUASI → SITUASI', classifyPageTitle('DENAH SITUASI 1:500') === 'SITUASI');
check('2.9 RKS → SPESIFIKASI', classifyPageTitle('RKS dan Spesifikasi Teknis Pekerjaan') === 'SPESIFIKASI');
check('2.10 teks kosong → HALAMAN', classifyPageTitle('') === 'HALAMAN');
check('2.11 lembar pengesahan → HALAMAN', classifyPageTitle('Lembar pengesahan proyek pembangunan rumah') === 'HALAMAN');
check('2.12 "arsitektur" bukan SITUASI (jebakan substring site)', classifyPageTitle('GAMBAR ARSITEKTUR') === 'HALAMAN');
check('2.13 denah pondasi gabungan', classifyPageTitle('Denah Pondasi dan Sloof') === 'STRUKTUR');
check('2.14 instalasi tanpa kualifikasi → MEP', classifyPageTitle('DENAH INSTALASI 1:50') === 'MEP');

/* =====================================================================
 * 3. Kontrak 12 divisi + pemetaan WBS lama
 * ===================================================================== */
console.log('\n== 3. Kontrak 12 divisi ==');
const EXPECTED_DIVISIONS = [
  'Pekerjaan Persiapan', 'Pekerjaan Tanah dan Pondasi', 'Pekerjaan Struktur Beton',
  'Pekerjaan Dinding dan Plesteran', 'Pekerjaan Atap', 'Pekerjaan Plafond',
  'Pekerjaan Lantai dan Dinding Keramik', 'Pekerjaan Kusen, Pintu dan Jendela',
  'Pekerjaan Pengecatan', 'Pekerjaan Sanitair dan Plambing',
  'Pekerjaan Instalasi Listrik', 'Pekerjaan Finishing dan Pembersihan',
];
check('3.1 tepat 12 divisi', DED_DIVISIONS.length === 12);
check('3.2 nama & urutan sesuai kontrak',
  DED_DIVISIONS.every((d, i) => d.name === EXPECTED_DIVISIONS[i] && d.order === i + 1 && d.code === `DIV-${String(i + 1).padStart(2, '0')}`));
check('3.3 BGN-01 → DIV-01', divisionCodeForWbs('BGN-01') === 'DIV-01');
check('3.4 BGN-02-A (galian) → DIV-02', divisionCodeForWbs('BGN-02-A') === 'DIV-02');
check('3.5 BGN-03-A (pondasi) → DIV-02', divisionCodeForWbs('BGN-03-A') === 'DIV-02');
check('3.6 BGN-04-D (ringbalk) → DIV-03', divisionCodeForWbs('BGN-04-D') === 'DIV-03');
check('3.7 BGN-05-B (plesteran) → DIV-04', divisionCodeForWbs('BGN-05-B') === 'DIV-04');
check('3.8 BGN-06-A (rangka atap) → DIV-05', divisionCodeForWbs('BGN-06-A') === 'DIV-05');
check('3.9 BGN-06-C (plafon) → DIV-06, BUKAN DIV-05', divisionCodeForWbs('BGN-06-C') === 'DIV-06');
check('3.10 BGN-07 → DIV-07', divisionCodeForWbs('BGN-07') === 'DIV-07');
check('3.11 BGN-08-B (pintu) → DIV-08', divisionCodeForWbs('BGN-08-B') === 'DIV-08');
check('3.12 BGN-09-A (pengecatan) → DIV-09', divisionCodeForWbs('BGN-09-A') === 'DIV-09');
check('3.13 BGN-10-B (plumbing) → DIV-10', divisionCodeForWbs('BGN-10-B') === 'DIV-10');
check('3.14 BGN-10-A (listrik) → DIV-11', divisionCodeForWbs('BGN-10-A') === 'DIV-11');
check('3.15 BGN-10 (MEP generik) → null (tidak diklaim sepihak)', divisionCodeForWbs('BGN-10') === null);
check('3.16 BGN-11 (pekerjaan luar) → null', divisionCodeForWbs('BGN-11') === null);
check('3.17 kode kosong → null', divisionCodeForWbs(undefined) === null && divisionCodeForWbs(null) === null);

/* =====================================================================
 * 4. Pemeriksaan cakupan (coverage)
 * ===================================================================== */
console.log('\n== 4. Coverage 12 divisi ==');
const mkClassified = (id: string, wbsCode: string, wbsStatus: string) =>
  ({ id, wbsCode, wbsStatus } as unknown as Pick<DedAiItem, 'id' | 'wbsCode' | 'wbsStatus'>);

const cov1 = buildDivisionCoverage({
  classifiedItems: [
    mkClassified('i1', 'BGN-04-B', 'IDENTIFIED'),   // kolom → DIV-03
    mkClassified('i2', 'BGN-10-A', 'NEEDS_CONFIRM'), // listrik inferensi → DIV-11
    mkClassified('i3', 'BGN-06-C', 'DERIVED'),       // plafon → DIV-06
  ],
  pages: [
    { page: 9, pageType: 'JADWAL_KUSEN' },
    { page: 28, pageType: 'MEP_PLUMBING' },
  ],
  projectType: 'BANGUNAN',
});
const byCode = (list: typeof cov1, code: string) => list.find((d) => d.divisionCode === code)!;
check('4.1 selalu 12 entri berurutan', cov1.length === 12 && cov1[0].divisionCode === 'DIV-01' && cov1[11].divisionCode === 'DIV-12');
check('4.2 DIV-03 IDENTIFIED dari item DED', byCode(cov1, 'DIV-03').status === 'IDENTIFIED' && byCode(cov1, 'DIV-03').itemIds.includes('i1'));
check('4.3 DIV-06 IDENTIFIED (DERIVED)', byCode(cov1, 'DIV-06').status === 'IDENTIFIED');
check('4.4 DIV-11 ASSUMPTION (hanya NEEDS_CONFIRM)', byCode(cov1, 'DIV-11').status === 'ASSUMPTION_REQUIRES_CONFIRMATION');
check('4.5 DIV-08 INSUFFICIENT_DATA (halaman ada, item tidak ada)',
  byCode(cov1, 'DIV-08').status === 'INSUFFICIENT_DATA' && byCode(cov1, 'DIV-08').evidencePages.includes(9));
check('4.6 DIV-10 INSUFFICIENT_DATA (bukti MEP_PLUMBING hal. 28)',
  byCode(cov1, 'DIV-10').status === 'INSUFFICIENT_DATA' && byCode(cov1, 'DIV-10').evidencePages.includes(28));
check('4.7 DIV-05 ASSUMPTION dari scaffold template',
  byCode(cov1, 'DIV-05').status === 'ASSUMPTION_REQUIRES_CONFIRMATION' && byCode(cov1, 'DIV-05').assumptionCandidates.length === 2);
check('4.8 kandidat asumsi TANPA quantity/unitPrice (tidak difabrikasi)',
  byCode(cov1, 'DIV-05').assumptionCandidates.every((c) => !('quantity' in c) && !('unitPrice' in c) && c.source === 'TEMPLATE_RUMAH_TIPE36'));
check('4.9 DIV-12 INSUFFICIENT_DATA (tanpa scaffold)', byCode(cov1, 'DIV-12').status === 'INSUFFICIENT_DATA' && byCode(cov1, 'DIV-12').assumptionCandidates.length === 0);
check('4.10 DIV-02 kandidat scaffold = tanah(2) + pondasi(1) = 3',
  templateCandidatesForDivision(DED_DIVISIONS[1]).length === 3);
check('4.11 spek DED mengalahkan template: DIV-03 tanpa kandidat asumsi',
  byCode(cov1, 'DIV-03').assumptionCandidates.length === 0);

const cov2 = buildDivisionCoverage({ classifiedItems: [], pages: [], projectType: 'JALAN' });
check('4.12 non-bangunan: semua NOT_APPLICABLE', cov2.every((d) => d.status === 'NOT_APPLICABLE'));
const cov3 = buildDivisionCoverage({
  classifiedItems: [mkClassified('x1', 'BGN-04-B', 'IDENTIFIED')],
  pages: [], projectType: 'JALAN',
});
check('4.13 item teridentifikasi tetap IDENTIFIED walau tipe proyek lain',
  byCode(cov3, 'DIV-03').status === 'IDENTIFIED' && byCode(cov3, 'DIV-01').status === 'NOT_APPLICABLE');

/* =====================================================================
 * 5. Integrasi classifier WBS → divisi
 * ===================================================================== */
console.log('\n== 5. Classifier WBS → divisi ==');
const mkItem = (name: string): DedAiItem => ({
  id: 't', name, category: 'Umum', units: 'm2', quantity: 10, quantitySource: 'DED_EXPLICIT',
  unitPrice: 1000, priceSource: 'AI_ESTIMATE', subtotal: 10000, sourcePages: [1],
  provenance: [], stage: 'CALCULATED',
});
const plafon = classifyToWbs(mkItem('Pasangan Plafon Gypsum Board'), 'BANGUNAN');
check('5.1 item plafon → BGN-06-C → DIV-06',
  plafon.node?.code === 'BGN-06-C' && divisionCodeForWbs(plafon.node?.code) === 'DIV-06');
const lampu = classifyToWbs(mkItem('Instalasi Listrik — Titik Lampu & Stop Kontak'), 'BANGUNAN');
check('5.2 item listrik → DIV-11', divisionCodeForWbs(lampu.node?.code) === 'DIV-11', `node=${lampu.node?.code}`);
const airBersih = classifyToWbs(mkItem('Instalasi Air Bersih PVC'), 'BANGUNAN');
check('5.3 item air bersih → DIV-10', divisionCodeForWbs(airBersih.node?.code) === 'DIV-10', `node=${airBersih.node?.code}`);

/* =====================================================================
 * 6. Seleksi halaman + jejak (tidak ada halaman hilang diam-diam)
 * ===================================================================== */
console.log('\n== 6. Seleksi halaman & jejak ==');
const mkPage = (page: number, pageType: string, chars: number) => ({
  page, title: `Page ${page}`, text: 'x'.repeat(chars), pageType,
});
const manyPages = [
  mkPage(1, 'HALAMAN', 1000), mkPage(2, 'DENAH', 1000), mkPage(3, 'TAMPAK', 1000),
  mkPage(4, 'DENAH', 1000), mkPage(5, 'STRUKTUR', 1000), mkPage(6, 'DENAH', 1000),
  mkPage(7, 'SPESIFIKASI', 1000), mkPage(8, 'DENAH', 1000),
];
/* TANPA BATAS BUANG (owner 2026-10-27): tidak ada budget total, tidak
 * ada potong per-halaman — semua halaman berteks terkirim utuh. */
const sel = selectPagesWithTrace(manyPages as never);
check('6.1 semua halaman tercatat di jejak', sel.trace.length === 8);
check('6.2 tanpa batas buang: 0 terlewat, tidak ada SKIPPED_BUDGET',
  sel.skippedCount === 0 && sel.trace.every((t) => t.status !== 'SKIPPED_BUDGET'));
check('6.3 selected = total (tidak ada yang dibuang)', sel.selected.length === 8);
check('6.4 prioritas jenis tetap mengurutkan (DENAH sebelum HALAMAN)',
  sel.selected.findIndex((x) => x.page === 8) < sel.selected.findIndex((x) => x.page === 1));
const selCap = selectPagesWithTrace([mkPage(1, 'DENAH', 5000)] as never);
check('6.5 teks panjang terkirim utuh tanpa potong (sent 5000 dari 5000)',
  selCap.trace[0].sentChars === 5000 && selCap.trace[0].totalChars === 5000);
check('6.6 semua halaman berstatus SENT', sel.trace.every((t) => t.status === 'SENT'));

console.log(`\n=== HASIL: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) process.exit(1);
