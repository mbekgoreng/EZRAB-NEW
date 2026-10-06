import React, { useState } from 'react';
import {
  Sparkles,
  FileEdit,
  Calculator,
  Layers,
  X,
  ArrowRight,
  ChevronLeft,
} from 'lucide-react';
import { BuildingType, Project } from '../../types';

export type KickoffMethod = 'select' | 'magic_ai' | 'manual' | 'volume_calculation' | 'template';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProject: (projectData: Partial<Project>) => Project;
  onNavigateToTab: (tab: string, projectId?: string | null) => void;
  onOpenMagicAiWithPrompt?: (prompt: string) => void;
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  isOpen,
  onClose,
  onCreateProject,
  onNavigateToTab,
  onOpenMagicAiWithPrompt,
}) => {
  const [activeStep, setActiveStep] = useState<KickoffMethod>('select');

  // Manual RAB Form State
  const [manualName, setManualName] = useState('');
  const [manualClient, setManualClient] = useState('');
  const [manualLocation, setManualLocation] = useState('Jakarta Selatan');
  const [manualBuildingType, setManualBuildingType] = useState<BuildingType>('Rumah Tinggal');
  const [manualBuildingArea, setManualBuildingArea] = useState('120');
  const [manualFloorCount, setManualFloorCount] = useState('1');
  const [manualEstimatedBudget, setManualEstimatedBudget] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Magic AI Form State
  const [aiPrompt, setAiPrompt] = useState('');

  if (!isOpen) return null;

  const resetForm = () => {
    setActiveStep('select');
    setManualName('');
    setManualClient('');
    setManualLocation('Jakarta Selatan');
    setManualBuildingType('Rumah Tinggal');
    setManualBuildingArea('120');
    setManualFloorCount('1');
    setManualEstimatedBudget('');
    setAiPrompt('');
    setIsSubmitting(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // Submit Manual Project Creation
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim()) return;

    setIsSubmitting(true);
    const budgetNumber = parseFloat(manualEstimatedBudget.replace(/[^0-9]/g, '')) || 0;
    const areaNumber = parseFloat(manualBuildingArea) || 0;
    const floorsNumber = parseInt(manualFloorCount, 10) || 1;

    const newProj = onCreateProject({
      name: manualName.trim(),
      client: manualClient.trim() || 'Klien Proyek',
      clientName: manualClient.trim() || 'Klien Proyek',
      location: manualLocation.trim() || 'Indonesia',
      buildingType: manualBuildingType,
      buildingArea: areaNumber,
      floorCount: floorsNumber,
      totalRab: budgetNumber,
      creationMethod: 'manual',
      status: 'draft',
    });

    handleClose();
    // Directly guide user to Spreadsheet RAB
    onNavigateToTab('rab-estimasi', newProj.id);
  };

  // Launch Magic AI Project Pathway
  const handleMagicAiSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;

    setIsSubmitting(true);
    const newProj = onCreateProject({
      name: aiPrompt.length > 36 ? aiPrompt.substring(0, 36) + '...' : aiPrompt,
      client: 'Klien AI',
      clientName: 'Klien AI',
      location: 'Indonesia',
      buildingType: 'Rumah Tinggal',
      creationMethod: 'magic_ai',
      status: 'draft',
    });

    handleClose();
    if (onOpenMagicAiWithPrompt) {
      onOpenMagicAiWithPrompt(aiPrompt);
    } else {
      onNavigateToTab('magic-ai', newProj.id);
    }
  };

  // Launch Volume Calculation Pathway
  const handleVolumeCalcPathway = () => {
    const newProj = onCreateProject({
      name: 'Proyek Volume QTO Baru',
      client: 'Klien Proyek',
      clientName: 'Klien Proyek',
      location: 'Indonesia',
      buildingType: 'Rumah Tinggal',
      creationMethod: 'volume_calculation',
      status: 'draft',
    });

    handleClose();
    onNavigateToTab('qto-vc', newProj.id);
  };

  // Launch Template RAB Pathway
  const handleTemplatePathway = () => {
    handleClose();
    onNavigateToTab('template-rab', null);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 110,
        padding: '20px',
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: activeStep === 'select' ? '680px' : '540px',
          padding: '28px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          position: 'relative',
          transition: 'max-width 0.2s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {activeStep !== 'select' && (
              <button
                onClick={() => setActiveStep('select')}
                style={{
                  background: '#F1F5F9',
                  border: 'none',
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#475569',
                }}
                title="Kembali ke Pilihan Metode"
              >
                <ChevronLeft size={18} />
              </button>
            )}
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                {activeStep === 'select' && 'Buat Proyek Baru'}
                {activeStep === 'manual' && 'Mulai dengan Manual RAB'}
                {activeStep === 'magic_ai' && 'Mulai dengan EZRAB Magic AI'}
              </h2>
              <p style={{ fontSize: '12.5px', color: '#64748B', margin: '2px 0 0 0' }}>
                {activeStep === 'select' && 'Bagaimana Anda ingin memulai penyusunan RAB proyek ini?'}
                {activeStep === 'manual' && 'Lengkapi identitas dasar proyek dan masuki Spreadsheet RAB.'}
                {activeStep === 'magic_ai' && 'Deskripsikan proyek Anda untuk kalkulasi otomatis berbasis AHSP.'}
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '6px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* =========================================================================
            STEP 1: METHOD SELECTION (THE 4 PATHWAYS)
           ========================================================================= */}
        {activeStep === 'select' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
            {/* 1. MAGIC AI */}
            <div
              onClick={() => setActiveStep('magic_ai')}
              style={{
                background: 'linear-gradient(135deg, #F0F5FF 0%, #EEF2FF 100%)',
                border: '1.5px solid #C7D2FE',
                borderRadius: '12px',
                padding: '16px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.borderColor = '#6366F1';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = '#C7D2FE';
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Sparkles size={19} />
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 800, background: '#EEF2FF', color: '#4F46E5', padding: '2px 8px', borderRadius: '999px', border: '1px solid #C7D2FE' }}>
                    PALING CEPAT
                  </span>
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 750, color: '#1E1B4B', margin: '0 0 4px 0' }}>
                  EZRAB Magic AI
                </h3>
                <p style={{ fontSize: '12px', color: '#4338CA', lineHeight: 1.45, margin: 0 }}>
                  Generate draft RAB lengkap langsung dari prompt deskripsi, luas tanah/bangunan, atau dokumen gambar kerja.
                </p>
              </div>
              <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#4F46E5' }}>
                <span>Mulai dengan AI</span>
                <ArrowRight size={14} />
              </div>
            </div>

            {/* 2. MANUAL BUILDER */}
            <div
              onClick={() => setActiveStep('manual')}
              style={{
                background: '#ffffff',
                border: '1.5px solid #E2E8F0',
                borderRadius: '12px',
                padding: '16px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.borderColor = '#2563EB';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = '#E2E8F0';
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      background: '#EFF6FF',
                      color: '#2563EB',
                      border: '1px solid #DBEAFE',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <FileEdit size={19} />
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 700, background: '#F8FAFC', color: '#64748B', padding: '2px 8px', borderRadius: '999px', border: '1px solid #E2E8F0' }}>
                    KONTROL PENUH
                  </span>
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 750, color: '#0F172A', margin: '0 0 4px 0' }}>
                  Manual RAB Builder
                </h3>
                <p style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.45, margin: 0 }}>
                  Masukkan identitas proyek, pilih struktur pekerjaan standar, dan susun rincian item pekerjaan di Spreadsheet.
                </p>
              </div>
              <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#2563EB' }}>
                <span>Isi Form Manual</span>
                <ArrowRight size={14} />
              </div>
            </div>

            {/* 3. VOLUME CALCULATION */}
            <div
              onClick={handleVolumeCalcPathway}
              style={{
                background: '#ffffff',
                border: '1.5px solid #E2E8F0',
                borderRadius: '12px',
                padding: '16px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.borderColor = '#059669';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = '#E2E8F0';
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      background: '#ECFDF5',
                      color: '#059669',
                      border: '1px solid #A7F3D0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Calculator size={19} />
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 700, background: '#F8FAFC', color: '#64748B', padding: '2px 8px', borderRadius: '999px', border: '1px solid #E2E8F0' }}>
                    QTO PRESISI
                  </span>
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 750, color: '#0F172A', margin: '0 0 4px 0' }}>
                  Volume Calculation
                </h3>
                <p style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.45, margin: 0 }}>
                  Hitung volume pekerjaan konstruksi (beton, galian, dinding, atap) secara parametrik dan sinkronkan ke RAB.
                </p>
              </div>
              <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#059669' }}>
                <span>Buka Kalkulator</span>
                <ArrowRight size={14} />
              </div>
            </div>

            {/* 4. TEMPLATE RAB */}
            <div
              onClick={handleTemplatePathway}
              style={{
                background: '#ffffff',
                border: '1.5px solid #E2E8F0',
                borderRadius: '12px',
                padding: '16px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.borderColor = '#D97706';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = '#E2E8F0';
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      background: '#FFFBEB',
                      color: '#D97706',
                      border: '1px solid #FDE68A',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Layers size={19} />
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 700, background: '#DCFCE7', color: '#15803D', padding: '2px 8px', borderRadius: '999px' }}>
                    TYPE 36-300
                  </span>
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 750, color: '#0F172A', margin: '0 0 4px 0' }}>
                  Template RAB Bangunan
                </h3>
                <p style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.45, margin: 0 }}>
                  Pilih dari puluhan template rumah tinggal dan gedung yang sudah terisi analisa harga satuan PUPR 2026.
                </p>
              </div>
              <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#D97706' }}>
                <span>Pilih dari Katalog</span>
                <ArrowRight size={14} />
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            STEP 2A: MANUAL FORM
           ========================================================================= */}
        {activeStep === 'manual' && (
          <form onSubmit={handleManualSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 650, color: '#334155', marginBottom: '5px' }}>
                Nama Proyek *
              </label>
              <input
                type="text"
                required
                placeholder="cth. Rumah Tinggal 2 Lantai Modern"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 650, color: '#334155', marginBottom: '5px' }}>
                  Jenis Bangunan
                </label>
                <select
                  value={manualBuildingType}
                  onChange={(e) => setManualBuildingType(e.target.value as BuildingType)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    background: '#ffffff',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="Rumah Tinggal">Rumah Tinggal</option>
                  <option value="Gedung Kantor">Gedung Kantor</option>
                  <option value="Ruko / Rukan">Ruko / Rukan</option>
                  <option value="Gudang & Pabrik">Gudang & Pabrik</option>
                  <option value="Renovasi">Renovasi</option>
                  <option value="Infrastruktur">Infrastruktur (Jalan/Drainase)</option>
                  <option value="Custom">Kustom Lainnya</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 650, color: '#334155', marginBottom: '5px' }}>
                  Lokasi Proyek
                </label>
                <input
                  type="text"
                  placeholder="cth. Jakarta Selatan"
                  value={manualLocation}
                  onChange={(e) => setManualLocation(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 650, color: '#334155', marginBottom: '5px' }}>
                  Luas Bangunan (m²)
                </label>
                <input
                  type="number"
                  placeholder="120"
                  value={manualBuildingArea}
                  onChange={(e) => setManualBuildingArea(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 650, color: '#334155', marginBottom: '5px' }}>
                  Jumlah Lantai
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={manualFloorCount}
                  onChange={(e) => setManualFloorCount(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 650, color: '#334155', marginBottom: '5px' }}>
                  Nama Klien / Pemilik
                </label>
                <input
                  type="text"
                  placeholder="cth. Bpk. Hendra"
                  value={manualClient}
                  onChange={(e) => setManualClient(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 650, color: '#334155', marginBottom: '5px' }}>
                  Target Anggaran (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="cth. Rp 850.000.000"
                  value={manualEstimatedBudget}
                  onChange={(e) => setManualEstimatedBudget(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button
                type="button"
                onClick={() => setActiveStep('select')}
                style={{
                  padding: '9px 16px',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  background: '#ffffff',
                  color: '#64748B',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Kembali
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !manualName.trim()}
                style={{
                  padding: '9px 20px',
                  borderRadius: '8px',
                  background: '#2563EB',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 650,
                  cursor: isSubmitting ? 'wait' : 'pointer',
                  opacity: !manualName.trim() ? 0.6 : 1,
                }}
              >
                {isSubmitting ? 'Menyimpan...' : 'Simpan & Buka Lembar RAB →'}
              </button>
            </div>
          </form>
        )}

        {/* =========================================================================
            STEP 2B: MAGIC AI FORM
           ========================================================================= */}
        {activeStep === 'magic_ai' && (
          <form onSubmit={handleMagicAiSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#4F46E5', marginBottom: '4px' }}>
                <Sparkles size={14} />
                <span>Format Rekomendasi Prompt AI</span>
              </div>
              <p style={{ fontSize: '11.5px', color: '#64748B', margin: 0, lineHeight: 1.4 }}>
                Sebutkan tipe bangunan, luas, jumlah lantai, lokasi, dan spesifikasi khusus (contoh: pondasi tiang pancang, rangka atap baja ringan, lantai granit 60x60).
              </p>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 650, color: '#334155', marginBottom: '5px' }}>
                Deskripsi Proyek Konstruksi *
              </label>
              <textarea
                rows={4}
                required
                placeholder="cth. Hitung RAB rumah type 70 di Surabaya, 2 lantai, 3 kamar tidur, struktur beton bertulang K-250, atap baja ringan genteng keramik."
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '13px',
                  color: '#0F172A',
                  outline: 'none',
                  resize: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button
                type="button"
                onClick={() => setActiveStep('select')}
                style={{
                  padding: '9px 16px',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  background: '#ffffff',
                  color: '#64748B',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Kembali
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !aiPrompt.trim()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '9px 20px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 650,
                  cursor: isSubmitting ? 'wait' : 'pointer',
                  opacity: !aiPrompt.trim() ? 0.6 : 1,
                  boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)',
                }}
              >
                <Sparkles size={14} />
                <span>{isSubmitting ? 'Mempersiapkan...' : 'Proses dengan Magic AI →'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default CreateProjectModal;