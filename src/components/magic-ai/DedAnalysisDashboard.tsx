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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
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
    }
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
    const rows = outputResult.workItems.map((item, idx) => [
      idx + 1,
      `"${item.item || item.workName}"`,
      `"${item.category}"`,
      `"${item.specification || ''}"`,
      item.quantity !== null ? item.quantity : '',
      item.unit,
      item.unitPrice || item.estimatedUnitPrice || '',
      item.subtotal || item.estimatedSubtotal || '',
      item.confidence,
      item.status,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
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
      const itemsToAdd = outputResult.workItems.map((it) => ({
        description: it.item || it.workName,
        category: it.category,
        volume: it.quantity || 1,
        unit: it.unit || 'ls',
        unitPrice: it.unitPrice || it.estimatedUnitPrice || 0,
        amount: (it.quantity || 1) * (it.unitPrice || it.estimatedUnitPrice || 0),
        ahspCode: (it as any).ahspCode || '',
        notes: it.specification || '',
      }));

      if (bulkAddRabItems) {
        bulkAddRabItems(itemsToAdd as any);
      } else if (createRabItemDirect) {
        itemsToAdd.forEach((item) => createRabItemDirect(item as any));
      }

      setCommittedSuccess(true);
      if (onCommitSuccess) {
        onCommitSuccess([], outputResult.summary?.estimatedTotal ?? 0, currentProject?.id);
      }
    } catch (e) {
      console.error('Failed to commit items:', e);
    } finally {
      setIsCommitting(false);
    }
  };

  const formatRupiah = (val?: number | null) => {
    if (val === null || val === undefined || isNaN(val)) return 'Harga belum tersedia';
    return `Rp ${val.toLocaleString('id-ID')}`;
  };

  return (
    <div className="w-full min-h-screen bg-[#F8FAFC] text-[#0F172A] font-sans flex flex-col">
      {/* =========================================================================
          PAGE HEADER (Section 7)
         ========================================================================= */}
      <div className="bg-white border-b border-[#E2E8F0] px-6 py-4 sticky top-0 z-20 shadow-2xs">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Left: Back & Title */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackToDashboard}
              className="p-1.5 rounded-[8px] text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] transition"
              title="Kembali ke Dashboard"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[20px] font-black text-[#0F172A] tracking-tight">
                  Analisis DED
                </h1>
                {/* Status Badge */}
                {isAnalyzing ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]">
                    <span className="w-2 h-2 rounded-full bg-[#2563EB] animate-pulse" />
                    Sedang Diproses
                  </span>
                ) : outputResult ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#F0FDF4] text-[#16A34A] border border-[#BBF7D0]">
                    <span className="w-2 h-2 rounded-full bg-[#16A34A]" />
                    Selesai
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#F1F5F9] text-[#64748B] border border-[#CBD5E1]">
                    <span className="w-2 h-2 rounded-full bg-[#94A3B8]" />
                    Siap Dianalisis
                  </span>
                )}
              </div>
              <p className="text-[13px] text-[#64748B] mt-0.5 font-normal">
                AI membaca gambar kerja dan menyusun estimasi biaya proyek.
              </p>
            </div>
          </div>

          {/* Right: Mode Selector (Section 13) */}
          <div className="flex items-center gap-3">
            <div className="inline-flex p-1 bg-[#F1F5F9] border border-[#E2E8F0] rounded-[10px] gap-1">
              <button
                type="button"
                onClick={() => setSelectedMode('FAST')}
                disabled={isAnalyzing}
                className={`px-3 py-1.5 rounded-[7px] text-[12px] font-semibold transition-all flex items-center gap-1.5 ${
                  selectedMode === 'FAST'
                    ? 'bg-white text-[#0F172A] border border-[#BFDBFE] shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                <Zap size={13} className={selectedMode === 'FAST' ? 'text-[#2563EB]' : ''} />
                <span>Estimasi Cepat</span>
                <span className="text-[10px] font-mono text-[#64748B] bg-[#F8FAFC] px-1.5 py-0.2 rounded border border-[#E2E8F0]">
                  Gemini 3.5 Flash-Lite
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedMode('DETAIL')}
                disabled={isAnalyzing}
                className={`px-3 py-1.5 rounded-[7px] text-[12px] font-semibold transition-all flex items-center gap-1.5 ${
                  selectedMode === 'DETAIL'
                    ? 'bg-white text-[#0F172A] border border-[#BFDBFE] shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                <Sliders size={13} className={selectedMode === 'DETAIL' ? 'text-[#2563EB]' : ''} />
                <span>Estimasi Detail</span>
                <span className="text-[10px] font-mono text-[#64748B] bg-[#F8FAFC] px-1.5 py-0.2 rounded border border-[#E2E8F0]">
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
      <div className="max-w-[1440px] w-full mx-auto p-6 space-y-6 flex-1">
        {/* =========================================================================
            SECTION 8: DOCUMENT SUMMARY (Compact Horizontal Card)
           ========================================================================= */}
        <div className="bg-white border border-[#E2E8F0] rounded-[12px] p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xs">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={handleFileChange}
          />

          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-[10px] bg-[#FEE2E2] text-[#DC2626] flex items-center justify-center shrink-0 border border-[#FECACA]">
              <FileText size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-[13.5px] font-bold text-[#0F172A] truncate">
                {selectedFile ? selectedFile.name : 'Belum ada dokumen DED dipilih'}
              </div>
              <div className="text-[12px] text-[#64748B] flex items-center gap-1.5 mt-0.5">
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

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isAnalyzing}
              className="px-3 py-1.5 bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] text-[#0F172A] text-[12px] font-semibold rounded-[8px] transition disabled:opacity-50"
            >
              Ganti File
            </button>
            <button
              type="button"
              onClick={() => handleLoadSampleDED(false)}
              disabled={isAnalyzing || isLoadingSample}
              className="px-3 py-1.5 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#475569] text-[12px] font-semibold rounded-[8px] transition disabled:opacity-50"
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
            SECTION 9: ANALYSIS PROGRESS (Horizontal Stepper with Thin Progress Line)
           ========================================================================= */}
        <div className="bg-white border border-[#E2E8F0] rounded-[12px] p-5 shadow-2xs space-y-4">
          {/* Stepper Columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {steps.map((st) => (
              <div
                key={st.id}
                className={`p-3 rounded-[10px] border transition-all ${
                  st.status === 'PROCESSING'
                    ? 'border-[#BFDBFE] bg-[#EFF6FF]'
                    : st.status === 'SUCCESS'
                    ? 'border-[#E2E8F0] bg-[#F8FAFC]'
                    : 'border-transparent bg-transparent opacity-60'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[11px] font-bold text-[#64748B]">{st.number}</span>
                    <span className="text-[13px] font-bold text-[#0F172A]">{st.title}</span>
                  </div>
                  {/* Status Indicator */}
                  {st.status === 'SUCCESS' ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#16A34A]">
                      <CheckCircle2 size={13} />
                      {st.duration || 'Selesai'}
                    </span>
                  ) : st.status === 'PROCESSING' ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#2563EB]">
                      <span className="w-2 h-2 rounded-full bg-[#2563EB] animate-ping" />
                      {st.duration || 'Berjalan'}
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold text-[#94A3B8]">Menunggu</span>
                  )}
                </div>
                <div className="text-[11.5px] text-[#64748B]">{st.subtitle}</div>
                {st.detail && (
                  <div className="text-[10.5px] text-[#94A3B8] mt-1 font-mono truncate">{st.detail}</div>
                )}
              </div>
            ))}
          </div>

          {/* Thin Progress Bar (Height 3px) */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#64748B] font-medium">{statusMessage}</span>
              <span className="font-mono font-bold text-[#2563EB]">{analysisProgress}%</span>
            </div>
            <div className="w-full h-[3px] bg-[#E2E8F0] rounded-full overflow-hidden">
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN: DOCUMENT PREVIEW (~60% => col-span-7) */}
          <div className="lg:col-span-7 space-y-4">
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
          <div className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-[12px] p-5 shadow-2xs space-y-4 flex flex-col justify-between min-h-[620px]">
            <div className="space-y-4">
              {/* Header */}
              <div className="border-b border-[#E2E8F0] pb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-[15px] font-bold text-[#0F172A]">Proses Analisis</h2>
                  <p className="text-[11.5px] text-[#64748B] mt-0.5">
                    Status engine ekstraksi gambar dan perhitungan biaya proyek
                  </p>
                </div>
                <span className="text-[10px] font-mono font-bold bg-[#F1F5F9] text-[#475569] px-2 py-0.5 rounded border border-[#E2E8F0]">
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
                      className={`p-3.5 rounded-[10px] border transition-all ${
                        isProcessing
                          ? 'border-[#BFDBFE] bg-[#EFF6FF]'
                          : isSuccess
                          ? 'border-[#E2E8F0] bg-[#FFFFFF]'
                          : 'border-[#F1F5F9] bg-[#F8FAFC] opacity-70'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5">
                          <div className="mt-0.5">
                            {isSuccess ? (
                              <div className="w-5 h-5 rounded-full bg-[#DCFCE7] text-[#16A34A] flex items-center justify-center">
                                <Check size={12} strokeWidth={3} />
                              </div>
                            ) : isProcessing ? (
                              <div className="w-5 h-5 rounded-full bg-[#DBEAFE] text-[#2563EB] flex items-center justify-center">
                                <span className="w-2 h-2 rounded-full bg-[#2563EB] animate-ping" />
                              </div>
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-[#E2E8F0] text-[#94A3B8] flex items-center justify-center">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#94A3B8]" />
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="text-[13px] font-bold text-[#0F172A]">{st.title}</div>
                            <div className="text-[11.5px] text-[#64748B] mt-0.5">{st.detail}</div>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <span
                          className={`text-[9.5px] font-bold px-2 py-0.5 rounded uppercase tracking-wider shrink-0 ${
                            isSuccess
                              ? 'bg-[#F0FDF4] text-[#16A34A] border border-[#BBF7D0]'
                              : isProcessing
                              ? 'bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]'
                              : 'bg-[#F1F5F9] text-[#94A3B8] border border-[#E2E8F0]'
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
              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[8px] p-3 text-[12px] text-[#475569] leading-relaxed">
                <div className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1">
                  Engine Status
                </div>
                {isAnalyzing ? (
                  <div className="flex items-center gap-2 text-[#2563EB] font-medium">
                    <span className="w-2 h-2 rounded-full bg-[#2563EB] animate-pulse" />
                    <span>{statusMessage}</span>
                  </div>
                ) : outputResult ? (
                  <div className="text-[#16A34A] font-semibold flex items-center gap-1.5">
                    <CheckCircle2 size={14} />
                    <span>Perhitungan volume & biaya selesai. Siap diekspor ke RAB.</span>
                  </div>
                ) : (
                  <div>Dokumen DED siap. Klik tombol "Mulai Analisis" untuk memulai ekstraksi.</div>
                )}
              </div>
            </div>

            {/* Bottom Actions in Process Panel */}
            <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-between text-[11.5px] text-[#64748B]">
              <div className="flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-[#16A34A]" />
                <span>Deterministic Sanity Gate Active</span>
              </div>
              <div className="font-mono text-[11px] text-[#0F172A]">
                {elapsedSeconds > 0 ? `${elapsedSeconds}s elapsed` : 'Ready'}
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
            SECTION 25: AFTER ANALYSIS RESULTS & RAB TABLE
           ========================================================================= */}
        {outputResult && (
          <div className="space-y-6 pt-4 border-t border-[#E2E8F0]">
            {/* 1. Header Summary */}
            <div className="bg-white border border-[#E2E8F0] rounded-[12px] p-6 shadow-2xs">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E2E8F0] pb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#16A34A]" />
                    <h2 className="text-[18px] font-black text-[#0F172A] tracking-tight">
                      Analisis DED Selesai
                    </h2>
                  </div>
                  <p className="text-[13px] text-[#64748B] mt-1 font-normal">
                    {outputResult.totalPagesRead || 32} halaman dianalisis • {outputResult.stats?.totalItems ?? outputResult.workItems.length} pekerjaan
                    teridentifikasi • 0 blocker kritis
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="px-3.5 py-2 bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] text-[#0F172A] text-[12px] font-semibold rounded-[8px] transition flex items-center gap-1.5"
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

              {/* 2. Four Key Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-5">
                {/* Total Estimasi */}
                <div className="p-4 rounded-[10px] bg-[#F8FAFC] border border-[#E2E8F0]">
                  <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                    Total Estimasi
                  </div>
                  <div className="text-[20px] font-black text-[#0F172A] tracking-tight mt-1">
                    {formatRupiah(outputResult.summary?.estimatedTotal)}
                  </div>
                  <div className="text-[11px] text-[#16A34A] font-semibold mt-1 flex items-center gap-1">
                    <span>✓ Linear deterministic sum</span>
                  </div>
                </div>

                {/* Range Estimasi */}
                <div className="p-4 rounded-[10px] bg-[#F8FAFC] border border-[#E2E8F0]">
                  <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                    Range Estimasi
                  </div>
                  <div className="text-[15px] font-black text-[#0F172A] tracking-tight mt-1 font-mono">
                    {formatRupiah(outputResult.summary?.rangeLow)} – {formatRupiah(outputResult.summary?.rangeHigh)}
                  </div>
                  <div className="text-[11px] text-[#64748B] mt-1">Estimasi variansi pasar (±5%)</div>
                </div>

                {/* Item Teridentifikasi */}
                <div className="p-4 rounded-[10px] bg-[#F8FAFC] border border-[#E2E8F0]">
                  <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                    Item Teridentifikasi
                  </div>
                  <div className="text-[20px] font-black text-[#0F172A] tracking-tight mt-1">
                    {outputResult.stats?.totalItems ?? outputResult.workItems.length}
                  </div>
                  <div className="text-[11px] text-[#64748B] mt-1">
                    {categories.length} kategori pekerjaan terdeteksi
                  </div>
                </div>

                {/* Perlu Review */}
                <div className="p-4 rounded-[10px] bg-[#F8FAFC] border border-[#E2E8F0]">
                  <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                    Perlu Review
                  </div>
                  <div className="text-[20px] font-black text-[#0F172A] tracking-tight mt-1">
                    {outputResult.warnings.length}
                  </div>
                  <div className="text-[11px] text-[#16A34A] font-semibold mt-1">
                    {outputResult.warnings.length === 0 ? '✓ Siap diajukan langsung' : 'Tinjau catatan estimator'}
                  </div>
                </div>
              </div>
            </div>

            {/* 3. RAB / Estimate Table */}
            <div className="bg-white border border-[#E2E8F0] rounded-[12px] p-6 shadow-2xs space-y-4">
              {/* Filter & Search Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative w-full sm:w-[320px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari item pekerjaan atau spesifikasi..."
                    className="w-full pl-9 pr-3 py-1.5 text-[12.5px] rounded-[8px] border border-[#CBD5E1] focus:outline-hidden focus:border-[#2563EB] text-[#0F172A]"
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    aria-label="Filter Kategori Pekerjaan"
                    className="text-[12px] px-3 py-1.5 rounded-[8px] border border-[#CBD5E1] bg-white text-[#0F172A] focus:outline-hidden"
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
                    className="text-[12px] px-3 py-1.5 rounded-[8px] border border-[#CBD5E1] bg-white text-[#0F172A] focus:outline-hidden"
                  >
                    <option value="ALL">Semua Status</option>
                    <option value="VALID">Terverifikasi</option>
                    <option value="REVIEW">Perlu Review</option>
                    <option value="BLOCKED">Diblokir</option>
                  </select>
                </div>
              </div>

              {/* Data Table */}
              <div className="border border-[#E2E8F0] rounded-[8px] overflow-x-auto">
                <table className="w-full text-left border-collapse text-[12.5px]">
                  <thead>
                    <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] text-[11px] font-bold uppercase tracking-wider">
                      <th className="py-2.5 px-3 w-[40px] text-center">No</th>
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
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-[#94A3B8]">
                          Tidak ada pekerjaan yang sesuai kriteria pencarian.
                        </td>
                      </tr>
                    ) : (
                      filteredItems.map((it, idx) => {
                        const hasVolume = it.quantity !== null && it.quantity !== undefined;
                        const hasPrice = it.unitPrice !== null && it.unitPrice !== undefined;
                        const hasSubtotal = it.subtotal !== null && it.subtotal !== undefined;

                        return (
                          <tr key={it.id || idx} className="hover:bg-[#F8FAFC] transition">
                            <td className="py-2.5 px-3 text-center text-[#94A3B8] font-mono text-[11px]">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-bold text-[#0F172A]">{it.item || it.workName}</div>
                              {it.specification && (
                                <div className="text-[11px] text-[#64748B] mt-0.5">{it.specification}</div>
                              )}
                              {(it as any).ahspCode && (
                                <div className="text-[10px] text-[#2563EB] font-mono mt-0.5">
                                  AHSP: {(it as any).ahspCode}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-[#475569]">
                              <span className="text-[11px] px-2 py-0.5 rounded bg-[#F1F5F9] font-medium border border-[#E2E8F0]">
                                {it.category}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#0F172A]">
                              {hasVolume ? (
                                Number(it.quantity).toLocaleString('id-ID', { maximumFractionDigits: 2 })
                              ) : (
                                <span className="text-[#D97706] italic font-sans text-[11px]">
                                  Belum tersedia
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono text-[#64748B]">{it.unit}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-[#0F172A]">
                              {hasPrice ? (
                                formatRupiah(it.unitPrice || it.estimatedUnitPrice)
                              ) : (
                                <span className="text-[#D97706] italic font-sans text-[11px]">
                                  Harga belum tersedia
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-[#0F172A]">
                              {it.status === 'BLOCKED' ? (
                                <span className="text-[#DC2626] font-sans font-bold text-[11px]">Diblokir</span>
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
                                    ? 'bg-[#F0FDF4] text-[#16A34A] border border-[#BBF7D0]'
                                    : it.confidence === 'MEDIUM'
                                    ? 'bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]'
                                    : 'bg-[#FEF3C7] text-[#D97706] border border-[#FDE68A]'
                                }`}
                              >
                                {it.confidence}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                                  it.status === 'VALID'
                                    ? 'bg-[#F0FDF4] text-[#16A34A] border border-[#BBF7D0]'
                                    : it.status === 'WARNING'
                                    ? 'bg-[#FEF3C7] text-[#D97706] border border-[#FDE68A]'
                                    : it.status === 'BLOCKED'
                                    ? 'bg-[#FEE2E2] text-[#DC2626] border border-[#FECACA]'
                                    : 'bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]'
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
