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
import { useI18n } from '../../i18n/I18nContext';
import {
  extractProjectCreationIntent,
  decideMagicAiProjectAction,
  decideVolumeCalcProjectAction,
  claimMagicAiSubmission,
  bindMagicAiSubmission,
} from '../../ai-tools/ezrab-ai/projectCreationIntent';
import { structuredAiError } from '../../ai-tools/ezrab-ai/aiErrorCodes';

export type KickoffMethod = 'select' | 'magic_ai' | 'manual' | 'volume_calculation' | 'template';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProject: (projectData: Partial<Project>) => Project;
  onNavigateToTab: (tab: string, projectId?: string | null) => void;
  onOpenMagicAiWithPrompt?: (prompt: string, projectId: string, projectName: string) => void;
  /**
   * Proyek aktif saat ini (untuk keputusan pembuatan Magic AI §5.3):
   * bila ada, prompt Magic AI secara default dilanjutkan ke proyek
   * aktif — tidak diam-diam membuat proyek baru.
   */
  activeProject?: { id: string; name: string } | null;
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  isOpen,
  onClose,
  onCreateProject,
  onNavigateToTab,
  onOpenMagicAiWithPrompt,
  activeProject,
}) => {
  const { t } = useI18n();
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
  // Keputusan proyek aktif untuk Magic AI (§5.3): tampilkan pilihan
  // lanjut-proyek-aktif vs buat-baru sebelum membuat apa pun.
  const [magicAskChoice, setMagicAskChoice] = useState(false);
  const [magicError, setMagicError] = useState<string | null>(null);

  // Volume Calculation Form State (D-28, Batch F): klik kartu Volume
  // TIDAK LAGI membuat proyek diam-diam — pengguna menamai proyeknya
  // (atau memakai ulang proyek aktif) sebelum ada proyek yang dibuat.
  const [volumeName, setVolumeName] = useState('');
  const [volumeAskChoice, setVolumeAskChoice] = useState(false);
  const [volumeError, setVolumeError] = useState<string | null>(null);

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
    setMagicAskChoice(false);
    setMagicError(null);
    setVolumeName('');
    setVolumeAskChoice(false);
    setVolumeError(null);
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
      // D-85 (Batch G2): anggaran perkiraan disimpan sebagai
      // estimatedBudget — BUKAN totalRab. Menulis budget ke totalRab
      // membuat proyek kosong tampil seolah sudah punya nilai RAB
      // terhitung (salah satu dari 3 penulis cache totalRab yang
      // semantiknya bertabrakan). totalRab proyek baru tetap 0 sampai
      // mesin kanonis menghitungnya dari item RAB.
      estimatedBudget: budgetNumber,
      creationMethod: 'manual',
      status: 'draft',
    });

    handleClose();
    // Directly guide user to Spreadsheet RAB
    onNavigateToTab('rab-estimasi', newProj.id);
  };

  /** Buat proyek BARU dari metadata hasil ekstraksi intent (idempoten). */
  const proceedMagicCreate = (aiPrompt: string) => {
    const prompt = aiPrompt;
    // Idempotensi: submit ganda/retry atas prompt yang sama dalam TTL
    // memakai ulang proyek yang sudah dibuat, tidak membuat duplikat.
    const claim = claimMagicAiSubmission(prompt);
    if (claim.duplicate && claim.projectId) {
      handleClose();
      if (onOpenMagicAiWithPrompt) {
        // R1: teruskan ID proyek yang sudah terikat ke submit ini.
        onOpenMagicAiWithPrompt(
          prompt,
          claim.projectId,
          activeProject?.id === claim.projectId ? activeProject.name : prompt,
        );
      } else {
        onNavigateToTab('magic-ai', claim.projectId);
      }
      return;
    }
    const intent = extractProjectCreationIntent(prompt);
    // Hanya field yang BENAR-BENAR diketahui dari prompt yang ditulis.
    // Field tak diketahui dibiarkan kosong agar default aman kanonis
    // createProject yang berlaku — tidak ada "Klien AI", lokasi, atau
    // tipe bangunan yang dikarang di jalur Magic AI.
    const data: Partial<Project> = {
      creationMethod: 'magic_ai',
      status: 'draft',
    };
    const name = intent.explicitName ?? intent.descriptiveName;
    if (name) data.name = name;
    if (intent.buildingType) data.buildingType = intent.buildingType;
    if (intent.location) data.location = intent.location;
    if (intent.clientName) {
      data.client = intent.clientName;
      data.clientName = intent.clientName;
    }
    if (intent.landAreaM2 != null) data.landArea = intent.landAreaM2;
    if (intent.buildingAreaM2 != null) data.buildingArea = intent.buildingAreaM2;
    if (intent.floors != null) data.floorCount = intent.floors;

    let newProj: Project;
    try {
      newProj = onCreateProject(data);
    } catch {
      setMagicError(structuredAiError('PROJECT_CREATION_FAILED').message);
      setIsSubmitting(false);
      return;
    }
    bindMagicAiSubmission(claim.key, newProj.id);
    handleClose();
    if (onOpenMagicAiWithPrompt) {
      // R1: teruskan ID + nama proyek BARU ke handler — handler tidak boleh
      // menebak dari proyek aktif lama (closure render sebelum pembuatan).
      onOpenMagicAiWithPrompt(aiPrompt, newProj.id, newProj.name);
    } else {
      onNavigateToTab('magic-ai', newProj.id);
    }
  };

  /** Lanjutkan prompt ke proyek AKTIF (tanpa membuat proyek baru). */
  const proceedMagicReuseActive = () => {
    if (!activeProject) return;
    handleClose();
    if (onOpenMagicAiWithPrompt) {
      onOpenMagicAiWithPrompt(aiPrompt.trim(), activeProject.id, activeProject.name);
    } else {
      onNavigateToTab('magic-ai', activeProject.id);
    }
  };

  // Launch Magic AI Project Pathway
  const handleMagicAiSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim() || isSubmitting) return;
    setMagicError(null);
    const intent = extractProjectCreationIntent(aiPrompt);
    const action = decideMagicAiProjectAction({
      hasActiveProject: !!activeProject,
      explicitNewProject: intent.explicitNewProject,
    });
    if (action === 'ask') {
      // Ada proyek aktif & prompt tidak eksplisit meminta proyek baru:
      // tanya dulu — pilihan yang ditonjolkan adalah memakai ulang
      // proyek aktif (default §5.3), bukan membuat proyek baru diam-diam.
      setMagicAskChoice(true);
      return;
    }
    setIsSubmitting(true);
    proceedMagicCreate(aiPrompt.trim());
  };

  // Launch Volume Calculation Pathway (D-28, Batch F): klik kartu HANYA
  // membuka langkah penamaan/pilihan — TIDAK membuat proyek. Pembuatan
  // terjadi di handleVolumeSubmit (sesudah pengguna menamai proyek dan
  // menekan konfirmasi) atau tidak sama sekali bila pengguna memilih
  // memakai ulang proyek aktif / membatalkan. Pola ask-nya mencerminkan
  // Magic AI (§5.3): bila ada proyek aktif, pilihan yang ditonjolkan
  // adalah memakai ulang proyek aktif (konteks QTO terjaga), bukan
  // membuat proyek baru diam-diam.
  const handleVolumeCalcPathway = () => {
    const action = decideVolumeCalcProjectAction({ hasActiveProject: !!activeProject });
    setVolumeAskChoice(action === 'ask');
    setVolumeError(null);
    setActiveStep('volume_calculation');
  };

  /** Lanjutkan kalkulasi volume ke proyek AKTIF (tanpa membuat proyek baru). */
  const proceedVolumeReuseActive = () => {
    if (!activeProject) return;
    handleClose();
    onNavigateToTab('qto-vc', activeProject.id);
  };

  // Buat proyek volume BARU dari nama yang dimasukkan pengguna.
  const handleVolumeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!volumeName.trim() || isSubmitting) return;
    setVolumeError(null);
    setIsSubmitting(true);
    let newProj;
    try {
      newProj = onCreateProject({
        name: volumeName.trim(),
        client: 'Klien Proyek',
        clientName: 'Klien Proyek',
        location: 'Indonesia',
        buildingType: 'Rumah Tinggal',
        creationMethod: 'volume_calculation',
        status: 'draft',
      });
    } catch {
      setVolumeError(structuredAiError('PROJECT_CREATION_FAILED').message);
      setIsSubmitting(false);
      return;
    }
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
          background: 'var(--ez-color-surface)',
          borderRadius: 'var(--ez-radius-card)',
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
                  background: 'var(--ez-color-surface-tertiary)',
                  border: 'none',
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'var(--ez-color-text-slate)',
                }}
                title={t('proj.create.back_title')}
              >
                <ChevronLeft size={18} />
              </button>
            )}
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: 0 }}>
                {activeStep === 'select' && t('proj.create.title_select')}
                {activeStep === 'manual' && t('proj.create.title_manual')}
                {activeStep === 'magic_ai' && t('proj.create.title_ai')}
                {activeStep === 'volume_calculation' && t('proj.create.title_volume')}
              </h2>
              <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', margin: '2px 0 0 0' }}>
                {activeStep === 'select' && t('proj.create.sub_select')}
                {activeStep === 'manual' && t('proj.create.sub_manual')}
                {activeStep === 'magic_ai' && t('proj.create.sub_ai')}
                {activeStep === 'volume_calculation' && t('proj.create.sub_volume')}
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
              borderRadius: 'var(--ez-radius-chip)',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* =========================================================================
            STEP 1: METHOD SELECTION (THE 4 PATHWAYS)
           ========================================================================= */}
        {activeStep === 'select' && (
          <div data-tutorial="proyek-method" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
            {/* 1. MAGIC AI */}
            <div
              onClick={() => setActiveStep('magic_ai')}
              style={{
                background: 'var(--ez-pastel-sky)',
                border: '1.5px solid var(--ez-hue-blue-border)',
                borderRadius: 'var(--ez-radius-control)',
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
                e.currentTarget.style.borderColor = 'var(--ez-hue-blue-border)';
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: 'var(--ez-radius-control)',
                      background: 'var(--ez-color-primary)',
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Sparkles size={19} />
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 800, background: 'var(--ez-pastel-sky)', color: 'var(--ez-hue-blue-text-deep)', padding: '2px 8px', borderRadius: 'var(--ez-radius-pill)', border: '1px solid var(--ez-hue-blue-border)' }}>
                    {t('proj.create.card1_tag')}
                  </span>
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 750, color: '#1E1B4B', margin: '0 0 4px 0' }}>
                  {t('proj.create.card1_t')}
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--ez-hue-indigo-text)', lineHeight: 1.45, margin: 0 }}>
                  {t('proj.create.card1_b')}
                </p>
              </div>
              <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--ez-hue-blue-text-deep)' }}>
                <span>{t('proj.create.card1_cta')}</span>
                <ArrowRight size={14} />
              </div>
            </div>

            {/* 2. MANUAL BUILDER */}
            <div
              onClick={() => setActiveStep('manual')}
              style={{
                background: 'var(--ez-color-surface)',
                border: '1.5px solid var(--ez-color-border-line)',
                borderRadius: 'var(--ez-radius-control)',
                padding: '16px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.borderColor = 'var(--ez-color-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = 'var(--ez-color-border)';
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: 'var(--ez-radius-control)',
                      background: 'var(--ez-hue-blue-bg)',
                      color: 'var(--ez-color-primary)',
                      border: '1px solid var(--ez-hue-blue-bg-deep)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <FileEdit size={19} />
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 700, background: 'var(--ez-color-surface-secondary)', color: 'var(--ez-color-text-muted)', padding: '2px 8px', borderRadius: 'var(--ez-radius-pill)', border: '1px solid var(--ez-color-border-line)' }}>
                    {t('proj.create.card2_tag')}
                  </span>
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 750, color: 'var(--ez-color-text-primary)', margin: '0 0 4px 0' }}>
                  {t('proj.create.card2_t')}
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', lineHeight: 1.45, margin: 0 }}>
                  {t('proj.create.card2_b')}
                </p>
              </div>
              <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--ez-color-primary)' }}>
                <span>{t('proj.create.card2_cta')}</span>
                <ArrowRight size={14} />
              </div>
            </div>

            {/* 3. VOLUME CALCULATION */}
            <div
              onClick={handleVolumeCalcPathway}
              style={{
                background: 'var(--ez-color-surface)',
                border: '1.5px solid var(--ez-color-border-line)',
                borderRadius: 'var(--ez-radius-control)',
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
                e.currentTarget.style.borderColor = 'var(--ez-color-border)';
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: 'var(--ez-radius-control)',
                      background: 'var(--ez-hue-emerald-bg)',
                      color: 'var(--ez-hue-green-text)',
                      border: '1px solid var(--ez-hue-green-border-deep)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Calculator size={19} />
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 700, background: 'var(--ez-color-surface-secondary)', color: 'var(--ez-color-text-muted)', padding: '2px 8px', borderRadius: 'var(--ez-radius-pill)', border: '1px solid var(--ez-color-border-line)' }}>
                    {t('proj.create.card3_tag')}
                  </span>
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 750, color: 'var(--ez-color-text-primary)', margin: '0 0 4px 0' }}>
                  {t('proj.create.card3_t')}
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', lineHeight: 1.45, margin: 0 }}>
                  {t('proj.create.card3_b')}
                </p>
              </div>
              <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--ez-hue-green-text)' }}>
                <span>{t('proj.create.card3_cta')}</span>
                <ArrowRight size={14} />
              </div>
            </div>

            {/* 4. TEMPLATE RAB */}
            <div
              onClick={handleTemplatePathway}
              style={{
                background: 'var(--ez-color-surface)',
                border: '1.5px solid var(--ez-color-border-line)',
                borderRadius: 'var(--ez-radius-control)',
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
                e.currentTarget.style.borderColor = 'var(--ez-color-border)';
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: 'var(--ez-radius-control)',
                      background: 'var(--ez-hue-amber-bg)',
                      color: 'var(--ez-hue-amber-text-deep)',
                      border: '1px solid var(--ez-hue-amber-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Layers size={19} />
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 700, background: 'var(--ez-color-success-soft)', color: 'var(--ez-hue-green-text)', padding: '2px 8px', borderRadius: 'var(--ez-radius-pill)' }}>
                    {t('proj.create.card4_tag')}
                  </span>
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 750, color: 'var(--ez-color-text-primary)', margin: '0 0 4px 0' }}>
                  {t('proj.create.card4_t')}
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', lineHeight: 1.45, margin: 0 }}>
                  {t('proj.create.card4_b')}
                </p>
              </div>
              <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--ez-hue-amber-text-deep)' }}>
                <span>{t('proj.create.card4_cta')}</span>
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
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: '5px' }}>
                {t('proj.create.f_name')}
              </label>
              <input
                type="text"
                required
                placeholder={t('proj.create.f_name_ph')}
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--ez-hue-slate-border)',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: '5px' }}>
                  {t('proj.create.f_type')}
                </label>
                <select
                  value={manualBuildingType}
                  onChange={(e) => setManualBuildingType(e.target.value as BuildingType)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--ez-hue-slate-border)',
                    fontSize: '13px',
                    background: 'var(--ez-color-surface)',
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
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: '5px' }}>
                  {t('proj.create.f_loc')}
                </label>
                <input
                  type="text"
                  placeholder={t('proj.create.f_loc_ph')}
                  value={manualLocation}
                  onChange={(e) => setManualLocation(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--ez-hue-slate-border)',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: '5px' }}>
                  {t('proj.create.f_area')}
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
                    border: '1px solid var(--ez-hue-slate-border)',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: '5px' }}>
                  {t('proj.create.f_floors')}
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
                    border: '1px solid var(--ez-hue-slate-border)',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: '5px' }}>
                  {t('proj.create.f_client')}
                </label>
                <input
                  type="text"
                  placeholder={t('proj.create.f_client_ph')}
                  value={manualClient}
                  onChange={(e) => setManualClient(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--ez-hue-slate-border)',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: '5px' }}>
                  {t('proj.create.f_budget')}
                </label>
                <input
                  type="text"
                  placeholder={t('proj.create.f_budget_ph')}
                  value={manualEstimatedBudget}
                  onChange={(e) => setManualEstimatedBudget(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--ez-hue-slate-border)',
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
                  border: '1px solid var(--ez-color-border-line)',
                  background: 'var(--ez-color-surface)',
                  color: 'var(--ez-color-text-muted)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {t('proj.create.back_btn')}
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !manualName.trim()}
                style={{
                  padding: '9px 20px',
                  borderRadius: '8px',
                  background: 'var(--ez-color-primary)',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 650,
                  cursor: isSubmitting ? 'wait' : 'pointer',
                  opacity: !manualName.trim() ? 0.6 : 1,
                }}
              >
                {isSubmitting ? t('proj.create.saving') : t('proj.create.save_open')}
              </button>
            </div>
          </form>
        )}

        {/* =========================================================================
            STEP 2B: MAGIC AI FORM
           ========================================================================= */}
        {activeStep === 'magic_ai' && (
          <form onSubmit={handleMagicAiSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ background: 'var(--ez-color-surface-secondary)', padding: '12px', borderRadius: '8px', border: '1px solid var(--ez-color-border-line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--ez-hue-blue-text-deep)', marginBottom: '4px' }}>
                <Sparkles size={14} />
                <span>{t('proj.create.ai_fmt')}</span>
              </div>
              <p style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)', margin: 0, lineHeight: 1.4 }}>
                {t('proj.create.ai_fmt_b')}
              </p>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: '5px' }}>
                {t('proj.create.f_desc')}
              </label>
              <textarea
                rows={4}
                required
                placeholder={t('proj.create.f_desc_ph')}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid var(--ez-hue-slate-border)',
                  fontSize: '13px',
                  color: 'var(--ez-color-text-primary)',
                  outline: 'none',
                  resize: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {magicError && (
              <div role="alert" style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 12px', borderRadius: '8px', fontSize: '12.5px', lineHeight: 1.45 }}>
                {magicError}
              </div>
            )}

            {magicAskChoice && activeProject && (
              <div style={{ background: 'var(--ez-color-surface-secondary)', border: '1px solid var(--ez-color-border-line)', padding: '12px', borderRadius: '8px' }}>
                <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-body)', margin: '0 0 4px', lineHeight: 1.5 }}>
                  Anda memiliki proyek aktif: <strong>{activeProject.name}</strong>
                </p>
                <p style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)', margin: '0 0 10px', lineHeight: 1.45 }}>
                  Prompt ini dilanjutkan ke proyek aktif, atau buat proyek baru?
                </p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={proceedMagicReuseActive}
                    style={{ padding: '8px 14px', borderRadius: '8px', background: 'var(--ez-color-primary)', color: '#FFFFFF', border: 'none', fontSize: '12.5px', fontWeight: 650, cursor: 'pointer' }}
                  >
                    Lanjutkan di proyek aktif
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMagicAskChoice(false); setIsSubmitting(true); proceedMagicCreate(aiPrompt.trim()); }}
                    style={{ padding: '8px 14px', borderRadius: '8px', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-body)', border: '1px solid var(--ez-color-border-line)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Buat proyek baru
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button
                type="button"
                onClick={() => setActiveStep('select')}
                style={{
                  padding: '9px 16px',
                  borderRadius: '8px',
                  border: '1px solid var(--ez-color-border-line)',
                  background: 'var(--ez-color-surface)',
                  color: 'var(--ez-color-text-muted)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {t('proj.create.back_btn')}
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
                  background: 'var(--ez-color-primary)',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 650,
                  cursor: isSubmitting ? 'wait' : 'pointer',
                  opacity: !aiPrompt.trim() ? 0.6 : 1,
                  boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)',
                }}
              >
                <Sparkles size={14} />
                <span>{isSubmitting ? t('proj.create.preparing') : t('proj.create.process_ai')}</span>
              </button>
            </div>
          </form>
        )}

        {/* =========================================================================
            STEP 2C: VOLUME CALCULATION FORM (D-28, Batch F)
            Klik kartu Volume membuka langkah ini — proyek BARU dibuat hanya
            sesudah pengguna menamai + menekan "Buat & Buka Kalkulator".
            Bila ada proyek aktif, pengguna ditawari memakai ulang proyek
            aktif (tanpa membuat proyek baru). Batal/kembali = tidak ada
            proyek yang dibuat.
           ========================================================================= */}
        {activeStep === 'volume_calculation' && (
          <form onSubmit={handleVolumeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {volumeAskChoice && activeProject && (
              <div style={{ background: 'var(--ez-color-surface-secondary)', border: '1px solid var(--ez-color-border-line)', padding: '12px', borderRadius: '8px' }}>
                <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-body)', margin: '0 0 4px', lineHeight: 1.5 }}>
                  Anda memiliki proyek aktif: <strong>{activeProject.name}</strong>
                </p>
                <p style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)', margin: '0 0 10px', lineHeight: 1.45 }}>
                  Hitung volume di proyek aktif, atau buat proyek baru?
                </p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={proceedVolumeReuseActive}
                    style={{ padding: '8px 14px', borderRadius: '8px', background: 'var(--ez-color-primary)', color: '#FFFFFF', border: 'none', fontSize: '12.5px', fontWeight: 650, cursor: 'pointer' }}
                  >
                    Hitung di proyek aktif
                  </button>
                  <button
                    type="button"
                    onClick={() => setVolumeAskChoice(false)}
                    style={{ padding: '8px 14px', borderRadius: '8px', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-body)', border: '1px solid var(--ez-color-border-line)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Buat proyek baru
                  </button>
                </div>
              </div>
            )}

            {(!volumeAskChoice || !activeProject) && (
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: '5px' }}>
                  {t('proj.create.f_name')}
                </label>
                <input
                  type="text"
                  required
                  placeholder={t('proj.create.f_name_ph')}
                  value={volumeName}
                  onChange={(e) => setVolumeName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--ez-hue-slate-border)',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}

            {volumeError && (
              <div role="alert" style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 12px', borderRadius: '8px', fontSize: '12.5px', lineHeight: 1.45 }}>
                {volumeError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button
                type="button"
                onClick={() => setActiveStep('select')}
                style={{
                  padding: '9px 16px',
                  borderRadius: '8px',
                  border: '1px solid var(--ez-color-border-line)',
                  background: 'var(--ez-color-surface)',
                  color: 'var(--ez-color-text-muted)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {t('proj.create.back_btn')}
              </button>
              {(!volumeAskChoice || !activeProject) && (
                <button
                  type="submit"
                  disabled={isSubmitting || !volumeName.trim()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '9px 20px',
                    borderRadius: '8px',
                    background: 'var(--ez-color-primary)',
                    color: '#FFFFFF',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 650,
                    cursor: isSubmitting ? 'wait' : 'pointer',
                    opacity: !volumeName.trim() ? 0.6 : 1,
                  }}
                >
                  <Calculator size={14} />
                  <span>{isSubmitting ? t('proj.create.saving') : 'Buat & Buka Kalkulator'}</span>
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default CreateProjectModal;