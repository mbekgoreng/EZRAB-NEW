import React, { useState, useMemo, useEffect } from 'react';
import {
  Layers,
  Search,
  Building,
  Home,
  Sparkles,
  ArrowRight,
  Plus,
  Milestone,
  Droplets,
  Building2,
  Hotel,
  HeartPulse,
  GraduationCap,
  Factory,
  Zap,
  Grid,
  Copy,
  Trash2,
  Eye,
  Settings,
  X,
  FileSpreadsheet,
  Trees,
  Cpu,
  RefreshCw
} from 'lucide-react';
import { Project } from '../../types';
import { RabTemplate, TemplateCategory, DetailLevel } from '../../types/rabTemplate';
import { RabTemplateService } from '../../services/rabTemplateService';
import { CustomTemplateBuilderModal } from './CustomTemplateBuilderModal';
import { ApplyTemplateModal } from './ApplyTemplateModal';
import { TemplatePreviewDrawer } from './TemplatePreviewDrawer';
import {
  GlobalEstimationSettingsModal,
  GlobalEstimationSettings
} from './GlobalEstimationSettingsModal';

interface TemplateRabCatalogViewProps {
  currentProject: Project | null;
  projects: Project[];
  onSelectTemplate?: (template: any) => void;
  onNavigateToTab: (tab: string, projectId?: string | null) => void;
  onCreateProjectWithTemplate?: (template: any) => void;
  onApplyTemplate?: (
    template: RabTemplate,
    params: Record<string, any>,
    targetProjectId?: string,
    newProjectMeta?: { name: string; buildingArea: number; floorCount: number },
    detailLevel?: DetailLevel,
    selectedOptionalItemIds?: string[]
  ) => void;
}

const CATEGORY_ITEMS: Array<{
  id: TemplateCategory | 'ALL';
  label: string;
  icon: any;
}> = [
  { id: 'ALL', label: 'Semua Sektor', icon: Layers },
  { id: 'RUMAH_TINGGAL', label: 'Rumah Tinggal', icon: Home },
  { id: 'JALAN_TRANSPORTASI', label: 'Jalan & Transportasi', icon: Milestone },
  { id: 'PERKERASAN', label: 'Perkerasan (Paving)', icon: Grid },
  { id: 'SDA_IRIGASI', label: 'SDA & Irigasi', icon: Droplets },
  { id: 'GEDUNG', label: 'Gedung', icon: Building2 },
  { id: 'BANGUNAN_TINGGI', label: 'Bangunan Tinggi', icon: Building },
  { id: 'HOTEL_HOSPITALITY', label: 'Hotel & Hospitality', icon: Hotel },
  { id: 'KESEHATAN', label: 'Kesehatan', icon: HeartPulse },
  { id: 'PENDIDIKAN', label: 'Pendidikan', icon: GraduationCap },
  { id: 'INDUSTRI', label: 'Industri', icon: Factory },
  { id: 'UTILITAS', label: 'Utilitas', icon: Zap },
  { id: 'LANDSCAPE_SITE', label: 'Landscape & Kawasan', icon: Trees },
  { id: 'MEP_SYSTEM', label: 'MEP & Utilitas Sistem', icon: Cpu },
  { id: 'RENOVASI_MAINTENANCE', label: 'Renovasi & Maintenance', icon: RefreshCw },
  { id: 'TEMPLATE_SAYA', label: 'Template Saya', icon: Sparkles }
];

