import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Search,
  Sparkles,
  Database,
  Building2,
  History,
  Globe,
  Check,
  Plus,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  HelpCircle,
  TrendingUp,
  Tag,
  Loader2,
  FileCheck2,
  HardHat,
  Truck,
  Package,
} from 'lucide-react';
import {
  PriceCandidate,
  PriceSearchInput,
  PriceSearchResult,
  PriceDefinition,
} from '../../engine/pricing/contracts/types';
import { PriceResolver } from '../../engine/pricing/resolver/priceResolver';
import { PriceRepository } from '../../engine/pricing/repository/priceRepository';
import { projectPriceEngine } from '../../engine/pricing/projectPriceEngine';
import { laborDatabaseService } from '../../domain/labor/laborDatabaseService';
import { MaterialDatabaseService } from '../../domain/material/materialDatabaseService';
import { equipmentDatabaseService } from '../../domain/equipment/equipmentDatabaseService';
import { aiPriceSearchService } from '../../services/aiPriceSearchService';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';

export interface PriceResolutionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  itemName: string;
  itemSpecification?: string;
  itemBrand?: string;
  itemUnit: string;
  quantity?: number;
  projectId?: string;
  projectName?: string;
  region?: string;
  onConfirmPrice: (price: number, candidate: PriceCandidate, saveToDatabase?: boolean) => void;
}

