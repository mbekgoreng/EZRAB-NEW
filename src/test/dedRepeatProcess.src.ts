/**
 * dedRepeatProcess.src.ts — TOMBOL "ULANGI PROSES" DI DED RAB AI
 * (perintah owner 2026-11-28 01:17, dikonfirmasi lewat widget).
 *
 * Sesudah generate selesai, layar hasil menampilkan tombol
 * "Ulangi Proses": ketuk = jalankan ulang analisis dari dokumen +
 * pengaturan yang SAMA (tanpa unggah ulang) lewat
 * runAnalysisPipeline yang sama. Hasil lama diganti hasil baru
 * hanya bila lari baru SUKSES; bila GAGAL, hasil lama tetap tampil.
 * Ini BUKAN tombol reset-ke-awal.
 *
 * Suite ini skrip asersi tsx polos (pola
 * dedAnalysisRunSurvivesMenuSwitch.src.ts): semantik runtime di
 * level dedAnalysisRuntime + pin sumber atas DedAnalysisDashboard
 * + kunci i18n keempat locale. TANPA panggilan AI berbayar, tanpa
 * jaringan, tanpa render React.
 * Jalankan dari ROOT repo: npx --yes tsx src/test/dedRepeatProcess.src.ts
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  getDedAnalysisSnapshot,
  patchDedAnalysisRun,
  publishDedAnalysis,
  startDedAnalysisRun,
  __resetDedAnalysisRuntime,
} from '../components/magic-ai/dedAnalysisRuntime';
import { dictionaries } from '../i18n/dictionaries';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const here = dirname(fileURLToPath(import.meta.url));
const srcOf = (rel: string) => readFileSync(join(here, rel), 'utf8');

const fakeFile = (name = 'gambar-kerja.pdf', size = 123456) =>
  ({ name, size } as unknown as File);
const fakeBuffer = () => new ArrayBuffer(8);
const fakeResult = {
  success: true,
  workItems: [{ id: 'w1' }],
  stats: { totalItems: 1 },
  summary: { estimatedTotal: 5000000 },
  executionDurationSec: 42,
} as any;
const fakeResult2 = {
  success: true,
  workItems: [{ id: 'w2' }],
  stats: { totalItems: 1 },
  summary: { estimatedTotal: 7770000 },
  executionDurationSec: 55,
} as any;

async function main() {
  // =====================================================================
  // A. Runtime: hasil lama bertahan selama lari ulang + bila gagal
  // =====================================================================
  __resetDedAnalysisRuntime();
  const f1 = fakeFile();
  const b1 = fakeBuffer();
  const run1 = startDedAnalysisRun({ file: f1, buffer: b1, isSample: false, mode: 'FAST' });
  check('A1 lari pertama (tanpa pendahulu): result null, commit false',
    run1.result === null && run1.committedSuccess === false && run1.commitReport === null);
  patchDedAnalysisRun(run1.requestId, {
    result: fakeResult, progress: 100, stageId: 'COMPLETED',
    status: 'done', statusMessage: 'Analisis DED selesai.',
  });
  publishDedAnalysis({ committedSuccess: true, commitReport: { added: 2, held: 0 } });
  const run2 = startDedAnalysisRun({ file: f1, buffer: b1, isSample: false, mode: 'FAST' });
  check('A2 lari ulang dimulai: hasil + status commit lama DIPERTAHANKAN',
    run2.result === fakeResult
    && run2.committedSuccess === true
    && run2.commitReport?.added === 2 && run2.commitReport?.held === 0
    && run2.status === 'running' && run2.progress === 5);
  check('A3 lari ulang gagal: hasil + status commit lama TETAP tampil (layar tidak kosong)',
    patchDedAnalysisRun(run2.requestId, {
      status: 'failed', statusMessage: 'Gagal: model tidak merespons', error: 'boom',
    }) === true
    && getDedAnalysisSnapshot()?.result === fakeResult
    && getDedAnalysisSnapshot()?.status === 'failed'
    && getDedAnalysisSnapshot()?.committedSuccess === true
    && getDedAnalysisSnapshot()?.commitReport?.added === 2);
  const run3 = startDedAnalysisRun({ file: f1, buffer: b1, isSample: false, mode: 'DETAIL' });
  check('A4 lari ketiga sesudah gagal: hasil lama masih dipertahankan',
    run3.result === fakeResult && run3.status === 'running');
  check('A5 lari sukses: hasil baru MENGGANTI hasil lama + status commit direset',
    patchDedAnalysisRun(run3.requestId, {
      result: fakeResult2, progress: 100, stageId: 'COMPLETED',
      status: 'done', statusMessage: 'Analisis DED selesai.',
      committedSuccess: false, commitReport: null,
    }) === true
    && getDedAnalysisSnapshot()?.result === fakeResult2
    && getDedAnalysisSnapshot()?.committedSuccess === false
    && getDedAnalysisSnapshot()?.commitReport === null);

  // =====================================================================
  // B. Pin sumber — DedAnalysisDashboard memasang tombol + wiring
  // =====================================================================
  const dash = srcOf('../components/magic-ai/DedAnalysisDashboard.tsx');
  check('B1 tombol memakai kunci i18n btn_repeat_process + btn_repeat_running',
    dash.includes("t('ai.ded.dash.btn_repeat_process')")
    && dash.includes("t('ai.ded.dash.btn_repeat_running')"));
  const btnIdx = dash.indexOf('btn_repeat_process');
  check('B2 tombol ada DI LAYAR HASIL (sesudah SECTION 25, bukan di kartu dokumen)',
    btnIdx > dash.indexOf('SECTION 25: AFTER ANALYSIS RESULTS'));
  const btnSeg = dash.slice(Math.max(0, btnIdx - 700), btnIdx + 250);
  check('B3 tombol memanggil runAnalysisPipeline yang sama + disabled saat lari berjalan',
    btnSeg.includes('runAnalysisPipeline()') && btnSeg.includes('disabled={isAnalyzing}'));
  check('B4 label tombol beralih ke label berjalan saat isAnalyzing',
    btnSeg.includes("isAnalyzing ? t('ai.ded.dash.btn_repeat_running')"));
  const runFn = dash.slice(dash.indexOf('const runAnalysisPipeline'), dash.indexOf('startDedAnalysisRun({'));
  check('B5 runAnalysisPipeline menahan pemanggilan ganda (pagar isAnalyzing)',
    runFn.includes('if (isAnalyzing) return;'));
  // Patch sukses ditandai stageId COMPLETED (patch progres onProgress
  // juga memakai patchDedAnalysisRun(reqId, …) — jangan potong dari
  // kemunculan pertama).
  const succIdx = dash.indexOf("stageId: 'COMPLETED'");
  const successPatch = dash.slice(Math.max(0, succIdx - 350), succIdx + 900);
  check('B6 patch sukses mereset status commit lari lama (item baru belum terkirim)',
    successPatch.includes('committedSuccess: false') && successPatch.includes('commitReport: null'));
  const memo = dash.slice(dash.indexOf('const steps: StepInfo[] = useMemo'), dash.indexOf('const filteredItems'));
  check('B7 panel tahap tidak menampilkan SUCCESS basi saat lari ulang berjalan',
    memo.includes('if (outputResult && !isAnalyzing)'));
  check('B8 tombol utama generate tetap memakai runAnalysisPipeline yang sama (satu jalur)',
    (dash.match(/onClick=\{\(\) => runAnalysisPipeline\(\)\}/g) ?? []).length >= 2);

  // =====================================================================
  // C. Kunci i18n ada di keempat locale
  // =====================================================================
  check('C1 btn_repeat_process ada + tepat di keempat locale',
    dictionaries.id.ai.ded.dash.btn_repeat_process === 'Ulangi Proses'
    && dictionaries.en.ai.ded.dash.btn_repeat_process === 'Repeat Process'
    && dictionaries.zh.ai.ded.dash.btn_repeat_process === '重新处理'
    && dictionaries.ms.ai.ded.dash.btn_repeat_process === 'Ulang Proses');
  check('C2 btn_repeat_running ada + non-kosong di keempat locale',
    dictionaries.id.ai.ded.dash.btn_repeat_running.length > 0
    && dictionaries.en.ai.ded.dash.btn_repeat_running.length > 0
    && dictionaries.zh.ai.ded.dash.btn_repeat_running.length > 0
    && dictionaries.ms.ai.ded.dash.btn_repeat_running.length > 0);

  __resetDedAnalysisRuntime();
  console.log(`\nHASIL: ${pass} lulus, ${fail} gagal (total ${pass + fail})`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('SUITE ERROR:', err);
  process.exitCode = 1;
});
