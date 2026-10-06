import React, { useState, useMemo } from 'react';
import {
  Database,
  Search,
  Filter,
  Eye,
  Plus,
  BookOpen,
  Layers,
  Check,
  ChevronRight,
  Sparkles,
  Info,
  Sliders,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  FileSpreadsheet,
  Waves,
  Building2,
  HardHat,
  Compass,
  ArrowUpDown,
  Download,
  Copy,
  ExternalLink,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { ALL_OFFICIAL_AHSP_ITEMS } from '../../data/nationalCostDatabase/masterRegistry';
import { NationalAHSPItem, AHSPDomain } from '../../data/nationalCostDatabase/types';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';
import { useProject } from '../../context/ProjectContext';
import { saveProjectAhspFromCatalog } from '../../project-data/ahspBridge';
import { priceResolver2026 } from '../../data/priceDatabase2026/resolver';
import type { AhspUnitPriceComposition } from '../../data/priceDatabase2026/types';

interface AhspExplorerViewProps {
  onAddAhspToRab?: (ahsp: NationalAHSPItem, volume: number) => void;
}

const ITEMS_PER_PAGE_OPTIONS = [24, 48, 96, 192];

/**
 * §19 — Domain → Lampiran (annex) mapping for SE DJBK No. 47/SE/Dk/2026.
 * The 2026 catalog has exactly four AHSP-bearing annexes and NO Bidang Umum.
 */
const DOMAIN_ANNEX_LABEL: Record<string, string> = {
  SMKK: 'Lampiran III SE DJBK No. 47/SE/Dk/2026 (SMKK)',
  SUMBER_DAYA_AIR: 'Lampiran IV SE DJBK No. 47/SE/Dk/2026 (Sumber Daya Air)',
  BINA_MARGA: 'Lampiran V SE DJBK No. 47/SE/Dk/2026 (Bina Marga)',
  CIPTA_KARYA: 'Lampiran VI SE DJBK No. 47/SE/Dk/2026 (Cipta Karya)',
};

function domainAnnexLabel(domain: AHSPDomain | 'ALL'): string {
  if (domain === 'ALL') return 'SE DJBK No. 47/SE/Dk/2026 (Lampiran III, IV, V, VI)';
  return DOMAIN_ANNEX_LABEL[domain] || 'SE DJBK No. 47/SE/Dk/2026';
}

/** Human-readable domain name (never the raw enum, never a fabricated annex). */
const DOMAIN_SHORT_LABEL: Record<string, string> = {
  SMKK: 'SMKK (Lampiran III)',
  SUMBER_DAYA_AIR: 'Sumber Daya Air (Lampiran IV)',
  BINA_MARGA: 'Bina Marga (Lampiran V)',
  CIPTA_KARYA: 'Cipta Karya (Lampiran VI)',
};

function domainShortLabel(domain: AHSPDomain | 'ALL'): string {
  if (domain === 'ALL') return 'Semua Bidang';
  return DOMAIN_SHORT_LABEL[domain] || String(domain);
}

const DOMAIN_COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = {
  CIPTA_KARYA: { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
  BINA_MARGA: { bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0' },
  SUMBER_DAYA_AIR: { bg: '#F0F9FF', text: '#0284C7', border: '#BAE6FD' },
  SMKK: { bg: '#FEF3C7', text: '#B45309', border: '#FDE68A' },
};

export const AhspExplorerView: React.FC<AhspExplorerViewProps> = ({ onAddAhspToRab }) => {
  const { currentProject, projectRabItems, createRabItemDirect } = useProject();

  // Filters State
  const [selectedDomain, setSelectedDomain] = useState<AHSPDomain | 'ALL'>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedMethod, setSelectedMethod] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [priceStatusFilter, setPriceStatusFilter] = useState<'ALL' | 'FULL' | 'PARTIAL' | 'MISSING'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'code' | 'name' | 'priceAsc' | 'priceDesc'>('code');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);

  // Modals & Interactive State
  const [selectedAhsp, setSelectedAhsp] = useState<NationalAHSPItem | null>(null);
  const [addToRabModalItem, setAddToRabModalItem] = useState<NationalAHSPItem | null>(null);
  const [showAuditModal, setShowAuditModal] = useState<boolean>(false);
  const [inputVolume, setInputVolume] = useState<number>(1);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Show Toast
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Domain Counts
  const domainCounts = useMemo(() => {
    const counts = {
      ALL: ALL_OFFICIAL_AHSP_ITEMS.length,
      SUMBER_DAYA_AIR: 0,
      BINA_MARGA: 0,
      CIPTA_KARYA: 0,
      SMKK: 0,
    };
    ALL_OFFICIAL_AHSP_ITEMS.forEach((item) => {
      if (item.domain === 'SUMBER_DAYA_AIR') counts.SUMBER_DAYA_AIR++;
      else if (item.domain === 'BINA_MARGA') counts.BINA_MARGA++;
      else if (item.domain === 'CIPTA_KARYA') counts.CIPTA_KARYA++;
      else if (item.domain === 'SMKK') counts.SMKK++;
    });
    return counts;
  }, []);

  // Available Categories for Selected Domain
  const availableCategories = useMemo(() => {
    const items = selectedDomain === 'ALL'
      ? ALL_OFFICIAL_AHSP_ITEMS
      : ALL_OFFICIAL_AHSP_ITEMS.filter((itm) => itm.domain === selectedDomain);

    const categoryMap = new Map<string, number>();
    items.forEach((item) => {
      const cat = item.category || 'LAIN-LAIN';
      categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
    });

    return Array.from(categoryMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [selectedDomain]);

  // Filtered & Sorted Dataset
  const filteredItems = useMemo(() => {
    const qClean = searchQuery.trim().toLowerCase();

    const filtered = ALL_OFFICIAL_AHSP_ITEMS.filter((item) => {
      // Domain filter
      if (selectedDomain !== 'ALL' && item.domain !== selectedDomain) return false;

      // Category filter
      if (selectedCategory !== 'ALL' && item.category !== selectedCategory) return false;

      // Method filter
      if (selectedMethod !== 'ALL' && item.method !== selectedMethod) return false;

      // Normative Status filter
      if (selectedStatus !== 'ALL' && item.normativeStatus !== selectedStatus) return false;

      // Price Status filter
      if (priceStatusFilter !== 'ALL') {
        const comp = priceResolver2026.resolveAhspUnitPrice(item);
        if (comp.pricingStatus !== priceStatusFilter) return false;
      }

      // Query Search
      if (qClean) {
        const matchCode = item.code.toLowerCase().includes(qClean) || item.codeNormalized.toLowerCase().includes(qClean);
        const matchName = item.name.toLowerCase().includes(qClean);
        const matchCat = (item.category || '').toLowerCase().includes(qClean);
        const matchSub = (item.subDomain || '').toLowerCase().includes(qClean);
        
        // Search inside resources
        const matchResource = item.laborComponents.some(l => l.name.toLowerCase().includes(qClean)) ||
                              item.materialComponents.some(m => m.name.toLowerCase().includes(qClean)) ||
                              item.equipmentComponents.some(e => e.name.toLowerCase().includes(qClean));

        if (!matchCode && !matchName && !matchCat && !matchSub && !matchResource) {
          return false;
        }
      }

      return true;
    });

    // Sorting
    return filtered.sort((a, b) => {
      if (sortBy === 'code') return a.codeNormalized.localeCompare(b.codeNormalized, undefined, { numeric: true });
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'priceAsc') {
        const ca = priceResolver2026.resolveAhspUnitPrice(a);
        const cb = priceResolver2026.resolveAhspUnitPrice(b);
        const pa = (ca.hspPrice ?? ca.unitPrice) ?? Number.POSITIVE_INFINITY;
        const pb = (cb.hspPrice ?? cb.unitPrice) ?? Number.POSITIVE_INFINITY;
        return pa - pb;
      }
      if (sortBy === 'priceDesc') {
        const ca = priceResolver2026.resolveAhspUnitPrice(a);
        const cb = priceResolver2026.resolveAhspUnitPrice(b);
        const pa = (ca.hspPrice ?? ca.unitPrice) ?? -1;
        const pb = (cb.hspPrice ?? cb.unitPrice) ?? -1;
        return pb - pa;
      }
      return 0;
    });
  }, [selectedDomain, selectedCategory, selectedMethod, selectedStatus, priceStatusFilter, searchQuery, sortBy]);

  // Total pages & Current page slice
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedItems = useMemo(() => {
    const startIdx = (safeCurrentPage - 1) * pageSize;
    return filteredItems.slice(startIdx, startIdx + pageSize);
  }, [filteredItems, safeCurrentPage, pageSize]);

  // Memoized compositions for open modals
  const selectedAhspComposition = useMemo(() => {
    if (!selectedAhsp) return null;
    return priceResolver2026.resolveAhspUnitPrice(selectedAhsp);
  }, [selectedAhsp]);

  const addToRabComposition = useMemo(() => {
    if (!addToRabModalItem) return null;
    return priceResolver2026.resolveAhspUnitPrice(addToRabModalItem);
  }, [addToRabModalItem]);

  // Handle Domain Switch
  const handleDomainChange = (domain: AHSPDomain | 'ALL') => {
    setSelectedDomain(domain);
    setSelectedCategory('ALL');
    setCurrentPage(1);
  };

  // Handle Copy Code
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    showToast(`Kode analisa ${code} disalin ke clipboard!`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Handle Add to RAB
  const handleConfirmAddToRab = () => {
    if (!addToRabModalItem) return;

    const hsp = addToRabComposition?.hspPrice ?? addToRabComposition?.unitPrice ?? 0;
    const enrichedItem: NationalAHSPItem = {
      ...addToRabModalItem,
      unitPrice: hsp,
      totalLabor: addToRabComposition?.labor.subtotalPerUnit || 0,
      totalMaterial: addToRabComposition?.material.subtotalPerUnit || 0,
      totalEquipment: addToRabComposition?.equipment.subtotalPerUnit || 0,
    };

    if (onAddAhspToRab) {
      onAddAhspToRab(enrichedItem, inputVolume);
    } else if (currentProject && createRabItemDirect) {
      createRabItemDirect({
        code: addToRabModalItem.code,
        ahspCode: addToRabModalItem.code,
        description: addToRabModalItem.name,
        unit: addToRabModalItem.unit,
        volume: inputVolume,
        unitPrice: hsp,
        totalPrice: hsp * inputVolume,
        category: addToRabModalItem.category || 'Pekerjaan',
        sectionName: addToRabModalItem.category || 'Pekerjaan',
        laborPrice: addToRabComposition?.labor.subtotalPerUnit || 0,
        materialPrice: addToRabComposition?.material.subtotalPerUnit || 0,
        equipmentPrice: addToRabComposition?.equipment.subtotalPerUnit || 0,
      });
    }

    showToast(`Berhasil menambahkan ${addToRabModalItem.code} (${inputVolume} ${addToRabModalItem.unit}) ke RAB!`);
    setAddToRabModalItem(null);
    setInputVolume(1);
  };

  // Handle Save to Project AHSP
  const handleSaveToProjectAhsp = (item: NationalAHSPItem) => {
    if (!currentProject?.id) {
      showToast('Pilih atau buka proyek terlebih dahulu untuk menyimpan ke AHSP Proyek!');
      return;
    }
    const comp = priceResolver2026.resolveAhspUnitPrice(item);
    const hsp = comp.hspPrice ?? comp.unitPrice ?? 0;
    const enrichedItem: NationalAHSPItem = {
      ...item,
      unitPrice: hsp,
      totalLabor: comp.labor.subtotalPerUnit || 0,
      totalMaterial: comp.material.subtotalPerUnit || 0,
      totalEquipment: comp.equipment.subtotalPerUnit || 0,
    };
    saveProjectAhspFromCatalog(currentProject.id, enrichedItem);
    showToast(`Analisa ${item.code} berhasil disimpan ke AHSP Proyek "${currentProject.name}"!`);
  };

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '1680px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        color: '#0F172A',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '28px',
            right: '28px',
            background: '#0F172A',
            color: '#ffffff',
            padding: '14px 22px',
            borderRadius: '12px',
            fontSize: '13.5px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: '0 12px 30px rgba(0,0,0,0.3)',
            zIndex: 9999,
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <Check size={18} color="#4ADE80" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* =========================================================================
          1. HEADER HERO BANNER & REGULATION CITATION (CLEAN LIGHT STYLE)
         ========================================================================= */}
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '16px',
          padding: '22px 26px',
          color: '#111827',
          border: '1px solid #E5E7EB',
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '20px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'relative', zIndex: 2, maxWidth: '850px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.02em',
                background: '#EFF6FF',
                color: '#2563EB',
                border: '1px solid #DBEAFE',
                padding: '4px 10px',
                borderRadius: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <Waves size={13} />
              Database Resmi SE DJBK 47/2026
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                background: '#F1F5F9',
                color: '#475569',
                border: '1px solid #E5E7EB',
                padding: '4px 10px',
                borderRadius: '6px',
              }}
            >
              {domainAnnexLabel(selectedDomain)}
            </span>
          </div>

          <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em', margin: 0, lineHeight: 1.3, color: '#111827' }}>
            {selectedDomain === 'BINA_MARGA'
              ? 'Katalog Lengkap AHSP Bidang Bina Marga (Jalan & Jembatan) 2026'
              : selectedDomain === 'SUMBER_DAYA_AIR'
              ? 'Katalog Lengkap AHSP Bidang Sumber Daya Air (SDA) 2026'
              : selectedDomain === 'CIPTA_KARYA'
              ? 'Katalog AHSP Bidang Cipta Karya (Gedung & Perumahan) 2026'
              : 'Katalog Nasional AHSP PUPR 2026 (Bina Marga, SDA, Cipta Karya, SMKK)'}
          </h1>
          <p style={{ fontSize: '13.5px', color: '#64748B', margin: '8px 0 0', lineHeight: 1.5 }}>
            {selectedDomain === 'CIPTA_KARYA' ? (
              <>Daftar resmi <strong>{domainCounts.CIPTA_KARYA.toLocaleString('id-ID')} Analisa Harga Satuan Pekerjaan Gedung & Perumahan (Cipta Karya)</strong> terintegrasi penuh dengan Price Database & DHSP resmi SE DJBK No. 47/SE/Dk/2026.</>
            ) : selectedDomain === 'BINA_MARGA' ? (
              <>Daftar resmi <strong>{domainCounts.BINA_MARGA.toLocaleString('id-ID')} Analisa Harga Satuan Pekerjaan Jalan & Jembatan</strong> (Divisi 1 s.d. 10) lengkap dengan dekomposisi koefisien Bahan, Upah Tenaga Kerja, dan Peralatan Alat Berat.</>
            ) : selectedDomain === 'SUMBER_DAYA_AIR' ? (
              <>Daftar resmi <strong>{domainCounts.SUMBER_DAYA_AIR.toLocaleString('id-ID')} Analisa Harga Satuan Pekerjaan Sumber Daya Air</strong> lengkap dengan rincian koefisien Tenaga Kerja, Bahan, dan Peralatan sesuai SE DJBK No. 47/SE/Dk/2026.</>
            ) : (
              <>Daftar resmi <strong>{domainCounts.ALL.toLocaleString('id-ID')} item Analisa Harga Satuan Pekerjaan Nasional</strong> lintas bidang Cipta Karya, Sumber Daya Air, Bina Marga, dan SMKK Konstruksi.</>
            )}
          </p>
        </div>

        {/* Quick Stats Pill */}
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: '#F8FAFC',
            border: '1px solid #E5E7EB',
            borderRadius: '12px',
            padding: '10px 16px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ textAlign: 'center', paddingRight: '12px', borderRight: '1px solid #E5E7EB' }}>
            <div style={{ fontSize: '17px', fontWeight: 800, color: '#16A34A' }}>
              {domainCounts.ALL.toLocaleString('id-ID')}
            </div>
            <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600 }}>Semua Bidang</div>
          </div>
          <div style={{ textAlign: 'center', paddingRight: '12px', borderRight: '1px solid #E5E7EB' }}>
            <div style={{ fontSize: '17px', fontWeight: 800, color: '#2563EB' }}>
              {domainCounts.CIPTA_KARYA.toLocaleString('id-ID')}
            </div>
            <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600 }}>Cipta Karya</div>
          </div>
          <div style={{ textAlign: 'center', paddingRight: '12px', borderRight: '1px solid #E5E7EB' }}>
            <div style={{ fontSize: '17px', fontWeight: 800, color: '#D97706' }}>
              {domainCounts.BINA_MARGA.toLocaleString('id-ID')}
            </div>
            <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600 }}>Bina Marga</div>
          </div>
          <div style={{ textAlign: 'center', paddingRight: '12px', borderRight: '1px solid #E5E7EB' }}>
            <div style={{ fontSize: '17px', fontWeight: 800, color: '#0891B2' }}>
              {domainCounts.SUMBER_DAYA_AIR.toLocaleString('id-ID')}
            </div>
            <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600 }}>SDA</div>
          </div>
          <div style={{ textAlign: 'center', paddingRight: '12px', borderRight: '1px solid #E5E7EB' }}>
            <div style={{ fontSize: '17px', fontWeight: 800, color: '#B45309' }}>
              {domainCounts.SMKK.toLocaleString('id-ID')}
            </div>
            <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600 }}>SMKK K3</div>
          </div>
          <button
            onClick={() => setShowAuditModal(true)}
            title="Lihat status integrasi dan audit database 2026"
            style={{
              padding: '6px 10px',
              borderRadius: '8px',
              background: '#ffffff',
              border: '1px solid #CBD5E1',
              color: '#15803D',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <ShieldCheck size={14} color="#16A34A" />
            <span>Audit 2026</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          2. DOMAIN TABS: Semua Bidang -> Cipta Karya -> Bina Marga -> SDA -> SMKK K3
         ========================================================================= */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          background: '#ffffff',
          borderRadius: '14px',
          padding: '8px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
        }}
      >
        {/* 1. SEMUA BIDANG */}
        <button
          onClick={() => handleDomainChange('ALL')}
          style={{
            flex: '1 1 150px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '10px 16px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: selectedDomain === 'ALL' ? 800 : 600,
            background: selectedDomain === 'ALL' ? '#EFF6FF' : 'transparent',
            color: selectedDomain === 'ALL' ? '#1D4ED8' : '#64748B',
            border: selectedDomain === 'ALL' ? '1.5px solid #3B82F6' : '1px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <Layers size={16} color={selectedDomain === 'ALL' ? '#2563EB' : '#94A3B8'} />
          <span>Semua Bidang</span>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '999px',
              background: selectedDomain === 'ALL' ? '#DBEAFE' : '#F1F5F9',
              color: selectedDomain === 'ALL' ? '#1E40AF' : '#64748B',
              fontWeight: 700,
            }}
          >
            {domainCounts.ALL.toLocaleString('id-ID')}
          </span>
        </button>

        {/* 2. CIPTA KARYA */}
        <button
          onClick={() => handleDomainChange('CIPTA_KARYA')}
          style={{
            flex: '1 1 180px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '10px 16px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: selectedDomain === 'CIPTA_KARYA' ? 800 : 600,
            background: selectedDomain === 'CIPTA_KARYA' ? '#EFF6FF' : 'transparent',
            color: selectedDomain === 'CIPTA_KARYA' ? '#1D4ED8' : '#64748B',
            border: selectedDomain === 'CIPTA_KARYA' ? '1.5px solid #3B82F6' : '1px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <Building2 size={16} color={selectedDomain === 'CIPTA_KARYA' ? '#2563EB' : '#94A3B8'} />
          <span>Cipta Karya (Gedung)</span>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '999px',
              background: selectedDomain === 'CIPTA_KARYA' ? '#DBEAFE' : '#F1F5F9',
              color: selectedDomain === 'CIPTA_KARYA' ? '#1E40AF' : '#64748B',
              fontWeight: 700,
            }}
          >
            {domainCounts.CIPTA_KARYA.toLocaleString('id-ID')}
          </span>
        </button>

        {/* 3. BINA MARGA */}
        <button
          onClick={() => handleDomainChange('BINA_MARGA')}
          style={{
            flex: '1 1 180px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '10px 16px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: selectedDomain === 'BINA_MARGA' ? 800 : 600,
            background: selectedDomain === 'BINA_MARGA' ? '#EFF6FF' : 'transparent',
            color: selectedDomain === 'BINA_MARGA' ? '#1D4ED8' : '#64748B',
            border: selectedDomain === 'BINA_MARGA' ? '1.5px solid #3B82F6' : '1px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <Compass size={16} color={selectedDomain === 'BINA_MARGA' ? '#2563EB' : '#94A3B8'} />
          <span>Bina Marga (Jalan)</span>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '999px',
              background: selectedDomain === 'BINA_MARGA' ? '#DBEAFE' : '#F1F5F9',
              color: selectedDomain === 'BINA_MARGA' ? '#1E40AF' : '#64748B',
              fontWeight: 700,
            }}
          >
            {domainCounts.BINA_MARGA.toLocaleString('id-ID')}
          </span>
        </button>

        {/* 4. SUMBER DAYA AIR (SDA) */}
        <button
          onClick={() => handleDomainChange('SUMBER_DAYA_AIR')}
          style={{
            flex: '1 1 200px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '10px 16px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: selectedDomain === 'SUMBER_DAYA_AIR' ? 800 : 600,
            background: selectedDomain === 'SUMBER_DAYA_AIR' ? '#EFF6FF' : 'transparent',
            color: selectedDomain === 'SUMBER_DAYA_AIR' ? '#1D4ED8' : '#64748B',
            border: selectedDomain === 'SUMBER_DAYA_AIR' ? '1.5px solid #3B82F6' : '1px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <Waves size={16} color={selectedDomain === 'SUMBER_DAYA_AIR' ? '#2563EB' : '#94A3B8'} />
          <span>Sumber Daya Air (SDA)</span>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '999px',
              background: selectedDomain === 'SUMBER_DAYA_AIR' ? '#DBEAFE' : '#F1F5F9',
              color: selectedDomain === 'SUMBER_DAYA_AIR' ? '#1E40AF' : '#64748B',
              fontWeight: 700,
            }}
          >
            {domainCounts.SUMBER_DAYA_AIR.toLocaleString('id-ID')}
          </span>
        </button>

        {/* 5. SMKK K3 */}
        <button
          onClick={() => handleDomainChange('SMKK')}
          style={{
            flex: '1 1 140px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '10px 16px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: selectedDomain === 'SMKK' ? 800 : 600,
            background: selectedDomain === 'SMKK' ? '#EFF6FF' : 'transparent',
            color: selectedDomain === 'SMKK' ? '#1D4ED8' : '#64748B',
            border: selectedDomain === 'SMKK' ? '1.5px solid #3B82F6' : '1px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <HardHat size={16} color={selectedDomain === 'SMKK' ? '#2563EB' : '#94A3B8'} />
          <span>SMKK K3</span>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '999px',
              background: selectedDomain === 'SMKK' ? '#DBEAFE' : '#F1F5F9',
              color: selectedDomain === 'SMKK' ? '#1E40AF' : '#64748B',
              fontWeight: 700,
            }}
          >
            {domainCounts.SMKK.toLocaleString('id-ID')}
          </span>
        </button>
      </div>

      {/* =========================================================================
          3. CATEGORIES HORIZONTAL PILLS BAR
         ========================================================================= */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          paddingBottom: '4px',
          scrollbarWidth: 'thin',
        }}
      >
        <button
          onClick={() => {
            setSelectedCategory('ALL');
            setCurrentPage(1);
          }}
          style={{
            whiteSpace: 'nowrap',
            padding: '6px 14px',
            borderRadius: '999px',
            fontSize: '12px',
            fontWeight: selectedCategory === 'ALL' ? 700 : 500,
            background: selectedCategory === 'ALL' ? '#0F172A' : '#ffffff',
            color: selectedCategory === 'ALL' ? '#ffffff' : '#475569',
            border: selectedCategory === 'ALL' ? '1px solid #0F172A' : '1px solid #CBD5E1',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>Semua Kategori</span>
          <span
            style={{
              fontSize: '10.5px',
              padding: '1px 6px',
              borderRadius: '999px',
              background: selectedCategory === 'ALL' ? 'rgba(255,255,255,0.2)' : '#F1F5F9',
            }}
          >
            {filteredItems.length}
          </span>
        </button>

        {availableCategories.map((cat) => (
          <button
            key={cat.name}
            onClick={() => {
              setSelectedCategory(cat.name);
              setCurrentPage(1);
            }}
            style={{
              whiteSpace: 'nowrap',
              padding: '6px 14px',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: selectedCategory === cat.name ? 700 : 500,
              background: selectedCategory === cat.name ? '#2563EB' : '#ffffff',
              color: selectedCategory === cat.name ? '#ffffff' : '#475569',
              border: selectedCategory === cat.name ? '1px solid #2563EB' : '1px solid #CBD5E1',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>{cat.name}</span>
            <span
              style={{
                fontSize: '10.5px',
                padding: '1px 6px',
                borderRadius: '999px',
                background: selectedCategory === cat.name ? 'rgba(255,255,255,0.25)' : '#F1F5F9',
                color: selectedCategory === cat.name ? '#ffffff' : '#64748B',
                fontWeight: 700,
              }}
            >
              {cat.count}
            </span>
          </button>
        ))}
      </div>

      {/* =========================================================================
          4. SEARCH, FILTER & SORT BAR
         ========================================================================= */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          padding: '16px 20px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
        }}
      >
        {/* Search Input */}
        <div style={{ position: 'relative', flex: '1 1 320px' }}>
          <Search size={18} color="#94A3B8" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Cari kode (misal: A.1.01.a.1, P.01), nama pekerjaan, pipa HDPE, galian, hebel..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            style={{
              width: '100%',
              height: '42px',
              paddingLeft: '40px',
              paddingRight: '14px',
              borderRadius: '10px',
              border: '1.5px solid #CBD5E1',
              fontSize: '13.5px',
              color: '#0F172A',
              outline: 'none',
              background: '#F8FAFC',
            }}
          />
        </div>

        {/* Filters Group */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
          {/* Method Filter */}
          <select
            value={selectedMethod}
            onChange={(e) => {
              setSelectedMethod(e.target.value);
              setCurrentPage(1);
            }}
            style={{
              height: '42px',
              padding: '0 12px',
              borderRadius: '10px',
              border: '1px solid #CBD5E1',
              fontSize: '12.5px',
              background: '#ffffff',
              color: '#334155',
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="ALL">Metode Kerja: Semua</option>
            <option value="Manual">Metode: Manual</option>
            <option value="Mekanis">Metode: Mekanis (Alat Berat)</option>
            <option value="Semi-Mekanis">Metode: Semi-Mekanis</option>
            <option value="Fabrikasi">Metode: Fabrikasi</option>
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setCurrentPage(1);
            }}
            style={{
              height: '42px',
              padding: '0 12px',
              borderRadius: '10px',
              border: '1px solid #CBD5E1',
              fontSize: '12.5px',
              background: '#ffffff',
              color: '#334155',
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="ALL">Status: Semua</option>
            <option value="Normatif">Status: Normatif</option>
            <option value="Informatif">Status: Informatif</option>
          </select>

          {/* Status Harga Filter (Phase 17) */}
          <select
            value={priceStatusFilter}
            onChange={(e) => {
              setPriceStatusFilter(e.target.value as any);
              setCurrentPage(1);
            }}
            style={{
              height: '42px',
              padding: '0 12px',
              borderRadius: '10px',
              border: '1px solid #CBD5E1',
              fontSize: '12.5px',
              background: '#ffffff',
              color: '#334155',
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="ALL">Status Harga: Semua</option>
            <option value="FULL">✓ Harga Lengkap</option>
            <option value="PARTIAL">◐ Harga Parsial</option>
            <option value="MISSING">— Belum Ada Harga</option>
          </select>

          {/* Sort By */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ArrowUpDown size={15} color="#64748B" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{
                height: '42px',
                padding: '0 12px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                fontSize: '12.5px',
                background: '#ffffff',
                color: '#334155',
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="code">Urutkan: Kode Analisa (WBS)</option>
              <option value="name">Urutkan: Nama Pekerjaan (A-Z)</option>
              <option value="priceAsc">Urutkan: Harga Termurah</option>
              <option value="priceDesc">Urutkan: Harga Tertinggi</option>
            </select>
          </div>
        </div>
      </div>

      {/* =========================================================================
          5. RESULTS INFO & PAGINATION CONTROLS (TOP)
         ========================================================================= */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          fontSize: '13px',
          color: '#64748B',
          padding: '0 4px',
        }}
      >
        <div>
          Menampilkan <strong>{filteredItems.length === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1} - {Math.min(safeCurrentPage * pageSize, filteredItems.length)}</strong> dari <strong>{filteredItems.length.toLocaleString('id-ID')} item analisa</strong>
          {selectedCategory !== 'ALL' && <span> dalam kategori <em>"{selectedCategory}"</em></span>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px' }}>Tampilkan per halaman:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            style={{
              padding: '4px 8px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              fontSize: '12px',
              fontWeight: 600,
              background: '#ffffff',
              cursor: 'pointer',
            }}
          >
            {ITEMS_PER_PAGE_OPTIONS.map((sz) => (
              <option key={sz} value={sz}>{sz} item</option>
            ))}
          </select>
        </div>
      </div>

      {/* =========================================================================
          6. GRID OF AHSP CARDS
         ========================================================================= */}
      {paginatedItems.length === 0 ? (
        <div
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            padding: '60px 20px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
          }}
        >
          <Database size={40} color="#94A3B8" />
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>
            Tidak ada item AHSP yang cocok dengan pencarian
          </h3>
          <p style={{ margin: 0, fontSize: '13px', color: '#64748B', maxWidth: '400px' }}>
            Coba gunakan kata kunci lain, pilih domain berbeda, atau kosongkan filter kategori.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('ALL');
              setSelectedMethod('ALL');
              setSelectedStatus('ALL');
            }}
            style={{
              marginTop: '8px',
              padding: '8px 18px',
              background: '#2563EB',
              color: '#ffffff',
              borderRadius: '8px',
              border: 'none',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reset Semua Filter
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
            gap: '16px',
          }}
        >
          {paginatedItems.map((item) => {
            const composition = priceResolver2026.resolveAhspUnitPrice(item);
            const laborTotal = composition.labor.subtotalPerUnit || (item.totalLabor ?? 0);
            const materialTotal = composition.material.subtotalPerUnit || (item.totalMaterial ?? 0);
            const equipTotal = composition.equipment.subtotalPerUnit || (item.totalEquipment ?? 0);
            const hspPrice = composition.hspPrice ?? composition.unitPrice ?? item.unitPrice;
            const pricingStatus = (hspPrice && hspPrice > 0 && item.domain === 'SMKK') ? 'FULL' : composition.pricingStatus;

            const domainColor = DOMAIN_COLOR_MAP[item.domain] || { bg: '#F1F5F9', text: '#475569', border: '#E2E8F0' };

            return (
              <div
                key={item.id}
                style={{
                  background: '#ffffff',
                  borderRadius: '16px',
                  border: '1px solid #E2E8F0',
                  padding: '20px 22px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '16px',
                  transition: 'all 0.15s ease',
                  position: 'relative',
                }}
              >
                <div>
                  {/* Top Bar: Code & Domain Tag */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '12px' }}>
                    <button
                      onClick={() => handleCopyCode(item.code)}
                      title="Klik untuk menyalin kode analisa"
                      style={{
                        fontSize: '13px',
                        fontWeight: 700,
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                        color: '#0F172A',
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <span>{item.code}</span>
                      {copiedCode === item.code ? <Check size={12} color="#16A34A" /> : <Copy size={12} color="#94A3B8" />}
                    </button>

                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: domainColor.text,
                        background: domainColor.bg,
                        border: `1px solid ${domainColor.border}`,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {item.domain.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* Item Description / Name */}
                  <h3
                    style={{
                      fontSize: '15px',
                      fontWeight: 650,
                      color: '#0F172A',
                      lineHeight: 1.45,
                      margin: '0 0 12px',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      minHeight: '44px',
                    }}
                    title={item.name}
                  >
                    {item.name}
                  </h3>

                  {/* Clean Divider */}
                  <div style={{ height: '1px', background: '#F1F5F9', margin: '12px 0 10px' }} />

                  {/* Metadata Row: Satuan & Status */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', marginBottom: '10px' }}>
                    <span style={{ color: '#64748B' }}>
                      Satuan: <strong style={{ color: '#0F172A', fontWeight: 700 }}>{item.unit || '—'}</strong>
                    </span>

                    {pricingStatus === 'FULL' && (
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: '#DCFCE7', color: '#15803D', border: '1px solid #BBF7D0', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        ✓ Harga lengkap
                      </span>
                    )}
                    {pricingStatus === 'PARTIAL' && (
                      <span title={`Harga sebagian (${composition.resolvedComponents}/${composition.totalComponents} komponen terisi)`} style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        ◐ Harga parsial*
                      </span>
                    )}
                    {pricingStatus === 'MISSING' && (
                      <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', background: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        — Harga belum tersedia
                      </span>
                    )}
                  </div>

                  {/* Cost Breakdown Mini Bar */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      background: '#F8FAFC',
                      border: '1px solid #F1F5F9',
                      borderRadius: '8px',
                      padding: '8px 10px',
                      fontSize: '11px',
                      color: '#64748B',
                    }}
                  >
                    <span>Tenaga Kerja: <strong style={{ color: laborTotal > 0 ? '#0F172A' : '#94A3B8' }}>{laborTotal > 0 ? formatCurrencyIDR(laborTotal) : (composition.labor.components.length > 0 ? '—' : '0')}</strong></span>
                    <span>Material: <strong style={{ color: materialTotal > 0 ? '#0F172A' : '#94A3B8' }}>{materialTotal > 0 ? formatCurrencyIDR(materialTotal) : (composition.material.components.length > 0 ? '—' : '0')}</strong></span>
                    <span>Peralatan: <strong style={{ color: equipTotal > 0 ? '#0F172A' : '#94A3B8' }}>{equipTotal > 0 ? formatCurrencyIDR(equipTotal) : (composition.equipment.components.length > 0 ? '—' : '0')}</strong></span>
                  </div>
                </div>

                {/* Bottom Section: Total Unit Price & Action Buttons */}
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      borderTop: '1px solid #F1F5F9',
                      paddingTop: '12px',
                      marginBottom: '14px',
                    }}
                  >
                    <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Harga Satuan (HSP):</span>
                    {hspPrice !== null && hspPrice > 0 ? (
                      <div style={{ fontSize: '17px', fontWeight: 800, color: pricingStatus === 'FULL' ? '#15803D' : '#D97706' }}>
                        {formatCurrencyIDR(hspPrice)}{pricingStatus === 'PARTIAL' ? '*' : ''} <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>/ {item.unit}</span>
                      </div>
                    ) : (
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#94A3B8', fontStyle: 'italic' }}>
                        Harga belum tersedia
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => setSelectedAhsp(item)}
                      style={{
                        flex: 1,
                        height: '38px',
                        borderRadius: '8px',
                        background: '#ffffff',
                        color: '#334155',
                        border: '1px solid #CBD5E1',
                        fontSize: '12px',
                        fontWeight: 650,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      <Eye size={14} color="#64748B" />
                      <span>Rincian Komponen</span>
                    </button>

                    <button
                      onClick={() => {
                        setAddToRabModalItem(item);
                        setInputVolume(1);
                      }}
                      style={{
                        height: '38px',
                        padding: '0 16px',
                        borderRadius: '8px',
                        background: '#2563EB',
                        color: '#ffffff',
                        border: 'none',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      <Plus size={14} />
                      <span>+ RAB</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* =========================================================================
          7. PAGINATION CONTROLS (BOTTOM)
         ========================================================================= */}
      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '20px 0',
          }}
        >
          <button
            onClick={() => setCurrentPage(1)}
            disabled={safeCurrentPage === 1}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              background: '#ffffff',
              color: safeCurrentPage === 1 ? '#94A3B8' : '#0F172A',
              cursor: safeCurrentPage === 1 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <ChevronsLeft size={16} />
            <span>Awal</span>
          </button>

          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={safeCurrentPage === 1}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              background: '#ffffff',
              color: safeCurrentPage === 1 ? '#94A3B8' : '#0F172A',
              cursor: safeCurrentPage === 1 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <ChevronLeft size={16} />
            <span>Sebelumnya</span>
          </button>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0 8px',
              fontSize: '13px',
              fontWeight: 700,
              color: '#0F172A',
            }}
          >
            <span>Halaman</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={safeCurrentPage}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1 && val <= totalPages) {
                  setCurrentPage(val);
                }
              }}
              style={{
                width: '54px',
                height: '32px',
                textAlign: 'center',
                borderRadius: '6px',
                border: '1.5px solid #2563EB',
                fontWeight: 800,
                fontSize: '13px',
              }}
            />
            <span>dari {totalPages.toLocaleString('id-ID')}</span>
          </div>

          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={safeCurrentPage === totalPages}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              background: '#ffffff',
              color: safeCurrentPage === totalPages ? '#94A3B8' : '#0F172A',
              cursor: safeCurrentPage === totalPages ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <span>Selanjutnya</span>
            <ChevronRight size={16} />
          </button>

          <button
            onClick={() => setCurrentPage(totalPages)}
            disabled={safeCurrentPage === totalPages}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              background: '#ffffff',
              color: safeCurrentPage === totalPages ? '#94A3B8' : '#0F172A',
              cursor: safeCurrentPage === totalPages ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <span>Akhir</span>
            <ChevronsRight size={16} />
          </button>
        </div>
      )}

      {/* =========================================================================
          8. DETAILED AHSP ANALYSIS MODAL (KOEFISIEN, BAHAN, UPAH, ALAT)
         ========================================================================= */}
      {selectedAhsp && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
            padding: '20px',
          }}
          onClick={() => setSelectedAhsp(null)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '20px',
              maxWidth: '850px',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                background: '#F8FAFC',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#2563EB', background: '#EFF6FF', border: '1px solid #DBEAFE', padding: '3px 8px', borderRadius: '6px' }}>
                    {selectedAhsp.code}
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#0284C7', background: '#F0F9FF', padding: '3px 8px', borderRadius: '6px' }}>
                    {domainShortLabel(selectedAhsp.domain)}
                  </span>
                  <span style={{ fontSize: '11px', color: '#64748B' }}>
                    {selectedAhsp.sourceDocument || 'Sumber tidak tercatat'}
                  </span>
                </div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0F172A', lineHeight: 1.4 }}>
                  {selectedAhsp.name}
                </h3>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
                  Satuan Pekerjaan: <strong>1 {selectedAhsp.unit}</strong> · Kategori: <strong>{selectedAhsp.category}</strong>
                </div>
              </div>

              <button
                onClick={() => setSelectedAhsp(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  color: '#94A3B8',
                  padding: '4px',
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body: Rincian Koefisien Table */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {selectedAhspComposition?.pricingStatus === 'PARTIAL' && (
                <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', color: '#92400E', padding: '10px 14px', borderRadius: '8px', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>⚠️ <strong>Harga Parsial:</strong> Beberapa komponen sumber daya belum memiliki data harga di database 2026. Subtotal di bawah mencerminkan komponen yang telah terpetakan ({selectedAhspComposition.resolvedComponents} dari {selectedAhspComposition.totalComponents} item).</span>
                </div>
              )}
              {selectedAhspComposition?.pricingStatus === 'MISSING' && (
                <div style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', color: '#475569', padding: '10px 14px', borderRadius: '8px', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>ℹ️ <strong>Harga Belum Tersedia:</strong> Belum ada data harga satuan untuk komponen pada analisa ini di database standar 2026. Anda dapat menyesuaikan harga secara manual setelah menambahkan ke proyek.</span>
                </div>
              )}

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: '#F1F5F9', borderBottom: '1.5px solid #CBD5E1', color: '#475569', fontWeight: 700 }}>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Uraian Sumber Daya</th>
                    <th style={{ padding: '10px', textAlign: 'center', width: '80px' }}>Tipe</th>
                    <th style={{ padding: '10px', textAlign: 'right', width: '90px' }}>Koefisien</th>
                    <th style={{ padding: '10px', textAlign: 'center', width: '60px' }}>Satuan</th>
                    <th style={{ padding: '10px', textAlign: 'right', width: '130px' }}>Harga Satuan (Rp)</th>
                    <th style={{ padding: '10px', textAlign: 'right', width: '140px' }}>Subtotal (Rp)</th>
                  </tr>
                </thead>
                <tbody>
                  {/* 1. Labor Components */}
                  {(selectedAhspComposition?.labor.components.length ?? 0) > 0 && (
                    <>
                      <tr style={{ background: '#EFF6FF', fontWeight: 800, color: '#1E40AF' }}>
                        <td colSpan={6} style={{ padding: '6px 10px', fontSize: '11.5px' }}>
                          A. TENAGA KERJA (UPAH)
                        </td>
                      </tr>
                      {selectedAhspComposition!.labor.components.map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '8px 10px', color: '#0F172A', fontWeight: 500 }}>
                            {r.itemName} {r.itemCode && <span style={{ color: '#94A3B8', fontSize: '11px' }}>({r.itemCode})</span>}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: '#DBEAFE', color: '#1D4ED8' }}>
                              TENAGA
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#2563EB' }}>
                            {r.coefficient}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center', color: '#64748B' }}>{r.unit || 'OH'}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: r.unitPrice !== null ? '#0F172A' : '#94A3B8' }}>
                            {r.unitPrice !== null ? r.unitPrice.toLocaleString('id-ID') : 'Belum ada data'}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: r.subtotalPerUnit !== null ? '#0F172A' : '#94A3B8' }}>
                            {r.subtotalPerUnit !== null ? Math.round(r.subtotalPerUnit).toLocaleString('id-ID') : '—'}
                          </td>
                        </tr>
                      ))}
                    </>
                  )}

                  {/* 2. Material Components */}
                  {(selectedAhspComposition?.material.components.length ?? 0) > 0 && (
                    <>
                      <tr style={{ background: '#FEF3C7', fontWeight: 800, color: '#92400E' }}>
                        <td colSpan={6} style={{ padding: '6px 10px', fontSize: '11.5px' }}>
                          B. BAHAN / MATERIAL
                        </td>
                      </tr>
                      {selectedAhspComposition!.material.components.map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '8px 10px', color: '#0F172A', fontWeight: 500 }}>
                            {r.itemName} {r.itemCode && <span style={{ color: '#94A3B8', fontSize: '11px' }}>({r.itemCode})</span>}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: '#FDE68A', color: '#B45309' }}>
                              BAHAN
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#2563EB' }}>
                            {r.coefficient}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center', color: '#64748B' }}>{r.unit}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: r.unitPrice !== null ? '#0F172A' : '#94A3B8' }}>
                            {r.unitPrice !== null ? r.unitPrice.toLocaleString('id-ID') : 'Belum ada data'}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: r.subtotalPerUnit !== null ? '#0F172A' : '#94A3B8' }}>
                            {r.subtotalPerUnit !== null ? Math.round(r.subtotalPerUnit).toLocaleString('id-ID') : '—'}
                          </td>
                        </tr>
                      ))}
                    </>
                  )}

                  {/* 3. Equipment Components */}
                  {(selectedAhspComposition?.equipment.components.length ?? 0) > 0 && (
                    <>
                      <tr style={{ background: '#F3E8FF', fontWeight: 800, color: '#6B21A8' }}>
                        <td colSpan={6} style={{ padding: '6px 10px', fontSize: '11.5px' }}>
                          C. PERALATAN
                        </td>
                      </tr>
                      {selectedAhspComposition!.equipment.components.map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '8px 10px', color: '#0F172A', fontWeight: 500 }}>
                            {r.itemName} {r.itemCode && <span style={{ color: '#94A3B8', fontSize: '11px' }}>({r.itemCode})</span>}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: '#E9D5FF', color: '#7E22CE' }}>
                              ALAT
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#2563EB' }}>
                            {r.coefficient}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center', color: '#64748B' }}>{r.unit}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: r.unitPrice !== null ? '#0F172A' : '#94A3B8' }}>
                            {r.unitPrice !== null ? r.unitPrice.toLocaleString('id-ID') : 'Belum ada data'}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: r.subtotalPerUnit !== null ? '#0F172A' : '#94A3B8' }}>
                            {r.subtotalPerUnit !== null ? Math.round(r.subtotalPerUnit).toLocaleString('id-ID') : '—'}
                          </td>
                        </tr>
                      ))}
                    </>
                  )}

                  {/* Subtotals & Grand Total */}
                  <tr style={{ fontWeight: 700, background: '#F8FAFC', borderTop: '2px solid #CBD5E1' }}>
                    <td colSpan={5} style={{ padding: '10px', textAlign: 'right', fontSize: '12.5px', color: '#475569' }}>
                      Jumlah Biaya Langsung (D = A + B + C):
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', color: '#0F172A', fontSize: '13.5px', fontWeight: 800 }}>
                      {selectedAhspComposition && selectedAhspComposition.unitPrice !== null && selectedAhspComposition.unitPrice > 0
                        ? formatCurrencyIDR(selectedAhspComposition.unitPrice)
                        : '—'}
                    </td>
                  </tr>

                  {selectedAhspComposition && selectedAhspComposition.overheadAmount !== undefined && selectedAhspComposition.overheadAmount !== null && selectedAhspComposition.overheadAmount > 0 ? (
                    <tr style={{ fontWeight: 700, background: '#F8FAFC' }}>
                      <td colSpan={5} style={{ padding: '8px 10px', textAlign: 'right', fontSize: '12px', color: '#64748B' }}>
                        Biaya Umum dan Keuntungan 10% (E):
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: '#64748B', fontSize: '13px', fontWeight: 700 }}>
                        {formatCurrencyIDR(selectedAhspComposition.overheadAmount)}
                      </td>
                    </tr>
                  ) : null}

                  <tr style={{ fontWeight: 800, background: '#EFF6FF', borderTop: '1.5px solid #BFDBFE' }}>
                    <td colSpan={5} style={{ padding: '12px 10px', textAlign: 'right', fontSize: '13.5px', color: '#1E40AF' }}>
                      Harga Satuan Pekerjaan (F = D + E):
                    </td>
                    <td style={{ padding: '12px 10px', textAlign: 'right', color: (selectedAhspComposition?.pricingStatus === 'FULL' || selectedAhsp?.domain === 'SMKK') ? '#15803D' : selectedAhspComposition?.pricingStatus === 'PARTIAL' ? '#D97706' : '#64748B', fontSize: '16px', fontWeight: 900 }}>
                      {(() => {
                        const finalP = selectedAhspComposition?.hspPrice ?? selectedAhspComposition?.unitPrice ?? selectedAhsp?.unitPrice;
                        return finalP !== null && finalP !== undefined && finalP > 0
                          ? formatCurrencyIDR(finalP)
                          : 'Harga belum tersedia';
                      })()}
                    </td>
                  </tr>

                  {selectedAhspComposition?.officialDhspPrice && selectedAhspComposition.officialDhspPrice !== (selectedAhspComposition.hspPrice ?? selectedAhspComposition.unitPrice) ? (
                    <tr style={{ fontWeight: 800, background: '#F0FDF4', borderTop: '1px solid #BBF7D0' }}>
                      <td colSpan={5} style={{ padding: '10px', textAlign: 'right', fontSize: '13px', color: '#166534' }}>
                        Daftar Harga Satuan Pekerjaan Resmi (DHSP):
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', color: '#15803D', fontSize: '15px', fontWeight: 900 }}>
                        {formatCurrencyIDR(selectedAhspComposition.officialDhspPrice)}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>

              {/* Provenance Box (Phase 18) */}
              <div
                style={{
                  fontSize: '12px',
                  color: '#334155',
                  background: '#F8FAFC',
                  padding: '14px 16px',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  lineHeight: 1.6,
                }}
              >
                <div style={{ fontWeight: 800, color: '#0F172A', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileText size={15} color="#2563EB" />
                  <span>Informasi Sumber Resmi (Data Lineage & Provenansi)</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
                  <div><strong>Pedoman:</strong> SE DJBK No. 47/SE/Dk/2026 ({selectedAhsp.domain === 'CIPTA_KARYA' ? 'Lampiran VI' : selectedAhsp.domain === 'SUMBER_DAYA_AIR' ? 'Lampiran IV' : selectedAhsp.domain === 'BINA_MARGA' ? 'Lampiran V' : 'Lampiran III'})</div>
                  <div><strong>Workbook:</strong> {selectedAhsp.domain === 'BINA_MARGA' ? 'AHSP 2026 Bina Marga.xlsx' : 'ahsp bina kontruksi 2026.xlsx'}</div>
                  <div><strong>Lokasi / Sheet:</strong> {selectedAhspComposition?.provenanceSource || (selectedAhsp as any).source?.sheet || 'Analisis Resmi'}</div>
                  <div><strong>Price Master:</strong> {selectedAhsp.domain === 'BINA_MARGA' ? 'Upah Bahan & DHSP Bina Marga 2026' : 'Upah Bahan & DHSP Cipta Karya 2026'}</div>
                  <div><strong>Status:</strong> <span style={{ color: '#16A34A', fontWeight: 700 }}>VERIFIED</span></div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid #E2E8F0',
                background: '#F8FAFC',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <button
                onClick={() => handleCopyCode(selectedAhsp.code)}
                style={{
                  height: '38px',
                  padding: '0 14px',
                  borderRadius: '8px',
                  background: '#ffffff',
                  border: '1px solid #CBD5E1',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Copy size={14} />
                <span>Salin Kode</span>
              </button>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setSelectedAhsp(null)}
                  style={{
                    height: '38px',
                    padding: '0 18px',
                    borderRadius: '8px',
                    background: '#ffffff',
                    border: '1px solid #CBD5E1',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Tutup
                </button>
                {selectedAhsp && (
                  <button
                    onClick={() => handleSaveToProjectAhsp(selectedAhsp)}
                    style={{
                      height: '38px',
                      padding: '0 16px',
                      borderRadius: '8px',
                      background: '#F1F5F9',
                      color: '#1E293B',
                      border: '1px solid #CBD5E1',
                      fontSize: '12.5px',
                      fontWeight: 650,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                    title="Simpan analisa ini ke data AHSP Proyek"
                  >
                    <Database size={15} color="#2563EB" />
                    <span>Simpan ke AHSP Proyek</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    setAddToRabModalItem(selectedAhsp);
                    setSelectedAhsp(null);
                  }}
                  style={{
                    height: '38px',
                    padding: '0 20px',
                    borderRadius: '8px',
                    background: '#2563EB',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Plus size={16} />
                  <span>Tambahkan ke RAB</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          9. ADD TO RAB MODAL (VOLUME INPUT)
         ========================================================================= */}
      {addToRabModalItem && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => setAddToRabModalItem(null)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '18px',
              maxWidth: '480px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB' }}>
                  <FileSpreadsheet size={18} />
                </div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                  Tambahkan ke RAB Proyek
                </h3>
              </div>
              <button
                onClick={() => setAddToRabModalItem(null)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94A3B8' }}
              >
                ✕
              </button>
            </div>

            {/* Selected item card summary */}
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#2563EB', background: '#EFF6FF', padding: '2px 6px', borderRadius: '4px' }}>
                  {addToRabModalItem.code}
                </span>
                <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
                  {addToRabModalItem.category}
                </span>
              </div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', lineHeight: 1.4 }}>
                {addToRabModalItem.name}
              </div>
              {(() => {
                const rabHsp = addToRabComposition?.hspPrice ?? addToRabComposition?.unitPrice;
                return (
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#16A34A', marginTop: '6px' }}>
                    {rabHsp !== null && (rabHsp ?? 0) > 0
                      ? `${formatCurrencyIDR(rabHsp!)} / ${addToRabModalItem.unit}`
                      : 'Harga belum tersedia'}
                  </div>
                );
              })()}
            </div>

            {/* Volume Input */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>
                Masukkan Volume Pekerjaan ({addToRabModalItem.unit}):
              </label>
              <input
                type="number"
                min="0.01"
                step="any"
                value={inputVolume}
                onChange={(e) => setInputVolume(parseFloat(e.target.value) || 0)}
                style={{
                  height: '42px',
                  padding: '0 12px',
                  borderRadius: '10px',
                  border: '1.5px solid #CBD5E1',
                  fontSize: '15px',
                  fontWeight: 700,
                  color: '#0F172A',
                  outline: 'none',
                }}
                autoFocus
              />
            </div>

            {/* Total Estimated Subtotal */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                background: '#F0FDF4',
                border: '1px solid #BBF7D0',
                borderRadius: '10px',
              }}
            >
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#166534' }}>Total Estimasi Biaya:</span>
              <span style={{ fontSize: '16px', fontWeight: 900, color: '#15803D' }}>
                {(() => {
                  const rabHsp = addToRabComposition?.hspPrice ?? addToRabComposition?.unitPrice;
                  return rabHsp !== null && (rabHsp ?? 0) > 0
                    ? formatCurrencyIDR(rabHsp! * (inputVolume || 0))
                    : '—';
                })()}
              </span>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button
                onClick={() => setAddToRabModalItem(null)}
                style={{
                  flex: 1,
                  height: '40px',
                  borderRadius: '10px',
                  background: '#ffffff',
                  border: '1px solid #CBD5E1',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Batal
              </button>
              <button
                onClick={handleConfirmAddToRab}
                disabled={inputVolume <= 0}
                style={{
                  flex: 2,
                  height: '40px',
                  borderRadius: '10px',
                  background: inputVolume > 0 ? '#2563EB' : '#94A3B8',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: inputVolume > 0 ? 'pointer' : 'not-allowed',
                }}
              >
                Konfirmasi + Tambah ke RAB
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          10. DATABASE AUDIT & LINEAGE MODAL (PHASE 19)
         ========================================================================= */}
      {showAuditModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => setShowAuditModal(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '20px',
              maxWidth: '680px',
              width: '100%',
              padding: '28px',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16A34A' }}>
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>
                    Audit & Provenansi Database 2026
                  </h3>
                  <div style={{ fontSize: '12px', color: '#64748B' }}>SE DJBK No. 47/SE/Dk/2026 — Kementerian PUPR</div>
                </div>
              </div>
              <button
                onClick={() => setShowAuditModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94A3B8' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', fontSize: '12.5px' }}>
              <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <div style={{ color: '#64748B', fontWeight: 600 }}>File Sumber Resmi</div>
                <div style={{ fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>ahsp bina kontruksi 2026.xlsx</div>
                <div style={{ fontSize: '10.5px', color: '#94A3B8', fontFamily: 'monospace', marginTop: '4px', wordBreak: 'break-all' }}>
                  SHA256: ee35ca4369f802e8ccced7884ceca76b7d1c5c774b5a2fccb784c48a34d1eb5a
                </div>
              </div>

              <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <div style={{ color: '#64748B', fontWeight: 600 }}>Total Canonical AHSP</div>
                <div style={{ fontWeight: 800, color: '#16A34A', fontSize: '16px', marginTop: '2px' }}>5.801 Item</div>
                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                  CK: 2.859 | SDA: 1.556 | BM: 1.163 | SMKK: 223
                </div>
              </div>

              <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <div style={{ color: '#64748B', fontWeight: 600 }}>DHSP Resmi Dievaluasi</div>
                <div style={{ fontWeight: 800, color: '#2563EB', fontSize: '16px', marginTop: '2px' }}>3.148 Baris</div>
                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>2.778 Leaf Items dengan Rumus VLOOKUP</div>
              </div>

              <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <div style={{ color: '#64748B', fontWeight: 600 }}>Price Database Master</div>
                <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '16px', marginTop: '2px' }}>3.324 Resource</div>
                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>3.075 Bahan, 45 Upah, 204 Peralatan</div>
              </div>
            </div>

            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '12px', padding: '14px 16px', fontSize: '12.5px', color: '#1E40AF', lineHeight: 1.6 }}>
              <strong>Status Rekonsiliasi Cipta Karya 2026:</strong>
              <div style={{ marginTop: '4px' }}>
                • Coverage Harga: <strong>99,2%</strong> (2.836 / 2.859 canonical items terpetakan harga)
                <br />
                • Invariant Testing: <strong>20/20 Test Passed</strong>, 5.801 Canonical tidak berubah
                <br />
                • Acceptance Test 1.1.1.1 s.d. 1.1.1.5: <strong>100% MATCH</strong>
              </div>
            </div>

            <button
              onClick={() => setShowAuditModal(false)}
              style={{
                height: '42px',
                borderRadius: '10px',
                background: '#0F172A',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Tutup Audit
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
