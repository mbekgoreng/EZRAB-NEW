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
              </h2>
              <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', margin: '2px 0 0 0' }}>
                {activeStep === 'select' && t('proj.create.sub_select')}
                {activeStep === 'manual' && t('proj.create.sub_manual')}
                {activeStep === 'magic_ai' && t('proj.create.sub_ai')}
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
            {/* 1. MAGIC AI */}
            <div
              onClick={() => setActiveStep('magic_ai')}
              style={{
                background: 'var(--ez-pastel-sky)',
                border: '1.5px solid #BFDBFE',
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
                e.currentTarget.style.borderColor = '#BFDBFE';
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
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Sparkles size={19} />
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 800, background: 'var(--ez-pastel-sky)', color: '#2456A8', padding: '2px 8px', borderRadius: 'var(--ez-radius-pill)', border: '1px solid #BFDBFE' }}>
                    {t('proj.create.card1_tag')}
                  </span>
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 750, color: '#1E1B4B', margin: '0 0 4px 0' }}>
                  {t('proj.create.card1_t')}
                </h3>
                <p style={{ fontSize: '12px', color: '#4338CA', lineHeight: 1.45, margin: 0 }}>
                  {t('proj.create.card1_b')}
                </p>
              </div>
              <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#2456A8' }}>
                <span>{t('proj.create.card1_cta')}</span>
                <ArrowRight size={14} />
              </div>
            </div>

            {/* 2. MANUAL BUILDER */}
            <div
              onClick={() => setActiveStep('manual')}
              style={{
                background: 'var(--ez-color-surface)',
                border: '1.5px solid #E2E8F0',
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
                      background: '#EFF6FF',
                      color: 'var(--ez-color-primary)',
                      border: '1px solid #DBEAFE',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <FileEdit size={19} />
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 700, background: 'var(--ez-color-surface-secondary)', color: 'var(--ez-color-text-muted)', padding: '2px 8px', borderRadius: 'var(--ez-radius-pill)', border: '1px solid #E2E8F0' }}>
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
                border: '1.5px solid #E2E8F0',
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
                  <span style={{ fontSize: '10px', fontWeight: 700, background: 'var(--ez-color-surface-secondary)', color: 'var(--ez-color-text-muted)', padding: '2px 8px', borderRadius: 'var(--ez-radius-pill)', border: '1px solid #E2E8F0' }}>
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
              <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#059669' }}>
                <span>{t('proj.create.card3_cta')}</span>
                <ArrowRight size={14} />
              </div>
            </div>

            {/* 4. TEMPLATE RAB */}
            <div
              onClick={handleTemplatePathway}
              style={{
                background: 'var(--ez-color-surface)',
                border: '1.5px solid #E2E8F0',
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
                  <span style={{ fontSize: '10px', fontWeight: 700, background: '#DCFCE7', color: '#15803D', padding: '2px 8px', borderRadius: 'var(--ez-radius-pill)' }}>
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
              <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#D97706' }}>
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
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 650, color: '#334155', marginBottom: '5px' }}>
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
                  {t('proj.create.f_type')}
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
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 650, color: '#334155', marginBottom: '5px' }}>
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
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 650, color: '#334155', marginBottom: '5px' }}>
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
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 650, color: '#334155', marginBottom: '5px' }}>
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
                  color: '#ffffff',
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
            <div style={{ background: 'var(--ez-color-surface-secondary)', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#2456A8', marginBottom: '4px' }}>
                <Sparkles size={14} />
                <span>{t('proj.create.ai_fmt')}</span>
              </div>
              <p style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)', margin: 0, lineHeight: 1.4 }}>
                {t('proj.create.ai_fmt_b')}
              </p>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 650, color: '#334155', marginBottom: '5px' }}>
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
                  border: '1px solid #CBD5E1',
                  fontSize: '13px',
                  color: 'var(--ez-color-text-primary)',
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
                <span>{isSubmitting ? t('proj.create.preparing') : t('proj.create.process_ai')}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default CreateProjectModal;