import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  FileSpreadsheet,
  Building,
  ArrowRight,
  Check,
  CheckCircle2,
  Package,
  Layers,
  Info,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Eye,
  Sliders,
  ShieldCheck,
  Plus,
  RefreshCw,
  FolderPlus,
  Wrench,
  Sparkles,
  HelpCircle,
  ExternalLink
} from 'lucide-react';
import {
  RabTemplate,
  DetailLevel,
  TemplateParameter,
  ConstructionComponentTemplate,
  MaterialItem
} from '../../types/rabTemplate';
import { Project, RabItem } from '../../types';
import { RabTemplateService } from '../../services/rabTemplateService';
import { MaterialLibraryService } from '../../services/materialLibraryService';
import { formatRupiah, formatNumberId } from '../../engine/formulaEngine';
import { SafeDecimalEngine } from '../../engine/safeDecimalEngine';

export interface UniversalTemplateConfiguratorProps {
  template: RabTemplate;
  currentProject: Project | null;
  projects?: Project[];
  isOpen: boolean;
  onClose: () => void;
  onConfirmApply: (
    template: RabTemplate,
    params: Record<string, any>,
    targetProjectId?: string,
    newProjectMeta?: { name: string; buildingArea: number; floorCount: number },
    detailLevel?: DetailLevel,
    selectedOptionalItemIds?: string[]
  ) => void;
}

