import React, { useState, useMemo } from 'react';
import {
  X,
  Download,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  Layers,
  ChevronRight,
  ChevronDown,
  Info,
  ShieldCheck,
  Building,
  Calendar,
  Sparkles,
  Sliders,
  Check,
  Eye,
  AlertTriangle,
  FolderArchive,
  ArrowRight,
} from 'lucide-react';
import { Project, Company } from '../../types';
import {
  ExportPresetId,
  ExportSheetKey,
  ExportFormat,
  ExportAudience,
  ExportPackageOptions,
  ALL_EXPORT_SHEETS,
  EXPORT_PRESETS,
} from '../../export/types';
import { exportRABToProfessionalExcel } from '../../export/excelExportEngine';
import { exportProjectToPDF } from '../../export/pdfExporter';
import { generateExportFileName } from '../../export/exportDesignSystem';

interface ExportProjectPackageModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProject: Project;
  company?: Company;
  onToast?: (message: string) => void;
}

export const ExportProjectPackageModal: React.FC<ExportProjectPackageModalProps> = ({
  isOpen,
  onClose,
  currentProject,
  company,
  onToast,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<ExportPresetId>('COMPLETE_PACKAGE');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('excel');
  const [selectedAudience, setSelectedAudience] = useState<ExportAudience>('all');
  const [isExporting, setIsExporting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showStructurePreview, setShowStructurePreview] = useState(false);

  // Form toggles
  const [useLiveFormulas, setUseLiveFormulas] = useState(true);
  const [signatures, setSignatures] = useState({
    preparedByName: 'Ahmad Yusuf (Lead Estimator)',
    checkedByName: 'Ir. Hendra Kusuma (Direktur Teknik)',
    approvedByName: (currentProject as any).client || currentProject.clientName || 'Owner Proyek',
  });

  // Sheet selections initialized from selected preset
  const [selectedSheets, setSelectedSheets] = useState<Record<ExportSheetKey, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    ALL_EXPORT_SHEETS.forEach((s) => {
      initial[s.key] = EXPORT_PRESETS.COMPLETE_PACKAGE.sheets.includes(s.key);
    });
    return initial as Record<ExportSheetKey, boolean>;
  });

  // When preset changes, update selected sheets
  const handleSelectPreset = (presetId: ExportPresetId) => {
    setSelectedPreset(presetId);
    if (presetId === 'CUSTOM') return;

    const preset = EXPORT_PRESETS[presetId];
    if (preset) {
      const updated: Record<string, boolean> = {};
      ALL_EXPORT_SHEETS.forEach((s) => {
        updated[s.key] = preset.sheets.includes(s.key);
      });
      setSelectedSheets(updated as Record<ExportSheetKey, boolean>);
      if (preset.recommendedAudience !== 'all') {
        setSelectedAudience(preset.recommendedAudience);
      }
    }
  };

  const handleToggleSheet = (sheetKey: ExportSheetKey) => {
    setSelectedSheets((prev) => {
      const next = { ...prev, [sheetKey]: !prev[sheetKey] };
      setSelectedPreset('CUSTOM');
      return next;
    });
  };

  const handleSelectAllSheets = (selectAll: boolean) => {
    const updated: Record<string, boolean> = {};
    ALL_EXPORT_SHEETS.forEach((s) => {
      updated[s.key] = selectAll;
    });
    setSelectedSheets(updated as Record<ExportSheetKey, boolean>);
    setSelectedPreset('CUSTOM');
  };

  // Compute active sheets
  const activeSheetCount = useMemo(() => {
    return Object.values(selectedSheets).filter(Boolean).length;
  }, [selectedSheets]);

  const activeSheetsList = useMemo(() => {
    return ALL_EXPORT_SHEETS.filter((s) => selectedSheets[s.key]);
  }, [selectedSheets]);

  const previewFileName = useMemo(() => {
    return generateExportFileName(
      selectedPreset,
      currentProject.name,
      currentProject.currentVersion,
      new Date().toISOString().substring(0, 10)
    );
  }, [selectedPreset, currentProject]);

  const effectiveCompany: Company = useMemo(() => {
    return (
      company || {
        id: 'comp-1',
        name: 'PT. EZRAB KONSTRUKSI INDONESIA',
        address: 'Equity Tower Lt. 22, SCBD, Jakarta Selatan',
        phone: '+62 21 555-7890',
        email: 'info@ezrab.co.id',
        website: 'https://ezrab.co.id',
        taxNumber: '01.234.567.8-012.000',
        leadEstimatorName: signatures.preparedByName,
        directorName: signatures.checkedByName,
        logo: '',
        defaultOverheadPercent: 5,
        defaultProfitPercent: 10,
        defaultContingencyPercent: 0,
        defaultTaxPercent: 11,
      }
    );
  }, [company, signatures]);

  if (!isOpen) return null;

  // Execute Export
  const handleExecuteExport = async () => {
    if (activeSheetCount === 0) {
      onToast?.('Pilih minimal satu lembar kerja untuk diexport.');
      return;
    }

    setIsExporting(true);
    try {
      const exportOptions: ExportPackageOptions = {
        preset: selectedPreset,
        format: exportFormat,
        audience: selectedAudience,
        mcNumber: 'MC-0',
        useLiveFormulas,
        signatures: {
          preparedByTitle: 'Disusun Oleh,',
          preparedByName: signatures.preparedByName,
          checkedByTitle: 'Diperiksa Oleh,',
          checkedByName: signatures.checkedByName,
          approvedByTitle: 'Disetujui Oleh,',
          approvedByName: signatures.approvedByName,
        },
        sheets: selectedSheets,
      };

      if (exportFormat === 'excel' || exportFormat === 'both') {
        await exportRABToProfessionalExcel(currentProject, effectiveCompany, exportOptions);
      }

      if (exportFormat === 'pdf' || exportFormat === 'both') {
        exportProjectToPDF(currentProject, effectiveCompany);
      }

      const formatMsg =
        exportFormat === 'both'
          ? 'Paket Excel (.xlsx) & PDF Resmi berhasil dibuat dan diunduh!'
          : exportFormat === 'pdf'
          ? 'Dokumen PDF Resmi berhasil diexport!'
          : `Buku Kerja Excel (${activeSheetCount} sheet) berhasil diexport!`;

      onToast?.(formatMsg);
      onClose();
    } catch (err: any) {
      console.error('Export failed:', err);
      onToast?.(`Gagal mengeksport dokumen: ${err.message || 'Error tidak diketahui'}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(5px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '920px',
          maxHeight: '92vh',
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid #E2E8F0',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ===================================================================
            1. MODAL HEADER
           =================================================================== */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                backgroundColor: '#EFF6FF',
                border: '1px solid #DBEAFE',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2563EB',
              }}
            >
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0F172A' }}>
                  Export Paket Dokumen Proyek
                </h3>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '999px',
                    backgroundColor: '#EFF6FF',
                    color: '#2563EB',
                    border: '1px solid #BFDBFE',
                  }}
                >
                  {currentProject.currentVersion || 'Rev 00'}
                </span>
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: '12.5px', color: '#64748B' }}>
                {currentProject.name} • {currentProject.location || 'Indonesia'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#F1F5F9',
              color: '#64748B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#E2E8F0')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#F1F5F9')}
          >
            <X size={18} />
          </button>
        </div>

        {/* ===================================================================
            2. MODAL BODY (Scrollable)
           =================================================================== */}
        <div style={{ flexGrow: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* SECTION A: QUICK PRESETS */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                PILIH PRESET PAKET RESMI (QUICK PRESETS)
              </label>
              <span style={{ fontSize: '11.5px', color: '#64748B' }}>
                {activeSheetCount} dari 15 lembar kerja aktif
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
              {(Object.keys(EXPORT_PRESETS) as ExportPresetId[]).map((pid) => {
                const p = EXPORT_PRESETS[pid];
                const isSelected = selectedPreset === pid;
                const isMc0 = pid === 'BOQ_MC0';
                const isComplete = pid === 'COMPLETE_PACKAGE';

                return (
                  <button
                    key={pid}
                    type="button"
                    onClick={() => handleSelectPreset(pid)}
                    style={{
                      textAlign: 'left',
                      padding: '12px',
                      borderRadius: '10px',
                      background: isSelected
                        ? '#EFF6FF'
                        : '#FFFFFF',
                      border: isSelected
                        ? '2px solid #2563EB'
                        : isMc0
                        ? '1px solid #FCD34D'
                        : '1px solid #E2E8F0',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.borderColor = '#CBD5E1';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.borderColor = isMc0 ? '#FCD34D' : '#E2E8F0';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 800,
                          padding: '1px 6px',
                          borderRadius: '4px',
                          background: isMc0 ? '#FEF3C7' : isComplete ? '#DCFCE7' : isSelected ? '#DBEAFE' : '#F1F5F9',
                          color: isMc0 ? '#B45309' : isComplete ? '#15803D' : isSelected ? '#1D4ED8' : '#64748B',
                        }}
                      >
                        {p.badge}
                      </span>
                      {isSelected && <Check size={14} color="#2563EB" strokeWidth={3} />}
                    </div>

                    <div style={{ fontSize: '13px', fontWeight: 750, color: '#0F172A', marginTop: '2px' }}>
                      {p.name}
                    </div>

                    <div style={{ fontSize: '11px', color: '#64748B', lineHeight: 1.3, minHeight: '28px' }}>
                      {p.sheets.length} dokumen • {p.recommendedAudience}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* SECTION B: FORMAT & TARGET AUDIENCE */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
            {/* Format Selection */}
            <div
              style={{
                padding: '14px',
                borderRadius: '10px',
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
              }}
            >
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 750, color: '#334155', marginBottom: '8px' }}>
                FORMAT DOKUMEN EXPORT
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[
                  { id: 'excel', label: 'Excel (.xlsx)', icon: FileSpreadsheet, desc: 'Live Formula & 15 Sheet' },
                  { id: 'pdf', label: 'PDF Resmi (.pdf)', icon: FileText, desc: 'Print-Ready Siap Cetak' },
                  { id: 'both', label: 'Excel + PDF', icon: FolderArchive, desc: 'Paket Lengkap Terpadu' },
                ].map(({ id, label, icon: Icon, desc }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setExportFormat(id as ExportFormat)}
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: exportFormat === id ? '2px solid #2563EB' : '1px solid #CBD5E1',
                      background: exportFormat === id ? '#FFFFFF' : '#F8FAFC',
                      color: exportFormat === id ? '#2563EB' : '#475569',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      textAlign: 'center',
                    }}
                  >
                    <Icon size={18} />
                    <span style={{ fontSize: '12px', fontWeight: 700 }}>{label}</span>
                    <span style={{ fontSize: '9.5px', color: '#64748B' }}>{desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Target Audience */}
            <div
              style={{
                padding: '14px',
                borderRadius: '10px',
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
              }}
            >
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 750, color: '#334155', marginBottom: '8px' }}>
                PERUNTUKAN DOKUMEN (RECIPIENT)
              </label>
              <select
                value={selectedAudience}
                onChange={(e) => setSelectedAudience(e.target.value as ExportAudience)}
                style={{
                  width: '100%',
                  height: '36px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  padding: '0 10px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  color: '#0F172A',
                  outline: 'none',
                }}
              >
                <option value="all">Semua Pihak (Universal Presentation)</option>
                <option value="owner">Pemilik Proyek / Klien (Executive Summary)</option>
                <option value="consultant">Konsultan Perencana / MK (Technical Evaluation)</option>
                <option value="contractor">Kontraktor Pelaksana / Tender (Commercial)</option>
                <option value="internal">Tim Internal Estimator (Audit & Database)</option>
              </select>
              <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: '#64748B' }}>
                Layout & detail disusun proporsional sesuai kebutuhan pihak penerima.
              </p>
            </div>
          </div>

          {/* SECTION C: GRANULAR SHEET SELECTION (CUSTOM / INSPECTION) */}
          <div
            style={{
              padding: '16px',
              borderRadius: '12px',
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={16} color="#2563EB" />
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>
                  Daftar Lembar Kerja yang Disertakan
                </span>
                <span style={{ fontSize: '11.5px', color: '#64748B' }}>
                  ({activeSheetCount} dari {ALL_EXPORT_SHEETS.length} terpilih)
                </span>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => handleSelectAllSheets(true)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    color: '#2563EB',
                    cursor: 'pointer',
                  }}
                >
                  Pilih Semua
                </button>
                <span style={{ color: '#CBD5E1' }}>•</span>
                <button
                  type="button"
                  onClick={() => handleSelectAllSheets(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    color: '#64748B',
                    cursor: 'pointer',
                  }}
                >
                  Kosongkan
                </button>
              </div>
            </div>

            {/* Sheets Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
                maxHeight: '230px',
                overflowY: 'auto',
                paddingRight: '4px',
              }}
            >
              {ALL_EXPORT_SHEETS.map((sheet) => {
                const isChecked = selectedSheets[sheet.key];
                const isBoqMc0 = sheet.key === 'boqMc0';

                return (
                  <div
                    key={sheet.key}
                    onClick={() => handleToggleSheet(sheet.key)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: isChecked ? '1px solid #BFDBFE' : '1px solid #E2E8F0',
                      background: isChecked ? '#EFF6FF' : '#F8FAFC',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}} // Handled by parent div
                      style={{ marginTop: '3px', cursor: 'pointer' }}
                    />
                    <div style={{ flexGrow: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#2563EB' }}>
                          {sheet.code}
                        </span>
                        {isBoqMc0 && (
                          <span
                            style={{
                              fontSize: '9px',
                              fontWeight: 800,
                              background: '#FEF3C7',
                              color: '#B45309',
                              padding: '0 4px',
                              borderRadius: '3px',
                            }}
                          >
                            NO-COST
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: '11.5px',
                          fontWeight: 700,
                          color: isChecked ? '#0F172A' : '#64748B',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {sheet.title}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedSheets.boqMc0 && (
              <div
                style={{
                  marginTop: '10px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: '#FEF3C7',
                  border: '1px solid #FCD34D',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '11px',
                  color: '#92400E',
                }}
              >
                <ShieldCheck size={16} />
                <span>
                  <strong>Aturan Mutlak BOQ MC-0:</strong> Lembar `07_BOQ_MC0` dirancang murni kuantitas terukur tanpa menampilkan harga satuan, jumlah harga, atau subtotal biaya.
                </span>
              </div>
            )}
          </div>

          {/* SECTION D: ADVANCED SETTINGS & SIGNATURE ACCORDION */}
          <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: '#F8FAFC',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sliders size={15} color="#64748B" />
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                  Pengaturan Lanjutan (Formula Live & Pejabat Penandatangan)
                </span>
              </div>
              <ChevronDown
                size={16}
                color="#64748B"
                style={{ transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
              />
            </button>

            {showAdvanced && (
              <div style={{ padding: '14px', background: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Live formula toggle */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#0F172A' }}>
                  <input
                    type="checkbox"
                    checked={useLiveFormulas}
                    onChange={(e) => setUseLiveFormulas(e.target.checked)}
                  />
                  <span>
                    <strong>Gunakan Formula Matematika Live Excel</strong> (Menyertakan formula aktif `=SUM()`, `=Volume*Harga`, dan pembobotan %)
                  </span>
                </label>

                {/* Signatures input */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '4px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Disusun Oleh (Estimator)
                    </label>
                    <input
                      type="text"
                      value={signatures.preparedByName}
                      onChange={(e) => setSignatures({ ...signatures, preparedByName: e.target.value })}
                      style={{
                        width: '100%',
                        height: '32px',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                        padding: '0 8px',
                        fontSize: '11.5px',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Diperiksa Oleh (Teknik)
                    </label>
                    <input
                      type="text"
                      value={signatures.checkedByName}
                      onChange={(e) => setSignatures({ ...signatures, checkedByName: e.target.value })}
                      style={{
                        width: '100%',
                        height: '32px',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                        padding: '0 8px',
                        fontSize: '11.5px',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Disetujui Oleh (Owner)
                    </label>
                    <input
                      type="text"
                      value={signatures.approvedByName}
                      onChange={(e) => setSignatures({ ...signatures, approvedByName: e.target.value })}
                      style={{
                        width: '100%',
                        height: '32px',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                        padding: '0 8px',
                        fontSize: '11.5px',
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION E: LIVE FILE PREVIEW SUMMARY */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 100%)',
              border: '1px solid #BFDBFE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: '11px', fontWeight: 750, color: '#1D4ED8', textTransform: 'uppercase' }}>
                PRATINJAU NAMA BERKAS EXPORT
              </div>
              <div style={{ fontSize: '12.5px', fontWeight: 750, color: '#0F172A', marginTop: '2px', fontFamily: 'monospace' }}>
                {previewFileName}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowStructurePreview(!showStructurePreview)}
              style={{
                background: '#FFFFFF',
                border: '1px solid #BFDBFE',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '11.5px',
                fontWeight: 700,
                color: '#2563EB',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <Eye size={13} />
              <span>{showStructurePreview ? 'Tutup Pratinjau' : 'Pratinjau Lembar Kerja'}</span>
            </button>
          </div>

          {/* Structure Tree Preview */}
          {showStructurePreview && (
            <div
              style={{
                padding: '12px',
                borderRadius: '8px',
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                fontSize: '11.5px',
              }}
            >
              <div style={{ fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                Struktur Sheet Workbook:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {activeSheetsList.map((s, idx) => (
                  <span
                    key={s.key}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: '#F1F5F9',
                      border: '1px solid #CBD5E1',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      color: '#0F172A',
                      fontWeight: 650,
                    }}
                  >
                    <span>{idx + 1}. {s.code}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ===================================================================
            3. MODAL FOOTER
           =================================================================== */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#FFFFFF',
          }}
        >
          <div style={{ fontSize: '12px', color: '#64748B' }}>
            Dokumen terformat otomatis untuk standar konsultansi & tender PUPR.
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isExporting}
              style={{
                height: '38px',
                padding: '0 16px',
                borderRadius: '8px',
                background: '#FFFFFF',
                border: '1px solid #CBD5E1',
                fontSize: '12.5px',
                fontWeight: 650,
                color: '#475569',
                cursor: 'pointer',
              }}
            >
              Batal
            </button>

            <button
              type="button"
              onClick={handleExecuteExport}
              disabled={isExporting || activeSheetCount === 0}
              style={{
                height: '38px',
                padding: '0 20px',
                borderRadius: '8px',
                background: isExporting ? '#94A3B8' : '#2563EB',
                border: '1px solid #1D4ED8',
                fontSize: '13px',
                fontWeight: 750,
                color: '#FFFFFF',
                cursor: isExporting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!isExporting) e.currentTarget.style.backgroundColor = '#1D4ED8';
              }}
              onMouseLeave={(e) => {
                if (!isExporting) e.currentTarget.style.backgroundColor = '#2563EB';
              }}
            >
              <Download size={15} color="#FFFFFF" />
              <span>
                {isExporting ? 'Membuat Dokumen...' : `Export Dokumen (${activeSheetCount} Sheet)`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
