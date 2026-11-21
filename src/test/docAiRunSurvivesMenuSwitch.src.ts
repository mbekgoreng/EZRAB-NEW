/**
 * docAiRunSurvivesMenuSwitch.src.ts — PROSES TIDAK BOLEH RESET SAAT
 * PINDAH MENU (perintah owner 2026-11-21 04:19).
 *
 * Laporan owner: di DED RAB AI (dan menu lain), bila proses masih
 * berjalan lalu user pindah menu, prosesnya KE-RESET.
 *
 * Mekanisme reset Document AI yang TERBUKTI (dari kode, audit baca):
 *  1. WorkspaceView merender menu dengan `<div key={activeMenu}>` —
 *     pindah menu MENG-UNMOUNT DocCreator/DocAnalyzer sepenuhnya.
 *  2. Generate (`runGenerate`/`runFunnelGenerate`/`runTranslate` di
 *     DocCreator.tsx) menyimpan state di useState; `await
 *     documentStudioOrchestrator.handle(...)` TIDAK dibatalkan saat
 *     unmount (tidak ada AbortSignal), tetapi `setHtml`/`setMode` dan
 *     `onUpsertDraft` menjadi no-op — dan draf hanya ditulis ke
 *     localStorage lewat efek view (`useEffect(... [drafts])`) yang
 *     tidak pernah jalan sesudah unmount → DRAF HASIL HILANG TOTAL.
 *  3. Analisis (DocAnalyzer.tsx) sama: hasil ke `modeResults` lokal +
 *     `onAddHistory` → hilang bila selesai saat ter-unmount.
 *
 * Perbaikan (dua lapis, `docAiRunStore.ts`):
 *  - Lapis ketahanan: `persistDraftDurable`/`recordHistoryDurable`
 *    menulis LANGSUNG ke localStorage (draftStore/historyStore yang
 *    sudah ada) — draf + riwayat selamat walau komponen unmount.
 *  - Lapis runtime: lari generate/analisis dicatat module-level;
 *    mount kembali me-attach ulang (progres live / hasil selesai
 *    tanpa mengulang panggilan AI; lari terminal dikonsumsi sekali).
 *
 * Suite ini skrip asersi tsx polos: stub localStorage berbasis Map
 * (Node tidak punya localStorage), simulasi unmount/remount di level
 * store (unsubscribe = unmount, subscribe baru + getter = remount) +
 * pin sumber atas DocCreator/DocAnalyzer. TANPA panggilan AI berbayar,
 * tanpa jaringan, tanpa render React.
 * Jalankan dari ROOT repo: npx --yes tsx src/test/docAiRunSurvivesMenuSwitch.src.ts
 */

// Stub localStorage (Node tidak menyediakannya) — dipasang SEBELUM
// modul store diimpor? Impor ESM di-hoist, tapi store.ts hanya
// menyentuh localStorage DI DALAM fungsi (readJSON/writeJSON), bukan
// saat impor — jadi stub di sini cukup, asal dipasang sebelum
// pemakaian pertama.
const lsMap = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (lsMap.has(k) ? lsMap.get(k)! : null),
  setItem: (k: string, v: string) => { lsMap.set(k, String(v)); },
  removeItem: (k: string) => { lsMap.delete(k); },
  clear: () => { lsMap.clear(); },
  key: (i: number) => [...lsMap.keys()][i] ?? null,
  get length() { return lsMap.size; },
} as Storage;

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  cancelDocAiAnalysis,
  cancelDocAiGenerate,
  consumeDocAiAnalysisRun,
  consumeDocAiGenerateRun,
  failDocAiAnalysis,
  failDocAiGenerate,
  finishDocAiAnalysis,
  finishDocAiGenerate,
  getDocAiAnalysisRun,
  getDocAiGenerateRun,
  isDocAiAnalysisActive,
  isDocAiGenerateActive,
  patchDocAiAnalysisProgress,
  persistDraftDurable,
  readDraftDurable,
  recordHistoryDurable,
  startDocAiAnalysis,
  startDocAiGenerate,
  subscribeDocAiAnalysis,
  subscribeDocAiGenerate,
  __resetDocAiRunStore,
} from '../ai-tools/document-ai/docAiRunStore';
import { draftStore, historyStore } from '../ai-tools/document-ai/store';
import type { DraftRecord } from '../ai-tools/document-ai/store';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const here = dirname(fileURLToPath(import.meta.url));
const srcOf = (rel: string) => readFileSync(join(here, rel), 'utf8');

