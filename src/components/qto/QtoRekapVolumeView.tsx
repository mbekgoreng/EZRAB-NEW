import React, { useState, useMemo, useEffect } from 'react';
import {
  Ruler,
  Plus,
  FileSpreadsheet,
  Download,
  Filter,
  Check,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  Search,
  ChevronDown,
  ChevronRight,
  Sliders,
  Eye,
  Edit3,
  Trash2,
  ExternalLink,
  Sparkles,
  Maximize2,
  ZoomIn,
  ZoomOut,
  X,
  Printer,
  FileText,
  Copy,
  FolderPlus,
  Box,
  HardHat,
  Compass,
  ArrowRight,
  Share2,
  MoreVertical,
} from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { CONSTRUCTION_CALCULATORS, getCalculatorById } from '../../engine/constructionCalculators/registry';
import { QTOItem } from '../../types';
import { formatNumberId, formatRupiah } from '../../engine/formulaEngine';
import bowplankImg from '../../assets/bowplank-technical.jpg';

interface QtoRekapVolumeViewProps {
  onNavigateToCalculator?: (calcId?: string, qtoId?: string) => void;
  onNavigateToTab?: (tab: string) => void;
}

export const QtoRekapVolumeView: React.FC<QtoRekapVolumeViewProps> = ({
  onNavigateToCalculator,
  onNavigateToTab,
}) => {
  const {
    currentProject,
    currentProjectId,
    projectQtoItems,
    projectCalculationRuns,
    deleteQtoItem,
    syncQtoToRabSpreadsheet,
    createManualQtoItem,
  } = useProject();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategoryTab, setActiveCategoryTab] = useState<'semua' | 'struktur' | 'arsitektur' | 'mep' | 'lainnya'>('semua');
  const [groupBy, setGroupBy] = useState<'kategori' | 'calculator' | 'satuan' | 'status'>('kategori');
  
  // Selected Item for Detail Panel
  const [selectedQtoId, setSelectedQtoId] = useState<string | null>(null);

  // Selected Checkboxes for Bulk Action
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  // Collapsible Groups State
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Modals
  const [addCalcModalOpen, setAddCalcModalOpen] = useState(false);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [columnsModalOpen, setColumnsModalOpen] = useState(false);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);

  // Manual Form State
  const [manualKode, setManualKode] = useState('');
  const [manualUraian, setManualUraian] = useState('');
  const [manualVolume, setManualVolume] = useState('');
  const [manualUnit, setManualUnit] = useState('m³');
  const [manualCategory, setManualCategory] = useState('Pekerjaan Persiapan');
  const [manualReason, setManualReason] = useState('');

  // Column Visibility
  const [visibleColumns, setVisibleColumns] = useState({
    no: true,
    kode: true,
    uraian: true,
    parameter: true,
    calculator: true,
    volume: true,
    satuan: true,
    status: true,
  });

  // Toast Notification
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'info' } | null>(null);

  const showToast = (text: string, type: 'success' | 'info' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Helper to categorize calculator/QTO
  const getCategoryOfItem = (item: QTOItem): 'struktur' | 'arsitektur' | 'mep' | 'lainnya' => {
    const calc = item.calculatorId ? getCalculatorById(item.calculatorId) : null;
    if (!calc) {
      if (item.kode?.startsWith('1.') || item.kode?.startsWith('2.') || item.kode?.startsWith('3.') || item.kode?.startsWith('4.')) return 'struktur';
      if (item.kode?.startsWith('5.') || item.kode?.startsWith('6.') || item.kode?.startsWith('7.')) return 'arsitektur';
      return 'lainnya';
    }
    const cat = calc.category as string;
    if (cat === 'persiapan' || cat === 'struktur' || cat === 'pondasi') return 'struktur';
    if (cat === 'arsitektur' || cat === 'finishing' || cat === 'dinding' || cat === 'atap' || cat === 'lantai') return 'arsitektur';
    if (cat === 'mep' || cat === 'me' || cat === 'sanitair') return 'mep';
    return 'lainnya';
  };

  // Helper for Category Section Heading
  const getSectionHeadingOfItem = (item: QTOItem): string => {
    const calc = item.calculatorId ? getCalculatorById(item.calculatorId) : null;
    if (calc) {
      const cat = calc.category as string;
      if (cat === 'persiapan') return 'Pekerjaan Persiapan';
      if (cat === 'struktur') {
        if (item.kode?.startsWith('2.')) return 'Pekerjaan Tanah';
        if (item.kode?.startsWith('3.')) return 'Pekerjaan Pondasi';
        return 'Pekerjaan Struktur';
      }
      if (cat === 'arsitektur') return 'Pekerjaan Pasangan & Dinding';
      if (cat === 'finishing') return 'Pekerjaan Finishing & Lantai';
      if (cat === 'mep') return 'Pekerjaan Mekanikal & Elektrikal';
    }
    if (item.kode?.startsWith('1.')) return 'Pekerjaan Persiapan';
    if (item.kode?.startsWith('2.')) return 'Pekerjaan Tanah';
    if (item.kode?.startsWith('3.')) return 'Pekerjaan Pondasi';
    if (item.kode?.startsWith('4.')) return 'Pekerjaan Struktur';
    if (item.kode?.startsWith('5.')) return 'Pekerjaan Dinding & Plesteran';
    return 'Pekerjaan Lain-lain';
  };

  // Category counts for tabs
  const categoryCounts = useMemo(() => {
    const counts = {
      semua: projectQtoItems.length,
      struktur: 0,
      arsitektur: 0,
      mep: 0,
      lainnya: 0,
    };
    projectQtoItems.forEach((item) => {
      const cat = getCategoryOfItem(item);
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [projectQtoItems]);

  // Filtered QTO items
  const filteredQtoItems = useMemo(() => {
    return projectQtoItems.filter((item) => {
      // Category tab filter
      if (activeCategoryTab !== 'semua') {
        const cat = getCategoryOfItem(item);
        if (cat !== activeCategoryTab) return false;
      }
      // Search Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const paramString = Object.entries(item.parameterSnapshot || {})
          .map(([k, v]) => `${k}=${v}`)
          .join(' ');
        const matches =
          item.uraian.toLowerCase().includes(q) ||
          item.kode.toLowerCase().includes(q) ||
          (item.calculatorId ? item.calculatorId.toLowerCase().includes(q) : false) ||
          paramString.toLowerCase().includes(q) ||
          item.calculationRunId?.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [projectQtoItems, activeCategoryTab, searchQuery]);

  // Grouped QTO items
  const groupedQtoItems = useMemo(() => {
    const groups: Record<string, QTOItem[]> = {};

    filteredQtoItems.forEach((item) => {
      let groupKey = 'Lainnya';
      if (groupBy === 'kategori') {
        groupKey = getSectionHeadingOfItem(item);
      } else if (groupBy === 'calculator') {
        const calc = item.calculatorId ? getCalculatorById(item.calculatorId) : null;
        groupKey = calc ? calc.shortName : (item.calculatorId || 'MANUAL');
      } else if (groupBy === 'satuan') {
        groupKey = `Satuan: ${item.unit}`;
      } else if (groupBy === 'status') {
        groupKey = item.status === 'SYNCED_TO_RAB' ? 'Terhubung RAB' : 'Belum Terhubung RAB';
      }

      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(item);
    });

    return groups;
  }, [filteredQtoItems, groupBy]);

  // Active Selected QTO Item
  const activeSelectedItem = useMemo(() => {
    if (!selectedQtoId && filteredQtoItems.length > 0) {
      return filteredQtoItems[0];
    }
    return projectQtoItems.find((q) => q.id === selectedQtoId) || filteredQtoItems[0] || null;
  }, [selectedQtoId, filteredQtoItems, projectQtoItems]);

  // Set default selection
  useEffect(() => {
    if (!selectedQtoId && filteredQtoItems.length > 0) {
      setSelectedQtoId(filteredQtoItems[0].id);
    }
  }, [filteredQtoItems, selectedQtoId]);

  // Toggle group collapse
  const toggleGroupCollapse = (groupName: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }));
  };

  // Toggle select all
  const handleToggleSelectAll = () => {
    if (selectedItemIds.length === filteredQtoItems.length) {
      setSelectedItemIds([]);
    } else {
      setSelectedItemIds(filteredQtoItems.map((i) => i.id));
    }
  };

  // Toggle select single
  const handleToggleSelectItem = (id: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // KPI Calculations
  const totalItemCount = projectQtoItems.length;
  const totalVolumeSum = projectQtoItems.reduce((acc, q) => acc + (q.quantity || 0), 0);
  const distinctCalculators = new Set(
    projectQtoItems.filter((i) => i.calculatorId !== 'MANUAL').map((i) => i.calculatorId)
  ).size;
  const verifiedPercentage =
    totalItemCount > 0
      ? Math.round(
          (projectQtoItems.filter((i) => i.status === 'SYNCED_TO_RAB' || i.status === 'CALCULATED').length /
            totalItemCount) *
            100
        )
      : 0;

  // Handle Export CSV
  const handleExportCsv = () => {
    if (projectQtoItems.length === 0) {
      showToast('Tidak ada data QTO untuk diekspor.', 'info');
      return;
    }
    const headers = ['No', 'Kode', 'Uraian Pekerjaan', 'Parameter', 'Calculator', 'Volume', 'Satuan', 'Status', 'Calculation Run ID'];
    const rows = projectQtoItems.map((item, idx) => {
      const params = Object.entries(item.parameterSnapshot || {})
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
      return [
        idx + 1,
        `"${item.kode}"`,
        `"${item.uraian.replace(/"/g, '""')}"`,
        `"${params}"`,
        item.calculatorId,
        item.quantity,
        item.unit,
        item.status === 'SYNCED_TO_RAB' ? 'Terhubung' : 'Terhitung',
        item.calculationRunId || '-',
      ];
    });
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `EZRAB_QTO_REKAP_${currentProject?.name?.replace(/\s+/g, '_') || 'PROYEK'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setExportDropdownOpen(false);
    showToast('File CSV QTO Rekap berhasil didownload!');
  };

  // Handle Create Manual Item
  const handleSaveManualItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualUraian.trim() || !manualVolume) {
      showToast('Harap isi uraian dan volume pekerjaan.', 'info');
      return;
    }
    try {
      const volNum = parseFloat(manualVolume.replace(',', '.'));
      if (isNaN(volNum)) throw new Error('Volume harus berupa angka valid');
      const item = createManualQtoItem({
        kode: manualKode.trim() || undefined,
        uraian: manualUraian.trim(),
        quantity: volNum,
        unit: manualUnit.trim() || 'm³',
        category: manualCategory,
        notes: manualReason.trim() || 'Item QTO Manual tanpa referensi Volume Calculator',
      });
      setManualModalOpen(false);
      setManualUraian('');
      setManualVolume('');
      setManualReason('');
      setSelectedQtoId(item.id);
      showToast(`Item QTO manual "${item.uraian}" berhasil ditambahkan.`);
    } catch (err: any) {
      showToast(err.message || 'Gagal menambahkan item', 'info');
    }
  };

  // Empty State if No Project Selected
  if (!currentProject) {
    return (
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #DCE8F7',
          padding: '56px 24px',
          textAlign: 'center',
          boxShadow: '0 2px 10px rgba(0,0,0,0.02)',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            background: '#EFF6FF',
            border: '1px solid #DBEAFE',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            color: '#2563EB',
          }}
        >
          <Ruler size={32} />
        </div>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
          Silakan buat atau pilih proyek terlebih dahulu
        </h2>
        <p style={{ fontSize: '13px', color: '#64748B', maxWidth: '480px', margin: '0 auto 24px', lineHeight: 1.6 }}>
          Halaman QTO Rekap Volume mengumpulkan seluruh volume pekerjaan dari hasil kalkulator proyek aktif tanpa dummy data.
        </p>
        <button
          onClick={() => onNavigateToTab?.('proyek')}
          style={{
            height: '42px',
            padding: '0 22px',
            borderRadius: '10px',
            background: '#2563EB',
            color: '#ffffff',
            fontSize: '13px',
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 12px rgba(37,99,235,0.25)',
          }}
        >
          <FolderPlus size={16} />
          <span>Buka Menu Proyek</span>
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', color: '#0F172A' }}>
      
      {/* Toast Alert */}
      {toastMsg && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: '#0F172A',
            color: '#ffffff',
            padding: '12px 20px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
            zIndex: 9999,
            border: '1px solid #334155',
          }}
        >
          <Check size={16} color="#4ADE80" />
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* 1. Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748B' }}>
        <span style={{ cursor: 'pointer' }} onClick={() => onNavigateToTab?.('qto-rekap')}>QTO</span>
        <span>&gt;</span>
        <span style={{ cursor: 'pointer' }} onClick={() => onNavigateToTab?.('qto-rekap')}>QTO</span>
        <span>&gt;</span>
        <span style={{ fontWeight: 600, color: '#2563EB' }}>Rekap Volume</span>
      </div>

      {/* 2. Page Header Bar */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #DCE8F7',
          padding: '16px 20px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: '#2563EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 4px 10px rgba(37,99,235,0.25)',
            }}
          >
            <FileSpreadsheet size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-0.02em' }}>
              QTO — Rekap Volume
            </h1>
            <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0' }}>
              Rekapitulasi seluruh volume pekerjaan dari hasil perhitungan volume calculator.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setAddCalcModalOpen(true)}
            style={{
              height: '36px',
              padding: '0 16px',
              borderRadius: '8px',
              background: '#2563EB',
              color: '#ffffff',
              fontSize: '12.5px',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(37,99,235,0.25)',
            }}
          >
            <Plus size={15} />
            <span>Tambah dari Calculator</span>
          </button>

          <button
            onClick={() => setManualModalOpen(true)}
            style={{
              height: '36px',
              padding: '0 14px',
              borderRadius: '8px',
              background: '#ffffff',
              border: '1px solid #DCE8F7',
              color: '#334155',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Plus size={14} color="#64748B" />
            <span>Tambah Manual</span>
          </button>

          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
              style={{
                height: '36px',
                padding: '0 14px',
                borderRadius: '8px',
                background: '#ffffff',
                border: '1px solid #DCE8F7',
                color: '#334155',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Download size={14} color="#64748B" />
              <span>Export</span>
              <ChevronDown size={13} color="#94A3B8" />
            </button>

            {exportDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '42px',
                  background: '#ffffff',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                  zIndex: 50,
                  width: '180px',
                  padding: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}
              >
                <button
                  onClick={handleExportCsv}
                  style={{
                    padding: '8px 12px',
                    fontSize: '12px',
                    color: '#334155',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#F1F5F9')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <FileSpreadsheet size={14} color="#059669" />
                  <span>Export Excel / CSV</span>
                </button>

                <button
                  onClick={() => {
                    window.print();
                    setExportDropdownOpen(false);
                  }}
                  style={{
                    padding: '8px 12px',
                    fontSize: '12px',
                    color: '#334155',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#F1F5F9')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <Printer size={14} color="#2563EB" />
                  <span>Print QTO Report</span>
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => setColumnsModalOpen(true)}
            style={{
              height: '36px',
              padding: '0 14px',
              borderRadius: '8px',
              background: '#ffffff',
              border: '1px solid #DCE8F7',
              color: '#334155',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Filter size={14} color="#64748B" />
            <span>Filter</span>
          </button>
        </div>
      </div>

      {/* 3. KPI Cards Grid (4 Cards) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '12px',
        }}
      >
        {/* Card 1: Total Item */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #DCE8F7',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              background: '#EFF6FF',
              border: '1px solid #DBEAFE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#2563EB',
            }}
          >
            <FileText size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Item
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', lineHeight: 1.2, marginTop: '2px' }}>
              {totalItemCount}
            </div>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '1px' }}>
              item pekerjaan
            </div>
          </div>
        </div>

        {/* Card 2: Total Volume */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #DCE8F7',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              background: '#EFF6FF',
              border: '1px solid #DBEAFE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#2563EB',
            }}
          >
            <Box size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Volume
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', lineHeight: 1.2, marginTop: '2px' }}>
              {formatNumberId(totalVolumeSum, 2)}
            </div>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '1px' }}>
              berbagai satuan
            </div>
          </div>
        </div>

        {/* Card 3: Calculator */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #DCE8F7',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              background: '#EFF6FF',
              border: '1px solid #DBEAFE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#2563EB',
            }}
          >
            <Ruler size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Calculator
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', lineHeight: 1.2, marginTop: '2px' }}>
              {distinctCalculators}
            </div>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '1px' }}>
              calculator terpakai
            </div>
          </div>
        </div>

        {/* Card 4: Terverifikasi */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #DCE8F7',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              background: '#DCFCE7',
              border: '1px solid #BBF7D0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#16A34A',
            }}
          >
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Terverifikasi
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', lineHeight: 1.2, marginTop: '2px' }}>
              {verifiedPercentage}%
            </div>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '1px' }}>
              item terhubung
            </div>
          </div>
        </div>
      </div>

      {/* 4. Category Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {[
          { id: 'semua', label: 'Semua', count: categoryCounts.semua },
          { id: 'struktur', label: 'Struktur', count: categoryCounts.struktur },
          { id: 'arsitektur', label: 'Arsitektur', count: categoryCounts.arsitektur },
          { id: 'mep', label: 'MEP', count: categoryCounts.mep },
          { id: 'lainnya', label: 'Lainnya', count: categoryCounts.lainnya },
        ].map((tab) => {
          const isActive = activeCategoryTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveCategoryTab(tab.id as any)}
              style={{
                height: '32px',
                padding: '0 14px',
                borderRadius: '8px',
                fontSize: '12.5px',
                fontWeight: isActive ? 700 : 500,
                background: isActive ? '#2563EB' : '#ffffff',
                color: isActive ? '#ffffff' : '#475569',
                border: isActive ? '1px solid #1D4ED8' : '1px solid #DCE8F7',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{tab.label}</span>
              <span
                style={{
                  fontSize: '10.5px',
                  fontWeight: 700,
                  background: isActive ? 'rgba(255,255,255,0.25)' : '#F1F5F9',
                  color: isActive ? '#ffffff' : '#64748B',
                  padding: '1px 6px',
                  borderRadius: '999px',
                }}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 5. Search, Group by, Columns & View Toolbar */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #DCE8F7',
          padding: '12px 16px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        {/* Search Bar */}
        <div style={{ position: 'relative', flex: 1, minWidth: '240px', maxWidth: '420px' }}>
          <Search size={15} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Cari pekerjaan, kode, atau uraian..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              height: '34px',
              paddingLeft: '34px',
              paddingRight: '12px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              fontSize: '12.5px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Right Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Group By Select */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 500 }}>Group by:</span>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as any)}
              style={{
                height: '34px',
                padding: '0 10px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '12px',
                fontWeight: 600,
                color: '#1E293B',
                background: '#ffffff',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="kategori">Kategori Pekerjaan</option>
              <option value="calculator">Calculator</option>
              <option value="satuan">Satuan</option>
              <option value="status">Status</option>
            </select>
          </div>

          {/* Columns Button */}
          <button
            onClick={() => setColumnsModalOpen(true)}
            style={{
              height: '34px',
              padding: '0 12px',
              borderRadius: '8px',
              background: '#ffffff',
              border: '1px solid #CBD5E1',
              fontSize: '12px',
              fontWeight: 600,
              color: '#334155',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Sliders size={13} color="#64748B" />
            <span>Columns</span>
          </button>

          {/* View Mode */}
          <button
            style={{
              height: '34px',
              padding: '0 12px',
              borderRadius: '8px',
              background: '#ffffff',
              border: '1px solid #CBD5E1',
              fontSize: '12px',
              fontWeight: 600,
              color: '#334155',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Layers size={13} color="#64748B" />
            <span>View</span>
          </button>
        </div>
      </div>

      {/* 6. Main Content Split Layout: Table (Left) + Detail Panel (Right) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: selectedQtoId ? '1fr 360px' : '1fr',
          gap: '16px',
          alignItems: 'start',
        }}
      >
        {/* LEFT COLUMN: Spreadsheet Table */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #DCE8F7',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          }}
        >
          {projectQtoItems.length === 0 ? (
            /* Pure Empty State for Fresh Project */
            <div style={{ padding: '64px 24px', textAlign: 'center' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '14px',
                  background: '#F1F5F9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                  color: '#94A3B8',
                }}
              >
                <Ruler size={28} />
              </div>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>
                QTO Anda masih kosong
              </h3>
              <p style={{ fontSize: '12.5px', color: '#64748B', maxWidth: '420px', margin: '0 auto 20px', lineHeight: 1.5 }}>
                Belum ada hasil kalkulasi volume pada proyek ini. Mulai dengan menghitung volume pekerjaan menggunakan Volume Calculator atau tambahkan item secara manual.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                <button
                  onClick={() => onNavigateToCalculator?.()}
                  style={{
                    height: '38px',
                    padding: '0 18px',
                    borderRadius: '8px',
                    background: '#2563EB',
                    color: '#ffffff',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Ruler size={14} />
                  <span>Buka Volume Calculator</span>
                </button>
                <button
                  onClick={() => setManualModalOpen(true)}
                  style={{
                    height: '38px',
                    padding: '0 16px',
                    borderRadius: '8px',
                    background: '#ffffff',
                    border: '1px solid #CBD5E1',
                    color: '#334155',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Tambah Manual
                </button>
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                {/* Table Header */}
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 700 }}>
                    <th style={{ padding: '10px 14px', width: '36px' }}>
                      <input
                        type="checkbox"
                        checked={selectedItemIds.length === filteredQtoItems.length && filteredQtoItems.length > 0}
                        onChange={handleToggleSelectAll}
                        style={{ cursor: 'pointer' }}
                      />
                    </th>
                    {visibleColumns.no && <th style={{ padding: '10px 12px', width: '40px' }}>No</th>}
                    {visibleColumns.kode && <th style={{ padding: '10px 14px', width: '80px' }}>Kode</th>}
                    {visibleColumns.uraian && <th style={{ padding: '10px 16px' }}>Uraian Pekerjaan</th>}
                    {visibleColumns.parameter && <th style={{ padding: '10px 14px' }}>Parameter</th>}
                    {visibleColumns.calculator && <th style={{ padding: '10px 14px', width: '110px' }}>Calculator</th>}
                    {visibleColumns.volume && <th style={{ padding: '10px 14px', width: '90px', textAlign: 'right' }}>Volume</th>}
                    {visibleColumns.satuan && <th style={{ padding: '10px 12px', width: '60px' }}>Satuan</th>}
                    {visibleColumns.status && <th style={{ padding: '10px 14px', width: '110px' }}>Status</th>}
                    <th style={{ padding: '10px 12px', width: '40px' }}></th>
                  </tr>
                </thead>

                {/* Grouped Table Body */}
                <tbody>
                  {Object.entries(groupedQtoItems).map(([groupName, items], groupIndex) => {
                    const isCollapsed = collapsedGroups[groupName];
                    return (
                      <React.Fragment key={groupName}>
                        {/* Group Header Row */}
                        <tr
                          onClick={() => toggleGroupCollapse(groupName)}
                          style={{
                            background: '#F1F5F9',
                            borderBottom: '1px solid #E2E8F0',
                            cursor: 'pointer',
                            userSelect: 'none',
                          }}
                        >
                          <td colSpan={10} style={{ padding: '8px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {isCollapsed ? <ChevronRight size={14} color="#64748B" /> : <ChevronDown size={14} color="#64748B" />}
                              <span
                                style={{
                                  width: '20px',
                                  height: '20px',
                                  borderRadius: '50%',
                                  background: '#2563EB',
                                  color: '#ffffff',
                                  fontSize: '11px',
                                  fontWeight: 800,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                {groupIndex + 1}
                              </span>
                              <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                {groupName}
                              </span>
                              <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
                                ({items.length} item)
                              </span>
                            </div>
                          </td>
                        </tr>

                        {/* Group Child Items */}
                        {!isCollapsed &&
                          items.map((item, itemIdx) => {
                            const isSelected = selectedQtoId === item.id;
                            const isChecked = selectedItemIds.includes(item.id);
                            const paramsText = Object.entries(item.parameterSnapshot || {})
                              .map(([k, v]) => `${k}=${v}`)
                              .join('; ');

                            return (
                              <tr
                                key={item.id}
                                onClick={() => setSelectedQtoId(item.id)}
                                style={{
                                  borderBottom: '1px solid #E2E8F0',
                                  background: isSelected ? '#EFF6FF' : itemIdx % 2 === 0 ? '#ffffff' : '#FAFAFA',
                                  cursor: 'pointer',
                                  transition: 'background 0.1s ease',
                                }}
                              >
                                {/* Checkbox */}
                                <td style={{ padding: '10px 14px' }} onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => handleToggleSelectItem(item.id)}
                                    style={{ cursor: 'pointer' }}
                                  />
                                </td>

                                {/* No */}
                                {visibleColumns.no && (
                                  <td style={{ padding: '10px 12px', color: '#64748B', fontWeight: 500 }}>
                                    {itemIdx + 1}
                                  </td>
                                )}

                                {/* Kode */}
                                {visibleColumns.kode && (
                                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 600, color: '#334155' }}>
                                    {item.kode}
                                  </td>
                                )}

                                {/* Uraian Pekerjaan */}
                                {visibleColumns.uraian && (
                                  <td style={{ padding: '10px 16px', fontWeight: 700, color: '#0F172A' }}>
                                    {item.uraian}
                                  </td>
                                )}

                                {/* Parameter */}
                                {visibleColumns.parameter && (
                                  <td style={{ padding: '10px 14px', color: '#64748B', fontFamily: 'monospace', fontSize: '11px' }}>
                                    {paramsText || '-'}
                                  </td>
                                )}

                                {/* Calculator */}
                                {visibleColumns.calculator && (
                                  <td style={{ padding: '10px 14px', color: '#334155', fontWeight: 500 }}>
                                    {item.calculatorId === 'MANUAL' ? (
                                      <span style={{ color: '#D97706', fontStyle: 'italic' }}>Manual</span>
                                    ) : (
                                      item.calculatorId
                                    )}
                                  </td>
                                )}

                                {/* Volume */}
                                {visibleColumns.volume && (
                                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#0F172A', fontSize: '12.5px' }}>
                                    {formatNumberId(item.quantity, 2)}
                                  </td>
                                )}

                                {/* Satuan */}
                                {visibleColumns.satuan && (
                                  <td style={{ padding: '10px 12px', color: '#64748B', fontWeight: 600 }}>
                                    {item.unit}
                                  </td>
                                )}

                                {/* Status Badge */}
                                {visibleColumns.status && (
                                  <td style={{ padding: '10px 14px' }}>
                                    {item.status === 'SYNCED_TO_RAB' ? (
                                      <span
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          background: '#DCFCE7',
                                          color: '#16A34A',
                                          border: '1px solid #BBF7D0',
                                          padding: '2px 8px',
                                          borderRadius: '999px',
                                          fontSize: '11px',
                                          fontWeight: 700,
                                        }}
                                      >
                                        <Check size={11} />
                                        <span>Terhubung</span>
                                      </span>
                                    ) : item.status === 'CALCULATED' ? (
                                      <span
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          background: '#EFF6FF',
                                          color: '#2563EB',
                                          border: '1px solid #DBEAFE',
                                          padding: '2px 8px',
                                          borderRadius: '999px',
                                          fontSize: '11px',
                                          fontWeight: 700,
                                        }}
                                      >
                                        <span>Terhitung</span>
                                      </span>
                                    ) : (
                                      <span
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          background: '#FEF3C7',
                                          color: '#D97706',
                                          border: '1px solid #FDE68A',
                                          padding: '2px 8px',
                                          borderRadius: '999px',
                                          fontSize: '11px',
                                          fontWeight: 600,
                                        }}
                                      >
                                        <span>Manual</span>
                                      </span>
                                    )}
                                  </td>
                                )}

                                {/* Action Menu */}
                                <td style={{ padding: '10px 12px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                  <button
                                    onClick={() => {
                                      if (confirm(`Hapus item QTO ${item.uraian}?`)) {
                                        deleteQtoItem(item.id);
                                        showToast('Item QTO berhasil dihapus.');
                                      }
                                    }}
                                    title="Hapus Item"
                                    style={{
                                      width: '26px',
                                      height: '26px',
                                      borderRadius: '6px',
                                      background: 'transparent',
                                      border: 'none',
                                      color: '#94A3B8',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.color = '#EF4444';
                                      e.currentTarget.style.background = '#FEE2E2';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.color = '#94A3B8';
                                      e.currentTarget.style.background = 'transparent';
                                    }}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>

              {/* Table Footer Pagination Info */}
              <div
                style={{
                  padding: '12px 16px',
                  background: '#ffffff',
                  borderTop: '1px solid #E2E8F0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                  color: '#64748B',
                }}
              >
                <span>
                  Menampilkan 1 - {filteredQtoItems.length} dari {projectQtoItems.length} data
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #E2E8F0', background: '#ffffff', cursor: 'pointer' }}>&lt;</button>
                  <button style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', background: '#2563EB', color: '#ffffff', fontWeight: 700 }}>1</button>
                  <button style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #E2E8F0', background: '#ffffff', cursor: 'pointer' }}>&gt;</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Detail QTO Panel */}
        {activeSelectedItem && (
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #DCE8F7',
              padding: '18px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              position: 'sticky',
              top: '80px',
            }}
          >
            {/* Panel Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FileText size={16} color="#2563EB" />
                <h3 style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Detail QTO
                </h3>
              </div>
              <button
                onClick={() => setSelectedQtoId(null)}
                style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer' }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Title & Badges */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <span style={{ fontSize: '10.5px', background: '#EFF6FF', color: '#1D4ED8', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                  {getSectionHeadingOfItem(activeSelectedItem)}
                </span>
                <span
                  style={{
                    fontSize: '10.5px',
                    background: activeSelectedItem.status === 'SYNCED_TO_RAB' ? '#DCFCE7' : '#EFF6FF',
                    color: activeSelectedItem.status === 'SYNCED_TO_RAB' ? '#16A34A' : '#2563EB',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    fontWeight: 700,
                  }}
                >
                  {activeSelectedItem.status === 'SYNCED_TO_RAB' ? '✓ Terhubung' : 'Terhitung'}
                </span>
              </div>
              <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: '2px 0 0' }}>
                {activeSelectedItem.uraian}
              </h2>
              <span style={{ fontSize: '11px', color: '#64748B', fontFamily: 'monospace' }}>
                {activeSelectedItem.kode}
              </span>
            </div>

            {/* Technical Construction Illustration Thumbnail */}
            <div
              style={{
                borderRadius: '10px',
                overflow: 'hidden',
                border: '1px solid #E2E8F0',
                position: 'relative',
                background: '#0F172A',
                cursor: 'pointer',
              }}
              onClick={() => setImageViewerOpen(true)}
            >
              <img
                src={bowplankImg}
                alt="Technical illustration"
                style={{ width: '100%', height: '160px', objectFit: 'cover', display: 'block' }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: '6px',
                  right: '6px',
                  background: 'rgba(0,0,0,0.65)',
                  color: '#ffffff',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  fontSize: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Maximize2 size={11} />
                <span>Lihat Gambar</span>
              </div>
            </div>

            {/* Informasi Volume Box */}
            <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <FileSpreadsheet size={14} color="#2563EB" />
                <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#1E293B', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                  Informasi Volume
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '11.5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Volume:</span>
                  <span style={{ fontWeight: 800, color: '#2563EB', fontSize: '13px' }}>
                    {formatNumberId(activeSelectedItem.quantity, 2)} {activeSelectedItem.unit}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Sumber:</span>
                  <span style={{ fontWeight: 600, color: '#334155' }}>
                    {activeSelectedItem.calculatorId === 'MANUAL' ? 'Input Manual' : 'Volume Calculator'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Calculator:</span>
                  <span style={{ fontWeight: 600, color: '#334155' }}>{activeSelectedItem.calculatorId}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Calculation Run:</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#2563EB' }}>
                    {activeSelectedItem.calculationRunId || '-'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Waktu:</span>
                  <span style={{ color: '#334155' }}>
                    {new Date(activeSelectedItem.createdAt).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Oleh:</span>
                  <span style={{ color: '#334155' }}>Ahmad Yusuf</span>
                </div>
              </div>
            </div>

            {/* Parameter Box */}
            <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <Sliders size={14} color="#2563EB" />
                <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#1E293B', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                  Parameter Perhitungan
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11.5px' }}>
                {Object.entries(activeSelectedItem.parameterSnapshot || {}).map(([key, val]) => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>{key}:</span>
                    <span style={{ fontWeight: 600, color: '#0F172A', fontFamily: 'monospace' }}>
                      {typeof val === 'number' ? formatNumberId(val, 2) : val}
                    </span>
                  </div>
                ))}
                {Object.keys(activeSelectedItem.parameterSnapshot || {}).length === 0 && (
                  <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>Tidak ada snapshot parameter</span>
                )}
              </div>
            </div>

            {/* Button: Lihat di Volume Calculator */}
            <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '12px' }}>
              <button
                onClick={() => {
                  onNavigateToCalculator?.(activeSelectedItem.calculatorId, activeSelectedItem.id);
                }}
                style={{
                  width: '100%',
                  height: '38px',
                  borderRadius: '8px',
                  background: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  color: '#1D4ED8',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease',
                }}
              >
                <Ruler size={14} />
                <span>Lihat di Volume Calculator</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          MODALS
         ========================================================================= */}

      {/* Modal 1: Image Viewer Modal (Zoom, Fullscreen) */}
      {imageViewerOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
          onClick={() => setImageViewerOpen(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              maxWidth: '850px',
              width: '100%',
              overflow: 'hidden',
              boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 800, margin: 0 }}>
                  Gambar Teknis: {activeSelectedItem?.uraian || 'Konstruksi'}
                </h3>
                <span style={{ fontSize: '11px', color: '#64748B' }}>
                  Notasi Parameter Standar Lapangan (P, L, C, H, R)
                </span>
              </div>
              <button
                onClick={() => setImageViewerOpen(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '16px', textAlign: 'center', background: '#0F172A' }}>
              <img
                src={bowplankImg}
                alt="Technical render large"
                style={{ maxWidth: '100%', maxHeight: '520px', borderRadius: '8px', objectFit: 'contain' }}
              />
            </div>

            <div style={{ padding: '12px 20px', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: '#64748B' }}>
              <span>EZRAB Construction Technical Vector Model</span>
              <button
                onClick={() => setImageViewerOpen(false)}
                style={{ padding: '6px 14px', borderRadius: '6px', background: '#2563EB', color: '#ffffff', border: 'none', fontWeight: 600, cursor: 'pointer' }}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Tambah dari Calculator Selection Grid */}
      {addCalcModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
          onClick={() => setAddCalcModalOpen(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              maxWidth: '820px',
              width: '100%',
              maxHeight: '85vh',
              overflowY: 'auto',
              padding: '24px',
              boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0, color: '#0F172A' }}>
                  Pilih Volume Calculator untuk Dihitung
                </h3>
                <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0' }}>
                  Pilih jenis pekerjaan untuk membuka calculator dan menyimpan hasil ke QTO ({currentProject.name})
                </p>
              </div>
              <button
                onClick={() => setAddCalcModalOpen(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={18} />
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: '12px',
                marginTop: '16px',
              }}
            >
              {CONSTRUCTION_CALCULATORS.map((calc) => (
                <div
                  key={calc.id}
                  onClick={() => {
                    setAddCalcModalOpen(false);
                    onNavigateToCalculator?.(calc.id);
                  }}
                  style={{
                    background: '#F8FAFC',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    padding: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#EFF6FF';
                    e.currentTarget.style.borderColor = '#93C5FD';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#F8FAFC';
                    e.currentTarget.style.borderColor = '#E2E8F0';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '10px', background: '#DBEAFE', color: '#1D4ED8', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                      {calc.category.toUpperCase()}
                    </span>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>{calc.primaryUnit}</span>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
                    {calc.title}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B', lineHeight: 1.4 }}>
                    {calc.description}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Tambah Manual QTO Item Modal */}
      {manualModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
          onClick={() => setManualModalOpen(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              maxWidth: '520px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0, color: '#0F172A' }}>
                  Tambah Item QTO Manual
                </h3>
                <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0' }}>
                  Item manual akan ditandai berstatus "Manual" dengan jejak audit
                </p>
              </div>
              <button
                onClick={() => setManualModalOpen(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveManualItem} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                  Kode Pekerjaan (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: 1.1.05"
                  value={manualKode}
                  onChange={(e) => setManualKode(e.target.value)}
                  style={{ width: '100%', height: '36px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 10px', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                  Uraian Pekerjaan *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Pekerjaan Pagar Pengaman Proyek"
                  value={manualUraian}
                  onChange={(e) => setManualUraian(e.target.value)}
                  style={{ width: '100%', height: '36px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 10px', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Volume Kuantitas *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: 45.50"
                    value={manualVolume}
                    onChange={(e) => setManualVolume(e.target.value)}
                    style={{ width: '100%', height: '36px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 10px', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Satuan *
                  </label>
                  <select
                    value={manualUnit}
                    onChange={(e) => setManualUnit(e.target.value)}
                    style={{ width: '100%', height: '36px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 10px', fontSize: '13px', boxSizing: 'border-box', background: '#ffffff' }}
                  >
                    <option value="m¹">m¹ (meter panjang)</option>
                    <option value="m²">m² (meter persegi)</option>
                    <option value="m³">m³ (meter kubik)</option>
                    <option value="kg">kg (kilogram)</option>
                    <option value="buah">buah</option>
                    <option value="titik">titik</option>
                    <option value="ls">ls (lump sum)</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                  Alasan Penambahan Manual
                </label>
                <textarea
                  placeholder="Contoh: Item pekerjaan khusus dari gambar as-built arsitek..."
                  rows={2}
                  value={manualReason}
                  onChange={(e) => setManualReason(e.target.value)}
                  style={{ width: '100%', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '8px 10px', fontSize: '12px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setManualModalOpen(false)}
                  style={{ height: '36px', padding: '0 14px', borderRadius: '8px', background: '#F1F5F9', border: '1px solid #CBD5E1', color: '#334155', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  style={{ height: '36px', padding: '0 18px', borderRadius: '8px', background: '#2563EB', border: 'none', color: '#ffffff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Simpan Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 4: Column Customization Modal */}
      {columnsModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
          onClick={() => setColumnsModalOpen(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              maxWidth: '400px',
              width: '100%',
              padding: '20px',
              boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 800, margin: 0 }}>
                Pengaturan Kolom QTO Table
              </h3>
              <button onClick={() => setColumnsModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12.5px' }}>
              {Object.entries(visibleColumns).map(([key, val]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={val}
                    onChange={() =>
                      setVisibleColumns((prev) => ({
                        ...prev,
                        [key]: !prev[key as keyof typeof visibleColumns],
                      }))
                    }
                  />
                  <span style={{ textTransform: 'capitalize' }}>{key}</span>
                </label>
              ))}
            </div>

            <button
              onClick={() => setColumnsModalOpen(false)}
              style={{ width: '100%', marginTop: '16px', height: '34px', background: '#2563EB', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
            >
              Terapkan
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
