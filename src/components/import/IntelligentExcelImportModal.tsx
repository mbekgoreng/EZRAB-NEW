import React, { useState, useRef } from 'react';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Info,
  ChevronRight,
  ArrowRight,
  Download,
  Trash2,
  RefreshCw,
  Sparkles,
  Layers,
  X,
  Database,
  Search,
  Check,
  FileText,
  HelpCircle,
  FolderOpen,
  SlidersHorizontal,
} from 'lucide-react';
import {
  ExcelImportEngine,
  ExcelAnalysisResult,
  ColumnMappingConfig,
  ParsedRabRow,
} from '../../engine/excelImportEngine';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';
import * as XLSX from 'xlsx';
import { honestVolume } from '../../engine/honestVolume';

interface IntelligentExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportCompleted: (importedItems: any[], summary: { groupsCount: number; itemsCount: number; totalAmount: number }) => void;
}

export const IntelligentExcelImportModal: React.FC<IntelligentExcelImportModalProps> = ({
  isOpen,
  onClose,
  onImportCompleted,
}) => {
  // Wizard Steps: 1: UPLOAD, 2: SHEET_HEADER, 3: COLUMN_MAPPING, 4: PREVIEW_VALIDATION
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // File & Workbook State
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [analysisResult, setAnalysisResult] = useState<ExcelAnalysisResult | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [headerRowIndex, setHeaderRowIndex] = useState<number>(0);
  const [columnMapping, setColumnMapping] = useState<ColumnMappingConfig>({
    noCol: null,
    codeCol: null,
    descriptionCol: null,
    volumeCol: null,
    unitCol: null,
    unitPriceCol: null,
    amountCol: null,
    categoryCol: null,
  });

  // Preview tab filter
  const [previewTab, setPreviewTab] = useState<'VALID' | 'GROUPS' | 'ANOMALIES' | 'SUBTOTALS' | 'SKIPPED'>('VALID');
  const [searchQuery, setSearchQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // ---------------------------------------------------------------------------
  // FILE HANDLER
  // ---------------------------------------------------------------------------
  const handleFileSelected = (file: File) => {
    if (!file) return;
    setUploadedFile(file);
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const wb = ExcelImportEngine.readWorkbook(buffer);
        setWorkbook(wb);

        const initialSheet = wb.SheetNames[0];
        setSelectedSheet(initialSheet);

        const initialAnalysis = ExcelImportEngine.analyzeSheet(wb, initialSheet);
        setAnalysisResult(initialAnalysis);
        setHeaderRowIndex(initialAnalysis.detectedHeaderRowIndex);
        setColumnMapping(initialAnalysis.suggestedMapping);

        setCurrentStep(2);
      } catch (err: any) {
        alert(`Gagal membaca file Excel: ${err.message}`);
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSheetChange = (newSheet: string) => {
    if (!workbook) return;
    setSelectedSheet(newSheet);
    const newAnalysis = ExcelImportEngine.analyzeSheet(workbook, newSheet);
    setAnalysisResult(newAnalysis);
    setHeaderRowIndex(newAnalysis.detectedHeaderRowIndex);
    setColumnMapping(newAnalysis.suggestedMapping);
  };

  const handleHeaderRowChange = (newHeaderIdx: number) => {
    if (!workbook) return;
    setHeaderRowIndex(newHeaderIdx);
    const updatedAnalysis = ExcelImportEngine.analyzeSheet(workbook, selectedSheet, newHeaderIdx, columnMapping);
    setAnalysisResult(updatedAnalysis);
    setColumnMapping(updatedAnalysis.suggestedMapping);
  };

  const handleColumnMappingChange = (field: keyof ColumnMappingConfig, colIdx: number | null) => {
    const updated = { ...columnMapping, [field]: colIdx };
    setColumnMapping(updated);
    if (workbook) {
      const updatedAnalysis = ExcelImportEngine.analyzeSheet(workbook, selectedSheet, headerRowIndex, updated);
      setAnalysisResult(updatedAnalysis);
    }
  };

  const handleDownloadErrorReport = () => {
    if (!analysisResult) return;
    const csvContent = ExcelImportEngine.generateErrorReviewCsv(analysisResult);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Laporan_Audit_Import_RAB_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExecuteImport = () => {
    if (!analysisResult) return;

    const itemsToImport = analysisResult.validItems.map((item, idx) => ({
      code: item.code || `ITEM.${idx + 1}`,
      description: item.description,
      category: item.groupName || '01. PEKERJAAN PERSIAPAN',
      // Fase 4A: volume kosong/tidak valid -> 0 (jangan fabrikasi 1).
      volume: honestVolume(item.volume),
      unit: item.unit || 'ls',
      unitPrice: item.unitPrice || 0,
      amount: item.amount || item.calculatedAmount || 0,
      totalPrice: item.amount || item.calculatedAmount || 0,
      volumeSource: 'IMPORT',
      notes: item.anomalies.length > 0 ? `Import Warning: ${item.anomalies.map((a) => a.message).join('; ')}` : undefined,
    }));

    const totalAmount = itemsToImport.reduce((acc, i) => acc + (i.amount || 0), 0);

    onImportCompleted(itemsToImport, {
      groupsCount: analysisResult.detectedGroupsCount,
      itemsCount: itemsToImport.length,
      totalAmount,
    });
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '960px',
          maxHeight: '94vh',
          background: '#FFFFFF',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid #E2E8F0',
        }}
      >
        {/* ---------------------------------------------------------------------
            1. HEADER & STEPPER
           --------------------------------------------------------------------- */}
        <div
          style={{
            padding: '16px 24px',
            background: '#0F172A',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #1E293B',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #10B981, #2563EB)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 14px rgba(16, 185, 129, 0.4)',
              }}
            >
              <FileSpreadsheet size={20} color="#FFFFFF" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '0.02em' }}>
                  INTELLIGENT EXCEL IMPORT
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: 'rgba(37, 99, 235, 0.2)',
                    color: '#60A5FA',
                    border: '1px solid rgba(37, 99, 235, 0.4)',
                  }}
                >
                  INDONESIAN RAB ENGINE
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>
                Pengenalan otomatis struktur WBS, kolom harga, satuan standar, dan eliminasi baris subtotal ganda
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* ---------------------------------------------------------------------
            STEPPER STRIP
           --------------------------------------------------------------------- */}
        <div
          style={{
            padding: '10px 24px',
            background: '#F8FAFC',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {[
              { step: 1, label: 'Upload File' },
              { step: 2, label: 'Pilih Sheet & Header' },
              { step: 3, label: 'Mapping Kolom' },
              { step: 4, label: 'Preview & Validasi' },
            ].map((s) => (
              <div
                key={s.step}
                onClick={() => {
                  if (uploadedFile && s.step <= (analysisResult ? 4 : 1)) {
                    setCurrentStep(s.step as any);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: uploadedFile ? 'pointer' : 'default',
                  color: currentStep === s.step ? '#2563EB' : currentStep > s.step ? '#059669' : '#94A3B8',
                  fontWeight: currentStep === s.step ? 800 : 600,
                }}
              >
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: currentStep === s.step ? '#2563EB' : currentStep > s.step ? '#10B981' : '#E2E8F0',
                    color: currentStep >= s.step ? '#FFFFFF' : '#64748B',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '10.5px',
                    fontWeight: 750,
                  }}
                >
                  {currentStep > s.step ? <Check size={12} /> : s.step}
                </div>
                <span>{s.label}</span>
                {s.step < 4 && <ChevronRight size={14} color="#CBD5E1" />}
              </div>
            ))}
          </div>

          {uploadedFile && (
            <span style={{ fontSize: '11px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <FileSpreadsheet size={13} color="#2563EB" />
              <strong>{uploadedFile.name}</strong> ({(uploadedFile.size / 1024).toFixed(1)} KB)
            </span>
          )}
        </div>

        {/* ---------------------------------------------------------------------
            2. STEP CONTENT AREA
           --------------------------------------------------------------------- */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* ===================================================================
              STEP 1: UPLOAD FILE
             =================================================================== */}
          {currentStep === 1 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px 20px',
                gap: '16px',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelected(e.target.files[0]);
                  }
                }}
                style={{ display: 'none' }}
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleFileSelected(e.dataTransfer.files[0]);
                  }
                }}
                style={{
                  width: '100%',
                  maxWidth: '560px',
                  border: '2px dashed #93C5FD',
                  borderRadius: '16px',
                  padding: '40px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px',
                  background: '#F8FAFC',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                <div
                  style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '14px',
                    background: '#EFF6FF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Upload size={28} color="#2563EB" />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>
                    Tarik & Lepaskan File RAB Excel ke Sini
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
                    Mendukung format <strong>.XLSX, .XLS, .CSV</strong> (Standar RAB Proyek Indonesia)
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  style={{
                    marginTop: '8px',
                    padding: '8px 18px',
                    borderRadius: '8px',
                    background: '#2563EB',
                    color: '#FFFFFF',
                    border: 'none',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Pilih File dari Komputer
                </button>
              </div>

              {/* HEURISTICS INFO CALLOUT */}
              <div
                style={{
                  maxWidth: '560px',
                  borderRadius: '10px',
                  background: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  fontSize: '11.5px',
                  color: '#1E40AF',
                }}
              >
                <Sparkles size={16} color="#2563EB" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>Deteksi Cerdas Tanpa Format Kaku:</strong> Mesin akan otomatis mengenali variasi nama kolom (e.g. <em>Vol, Kuantitas, HSP, Sat, Uraian Pekerjaan</em>) serta memisahkan grup judul WBS dan baris subtotal secara otomatis.
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================
              STEP 2: SHEET & HEADER SELECTION
             =================================================================== */}
          {currentStep === 2 && analysisResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
                    Pilih Lembar Kerja (Sheet) & Baris Judul Kolom (Header)
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748B' }}>
                    Tentukan lembar kerja yang memuat rincian volume dan harga RAB
                  </div>
                </div>

                {/* Sheet Switcher */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Sheet:</span>
                  <select
                    value={selectedSheet}
                    onChange={(e) => handleSheetChange(e.target.value)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      background: '#FFFFFF',
                    }}
                  >
                    {analysisResult.sheetNames.map((sn) => (
                      <option key={sn} value={sn}>
                        {sn}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Raw Table Preview with Header Selector */}
              <div
                style={{
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  background: '#FFFFFF',
                }}
              >
                <div style={{ padding: '8px 12px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '11px', color: '#64748B' }}>
                  Klik salah satu baris di bawah ini jika baris judul kolom belum tepat:
                </div>
                <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                    <tbody>
                      {analysisResult.parsedRows.slice(0, 15).map((row, idx) => {
                        const isSelectedHeader = idx === headerRowIndex;
                        return (
                          <tr
                            key={idx}
                            onClick={() => handleHeaderRowChange(idx)}
                            style={{
                              background: isSelectedHeader ? '#EFF6FF' : idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA',
                              borderBottom: '1px solid #F1F5F9',
                              cursor: 'pointer',
                              borderLeft: isSelectedHeader ? '4px solid #2563EB' : '4px solid transparent',
                            }}
                          >
                            <td style={{ padding: '6px 10px', color: '#94A3B8', width: '36px', textAlign: 'center' }}>
                              {idx + 1}
                            </td>
                            {row.rawRow.slice(0, 8).map((cell, cIdx) => (
                              <td
                                key={cIdx}
                                style={{
                                  padding: '6px 10px',
                                  color: isSelectedHeader ? '#1E40AF' : '#334155',
                                  fontWeight: isSelectedHeader ? 800 : 500,
                                }}
                              >
                                {cell !== undefined && cell !== null ? cell.toString() : ''}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================
              STEP 3: COLUMN MAPPING & CONFIDENCE
             =================================================================== */}
          {currentStep === 3 && analysisResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
                  Pemetaan Kolom (Column Mapping)
                </div>
                <div style={{ fontSize: '12px', color: '#64748B' }}>
                  Verifikasi kolom hasil deteksi otomatis atau sesuaikan secara manual
                </div>
              </div>

              {/* Mapping Dropdowns Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  background: '#F8FAFC',
                  padding: '16px',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                }}
              >
                {[
                  { key: 'noCol' as const, label: 'Nomor Urut (No)', req: false },
                  { key: 'codeCol' as const, label: 'Kode AHSP / Item', req: false },
                  { key: 'descriptionCol' as const, label: 'Uraian Pekerjaan', req: true },
                  { key: 'volumeCol' as const, label: 'Volume Pekerjaan', req: true },
                  { key: 'unitCol' as const, label: 'Satuan (m³, m², kg, dll)', req: true },
                  { key: 'unitPriceCol' as const, label: 'Harga Satuan (Rp)', req: true },
                  { key: 'amountCol' as const, label: 'Jumlah Harga (Total)', req: false },
                  { key: 'categoryCol' as const, label: 'Kategori / WBS Group', req: false },
                ].map((field) => {
                  const currentVal = columnMapping[field.key];
                  const conf = analysisResult.mappingConfidence[field.key] || 0;

                  return (
                    <div
                      key={field.key}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        background: '#FFFFFF',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: field.req && currentVal === null ? '1px solid #FCA5A5' : '1px solid #E2E8F0',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#1E293B' }}>
                          {field.label} {field.req && <span style={{ color: '#EF4444' }}>*</span>}
                        </span>
                        {currentVal !== null && conf > 0 && (
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 750,
                              color: '#059669',
                              background: '#ECFDF5',
                              padding: '1px 5px',
                              borderRadius: '4px',
                            }}
                          >
                            {Math.round(conf * 100)}% Match
                          </span>
                        )}
                      </div>

                      <select
                        value={currentVal !== null ? currentVal : ''}
                        onChange={(e) =>
                          handleColumnMappingChange(
                            field.key,
                            e.target.value !== '' ? parseInt(e.target.value, 10) : null
                          )
                        }
                        style={{
                          padding: '6px 8px',
                          borderRadius: '6px',
                          border: '1px solid #CBD5E1',
                          fontSize: '12px',
                          background: '#FFFFFF',
                        }}
                      >
                        <option value="">-- Lewati / Tidak Ada --</option>
                        {analysisResult.columnHeaders.map((colHeader, cIdx) => (
                          <option key={cIdx} value={cIdx}>
                            Kolom {String.fromCharCode(65 + cIdx)}: {colHeader || `(Kolom ${cIdx + 1})`}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ===================================================================
              STEP 4: PREVIEW & VALIDATION MATRIX
             =================================================================== */}
          {currentStep === 4 && analysisResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* METRIC SUMMARY CARDS */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr 1fr',
                  gap: '10px',
                }}
              >
                <div style={{ padding: '10px 12px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 700 }}>KELOMPOK WBS</div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                    {analysisResult.detectedGroupsCount} Grup
                  </div>
                </div>

                <div style={{ padding: '10px 12px', borderRadius: '8px', background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
                  <div style={{ fontSize: '10.5px', color: '#1E40AF', fontWeight: 700 }}>ITEM PEKERJAAN</div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#2563EB', marginTop: '2px' }}>
                    {analysisResult.detectedWorkItemsCount} Item
                  </div>
                </div>

                <div style={{ padding: '10px 12px', borderRadius: '8px', background: '#FDF4FF', border: '1px solid #F5D0FE' }}>
                  <div style={{ fontSize: '10.5px', color: '#86198F', fontWeight: 700 }}>KODE AHSP</div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#9333EA', marginTop: '2px' }}>
                    {analysisResult.detectedAhspReferencesCount} Terdeteksi
                  </div>
                </div>

                <div style={{ padding: '10px 12px', borderRadius: '8px', background: analysisResult.allAnomalies.length > 0 ? '#FEF3C7' : '#ECFDF5', border: `1px solid ${analysisResult.allAnomalies.length > 0 ? '#FCD34D' : '#A7F3D0'}` }}>
                  <div style={{ fontSize: '10.5px', color: analysisResult.allAnomalies.length > 0 ? '#92400E' : '#065F46', fontWeight: 700 }}>
                    ANOMALI / WARNING
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: analysisResult.allAnomalies.length > 0 ? '#D97706' : '#059669', marginTop: '2px' }}>
                    {analysisResult.allAnomalies.length} Catatan
                  </div>
                </div>
              </div>

              {/* TABS & SEARCH TOOLBAR */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: '#F8FAFC',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {[
                    { key: 'VALID' as const, label: `Item Valid (${analysisResult.validItems.length})` },
                    { key: 'GROUPS' as const, label: `WBS Header (${analysisResult.groupHeaders.length})` },
                    { key: 'ANOMALIES' as const, label: `Anomali (${analysisResult.allAnomalies.length})` },
                    { key: 'SUBTOTALS' as const, label: `Subtotal Dieliminasi (${analysisResult.subtotalRows.length})` },
                  ].map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setPreviewTab(t.key)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        background: previewTab === t.key ? '#2563EB' : '#FFFFFF',
                        color: previewTab === t.key ? '#FFFFFF' : '#475569',
                        border: previewTab === t.key ? 'none' : '1px solid #CBD5E1',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleDownloadErrorReport}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    background: '#FFFFFF',
                    border: '1px solid #CBD5E1',
                    color: '#334155',
                    fontSize: '11.5px',
                    fontWeight: 650,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Download size={13} color="#2563EB" />
                  Unduh Laporan Audit CSV
                </button>
              </div>

              {/* TAB CONTENT TABLE */}
              <div
                style={{
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  background: '#FFFFFF',
                  maxHeight: '260px',
                  overflowY: 'auto',
                }}
              >
                {previewTab === 'VALID' && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', textAlign: 'left' }}>
                    <thead style={{ background: '#F1F5F9', color: '#475569', position: 'sticky', top: 0, zIndex: 5 }}>
                      <tr>
                        <th style={{ padding: '8px 10px' }}>No</th>
                        <th style={{ padding: '8px 10px' }}>Kode</th>
                        <th style={{ padding: '8px 10px' }}>Grup WBS</th>
                        <th style={{ padding: '8px 10px' }}>Uraian Pekerjaan</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Vol</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center' }}>Sat</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Harga Satuan</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysisResult.validItems.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '6px 10px', color: '#94A3B8' }}>{idx + 1}</td>
                          <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#2563EB', fontWeight: 600 }}>
                            {item.code}
                          </td>
                          <td style={{ padding: '6px 10px', color: '#64748B', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.groupName}
                          </td>
                          <td style={{ padding: '6px 10px', fontWeight: 600, color: '#0F172A' }}>
                            {item.description}
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700 }}>
                            {item.volume.toLocaleString('id-ID')}
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'center', color: '#64748B' }}>{item.unit}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right' }}>{formatCurrencyIDR(item.unitPrice)}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 750, color: '#1E40AF' }}>
                            {formatCurrencyIDR(item.amount || item.calculatedAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {previewTab === 'GROUPS' && (
                  <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {analysisResult.groupHeaders.map((grp, gIdx) => (
                      <div
                        key={gIdx}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '6px',
                          background: '#F8FAFC',
                          border: '1px solid #E2E8F0',
                          fontSize: '12px',
                          fontWeight: 750,
                          color: '#1E293B',
                        }}
                      >
                        {grp.description || grp.groupName} (Baris Excel {grp.rowNumber})
                      </div>
                    ))}
                  </div>
                )}

                {previewTab === 'ANOMALIES' && (
                  <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {analysisResult.allAnomalies.length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#059669', fontWeight: 600 }}>
                        <CheckCircle2 size={24} color="#10B981" style={{ margin: '0 auto 6px' }} />
                        Tidak ditemukan anomali atau error pada file ini!
                      </div>
                    ) : (
                      analysisResult.allAnomalies.map((ano, aIdx) => (
                        <div
                          key={aIdx}
                          style={{
                            padding: '8px 12px',
                            borderRadius: '6px',
                            background: ano.severity === 'error' ? '#FEF2F2' : '#FFFBEB',
                            border: `1px solid ${ano.severity === 'error' ? '#FECACA' : '#FDE68A'}`,
                            fontSize: '11.5px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                        >
                          <AlertTriangle size={14} color={ano.severity === 'error' ? '#DC2626' : '#D97706'} />
                          <span style={{ fontWeight: 700, color: '#0F172A' }}>Baris {ano.rowNumber}:</span>
                          <span style={{ color: '#475569' }}>{ano.message}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {previewTab === 'SUBTOTALS' && (
                  <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {analysisResult.subtotalRows.map((sub, sIdx) => (
                      <div
                        key={sIdx}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '6px',
                          background: '#F1F5F9',
                          fontSize: '11.5px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          color: '#475569',
                        }}
                      >
                        <span>
                          Baris {sub.rowNumber}: <strong>{sub.description}</strong>
                        </span>
                        <span style={{ fontWeight: 700 }}>{formatCurrencyIDR(sub.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ---------------------------------------------------------------------
            3. MODAL FOOTER & NAVIGATION
           --------------------------------------------------------------------- */}
        <div
          style={{
            padding: '14px 24px',
            background: '#F8FAFC',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              background: '#FFFFFF',
              border: '1px solid #CBD5E1',
              color: '#475569',
              fontSize: '12.5px',
              fontWeight: 650,
              cursor: 'pointer',
            }}
          >
            Batalkan
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {currentStep > 1 && (
              <button
                onClick={() => setCurrentStep((currentStep - 1) as any)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  background: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  color: '#1E293B',
                  fontSize: '12.5px',
                  fontWeight: 650,
                  cursor: 'pointer',
                }}
              >
                Kembali
              </button>
            )}

            {currentStep < 4 ? (
              <button
                onClick={() => {
                  if (currentStep === 1 && !uploadedFile) {
                    fileInputRef.current?.click();
                    return;
                  }
                  setCurrentStep((currentStep + 1) as any);
                }}
                disabled={!uploadedFile}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  background: uploadedFile ? '#2563EB' : '#94A3B8',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: '12.5px',
                  fontWeight: 750,
                  cursor: uploadedFile ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                Lanjutkan
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                onClick={handleExecuteImport}
                style={{
                  padding: '8px 20px',
                  borderRadius: '8px',
                  background: '#10B981',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
                }}
              >
                <Check size={16} />
                Import {analysisResult?.validItems.length || 0} Item ke Spreadsheet
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
