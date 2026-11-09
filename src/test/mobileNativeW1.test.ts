/**
 * Native Mobile Gelombang 1 — penjaga kontrak presentasi native per menu
 * (keputusan owner 2026-11-09 "buat native per menu dari galeri" +
 * mandat 2026-11-10 "buat yang terbaik").
 *
 * Kontrak yang dijaga (pemeriksaan statis pola baca-file):
 *  - komponen native ada di src/components/mobile/ dan dipilih HANYA pada
 *    viewport sempit lewat mekanisme yang sama dengan MobileV3
 *    (WorkspaceView isNarrowMobile / hook useNarrowMobile di RabEstimasiView);
 *  - sumber data & handler SAMA dengan view desktop: useProject untuk
 *    QTO, groupedWbsCategories/totalRabNominal untuk spreadsheet,
 *    computeRekapSummary (recalculateCostSummary kanonis) untuk rekap,
 *    resolveAhspItemDisplay untuk AHSP proyek, officialAhspRepository +
 *    resolveWithMarket + canFinalizeAhsp untuk penjelajah;
 *  - ekstraksi bersama tidak menduplikasi logika: view desktop MENGIMPOR
 *    helper yang sama (rekapSummary, ahspItemDisplay, qtoCategory,
 *    resolveWithMarket ter-ekspor);
 *  - angka galeri TIDAK di-hardcode ke komponen (tidak ada literal total
 *    demo seperti 1.089 / 806.640 / 5.725 sebagai konstanta tampil);
 *  - kualitas: CSS .mnw-* memuat target sentuh ≥44px pada chip/tombol
 *    aksi dan blok prefers-reduced-motion;
 *  - menu yang sudah native / terkunci tidak berubah kontraknya:
 *    proyek dipilih ke MobileProjectsV3; kalkulator volume mempertahankan
 *    stickybar hasil + daftar tersimpan sesudah kolom hasil.
 *
 * Run (repo): npx --yes tsx src/test/mobileNativeW1.test.ts
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const read = (rel: string): string => readFileSync(join(repo, rel), 'utf8');
const has = (rel: string): boolean => existsSync(join(repo, rel));

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean): void => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ GAGAL: ${name}`); }
};

const ws = read('src/components/dashboard/WorkspaceView.tsx');
const rab = read('src/components/rab/RabEstimasiView.tsx');
const css = read('src/styles/mobile-native-w1.css');

/* --- berkas komponen & hook ada --------------------------------------- */
check('hook useNarrowMobile ada', has('src/components/mobile/useNarrowMobile.ts'));
check('MobileQtoRekap ada', has('src/components/mobile/MobileQtoRekap.tsx'));
check('MobileSpreadsheetRab ada', has('src/components/mobile/MobileSpreadsheetRab.tsx'));
check('MobileRekapRab ada', has('src/components/mobile/MobileRekapRab.tsx'));
check('MobileAhspProyek ada', has('src/components/mobile/MobileAhspProyek.tsx'));
check('MobileAhspExplorer ada', has('src/components/mobile/MobileAhspExplorer.tsx'));
check('CSS mobile-native-w1 ada & diimpor WorkspaceView', ws.includes("mobile-native-w1.css"));

/* --- mekanisme deteksi sama dengan MobileV3 ---------------------------- */
const hook = read('src/components/mobile/useNarrowMobile.ts');
check('hook memakai ambang yang sama (innerWidth < 768)', hook.includes('window.innerWidth < 768'));
check('hook mendengar resize', hook.includes("addEventListener('resize'"));

