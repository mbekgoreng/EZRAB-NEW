import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  Clock,
  ArrowLeft,
  ChevronRight,
  Download,
  RotateCcw,
  Search,
  Filter,
  Check,
  Zap,
  Sliders,
  ShieldCheck,
  AlertTriangle,
  FileSpreadsheet,
  Building2,
  Eye,
  Edit2,
  X,
} from 'lucide-react';
import { Project, RABSection } from '../../types';
import {
  aiEstimatePipeline,
  AiEstimateOutput,
  AiEstimateProgressEvent,
  AiEstimateWorkItem,
  AiEstimateAnalysisMode,
  AI_ESTIMATE_MODELS,
  getAiEstimateModelConfig,
} from '../../ai-estimate';
import { DocumentViewer } from './DocumentViewer';
import { useProject } from '../../context/ProjectContext';
import { useCurrency } from '../../context/CurrencyContext';
import { mapMagicAiItemToRabInput } from '../../ai-tools/ded-ai-estimate/finalizeMapping';
import { buildFinalizationKey } from '../../ai-tools/ded-ai-estimate/finalizationKey';
import { csvRow } from '../../lib/csv';
import { useI18n } from '../../i18n/I18nContext';
import { EZRAB_MODEL_FLASH, EZRAB_MODEL_PRO } from '../../services/aiModelMasking';
import {
  appendDedAnalysisLog,
  getDedAnalysisSnapshot,
  patchDedAnalysisRun,
  publishDedAnalysis,
  stageDedAnalysisFile,
  startDedAnalysisRun,
  subscribeDedAnalysis,
  type DedAnalysisSnapshot,
} from './dedAnalysisRuntime';

export interface DedAnalysisDashboardProps {
  currentProject?: Project | null;
  projects?: Project[];
  onSelectProject?: (projectId: string) => void;
  onNavigateToTab?: (tab: string) => void;
  onBackToDashboard?: () => void;
  onCommitSuccess?: (sections: RABSection[], grandTotal: number, targetProjectId?: string) => void;
  onOpenRabDetail?: (targetProjectId?: string) => void;
}

interface StepInfo {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  status: 'SUCCESS' | 'PROCESSING' | 'WAITING' | 'BLOCKED';
  duration?: string;
  detail?: string;
}

