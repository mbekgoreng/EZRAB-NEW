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
import { DedAiInputView, DedAiSession, DedLastRunSummary } from './DedAiInputView';
import { DedAiProgressView, DedAiStage, getStageDefs, ProgressSummary } from './DedAiProgressView';
import { DedAiResultView } from './DedAiResultView';
import { fullAiDedService, FULL_AI_TIMEOUT_MS } from '../ded-full-ai/service';
import { FullAiOutput, FullAiItem } from '../ded-full-ai/types';
import { FullAiResultView } from '../ded-full-ai/FullAiResultView';
import { consumePendingAiEntry, goToAi } from '../aiNavigation';
import { recordDedUnderstandingToMemory } from '../ezrab-ai/dedUnderstanding';
import { attachDedToProject } from '../ezrab-ai/dedQtoIntegration';
import { notificationBus } from '../../notifications/notificationBus';
import { useProject } from '../../context/ProjectContext';
import { useI18n } from '../../i18n/I18nContext';
import { Building2 } from 'lucide-react';
import { FsChip, FsStep } from '../../components/feature-shell/FeatureFullscreenShell';
import { FeaturePageShell } from '../../components/feature-shell/FeaturePageShell';
import { useCreditSimulation } from '../../ai-credits/useCreditSimulation';

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

const initialStages = (t: (key: string) => string): DedAiStage[] =>
  getStageDefs(t).map((d) => ({ ...d, status: 'waiting' as const }));

