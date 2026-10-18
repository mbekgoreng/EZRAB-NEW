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
  AlertTriangle,
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
import { officialAhspRepository } from '../../data/nationalCostDatabase/officialAhspRepository';
import { NationalAHSPItem, AHSPDomain } from '../../data/nationalCostDatabase/types';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';
import { useProject } from '../../context/ProjectContext';
import { saveProjectAhspFromCatalog } from '../../project-data/ahspBridge';
import { priceResolver2026 } from '../../data/priceDatabase2026/resolver';
import { getAhspDirectPrice, canFinalizeAhsp, ahspCompletenessNote } from '../../data/priceDatabase2026/ahspDisplayPolicy';
import { applyMarketOverlay, type AugmentedComponent } from '../../engine/pricing/market/ahspMarketOverlay';
import { MarketReferencePanel } from './MarketReferencePanel';
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
  CIPTA_KARYA: { bg: 'var(--ez-pastel-sky)', text: 'var(--ez-hue-blue-text-deep)', border: 'var(--ez-pastel-sky)' },
  BINA_MARGA: { bg: 'var(--ez-pastel-mint)', text: 'var(--ez-hue-green-text-deep)', border: 'var(--ez-pastel-mint)' },
  SUMBER_DAYA_AIR: { bg: 'var(--ez-pastel-sky)', text: 'var(--ez-hue-blue-text-deep)', border: 'var(--ez-pastel-sky)' },
  SMKK: { bg: 'var(--ez-pastel-cream)', text: 'var(--ez-hue-amber-text-deep)', border: 'var(--ez-pastel-cream)' },
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
  const [marketPanelFor, setMarketPanelFor] = useState<{ code: string; name: string; unit: string } | null>(null);
  // Tick agar overlay pasar dihitung ulang setelah panel mengubah review store.
  const [marketTick, setMarketTick] = useState(0);
  const [showAuditModal, setShowAuditModal] = useState<boolean>(false);
  const [inputVolume, setInputVolume] = useState<number>(1);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Show Toast
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Domain Counts (active items only — quarantined records excluded)
  const activeAhspItems = useMemo(() => officialAhspRepository.getActiveOfficialAhsp(), []);
  const domainCounts = useMemo(() => {
    const counts = {
      ALL: activeAhspItems.length,
      SUMBER_DAYA_AIR: 0,
      BINA_MARGA: 0,
      CIPTA_KARYA: 0,
      SMKK: 0,
    };
    activeAhspItems.forEach((item) => {
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
      ? activeAhspItems
      : activeAhspItems.filter((itm) => itm.domain === selectedDomain);

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

    const filtered = activeAhspItems.filter((item) => {
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
        const pa = getAhspDirectPrice(ca) ?? Number.POSITIVE_INFINITY;
        const pb = getAhspDirectPrice(cb) ?? Number.POSITIVE_INFINITY;
        return pa - pb;
      }
      if (sortBy === 'priceDesc') {
        const ca = priceResolver2026.resolveAhspUnitPrice(a);
        const cb = priceResolver2026.resolveAhspUnitPrice(b);
        const pa = getAhspDirectPrice(ca) ?? -1;
        const pb = getAhspDirectPrice(cb) ?? -1;
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

  // Overlay harga pasar terverifikasi (view-layer; tidak mengubah data resmi).
  // marketTick: overlay membaca review store (mutable) → hitung ulang tiap tick.
  const selectedAhspAugmented = useMemo(() => {
    if (!selectedAhspComposition) return null;
    return applyMarketOverlay(selectedAhspComposition);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAhspComposition, marketTick]);

  const addToRabComposition = useMemo(() => {
    if (!addToRabModalItem) return null;
    return priceResolver2026.resolveAhspUnitPrice(addToRabModalItem);
  }, [addToRabModalItem]);

  const addToRabAugmented = useMemo(() => {
    if (!addToRabComposition) return null;
    return applyMarketOverlay(addToRabComposition);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addToRabComposition, marketTick]);

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

    // AHSP parsial/belum lengkap TIDAK boleh masuk RAB sebagai harga final.
    // Total kerja = Biaya Langsung (D); Biaya Umum & Keuntungan dinonaktifkan.
    // Komposisi augmented: komponen ber-harga-pasar-terverifikasi ikut terhitung.
    const comp = addToRabAugmented;
    const gate = canFinalizeAhsp(comp);
    if (!gate.ok) {
      showToast(`Tidak dapat ditambahkan: ${gate.reason}`);
      return;
    }
    const hsp = getAhspDirectPrice(comp)!;
    const marketNote = comp?.hasMarketPrices ? ' (sebagian harga dari referensi pasar terverifikasi)' : '';
    const enrichedItem: NationalAHSPItem = {
      ...addToRabModalItem,
      unitPrice: hsp,
      totalLabor: addToRabAugmented?.labor.subtotalPerUnit || 0,
      totalMaterial: addToRabAugmented?.material.subtotalPerUnit || 0,
      totalEquipment: addToRabAugmented?.equipment.subtotalPerUnit || 0,
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
        laborPrice: addToRabAugmented?.labor.subtotalPerUnit || 0,
        materialPrice: addToRabAugmented?.material.subtotalPerUnit || 0,
        equipmentPrice: addToRabAugmented?.equipment.subtotalPerUnit || 0,
      });
    }

    showToast(`Berhasil menambahkan ${addToRabModalItem.code} (${inputVolume} ${addToRabModalItem.unit}) ke RAB!${marketNote}`);
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
    // AHSP parsial tidak disimpan sebagai AHSP lengkap (termasuk overlay pasar).
    const augmented = applyMarketOverlay(comp);
    const gate = canFinalizeAhsp(augmented);
    if (!gate.ok) {
      showToast(`Tidak dapat disimpan: ${gate.reason}`);
      return;
    }
    const hsp = getAhspDirectPrice(augmented)!;
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

  // Baris komponen AHSP: dukung harga pasar terverifikasi + aksi cari referensi.
  const renderCompRow = (
    r: AugmentedComponent,
    badge: { label: string; bg: string; fg: string },
    key: number
  ) => {
    const price = r.unitPrice ?? r.marketUnitPrice;
    const hasPrice = price !== null && price > 0;
    return (
      <tr key={key} style={{ borderBottom: '1px solid var(--ez-color-surface-tertiary)' }}>
        <td style={{ padding: '8px 10px', color: 'var(--ez-color-text-primary)', fontWeight: 500 }}>
          {r.itemName} {r.itemCode && <span style={{ color: 'var(--ez-color-text-muted)', fontSize: '11px' }}>({r.itemCode})</span>}
        </td>
        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: 'var(--ez-radius-pill)', background: badge.bg, color: badge.fg }}>
            {badge.label}
          </span>
          {r.isMarketPriced ? (
            <span title={'Harga pasar terverifikasi dari ' + (r.marketSourceName || 'toko')} style={{ display: 'inline-block', marginLeft: '4px', fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: 'var(--ez-radius-pill)', background: '#dcfce7', color: '#166534' }}>
              Pasar
            </span>
          ) : null}
        </td>
        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--ez-color-primary)' }}>
          {r.coefficient}
        </td>
        <td style={{ padding: '8px 10px', textAlign: 'center', color: 'var(--ez-color-text-muted)' }}>{r.unit}</td>
        <td style={{ padding: '8px 10px', textAlign: 'right', color: hasPrice ? 'var(--ez-color-text)' : '#94A3B8' }}>
          {hasPrice ? (
            <>{price!.toLocaleString('id-ID')}{r.isMarketPriced ? <span style={{ fontSize: '10px', color: '#16a34a' }}> *</span> : null}</>
          ) : (
            <>
              <div>Belum ada data</div>
              <button
                onClick={() => setMarketPanelFor({ code: r.itemCode, name: r.itemName, unit: r.unit })}
                style={{ marginTop: '4px', fontSize: '11px', fontWeight: 700, color: 'var(--ez-color-primary)', background: 'transparent', border: '1px solid var(--ez-color-primary)', borderRadius: '8px', padding: '4px 10px', cursor: 'pointer' }}
              >
                Cari Referensi Harga
              </button>
            </>
          )}
        </td>
        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: r.subtotalPerUnit !== null ? 'var(--ez-color-text)' : '#94A3B8' }}>
          {r.subtotalPerUnit !== null ? Math.round(r.subtotalPerUnit).toLocaleString('id-ID') : '—'}
        </td>
      </tr>
    );
  };

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '1440px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '22px',
        color: 'var(--ez-color-text-primary)',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      {/* Dashboard entrance animation language (prefers-reduced-motion respected) */}
      <style>{`
        @keyframes ezdb-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .ezdb-anim { animation: none !important; } }
      `}</style>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '28px',
            right: '28px',
            background: 'var(--ez-color-text)',
            color: 'var(--ez-color-surface)',
            padding: '14px 22px',
            borderRadius: 'var(--ez-radius-control)',
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
          <Check size={18} color="var(--ez-hue-green-text-bright)" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* =========================================================================
          1. HEADER HERO BANNER & REGULATION CITATION (CLEAN LIGHT STYLE)
         ========================================================================= */}
      <div
        className="ezdb-anim"
        style={{
          background: 'var(--ez-color-surface)',
          borderRadius: 'var(--ez-radius-card)',
          padding: '22px 26px',
          color: 'var(--ez-color-text-primary)',
          border: '1px solid var(--ez-color-border)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '20px',
          position: 'relative',
          overflow: 'hidden',
          animation: 'ezdb-rise 0.6s 0s both',
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
                background: 'var(--ez-pastel-sky)',
                color: 'var(--ez-hue-blue-text-deep)',
                border: '1px solid var(--ez-color-border-strong)',
                padding: '4px 10px',
                borderRadius: 'var(--ez-radius-pill)',
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
                background: 'var(--ez-hue-slate-bg)',
                color: 'var(--ez-color-text-muted)',
                border: '1px solid var(--ez-color-border-soft)',
                padding: '4px 10px',
                borderRadius: 'var(--ez-radius-pill)',
              }}
            >
              {domainAnnexLabel(selectedDomain)}
            </span>
          </div>

          <h1 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.3px', margin: 0, lineHeight: 1.3, color: 'var(--ez-color-text-primary)' }}>
            {selectedDomain === 'BINA_MARGA'
              ? 'Katalog Lengkap AHSP Bidang Bina Marga (Jalan & Jembatan) 2026'
              : selectedDomain === 'SUMBER_DAYA_AIR'
              ? 'Katalog Lengkap AHSP Bidang Sumber Daya Air (SDA) 2026'
              : selectedDomain === 'CIPTA_KARYA'
              ? 'Katalog AHSP Bidang Cipta Karya (Gedung & Perumahan) 2026'
              : 'Katalog Nasional AHSP PUPR 2026 (Bina Marga, SDA, Cipta Karya, SMKK)'}
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--ez-color-text-warm)', margin: '8px 0 0', lineHeight: 1.5 }}>
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

        {/* Quick Stats Tiles (pastel summary) */}
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            alignItems: 'stretch',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ textAlign: 'center', background: 'var(--ez-pastel-cream)', borderRadius: 'var(--ez-radius-card)', padding: '10px 18px', boxShadow: '0 4px 20px rgba(0,0,0,0.045)' }}>
            <div style={{ fontSize: '19px', fontWeight: 800, color: 'var(--ez-hue-amber-text)', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
              {domainCounts.ALL.toLocaleString('id-ID')}
            </div>
            <div style={{ fontSize: '10.5px', color: 'var(--ez-color-text-warm)', fontWeight: 600 }}>Semua Bidang</div>
          </div>
          <div style={{ textAlign: 'center', background: 'var(--ez-pastel-mint)', borderRadius: 'var(--ez-radius-card)', padding: '10px 18px', boxShadow: '0 4px 20px rgba(0,0,0,0.045)' }}>
            <div style={{ fontSize: '19px', fontWeight: 800, color: 'var(--ez-hue-green-text)', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
              {domainCounts.CIPTA_KARYA.toLocaleString('id-ID')}
            </div>
            <div style={{ fontSize: '10.5px', color: 'var(--ez-color-text-warm)', fontWeight: 600 }}>Cipta Karya</div>
          </div>
          <div style={{ textAlign: 'center', background: 'var(--ez-pastel-peach)', borderRadius: 'var(--ez-radius-card)', padding: '10px 18px', boxShadow: '0 4px 20px rgba(0,0,0,0.045)' }}>
            <div style={{ fontSize: '19px', fontWeight: 800, color: 'var(--ez-hue-amber-text)', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
              {domainCounts.BINA_MARGA.toLocaleString('id-ID')}
            </div>
            <div style={{ fontSize: '10.5px', color: 'var(--ez-color-text-warm)', fontWeight: 600 }}>Bina Marga</div>
          </div>
          <div style={{ textAlign: 'center', background: 'var(--ez-pastel-sky)', borderRadius: 'var(--ez-radius-card)', padding: '10px 18px', boxShadow: '0 4px 20px rgba(0,0,0,0.045)' }}>
            <div style={{ fontSize: '19px', fontWeight: 800, color: 'var(--ez-hue-blue-text-deep)', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
              {domainCounts.SUMBER_DAYA_AIR.toLocaleString('id-ID')}
            </div>
            <div style={{ fontSize: '10.5px', color: 'var(--ez-color-text-warm)', fontWeight: 600 }}>SDA</div>
          </div>
          <div style={{ textAlign: 'center', background: 'var(--ez-pastel-cream)', borderRadius: 'var(--ez-radius-card)', padding: '10px 18px', boxShadow: '0 4px 20px rgba(0,0,0,0.045)' }}>
            <div style={{ fontSize: '19px', fontWeight: 800, color: 'var(--ez-hue-amber-text)', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
              {domainCounts.SMKK.toLocaleString('id-ID')}
            </div>
            <div style={{ fontSize: '10.5px', color: 'var(--ez-color-text-warm)', fontWeight: 600 }}>SMKK K3</div>
          </div>
          <button
            onClick={() => setShowAuditModal(true)}
            title="Lihat status integrasi dan audit database 2026"
            style={{
              padding: '6px 10px',
              borderRadius: 'var(--ez-radius-control)',
              background: 'var(--ez-color-surface)',
              border: '1px solid var(--ez-color-border-line)',
              color: 'var(--ez-hue-green-text)',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <ShieldCheck size={14} color="var(--ez-hue-green-text-bright)" />
            <span>Audit 2026</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          2. DOMAIN TABS: Semua Bidang -> Cipta Karya -> Bina Marga -> SDA -> SMKK K3
         ========================================================================= */}
      <div
        className="ezdb-anim"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          background: 'var(--ez-color-surface)',
          borderRadius: 'var(--ez-radius-card)',
          padding: '8px',
          border: '1px solid var(--ez-color-border)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
          animation: 'ezdb-rise 0.6s 0.07s both',
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
            borderRadius: 'var(--ez-radius-control)',
            fontSize: '13px',
            fontWeight: selectedDomain === 'ALL' ? 800 : 600,
            background: selectedDomain === 'ALL' ? 'var(--ez-pastel-sky)' : 'transparent',
            color: selectedDomain === 'ALL' ? 'var(--ez-color-primary-hover)' : 'var(--ez-color-text-muted)',
            border: selectedDomain === 'ALL' ? '1.5px solid var(--ez-color-border-strong)' : '1px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <Layers size={16} color={selectedDomain === 'ALL' ? 'var(--ez-color-primary)' : 'var(--ez-color-text-muted)'} />
          <span>Semua Bidang</span>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: 'var(--ez-radius-pill)',
              background: selectedDomain === 'ALL' ? 'var(--ez-hue-blue-bg-deep)' : 'var(--ez-hue-slate-bg)',
              color: selectedDomain === 'ALL' ? 'var(--ez-color-primary-hover)' : 'var(--ez-color-text-muted)',
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
            borderRadius: 'var(--ez-radius-control)',
            fontSize: '13px',
            fontWeight: selectedDomain === 'CIPTA_KARYA' ? 800 : 600,
            background: selectedDomain === 'CIPTA_KARYA' ? 'var(--ez-pastel-sky)' : 'transparent',
            color: selectedDomain === 'CIPTA_KARYA' ? 'var(--ez-color-primary-hover)' : 'var(--ez-color-text-muted)',
            border: selectedDomain === 'CIPTA_KARYA' ? '1.5px solid var(--ez-color-border-strong)' : '1px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <Building2 size={16} color={selectedDomain === 'CIPTA_KARYA' ? 'var(--ez-color-primary)' : 'var(--ez-color-text-muted)'} />
          <span>Cipta Karya (Gedung)</span>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: 'var(--ez-radius-pill)',
              background: selectedDomain === 'CIPTA_KARYA' ? 'var(--ez-hue-blue-bg-deep)' : 'var(--ez-hue-slate-bg)',
              color: selectedDomain === 'CIPTA_KARYA' ? 'var(--ez-color-primary-hover)' : 'var(--ez-color-text-muted)',
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
            borderRadius: 'var(--ez-radius-control)',
            fontSize: '13px',
            fontWeight: selectedDomain === 'BINA_MARGA' ? 800 : 600,
            background: selectedDomain === 'BINA_MARGA' ? 'var(--ez-pastel-sky)' : 'transparent',
            color: selectedDomain === 'BINA_MARGA' ? 'var(--ez-color-primary-hover)' : 'var(--ez-color-text-muted)',
            border: selectedDomain === 'BINA_MARGA' ? '1.5px solid var(--ez-color-border-strong)' : '1px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <Compass size={16} color={selectedDomain === 'BINA_MARGA' ? 'var(--ez-color-primary)' : 'var(--ez-color-text-muted)'} />
          <span>Bina Marga (Jalan)</span>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: 'var(--ez-radius-pill)',
              background: selectedDomain === 'BINA_MARGA' ? 'var(--ez-hue-blue-bg-deep)' : 'var(--ez-hue-slate-bg)',
              color: selectedDomain === 'BINA_MARGA' ? 'var(--ez-color-primary-hover)' : 'var(--ez-color-text-muted)',
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
            borderRadius: 'var(--ez-radius-control)',
            fontSize: '13px',
            fontWeight: selectedDomain === 'SUMBER_DAYA_AIR' ? 800 : 600,
            background: selectedDomain === 'SUMBER_DAYA_AIR' ? 'var(--ez-pastel-sky)' : 'transparent',
            color: selectedDomain === 'SUMBER_DAYA_AIR' ? 'var(--ez-color-primary-hover)' : 'var(--ez-color-text-muted)',
            border: selectedDomain === 'SUMBER_DAYA_AIR' ? '1.5px solid var(--ez-color-border-strong)' : '1px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <Waves size={16} color={selectedDomain === 'SUMBER_DAYA_AIR' ? 'var(--ez-color-primary)' : 'var(--ez-color-text-muted)'} />
          <span>Sumber Daya Air (SDA)</span>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: 'var(--ez-radius-pill)',
              background: selectedDomain === 'SUMBER_DAYA_AIR' ? 'var(--ez-hue-blue-bg-deep)' : 'var(--ez-hue-slate-bg)',
              color: selectedDomain === 'SUMBER_DAYA_AIR' ? 'var(--ez-color-primary-hover)' : 'var(--ez-color-text-muted)',
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
            borderRadius: 'var(--ez-radius-control)',
            fontSize: '13px',
            fontWeight: selectedDomain === 'SMKK' ? 800 : 600,
            background: selectedDomain === 'SMKK' ? 'var(--ez-pastel-sky)' : 'transparent',
            color: selectedDomain === 'SMKK' ? 'var(--ez-color-primary-hover)' : 'var(--ez-color-text-muted)',
            border: selectedDomain === 'SMKK' ? '1.5px solid var(--ez-color-border-strong)' : '1px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <HardHat size={16} color={selectedDomain === 'SMKK' ? 'var(--ez-color-primary)' : 'var(--ez-color-text-muted)'} />
          <span>SMKK K3</span>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: 'var(--ez-radius-pill)',
              background: selectedDomain === 'SMKK' ? 'var(--ez-hue-blue-bg-deep)' : 'var(--ez-hue-slate-bg)',
              color: selectedDomain === 'SMKK' ? 'var(--ez-color-primary-hover)' : 'var(--ez-color-text-muted)',
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
            borderRadius: 'var(--ez-radius-pill)',
            fontSize: '12px',
            fontWeight: selectedCategory === 'ALL' ? 700 : 500,
            background: selectedCategory === 'ALL' ? 'var(--ez-pastel-sky)' : 'var(--ez-color-surface)',
            color: selectedCategory === 'ALL' ? 'var(--ez-color-primary-hover)' : 'var(--ez-color-text-slate)',
            border: selectedCategory === 'ALL' ? '1px solid var(--ez-hue-blue-border)' : '1px solid var(--ez-color-border-line)',
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
              borderRadius: 'var(--ez-radius-pill)',
              background: selectedCategory === 'ALL' ? 'var(--ez-hue-blue-bg-deep)' : 'var(--ez-color-surface-tertiary)',
              color: selectedCategory === 'ALL' ? 'var(--ez-color-primary-hover)' : 'var(--ez-color-text-muted)',
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
              borderRadius: 'var(--ez-radius-pill)',
              fontSize: '12px',
              fontWeight: selectedCategory === cat.name ? 700 : 500,
              background: selectedCategory === cat.name ? 'var(--ez-pastel-sky)' : 'var(--ez-color-surface)',
              color: selectedCategory === cat.name ? 'var(--ez-color-primary-hover)' : 'var(--ez-color-text-slate)',
              border: selectedCategory === cat.name ? '1px solid var(--ez-hue-blue-border)' : '1px solid var(--ez-color-border-line)',
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
                borderRadius: 'var(--ez-radius-pill)',
                background: selectedCategory === cat.name ? 'var(--ez-hue-blue-bg-deep)' : 'var(--ez-color-surface-tertiary)',
                color: selectedCategory === cat.name ? 'var(--ez-color-primary-hover)' : 'var(--ez-color-text-muted)',
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
        className="ezdb-anim"
        style={{
          background: 'var(--ez-color-surface)',
          borderRadius: 'var(--ez-radius-card)',
          border: '1px solid var(--ez-color-border)',
          padding: '16px 20px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
          animation: 'ezdb-rise 0.6s 0.14s both',
        }}
      >
        {/* Search Input */}
        <div style={{ position: 'relative', flex: '1 1 320px' }}>
          <Search size={18} color="var(--ez-color-text-muted)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
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
              borderRadius: 'var(--ez-radius-control)',
              border: '1.5px solid var(--ez-color-border-line)',
              fontSize: '13.5px',
              color: 'var(--ez-color-text-primary)',
              outline: 'none',
              background: 'var(--ez-color-surface)',
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
              borderRadius: 'var(--ez-radius-control)',
              border: '1px solid var(--ez-color-border-line)',
              fontSize: '12.5px',
              background: 'var(--ez-color-surface)',
              color: 'var(--ez-color-text-body)',
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
              borderRadius: 'var(--ez-radius-control)',
              border: '1px solid var(--ez-color-border-line)',
              fontSize: '12.5px',
              background: 'var(--ez-color-surface)',
              color: 'var(--ez-color-text-body)',
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
              borderRadius: 'var(--ez-radius-control)',
              border: '1px solid var(--ez-color-border-line)',
              fontSize: '12.5px',
              background: 'var(--ez-color-surface)',
              color: 'var(--ez-color-text-body)',
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
            <ArrowUpDown size={15} color="var(--ez-color-text-muted)" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{
                height: '42px',
                padding: '0 12px',
                borderRadius: 'var(--ez-radius-control)',
                border: '1px solid var(--ez-color-border-line)',
                fontSize: '12.5px',
                background: 'var(--ez-color-surface)',
                color: 'var(--ez-color-text-body)',
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
          color: 'var(--ez-color-text-muted)',
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
              borderRadius: 'var(--ez-radius-control)',
              border: '1px solid var(--ez-color-border-line)',
              fontSize: '12px',
              fontWeight: 600,
              background: 'var(--ez-color-surface)',
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
            background: 'var(--ez-color-surface)',
            borderRadius: 'var(--ez-radius-card)',
            border: '1px solid var(--ez-color-border)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
            padding: '60px 20px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
          }}
        >
          <Database size={40} color="var(--ez-color-text-muted)" />
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>
            Tidak ada item AHSP yang cocok dengan pencarian
          </h3>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--ez-color-text-muted)', maxWidth: '400px' }}>
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
              background: 'var(--ez-color-primary)',
              color: 'var(--ez-color-on-primary)',
              borderRadius: 'var(--ez-radius-control)',
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
          className="ezdb-anim"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
            gap: '18px',
            animation: 'ezdb-rise 0.6s 0.21s both',
          }}
        >
          {paginatedItems.map((item) => {
            const composition = priceResolver2026.resolveAhspUnitPrice(item);
            const laborTotal = composition.labor.subtotalPerUnit || (item.totalLabor ?? 0);
            const materialTotal = composition.material.subtotalPerUnit || (item.totalMaterial ?? 0);
            const equipTotal = composition.equipment.subtotalPerUnit || (item.totalEquipment ?? 0);
            // Harga tampil = Biaya Langsung (D); E dinonaktifkan.
            const hspPrice = getAhspDirectPrice(composition) ?? item.unitPrice;
            const pricingStatus = (hspPrice && hspPrice > 0 && item.domain === 'SMKK') ? 'FULL' : composition.pricingStatus;

            const domainColor = DOMAIN_COLOR_MAP[item.domain] || { bg: 'var(--ez-color-surface-tertiary)', text: '#475569', border: 'var(--ez-color-border)' };

            return (
              <div
                key={item.id}
                style={{
                  background: 'var(--ez-color-surface)',
                  borderRadius: 'var(--ez-radius-card)',
                  border: '1px solid var(--ez-color-border)',
                  padding: '24px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
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
                        color: 'var(--ez-hue-blue-text-deep)',
                        background: 'var(--ez-pastel-sky)',
                        border: '1px solid var(--ez-color-border-strong)',
                        padding: '4px 10px',
                        borderRadius: 'var(--ez-radius-pill)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <span>{item.code}</span>
                      {copiedCode === item.code ? <Check size={12} color="var(--ez-hue-green-text-bright)" /> : <Copy size={12} color="var(--ez-color-text-muted)" />}
                    </button>

                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: domainColor.text,
                        background: domainColor.bg,
                        padding: '3px 10px',
                        borderRadius: 'var(--ez-radius-pill)',
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
                      color: 'var(--ez-color-text-primary)',
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
                  <div style={{ height: '1px', background: 'var(--ez-color-surface-tertiary)', margin: '12px 0 10px' }} />

                  {/* Metadata Row: Satuan & Status */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', marginBottom: '10px' }}>
                    <span style={{ color: 'var(--ez-color-text-muted)' }}>
                      Satuan: <strong style={{ color: 'var(--ez-color-text-primary)', fontWeight: 700 }}>{item.unit || '—'}</strong>
                    </span>

                    {pricingStatus === 'FULL' && (
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--ez-radius-pill)', background: 'var(--ez-pastel-mint)', color: 'var(--ez-hue-green-text)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        ✓ Harga lengkap
                      </span>
                    )}
                    {pricingStatus === 'PARTIAL' && (
                      <span title={`Harga sebagian (${composition.resolvedComponents}/${composition.totalComponents} komponen terisi)`} style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--ez-radius-pill)', background: 'var(--ez-pastel-cream)', color: 'var(--ez-hue-amber-text)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        ◐ Harga parsial*
                      </span>
                    )}
                    {pricingStatus === 'MISSING' && (
                      <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--ez-radius-pill)', background: 'var(--ez-hue-slate-bg)', color: 'var(--ez-color-text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        — Harga belum tersedia
                      </span>
                    )}
                  </div>

                  {/* Cost Breakdown Mini Bar */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      background: 'var(--ez-hue-slate-bg)',
                      border: '1px solid var(--ez-color-border-soft)',
                      borderRadius: 'var(--ez-radius-control)',
                      padding: '8px 10px',
                      fontSize: '11px',
                      color: 'var(--ez-color-text-muted)',
                    }}
                  >
                    <span>Tenaga Kerja: <strong style={{ color: laborTotal > 0 ? 'var(--ez-color-text)' : '#94A3B8' }}>{laborTotal > 0 ? formatCurrencyIDR(laborTotal) : (composition.labor.components.length > 0 ? '—' : '0')}</strong></span>
                    <span>Material: <strong style={{ color: materialTotal > 0 ? 'var(--ez-color-text)' : '#94A3B8' }}>{materialTotal > 0 ? formatCurrencyIDR(materialTotal) : (composition.material.components.length > 0 ? '—' : '0')}</strong></span>
                    <span>Peralatan: <strong style={{ color: equipTotal > 0 ? 'var(--ez-color-text)' : '#94A3B8' }}>{equipTotal > 0 ? formatCurrencyIDR(equipTotal) : (composition.equipment.components.length > 0 ? '—' : '0')}</strong></span>
                  </div>
                </div>

                {/* Bottom Section: Total Unit Price & Action Buttons */}
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      borderTop: '1px solid var(--ez-color-surface-tertiary)',
                      paddingTop: '12px',
                      marginBottom: '14px',
                    }}
                  >
                    <span style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', fontWeight: 600 }}>Harga Satuan (HSP):</span>
                    {hspPrice !== null && hspPrice > 0 ? (
                      <div style={{ fontSize: '17px', fontWeight: 800, color: pricingStatus === 'FULL' ? 'var(--ez-hue-green-text)' : 'var(--ez-hue-amber-text-deep)' }}>
                        {formatCurrencyIDR(hspPrice)}{pricingStatus === 'PARTIAL' ? '*' : ''} <span style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', fontWeight: 600 }}>/ {item.unit}</span>
                      </div>
                    ) : (
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ez-color-text-muted)', fontStyle: 'italic' }}>
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
                        borderRadius: 'var(--ez-radius-control)',
                        background: 'var(--ez-color-surface)',
                        color: 'var(--ez-color-text-body)',
                        border: '1px solid var(--ez-color-border-line)',
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
                      <Eye size={14} color="var(--ez-color-text-muted)" />
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
                        borderRadius: 'var(--ez-radius-control)',
                        background: 'var(--ez-color-primary)',
                        color: 'var(--ez-color-on-primary)',
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
              borderRadius: 'var(--ez-radius-control)',
              border: '1px solid var(--ez-color-border-line)',
              background: 'var(--ez-color-surface)',
              color: safeCurrentPage === 1 ? '#94A3B8' : 'var(--ez-color-text)',
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
              borderRadius: 'var(--ez-radius-control)',
              border: '1px solid var(--ez-color-border-line)',
              background: 'var(--ez-color-surface)',
              color: safeCurrentPage === 1 ? '#94A3B8' : 'var(--ez-color-text)',
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
              color: 'var(--ez-color-text-primary)',
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
                borderRadius: '8px',
                border: '1.5px solid var(--ez-color-primary)',
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
              borderRadius: 'var(--ez-radius-control)',
              border: '1px solid var(--ez-color-border-line)',
              background: 'var(--ez-color-surface)',
              color: safeCurrentPage === totalPages ? '#94A3B8' : 'var(--ez-color-text)',
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
              borderRadius: 'var(--ez-radius-control)',
              border: '1px solid var(--ez-color-border-line)',
              background: 'var(--ez-color-surface)',
              color: safeCurrentPage === totalPages ? '#94A3B8' : 'var(--ez-color-text)',
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
              background: 'var(--ez-color-surface)',
              borderRadius: 'var(--ez-radius-card)',
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
                borderBottom: '1px solid var(--ez-color-border-soft)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                background: 'var(--ez-hue-slate-bg)',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ez-hue-blue-text-deep)', background: 'var(--ez-pastel-sky)', border: '1px solid var(--ez-color-border-strong)', padding: '3px 10px', borderRadius: 'var(--ez-radius-pill)' }}>
                    {selectedAhsp.code}
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ez-color-text-muted)', background: 'var(--ez-hue-slate-bg)', border: '1px solid var(--ez-color-border-soft)', padding: '3px 10px', borderRadius: 'var(--ez-radius-pill)' }}>
                    {domainShortLabel(selectedAhsp.domain)}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)' }}>
                    {selectedAhsp.sourceDocument || 'Sumber tidak tercatat'}
                  </span>
                </div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)', lineHeight: 1.4 }}>
                  {selectedAhsp.name}
                </h3>
                <div style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', marginTop: '4px' }}>
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
                  color: 'var(--ez-color-text-muted)',
                  padding: '4px',
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body: Rincian Koefisien Table */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {selectedAhspAugmented?.hasMarketPrices ? (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '10px 14px', borderRadius: 'var(--ez-radius-card)', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Info size={15} style={{ flexShrink: 0 }} />
                  <span><strong>Harga Pasar:</strong> {selectedAhspAugmented.marketPricedCount} komponen memakai referensi pasar terverifikasi (bertanda <strong>Pasar *</strong>). Bukan harga resmi AHSP.</span>
                </div>
              ) : null}
              {selectedAhspAugmented?.pricingStatus === 'PARTIAL' && (
                <div style={{ background: 'var(--ez-pastel-cream)', border: '1px solid #FDF3D8', color: 'var(--ez-hue-amber-text)', padding: '10px 14px', borderRadius: 'var(--ez-radius-card)', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                  <span><strong>Harga Parsial:</strong> Beberapa komponen sumber daya belum memiliki data harga di database 2026. Subtotal di bawah mencerminkan komponen yang telah terpetakan ({selectedAhspAugmented.resolvedComponents} dari {selectedAhspAugmented.totalComponents} item).</span>
                </div>
              )}
              {selectedAhspAugmented?.pricingStatus === 'MISSING' && (
                <div style={{ background: 'var(--ez-hue-slate-bg)', border: '1px solid var(--ez-color-border-soft)', color: 'var(--ez-color-text-slate)', padding: '10px 14px', borderRadius: 'var(--ez-radius-card)', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Info size={15} style={{ flexShrink: 0 }} />
                  <span><strong>Harga Belum Tersedia:</strong> Belum ada data harga satuan untuk komponen pada analisa ini di database standar 2026. Anda dapat menyesuaikan harga secara manual setelah menambahkan ke proyek.</span>
                </div>
              )}

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: 'var(--ez-hue-slate-bg)', borderBottom: '1.5px solid var(--ez-color-border-line)', color: 'var(--ez-color-text-slate)', fontWeight: 700 }}>
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
                  {(selectedAhspAugmented?.labor.components.length ?? 0) > 0 && (
                    <>
                      <tr style={{ background: 'var(--ez-pastel-sky)', fontWeight: 800, color: 'var(--ez-hue-blue-text-deep)' }}>
                        <td colSpan={6} style={{ padding: '6px 10px', fontSize: '11.5px' }}>
                          A. TENAGA KERJA (UPAH)
                        </td>
                      </tr>
                      {selectedAhspAugmented!.labor.components.map((r, i) =>
                        renderCompRow(r, { label: 'TENAGA', bg: 'var(--ez-pastel-sky)', fg: 'var(--ez-hue-blue-text-deep)' }, i)
                      )}
                    </>
                  )}

                  {/* 2. Material Components */}
                  {(selectedAhspAugmented?.material.components.length ?? 0) > 0 && (
                    <>
                      <tr style={{ background: 'var(--ez-pastel-cream)', fontWeight: 800, color: 'var(--ez-hue-amber-text)' }}>
                        <td colSpan={6} style={{ padding: '6px 10px', fontSize: '11.5px' }}>
                          B. BAHAN / MATERIAL
                        </td>
                      </tr>
                      {selectedAhspAugmented!.material.components.map((r, i) =>
                        renderCompRow(r, { label: 'BAHAN', bg: 'var(--ez-pastel-cream)', fg: 'var(--ez-hue-amber-text)' }, i)
                      )}
                    </>
                  )}

                  {/* 3. Equipment Components */}
                  {(selectedAhspAugmented?.equipment.components.length ?? 0) > 0 && (
                    <>
                      <tr style={{ background: 'var(--ez-hue-purple-bg-soft)', fontWeight: 800, color: 'var(--ez-hue-purple-text)' }}>
                        <td colSpan={6} style={{ padding: '6px 10px', fontSize: '11.5px' }}>
                          C. PERALATAN
                        </td>
                      </tr>
                      {selectedAhspAugmented!.equipment.components.map((r, i) =>
                        renderCompRow(r, { label: 'ALAT', bg: 'var(--ez-hue-purple-bg-deep)', fg: 'var(--ez-hue-violet-text)' }, i)
                      )}
                    </>
                  )}

                  {/* Subtotals & Grand Total */}
                  {/* Biaya Langsung (D = A + B + C). Biaya Umum & Keuntungan (E)
                      DINONAKTIFKAN sementara: tidak dihitung, tidak ditampilkan,
                      tidak ditambahkan ke total (keputusan tampilan EZRAB). */}
                  <tr style={{ fontWeight: 700, background: 'var(--ez-hue-slate-bg)', borderTop: '2px solid var(--ez-color-border-line)' }}>
                    <td colSpan={5} style={{ padding: '10px', textAlign: 'right', fontSize: '12.5px', color: 'var(--ez-color-text-slate)' }}>
                      Jumlah Biaya Langsung (D = A + B + C)
                      {selectedAhspAugmented && selectedAhspAugmented.pricingStatus === 'PARTIAL' ? ' (parsial)' : ''}:
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', color: 'var(--ez-color-text-primary)', fontSize: '13.5px', fontWeight: 800 }}>
                      {selectedAhspAugmented && selectedAhspAugmented.unitPrice !== null && selectedAhspAugmented.unitPrice > 0
                        ? formatCurrencyIDR(selectedAhspAugmented.unitPrice)
                        : '—'}
                    </td>
                  </tr>

                  {(() => {
                    const note = ahspCompletenessNote(selectedAhspAugmented);
                    return note ? (
                      <tr style={{ background: 'var(--ez-pastel-amber)', borderTop: '1px solid var(--ez-hue-amber-border)' }}>
                        <td colSpan={6} style={{ padding: '10px 12px', fontSize: '12.5px', color: 'var(--ez-hue-amber-text-deep)', fontWeight: 700 }}>
                          {note}
                        </td>
                      </tr>
                    ) : null;
                  })()}

                  <tr style={{ fontWeight: 800, background: 'var(--ez-pastel-sky)', borderTop: '1.5px solid var(--ez-hue-blue-bg-deep)' }}>
                    <td colSpan={5} style={{ padding: '12px 10px', textAlign: 'right', fontSize: '13.5px', color: 'var(--ez-hue-blue-text-deep)' }}>
                      Harga Satuan Pekerjaan (D = Biaya Langsung):
                    </td>
                    <td style={{ padding: '12px 10px', textAlign: 'right', color: (selectedAhspAugmented?.pricingStatus === 'FULL' || selectedAhsp?.domain === 'SMKK') ? 'var(--ez-hue-green-text)' : selectedAhspAugmented?.pricingStatus === 'PARTIAL' ? 'var(--ez-hue-amber-text-deep)' : 'var(--ez-color-text-muted)', fontSize: '16px', fontWeight: 900 }}>
                      {(() => {
                        const comp = selectedAhspAugmented;
                        // Total = Biaya Langsung (D). Untuk item tanpa komponen tapi
                        // ber-DHSP resmi, pakai harga resmi sebagai referensi.
                        const dPrice = getAhspDirectPrice(comp);
                        const isFull = comp?.pricingStatus === 'FULL' || selectedAhsp?.domain === 'SMKK';
                        return isFull && dPrice !== null && dPrice > 0
                          ? formatCurrencyIDR(dPrice)
                          : 'Harga belum tersedia';
                      })()}
                    </td>
                  </tr>

                  {selectedAhspAugmented?.officialDhspPrice && selectedAhspAugmented.officialDhspPrice !== getAhspDirectPrice(selectedAhspAugmented) ? (
                    <tr style={{ fontWeight: 800, background: 'var(--ez-pastel-mint)', borderTop: '1px solid var(--ez-hue-green-border)' }}>
                      <td colSpan={5} style={{ padding: '10px', textAlign: 'right', fontSize: '13px', color: 'var(--ez-hue-green-text)' }}>
                        Daftar Harga Satuan Pekerjaan Resmi (DHSP):
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', color: 'var(--ez-hue-green-text)', fontSize: '15px', fontWeight: 900 }}>
                        {formatCurrencyIDR(selectedAhspAugmented.officialDhspPrice)}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>

              {/* Provenance Box (Phase 18) */}
              <div
                style={{
                  fontSize: '12px',
                  color: 'var(--ez-color-text-body)',
                  background: 'var(--ez-hue-slate-bg)',
                  padding: '14px 16px',
                  borderRadius: 'var(--ez-radius-card)',
                  border: '1px solid var(--ez-color-border-soft)',
                  lineHeight: 1.6,
                }}
              >
                <div style={{ fontWeight: 800, color: 'var(--ez-color-text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileText size={15} color="var(--ez-hue-blue-text)" />
                  <span>Informasi Sumber Resmi (Data Lineage & Provenansi)</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
                  <div><strong>Pedoman:</strong> SE DJBK No. 47/SE/Dk/2026 ({selectedAhsp.domain === 'CIPTA_KARYA' ? 'Lampiran VI' : selectedAhsp.domain === 'SUMBER_DAYA_AIR' ? 'Lampiran IV' : selectedAhsp.domain === 'BINA_MARGA' ? 'Lampiran V' : 'Lampiran III'})</div>
                  <div><strong>Workbook:</strong> {selectedAhsp.domain === 'BINA_MARGA' ? 'AHSP 2026 Bina Marga.xlsx' : 'ahsp bina kontruksi 2026.xlsx'}</div>
                  <div><strong>Lokasi / Sheet:</strong> {selectedAhspAugmented?.provenanceSource || (selectedAhsp as any).source?.sheet || 'Analisis Resmi'}</div>
                  <div><strong>Price Master:</strong> {selectedAhsp.domain === 'BINA_MARGA' ? 'Upah Bahan & DHSP Bina Marga 2026' : 'Upah Bahan & DHSP Cipta Karya 2026'}</div>
                  <div><strong>Status:</strong> <span style={{ color: 'var(--ez-hue-green-text-bright)', fontWeight: 700 }}>VERIFIED</span></div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid var(--ez-color-border-soft)',
                background: 'var(--ez-hue-slate-bg)',
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
                  borderRadius: 'var(--ez-radius-control)',
                  background: 'var(--ez-color-surface)',
                  border: '1px solid var(--ez-color-border-line)',
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
                    borderRadius: 'var(--ez-radius-control)',
                    background: 'var(--ez-color-surface)',
                    border: '1px solid var(--ez-color-border-line)',
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
                      borderRadius: 'var(--ez-radius-control)',
                      background: 'var(--ez-color-surface-tertiary)',
                      color: 'var(--ez-color-text-strong)',
                      border: '1px solid var(--ez-color-border-line)',
                      fontSize: '12.5px',
                      fontWeight: 650,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                    title="Simpan analisa ini ke data AHSP Proyek"
                  >
                    <Database size={15} color="var(--ez-hue-blue-text)" />
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
                    borderRadius: 'var(--ez-radius-control)',
                    background: 'var(--ez-color-primary)',
                    color: 'var(--ez-color-on-primary)',
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
      {marketPanelFor && (
        <MarketReferencePanel
          componentCode={marketPanelFor.code}
          componentName={marketPanelFor.name}
          componentUnit={marketPanelFor.unit}
          onClose={() => setMarketPanelFor(null)}
          onChanged={() => {
            // Panel mengubah store; overlay dihitung ulang via useMemo pada
            // render berikutnya (selectedAhspComposition tidak berubah, tapi
            // applyMarketOverlay membaca store terbaru → paksa via tick).
            setMarketTick((t) => t + 1);
          }}
        />
      )}
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
              background: 'var(--ez-color-surface)',
              borderRadius: 'var(--ez-radius-card)',
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
                <div style={{ width: '34px', height: '34px', borderRadius: 'var(--ez-radius-control)', background: 'var(--ez-pastel-sky)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ez-color-primary)' }}>
                  <FileSpreadsheet size={18} />
                </div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)' }}>
                  Tambahkan ke RAB Proyek
                </h3>
              </div>
              <button
                onClick={() => setAddToRabModalItem(null)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--ez-color-text-muted)' }}
              >
                ✕
              </button>
            </div>

            {/* Selected item card summary */}
            <div style={{ background: 'var(--ez-hue-slate-bg)', border: '1px solid var(--ez-color-border-soft)', borderRadius: 'var(--ez-radius-card)', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ez-hue-blue-text-deep)', background: 'var(--ez-pastel-sky)', padding: '2px 8px', borderRadius: 'var(--ez-radius-pill)' }}>
                  {addToRabModalItem.code}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', fontWeight: 600 }}>
                  {addToRabModalItem.category}
                </span>
              </div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ez-color-text-primary)', lineHeight: 1.4 }}>
                {addToRabModalItem.name}
              </div>
              {(() => {
                // Harga kerja = Biaya Langsung (D). AHSP parsial tidak bisa lanjut.
                const comp = addToRabAugmented;
                const rabD = getAhspDirectPrice(comp);
                const gate = canFinalizeAhsp(comp);
                return (
                  <>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ez-hue-green-text-bright)', marginTop: '6px' }}>
                      {gate.ok && rabD !== null && rabD > 0
                        ? `${formatCurrencyIDR(rabD)} / ${addToRabModalItem.unit}`
                        : 'Harga belum tersedia'}
                    </div>
                    {!gate.ok ? (
                      <div style={{ marginTop: '8px', fontSize: '12px', fontWeight: 700, color: 'var(--ez-hue-amber-text-deep)', background: 'var(--ez-pastel-amber)', border: '1px solid var(--ez-hue-amber-border)', borderRadius: '8px', padding: '8px 10px' }}>
                        {gate.reason} Tidak dapat ditambahkan sebagai harga final.
                      </div>
                    ) : null}
                  </>
                );
              })()}
            </div>

            {/* Volume Input */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ez-color-text-body)' }}>
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
                  borderRadius: 'var(--ez-radius-control)',
                  border: '1.5px solid var(--ez-color-border-line)',
                  fontSize: '15px',
                  fontWeight: 700,
                  color: 'var(--ez-color-text-primary)',
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
                background: 'var(--ez-pastel-mint)',
                border: '1px solid var(--ez-hue-green-border)',
                borderRadius: 'var(--ez-radius-card)',
              }}
            >
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--ez-hue-green-text)' }}>Total Estimasi Biaya:</span>
              <span style={{ fontSize: '16px', fontWeight: 900, color: 'var(--ez-hue-green-text)' }}>
                {(() => {
                  const comp = addToRabAugmented;
                  const rabD = getAhspDirectPrice(comp);
                  return canFinalizeAhsp(comp).ok && rabD !== null && rabD > 0
                    ? formatCurrencyIDR(rabD * (inputVolume || 0))
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
                  borderRadius: 'var(--ez-radius-control)',
                  background: 'var(--ez-color-surface)',
                  border: '1px solid var(--ez-color-border-line)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Batal
              </button>
              <button
                onClick={handleConfirmAddToRab}
                disabled={inputVolume <= 0 || !canFinalizeAhsp(addToRabAugmented).ok}
                style={{
                  flex: 2,
                  height: '40px',
                  borderRadius: 'var(--ez-radius-control)',
                  background: inputVolume > 0 && canFinalizeAhsp(addToRabAugmented).ok ? 'var(--ez-color-primary)' : '#94A3B8',
                  color: 'var(--ez-color-on-primary)',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: inputVolume > 0 && canFinalizeAhsp(addToRabAugmented).ok ? 'pointer' : 'not-allowed',
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
              background: 'var(--ez-color-surface)',
              borderRadius: 'var(--ez-radius-card)',
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
                <div style={{ width: '40px', height: '40px', borderRadius: 'var(--ez-radius-control)', background: 'var(--ez-pastel-mint)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ez-hue-green-text)' }}>
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--ez-color-text-primary)' }}>
                    Audit & Provenansi Database 2026
                  </h3>
                  <div style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)' }}>SE DJBK No. 47/SE/Dk/2026 — Kementerian PUPR</div>
                </div>
              </div>
              <button
                onClick={() => setShowAuditModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--ez-color-text-muted)' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', fontSize: '12.5px' }}>
              <div style={{ background: 'var(--ez-pastel-cream)', padding: '12px 14px', borderRadius: 'var(--ez-radius-card)', boxShadow: '0 4px 20px rgba(0,0,0,0.045)' }}>
                <div style={{ color: 'var(--ez-color-text-warm)', fontWeight: 600 }}>File Sumber Resmi</div>
                <div style={{ fontWeight: 800, color: 'var(--ez-color-text-primary)', marginTop: '2px' }}>ahsp bina kontruksi 2026.xlsx</div>
                <div style={{ fontSize: '10.5px', color: 'var(--ez-color-text-muted)', fontFamily: 'monospace', marginTop: '4px', wordBreak: 'break-all' }}>
                  SHA256: ee35ca4369f802e8ccced7884ceca76b7d1c5c774b5a2fccb784c48a34d1eb5a
                </div>
              </div>

              <div style={{ background: 'var(--ez-pastel-mint)', padding: '12px 14px', borderRadius: 'var(--ez-radius-card)', boxShadow: '0 4px 20px rgba(0,0,0,0.045)' }}>
                <div style={{ color: 'var(--ez-color-text-warm)', fontWeight: 600 }}>Total Canonical AHSP</div>
                <div style={{ fontWeight: 800, color: 'var(--ez-hue-green-text-bright)', fontSize: '16px', marginTop: '2px' }}>5.801 Item</div>
                <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', marginTop: '2px' }}>
                  CK: 2.859 | SDA: 1.556 | BM: 1.163 | SMKK: 223
                </div>
              </div>

              <div style={{ background: 'var(--ez-pastel-sky)', padding: '12px 14px', borderRadius: 'var(--ez-radius-card)', boxShadow: '0 4px 20px rgba(0,0,0,0.045)' }}>
                <div style={{ color: 'var(--ez-color-text-muted)', fontWeight: 600 }}>DHSP Resmi Dievaluasi</div>
                <div style={{ fontWeight: 800, color: 'var(--ez-color-primary)', fontSize: '16px', marginTop: '2px' }}>3.148 Baris</div>
                <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', marginTop: '2px' }}>2.778 Leaf Items dengan Rumus VLOOKUP</div>
              </div>

              <div style={{ background: 'var(--ez-pastel-peach)', padding: '12px 14px', borderRadius: 'var(--ez-radius-card)', boxShadow: '0 4px 20px rgba(0,0,0,0.045)' }}>
                <div style={{ color: 'var(--ez-color-text-warm)', fontWeight: 600 }}>Price Database Master</div>
                <div style={{ fontWeight: 800, color: 'var(--ez-color-text-primary)', fontSize: '16px', marginTop: '2px' }}>3.324 Resource</div>
                <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', marginTop: '2px' }}>3.075 Bahan, 45 Upah, 204 Peralatan</div>
              </div>
            </div>

            <div style={{ background: 'var(--ez-pastel-sky)', border: '1px solid var(--ez-color-border-strong)', borderRadius: 'var(--ez-radius-card)', padding: '14px 16px', fontSize: '12.5px', color: 'var(--ez-hue-blue-text-deep)', lineHeight: 1.6 }}>
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
                borderRadius: 'var(--ez-radius-control)',
                background: 'var(--ez-color-primary)',
                color: 'var(--ez-color-on-primary)',
                border: 'none',
                fontWeight: 700,
                fontSize: '14px',
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
