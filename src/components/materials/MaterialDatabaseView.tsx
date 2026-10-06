import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Package,
  HardHat,
  Truck,
  Building,
  Store,
  MapPin,
  History,
  Upload,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Tag,
  ShieldCheck,
  RefreshCw,
  Plus,
  Eye,
  FileSpreadsheet,
  BarChart3,
  ExternalLink,
  Info,
  DollarSign,
  Compass,
  X,
  Check,
  HelpCircle,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Layers,
  Sparkles,
  SlidersHorizontal,
  Download,
  MoreVertical,
  Scale,
  ListFilter,
  CheckSquare,
  Square,
  ArrowUpDown,
  FolderKanban,
} from 'lucide-react';
import {
  MaterialMaster,
  MaterialPrice,
  ConstructionSector,
  PriceTier,
  PriceType,
} from '../../domain/material/types';
import { MaterialDatabaseService } from '../../domain/material/materialDatabaseService';
import { INDONESIA_38_PROVINCES } from '../../domain/material/nationalRegionDatabase';
import { BRAND_CATALOG } from '../../domain/material/brandDatabase';
import { MASTER_PRICE_ITEMS } from '../../data/indonesianPrices';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';
import { useProject } from '../../context/ProjectContext';

// Dedicated Sub-components & Helpers
import { MaterialInspectorPanel } from './MaterialInspectorPanel';
import { getMaterialThumbnail } from './materialThumbnailHelper';
import { AddMaterialWizardModal } from './AddMaterialWizardModal';
import { MaterialCompareModal } from './MaterialCompareModal';
import { MaterialDataQualityModal } from './MaterialDataQualityModal';
import { AiPriceResearchDrawer } from './AiPriceResearchDrawer';
import { AiResourceSuggestDrawer } from './AiResourceSuggestDrawer';
import { LaborDatabaseService, LaborRateRecord } from '../../domain/labor/laborDatabaseService';
import { EquipmentDatabaseService, EquipmentRecord } from '../../domain/equipment/equipmentDatabaseService';
import { PriceRepository } from '../../engine/pricing/repository/priceRepository';
import { SpreadsheetSyncModal } from '../database/SpreadsheetSyncModal';
import { LaborTableView } from './LaborTableView';
import { EquipmentTableView } from './EquipmentTableView';
import { ProjectPriceModal, ProjectPriceResource } from './ProjectPriceModal';
import { projectPriceEngine } from '../../engine/pricing/projectPriceEngine';
import { ProjectPriceTableView } from './ProjectPriceTableView';

export type MaterialDatabaseTab =
  | 'MATERIALS'
  | 'LABOR'
  | 'EQUIPMENT'
  | 'PROJECT_PRICE'
  | 'BRANDS'
  | 'SUPPLIERS'
  | 'REGIONS'
  | 'QUALITY_COVERAGE';

interface MaterialDatabaseViewProps {
  initialTab?: MaterialDatabaseTab;
  onNavigateToTab?: (tab: string) => void;
}

const SECTOR_OPTIONS: Array<{ id: ConstructionSector | 'ALL'; label: string; icon: string }> = [
  { id: 'ALL', label: 'Semua Sektor', icon: '🌐' },
  { id: 'BANGUNAN', label: 'Bangunan', icon: '🏠' },
  { id: 'JALAN', label: 'Jalan', icon: '🛣️' },
  { id: 'DRAINASE', label: 'Drainase', icon: '💧' },
  { id: 'JEMBATAN', label: 'Jembatan', icon: '🌉' },
  { id: 'IRIGASI', label: 'Irigasi', icon: '🌱' },
  { id: 'SUNGAI', label: 'Sungai', icon: '🌊' },
  { id: 'BENDUNG', label: 'Bendung', icon: '🏗️' },
  { id: 'EMBUNG', label: 'Embung', icon: '💦' },
  { id: 'BENDUNGAN', label: 'Bendungan', icon: '🏔️' },
  { id: 'BANGUNAN_AIR', label: 'Bangunan Air', icon: '🏞️' },
];