export const TemplateRabCatalogView: React.FC<TemplateRabCatalogViewProps> = ({
  currentProject,
  projects,
  onSelectTemplate,
  onNavigateToTab,
  onCreateProjectWithTemplate,
  onApplyTemplate
}) => {
  // Navigation & Filter States
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | 'ALL'>('ALL');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('ALL');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'OFFICIAL' | 'USER'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'POPULAR' | 'NAME' | 'ITEMS'>('POPULAR');

  // Layar sempit (HP/tablet): layout 2 kolom jadi 1 kolom agar tidak overflow ke samping
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 900
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const onChange = () => setIsNarrow(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Reset subcategory selection when category changes
  useEffect(() => {
    setSelectedSubcategory('ALL');
  }, [selectedCategory]);

  // Universal Global Detail Level
  const [globalDetailLevel, setGlobalDetailLevel] = useState<DetailLevel>('PROFESSIONAL');

  // Global Settings Modal state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [globalSettings, setGlobalSettings] = useState<GlobalEstimationSettings>({
    detailLevel: 'PROFESSIONAL',
    priceSource: 'OFFICIAL_AHSP',
    wastePercent: 5,
    overheadPercent: 10,
    profitPercent: 5,
    taxPercent: 11
  });

  // Modal & Drawer States
  const [templates, setTemplates] = useState<RabTemplate[]>([]);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<RabTemplate | null>(null);
  const [applyingTemplate, setApplyingTemplate] = useState<RabTemplate | null>(null);
  const [previewingTemplate, setPreviewingTemplate] = useState<RabTemplate | null>(null);

  const tplService = useMemo(() => RabTemplateService.getInstance(), []);

  // Refresh templates list from service
  const refreshTemplates = () => {
    setTemplates(tplService.getAllTemplates());
  };

  useEffect(() => {
    refreshTemplates();
  }, [tplService]);

  // Compute category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: templates.length, TEMPLATE_SAYA: 0 };
    for (const t of templates) {
      if (t.metadata.source === 'USER_TEMPLATE' || t.metadata.source === 'USER' || t.category === 'TEMPLATE_SAYA') {
        counts['TEMPLATE_SAYA'] = (counts['TEMPLATE_SAYA'] || 0) + 1;
      }
      counts[t.category] = (counts[t.category] || 0) + 1;
    }
    return counts;
  }, [templates]);

  // Derive dynamic subcategories for active category
  const availableSubcategories = useMemo(() => {
    const subcats = new Set<string>();
    for (const t of templates) {
      if (selectedCategory !== 'ALL') {
        if (selectedCategory === 'TEMPLATE_SAYA') {
          const isUser = t.metadata.source === 'USER_TEMPLATE' || t.metadata.source === 'USER' || t.category === 'TEMPLATE_SAYA';
          if (isUser && t.subcategory) subcats.add(t.subcategory);
        } else if (t.category === selectedCategory && t.subcategory) {
          subcats.add(t.subcategory);
        }
      } else if (t.subcategory) {
        subcats.add(t.subcategory);
      }
    }
    return Array.from(subcats).sort();
  }, [templates, selectedCategory]);

  // Filtered & Sorted Templates
  const filteredTemplates = useMemo(() => {
    let list = templates.filter(tpl => {
      // Category Match
      if (selectedCategory !== 'ALL') {
        if (selectedCategory === 'TEMPLATE_SAYA') {
          const isUser = tpl.metadata.source === 'USER_TEMPLATE' || tpl.metadata.source === 'USER' || tpl.category === 'TEMPLATE_SAYA';
          if (!isUser) return false;
        } else if (tpl.category !== selectedCategory) {
          return false;
        }
      }

      // Subcategory Filter
      if (selectedSubcategory !== 'ALL') {
        if (tpl.subcategory !== selectedSubcategory) {
          return false;
        }
      }

      // Source Filter
      if (sourceFilter === 'OFFICIAL' && tpl.metadata.source !== 'EZRAB_OFFICIAL') {
        return false;
      }
      if (sourceFilter === 'USER') {
        const isUser = tpl.metadata.source === 'USER_TEMPLATE' || tpl.metadata.source === 'USER';
        if (!isUser) return false;
      }

      // Comprehensive Search Query (Name, ID/Code, Category, Subcategory, Parameters, Work Items, AHSP)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchId = tpl.id.toLowerCase().includes(q);
        const matchName = tpl.name.toLowerCase().includes(q);
        const matchDesc = tpl.description ? tpl.description.toLowerCase().includes(q) : false;
        const matchCat = tpl.category.toLowerCase().replace(/_/g, ' ').includes(q);
        const matchSub = tpl.subcategory ? tpl.subcategory.toLowerCase().includes(q) : false;
        const matchParam = tpl.parameters.some(p => p.label.toLowerCase().includes(q) || p.key.toLowerCase().includes(q));
        const matchComp = tpl.components?.some(c =>
          c.name.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q) ||
          (c.ahspCode && c.ahspCode.toLowerCase().includes(q))
        );
        if (!matchId && !matchName && !matchDesc && !matchCat && !matchSub && !matchParam && !matchComp) {
          return false;
        }
      }

      return true;
    });

    // Sort
    if (sortBy === 'NAME') {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'ITEMS') {
      list = [...list].sort((a, b) => (b.components?.length || 0) - (a.components?.length || 0));
    }

    return list;
  }, [templates, selectedCategory, selectedSubcategory, sourceFilter, searchQuery, sortBy]);

  // Action Handlers
  const handleOpenBuilder = (templateToEdit?: RabTemplate) => {
    setEditingTemplate(templateToEdit || null);
    setIsBuilderOpen(true);
  };

  const handleDuplicate = (tpl: RabTemplate, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const duplicated = tplService.duplicateTemplate(tpl.id);
      refreshTemplates();
      alert(`Template "${tpl.name}" berhasil diduplikasi ke "Template Saya".`);
    } catch (err: any) {
      alert(`Gagal menduplikasi: ${err.message}`);
    }
  };

  const handleDelete = (tpl: RabTemplate, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (confirm(`Yakin ingin menghapus template "${tpl.name}"?`)) {
      try {
        tplService.deleteCustomTemplate(tpl.id);
        refreshTemplates();
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  const handleApplyClick = (tpl: RabTemplate, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setApplyingTemplate(tpl);
  };

  const handlePreviewClick = (tpl: RabTemplate, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setPreviewingTemplate(tpl);
  };

  const handleConfirmApply = (
    tpl: RabTemplate,
    params: Record<string, any>,
    targetProjectId?: string,
    newProjectMeta?: { name: string; buildingArea: number; floorCount: number },
    detailLevel?: DetailLevel,
    selectedOptionalItemIds?: string[]
  ) => {
    if (onApplyTemplate) {
      onApplyTemplate(
        tpl,
        params,
        targetProjectId,
        newProjectMeta,
        detailLevel || globalDetailLevel,
        selectedOptionalItemIds
      );
    } else if (targetProjectId && onSelectTemplate) {
      onSelectTemplate(tpl);
    } else if (onCreateProjectWithTemplate) {
      onCreateProjectWithTemplate(tpl);
    }
  };

  const getCategoryIcon = (cat: TemplateCategory) => {
    switch (cat) {
      case 'RUMAH_TINGGAL': return Home;
      case 'JALAN_TRANSPORTASI': return Milestone;
      case 'PERKERASAN': return Grid;
      case 'SDA_IRIGASI': return Droplets;
      case 'GEDUNG': return Building2;
      case 'BANGUNAN_TINGGI': return Building;
      case 'HOTEL_HOSPITALITY': return Hotel;
      case 'KESEHATAN': return HeartPulse;
      case 'PENDIDIKAN': return GraduationCap;
      case 'INDUSTRI': return Factory;
      case 'UTILITAS': return Zap;
      case 'LANDSCAPE_SITE': return Trees;
      case 'MEP_SYSTEM': return Cpu;
      case 'RENOVASI_MAINTENANCE': return RefreshCw;
      default: return Layers;
    }
  };

  return (
    <div
      style={{
        maxWidth: '1600px',
        margin: '0 auto',
        padding: '16px 20px',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        display: 'flex',
        flexDirection: 'column',
        gap: '14px'
      }}
    >
      {/* 1. COMPACT PROFESSIONAL HEADER (Height ~75px) */}
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: '#EFF6FF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#2563EB'
            }}
          >
            <FileSpreadsheet size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Template RAB Konstruksi
              </h1>
              <span
                style={{
                  fontSize: '10.5px',
                  fontWeight: 700,
                  background: '#2563EB',
                  color: '#FFFFFF',
                  padding: '2px 8px',
                  borderRadius: '5px'
                }}
              >
                PUPR 2026
              </span>
            </div>
            <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0' }}>
              Library estimasi multi-sektor dengan QTO deterministik & ekosistem material terverifikasi.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {currentProject && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '8px',
                background: '#F0FDF4',
                border: '1px solid #BBF7D0',
                fontSize: '11.5px',
                color: '#166534',
                fontWeight: 650
              }}
            >
              <Building size={14} color="#16A34A" />
              <span>Proyek: {currentProject.name}</span>
            </div>
          )}

          <button
            onClick={() => setIsSettingsOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              background: '#FFFFFF',
              color: '#334155',
              fontSize: '12px',
              fontWeight: 650,
              cursor: 'pointer'
            }}
          >
            <Settings size={14} color="#64748B" />
            <span>Pengaturan Estimasi</span>
          </button>

          <button
            onClick={() => handleOpenBuilder()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: '#2563EB',
              color: '#FFFFFF',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)'
            }}
          >
            <Plus size={15} />
            <span>+ Buat Template Custom</span>
          </button>
        </div>
      </div>

      {/* 2. UNIVERSAL TOP TOOLBAR (Search + Global Detail Level + Filters + Sort) */}
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
        }}
      >
        {/* Search Bar */}
        <div style={{ position: 'relative', width: '320px', maxWidth: '100%' }}>
          <Search
            size={15}
            color="#94A3B8"
            style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}
          />
          <input
            type="text"
            placeholder="Cari template, pekerjaan, atau material..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '7px 10px 7px 32px',
              borderRadius: '7px',
              border: '1px solid #CBD5E1',
              fontSize: '12.5px',
              outline: 'none'
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: '#94A3B8',
                cursor: 'pointer'
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Global Universal Detail Level Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Tingkat Detail:
          </span>
          <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '8px', padding: '2px' }}>
            {[
              { id: 'STANDARD', label: 'Standard', tip: 'Pekerjaan Utama' },
              { id: 'PROFESSIONAL', label: 'Professional', tip: 'Utama + Pendukung' },
              { id: 'COMPREHENSIVE', label: 'Comprehensive', tip: 'Lengkap + Aksesoris' }
            ].map(lvl => {
              const isSelected = globalDetailLevel === lvl.id;
              return (
                <button
                  key={lvl.id}
                  onClick={() => setGlobalDetailLevel(lvl.id as DetailLevel)}
                  title={lvl.tip}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: isSelected ? '#2563EB' : 'transparent',
                    color: isSelected ? '#FFFFFF' : '#475569',
                    fontSize: '11.5px',
                    fontWeight: isSelected ? 700 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {lvl.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Source Filter & Sort Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {[
              { id: 'ALL', label: 'Semua' },
              { id: 'OFFICIAL', label: 'Official' },
              { id: 'USER', label: 'Saya' }
            ].map(sf => {
              const isAct = sourceFilter === sf.id;
              return (
                <button
                  key={sf.id}
                  onClick={() => setSourceFilter(sf.id as any)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '6px',
                    fontSize: '11.5px',
                    fontWeight: isAct ? 700 : 500,
                    border: isAct ? '1px solid #BFDBFE' : '1px solid transparent',
                    background: isAct ? '#EFF6FF' : 'transparent',
                    color: isAct ? '#2563EB' : '#64748B',
                    cursor: 'pointer'
                  }}
                >
                  {sf.label}
                </button>
              );
            })}
          </div>

          <div style={{ height: '16px', width: '1px', background: '#E2E8F0' }} />

          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            style={{
              padding: '5px 8px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              fontSize: '11.5px',
              background: '#FFFFFF',
              color: '#334155'
            }}
          >
            <option value="POPULAR">Paling Populer</option>
            <option value="NAME">Nama (A - Z)</option>
            <option value="ITEMS">Jumlah Item Terbanyak</option>
          </select>
        </div>
      </div>

      {/* 3. TWO-COLUMN LAYOUT: SIDEBAR (240px) + CONTENT GRID */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexDirection: isNarrow ? 'column' : 'row' }}>
        
        {/* Left Category Sidebar (240px) */}
        <div
          style={{
            width: isNarrow ? '100%' : '240px',
            flexShrink: 0,
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            padding: '12px',
            display: 'flex',
            flexDirection: isNarrow ? 'row' : 'column',
            gap: '4px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
            overflowX: isNarrow ? 'auto' : 'visible',
            alignItems: isNarrow ? 'center' : 'stretch',
            scrollbarWidth: 'none'
          }}
        >
          {!isNarrow && (
          <div style={{ padding: '4px 8px 8px', fontSize: '11px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Kategori Konstruksi
          </div>
          )}

          {CATEGORY_ITEMS.map(cat => {
            const isSelected = selectedCategory === cat.id;
            const Icon = cat.icon;
            const count = categoryCounts[cat.id] || 0;

            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: 'none',
                  background: isSelected ? '#EFF6FF' : 'transparent',
                  color: isSelected ? '#1E40AF' : '#334155',
                  fontWeight: isSelected ? 700 : 500,
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.15s ease',
                  ...(isNarrow ? { whiteSpace: 'nowrap' as const, flexShrink: 0 } : {})
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Icon size={15} color={isSelected ? '#2563EB' : '#64748B'} />
                  <span>{cat.label}</span>
                </div>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 650,
                    padding: '1px 6px',
                    borderRadius: '10px',
                    background: isSelected ? '#2563EB' : '#F1F5F9',
                    color: isSelected ? '#FFFFFF' : '#64748B'
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}

          {!isNarrow && <div style={{ borderTop: '1px solid #F1F5F9', margin: '8px 0', paddingTop: '8px' }}>
            <div style={{ padding: '0 8px 6px', fontSize: '10.5px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>
              Mulai Cepat
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
              {[
                { id: 'RUMAH_TINGGAL', label: 'Rumah' },
                { id: 'JALAN_TRANSPORTASI', label: 'Jalan' },
                { id: 'PERKERASAN', label: 'Paving' },
                { id: 'GEDUNG', label: 'Gedung' },
                { id: 'SDA_IRIGASI', label: 'SDA' },
                { id: 'HOTEL_HOSPITALITY', label: 'Hotel' }
              ].map(q => (
                <button
                  key={q.id}
                  onClick={() => setSelectedCategory(q.id as any)}
                  style={{
                    padding: '5px 8px',
                    borderRadius: '6px',
                    border: '1px solid #E2E8F0',
                    background: '#F8FAFC',
                    fontSize: '11px',
                    color: '#475569',
                    cursor: 'pointer',
                    textAlign: 'center'
                  }}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>}
        </div>

        {/* Right Content Area: Template Grid */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          {/* Active Category Heading & Stats */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                {CATEGORY_ITEMS.find(c => c.id === selectedCategory)?.label || 'Koleksi Template'}
              </h2>
              <span style={{ fontSize: '12px', color: '#64748B' }}>
                ({filteredTemplates.length} template tersedia)
              </span>
            </div>

            <span style={{ fontSize: '11.5px', color: '#64748B' }}>
              Mode Aktif: <strong style={{ color: '#2563EB' }}>{globalDetailLevel}</strong>
            </span>
          </div>

          {/* Dynamic Subcategory Filter Pills */}
          {availableSubcategories.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                overflowX: 'auto',
                padding: '4px 2px 8px',
                scrollbarWidth: 'thin'
              }}
            >
              <button
                onClick={() => setSelectedSubcategory('ALL')}
                style={{
                  padding: '5px 12px',
                  borderRadius: '20px',
                  fontSize: '11.5px',
                  fontWeight: selectedSubcategory === 'ALL' ? 700 : 500,
                  background: selectedSubcategory === 'ALL' ? '#1E293B' : '#FFFFFF',
                  color: selectedSubcategory === 'ALL' ? '#FFFFFF' : '#475569',
                  border: selectedSubcategory === 'ALL' ? 'none' : '1px solid #CBD5E1',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  boxShadow: selectedSubcategory === 'ALL' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                Semua Subkategori ({selectedCategory === 'ALL' ? templates.length : (categoryCounts[selectedCategory] || 0)})
              </button>
              {availableSubcategories.map(subcat => {
                const subcatCount = templates.filter(t => {
                  if (selectedCategory !== 'ALL') {
                    if (selectedCategory === 'TEMPLATE_SAYA') {
                      const isUser = t.metadata.source === 'USER_TEMPLATE' || t.metadata.source === 'USER' || t.category === 'TEMPLATE_SAYA';
                      return isUser && t.subcategory === subcat;
                    }
                    return t.category === selectedCategory && t.subcategory === subcat;
                  }
                  return t.subcategory === subcat;
                }).length;

                const isSelected = selectedSubcategory === subcat;

                return (
                  <button
                    key={subcat}
                    onClick={() => setSelectedSubcategory(subcat)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '20px',
                      fontSize: '11.5px',
                      fontWeight: isSelected ? 700 : 500,
                      background: isSelected ? '#2563EB' : '#FFFFFF',
                      color: isSelected ? '#FFFFFF' : '#475569',
                      border: isSelected ? 'none' : '1px solid #CBD5E1',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: isSelected ? '0 2px 4px rgba(37,99,235,0.2)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span>{subcat}</span>
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '1px 5px',
                        borderRadius: '8px',
                        background: isSelected ? 'rgba(255,255,255,0.25)' : '#F1F5F9',
                        color: isSelected ? '#FFFFFF' : '#64748B'
                      }}
                    >
                      {subcatCount}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Grid Cards */}
          {filteredTemplates.length === 0 ? (
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                padding: '48px 24px',
                textAlign: 'center'
              }}
            >
              <Building size={36} color="#94A3B8" style={{ margin: '0 auto 10px' }} />
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
                Belum ada template pada kategori ini
              </h3>
              <p style={{ fontSize: '12.5px', color: '#64748B', margin: '0 0 14px 0' }}>
                Anda dapat membuat template kustom sendiri dengan formula dan parameter fleksibel.
              </p>
              <button
                onClick={() => handleOpenBuilder()}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: '#2563EB',
                  color: '#FFFFFF',
                  fontSize: '12px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                + Buat Template Custom
              </button>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(auto-fill, minmax(${isNarrow ? 160 : 290}px, 1fr))`,
                gap: '12px'
              }}
            >
              {filteredTemplates.map(tpl => {
                const Icon = getCategoryIcon(tpl.category);
                const isUser = tpl.metadata.source === 'USER_TEMPLATE' || tpl.metadata.source === 'USER';

                // Real-time calculation based on global detail level
                const defaultParams: Record<string, any> = {};
                for (const p of tpl.parameters) {
                  defaultParams[p.key] = p.defaultValue !== undefined ? p.defaultValue : 0;
                }
                let previewRes = null;
                try {
                  previewRes = tplService.generateRabFromTemplate(tpl, defaultParams, undefined, globalDetailLevel);
                } catch {}

                return (
                  <div
                    key={tpl.id}
                    style={{
                      background: '#FFFFFF',
                      borderRadius: '12px',
                      border: isUser ? '1px solid #BFDBFE' : '1px solid #E2E8F0',
                      padding: '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                      transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                      position: 'relative'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.boxShadow = '0 6px 14px rgba(0, 0, 0, 0.08)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.04)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div>
                      {/* Card Top Row: Badge & Category */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div
                            style={{
                              width: '26px',
                              height: '26px',
                              borderRadius: '6px',
                              background: '#EFF6FF',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#2563EB'
                            }}
                          >
                            <Icon size={14} />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
                              {tpl.category.replace(/_/g, ' ')}
                            </span>
                            {tpl.subcategory && (
                              <>
                                <span style={{ color: '#CBD5E1', fontSize: '10px' }}>•</span>
                                <span
                                  style={{
                                    fontSize: '10px',
                                    fontWeight: 600,
                                    color: '#2563EB',
                                    background: '#EFF6FF',
                                    padding: '1px 6px',
                                    borderRadius: '4px'
                                  }}
                                >
                                  {tpl.subcategory}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: isUser ? '#FEF3C7' : '#F1F5F9',
                            color: isUser ? '#B45309' : '#64748B'
                          }}
                        >
                          {isUser ? 'Template Saya' : tpl.badge || 'Official'}
                        </span>
                      </div>

                      {/* Title */}
                      <h3
                        style={{
                          fontSize: '14.5px',
                          fontWeight: 750,
                          color: '#0F172A',
                          margin: '0 0 4px 0',
                          lineHeight: 1.3
                        }}
                      >
                        {tpl.name}
                      </h3>

                      {/* Short Description */}
                      {tpl.description && (
                        <p
                          style={{
                            fontSize: '11px',
                            color: '#64748B',
                            margin: '0 0 8px 0',
                            lineHeight: 1.35,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden'
                          }}
                        >
                          {tpl.description}
                        </p>
                      )}

                      {/* Primary Dynamic Parameters Summary (Universal for ANY domain) */}
                      <div style={{ fontSize: '11px', color: '#475569', marginBottom: '10px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                        {tpl.parameters.slice(0, 3).map((p, idx) => (
                          <div
                            key={p.id || p.key}
                            style={{
                              background: '#F8FAFC',
                              border: '1px solid #E2E8F0',
                              borderRadius: '4px',
                              padding: '2px 6px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '10.5px'
                            }}
                          >
                            <span style={{ color: '#64748B' }}>{p.label}:</span>
                            <span style={{ fontWeight: 650, color: '#1E293B' }}>{String(p.defaultValue ?? '-')} {p.unit || ''}</span>
                          </div>
                        ))}
                        {tpl.parameters.length > 3 && (
                          <span style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600 }}>
                            +{tpl.parameters.length - 3} lagi
                          </span>
                        )}
                      </div>

                      {/* Live Calculation Info */}
                      {previewRes && (
                        <div
                          style={{
                            background: '#F8FAFC',
                            borderRadius: '8px',
                            padding: '8px 10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: '10px',
                            border: '1px solid #F1F5F9'
                          }}
                        >
                          <div>
                            <span style={{ fontSize: '10px', color: '#64748B', display: 'block' }}>
                              Est. Total ({globalDetailLevel})
                            </span>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>
                              Rp {previewRes.totalEstimate.toLocaleString('id-ID')}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {previewRes.categorySummaries && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 650,
                                  background: '#F1F5F9',
                                  color: '#475569',
                                  padding: '2px 5px',
                                  borderRadius: '4px'
                                }}
                              >
                                {Object.keys(previewRes.categorySummaries).length} Paket
                              </span>
                            )}
                            <span
                              style={{
                                fontSize: '10.5px',
                                fontWeight: 700,
                                background: '#DCFCE7',
                                color: '#15803D',
                                padding: '2px 6px',
                                borderRadius: '4px'
                              }}
                            >
                              {previewRes.itemCount} Item
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bottom Actions */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingTop: '8px',
                        borderTop: '1px solid #F1F5F9',
                        gap: '6px'
                      }}
                    >
                      <button
                        onClick={e => handlePreviewClick(tpl, e)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: '1px solid #E2E8F0',
                          background: '#FFFFFF',
                          color: '#475569',
                          fontSize: '11px',
                          fontWeight: 650,
                          cursor: 'pointer'
                        }}
                      >
                        <Eye size={12} />
                        <span>Preview</span>
                      </button>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <button
                          onClick={e => handleDuplicate(tpl, e)}
                          style={{
                            padding: '6px',
                            borderRadius: '6px',
                            border: '1px solid #E2E8F0',
                            background: '#FFFFFF',
                            color: '#64748B',
                            cursor: 'pointer'
                          }}
                          title="Duplikat Template"
                        >
                          <Copy size={12} />
                        </button>

                        {isUser && (
                          <button
                            onClick={e => handleDelete(tpl, e)}
                            style={{
                              padding: '6px',
                              borderRadius: '6px',
                              border: '1px solid #FEE2E2',
                              background: '#FEF2F2',
                              color: '#DC2626',
                              cursor: 'pointer'
                            }}
                            title="Hapus Template"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}

                        <button
                          onClick={e => handleApplyClick(tpl, e)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: 'none',
                            background: '#2563EB',
                            color: '#FFFFFF',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          <span>Gunakan</span>
                          <ArrowRight size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 4. MODALS & DRAWERS */}
      {/* Work Package Preview Drawer */}
      {previewingTemplate && (
        <TemplatePreviewDrawer
          template={previewingTemplate}
          isOpen={!!previewingTemplate}
          onClose={() => setPreviewingTemplate(null)}
          initialDetailLevel={globalDetailLevel}
          onUseTemplate={(tpl, lvl) => {
            setPreviewingTemplate(null);
            setApplyingTemplate(tpl);
          }}
        />
      )}

      {/* Custom Template Builder Modal */}
      {isBuilderOpen && (
        <CustomTemplateBuilderModal
          initialTemplate={editingTemplate}
          isOpen={isBuilderOpen}
          onClose={() => {
            setIsBuilderOpen(false);
            setEditingTemplate(null);
          }}
          onSaved={() => {
            refreshTemplates();
            setIsBuilderOpen(false);
            setEditingTemplate(null);
          }}
        />
      )}

      {/* Universal Workstation Template Configurator Modal */}
      {applyingTemplate && (
        <ApplyTemplateModal
          template={applyingTemplate}
          currentProject={currentProject}
          projects={projects}
          isOpen={!!applyingTemplate}
          onClose={() => setApplyingTemplate(null)}
          onConfirmApply={handleConfirmApply}
        />
      )}

      {/* Global Estimation Settings Modal */}
      {isSettingsOpen && (
        <GlobalEstimationSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settings={globalSettings}
          onSave={newSettings => {
            setGlobalSettings(newSettings);
            setGlobalDetailLevel(newSettings.detailLevel);
          }}
        />
      )}
    </div>
  );
};