export const PriceResolutionDrawer: React.FC<PriceResolutionDrawerProps> = ({
  isOpen,
  onClose,
  itemName,
  itemSpecification,
  itemBrand,
  itemUnit,
  quantity,
  projectId,
  projectName,
  region = 'Jabodetabek',
  onConfirmPrice,
}) => {
  const [activeTab, setActiveTab] = useState<'DATABASE' | 'WEB_SEARCH' | 'MANUAL'>('DATABASE');
  const [selectedCandidate, setSelectedCandidate] = useState<PriceCandidate | null>(null);

  // Search keyword inside Drawer
  const [searchFilterQuery, setSearchFilterQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'MATERIAL' | 'LABOR' | 'EQUIPMENT' | 'AHSP'>('ALL');

  // Database search state
  const [dbCandidates, setDbCandidates] = useState<PriceCandidate[]>([]);
  const [dbStatus, setDbStatus] = useState<string>('Memeriksa database...');

  // Web search state
  const [webResult, setWebResult] = useState<PriceSearchResult | null>(null);
  const [isSearchingWeb, setIsSearchingWeb] = useState(false);
  const [webSearchError, setWebSearchError] = useState<string | null>(null);

  // Manual input state
  const [manualPrice, setManualPrice] = useState<number>(0);
  const [manualVendor, setManualVendor] = useState('');
  const [manualNotes, setManualNotes] = useState('');

  // Save to DB checkbox
  const [alsoSaveToDb, setAlsoSaveToDb] = useState(true);

  // Search runner across all sources
  const performSearch = (searchTerm: string) => {
    const resolver = new PriceResolver();
    const result = resolver.resolve({
      name: searchTerm,
      specification: itemSpecification,
      brand: itemBrand,
      unit: itemUnit,
      projectId,
      location: region,
    });

    const candidatesList: PriceCandidate[] = [];

    // 1. Existing resolver candidates
    if (result.priceCandidates && result.priceCandidates.length > 0) {
      candidatesList.push(...result.priceCandidates);
    }

    // 2. Search Materials from MaterialDatabaseService
    const matDb = MaterialDatabaseService.getInstance();
    const matchedMaterials = matDb.searchMaterials(searchTerm).slice(0, 12);
    for (const mat of matchedMaterials) {
      const prices = matDb.getPricesByMaterialId(mat.id);
      const activePrice = prices[0];
      if (activePrice && activePrice.price > 0) {
        if (!candidatesList.some((c) => c.id === activePrice.id || c.sourceName === mat.name)) {
          candidatesList.push({
            id: activePrice.id,
            price: activePrice.price,
            unit: mat.unit || itemUnit,
            source: 'EZRAB_DATABASE',
            sourceName: `${mat.name} (${mat.specification || mat.category})`,
            observedDate: activePrice.priceDate || '2026-01-15',
            region: activePrice.region.city || activePrice.region.province || region,
            specification: mat.specification,
            brand: mat.brand,
            confidence: activePrice.confidence === 'HIGH' ? 0.95 : 0.85,
            matchType: 'SIMILAR',
            notes: `Material: ${mat.category} / ${mat.subcategory || 'Umum'} — ${activePrice.supplierName || 'Database Nasional'}`,
          });
        }
      }
    }

    // 3. Search Labor from LaborDatabaseService (49 categories)
    const matchedLabor = laborDatabaseService.searchLabor(searchTerm);
    for (const lab of matchedLabor.slice(0, 8)) {
      if (!candidatesList.some((c) => c.id === lab.id || c.sourceName === lab.name)) {
        candidatesList.push({
          id: lab.id,
          price: lab.basePriceOH,
          unit: lab.unit,
          source: 'REGIONAL',
          sourceName: `${lab.name} [Upah Standar 2026]`,
          observedDate: lab.effectiveDate,
          region: 'Nasional / DKI Jakarta',
          specification: `${lab.skillLevel} — ${lab.category}`,
          confidence: 0.96,
          matchType: 'SIMILAR',
          notes: `Tenaga Kerja: ${lab.category} / ${lab.subcategory} (${lab.regulationSource})`,
        });
      }
    }

    // 4. Search Equipment from EquipmentDatabaseService
    const matchedEquip = equipmentDatabaseService.searchEquipment(searchTerm);
    for (const eq of matchedEquip.slice(0, 6)) {
      if (!candidatesList.some((c) => c.id === eq.id || c.sourceName === eq.name)) {
        candidatesList.push({
          id: eq.id,
          price: eq.unit === 'jam' ? eq.rentalPricePerHour : eq.rentalPricePerDay,
          unit: eq.unit,
          source: 'REGIONAL',
          sourceName: `${eq.name} [Sewa Alat]`,
          observedDate: eq.provenance.effectiveDate,
          region: 'Nasional',
          specification: `${eq.capacity} — ${eq.specification}`,
          confidence: 0.94,
          matchType: 'SIMILAR',
          notes: `Peralatan: ${eq.category} (${eq.provenance.sourceName})`,
        });
      }
    }

    setDbCandidates(candidatesList);

    if (candidatesList.length > 0) {
      setSelectedCandidate((prev) => (prev && candidatesList.some((c) => c.id === prev.id) ? prev : candidatesList[0]));
      setDbStatus(`Ditemukan ${candidatesList.length} referensi di database Material, Upah, dan Peralatan.`);
    } else {
      setDbStatus('Tidak ada data harga yang cocok di database lokal.');
    }
  };

  // Resolve on open
  useEffect(() => {
    if (!isOpen) return;

    setSelectedCandidate(null);
    setWebResult(null);
    setWebSearchError(null);
    setManualPrice(0);
    setManualVendor('');
    setManualNotes('');
    setSearchFilterQuery(itemName);
    setCategoryFilter('ALL');

    performSearch(itemName);
  }, [isOpen, itemName, itemSpecification, itemBrand, itemUnit, projectId, region]);

  const handleRunWebSearch = async () => {
    setIsSearchingWeb(true);
    setWebSearchError(null);

    const input: PriceSearchInput = {
      material: searchFilterQuery || itemName,
      specification: itemSpecification,
      brand: itemBrand,
      unit: itemUnit,
      region,
      year: 2026,
    };

    const res = await aiPriceSearchService.searchPrice(input);
    setIsSearchingWeb(false);
    setWebResult(res);

    if (res.status === 'FOUND' && res.candidates.length > 0) {
      const best = res.candidates.find((c) => c.price === res.priceRange?.median) || res.candidates[0];
      setSelectedCandidate(best);
    } else if (res.status === 'NO_RESULT' || res.status === 'SEARCH_FAILED') {
      setWebSearchError(res.error || 'Tidak ditemukan referensi harga yang dapat diverifikasi.');
    }
  };

  const handleConfirmSelected = () => {
    if (activeTab === 'MANUAL') {
      if (manualPrice <= 0) return;
      const manualCand: PriceCandidate = {
        id: `MANUAL-${Date.now()}`,
        price: manualPrice,
        unit: itemUnit,
        source: 'MANUAL',
        sourceName: manualVendor || 'Input Estimator Manual',
        observedDate: new Date().toISOString().split('T')[0],
        region,
        specification: itemSpecification,
        brand: itemBrand,
        confidence: 1.0,
        matchType: 'MANUAL',
        notes: manualNotes,
        isConfirmed: true,
      };

      if (alsoSaveToDb && projectId) {
        projectPriceEngine.setProjectPrice({
          projectId,
          materialId: `MAT-${Date.now()}`,
          price: manualPrice,
          unit: itemUnit,
          supplierName: manualVendor || 'Input Manual Proyek',
          source: 'USER',
          notes: manualNotes,
          createdBy: 'Estimator',
        });
      }

      onConfirmPrice(manualPrice, manualCand, alsoSaveToDb);
      onClose();
      return;
    }

    if (!selectedCandidate) return;

    if (alsoSaveToDb && projectId) {
      projectPriceEngine.setProjectPrice({
        projectId,
        materialId: selectedCandidate.id,
        price: selectedCandidate.price,
        unit: selectedCandidate.unit || itemUnit,
        supplierName: selectedCandidate.sourceName,
        source: 'QUOTATION',
        notes: selectedCandidate.notes,
        createdBy: 'Estimator',
      });
    }

    onConfirmPrice(selectedCandidate.price, selectedCandidate, alsoSaveToDb);
    onClose();
  };

  // Filtered list
  const filteredCandidates = useMemo(() => {
    return dbCandidates.filter((cand) => {
      if (categoryFilter === 'MATERIAL' && cand.notes?.toLowerCase().includes('tenaga') && !cand.notes?.toLowerCase().includes('material')) return false;
      if (categoryFilter === 'LABOR' && !cand.notes?.toLowerCase().includes('tenaga') && !cand.sourceName.toLowerCase().includes('upah')) return false;
      if (categoryFilter === 'EQUIPMENT' && !cand.notes?.toLowerCase().includes('peralatan') && !cand.sourceName.toLowerCase().includes('alat')) return false;
      return true;
    });
  }, [dbCandidates, categoryFilter]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          backgroundColor: '#FFFFFF',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-8px 0 24px rgba(0, 0, 0, 0.15)',
          animation: 'slideInRight 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #E2E8F0',
            backgroundColor: '#0F172A',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', background: '#2563EB', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, letterSpacing: '0.5px' }}>
                PRICE RESOLUTION ENGINE
              </span>
              <span style={{ fontSize: '11px', color: '#94A3B8' }}>• V2 2026</span>
            </div>
            <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '6px 0 0 0', color: '#FFFFFF' }}>
              Resolusi Harga Material, Upah & Alat
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Item Info Banner */}
        <div
          style={{
            padding: '12px 20px',
            background: '#F8FAFC',
            borderBottom: '1px solid #E2E8F0',
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A' }}>{itemName}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
            {itemSpecification && (
              <span style={{ fontSize: '11px', background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '2px 8px', borderRadius: '4px', color: '#475569' }}>
                Spec: {itemSpecification}
              </span>
            )}
            <span style={{ fontSize: '11px', background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '2px 8px', borderRadius: '4px', color: '#1D4ED8', fontWeight: 600 }}>
              Satuan: {itemUnit}
            </span>
            {quantity && quantity > 0 && (
              <span style={{ fontSize: '11px', background: '#FEF3C7', border: '1px solid #FDE68A', padding: '2px 8px', borderRadius: '4px', color: '#92400E', fontWeight: 600 }}>
                Volume: {quantity.toLocaleString('id-ID')} {itemUnit}
              </span>
            )}
            <span style={{ fontSize: '11px', background: '#F1F5F9', border: '1px solid #E2E8F0', padding: '2px 8px', borderRadius: '4px', color: '#64748B' }}>
              Wilayah: {region}
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #E2E8F0',
            backgroundColor: '#FFFFFF',
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => setActiveTab('DATABASE')}
            style={{
              flex: 1,
              padding: '11px 12px',
              border: 'none',
              borderBottom: activeTab === 'DATABASE' ? '2px solid #2563EB' : '2px solid transparent',
              background: 'transparent',
              fontSize: '12px',
              fontWeight: activeTab === 'DATABASE' ? 700 : 500,
              color: activeTab === 'DATABASE' ? '#2563EB' : '#64748B',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <Database size={14} /> Database & Proyek ({filteredCandidates.length})
          </button>
          <button
            onClick={() => {
              setActiveTab('WEB_SEARCH');
              if (!webResult && !isSearchingWeb) handleRunWebSearch();
            }}
            style={{
              flex: 1,
              padding: '11px 12px',
              border: 'none',
              borderBottom: activeTab === 'WEB_SEARCH' ? '2px solid #2563EB' : '2px solid transparent',
              background: 'transparent',
              fontSize: '12px',
              fontWeight: activeTab === 'WEB_SEARCH' ? 700 : 500,
              color: activeTab === 'WEB_SEARCH' ? '#2563EB' : '#64748B',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <Sparkles size={14} color="#7C3AED" /> AI Web Search
          </button>
          <button
            onClick={() => setActiveTab('MANUAL')}
            style={{
              flex: 1,
              padding: '11px 12px',
              border: 'none',
              borderBottom: activeTab === 'MANUAL' ? '2px solid #2563EB' : '2px solid transparent',
              background: 'transparent',
              fontSize: '12px',
              fontWeight: activeTab === 'MANUAL' ? 700 : 500,
              color: activeTab === 'MANUAL' ? '#2563EB' : '#64748B',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <Plus size={14} /> Input Manual
          </button>
        </div>

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* TAB 1: DATABASE CANDIDATES */}
          {activeTab === 'DATABASE' && (
            <div>
              {/* Search input in Database tab */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '10px' }} />
                  <input
                    type="text"
                    value={searchFilterQuery}
                    onChange={(e) => setSearchFilterQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && performSearch(searchFilterQuery)}
                    placeholder="Cari material, upah, atau alat di database..."
                    style={{
                      width: '100%',
                      padding: '8px 12px 8px 30px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '12px',
                      outline: 'none',
                    }}
                  />
                </div>
                <button
                  onClick={() => performSearch(searchFilterQuery)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    background: '#2563EB',
                    color: '#FFFFFF',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cari
                </button>
              </div>

              {/* Category Filter Chips */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
                {[
                  { id: 'ALL', label: 'Semua', icon: Database },
                  { id: 'MATERIAL', label: 'Material', icon: Package },
                  { id: 'LABOR', label: 'Upah / Tenaga', icon: HardHat },
                  { id: 'EQUIPMENT', label: 'Peralatan', icon: Truck },
                ].map((chip) => {
                  const isActive = categoryFilter === chip.id;
                  const Icon = chip.icon;
                  return (
                    <button
                      key={chip.id}
                      onClick={() => setCategoryFilter(chip.id as any)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '20px',
                        fontSize: '11px',
                        fontWeight: isActive ? 650 : 500,
                        border: isActive ? '1px solid #2563EB' : '1px solid #E2E8F0',
                        background: isActive ? '#EFF6FF' : '#FFFFFF',
                        color: isActive ? '#2563EB' : '#64748B',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Icon size={12} />
                      {chip.label}
                    </button>
                  );
                })}
              </div>

              <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '10px' }}>{dbStatus}</div>

              {filteredCandidates.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', background: '#F8FAFC', borderRadius: '8px', border: '1px dashed #CBD5E1' }}>
                  <AlertCircle size={28} color="#94A3B8" style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Belum Ada di Database</div>
                  <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '4px' }}>
                    Coba ubah kata kunci di kolom pencarian di atas, atau gunakan <strong>AI Web Search</strong> untuk riset harga pasar terkini.
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '12px' }}>
                    <button
                      onClick={() => {
                        setActiveTab('WEB_SEARCH');
                        if (!webResult) handleRunWebSearch();
                      }}
                      style={{
                        padding: '7px 14px',
                        borderRadius: '6px',
                        background: '#2563EB',
                        color: '#FFFFFF',
                        border: 'none',
                        fontSize: '11.5px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Buka AI Web Search →
                    </button>
                    <button
                      onClick={() => setActiveTab('MANUAL')}
                      style={{
                        padding: '7px 14px',
                        borderRadius: '6px',
                        background: '#FFFFFF',
                        color: '#475569',
                        border: '1px solid #CBD5E1',
                        fontSize: '11.5px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Input Manual
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {filteredCandidates.map((cand) => {
                    const isSelected = selectedCandidate?.id === cand.id;
                    const isLabor = cand.notes?.toLowerCase().includes('tenaga') || cand.sourceName.toLowerCase().includes('upah');
                    const isEquip = cand.notes?.toLowerCase().includes('peralatan') || cand.sourceName.toLowerCase().includes('alat');

                    return (
                      <div
                        key={cand.id}
                        onClick={() => setSelectedCandidate(cand)}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '8px',
                          border: isSelected ? '2px solid #2563EB' : '1px solid #E2E8F0',
                          backgroundColor: isSelected ? '#EFF6FF' : '#FFFFFF',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1, paddingRight: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  background: isLabor ? '#FEF3C7' : isEquip ? '#EDE9FE' : cand.source === 'PROJECT' ? '#DCFCE7' : '#F1F5F9',
                                  color: isLabor ? '#B45309' : isEquip ? '#6D28D9' : cand.source === 'PROJECT' ? '#15803D' : '#475569',
                                }}
                              >
                                {isLabor ? 'STANDAR UPAH' : isEquip ? 'SEWA ALAT' : cand.source === 'PROJECT' ? 'HARGA PROYEK' : 'MATERIAL NASIONAL'}
                              </span>
                              {cand.region && (
                                <span style={{ fontSize: '10px', color: '#64748B' }}>📍 {cand.region}</span>
                              )}
                            </div>
                            <div style={{ fontSize: '12.5px', fontWeight: 650, color: '#0F172A', marginTop: '4px' }}>
                              {cand.sourceName}
                            </div>
                            {cand.notes && (
                              <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                                {cand.notes}
                              </div>
                            )}
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', fontFamily: 'monospace' }}>
                              {formatCurrencyIDR(cand.price)}
                            </div>
                            <div style={{ fontSize: '10.5px', color: '#64748B' }}>/ {cand.unit || itemUnit}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: AI WEB SEARCH */}
          {activeTab === 'WEB_SEARCH' && (
            <div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                <input
                  type="text"
                  value={searchFilterQuery}
                  onChange={(e) => setSearchFilterQuery(e.target.value)}
                  placeholder="Nama material/upah/alat..."
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12px',
                  }}
                />
                <button
                  onClick={handleRunWebSearch}
                  disabled={isSearchingWeb}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    background: '#7C3AED',
                    color: '#FFFFFF',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: isSearchingWeb ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {isSearchingWeb ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  Riset Harga Web
                </button>
              </div>

              {isSearchingWeb && (
                <div style={{ padding: '30px', textAlign: 'center', color: '#64748B', fontSize: '12px' }}>
                  <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 10px', color: '#7C3AED' }} />
                  Mencari katalog distributor dan referensi pasar konstruksi 2026...
                </div>
              )}

              {webSearchError && !isSearchingWeb && (
                <div style={{ padding: '12px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '6px', color: '#991B1B', fontSize: '12px' }}>
                  {webSearchError}
                </div>
              )}

              {webResult && webResult.status === 'FOUND' && !isSearchingWeb && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '12px', color: '#64748B' }}>
                    Ditemukan {webResult.candidates.length} referensi harga pasar:
                  </div>
                  {webResult.candidates.map((cand) => {
                    const isSelected = selectedCandidate?.id === cand.id;
                    return (
                      <div
                        key={cand.id}
                        onClick={() => setSelectedCandidate(cand)}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '8px',
                          border: isSelected ? '2px solid #7C3AED' : '1px solid #E2E8F0',
                          backgroundColor: isSelected ? '#FAF5FF' : '#FFFFFF',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <div>
                            <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', background: '#EDE9FE', color: '#6D28D9' }}>
                              {cand.sourceName}
                            </span>
                            <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#0F172A', marginTop: '4px' }}>
                              {cand.specification || itemName}
                            </div>
                            {cand.sourceUrl && (
                              <a
                                href={cand.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                style={{ fontSize: '10.5px', color: '#2563EB', display: 'flex', alignItems: 'center', gap: '3px', marginTop: '3px' }}
                              >
                                Buka Sumber <ExternalLink size={10} />
                              </a>
                            )}
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', fontFamily: 'monospace' }}>
                              {formatCurrencyIDR(cand.price)}
                            </div>
                            <div style={{ fontSize: '10.5px', color: '#64748B' }}>/ {cand.unit || itemUnit}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: MANUAL INPUT */}
          {activeTab === 'MANUAL' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Harga Satuan (Rp)
                </label>
                <input
                  type="number"
                  value={manualPrice || ''}
                  onChange={(e) => setManualPrice(Number(e.target.value))}
                  placeholder="Contoh: 75000"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Supplier / Vendor / Sumber
                </label>
                <input
                  type="text"
                  value={manualVendor}
                  onChange={(e) => setManualVendor(e.target.value)}
                  placeholder="Contoh: PT Semen Indonesia / Toko Bangunan Berkah"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Catatan / Keterangan
                </label>
                <textarea
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  rows={3}
                  placeholder="Nomor penawaran harga, syarat pembayaran, atau diskon khusus proyek..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12px',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid #E2E8F0',
            backgroundColor: '#F8FAFC',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            flexShrink: 0,
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#475569', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={alsoSaveToDb}
              onChange={(e) => setAlsoSaveToDb(e.target.checked)}
            />
            <span>Simpan harga ini ke <strong>Harga Proyek & Database</strong> untuk item ini</span>
          </label>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#475569',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Batal
            </button>
            <button
              onClick={handleConfirmSelected}
              disabled={activeTab === 'MANUAL' ? manualPrice <= 0 : !selectedCandidate}
              style={{
                padding: '8px 20px',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === 'MANUAL' ? (manualPrice > 0 ? '#2563EB' : '#94A3B8') : (selectedCandidate ? '#2563EB' : '#94A3B8'),
                color: '#FFFFFF',
                fontSize: '12px',
                fontWeight: 700,
                cursor: (activeTab === 'MANUAL' ? manualPrice > 0 : selectedCandidate) ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Check size={14} /> Gunakan Harga Ini
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
