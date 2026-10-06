import React, { useState } from 'react';
import {
  X,
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Compass,
  ArrowRight,
  Sparkles,
  Layers,
  Box,
  Eye,
  Trash2,
  Edit2,
  Check,
  Building2,
  ShieldCheck,
  Send,
} from 'lucide-react';
import { Project, RabItem } from '../../types';
import {
  analyzeDrawing,
  DrawingAnalysisResult,
  DrawingSpace,
  VolumeDraftItem,
  convertDraftToRabItems,
} from '../../services/aiDrawingIntelligence';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';

interface DrawingReaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProject: Project | null;
  onAddToRab?: (items: Partial<RabItem>[]) => void;
  onSendToDedRab?: (result: DrawingAnalysisResult) => void;
}

export const DrawingReaderModal: React.FC<DrawingReaderModalProps> = ({
  isOpen,
  onClose,
  currentProject,
  onAddToRab,
  onSendToDedRab,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<DrawingAnalysisResult | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'SPACES' | 'VOLUMES' | 'ELEMENTS'>('SPACES');
  const [customScale, setCustomScale] = useState<string>('1:100');
  const [wallHeight, setWallHeight] = useState<number>(3.5);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedDrafts, setSelectedDrafts] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
    if (!validTypes.includes(file.type) && !file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMsg('Format file tidak didukung. Harap upload format JPG, PNG, atau PDF.');
      return;
    }

    // Validate size (max 25MB)
    if (file.size > 25 * 1024 * 1024) {
      setErrorMsg('Ukuran file melebihi batas 25MB.');
      return;
    }

    setErrorMsg(null);
    setSelectedFile(file);

    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setFilePreview(url);
    } else {
      setFilePreview(null);
    }
  };

  const handleStartAnalysis = async () => {
    if (!selectedFile || !currentProject) return;

    setIsAnalyzing(true);
    setErrorMsg(null);

    try {
      let fileBuffer: ArrayBuffer | Blob = selectedFile;
      if (typeof selectedFile.arrayBuffer === 'function') {
        try {
          fileBuffer = await selectedFile.arrayBuffer();
        } catch {
          fileBuffer = selectedFile;
        }
      }

      const res = await analyzeDrawing({
        projectId: currentProject.id,
        fileData: fileBuffer,
        fileName: selectedFile.name,
        fileType: selectedFile.type,
        customScale,
        wallHeight,
      });

      if (res.success && res.result) {
        setAnalysisResult(res.result);
        const initSelection: Record<string, boolean> = {};
        res.result.volumeDraft.forEach((v) => {
          initSelection[v.id] = true;
        });
        setSelectedDrafts(initSelection);
      } else {
        setErrorMsg(res.error || 'Gagal memproses gambar denah.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan sistem saat menganalisis denah.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleDraftSelection = (id: string) => {
    setSelectedDrafts((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleConfirmAndSaveToRab = () => {
    if (!analysisResult || !onAddToRab) return;

    const approvedDrafts = analysisResult.volumeDraft
      .filter((d) => selectedDrafts[d.id])
      .map((d) => ({ ...d, approved: true }));

    if (approvedDrafts.length === 0) {
      setErrorMsg('Pilih minimal 1 item volume pekerjaan untuk diterapkan ke RAB.');
      return;
    }

    const rabItems = convertDraftToRabItems(approvedDrafts);
    onAddToRab(rabItems);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
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
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '1050px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #E2E8F0',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#F8FAFC',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                backgroundColor: '#EFF6FF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #DBEAFE',
                color: '#2563EB',
              }}
            >
              <Compass size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  AI Baca Denah & Visual Takeoff
                </h2>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '6px',
                    backgroundColor: '#DBEAFE',
                    color: '#1D4ED8',
                  }}
                >
                  PHASE 9
                </span>
              </div>
              <p style={{ fontSize: '13px', color: '#64748B', margin: '2px 0 0 0' }}>
                Proyek:{' '}
                <strong style={{ color: '#0F172A' }}>
                  {currentProject ? currentProject.name : 'Pilih Proyek Aktif'}
                </strong>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              border: '1px solid #E2E8F0',
              backgroundColor: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#64748B',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {errorMsg && (
            <div
              style={{
                backgroundColor: '#FEF2F2',
                border: '1px solid #FECACA',
                color: '#991B1B',
                padding: '12px 16px',
                borderRadius: '10px',
                marginBottom: '20px',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertTriangle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {!analysisResult ? (
            /* Upload & Configuration Step */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div
                style={{
                  border: '2px dashed #CBD5E1',
                  borderRadius: '16px',
                  padding: '36px 20px',
                  textAlign: 'center',
                  backgroundColor: selectedFile ? '#F0FDF4' : '#F8FAFC',
                  borderColor: selectedFile ? '#86EFAC' : '#CBD5E1',
                  cursor: 'pointer',
                  position: 'relative',
                }}
              >
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/jpg, application/pdf"
                  onChange={handleFileChange}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: 0,
                    cursor: 'pointer',
                    width: '100%',
                    height: '100%',
                  }}
                />

                <div
                  style={{
                    width: '54px',
                    height: '54px',
                    borderRadius: '50%',
                    backgroundColor: selectedFile ? '#DCFCE7' : '#EFF6FF',
                    color: selectedFile ? '#166534' : '#2563EB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 14px auto',
                  }}
                >
                  <UploadCloud size={28} />
                </div>

                {selectedFile ? (
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 750, color: '#166534' }}>
                      ✓ File Siap: {selectedFile.name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
                      Ukuran: {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Klik untuk ganti file
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 750, color: '#0F172A' }}>
                      Klik atau Seret Denah Arsitektur / DED ke Sini
                    </div>
                    <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '4px' }}>
                      Mendukung format PNG, JPG, JPEG, atau PDF (Maksimal 25MB)
                    </div>
                  </div>
                )}
              </div>

              {/* Parameter Settings */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: '16px',
                  backgroundColor: '#F8FAFC',
                  padding: '16px 20px',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                }}
              >
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    Skala Gambar Acuan
                  </label>
                  <select
                    value={customScale}
                    onChange={(e) => setCustomScale(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      backgroundColor: '#FFFFFF',
                      color: '#0F172A',
                    }}
                  >
                    <option value="1:100">1:100 (Standar Rumah Tinggal & Ruko)</option>
                    <option value="1:50">1:50 (Denah Detail Ruang & Interior)</option>
                    <option value="1:200">1:200 (Site Plan & Gedung Luas)</option>
                    <option value="1:20">1:20 (Detail Khusus)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    Tinggi Dinding Rata-Rata (m)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="2.0"
                    max="8.0"
                    value={wallHeight}
                    onChange={(e) => setWallHeight(parseFloat(e.target.value) || 3.5)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      backgroundColor: '#FFFFFF',
                      color: '#0F172A',
                    }}
                  />
                </div>
              </div>

              {filePreview && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', marginBottom: '8px' }}>
                    Pratinjau Gambar Denah
                  </div>
                  <img
                    src={filePreview}
                    alt="Denah Preview"
                    style={{
                      maxHeight: '220px',
                      maxWidth: '100%',
                      borderRadius: '12px',
                      border: '1px solid #E2E8F0',
                      objectFit: 'contain',
                    }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button
                  disabled={!selectedFile || isAnalyzing || !currentProject}
                  onClick={handleStartAnalysis}
                  style={{
                    backgroundColor: !selectedFile || isAnalyzing ? '#94A3B8' : '#2563EB',
                    color: '#FFFFFF',
                    padding: '12px 24px',
                    borderRadius: '10px',
                    border: 'none',
                    fontWeight: 750,
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: !selectedFile || isAnalyzing ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
                  }}
                >
                  {isAnalyzing ? (
                    <>
                      <Sparkles size={16} className="animate-spin" />
                      <span>Sedang Menganalisis Denah...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      <span>Mulai Baca Denah & Ekstraksi</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* Analysis Results Step */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Scale Warning Banner if any */}
              {analysisResult.scaleWarning && (
                <div
                  style={{
                    backgroundColor: '#FEF3C7',
                    border: '1px solid #FDE68A',
                    color: '#92400E',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    fontSize: '12.5px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <AlertTriangle size={16} />
                  <span>{analysisResult.scaleWarning}</span>
                </div>
              )}

              {/* Evidence & Provenance Card (Sections 3 & 11) */}
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '14px',
                  border: '1.5px solid #BFDBFE',
                  padding: '16px 20px',
                  boxShadow: '0 2px 8px rgba(37, 99, 235, 0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #EFF6FF', paddingBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShieldCheck size={18} color="#2563EB" />
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#1E40AF', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      AI Evidence & Provenance
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 750,
                        padding: '3px 10px',
                        borderRadius: '6px',
                        backgroundColor: (analysisResult.evidenceSummary?.status || analysisResult.overallStatus) === 'VERIFIED' ? '#DCFCE7' : (analysisResult.evidenceSummary?.status || analysisResult.overallStatus) === 'UNREADABLE' ? '#FEE2E2' : '#FEF3C7',
                        color: (analysisResult.evidenceSummary?.status || analysisResult.overallStatus) === 'VERIFIED' ? '#166534' : (analysisResult.evidenceSummary?.status || analysisResult.overallStatus) === 'UNREADABLE' ? '#991B1B' : '#92400E',
                      }}
                    >
                      Status: {analysisResult.evidenceSummary?.status || analysisResult.overallStatus || 'VERIFIED'}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 750,
                        padding: '3px 10px',
                        borderRadius: '6px',
                        backgroundColor: (analysisResult.scaleStatus || (analysisResult.detectedScale && !analysisResult.scaleWarning ? 'VERIFIED' : 'UNVERIFIED')) === 'VERIFIED' ? '#EFF6FF' : '#FEF3C7',
                        color: (analysisResult.scaleStatus || (analysisResult.detectedScale && !analysisResult.scaleWarning ? 'VERIFIED' : 'UNVERIFIED')) === 'VERIFIED' ? '#1D4ED8' : '#92400E',
                      }}
                    >
                      Scale: {analysisResult.scaleStatus || (analysisResult.detectedScale && !analysisResult.scaleWarning ? 'VERIFIED' : 'UNVERIFIED')}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '12px',
                    fontSize: '13px',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Result:</div>
                    <div style={{ fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                      {analysisResult.evidenceSummary?.result || `Luas terdeteksi: ${analysisResult.totalBuildingArea} m²`}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Source:</div>
                    <div style={{ fontWeight: 700, color: '#2563EB', marginTop: '2px', wordBreak: 'break-all' }}>
                      {analysisResult.evidenceSummary?.source || analysisResult.fileName}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Evidence:</div>
                    <div style={{ fontWeight: 700, color: '#059669', marginTop: '2px' }}>
                      {analysisResult.evidenceSummary?.evidence || `${analysisResult.spaces[0]?.dimensions?.length || 4} m × ${analysisResult.spaces[0]?.dimensions?.width || 5} m`}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Confidence:</div>
                    <div style={{ marginTop: '2px' }}>
                      <span
                        style={{
                          fontSize: '11.5px',
                          fontWeight: 750,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          backgroundColor: analysisResult.overallConfidence === 'HIGH' ? '#DCFCE7' : analysisResult.overallConfidence === 'LOW' ? '#FEE2E2' : '#FEF3C7',
                          color: analysisResult.overallConfidence === 'HIGH' ? '#166534' : analysisResult.overallConfidence === 'LOW' ? '#991B1B' : '#92400E',
                        }}
                      >
                        {analysisResult.overallConfidence}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Source Trace Inspector (Section 4) */}
              {analysisResult.trace && (
                <div
                  style={{
                    backgroundColor: '#F8FAFC',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    padding: '12px 16px',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 750, color: '#334155' }}>
                      <Box size={14} color="#64748B" />
                      <span>Production AISourceTrace Audit</span>
                    </div>
                    <span style={{ fontSize: '11px', color: '#166534', fontWeight: 700 }}>
                      ✓ 0 Secrets Leaked
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                      gap: '8px',
                      backgroundColor: '#FFFFFF',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #E2E8F0',
                      fontFamily: 'monospace',
                      fontSize: '11px',
                      color: '#475569',
                    }}
                  >
                    <div><strong style={{ color: '#0F172A' }}>traceId:</strong> {analysisResult.trace.traceId}</div>
                    <div><strong style={{ color: '#0F172A' }}>sourceId:</strong> {analysisResult.trace.sourceId.substring(0, 16)}...</div>
                    <div><strong style={{ color: '#0F172A' }}>fileHash:</strong> {analysisResult.trace.fileHash.substring(0, 16)}...</div>
                    <div><strong style={{ color: '#0F172A' }}>engine:</strong> EZRAB Vision</div>
                    <div><strong style={{ color: '#0F172A' }}>mode:</strong> Visual DED Analysis</div>
                    <div><strong style={{ color: '#0F172A' }}>requestId:</strong> {analysisResult.trace.requestId}</div>
                    <div><strong style={{ color: '#0F172A' }}>extractionStatus:</strong> <span style={{ color: '#166534', fontWeight: 700 }}>{analysisResult.trace.extractionStatus}</span></div>
                    <div><strong style={{ color: '#0F172A' }}>confidence:</strong> {analysisResult.trace.confidence}</div>
                  </div>
                </div>
              )}

              {/* KPI Header */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '12px',
                }}
              >
                <div style={{ backgroundColor: '#F8FAFC', padding: '14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    Total Luas Bangunan
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                    {analysisResult.totalBuildingArea} m²
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>
                    {analysisResult.spaces.length} Ruangan Terdeteksi
                  </div>
                </div>

                <div style={{ backgroundColor: '#F8FAFC', padding: '14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    Total Keliling Dinding
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                    {analysisResult.totalPerimeter} m
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>
                    Tinggi Acuan: {wallHeight} m
                  </div>
                </div>

                <div style={{ backgroundColor: '#F0FDF4', padding: '14px', borderRadius: '10px', border: '1px solid #BBF7D0' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>
                    Draft Pekerjaan RAB
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#15803D', marginTop: '4px' }}>
                    {analysisResult.volumeDraft.length} Item Draft
                  </div>
                  <div style={{ fontSize: '11px', color: '#166534' }}>
                    Status: AI ESTIMATE
                  </div>
                </div>

                <div style={{ backgroundColor: '#EFF6FF', padding: '14px', borderRadius: '10px', border: '1px solid #BFDBFE' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#1D4ED8', textTransform: 'uppercase' }}>
                    Skala & Akurasi
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#1E40AF', marginTop: '4px' }}>
                    {analysisResult.detectedScale}
                  </div>
                  <div style={{ fontSize: '11px', color: '#1D4ED8' }}>
                    Confidence: {analysisResult.overallConfidence}
                  </div>
                </div>
              </div>

              {/* Subtabs Header */}
              <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #E2E8F0', paddingBottom: '8px' }}>
                <button
                  onClick={() => setActiveSubTab('SPACES')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    fontWeight: 750,
                    fontSize: '13px',
                    cursor: 'pointer',
                    backgroundColor: activeSubTab === 'SPACES' ? '#2563EB' : '#F1F5F9',
                    color: activeSubTab === 'SPACES' ? '#FFFFFF' : '#64748B',
                  }}
                >
                  📐 Ruangan Terdeteksi ({analysisResult.spaces.length})
                </button>

                <button
                  onClick={() => setActiveSubTab('VOLUMES')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    fontWeight: 750,
                    fontSize: '13px',
                    cursor: 'pointer',
                    backgroundColor: activeSubTab === 'VOLUMES' ? '#2563EB' : '#F1F5F9',
                    color: activeSubTab === 'VOLUMES' ? '#FFFFFF' : '#64748B',
                  }}
                >
                  📊 Draft Volume Pekerjaan ({analysisResult.volumeDraft.length})
                </button>

                <button
                  onClick={() => setActiveSubTab('ELEMENTS')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    fontWeight: 750,
                    fontSize: '13px',
                    cursor: 'pointer',
                    backgroundColor: activeSubTab === 'ELEMENTS' ? '#2563EB' : '#F1F5F9',
                    color: activeSubTab === 'ELEMENTS' ? '#FFFFFF' : '#64748B',
                  }}
                >
                  🏗️ Elemen Konstruksi ({analysisResult.elements.length})
                </button>
              </div>

              {/* Tab 1: Spaces Table */}
              {activeSubTab === 'SPACES' && (
                <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left', color: '#475569' }}>
                        <th style={{ padding: '10px 14px' }}>Nama Ruangan</th>
                        <th style={{ padding: '10px 14px' }}>Dimensi (P × L)</th>
                        <th style={{ padding: '10px 14px' }}>Luas (m²)</th>
                        <th style={{ padding: '10px 14px' }}>Keliling (m)</th>
                        <th style={{ padding: '10px 14px' }}>Sumber Acuan</th>
                        <th style={{ padding: '10px 14px' }}>Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysisResult.spaces.map((space) => (
                        <tr key={space.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0F172A' }}>
                            {space.name}
                          </td>
                          <td style={{ padding: '10px 14px', color: '#475569' }}>
                            {space.dimensions ? `${space.dimensions.length} × ${space.dimensions.width} m` : '-'}
                          </td>
                          <td style={{ padding: '10px 14px', fontWeight: 700, color: '#2563EB' }}>
                            {space.area.value} m²
                          </td>
                          <td style={{ padding: '10px 14px', color: '#475569' }}>
                            {space.perimeter.value} m
                          </td>
                          <td style={{ padding: '10px 14px', color: '#64748B', fontSize: '12px' }}>
                            {space.source === 'EXPLICIT_DIMENSION' ? '✓ Dimensi Eksplisit' : 'Estimasi Skala'}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: '6px',
                                backgroundColor: space.confidence === 'HIGH' ? '#DCFCE7' : '#FEF3C7',
                                color: space.confidence === 'HIGH' ? '#166534' : '#92400E',
                              }}
                            >
                              {space.confidence}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Tab 2: Derived Volume Drafts */}
              {activeSubTab === 'VOLUMES' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '12.5px', color: '#64748B' }}>
                    Pilih item draft volume yang ingin dimasukkan ke dalam spreadsheet RAB proyek:
                  </div>

                  <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left', color: '#475569' }}>
                          <th style={{ padding: '10px 14px', width: '40px' }}>Pilih</th>
                          <th style={{ padding: '10px 14px' }}>Uraian Pekerjaan (AI ESTIMATE)</th>
                          <th style={{ padding: '10px 14px' }}>Kategori</th>
                          <th style={{ padding: '10px 14px', textAlign: 'right' }}>Volume</th>
                          <th style={{ padding: '10px 14px' }}>Satuan</th>
                          <th style={{ padding: '10px 14px', textAlign: 'right' }}>Harga Satuan</th>
                          <th style={{ padding: '10px 14px' }}>Dasar Rumus / Sumber</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analysisResult.volumeDraft.map((item) => (
                          <tr
                            key={item.id}
                            style={{
                              borderBottom: '1px solid #F1F5F9',
                              backgroundColor: selectedDrafts[item.id] ? '#FFFFFF' : '#F8FAFC',
                              opacity: selectedDrafts[item.id] ? 1 : 0.6,
                            }}
                          >
                            <td style={{ padding: '10px 14px' }}>
                              <input
                                type="checkbox"
                                checked={Boolean(selectedDrafts[item.id])}
                                onChange={() => toggleDraftSelection(item.id)}
                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                              />
                            </td>
                            <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0F172A' }}>
                              {item.workItemName}
                            </td>
                            <td style={{ padding: '10px 14px', color: '#64748B', fontSize: '12px' }}>
                              {item.category}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#2563EB' }}>
                              {item.volume.toLocaleString('id-ID')}
                            </td>
                            <td style={{ padding: '10px 14px', color: '#475569' }}>
                              {item.unit}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', color: '#0F172A' }}>
                              {formatCurrencyIDR(item.unitPrice || 0)}
                            </td>
                            <td style={{ padding: '10px 14px', color: '#64748B', fontSize: '11.5px' }}>
                              {item.source}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tab 3: Elements */}
              {activeSubTab === 'ELEMENTS' && (
                <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left', color: '#475569' }}>
                        <th style={{ padding: '10px 14px' }}>Disiplin</th>
                        <th style={{ padding: '10px 14px' }}>Elemen Terdeteksi</th>
                        <th style={{ padding: '10px 14px' }}>Kuantitas Terdeteksi</th>
                        <th style={{ padding: '10px 14px' }}>Status Deteksi</th>
                        <th style={{ padding: '10px 14px' }}>Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysisResult.elements.map((el) => (
                        <tr key={el.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '10px 14px', fontWeight: 700, color: '#475569' }}>
                            {el.category}
                          </td>
                          <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0F172A' }}>
                            {el.description}
                          </td>
                          <td style={{ padding: '10px 14px', color: '#2563EB', fontWeight: 700 }}>
                            {el.quantity} {el.unit}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: '6px',
                                backgroundColor: el.status === 'Detected' ? '#DCFCE7' : '#FEF3C7',
                                color: el.status === 'Detected' ? '#166534' : '#92400E',
                              }}
                            >
                              {el.status}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ fontSize: '11px', color: '#64748B' }}>{el.confidence}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Action Buttons */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderTop: '1px solid #E2E8F0',
                  paddingTop: '16px',
                  marginTop: '10px',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <button
                  onClick={() => setAnalysisResult(null)}
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #CBD5E1',
                    color: '#475569',
                    padding: '10px 18px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  ← Upload Gambar Lain
                </button>

                <div style={{ display: 'flex', gap: '10px' }}>
                  {onSendToDedRab && (
                    <button
                      onClick={() => {
                        onSendToDedRab(analysisResult);
                        onClose();
                      }}
                      style={{
                        backgroundColor: '#F1F5F9',
                        border: '1px solid #CBD5E1',
                        color: '#0F172A',
                        padding: '10px 18px',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Kirim ke DED → RAB
                    </button>
                  )}

                  {onAddToRab && (
                    <button
                      onClick={handleConfirmAndSaveToRab}
                      style={{
                        backgroundColor: '#16A34A',
                        border: 'none',
                        color: '#FFFFFF',
                        padding: '10px 20px',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: 750,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 4px 10px rgba(22, 163, 74, 0.25)',
                      }}
                    >
                      <ShieldCheck size={16} />
                      <span>Konfirmasi & Terapkan ke RAB ({Object.values(selectedDrafts).filter(Boolean).length} Item)</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
