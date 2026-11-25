/**
 * DED-AI Estimate — Orkestrator 3 tampilan: Input → Progress → Hasil.
 * Memakai pipeline aktif src/ai-tools/ded-ai-estimate/* (tidak membuat pipeline baru).
 * Multi-file: service dijalankan per file, hasilnya digabung via DedAiCalculator.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { dedAiEstimateService, DedAiOutputEnvelope } from './service';
import { DedAiCalculator } from './calculator';
import { validateDedFinalizeBatch, validateFullAiFinalizeBatch, formatFinalizeFailures } from './dedFinalizeValidation';
import { buildFinalizationKey, countAssumptionItems, resolveAssumptionCount } from './finalizationKey';
import { mergeAnalysisTraces, FileTraceInput } from './analysisTrace';
import { buildDivisionCoverage } from './divisions';
import { groupByWbs } from './wbsClassifier';
import {
  DedAiItem, DedAiMode, DedAiOutput, DedAiProjectType,
  DedOutputPrefs, DEFAULT_DED_OUTPUT_PREFS,
} from './types';
import {
  depthModeFromFullAi,
  modeFromLegacy,
  modeLabel,
  policyForMode,
  resolveDraftMode,
  type DedEstimationPolicy,
  type DedRabAiMode,
} from './dedMode';
import { buildFullAiAttachmentOutput, resolveDedAiMode } from './dedModeUi';
import { loadPersistedDedMode } from './dedModePersistence';
import { probeDedPdf, resolvePageScope } from './parser';
import { DedAiInputView, DedAiSession } from './DedAiInputView';
import { DedAiProgressView, DedAiStage, applyStageMark, getStageDefs, mapProgressStageKey, ProgressSummary } from './DedAiProgressView';
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
  type DedRunPatch,
  type DedRunSnapshot,
} from './dedRunStore';
import { DedAiResultView } from './DedAiResultView';
// I11 Stage 1 — demo visual-test hook (LOCAL TEST ONLY, demo-gated):
// memasang hasil sintetis bila URL membawa `?dedvr-demo=1`. Tanpa
// param itu modul demo tidak pernah dibaca (lihat dedVisionReviewDemo.ts).
import { demoDedRunSnapshot, isDedVisionReviewDemoRequested } from './dedVisionReviewDemo';
import { fullAiDedService, FULL_AI_TIMEOUT_MS } from '../ded-full-ai/service';
import { FullAiOutput, FullAiItem } from '../ded-full-ai/types';
import { FullAiResultView } from '../ded-full-ai/FullAiResultView';
import { consumePendingAiEntry, goToAi } from '../aiNavigation';
import { consumeDedAutorun, clearDedSession, setDedSession } from '../ezrab-ai/dedDocSessionHolder';
import { aiFeatureLockedMessage, planAllowsAiFeature } from '../../ai-credits/featureGate';
import { recordDedUnderstandingToMemory } from '../ezrab-ai/dedUnderstanding';
import { attachDedToProject } from '../ezrab-ai/dedQtoIntegration';
import { notificationBus } from '../../notifications/notificationBus';
import { useProject } from '../../context/ProjectContext';
import { useRole } from '../../auth/RoleContext';
import { authorizeChatAiMutation } from '../ezrab-ai/mutationInventory';
import { appendMutationAuditRecord } from '../ezrab-ai/mutationAuditLog';
import { useI18n } from '../../i18n/I18nContext';
import { Building2 } from 'lucide-react';
import { FsChip, FsStep } from '../../components/feature-shell/FeatureFullscreenShell';
import { FeaturePageShell } from '../../components/feature-shell/FeaturePageShell';
import { useCreditSimulation } from '../../ai-credits/useCreditSimulation';
import { maskAiModelName, maskAiProviderName } from '../../services/aiModelMasking';

interface Props {
  onNavigateToTab?: (tab: string) => void;
}

type Screen = 'input' | 'progress' | 'result';

interface DraftRecord {
  id: string;
  createdAt: number;
  projectName: string;
  projectType: DedAiProjectType;
  mode: DedAiMode;
  fileNames: string[];
  /**
   * Hasil standar (mesin standar). Opsional sejak Dual Mode W1
   * (G-ST-2): draft Full AI memakai `fullAiOutput` sebagai gantinya.
   * Draft lama selalu membawa output; draft baru membawa PERSIS SATU
   * dari output/fullAiOutput (dipakai load untuk memilih layar hasil).
   */
  output?: DedAiOutput;
  /** Hasil mesin Full AI (draft Full AI) — bentuk FullAiOutput utuh. */
  fullAiOutput?: FullAiOutput;
  /**
   * Mode/policy/mesin asal (G-ST-2) — tersimpan agar load
   * mempertahankan mode. Opsional: draft lama tanpa ketiganya
   * diturunkan dari output.policy via resolveDraftMode (dedMode.ts).
   */
  policy?: DedEstimationPolicy;
  fullAi?: boolean;
  dedMode?: DedRabAiMode;
  /** Preferensi output saat draft disimpan (USULAN BARU ter-ACC 2026-11-10). */
  outputPrefs?: DedOutputPrefs;
}

/**
 * Resolusi cakupan halaman sesi menjadi nomor halaman nyata per berkas
 * (USULAN BARU ter-ACC 2026-11-10). Mengembalikan:
 * - undefined: cakupan "Semua halaman" (atau jumlah halaman tak diketahui —
 *   probe gagal; parse analisis sendiri akan gagal sesudahnya bila berkas
 *   memang tidak terbaca);
 * - array non-kosong: halaman terpilih untuk berkas ini;
 * - array KOSONG: user memilih halaman tetapi tidak satu pun ada di berkas
 *   ini — pemanggil WAJIB menggagalkan lari dengan pesan jujur, bukan
 *   diam-diam menganalisis semua halaman.
 */
const resolveSessionPageScope = async (
  sess: DedAiSession,
  item: DedAiSession['files'][number],
  buffer: ArrayBuffer,
): Promise<number[] | undefined> => {
  if (sess.pageScope?.kind !== 'SELECTED') return undefined;
  let count = sess.filePageCounts?.[item.id];
  if (!count) {
    const probe = await probeDedPdf(buffer);
    count = probe?.pageCount;
  }
  if (!count) return undefined;
  return resolvePageScope(sess.pageScope.spec, count).pages;
};
const DRAFT_KEY = 'ezrab_dedai_drafts_v1';

const loadDrafts = (): DraftRecord[] => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as DraftRecord[]) : [];
  } catch { return []; }
};

const initialStages = (t: (key: string) => string, mode: DedRabAiMode = 'EZRAB_AI'): DedAiStage[] =>
  getStageDefs(t, mode).map((d) => ({ ...d, status: 'waiting' as const }));

