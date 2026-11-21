/**
 * dedAnalysisRunSurvivesMenuSwitch.src.ts — PROSES TIDAK BOLEH RESET
 * SAAT PINDAH MENU (perintah owner 2026-11-21 04:19).
 *
 * Laporan owner: di DED RAB AI (dan menu lain), bila proses masih
 * berjalan lalu user pindah menu, prosesnya KE-RESET.
 *
 * Mekanisme reset Magic AI yang TERBUKTI (dari kode, audit baca) —
 * yang TERPARAH dari semua menu: WorkspaceView meng-unmount
 * DedAnalysisDashboard saat pindah menu; SELURUH state lari tinggal
 * di useState (selectedFile, fileBuffer, isAnalyzing, progress,
 * outputResult) — hilang. `aiEstimatePipeline.execute` yang sedang
 * berjalan tidak punya seam AbortSignal dan menulis ke setState yang
 * sudah unmount → hasil hilang. Lebih parah: mount baru menganggap
 * belum ada file lalu AUTO-LOAD DOKUMEN CONTOH — user harus
 * mengunggah ulang PDF-nya.
 *
 * Perbaikan (`dedAnalysisRuntime.ts`, module-level): file terunggah +
 * buffer di-stage ke runtime (bertahan bahkan sebelum lari dimulai),
 * lari dicatat dengan kunci requestId, dashboard hanya MIRROR
 * snapshot lewat subscribe. Unmount = unsubscribe saja.
 *
 * Suite ini skrip asersi tsx polos: simulasi unmount/remount di level
 * runtime (unsubscribe = unmount, subscribe baru + getter = remount)
 * + pin sumber atas DedAnalysisDashboard. TANPA panggilan AI
 * berbayar, tanpa jaringan, tanpa render React.
 * Jalankan dari ROOT repo: npx --yes tsx src/test/dedAnalysisRunSurvivesMenuSwitch.src.ts
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  appendDedAnalysisLog,
  getDedAnalysisSnapshot,
  isDedAnalysisRunning,
  patchDedAnalysisRun,
  publishDedAnalysis,
  stageDedAnalysisFile,
  startDedAnalysisRun,
  subscribeDedAnalysis,
  __resetDedAnalysisRuntime,
} from '../components/magic-ai/dedAnalysisRuntime';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const here = dirname(fileURLToPath(import.meta.url));
const srcOf = (rel: string) => readFileSync(join(here, rel), 'utf8');

// File hanya dipakai sebagai nilai buram di runtime (nama + ukuran
// dibaca dashboard, bukan runtime) — objek palsu cukup.
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

async function main() {
  // =====================================================================
  // A. File ter-stage bertahan melewati unmount/remount
  // =====================================================================
  __resetDedAnalysisRuntime();
  const f1 = fakeFile();
  const b1 = fakeBuffer();
  const staged = stageDedAnalysisFile(f1, b1, false);
  check('A1 stage file: snapshot menyimpan file + buffer, status idle',
    staged.file === f1 && staged.fileBuffer === b1 && staged.isSample === false && staged.status === 'idle');
  let s1Calls = 0;
  const unsubS1 = subscribeDedAnalysis(() => { s1Calls++; });
  // --- SIMULASI PINDAH MENU: unmount = unsubscribe saja ---
  unsubS1();
  check('A2 sesudah unsubscribe, file ter-stage TETAP ADA (tidak auto-contoh lagi)',
    getDedAnalysisSnapshot()?.file === f1 && getDedAnalysisSnapshot()?.fileBuffer === b1);
  // --- SIMULASI KEMBALI KE MENU ---
  const remounted = getDedAnalysisSnapshot();
  check('A3 remount melihat file yang sama (user tidak perlu unggah ulang)',
    remounted?.file?.name === 'gambar-kerja.pdf' && remounted?.fileBuffer === b1);
  const sample = stageDedAnalysisFile(fakeFile('pdf-gambar-rumah-1-lantai_compress.pdf', 999), fakeBuffer(), true);
  check('A4 stage dokumen contoh menandai isSample',
    sample.isSample === true && sample.file?.name === 'pdf-gambar-rumah-1-lantai_compress.pdf');

  // =====================================================================
  // B. Lari bertahan + selesai saat ter-unmount
  // =====================================================================
  __resetDedAnalysisRuntime();
  stageDedAnalysisFile(f1, b1, false);
  const run1 = startDedAnalysisRun({ file: f1, buffer: b1, isSample: false, mode: 'FAST' });
  check('B1 lari dimulai: running, progres 5, stage READING_DED',
    run1.status === 'running' && run1.progress === 5 && run1.stageId === 'READING_DED');
  let r1Calls = 0;
  const unsubR1 = subscribeDedAnalysis(() => { r1Calls++; });
  // --- SIMULASI PINDAH MENU DI TENGAH LARI ---
  unsubR1();
  check('B2 sesudah unsubscribe, lari TETAP BERJALAN (inti perbaikan)',
    isDedAnalysisRunning() === true && getDedAnalysisSnapshot()?.status === 'running');
  check('B3 patch progres saat ter-unmount diterima (progres live)',
    patchDedAnalysisRun(run1.requestId, { progress: 60, stageId: 'ANALYZING', statusMessage: 'Menganalisis…' }) === true
    && getDedAnalysisSnapshot()?.progress === 60 && r1Calls === 0);
  appendDedAnalysisLog({ timestamp: '04:30:00', level: 'INFO', message: 'Log saat unmount', stage: 'ANALYZING' });
  check('B4 log saat ter-unmount tercatat di runtime',
    getDedAnalysisSnapshot()?.logs.some((l) => l.message === 'Log saat unmount') === true);
  // --- Lari selesai saat komponen tidak aktif ---
  check('B5 finish saat ter-unmount diterima + hasil tercatat',
    patchDedAnalysisRun(run1.requestId, {
      result: fakeResult, progress: 100, stageId: 'COMPLETED',
      status: 'done', statusMessage: 'Analisis DED selesai. RAB estimasi berhasil disusun.',
    }) === true
    && getDedAnalysisSnapshot()?.status === 'done'
    && getDedAnalysisSnapshot()?.result === fakeResult);
  // --- SIMULASI KEMBALI KE MENU ---
  const back = getDedAnalysisSnapshot();
  check('B6 remount melihat HASIL selesai + progres 100 + log (tidak dari nol)',
    back?.status === 'done' && back?.result?.summary?.estimatedTotal === 5000000
    && back?.progress === 100 && back?.logs.length === 1);

  // =====================================================================
  // C. Pagar: requestId usang, patch sesudah selesai, commit, reset lari
  // =====================================================================
  __resetDedAnalysisRuntime();
  const oldRun = startDedAnalysisRun({ file: f1, buffer: b1, isSample: false, mode: 'FAST' });
  const newRun = startDedAnalysisRun({ file: f1, buffer: b1, isSample: false, mode: 'DETAIL' });
  check('C1 patch lari usang ditolak sesudah lari baru dimulai',
    patchDedAnalysisRun(oldRun.requestId, { progress: 99 }) === false
    && getDedAnalysisSnapshot()?.requestId === newRun.requestId
    && getDedAnalysisSnapshot()?.progress === 5);
  patchDedAnalysisRun(newRun.requestId, { status: 'done', result: fakeResult, progress: 100 });
  check('C2 patch sesudah lari selesai ditolak (status bukan running)',
    patchDedAnalysisRun(newRun.requestId, { progress: 10 }) === false
    && getDedAnalysisSnapshot()?.progress === 100);
  check('C3 publish status commit tersimpan di snapshot',
    publishDedAnalysis({ committedSuccess: true, commitReport: { added: 3, held: 1 } }) === true
    && getDedAnalysisSnapshot()?.committedSuccess === true
    && getDedAnalysisSnapshot()?.commitReport?.added === 3
    && getDedAnalysisSnapshot()?.commitReport?.held === 1);
  appendDedAnalysisLog({ timestamp: '04:31:00', level: 'SUCCESS', message: 'Selesai', stage: 'BUILD_RAB' });
  const run3 = startDedAnalysisRun({ file: f1, buffer: b1, isSample: false, mode: 'FAST' });
  check('C4 lari baru mengosongkan log + status commit (perilaku lama)',
    run3.logs.length === 0 && run3.committedSuccess === false && run3.commitReport === null);
  __resetDedAnalysisRuntime();
  check('C5 publish tanpa snapshot = no-op (false)',
    publishDedAnalysis({ committedSuccess: true }) === false && getDedAnalysisSnapshot() === null);

  // =====================================================================
  // D. Pin sumber — DedAnalysisDashboard benar-benar memakai runtime
  // =====================================================================
  const dash = srcOf('../components/magic-ai/DedAnalysisDashboard.tsx');
  check('D1 dashboard mengimpor dedAnalysisRuntime', dash.includes("from './dedAnalysisRuntime'"));
  check('D2 dashboard memakai API runtime (start/stage/patch/subscribe/publish/log)',
    dash.includes('startDedAnalysisRun(') && dash.includes('stageDedAnalysisFile(')
    && dash.includes('patchDedAnalysisRun(') && dash.includes('subscribeDedAnalysis(')
    && dash.includes('publishDedAnalysis(') && dash.includes('appendDedAnalysisLog('));
  check('D3 dashboard menghidratasi state dari snapshot saat mount',
    dash.includes('getDedAnalysisSnapshot()') && dash.includes('initialSnapshot'));
  check('D4 pagar auto-load contoh tetap ada (tidak dimatikan — hidratasi yang menahannya)',
    dash.includes('if (!selectedFile && !isSampleLoaded)'));
  const analyzingSets = (dash.match(/setIsAnalyzing\(/g) ?? []).length;
  check('D5 TIDAK ADA lagi setIsAnalyzing lokal di luar mirror (finally dihapus)',
    analyzingSets === 1, `ditemukan ${analyzingSets}`);
  check('D6 ganti mode dipublikasikan ke runtime',
    dash.includes('changeMode(') && dash.includes('publishDedAnalysis({ mode })'));
  check('D7 lari membaca flag contoh dari snapshot ter-stage',
    dash.includes('staged.isSample'));
  check('D8 addLog menulis ke runtime (bukan setState lokal)',
    dash.includes('appendDedAnalysisLog({ timestamp: timeStr'));

  console.log(`\nHASIL: ${pass} lulus, ${fail} gagal (total ${pass + fail})`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('SUITE ERROR:', err);
  process.exitCode = 1;
});
