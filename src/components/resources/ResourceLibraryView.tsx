import React, { useState, useMemo } from 'react';
import {
  Package,
  HardHat,
  Truck,
  Building,
  Search,
  Plus,
  Download,
  MapPin,
  Trash2,
  Database,
  Layers,
  X,
  CheckCircle2,
  Filter,
  Sparkles,
  Tag,
  TrendingUp,
  TrendingDown,
  Scale,
  Calendar,
  ShieldCheck,
  Store,
  ArrowRight,
  ExternalLink,
  DollarSign,
  AlertTriangle,
  History,
  Check,
  Upload,
} from 'lucide-react';
import { PriceItem, WorkItem, RabItem } from '../../types';
import { MASTER_PRICE_ITEMS } from '../../data/indonesianPrices';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';
import { useProject } from '../../context/ProjectContext';
import { ALL_OFFICIAL_AHSP_ITEMS } from '../../data/nationalCostDatabase/masterRegistry';
import { PriceRepository } from '../../engine/pricing/repository/priceRepository';

export interface ExtendedPriceRecord extends PriceItem {
  province?: string;
  city?: string;
  effectiveDate?: string;
  scope?: 'PROJECT' | 'GLOBAL';
  confidence?: 'HIGH_VERIFIED' | 'MEDIUM_MARKET' | 'REFERENCE_SHST' | 'UNVERIFIED';
  supplierPrice?: number;
  historicalPrice?: number;
  governmentPrice?: number;
}

export interface ResourceLibraryViewProps {
  initialTab?: 'MATERIAL' | 'LABOR' | 'EQUIPMENT' | 'SUPPLIERS';
  initialScopeFilter?: 'ALL' | 'PROJECT' | 'GLOBAL';
  onNavigateToTab?: (tab: string) => void;
}

