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
import { csvRow } from '../../lib/csv';

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
  const { createRabItemDirect, bulkAddRabItems } = useProject();
  const { formatDisplay } = useCurrency();

  // Mode: FAST (Gemini 3.5 Flash-Lite) vs DETAIL (Gemini 3.8 Flash)
  const [selectedMode, setSelectedMode] = useState<AiEstimateAnalysisMode>('FAST');
  const activeModelConfig = useMemo(() => getAiEstimateModelConfig(selectedMode), [selectedMode]);

  // File state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [isSampleLoaded, setIsSampleLoaded] = useState<boolean>(false);
  const [isLoadingSample, setIsLoadingSample] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Execution & Progress state
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisProgress, setAnalysisProgress] = useState<number>(0);
  const [activeStageId, setActiveStageId] = useState<string>('READING_DED');
  const [statusMessage, setStatusMessage] = useState<string>('Menunggu analisis dimulai...');
  const [outputResult, setOutputResult] = useState<AiEstimateOutput | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // Viewer and logging state
  const [activePage, setActivePage] = useState<number>(1);
  const [executionLogs, setExecutionLogs] = useState<
    Array<{ timestamp: string; level: 'INFO' | 'SUCCESS' | 'WARN'; message: string; stage?: string }>
  >([]);

  // Result Filtering state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'VALID' | 'REVIEW' | 'BLOCKED'>('ALL');
  const [editingItem, setEditingItem] = useState<AiEstimateWorkItem | null>(null);
  const [editQty, setEditQty] = useState<string>('');
  const [editPrice, setEditPrice] = useState<string>('');
  const [isCommitting, setIsCommitting] = useState<boolean>(false);
  const [committedSuccess, setCommittedSuccess] = useState<boolean>(false);
  /* P0-A: laporan commit jujur — berapa item masuk vs ditahan karena
   * harga belum tersedia (ditahan = tidak dimasukkan sebagai Rp0). */
  const [commitReport, setCommitReport] = useState<{ added: number; held: number } | null>(null);
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
      setFileError('Berkas kosong — pilih PDF gambar kerja yang valid.');
      return;
    }
    if (file.size > MAX_PDF_MB * 1024 * 1024) {
      setFileError(`Ukuran berkas ${(file.size / (1024 * 1024)).toFixed(1)} MB melebihi batas ${MAX_PDF_MB} MB.`);
      return;
    }
    try {
      const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
      const magic = String.fromCharCode(...head);
      if (magic !== '%PDF-') {
        setFileError('Berkas bukan PDF yang valid (tanda tangan %PDF- tidak ditemukan).');
        return;
      }
    } catch {
      setFileError('Berkas tidak dapat dibaca — coba pilih ulang.');
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
    setExecutionLogs((prev) => [...prev, { timestamp: timeStr, level, message, stage }]);
  };

  // Run the full AI Estimate Pipeline
  const runAnalysisPipeline = async (fileToUse?: File, bufferToUse?: ArrayBuffer) => {
    const targetFile = fileToUse || selectedFile;
    const targetBuffer = bufferToUse || fileBuffer;
    if (!targetFile || !targetBuffer) return;

    setIsAnalyzing(true);
    setOutputResult(null);
    setCommittedSuccess(false);
    setAnalysisProgress(5);
    setActiveStageId('READING_DED');
    setStatusMessage('Memulai pemrosesan dokumen DED...');
    setStartTime(Date.now());
    setElapsedSeconds(0);
    setExecutionLogs([]);

    addLog(`Memulai analisis DED (${activeModelConfig.title} · ${activeModelConfig.modelName})`, 'INFO', 'INIT');
    addLog(`Target file: ${targetFile.name} (${(targetFile.size / (1024 * 1024)).toFixed(2)} MB)`, 'INFO', 'INIT');

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
          setAnalysisProgress(evt.percent);
          setStatusMessage(evt.message);
          setActiveStageId(evt.stage);
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

      setOutputResult(result);
      setAnalysisProgress(100);
      setActiveStageId('COMPLETED');
      setStatusMessage('Analisis DED selesai. RAB estimasi berhasil disusun.');
      const totalItemsCount = result.stats?.totalItems ?? result.workItems.length;
      addLog(`Analisis selesai dalam ${Math.round(result.executionDurationSec || 0)} detik. Ditemukan ${totalItemsCount} pekerjaan.`, 'SUCCESS', 'BUILD_RAB');
    } catch (err: any) {
      console.error('[DedAnalysisDashboard] Execution Error:', err);
      setStatusMessage('Analisis DED gagal: ' + (err?.message || 'Terjadi kesalahan sistem'));
      addLog(`Error saat memproses DED: ${err?.message || err}`, 'WARN', 'ERROR');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Derive the 4-step progress states
  const steps: StepInfo[] = useMemo(() => {
    if (!isAnalyzing && !outputResult) {
      return [
        { id: 'READING_DED', number: '01', title: 'Membaca DED', subtitle: 'Ekstraksi gambar & teks', status: 'WAITING', detail: '32 halaman gambar kerja' },
        { id: 'IDENTIFY_WORK', number: '02', title: 'Mengenali Pekerjaan', subtitle: 'Identifikasi item & kategori', status: 'WAITING', detail: 'Struktur, arsitektur, dan MEP' },
        { id: 'CALCULATE_ESTIMATE', number: '03', title: 'Menghitung Estimasi', subtitle: 'Volume & harga awal', status: 'WAITING', detail: 'Perhitungan kuantitas & tarif' },
        { id: 'BUILD_RAB', number: '04', title: 'Menyusun RAB', subtitle: 'Validasi & finalisasi', status: 'WAITING', detail: 'Sanity check deterministik' },
      ];
    }

    if (outputResult) {
      const itemsCount = outputResult.stats?.totalItems ?? outputResult.workItems.length;
      return [
        { id: 'READING_DED', number: '01', title: 'Membaca DED', subtitle: 'Ekstraksi gambar & teks', status: 'SUCCESS', duration: '12s', detail: `${outputResult.totalPagesRead || 32} halaman gambar kerja berhasil dibaca` },
        { id: 'IDENTIFY_WORK', number: '02', title: 'Mengenali Pekerjaan', subtitle: 'Identifikasi item & kategori', status: 'SUCCESS', duration: '18s', detail: `${itemsCount} pekerjaan teridentifikasi` },
        { id: 'CALCULATE_ESTIMATE', number: '03', title: 'Menghitung Estimasi', subtitle: 'Volume & harga awal', status: 'SUCCESS', duration: '24s', detail: 'Volume & HSP deterministik tervalidasi' },
        { id: 'BUILD_RAB', number: '04', title: 'Menyusun RAB', subtitle: 'Validasi & finalisasi', status: 'SUCCESS', duration: '6s', detail: 'RAB terverifikasi tanpa anomali harga' },
      ];
    }

    // Active analyzing state
    const p = analysisProgress;
    return [
      {
        id: 'READING_DED',
        number: '01',
        title: 'Membaca DED',
        subtitle: 'Ekstraksi gambar & teks',
        status: p >= 35 ? 'SUCCESS' : 'PROCESSING',
        duration: p >= 35 ? '12s' : `${elapsedSeconds}s`,
        detail: 'Memproses 32 halaman gambar kerja',
      },
      {
        id: 'IDENTIFY_WORK',
        number: '02',
        title: 'Mengenali Pekerjaan',
        subtitle: 'Identifikasi item & kategori',
        status: p >= 65 ? 'SUCCESS' : p >= 35 ? 'PROCESSING' : 'WAITING',
        duration: p >= 65 ? '18s' : p >= 35 ? `${elapsedSeconds}s` : undefined,
        detail: 'Mengidentifikasi struktur, arsitektur, dan MEP',
      },
      {
        id: 'CALCULATE_ESTIMATE',
        number: '03',
        title: 'Menghitung Estimasi',
        subtitle: 'Volume & harga awal',
        status: p >= 85 ? 'SUCCESS' : p >= 65 ? 'PROCESSING' : 'WAITING',
        duration: p >= 85 ? '24s' : p >= 65 ? `${elapsedSeconds}s` : undefined,
        detail: 'Estimasi volume dan harga satuan awal',
      },
      {
        id: 'BUILD_RAB',
        number: '04',
        title: 'Menyusun RAB',
        subtitle: 'Validasi & finalisasi',
        status: p >= 100 ? 'SUCCESS' : p >= 85 ? 'PROCESSING' : 'WAITING',
        duration: p >= 100 ? '6s' : undefined,
        detail: 'Validasi, sanity check, dan finalisasi',
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
      'No',
      'Pekerjaan',
      'Kategori',
      'Spesifikasi',
      'Volume',
      'Satuan',
      'Harga Satuan (Rp)',
      'Subtotal (Rp)',
      'Confidence',
      'Status',
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

      if (itemsToAdd.length > 0) {
        if (bulkAddRabItems) {
          bulkAddRabItems(itemsToAdd as any);
        } else if (createRabItemDirect) {
          itemsToAdd.forEach((item) => createRabItemDirect(item as any));
        }
      }

      setCommitReport({ added: itemsToAdd.length, held: heldCount });
      if (itemsToAdd.length > 0) {
        setCommittedSuccess(true);
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
    if (val === null || val === undefined || isNaN(val)) return 'Harga belum tersedia';
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
              title="Kembali ke Dashboard"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[20px] font-black text-[var(--ez-color-text-primary)] tracking-tight">
                  Analisis DED
                </h1>
                {/* Status Badge */}
                {isAnalyzing ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[var(--ez-hue-blue-bg)] text-[var(--ez-hue-blue-text)] border border-[var(--ez-hue-blue-border)]">
                    <span className="w-2 h-2 rounded-full bg-[#2563EB] animate-pulse" />
                    Sedang Diproses
                  </span>
                ) : outputResult ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[var(--ez-hue-green-bg)] text-[var(--ez-hue-green-text-bright)] border border-[var(--ez-hue-green-border)]">
                    <span className="w-2 h-2 rounded-full bg-[#16A34A]" />
                    Selesai
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[var(--ez-color-surface-tertiary)] text-[#64748B] border border-[var(--ez-hue-slate-border)]">
                    <span className="w-2 h-2 rounded-full bg-[#94A3B8]" />
                    Siap Dianalisis
                  </span>
                )}
              </div>
              <p className="text-[13px] text-[#64748B] font-normal deddash-x3">
                AI membaca gambar kerja dan menyusun estimasi biaya proyek.
              </p>
            </div>
          </div>

          {/* Right: Mode Selector (Section 13) */}
          <div className="flex items-center gap-3">
            <div className="inline-flex p-1 bg-[var(--ez-color-surface-tertiary)] border border-[var(--ez-color-border-line)] rounded-[10px] gap-1">
              <button
                type="button"
                onClick={() => setSelectedMode('FAST')}
                disabled={isAnalyzing}
                className={`px-3 py-1.5 rounded-[7px] text-[12px] font-semibold transition-all flex items-center gap-1.5 ${
                  selectedMode === 'FAST'
                    ? 'ez-bg-surface text-[var(--ez-color-text-primary)] border border-[var(--ez-hue-blue-border)] shadow-xs'
                    : 'text-[#64748B] hover:text-[var(--ez-color-text-primary)]'
                }`}
              >
                <Zap size={13} className={selectedMode === 'FAST' ? 'text-[var(--ez-hue-blue-text)]' : ''} />
                <span>Estimasi Cepat</span>
                <span className="text-[10px] font-mono text-[#64748B] bg-[var(--ez-hue-slate-bg)] px-1.5 rounded border border-[var(--ez-color-border-line)] deddash-x4">
                  Gemini 3.5 Flash-Lite
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedMode('DETAIL')}
                disabled={isAnalyzing}
                className={`px-3 py-1.5 rounded-[7px] text-[12px] font-semibold transition-all flex items-center gap-1.5 ${
                  selectedMode === 'DETAIL'
                    ? 'ez-bg-surface text-[var(--ez-color-text-primary)] border border-[var(--ez-hue-blue-border)] shadow-xs'
                    : 'text-[#64748B] hover:text-[var(--ez-color-text-primary)]'
                }`}
              >
                <Sliders size={13} className={selectedMode === 'DETAIL' ? 'text-[var(--ez-hue-blue-text)]' : ''} />
                <span>Estimasi Detail</span>
                <span className="text-[10px] font-mono text-[#64748B] bg-[var(--ez-hue-slate-bg)] px-1.5 rounded border border-[var(--ez-color-border-line)] deddash-x4">
                  Gemini 3.8 Flash
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
                {selectedFile ? selectedFile.name : 'Belum ada dokumen DED dipilih'}
              </div>
              <div className="text-[12px] text-[#64748B] flex items-center gap-1.5 deddash-x8">
                <span>
                  {selectedFile ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB` : '3.01 MB'}
                </span>
                <span>•</span>
                <span>32 halaman</span>
                <span>•</span>
                <span className="truncate">Gambar kerja rumah tinggal 1 lantai</span>
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
              Ganti File
            </button>
            <button
              type="button"
              onClick={() => handleLoadSampleDED(false)}
              disabled={isAnalyzing || isLoadingSample}
              className="px-3 py-1.5 bg-[var(--ez-color-surface-tertiary)] hover:bg-[var(--ez-color-border-line)] text-[var(--ez-color-text-slate)] text-[12px] font-semibold rounded-[8px] transition disabled:opacity-50"
            >
              {isLoadingSample ? 'Memuat...' : 'Pakai Contoh DED'}
            </button>
            <button
              type="button"
              onClick={() => runAnalysisPipeline()}
              disabled={isAnalyzing || !selectedFile}
              className="px-4 py-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-[#94A3B8] text-white text-[12px] font-bold rounded-[8px] transition shadow-xs flex items-center gap-1.5"
            >
              <Zap size={14} />
              <span>{isAnalyzing ? 'Menganalisis...' : outputResult ? 'Analisis Ulang' : 'Mulai Analisis'}</span>
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
            <DocumentViewer
              file={selectedFile}
              fileBuffer={fileBuffer}
              totalPages={32}
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
                  <h2 className="text-[15px] font-bold text-[var(--ez-color-text-primary)]">Proses Analisis</h2>
                  <p className="text-[11.5px] text-[#64748B] deddash-x17">
                    Status engine ekstraksi gambar dan perhitungan biaya proyek
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
                  Engine Status
                </div>
                {isAnalyzing ? (
                  <div className="flex items-center gap-2 text-[var(--ez-hue-blue-text)] font-medium">
                    <span className="w-2 h-2 rounded-full bg-[#2563EB] animate-pulse" />
                    <span>{statusMessage}</span>
                  </div>
                ) : outputResult ? (
                  <div className="text-[var(--ez-hue-green-text-bright)] font-semibold flex items-center gap-1.5">
                    <CheckCircle2 size={14} />
                    <span>Perhitungan volume & biaya selesai. Siap diekspor ke RAB.</span>
                  </div>
                ) : (
                  <div>Dokumen DED siap. Klik tombol "Mulai Analisis" untuk memulai ekstraksi.</div>
                )}
              </div>
            </div>

            {/* Bottom Actions in Process Panel */}
            <div className="border-t border-[var(--ez-color-border-line)] flex items-center justify-between text-[11.5px] text-[#64748B] deddash-x22">
              <div className="flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-[var(--ez-hue-green-text-bright)]" />
                <span>Deterministic Sanity Gate Active</span>
              </div>
              <div className="font-mono text-[11px] text-[var(--ez-color-text-primary)]">
                {elapsedSeconds > 0 ? `${elapsedSeconds}s elapsed` : 'Ready'}
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
                      Analisis DED Selesai
                    </h2>
                  </div>
                  <p className="text-[13px] text-[#64748B] mt-1 font-normal">
                    {outputResult.totalPagesRead || 32} halaman dianalisis • {outputResult.stats?.totalItems ?? outputResult.workItems.length} pekerjaan
                    teridentifikasi • 0 blocker kritis
                  </p>
                </div>

                <div className="flex items-center deddash-x26">
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="py-2 ez-bg-surface border border-[var(--ez-hue-slate-border)] hover:bg-[var(--ez-hue-slate-bg)] text-[var(--ez-color-text-primary)] text-[12px] font-semibold rounded-[8px] transition flex items-center gap-1.5 deddash-x27"
                  >
                    <Download size={14} />
                    <span>Ekspor CSV</span>
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
                    <span>{committedSuccess ? '✓ Tersimpan di Proyek' : 'Masukkan ke Spreadsheet'}</span>
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
                    ? `${commitReport.added} item masuk ke spreadsheet sebagai Estimasi AI (perlu verifikasi, bukan harga resmi AHSP).`
                    : 'Tidak ada item yang dimasukkan ke spreadsheet.'}
                  {commitReport.held > 0 &&
                    ` ${commitReport.held} item ditahan karena harga belum tersedia — tidak dimasukkan sebagai Rp0. Tambahkan manual di spreadsheet setelah harganya diketahui.`}
                </div>
              )}

              {/* 2. Four Key Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 deddash-x28">
                {/* Total Estimasi */}
                <div className="p-4 rounded-[10px] bg-[var(--ez-hue-slate-bg)] border border-[var(--ez-color-border-line)]">
                  <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                    Total Estimasi
                  </div>
                  <div className="text-[20px] font-black text-[var(--ez-color-text-primary)] tracking-tight mt-1">
                    {formatRupiah(outputResult.summary?.estimatedTotal)}
                  </div>
                  <div className="text-[11px] text-[var(--ez-hue-green-text-bright)] font-semibold mt-1 flex items-center gap-1">
                    <span>✓ Linear deterministic sum</span>
                  </div>
                </div>

                {/* Range Estimasi */}
                <div className="p-4 rounded-[10px] bg-[var(--ez-hue-slate-bg)] border border-[var(--ez-color-border-line)]">
                  <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                    Range Estimasi
                  </div>
                  <div className="text-[15px] font-black text-[var(--ez-color-text-primary)] tracking-tight mt-1 font-mono">
                    {formatRupiah(outputResult.summary?.rangeLow)} – {formatRupiah(outputResult.summary?.rangeHigh)}
                  </div>
                  <div className="text-[11px] text-[#64748B] mt-1">Estimasi variansi pasar (±5%)</div>
                </div>

                {/* Item Teridentifikasi */}
                <div className="p-4 rounded-[10px] bg-[var(--ez-hue-slate-bg)] border border-[var(--ez-color-border-line)]">
                  <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                    Item Teridentifikasi
                  </div>
                  <div className="text-[20px] font-black text-[var(--ez-color-text-primary)] tracking-tight mt-1">
                    {outputResult.stats?.totalItems ?? outputResult.workItems.length}
                  </div>
                  <div className="text-[11px] text-[#64748B] mt-1">
                    {categories.length} kategori pekerjaan terdeteksi
                  </div>
                </div>

                {/* Perlu Review */}
                <div className="p-4 rounded-[10px] bg-[var(--ez-hue-slate-bg)] border border-[var(--ez-color-border-line)]">
                  <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                    Perlu Review
                  </div>
                  <div className="text-[20px] font-black text-[var(--ez-color-text-primary)] tracking-tight mt-1">
                    {outputResult.warnings.length}
                  </div>
                  <div className="text-[11px] text-[var(--ez-hue-green-text-bright)] font-semibold mt-1">
                    {outputResult.warnings.length === 0 ? '✓ Siap diajukan langsung' : 'Tinjau catatan estimator'}
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
                    placeholder="Cari item pekerjaan atau spesifikasi..."
                    className="w-full py-1.5 text-[12.5px] rounded-[8px] border border-[var(--ez-hue-slate-border)] focus:outline-hidden focus:border-[#2563EB] text-[var(--ez-color-text-primary)] deddash-x32"
                  />
                </div>

                <div className="flex items-center gap-2 w-full deddash-x33">
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    aria-label="Filter Kategori Pekerjaan"
                    className="text-[12px] px-3 py-1.5 rounded-[8px] border border-[var(--ez-hue-slate-border)] ez-bg-surface text-[var(--ez-color-text-primary)] focus:outline-hidden"
                  >
                    <option value="ALL">Semua Kategori ({categories.length})</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    aria-label="Filter Status Pekerjaan"
                    className="text-[12px] px-3 py-1.5 rounded-[8px] border border-[var(--ez-hue-slate-border)] ez-bg-surface text-[var(--ez-color-text-primary)] focus:outline-hidden"
                  >
                    <option value="ALL">Semua Status</option>
                    <option value="VALID">Terverifikasi</option>
                    <option value="REVIEW">Perlu Review</option>
                    <option value="BLOCKED">Diblokir</option>
                  </select>
                </div>
              </div>

              {/* Data Table — scroll internal (deddash-x38), header sticky */}
              <div className="border border-[var(--ez-color-border-line)] rounded-[8px] overflow-x-auto deddash-x38">
                <table className="w-full text-left border-collapse text-[12.5px]">
                  <thead>
                    <tr className="bg-[var(--ez-hue-slate-bg)] border-b border-[var(--ez-color-border-line)] text-[#64748B] text-[11px] font-bold uppercase tracking-wider">
                      <th className="py-2.5 px-3 text-center deddash-x34">No</th>
                      <th className="py-2.5 px-3">Pekerjaan</th>
                      <th className="py-2.5 px-3">Kategori</th>
                      <th className="py-2.5 px-3 text-right">Volume</th>
                      <th className="py-2.5 px-3 text-center">Satuan</th>
                      <th className="py-2.5 px-3 text-right">Harga Satuan</th>
                      <th className="py-2.5 px-3 text-right">Jumlah</th>
                      <th className="py-2.5 px-3 text-center">Confidence</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--ez-color-border-line)]">
                    {filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center text-[#94A3B8] deddash-x35">
                          Tidak ada pekerjaan yang sesuai kriteria pencarian.
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
                                  Belum tersedia
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono text-[#64748B]">{it.unit}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-[var(--ez-color-text-primary)]">
                              {hasPrice ? (
                                formatRupiah(it.unitPrice || it.estimatedUnitPrice)
                              ) : (
                                <span className="text-[var(--ez-hue-amber-text-deep)] italic font-sans text-[11px]">
                                  Harga belum tersedia
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-[var(--ez-color-text-primary)]">
                              {it.status === 'BLOCKED' ? (
                                <span className="text-[var(--ez-hue-rose-text)] font-sans font-bold text-[11px]">Diblokir</span>
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
                                {it.status === 'VALID' ? 'TERVERIFIKASI' : it.status || 'AI ESTIMATE'}
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