/* --- titik pilihan: Rekapitulasi QTO ----------------------------------- */
check('WorkspaceView merender MobileQtoRekap', ws.includes('<MobileQtoRekap'));
check('MobileQtoRekap hanya pada isNarrowMobile (di dalam cabang qto)', /isNarrowMobile \? \(\s*\/\* Gelombang 1 native:[\s\S]*?<MobileQtoRekap/.test(ws));
check('desktop QtoRekapVolumeView tetap dirender di cabang else', ws.includes('<QtoRekapVolumeView'));
const qto = read('src/components/mobile/MobileQtoRekap.tsx');
check('QTO mobile memakai useProject (sumber data sama)', qto.includes('useProject()'));
check('QTO mobile memakai syncQtoToRabSpreadsheet', qto.includes('syncQtoToRabSpreadsheet'));
check('QTO mobile memakai deleteQtoItem', qto.includes('deleteQtoItem'));
check('QTO mobile mengelompokkan via qtoCategory bersama', qto.includes("from '../qto/qtoCategory'"));

/* --- ekstraksi bersama QTO ---------------------------------------------- */
const qtoView = read('src/components/qto/QtoRekapVolumeView.tsx');
check('QtoRekapVolumeView mengimpor helper qtoCategory (bukan duplikasi)', qtoView.includes("from './qtoCategory'"));
check('qtoCategory mengekspor kedua helper', read('src/components/qto/qtoCategory.ts').includes('getQtoSectionHeadingOfItem'));

/* --- titik pilihan: tiga tab RAB ---------------------------------------- */
check('RabEstimasiView memakai useNarrowMobile', rab.includes('useNarrowMobile()'));
check('spreadsheet sempit -> MobileSpreadsheetRab', rab.includes('<MobileSpreadsheetRab'));
check('spreadsheet mobile menerima groupedWbsCategories yang sama', rab.includes('groups={groupedWbsCategories}'));
check('blok pajak dipakai bersama (taxToggleBlock)', rab.includes('const taxToggleBlock') && rab.includes('{taxToggleBlock}'));
check('rekap sempit -> MobileRekapRab', rab.includes('<MobileRekapRab'));
check('analisa sempit -> MobileAhspProyek', rab.includes('<MobileAhspProyek'));
check('desktop EstimatorRekapitulasiView tetap ada', rab.includes('<EstimatorRekapitulasiView'));
check('desktop EstimatorAhspView tetap ada', rab.includes('<EstimatorAhspView'));
check('desktop EstimatorSpreadsheetTable tetap ada', rab.includes('<EstimatorSpreadsheetTable'));

/* --- rekap memakai ringkasan kanonis bersama ----------------------------- */
const rekapSummary = read('src/components/estimator/rekapSummary.ts');
check('rekapSummary mengekspor computeRekapSummary', rekapSummary.includes('export function computeRekapSummary'));
check('rekapSummary tetap bermuara ke recalculateCostSummary', rekapSummary.includes('recalculateCostSummary'));
check('EstimatorRekapitulasiView mengimpor computeRekapSummary', /from ['"]\.\/rekapSummary['"]/.test(read('src/components/estimator/EstimatorRekapitulasiView.tsx')));
const rekapM = read('src/components/mobile/MobileRekapRab.tsx');
check('MobileRekapRab memakai computeRekapSummary', rekapM.includes('computeRekapSummary(items, currentProject)'));
check('MobileRekapRab memakai useCurrency yang sama', rekapM.includes('useCurrency()'));

/* --- AHSP proyek memakai bentuk tampil bersama ---------------------------- */
const ahspDisplay = read('src/components/estimator/ahspItemDisplay.ts');
check('ahspItemDisplay mengekspor resolveAhspItemDisplay', ahspDisplay.includes('export function resolveAhspItemDisplay'));
check('EstimatorAhspView mengimpor resolveAhspItemDisplay', /from ['"]\.\/ahspItemDisplay['"]/.test(read('src/components/estimator/EstimatorAhspView.tsx')));
const ahspProyek = read('src/components/mobile/MobileAhspProyek.tsx');
check('MobileAhspProyek memakai resolveAhspItemDisplay', ahspProyek.includes('resolveAhspItemDisplay(item)'));
check('MobileAhspProyek menghitung kecocokan resmi dari repository', ahspProyek.includes('officialAhspRepository.getOfficialAhsp'));

/* --- penjelajah AHSP ------------------------------------------------------- */
check('WorkspaceView punya lazy MobileAhspExplorerLazy', ws.includes('MobileAhspExplorerLazy'));
check('penjelajah sempit -> MobileAhspExplorerLazy', /isNarrowMobile \? \(\s*<MobileAhspExplorerLazy/.test(ws));
check('handler tambah RAB dipakai bersama (handleAddAhspToRab)', (ws.match(/handleAddAhspToRab/g) || []).length >= 3);
const explorerView = read('src/components/ahsp/AhspExplorerView.tsx');
check('AhspExplorerView mengekspor resolveWithMarket', explorerView.includes('export function resolveWithMarket'));
check('AhspExplorerView mengekspor domainShortLabel', explorerView.includes('export function domainShortLabel'));
const explorerM = read('src/components/mobile/MobileAhspExplorer.tsx');
check('penjelajah mobile memakai getActiveOfficialAhsp', explorerM.includes('getActiveOfficialAhsp()'));
check('penjelajah mobile memakai resolveWithMarket', explorerM.includes('resolveWithMarket(item)'));
check('penjelajah mobile memakai gerbang canFinalizeAhsp', explorerM.includes('canFinalizeAhsp(augmented'));
check('penjelajah mobile memakai saveProjectAhspFromCatalog', explorerM.includes('saveProjectAhspFromCatalog(currentProject.id, enrichedItem)'));

/* --- angka galeri tidak di-hardcode ---------------------------------------- */
const allMobile = [qto, rekapM, ahspProyek, explorerM, read('src/components/mobile/MobileSpreadsheetRab.tsx')].join('\n');
check('tidak ada literal total demo 1.089.879 di komponen', !allMobile.includes('1.089'));
check('tidak ada literal total demo 806.640 di komponen', !allMobile.includes('806.640'));
check('tidak ada literal jumlah katalog 5725/5.725 di komponen', !allMobile.includes('5725') && !allMobile.includes('5.725'));
check('spreadsheet mobile memakai gerbang exportItemAmount', read('src/components/mobile/MobileSpreadsheetRab.tsx').includes('exportItemAmount(item)'));

/* --- menu yang sudah native / terkunci tidak berubah ----------------------- */
check('proyek tetap dipilih ke MobileProjectsV3', ws.includes('MobileProjectsV3'));
const qtoCalc = read('src/components/qto/QtoCalculatorView.tsx');
check('kalkulator volume: stickybar hasil tetap ada', qtoCalc.includes('ezrab-result-stickybar'));
check(
  'kalkulator volume: daftar tersimpan sesudah stickybar hasil',
  qtoCalc.indexOf('ezrab-result-stickybar') < qtoCalc.indexOf('Daftar Volume Tersimpan'),
);
check('kalkulator volume: ikon keluarga tetap dipakai', qtoCalc.includes('calcFamilyIcon'));

/* --- kualitas "buat yang terbaik" ------------------------------------------ */
check('CSS: chip target sentuh min-height 44px', /\.mnw-chip \{[^}]*min-height: 44px/.test(css));
check('CSS: tombol aksi min-height 44px', /\.mnw-action-btn \{[^}]*min-height: 44px/.test(css));
check('CSS: angka tabular pada bar total', /\.mnw-totalbar-value \{[^}]*tabular-nums/.test(css));
check('CSS: prefers-reduced-motion dihormati', css.includes('@media (prefers-reduced-motion: reduce)'));
check('CSS: animasi kemunculan kartu (mnw-rise)', css.includes('@keyframes mnw-rise'));

console.log(`\nmobileNativeW1: ${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