export const UniversalTemplateConfigurator: React.FC<UniversalTemplateConfiguratorProps> = ({
  template,
  currentProject,
  projects = [],
  isOpen,
  onClose,
  onConfirmApply
}) => {
  // Detail Level State (Standard, Professional, Comprehensive)
  const [detailLevel, setDetailLevel] = useState<DetailLevel>(
    template.defaultDetailLevel || 'PROFESSIONAL'
  );

  // Dynamic parameters state
  const [paramValues, setParamValues] = useState<Record<string, any>>(() => {
    const initial: Record<string, any> = {};
    for (const p of template.parameters) {
      initial[p.key] = p.defaultValue !== undefined ? p.defaultValue : '';
    }
    return initial;
  });

  // Optional components selection state
  const [selectedOptionalIds, setSelectedOptionalIds] = useState<string[]>([]);

  // Project Target State: 'CURRENT' | 'EXISTING' | 'NEW'
  const [targetMode, setTargetMode] = useState<'CURRENT' | 'EXISTING' | 'NEW'>(
    currentProject ? 'CURRENT' : projects.length > 0 ? 'EXISTING' : 'NEW'
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    currentProject ? currentProject.id : projects[0]?.id || ''
  );
  const [newProjectName, setNewProjectName] = useState<string>(
    currentProject ? `${currentProject.name} - Estimasi Baru` : `${template.name} - Proyek Baru`
  );

  // Material Ecosystem Specification Overrides state: category -> materialId
  const [materialOverrides, setMaterialOverrides] = useState<Record<string, string>>({});
  const [activeMaterialPickerCategory, setActiveMaterialPickerCategory] = useState<string | null>(null);

  // Modals & Drawers inside Configurator
  const [showItemDetailModal, setShowItemDetailModal] = useState<boolean>(false);
  const [showTransparencyAccordion, setShowTransparencyAccordion] = useState<boolean>(false);

  const tplService = useMemo(() => RabTemplateService.getInstance(), []);
  const matService = useMemo(() => MaterialLibraryService.getInstance(), []);

  // Sync state when template changes
  useEffect(() => {
    setDetailLevel(template.defaultDetailLevel || 'PROFESSIONAL');
    const initial: Record<string, any> = {};
    for (const p of template.parameters) {
      initial[p.key] = p.defaultValue !== undefined ? p.defaultValue : '';
    }
    setParamValues(initial);
    setSelectedOptionalIds([]);
    setMaterialOverrides({});
  }, [template]);

  // Optional components available in this template
  const optionalComponents = useMemo(() => {
    return (template.components || []).filter((c) => c.isOptional);
  }, [template]);

  // Material categories detected in template components
  const templateMaterialCategories = useMemo(() => {
    const categories = new Set<string>();
    (template.components || []).forEach((c) => {
      if (c.materialCategory) categories.add(c.materialCategory);
    });
    return Array.from(categories);
  }, [template]);

  // Live calculation result based on parameters, detail level, and optionals
  const previewResult = useMemo(() => {
    try {
      const effectiveProjectId = targetMode === 'CURRENT' && currentProject
        ? currentProject.id
        : targetMode === 'EXISTING'
        ? selectedProjectId
        : undefined;

      return tplService.generateRabFromTemplate(
        template,
        paramValues,
        effectiveProjectId,
        detailLevel,
        selectedOptionalIds
      );
    } catch (err) {
      console.warn('Configurator live preview error:', err);
      return null;
    }
  }, [tplService, template, paramValues, targetMode, currentProject, selectedProjectId, detailLevel, selectedOptionalIds]);

  // Dynamic Item Counts for each Detail Level (live evaluation)
  const detailLevelCounts = useMemo(() => {
    const counts: Record<DetailLevel, { count: number; total: number }> = {
      STANDARD: { count: 0, total: 0 },
      PROFESSIONAL: { count: 0, total: 0 },
      COMPREHENSIVE: { count: 0, total: 0 },
    };

    const levels: DetailLevel[] = ['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'];
    levels.forEach((lvl) => {
      try {
        const res = tplService.generateRabFromTemplate(template, paramValues, undefined, lvl, selectedOptionalIds);
        counts[lvl] = { count: res.items.length, total: res.totalEstimate };
      } catch {
        counts[lvl] = { count: 0, total: 0 };
      }
    });

    return counts;
  }, [tplService, template, paramValues, selectedOptionalIds]);

  // Parameter Grouping (dynamically groups by p.group or assigns fallback)
  const groupedParameters = useMemo(() => {
    const groups: Record<string, { label: string; order: number; params: TemplateParameter[] }> = {
      dimensions: { label: 'Dimensi & Geometri Utama', order: 1, params: [] },
      specifications: { label: 'Struktur & Spesifikasi Teknis', order: 2, params: [] },
      scope: { label: 'Ruang Lingkup & Kapasitas', order: 3, params: [] },
      finishing: { label: 'Arsitektur & Finishing', order: 4, params: [] },
      mep: { label: 'MEP & Utilitas', order: 5, params: [] },
      general: { label: 'Parameter Tambahan', order: 6, params: [] },
    };

    template.parameters.forEach((param) => {
      const grpKey = param.group && groups[param.group] ? param.group : 'general';
      groups[grpKey].params.push(param);
    });

    return Object.entries(groups)
      .filter(([_, grp]) => grp.params.length > 0)
      .sort((a, b) => a[1].order - b[1].order);
  }, [template]);

  // Parameter Validation Check
  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    for (const p of template.parameters) {
      if (p.required) {
        const val = paramValues[p.key];
        if (val === undefined || val === null || val === '') {
          errors.push(`Parameter "${p.label}" wajib diisi.`);
        } else if (p.type === 'NUMBER' && p.min !== undefined && Number(val) < p.min) {
          errors.push(`Parameter "${p.label}" minimal ${p.min} ${p.unit || ''}.`);
        }
      }
    }
    return errors;
  }, [template, paramValues]);

  const isValidToApply = validationErrors.length === 0 && previewResult && previewResult.items.length > 0;

  if (!isOpen) return null;

  // Handlers
  const handleParamChange = (key: string, val: any) => {
    setParamValues((prev) => ({ ...prev, [key]: val }));
  };

  const toggleOptionalItem = (id: string) => {
    setSelectedOptionalIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSelectMaterial = (category: string, materialId: string) => {
    setMaterialOverrides((prev) => ({ ...prev, [category]: materialId }));
    setActiveMaterialPickerCategory(null);
  };

  const handleConfirm = () => {
    if (!isValidToApply) return;

    if (targetMode === 'CURRENT' && currentProject) {
      onConfirmApply(
        template,
        paramValues,
        currentProject.id,
        undefined,
        detailLevel,
        selectedOptionalIds
      );
    } else if (targetMode === 'EXISTING' && selectedProjectId) {
      onConfirmApply(
        template,
        paramValues,
        selectedProjectId,
        undefined,
        detailLevel,
        selectedOptionalIds
      );
    } else {
      const area = Number(paramValues['building_area'] || paramValues['paving_area'] || paramValues['road_length'] || 100);
      const floors = Number(paramValues['num_floors'] || paramValues['total_floors'] || 1);
      onConfirmApply(
        template,
        paramValues,
        undefined,
        {
          name: newProjectName.trim() || template.name,
          buildingArea: area,
          floorCount: floors,
        },
        detailLevel,
        selectedOptionalIds
      );
    }
    onClose();
  };

  // Helper label for target project display
  const targetProjectLabel = targetMode === 'CURRENT' && currentProject
    ? currentProject.name
    : targetMode === 'EXISTING'
    ? projects.find((p) => p.id === selectedProjectId)?.name || 'Proyek Terpilih'
    : newProjectName.trim() || 'Proyek Baru';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
    >
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '1240px',
          height: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #E2E8F0',
          overflow: 'hidden',
        }}
      >
        {/* =====================================================================
            1. WORKSTATION CONFIGURATOR HEADER (Compact 60-70px)
           ===================================================================== */}
        <div
          style={{
            padding: '14px 22px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#F8FAFC',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                background: '#0F172A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#38BDF8',
                border: '1px solid #1E293B',
                flexShrink: 0,
              }}
            >
              <FileSpreadsheet size={20} />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  {template.name}
                </h2>
                <span
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 700,
                    background: '#EFF6FF',
                    color: '#1D4ED8',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    border: '1px solid #DBEAFE',
                    textTransform: 'uppercase',
                  }}
                >
                  {template.category.replace(/_/g, ' ')}
                </span>
                {template.subcategory && (
                  <span
                    style={{
                      fontSize: '10.5px',
                      color: '#475569',
                      background: '#F1F5F9',
                      padding: '2px 8px',
                      borderRadius: '4px',
                    }}
                  >
                    {template.subcategory}
                  </span>
                )}
                <span style={{ fontSize: '10.5px', color: '#64748B', fontFamily: 'monospace' }}>
                  v{template.metadata.version}
                </span>
              </div>
              <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0', lineHeight: 1.3 }}>
                {template.description}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              padding: '8px',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
              background: '#ffffff',
              color: '#64748B',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.12s ease',
            }}
            title="Tutup Configurator"
          >
            <X size={18} />
          </button>
        </div>

        {/* =====================================================================
            2. WORKSTATION 70 / 30 SPLIT BODY
           ===================================================================== */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {/* ===================================================================
              LEFT SECTION: CONFIGURATION FORM (~68% width)
             =================================================================== */}
          <div
            style={{
              flex: '1 1 68%',
              overflowY: 'auto',
              padding: '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              borderRight: '1px solid #E2E8F0',
            }}
          >
            {/* SECTION 01: PROJECT TARGET SELECTOR */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px 16px', background: '#ffffff' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Building size={15} color="#2563EB" />
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    01. Target Proyek Konstruksi
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: '#64748B' }}>
                  Tentukan proyek penerima item RAB
                </span>
              </div>

              {/* Mode Tabs */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                {currentProject && (
                  <button
                    onClick={() => setTargetMode('CURRENT')}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '11.5px',
                      fontWeight: targetMode === 'CURRENT' ? 700 : 500,
                      background: targetMode === 'CURRENT' ? '#EFF6FF' : '#F8FAFC',
                      color: targetMode === 'CURRENT' ? '#1D4ED8' : '#475569',
                      border: targetMode === 'CURRENT' ? '1.5px solid #2563EB' : '1px solid #CBD5E1',
                      cursor: 'pointer',
                    }}
                  >
                    Proyek Aktif ({currentProject.name})
                  </button>
                )}

                {projects.length > 0 && (
                  <button
                    onClick={() => setTargetMode('EXISTING')}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '11.5px',
                      fontWeight: targetMode === 'EXISTING' ? 700 : 500,
                      background: targetMode === 'EXISTING' ? '#EFF6FF' : '#F8FAFC',
                      color: targetMode === 'EXISTING' ? '#1D4ED8' : '#475569',
                      border: targetMode === 'EXISTING' ? '1.5px solid #2563EB' : '1px solid #CBD5E1',
                      cursor: 'pointer',
                    }}
                  >
                    Pilih Proyek Lain
                  </button>
                )}

                <button
                  onClick={() => setTargetMode('NEW')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '11.5px',
                    fontWeight: targetMode === 'NEW' ? 700 : 500,
                    background: targetMode === 'NEW' ? '#EFF6FF' : '#F8FAFC',
                    color: targetMode === 'NEW' ? '#1D4ED8' : '#475569',
                    border: targetMode === 'NEW' ? '1.5px solid #2563EB' : '1px solid #CBD5E1',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Plus size={13} />
                  <span>Buat Proyek Baru</span>
                </button>
              </div>

              {/* Mode Specific Input */}
              {targetMode === 'CURRENT' && currentProject && (
                <div style={{ background: '#F8FAFC', padding: '10px 12px', borderRadius: '6px', border: '1px solid #E2E8F0', fontSize: '12px', color: '#334155' }}>
                  Item RAB akan langsung di-generate dan ditambahkan ke lembar kerja <strong>{currentProject.name}</strong>.
                </div>
              )}

              {targetMode === 'EXISTING' && (
                <div>
                  <label htmlFor="select-target-project" style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    Pilih Proyek Terdaftar:
                  </label>
                  <select
                    id="select-target-project"
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    style={{
                      width: '100%',
                      height: '34px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      background: '#F8FAFC',
                      fontSize: '12px',
                      color: '#0F172A',
                      padding: '0 8px',
                      outline: 'none',
                    }}
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.buildingType || 'Umum'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {targetMode === 'NEW' && (
                <div>
                  <label htmlFor="input-new-project-name" style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    Nama Proyek Baru:
                  </label>
                  <input
                    id="input-new-project-name"
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="Contoh: Pembangunan Ruko 2 Lantai Modern"
                    style={{
                      width: '100%',
                      height: '34px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      background: '#ffffff',
                      fontSize: '12.5px',
                      color: '#0F172A',
                      padding: '0 10px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}
            </div>

            {/* SECTION 02: UNIVERSAL 3-TIER DETAIL LEVEL */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px 16px', background: '#ffffff' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Layers size={15} color="#2563EB" />
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    02. Tingkat Kedalaman Estimasi (Detail Level)
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: '#64748B' }}>
                  Menentukan kelengkapan item WBS
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                {([
                  {
                    id: 'STANDARD' as DetailLevel,
                    title: 'Standard',
                    scope: 'Pekerjaan utama struktural & arsitektur inti',
                  },
                  {
                    id: 'PROFESSIONAL' as DetailLevel,
                    title: 'Professional',
                    scope: 'Pekerjaan utama + pendukung + MEP lengkap',
                  },
                  {
                    id: 'COMPREHENSIVE' as DetailLevel,
                    title: 'Comprehensive',
                    scope: 'Item detail penuh + accessories + finishing',
                  },
                ]).map((lvl) => {
                  const isSelected = detailLevel === lvl.id;
                  const info = detailLevelCounts[lvl.id] || { count: 0, total: 0 };
                  return (
                    <div
                      key={lvl.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setDetailLevel(lvl.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setDetailLevel(lvl.id); }}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '8px',
                        border: isSelected ? '2px solid #2563EB' : '1px solid #E2E8F0',
                        background: isSelected ? '#EFF6FF' : '#ffffff',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '6px',
                        transition: 'all 0.12s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '13px', fontWeight: 800, color: isSelected ? '#1D4ED8' : '#0F172A' }}>
                          {lvl.title}
                        </span>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: isSelected ? '#2563EB' : '#F1F5F9',
                            color: isSelected ? '#ffffff' : '#475569',
                          }}
                        >
                          {info.count} Item
                        </span>
                      </div>
                      <p style={{ fontSize: '11px', color: '#64748B', margin: 0, lineHeight: 1.3 }}>
                        {lvl.scope}
                      </p>
                      <div style={{ fontSize: '11.5px', fontWeight: 700, fontFamily: 'monospace', color: isSelected ? '#1D4ED8' : '#334155', marginTop: '4px' }}>
                        {formatRupiah(info.total)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* SECTION 03: DYNAMIC PARAMETERS (Grouped by Context) */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px 16px', background: '#ffffff' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px solid #F1F5F9', paddingBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sliders size={15} color="#2563EB" />
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    03. Parameter Konstruksi ({template.parameters.length} Parameter)
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: '#64748B' }}>
                  Nilai otomatis menghitung volume QTO
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {groupedParameters.map(([grpKey, group]) => (
                  <div key={grpKey}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '4px', height: '12px', background: '#2563EB', borderRadius: '2px', display: 'inline-block' }}></span>
                      <span>{group.label}</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
                      {group.params.map((param) => {
                        const val = paramValues[param.key] ?? '';
                        return (
                          <div
                            key={param.key}
                            style={{
                              background: '#F8FAFC',
                              borderRadius: '8px',
                              border: '1px solid #E2E8F0',
                              padding: '10px 12px',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              gap: '6px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <label
                                htmlFor={`param-${param.key}`}
                                style={{ fontSize: '11.5px', fontWeight: 700, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '4px' }}
                              >
                                <span>{param.label}</span>
                                {param.required && <span style={{ color: '#EF4444' }}>*</span>}
                              </label>
                              {param.unit && (
                                <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748B', background: '#EDF2F7', padding: '1px 5px', borderRadius: '4px' }}>
                                  {param.unit}
                                </span>
                              )}
                            </div>

                            {/* Dynamic Input Types */}
                            {param.type === 'SELECT' && param.options ? (
                              <select
                                id={`param-${param.key}`}
                                value={val}
                                onChange={(e) => handleParamChange(param.key, e.target.value)}
                                style={{
                                  width: '100%',
                                  height: '32px',
                                  borderRadius: '5px',
                                  border: '1px solid #CBD5E1',
                                  background: '#ffffff',
                                  fontSize: '12px',
                                  color: '#0F172A',
                                  padding: '0 8px',
                                  outline: 'none',
                                }}
                              >
                                {param.options.map((opt) => (
                                  <option key={String(opt.value)} value={String(opt.value)}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            ) : param.type === 'BOOLEAN' ? (
                              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', height: '32px' }}>
                                <input
                                  id={`param-${param.key}`}
                                  type="checkbox"
                                  checked={val === true || val === 'true'}
                                  onChange={(e) => handleParamChange(param.key, e.target.checked)}
                                  style={{ width: '16px', height: '16px', accentColor: '#2563EB', cursor: 'pointer' }}
                                />
                                <span style={{ fontSize: '12px', color: '#334155' }}>
                                  {val ? 'Aktif' : 'Non-Aktif'}
                                </span>
                              </label>
                            ) : (
                              <div style={{ position: 'relative' }}>
                                <input
                                  id={`param-${param.key}`}
                                  type={param.type === 'NUMBER' ? 'number' : 'text'}
                                  inputMode={param.type === 'NUMBER' ? 'decimal' : 'text'}
                                  step={param.step || (param.type === 'NUMBER' ? 'any' : undefined)}
                                  min={param.min}
                                  max={param.max}
                                  value={val}
                                  onChange={(e) => handleParamChange(param.key, param.type === 'NUMBER' ? e.target.value : e.target.value)}
                                  style={{
                                    width: '100%',
                                    height: '32px',
                                    borderRadius: '5px',
                                    border: '1px solid #CBD5E1',
                                    background: '#ffffff',
                                    fontSize: '12.5px',
                                    fontFamily: param.type === 'NUMBER' ? 'monospace' : 'inherit',
                                    fontWeight: param.type === 'NUMBER' ? 700 : 500,
                                    color: '#0F172A',
                                    padding: '0 8px',
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                  }}
                                />
                              </div>
                            )}

                            {param.description && (
                              <span style={{ fontSize: '10px', color: '#94A3B8', lineHeight: 1.2 }}>
                                {param.description}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* SECTION 04: WORK PACKAGES INCLUDED */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px 16px', background: '#ffffff' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Package size={15} color="#2563EB" />
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    04. Paket Pekerjaan (Work Packages)
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: '#64748B' }}>
                  {previewResult ? Object.keys(previewResult.categorySummaries).length : 0} Kategori Aktif
                </span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {previewResult &&
                  Object.entries(previewResult.categorySummaries).map(([catName, amount]) => (
                    <div
                      key={catName}
                      style={{
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '6px',
                        padding: '6px 10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '11px',
                      }}
                    >
                      <CheckCircle2 size={13} color="#16A34A" />
                      <span style={{ fontWeight: 600, color: '#1E293B' }}>{catName}</span>
                      <span style={{ fontFamily: 'monospace', color: '#2563EB', fontWeight: 700 }}>
                        {formatRupiah(amount)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            {/* SECTION 05: OPTIONAL WORKS (Pekerjaan Tambahan) */}
            {optionalComponents.length > 0 && (
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px 16px', background: '#ffffff' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Plus size={15} color="#2563EB" />
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      05. Pekerjaan Tambahan Opsional ({optionalComponents.length} Pilihan)
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: '#64748B' }}>
                    Centang untuk menyertakan ke dalam estimasi RAB
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '8px' }}>
                  {optionalComponents.map((comp) => {
                    const isChecked = selectedOptionalIds.includes(comp.id);
                    return (
                      <label
                        key={comp.id}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '8px',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          background: isChecked ? '#EFF6FF' : '#F8FAFC',
                          border: isChecked ? '1.5px solid #2563EB' : '1px solid #E2E8F0',
                          cursor: 'pointer',
                          transition: 'all 0.1s ease',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleOptionalItem(comp.id)}
                          style={{ width: '16px', height: '16px', marginTop: '2px', accentColor: '#2563EB', cursor: 'pointer' }}
                        />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: isChecked ? '#1D4ED8' : '#0F172A' }}>
                            {comp.name}
                          </div>
                          <div style={{ fontSize: '10.5px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '1px' }}>
                            <span>{comp.category}</span>
                            {comp.unitPrice && (
                              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#059669' }}>
                                {formatRupiah(comp.unitPrice)}/{comp.unit}
                              </span>
                            )}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SECTION 06: MATERIAL & SPECIFICATION LINKAGE */}
            {templateMaterialCategories.length > 0 && (
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px 16px', background: '#ffffff' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Wrench size={15} color="#2563EB" />
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      06. Spesifikasi Material (Material Library Ecosystem)
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: '#059669', fontWeight: 700 }}>
                    ✓ Material Terintegrasi
                  </span>
                </div>

                <p style={{ fontSize: '11.5px', color: '#64748B', margin: '0 0 10px', lineHeight: 1.3 }}>
                  Katalog material resmi terhubung langsung dengan sistem AHSP. Pilih spesifikasi merek dan tipe untuk menyesuaikan standar proyek.
                </p>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {templateMaterialCategories.map((catKey) => {
                    const availableMaterials = matService.getMaterialsByCategory(catKey);
                    const selectedMatId = materialOverrides[catKey] || availableMaterials[0]?.id;
                    const selectedMat = matService.getMaterialById(selectedMatId);

                    return (
                      <div
                        key={catKey}
                        style={{
                          background: '#F8FAFC',
                          border: '1px solid #CBD5E1',
                          borderRadius: '6px',
                          padding: '6px 10px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          fontSize: '11px',
                        }}
                      >
                        <span style={{ fontWeight: 800, color: '#1E293B', background: '#E2E8F0', padding: '1px 5px', borderRadius: '3px' }}>
                          {catKey}
                        </span>
                        <span style={{ color: '#0F172A', fontWeight: 600 }}>
                          {selectedMat?.name || 'Spesifikasi Standar Template'}
                        </span>
                        <button
                          onClick={() => setActiveMaterialPickerCategory(activeMaterialPickerCategory === catKey ? null : catKey)}
                          style={{
                            background: '#EFF6FF',
                            border: '1px solid #BFDBFE',
                            color: '#1D4ED8',
                            borderRadius: '4px',
                            padding: '2px 6px',
                            fontSize: '10.5px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Pilih Merek
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Sub-picker for active material category */}
                {activeMaterialPickerCategory && (
                  <div style={{ marginTop: '10px', padding: '10px', background: '#EFF6FF', borderRadius: '8px', border: '1px solid #BFDBFE' }}>
                    <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#1E3A8A', marginBottom: '6px' }}>
                      Pilih Spesifikasi untuk Kategori {activeMaterialPickerCategory}:
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '6px' }}>
                      {matService.getMaterialsByCategory(activeMaterialPickerCategory).map((m) => (
                        <button
                          key={m.id}
                          onClick={() => handleSelectMaterial(activeMaterialPickerCategory, m.id)}
                          style={{
                            textAlign: 'left',
                            padding: '6px 8px',
                            borderRadius: '5px',
                            background: '#ffffff',
                            border: materialOverrides[activeMaterialPickerCategory] === m.id ? '2px solid #2563EB' : '1px solid #CBD5E1',
                            cursor: 'pointer',
                            fontSize: '11px',
                          }}
                        >
                          <div style={{ fontWeight: 700, color: '#0F172A' }}>{m.name}</div>
                          <div style={{ color: '#64748B', fontSize: '10px' }}>{m.brand} • {m.specification}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SECTION 07: TRANSPARENCY & ASSUMPTIONS ACCORDION */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden', background: '#ffffff' }}>
              <button
                onClick={() => setShowTransparencyAccordion(!showTransparencyAccordion)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: '#F8FAFC',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#334155',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Info size={14} color="#2563EB" />
                  <span>Transparansi Estimasi & Asumsi Formula</span>
                </div>
                {showTransparencyAccordion ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {showTransparencyAccordion && (
                <div style={{ padding: '12px 14px', background: '#ffffff', fontSize: '11.5px', color: '#475569', lineHeight: 1.6, borderTop: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div>
                    <strong>Dasar Hukum & Standardisasi:</strong>
                    <div>• AHSP PUPR S.E. No. 47/SE/M/2026 & Bina Marga 2026.</div>
                    <div>• Indeks Produktivitas Tenaga Kerja & Koefisien Material Standar SNI.</div>
                  </div>
                  <div>
                    <strong>Aturan Perhitungan:</strong>
                    <div>• Seluruh perhitungan volume mengikuti formula deterministik WBS level {detailLevel}.</div>
                    <div>• Pembulatan nilai kuantitas mengikuti SafeDecimalEngine (Half-Up 2 desimal).</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ===================================================================
              RIGHT SECTION: STICKY ESTIMATION SUMMARY (~32% width)
             =================================================================== */}
          <div
            style={{
              flex: '1 1 32%',
              background: '#F8FAFC',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* PRIMARY TOTAL ESTIMATE CARD */}
              <div
                style={{
                  background: '#0F172A',
                  borderRadius: '12px',
                  padding: '16px',
                  color: '#ffffff',
                  border: '1px solid #1E293B',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    TOTAL ESTIMASI RAB
                  </span>
                  <span style={{ fontSize: '10px', background: '#059669', color: '#ffffff', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                    PUPR 2026
                  </span>
                </div>

                <div style={{ fontSize: '26px', fontWeight: 800, color: '#38BDF8', fontFamily: 'monospace', marginTop: '6px', letterSpacing: '-0.02em' }}>
                  {formatRupiah(previewResult?.totalEstimate || 0)}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #1E293B', fontSize: '11.5px', color: '#CBD5E1' }}>
                  <span>Total Komponen WBS:</span>
                  <strong style={{ color: '#ffffff' }}>{previewResult?.items.length || 0} Item</strong>
                </div>
              </div>

              {/* ESTIMATION METADATA OVERVIEW */}
              <div style={{ background: '#ffffff', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11.5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
                  <span>Detail Level:</span>
                  <span style={{ fontWeight: 700, color: '#0F172A' }}>{detailLevel}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
                  <span>Target Proyek:</span>
                  <span style={{ fontWeight: 700, color: '#2563EB', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {targetProjectLabel}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
                  <span>Baseline AHSP:</span>
                  <span style={{ fontWeight: 600, color: '#059669' }}>PUPR S.E. 2026</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
                  <span>Pekerjaan Opsional:</span>
                  <span style={{ fontWeight: 700, color: '#0F172A' }}>{selectedOptionalIds.length} dipilih</span>
                </div>
              </div>

              {/* WORK CATEGORY SUMMARY BREAKDOWN */}
              {previewResult && (
                <div style={{ background: '#ffffff', borderRadius: '10px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                  <div style={{ padding: '8px 12px', background: '#F1F5F9', fontSize: '11px', fontWeight: 800, color: '#334155', textTransform: 'uppercase' }}>
                    Ringkasan Biaya per Kategori
                  </div>
                  <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                    {Object.entries(previewResult.categorySummaries).map(([cat, amt]) => (
                      <div
                        key={cat}
                        style={{
                          padding: '6px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          borderBottom: '1px solid #F1F5F9',
                          fontSize: '11px',
                        }}
                      >
                        <span style={{ color: '#475569', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {cat}
                        </span>
                        <span style={{ fontWeight: 700, fontFamily: 'monospace', color: '#0F172A' }}>
                          {formatRupiah(amt)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* VALIDATION & ERROR STATUS BOX */}
              {validationErrors.length > 0 ? (
                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '10px', fontSize: '11.5px', color: '#B91C1C' }}>
                  <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                    <AlertCircle size={14} /> Parameter Belum Lengkap:
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '16px' }}>
                    {validationErrors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', padding: '8px 10px', fontSize: '11px', color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={14} color="#16A34A" />
                  <span>Seluruh parameter valid & siap diterapkan ke proyek.</span>
                </div>
              )}
            </div>

            {/* ACTION BUTTONS (STICKY BOTTOM) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
              <button
                onClick={() => setShowItemDetailModal(true)}
                style={{
                  height: '34px',
                  borderRadius: '6px',
                  background: '#ffffff',
                  border: '1px solid #CBD5E1',
                  color: '#334155',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <Eye size={14} />
                <span>Lihat Rincian Item RAB ({previewResult?.items.length || 0})</span>
              </button>

              <button
                onClick={handleConfirm}
                disabled={!isValidToApply}
                style={{
                  height: '42px',
                  borderRadius: '8px',
                  background: isValidToApply ? '#2563EB' : '#94A3B8',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 800,
                  border: 'none',
                  cursor: isValidToApply ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: isValidToApply ? '0 4px 12px rgba(37,99,235,0.25)' : 'none',
                  transition: 'all 0.12s ease',
                }}
              >
                <span>Terapkan ke Proyek</span>
                <ArrowRight size={15} />
              </button>

              <button
                onClick={onClose}
                style={{
                  height: '32px',
                  borderRadius: '6px',
                  background: 'transparent',
                  border: 'none',
                  color: '#64748B',
                  fontSize: '11.5px',
                  cursor: 'pointer',
                }}
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* =======================================================================
          3. FULL ITEM DETAIL MODAL (Itemized WBS Table)
         ======================================================================= */}
      {showItemDetailModal && previewResult && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '20px',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '14px',
              width: '100%',
              maxWidth: '960px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAFC' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Rincian Item Pekerjaan RAB — {template.name} ({detailLevel})
                </h3>
                <span style={{ fontSize: '11.5px', color: '#64748B' }}>
                  Total: {previewResult.items.length} Item • {formatRupiah(previewResult.totalEstimate)}
                </span>
              </div>
              <button
                onClick={() => setShowItemDetailModal(false)}
                style={{ padding: '6px', border: 'none', background: '#E2E8F0', borderRadius: '6px', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid #CBD5E1', color: '#334155', fontWeight: 700 }}>
                    <th style={{ padding: '8px 10px', width: '36px' }}>No</th>
                    <th style={{ padding: '8px 10px' }}>Uraian Pekerjaan & WBS</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Volume</th>
                    <th style={{ padding: '8px 10px', width: '50px' }}>Satuan</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Harga Satuan</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Jumlah Harga</th>
                    <th style={{ padding: '8px 10px' }}>Kode AHSP</th>
                  </tr>
                </thead>
                <tbody>
                  {previewResult.items.map((item, idx) => (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        background: idx % 2 === 0 ? '#ffffff' : '#FAFAFA',
                      }}
                    >
                      <td style={{ padding: '7px 10px', color: '#64748B' }}>{idx + 1}</td>
                      <td style={{ padding: '7px 10px' }}>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>{item.description}</div>
                        <div style={{ fontSize: '10px', color: '#64748B' }}>{item.category}</div>
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#2563EB' }}>
                        {formatNumberId(item.volume, 2)}
                      </td>
                      <td style={{ padding: '7px 10px', color: '#475569' }}>{item.unit}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'monospace', color: '#475569' }}>
                        {formatRupiah(item.unitPrice)}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#0F172A' }}>
                        {formatRupiah(item.amount)}
                      </td>
                      <td style={{ padding: '7px 10px', fontSize: '10.5px', color: '#64748B', fontFamily: 'monospace' }}>
                        {item.ahspCode || 'SNI-2026'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', background: '#F8FAFC' }}>
              <button
                onClick={() => setShowItemDetailModal(false)}
                style={{
                  height: '32px',
                  padding: '0 16px',
                  borderRadius: '6px',
                  background: '#0F172A',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Tutup Rincian
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