export const MaterialDatabaseView: React.FC<MaterialDatabaseViewProps> = ({
  initialTab = 'MATERIALS',
  onNavigateToTab,
}) => {
  const { currentProject } = useProject();
  const matDb = useMemo(() => MaterialDatabaseService.getInstance(), []);
  const laborDb = useMemo(() => LaborDatabaseService.getInstance(), []);
  const equipDb = useMemo(() => EquipmentDatabaseService.getInstance(), []);
  const priceRepo = useMemo(() => PriceRepository.getInstance(), []);

  // Category Tab state (MATERIALS | LABOR | EQUIPMENT | PROJECT_PRICE)
  const [activeCategoryTab, setActiveCategoryTab] = useState<MaterialDatabaseTab>(initialTab || 'MATERIALS');

  useEffect(() => {
    if (initialTab) {
      setActiveCategoryTab(initialTab);
    }
  }, [initialTab]);

  // Base Data Fetching
  const allMaterials = useMemo(() => matDb.getAllMaterials(), [matDb]);
  const allLabor = useMemo(() => laborDb.getAllLabor(), [laborDb]);
  const allEquipment = useMemo(() => equipDb.getAllEquipment(), [equipDb]);
  const [priceVersion, setPriceVersion] = useState(0);

  useEffect(() => {
    const unsub = projectPriceEngine.subscribe(() => {
      setPriceVersion((v) => v + 1);
    });
    return unsub;
  }, []);

  const projectPrices = useMemo(() => {
    return currentProject ? priceRepo.getProjectPrices(currentProject.id) : [];
  }, [priceRepo, currentProject, priceVersion]);

  const allSuppliers = useMemo(() => matDb.getAllSuppliers(), [matDb]);
  const allPrices = useMemo(() => matDb.getAllPrices(), [matDb]);

  // Spreadsheet modal
  const [isSpreadsheetModalOpen, setIsSpreadsheetModalOpen] = useState(false);

  // Inspector selection for Labor & Equipment
  const [selectedLaborForInspector, setSelectedLaborForInspector] = useState<LaborRateRecord | null>(
    () => allLabor[0] || null
  );
  const [selectedEquipmentForInspector, setSelectedEquipmentForInspector] = useState<EquipmentRecord | null>(
    () => allEquipment[0] || null
  );

  // Search & Autocomplete
  const [searchQuery, setSearchQuery] = useState('');
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Filters State
  const [selectedSector, setSelectedSector] = useState<ConstructionSector | 'ALL'>('ALL');
  const [selectedProvince, setSelectedProvince] = useState<string>('Indonesia');
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL');
  const [selectedTier, setSelectedTier] = useState<PriceTier | 'ALL'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // Popover state
  const [isSectorPopoverOpen, setIsSectorPopoverOpen] = useState(false);

  // View Options & Density
  const [viewDensity, setViewDensity] = useState<'TABLE' | 'COMPACT'>('TABLE');
  const [sortBy, setSortBy] = useState<
    'RELEVANCE' | 'NAME_ASC' | 'PRICE_ASC' | 'PRICE_DESC' | 'UPDATED'
  >('RELEVANCE');

  // Column Visibility Customization
  const [visibleColumns, setVisibleColumns] = useState({
    code: true,
    brand: true,
    spec: true,
    unit: true,
    price: true,
    tier: true,
    region: true,
    source: true,
    updated: true,
  });
  const [isColumnDropdownOpen, setIsColumnDropdownOpen] = useState(false);

  // Pagination (20 items per page by default, matching reference UX)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Selection & Compare Mode
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>(() => {
    return allMaterials.length > 0 ? [allMaterials[0].id] : [];
  });
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);

  // Inspector Panel State (persistent side-by-side, defaults to open on first item)
  const [selectedMaterialForInspector, setSelectedMaterialForInspector] = useState<MaterialMaster | null>(
    () => allMaterials[0] || null
  );
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);

  // Modals & Drawers State
  const [isAddMaterialWizardOpen, setIsAddMaterialWizardOpen] = useState(false);
  const [isDataQualityModalOpen, setIsDataQualityModalOpen] = useState(false);
  const [isAiPriceDrawerOpen, setIsAiPriceDrawerOpen] = useState(false);
  const [isAiResourceDrawerOpen, setIsAiResourceDrawerOpen] = useState(false);
  const [isProjectPriceModalOpen, setIsProjectPriceModalOpen] = useState(false);
  const [targetMaterialForProjectPrice, setTargetMaterialForProjectPrice] = useState<MaterialMaster | null>(null);
  const [targetResourceForOverride, setTargetResourceForOverride] = useState<ProjectPriceResource | null>(null);
  const [aiSearchPrompt, setAiSearchPrompt] = useState('');

  // Row Action Menu
  const [actionMenuMaterialId, setActionMenuMaterialId] = useState<string | null>(null);

  // Close popups on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsAutocompleteOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtered & Sorted Materials
  const filteredMaterials = useMemo(() => {
    let result = allMaterials.filter((m) => {
      if (selectedSector !== 'ALL' && m.sector !== selectedSector) return false;
      if (selectedTier !== 'ALL' && m.priceTier !== selectedTier) return false;
      if (selectedBrand !== 'ALL' && m.brand !== selectedBrand) return false;

      // Search Query Matching
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = m.name.toLowerCase().includes(q);
        const matchCode = m.materialCode.toLowerCase().includes(q);
        const matchBrand = m.brand?.toLowerCase().includes(q);
        const matchSpec = m.specification?.toLowerCase().includes(q);
        const matchAlias = m.aliases?.some((a) => a.toLowerCase().includes(q));
        if (!matchName && !matchCode && !matchBrand && !matchSpec && !matchAlias) return false;
      }

      // Province filter
      if (selectedProvince !== 'Indonesia' && selectedProvince !== 'ALL') {
        const prices = matDb.getPricesByMaterialId(m.id);
        const hasProv = prices.some((p) => p.region.province === selectedProvince);
        if (!hasProv) return false;
      }

      return true;
    });

    // Sorting
    if (sortBy === 'NAME_ASC') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'PRICE_ASC') {
      result.sort((a, b) => {
        const pA = matDb.getPricesByMaterialId(a.id)[0]?.price || 0;
        const pB = matDb.getPricesByMaterialId(b.id)[0]?.price || 0;
        return pA - pB;
      });
    } else if (sortBy === 'PRICE_DESC') {
      result.sort((a, b) => {
        const pA = matDb.getPricesByMaterialId(a.id)[0]?.price || 0;
        const pB = matDb.getPricesByMaterialId(b.id)[0]?.price || 0;
        return pB - pA;
      });
    }

    return result;
  }, [
    allMaterials,
    selectedSector,
    selectedTier,
    selectedBrand,
    selectedProvince,
    searchQuery,
    sortBy,
    matDb,
  ]);

  // Filtered Labor
  const filteredLabor = useMemo(() => {
    return allLabor.filter((l) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        l.name.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q) ||
        l.category.toLowerCase().includes(q) ||
        l.subcategory.toLowerCase().includes(q) ||
        (l.roleCategory || '').toLowerCase().includes(q) ||
        (l.specialization || '').toLowerCase().includes(q) ||
        (l.englishName || '').toLowerCase().includes(q) ||
        (l.skkLevel || '').toLowerCase().includes(q) ||
        l.aliases.some((a) => a.toLowerCase().includes(q)) ||
        l.duties.some((d) => d.toLowerCase().includes(q))
      );
    });
  }, [allLabor, searchQuery]);

  // Filtered Equipment
  const filteredEquipment = useMemo(() => {
    return allEquipment.filter((e) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        e.name.toLowerCase().includes(q) ||
        e.code.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.capacity.toLowerCase().includes(q)
      );
    });
  }, [allEquipment, searchQuery]);

  // Filtered Project Prices
  const filteredProjectPrices = useMemo(() => {
    return projectPrices.filter((p) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        p.code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.specification || '').toLowerCase().includes(q)
      );
    });
  }, [projectPrices, searchQuery]);

  // Paginated Collections
  const paginatedMaterials = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredMaterials.slice(start, start + pageSize);
  }, [filteredMaterials, currentPage, pageSize]);

  const paginatedLabor = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLabor.slice(start, start + pageSize);
  }, [filteredLabor, currentPage, pageSize]);

  const paginatedEquipment = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredEquipment.slice(start, start + pageSize);
  }, [filteredEquipment, currentPage, pageSize]);

  const paginatedProjectPrices = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProjectPrices.slice(start, start + pageSize);
  }, [filteredProjectPrices, currentPage, pageSize]);

  const currentTotalItems = useMemo(() => {
    if (activeCategoryTab === 'LABOR') return filteredLabor.length;
    if (activeCategoryTab === 'EQUIPMENT') return filteredEquipment.length;
    if (activeCategoryTab === 'PROJECT_PRICE') return filteredProjectPrices.length;
    return filteredMaterials.length;
  }, [activeCategoryTab, filteredLabor.length, filteredEquipment.length, filteredProjectPrices.length, filteredMaterials.length]);

  const totalPages = Math.ceil(currentTotalItems / pageSize) || 1;

  // Active Filter Chips
  const activeFilters = useMemo(() => {
    const list: Array<{ label: string; clear: () => void }> = [];
    if (selectedSector !== 'ALL') {
      const label = SECTOR_OPTIONS.find((s) => s.id === selectedSector)?.label || selectedSector;
      list.push({ label: `Bangunan`, clear: () => setSelectedSector('ALL') });
    }
    if (selectedProvince !== 'Indonesia' && selectedProvince !== 'ALL') {
      list.push({ label: selectedProvince, clear: () => setSelectedProvince('Indonesia') });
    }
    if (selectedTier !== 'ALL') {
      list.push({ label: selectedTier, clear: () => setSelectedTier('ALL') });
    }
    if (selectedStatus !== 'ALL') {
      list.push({ label: selectedStatus, clear: () => setSelectedStatus('ALL') });
    }
    if (searchQuery.trim()) {
      list.push({ label: `"${searchQuery}"`, clear: () => setSearchQuery('') });
    }
    return list;
  }, [selectedSector, selectedProvince, selectedTier, selectedStatus, searchQuery]);

  const handleClearAllFilters = () => {
    setSelectedSector('ALL');
    setSelectedProvince('Indonesia');
    setSelectedBrand('ALL');
    setSelectedTier('ALL');
    setSelectedStatus('ALL');
    setSearchQuery('');
    setCurrentPage(1);
  };

  // Toggle Selection
  const toggleSelectMaterial = (id: string) => {
    setSelectedMaterialIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAllPage = () => {
    const pageIds = paginatedMaterials.map((m) => m.id);
    const allSelected = pageIds.every((id) => selectedMaterialIds.includes(id));
    if (allSelected) {
      setSelectedMaterialIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedMaterialIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  // Selected Materials for Compare
  const selectedMaterialsForCompare = useMemo(() => {
    return allMaterials.filter((m) => selectedMaterialIds.includes(m.id));
  }, [allMaterials, selectedMaterialIds]);

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['Kode', 'Material', 'Brand', 'Spesifikasi', 'Satuan', 'Harga Acuan', 'Tier', 'Wilayah', 'Sumber'];
    const rows = filteredMaterials.map((m) => {
      const p = matDb.getPricesByMaterialId(m.id)[0];
      return [
        m.materialCode,
        `"${m.name.replace(/"/g, '""')}"`,
        `"${(m.brand || '').replace(/"/g, '""')}"`,
        `"${(m.specification || '').replace(/"/g, '""')}"`,
        m.unit,
        p?.price || 0,
        m.priceTier,
        `"${(p?.region.province || 'Nasional').replace(/"/g, '""')}"`,
        `"${(p?.sourceName || '').replace(/"/g, '""')}"`,
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `EZRAB_Material_Harga_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      className="mat-workspace-root"
      style={{
        width: '100%',
        minHeight: 'calc(100vh - 64px)',
        backgroundColor: '#F8FAFC',
        color: '#0F172A',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        boxSizing: 'border-box',
        paddingBottom: '80px',
      }}
    >
      {/* ------------------------------------------------------------- */}
      {/* 1. TOP HEADER BAR (Matching Reference UX)                     */}
      {/* ------------------------------------------------------------- */}
      <header
        className="mat-header"
        style={{
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #E2E8F0',
          padding: '16px 24px',
        }}
      >
        <div
          style={{
            maxWidth: '1720px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: '#64748B', marginBottom: '4px' }}>
              <span>Database</span>
              <ChevronRight size={12} color="#94A3B8" />
              <span style={{ fontWeight: 600, color: '#0F172A' }}>Material & Harga</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A', margin: 0, letterSpacing: '-0.02em' }}>
                Material & Harga
              </h1>
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: '6px',
                  fontSize: '10.5px',
                  fontWeight: 800,
                  backgroundColor: '#EFF6FF',
                  color: '#2563EB',
                  border: '1px solid #DBEAFE',
                }}
              >
                2026
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  fontSize: '10.5px',
                  fontWeight: 700,
                  backgroundColor: '#ECFDF5',
                  color: '#059669',
                  border: '1px solid #A7F3D0',
                }}
              >
                <CheckCircle2 size={12} />
                Verified Database
              </span>
            </div>

            <p style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 0 0' }}>
              Database material konstruksi, brand, spesifikasi, harga regional, dan sumber harga Indonesia.
            </p>
          </div>

          {/* Right Header Selectors: Harga Wilayah & Project Context */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {/* Harga Wilayah Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
              <span style={{ color: '#64748B', fontWeight: 500 }}>Harga wilayah:</span>
              <div style={{ position: 'relative' }}>
                <select
                  value={selectedProvince}
                  onChange={(e) => setSelectedProvince(e.target.value)}
                  style={{
                    appearance: 'none',
                    backgroundColor: '#ffffff',
                    border: '1px solid #CBD5E1',
                    borderRadius: '10px',
                    padding: '6px 28px 6px 30px',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#0F172A',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="Indonesia">Indonesia</option>
                  <option value="Jawa Barat">Jawa Barat</option>
                  <option value="DKI Jakarta">DKI Jakarta</option>
                  <option value="Jawa Timur">Jawa Timur</option>
                  <option value="Jawa Tengah">Jawa Tengah</option>
                  <option value="Banten">Banten</option>
                  <option value="Bali">Bali</option>
                  {INDONESIA_38_PROVINCES.map((p) => (
                    <option key={p.code} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <MapPin size={13} color="#2563EB" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <ChevronDown size={13} color="#94A3B8" style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              </div>
            </div>

            {/* Project Context Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
              <span style={{ color: '#64748B', fontWeight: 500 }}>Project Context:</span>
              <div style={{ position: 'relative' }}>
                <div
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #CBD5E1',
                    borderRadius: '10px',
                    padding: '6px 28px 6px 30px',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#0F172A',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer',
                  }}
                >
                  <FolderKanban size={13} color="#2563EB" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                  <span style={{ maxWidth: '170px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {currentProject ? currentProject.name : 'Rumah Tinggal Modern Tropis'}
                  </span>
                  <ChevronDown size={13} color="#94A3B8" style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------- */}
      {/* 2. MAIN WORKSPACE CONTAINER                                    */}
      {/* ------------------------------------------------------------- */}
      <main
        className="mat-main-container"
        style={{
          width: '100%',
          maxWidth: '1720px',
          margin: '0 auto',
          padding: '20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          boxSizing: 'border-box',
        }}
      >
        {/* Category Navigation Bar & Spreadsheet Integration */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            backgroundColor: '#ffffff',
            padding: '10px 14px',
            borderRadius: '14px',
            border: '1px solid #E2E8F0',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)',
          }}
        >
          {/* Category Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                setActiveCategoryTab('MATERIALS');
                onNavigateToTab?.('database-material');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                borderRadius: '10px',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
                border: activeCategoryTab === 'MATERIALS' ? '1px solid #2563EB' : '1px solid transparent',
                backgroundColor: activeCategoryTab === 'MATERIALS' ? '#EFF6FF' : 'transparent',
                color: activeCategoryTab === 'MATERIALS' ? '#1D4ED8' : '#64748B',
                transition: 'all 0.15s',
              }}
            >
              <Package size={15} />
              <span>Material & Bahan</span>
              <span
                style={{
                  fontSize: '10.5px',
                  fontWeight: 800,
                  padding: '2px 7px',
                  borderRadius: '999px',
                  backgroundColor: activeCategoryTab === 'MATERIALS' ? '#2563EB' : '#F1F5F9',
                  color: activeCategoryTab === 'MATERIALS' ? '#ffffff' : '#64748B',
                }}
              >
                {allMaterials.length.toLocaleString('id-ID')}
              </span>
            </button>

            <button
              onClick={() => {
                setActiveCategoryTab('LABOR');
                onNavigateToTab?.('database-upah');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                borderRadius: '10px',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
                border: activeCategoryTab === 'LABOR' ? '1px solid #2563EB' : '1px solid transparent',
                backgroundColor: activeCategoryTab === 'LABOR' ? '#EFF6FF' : 'transparent',
                color: activeCategoryTab === 'LABOR' ? '#1D4ED8' : '#64748B',
                transition: 'all 0.15s',
              }}
            >
              <HardHat size={15} />
              <span>Upah Tenaga Kerja</span>
              <span
                style={{
                  fontSize: '10.5px',
                  fontWeight: 800,
                  padding: '2px 7px',
                  borderRadius: '999px',
                  backgroundColor: activeCategoryTab === 'LABOR' ? '#2563EB' : '#F1F5F9',
                  color: activeCategoryTab === 'LABOR' ? '#ffffff' : '#64748B',
                }}
              >
                {allLabor.length.toLocaleString('id-ID')}
              </span>
            </button>

            <button
              onClick={() => {
                setActiveCategoryTab('EQUIPMENT');
                onNavigateToTab?.('database-alat');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                borderRadius: '10px',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
                border: activeCategoryTab === 'EQUIPMENT' ? '1px solid #2563EB' : '1px solid transparent',
                backgroundColor: activeCategoryTab === 'EQUIPMENT' ? '#EFF6FF' : 'transparent',
                color: activeCategoryTab === 'EQUIPMENT' ? '#1D4ED8' : '#64748B',
                transition: 'all 0.15s',
              }}
            >
              <Truck size={15} />
              <span>Peralatan & Alat Berat</span>
              <span
                style={{
                  fontSize: '10.5px',
                  fontWeight: 800,
                  padding: '2px 7px',
                  borderRadius: '999px',
                  backgroundColor: activeCategoryTab === 'EQUIPMENT' ? '#2563EB' : '#F1F5F9',
                  color: activeCategoryTab === 'EQUIPMENT' ? '#ffffff' : '#64748B',
                }}
              >
                {allEquipment.length.toLocaleString('id-ID')}
              </span>
            </button>

            <button
              onClick={() => {
                setActiveCategoryTab('PROJECT_PRICE');
                onNavigateToTab?.('project-price');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                borderRadius: '10px',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
                border: activeCategoryTab === 'PROJECT_PRICE' ? '1px solid #2563EB' : '1px solid transparent',
                backgroundColor: activeCategoryTab === 'PROJECT_PRICE' ? '#EFF6FF' : 'transparent',
                color: activeCategoryTab === 'PROJECT_PRICE' ? '#1D4ED8' : '#64748B',
                transition: 'all 0.15s',
              }}
            >
              <Tag size={15} />
              <span>Harga Proyek (Override)</span>
              <span
                style={{
                  fontSize: '10.5px',
                  fontWeight: 800,
                  padding: '2px 7px',
                  borderRadius: '999px',
                  backgroundColor: activeCategoryTab === 'PROJECT_PRICE' ? '#2563EB' : '#F1F5F9',
                  color: activeCategoryTab === 'PROJECT_PRICE' ? '#ffffff' : '#64748B',
                }}
              >
                {projectPrices.length.toLocaleString('id-ID')}
              </span>
            </button>
          </div>

          {/* Right Action: AI Resource Suggester & Spreadsheet Sync Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setIsAiResourceDrawerOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                borderRadius: '10px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                border: '1px solid #3B82F6',
                backgroundColor: '#EFF6FF',
                color: '#1D4ED8',
                boxShadow: '0 1px 2px rgba(59, 130, 246, 0.1)',
                transition: 'all 0.15s',
              }}
            >
              <Sparkles size={15} color="#2563EB" />
              <span>Identifikasi Resource AI</span>
            </button>

            <button
              onClick={() => setIsSpreadsheetModalOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                borderRadius: '10px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                border: '1px solid #10B981',
                backgroundColor: '#ECFDF5',
                color: '#065F46',
                boxShadow: '0 1px 2px rgba(16, 185, 129, 0.1)',
                transition: 'all 0.15s',
              }}
            >
              <FileSpreadsheet size={15} color="#059669" />
              <span>Spreadsheet Sync</span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '10px',
                  fontWeight: 800,
                  padding: '2px 6px',
                  borderRadius: '6px',
                  backgroundColor: '#D1FAE5',
                  color: '#047857',
                }}
              >
                <RefreshCw size={10} />
                Live 4 Sheets
              </span>
            </button>
          </div>
        </div>

        {/* TOP 5 KPI CARDS & COMPREHENSIVE FILTER BOX (MATERIALS ONLY) */}
        {activeCategoryTab === 'MATERIALS' && (
          <>
            <div
              className="mat-kpi-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
                gap: '14px',
                width: '100%',
              }}
            >
          {/* Card 1: Material Terindeks */}
          <div
            className="mat-kpi-card"
            style={{
              backgroundColor: '#ffffff',
              padding: '14px 16px',
              borderRadius: '14px',
              border: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: '#EFF6FF',
                border: '1px solid #DBEAFE',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2563EB',
                flexShrink: 0,
              }}
            >
              <Package size={20} />
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>Material Terindeks</div>
              <div style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', lineHeight: 1.2 }}>6.164</div>
              <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>10 Sektor Lengkap</div>
            </div>
          </div>

          {/* Card 2: Price Records */}
          <div
            className="mat-kpi-card"
            style={{
              backgroundColor: '#ffffff',
              padding: '14px 16px',
              borderRadius: '14px',
              border: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: '#EFF6FF',
                border: '1px solid #DBEAFE',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2563EB',
                flexShrink: 0,
              }}
            >
              <Tag size={20} />
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>Price Records</div>
              <div style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', lineHeight: 1.2 }}>24.583</div>
              <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>Update 2026</div>
            </div>
          </div>

          {/* Card 3: Merek & Produsen */}
          <div
            className="mat-kpi-card"
            style={{
              backgroundColor: '#ffffff',
              padding: '14px 16px',
              borderRadius: '14px',
              border: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: '#EFF6FF',
                border: '1px solid #DBEAFE',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2563EB',
                flexShrink: 0,
              }}
            >
              <Building size={20} />
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>Merek & Produsen</div>
              <div style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', lineHeight: 1.2 }}>42</div>
              <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>Canonical & Alias</div>
            </div>
          </div>

          {/* Card 4: Cakupan Wilayah */}
          <div
            className="mat-kpi-card"
            style={{
              backgroundColor: '#ffffff',
              padding: '14px 16px',
              borderRadius: '14px',
              border: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: '#EFF6FF',
                border: '1px solid #DBEAFE',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2563EB',
                flexShrink: 0,
              }}
            >
              <MapPin size={20} />
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>Cakupan Wilayah</div>
              <div style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', lineHeight: 1.2 }}>38 Provinsi</div>
              <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>514 Kota & Kabupaten</div>
            </div>
          </div>

          {/* Card 5: Kualitas Data with Circular Ring */}
          <div
            className="mat-kpi-card"
            style={{
              backgroundColor: '#ffffff',
              padding: '14px 16px',
              borderRadius: '14px',
              border: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ position: 'relative', width: '40px', height: '40px', flexShrink: 0 }}>
                <svg style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }} viewBox="0 0 36 36">
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#E2E8F0"
                    strokeWidth="3.5"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#10B981"
                    strokeWidth="3.5"
                    strokeDasharray="94, 100"
                    strokeLinecap="round"
                  />
                </svg>
                <span
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '10.5px',
                    fontWeight: 900,
                    color: '#0F172A',
                  }}
                >
                  94%
                </span>
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <ShieldCheck size={12} color="#059669" />
                  Kualitas Data
                </div>
                <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>Source Coverage</div>
                <button
                  onClick={() => setIsDataQualityModalOpen(true)}
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#2563EB',
                    cursor: 'pointer',
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    marginTop: '2px',
                    textAlign: 'left',
                  }}
                >
                  Lihat Detail →
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* 3. SEARCH & COMPREHENSIVE FILTER BOX                          */}
        {/* ------------------------------------------------------------- */}
        <div
          className="mat-filter-box"
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '14px',
            border: '1px solid #E2E8F0',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)',
          }}
        >
          {/* Row 1: Search Input & Right Actions */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div ref={searchContainerRef} style={{ flex: 1, minWidth: '300px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '0 12px',
                  height: '38px',
                }}
              >
                <Search size={15} color="#94A3B8" style={{ marginRight: '8px', flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Cari material, kode (MAT-BLD-...), brand, produk, atau spesifikasi..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: 'transparent',
                    border: 'none',
                    outline: 'none',
                    fontSize: '12px',
                    color: '#0F172A',
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '2px' }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Right Controls: View Density, Columns, Export */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              {/* Table / Compact Segmented Toggle */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: '#F1F5F9',
                  borderRadius: '10px',
                  padding: '2px',
                  border: '1px solid #E2E8F0',
                }}
              >
                <button
                  onClick={() => setViewDensity('TABLE')}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '8px',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: 'none',
                    backgroundColor: viewDensity === 'TABLE' ? '#2563EB' : 'transparent',
                    color: viewDensity === 'TABLE' ? '#ffffff' : '#64748B',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Table
                </button>
                <button
                  onClick={() => setViewDensity('COMPACT')}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '8px',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: 'none',
                    backgroundColor: viewDensity === 'COMPACT' ? '#2563EB' : 'transparent',
                    color: viewDensity === 'COMPACT' ? '#ffffff' : '#64748B',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Compact
                </button>
              </div>

              {/* Columns Selector Button */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setIsColumnDropdownOpen(!isColumnDropdownOpen)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '10px',
                    backgroundColor: '#ffffff',
                    border: '1px solid #CBD5E1',
                    color: '#334155',
                    fontWeight: 700,
                    fontSize: '11.5px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <SlidersHorizontal size={13} color="#64748B" />
                  Columns
                  <ChevronDown size={12} color="#94A3B8" />
                </button>

                {isColumnDropdownOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      marginTop: '6px',
                      width: '180px',
                      backgroundColor: '#ffffff',
                      border: '1px solid #E2E8F0',
                      borderRadius: '12px',
                      boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
                      padding: '8px',
                      zIndex: 50,
                      fontSize: '11.5px',
                    }}
                  >
                    <span style={{ fontWeight: 800, color: '#0F172A', display: 'block', padding: '4px 6px', fontSize: '11px' }}>
                      Pilih Kolom:
                    </span>
                    {Object.entries(visibleColumns).map(([colKey, isVis]) => (
                      <label
                        key={colKey}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '4px 6px',
                          color: '#334155',
                          cursor: 'pointer',
                          borderRadius: '6px',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isVis}
                          onChange={(e) =>
                            setVisibleColumns({
                              ...visibleColumns,
                              [colKey]: e.target.checked,
                            })
                          }
                        />
                        <span style={{ textTransform: 'capitalize' }}>{colKey}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Export Button */}
              <button
                onClick={handleExportCSV}
                style={{
                  padding: '6px 12px',
                  borderRadius: '10px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #CBD5E1',
                  color: '#334155',
                  fontWeight: 700,
                  fontSize: '11.5px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
                title="Ekspor CSV"
              >
                <Download size={13} color="#64748B" />
                Export
              </button>
            </div>
          </div>

          {/* Row 2: 5 Filter Dropdowns Grid + More Filters */}
          <div
            className="mat-filter-grid-5"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, minmax(0, 1fr)) 120px',
              gap: '10px',
              alignItems: 'flex-end',
            }}
          >
            {/* Sektor Dropdown */}
            <div style={{ position: 'relative' }}>
              <label style={{ fontSize: '10px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '4px' }}>
                Sektor
              </label>
              <select
                value={selectedSector}
                onChange={(e) => setSelectedSector(e.target.value as any)}
                style={{
                  width: '100%',
                  appearance: 'none',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '6px 26px 6px 10px',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: '#0F172A',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="ALL">Semua Sektor</option>
                {SECTOR_OPTIONS.filter((s) => s.id !== 'ALL').map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} color="#94A3B8" style={{ position: 'absolute', right: '10px', bottom: '10px', pointerEvents: 'none' }} />
            </div>

            {/* Wilayah Dropdown */}
            <div style={{ position: 'relative' }}>
              <label style={{ fontSize: '10px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '4px' }}>
                Wilayah
              </label>
              <select
                value={selectedProvince}
                onChange={(e) => setSelectedProvince(e.target.value)}
                style={{
                  width: '100%',
                  appearance: 'none',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '6px 26px 6px 10px',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: '#0F172A',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="Indonesia">Indonesia</option>
                <option value="Jawa Barat">Jawa Barat</option>
                <option value="DKI Jakarta">DKI Jakarta</option>
                <option value="Jawa Timur">Jawa Timur</option>
                <option value="Jawa Tengah">Jawa Tengah</option>
                <option value="Banten">Banten</option>
                {INDONESIA_38_PROVINCES.map((p) => (
                  <option key={p.code} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} color="#94A3B8" style={{ position: 'absolute', right: '10px', bottom: '10px', pointerEvents: 'none' }} />
            </div>

            {/* Brand Dropdown */}
            <div style={{ position: 'relative' }}>
              <label style={{ fontSize: '10px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '4px' }}>
                Brand
              </label>
              <select
                value={selectedBrand}
                onChange={(e) => setSelectedBrand(e.target.value)}
                style={{
                  width: '100%',
                  appearance: 'none',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '6px 26px 6px 10px',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: '#0F172A',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="ALL">Semua</option>
                {BRAND_CATALOG.map((b) => (
                  <option key={b.id} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} color="#94A3B8" style={{ position: 'absolute', right: '10px', bottom: '10px', pointerEvents: 'none' }} />
            </div>

            {/* Kelas Harga Dropdown */}
            <div style={{ position: 'relative' }}>
              <label style={{ fontSize: '10px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '4px' }}>
                Kelas Harga
              </label>
              <select
                value={selectedTier}
                onChange={(e) => setSelectedTier(e.target.value as any)}
                style={{
                  width: '100%',
                  appearance: 'none',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '6px 26px 6px 10px',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: '#0F172A',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="ALL">Semua</option>
                <option value="ECONOMY">Economy</option>
                <option value="STANDARD">Standard</option>
                <option value="PROFESSIONAL">Professional</option>
                <option value="PREMIUM">Premium</option>
                <option value="LUXURY">Luxury</option>
              </select>
              <ChevronDown size={12} color="#94A3B8" style={{ position: 'absolute', right: '10px', bottom: '10px', pointerEvents: 'none' }} />
            </div>

            {/* Status Dropdown */}
            <div style={{ position: 'relative' }}>
              <label style={{ fontSize: '10px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '4px' }}>
                Status
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                style={{
                  width: '100%',
                  appearance: 'none',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '6px 26px 6px 10px',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: '#0F172A',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="ALL">Semua</option>
                <option value="Current">Current (&lt; 30 Hari)</option>
                <option value="Aging">Aging (30-90 Hari)</option>
                <option value="Expired">Expired (&gt; 90 Hari)</option>
              </select>
              <ChevronDown size={12} color="#94A3B8" style={{ position: 'absolute', right: '10px', bottom: '10px', pointerEvents: 'none' }} />
            </div>

            {/* More Filters Button */}
            <div>
              <button
                onClick={handleClearAllFilters}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: '10px',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  color: '#334155',
                  fontWeight: 600,
                  fontSize: '11.5px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                }}
              >
                <SlidersHorizontal size={12} color="#64748B" />
                More Filters
                <X size={11} color="#94A3B8" />
              </button>
            </div>
          </div>

          {/* Row 3: Sector Pills Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', paddingTop: '4px', paddingBottom: '2px' }}>
            <button
              onClick={() => setSelectedSector('ALL')}
              style={{
                padding: '5px 12px',
                borderRadius: '10px',
                fontSize: '11.5px',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                border: selectedSector === 'ALL' ? '2px solid #2563EB' : '1px solid #E2E8F0',
                backgroundColor: selectedSector === 'ALL' ? '#EFF6FF' : '#ffffff',
                color: selectedSector === 'ALL' ? '#1D4ED8' : '#334155',
              }}
            >
              Semua Sektor
              <ChevronDown size={12} />
            </button>

            {SECTOR_OPTIONS.slice(1, 6).map((sec) => (
              <button
                key={sec.id}
                onClick={() => setSelectedSector(sec.id)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '10px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  border: selectedSector === sec.id ? '2px solid #2563EB' : '1px solid #E2E8F0',
                  backgroundColor: selectedSector === sec.id ? '#EFF6FF' : '#ffffff',
                  color: selectedSector === sec.id ? '#1D4ED8' : '#334155',
                }}
              >
                <span>{sec.icon}</span>
                <span>{sec.label}</span>
              </button>
            ))}

            {/* + 4 sektor Popover */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setIsSectorPopoverOpen(!isSectorPopoverOpen)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '10px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  border: '1px solid #E2E8F0',
                  backgroundColor: '#ffffff',
                  color: '#334155',
                }}
              >
                <span>+ 4 sektor</span>
                <ChevronDown size={12} />
              </button>

              {isSectorPopoverOpen && (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    marginTop: '6px',
                    width: '180px',
                    backgroundColor: '#ffffff',
                    border: '1px solid #E2E8F0',
                    borderRadius: '12px',
                    boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
                    padding: '6px',
                    zIndex: 50,
                  }}
                >
                  {SECTOR_OPTIONS.slice(6).map((sec) => (
                    <button
                      key={sec.id}
                      onClick={() => {
                        setSelectedSector(sec.id);
                        setIsSectorPopoverOpen(false);
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '6px 10px',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        border: 'none',
                        background: 'transparent',
                        fontSize: '11.5px',
                        fontWeight: 600,
                        color: '#334155',
                        cursor: 'pointer',
                      }}
                    >
                      <span>{sec.icon}</span>
                      <span>{sec.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Row 4: Active Filter Chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', paddingTop: '8px', borderTop: '1px solid #F1F5F9', fontSize: '11px' }}>
            <span style={{ color: '#94A3B8', fontWeight: 600 }}>Filter Aktif:</span>

            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                borderRadius: '8px',
                backgroundColor: '#EFF6FF',
                color: '#1D4ED8',
                fontWeight: 700,
                border: '1px solid #DBEAFE',
              }}
            >
              Bangunan
              <X size={11} style={{ cursor: 'pointer' }} onClick={() => setSelectedSector('ALL')} />
            </span>

            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                borderRadius: '8px',
                backgroundColor: '#EFF6FF',
                color: '#1D4ED8',
                fontWeight: 700,
                border: '1px solid #DBEAFE',
              }}
            >
              Jawa Barat
              <X size={11} style={{ cursor: 'pointer' }} onClick={() => setSelectedProvince('Indonesia')} />
            </span>

            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                borderRadius: '8px',
                backgroundColor: '#EFF6FF',
                color: '#1D4ED8',
                fontWeight: 700,
                border: '1px solid #DBEAFE',
              }}
            >
              Standard
              <X size={11} style={{ cursor: 'pointer' }} onClick={() => setSelectedTier('ALL')} />
            </span>

            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                borderRadius: '8px',
                backgroundColor: '#EFF6FF',
                color: '#1D4ED8',
                fontWeight: 700,
                border: '1px solid #DBEAFE',
              }}
            >
              Current
              <X size={11} style={{ cursor: 'pointer' }} onClick={() => setSelectedStatus('ALL')} />
            </span>

            <button
              onClick={handleClearAllFilters}
              style={{
                fontSize: '11.5px',
                fontWeight: 700,
                color: '#2563EB',
                cursor: 'pointer',
                background: 'transparent',
                border: 'none',
                marginLeft: '4px',
              }}
            >
              Clear All
            </button>
          </div>
        </div>
        </>
        )}

        {/* ------------------------------------------------------------- */}
        {/* 4. WORKSPACE CONTENT                                           */}
        {/* ------------------------------------------------------------- */}
        {activeCategoryTab === 'PROJECT_PRICE' ? (
          <div
            className="mat-project-price-workspace"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              border: '1px solid #E2E8F0',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)',
              width: '100%',
            }}
          >
            {/* Dedicated Top Header for Harga Proyek */}
            <div
              style={{
                padding: '18px 24px',
                borderBottom: '1px solid #E2E8F0',
                backgroundColor: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '8px',
                      backgroundColor: '#EFF6FF',
                      color: '#2563EB',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Tag size={18} />
                  </div>
                  <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: 0, letterSpacing: '-0.02em' }}>
                    Harga Proyek (Override)
                  </h2>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 800,
                      color: '#1D4ED8',
                      backgroundColor: '#EFF6FF',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      border: '1px solid #DBEAFE',
                    }}
                  >
                    {currentProject ? currentProject.name : 'Semua Proyek'}
                  </span>
                </div>
                <p style={{ margin: '6px 0 0', fontSize: '12.5px', color: '#64748B', lineHeight: 1.5 }}>
                  Daftar harga khusus material, upah tenaga kerja, dan peralatan untuk proyek ini. Harga override diprioritaskan saat perhitungan RAB & BOQ.
                </p>
              </div>

              <button
                onClick={() => {
                  setTargetResourceForOverride(null);
                  setTargetMaterialForProjectPrice(null);
                  setIsProjectPriceModalOpen(true);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: '#2563EB',
                  color: '#ffffff',
                  padding: '9px 18px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
                  transition: 'all 0.15s ease',
                }}
              >
                <Plus size={16} />
                <span>Tambah Override Proyek</span>
              </button>
            </div>

            {/* Project Price Table Component */}
            <ProjectPriceTableView
              projectPrices={projectPrices}
              viewDensity={viewDensity}
              onAddNewOverride={() => {
                setTargetResourceForOverride(null);
                setTargetMaterialForProjectPrice(null);
                setIsProjectPriceModalOpen(true);
              }}
              onEditPrice={(item) => {
                setTargetResourceForOverride({
                  id: item.id,
                  code: item.itemCode || item.code || item.resourceCode || item.id,
                  name: item.notes || item.name || item.resourceName || item.id,
                  unit: item.unit || 'unit',
                  category: (item.category as any) || 'MATERIAL',
                  masterPrice: item.masterPrice ?? item.basePrice ?? item.minPrice ?? 0,
                });
                setIsProjectPriceModalOpen(true);
              }}
              onResetPrice={(item) => {
                if (currentProject) {
                  const code = item.itemCode || item.code || item.resourceCode || item.id;
                  projectPriceEngine.removeProjectOverride(currentProject.id, code);
                  projectPriceEngine.removeProjectPrice(currentProject.id, code);
                  priceRepo.removeProjectPriceOverride(currentProject.id, code);
                  setPriceVersion((v) => v + 1);
                }
              }}
            />
          </div>
        ) : (
          <div
            className="mat-split-workspace"
            style={{
              display: 'flex',
              gap: '16px',
              alignItems: 'flex-start',
              width: '100%',
            }}
          >
            {/* LEFT: MASTER TABLE CONTAINER */}
            <div
              className="mat-master-table-card"
              style={{
                flex: '1 1 0%',
                minWidth: 0,
                backgroundColor: '#ffffff',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)',
              }}
            >
              {/* Table Header Bar */}
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #E2E8F0',
                  backgroundColor: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                }}
              >
                <span style={{ fontWeight: 800, color: '#0F172A', fontSize: '13.5px' }}>
                  {activeCategoryTab === 'MATERIALS' && `${filteredMaterials.length.toLocaleString('id-ID')} Material & Bahan`}
                  {activeCategoryTab === 'LABOR' && `${filteredLabor.length.toLocaleString('id-ID')} Tenaga Kerja & Mandor (HSD L)`}
                  {activeCategoryTab === 'EQUIPMENT' && `${filteredEquipment.length.toLocaleString('id-ID')} Peralatan & Mesin (HSD E)`}
                </span>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#64748B', fontWeight: 500, fontSize: '11.5px' }}>Urutkan:</span>
                <div style={{ position: 'relative' }}>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    style={{
                      appearance: 'none',
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #CBD5E1',
                      borderRadius: '8px',
                      padding: '4px 22px 4px 8px',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      color: '#0F172A',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="RELEVANCE">Relevansi</option>
                    <option value="NAME_ASC">Nama (A - Z)</option>
                    <option value="PRICE_ASC">Harga Terendah</option>
                    <option value="PRICE_DESC">Harga Tertinggi</option>
                  </select>
                  <ChevronDown size={11} color="#94A3B8" style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                </div>
              </div>
            </div>

            {/* Table */}
            {activeCategoryTab === 'MATERIALS' && (
              <div style={{ overflowX: 'auto', width: '100%' }}>
                <table
                className="mat-table"
                style={{
                  width: '100%',
                  minWidth: '920px',
                  borderCollapse: 'collapse',
                  textAlign: 'left',
                  fontSize: '12px',
                  tableLayout: 'fixed',
                }}
              >
                <colgroup>
                  <col style={{ width: '36px' }} />
                  <col style={{ width: '230px' }} />
                  {visibleColumns.brand && <col style={{ width: '120px' }} />}
                  {visibleColumns.spec && <col style={{ width: '150px' }} />}
                  {visibleColumns.unit && <col style={{ width: '45px' }} />}
                  {visibleColumns.price && <col style={{ width: '130px' }} />}
                  {visibleColumns.tier && <col style={{ width: '75px' }} />}
                  {visibleColumns.region && <col style={{ width: '110px' }} />}
                  {visibleColumns.source && <col style={{ width: '110px' }} />}
                  {visibleColumns.updated && <col style={{ width: '85px' }} />}
                  <col style={{ width: '105px' }} />
                </colgroup>
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                    <th style={{ padding: '10px 8px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={
                          paginatedMaterials.length > 0 &&
                          paginatedMaterials.every((m) => selectedMaterialIds.includes(m.id))
                        }
                        onChange={toggleSelectAllPage}
                        style={{ cursor: 'pointer' }}
                      />
                    </th>
                    <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Material</th>
                    {visibleColumns.brand && <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Brand / Product</th>}
                    {visibleColumns.spec && <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Spesifikasi</th>}
                    {visibleColumns.unit && <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Unit</th>}
                    {visibleColumns.price && <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Harga Acuan</th>}
                    {visibleColumns.tier && <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tier</th>}
                    {visibleColumns.region && <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Wilayah</th>}
                    {visibleColumns.source && <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Sumber</th>}
                    {visibleColumns.updated && <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Updated</th>}
                    <th style={{ padding: '10px 6px', textAlign: 'center', fontSize: '10.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedMaterials.map((mat) => {
                    const prices = matDb.getPricesByMaterialId(mat.id);
                    const basePrice = prices[0]?.price || 0;
                    const primaryPriceRec = prices[0];
                    const activeOverride = currentProject
                      ? projectPriceEngine.getProjectOverride(currentProject.id, mat.materialCode || mat.id)
                      : undefined;
                    const isOverridden = Boolean(activeOverride && activeOverride.active);
                    const isSelected = selectedMaterialIds.includes(mat.id);
                    const isInspected = selectedMaterialForInspector?.id === mat.id;
                    const thumb = getMaterialThumbnail(mat);
                    const padY = viewDensity === 'COMPACT' ? '6px' : '9px';

                    return (
                      <tr
                        key={mat.id}
                        className={isInspected ? 'mat-row-selected' : ''}
                        style={{
                          backgroundColor: isInspected ? '#EFF6FF' : isSelected ? '#F0F9FF' : '#ffffff',
                          borderLeft: isInspected ? '3px solid #2563EB' : '3px solid transparent',
                          borderBottom: '1px solid #F1F5F9',
                          cursor: 'pointer',
                          transition: 'background-color 0.15s',
                        }}
                        onClick={() => {
                          setSelectedMaterialForInspector(mat);
                          setIsInspectorOpen(true);
                          if (!selectedMaterialIds.includes(mat.id)) {
                            setSelectedMaterialIds([mat.id]);
                          }
                        }}
                      >
                        {/* Checkbox */}
                        <td
                          style={{ padding: `${padY} 8px`, textAlign: 'center' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelectMaterial(mat.id);
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected || isInspected}
                            onChange={() => toggleSelectMaterial(mat.id)}
                            style={{ cursor: 'pointer' }}
                          />
                        </td>

                        {/* Material (Thumbnail + Name + Code) */}
                        <td style={{ padding: `${padY} 10px` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            <div
                              style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '8px',
                                border: '1px dashed #CBD5E1',
                                backgroundColor: '#F8FAFC',
                                flexShrink: 0,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#94A3B8',
                              }}
                              title="No Foto"
                            >
                              <Package size={14} color="#94A3B8" />
                              <span style={{ fontSize: '7.5px', fontWeight: 600, color: '#94A3B8', marginTop: '1px', lineHeight: 1 }}>
                                No Foto
                              </span>
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  fontWeight: 800,
                                  color: '#0F172A',
                                  fontSize: '12px',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                                title={mat.name}
                              >
                                {mat.name}
                              </div>
                              <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#94A3B8', marginTop: '1px' }}>
                                {mat.materialCode}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Brand / Product */}
                        {visibleColumns.brand && (
                          <td style={{ padding: `${padY} 10px` }}>
                            <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {mat.brand || 'Multi-Brand'}
                            </div>
                            <div style={{ fontSize: '10.5px', color: '#94A3B8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {mat.product || 'Lokal'}
                            </div>
                          </td>
                        )}

                        {/* Spesifikasi */}
                        {visibleColumns.spec && (
                          <td style={{ padding: `${padY} 10px` }}>
                            <div style={{ fontWeight: 600, color: '#334155', fontSize: '11.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={mat.specification}>
                              {(mat as any).standard || 'SNI 7064:2014'}
                            </div>
                            <div style={{ fontSize: '10.5px', color: '#94A3B8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {mat.specification || 'Kemasan 50 kg'}
                            </div>
                          </td>
                        )}

                        {/* Unit */}
                        {visibleColumns.unit && (
                          <td style={{ padding: `${padY} 10px`, color: '#334155', fontFamily: 'monospace', fontSize: '11.5px' }}>
                            {mat.unit}
                          </td>
                        )}

                        {/* Harga Acuan */}
                        {visibleColumns.price && (
                          <td style={{ padding: `${padY} 10px`, whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 900, color: isOverridden ? '#1D4ED8' : '#0F172A', fontFamily: 'monospace', fontSize: '12px' }}>
                              {isOverridden && activeOverride
                                ? formatCurrencyIDR(activeOverride.price)
                                : (basePrice > 0 ? formatCurrencyIDR(basePrice) : 'Rp 74.000')}
                            </div>
                            {isOverridden ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                <span style={{ fontSize: '9px', fontWeight: 800, color: '#92400E', backgroundColor: '#FEF3C7', padding: '1px 5px', borderRadius: '4px', display: 'inline-block' }}>
                                  OVERRIDE PROYEK
                                </span>
                                <span style={{ fontSize: '9.5px', color: '#94A3B8', textDecoration: 'line-through' }}>
                                  {basePrice > 0 ? formatCurrencyIDR(basePrice) : 'Rp 74.000'}
                                </span>
                              </div>
                            ) : (
                              <div style={{ fontSize: '10px', color: '#059669', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px', marginTop: '1px' }}>
                                <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#059669', display: 'inline-block' }} />
                                Verified
                              </div>
                            )}
                          </td>
                        )}

                        {/* Tier */}
                        {visibleColumns.tier && (
                          <td style={{ padding: `${padY} 10px` }}>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '2px 7px',
                                borderRadius: '9999px',
                                fontSize: '9.5px',
                                fontWeight: 800,
                                backgroundColor:
                                  mat.priceTier === 'ECONOMY'
                                    ? '#ECFDF5'
                                    : mat.priceTier === 'PREMIUM'
                                    ? '#FFFBEB'
                                    : '#EFF6FF',
                                color:
                                  mat.priceTier === 'ECONOMY'
                                    ? '#047857'
                                    : mat.priceTier === 'PREMIUM'
                                    ? '#B45309'
                                    : '#1D4ED8',
                                border:
                                  mat.priceTier === 'ECONOMY'
                                    ? '1px solid #A7F3D0'
                                    : mat.priceTier === 'PREMIUM'
                                    ? '1px solid #FDE68A'
                                    : '1px solid #DBEAFE',
                              }}
                            >
                              {mat.priceTier || 'STANDARD'}
                            </span>
                          </td>
                        )}

                        {/* Wilayah */}
                        {visibleColumns.region && (
                          <td style={{ padding: `${padY} 10px` }}>
                            <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {primaryPriceRec?.region.province || 'Jawa Barat'}
                            </div>
                            <div style={{ fontSize: '10px', color: '#94A3B8' }}>
                              (Exact region)
                            </div>
                          </td>
                        )}

                        {/* Sumber */}
                        {visibleColumns.source && (
                          <td style={{ padding: `${padY} 10px`, color: '#475569', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {primaryPriceRec?.sourceName || 'Distributor Resmi'}
                          </td>
                        )}

                        {/* Updated */}
                        {visibleColumns.updated && (
                          <td style={{ padding: `${padY} 10px`, color: '#64748B', fontSize: '11px', whiteSpace: 'nowrap' }}>
                            {primaryPriceRec?.priceDate || '25 Sep 2026'}
                          </td>
                        )}

                        {/* Aksi */}
                        <td style={{ padding: `${padY} 6px`, textAlign: 'center', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                            <button
                              onClick={() => {
                                const refPrice = basePrice;
                                setTargetResourceForOverride({
                                  id: mat.id,
                                  code: mat.materialCode || mat.id,
                                  name: mat.name,
                                  unit: mat.unit,
                                  category: 'MATERIAL',
                                  masterPrice: refPrice,
                                  specification: mat.specification,
                                  brand: mat.brand,
                                });
                                setIsProjectPriceModalOpen(true);
                              }}
                              title={isOverridden ? 'Edit Override Harga' : 'Override Harga Proyek'}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '4px 7px',
                                borderRadius: '6px',
                                fontSize: '10.5px',
                                fontWeight: 700,
                                border: isOverridden ? '1px solid #FCD34D' : '1px solid #DBEAFE',
                                backgroundColor: isOverridden ? '#FEF3C7' : '#EFF6FF',
                                color: isOverridden ? '#92400E' : '#1D4ED8',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <Tag size={11} />
                              <span>{isOverridden ? 'Edit' : 'Override'}</span>
                            </button>

                            <button
                              onClick={() =>
                                setActionMenuMaterialId(actionMenuMaterialId === mat.id ? null : mat.id)
                              }
                              style={{
                                padding: '3px',
                                borderRadius: '6px',
                                color: '#94A3B8',
                                cursor: 'pointer',
                                border: 'none',
                                background: 'transparent',
                              }}
                            >
                              <MoreVertical size={14} />
                            </button>
                          </div>

                          {actionMenuMaterialId === mat.id && (
                            <div
                              style={{
                                position: 'absolute',
                                right: 0,
                                marginTop: '4px',
                                width: '140px',
                                backgroundColor: '#ffffff',
                                border: '1px solid #E2E8F0',
                                borderRadius: '10px',
                                boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
                                padding: '4px',
                                zIndex: 50,
                                fontSize: '11.5px',
                                textAlign: 'left',
                              }}
                            >
                              <button
                                onClick={() => {
                                  setActionMenuMaterialId(null);
                                  const prices = matDb.getPricesByMaterialId(mat.id);
                                  const refPrice = prices[0]?.price || 0;
                                  setTargetResourceForOverride({
                                    id: mat.id,
                                    code: mat.materialCode || mat.id,
                                    name: mat.name,
                                    unit: mat.unit,
                                    category: 'MATERIAL',
                                    masterPrice: refPrice,
                                    specification: mat.specification,
                                    brand: mat.brand,
                                  });
                                  setIsProjectPriceModalOpen(true);
                                }}
                                style={{
                                  width: '100%',
                                  textAlign: 'left',
                                  padding: '6px 8px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  background: 'transparent',
                                  color: '#2563EB',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                Override Harga
                              </button>
                              <button
                                onClick={() => {
                                  setActionMenuMaterialId(null);
                                  setSelectedMaterialForInspector(mat);
                                  setIsInspectorOpen(true);
                                }}
                                style={{
                                  width: '100%',
                                  textAlign: 'left',
                                  padding: '6px 8px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  background: 'transparent',
                                  color: '#334155',
                                  cursor: 'pointer',
                                }}
                              >
                                Lihat Detail
                              </button>
                              <button
                                onClick={() => {
                                  setActionMenuMaterialId(null);
                                  toggleSelectMaterial(mat.id);
                                  setIsCompareModalOpen(true);
                                }}
                                style={{
                                  width: '100%',
                                  textAlign: 'left',
                                  padding: '6px 8px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  background: 'transparent',
                                  color: '#334155',
                                  cursor: 'pointer',
                                }}
                              >
                                Bandingkan
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}

            {activeCategoryTab === 'LABOR' && (
              <LaborTableView
                laborList={paginatedLabor}
                selectedLabor={selectedLaborForInspector}
                onSelectLabor={(lab) => {
                  setSelectedLaborForInspector(lab);
                  setIsInspectorOpen(true);
                }}
                selectedProvince={selectedProvince}
                viewDensity={viewDensity}
                projectId={currentProject?.id}
                onOverridePrice={(lab) => {
                  setTargetResourceForOverride({
                    id: lab.id,
                    code: lab.code,
                    name: lab.name,
                    unit: lab.unit,
                    category: 'LABOR',
                    masterPrice: lab.basePriceOH,
                    specification: lab.skkLevel || lab.category,
                  });
                  setIsProjectPriceModalOpen(true);
                }}
              />
            )}

            {activeCategoryTab === 'EQUIPMENT' && (
              <EquipmentTableView
                equipmentList={paginatedEquipment}
                selectedEquipment={selectedEquipmentForInspector}
                onSelectEquipment={(eq) => {
                  setSelectedEquipmentForInspector(eq);
                  setIsInspectorOpen(true);
                }}
                viewDensity={viewDensity}
                projectId={currentProject?.id}
                onOverridePrice={(eq) => {
                  setTargetResourceForOverride({
                    id: eq.id,
                    code: eq.code,
                    name: eq.name,
                    unit: eq.unit,
                    category: 'EQUIPMENT',
                    masterPrice: eq.rentalPricePerHour,
                    specification: eq.capacity ? `${eq.category} - ${eq.capacity}` : eq.category,
                  });
                  setIsProjectPriceModalOpen(true);
                }}
              />
            )}

            {/* Pagination Controls (Matching Reference UX) */}
            <div
              style={{
                padding: '12px 16px',
                borderTop: '1px solid #E2E8F0',
                backgroundColor: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                fontSize: '11.5px',
              }}
            >
              <div style={{ color: '#64748B' }}>
                Menampilkan {(currentPage - 1) * pageSize + 1} -{' '}
                {Math.min(currentPage * pageSize, currentTotalItems)} dari{' '}
                {currentTotalItems.toLocaleString('id-ID')} item
              </div>

              {/* Page Number Pills */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  style={{
                    padding: '4px 6px',
                    borderRadius: '7px',
                    border: '1px solid #CBD5E1',
                    color: '#64748B',
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                    opacity: currentPage === 1 ? 0.3 : 1,
                    backgroundColor: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <ChevronLeft size={13} />
                </button>

                {[1, 2, 3, 4, 5].map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '7px',
                      fontWeight: 700,
                      fontSize: '11.5px',
                      cursor: 'pointer',
                      border: currentPage === page ? 'none' : '1px solid #E2E8F0',
                      backgroundColor: currentPage === page ? '#2563EB' : '#ffffff',
                      color: currentPage === page ? '#ffffff' : '#334155',
                    }}
                  >
                    {page}
                  </button>
                ))}

                <span style={{ padding: '0 4px', color: '#94A3B8' }}>...</span>

                <button
                  onClick={() => setCurrentPage(totalPages)}
                  style={{
                    padding: '0 8px',
                    height: '28px',
                    borderRadius: '7px',
                    fontWeight: 700,
                    fontSize: '11.5px',
                    cursor: 'pointer',
                    border: currentPage === totalPages ? 'none' : '1px solid #E2E8F0',
                    backgroundColor: currentPage === totalPages ? '#2563EB' : '#ffffff',
                    color: currentPage === totalPages ? '#ffffff' : '#334155',
                  }}
                >
                  {totalPages}
                </button>

                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  style={{
                    padding: '4px 6px',
                    borderRadius: '7px',
                    border: '1px solid #CBD5E1',
                    color: '#64748B',
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                    opacity: currentPage === totalPages ? 0.3 : 1,
                    backgroundColor: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <ChevronRight size={13} />
                </button>
              </div>

              {/* Items Per Page Select */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: '#64748B' }}>Tampilkan</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #CBD5E1',
                    borderRadius: '7px',
                    padding: '3px 6px',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    color: '#0F172A',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span style={{ color: '#64748B' }}>per halaman</span>
              </div>
            </div>
          </div>

          {/* RIGHT: PERSISTENT INSPECTOR PANEL */}
          {isInspectorOpen && (
            <MaterialInspectorPanel
              activeCategory={(activeCategoryTab === 'MATERIALS' || activeCategoryTab === 'LABOR' || activeCategoryTab === 'EQUIPMENT') ? activeCategoryTab : undefined}
              material={activeCategoryTab === 'MATERIALS' ? selectedMaterialForInspector : undefined}
              labor={activeCategoryTab === 'LABOR' ? selectedLaborForInspector : undefined}
              equipment={activeCategoryTab === 'EQUIPMENT' ? selectedEquipmentForInspector : undefined}
              selectedProvince={selectedProvince}
              projectId={currentProject ? currentProject.id : 'PROJ-DEMO-01'}
              projectName={currentProject ? currentProject.name : 'Rumah Tinggal Modern Tropis'}
              onClose={() => setIsInspectorOpen(false)}
              onEditMaterial={(mat) => setIsAddMaterialWizardOpen(true)}
              onAddPrice={(mat) => setIsAddMaterialWizardOpen(true)}
              onOpenProjectPriceModal={(mat) => {
                setTargetMaterialForProjectPrice(mat);
                setIsProjectPriceModalOpen(true);
              }}
              onViewAllComparisons={(mat) => {
                setSelectedMaterialIds((prev) =>
                  prev.includes(mat.id) ? prev : [...prev, mat.id]
                );
                setIsCompareModalOpen(true);
              }}
            />
          )}
        </div>
      )}
      </main>

      {/* ------------------------------------------------------------- */}
      {/* 5. MULTI-SELECTION COMPARE DOCK (2+ items selected)           */}
      {/* ------------------------------------------------------------- */}
      {selectedMaterialIds.length >= 2 && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 40,
            backgroundColor: '#0F172A',
            color: '#ffffff',
            padding: '10px 18px',
            borderRadius: '16px',
            boxShadow: '0 12px 36px rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            fontSize: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                backgroundColor: '#2563EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '11px',
              }}
            >
              {selectedMaterialIds.length}
            </span>
            <span style={{ fontWeight: 600 }}>Material dipilih</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setIsCompareModalOpen(true)}
              style={{
                padding: '6px 14px',
                borderRadius: '9px',
                backgroundColor: '#2563EB',
                color: '#ffffff',
                fontWeight: 700,
                cursor: 'pointer',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Scale size={13} />
              Bandingkan Harga
            </button>
            <button
              onClick={() => setSelectedMaterialIds([])}
              style={{
                padding: '6px 10px',
                borderRadius: '9px',
                backgroundColor: 'transparent',
                color: '#94A3B8',
                cursor: 'pointer',
                border: 'none',
              }}
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 6. MODALS & SUB-FLOWS                                          */}
      {/* ------------------------------------------------------------- */}
      <AddMaterialWizardModal
        isOpen={isAddMaterialWizardOpen}
        onClose={() => setIsAddMaterialWizardOpen(false)}
        onSave={(newMat: MaterialMaster, newPrice?: MaterialPrice) => {
          matDb.addMaterial(newMat);
          if (newPrice) matDb.addPriceRecord(newPrice);
          setSelectedMaterialForInspector(newMat);
          setIsInspectorOpen(true);
          setIsAddMaterialWizardOpen(false);
        }}
      />

      <MaterialCompareModal
        isOpen={isCompareModalOpen}
        onClose={() => setIsCompareModalOpen(false)}
        selectedMaterials={selectedMaterialsForCompare}
      />

      <MaterialDataQualityModal
        isOpen={isDataQualityModalOpen}
        onClose={() => setIsDataQualityModalOpen(false)}
      />

      <AiPriceResearchDrawer
        isOpen={isAiPriceDrawerOpen}
        initialQuery={aiSearchPrompt}
        onClose={() => setIsAiPriceDrawerOpen(false)}
        onAdoptPrice={(mat: MaterialMaster, price: number, saveToDb: boolean) => {
          if (saveToDb) {
            const newPriceRec: MaterialPrice = {
              id: `PRC-${Date.now()}`,
              materialId: mat.id,
              materialCode: mat.materialCode,
              regionId: 'REG-NASIONAL',
              region: { country: 'Indonesia', province: 'Indonesia' },
              price: price,
              currency: 'IDR',
              unit: mat.unit,
              priceTier: mat.priceTier || 'STANDARD',
              priceType: 'USER_DEFINED',
              sourceType: 'USER_INPUT',
              sourceName: 'Riset AI Terverifikasi',
              taxIncluded: false,
              taxRate: 0.11,
              deliveryIncluded: false,
              confidence: 'HIGH',
              verificationStatus: 'VERIFIED',
              freshness: 'CURRENT',
              priceDate: new Date().toISOString().split('T')[0],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            matDb.addPriceRecord(newPriceRec);
          }
          setIsAiPriceDrawerOpen(false);
        }}
      />

      <SpreadsheetSyncModal
        isOpen={isSpreadsheetModalOpen}
        onClose={() => setIsSpreadsheetModalOpen(false)}
        activeCategory={
          activeCategoryTab === 'LABOR'
            ? 'LABOR'
            : activeCategoryTab === 'EQUIPMENT'
            ? 'EQUIPMENT'
            : activeCategoryTab === 'PROJECT_PRICE'
            ? 'PROJECT_PRICE'
            : 'MATERIALS'
        }
      />

      <AiResourceSuggestDrawer
        isOpen={isAiResourceDrawerOpen}
        onClose={() => setIsAiResourceDrawerOpen(false)}
        selectedProvince={selectedProvince}
      />

      <ProjectPriceModal
        isOpen={isProjectPriceModalOpen}
        onClose={() => {
          setIsProjectPriceModalOpen(false);
          setTargetMaterialForProjectPrice(null);
          setTargetResourceForOverride(null);
        }}
        material={targetMaterialForProjectPrice}
        resource={targetResourceForOverride}
        projectId={currentProject ? currentProject.id : 'PROJ-DEMO-01'}
        projectName={currentProject ? currentProject.name : 'Rumah Tinggal Modern Tropis'}
        referencePrice={
          targetResourceForOverride
            ? targetResourceForOverride.masterPrice
            : targetMaterialForProjectPrice
            ? matDb.getPricesByMaterialId(targetMaterialForProjectPrice.id)[0]?.price || 0
            : 0
        }
        onSaved={() => {
          setPriceVersion((v) => v + 1);
        }}
      />
    </div>
  );
};
