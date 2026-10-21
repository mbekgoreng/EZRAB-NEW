/**
 * FINAL REVIEW — Regresi Tugas A (metadata multi-file) & Tugas B
 * (klasifikasi item listrik WBS).
 *
 * Run: node -e "require('esbuild').buildSync({entryPoints:['src/test/dedFinalReview.src.ts'],bundle:true,platform:'node',format:'cjs',external:['exceljs'],outfile:'/tmp/dedfinal.cjs',logLevel:'error'})" && node /tmp/dedfinal.cjs
 *
 * Tugas A menguji fungsi murni yang dipakai view.tsx jalur gabungan:
 * mergeAnalysisTraces (agregasi jejak nyata per file) dan pola hitung ulang
 * coverage dari item gabungan (groupByWbs + buildDivisionCoverage) — persis
 * urutan yang dijalankan view setelah DedAiCalculator.buildOutput.
 * Tugas B menguji classifyToWbs untuk perangkat listrik berkonteks.
 */
import { mergeAnalysisTraces, FileTraceInput } from '../ai-tools/ded-ai-estimate/analysisTrace';
import { buildDivisionCoverage } from '../ai-tools/ded-ai-estimate/divisions';
import { classifyToWbs, groupByWbs } from '../ai-tools/ded-ai-estimate/wbsClassifier';
import { DedAiItem, DedAnalysisTrace } from '../ai-tools/ded-ai-estimate/types';
import { divisionCodeForWbs } from '../ai-tools/ded-ai-estimate/divisions';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const mkItem = (id: string, name: string): DedAiItem => ({
  id, name, category: 'Umum', units: 'm2', quantity: 10, quantitySource: 'DED_EXPLICIT',
  unitPrice: 1000, priceSource: 'AI_ESTIMATE', subtotal: 10000, sourcePages: [1],
  provenance: [], stage: 'CALCULATED',
});

const mkTrace = (pages: number, passes: number, skipped: number): DedAnalysisTrace => ({
  totalPages: pages,
  selectedPageCount: pages - skipped,
  skippedPageCount: skipped,
  totalCharsBudget: 45000,
  totalCharsSent: 12000,
  pages: Array.from({ length: pages }, (_, i) => ({
    page: i + 1,
    title: `Hal ${i + 1}`,
    pageType: i === 0 ? 'DENAH' : 'STRUKTUR',
    totalChars: 400,
    sentChars: i < pages - skipped ? 400 : 0,
    status: (i < pages - skipped ? 'SENT' : 'SKIPPED_BUDGET') as 'SENT' | 'SKIPPED_BUDGET',
    passIndex: 0,
    clusterLabel: 'Arsitektur & Ruang',
  })),
  passes: Array.from({ length: passes }, (_, i) => ({
    passIndex: i,
    clusterLabel: `Klaster ${i + 1}`,
    pageTypes: ['DENAH'],
    pages: [1],
    productId: 'DED_AI_FAST',
    mode: 'FAST' as const,
    maxTokens: 8000,
    status: 'OK' as const,
    itemCount: 3,
  })),
  warnings: ['1 halaman tidak dikirim ke model karena budget teks FAST (45000 karakter).'],
});

/* =====================================================================
 * A1. Satu file: jejak dipertahankan utuh + sourceFile tertera
 * ===================================================================== */
console.log('\n== A1. Merge jejak — satu file ==');
const single = mergeAnalysisTraces(
  [{ fileName: 'gambar-a.pdf', pageOffset: 0, trace: mkTrace(5, 2, 1) }],
  5
);
check('A1.1 trace gabungan ada', !!single);
check('A1.2 total halaman = 5', single?.totalPages === 5);
check('A1.3 halaman terpilih 4 / terlewat 1', single?.selectedPageCount === 4 && single?.skippedPageCount === 1);
check('A1.4 semua halaman membawa sourceFile', single?.pages.every((p) => p.sourceFile === 'gambar-a.pdf') === true);
check('A1.5 passIndex halaman tidak berubah (offset 0)', single?.pages[0].passIndex === 0);
check('A1.6 warning diberi prefiks file', single?.warnings[0]?.startsWith('[gambar-a.pdf]') === true);

