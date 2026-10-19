import React, { useState, useMemo, useEffect } from 'react';
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
import { brandingClient, WorkspaceBranding } from '../../services/brandingClient';
import { CompanyBrandingModal } from '../branding/CompanyBrandingModal';

interface ExportProjectPackageModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProject: Project;
  company?: Company;
  workspaceId?: string;
  onToast?: (message: string) => void;
}

export const ExportProjectPackageModal: React.FC<ExportProjectPackageModalProps> = ({
  isOpen,
  onClose,
  currentProject,
  company,
  workspaceId,
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
  // P0-B: signature fields start EMPTY — never pre-fill with fabricated names.
  // The branding modal effect above fills these from real branding when available.
  // approvedByName uses the project's real client when known.
  const [signatures, setSignatures] = useState({
    preparedByName: '',
    checkedByName: '',
    approvedByName: (currentProject as any).client || currentProject.clientName || '',
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

  const [brandingModalOpen, setBrandingModalOpen] = useState(false);
  const [workspaceBranding, setWorkspaceBranding] = useState<WorkspaceBranding | null>(null);

  useEffect(() => {
    if (isOpen) {
      brandingClient.getBranding(workspaceId || 'ws-default-ezrab').then((b) => {
        setWorkspaceBranding(b);
        if (b.leadEstimatorName && !signatures.preparedByName) {
          setSignatures((prev) => ({ ...prev, preparedByName: b.leadEstimatorName }));
        }
        if (b.directorName && !signatures.checkedByName) {
          setSignatures((prev) => ({ ...prev, checkedByName: b.directorName }));
        }
      });
    }
  }, [isOpen, workspaceId]);

  const effectiveCompany: Company = useMemo(() => {
    // P0-B: rantai fallback memakai data branding/profil nyata. Jika tidak ada,
    // kosongkan — JANGAN tampilkan identitas contoh sebagai identitas pengguna.
    if (workspaceBranding) {
      return {
        id: company?.id || 'comp-1',
        name: workspaceBranding.companyName || company?.name || '',
        address: workspaceBranding.address || company?.address || '',
        phone: workspaceBranding.phone || company?.phone || '',
        email: workspaceBranding.email || company?.email || '',
        website: workspaceBranding.website || company?.website || '',
        taxNumber: workspaceBranding.taxNumber || company?.taxNumber || '',
        leadEstimatorName: signatures.preparedByName || workspaceBranding.leadEstimatorName || '',
        directorName: signatures.checkedByName || workspaceBranding.directorName || '',
        logo: workspaceBranding.logoUrl || company?.logo || '',
        defaultOverheadPercent: company?.defaultOverheadPercent || 5,
        defaultProfitPercent: company?.defaultProfitPercent || 10,
        defaultContingencyPercent: company?.defaultContingencyPercent || 0,
        defaultTaxPercent: company?.defaultTaxPercent || 11,
      };
    }

    return (
      company || {
        id: 'comp-1',
        name: '',
        address: '',
        phone: '',
        email: '',
        website: '',
        taxNumber: '',
        leadEstimatorName: signatures.preparedByName,
        directorName: signatures.checkedByName,
        logo: '',
        defaultOverheadPercent: 5,
        defaultProfitPercent: 10,
        defaultContingencyPercent: 0,
        defaultTaxPercent: 11,
      }
    );
  }, [company, signatures, workspaceBranding]);

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
        await exportProjectToPDF(currentProject, effectiveCompany, {
          subscriptionPlan: workspaceBranding?.subscriptionPlan || 'free',
          isWatermarkRequired: workspaceBranding?.isWatermarkRequired ?? true,
          companyLogoUrl: workspaceBranding?.logoUrl,
          leadEstimatorName: signatures.preparedByName,
          directorName: signatures.checkedByName,
          clientApproverName: signatures.approvedByName,
          documentNumberOverride: (currentProject as any).projectNumber,
          revisionOverride: currentProject.currentVersion,
        });
      }

      const formatMsg =
        exportFormat === 'both'
          ? 'Paket Excel (.xlsx) & PDF Resmi berhasil dibuat dan diunduh!'
          : exportFormat === 'pdf'
          ? 'Dokumen PDF Resmi berhasil diexport dan diunduh!'
          : `Buku Kerja Excel (${activeSheetCount} sheet) berhasil diexport!`;

      onToast?.(formatMsg);
      onClose();
    } catch (err: any) {
      console.error('[Export Error]:', err);
      onToast?.(`Gagal mengekspor: ${err?.message || 'Silakan periksa data proyek dan coba lagi.'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDirectPdfExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await exportProjectToPDF(currentProject, effectiveCompany, {
        subscriptionPlan: workspaceBranding?.subscriptionPlan || 'free',
        isWatermarkRequired: workspaceBranding?.isWatermarkRequired ?? true,
        companyLogoUrl: workspaceBranding?.logoUrl,
        leadEstimatorName: signatures.preparedByName,
        directorName: signatures.checkedByName,
        clientApproverName: signatures.approvedByName,
        documentNumberOverride: (currentProject as any).projectNumber,
        revisionOverride: currentProject.currentVersion,
      });
      onToast?.('Dokumen PDF Resmi RAB berhasil dibuat dan diunduh!');
      onClose();
    } catch (err: any) {
      console.error('[Direct PDF Export Error]:', err);
      onToast?.(`Gagal membuat PDF: ${err?.message || 'Silakan coba lagi.'}`);
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
          backgroundColor: 'var(--ez-color-surface)',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid var(--ez-color-border-line)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ===================================================================
            1. MODAL HEADER
           =================================================================== */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--ez-color-border-line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(180deg, #FFFFFF 0%, var(--ez-hue-slate-bg) 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                backgroundColor: 'var(--ez-hue-blue-bg)',
                border: '1px solid var(--ez-hue-blue-bg-deep)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--ez-color-primary)',
              }}
            >
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: 'var(--ez-color-text-primary)' }}>
                  Ekspor Dokumen Proyek
                </h3>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 'var(--ez-radius-pill)',
                    backgroundColor: 'var(--ez-hue-blue-bg)',
                    color: 'var(--ez-color-primary)',
                    border: '1px solid var(--ez-hue-blue-border)',
                  }}
                >
                  {currentProject.currentVersion || 'Rev 00'}
                </span>
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: '12.5px', color: 'var(--ez-color-text-muted)' }}>
                {currentProject.name} • {currentProject.location || 'Indonesia'}
              </p>
            </div>
          </div>

          {/* P0-B: peringatan jujur bila identitas perusahaan belum diisi —
              dokumen resmi tidak boleh memakai nama/NPWP contoh. */}
          {!effectiveCompany.name && (
            <div style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '8px', background: 'var(--ez-hue-amber-bg)', border: '1px solid var(--ez-hue-amber-border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Info size={14} color="var(--ez-hue-amber-text)" />
              <span style={{ fontSize: '12px', color: 'var(--ez-hue-amber-text)', flex: 1 }}>
                Lengkapi identitas perusahaan agar kop dokumen valid.
              </span>
              <button
                type="button"
                onClick={() => setBrandingModalOpen(true)}
                style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ez-color-primary)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Lengkapi
              </button>
            </div>
          )}

          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: 'var(--ez-color-surface-tertiary)',
              color: 'var(--ez-color-text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--ez-color-border-line)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--ez-color-surface-tertiary)')}
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
              <label style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ez-color-text-slate)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                PILIH PRESET PAKET RESMI (QUICK PRESETS)
              </label>
              <span style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)' }}>
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
                        ? 'var(--ez-hue-blue-bg)'
                        : 'var(--ez-color-surface)',
                      border: isSelected
                        ? '2px solid #2563EB'
                        : isMc0
                        ? '1px solid #FCD34D'
                        : '1px solid var(--ez-color-border-line)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.borderColor = 'var(--ez-color-border)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.borderColor = isMc0 ? '#FCD34D' : 'var(--ez-color-border)';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 800,
                          padding: '1px 6px',
                          borderRadius: '4px',
                          background: isMc0 ? 'var(--ez-hue-amber-bg-deep)' : isComplete ? 'var(--ez-hue-green-bg-deep)' : isSelected ? 'var(--ez-hue-blue-bg-deep)' : 'var(--ez-color-surface-tertiary)',
                          color: isMc0 ? 'var(--ez-hue-amber-text)' : isComplete ? 'var(--ez-hue-green-text)' : isSelected ? 'var(--ez-color-primary-hover)' : 'var(--ez-color-text-muted)',
                        }}
                      >
                        {p.badge}
                      </span>
                      {isSelected && <Check size={14} color="var(--ez-hue-blue-text)" strokeWidth={3} />}
                    </div>

                    <div style={{ fontSize: '13px', fontWeight: 750, color: 'var(--ez-color-text-primary)', marginTop: '2px' }}>
                      {p.name}
                    </div>

                    <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', lineHeight: 1.3, minHeight: '28px' }}>
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
                background: 'var(--ez-color-surface-secondary)',
                border: '1px solid var(--ez-color-border-line)',
              }}
            >
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 750, color: 'var(--ez-color-text-body)', marginBottom: '8px' }}>
                Format Dokumen
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[
                  { id: 'excel', label: 'Excel', icon: FileSpreadsheet, desc: 'File .xlsx dengan formula aktif, dapat diedit' },
                  { id: 'pdf', label: 'PDF', icon: FileText, desc: 'Dokumen siap cetak dengan kop resmi' },
                  { id: 'both', label: 'Excel + PDF', icon: FolderArchive, desc: 'Kedua format dalam satu paket' },
                ].map(({ id, label, icon: Icon, desc }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setExportFormat(id as ExportFormat)}
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: exportFormat === id ? '2px solid #2563EB' : '1px solid var(--ez-hue-slate-border)',
                      background: exportFormat === id ? 'var(--ez-color-surface)' : 'var(--ez-color-surface-secondary)',
                      color: exportFormat === id ? 'var(--ez-color-primary)' : 'var(--ez-color-text-slate)',
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
                    <span style={{ fontSize: '9.5px', color: 'var(--ez-color-text-muted)' }}>{desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Target Audience */}
            <div
              style={{
                padding: '14px',
                borderRadius: '10px',
                background: 'var(--ez-color-surface-secondary)',
                border: '1px solid var(--ez-color-border-line)',
              }}
            >
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 750, color: 'var(--ez-color-text-body)', marginBottom: '8px' }}>
                Peruntukan Dokumen
              </label>
              <select
                value={selectedAudience}
                onChange={(e) => setSelectedAudience(e.target.value as ExportAudience)}
                style={{
                  width: '100%',
                  height: '36px',
                  borderRadius: '8px',
                  border: '1px solid var(--ez-hue-slate-border)',
                  background: 'var(--ez-color-surface)',
                  padding: '0 10px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  color: 'var(--ez-color-text-primary)',
                  outline: 'none',
                }}
              >
                <option value="all">Semua Pihak (Universal Presentation)</option>
                <option value="owner">Pemilik Proyek / Klien (Executive Summary)</option>
                <option value="consultant">Konsultan Perencana / MK (Technical Evaluation)</option>
                <option value="contractor">Kontraktor Pelaksana / Tender (Commercial)</option>
                <option value="internal">Tim Internal Estimator (Audit & Database)</option>
              </select>
              <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: 'var(--ez-color-text-muted)' }}>
                Layout & detail disusun proporsional sesuai kebutuhan pihak penerima.
              </p>
            </div>
          </div>

          {/* BRANDING & SUBSCRIPTION STATUS CARD */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '10px',
              background: workspaceBranding?.canUploadLogo ? 'var(--ez-hue-green-bg)' : 'var(--ez-hue-amber-bg)',
              border: `1px solid ${workspaceBranding?.canUploadLogo ? 'var(--ez-hue-green-border)' : 'var(--ez-hue-amber-border)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Building size={18} color={workspaceBranding?.canUploadLogo ? '#16A34A' : '#D97706'} />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>
                    Kop Dokumen: {effectiveCompany.name}
                  </span>
                  <span
                    style={{
                      fontSize: '9.5px',
                      fontWeight: 800,
                      padding: '1px 6px',
                      borderRadius: '4px',
                      background: workspaceBranding?.canUploadLogo ? 'var(--ez-hue-green-bg-deep)' : 'var(--ez-hue-amber-bg-deep)',
                      color: workspaceBranding?.canUploadLogo ? 'var(--ez-hue-green-text)' : 'var(--ez-hue-amber-text)',
                    }}
                  >
                    {workspaceBranding?.canUploadLogo ? 'PAID • BEBAS WATERMARK' : 'FREE • WATERMARK EZRAB WAJIB'}
                  </span>
                </div>
                <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--ez-color-text-muted)' }}>
                  {workspaceBranding?.canUploadLogo
                    ? (effectiveCompany.logo ? 'Logo perusahaan kustom aktif pada seluruh halaman.' : 'Belum ada logo kustom, fallback logo resmi EZRAB aktif.')
                    : 'Watermark resmi EZRAB tertanam pada setiap halaman PDF (Lisensi Free/Trial).'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setBrandingModalOpen(true)}
              style={{
                height: '32px',
                padding: '0 12px',
                borderRadius: '6px',
                border: '1px solid var(--ez-hue-slate-border)',
                background: 'var(--ez-color-surface)',
                fontSize: '11.5px',
                fontWeight: 600,
                color: 'var(--ez-color-text-body)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <Sparkles size={13} color="var(--ez-hue-blue-text)" />
              <span>Atur Profil & Logo Perusahaan</span>
            </button>
          </div>

          {/* SECTION C: GRANULAR SHEET SELECTION (CUSTOM / INSPECTION) */}
          <div
            style={{
              padding: '16px',
              borderRadius: 'var(--ez-radius-control)',
              background: 'var(--ez-color-surface)',
              border: '1px solid var(--ez-color-border-line)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={16} color="var(--ez-hue-blue-text)" />
                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ez-color-text-primary)' }}>
                  Daftar Lembar Kerja yang Disertakan
                </span>
                <span style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)' }}>
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
                    color: 'var(--ez-color-primary)',
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
                    color: 'var(--ez-color-text-muted)',
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
                      border: isChecked ? '1px solid var(--ez-hue-blue-border)' : '1px solid var(--ez-color-border-line)',
                      background: isChecked ? 'var(--ez-hue-blue-bg)' : 'var(--ez-color-surface-secondary)',
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
                        {isBoqMc0 && (
                          <span
                            style={{
                              fontSize: '9px',
                              fontWeight: 800,
                              background: 'var(--ez-hue-amber-bg-deep)',
                              color: 'var(--ez-hue-amber-text)',
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
                          color: isChecked ? 'var(--ez-color-text-primary)' : 'var(--ez-color-text-muted)',
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
                  background: 'var(--ez-hue-amber-bg-deep)',
                  border: '1px solid #FCD34D',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '11px',
                  color: 'var(--ez-hue-amber-text-dark)',
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
          <div style={{ border: '1px solid var(--ez-color-border-line)', borderRadius: '10px', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: 'var(--ez-color-surface-secondary)',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sliders size={15} color="#64748B" />
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ez-color-text-body)' }}>
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
              <div style={{ padding: '14px', background: 'var(--ez-color-surface)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Live formula toggle */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--ez-color-text-primary)' }}>
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
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--ez-color-text-slate)', marginBottom: '4px' }}>
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
                        border: '1px solid var(--ez-hue-slate-border)',
                        padding: '0 8px',
                        fontSize: '11.5px',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--ez-color-text-slate)', marginBottom: '4px' }}>
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
                        border: '1px solid var(--ez-hue-slate-border)',
                        padding: '0 8px',
                        fontSize: '11.5px',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--ez-color-text-slate)', marginBottom: '4px' }}>
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
                        border: '1px solid var(--ez-hue-slate-border)',
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
              background: 'linear-gradient(135deg, var(--ez-hue-slate-bg) 0%, var(--ez-hue-blue-bg) 100%)',
              border: '1px solid var(--ez-hue-blue-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: '11px', fontWeight: 750, color: 'var(--ez-color-primary-hover)', textTransform: 'uppercase' }}>
                PRATINJAU NAMA BERKAS EXPORT
              </div>
              <div style={{ fontSize: '12.5px', fontWeight: 750, color: 'var(--ez-color-text-primary)', marginTop: '2px', fontFamily: 'monospace' }}>
                {previewFileName}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowStructurePreview(!showStructurePreview)}
              style={{
                background: 'var(--ez-color-surface)',
                border: '1px solid var(--ez-hue-blue-border)',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '11.5px',
                fontWeight: 700,
                color: 'var(--ez-color-primary)',
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
                background: 'var(--ez-color-surface)',
                border: '1px solid var(--ez-color-border-line)',
                fontSize: '11.5px',
              }}
            >
              <div style={{ fontWeight: 800, color: 'var(--ez-color-text-body)', marginBottom: '6px' }}>
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
                      background: 'var(--ez-color-surface-tertiary)',
                      border: '1px solid var(--ez-hue-slate-border)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      color: 'var(--ez-color-text-primary)',
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
            borderTop: '1px solid var(--ez-color-border-line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--ez-color-surface)',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)' }}>
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
                background: 'var(--ez-color-surface)',
                border: '1px solid var(--ez-hue-slate-border)',
                fontSize: '12.5px',
                fontWeight: 650,
                color: 'var(--ez-color-text-slate)',
                cursor: 'pointer',
              }}
            >
              Batal
            </button>

            <button
              type="button"
              onClick={handleDirectPdfExport}
              disabled={isExporting}
              title="Langsung unduh PDF tanpa memilih sheet"
              style={{
                height: '38px',
                padding: '0 14px',
                borderRadius: '8px',
                background: 'transparent',
                border: '1px solid var(--ez-color-border-line)',
                fontSize: '12.5px',
                fontWeight: 600,
                color: 'var(--ez-color-text-muted)',
                cursor: isExporting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <FileText size={14} />
              <span>PDF Cepat</span>
            </button>

            <button
              type="button"
              onClick={handleExecuteExport}
              disabled={isExporting || activeSheetCount === 0}
              style={{
                height: '38px',
                padding: '0 20px',
                borderRadius: '8px',
                background: isExporting ? '#94A3B8' : 'var(--ez-color-primary)',
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
                if (!isExporting) e.currentTarget.style.backgroundColor = 'var(--ez-color-primary-hover)';
              }}
              onMouseLeave={(e) => {
                if (!isExporting) e.currentTarget.style.backgroundColor = 'var(--ez-color-primary)';
              }}
            >
              <Download size={15} color="#FFFFFF" />
              <span>
                {isExporting ? 'Membuat Dokumen...' : `Ekspor (${activeSheetCount} Lembar)`}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Corporate Branding & Logo Settings Modal */}
      <CompanyBrandingModal
        isOpen={brandingModalOpen}
        onClose={() => setBrandingModalOpen(false)}
        workspaceId={workspaceId}
        onBrandingUpdated={(updated) => setWorkspaceBranding(updated)}
      />
    </div>
  );
};
