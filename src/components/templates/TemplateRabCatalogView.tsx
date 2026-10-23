import React, { useState, useMemo, useEffect } from 'react';
import {
  Layers,
  Search,
  Building,
  Home,
  Sparkles,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
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
  RefreshCw,
  Anchor,
  Construction,
  Droplet,
  Mountain,
  Hammer,
  PaintRoller,
  Umbrella,
  Tractor,
  Ship,
  Trophy,
  Wrench,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';
import { Project } from '../../types';
import { RabTemplate, TemplateCategory, DetailLevel, TemplateMappingReadiness } from '../../types/rabTemplate';
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
  // Katalog 180 (Fase B/H): 11 kategori sektor baru.
  { id: 'PONDASI_GEOTEKNIK', label: 'Pondasi & Geoteknik', icon: Anchor },
  { id: 'JEMBATAN_STRUKTUR', label: 'Jembatan & Struktur Khusus', icon: Construction },
  { id: 'DRAINASE_SANITASI', label: 'Drainase & Sanitasi', icon: Droplet },
  { id: 'PEKERJAAN_TANAH', label: 'Pekerjaan Tanah', icon: Mountain },
  { id: 'STRUKTUR_BETON_BAJA', label: 'Struktur Beton & Baja', icon: Hammer },
  { id: 'FINISHING_INTERIOR', label: 'Finishing & Interior', icon: PaintRoller },
  { id: 'ATAP_WATERPROOFING', label: 'Atap & Waterproofing', icon: Umbrella },
  { id: 'PERTANIAN_PERKEBUNAN', label: 'Pertanian & Perkebunan', icon: Tractor },
  { id: 'PELABUHAN_PESISIR', label: 'Pelabuhan & Pesisir', icon: Ship },
  { id: 'FASILITAS_OLAHRAGA', label: 'Fasilitas Olahraga', icon: Trophy },
  { id: 'DEMOLISI_REKONSTRUKSI', label: 'Demolisi & Rekonstruksi', icon: Wrench },
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
  // Minimalis: strip subkategori dilipat (maks 8 pill) secara default
  const [subcatExpanded, setSubcatExpanded] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'OFFICIAL' | 'USER'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'POPULAR' | 'NAME' | 'ITEMS'>('POPULAR');

  // Popularitas = jumlah pemakaian NYATA di perangkat ini (localStorage),
  // dicatat setiap template benar-benar diterapkan. Dulu sort 'POPULAR'
  // adalah no-op (tidak ada cabang pengurutan dan tidak ada data pemakaian).
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem('ezrab_template_usage_v1');
      return raw ? (JSON.parse(raw) as Record<string, number>) : {};
    } catch {
      return {};
    }
  });
  const recordTemplateUsage = (templateId: string) => {
    setUsageCounts((prev) => {
      const next = { ...prev, [templateId]: (prev[templateId] || 0) + 1 };
      try {
        localStorage.setItem('ezrab_template_usage_v1', JSON.stringify(next));
      } catch {
        /* abaikan */
      }
      return next;
    });
  };

  // Pagination (tombol Sebelumnya / Berikutnya)
  const PAGE_SIZE = 12;
  const [currentPage, setCurrentPage] = useState(1);

  // Reset halaman ke 1 setiap filter berubah
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory, selectedSubcategory, sourceFilter, searchQuery, sortBy]);

  // Reset subcategory selection when category changes
  useEffect(() => {
    setSelectedSubcategory('ALL');
    setSubcatExpanded(false);
  }, [selectedCategory]);

  // Universal Global Detail Level
  const [globalDetailLevel, setGlobalDetailLevel] = useState<DetailLevel>('PROFESSIONAL');

  // Global Settings Modal state — dipersistenkan ke localStorage (dulu hilang
  // setiap reload) dan diteruskan ke konfigurator untuk perhitungan total.
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [globalSettings, setGlobalSettings] = useState<GlobalEstimationSettings>(() => {
    const defaults: GlobalEstimationSettings = {
      detailLevel: 'PROFESSIONAL',
      priceSource: 'OFFICIAL_AHSP',
      wastePercent: 5,
      overheadPercent: 10,
      profitPercent: 5,
      taxPercent: 11
    };
    try {
      const raw = localStorage.getItem('ezrab_global_estimation_settings_v1');
      return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<GlobalEstimationSettings>) } : defaults;
    } catch {
      return defaults;
    }
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

  // Minimalis: maks 8 pill subkategori tampil; sisanya di balik pengalih
  // "+N lainnya". Subkategori yang sedang aktif selalu disisipkan ke daftar
  // tampak walau berada di luar 8 pertama, agar filter aktif tak hilang visual.
  const MAX_VISIBLE_SUBCATEGORIES = 8;
  const visibleSubcategories = useMemo(() => {
    if (subcatExpanded || availableSubcategories.length <= MAX_VISIBLE_SUBCATEGORIES) {
      return availableSubcategories;
    }
    const first = availableSubcategories.slice(0, MAX_VISIBLE_SUBCATEGORIES);
    if (
      selectedSubcategory !== 'ALL' &&
      availableSubcategories.includes(selectedSubcategory) &&
      !first.includes(selectedSubcategory)
    ) {
      return [...first, selectedSubcategory];
    }
    return first;
  }, [availableSubcategories, subcatExpanded, selectedSubcategory]);
  const hiddenSubcategoryCount = availableSubcategories.length - visibleSubcategories.length;

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
    } else if (sortBy === 'POPULAR') {
      list = [...list].sort((a, b) => {
        const diff = (usageCounts[b.id] || 0) - (usageCounts[a.id] || 0);
        return diff !== 0 ? diff : a.name.localeCompare(b.name);
      });
    }

    return list;
  }, [templates, selectedCategory, selectedSubcategory, sourceFilter, searchQuery, sortBy, usageCounts]);

  // Paginated slice
  const totalPages = Math.max(1, Math.ceil(filteredTemplates.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedTemplates = filteredTemplates.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

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
    recordTemplateUsage(tpl.id);
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
      // Katalog 180: ikon 11 kategori sektor baru.
      case 'PONDASI_GEOTEKNIK': return Anchor;
      case 'JEMBATAN_STRUKTUR': return Construction;
      case 'DRAINASE_SANITASI': return Droplet;
      case 'PEKERJAAN_TANAH': return Mountain;
      case 'STRUKTUR_BETON_BAJA': return Hammer;
      case 'FINISHING_INTERIOR': return PaintRoller;
      case 'ATAP_WATERPROOFING': return Umbrella;
      case 'PERTANIAN_PERKEBUNAN': return Tractor;
      case 'PELABUHAN_PESISIR': return Ship;
      case 'FASILITAS_OLAHRAGA': return Trophy;
      case 'DEMOLISI_REKONSTRUKSI': return Wrench;
      default: return Layers;
    }
  };

  return (
    <div
      style={{
        maxWidth: '1600px',
        width: '100%',
        boxSizing: 'border-box',
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
          background: 'var(--ez-color-surface)',
          borderRadius: 'var(--ez-radius-card)',
          border: '1px solid var(--ez-color-border)',
          padding: '18px 24px',
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
              background: 'var(--ez-hue-blue-bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ez-color-primary)'
            }}
          >
            <FileSpreadsheet size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: 0, letterSpacing: '-0.3px', fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif" }}>
                Template RAB Konstruksi
              </h1>
              <span
                style={{
                  fontSize: '10.5px',
                  fontWeight: 700,
                  background: 'var(--ez-color-primary)',
                  color: '#FFFFFF',
                  padding: '2px 8px',
                  borderRadius: '5px'
                }}
              >
                PUPR 2026
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', margin: '2px 0 0' }}>
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
                background: 'var(--ez-hue-green-bg)',
                border: '1px solid var(--ez-hue-green-border)',
                fontSize: '11.5px',
                color: 'var(--ez-hue-green-text-deep)',
                fontWeight: 650
              }}
            >
              <Building size={14} color="var(--ez-hue-green-text-bright)" />
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
              border: '1px solid var(--ez-hue-slate-border)',
              background: 'var(--ez-color-surface)',
              color: 'var(--ez-color-text-body)',
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
              background: 'var(--ez-color-primary)',
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
          background: 'var(--ez-color-surface)',
          borderRadius: 'var(--ez-radius-card)',
          border: '1px solid var(--ez-color-border)',
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
              border: '1px solid var(--ez-hue-slate-border)',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Tingkat Detail:
          </span>
          <div style={{ display: 'flex', background: 'var(--ez-color-surface-tertiary)', borderRadius: '8px', padding: '2px' }}>
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
                    background: isSelected ? 'var(--ez-color-primary)' : 'transparent',
                    color: isSelected ? '#FFFFFF' : 'var(--ez-color-text-slate)',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
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
                    border: isAct ? '1px solid var(--ez-hue-blue-border)' : '1px solid transparent',
                    background: isAct ? 'var(--ez-hue-blue-bg)' : 'transparent',
                    color: isAct ? 'var(--ez-color-primary)' : 'var(--ez-color-text-muted)',
                    cursor: 'pointer'
                  }}
                >
                  {sf.label}
                </button>
              );
            })}
          </div>

          <div style={{ height: '16px', width: '1px', background: 'var(--ez-color-border-line)' }} />

          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            style={{
              padding: '5px 8px',
              borderRadius: '6px',
              border: '1px solid var(--ez-hue-slate-border)',
              fontSize: '11.5px',
              background: 'var(--ez-color-surface)',
              color: 'var(--ez-color-text-body)'
            }}
          >
            <option value="POPULAR">Paling Sering Saya Gunakan</option>
            <option value="NAME">Nama (A - Z)</option>
            <option value="ITEMS">Jumlah Item Terbanyak</option>
          </select>
        </div>
      </div>

      {/* 3. TWO-COLUMN LAYOUT: SIDEBAR (240px) + CONTENT GRID */}
      <style>{`
        @media (max-width: 900px) {
          .tpl-rab-layout { flex-direction: column !important; }
          .tpl-rab-sidebar { width: 100% !important; box-sizing: border-box; }
        }
      `}</style>
      <div className="tpl-rab-layout" style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', width: '100%', boxSizing: 'border-box' }}>
        
        {/* Left Category Sidebar (240px) */}
        <div
          className="tpl-rab-sidebar"
          style={{
            width: '240px',
            flexShrink: 0,
            background: 'var(--ez-color-surface)',
            borderRadius: 'var(--ez-radius-card)',
            border: '1px solid var(--ez-color-border)',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
          }}
        >
          <div style={{ padding: '4px 8px 8px', fontSize: '11px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Kategori Konstruksi
          </div>

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
                  background: isSelected ? 'var(--ez-hue-blue-bg)' : 'transparent',
                  color: isSelected ? 'var(--ez-hue-blue-text-deep)' : 'var(--ez-color-text-body)',
                  fontWeight: isSelected ? 700 : 500,
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.15s ease'
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
                    background: isSelected ? 'var(--ez-color-primary)' : 'var(--ez-color-surface-tertiary)',
                    color: isSelected ? '#FFFFFF' : 'var(--ez-color-text-muted)'
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}

          <div style={{ borderTop: '1px solid var(--ez-color-surface-tertiary)', margin: '8px 0', paddingTop: '8px' }}>
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
                    border: '1px solid var(--ez-color-border-line)',
                    background: 'var(--ez-color-surface-secondary)',
                    fontSize: '11px',
                    color: 'var(--ez-color-text-slate)',
                    cursor: 'pointer',
                    textAlign: 'center'
                  }}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Content Area: Template Grid */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          {/* Active Category Heading & Stats */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: 0 }}>
                {CATEGORY_ITEMS.find(c => c.id === selectedCategory)?.label || 'Koleksi Template'}
              </h2>
              <span style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)' }}>
                ({filteredTemplates.length} template tersedia)
              </span>
            </div>

            <span style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)' }}>
              Mode Aktif: <strong style={{ color: 'var(--ez-color-primary)' }}>{globalDetailLevel}</strong>
            </span>
          </div>

          {/* Dynamic Subcategory Filter Pills */}
          {availableSubcategories.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                flexWrap: 'wrap',
                padding: '4px 2px 8px'
              }}
            >
              <button
                onClick={() => setSelectedSubcategory('ALL')}
                style={{
                  padding: '5px 12px',
                  borderRadius: '20px',
                  fontSize: '11.5px',
                  fontWeight: selectedSubcategory === 'ALL' ? 700 : 500,
                  background: selectedSubcategory === 'ALL' ? '#1E293B' : 'var(--ez-color-surface)',
                  color: selectedSubcategory === 'ALL' ? '#FFFFFF' : 'var(--ez-color-text-slate)',
                  border: selectedSubcategory === 'ALL' ? 'none' : '1px solid var(--ez-hue-slate-border)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  boxShadow: selectedSubcategory === 'ALL' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                Semua Subkategori ({selectedCategory === 'ALL' ? templates.length : (categoryCounts[selectedCategory] || 0)})
              </button>
              {visibleSubcategories.map(subcat => {
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
                      background: isSelected ? 'var(--ez-color-primary)' : 'var(--ez-color-surface)',
                      color: isSelected ? '#FFFFFF' : 'var(--ez-color-text-slate)',
                      border: isSelected ? 'none' : '1px solid var(--ez-hue-slate-border)',
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
                        background: isSelected ? 'rgba(255,255,255,0.25)' : 'var(--ez-color-surface-tertiary)',
                        color: isSelected ? '#FFFFFF' : 'var(--ez-color-text-muted)'
                      }}
                    >
                      {subcatCount}
                    </span>
                  </button>
                );
              })}
              {availableSubcategories.length > MAX_VISIBLE_SUBCATEGORIES && (
                <button
                  onClick={() => setSubcatExpanded(prev => !prev)}
                  style={{
                    padding: '5px 6px',
                    background: 'transparent',
                    border: 'none',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    color: 'var(--ez-color-primary)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {subcatExpanded ? 'Lebih sedikit' : `+${hiddenSubcategoryCount} lainnya`}
                </button>
              )}
            </div>
          )}

          {/* Grid Cards */}
          {filteredTemplates.length === 0 ? (
            <div
              style={{
                background: 'var(--ez-color-surface)',
                borderRadius: 'var(--ez-radius-card)',
                border: '1px solid var(--ez-color-border)',
                padding: '48px 24px',
                textAlign: 'center'
              }}
            >
              <Building size={36} color="#94A3B8" style={{ margin: '0 auto 10px' }} />
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ez-color-text-primary)', marginBottom: '4px' }}>
                Belum ada template pada kategori ini
              </h3>
              <p style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', margin: '0 0 14px 0' }}>
                Anda dapat membuat template kustom sendiri dengan formula dan parameter fleksibel.
              </p>
              <button
                onClick={() => handleOpenBuilder()}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: 'var(--ez-color-primary)',
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
                gridTemplateColumns: 'repeat(auto-fill, minmax(min(290px, 100%), 1fr))',
                gap: '12px'
              }}
            >
              {paginatedTemplates.map(tpl => {
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

                // Katalog 180 (Fase H): kesiapan pemetaan AHSP dihitung dari
                // katalog kanonis (bukan kosmetik) — murah: lookup kode+satuan.
                let readiness: TemplateMappingReadiness | null = null;
                try {
                  if (!isUser) readiness = tplService.getTemplateMappingReadiness(tpl);
                } catch {}

                return (
                  <div
                    key={tpl.id}
                    style={{
                      background: 'var(--ez-color-surface)',
                      borderRadius: 'var(--ez-radius-card)',
                      border: isUser ? '1px solid var(--ez-hue-blue-border)' : '1px solid var(--ez-color-border)',
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
                              background: 'var(--ez-hue-blue-bg)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'var(--ez-color-primary)'
                            }}
                          >
                            <Icon size={14} />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', fontWeight: 600 }}>
                              {tpl.category.replace(/_/g, ' ')}
                            </span>
                            {tpl.subcategory && (
                              <>
                                <span style={{ color: '#CBD5E1', fontSize: '10px' }}>•</span>
                                <span
                                  style={{
                                    fontSize: '10px',
                                    fontWeight: 600,
                                    color: 'var(--ez-color-primary)',
                                    background: 'var(--ez-hue-blue-bg)',
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
                            background: isUser ? 'var(--ez-hue-amber-bg-deep)' : 'var(--ez-color-surface-tertiary)',
                            color: isUser ? 'var(--ez-hue-amber-text)' : 'var(--ez-color-text-muted)'
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
                          color: 'var(--ez-color-text-primary)',
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
                            color: 'var(--ez-color-text-muted)',
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
                      <div style={{ fontSize: '11px', color: 'var(--ez-color-text-slate)', marginBottom: '10px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                        {tpl.parameters.slice(0, 3).map((p, idx) => (
                          <div
                            key={p.id || p.key}
                            style={{
                              background: 'var(--ez-color-surface-secondary)',
                              border: '1px solid var(--ez-color-border-line)',
                              borderRadius: '4px',
                              padding: '2px 6px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '10.5px'
                            }}
                          >
                            <span style={{ color: 'var(--ez-color-text-muted)' }}>{p.label}:</span>
                            <span style={{ fontWeight: 650, color: 'var(--ez-color-text-strong)' }}>{String(p.defaultValue ?? '-')} {p.unit || ''}</span>
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
                            background: 'var(--ez-color-surface-secondary)',
                            borderRadius: '8px',
                            padding: '8px 10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: '10px',
                            border: '1px solid var(--ez-color-surface-tertiary)'
                          }}
                        >
                          <div>
                            <span style={{ fontSize: '10px', color: 'var(--ez-color-text-muted)', display: 'block' }}>
                              Est. Total ({globalDetailLevel})
                            </span>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ez-color-text-primary)' }}>
                              Rp {previewRes.totalEstimate.toLocaleString('id-ID')}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {previewRes.categorySummaries && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 650,
                                  background: 'var(--ez-color-surface-tertiary)',
                                  color: 'var(--ez-color-text-slate)',
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
                                background: 'var(--ez-hue-green-bg-deep)',
                                color: 'var(--ez-hue-green-text)',
                                padding: '2px 6px',
                                borderRadius: '4px'
                              }}
                            >
                              {previewRes.itemCount} Item
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Katalog 180 (Fase F/H): strip kejujuran sumber harga —
                          angka berasal dari priceSummary hasil generate nyata. */}
                      {previewRes?.priceSummary && !isUser && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '10px' }}>
                          {previewRes.priceSummary.officialCount > 0 && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'var(--ez-hue-green-bg-deep)', color: 'var(--ez-hue-green-text)' }}>
                              <ShieldCheck size={11} /> {previewRes.priceSummary.officialCount} Harga Resmi AHSP
                            </span>
                          )}
                          {previewRes.priceSummary.referenceCount > 0 && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: 650, padding: '2px 6px', borderRadius: '4px', background: 'var(--ez-color-surface-tertiary)', color: 'var(--ez-color-text-slate)' }}>
                              {previewRes.priceSummary.referenceCount} Harga Referensi
                            </span>
                          )}
                          {previewRes.priceSummary.unpricedCount > 0 && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'var(--ez-hue-amber-bg-deep)', color: 'var(--ez-hue-amber-text)' }}>
                              <ShieldAlert size={11} /> {previewRes.priceSummary.unpricedCount} Belum Ada Harga — Total Parsial
                            </span>
                          )}
                          {readiness && (
                            <span
                              title="Komponen yang kodenya ditemukan di katalog AHSP 2026 kanonis dan satuannya kompatibel"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: 650, padding: '2px 6px', borderRadius: '4px', background: 'var(--ez-hue-blue-bg)', color: 'var(--ez-color-primary)' }}
                            >
                              Pemetaan AHSP {readiness.readinessPercent}%
                            </span>
                          )}
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
                        borderTop: '1px solid var(--ez-color-surface-tertiary)',
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
                          border: '1px solid var(--ez-color-border-line)',
                          background: 'var(--ez-color-surface)',
                          color: 'var(--ez-color-text-slate)',
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
                            border: '1px solid var(--ez-color-border-line)',
                            background: 'var(--ez-color-surface)',
                            color: 'var(--ez-color-text-muted)',
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
                              border: '1px solid var(--ez-hue-red-bg)',
                              background: 'var(--ez-hue-rose-bg)',
                              color: 'var(--ez-hue-rose-text)',
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
                            background: 'var(--ez-color-primary)',
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

          {/* Pagination: Sebelumnya / Nomor / Berikutnya */}
          {filteredTemplates.length > PAGE_SIZE && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '16px 0 4px',
              }}
            >
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={safePage === 1}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1px solid var(--ez-hue-slate-border)',
                  background: safePage === 1 ? 'var(--ez-color-surface-tertiary)' : 'var(--ez-color-surface)',
                  color: safePage === 1 ? '#94A3B8' : 'var(--ez-color-text-body)',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: safePage === 1 ? 'not-allowed' : 'pointer',
                  opacity: safePage === 1 ? 0.6 : 1,
                }}
              >
                <ChevronLeft size={14} />
                <span>Sebelumnya</span>
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                  .reduce<Array<number | '… '>>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('… ');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, idx) =>
                    p === '… ' ? (
                      <span key={`gap-${idx}`} style={{ fontSize: '12px', color: '#94A3B8', padding: '0 4px' }}>…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setCurrentPage(p as number)}
                        style={{
                          minWidth: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          border: p === safePage ? 'none' : '1px solid var(--ez-hue-slate-border)',
                          background: p === safePage ? 'var(--ez-color-primary)' : 'var(--ez-color-surface)',
                          color: p === safePage ? '#FFFFFF' : 'var(--ez-color-text-body)',
                          fontSize: '12.5px',
                          fontWeight: p === safePage ? 700 : 500,
                          cursor: 'pointer',
                        }}
                      >
                        {p}
                      </button>
                    )
                  )}
              </div>

              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: safePage === totalPages ? '1px solid var(--ez-hue-slate-border)' : 'none',
                  background: safePage === totalPages ? 'var(--ez-color-surface-tertiary)' : 'var(--ez-color-primary)',
                  color: safePage === totalPages ? '#94A3B8' : '#FFFFFF',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: safePage === totalPages ? 'not-allowed' : 'pointer',
                  opacity: safePage === totalPages ? 0.6 : 1,
                  boxShadow: safePage === totalPages ? 'none' : '0 2px 6px rgba(37, 99, 235, 0.3)',
                }}
              >
                <span>Berikutnya</span>
                <ChevronRight size={14} />
              </button>
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
          globalSettings={globalSettings}
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
            try {
              localStorage.setItem('ezrab_global_estimation_settings_v1', JSON.stringify(newSettings));
            } catch {
              /* abaikan */
            }
          }}
        />
      )}
    </div>
  );
};
