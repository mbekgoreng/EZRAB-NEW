/**
 * F1b REGRESSION TEST — kejujuran & fungsi permukaan material/template/QTO/
 * kurva S/pengaturan.
 *
 * Pemeriksaan SUMBER (readFileSync) untuk perbaikan permukaan F1b:
 *  1. Material & Harga: fallback 'Rp 74.000' hilang; label harga null jujur.
 *  2. ResourceLibrary: sintesis harga ×1,02/×0,95/×0,98 & confidence idx%4 hilang.
 *  3. SpreadsheetSyncModal: tidak ada URL Sheets karangan / klaim sinkron palsu.
 *  4. AiPriceResearchDrawer: tidak ada klaim HIGH_VERIFIED / anti-halusinasi.
 *  5. AHSP Explorer: angka audit hardcode hilang.
 *  6. Template: banner kondisional, sort populer dari pemakaian, settings persisten.
 *  7. QTO Calculator: snapshot dimuat saat edit; fabrikasi harga sync hilang.
 *  8. Rekap QTO: bulk sync benar-benar memanggil engine; % VERIFIED murni.
 *  9. Daftar Pekerjaan: ekspor CSV nyata; "Magic AI" menjadi Contoh jujur;
 *     pembagian harga impor 60/35/5 hilang.
 * 10. Manajemen Proyek: realisasi hanya dari titik aktual; target bukan 100%.
 * 11. Estimator Kurva S: distribusi dari jadwal nyata; totalWeeks persisten.
 * 12. Notes/AHSP/Settings estimator: spek default hilang; Alat dirender;
 *     indeks wilayah & roundingScheme mati hilang.
 * 13. Persistensi localStorage store material/review/asumsi.
 * 14. i18n: string yatim selaras perilaku F1a.
 * + uji fungsi murni: normalisasi progres jadwal & builder Kurva S laporan.
 *
 * Jalankan: npx tsx src/test/f1bHonesty.test.ts
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '..');
const read = (rel: string) => readFileSync(resolve(SRC, rel), 'utf8');

import { computeScheduleProgress } from '../lib/scheduleHonesty';
import { buildLaporanKurvaS } from '../lib/kurvaSHonesty';
import type { KurvaSDataPoint, ScheduleTask } from '../types';

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

const absent = (name: string, src: string, needle: string) =>
  check(name, !src.includes(needle), `masih mengandung: ${needle}`);
const present = (name: string, src: string, needle: string) =>
  check(name, src.includes(needle), `tidak ditemukan: ${needle}`);

// ── 1. Material & Harga ─────────────────────────────────────────────────────
const matView = read('components/materials/MaterialDatabaseView.tsx');
absent('Material: fallback Rp 74.000 hilang', matView, 'Rp 74.000');
absent('Material: badge "Verified Database" hilang', matView, 'Verified Database');
present('Material: harga kosong tampil "Belum tersedia"', matView, 'Belum tersedia');
present('Material: adopsi riset AI berlabel perlu verifikasi', matView, 'Riset AI — perlu verifikasi');

const aiDrawer = read('components/materials/AiPriceResearchDrawer.tsx');
absent('AiPriceResearch: klaim HIGH_VERIFIED hilang', aiDrawer, 'HIGH_VERIFIED');
absent('AiPriceResearch: klaim 100% Anti-Hallucination hilang', aiDrawer, 'Anti-Hallucination');
present('AiPriceResearch: tombol memanggil onAdoptPrice', aiDrawer, 'onAdoptPrice?.(c.material, c.price');

// ── 2. ResourceLibrary ──────────────────────────────────────────────────────
const resLib = read('components/resources/ResourceLibraryView.tsx');
absent('ResourceLibrary: sintesis ×1.02 hilang', resLib, '* 1.02');
absent('ResourceLibrary: sintesis ×0.95 hilang', resLib, '* 0.95');
absent('ResourceLibrary: confidence dari idx % 4 hilang', resLib, 'idx % 4');
present('ResourceLibrary: disclaimer anti-sintesis ada', resLib, 'tidak disintesis dari harga dasar');
present('ResourceLibrary: direktori contoh diberi banner jujur', resLib, 'Direktori contoh');

// ── 3. SpreadsheetSyncModal ─────────────────────────────────────────────────
const syncModal = read('components/database/SpreadsheetSyncModal.tsx');
absent('SpreadsheetSync: URL Sheets ter-prefill hilang', syncModal, "useState('https://docs.google.com");
absent('SpreadsheetSync: hitungan baris karangan hilang', syncModal, '6.164 baris');
present('SpreadsheetSync: status jujur "Belum terhubung"', syncModal, 'Belum terhubung');
present('SpreadsheetSync: ekspor dari dataset tampilan', syncModal, 'buildDisplayedDatasetCsv');

// ── 4. Persistensi store ────────────────────────────────────────────────────
present('Persistensi: material user → localStorage', read('domain/material/materialDatabaseService.ts'), 'ezrab_user_materials_v1');
present('Persistensi: review pasar → localStorage', read('engine/pricing/market/reviewStore.ts'), 'ezrab_market_review_v1');
present('Persistensi: asumsi AHSP → localStorage', read('engine/pricing/assumption/assumptionStore.ts'), 'ezrab_price_assumptions_v1');

// ── 5. AHSP Explorer ────────────────────────────────────────────────────────
const ahspView = read('components/ahsp/AhspExplorerView.tsx');
absent('AHSP Explorer: angka 5.801 hardcode hilang', ahspView, '5.801');
absent('AHSP Explorer: klaim 20/20 test hilang', ahspView, '20/20');
absent('AHSP Explorer: klaim 100% MATCH hilang', ahspView, '100% MATCH');
present('AHSP Explorer: audit dihitung dari repository', ahspView, 'auditStats');

// ── 6. Template RAB ─────────────────────────────────────────────────────────
const tplDrawer = read('components/templates/TemplatePreviewDrawer.tsx');
present('Template drawer: banner memakai mappingReadiness', tplDrawer, 'mappingReadiness');
present('Template drawer: status SEBAGIAN ada', tplDrawer, 'SEBAGIAN');
const tplCatalog = read('components/templates/TemplateRabCatalogView.tsx');
present('Template katalog: sort populer dari usageCounts', tplCatalog, 'usageCounts');
present('Template katalog: settings global persisten', tplCatalog, 'ezrab_global_estimation_settings_v1');
const globalModal = read('components/templates/GlobalEstimationSettingsModal.tsx');
absent('Global settings: select Sumber Harga mati dihapus', globalModal, 'Sumber Harga Acuan Utama');
const configurator = read('components/templates/UniversalTemplateConfigurator.tsx');
present('Konfigurator: penyesuaian global dihitung', configurator, 'globalAdjustment');
present('Konfigurator: merek dilabeli tanpa efek harga', configurator, 'tidak mengubah harga satuan');

// ── 7. QTO Calculator ───────────────────────────────────────────────────────
const qtoCalc = read('components/qto/QtoCalculatorView.tsx');
present('QTO Calc: edit memuat parameterSnapshot', qtoCalc, 'loadedEditIdRef');
absent('QTO Calc: last-resort Rp50.000 hilang', qtoCalc, 'qto.material.last-resort');
absent('QTO Calc: harga Girder karangan hilang', qtoCalc, '45000000');
absent('QTO Calc: tarif tebak peran hilang', qtoCalc, '145000');
absent('QTO Calc: borongan kata-kunci judul hilang', qtoCalc, 'borongan_ahsp');
absent('QTO Calc: baris alat implisit Rp45.000 hilang', qtoCalc, 'qto.equipment.implicit-default');
present('QTO Calc: tanpa sumber → UNRESOLVED', qtoCalc, "'UNRESOLVED'");

// ── 8. Rekap QTO ────────────────────────────────────────────────────────────
const qtoRekap = read('components/qto/QtoRekapVolumeView.tsx');
present('Rekap QTO: bulk sync memanggil engine', qtoRekap, 'syncQtoToRabSpreadsheet(id)');
present('Rekap QTO: % terverifikasi hanya status VERIFIED', qtoRekap, "i.status === 'VERIFIED'");
absent('Rekap QTO: kredit nama karangan hilang', qtoRekap, 'Ahmad Yusuf');
present('Rekap QTO: volume per satuan', qtoRekap, 'volumeByUnit');

// ── 9. Daftar Pekerjaan ─────────────────────────────────────────────────────
const daftar = read('components/workItems/DaftarPekerjaanView.tsx');
absent('Daftar: alert ekspor palsu hilang', daftar, 'ke Excel (.xlsx) berhasil diunduh');
present('Daftar: panel contoh berlabel BUKAN AI', daftar, 'BUKAN AI');
absent('Daftar: pembagian impor 60% hilang', daftar, 'unitPrice * 0.6');
absent('Daftar: pembagian impor 35% hilang', daftar, 'unitPrice * 0.35');
present('Daftar: contoh berstatus BELUM_DIHITUNG', daftar, "status: 'BELUM_DIHITUNG'");

// ── 10. Manajemen Proyek ────────────────────────────────────────────────────
const mgmt = read('components/management/ManajemenProyekView.tsx');
present('Manajemen: progres dinormalisasi via scheduleHonesty', mgmt, 'computeScheduleProgress');
absent('Manajemen: target rencana 100% hardcode hilang', mgmt, "? '0%' : '100%'");
present('Manajemen: penanda realisasi kosong ada', mgmt, 'Belum ada data realisasi mingguan');
absent('Manajemen: label Gantt hilang', mgmt, 'Gantt');
present('Manajemen: deviasi dari pekan beraktual terakhir', mgmt, 'actualSeries');

// ── 11. Estimator Kurva S ───────────────────────────────────────────────────
const estKurva = read('components/estimator/EstimatorKurvaSView.tsx');
present('EstKurvaS: memakai buildLaporanKurvaS', estKurva, 'buildLaporanKurvaS');
absent('EstKurvaS: sintesis indeks kategori hilang', estKurva, 'catCount');
present('EstKurvaS: totalWeeks persisten per proyek', estKurva, 'ezrab_estimator_kurva_weeks_');
present('EstKurvaS: baris realisasi kumulatif ada', estKurva, 'Bobot Realisasi Kumulatif');

// ── 12. Notes / AHSP / Settings estimator ───────────────────────────────────
const notes = read('components/estimator/EstimatorNotesView.tsx');
absent('Notes: spek default karangan hilang', notes, "fc' 20 MPa (K-250) Ready Mix");
present('Notes: editor sinkron saat ganti proyek', notes, 'currentProject?.id');
const estAhsp = read('components/estimator/EstimatorAhspView.tsx');
present('EstAHSP: komponen Alat dirender', estAhsp, 'C. Peralatan (Alat)');
present('EstAHSP: penghitung cocok resmi', estAhsp, 'officialMatchCount');
absent('EstAHSP: klaim Permen karangan hilang', estAhsp, 'Permen PUPR No. 1/PRT/M/2022');
const estSettings = read('components/estimator/EstimatorSettingsView.tsx');
absent('EstSettings: indeks Papua 1.55 hilang', estSettings, 'Indeks 1.55');
absent('EstSettings: klaim mengalikan koefisien hilang', estSettings, 'mengalikan koefisien');
absent('EstSettings: kontrol roundingScheme dihapus', estSettings, 'roundingScheme');

// ── 13. i18n ────────────────────────────────────────────────────────────────
const dict = read('i18n/dictionaries.ts');
absent('i18n: insight 3 item karangan hilang', dict, '3 item material pada proyek Anda memiliki potensi');
absent('i18n: klaim 100% Aman hilang', dict, '100% Aman');
absent('i18n: klaim backup cloud instant hilang', dict, 'Backup Cloud & Restore Instant');
absent('i18n: klaim BAST siap dicetak hilang', dict, 'Dokumen siap dicetak.');

// ── 14. Fungsi murni: normalisasi progres & builder kurva ───────────────────
const tasks = [
  { weightPercent: 30, actualProgressPercent: 100 },
  { weightPercent: 30, actualProgressPercent: 50 },
] as unknown as ScheduleTask[];
check(
  'computeScheduleProgress menormalisasi terhadap total bobot (30+30 → 75)',
  computeScheduleProgress(tasks) === 75,
  `hasil: ${computeScheduleProgress(tasks)}`
);
check(
  'computeScheduleProgress null tanpa tugas',
  computeScheduleProgress([]) === null
);

const pts: KurvaSDataPoint[] = [
  { weekIndex: 1, weekLabel: 'W1', startDate: '', endDate: '', plannedWeeklyPercent: 40, cumulativePlannedPercent: 40, plannedWeeklyCost: 0, cumulativePlannedCost: 0 },
  { weekIndex: 2, weekLabel: 'W2', startDate: '', endDate: '', plannedWeeklyPercent: 60, cumulativePlannedPercent: 100, plannedWeeklyCost: 0, cumulativePlannedCost: 0 },
];
const laporan = buildLaporanKurvaS(pts, tasks);
check('buildLaporanKurvaS tersedia dari data nyata', laporan.available && laporan.totalWeeks === 2);
check(
  'buildLaporanKurvaS: realisasi selalu null (tidak disintesis)',
  laporan.weeks.every((w) => w.actCum === null && w.actWeekly === null)
);
check(
  'buildLaporanKurvaS menolak tanpa tugas jadwal',
  buildLaporanKurvaS(pts, []).available === false
);

console.log(`\nF1b: ${passed} lulus, ${failed} gagal`);
if (failed > 0) {
  console.log('Gagal:', failures.join(' | '));
  process.exit(1);
}