export const DedAiEstimateView: React.FC<Props> = ({ onNavigateToTab }) => {
  const { t } = useI18n();
  const { projects, createProject, bulkAddRabItems, getLastBulkAddOutcome, setCurrentProjectId, currentProjectId } = useProject();
  // P1-B — Gerbang kapabilitas finalisasi DED: peran aktif dibaca
  // LANGSUNG dari useRole (view DED tidak memasang konteks operasi
  // asisten chat — getAssistantOperationContext() di sini null karena
  // view chat tidak ter-mount, sehingga memakainya akan menolak
  // SEMUA finalisasi). Peta "Admin" §4.2 = edit-estimate, sama
  // seperti gerbang Chat AI. KEJUJURAN (WC-06): gerbang UX sisi
  // klien — lihat mutationInventory.ts.
  const { activeRole, hasCapability } = useRole();
  // Saldo kredit simulasi (store bersama mockAdapter — angka yang sama
  // dengan yang dilihat InputView) untuk chip Kredit AI di bar atas shell.
  const { balance: creditBalance } = useCreditSimulation();
  // HIDRASI DARI STORE LARI (perintah owner 2026-11-21 04:19 — proses
  // tidak boleh ke-reset saat pindah menu): bila sebuah lari masih
  // tersimpan di dedRunStore (user kembali sesudah pindah menu), mount
  // ini menampilkan snapshot itu — progres terkini, atau hasil bila
  // lari sudah selesai saat user di menu lain — bukan layar input
  // segar. Tanpa snapshot: default persis seperti sebelumnya. State
  // lokal di bawah ini adalah MIRROR snapshot store, bukan kebenaran
  // sendiri (lihat applyDedRunSnapshot + efek langganan di bawah).
  const [hydratedRun] = useState(getDedRunSnapshot);
  const [screen, setScreen] = useState<Screen>(hydratedRun?.screen ?? 'input');
  // D-45 (Batch E): sesi baru memakai mode DED terakhir yang dipilih
  // pengguna (localStorage `ezrab_dedai_mode`), bukan selalu default
  // C2 — policy/fullAi diturunkan dari mode yang dipulihkan (C1).
  // Tanpa nilai tersimpan → default EZRAB AI MODE seperti sebelumnya.
  const [session, setSession] = useState<DedAiSession>(() => {
    if (hydratedRun?.session) return hydratedRun.session;
    const persistedMode = loadPersistedDedMode();
    return {
      files: [], description: '', projectName: '',
      projectType: 'BANGUNAN', mode: 'FAST', dedMode: persistedMode,
      policy: policyForMode(persistedMode), fullAi: persistedMode === 'FULL_AI', targetProjectId: null,
    };
  });
  const [stages, setStages] = useState<DedAiStage[]>(() => hydratedRun?.stages ?? initialStages(t, loadPersistedDedMode()));
  const [percent, setPercent] = useState(hydratedRun?.percent ?? 0);
  const [statusLine, setStatusLine] = useState(hydratedRun?.statusLine ?? t('ai.ded.preparing'));
  const [fullAiOutput, setFullAiOutput] = useState<FullAiOutput | null>(hydratedRun?.fullAiOutput ?? null);
  const [summary, setSummary] = useState<ProgressSummary>(hydratedRun?.summary ?? {
    projectName: '', fileCount: 0, totalSize: 0, mode: 'FAST', startedAt: Date.now(),
  });
  const [error, setError] = useState<{ message: string; errorCode?: string; stage?: string; retryable?: boolean } | null>(hydratedRun?.error ?? null);
  const [result, setResult] = useState<DedAiOutput | null>(hydratedRun?.result ?? null);
  const [resultReady, setResultReady] = useState(hydratedRun?.resultReady ?? false);
  const [drafts, setDrafts] = useState<DraftRecord[]>(loadDrafts);
  const [draftSaved, setDraftSaved] = useState(hydratedRun?.draftSaved ?? false);
  const [finalized, setFinalized] = useState(hydratedRun?.finalized ?? false);
  // runId lari yang dimiliki/dilanjutkan mount ini — dipakai loop lari
  // (tulis store) dan aksi batal. Diisi saat lari dimulai atau saat
  // hidrasi dari snapshot. TIDAK PERNAH di-reset oleh unmount.
  // (cancelRef lama DIHAPUS: flag batal kini hidup di store agar
  // terbaca loop lintas mount — ref komponen mati bersama mount-nya.)
  const activeRunIdRef = useRef<number | null>(hydratedRun?.runId ?? null);
  // Mode lari yang sedang berjalan (diferensiasi progres 2 mode, ACC
  // 2026-11-20): markUpTo butuh mode untuk memetakan kunci tahap 6-tahap
  // ke daftar tahap tampilan (3 tahap Full AI vs 6 tahap EZRAB AI).
  // Diisi runAnalysis sesudah resolveDedAiMode, sebelum satu pun
  // markUpTo dipanggil; tidak pernah dibaca di luar lari.
  const runModeRef = useRef<DedRabAiMode>('EZRAB_AI');

  // Mirror snapshot store → state lokal. Satu-satunya penulis state
  // lokal dari store; dipanggil saat mount (hidrasi susulan) dan pada
  // tiap perubahan snapshot (progres live dari loop lari — termasuk
  // loop yang jalan saat komponen ini ter-unmount).
  const applyDedRunSnapshot = useCallback((snap: DedRunSnapshot) => {
    activeRunIdRef.current = snap.runId;
    setScreen(snap.screen);
    if (snap.session) setSession(snap.session);
    setStages(snap.stages);
    setPercent(snap.percent);
    setStatusLine(snap.statusLine);
    setSummary(snap.summary);
    setError(snap.error);
    setResult(snap.result);
    setFullAiOutput(snap.fullAiOutput);
    setResultReady(snap.resultReady);
    setDraftSaved(snap.draftSaved);
    setFinalized(snap.finalized);
  }, []);

  // Langganan store lari: unmount = unsubscribe SAJA. TIDAK ADA
  // pembatalan di sini — inilah inti perbaikan reset-saat-pindah-menu
  // (cleanup unmount lama yang mengeset cancelRef DIHAPUS; lari terus
  // berjalan di balik menu lain dan snapshot-nya dibaca lagi di sini).
  useEffect(() => {
    const snap = getDedRunSnapshot();
    if (snap) applyDedRunSnapshot(snap);
    return subscribeDedRun((s) => { if (s) applyDedRunSnapshot(s); });
  }, [applyDedRunSnapshot]);

  // I11 Stage 1 — DEMO VISUAL-TEST HOOK (gated `?dedvr-demo=1`):
  // pasang hasil sintetis dari dedVisionReviewDemo.ts sebagai layar
  // hasil agar viewer tinjau visual I7 bisa dirender + diuji di
  // browser tanpa lari vision live. TIDAK PERNAH menimpa lari nyata
  // (guard snapshot) dan tidak aktif tanpa param query tersebut.
  useEffect(() => {
    if (!isDedVisionReviewDemoRequested()) return;
    if (getDedRunSnapshot()) return;
    publishDedRunSnapshot(demoDedRunSnapshot());
  }, []);

  // Penulis loop lari → store. Loop TIDAK PERNAH memanggil setState
  // komponen langsung — setState ke komponen yang ter-unmount hilang,
  // sementara tulis store bertahan dan di-mirror saat mount kembali.
  const writeRun = useCallback((patch: DedRunPatch) => {
    const runId = activeRunIdRef.current;
    if (runId == null) return;
    patchDedRun(runId, patch);
  }, []);
  // Satu-satunya cek pembatalan loop: flag store (batal eksplisit atau
  // supersede oleh lari baru). Unmount TIDAK PERNAH membuatnya true.
  const runCancelled = useCallback(() => {
    const runId = activeRunIdRef.current;
    return runId == null ? true : isDedRunCancelled(runId);
  }, []);
  // Tulis ringkasan (currentFile dkk.) — baca-modifikasi-tulis atas
  // snapshot store, karena loop tidak punya akses ke state komponen
  // sesudah unmount.
  const writeRunSummary = useCallback((patch: Partial<ProgressSummary>) => {
    const runId = activeRunIdRef.current;
    const snap = getDedRunSnapshot();
    if (runId == null || !snap || snap.runId !== runId) return;
    patchDedRun(runId, { summary: { ...snap.summary, ...patch } });
  }, []);

  // Perbaikan final: konsumsi entry DED. Sebelumnya view ini TIDAK PERNAH
  // mengonsumsi entry klasik — hanya projectId via URL yang bertahan,
  // sehingga dedRef/initialPrompt dari resolver tidak pernah tampil.
  const [dedEntryBanner, setDedEntryBanner] = useState<{ label: string; prompt?: string } | null>(null);
  // Perintah Chat AI "jalankan analisis DED" (2026-11-17, Kelompok 3):
  // pemberitahuan bila sinyal autorun gagal dikonsumsi (kedaluwarsa /
  // berkas berubah / sesi hilang / gerbang paket menolak).
  const [autorunNotice, setAutorunNotice] = useState<string | null>(null);
  const dedMountConsumeRef = useRef(false);
  const takeDedEntry = useCallback((clearOnMismatch: boolean) => {
    const entry = consumePendingAiEntry('ded_rab_ai', { clearOnMismatch });
    if (!entry) return;
    setDedEntryBanner({
      label: entry.contextLabel || 'Konteks DED dari EZRAB AI',
      prompt: entry.initialPrompt,
    });
    const text = entry.initialPrompt?.trim();
    if (text) {
      setSession((prev) => (prev.description ? prev : { ...prev, description: text }));
    }
  }, []);
  // Jalur mount: mismatch dibersihkan. Jalur event (view ter-mount): tidak.
  useEffect(() => {
    if (dedMountConsumeRef.current) return;
    dedMountConsumeRef.current = true;
    takeDedEntry(true);
  }, [takeDedEntry]);
  useEffect(() => {
    const onEntry = () => takeDedEntry(false);
    window.addEventListener('ezrab:ai-entry', onEntry);
    return () => window.removeEventListener('ezrab:ai-entry', onEntry);
  }, [takeDedEntry]);

  const persistDrafts = (d: DraftRecord[]) => {
    setDrafts(d);
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* abaikan */ }
  };

  const setStage = (key: string, status: DedAiStage['status']) =>
    setStages((prev) => prev.map((s) => (s.key === key ? { ...s, status } : s)));
  // markUpTo memakai kunci tahap 6-tahap di SEMUA situs panggil (tidak
  // ada yang diubah); kunci dipetakan ke tahap tampilan mode berjalan
  // (mapProgressStageKey) dan urutan diambil dari daftar mode itu —
  // EZRAB_AI: pemetaan identitas + urutan 6 tahap (perilaku lama persis).
  // Tulis ke STORE (bukan setState) agar tahap bertahan melewati
  // unmount; daftar tahap dibaca dari snapshot store (selalu terkini,
  // bahkan saat loop jalan tanpa komponen ter-mount).
  const markUpTo = (key: string, status: DedAiStage['status']) => {
    const runId = activeRunIdRef.current;
    const snap = getDedRunSnapshot();
    if (runId == null || !snap || snap.runId !== runId) return;
    const mode = runModeRef.current;
    const order = getStageDefs(t, mode).map((d) => d.key);
    const mappedKey = mapProgressStageKey(key, mode);
    patchDedRun(runId, { stages: applyStageMark(snap.stages, order, mappedKey, status) });
  };

  const runFullAiAnalysis = async (sess: DedAiSession, aiMode: DedRabAiMode) => {
    try {
      markUpTo('received', 'done');
      writeRun({ percent: 5 });
      writeRun({ statusLine: 'Full AI: Dokumen diterima — memulai pembacaan…' });

      // Gabungkan buffer dari semua file (Full AI v1: proses file pertama + catat sisanya)
      // Untuk multi-file, proses per file dan gabungkan items.
      const allItems: FullAiItem[] = [];
      const allWarnings: string[] = [];
      let projectInfo: FullAiOutput['projectInfo'] | null = null;
      let totalPages = 0;
      let totalChars = 0;
      let lastOutput: FullAiOutput | null = null;

      for (let fi = 0; fi < sess.files.length; fi += 1) {
        if (runCancelled()) return;
        const f = sess.files[fi];
        writeRunSummary({ currentFile: f.file.name });
        markUpTo('reading', 'active');
        writeRun({ statusLine: `Full AI: Membaca ${f.file.name}…` });
        writeRun({ percent: 5 + (fi / sess.files.length) * 20 });

        const buffer = await f.file.arrayBuffer();
        // Cakupan halaman pilihan pengguna (per berkas) untuk mesin Full AI.
        const fullAiScope = await resolveSessionPageScope(sess, f, buffer);
        if (fullAiScope && fullAiScope.length === 0) {
          markUpTo('identify', 'failed');
          writeRun({
            error: {
              message: `Berkas ${f.file.name} tidak memiliki halaman dalam rentang terpilih — sesuaikan cakupan halaman atau gunakan "Semua halaman".`,
              retryable: false,
            },
            status: 'failed',
          });
          writeRun({ statusLine: 'Full AI: Analisis gagal' });
          return;
        }
        markUpTo('extract', 'done');
        markUpTo('identify', 'active');
        writeRun({ statusLine: `Full AI: Menganalisis ${f.file.name}…` });

        const out = await fullAiDedService.execute({
          fileName: f.file.name,
          buffer,
          projectType: sess.projectType,
          mode: sess.mode === 'FAST' ? 'FAST' : 'ADVANCED',
          // DUAL MODE (§3): policy + rabMode diturunkan dari mode kanonis
          // (bukan field sesi mentah); rabMode eksplisit wajib (W5 §7).
          policy: policyForMode(aiMode),
          rabMode: aiMode,
          // G-UI-4: kompleksitas DETAIL diteruskan ke mesin Full AI
          // (aturan sama seperti jalur standar — FAST: undefined).
          complexity: sess.mode === 'DETAIL' ? sess.complexity : undefined,
          pageScope: fullAiScope,
          projectName: sess.projectName,
          onProgress: (stage, pct, msg) => {
            if (runCancelled()) return;
            writeRun({ statusLine: `Full AI: ${msg}` });
            const base = 25 + (fi / sess.files.length) * 70;
            writeRun({ percent: base + (pct / 100) * (70 / sess.files.length) });
            if (stage === 'ANALYZE') markUpTo('identify', 'active');
            if (stage === 'VALIDATE') { markUpTo('identify', 'done'); markUpTo('validate', 'active'); }
            if (stage === 'FINALIZE') { markUpTo('validate', 'done'); markUpTo('prepare', 'active'); }
          },
        });

        if (!out.success) {
          markUpTo('identify', 'failed');
          writeRun({
            error: {
              message: out.error?.message || `Full AI gagal menganalisis ${f.file.name}.`,
              errorCode: out.error?.code,
              retryable: out.error?.retryable,
            },
            status: 'failed',
          });
          writeRun({ statusLine: 'Full AI: Analisis gagal' });
          return;
        }

        // Gabungkan items dengan renumbering
        const offset = allItems.length;
        out.items.forEach((it, idx) => {
          allItems.push({ ...it, id: `fullai-f${fi + 1}-${idx + 1}`, no: offset + idx + 1 });
        });
        allWarnings.push(...out.warnings.map((w) => `[${f.file.name}] ${w}`));
        totalPages += out.provenance.documentPages;
        totalChars += out.provenance.documentChars;
        if (!projectInfo) projectInfo = out.projectInfo;
        lastOutput = out;
      }

      // Hitung ulang summary & total gabungan
      const grandTotal = allItems
        .filter((it) => it.subtotal != null && it.subtotal > 0)
        .reduce((sum, it) => sum + (it.subtotal || 0), 0);

      const summary = {
        totalItems: allItems.length,
        itemsWithQuantity: allItems.filter((it) => it.quantity.value != null).length,
        itemsWithAssumption: allItems.filter((it) => it.quantity.provenance === 'ASSUMPTION').length,
        itemsNeedConfirmation: allItems.filter((it) => it.status === 'NEEDS_CONFIRMATION').length,
        itemsWithAiPrice: allItems.filter((it) => it.price.source === 'AI_ESTIMATE').length,
        itemsWithVerifiedPrice: allItems.filter((it) => it.price.source === 'VERIFIED_SOURCE').length,
        itemsUnresolved: allItems.filter((it) => it.status === 'UNRESOLVED').length,
        excludedFromTotal: allItems.filter((it) => it.subtotal == null).length,
      };

      const excluded = summary.excludedFromTotal;
      const combined: FullAiOutput = {
        success: true,
        mode: sess.mode === 'FAST' ? 'FAST' : 'ADVANCED',
        policy: policyForMode(aiMode),
        projectInfo: projectInfo || { projectType: sess.projectType, scopeSummary: '' },
        items: allItems,
        grandTotal,
        grandTotalNote: excluded > 0
          ? `Total Rp${grandTotal.toLocaleString('id-ID')} mengecualikan ${excluded} item yang belum lengkap.`
          : undefined,
        summary,
        warnings: allWarnings,
        provenance: {
          // Identitas aktual dari file terakhir yang diproses; null bila
          // respons gateway tidak membawanya (jangan ditebak).
          provider: lastOutput?.provenance.provider ?? null,
          model: lastOutput?.provenance.model ?? null,
          timeoutLimitMs:
            lastOutput?.provenance.timeoutLimitMs ??
            FULL_AI_TIMEOUT_MS[sess.mode === 'FAST' ? 'FAST' : 'ADVANCED'],
          timestamp: new Date().toISOString(),
          documentPages: totalPages,
          documentChars: totalChars,
        },
      };

      markUpTo('prepare', 'done');
      writeRun({ percent: 100 });
      writeRun({ statusLine: 'Full AI: Analisis selesai' });
      writeRun({ fullAiOutput: combined });
      writeRun({ resultReady: true, status: 'done' });
      notificationBus.publish({
        type: 'success',
        title: 'Full AI selesai',
        message: `${allItems.length} pekerjaan dari ${sess.files.length} dokumen (${sess.mode === 'FAST' ? 'Cepat' : 'Mendalam'}).`,
        link: 'ded-ai',
      });
      // Pindah ke layar hasil lewat store — bila user sedang di menu
      // lain, snapshot-lah yang pindah ke 'result' sehingga kembali ke
      // DED langsung menampilkan hasil (bukan input segar).
      setTimeout(() => {
        const runId = activeRunIdRef.current;
        if (runId != null && !isDedRunCancelled(runId)) patchDedRun(runId, { screen: 'result' });
      }, 900);
    } catch (e: any) {
      markUpTo('reading', 'failed');
      writeRun({ error: { message: e?.message || 'Full AI: Kesalahan tidak terduga.', retryable: true }, status: 'failed' });
      writeRun({ statusLine: 'Full AI: Analisis gagal' });
    }
  };

  const runAnalysis = useCallback(async (sess: DedAiSession) => {
    // DUAL MODE (§3): dispatch pada MODE kanonis (dedMode), bukan
    // boolean fullAi — sesi lama tanpa dedMode dimigrasikan (mesin menang).
    const aiMode = resolveDedAiMode(sess);
    runModeRef.current = aiMode;
    // Inisialisasi bersama KEDUA mode (mockup v2.3, ACC owner 2026-11-19):
    // cabang FULL_AI sebelumnya return SEBELUM setScreen('progress')
    // sehingga Full AI berjalan tanpa layar progress sama sekali. Init
    // kini mendahului dispatch — jalur standar melewati pernyataan yang
    // sama persis dalam urutan yang sama persis (netral); runFullAiAnalysis
    // lalu menimpa tahap awalnya sendiri (received done, 5%) seperti
    // sebelumnya, sesudah init ini.
    // Init kini MEMULAI LARI DI STORE (startDedRun): error/hasil mode
    // lain dibersihkan di sana (hasil Full AI basi tidak boleh menang
    // atas hasil standar yang baru — cacat yang sama dengan yang sudah
    // diperbaiki di handleLoadDraft untuk draft standar), layar jadi
    // 'progress', dan lari mendapat runId baru (lari lama — bila masih
    // berjalan — tersupersede dan tulisannya ditolak).
    const startedAt = Date.now();
    const totalSize = sess.files.reduce((a, f) => a + f.file.size, 0);
    const started = startDedRun({
      session: sess,
      runMode: aiMode,
      stages: initialStages(t, aiMode),
      percent: 2,
      statusLine: t('ai.ded.preparing'),
      summary: {
        projectName: sess.projectName, fileCount: sess.files.length,
        totalSize, mode: sess.mode, startedAt, currentFile: sess.files[0]?.file.name,
      },
    });
    activeRunIdRef.current = started.runId;
    if (aiMode === 'FULL_AI') {
      await runFullAiAnalysis(sess, aiMode);
      return;
    }

    // Tahap 1: dokumen diterima (validasi sudah di input)
    markUpTo('received', 'done');
    writeRun({ percent: 5 });
    writeRun({ statusLine: t('ai.ded.reading_start') });

    const mergedItems: DedAiItem[] = [];
    let totalPages = 0;
    const fileNames: string[] = [];
    // I8: gambar halaman gabungan (pageImages per berkas, di-offset
    // seperti sourcePages) untuk panel gambar split-view I7.
    const mergedPageImages: Array<{ page: number; dataUrl: string }> = [];
    // FINAL REVIEW (Tugas A): jejak per file + bukti halaman untuk metadata gabungan.
    const fileTraceInputs: FileTraceInput[] = [];
    const evidencePages: Array<{ page: number; pageType: string }> = [];

    try {
      for (let fi = 0; fi < sess.files.length; fi += 1) {
        if (runCancelled()) return;
        const f = sess.files[fi];
        fileNames.push(f.file.name);
        writeRunSummary({ currentFile: f.file.name });

        // Tahap 2-3: baca dokumen
        markUpTo('reading', 'active');
        writeRun({ statusLine: `${t('ai.ded.reading_doc_a')} ${fi + 1}/${sess.files.length}: ${f.file.name}` });
        const buffer = await f.file.arrayBuffer();

        // Cakupan halaman pilihan pengguna (per berkas): halaman terpilih
        // diteruskan ke service dan diterapkan di lapisan ekstraksi.
        const pageScope = await resolveSessionPageScope(sess, f, buffer);
        if (pageScope && pageScope.length === 0) {
          markUpTo('identify', 'failed');
          writeRun({
            error: {
              message: `Berkas ${f.file.name} tidak memiliki halaman dalam rentang terpilih — sesuaikan cakupan halaman atau gunakan "Semua halaman".`,
              retryable: false,
            },
            status: 'failed',
          });
          writeRun({ statusLine: t('ai.ded.status_failed') });
          return;
        }

        const res: DedAiOutputEnvelope = await dedAiEstimateService.execute({
          fileName: f.file.name,
          buffer,
          mimeType: f.file.type,
          projectType: sess.projectType,
          mode: sess.mode,
          policy: policyForMode(aiMode),
          pageScope,
          // F-E2 (keputusan owner 2026-11-10): kompleksitas pilihan user
          // diteruskan untuk run DETAIL agar kunci fitur usage tercatat
          // sesuai pilihan; FAST tidak memakai kompleksitas.
          complexity: sess.mode === 'DETAIL' ? sess.complexity : undefined,
          projectName: sess.projectName,
          onProgress: (e) => {
            if (runCancelled()) return;
            // Petakan progress service (10/30/50) ke 6 tahap, dibagi per file.
            const base = (fi / sess.files.length) * 100;
            const span = 100 / sess.files.length;
            if (e.stage === 'PARSE') {
              markUpTo('reading', 'active');
              writeRun({ statusLine: e.message });
              writeRun({ percent: base + span * 0.1 });
            } else if (e.stage === 'PICK_MODE') {
              markUpTo('reading', 'done');
              markUpTo('extract', 'done');
              markUpTo('identify', 'active');
              writeRun({ statusLine: e.message });
              writeRun({ percent: base + span * 0.3 });
            } else if (e.stage === 'ANALYZE') {
              writeRun({ statusLine: `${t('ai.ded.analyzing_a')} ${f.file.name}${t('ai.ded.analyzing_b')}` });
              writeRun({ percent: base + span * 0.55 });
            }
          },
        });

        if (!res || !res.success) {
          const fail = res as unknown as { errorCode?: string; stage?: string; message?: string; retryable?: boolean };
          markUpTo('identify', 'failed');
          writeRun({
            error: {
              message: fail?.message || `${t('ai.ded.fail_analyze_a')} ${f.file.name}.`,
              errorCode: fail?.errorCode, stage: fail?.stage, retryable: fail?.retryable,
            },
            status: 'failed',
          });
          writeRun({ statusLine: t('ai.ded.status_failed') });
          return;
        }

        const out = res as unknown as DedAiOutput;
        // Tahap 5: validasi (convertAiItem + calculator sudah jalan di service; tandai)
        markUpTo('identify', 'done');
        markUpTo('validate', 'active');
        writeRun({ statusLine: `${t('ai.ded.validating_a')} ${out.items.length} ${t('ai.ded.validating_b')} ${f.file.name}…` });
        writeRun({ percent: (fi / sess.files.length) * 100 + (100 / sess.files.length) * 0.85 });

        const pageOffset = totalPages;
        // FINAL REVIEW (Tugas A): simpan jejak file ini untuk digabung di akhir.
        // Bukti halaman diambil dari jejak nyata file ini (semua halaman parser,
        // sama seperti yang dipakai service) dengan offset global yang sama
        // dengan sourcePages item.
        fileTraceInputs.push({ fileName: f.file.name, pageOffset, trace: out.analysisTrace });
        if (out.analysisTrace) {
          for (const p of out.analysisTrace.pages) {
            evidencePages.push({ page: p.page + pageOffset, pageType: p.pageType });
          }
        }
        out.items.forEach((it, idx) => {
          mergedItems.push({
            ...it,
            id: `dedai-f${fi + 1}-${idx + 1}`,
            sourcePages: it.sourcePages.map((p) => p + pageOffset),
            // I8: halaman bukti vision ikut di-offset seperti sourcePages
            // (tanpa ini penanda menunjuk halaman berkas yang salah).
            ...(it.visionEvidence
              ? { visionEvidence: it.visionEvidence.map((ev) => ({ ...ev, page: ev.page + pageOffset })) }
              : {}),
          });
        });
        // I8: gambar halaman berkas ini ikut digabung (di-offset global).
        if (out.pageImages) {
          for (const img of out.pageImages) {
            mergedPageImages.push({ page: img.page + pageOffset, dataUrl: img.dataUrl });
          }
        }
        totalPages += out.pageCount;
        markUpTo('validate', 'done');
      }

      // Tahap 6: siapkan estimasi gabungan
      markUpTo('prepare', 'active');
      writeRun({ statusLine: t('ai.ded.preparing_final') });
      const merged = DedAiCalculator.buildOutput({
        jobId: `dedai-${Date.now()}`,
        projectType: sess.projectType,
        mode: sess.mode,
        projectName: sess.projectName,
        fileName: fileNames.join(', '),
        pageCount: totalPages,
        items: mergedItems,
      });
      // FINAL REVIEW (Tugas A): buildOutput tidak membawa metadata P0 — pulihkan
      // dari hasil analisis yang benar-benar dijalankan:
      // - analysisTrace = agregasi jejak nyata per file (mergeAnalysisTraces);
      //   file tanpa jejak dicatat sebagai warning keterbatasan, bukan dikarang.
      // - divisionCoverage = dihitung ulang dari item gabungan final dengan
      //   builder yang sama persis seperti service (groupByWbs +
      //   buildDivisionCoverage), sehingga itemIds cocok dengan id gabungan.
      merged.analysisTrace = mergeAnalysisTraces(fileTraceInputs, totalPages);
      const mergedWbs = groupByWbs(merged.items, sess.projectType);
      merged.divisionCoverage = buildDivisionCoverage({
        classifiedItems: [
          ...mergedWbs.groups.flatMap((g) => g.items),
          ...mergedWbs.unclassified,
        ],
        pages: evidencePages,
        projectType: sess.projectType,
      });
      // I8: gambar halaman gabungan dilampirkan ke hasil (hanya bila ada
      // — lari teks-saja tidak membawa pageImages). Hasil vision
      // per-berkas (output.vision) TIDAK digabung di sini: nomor
      // halamannya butuh transformasi offset mendalam; yang dipertahankan
      // lintas-berkas adalah yang dibutuhkan viewer — pageImages +
      // visionEvidence per item (sudah di-offset di atas).
      if (mergedPageImages.length > 0) merged.pageImages = mergedPageImages;
      markUpTo('prepare', 'done');
      writeRun({ percent: 100 });
      writeRun({ statusLine: t('ai.ded.status_done') });
      writeRun({ result: merged });
      writeRun({ resultReady: true, status: 'done' });
      // FASE 5 — hasil DED di-wire ke memori proyek Fase 2 (satu record
      // 'ded:understanding') agar Chat AI/Copilot melihat spek + data
      // hilang lewat retrieval memori biasa — tanpa menyatukan dua
      // pipeline DED (ARS-02). Hanya bila analisis ditargetkan ke
      // proyek; kegagalan perekaman TIDAK menggagalkan hasil analisis.
      try {
        if (sess.targetProjectId) {
          recordDedUnderstandingToMemory({ userId: null, projectId: sess.targetProjectId, conversationId: null }, merged);
        }
      } catch { /* perekaman memori tidak boleh menggagalkan analisis */ }
      notificationBus.publish({
        type: 'success',
        title: t('ai.ded.title_done'),
        message: `${merged.items.length} ${t('ai.ded.notif_msg_a')} ${fileNames.length} ${t('ai.ded.notif_msg_b')} (${sess.mode === 'FAST' ? t('ai.ded.input.mode_fast') : t('ai.ded.input.mode_deep')}).`,
        link: 'ded-ai',
      });
      // Otomatis ke hasil setelah jeda singkat (lewat store — lihat
      // catatan setTimeout yang sama di runFullAiAnalysis).
      setTimeout(() => {
        const runId = activeRunIdRef.current;
        if (runId != null && !isDedRunCancelled(runId)) patchDedRun(runId, { screen: 'result' });
      }, 900);
    } catch (e: any) {
      markUpTo('reading', 'failed');
      writeRun({ error: { message: e?.message || t('ai.ded.err_unexpected'), retryable: true }, status: 'failed' });
      writeRun({ statusLine: t('ai.ded.status_failed') });
    }
  }, [t, runCancelled, writeRun, writeRunSummary]);

  const handleStart = (sess: DedAiSession) => {
    setSession(sess);
    runAnalysis(sess);
  };

  // Draft sesi dari DedAiInputView (2026-11-17, perbaikan susulan
  // perintah chat "jalankan analisis DED"): unggahan + form input
  // dipublikasikan ke holder agar perintah chat menemukan sesi yang
  // BELUM PERNAH dimulai (bukan hanya sesi yang pernah ditekan
  // Jalankan). Publish HANYA memberi tahu — tidak menjalankan
  // analisis. running=false: draft belum berjalan (gerbang "sedang
  // berjalan" handler chat tidak terpicu oleh draft).
  const handleDedSessionChange = useCallback((draft: DedAiSession | null) => {
    if (draft) setDedSession(draft, false);
    else clearDedSession();
  }, []);

  const handleRetry = () => runAnalysis(session);

  // Perintah Chat AI "jalankan analisis DED" (2026-11-17, Kelompok 3):
  // konsumsi sinyal autorun saat MOUNT — view SELALU remount saat ganti
  // menu (WorkspaceView merender satu cabang ternary per menu), jadi
  // mount adalah mekanisme yang benar-benar jalan (bukan subscription /
  // event). Dideklarasikan SEBELUM efek sinkronisasi sesi di bawah
  // (efek jalan berurutan saat mount; sinkronisasi dilewati di layar
  // input, tetapi urutan ini tetap dijaga agar konsumsi sinyal tidak
  // pernah didahului tulisan holder lain). Sesi yang dikonsumsi bisa
  // berupa DRAFT (belum pernah dimulai — dipublikasikan DedAiInputView
  // lewat onSessionChange) maupun sesi yang pernah dimulai: keduanya
  // berbentuk DedAiSession yang sama dan runAnalysis memperlakukannya
  // sebagai sesi baru (reset progress dari sesi itu sendiri).
  const dedAutorunRef = useRef(false);
  useEffect(() => {
    if (dedAutorunRef.current) return;
    dedAutorunRef.current = true;
    // Lari aktif di store (user kembali sesudah pindah menu): JANGAN
    // konsumsi sinyal autorun — lari itu terus berjalan, dan konsumsi
    // di sini akan memulai lari kedua. Sinyal dibiarkan kedaluwarsa
    // sendiri (TTL 60 dtk di holder).
    if (isDedRunActive()) return;
    const res = consumeDedAutorun<DedAiSession>();
    if (!res.ok) {
      if (res.reason === 'expired') setAutorunNotice('Perintah "jalankan analisis DED" dari chat sudah kedaluwarsa (lebih dari 60 detik) — klik Jalankan Analisis untuk memulai.');
      else if (res.reason === 'mismatch') setAutorunNotice('Berkas DED berubah sejak perintah chat diberikan — sinyal jalankan otomatis dibatalkan. Klik Jalankan Analisis untuk memulai.');
      else if (res.reason === 'no-session' || res.reason === 'no-files') setAutorunNotice('Sesi DED dari chat tidak lagi tersedia — upload ulang PDF lalu klik Jalankan Analisis.');
      // Mount biasa (tanpa sinyal) maupun gagal konsumsi: bebaskan
      // referensi berkas holder. (Efek sinkronisasi dilewati di layar
      // input — holder ditulis ulang oleh publish draft DedAiInputView
      // pada perubahan draft berikutnya, atau oleh efek sinkronisasi
      // begitu layar pindah ke progress/result.)
      clearDedSession();
      return;
    }
    // Pertahanan lapis kedua gerbang paket (handler chat sudah memeriksa
    // lewat ctx, tetapi autorun melewati tombol Jalankan sehingga view
    // WAJIB memeriksa ulang dengan data paket live sebelum menjalankan).
    if (!planAllowsAiFeature(creditBalance.plan, 'ded-ai')) {
      setAutorunNotice(aiFeatureLockedMessage(creditBalance.plan, 'ded-ai'));
      clearDedSession();
      return;
    }
    setSession(res.session);
    runAnalysis(res.session);
  }, [runAnalysis, creditBalance.plan]);

  // Sinkronisasi sesi ke holder bersama (2026-11-17, Kelompok 3): Chat AI
  // membaca holder ini untuk perintah "jalankan analisis DED".
  // KEPEMILIKAN TERBAGI: di layar 'input', holder dimiliki DedAiInputView
  // lewat onSessionChange (draft — lihat handleDedSessionChange); efek
  // ini DILEWATI di sana karena sesi induk tidak memuat unggahan input
  // dan akan menimpa draft bila ikut jalan (mis. sesudah prefill
  // deskripsi dari entry DED). Di layar progress/result, efek ini yang
  // memiliki holder (sesi yang sedang/sudah berjalan).
  useEffect(() => {
    if (screen === 'input') return;
    setDedSession(session, screen === 'progress' && error === null);
  }, [session, screen, error]);

  // Pembatalan EKSPLISIT (tombol Kembali/Batal di layar progress) —
  // satu-satunya jalur batal selain supersede oleh lari baru. Flag
  // ditulis ke store agar loop lintas mount membacanya; pindah menu
  // (unmount) TIDAK pernah memanggil ini.
  const handleBack = () => {
    const runId = activeRunIdRef.current;
    if (runId != null) cancelDedRun(runId);
    setScreen('input');
  };
  // Kembali ke layar input dari layar HASIL — layar ditulis ke store
  // agar mount kembali tidak menghidrasi layar hasil yang sudah
  // ditinggalkan user.
  const goInputScreen = useCallback(() => {
    publishDedRun({ screen: 'input' });
    setScreen('input');
  }, []);
  // Full AI tidak pernah mengisi `result` (hasilnya di `fullAiOutput`) —
  // tanpa cek ini tombol "Lihat Hasil Estimasi" di layar progress mati
  // untuk Full AI pada jendela 900 mdtk sebelum auto-navigasi.
  // Jalur standar tidak berubah: `result` tetap dicek pertama.
  const handleSeeResult = () => {
    if (result || fullAiOutput) {
      publishDedRun({ screen: 'result' });
      setScreen('result');
    }
  };

  const handleSaveDraft = (items: DedAiItem[]) => {
    if (!result) return;
    const policy = result.policy ?? 'FULL_AI';
    // I8: pageImages (base64 MB-an) TIDAK ikut ke draft localStorage —
    // kuota 5 MB akan menggagalkan seluruh tulis draft (dan persistDrafts
    // menelan errornya diam-diam). visionEvidence per item (bbox kecil)
    // + output.vision (teks) tetap tersimpan; gambar dimuat ulang saat
    // analisis berikutnya.
    const { pageImages: _droppedPageImages, ...resultWithoutImages } = result;
    void _droppedPageImages;
    const rec: DraftRecord = {
      id: `draft-${Date.now()}`,
      createdAt: Date.now(),
      projectName: result.projectName,
      projectType: result.projectType as DedAiProjectType,
      mode: result.mode,
      fileNames: session.files.map((f) => f.file.name),
      output: { ...resultWithoutImages, items },
      // G-ST-2: mode/policy/mesin tersimpan agar load mempertahankannya.
      policy,
      fullAi: false,
      dedMode: modeFromLegacy({ policy, fullAi: false }),
      outputPrefs: session.outputPrefs,
    };
    persistDrafts([rec, ...drafts].slice(0, 20));
    publishDedRun({ draftSaved: true });
    setDraftSaved(true);
  };

  // G-ST-2: hasil Full AI BISA disimpan sebagai draft (sebelumnya
  // hanya hasil standar — FullAiResultView tak punya onSaveDraft).
  // projectName/projectType diambil dari sesi (FullAiOutput tidak
  // membawa nama proyek); mode kedalaman dipetakan ADVANCED→DETAIL.
  const handleSaveFullAiDraft = (items: FullAiItem[]) => {
    if (!fullAiOutput) return;
    const policy = fullAiOutput.policy ?? 'FULL_AI';
    // I8: pageImages tidak ikut ke draft localStorage (alasan sama
    // seperti handleSaveDraft — kuota).
    const { pageImages: _droppedFullAiPageImages, ...fullAiWithoutImages } = fullAiOutput;
    void _droppedFullAiPageImages;
    const rec: DraftRecord = {
      id: `draft-${Date.now()}`,
      createdAt: Date.now(),
      projectName: session.projectName,
      projectType: session.projectType,
      mode: depthModeFromFullAi(fullAiOutput.mode),
      fileNames: session.files.map((f) => f.file.name),
      fullAiOutput: { ...fullAiWithoutImages, items },
      policy,
      fullAi: true,
      dedMode: 'FULL_AI',
      outputPrefs: session.outputPrefs,
    };
    persistDrafts([rec, ...drafts].slice(0, 20));
    publishDedRun({ draftSaved: true });
    setDraftSaved(true);
  };

  const handleLoadDraft = (id: string) => {
    const d = drafts.find((x) => x.id === id);
    if (!d) return;
    // G-ST-2: mode/policy/mesin dipulihkan dari field tersimpan
    // (draft lama tanpa ketiganya diturunkan dari output.policy;
    // resolveDraftMode adalah satu-satunya tempat logika ini hidup).
    const restored = resolveDraftMode({
      policy: d.policy ?? d.output?.policy ?? d.fullAiOutput?.policy,
      fullAi: d.fullAi ?? (d.fullAiOutput ? true : undefined),
      dedMode: d.dedMode,
    });
    if (d.fullAiOutput) {
      setFullAiOutput(d.fullAiOutput);
      setResult(null);
      setResultReady(false);
    } else if (d.output) {
      setResult(d.output);
      setResultReady(true);
      // Draft standar menimpa hasil Full AI yang sedang tampil
      // (sebelumnya fullAiOutput tidak dibersihkan — layar hasil
      // Full AI akan menang atas draft standar yang dimuat).
      setFullAiOutput(null);
    } else {
      return;
    }
    setDraftSaved(true);
    setFinalized(false);
    const nextSession: DedAiSession = { ...session, projectName: d.projectName, projectType: d.projectType, mode: d.mode, dedMode: restored.mode, policy: restored.policy, fullAi: restored.fullAi, files: [], outputPrefs: d.outputPrefs ?? session.outputPrefs };
    setSession(nextSession);
    const nextSummary: ProgressSummary = { ...summary, projectName: d.projectName, fileCount: d.fileNames.length, mode: d.mode };
    setSummary(nextSummary);
    setScreen('result');
    // Draft yang dimuat menjadi snapshot lari terkini — tanpa ini,
    // pindah menu lalu kembali akan menghidrasi lari LAMA, bukan draft
    // yang sedang ditampilkan. (Tahap/persen/baris status dipertahankan
    // dari keadaan kini, sama seperti sebelumnya.)
    publishDedRunSnapshot({
      status: 'done',
      screen: 'result',
      session: nextSession,
      runMode: restored.mode,
      stages,
      percent,
      statusLine,
      summary: nextSummary,
      error: null,
      result: d.fullAiOutput ? null : d.output ?? null,
      fullAiOutput: d.fullAiOutput ?? null,
      resultReady: !d.fullAiOutput,
      draftSaved: true,
      finalized: false,
      startedAt: getDedRunSnapshot()?.startedAt ?? Date.now(),
    });
  };

  const handleDeleteDraft = (id: string) => persistDrafts(drafts.filter((d) => d.id !== id));

  /* GATE 4 (5D) — kirim hasil DED ke Chat AI: lampirkan snapshot DED
   * ke proyek target (session.targetProjectId bila sesi ini ditargetkan,
   * bila tidak proyek aktif workspace — draft yang dimuat tidak membawa
   * targetProjectId sendiri), lalu navigasi ke Chat AI lewat kontrak
   * navigasi kanonis (goToAi 'chat_agent'). Tanpa proyek target:
   * pesan jujur, TANPA membuat proyek diam-diam. Gagal lampir: pesan
   * jujur, TANPA navigasi (Chat AI tidak boleh menerima DED setengah). */
  const handleSendToChat = (items: DedAiItem[]) => {
    if (!result) return;
    const projectId = session.targetProjectId ?? currentProjectId ?? null;
    if (!projectId) {
      // State `error` hanya dirender layar progress — di layar hasil,
      // kegagalan disampaikan lewat notifikasi (pola sukses analisis).
      notificationBus.publish({
        type: 'error',
        title: 'DED tidak terkirim ke Chat AI',
        message: 'Pilih proyek dulu (pilih proyek di halaman input DED, atau jadikan satu proyek sebagai proyek aktif).',
      });
      return;
    }
    const output: DedAiOutput = { ...result, items };
    const attached = attachDedToProject(projectId, output);
    if (!attached.ok) {
      notificationBus.publish({
        type: 'error',
        title: 'DED tidak terkirim ke Chat AI',
        message: attached.message,
      });
      return;
    }
    goToAi('chat_agent', {
      projectId,
      contextLabel: `DED ${output.fileName ?? output.projectName}`,
      sourceMenu: 'ded-ai',
    });
  };

  /* G-UI-3 (§3) — kirim hasil FULL AI ke Chat AI: cermin handleSendToChat
   * untuk mesin Full AI. Item dipetakan ke bentuk DedAiItem lampiran
   * (dedModeUi.buildFullAiAttachmentOutput — nilai dipertahankan apa
   * adanya, tanpa fabrikasi); tanpa proyek target: pesan jujur, TANPA
   * membuat proyek diam-diam. Gagal lampir: pesan jujur, TANPA navigasi. */
  const handleFullAiSendToChat = (items: FullAiItem[]) => {
    if (!fullAiOutput) return;
    const projectId = session.targetProjectId ?? currentProjectId ?? null;
    if (!projectId) {
      notificationBus.publish({
        type: 'error',
        title: 'DED tidak terkirim ke Chat AI',
        message: 'Pilih proyek dulu (pilih proyek di halaman input DED, atau jadikan satu proyek sebagai proyek aktif).',
      });
      return;
    }
    const output = buildFullAiAttachmentOutput(fullAiOutput, items, {
      projectName: session.projectName,
      projectType: session.projectType,
      mode: session.mode,
      fileName: session.files.map((f) => f.file.name).join(', ') || undefined,
    });
    const attached = attachDedToProject(projectId, output);
    if (!attached.ok) {
      notificationBus.publish({
        type: 'error',
        title: 'DED tidak terkirim ke Chat AI',
        message: attached.message,
      });
      return;
    }
    goToAi('chat_agent', {
      projectId,
      contextLabel: `DED ${output.fileName ?? output.projectName}`,
      sourceMenu: 'ded-ai',
    });
  };

  const handleFinalize = async (items: DedAiItem[]): Promise<{ ok: boolean; message: string }> => {
    // P1-B: gerbang kapabilitas — finalisasi DED adalah mutasi persisten
    // (menulis RAB + bisa membuat proyek). Digunakan SEBELUM validasi:
    // tombol Finalisasi adalah pemicu mutasi murni (tanpa input yang
    // perlu diklarifikasi), dan aturan owner §4.2 mutlak — non-admin
    // ditolak apa pun keadaan batch-nya. Penolakan memakai kalimat
    // owner persis (lihat mutationInventory.ts).
    const cap = authorizeChatAiMutation('DED_FINALIZE', hasCapability('edit-estimate'));
    if (!cap.ok) return { ok: false, message: cap.message };
    // FASE DED-FIX TASK 3: hanya item yang lolos validasi kuantitas (stage CALCULATED,
    // subtotal terhitung) yang boleh masuk RAB. Item REJECTED/UNRESOLVED tidak lolos
    // jalur finalisasi apa pun — tidak disamarkan menjadi angka.
    // W4 (§9+§11): validasi-SEBELUM-sisip — SELURUH batch divalidasi dulu;
    // bila satu item gagal dipetakan, TIDAK ADA yang disisip dan TIDAK ADA
    // proyek yang dibuat (tanpa RAB korup sebagian, tanpa proyek kosong
    // tertinggal). Hasil analisis + draft tetap utuh untuk diperbaiki.
    // §4.5 TIDAK mengubah jalur ini: pembuatan proyek DED (creationMethod
    // 'ai-ded') terjadi SESUDAH klik Finalisasi — klik itu SENDIRI adalah
    // konfirmasi eksplisitnya, bukan pembuatan implisit.
    const validation = validateDedFinalizeBatch(items, result?.policy ?? 'FULL_AI');
    const savable = validation.savable;
    const blocked = validation.blockedCount;
    const needsReview = validation.needsReviewCount;
    if (savable.length === 0) {
      return { ok: false, message: t('ai.ded.finalize_none') };
    }
    if (!validation.ok) {
      return {
        ok: false,
        message: `Finalisasi dibatalkan — ${validation.failures.length} dari ${savable.length} item tidak lolos validasi, TIDAK ADA item yang disimpan:\n${formatFinalizeFailures(validation.failures)}\nPerbaiki item tersebut lalu coba lagi.`,
      };
    }
    try {
      let projectId = session.targetProjectId;
      let projectName = result?.projectName || t('ai.ded.default_project_name');
      if (!projectId) {
        const created = createProject({
          name: projectName,
          buildingType: 'Rumah Tinggal',
          status: 'draft',
          creationMethod: 'ai-ded',
          description: session.description || `${t('ai.ded.finalize_desc_a')} (${savable.length} item)`,
        } as any);
        projectId = created.id;
        projectName = created.name;
      } else {
        const existing = projects.find((p) => p.id === projectId);
        if (existing) projectName = existing.name;
      }
      // Provenance lewat helper pemetaan (finalizeMapping), BUKAN string
      // `notes` — factory tidak menyimpan `notes`, dan tanpa pemetaan ini
      // baris fallback "Estimasi AI" kehilangan labelnya di spreadsheet.
      // Pemetaan sudah berjalan di validasi-SEBELUM-sisip di atas (semua
      // item savable terpetakan — tidak ada yang dibuang diam-diam).
      const mappedInputs = validation.mapped;
      // G4: kunci finalisasi deterministik (proyek + set item terkanonisasi).
      // Finalisasi logis yang sama — klik ganda, retry sesudah state UI
      // ter-reset, analisis yang sama dibuka lagi — dikenali store sebagai
      // duplikat dan TIDAK menulis baris baru. Flag `finalized` di view ini
      // sekarang hanya kenyamanan UI, bukan batas integritas.
      const finalizationKey = buildFinalizationKey(projectId, mappedInputs);
      const added = bulkAddRabItems(mappedInputs, projectId, { finalizationKey });
      const outcome = typeof getLastBulkAddOutcome === 'function' ? getLastBulkAddOutcome() : null;
      setCurrentProjectId(projectId);
      publishDedRun({ finalized: true });
      setFinalized(true);
      // P1-E: record audit finalisasi (referensi konfirmasi = kunci
      // finalisasi deterministik G4 — finalisasi logis yang sama
      // berbagi kunci yang sama). outcomeVerified dari outcome store
      // bulkAdd (duplikat = keadaan tujuan sudah tercapai).
      appendMutationAuditRecord({
        actor: activeRole?.name ?? 'Peran demo',
        projectId,
        projectName,
        operation: 'DED_FINALIZE',
        before: null,
        after: { itemCount: added.length, duplicate: outcome?.duplicate === true },
        confirmationRef: finalizationKey,
        result: 'executed',
        outcomeVerified: true,
        verificationNote: 'bulk-add-outcome: bulkAddRabItems + getLastBulkAddOutcome melaporkan outcome store.',
        source: 'ded-ai',
        message: `${added.length} item DED difinalisasi ke proyek "${projectName}".`,
      });
      if (outcome?.duplicate) {
        return {
          ok: true,
          message: `Finalisasi ini sudah pernah disimpan ke proyek "${projectName}" — tidak ada duplikasi.`,
        };
      }
      notificationBus.publish({
        type: 'success',
        title: t('ai.ded.notif_saved_title'),
        message: `${added.length} ${t('ai.ded.notif_saved_a')} "${projectName}".`,
        link: 'rab-estimasi',
      });
      // G2 (Opsi A): total tunggal tetap memuat kuantitas ASSUMPTION —
      // keberadaan & jumlahnya WAJIB diungkap di ringkasan finalisasi.
      const assumptionSaved = countAssumptionItems(savable);
      return { ok: true, message: `${added.length} ${t('ai.ded.finalize_ok_a')} "${projectName}".${blocked > 0 ? ` ${blocked} ${t('ai.ded.finalize_blocked_a')}` : ''}${needsReview > 0 ? ` ${needsReview} ${t('ai.ded.finalize_review_a')} "${t('ai.ded.result.badge_review')}" ${t('ai.ded.finalize_review_b')}` : ''}${assumptionSaved > 0 ? ` Total estimasi mencakup ${assumptionSaved} item dengan kuantitas asumsi (ASSUMPTION) — periksa badge "Perlu Ditinjau".` : ''} ${t('ai.ded.finalize_open')}` };
    } catch (e: any) {
      return { ok: false, message: e?.message || t('ai.ded.err_save') };
    }
  };

  const handleOpenSpreadsheet = () => {
    if (onNavigateToTab) onNavigateToTab('rab-estimasi');
  };

  // TIDAK ADA cleanup unmount yang membatalkan lari di sini — unmount
  // (pindah menu) hanya melepas langganan store (efek di atas); lari
  // terus berjalan dan snapshot-nya dibaca lagi saat mount kembali.
  // (Cleanup lama `cancelRef.current = true` adalah penyebab reset
  // yang dilaporkan owner 2026-11-21 04:19 — DIHAPUS.)

  const handleFullAiFinalize = async (items: FullAiItem[]): Promise<{ ok: boolean; message: string }> => {
    // P1-B: gerbang kapabilitas — sama seperti handleFinalize standar
    // (mutasi persisten; non-admin ditolak dengan kalimat owner persis,
    // sebelum validasi). §4.5 tidak mengubah jalur ini (klik
    // Finalisasi SENDIRI adalah konfirmasi eksplisitnya).
    const cap = authorizeChatAiMutation('DED_FINALIZE_FULL_AI', hasCapability('edit-estimate'));
    if (!cap.ok) return { ok: false, message: cap.message };
    // W4 (§9+§11): validasi-SEBELUM-sisip — sama seperti jalur standar:
    // seluruh batch divalidasi dulu; satu kegagalan membatalkan semua
    // (tanpa RAB korup sebagian, tanpa proyek kosong tertinggal).
    const validation = validateFullAiFinalizeBatch(items, fullAiOutput?.policy ?? 'FULL_AI');
    const savable = validation.savable;
    const blocked = validation.blockedCount;
    if (savable.length === 0) {
      return { ok: false, message: 'Tidak ada item yang bisa disimpan (semua belum lengkap / tanpa harga).' };
    }
    if (!validation.ok) {
      return {
        ok: false,
        message: `Finalisasi dibatalkan — ${validation.failures.length} dari ${savable.length} item tidak lolos validasi, TIDAK ADA item yang disimpan:\n${formatFinalizeFailures(validation.failures)}\nPerbaiki item tersebut lalu coba lagi.`,
      };
    }
    try {
      let projectId = session.targetProjectId;
      let projectName = session.projectName || 'Proyek Full AI DED';
      if (!projectId) {
        const created = createProject({
          name: projectName,
          buildingType: 'Rumah Tinggal',
          status: 'draft',
          creationMethod: 'ai-ded-full',
          description: session.description || `Hasil Full AI DED (${savable.length} item)`,
        } as any);
        projectId = created.id;
        projectName = created.name;
      } else {
        const existing = projects.find((p) => p.id === projectId);
        if (existing) projectName = existing.name;
      }
      // Provenance lewat helper pemetaan (finalizeMapping) — alasan sama
      // seperti jalur standar di atas: `notes` tidak disimpan factory.
      // Pemetaan sudah berjalan di validasi-SEBELUM-sisip di atas.
      const mappedInputs = validation.mapped;
      // G4: kunci finalisasi deterministik — sama seperti jalur standar.
      const finalizationKey = buildFinalizationKey(projectId, mappedInputs);
      const added = bulkAddRabItems(mappedInputs, projectId, { finalizationKey });
      const outcome = typeof getLastBulkAddOutcome === 'function' ? getLastBulkAddOutcome() : null;
      setCurrentProjectId(projectId);
      publishDedRun({ finalized: true });
      setFinalized(true);
      // P1-E: record audit finalisasi Full AI (kunci finalisasi G4
      // sebagai referensi konfirmasi).
      appendMutationAuditRecord({
        actor: activeRole?.name ?? 'Peran demo',
        projectId,
        projectName,
        operation: 'DED_FINALIZE_FULL_AI',
        before: null,
        after: { itemCount: added.length, duplicate: outcome?.duplicate === true },
        confirmationRef: finalizationKey,
        result: 'executed',
        outcomeVerified: true,
        verificationNote: 'bulk-add-outcome: bulkAddRabItems + getLastBulkAddOutcome melaporkan outcome store.',
        source: 'ded-ai',
        message: `${added.length} item Full AI DED difinalisasi ke proyek "${projectName}".`,
      });
      if (outcome?.duplicate) {
        return {
          ok: true,
          message: `Finalisasi ini sudah pernah disimpan ke proyek "${projectName}" — tidak ada duplikasi.`,
        };
      }
      notificationBus.publish({
        type: 'success',
        title: 'Full AI tersimpan ke proyek',
        message: `${added.length} item RAB tersimpan ke "${projectName}".`,
        link: 'rab-estimasi',
      });
      return {
        ok: true,
        message: `${added.length} item berhasil disimpan ke proyek "${projectName}".` +
          (blocked > 0 ? ` ${blocked} item ditahan dan tidak masuk RAB.` : '') +
          ' Buka Spreadsheet RAB untuk melihatnya.',
      };
    } catch (e: any) {
      return { ok: false, message: e?.message || 'Gagal menyimpan ke proyek.' };
    }
  };

  // ---- Kerangka halaman di dalam workspace (pola app shell, mockup
  // ter-ACC owner 2026-11-10): fitur TIDAK lagi menutupi workspace —
  // sidebar + topbar tetap terlihat, halaman tidak scroll. Shell hanya
  // membingkai: ketiga sub-view di bawah tidak berubah logika, state,
  // maupun servicenya. Label tahap mengikuti mockup ter-ACC
  // (Input / Analisis / Hasil — langkah 2 "Analisis" sejak rebuild
  // mockup 2026-11-19, kamus ai.ded.input.step_2; sebelumnya
  // "Progress").
  const shellSteps: FsStep[] =
    screen === 'input'
      ? [
          { label: t('ai.ded.input.step_1'), state: 'active' },
          { label: t('ai.ded.input.step_2'), state: 'upcoming' },
          { label: t('ai.ded.input.step_3'), state: 'upcoming' },
        ]
      : screen === 'progress'
        ? [
            { label: t('ai.ded.input.step_1'), state: 'done', onClick: handleBack },
            { label: t('ai.ded.input.step_2'), state: 'active' },
            { label: t('ai.ded.input.step_3'), state: 'upcoming' },
          ]
        : [
            { label: t('ai.ded.input.step_1'), state: 'done', onClick: goInputScreen },
            { label: t('ai.ded.input.step_2'), state: 'done' },
            { label: t('ai.ded.input.step_3'), state: 'active' },
          ];

  /* One-screen 2026-11-19 (brief §3B): catatan posisi langkah di bawah
     stepper DIHAPUS — redundan dengan stepper 3 langkah berlabel —
     sehingga shell tidak lagi menerima catatan itu sebagai prop. */

  const isFullAiResult = screen === 'result' && !!fullAiOutput;
  // DUAL MODE (§3, G-UI-2): chip menampilkan MODE kanonis — hasil Full AI
  // berlabuh pada outputnya sendiri; selain itu pada mode sesi.
  const shellMode: DedRabAiMode = isFullAiResult ? 'FULL_AI' : resolveDedAiMode(session);
  const shellChips = isFullAiResult ? (
    <>
      <FsChip>Mode: {modeLabel(shellMode)}</FsChip>
      <FsChip kind="plain">
        {/* Masking (defense-in-depth): server already masks provenance, but
            stored/legacy results may still carry raw provider/model names. */}
        {fullAiOutput.provenance.provider && fullAiOutput.provenance.model
          ? `${maskAiProviderName(fullAiOutput.provenance.provider)} / ${maskAiModelName(fullAiOutput.provenance.model)}`
          : fullAiOutput.provenance.model ? maskAiModelName(fullAiOutput.provenance.model) : 'Model tidak diketahui'}
      </FsChip>
    </>
  ) : screen !== 'input' ? (
    <>
      <FsChip>Mode: {modeLabel(shellMode)}</FsChip>
      <FsChip kind="plain">{session.mode === 'FAST' ? 'Cepat' : 'Mendalam'}</FsChip>
    </>
  ) : undefined;

  const shellContextText =
    result?.projectName || summary.projectName || session.projectName || undefined;

  // v4 CIAMIK 2026-11-20: ringkasan lari terakhir DIHAPUS dari layar
  // input (tidak ada lagi kartu hasil di sana) — komputasi di sini
  // dihapus, bukan disembunyikan.

  let screenContent: React.ReactNode;
  if (screen === 'progress') {
    screenContent = (
      <DedAiProgressView
        stages={stages}
        percent={percent}
        statusLine={statusLine}
        summary={summary}
        error={error}
        onRetry={handleRetry}
        onBack={handleBack}
        onSeeResult={handleSeeResult}
        resultReady={resultReady}
        dedMode={session.dedMode}
      />
    );
  } else if (screen === 'result' && fullAiOutput) {
    screenContent = (
      <FullAiResultView
        output={fullAiOutput}
        onFinalize={handleFullAiFinalize}
        onSaveDraft={handleSaveFullAiDraft}
        draftSaved={draftSaved}
        onSendToChat={handleFullAiSendToChat}
        onBack={goInputScreen}
        embedded
      />
    );
  } else if (screen === 'result' && result) {
    // G2 (Opsi A): bila ada kuantitas ASSUMPTION yang masuk total, nyatakan
    // secara terlihat di layar hasil — total tunggal adalah ESTIMASI dan
    // tidak boleh terbaca sebagai total tervalidasi sumber. Tanpa asumsi,
    // tidak ada strip tambahan.
    const assumptionCount = resolveAssumptionCount(result.coverage, result.items);
    // I11 Stage 1b (Finding 3): strip asumsi dilewatkan sebagai
    // `topNotice` — dirender DI DALAM .dedai (ikut bergeser dengan
    // hasil), BUKAN sebagai saudara .dedai di .fp-content (sebagai item
    // flex saudara ia menjepit .dedai ke 53px di HP).
    screenContent = (
      <DedAiResultView
        output={result}
        onBackToInput={goInputScreen}
        onSaveDraft={handleSaveDraft}
        onFinalize={handleFinalize}
        onOpenSpreadsheet={handleOpenSpreadsheet}
        onSendToChat={handleSendToChat}
        draftSaved={draftSaved}
        finalized={finalized}
        creditEstimate={session.creditEstimate}
        outputPrefs={session.outputPrefs ?? DEFAULT_DED_OUTPUT_PREFS}
        // I8: gambar halaman parser (bila vision jalan) ke panel
        // gambar split-view I7; absen = empty state jujur per halaman.
        pageImages={result.pageImages}
        topNotice={
          assumptionCount > 0 ? (
            <div
              role="note"
              style={{
                margin: '0 0 16px',
                padding: '10px 14px',
                borderRadius: '12px',
                border: '1px solid var(--ez-hue-amber-border, #F59E0B)',
                background: 'var(--ez-hue-amber-bg, #FFFBEB)',
                fontSize: '12.5px',
                lineHeight: 1.5,
              }}
            >
              <strong>Total estimasi mencakup {assumptionCount} item dengan kuantitas asumsi (ASSUMPTION)</strong>
              {' '}— periksa badge "Perlu Ditinjau" pada item terkait. Kuantitas asumsi tetap
              terhitung dalam total estimasi, tetapi bukan kuantitas terverifikasi dari dokumen.
            </div>
          ) : null
        }
      />
    );
  } else {
    screenContent = (
      <>
        {dedEntryBanner && (
          <div style={{ margin: '20px 24px 0', padding: '10px 14px', borderRadius: '12px', border: '1px solid var(--ez-color-border)', background: 'var(--ez-color-surface)', fontSize: '12.5px', lineHeight: 1.5 }}>
            <strong>Konteks DED: {dedEntryBanner.label}</strong>
            {dedEntryBanner.prompt ? <div style={{ marginTop: '4px', whiteSpace: 'pre-wrap' }}>{dedEntryBanner.prompt}</div> : null}
          </div>
        )}
        {autorunNotice && (
          <div role="note" style={{ margin: '20px 24px 0', padding: '10px 14px', borderRadius: '12px', border: '1px solid var(--ez-hue-amber-border, #F59E0B)', background: 'var(--ez-hue-amber-bg, #FFFBEB)', fontSize: '12.5px', lineHeight: 1.5 }}>
            {autorunNotice}
          </div>
        )}
        <DedAiInputView
          initialSession={session}
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          drafts={drafts.map((d) => ({
            id: d.id, createdAt: d.createdAt, projectName: d.projectName,
            // G-ST-2: draft Full AI membawa fullAiOutput, bukan output.
            itemCount: d.fullAiOutput?.items.length ?? d.output?.items.length ?? 0,
            grandTotal: d.fullAiOutput?.grandTotal ?? d.output?.grandTotal ?? 0,
          }))}
          onStart={handleStart}
          onSessionChange={handleDedSessionChange}
          onLoadDraft={handleLoadDraft}
          onDeleteDraft={handleDeleteDraft}
        />
      </>
    );
  }

  return (
    <FeaturePageShell
      title={`DED → ${t('ai.ded.input.head_title_post')}`}
      subtitle={t('ai.ded.input.head_sub')}
      icon={<Building2 size={20} />}
      contextLabel="Proyek aktif:"
      contextText={shellContextText}
      chips={shellChips}
      creditText={`Kredit AI: ${creditBalance.total.toLocaleString('id-ID')}`}
      // v4 CIAMIK 2026-11-20: stepper balok shell TIDAK diteruskan di
      // layar input — stepper ramping di dalam kolom (.mk4-stepper)
      // menggantikannya. Stepper shell kembali penuh saat
      // analisis/hasil.
      steps={screen === 'input' ? undefined : shellSteps}
    >
      {screenContent}
    </FeaturePageShell>
  );
};

export default DedAiEstimateView;