/* =====================================================================
 * A2. Multi-file: offset halaman + renumber pass + total agregat
 * ===================================================================== */
console.log('\n== A2. Merge jejak — dua file ==');
const multi = mergeAnalysisTraces(
  [
    { fileName: 'gambar-a.pdf', pageOffset: 0, trace: mkTrace(32, 8, 2) },
    { fileName: 'gambar-b.pdf', pageOffset: 32, trace: mkTrace(4, 1, 0) },
  ],
  36
);
check('A2.1 total halaman gabungan 36', multi?.totalPages === 36);
check('A2.2 halaman file kedua dioffset (33..36)',
  multi?.pages.filter((p) => p.sourceFile === 'gambar-b.pdf').map((p) => p.page).join(',') === '33,34,35,36');
check('A2.3 pass file kedua direnumber global (8)',
  multi?.passes.find((p) => p.sourceFile === 'gambar-b.pdf')?.passIndex === 8);
check('A2.4 nomor halaman di dalam pass file kedua ikut dioffset (33)',
  multi?.passes.find((p) => p.sourceFile === 'gambar-b.pdf')?.pages[0] === 33);
check('A2.5 passIndex pada entri halaman file kedua ikut direnumber (8)',
  multi?.pages.find((p) => p.sourceFile === 'gambar-b.pdf')?.passIndex === 8);
check('A2.6 agregat terpilih = 30 + 4', multi?.selectedPageCount === 34);
check('A2.7 agregat terlewat = 2', multi?.skippedPageCount === 2);
check('A2.8 budget agregat = 2 × 45000', multi?.totalCharsBudget === 90000);

/* =====================================================================
 * A3. File tanpa jejak: keterbatasan eksplisit, data file lain utuh
 * ===================================================================== */
console.log('\n== A3. Merge jejak — satu file tanpa jejak ==');
const partial = mergeAnalysisTraces(
  [
    { fileName: 'gambar-a.pdf', pageOffset: 0, trace: mkTrace(3, 1, 0) },
    { fileName: 'gambar-b.pdf', pageOffset: 3, trace: undefined },
  ],
  10
);
check('A3.1 trace tetap terbentuk dari file yang punya jejak', !!partial && partial.pages.length === 3);
check('A3.2 warning keterbatasan menyebut nama file',
  partial?.warnings.some((w) => w.includes('gambar-b.pdf') && w.includes('tidak tersedia')) === true);
check('A3.3 totalPages tetap fakta gabungan (10)', partial?.totalPages === 10);
check('A3.4 tidak ada halaman karangan untuk file tanpa jejak',
  partial?.pages.every((p) => p.sourceFile === 'gambar-a.pdf') === true);
check('A3.5 daftar kosong → undefined', mergeAnalysisTraces([], 0) === undefined);

/* =====================================================================
 * A4. Coverage dihitung ulang dari item gabungan (pola view.tsx)
 * ===================================================================== */
console.log('\n== A4. Coverage dari item gabungan multi-file ==');
const mergedItems: DedAiItem[] = [
  { ...mkItem('dedai-f1-1', 'Pasangan Dinding Bata Merah'), sourcePages: [2] },
  { ...mkItem('dedai-f2-1', 'Instalasi Titik Lampu'), sourcePages: [33] },
];
const grouped = groupByWbs(mergedItems, 'BANGUNAN');
const coverage = buildDivisionCoverage({
  classifiedItems: [...grouped.groups.flatMap((g) => g.items), ...grouped.unclassified],
  pages: [
    { page: 2, pageType: 'DENAH' },
    { page: 33, pageType: 'MEP_ELECTRICAL' },
  ],
  projectType: 'BANGUNAN',
});
check('A4.1 selalu 12 divisi', coverage.length === 12);
const div11 = coverage.find((d) => d.divisionCode === 'DIV-11');
check('A4.2 DIV-11 (Listrik) IDENTIFIED dari item file kedua', div11?.status === 'IDENTIFIED', `status=${div11?.status}`);
check('A4.3 itemIds coverage = id gabungan view (dedai-f2-1)',
  JSON.stringify(div11?.itemIds) === JSON.stringify(['dedai-f2-1']), `ids=${div11?.itemIds}`);