export const DedAiEstimateView: React.FC<Props> = ({ onNavigateToTab }) => {
  const { t } = useI18n();
  const { projects, createProject, bulkAddRabItems, getLastBulkAddOutcome, setCurrentProjectId, currentProjectId } = useProject();
  // Saldo kredit simulasi (store bersama mockAdapter — angka yang sama
  // dengan yang dilihat InputView) untuk chip Kredit AI di bar atas shell.
  const { balance: creditBalance } = useCreditSimulation();
  const [screen, setScreen] = useState<Screen>('input');
  // D-45 (Batch E): sesi baru memakai mode DED terakhir yang dipilih
  // pengguna (localStorage `ezrab_dedai_mode`), bukan selalu default
  // C2 — policy/fullAi diturunkan dari mode yang dipulihkan (C1).
  // Tanpa nilai tersimpan → default EZRAB AI MODE seperti sebelumnya.
  const [session, setSession] = useState<DedAiSession>(() => {
    const persistedMode = loadPersistedDedMode();
    return {
      files: [], description: '', projectName: '',
      projectType: 'BANGUNAN', mode: 'FAST', dedMode: persistedMode,
      policy: policyForMode(persistedMode), fullAi: persistedMode === 'FULL_AI', targetProjectId: null,
    };
  });
  const [stages, setStages] = useState<DedAiStage[]>(() => initialStages(t));
  const [percent, setPercent] = useState(0);
  const [statusLine, setStatusLine] = useState(t('ai.ded.preparing'));
  const [fullAiOutput, setFullAiOutput] = useState<FullAiOutput | null>(null);
  const [summary, setSummary] = useState<ProgressSummary>({
    projectName: '', fileCount: 0, totalSize: 0, mode: 'FAST', startedAt: Date.now(),
  });
  const [error, setError] = useState<{ message: string; errorCode?: string; stage?: string; retryable?: boolean } | null>(null);
  const [result, setResult] = useState<DedAiOutput | null>(null);
  const [resultReady, setResultReady] = useState(false);
  const [drafts, setDrafts] = useState<DraftRecord[]>(loadDrafts);
  const [draftSaved, setDraftSaved] = useState(false);
  const [finalized, setFinalized] = useState(false);
  const cancelRef = useRef(false);

  // Perbaikan final: konsumsi entry DED. Sebelumnya view ini TIDAK PERNAH
  // mengonsumsi entry klasik — hanya projectId via URL yang bertahan,
  // sehingga dedRef/initialPrompt dari resolver tidak pernah tampil.
  const [dedEntryBanner, setDedEntryBanner] = useState<{ label: string; prompt?: string } | null>(null);
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
  const markUpTo = (key: string, status: DedAiStage['status']) => {
    const order = getStageDefs(t).map((d) => d.key);
    const idx = order.indexOf(key);
    setStages((prev) => prev.map((s) => {
      const si = order.indexOf(s.key);
      if (si < idx) return s.status === 'waiting' ? { ...s, status: 'done' as const } : s;
      if (si === idx) return { ...s, status };
      return s;
    }));
  };

  const runFullAiAnalysis = async (sess: DedAiSession, aiMode: DedRabAiMode) => {
    try {
      markUpTo('received', 'done');
      setPercent(5);
      setStatusLine('Full AI: Dokumen diterima — memulai pembacaan…');

      // Gabungkan buffer dari semua file (Full AI v1: proses file pertama + catat sisanya)
      // Untuk multi-file, proses per file dan gabungkan items.
      const allItems: FullAiItem[] = [];
      const allWarnings: string[] = [];
      let projectInfo: FullAiOutput['projectInfo'] | null = null;
      let totalPages = 0;
      let totalChars = 0;
      let lastOutput: FullAiOutput | null = null;

      for (let fi = 0; fi < sess.files.length; fi += 1) {
        if (cancelRef.current) return;
        const f = sess.files[fi];
        setSummary((s) => ({ ...s, currentFile: f.file.name }));
        markUpTo('reading', 'active');
        setStatusLine(`Full AI: Membaca ${f.file.name}…`);
        setPercent(5 + (fi / sess.files.length) * 20);

        const buffer = await f.file.arrayBuffer();
        // Cakupan halaman pilihan pengguna (per berkas) untuk mesin Full AI.
        const fullAiScope = await resolveSessionPageScope(sess, f, buffer);
        if (fullAiScope && fullAiScope.length === 0) {
          markUpTo('identify', 'failed');
          setError({
            message: `Berkas ${f.file.name} tidak memiliki halaman dalam rentang terpilih — sesuaikan cakupan halaman atau gunakan "Semua halaman".`,
            retryable: false,
          });
          setStatusLine('Full AI: Analisis gagal');
          return;
        }
        markUpTo('extract', 'done');
        markUpTo('identify', 'active');
        setStatusLine(`Full AI: Menganalisis ${f.file.name}…`);

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
            if (cancelRef.current) return;
            setStatusLine(`Full AI: ${msg}`);
            const base = 25 + (fi / sess.files.length) * 70;
            setPercent(base + (pct / 100) * (70 / sess.files.length));
            if (stage === 'ANALYZE') markUpTo('identify', 'active');
            if (stage === 'VALIDATE') { markUpTo('identify', 'done'); markUpTo('validate', 'active'); }
            if (stage === 'FINALIZE') { markUpTo('validate', 'done'); markUpTo('prepare', 'active'); }
          },
        });

        if (!out.success) {
          markUpTo('identify', 'failed');
          setError({
            message: out.error?.message || `Full AI gagal menganalisis ${f.file.name}.`,
            errorCode: out.error?.code,
            retryable: out.error?.retryable,
          });
          setStatusLine('Full AI: Analisis gagal');
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
      setPercent(100);
      setStatusLine('Full AI: Analisis selesai');
      setFullAiOutput(combined);
      setResultReady(true);
      notificationBus.publish({
        type: 'success',
        title: 'Full AI selesai',
        message: `${allItems.length} pekerjaan dari ${sess.files.length} dokumen (${sess.mode === 'FAST' ? 'Cepat' : 'Mendalam'}).`,
        link: 'ded-ai',
      });
      setTimeout(() => { if (!cancelRef.current) setScreen('result'); }, 900);
    } catch (e: any) {
      markUpTo('reading', 'failed');
      setError({ message: e?.message || 'Full AI: Kesalahan tidak terduga.', retryable: true });
      setStatusLine('Full AI: Analisis gagal');
    }
  };

  const runAnalysis = useCallback(async (sess: DedAiSession) => {
    cancelRef.current = false;
    // DUAL MODE (§3): dispatch pada MODE kanonis (dedMode), bukan
    // boolean fullAi — sesi lama tanpa dedMode dimigrasikan (mesin menang).
    const aiMode = resolveDedAiMode(sess);
    if (aiMode === 'FULL_AI') {
      await runFullAiAnalysis(sess, aiMode);
      return;
    }
    setError(null);
    setResult(null);
    setResultReady(false);
    setDraftSaved(false);
    setFinalized(false);
    setStages(initialStages(t));
    setPercent(2);
    const startedAt = Date.now();
    const totalSize = sess.files.reduce((a, f) => a + f.file.size, 0);
    setSummary({
      projectName: sess.projectName, fileCount: sess.files.length,
      totalSize, mode: sess.mode, startedAt, currentFile: sess.files[0]?.file.name,
    });
    setScreen('progress');

    // Tahap 1: dokumen diterima (validasi sudah di input)
    markUpTo('received', 'done');
    setPercent(5);
    setStatusLine(t('ai.ded.reading_start'));

    const mergedItems: DedAiItem[] = [];
    let totalPages = 0;
    const fileNames: string[] = [];
    // FINAL REVIEW (Tugas A): jejak per file + bukti halaman untuk metadata gabungan.
    const fileTraceInputs: FileTraceInput[] = [];
    const evidencePages: Array<{ page: number; pageType: string }> = [];

    try {
      for (let fi = 0; fi < sess.files.length; fi += 1) {
        if (cancelRef.current) return;
        const f = sess.files[fi];
        fileNames.push(f.file.name);
        setSummary((s) => ({ ...s, currentFile: f.file.name }));

        // Tahap 2-3: baca dokumen
        markUpTo('reading', 'active');
        setStatusLine(`${t('ai.ded.reading_doc_a')} ${fi + 1}/${sess.files.length}: ${f.file.name}`);
        const buffer = await f.file.arrayBuffer();

        // Cakupan halaman pilihan pengguna (per berkas): halaman terpilih
        // diteruskan ke service dan diterapkan di lapisan ekstraksi.
        const pageScope = await resolveSessionPageScope(sess, f, buffer);
        if (pageScope && pageScope.length === 0) {
          markUpTo('identify', 'failed');
          setError({
            message: `Berkas ${f.file.name} tidak memiliki halaman dalam rentang terpilih — sesuaikan cakupan halaman atau gunakan "Semua halaman".`,
            retryable: false,
          });
          setStatusLine(t('ai.ded.status_failed'));
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
            if (cancelRef.current) return;
            // Petakan progress service (10/30/50) ke 6 tahap, dibagi per file.
            const base = (fi / sess.files.length) * 100;
            const span = 100 / sess.files.length;
            if (e.stage === 'PARSE') {
              markUpTo('reading', 'active');
              setStatusLine(e.message);
              setPercent(base + span * 0.1);
            } else if (e.stage === 'PICK_MODE') {
              markUpTo('reading', 'done');
              markUpTo('extract', 'done');
              markUpTo('identify', 'active');
              setStatusLine(e.message);
              setPercent(base + span * 0.3);
            } else if (e.stage === 'ANALYZE') {
              setStatusLine(`${t('ai.ded.analyzing_a')} ${f.file.name}${t('ai.ded.analyzing_b')}`);
              setPercent(base + span * 0.55);
            }
          },
        });

        if (!res || !res.success) {
          const fail = res as unknown as { errorCode?: string; stage?: string; message?: string; retryable?: boolean };
          markUpTo('identify', 'failed');
          setError({
            message: fail?.message || `${t('ai.ded.fail_analyze_a')} ${f.file.name}.`,
            errorCode: fail?.errorCode, stage: fail?.stage, retryable: fail?.retryable,
          });
          setStatusLine(t('ai.ded.status_failed'));
          return;
        }

        const out = res as unknown as DedAiOutput;
        // Tahap 5: validasi (convertAiItem + calculator sudah jalan di service; tandai)
        markUpTo('identify', 'done');
        markUpTo('validate', 'active');
        setStatusLine(`${t('ai.ded.validating_a')} ${out.items.length} ${t('ai.ded.validating_b')} ${f.file.name}…`);
        setPercent((fi / sess.files.length) * 100 + (100 / sess.files.length) * 0.85);

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
          });
        });
        totalPages += out.pageCount;
        markUpTo('validate', 'done');
      }

      // Tahap 6: siapkan estimasi gabungan
      markUpTo('prepare', 'active');
      setStatusLine(t('ai.ded.preparing_final'));
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
      markUpTo('prepare', 'done');
      setPercent(100);
      setStatusLine(t('ai.ded.status_done'));
      setResult(merged);
      setResultReady(true);
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
      // Otomatis ke hasil setelah jeda singkat
      setTimeout(() => { if (!cancelRef.current) setScreen('result'); }, 900);
    } catch (e: any) {
      markUpTo('reading', 'failed');
      setError({ message: e?.message || t('ai.ded.err_unexpected'), retryable: true });
      setStatusLine(t('ai.ded.status_failed'));
    }
  }, [t]);

  const handleStart = (sess: DedAiSession) => {
    setSession(sess);
    runAnalysis(sess);
  };

  const handleRetry = () => runAnalysis(session);
  const handleBack = () => { cancelRef.current = true; setScreen('input'); };
  const handleSeeResult = () => { if (result) setScreen('result'); };

  const handleSaveDraft = (items: DedAiItem[]) => {
    if (!result) return;
    const policy = result.policy ?? 'FULL_AI';
    const rec: DraftRecord = {
      id: `draft-${Date.now()}`,
      createdAt: Date.now(),
      projectName: result.projectName,
      projectType: result.projectType as DedAiProjectType,
      mode: result.mode,
      fileNames: session.files.map((f) => f.file.name),
      output: { ...result, items },
      // G-ST-2: mode/policy/mesin tersimpan agar load mempertahankannya.
      policy,
      fullAi: false,
      dedMode: modeFromLegacy({ policy, fullAi: false }),
      outputPrefs: session.outputPrefs,
    };
    persistDrafts([rec, ...drafts].slice(0, 20));
    setDraftSaved(true);
  };

  // G-ST-2: hasil Full AI BISA disimpan sebagai draft (sebelumnya
  // hanya hasil standar — FullAiResultView tak punya onSaveDraft).
  // projectName/projectType diambil dari sesi (FullAiOutput tidak
  // membawa nama proyek); mode kedalaman dipetakan ADVANCED→DETAIL.
  const handleSaveFullAiDraft = (items: FullAiItem[]) => {
    if (!fullAiOutput) return;
    const policy = fullAiOutput.policy ?? 'FULL_AI';
    const rec: DraftRecord = {
      id: `draft-${Date.now()}`,
      createdAt: Date.now(),
      projectName: session.projectName,
      projectType: session.projectType,
      mode: depthModeFromFullAi(fullAiOutput.mode),
      fileNames: session.files.map((f) => f.file.name),
      fullAiOutput: { ...fullAiOutput, items },
      policy,
      fullAi: true,
      dedMode: 'FULL_AI',
      outputPrefs: session.outputPrefs,
    };
    persistDrafts([rec, ...drafts].slice(0, 20));
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
    setSession((s) => ({ ...s, projectName: d.projectName, projectType: d.projectType, mode: d.mode, dedMode: restored.mode, policy: restored.policy, fullAi: restored.fullAi, files: [], outputPrefs: d.outputPrefs ?? s.outputPrefs }));
    setSummary((s) => ({ ...s, projectName: d.projectName, fileCount: d.fileNames.length, mode: d.mode }));
    setScreen('result');
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
    // FASE DED-FIX TASK 3: hanya item yang lolos validasi kuantitas (stage CALCULATED,
    // subtotal terhitung) yang boleh masuk RAB. Item REJECTED/UNRESOLVED tidak lolos
    // jalur finalisasi apa pun — tidak disamarkan menjadi angka.
    // W4 (§9+§11): validasi-SEBELUM-sisip — SELURUH batch divalidasi dulu;
    // bila satu item gagal dipetakan, TIDAK ADA yang disisip dan TIDAK ADA
    // proyek yang dibuat (tanpa RAB korup sebagian, tanpa proyek kosong
    // tertinggal). Hasil analisis + draft tetap utuh untuk diperbaiki.
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
      setFinalized(true);
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

  // Bersihkan flag cancel saat unmount
  useEffect(() => () => { cancelRef.current = true; }, []);

  const handleFullAiFinalize = async (items: FullAiItem[]): Promise<{ ok: boolean; message: string }> => {
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
      setFinalized(true);
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
  // (Input / Progress / Hasil).
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
            { label: t('ai.ded.input.step_1'), state: 'done', onClick: () => setScreen('input') },
            { label: t('ai.ded.input.step_2'), state: 'done' },
            { label: t('ai.ded.input.step_3'), state: 'active' },
          ];

  /* Teks status stepper DIPERSINGKAT (owner 2026-11-10 19:15: stepper
     kompak satu baris) — posisi langkah tetap jelas, frasa penjelas
     panjang dibuang. */
  const shellStepsNote =
    screen === 'input'
      ? 'Langkah 1 dari 3'
      : screen === 'progress'
        ? 'Langkah 2 dari 3'
        : 'Langkah 3 dari 3';

  const isFullAiResult = screen === 'result' && !!fullAiOutput;
  // DUAL MODE (§3, G-UI-2): chip menampilkan MODE kanonis — hasil Full AI
  // berlabuh pada outputnya sendiri; selain itu pada mode sesi.
  const shellMode: DedRabAiMode = isFullAiResult ? 'FULL_AI' : resolveDedAiMode(session);
  const shellChips = isFullAiResult ? (
    <>
      <FsChip>Mode: {modeLabel(shellMode)}</FsChip>
      <FsChip kind="plain">
        {fullAiOutput.provenance.provider && fullAiOutput.provenance.model
          ? `${fullAiOutput.provenance.provider} / ${fullAiOutput.provenance.model}`
          : fullAiOutput.provenance.model || 'Model tidak diketahui'}
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

  // Strip pratinjau hasil di layar input (USULAN BARU ter-ACC 2026-11-10):
  // angka dari hasil NYATA terakhir pada sesi view ini — null sebelum ada
  // analisis, tidak pernah angka contoh.
  const lastRunSummary: DedLastRunSummary | null = fullAiOutput
    ? {
        items: fullAiOutput.items.length,
        volumesIdentified: fullAiOutput.items.filter((i) => i.quantity.value != null).length,
        pricesNeedVerify: fullAiOutput.items.filter(
          (i) => i.price.unitPrice == null || i.price.source === 'AI_ESTIMATE',
        ).length,
      }
    : result
      ? {
          items: result.items.length,
          volumesIdentified: result.items.filter((i) => i.quantity != null).length,
          pricesNeedVerify: result.items.filter(
            (i) => i.unitPrice == null || i.priceSource === 'AI_ESTIMATE',
          ).length,
        }
      : null;

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
        onBack={() => setScreen('input')}
        embedded
      />
    );
  } else if (screen === 'result' && result) {
    // G2 (Opsi A): bila ada kuantitas ASSUMPTION yang masuk total, nyatakan
    // secara terlihat di layar hasil — total tunggal adalah ESTIMASI dan
    // tidak boleh terbaca sebagai total tervalidasi sumber. Tanpa asumsi,
    // tidak ada strip tambahan.
    const assumptionCount = resolveAssumptionCount(result.coverage, result.items);
    screenContent = (
      <>
        {assumptionCount > 0 && (
          <div
            role="note"
            style={{
              margin: '20px 24px 0',
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
        )}
        <DedAiResultView
          output={result}
          onBackToInput={() => setScreen('input')}
          onSaveDraft={handleSaveDraft}
          onFinalize={handleFinalize}
          onOpenSpreadsheet={handleOpenSpreadsheet}
          onSendToChat={handleSendToChat}
          draftSaved={draftSaved}
          finalized={finalized}
          creditEstimate={session.creditEstimate}
          outputPrefs={session.outputPrefs ?? DEFAULT_DED_OUTPUT_PREFS}
        />
      </>
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
          onLoadDraft={handleLoadDraft}
          onDeleteDraft={handleDeleteDraft}
          lastRunSummary={lastRunSummary}
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
      steps={shellSteps}
      stepsNote={shellStepsNote}
    >
      {screenContent}
    </FeaturePageShell>
  );
};

export default DedAiEstimateView;
