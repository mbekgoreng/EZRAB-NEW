/**
 * dedRunSurvivesMenuSwitch.src.ts — PROSES TIDAK BOLEH RESET SAAT
 * PINDAH MENU (perintah owner 2026-11-21 04:19).
 *
 * Laporan owner: di DED RAB AI (dan menu lain), bila proses masih
 * berjalan lalu user pindah menu, prosesnya KE-RESET.
 *
 * Mekanisme reset DED yang TERBUKTI (dari kode):
 *  1. WorkspaceView merender satu cabang ternary per menu + `<div
 *     key={activeMenu}>` (WorkspaceView.tsx:650) — pindah menu
 *     MENG-UNMOUNT DedAiEstimateView sepenuhnya.
 *  2. View DED menyimpan SELURUH state lari di useState komponen
 *     (layar, tahap, persen, hasil) — hilang saat unmount.
 *  3. View DED punya cleanup unmount yang membatalkan lari:
 *     `useEffect(() => () => { cancelRef.current = true; }, [])`
 *     (view.tsx:884 sebelum perbaikan) — loop runAnalysis berhenti di
 *     checkpoint berikutnya; panggilan gateway yang sedang jalan TIDAK
 *     di-abort (tidak ada AbortSignal di jalur DED) tetapi hasilnya
 *     ditulis ke setState komponen yang sudah unmount → hilang.
 *  4. Mount kembali = useState segar: layar 'input', tahap awal,
 *     tanpa hasil. Dari sudut user: proses ke-reset.
 *
 * Perbaikan (pola Chat AI executionRuntime): state lari pindah ke
 * store module-level `dedRunStore.ts` — loop menulis ke store, view
 * hanya mirror snapshot lewat subscribe. Unmount = unsubscribe saja;
 * mount kembali menghidrasi dari snapshot (progres terkini, atau hasil
 * bila lari selesai saat user di menu lain). Pembatalan hanya eksplisit
 * (tombol Kembali) atau supersede (lari baru).
 *
 * Suite ini skrip asersi tsx polos: simulasi unmount/remount di level
 * store (unsubscribe = unmount, subscribe baru + getDedRunSnapshot =
 * remount) + pin sumber atas view.tsx. TANPA panggilan AI berbayar,
 * tanpa jaringan, tanpa render React (repo tidak punya harness render
 * komponen — perilaku mount/unmount React penuh diverifikasi lewat
 * kode + verifikasi live di Preview).
 * Jalankan dari ROOT repo: npx --yes tsx src/test/dedRunSurvivesMenuSwitch.src.ts
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  cancelDedRun,
  getDedRunSnapshot,
  isDedRunActive,
  isDedRunCancelled,
  patchDedRun,
  publishDedRun,
  publishDedRunSnapshot,
  startDedRun,
  subscribeDedRun,
  __resetDedRunStore,
} from '../ai-tools/ded-ai-estimate/dedRunStore';
import type { DedAiStage, ProgressSummary } from '../ai-tools/ded-ai-estimate/DedAiProgressView';
import type { DedAiSession } from '../ai-tools/ded-ai-estimate/DedAiInputView';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const here = dirname(fileURLToPath(import.meta.url));
const srcOf = (rel: string) => readFileSync(join(here, rel), 'utf8');

const fakeStages = (status: DedAiStage['status'] = 'waiting'): DedAiStage[] => ([
  { key: 'received', title: 'Diterima', desc: '', icon: null, status },
  { key: 'reading', title: 'Membaca', desc: '', icon: null, status: 'waiting' },
] as DedAiStage[]);
const fakeSummary = (over: Partial<ProgressSummary> = {}): ProgressSummary => ({
  projectName: 'Rumah Tes', fileCount: 1, totalSize: 1024, mode: 'FAST',
  startedAt: 1000, ...over,
});
const fakeSession = {
  files: [], description: '', projectName: 'Rumah Tes', projectType: 'BANGUNAN',
  mode: 'FAST', dedMode: 'FULL_AI', policy: 'FULL_AI', fullAi: true, targetProjectId: null,
} as unknown as DedAiSession;
const fakeResult = { items: [{ id: 'x' }], grandTotal: 123 } as any;

async function main() {
  // =====================================================================
  // A. Lari bertahan melewati unmount/remount (simulasi pindah menu)
  // =====================================================================
  __resetDedRunStore();
  const run1 = startDedRun({
    session: fakeSession, runMode: 'FULL_AI', stages: fakeStages(),
    percent: 2, statusLine: 'Menyiapkan…', summary: fakeSummary(),
  });
  check('A1 lari dimulai: status running, layar progress', run1.status === 'running' && run1.screen === 'progress');
  check('A2 isDedRunActive true selama lari', isDedRunActive() === true);
  let l1Calls = 0;
  const unsubL1 = subscribeDedRun(() => { l1Calls++; });
  check('A3 patch progres diterima saat ter-mount', patchDedRun(run1.runId, { percent: 45 }) === true
    && getDedRunSnapshot()?.percent === 45 && l1Calls === 1);
  // --- SIMULASI PINDAH MENU: unmount = unsubscribe saja ---
  unsubL1();
  check('A4 sesudah unsubscribe, lari TIDAK dibatalkan (inti perbaikan)',
    isDedRunCancelled(run1.runId) === false && isDedRunActive() === true);
  check('A5 loop terus menulis ke store saat komponen unmount',
    patchDedRun(run1.runId, { percent: 80, statusLine: 'Menganalisis…' }) === true
    && getDedRunSnapshot()?.percent === 80 && l1Calls === 1);
  // --- SIMULASI KEMBALI KE MENU: remount = subscribe baru + baca snapshot ---
  let l2Seen: number | null = null;
  subscribeDedRun((s) => { l2Seen = s?.percent ?? null; });
  const remounted = getDedRunSnapshot();
  check('A6 remount menghidrasi progres TERKINI (80, bukan dari nol)',
    remounted?.percent === 80 && remounted?.statusLine === 'Menganalisis…' && remounted?.status === 'running');
  patchDedRun(run1.runId, { percent: 90 });
  check('A7 subscriber baru menerima update live sesudah remount', l2Seen === 90);

  // =====================================================================
  // B. Lari selesai saat user di menu lain — hasil TETAP ADA
  // =====================================================================
  // (L2 masih ter-subscribe sebagai "komponen ter-mount"; untuk
  // mensimulasikan selesai-saat-unmount, reset listener dulu.)
  __resetDedRunStore();
  const runB = startDedRun({
    session: fakeSession, runMode: 'EZRAB_AI', stages: fakeStages(),
    percent: 2, statusLine: 'Menyiapkan…', summary: fakeSummary(),
  });
  const unsubB = subscribeDedRun(() => {});
  unsubB(); // pindah menu di tengah lari
  patchDedRun(runB.runId, { percent: 100, result: fakeResult, resultReady: true, status: 'done' });
  patchDedRun(runB.runId, { screen: 'result' }); // setTimeout 900 mdtk
  const doneSnap = getDedRunSnapshot();
  check('B1 lari selesai saat detached: status done + hasil ada + layar result',
    doneSnap?.status === 'done' && doneSnap?.result === fakeResult
    && doneSnap?.resultReady === true && doneSnap?.screen === 'result');
  check('B2 isDedRunActive false sesudah selesai', isDedRunActive() === false);

  // =====================================================================
  // C. Supersede — lari baru menggantikan lari lama; tulisan basi ditolak
  // =====================================================================
  const runC2 = startDedRun({
    session: fakeSession, runMode: 'FULL_AI', stages: fakeStages(),
    percent: 2, statusLine: 'Menyiapkan…', summary: fakeSummary(),
  });
  check('C1 lari baru: runId baru + snapshot di-reset (persen 2)',
    runC2.runId !== runB.runId && getDedRunSnapshot()?.percent === 2
    && getDedRunSnapshot()?.result === null);
  check('C2 patch dari lari basi DITOLAK dan snapshot tidak berubah',
    patchDedRun(runB.runId, { percent: 99 }) === false
    && getDedRunSnapshot()?.percent === 2);
  check('C3 lari basi terbaca dibatalkan; lari baru tidak',
    isDedRunCancelled(runB.runId) === true && isDedRunCancelled(runC2.runId) === false);

  // =====================================================================
  // D. Pembatalan eksplisit (tombol Kembali) — satu-satunya jalur batal
  // =====================================================================
  check('D1 cancelDedRun: status cancelled + layar input',
    cancelDedRun(runC2.runId) === true
    && getDedRunSnapshot()?.status === 'cancelled'
    && getDedRunSnapshot()?.screen === 'input');
  check('D2 sesudah batal, isDedRunCancelled true + tidak aktif',
    isDedRunCancelled(runC2.runId) === true && isDedRunActive() === false);
  check('D3 patch sesudah batal DITOLAK (tidak menghidupkan lari)',
    patchDedRun(runC2.runId, { percent: 50 }) === false
    && getDedRunSnapshot()?.percent === 2);
  check('D4 cancel runId basi no-op (false)',
    cancelDedRun(9999) === false);

  // =====================================================================
  // E. Publish UI + snapshot draft-load
  // =====================================================================
  check('E1 publishDedRun menulis flag UI ke snapshot terkini',
    publishDedRun({ draftSaved: true }) === true
    && getDedRunSnapshot()?.draftSaved === true);
  const draftSnap = publishDedRunSnapshot({
    status: 'done', screen: 'result', session: fakeSession, runMode: 'EZRAB_AI',
    stages: fakeStages('done'), percent: 100, statusLine: 'Selesai',
    summary: fakeSummary(), error: null, result: fakeResult, fullAiOutput: null,
    resultReady: true, draftSaved: true, finalized: false, startedAt: 2000,
  });
  check('E2 publishDedRunSnapshot (load draft): runId baru + done + hasil',
    draftSnap.runId !== runC2.runId && draftSnap.status === 'done'
    && draftSnap.result === fakeResult && draftSnap.screen === 'result');
  check('E3 cancel pada lari done: hanya pindah layar, status tetap done',
    cancelDedRun(draftSnap.runId) === true
    && getDedRunSnapshot()?.status === 'done'
    && getDedRunSnapshot()?.screen === 'input');
  __resetDedRunStore();
  check('E4 publish tanpa snapshot no-op (false) + snapshot null',
    publishDedRun({ percent: 5 }) === false && getDedRunSnapshot() === null);

  // =====================================================================
  // F. Pin sumber — view.tsx memakai store; cleanup pembatalan HILANG
  // =====================================================================
  const viewSrc = srcOf('../ai-tools/ded-ai-estimate/view.tsx');
  check('F1 cancelRef TIDAK dideklarasikan lagi di view',
    !viewSrc.includes('const cancelRef'));
  check('F2 cleanup unmount pembatalan HILANG dari view',
    !viewSrc.includes('useEffect(() => () => { cancelRef.current = true; }, [])'));
  check('F3 view mengimpor dedRunStore', viewSrc.includes("from './dedRunStore'"));
  check('F4 view memakai startDedRun + subscribeDedRun + cancelDedRun',
    viewSrc.includes('startDedRun(') && viewSrc.includes('subscribeDedRun(')
    && viewSrc.includes('cancelDedRun('));
  const runCancelledCalls = (viewSrc.match(/runCancelled\(\)/g) || []).length;
  check('F5 loop memakai cek batal store runCancelled() (≥4 situs)',
    runCancelledCalls >= 4, `ditemukan ${runCancelledCalls}`);
  check('F6 markUpTo menulis tahap ke store (patchDedRun + applyStageMark)',
    viewSrc.includes('patchDedRun(runId, { stages: applyStageMark'));
  check('F7 guard autorun: lari aktif tidak dikonsumsi ulang',
    viewSrc.includes('if (isDedRunActive()) return;'));
  check('F8 view menghidrasi state dari snapshot store saat mount',
    viewSrc.includes('useState(getDedRunSnapshot)'));
  const wsSrc = srcOf('../components/dashboard/WorkspaceView.tsx');
  check('F9 navigasi TIDAK diubah: WorkspaceView tetap unmount per menu',
    wsSrc.includes('key={activeMenu}'));

  // =====================================================================
  // G. Semantik listener
  // =====================================================================
  __resetDedRunStore();
  let goodCalls = 0;
  subscribeDedRun(() => { throw new Error('listener nakal'); });
  subscribeDedRun(() => { goodCalls++; });
  const runG = startDedRun({
    session: fakeSession, runMode: 'FULL_AI', stages: fakeStages(),
    percent: 2, statusLine: 'Menyiapkan…', summary: fakeSummary(),
  });
  check('G1 listener yang melempar tidak merusak notify/listener lain',
    goodCalls === 1 && getDedRunSnapshot()?.runId === runG.runId);
  let g2Calls = 0;
  const unsubG2 = subscribeDedRun(() => { g2Calls++; });
  unsubG2();
  patchDedRun(runG.runId, { percent: 33 });
  check('G2 unsubscribe menghentikan notifikasi', g2Calls === 0);
  const s1 = getDedRunSnapshot();
  const s2 = getDedRunSnapshot();
  check('G3 getDedRunSnapshot stabil tanpa mutasi (referensi sama)', s1 === s2);

  console.log(`\nHASIL: ${pass} lulus, ${fail} gagal (total ${pass + fail})`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('SUITE ERROR:', err);
  process.exitCode = 1;
});