check('A4.4 evidencePages memakai nomor global (33)', div11?.evidencePages.includes(33) === true);
const div04 = coverage.find((d) => d.divisionCode === 'DIV-04');
check('A4.5 DIV-04 (Dinding) IDENTIFIED', div04?.status === 'IDENTIFIED' && div04.itemIds.includes('dedai-f1-1'));

/* =====================================================================
 * B. Klasifikasi item listrik (Tugas B)
 * ===================================================================== */
console.log('\n== B. Classifier WBS — perangkat listrik ==');
const code = (name: string, pt = 'BANGUNAN') => classifyToWbs(mkItem('t', name), pt).node?.code;

check('B1 "Instalasi Titik Lampu" → BGN-10-A', code('Instalasi Titik Lampu') === 'BGN-10-A', `got=${code('Instalasi Titik Lampu')}`);
check('B1b → divisi DIV-11', divisionCodeForWbs(code('Instalasi Titik Lampu')) === 'DIV-11');
check('B2 "Titik stop kontak" → BGN-10-A', code('Titik stop kontak') === 'BGN-10-A', `got=${code('Titik stop kontak')}`);
check('B3 "Saklar lampu" → BGN-10-A', code('Saklar lampu') === 'BGN-10-A', `got=${code('Saklar lampu')}`);
check('B4 "Pemasangan Armatur Lampu Downlight" → BGN-10-A', code('Pemasangan Armatur Lampu Downlight') === 'BGN-10-A', `got=${code('Pemasangan Armatur Lampu Downlight')}`);
check('B5 regresi "Instalasi Listrik — Titik Lampu & Stop Kontak" → BGN-10-A',
  code('Instalasi Listrik — Titik Lampu & Stop Kontak') === 'BGN-10-A');
check('B6 negatif: "Pengadaan Lampu Hias Dekorasi (material)" TIDAK ke BGN-10-A',
  code('Pengadaan Lampu Hias Dekorasi (material)') !== 'BGN-10-A', `got=${code('Pengadaan Lampu Hias Dekorasi (material)')}`);
check('B7 negatif: "Pemasangan Lampu Jalan Solar Cell" (BANGUNAN) TIDAK ke BGN-10-A',
  code('Pemasangan Lampu Jalan Solar Cell') !== 'BGN-10-A', `got=${code('Pemasangan Lampu Jalan Solar Cell')}`);
check('B8 negatif: "Katalog Stop Kontak dan Saklar (produk)" TIDAK ke BGN-10-A',
  code('Katalog Stop Kontak dan Saklar (produk)') !== 'BGN-10-A', `got=${code('Katalog Stop Kontak dan Saklar (produk)')}`);
check('B9 generik "Pekerjaan MEP" tetap kelompok BGN-10 (tidak dipaksa)',
  code('Pekerjaan MEP') === 'BGN-10' && divisionCodeForWbs('BGN-10') === null, `got=${code('Pekerjaan MEP')}`);
check('B10 plumbing tidak dibajak: "Instalasi Air Bersih PVC" → BGN-10-B',
  code('Instalasi Air Bersih PVC') === 'BGN-10-B', `got=${code('Instalasi Air Bersih PVC')}`);
check('B11 JALAN tidak terpengaruh: "Penerangan Lampu Jalan" → JLN-07-B',
  code('Penerangan Lampu Jalan', 'JALAN') === 'JLN-07-B', `got=${code('Penerangan Lampu Jalan', 'JALAN')}`);
check('B12 "lampu" tanpa konteks pekerjaan tidak cukup: "Lampu Taman 20 Watt" TIDAK ke BGN-10-A',
  code('Lampu Taman 20 Watt') !== 'BGN-10-A', `got=${code('Lampu Taman 20 Watt')}`);

console.log(`\n=== HASIL: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) process.exit(1);