export const DedAnalysisDashboard: React.FC<DedAnalysisDashboardProps> = ({
  currentProject,
  projects = [],
  onSelectProject,
  onNavigateToTab,
  onBackToDashboard,
  onCommitSuccess,
  onOpenRabDetail,
}) => {
  const { t } = useI18n();
  const { createRabItemDirect, bulkAddRabItems, getLastBulkAddOutcome } = useProject();
  const { formatDisplay } = useCurrency();

  // State lari dihidratasi dari runtime module-level (dedAnalysisRuntime)
  // — perintah owner 2026-11-21 04:19: pindah menu (unmount) TIDAK BOLEH
  // me-reset proses. Mount baru membaca snapshot terkini, bukan dari nol.
  const initialSnapshot = getDedAnalysisSnapshot();

  // Mode: FAST (Gemini 3.5 Flash-Lite) vs DETAIL (Gemini 3.8 Flash)
  const [selectedMode, setSelectedMode] = useState<AiEstimateAnalysisMode>(initialSnapshot?.mode ?? 'FAST');
  const activeModelConfig = useMemo(() => getAiEstimateModelConfig(selectedMode), [selectedMode]);

  // File state
  const [selectedFile, setSelectedFile] = useState<File | null>(initialSnapshot?.file ?? null);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(initialSnapshot?.fileBuffer ?? null);
  const [isSampleLoaded, setIsSampleLoaded] = useState<boolean>(initialSnapshot?.isSample ?? false);
  const [isLoadingSample, setIsLoadingSample] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Execution & Progress state
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(initialSnapshot?.status === 'running');
  const [analysisProgress, setAnalysisProgress] = useState<number>(initialSnapshot?.progress ?? 0);
  const [activeStageId, setActiveStageId] = useState<string>(initialSnapshot?.stageId ?? 'READING_DED');
  const [statusMessage, setStatusMessage] = useState<string>(initialSnapshot?.statusMessage ?? t('ai.ded.dash.status_waiting'));
  const [outputResult, setOutputResult] = useState<AiEstimateOutput | null>(initialSnapshot?.result ?? null);
  const [startTime, setStartTime] = useState<number | null>(initialSnapshot?.startTime ?? null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(
    initialSnapshot?.status === 'running' && initialSnapshot.startTime
      ? Math.max(0, Math.floor((Date.now() - initialSnapshot.startTime) / 1000))
      : 0,
  );

  // Viewer and logging state
  const [activePage, setActivePage] = useState<number>(1);
  const [executionLogs, setExecutionLogs] = useState<
    Array<{ timestamp: string; level: 'INFO' | 'SUCCESS' | 'WARN'; message: string; stage?: string }>
  >(initialSnapshot?.logs ?? []);

  // Result Filtering state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'VALID' | 'REVIEW' | 'BLOCKED'>('ALL');
  const [editingItem, setEditingItem] = useState<AiEstimateWorkItem | null>(null);
  const [editQty, setEditQty] = useState<string>('');
  const [editPrice, setEditPrice] = useState<string>('');
  const [isCommitting, setIsCommitting] = useState<boolean>(false);
  const [committedSuccess, setCommittedSuccess] = useState<boolean>(initialSnapshot?.committedSuccess ?? false);
  /* P0-A: laporan commit jujur — berapa item masuk vs ditahan karena
   * harga belum tersedia (ditahan = tidak dimasukkan sebagai Rp0). */
  const [commitReport, setCommitReport] = useState<{ added: number; held: number } | null>(initialSnapshot?.commitReport ?? null);
  /* Audit 2026-10-31 (F-4.1): pesan penolakan unggahan (ukuran/tipe). */
  const [fileError, setFileError] = useState<string | null>(null);

  // Timer for elapsed seconds
  useEffect(() => {
    let interval: any = null;
    if (isAnalyzing && startTime) {
      interval = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
      }, 500);
    }
    return () => clearInterval(interval);
  }, [isAnalyzing, startTime]);

  // Auto-load sample DED on mount if no file selected yet
  useEffect(() => {
    if (!selectedFile && !isSampleLoaded) {
      handleLoadSampleDED(false);
    }
  }, []);

  // Mirror runtime (perintah owner 2026-11-21 04:19): dashboard hanya
  // MENAMPILKAN snapshot runtime — lari hidup di module-level dan
  // terus berjalan saat komponen ter-unmount (pindah menu). Unmount =
  // unsubscribe saja. Mount kembali menghidratasi dari snapshot (lihat
  // initializers di atas) lalu mengikuti notifikasi runtime.
  useEffect(() => {
    const mirror = (snap: DedAnalysisSnapshot | null) => {
      if (!snap) return;
      setSelectedMode(snap.mode);
      setSelectedFile(snap.file);
      setFileBuffer(snap.fileBuffer);
      setIsSampleLoaded(snap.isSample);
      setIsAnalyzing(snap.status === 'running');
      setAnalysisProgress(snap.progress);
      setActiveStageId(snap.stageId);
      setStatusMessage(snap.statusMessage);
      setOutputResult(snap.result);
      setStartTime(snap.startTime);
      setExecutionLogs(snap.logs);
      setCommittedSuccess(snap.committedSuccess);
      setCommitReport(snap.commitReport);
    };
    mirror(getDedAnalysisSnapshot());
    return subscribeDedAnalysis(() => mirror(getDedAnalysisSnapshot()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Ganti mode analisis — mode juga dipublikasikan ke runtime agar
      mount kembali membuka mode yang sama. */
  const changeMode = (mode: AiEstimateAnalysisMode) => {
    setSelectedMode(mode);
    publishDedAnalysis({ mode });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    /* Audit 2026-10-31 (F-4.1): jalur unggah ini sebelumnya tanpa pagar —
     * berkas berapa pun ukurannya langsung dibaca ke memori (tab bisa
     * kehabisan memori; PDF raksasa menjadi bom parser). Samakan dengan
     * pagar jalur DED lain: maks 25 MB + magic bytes %PDF- (atribut
     * accept saja mudah dilewati dan tidak membuktikan isi berkas). */
    const MAX_PDF_MB = 25;
    if (file.size === 0) {
      setFileError(t('ai.ded.dash.err_empty'));
      return;
    }
    if (file.size > MAX_PDF_MB * 1024 * 1024) {
      setFileError(t('ai.ded.dash.err_size_a') + (file.size / (1024 * 1024)).toFixed(1) + t('ai.ded.dash.err_size_b') + MAX_PDF_MB + t('ai.ded.dash.err_size_c'));
      return;
    }
    try {
      const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
      const magic = String.fromCharCode(...head);
      if (magic !== '%PDF-') {
        setFileError(t('ai.ded.dash.err_notpdf'));
        return;
      }
    } catch {
      setFileError(t('ai.ded.dash.err_unreadable'));
      return;
    }
    setFileError(null);
    setSelectedFile(file);
    setIsSampleLoaded(false);
    setOutputResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        setFileBuffer(reader.result);
        // Stage ke runtime: file + buffer bertahan melewati pindah menu
        // (mount baru tidak auto-load dokumen contoh lagi).
        stageDedAnalysisFile(file, reader.result, false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleLoadSampleDED = async (startAuto = false) => {
    setIsLoadingSample(true);
    try {
      const response = await fetch('/samples/pdf-gambar-rumah-1-lantai_compress.pdf');
      if (!response.ok) throw new Error('File contoh tidak dapat diakses.');
      const blob = await response.blob();
      const sampleFile = new File([blob], 'pdf-gambar-rumah-1-lantai_compress.pdf', {
        type: 'application/pdf',
      });
      const buffer = await blob.arrayBuffer();

      setSelectedFile(sampleFile);
      setFileBuffer(buffer);
      setIsSampleLoaded(true);
      // Stage ke runtime agar mount kembali tidak memuat ulang contoh
      // dan lari auto-start tidak kehilangan filenya.
      stageDedAnalysisFile(sampleFile, buffer, true);

      if (startAuto) {
        setTimeout(() => {
          runAnalysisPipeline(sampleFile, buffer);
        }, 100);
      }
    } catch (err: any) {
      console.warn('[DedAnalysisDashboard] Sample load warning:', err);
    } finally {
      setIsLoadingSample(false);
    }
  };

  const addLog = (message: string, level: 'INFO' | 'SUCCESS' | 'WARN' = 'INFO', stage?: string) => {
    const timeStr = new Date().toTimeString().split(' ')[0];
    // Log ditulis ke runtime (mirror yang menampilkan di UI) — bertahan
    // melewati pindah menu; lari yang selesai saat ter-unmount tetap
    // meninggalkan jejak lognya.
    appendDedAnalysisLog({ timestamp: timeStr, level, message, stage });
  };

  // Run the full AI Estimate Pipeline
  const runAnalysisPipeline = async (fileToUse?: File, bufferToUse?: ArrayBuffer) => {
    // Pagar ganda (Ulangi Proses 2026-11-28): tombol sudah disabled
    // saat lari berjalan, tapi pemanggilan langsung (mis. klik ganda
    // cepat sebelum render berikutnya) juga ditahan di sini — lari
    // baru tidak boleh menggantikan lari yang masih berjalan.
    if (isAnalyzing) return;
    const targetFile = fileToUse || selectedFile;
    const targetBuffer = bufferToUse || fileBuffer;
    if (!targetFile || !targetBuffer) return;

    // Lari dicatat di runtime module-level (dedAnalysisRuntime) agar
    // bertahan melewati pindah menu — pipeline menulis ke runtime,
    // mirror yang menampilkan di UI. isSample dibaca dari snapshot
    // (file yang sama) karena closure setTimeout jalur contoh bisa
    // memegang nilai isSampleLoaded yang basi.
    const staged = getDedAnalysisSnapshot();
    const isSample = staged?.file != null
      && staged.file.name === targetFile.name
      && staged.file.size === targetFile.size
      && staged.isSample;
    const run = startDedAnalysisRun({
      file: targetFile,
      buffer: targetBuffer,
      isSample,
      mode: selectedMode,
    });
    const reqId = run.requestId;
    setElapsedSeconds(0);

    addLog(t('ai.ded.dash.log_start_a') + activeModelConfig.title + ' · ' + activeModelConfig.modelName + t('ai.ded.dash.log_start_b'), 'INFO', 'INIT');
    addLog(t('ai.ded.dash.log_target_a') + targetFile.name + ' (' + (targetFile.size / (1024 * 1024)).toFixed(2) + t('ai.ded.dash.log_target_b'), 'INFO', 'INIT');

    try {
      const result = await aiEstimatePipeline.execute({
        projectId: currentProject?.id || `proj-${Date.now()}`,
        projectName: currentProject?.name || targetFile.name.replace(/\.[^/.]+$/, ''),
        files: [
          {
            fileName: targetFile.name,
            buffer: targetBuffer,
            mimeType: 'application/pdf',
          },
        ],
        region: currentProject?.location || 'DKI Jakarta / Nasional',
        mode: selectedMode,
        onProgress: (evt: AiEstimateProgressEvent) => {
          // Progres ke runtime — patch ditolak bila lari ini sudah
          // digantikan lari baru (lari usang tidak menimpa lari baru).
          patchDedAnalysisRun(reqId, {
            progress: evt.percent,
            statusMessage: evt.message,
            stageId: evt.stage,
          });
          addLog(evt.message, evt.percent >= 90 ? 'SUCCESS' : 'INFO', evt.stage);
        },
      });

      if (!result.success) {
        console.error('[AI-ESTIMATE-TRACE] UI_RECEIVED_FAILURE:', result.error);
        throw new Error(result.error || 'Pipeline mengembalikan status gagal');
      }

      console.log('[AI-ESTIMATE-TRACE] UI:', {
        itemsReceivedByUI: result.workItems?.length || 0,
        itemsRendered: result.workItems?.length || 0,
        finalResultCount: result.stats?.totalItems ?? result.workItems?.length ?? 0,
        totalCost: result.summary?.estimatedTotal ?? 0,
      });

      patchDedAnalysisRun(reqId, {
        result,
        progress: 100,
        stageId: 'COMPLETED',
        status: 'done',
        statusMessage: t('ai.ded.dash.status_done'),
        // Ulangi Proses (2026-11-28): hasil baru menggantikan hasil
        // lama — status commit lari lama TIDAK berlaku untuk item baru
        // (belum terkirim), jadi direset di titik sukses ini, bukan
        // di awal lari (bila lari baru gagal, hasil + status commit
        // lama tetap utuh — lihat startDedAnalysisRun).
        committedSuccess: false,
        commitReport: null,
      });
      const totalItemsCount = result.stats?.totalItems ?? result.workItems.length;
      addLog(t('ai.ded.dash.log_done_a') + Math.round(result.executionDurationSec || 0) + t('ai.ded.dash.log_done_b') + totalItemsCount + t('ai.ded.dash.log_done_c'), 'SUCCESS', 'BUILD_RAB');
    } catch (err: any) {
      console.error('[DedAnalysisDashboard] Execution Error:', err);
      patchDedAnalysisRun(reqId, {
        status: 'failed',
        statusMessage: t('ai.ded.dash.status_fail_a') + (err?.message || t('ai.ded.dash.err_system')),
        error: err?.message || t('ai.ded.dash.err_system'),
      });
      addLog(t('ai.ded.dash.log_err_a') + (err?.message || err), 'WARN', 'ERROR');
    }
    // TIDAK ADA finally yang me-reset isAnalyzing: nilainya dicerminkan
    // dari runtime (status done/failed) — finally yang menulis setState
    // lokal akan menimpa mirror bila lari baru sudah dimulai.
  };

  // Derive the 4-step progress states
  // SEC-04 (GELOMBANG PERBAIKI SEMUA): klaim statis terfabrikasi
  // DIHAPUS — durasi tahap tetap yang dikarang, jumlah halaman tetap
  // (itu metadata BERKAS CONTOH, bukan berkas pengguna), dan klaim
  // validasi/verifikasi statis atas volume, HSP, dan RAB (tidak ada
  // deteksi anomali di jalur ini). Yang tampil kini hanya data nyata
  // hasil pipeline: totalPagesRead, durasi eksekusi (sudah dilaporkan
  // di log), dan hitungan status/stats item.
  const steps: StepInfo[] = useMemo(() => {
    if (!isAnalyzing && !outputResult) {
      return [
        { id: 'READING_DED', number: '01', title: t('ai.ded.dash.step1_title'), subtitle: t('ai.ded.dash.step1_sub'), status: 'WAITING', detail: t('ai.ded.dash.step1_wait') },
        { id: 'IDENTIFY_WORK', number: '02', title: t('ai.ded.dash.step2_title'), subtitle: t('ai.ded.dash.step2_sub'), status: 'WAITING', detail: t('ai.ded.dash.step2_wait') },
        { id: 'CALCULATE_ESTIMATE', number: '03', title: t('ai.ded.dash.step3_title'), subtitle: t('ai.ded.dash.step3_sub'), status: 'WAITING', detail: t('ai.ded.dash.step3_wait') },
        { id: 'BUILD_RAB', number: '04', title: t('ai.ded.dash.step4_title'), subtitle: t('ai.ded.dash.step4_sub'), status: 'WAITING', detail: t('ai.ded.dash.step4_wait') },
      ];
    }

    // Ulangi Proses (2026-11-28): hasil lama DIPERTAHANKAN selama
    // lari baru berjalan (lihat startDedAnalysisRun), jadi cabang
    // sukses di bawah wajib kalah oleh cabang aktif — tanpa
    // `!isAnalyzing` ini, panel tahap akan menampilkan SUCCESS
    // basi dari hasil lama sementara lari baru masih berjalan.
    if (outputResult && !isAnalyzing) {
      const itemsCount = outputResult.stats?.totalItems ?? outputResult.workItems.length;
      const st = outputResult.stats;
      // Hitungan verifikasi NYATA dari hasil pipeline (quantitySanityGate
      // memberi setiap item status VALID/WARNING/UNRESOLVED/BLOCKED).
      const validCount = outputResult.workItems.filter((i) => i.status === 'VALID').length;
      const reviewCount = outputResult.workItems.filter((i) => i.status === 'WARNING' || i.status === 'UNRESOLVED').length;
      const blockedCount = outputResult.workItems.filter((i) => i.status === 'BLOCKED').length;
      const pagesDetail =
        outputResult.totalPagesRead > 0
          ? `${outputResult.totalPagesRead}${t('ai.ded.dash.pages_read_a')}`
          : t('ai.ded.dash.pages_read_na');
      return [
        { id: 'READING_DED', number: '01', title: t('ai.ded.dash.step1_title'), subtitle: t('ai.ded.dash.step1_sub'), status: 'SUCCESS', detail: pagesDetail },
        { id: 'IDENTIFY_WORK', number: '02', title: t('ai.ded.dash.step2_title'), subtitle: t('ai.ded.dash.step2_sub'), status: 'SUCCESS', detail: `${itemsCount}${t('ai.ded.dash.items_ident_a')}` },
        { id: 'CALCULATE_ESTIMATE', number: '03', title: t('ai.ded.dash.step3_title'), subtitle: t('ai.ded.dash.step3_sub'), status: 'SUCCESS', detail: `${itemsCount}${t('ai.ded.dash.calc_a')}${st?.unresolvedItems ?? 0}${t('ai.ded.dash.calc_b')}${st?.blockedItems ?? 0}${t('ai.ded.dash.calc_c')}` },
        { id: 'BUILD_RAB', number: '04', title: t('ai.ded.dash.step4_title'), subtitle: t('ai.ded.dash.step4_sub'), status: 'SUCCESS', detail: `${t('ai.ded.dash.build_valid')}${validCount}${t('ai.ded.dash.build_review')}${reviewCount}${t('ai.ded.dash.build_blocked')}${blockedCount}` },
      ];
    }

    // Active analyzing state — durasi yang tampil hanya elapsed nyata
    // (timer); tidak ada lagi durasi tahap tetap yang dikarang.
    const p = analysisProgress;
    return [
      {
        id: 'READING_DED',
        number: '01',
        title: t('ai.ded.dash.step1_title'),
        subtitle: t('ai.ded.dash.step1_sub'),
        status: p >= 35 ? 'SUCCESS' : 'PROCESSING',
        duration: p >= 35 ? undefined : `${elapsedSeconds}s`,
        detail: t('ai.ded.dash.step1_active'),
      },
      {
        id: 'IDENTIFY_WORK',
        number: '02',
        title: t('ai.ded.dash.step2_title'),
        subtitle: t('ai.ded.dash.step2_sub'),
        status: p >= 65 ? 'SUCCESS' : p >= 35 ? 'PROCESSING' : 'WAITING',
        duration: p >= 35 && p < 65 ? `${elapsedSeconds}s` : undefined,
        detail: t('ai.ded.dash.step2_active'),
      },
      {
        id: 'CALCULATE_ESTIMATE',
        number: '03',
        title: t('ai.ded.dash.step3_title'),
        subtitle: t('ai.ded.dash.step3_sub'),
        status: p >= 85 ? 'SUCCESS' : p >= 65 ? 'PROCESSING' : 'WAITING',
        duration: p >= 65 && p < 85 ? `${elapsedSeconds}s` : undefined,
        detail: t('ai.ded.dash.step3_active'),
      },
      {
        id: 'BUILD_RAB',
        number: '04',
        title: t('ai.ded.dash.step4_title'),
        subtitle: t('ai.ded.dash.step4_sub'),
        status: p >= 100 ? 'SUCCESS' : p >= 85 ? 'PROCESSING' : 'WAITING',
        duration: p >= 85 && p < 100 ? `${elapsedSeconds}s` : undefined,
        detail: t('ai.ded.dash.step4_active'),
      },
    ];
  }, [isAnalyzing, outputResult, analysisProgress, elapsedSeconds]);

  // Filtered result items
  const filteredItems = useMemo(() => {
    if (!outputResult) return [];
    return outputResult.workItems.filter((item) => {
      const name = item.item || item.workName || '';
      const matchSearch =
        !searchQuery ||
        name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.specification || '').toLowerCase().includes(searchQuery.toLowerCase());

      const matchCat = selectedCategory === 'ALL' || item.category === selectedCategory;

      let matchStatus = true;
      if (statusFilter === 'BLOCKED') matchStatus = item.status === 'BLOCKED';
      else if (statusFilter === 'REVIEW') matchStatus = item.status === 'WARNING' || item.status === 'UNRESOLVED';
      else if (statusFilter === 'VALID') matchStatus = item.status === 'VALID';

      return matchSearch && matchCat && matchStatus;
    });
  }, [outputResult, searchQuery, selectedCategory, statusFilter]);

  const categories = useMemo(() => {
    if (!outputResult) return [];
    return Array.from(new Set(outputResult.workItems.map((w) => w.category)));
  }, [outputResult]);

  // Export CSV
  const handleExportCsv = () => {
    if (!outputResult) return;
    const headers = [
      t('ai.ded.dash.th_no'),
      t('ai.ded.dash.th_work'),
      t('ai.ded.dash.th_cat'),
      t('ai.ded.dash.csv_spec'),
      t('ai.ded.dash.th_vol'),
      t('ai.ded.dash.th_unit'),
      t('ai.ded.dash.csv_price'),
      t('ai.ded.dash.csv_subtotal'),
      t('ai.ded.dash.th_conf'),
      t('ai.ded.dash.th_status'),
    ];
    // Sel lewat helper CSV bersama (audit F-5.2): nama/spesifikasi berasal
    // dari ekstraksi AI atas PDF unggahan — wajib lolos netralisasi formula.
    const rows = outputResult.workItems.map((item, idx) =>
      csvRow([
        idx + 1,
        item.item || item.workName,
        item.category,
        item.specification || '',
        item.quantity !== null ? item.quantity : '',
        item.unit,
        item.unitPrice ?? item.estimatedUnitPrice ?? '',
        item.subtotal ?? item.estimatedSubtotal ?? '',
        item.confidence,
        item.status || '',
      ])
    );
    const csvContent = [csvRow(headers), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `RAB_DED_${(currentProject?.name || 'Proyek').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Commit to active Project & Spreadsheet
  const handleCommitToProject = () => {
    if (!outputResult) return;
    setIsCommitting(true);

    try {
      /* P0-A (D-02): pemetaan lewat mapper finalisasi kanonis
       * (finalizeMapping). Item tanpa harga yang sah DITAHAN — tidak
       * pernah lagi menjadi baris Rp0 berstatus resolved/VERIFIED —
       * dan item berharga masuk berlabel Estimasi AI. Jumlah tertahan
       * dilaporkan apa adanya lewat commitReport. */
      const mapped = outputResult.workItems.map((it) => mapMagicAiItemToRabInput(it));
      const itemsToAdd = mapped.filter((m): m is NonNullable<typeof m> => m !== null);
      const heldCount = mapped.length - itemsToAdd.length;

      let addedCount = itemsToAdd.length;
      let duplicateBlocked = false;
      if (itemsToAdd.length > 0) {
        if (bulkAddRabItems) {
          // Konsolidasi DED (rekonstruksi 2026-11-11): permukaan warisan
          // ini memakai kunci finalisasi deterministik yang SAMA dengan
          // permukaan kanonis ded-ai — commit ulang hasil identik ke
          // proyek yang sama terblokir sebagai duplikat, bukan baris
          // ganda. Hasil hitungan pipeline ini TIDAK diubah.
          if (currentProject?.id) {
            const finalizationKey = buildFinalizationKey(currentProject.id, itemsToAdd as any);
            const added = bulkAddRabItems(itemsToAdd as any, currentProject.id, { finalizationKey });
            const outcome = typeof getLastBulkAddOutcome === 'function' ? getLastBulkAddOutcome() : null;
            duplicateBlocked = !!outcome?.duplicate;
            addedCount = duplicateBlocked ? 0 : (added?.length ?? itemsToAdd.length);
          } else {
            bulkAddRabItems(itemsToAdd as any);
          }
        } else if (createRabItemDirect) {
          itemsToAdd.forEach((item) => createRabItemDirect(item as any));
        }
      }

      setCommitReport({ added: addedCount, held: heldCount });
      // Status commit juga ke runtime agar bertahan melewati pindah menu.
      publishDedAnalysis({ commitReport: { added: addedCount, held: heldCount } });
      if (duplicateBlocked) {
        setStatusMessage(t('ai.ded.dash.status_dup'));
        publishDedAnalysis({ statusMessage: t('ai.ded.dash.status_dup') });
      }
      if (itemsToAdd.length > 0) {
        setCommittedSuccess(true);
        publishDedAnalysis({ committedSuccess: true });
        if (onCommitSuccess) {
          onCommitSuccess([], outputResult.summary?.estimatedTotal ?? 0, currentProject?.id);
        }
      }
    } catch (e) {
      console.error('Failed to commit items:', e);
    } finally {
      setIsCommitting(false);
    }
  };

  /* Kurs tampil global (owner 2026-10-27): angka hasil DED ikut
   * mata uang yang dipilih di Top Bar (default IDR); nilai sumber
   * tetap IDR, unresolved tetap "Harga belum tersedia". */
  const formatRupiah = (val?: number | null) => {
    if (val === null || val === undefined || isNaN(val)) return t('ai.ded.dash.price_na');
    return formatDisplay(val);
  };

  return (
    <div className="w-full min-h-screen bg-[var(--ez-hue-slate-bg)] text-[var(--ez-color-text-primary)] flex flex-col" style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif" }}>
      {/* R-01 fix: layout utilities used below are absent from the compiled
          src/styles/magic-ai.css snapshot (no Tailwind build), so their layout
          is provided by these scoped classes (deddash-x*) with Tailwind values. */}
      <style hidden>{`
/* deddash-x1 <- py-4 */
.deddash-x1 { padding-top: 1rem; padding-bottom: 1rem; }
/* deddash-x2 <- max-w-[1440px] sm:flex-row sm:items-center */
.deddash-x2 { max-width: 1440px; }
@media (min-width: 640px) { .deddash-x2 { flex-direction: row; align-items: center; } }
/* deddash-x3 <- mt-0.5 */
.deddash-x3 { margin-top: 0.125rem; }
/* deddash-x4 <- py-0.2 */
.deddash-x4 { padding-top: 0.05rem; padding-bottom: 0.05rem; }
/* deddash-x5 <- max-w-[1440px] p-6 space-y-6 */
.deddash-x5 { max-width: 1440px; padding: 1.5rem; }
.deddash-x5 > :not([hidden]) ~ :not([hidden]) { margin-top: 1.5rem; }
/* Ringkas di HP (2026-10-27): padding + jarak antar-seksi lebih kecil */
@media (max-width: 640px) {
  .deddash-x5 { padding: 1rem; }
  .deddash-x5 > :not([hidden]) ~ :not([hidden]) { margin-top: 1rem; }
}
/* deddash-x6 <- sm:flex-row */
@media (min-width: 640px) { .deddash-x6 { flex-direction: row; } }
/* deddash-x7 <- gap-3.5 */
.deddash-x7 { gap: 0.875rem; }
/* deddash-x8 <- mt-0.5 */
.deddash-x8 { margin-top: 0.125rem; }
/* deddash-x9 <- gap-2.5 */
.deddash-x9 { gap: 0.625rem; }
/* deddash-x10 <- mb-1.5 */
.deddash-x10 { margin-bottom: 0.375rem; }
/* deddash-x11 <- pt-1 */
.deddash-x11 { padding-top: 0.25rem; }
/* deddash-x12 <- h-[3px] */
.deddash-x12 { height: 3px; }
/* deddash-x13 <- gap-6 lg:grid-cols-12 */
.deddash-x13 { gap: 1.5rem; }
@media (min-width: 1024px) { .deddash-x13 { grid-template-columns: repeat(12, minmax(0, 1fr)); } }
/* deddash-x14 <- lg:col-span-7 */
@media (min-width: 1024px) { .deddash-x14 { grid-column: span 7 / span 7; } }
/* deddash-x15 <- lg:col-span-5 (min-height 620px DIHAPUS 2026-10-27:
   panel proses dulu dipaksa setinggi viewer sehingga di HP ada ruang
   kosong panjang; sekarang tingginya mengikuti isi) */
.deddash-x15 { }
@media (min-width: 1024px) { .deddash-x15 { grid-column: span 5 / span 5; } }
/* deddash-x16 <- pb-3 */
.deddash-x16 { padding-bottom: 0.75rem; }
/* deddash-x17 <- mt-0.5 */
.deddash-x17 { margin-top: 0.125rem; }
/* deddash-x18 <- p-3.5 */
.deddash-x18 { padding: 0.875rem; }
/* deddash-x19 <- gap-2.5 */
.deddash-x19 { gap: 0.625rem; }
/* deddash-x20 <- mt-0.5 */
.deddash-x20 { margin-top: 0.125rem; }
/* deddash-x21 <- mb-1 */
.deddash-x21 { margin-bottom: 0.25rem; }
/* deddash-x22 <- pt-3 */
.deddash-x22 { padding-top: 0.75rem; }
/* deddash-x23 <- pt-4 space-y-6 */
.deddash-x23 { padding-top: 1rem; }
.deddash-x23 > :not([hidden]) ~ :not([hidden]) { margin-top: 1.5rem; }
/* deddash-x24 <- p-6 */
.deddash-x24 { padding: 1.5rem; }
/* deddash-x25 <- md:flex-row md:items-center pb-5 */
.deddash-x25 { padding-bottom: 1.25rem; }
@media (min-width: 768px) { .deddash-x25 { flex-direction: row; align-items: center; } }
/* deddash-x26 <- gap-2.5 */
.deddash-x26 { gap: 0.625rem; }
/* deddash-x27 <- px-3.5 */
.deddash-x27 { padding-left: 0.875rem; padding-right: 0.875rem; }
/* deddash-x28 <- pt-5 */
.deddash-x28 { padding-top: 1.25rem; }
/* deddash-x29 <- p-6 */
.deddash-x29 { padding: 1.5rem; }
/* deddash-x30 <- sm:flex-row */
@media (min-width: 640px) { .deddash-x30 { flex-direction: row; } }
/* deddash-x31 <- sm:w-[320px] */
@media (min-width: 640px) { .deddash-x31 { width: 320px; } }
/* deddash-x32 <- pl-9 pr-3 */
.deddash-x32 { padding-left: 2.25rem; padding-right: 0.75rem; }
/* deddash-x33 <- sm:w-auto */
@media (min-width: 640px) { .deddash-x33 { width: auto; } }
/* deddash-x34 <- w-[40px] */
.deddash-x34 { width: 40px; }
/* deddash-x35 <- py-8 */
.deddash-x35 { padding-top: 2rem; padding-bottom: 2rem; }
/* deddash-x36 <- mt-0.5 */
.deddash-x36 { margin-top: 0.125rem; }
/* deddash-x37 <- mt-0.5 */
.deddash-x37 { margin-top: 0.125rem; }
/* deddash-x38 <- tabel hasil: scroll INTERNAL, bukan halaman.
   Tabel RAB yang panjang dulu mendorong seluruh halaman ke bawah;
   sekarang tabel dibatasi 480px dengan header sticky, halaman
   tidak memanjang oleh tabel. */
.deddash-x38 { max-height: 480px; overflow-y: auto; }
.deddash-x38 thead th { position: sticky; top: 0; background: var(--ez-hue-slate-bg); z-index: 1; }
      `}</style>
      {/* =========================================================================
          PAGE HEADER (Section 7)
         ========================================================================= */}
      <div className="ez-bg-surface border-b border-[var(--ez-color-border-line)] px-6 sticky top-0 z-20 shadow-2xs deddash-x1">
        <div className="mx-auto flex flex-col justify-between gap-4 deddash-x2">
          {/* Left: Back & Title */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackToDashboard}
              className="p-1.5 rounded-[8px] text-[#64748B] hover:text-[var(--ez-color-text-primary)] hover:bg-[var(--ez-color-surface-tertiary)] transition"
              title={t('ai.ded.dash.back')}
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[20px] font-black text-[var(--ez-color-text-primary)] tracking-tight">
                  {t('ai.ded.dash.title')}
                </h1>
                {/* Status Badge */}
                {isAnalyzing ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[var(--ez-hue-blue-bg)] text-[var(--ez-hue-blue-text)] border border-[var(--ez-hue-blue-border)]">
                    <span className="w-2 h-2 rounded-full bg-[#2563EB] animate-pulse" />
                    {t('ai.ded.dash.badge_processing')}
                  </span>
                ) : outputResult ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[var(--ez-hue-green-bg)] text-[var(--ez-hue-green-text-bright)] border border-[var(--ez-hue-green-border)]">
                    <span className="w-2 h-2 rounded-full bg-[#16A34A]" />
                    {t('ai.ded.dash.badge_done')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[var(--ez-color-surface-tertiary)] text-[#64748B] border border-[var(--ez-hue-slate-border)]">
                    <span className="w-2 h-2 rounded-full bg-[#94A3B8]" />
                    {t('ai.ded.dash.badge_ready')}
                  </span>
                )}
              </div>
              <p className="text-[13px] text-[#64748B] font-normal deddash-x3">
                {t('ai.ded.dash.subtitle')}
              </p>
            </div>
          </div>

          {/* Right: Mode Selector (Section 13) */}
          <div className="flex items-center gap-3">
            <div className="inline-flex p-1 bg-[var(--ez-color-surface-tertiary)] border border-[var(--ez-color-border-line)] rounded-[10px] gap-1">
              <button
                type="button"
                onClick={() => changeMode('FAST')}
                disabled={isAnalyzing}
                className={`px-3 py-1.5 rounded-[7px] text-[12px] font-semibold transition-all flex items-center gap-1.5 ${
                  selectedMode === 'FAST'
                    ? 'ez-bg-surface text-[var(--ez-color-text-primary)] border border-[var(--ez-hue-blue-border)] shadow-xs'
                    : 'text-[#64748B] hover:text-[var(--ez-color-text-primary)]'
                }`}
              >
                <Zap size={13} className={selectedMode === 'FAST' ? 'text-[var(--ez-hue-blue-text)]' : ''} />
                <span>{t('ai.ded.dash.mode_fast')}</span>
                <span className="text-[10px] font-mono text-[#64748B] bg-[var(--ez-hue-slate-bg)] px-1.5 rounded border border-[var(--ez-color-border-line)] deddash-x4">
                  {EZRAB_MODEL_FLASH}
                </span>
              </button>
              <button
                type="button"
                onClick={() => changeMode('DETAIL')}
                disabled={isAnalyzing}
                className={`px-3 py-1.5 rounded-[7px] text-[12px] font-semibold transition-all flex items-center gap-1.5 ${
                  selectedMode === 'DETAIL'
                    ? 'ez-bg-surface text-[var(--ez-color-text-primary)] border border-[var(--ez-hue-blue-border)] shadow-xs'
                    : 'text-[#64748B] hover:text-[var(--ez-color-text-primary)]'
                }`}
              >
                <Sliders size={13} className={selectedMode === 'DETAIL' ? 'text-[var(--ez-hue-blue-text)]' : ''} />
                <span>{t('ai.ded.dash.mode_detail')}</span>
                <span className="text-[10px] font-mono text-[#64748B] bg-[var(--ez-hue-slate-bg)] px-1.5 rounded border border-[var(--ez-color-border-line)] deddash-x4">
                  {EZRAB_MODEL_PRO}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          MAIN CONTAINER
         ========================================================================= */}
      <div className="w-full mx-auto flex-1 deddash-x5">
        {/* =========================================================================
            SECTION 8: DOCUMENT SUMMARY (Compact Horizontal Card)
           ========================================================================= */}
        <div className="ez-bg-surface border border-[var(--ez-color-border-line)] rounded-[12px] p-4 flex flex-col items-center justify-between gap-4 shadow-2xs deddash-x6">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={handleFileChange}
          />
          {fileError && (
            <div className="w-full px-3 py-2 rounded-[8px] bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] text-[12px] font-semibold">
              {fileError}
            </div>
          )}

          <div className="flex items-center min-w-0 deddash-x7">
            <div className="w-10 h-10 rounded-[10px] bg-[var(--ez-hue-red-bg)] text-[var(--ez-hue-rose-text)] flex items-center justify-center shrink-0 border border-[var(--ez-hue-rose-border)]">
              <FileText size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-[13.5px] font-bold text-[var(--ez-color-text-primary)] truncate">
                {selectedFile ? selectedFile.name : t('ai.ded.dash.no_doc')}
              </div>
              {/* SEC-04: meta di bawah ini dulu statis — ukuran, jumlah
                  halaman, dan deskripsi isi BERKAS CONTOH ditampilkan
                  untuk berkas apa pun bahkan saat belum ada berkas.
                  Kini: ukuran dari File nyata, halaman dari
                  totalPagesRead hasil analisis (bila sudah ada), dan
                  tanpa klaim isi dokumen yang tidak diketahui. */}
              <div className="text-[12px] text-[#64748B] flex items-center gap-1.5 deddash-x8">
                {selectedFile ? (
                  <>
                    <span>{`${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB`}</span>
                    <span>•</span>
                    <span>
                      {outputResult && outputResult.totalPagesRead > 0
                        ? `${outputResult.totalPagesRead}${t('ai.ded.dash.pages_a')}`
                        : t('ai.ded.dash.pages_na')}
                    </span>
                    <span>•</span>
                    <span className="truncate">{t('ai.ded.dash.doc_pdf')}</span>
                  </>
                ) : (
                  <span>{t('ai.ded.dash.pick_file')}</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center shrink-0 deddash-x9">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isAnalyzing}
              className="px-3 py-1.5 ez-bg-surface border border-[var(--ez-hue-slate-border)] hover:bg-[var(--ez-hue-slate-bg)] text-[var(--ez-color-text-primary)] text-[12px] font-semibold rounded-[8px] transition disabled:opacity-50"
            >
              {t('ai.ded.dash.change_file')}
            </button>
            <button
              type="button"
              onClick={() => handleLoadSampleDED(false)}
              disabled={isAnalyzing || isLoadingSample}
              className="px-3 py-1.5 bg-[var(--ez-color-surface-tertiary)] hover:bg-[var(--ez-color-border-line)] text-[var(--ez-color-text-slate)] text-[12px] font-semibold rounded-[8px] transition disabled:opacity-50"
            >
              {isLoadingSample ? t('ai.ded.dash.sample_loading') : t('ai.ded.dash.sample_btn')}
            </button>
            <button
              type="button"
              onClick={() => runAnalysisPipeline()}
              disabled={isAnalyzing || !selectedFile}
              className="px-4 py-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-[#94A3B8] text-white text-[12px] font-bold rounded-[8px] transition shadow-xs flex items-center gap-1.5"
            >
              <Zap size={14} />
              <span>{isAnalyzing ? t('ai.ded.dash.btn_analyzing') : outputResult ? t('ai.ded.dash.btn_reanalyze') : t('ai.ded.dash.btn_start')}</span>
            </button>
          </div>
        </div>

        {/* =========================================================================
            SECTION 9: ANALYSIS PROGRESS — ringkas (owner 2026-10-27:
            UI lebih sederhana, minimalkan scroll). Detail 4 tahap TIDAK
            dihapus, hanya dipindah: daftar lengkapnya tetap ada di panel
            "Proses Analisis" di bawah; di sini cukup satu baris chip
            tahap + baris progres, sehingga halaman jauh lebih pendek
            (di HP, grid 4 kartu bertumpuk sebelumnya memakan ±400px).
           ========================================================================= */}
        <div className="ez-bg-surface border border-[var(--ez-color-border-line)] rounded-[12px] p-4 shadow-2xs space-y-3">
          {/* Stepper ringkas: satu baris chip, bukan 4 kartu bertumpuk */}
          <div className="flex flex-wrap items-center gap-2">
            {steps.map((st) => (
              <span
                key={st.id}
                title={`${st.title} — ${st.subtitle}${st.detail ? ` · ${st.detail}` : ''}`}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-bold border ${
                  st.status === 'SUCCESS'
                    ? 'bg-[var(--ez-hue-green-bg)] text-[var(--ez-hue-green-text-bright)] border-[var(--ez-hue-green-border)]'
                    : st.status === 'PROCESSING'
                    ? 'bg-[var(--ez-hue-blue-bg)] text-[var(--ez-hue-blue-text)] border-[var(--ez-hue-blue-border)]'
                    : 'bg-[var(--ez-color-surface-tertiary)] text-[#94A3B8] border-[var(--ez-color-border-line)]'
                }`}
              >
                {st.status === 'SUCCESS' ? <CheckCircle2 size={12} /> : st.status === 'PROCESSING' ? <span className="w-2 h-2 rounded-full bg-[#2563EB] animate-ping" /> : <span className="w-1.5 h-1.5 rounded-full bg-[#94A3B8]" />}
                {st.number} {st.title}
              </span>
            ))}
          </div>

          {/* Thin Progress Bar (Height 3px) */}
          <div className="space-y-1.5 deddash-x11">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#64748B] font-medium">{statusMessage}</span>
              <span className="font-mono font-bold text-[var(--ez-hue-blue-text)]">{analysisProgress}%</span>
            </div>
            <div className="w-full bg-[var(--ez-color-border-line)] rounded-full overflow-hidden deddash-x12">
              <div
                className="h-full bg-[#2563EB] transition-all duration-300 rounded-full"
                style={{ width: `${analysisProgress}%` }}
              />
            </div>
          </div>
        </div>

        {/* =========================================================================
            SECTION 10 & 11: MAIN ANALYSIS AREA (2 Columns: 60% Left / 40% Right)
           ========================================================================= */}
        <div className="grid grid-cols-1 items-start deddash-x13">
          {/* LEFT COLUMN: DOCUMENT PREVIEW (~60% => col-span-7) */}
          <div className="space-y-4 deddash-x14">
            {/* SEC-04: totalPages dulu hardcoded 32 (metadata berkas
                contoh). Kini jumlah nyata hasil analisis bila sudah ada;
                32 tersisa hanya sebagai placeholder pra-muat viewer
                (default DocumentViewer sendiri; viewer menggantinya
                dengan pdfDoc.numPages nyata begitu PDF termuat). */}
            <DocumentViewer
              file={selectedFile}
              fileBuffer={fileBuffer}
              totalPages={outputResult && outputResult.totalPagesRead > 0 ? outputResult.totalPagesRead : 32}
              currentPage={activePage}
              onPageChange={(p) => setActivePage(p)}
              logs={executionLogs}
              isAnalyzing={isAnalyzing}
            />
          </div>

          {/* RIGHT COLUMN: ANALYSIS PROCESS PANEL (~40% => col-span-5) */}
          <div className="ez-bg-surface border border-[var(--ez-color-border-line)] rounded-[12px] p-5 shadow-2xs space-y-4 flex flex-col justify-between deddash-x15">
            <div className="space-y-4">
              {/* Header */}
              <div className="border-b border-[var(--ez-color-border-line)] flex items-center justify-between deddash-x16">
                <div>
                  <h2 className="text-[15px] font-bold text-[var(--ez-color-text-primary)]">{t('ai.ded.dash.proc_title')}</h2>
                  <p className="text-[11.5px] text-[#64748B] deddash-x17">
                    {t('ai.ded.dash.proc_sub')}
                  </p>
                </div>
                <span className="text-[10px] font-mono font-bold bg-[var(--ez-color-surface-tertiary)] text-[var(--ez-color-text-slate)] px-2 py-0.5 rounded border border-[var(--ez-color-border-line)]">
                  STANDAR PU 2026
                </span>
              </div>

              {/* Stage List */}
              <div className="space-y-2.5">
                {steps.map((st) => {
                  const isSuccess = st.status === 'SUCCESS';
                  const isProcessing = st.status === 'PROCESSING';

                  return (
                    <div
                      key={st.id}
                      className={`rounded-[10px] border transition-all ${
                        isProcessing
                          ? 'border-[var(--ez-hue-blue-border)] bg-[var(--ez-hue-blue-bg)]'
                          : isSuccess
                          ? 'border-[var(--ez-color-border-line)] ez-bg-surface'
                          : 'border-[var(--ez-color-surface-tertiary)] bg-[var(--ez-hue-slate-bg)] opacity-70'
                      } deddash-x18`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start deddash-x19">
                          <div className="deddash-x20">
                            {isSuccess ? (
                              <div className="w-5 h-5 rounded-full bg-[var(--ez-hue-green-bg-deep)] text-[var(--ez-hue-green-text-bright)] flex items-center justify-center">
                                <Check size={12} strokeWidth={3} />
                              </div>
                            ) : isProcessing ? (
                              <div className="w-5 h-5 rounded-full bg-[var(--ez-hue-blue-bg-deep)] text-[var(--ez-hue-blue-text)] flex items-center justify-center">
                                <span className="w-2 h-2 rounded-full bg-[#2563EB] animate-ping" />
                              </div>
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-[var(--ez-color-border-line)] text-[#94A3B8] flex items-center justify-center">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#94A3B8]" />
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="text-[13px] font-bold text-[var(--ez-color-text-primary)]">{st.title}</div>
                            <div className="text-[11.5px] text-[#64748B] deddash-x17">{st.detail}</div>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <span
                          className={`text-[9.5px] font-bold px-2 py-0.5 rounded uppercase tracking-wider shrink-0 ${
                            isSuccess
                              ? 'bg-[var(--ez-hue-green-bg)] text-[var(--ez-hue-green-text-bright)] border border-[var(--ez-hue-green-border)]'
                              : isProcessing
                              ? 'bg-[var(--ez-hue-blue-bg)] text-[var(--ez-hue-blue-text)] border border-[var(--ez-hue-blue-border)]'
                              : 'bg-[var(--ez-color-surface-tertiary)] text-[#94A3B8] border border-[var(--ez-color-border-line)]'
                          }`}
                        >
                          {st.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Live Status Description */}
              <div className="bg-[var(--ez-hue-slate-bg)] border border-[var(--ez-color-border-line)] rounded-[8px] p-3 text-[12px] text-[var(--ez-color-text-slate)] leading-relaxed">
                <div className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider deddash-x21">
                  {t('ai.ded.dash.engine_status')}
                </div>
                {isAnalyzing ? (
                  <div className="flex items-center gap-2 text-[var(--ez-hue-blue-text)] font-medium">
                    <span className="w-2 h-2 rounded-full bg-[#2563EB] animate-pulse" />
                    <span>{statusMessage}</span>
                  </div>
                ) : outputResult ? (
                  <div className="text-[var(--ez-hue-green-text-bright)] font-semibold flex items-center gap-1.5">
                    <CheckCircle2 size={14} />
                    <span>{t('ai.ded.dash.status_done_msg')}</span>
                  </div>
                ) : (
                  <div>{t('ai.ded.dash.status_ready_msg')}</div>
                )}
              </div>
            </div>

            {/* Bottom Actions in Process Panel */}
            <div className="border-t border-[var(--ez-color-border-line)] flex items-center justify-between text-[11.5px] text-[#64748B] deddash-x22">
              <div className="flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-[var(--ez-hue-green-text-bright)]" />
                <span>{t('ai.ded.dash.gate_active')}</span>
              </div>
              <div className="font-mono text-[11px] text-[var(--ez-color-text-primary)]">
                {elapsedSeconds > 0 ? `${elapsedSeconds}${t('ai.ded.dash.elapsed_suffix')}` : t('ai.ded.dash.ready')}
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
            SECTION 25: AFTER ANALYSIS RESULTS & RAB TABLE
           ========================================================================= */}
        {outputResult && (
          <div className="border-t border-[var(--ez-color-border-line)] deddash-x23">
            {/* 1. Header Summary */}
            <div className="ez-bg-surface border border-[var(--ez-color-border-line)] rounded-[12px] shadow-2xs deddash-x24">
              <div className="flex flex-col justify-between gap-4 border-b border-[var(--ez-color-border-line)] deddash-x25">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#16A34A]" />
                    <h2 className="text-[18px] font-black text-[var(--ez-color-text-primary)] tracking-tight">
                      {t('ai.ded.dash.done_title')}
                    </h2>
                  </div>
                  {/* SEC-04: jumlah halaman dan blocker di sini dulu memakai
                      nilai tetap yang dikarang (fallback halaman + nol
                      hardcoded). Halaman = totalPagesRead nyata (bila 0,
                      akui tidak tercatat); blocker = stats.blockedItems
                      nyata. */}
                  <p className="text-[13px] text-[#64748B] mt-1 font-normal">
                    {outputResult.totalPagesRead > 0 ? `${outputResult.totalPagesRead}${t('ai.ded.dash.pages_done_a')}` : t('ai.ded.dash.pages_done_na')} • {outputResult.stats?.totalItems ?? outputResult.workItems.length} {t('ai.ded.dash.summary_items')} • {outputResult.stats?.blockedItems ?? outputResult.workItems.filter((i) => i.status === 'BLOCKED').length} {t('ai.ded.dash.summary_blocked')}
                  </p>
                </div>

                <div className="flex items-center deddash-x26">
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="py-2 ez-bg-surface border border-[var(--ez-hue-slate-border)] hover:bg-[var(--ez-hue-slate-bg)] text-[var(--ez-color-text-primary)] text-[12px] font-semibold rounded-[8px] transition flex items-center gap-1.5 deddash-x27"
                  >
                    <Download size={14} />
                    <span>{t('ai.ded.dash.export_csv')}</span>
                  </button>
                  {/* Ulangi Proses (perintah owner 2026-11-28 01:17):
                      sesudah generate selesai, jalankan ulang analisis
                      dari dokumen + pengaturan yang sama (tanpa unggah
                      ulang) lewat runAnalysisPipeline yang sama. Hanya
                      tampil di layar hasil (blok ini hanya dirender bila
                      outputResult ada); disabled + label berjalan saat
                      lari berlangsung. Hasil lama diganti hasil baru
                      hanya bila lari baru sukses; bila gagal, hasil
                      lama tetap tampil. */}
                  <button
                    type="button"
                    onClick={() => runAnalysisPipeline()}
                    disabled={isAnalyzing}
                    className="py-2 px-3.5 ez-bg-surface border border-[var(--ez-hue-slate-border)] hover:bg-[var(--ez-hue-slate-bg)] text-[var(--ez-color-text-primary)] text-[12px] font-semibold rounded-[8px] transition flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <RotateCcw size={14} />
                    <span>{isAnalyzing ? t('ai.ded.dash.btn_repeat_running') : t('ai.ded.dash.btn_repeat_process')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCommitToProject}
                    disabled={isCommitting || committedSuccess}
                    className={`px-4 py-2 text-white text-[12px] font-bold rounded-[8px] transition shadow-xs flex items-center gap-1.5 ${
                      committedSuccess
                        ? 'bg-[#16A34A] hover:bg-[#15803D]'
                        : 'bg-[#2563EB] hover:bg-[#1D4ED8]'
                    }`}
                  >
                    <FileSpreadsheet size={14} />
                    <span>{committedSuccess ? t('ai.ded.dash.commit_saved') : t('ai.ded.dash.commit_btn')}</span>
                  </button>
                </div>
              </div>

              {/* P0-A: laporan commit jujur — item tertahan tidak disembunyikan */}
              {commitReport && (
                <div
                  className={`px-4 py-2.5 rounded-[8px] border text-[12px] font-semibold ${
                    commitReport.added === 0
                      ? 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]'
                      : commitReport.held > 0
                        ? 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]'
                        : 'bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]'
                  }`}
                >
                  {commitReport.added > 0
                    ? `${commitReport.added}${t('ai.ded.dash.report_added_a')}`
                    : t('ai.ded.dash.report_none')}
                  {commitReport.held > 0 &&
                    ` ${commitReport.held}${t('ai.ded.dash.report_held_a')}`}
                </div>
              )}

              {/* 2. Four Key Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 deddash-x28">
                {/* Total Estimasi */}
                <div className="p-4 rounded-[10px] bg-[var(--ez-hue-slate-bg)] border border-[var(--ez-color-border-line)]">
                  <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                    {t('ai.ded.dash.metric_total')}
                  </div>
                  <div className="text-[20px] font-black text-[var(--ez-color-text-primary)] tracking-tight mt-1">
                    {formatRupiah(outputResult.summary?.estimatedTotal)}
                  </div>
                  <div className="text-[11px] text-[var(--ez-hue-green-text-bright)] font-semibold mt-1 flex items-center gap-1">
                    <span>{t('ai.ded.dash.metric_sum')}</span>
                  </div>
                </div>

                {/* Range Estimasi */}
                <div className="p-4 rounded-[10px] bg-[var(--ez-hue-slate-bg)] border border-[var(--ez-color-border-line)]">
                  <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                    {t('ai.ded.dash.metric_range')}
                  </div>
                  <div className="text-[15px] font-black text-[var(--ez-color-text-primary)] tracking-tight mt-1 font-mono">
                    {formatRupiah(outputResult.summary?.rangeLow)} – {formatRupiah(outputResult.summary?.rangeHigh)}
                  </div>
                  <div className="text-[11px] text-[#64748B] mt-1">{t('ai.ded.dash.metric_var')}</div>
                </div>

                {/* Item Teridentifikasi */}
                <div className="p-4 rounded-[10px] bg-[var(--ez-hue-slate-bg)] border border-[var(--ez-color-border-line)]">
                  <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                    {t('ai.ded.dash.metric_items')}
                  </div>
                  <div className="text-[20px] font-black text-[var(--ez-color-text-primary)] tracking-tight mt-1">
                    {outputResult.stats?.totalItems ?? outputResult.workItems.length}
                  </div>
                  <div className="text-[11px] text-[#64748B] mt-1">
                    {categories.length}{t('ai.ded.dash.metric_cats_a')}
                  </div>
                </div>

                {/* Perlu Review */}
                <div className="p-4 rounded-[10px] bg-[var(--ez-hue-slate-bg)] border border-[var(--ez-color-border-line)]">
                  <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                    {t('ai.ded.dash.metric_review')}
                  </div>
                  <div className="text-[20px] font-black text-[var(--ez-color-text-primary)] tracking-tight mt-1">
                    {outputResult.warnings.length}
                  </div>
                  <div className="text-[11px] text-[var(--ez-hue-green-text-bright)] font-semibold mt-1">
                    {outputResult.warnings.length === 0 ? t('ai.ded.dash.metric_ready') : t('ai.ded.dash.metric_review_note')}
                  </div>
                </div>
              </div>
            </div>

            {/* 3. RAB / Estimate Table */}
            <div className="ez-bg-surface border border-[var(--ez-color-border-line)] rounded-[12px] shadow-2xs space-y-4 deddash-x29">
              {/* Filter & Search Bar */}
              <div className="flex flex-col items-center justify-between gap-3 deddash-x30">
                <div className="relative w-full deddash-x31">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('ai.ded.dash.search_ph')}
                    className="w-full py-1.5 text-[12.5px] rounded-[8px] border border-[var(--ez-hue-slate-border)] focus:outline-hidden focus:border-[#2563EB] text-[var(--ez-color-text-primary)] deddash-x32"
                  />
                </div>

                <div className="flex items-center gap-2 w-full deddash-x33">
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    aria-label={t('ai.ded.dash.filter_cat')}
                    className="text-[12px] px-3 py-1.5 rounded-[8px] border border-[var(--ez-hue-slate-border)] ez-bg-surface text-[var(--ez-color-text-primary)] focus:outline-hidden"
                  >
                    <option value="ALL">{t('ai.ded.dash.cat_all_a')}{categories.length}{t('ai.ded.dash.cat_all_b')}</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    aria-label={t('ai.ded.dash.filter_status')}
                    className="text-[12px] px-3 py-1.5 rounded-[8px] border border-[var(--ez-hue-slate-border)] ez-bg-surface text-[var(--ez-color-text-primary)] focus:outline-hidden"
                  >
                    <option value="ALL">{t('ai.ded.dash.status_all')}</option>
                    <option value="VALID">{t('ai.ded.dash.status_valid')}</option>
                    <option value="REVIEW">{t('ai.ded.dash.status_review')}</option>
                    <option value="BLOCKED">{t('ai.ded.dash.status_blocked')}</option>
                  </select>
                </div>
              </div>

              {/* Data Table — scroll internal (deddash-x38), header sticky */}
              <div className="border border-[var(--ez-color-border-line)] rounded-[8px] overflow-x-auto deddash-x38">
                <table className="w-full text-left border-collapse text-[12.5px]">
                  <thead>
                    <tr className="bg-[var(--ez-hue-slate-bg)] border-b border-[var(--ez-color-border-line)] text-[#64748B] text-[11px] font-bold uppercase tracking-wider">
                      <th className="py-2.5 px-3 text-center deddash-x34">{t('ai.ded.dash.th_no')}</th>
                      <th className="py-2.5 px-3">{t('ai.ded.dash.th_work')}</th>
                      <th className="py-2.5 px-3">{t('ai.ded.dash.th_cat')}</th>
                      <th className="py-2.5 px-3 text-right">{t('ai.ded.dash.th_vol')}</th>
                      <th className="py-2.5 px-3 text-center">{t('ai.ded.dash.th_unit')}</th>
                      <th className="py-2.5 px-3 text-right">{t('ai.ded.dash.th_price')}</th>
                      <th className="py-2.5 px-3 text-right">{t('ai.ded.dash.th_total')}</th>
                      <th className="py-2.5 px-3 text-center">{t('ai.ded.dash.th_conf')}</th>
                      <th className="py-2.5 px-3 text-center">{t('ai.ded.dash.th_status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--ez-color-border-line)]">
                    {filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center text-[#94A3B8] deddash-x35">
                          {t('ai.ded.dash.empty_search')}
                        </td>
                      </tr>
                    ) : (
                      filteredItems.map((it, idx) => {
                        const hasVolume = it.quantity !== null && it.quantity !== undefined;
                        const hasPrice = it.unitPrice !== null && it.unitPrice !== undefined;
                        const hasSubtotal = it.subtotal !== null && it.subtotal !== undefined;

                        return (
                          <tr key={it.id || idx} className="hover:bg-[var(--ez-hue-slate-bg)] transition">
                            <td className="py-2.5 px-3 text-center text-[#94A3B8] font-mono text-[11px]">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-bold text-[var(--ez-color-text-primary)]">{it.item || it.workName}</div>
                              {it.specification && (
                                <div className="text-[11px] text-[#64748B] deddash-x36">{it.specification}</div>
                              )}
                              {(it as any).ahspCode && (
                                <div className="text-[10px] text-[var(--ez-hue-blue-text)] font-mono deddash-x37">
                                  AHSP: {(it as any).ahspCode}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-[var(--ez-color-text-slate)]">
                              <span className="text-[11px] px-2 py-0.5 rounded bg-[var(--ez-color-surface-tertiary)] font-medium border border-[var(--ez-color-border-line)]">
                                {it.category}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-semibold text-[var(--ez-color-text-primary)]">
                              {hasVolume ? (
                                Number(it.quantity).toLocaleString('id-ID', { maximumFractionDigits: 2 })
                              ) : (
                                <span className="text-[var(--ez-hue-amber-text-deep)] italic font-sans text-[11px]">
                                  {t('ai.ded.dash.vol_na')}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono text-[#64748B]">{it.unit}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-[var(--ez-color-text-primary)]">
                              {hasPrice ? (
                                formatRupiah(it.unitPrice || it.estimatedUnitPrice)
                              ) : (
                                <span className="text-[var(--ez-hue-amber-text-deep)] italic font-sans text-[11px]">
                                  {t('ai.ded.dash.price_na')}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-[var(--ez-color-text-primary)]">
                              {it.status === 'BLOCKED' ? (
                                <span className="text-[var(--ez-hue-rose-text)] font-sans font-bold text-[11px]">{t('ai.ded.dash.row_blocked')}</span>
                              ) : hasSubtotal ? (
                                formatRupiah(it.subtotal || it.estimatedSubtotal)
                              ) : (
                                <span className="text-[#64748B] italic font-sans text-[11px]">-</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                  it.confidence === 'HIGH'
                                    ? 'bg-[var(--ez-hue-green-bg)] text-[var(--ez-hue-green-text-bright)] border border-[var(--ez-hue-green-border)]'
                                    : it.confidence === 'MEDIUM'
                                    ? 'bg-[var(--ez-hue-blue-bg)] text-[var(--ez-hue-blue-text)] border border-[var(--ez-hue-blue-border)]'
                                    : 'bg-[var(--ez-hue-amber-bg-deep)] text-[var(--ez-hue-amber-text-deep)] border border-[var(--ez-hue-amber-border)]'
                                }`}
                              >
                                {it.confidence}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                                  it.status === 'VALID'
                                    ? 'bg-[var(--ez-hue-green-bg)] text-[var(--ez-hue-green-text-bright)] border border-[var(--ez-hue-green-border)]'
                                    : it.status === 'WARNING'
                                    ? 'bg-[var(--ez-hue-amber-bg-deep)] text-[var(--ez-hue-amber-text-deep)] border border-[var(--ez-hue-amber-border)]'
                                    : it.status === 'BLOCKED'
                                    ? 'bg-[var(--ez-hue-red-bg)] text-[var(--ez-hue-rose-text)] border border-[var(--ez-hue-rose-border)]'
                                    : 'bg-[var(--ez-hue-blue-bg)] text-[var(--ez-hue-blue-text)] border border-[var(--ez-hue-blue-border)]'
                                }`}
                              >
                                {it.status === 'VALID' ? t('ai.ded.dash.status_valid_chip') : it.status || 'AI ESTIMATE'}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