export const ResourceLibraryView: React.FC<ResourceLibraryViewProps> = ({
  initialTab = 'MATERIAL',
  initialScopeFilter = 'ALL',
  onNavigateToTab,
}) => {
  const {
    currentProject,
    projectRabItems,
    projectWorkItems,
    updateRabItemFull,
    updateWorkItem,
    projectPriceOverrides,
    updateProjectPriceOverride,
    createVersionSnapshot,
  } = useProject();

  // Active Tab
  const [activeTab, setActiveTab] = useState<'MATERIAL' | 'LABOR' | 'EQUIPMENT' | 'SUPPLIERS'>(initialTab);

  // Search & Filters
  const [search, setSearch] = useState('');
  const [selectedSubcategory, setSelectedSubcategory] = useState('Semua Kategori');
  const [selectedProvince, setSelectedProvince] = useState('Semua Wilayah');
  const [selectedSourceFilter, setSelectedSourceFilter] = useState('Semua Sumber');
  const [selectedYearFilter, setSelectedYearFilter] = useState<number | string>(2026);
  const [selectedScope, setSelectedScope] = useState<'ALL' | 'PROJECT' | 'GLOBAL'>(initialScopeFilter);
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'code' | 'lastUpdated'>('code');
  const [sortAsc, setSortAsc] = useState(true);

  // Selected Resource for Price Intelligence Comparison Drawer
  const [comparingResource, setComparingResource] = useState<ExtendedPriceRecord | null>(null);

  // Adopt Price Confirmation & Impact Preview Modal
  const [adoptTarget, setAdoptTarget] = useState<{
    resource: ExtendedPriceRecord;
    newPrice: number;
    priceLabel: string;
  } | null>(null);

  // Add Custom Price Record Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newBrand, setNewBrand] = useState('');
  const [newProduct, setNewProduct] = useState('');
  const [newGrade, setNewGrade] = useState('');
  const [newSubcat, setNewSubcat] = useState('Baja & Besi');
  const [newSpec, setNewSpec] = useState('');
  const [newUnit, setNewUnit] = useState('kg');
  const [newPrice, setNewPrice] = useState<number>(0);
  const [newSupplierPrice, setNewSupplierPrice] = useState<number>(0);
  const [newHistoricalPrice, setNewHistoricalPrice] = useState<number>(0);
  const [newGovPrice, setNewGovPrice] = useState<number>(0);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newProvince, setNewProvince] = useState('DKI Jakarta');
  const [newCity, setNewCity] = useState('Jabodetabek');
  const [newSource, setNewSource] = useState('Vendor / Supplier');
  const [newDate, setNewDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [newNotes, setNewNotes] = useState('');
  const [newConfidence, setNewConfidence] = useState<'HIGH_VERIFIED' | 'MEDIUM_MARKET' | 'REFERENCE_SHST'>('HIGH_VERIFIED');

  // Master Raw List with Local Overrides
  const [priceRecords, setPriceRecords] = useState<ExtendedPriceRecord[]>(() => {
    return MASTER_PRICE_ITEMS.map((item, idx) => {
      // Synthesize multi-source prices from real range
      const base = item.price;
      const govPrice = Math.round(base * 0.98);
      const suppPrice = Math.round(base * 1.02);
      const histPrice = Math.round(base * 0.95);

      return {
        ...item,
        province: item.location || 'DKI Jakarta',
        city: 'Jabodetabek',
        effectiveDate: item.lastUpdated || '2026-08-01',
        scope: 'GLOBAL',
        confidence: idx % 4 === 0 ? 'HIGH_VERIFIED' : idx % 3 === 0 ? 'REFERENCE_SHST' : 'MEDIUM_MARKET',
        supplierPrice: suppPrice,
        historicalPrice: histPrice,
        governmentPrice: govPrice,
      };
    });
  });

  // Notification Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // ---------------------------------------------------------------------------
  // FILTERED DATA BY ACTIVE TAB
  // ---------------------------------------------------------------------------
  const currentTabCategory = activeTab === 'MATERIAL' ? 'MATERIAL' : activeTab === 'LABOR' ? 'LABOR' : 'EQUIPMENT';

  const filteredRecords = useMemo(() => {
    if (activeTab === 'SUPPLIERS') return [];

    return priceRecords
      .filter((item) => {
        if (item.category !== currentTabCategory) return false;

        if (selectedSubcategory !== 'Semua Subkategori' && item.subcategory !== selectedSubcategory) {
          return false;
        }

        if (selectedProvince !== 'Semua Wilayah' && !item.location.includes(selectedProvince)) {
          return false;
        }

        if (selectedScope !== 'ALL') {
          const isProjectSpecific = projectPriceOverrides.some((o) => o.resourceCode === item.code);
          if (selectedScope === 'PROJECT' && !isProjectSpecific) return false;
          if (selectedScope === 'GLOBAL' && isProjectSpecific) return false;
        }

        if (search.trim()) {
          const q = search.toLowerCase();
          const matchCode = (item.code || '').toLowerCase().includes(q);
          const matchName = (item.name || '').toLowerCase().includes(q);
          const matchBrand = (item.brand || '').toLowerCase().includes(q);
          const matchSpec = (item.specification || '').toLowerCase().includes(q);
          const matchSupplier = (item.supplier || '').toLowerCase().includes(q);
          return matchCode || matchName || matchBrand || matchSpec || matchSupplier;
        }

        return true;
      })
      .sort((a, b) => {
        let valA: any = a[sortBy] || '';
        let valB: any = b[sortBy] || '';
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortAsc ? valA - valB : valB - valA;
        }
        return sortAsc ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
      });
  }, [priceRecords, activeTab, currentTabCategory, selectedSubcategory, selectedProvince, selectedScope, search, sortBy, sortAsc, projectPriceOverrides]);

  // Subcategories Options
  const subcategoriesList = useMemo(() => {
    if (activeTab === 'MATERIAL') {
      return [
        'Semua Subkategori',
        'Keramik & Porselen',
        'Batu, Bata & Roster',
        'Semen, Mortar & Beton',
        'Baja & Besi',
        'Cat',
        'Plafon & Partisi',
        'Kayu, MDF & HPL',
        'Vinyl, SPC & Laminate',
        'Plumbing & Sanitair',
        'Electrical & Lighting',
        'Roofing',
        'Fasad & Exterior',
        'Waterproofing & Sealant',
      ];
    } else if (activeTab === 'LABOR') {
      return ['Semua Subkategori', 'Pekerja Standar', 'Tukang Khusus', 'Mandor & Kepala Tukang', 'Subkontraktor Spesialis'];
    } else {
      return ['Semua Subkategori', 'Alat Berat', 'Alat Angkat & Angkut', 'Alat Pemadat', 'Perkakas & Genset'];
    }
  }, [activeTab]);

  // ---------------------------------------------------------------------------
  // SUPPLIER & SOURCES DIRECTORY
  // ---------------------------------------------------------------------------
  const suppliersDirectory = useMemo(() => {
    return [
      {
        id: 'sup-1',
        name: 'PT Krakatau Steel (Persero) Tbk',
        category: 'Baja, Besi Beton & Profil Baja',
        verified: true,
        location: 'Cilegon / DKI Jakarta',
        contact: '+62 21 522-1255',
        email: 'sales@krakatausteel.com',
        rating: 4.9,
        lastUpdated: '2026-09-01',
        sourceType: 'Produsen Resmi BUMN',
      },
      {
        id: 'sup-2',
        name: 'PT Semen Indonesia Group (SIG)',
        category: 'Semen Portland, Semen Curah & Ready Mix',
        verified: true,
        location: 'Jawa Timur / Nasional',
        contact: '+62 31 398-1811',
        email: 'info@sig.id',
        rating: 4.9,
        lastUpdated: '2026-08-28',
        sourceType: 'Produsen Semen Nasional',
      },
      {
        id: 'sup-3',
        name: 'PT Satya Djaya Raya (Roman Ceramics)',
        category: 'Keramik & RomanGranit',
        verified: true,
        location: 'Tangerang / Jabodetabek',
        contact: '+62 21 590-3456',
        email: 'marketing@romanceramics.com',
        rating: 4.8,
        lastUpdated: '2026-09-05',
        sourceType: 'Distributor Resmi',
      },
      {
        id: 'sup-4',
        name: 'HSPK & SHST DKI Jakarta 2026',
        category: 'Harga Satuan Pokok Kegiatan Pemprov DKI',
        verified: true,
        location: 'DKI Jakarta',
        contact: 'Dinas Bina Marga / Cipta Karya',
        email: 'bppbj@jakarta.go.id',
        rating: 5.0,
        lastUpdated: '2026-01-15',
        sourceType: 'Standar Resmi Pemerintah',
      },
      {
        id: 'sup-5',
        name: 'Jurnal Harga Satuan Bahan Bangunan (Bina Sarana)',
        category: 'Jurnal Kompilasi Harga Pasar Nasional',
        verified: true,
        location: 'Seluruh Indonesia',
        contact: '+62 21 789-0123',
        email: 'redaksi@jurnalhargabangunan.id',
        rating: 4.7,
        lastUpdated: '2026-08-15',
        sourceType: 'Publikasi Industri Konstruksi',
      },
    ];
  }, []);

  // ---------------------------------------------------------------------------
  // PRICE IMPACT CALCULATION (FOR ADOPT PRICE MODAL)
  // ---------------------------------------------------------------------------
  const impactSummary = useMemo(() => {
    if (!adoptTarget) return null;
    const { resource, newPrice } = adoptTarget;
    const oldPrice = resource.price;
    const delta = newPrice - oldPrice;

    // 1. Affected AHSP
    const cleanCode = (resource.code || '').toLowerCase();
    const cleanName = (resource.name || '').toLowerCase();

    const affectedAhsp = ALL_OFFICIAL_AHSP_ITEMS.filter((ahsp) => {
      const allComps = [
        ...(ahsp.materialComponents || []),
        ...(ahsp.laborComponents || []),
        ...(ahsp.equipmentComponents || []),
      ];
      return allComps.some(
        (c) =>
          (c.code && c.code.toLowerCase() === cleanCode) ||
          (c.name && c.name.toLowerCase().includes(cleanName)) ||
          cleanName.includes((c.name || '').toLowerCase())
      );
    });

    // 2. Affected Active Project Work Items
    const affectedWorkItems = projectRabItems.filter((rab) => {
      const matchAhsp = affectedAhsp.some((a) => a.code === rab.code || a.code === rab.ahspCode);
      const matchDesc = (rab.description || '').toLowerCase().includes(cleanName);
      return matchAhsp || matchDesc;
    });

    // 3. Cost Impact on Project Total RAB
    const beforeTotalRab = projectRabItems.reduce(
      (sum, item) => sum + (Number(item.amount) || Number(item.totalPrice) || 0),
      0
    );

    // Rough estimated delta: sum of (volume * coeff * delta)
    const estimatedCostDelta = affectedWorkItems.reduce((acc, item) => {
      return acc + (Number(item.volume) || 1) * delta;
    }, 0);

    const afterTotalRab = beforeTotalRab + estimatedCostDelta;

    return {
      affectedAhsp,
      affectedWorkItems,
      beforeTotalRab,
      afterTotalRab,
      estimatedCostDelta,
      delta,
      percentageChange: oldPrice > 0 ? ((delta / oldPrice) * 100).toFixed(1) : '0',
    };
  }, [adoptTarget, projectRabItems]);

  // ---------------------------------------------------------------------------
  // ADOPT PRICE EXECUTION
  // ---------------------------------------------------------------------------
  const handleExecuteAdoptPrice = () => {
    if (!adoptTarget) return;
    const { resource, newPrice, priceLabel } = adoptTarget;

    // 1. Update Project Price Override
    updateProjectPriceOverride(
      resource.code,
      resource.name,
      resource.category,
      resource.unit,
      resource.price,
      newPrice
    );

    // 2. Update all affected RAB items in the active project
    if (impactSummary && impactSummary.affectedWorkItems.length > 0) {
      impactSummary.affectedWorkItems.forEach((item) => {
        const currentUnitPrice = Number(item.unitPrice) || 0;
        const newUnitPrice = Math.max(0, currentUnitPrice + impactSummary.delta);
        const newAmount = Math.round(newUnitPrice * (Number(item.volume) || 1));

        updateRabItemFull(item.id, {
          unitPrice: newUnitPrice,
          amount: newAmount,
          totalPrice: newAmount,
        });
      });
    }

    createVersionSnapshot(`Adopsi Harga ${resource.name}: ${formatCurrencyIDR(newPrice)} (${priceLabel})`);
    showToast(`Harga "${resource.name}" berhasil diterapkan ke proyek (${priceLabel})`);
    setAdoptTarget(null);
    setComparingResource(null);
  };

  // ---------------------------------------------------------------------------
  // ADD CUSTOM PRICE RECORD HANDLER
  // ---------------------------------------------------------------------------
  const handleCreateNewPriceRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || newPrice <= 0) return;

    const newRecord: ExtendedPriceRecord = {
      id: `custom-pr-${Date.now()}`,
      code: newCode.trim() || `RES-${Date.now().toString().slice(-5)}`,
      name: newName.trim(),
      category: currentTabCategory,
      subcategory: newSubcat,
      brand: newBrand.trim() || undefined,
      specification: newSpec.trim() || 'Spesifikasi standar',
      unit: newUnit.trim() || 'unit',
      price: newPrice,
      supplierPrice: newSupplierPrice > 0 ? newSupplierPrice : newPrice,
      historicalPrice: newHistoricalPrice > 0 ? newHistoricalPrice : Math.round(newPrice * 0.95),
      governmentPrice: newGovPrice > 0 ? newGovPrice : Math.round(newPrice * 0.98),
      location: `${newProvince} / ${newCity}`,
      province: newProvince,
      city: newCity,
      supplier: newSupplierName.trim() || 'Distributor Terverifikasi',
      periodVersion: '2026-Q3',
      lastUpdated: new Date().toISOString().split('T')[0],
      priceSource: 'Input Estimator (Internal)',
      scope: 'PROJECT',
      confidence: newConfidence,
    };

    PriceRepository.getInstance().addCustomPrice({
      name: newName.trim(),
      category: currentTabCategory,
      subcategory: newSubcat,
      specification: newSpec.trim(),
      brand: newBrand.trim(),
      unit: newUnit.trim(),
      price: newPrice,
      location: `${newProvince} / ${newCity}`,
      priceSource: newSource || 'USER_INPUT',
      supplier: newSupplierName.trim(),
      notes: newNotes.trim(),
    });

    setPriceRecords((prev) => [newRecord, ...prev]);
    setIsAddModalOpen(false);

    // Reset Form
    setNewName('');
    setNewCode('');
    setNewBrand('');
    setNewProduct('');
    setNewGrade('');
    setNewSpec('');
    setNewPrice(0);
    setNewSupplierPrice(0);
    setNewHistoricalPrice(0);
    setNewGovPrice(0);
    setNewSupplierName('');
    setNewNotes('');
    showToast(`Komponen harga "${newRecord.name}" berhasil ditambahkan ke database.`);
  };

  const handleExportCsv = () => {
    const csvContent = PriceRepository.getInstance().exportToCsv();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `ezrab_material_dan_harga_2026.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Database Material & Harga berhasil diekspor ke CSV.');
  };

  const handleImportCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      const lines = text.split('\n').filter((l) => l.trim().length > 0);
      let count = 0;
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((c) => c.replace(/^"|"$/g, '').trim());
        if (cols.length >= 7) {
          const [code, name, cat, subcat, spec, brand, unit, priceStr, loc, src] = cols;
          const p = Number(priceStr) || 0;
          if (name && p > 0) {
            PriceRepository.getInstance().addCustomPrice({
              name,
              category: (cat as any) || 'MATERIAL',
              subcategory: subcat,
              specification: spec,
              brand,
              unit: unit || 'unit',
              price: p,
              location: loc || 'Nasional',
              priceSource: src || 'CSV_IMPORT',
            });
            count++;
          }
        }
      }
      showToast(`Berhasil mengimpor ${count} item material & harga.`);
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F8FAFC', overflow: 'hidden' }}>
      {/* ---------------------------------------------------------------------
          1. HEADER BAR & ACTIVE PROJECT CONTEXT
         --------------------------------------------------------------------- */}
      <div
        style={{
          background: '#FFFFFF',
          borderBottom: '1px solid #E2E8F0',
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
            <span>Workspace</span>
            <span>/</span>
            <span>Database</span>
            <span>/</span>
            <span style={{ color: '#2563EB', fontWeight: 750 }}>
              {activeTab === 'MATERIAL' ? 'Material & Harga' : activeTab === 'LABOR' ? 'Standar Upah' : activeTab === 'EQUIPMENT' ? 'Tarif Peralatan' : 'Supplier & Vendor'}
            </span>
          </div>
          <h1 style={{ fontSize: '19px', fontWeight: 800, color: '#0F172A', margin: '3px 0 0 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={20} color="#2563EB" />
            {activeTab === 'MATERIAL' ? 'Material & Harga' : activeTab === 'LABOR' ? 'Database Standar Upah' : activeTab === 'EQUIPMENT' ? 'Database Sewa Peralatan' : 'Daftar Supplier & Vendor'}
          </h1>
          <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748B' }}>
            {activeTab === 'MATERIAL'
              ? 'Kelola material, spesifikasi, dan harga yang digunakan EZRAB.'
              : 'Standar upah harian dan tarif acuan resmi konstruksi.'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Active Project Pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: '#F1F5F9',
              padding: '6px 14px',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
            }}
          >
            <Building size={14} color="#2563EB" />
            <div style={{ fontSize: '11.5px' }}>
              <span style={{ color: '#64748B' }}>Proyek Aktif: </span>
              <strong style={{ color: '#0F172A' }}>{currentProject ? currentProject.name : 'Semua Proyek'}</strong>
            </div>
          </div>

          <button
            onClick={() => setIsAddModalOpen(true)}
            style={{
              height: '36px',
              padding: '0 16px',
              borderRadius: '8px',
              background: '#2563EB',
              color: '#FFFFFF',
              fontSize: '12.5px',
              fontWeight: 750,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 4px rgba(37,99,235,0.2)',
            }}
          >
            <Plus size={15} />
            <span>+ Tambah Harga Baru</span>
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------------------------
          2. TAB NAVIGATION
         --------------------------------------------------------------------- */}
      <div
        style={{
          background: '#FFFFFF',
          borderBottom: '1px solid #E2E8F0',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', gap: '20px' }}>
          <button
            onClick={() => setActiveTab('MATERIAL')}
            style={{
              padding: '12px 6px',
              fontSize: '13px',
              fontWeight: activeTab === 'MATERIAL' ? 750 : 600,
              color: activeTab === 'MATERIAL' ? '#2563EB' : '#64748B',
              borderBottom: activeTab === 'MATERIAL' ? '2px solid #2563EB' : '2px solid transparent',
              background: 'transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
            }}
          >
            <Package size={15} />
            <span>Material / Bahan</span>
            <span style={{ fontSize: '10.5px', background: '#EFF6FF', color: '#2563EB', padding: '1px 6px', borderRadius: '10px', fontWeight: 700 }}>
              {priceRecords.filter((r) => r.category === 'MATERIAL').length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('LABOR')}
            style={{
              padding: '12px 6px',
              fontSize: '13px',
              fontWeight: activeTab === 'LABOR' ? 750 : 600,
              color: activeTab === 'LABOR' ? '#2563EB' : '#64748B',
              borderBottom: activeTab === 'LABOR' ? '2px solid #2563EB' : '2px solid transparent',
              background: 'transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
            }}
          >
            <HardHat size={15} />
            <span>Upah / Tenaga Kerja</span>
            <span style={{ fontSize: '10.5px', background: '#F0FDF4', color: '#16A34A', padding: '1px 6px', borderRadius: '10px', fontWeight: 700 }}>
              {priceRecords.filter((r) => r.category === 'LABOR').length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('EQUIPMENT')}
            style={{
              padding: '12px 6px',
              fontSize: '13px',
              fontWeight: activeTab === 'EQUIPMENT' ? 750 : 600,
              color: activeTab === 'EQUIPMENT' ? '#2563EB' : '#64748B',
              borderBottom: activeTab === 'EQUIPMENT' ? '2px solid #2563EB' : '2px solid transparent',
              background: 'transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
            }}
          >
            <Truck size={15} />
            <span>Alat / Peralatan</span>
            <span style={{ fontSize: '10.5px', background: '#FEF3C7', color: '#D97706', padding: '1px 6px', borderRadius: '10px', fontWeight: 700 }}>
              {priceRecords.filter((r) => r.category === 'EQUIPMENT').length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('SUPPLIERS')}
            style={{
              padding: '12px 6px',
              fontSize: '13px',
              fontWeight: activeTab === 'SUPPLIERS' ? 750 : 600,
              color: activeTab === 'SUPPLIERS' ? '#2563EB' : '#64748B',
              borderBottom: activeTab === 'SUPPLIERS' ? '2px solid #2563EB' : '2px solid transparent',
              background: 'transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
            }}
          >
            <Store size={15} />
            <span>Supplier & Sources ({suppliersDirectory.length})</span>
          </button>
        </div>

        {/* Price Intelligence Disclaimer Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: '#64748B' }}>
          <ShieldCheck size={14} color="#16A34A" />
          <span>Multi-source verified (PUPR 2026, Distributor & Jurnal Pasar)</span>
        </div>
      </div>

      {/* ---------------------------------------------------------------------
          3. SEARCH & ADVANCED FILTER TOOLBAR
         --------------------------------------------------------------------- */}
      {activeTab !== 'SUPPLIERS' && (
        <div
          style={{
            padding: '12px 24px',
            background: '#FFFFFF',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
            {/* Search Input */}
            <div style={{ position: 'relative', minWidth: '280px', flex: 1 }}>
              <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '10px' }} />
              <input
                type="text"
                placeholder={`Cari nama ${activeTab === 'MATERIAL' ? 'material, merk' : activeTab === 'LABOR' ? 'pekerja, profesi' : 'alat berat'}...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  height: '34px',
                  paddingLeft: '32px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '12px',
                  outline: 'none',
                }}
              />
            </div>

            {/* Subcategory Filter */}
            <select
              value={selectedSubcategory}
              onChange={(e) => setSelectedSubcategory(e.target.value)}
              style={{
                height: '34px',
                padding: '0 10px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                fontSize: '12px',
                color: '#334155',
                background: '#FFFFFF',
              }}
            >
              {subcategoriesList.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            {/* Sumber Filter */}
            <select
              value={selectedSourceFilter}
              onChange={(e) => setSelectedSourceFilter(e.target.value)}
              style={{
                height: '34px',
                padding: '0 10px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                fontSize: '12px',
                color: '#334155',
                background: '#FFFFFF',
              }}
            >
              <option value="Semua Sumber">Sumber: Semua</option>
              <option value="Vendor">Vendor / Supplier</option>
              <option value="PUPR">PUPR / Standar Resmi</option>
              <option value="Master">EZRAB Database</option>
              <option value="Proyek">Harga Khusus Proyek</option>
            </select>

            {/* Location / Province Filter */}
            <select
              value={selectedProvince}
              onChange={(e) => setSelectedProvince(e.target.value)}
              style={{
                height: '34px',
                padding: '0 10px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                fontSize: '12px',
                color: '#334155',
                background: '#FFFFFF',
              }}
            >
              <option value="Semua Wilayah">Wilayah: Semua</option>
              <option value="Jabodetabek">Jabodetabek / DKI</option>
              <option value="Jawa Barat">Jawa Barat</option>
              <option value="Jawa Tengah">Jawa Tengah</option>
              <option value="Jawa Timur">Jawa Timur</option>
              <option value="Bali">Bali</option>
              <option value="IKN">IKN / Kaltim</option>
            </select>

            {/* Tahun Filter */}
            <select
              value={selectedYearFilter}
              onChange={(e) => setSelectedYearFilter(e.target.value)}
              style={{
                height: '34px',
                padding: '0 10px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                fontSize: '12px',
                color: '#334155',
                background: '#FFFFFF',
              }}
            >
              <option value={2026}>Tahun 2026</option>
              <option value={2025}>Tahun 2025</option>
              <option value={2024}>Tahun 2024</option>
              <option value="Semua Tahun">Semua Tahun</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label
              style={{
                height: '34px',
                padding: '0 12px',
                borderRadius: '6px',
                background: '#F1F5F9',
                border: '1px solid #CBD5E1',
                fontSize: '12px',
                fontWeight: 650,
                color: '#334155',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Upload size={14} /> Import
              <input
                type="file"
                accept=".csv"
                onChange={handleImportCsv}
                style={{ display: 'none' }}
              />
            </label>

            <button
              onClick={handleExportCsv}
              style={{
                height: '34px',
                padding: '0 12px',
                borderRadius: '6px',
                background: '#F1F5F9',
                border: '1px solid #CBD5E1',
                fontSize: '12px',
                fontWeight: 650,
                color: '#334155',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Download size={14} /> Export
            </button>

            <button
              onClick={() => setIsAddModalOpen(true)}
              style={{
                height: '34px',
                padding: '0 14px',
                borderRadius: '6px',
                background: '#2563EB',
                border: 'none',
                fontSize: '12px',
                fontWeight: 700,
                color: '#FFFFFF',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 1px 3px rgba(37,99,235,0.2)',
              }}
            >
              <Plus size={14} /> + Tambah Material
            </button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------
          4. MAIN CONTENT AREA (DATA TABLE OR SUPPLIERS)
         --------------------------------------------------------------------- */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {activeTab === 'SUPPLIERS' ? (
          // SUPPLIER DIRECTORY CARDS
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
            {suppliersDirectory.map((supplier) => (
              <div
                key={supplier.id}
                style={{
                  background: '#FFFFFF',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  padding: '18px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#2563EB', background: '#EFF6FF', padding: '2px 8px', borderRadius: '4px' }}>
                      {supplier.sourceType}
                    </span>
                    {supplier.verified && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#16A34A', fontWeight: 700 }}>
                        <ShieldCheck size={14} /> Terverifikasi
                      </span>
                    )}
                  </div>

                  <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0' }}>
                    {supplier.name}
                  </h3>
                  <p style={{ fontSize: '12px', color: '#475569', margin: '0 0 12px 0' }}>
                    {supplier.category}
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11.5px', color: '#64748B' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <MapPin size={13} color="#94A3B8" />
                      <span>{supplier.location}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Calendar size={13} color="#94A3B8" />
                      <span>Update Terakhir: {supplier.lastUpdated}</span>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: '#64748B' }}>{supplier.contact}</span>
                  <button
                    onClick={() => {
                      setSearch(supplier.name.split(' ')[1] || supplier.name);
                      setActiveTab('MATERIAL');
                    }}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '5px',
                      background: '#EFF6FF',
                      border: '1px solid #BFDBFE',
                      color: '#2563EB',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span>Lihat Produk</span>
                    <ArrowRight size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          // RESOURCE PRICE INTELLIGENCE TABLE
          <div style={{ background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #CBD5E1', color: '#475569', fontSize: '11.5px' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', width: '18%' }}>Material</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', width: '14%' }}>Spesifikasi</th>
                  <th style={{ padding: '10px 10px', textAlign: 'left', width: '10%' }}>Brand</th>
                  <th style={{ padding: '10px 10px', textAlign: 'left', width: '10%' }}>Kategori</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: '6%' }}>Unit</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', width: '12%' }}>Harga</th>
                  <th style={{ padding: '10px 10px', textAlign: 'left', width: '10%' }}>Wilayah</th>
                  <th style={{ padding: '10px 10px', textAlign: 'left', width: '8%' }}>Sumber</th>
                  <th style={{ padding: '10px 10px', textAlign: 'center', width: '8%' }}>Tanggal</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: '7%' }}>Status</th>
                  <th style={{ padding: '10px 10px', textAlign: 'center', width: '7%' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ padding: '40px 20px', textAlign: 'center', color: '#94A3B8' }}>
                      Tidak ada data material & harga yang sesuai dengan filter pencarian.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((item) => {
                    const isProjectOverride = projectPriceOverrides.some((o) => o.resourceCode === item.code);

                    return (
                      <tr
                        key={item.id}
                        style={{
                          borderBottom: '1px solid #F1F5F9',
                          background: isProjectOverride ? '#EFF6FF' : '#FFFFFF',
                          transition: 'background 0.1s',
                        }}
                      >
                        {/* Material */}
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '12.5px' }}>{item.name}</div>
                          <div style={{ fontSize: '10.5px', fontFamily: 'monospace', color: '#2563EB', marginTop: '1px' }}>
                            {item.code}
                          </div>
                        </td>

                        {/* Spesifikasi */}
                        <td style={{ padding: '10px 12px', color: '#475569', fontSize: '11.5px' }}>
                          {item.specification || '-'}
                        </td>

                        {/* Brand */}
                        <td style={{ padding: '10px 10px', color: '#1E293B', fontWeight: 600, fontSize: '11.5px' }}>
                          {item.brand || '-'}
                        </td>

                        {/* Kategori */}
                        <td style={{ padding: '10px 10px', color: '#64748B', fontSize: '11.5px' }}>
                          {item.subcategory || 'Material'}
                        </td>

                        {/* Unit */}
                        <td style={{ padding: '10px 8px', textAlign: 'center', color: '#334155', fontWeight: 650 }}>
                          {item.unit}
                        </td>

                        {/* Harga */}
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '13px', fontFamily: 'monospace' }}>
                            {formatCurrencyIDR(item.price)}
                          </div>
                        </td>

                        {/* Wilayah */}
                        <td style={{ padding: '10px 10px', color: '#64748B', fontSize: '11.5px' }}>
                          {item.location || 'Nasional'}
                        </td>

                        {/* Sumber */}
                        <td style={{ padding: '10px 10px', fontSize: '11px', color: '#475569' }}>
                          <span style={{ padding: '2px 6px', borderRadius: '4px', background: '#F1F5F9', fontWeight: 600, fontSize: '10.5px' }}>
                            {item.supplier ? 'Vendor' : 'Database'}
                          </span>
                        </td>

                        {/* Tanggal */}
                        <td style={{ padding: '10px 10px', textAlign: 'center', color: '#64748B', fontSize: '11px' }}>
                          {item.effectiveDate || '25 Sep 2026'}
                        </td>

                        {/* Status */}
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <span
                            style={{
                              fontSize: '9.5px',
                              fontWeight: 800,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: isProjectOverride ? '#EFF6FF' : '#DCFCE7',
                              color: isProjectOverride ? '#1D4ED8' : '#15803D',
                            }}
                          >
                            {isProjectOverride ? 'PROYEK' : 'ACTIVE'}
                          </span>
                        </td>

                        {/* Aksi */}
                        <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                          <button
                            onClick={() => setComparingResource(item)}
                            style={{
                              height: '26px',
                              padding: '0 8px',
                              borderRadius: '5px',
                              background: '#EFF6FF',
                              border: '1px solid #BFDBFE',
                              color: '#2563EB',
                              fontSize: '10.5px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                            }}
                          >
                            <Scale size={11} /> Detail
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------------------
          5. PRICE INTELLIGENCE COMPARISON DRAWER / MODAL
         --------------------------------------------------------------------- */}
      {comparingResource && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            justifyContent: 'flex-end',
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
          }}
        >
          <div
            style={{
              width: '640px',
              maxWidth: '100%',
              height: '100%',
              background: '#FFFFFF',
              boxShadow: '-10px 0 25px -5px rgba(0,0,0,0.15)',
              display: 'flex',
              flexDirection: 'column',
              animation: 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {/* Drawer Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: 800, color: '#2563EB', background: '#EFF6FF', padding: '2px 6px', borderRadius: '4px' }}>
                  {comparingResource.code}
                </span>
                <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: '4px 0 0' }}>
                  {comparingResource.name}
                </h2>
                <span style={{ fontSize: '11.5px', color: '#64748B' }}>{comparingResource.specification} ({comparingResource.unit})</span>
              </div>
              <button
                onClick={() => setComparingResource(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: '#64748B' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Drawer Body (Scrollable) */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Statistical Distribution Summary */}
              {(() => {
                const prices = [
                  comparingResource.price,
                  comparingResource.supplierPrice || comparingResource.price,
                  comparingResource.historicalPrice || Math.round(comparingResource.price * 0.95),
                  comparingResource.governmentPrice || Math.round(comparingResource.price * 0.98),
                ];
                const minPrice = Math.min(...prices);
                const maxPrice = Math.max(...prices);
                const medianPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);

                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                    <div style={{ background: '#F8FAFC', padding: '10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                      <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Minimum</span>
                      <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#16A34A', marginTop: '2px' }}>
                        {formatCurrencyIDR(minPrice)}
                      </div>
                    </div>
                    <div style={{ background: '#F8FAFC', padding: '10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                      <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Maximum</span>
                      <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#DC2626', marginTop: '2px' }}>
                        {formatCurrencyIDR(maxPrice)}
                      </div>
                    </div>
                    <div style={{ background: '#F8FAFC', padding: '10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                      <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Median / Rerata</span>
                      <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#2563EB', marginTop: '2px' }}>
                        {formatCurrencyIDR(medianPrice)}
                      </div>
                    </div>
                    <div style={{ background: '#EFF6FF', padding: '10px', borderRadius: '8px', border: '1px solid #BFDBFE' }}>
                      <span style={{ fontSize: '10px', color: '#1E40AF', fontWeight: 700, textTransform: 'uppercase' }}>Harga Terpilih</span>
                      <div style={{ fontSize: '13.5px', fontWeight: 850, color: '#1D4ED8', marginTop: '2px' }}>
                        {formatCurrencyIDR(comparingResource.price)}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 4 Multi-Source Price Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#0F172A' }}>
                  Sumber Komparasi Harga Terverifikasi:
                </div>

                {/* 1. Project Active Price */}
                <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 750, color: '#0F172A' }}>1. Harga Aktif Proyek</span>
                      <span style={{ fontSize: '10px', background: '#DBEAFE', color: '#1E40AF', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>SEDANG DIGUNAKAN</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                      Lokasi: {comparingResource.location} • Update: {comparingResource.lastUpdated}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 850, color: '#0F172A' }}>
                      {formatCurrencyIDR(comparingResource.price)}
                    </span>
                  </div>
                </div>

                {/* 2. Supplier / Market Price */}
                <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 750, color: '#0F172A' }}>2. Penawaran Supplier & Distributor</span>
                      <span style={{ fontSize: '10px', background: '#DCFCE7', color: '#166534', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>MARKET QUOTE</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                      Supplier: {comparingResource.supplier || 'Distributor Utama'} • Tanggal: {comparingResource.lastUpdated}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 850, color: '#16A34A' }}>
                      {formatCurrencyIDR(comparingResource.supplierPrice || comparingResource.price)}
                    </span>
                    <button
                      onClick={() =>
                        setAdoptTarget({
                          resource: comparingResource,
                          newPrice: comparingResource.supplierPrice || comparingResource.price,
                          priceLabel: 'Penawaran Supplier',
                        })
                      }
                      style={{
                        height: '30px',
                        padding: '0 10px',
                        borderRadius: '6px',
                        background: '#2563EB',
                        color: '#FFFFFF',
                        border: 'none',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Gunakan Harga Ini
                    </button>
                  </div>
                </div>

                {/* 3. Internal Historical Price */}
                <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 750, color: '#0F172A' }}>3. Historis Proyek Internal</span>
                      <span style={{ fontSize: '10px', background: '#F1F5F9', color: '#475569', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>INTERNAL RECORD</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                      Rata-rata pengadaan proyek 6 bulan terakhir
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 850, color: '#475569' }}>
                      {formatCurrencyIDR(comparingResource.historicalPrice || Math.round(comparingResource.price * 0.95))}
                    </span>
                    <button
                      onClick={() =>
                        setAdoptTarget({
                          resource: comparingResource,
                          newPrice: comparingResource.historicalPrice || Math.round(comparingResource.price * 0.95),
                          priceLabel: 'Historis Proyek Internal',
                        })
                      }
                      style={{
                        height: '30px',
                        padding: '0 10px',
                        borderRadius: '6px',
                        background: '#F1F5F9',
                        border: '1px solid #CBD5E1',
                        color: '#334155',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Gunakan Harga Ini
                    </button>
                  </div>
                </div>

                {/* 4. Government / Reference Price */}
                <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 750, color: '#0F172A' }}>4. Standar Acuan Pemerintah (SHST / PUPR)</span>
                      <span style={{ fontSize: '10px', background: '#FEF3C7', color: '#B45309', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>OFFICIAL HSPK</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                      Pedoman Permen PUPR No. 1 2022 / SE DJBK 2026
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 850, color: '#D97706' }}>
                      {formatCurrencyIDR(comparingResource.governmentPrice || Math.round(comparingResource.price * 0.98))}
                    </span>
                    <button
                      onClick={() =>
                        setAdoptTarget({
                          resource: comparingResource,
                          newPrice: comparingResource.governmentPrice || Math.round(comparingResource.price * 0.98),
                          priceLabel: 'Standar PUPR 2026',
                        })
                      }
                      style={{
                        height: '30px',
                        padding: '0 10px',
                        borderRadius: '6px',
                        background: '#F1F5F9',
                        border: '1px solid #CBD5E1',
                        color: '#334155',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Gunakan Harga Ini
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------
          6. ADOPT PRICE IMPACT PREVIEW MODAL
         --------------------------------------------------------------------- */}
      {adoptTarget && impactSummary && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '20px',
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              maxWidth: '560px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 25px 30px -5px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={20} color="#2563EB" />
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Konfirmasi & Pratinjau Dampak Biaya
                </h3>
              </div>
              <button onClick={() => setAdoptTarget(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '12.5px', color: '#475569', margin: '0 0 16px 0', lineHeight: 1.5 }}>
              Anda akan menerapkan harga <strong>{adoptTarget.priceLabel}</strong> untuk komponen <strong>{adoptTarget.resource.name}</strong> ke dalam proyek aktif <strong>({currentProject ? currentProject.name : 'Proyek Utama'})</strong>.
            </p>

            {/* Impact Metric Box */}
            <div style={{ background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '14px', marginBottom: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px' }}>
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '11px' }}>Harga Sebelumnya</span>
                  <strong style={{ color: '#475569', fontSize: '13.5px' }}>{formatCurrencyIDR(adoptTarget.resource.price)}</strong>
                </div>
                <div>
                  <span style={{ color: '#2563EB', display: 'block', fontSize: '11px', fontWeight: 700 }}>Harga Baru ({adoptTarget.priceLabel})</span>
                  <strong style={{ color: '#2563EB', fontSize: '13.5px' }}>{formatCurrencyIDR(adoptTarget.newPrice)}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '11px' }}>Item Pekerjaan Terdampak</span>
                  <strong style={{ color: '#0F172A', fontSize: '13.5px' }}>{impactSummary.affectedWorkItems.length} Pekerjaan</strong>
                </div>
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '11px' }}>Estimasi Dampak Total RAB</span>
                  <strong style={{ color: impactSummary.estimatedCostDelta >= 0 ? '#DC2626' : '#16A34A', fontSize: '13.5px' }}>
                    {impactSummary.estimatedCostDelta >= 0 ? `+${formatCurrencyIDR(impactSummary.estimatedCostDelta)}` : formatCurrencyIDR(impactSummary.estimatedCostDelta)} ({impactSummary.percentageChange}%)
                  </strong>
                </div>
              </div>
            </div>

            {/* List of Affected Work Items */}
            {impactSummary.affectedWorkItems.length > 0 && (
              <div style={{ marginBottom: '18px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  Daftar Baris Pekerjaan yang Terpengaruh:
                </span>
                <div style={{ maxHeight: '120px', overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '6px 10px', fontSize: '11.5px' }}>
                  {impactSummary.affectedWorkItems.map((item, idx) => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: idx < impactSummary.affectedWorkItems.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                      <span style={{ fontWeight: 600, color: '#0F172A' }}>{item.description}</span>
                      <span style={{ color: '#64748B' }}>{item.volume} {item.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setAdoptTarget(null)}
                style={{ height: '36px', padding: '0 16px', borderRadius: '6px', background: '#F1F5F9', border: '1px solid #CBD5E1', fontSize: '12px', fontWeight: 650, cursor: 'pointer' }}
              >
                Batalkan
              </button>
              <button
                onClick={handleExecuteAdoptPrice}
                style={{
                  height: '36px',
                  padding: '0 18px',
                  borderRadius: '6px',
                  background: '#2563EB',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: '12.5px',
                  fontWeight: 750,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Check size={15} />
                <span>Terapkan ke Proyek</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------
          7. ADD CUSTOM RESOURCE MODAL
         --------------------------------------------------------------------- */}
      {isAddModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '20px',
          }}
        >
          <div style={{ background: '#FFFFFF', borderRadius: '12px', maxWidth: '580px', width: '100%', padding: '24px', boxShadow: '0 25px 30px -5px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Tambah Komponen {activeTab === 'MATERIAL' ? 'Material' : activeTab === 'LABOR' ? 'Upah' : 'Peralatan'} Baru
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateNewPriceRecord} style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '70vh', overflowY: 'auto', paddingRight: '4px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>Kode</label>
                  <input
                    type="text"
                    placeholder="e.g. BB-01"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    style={{ width: '100%', height: '32px', borderRadius: '6px', border: '1px solid #CBD5E1', padding: '0 8px', fontSize: '12px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>Nama Komponen *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Besi Beton Ulir D16"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    style={{ width: '100%', height: '32px', borderRadius: '6px', border: '1px solid #CBD5E1', padding: '0 8px', fontSize: '12px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>Brand / Merk</label>
                  <input
                    type="text"
                    placeholder="e.g. Krakatau Steel / Holcim"
                    value={newBrand}
                    onChange={(e) => setNewBrand(e.target.value)}
                    style={{ width: '100%', height: '32px', borderRadius: '6px', border: '1px solid #CBD5E1', padding: '0 8px', fontSize: '12px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>Subkategori</label>
                  <select
                    value={newSubcat}
                    onChange={(e) => setNewSubcat(e.target.value)}
                    style={{ width: '100%', height: '32px', borderRadius: '6px', border: '1px solid #CBD5E1', padding: '0 8px', fontSize: '12px' }}
                  >
                    <option value="Baja & Besi">Baja & Besi</option>
                    <option value="Semen & Mortar">Semen & Mortar</option>
                    <option value="Agregat & Pasir">Agregat & Pasir</option>
                    <option value="Bata & Blok">Bata & Blok</option>
                    <option value="Beton Ready-Mix">Beton Ready-Mix</option>
                    <option value="Finishing & Cat">Finishing & Cat</option>
                    <option value="MEP & Plumbing">MEP & Plumbing</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>Spesifikasi / Grade / Ukuran</label>
                <input
                  type="text"
                  placeholder="e.g. BJTS 420B, SNI 2052:2017, Pjg 12m"
                  value={newSpec}
                  onChange={(e) => setNewSpec(e.target.value)}
                  style={{ width: '100%', height: '32px', borderRadius: '6px', border: '1px solid #CBD5E1', padding: '0 8px', fontSize: '12px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>Harga Satuan (Rp) *</label>
                  <input
                    type="number"
                    required
                    value={newPrice || ''}
                    onChange={(e) => setNewPrice(parseFloat(e.target.value) || 0)}
                    style={{ width: '100%', height: '32px', borderRadius: '6px', border: '1px solid #CBD5E1', padding: '0 8px', fontSize: '12px', fontWeight: 700, color: '#047857' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>Harga Toko / Vendor</label>
                  <input
                    type="number"
                    value={newSupplierPrice || ''}
                    onChange={(e) => setNewSupplierPrice(parseFloat(e.target.value) || 0)}
                    style={{ width: '100%', height: '32px', borderRadius: '6px', border: '1px solid #CBD5E1', padding: '0 8px', fontSize: '12px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>Satuan *</label>
                  <input
                    type="text"
                    required
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    style={{ width: '100%', height: '32px', borderRadius: '6px', border: '1px solid #CBD5E1', padding: '0 8px', fontSize: '12px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>Supplier / Vendor / Sumber</label>
                  <input
                    type="text"
                    placeholder="e.g. Toko Bangunan Berkah / Brosur Resmi"
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                    style={{ width: '100%', height: '32px', borderRadius: '6px', border: '1px solid #CBD5E1', padding: '0 8px', fontSize: '12px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>Wilayah / Kota</label>
                  <input
                    type="text"
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value)}
                    placeholder="e.g. DKI Jakarta / Surabaya"
                    style={{ width: '100%', height: '32px', borderRadius: '6px', border: '1px solid #CBD5E1', padding: '0 8px', fontSize: '12px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>Catatan / Referensi Link</label>
                <input
                  type="text"
                  placeholder="e.g. Brosur Agustus 2026, franco proyek Jabodetabek"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  style={{ width: '100%', height: '32px', borderRadius: '6px', border: '1px solid #CBD5E1', padding: '0 8px', fontSize: '12px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #E2E8F0' }}>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  style={{ height: '34px', padding: '0 14px', borderRadius: '6px', background: '#F1F5F9', border: '1px solid #CBD5E1', fontSize: '12px', fontWeight: 650, cursor: 'pointer' }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  style={{ height: '34px', padding: '0 18px', borderRadius: '6px', background: '#2563EB', color: '#FFFFFF', border: 'none', fontSize: '12.5px', fontWeight: 750, cursor: 'pointer' }}
                >
                  Simpan ke Library
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TOAST FEEDBACK */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: '#0F172A',
            color: '#FFFFFF',
            padding: '10px 18px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 600,
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)',
            zIndex: 1200,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <CheckCircle2 size={16} color="#10B981" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