const fakeDraft = (over: Partial<DraftRecord> = {}): DraftRecord => ({
  id: 'draft-tes-1',
  templateId: 'tpl-1',
  templateName: 'Surat Tes',
  title: 'Surat Tes',
  content: '<p>Isi draf tes</p>',
  contentFormat: 'html',
  status: 'draft',
  createdAt: 1000,
  updatedAt: 1000,
  ...over,
});

async function main() {
  // =====================================================================
  // A. Lari generate bertahan melewati unmount/remount
  // =====================================================================
  __resetDocAiRunStore();
  lsMap.clear();
  const gen1 = startDocAiGenerate('funnel', 'Berita Acara Opname');
  check('A1 lari generate dimulai: status running, kind funnel',
    gen1.status === 'running' && gen1.kind === 'funnel' && gen1.docName === 'Berita Acara Opname');
  let g1Calls = 0;
  const unsubG1 = subscribeDocAiGenerate(() => { g1Calls++; });
  // --- SIMULASI PINDAH MENU: unmount = unsubscribe saja ---
  unsubG1();
  check('A2 sesudah unsubscribe, lari TIDAK dibatalkan (inti perbaikan)',
    getDocAiGenerateRun()?.status === 'running' && getDocAiGenerateRun()?.requestId === gen1.requestId);
  check('A3 isDocAiGenerateActive true selama lari (sesudah unmount)', isDocAiGenerateActive() === true);
  // --- Lari selesai saat komponen tidak aktif ---
  check('A4 finish saat ter-unmount diterima + draftId tercatat',
    finishDocAiGenerate(gen1.requestId, 'draft-tes-1') === true
    && getDocAiGenerateRun()?.status === 'done'
    && getDocAiGenerateRun()?.draftId === 'draft-tes-1' && g1Calls === 0);
  // --- SIMULASI KEMBALI KE MENU: remount = subscribe baru + baca getter ---
  let g2Seen: string | null = null;
  subscribeDocAiGenerate((run) => { g2Seen = run?.status ?? null; });
  const remounted = getDocAiGenerateRun();
  check('A5 remount melihat lari SELESAI + draftId (hasil tidak hilang)',
    remounted?.status === 'done' && remounted?.draftId === 'draft-tes-1');
  const consumed = consumeDocAiGenerateRun(gen1.requestId);
  check('A6 konsumsi lari terminal mengembalikan lari + membersihkan runtime',
    consumed?.requestId === gen1.requestId && consumed?.status === 'done' && getDocAiGenerateRun() === null);
  check('A7 konsumsi kedua mengembalikan null (sekali saja)',
    consumeDocAiGenerateRun(gen1.requestId) === null);

  // =====================================================================
  // B. Ketahanan localStorage — draf + riwayat selamat walau unmount
  // =====================================================================
  __resetDocAiRunStore();
  lsMap.clear();
  persistDraftDurable(fakeDraft());
  check('B1 persistDraftDurable → readDraftDurable mengembalikan draf yang sama',
    readDraftDurable('draft-tes-1')?.content === '<p>Isi draf tes</p>');
  check('B2 draf benar-benar tertulis ke localStorage (kunci ezrab_docai_drafts_v1)',
    (lsMap.get('ezrab_docai_drafts_v1') ?? '').includes('draft-tes-1'));
  persistDraftDurable(fakeDraft({ content: '<p>Isi BARU</p>', updatedAt: 2000 }));
  check('B3 upsert id sama menimpa isi (tanpa duplikat)',
    readDraftDurable('draft-tes-1')?.content === '<p>Isi BARU</p>'
    && draftStore.list().filter((d) => d.id === 'draft-tes-1').length === 1);
  recordHistoryDurable({
    type: 'draft', docIds: [], docNames: [],
    title: 'Draf: Surat Tes', resultPreview: 'preview', resultFull: 'full',
  });
  check('B4 recordHistoryDurable → historyStore.list memuat entri',
    historyStore.list().some((h) => h.title === 'Draf: Surat Tes'));
  check('B5 riwayat benar-benar tertulis ke localStorage (kunci ezrab_docai_history_v1)',
    (lsMap.get('ezrab_docai_history_v1') ?? '').includes('Draf: Surat Tes'));

  // =====================================================================
  // C. Lari analisis bertahan melewati unmount/remount
  // =====================================================================
  __resetDocAiRunStore();
  const ana1 = startDocAiAnalysis('doc-1', 'RAB Proyek.pdf', 'summary');
  check('C1 lari analisis dimulai: running, docId + tab tercatat',
    ana1.status === 'running' && ana1.docId === 'doc-1' && ana1.tab === 'summary');
  check('C2 isDocAiAnalysisActive keyed by docId',
    isDocAiAnalysisActive('doc-1') === true && isDocAiAnalysisActive('doc-2') === false);
  let a1Calls = 0;
  const unsubA1 = subscribeDocAiAnalysis(() => { a1Calls++; });
  // --- SIMULASI PINDAH MENU ---
  unsubA1();
  check('C3 sesudah unsubscribe, lari analisis TIDAK dibatalkan',
    getDocAiAnalysisRun()?.status === 'running' && isDocAiAnalysisActive('doc-1') === true);
  check('C4 patch progres saat ter-unmount diterima (progres live)',
    patchDocAiAnalysisProgress(ana1.requestId, 55, 'Memproses halaman 3/5…') === true
    && getDocAiAnalysisRun()?.percent === 55 && a1Calls === 0);
  // --- Lari selesai saat komponen tidak aktif ---
  check('C5 finish saat ter-unmount diterima + hasil tercatat',
    finishDocAiAnalysis(ana1.requestId, { reply: 'Ringkasan: …', coverage: { pages: 5 }, truncated: false }) === true
    && getDocAiAnalysisRun()?.status === 'done'
    && getDocAiAnalysisRun()?.result?.reply === 'Ringkasan: …');
  // --- SIMULASI KEMBALI KE MENU ---
  const remountedAna = getDocAiAnalysisRun();
  check('C6 remount melihat hasil analisis selesai (tanpa ulang panggilan AI)',
    remountedAna?.status === 'done' && remountedAna?.result?.reply === 'Ringkasan: …' && remountedAna?.docId === 'doc-1');
  const consumedAna = consumeDocAiAnalysisRun(ana1.requestId);
  check('C7 konsumsi lari analisis terminal sekali saja',
    consumedAna?.requestId === ana1.requestId && getDocAiAnalysisRun() === null
    && consumeDocAiAnalysisRun(ana1.requestId) === null);

  // =====================================================================
  // D. Pagar: requestId usang, konsumsi prematur, batal
  // =====================================================================
  __resetDocAiRunStore();
  const old = startDocAiGenerate('generate', 'Dokumen Lama');
  const fresh = startDocAiGenerate('generate', 'Dokumen Baru');
  check('D1 patch lari usang ditolak sesudah lari baru dimulai',
    finishDocAiGenerate(old.requestId, 'draft-x') === false
    && getDocAiGenerateRun()?.requestId === fresh.requestId);
  check('D2 konsumsi lari yang masih running mengembalikan null',
    consumeDocAiGenerateRun(fresh.requestId) === null && getDocAiGenerateRun() !== null);
  check('D3 cancel menandai cancelled; finish sesudah cancel ditolak',
    cancelDocAiGenerate(fresh.requestId) === true
    && getDocAiGenerateRun()?.status === 'cancelled'
    && finishDocAiGenerate(fresh.requestId, 'draft-y') === false);
  check('D4 konsumsi dengan requestId salah mengembalikan null',
    consumeDocAiGenerateRun(99999) === null);
  const ana2 = startDocAiAnalysis('doc-9', 'X.pdf', 'qa');
  const ana3 = startDocAiAnalysis('doc-9', 'X.pdf', 'extract');
  check('D5 patch progres lari analisis usang ditolak',
    patchDocAiAnalysisProgress(ana2.requestId, 90, '…') === false
    && getDocAiAnalysisRun()?.requestId === ana3.requestId);
  check('D6 fail lari analisis mencatat error + status failed',
    failDocAiAnalysis(ana3.requestId, 'MODEL_ERROR: gagal') === true
    && getDocAiAnalysisRun()?.status === 'failed'
    && getDocAiAnalysisRun()?.error === 'MODEL_ERROR: gagal');
  check('D7 cancel analisis + patch sesudah cancel ditolak',
    cancelDocAiAnalysis(ana3.requestId) === true
    && patchDocAiAnalysisProgress(ana3.requestId, 10, '…') === false);
  const genF = startDocAiGenerate('translate', 'Terjemahan');
  check('D8 fail lari generate mencatat error',
    failDocAiGenerate(genF.requestId, 'Gagal terjemahan') === true
    && getDocAiGenerateRun()?.status === 'failed');

  // =====================================================================
  // E. Pin sumber — DocCreator + DocAnalyzer benar-benar memakai runtime
  // =====================================================================
  const creator = srcOf('../ai-tools/document-ai/components/DocCreator.tsx');
  const analyzer = srcOf('../ai-tools/document-ai/components/DocAnalyzer.tsx');
  check('E1 DocCreator mengimpor docAiRunStore', creator.includes("from '../docAiRunStore'"));
  const genStarts = (creator.match(/startDocAiGenerate\(/g) ?? []).length;
  check('E2 DocCreator mendaftarkan lari di 3 jalur (generate/funnel/translate)',
    genStarts >= 3, `ditemukan ${genStarts}`);
  check('E3 DocCreator memakai finish/fail + tulis-durable',
    creator.includes('finishDocAiGenerate(') && creator.includes('failDocAiGenerate(')
    && creator.includes('recordHistoryDurable(') && creator.includes('persistDraftDurable('));
  check('E4 DocCreator punya efek re-attach generate',
    creator.includes('subscribeDocAiGenerate(') && creator.includes('getDocAiGenerateRun()')
    && creator.includes('readDraftDurable(') && creator.includes('consumeDocAiGenerateRun('));
  check('E5 DocCreator melewati lari milik mount sendiri saat attach',
    creator.includes('ownGenRunRef') && creator.includes('run.requestId === ownGenRunRef.current'));
  check('E6 DocAnalyzer mengimpor docAiRunStore + memakai API analisis',
    analyzer.includes("from '../docAiRunStore'")
    && analyzer.includes('startDocAiAnalysis(') && analyzer.includes('finishDocAiAnalysis(')
    && analyzer.includes('failDocAiAnalysis(') && analyzer.includes('patchDocAiAnalysisProgress(')
    && analyzer.includes('cancelDocAiAnalysis('));
  check('E7 DocAnalyzer punya efek re-attach analisis + pagar auto-run',
    analyzer.includes('subscribeDocAiAnalysis(') && analyzer.includes('getDocAiAnalysisRun()')
    && analyzer.includes('isDocAiAnalysisActive(') && analyzer.includes('consumeDocAiAnalysisRun('));
  check('E8 DocAnalyzer attach HANYA untuk dokumen yang sama (pagar docId)',
    analyzer.includes('run.docId !== doc.id'));
  check('E9 DocAnalyzer riwayat QA juga ditulis durable',
    analyzer.includes('recordHistoryDurable('));

  console.log(`\nHASIL: ${pass} lulus, ${fail} gagal (total ${pass + fail})`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('SUITE ERROR:', err);
  process.exitCode = 1;
});
