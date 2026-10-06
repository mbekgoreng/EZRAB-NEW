import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Tag,
  Calendar,
  CheckCircle2,
  DollarSign,
  AlertCircle,
  Save,
  RotateCcw,
  Search,
  Package,
  HardHat,
  Truck,
  ArrowRight,
  ChevronRight,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { projectPriceEngine } from '../../engine/pricing/projectPriceEngine';
import { PriceRepository } from '../../engine/pricing/repository/priceRepository';
import { MaterialDatabaseService } from '../../domain/material/materialDatabaseService';
import { LaborDatabaseService } from '../../domain/labor/laborDatabaseService';
import { EquipmentDatabaseService } from '../../domain/equipment/equipmentDatabaseService';
import { MaterialMaster } from '../../domain/material/types';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';

export interface ProjectPriceResource {
  id: string;
  code: string;
  name: string;
  unit: string;
  category: 'MATERIAL' | 'LABOR' | 'EQUIPMENT' | string;
  masterPrice: number;
  specification?: string;
  brand?: string;
}

export interface ProjectPriceModalProps {
  isOpen: boolean;
  onClose: () => void;
  material?: MaterialMaster | null;
  resource?: ProjectPriceResource | null;
  projectId: string;
  projectName?: string;
  referencePrice?: number;
  onSaved?: () => void;
}

export const ProjectPriceModal: React.FC<ProjectPriceModalProps> = ({
  isOpen,
  onClose,
  material,
  resource,
  projectId,
  projectName = 'Proyek Aktif',
  referencePrice = 0,
  onSaved,
}) => {
  // Services
  const matDb = useMemo(() => MaterialDatabaseService.getInstance(), []);
  const laborDb = useMemo(() => LaborDatabaseService.getInstance(), []);
  const equipDb = useMemo(() => EquipmentDatabaseService.getInstance(), []);
  const priceRepo = useMemo(() => PriceRepository.getInstance(), []);

  // Active selected resource for override
  const [selectedResource, setSelectedResource] = useState<ProjectPriceResource | null>(null);
  const [isPickerMode, setIsPickerMode] = useState<boolean>(false);

  // Picker search & category filter
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerCategory, setPickerCategory] = useState<'ALL' | 'MATERIAL' | 'LABOR' | 'EQUIPMENT'>('ALL');

  // Override Form Fields
  const [overridePrice, setOverridePrice] = useState<number>(0);
  const [overrideReason, setOverrideReason] = useState('');
  const [sourceType, setSourceType] = useState<'QUOTATION' | 'PURCHASE' | 'CONTRACT' | 'SUPPLIER' | 'USER'>('QUOTATION');
  const [supplierName, setSupplierName] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [region, setRegion] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [validUntil, setValidUntil] = useState('');
  const [hasExistingOverride, setHasExistingOverride] = useState(false);

  // Setup resource upon opening
  useEffect(() => {
    if (!isOpen) {
      setSelectedResource(null);
      setIsPickerMode(false);
      setPickerSearch('');
      return;
    }

    if (resource) {
      setSelectedResource(resource);
      setIsPickerMode(false);
      loadPriceForResource(resource);
    } else if (material) {
      const prices = matDb.getPricesByMaterialId(material.id);
      const basePrice = referencePrice > 0 ? referencePrice : (prices[0]?.price || 0);
      const res: ProjectPriceResource = {
        id: material.id,
        code: material.materialCode || material.id,
        name: material.name,
        unit: material.unit,
        category: 'MATERIAL',
        masterPrice: basePrice,
        specification: material.specification,
        brand: material.brand,
      };
      setSelectedResource(res);
      setIsPickerMode(false);
      loadPriceForResource(res);
    } else {
      // Option B: Open in Picker Mode
      setSelectedResource(null);
      setIsPickerMode(true);
    }
  }, [isOpen, material, resource, referencePrice, projectId]);

  const loadPriceForResource = (res: ProjectPriceResource) => {
    const code = res.code || res.id;
    const existing = projectPriceEngine.getProjectOverride(projectId, code);
    const existingPrice = projectPriceEngine.getProjectPrice(projectId, code);

    if (existing && existing.active) {
      setOverridePrice(existing.price);
      setOverrideReason(existing.reason || '');
      setHasExistingOverride(true);
    } else if (existingPrice) {
      setOverridePrice(existingPrice.price);
      setOverrideReason(existingPrice.notes || '');
      setSupplierName(existingPrice.supplierName || '');
      setReferenceNumber(existingPrice.referenceNumber || '');
      setSourceType(existingPrice.source || 'QUOTATION');
      setHasExistingOverride(true);
    } else {
      setOverridePrice(res.masterPrice > 0 ? res.masterPrice : 0);
      setOverrideReason('');
      setSupplierName('');
      setReferenceNumber('');
      setSourceType('QUOTATION');
      setHasExistingOverride(false);
    }
  };

  // Build searchable resources for the picker
  const allPickerItems = useMemo(() => {
    const items: ProjectPriceResource[] = [];

    // 1. Materials
    const mats = matDb.getAllMaterials();
    for (const m of mats) {
      const prices = matDb.getPricesByMaterialId(m.id);
      items.push({
        id: m.id,
        code: m.materialCode || m.id,
        name: m.name,
        unit: m.unit,
        category: 'MATERIAL',
        masterPrice: prices[0]?.price || 0,
        specification: m.specification,
        brand: m.brand,
      });
    }

    // 2. Labor
    const labors = laborDb.getAllLabor();
    for (const l of labors) {
      items.push({
        id: l.id,
        code: l.code,
        name: l.name,
        unit: l.unit,
        category: 'LABOR',
        masterPrice: l.basePriceOH,
        specification: l.skkLevel || l.category,
      });
    }

    // 3. Equipment
    const equips = equipDb.getAllEquipment();
    for (const e of equips) {
      items.push({
        id: e.id,
        code: e.code,
        name: e.name,
        unit: e.unit,
        category: 'EQUIPMENT',
        masterPrice: e.rentalPricePerHour,
        specification: e.capacity ? `${e.category} - ${e.capacity}` : e.category,
      });
    }

    return items;
  }, [matDb, laborDb, equipDb]);

  // Filtered picker items
  const filteredPickerItems = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return allPickerItems.filter((item) => {
      if (pickerCategory !== 'ALL' && item.category !== pickerCategory) {
        return false;
      }
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        (item.specification || '').toLowerCase().includes(q)
      );
    });
  }, [allPickerItems, pickerSearch, pickerCategory]);

  if (!isOpen) return null;

  // Selected Resource Price Variance
  const masterPrice = selectedResource?.masterPrice || 0;
  const difference = overridePrice - masterPrice;
  const percentage = masterPrice > 0 ? (difference / masterPrice) * 100 : 0;
  const isCheaper = difference < 0;
  const isIdentical = difference === 0;

  const handleSelectResourceFromPicker = (res: ProjectPriceResource) => {
    setSelectedResource(res);
    setIsPickerMode(false);
    loadPriceForResource(res);
  };

  const handleSaveOverride = () => {
    if (!selectedResource) return;
    const code = selectedResource.code || selectedResource.id;

    // 1. Save directly into ProjectPriceEngine
    projectPriceEngine.setProjectOverride(
      {
        projectId,
        materialId: selectedResource.id,
        materialCode: code,
        materialName: selectedResource.name,
        category: selectedResource.category,
        masterPrice: selectedResource.masterPrice,
        price: Number(overridePrice),
        unit: selectedResource.unit,
        reason: overrideReason || `Override harga proyek disetujui (${sourceType})`,
        createdBy: 'Estimator Proyek',
        active: true,
      },
      { id: 'USR-PROJ-EST', name: 'Estimator Proyek' }
    );

    // 2. Also register quotation / supplier metadata in ProjectMaterialPrice
    projectPriceEngine.setProjectPrice(
      {
        projectId,
        materialId: selectedResource.id,
        materialCode: code,
        materialName: selectedResource.name,
        category: selectedResource.category,
        price: Number(overridePrice),
        unit: selectedResource.unit,
        supplierName,
        region,
        effectiveDate,
        validUntil: validUntil || undefined,
        source: sourceType,
        referenceNumber,
        notes: overrideReason,
        status: 'ACTIVE',
        createdBy: 'Estimator Proyek',
      },
      { id: 'USR-PROJ-EST', name: 'Estimator Proyek' }
    );

    // 3. Mirror into PriceRepository
    priceRepo.setProjectPriceOverride(
      projectId,
      code,
      Number(overridePrice),
      overrideReason || `Project Override ${projectName}`
    );

    onSaved?.();
    onClose();
  };

  const handleResetToMaster = () => {
    if (!selectedResource) return;
    const code = selectedResource.code || selectedResource.id;

    // Remove override and project price
    projectPriceEngine.removeProjectOverride(projectId, code);
    projectPriceEngine.removeProjectPrice(projectId, code);
    priceRepo.removeProjectPriceOverride(projectId, code);

    onSaved?.();
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(3px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '620px',
          maxWidth: '100%',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: '#F8FAFC',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                backgroundColor: '#EFF6FF',
                color: '#2563EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #DBEAFE',
              }}
            >
              <Tag size={19} />
            </div>
            <div>
              <h2 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                {isPickerMode ? 'Pilih Item untuk Override Harga' : 'Override Harga Proyek'}
              </h2>
              <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
                Proyek: <strong style={{ color: '#2563EB' }}>{projectName}</strong>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#94A3B8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        {isPickerMode ? (
          /* ============================================================== */
          /* VIEW 1: RESOURCE PICKER (Option B)                             */
          /* ============================================================== */
          <div style={{ padding: '18px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Search Input */}
            <div style={{ position: 'relative' }}>
              <Search size={15} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Cari material, tenaga kerja, atau alat berat..."
                style={{
                  width: '100%',
                  padding: '9px 12px 9px 34px',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  fontSize: '12.5px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                autoFocus
              />
            </div>

            {/* Category Filter Pills */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[
                { id: 'ALL', label: 'Semua Resource', icon: Tag },
                { id: 'MATERIAL', label: 'Material & Bahan', icon: Package },
                { id: 'LABOR', label: 'Upah Tenaga Kerja', icon: HardHat },
                { id: 'EQUIPMENT', label: 'Peralatan & Alat Berat', icon: Truck },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = pickerCategory === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setPickerCategory(tab.id as any)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '5px 10px',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: active ? '1px solid #2563EB' : '1px solid #E2E8F0',
                      backgroundColor: active ? '#EFF6FF' : '#ffffff',
                      color: active ? '#1D4ED8' : '#64748B',
                    }}
                  >
                    <Icon size={12} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Search Results List */}
            <div
              style={{
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                maxHeight: '380px',
                overflowY: 'auto',
                backgroundColor: '#ffffff',
              }}
            >
              {filteredPickerItems.length === 0 ? (
                <div style={{ padding: '36px 16px', textAlign: 'center', color: '#94A3B8', fontSize: '12px' }}>
                  Tidak ada item ditemukan untuk &quot;{pickerSearch}&quot;
                </div>
              ) : (
                filteredPickerItems.slice(0, 50).map((item) => (
                  <div
                    key={`${item.category}-${item.id}`}
                    onClick={() => handleSelectResourceFromPicker(item)}
                    style={{
                      padding: '10px 14px',
                      borderBottom: '1px solid #F1F5F9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#ffffff')}
                  >
                    <div style={{ minWidth: 0, flex: 1, paddingRight: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            fontSize: '9.5px',
                            fontWeight: 800,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            backgroundColor:
                              item.category === 'MATERIAL'
                                ? '#EFF6FF'
                                : item.category === 'LABOR'
                                ? '#FEF3C7'
                                : '#F3E8FF',
                            color:
                              item.category === 'MATERIAL'
                                ? '#1D4ED8'
                                : item.category === 'LABOR'
                                ? '#92400E'
                                : '#6B21A8',
                          }}
                        >
                          {item.category}
                        </span>
                        <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.name}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                        <span style={{ fontFamily: 'monospace', color: '#2563EB' }}>{item.code}</span>
                        {item.specification && <span>• {item.specification}</span>}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#0F172A' }}>
                        Rp {item.masterPrice.toLocaleString('id-ID')}
                      </div>
                      <div style={{ fontSize: '10.5px', color: '#64748B' }}>per {item.unit}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          /* ============================================================== */
          /* VIEW 2: OVERRIDE PRICING FORM                                 */
          /* ============================================================== */
          <div style={{ padding: '18px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Resource Identity Banner */}
            {selectedResource && (
              <div
                style={{
                  padding: '12px 14px',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        fontSize: '9.5px',
                        fontWeight: 800,
                        padding: '1px 6px',
                        borderRadius: '4px',
                        backgroundColor:
                          selectedResource.category === 'MATERIAL'
                            ? '#EFF6FF'
                            : selectedResource.category === 'LABOR'
                            ? '#FEF3C7'
                            : '#F3E8FF',
                        color:
                          selectedResource.category === 'MATERIAL'
                            ? '#1D4ED8'
                            : selectedResource.category === 'LABOR'
                            ? '#92400E'
                            : '#6B21A8',
                      }}
                    >
                      {selectedResource.category}
                    </span>
                    <strong style={{ fontSize: '13px', color: '#0F172A' }}>{selectedResource.name}</strong>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: '#64748B', marginTop: '3px' }}>
                    <span style={{ fontFamily: 'monospace', color: '#2563EB', fontWeight: 700 }}>{selectedResource.code}</span>
                    <span>•</span>
                    <span>Satuan: <strong>{selectedResource.unit}</strong></span>
                    <span>•</span>
                    <span>Harga Master: <strong>Rp {masterPrice.toLocaleString('id-ID')}</strong></span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsPickerMode(true)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#ffffff',
                    color: '#2563EB',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Ganti Item
                </button>
              </div>
            )}

            {/* Price Inputs: Master (Read-Only) vs Override (Editable) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '12px' }}>
              {/* Master Reference Box */}
              <div
                style={{
                  padding: '12px',
                  backgroundColor: '#F1F5F9',
                  border: '1px solid #CBD5E1',
                  borderRadius: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10.5px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                  <ShieldCheck size={13} color="#059669" />
                  <span>Harga Master Acuan:</span>
                </div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#334155', marginTop: '4px' }}>
                  Rp {masterPrice.toLocaleString('id-ID')}
                </div>
                <div style={{ fontSize: '10px', color: '#64748B', marginTop: '2px' }}>
                  per {selectedResource?.unit || 'unit'} (Database Master)
                </div>
              </div>

              {/* Project Override Input */}
              <div
                style={{
                  padding: '12px',
                  backgroundColor: '#EFF6FF',
                  border: '1.5px solid #3B82F6',
                  borderRadius: '10px',
                }}
              >
                <label style={{ fontSize: '11px', fontWeight: 800, color: '#1D4ED8', display: 'block', textTransform: 'uppercase' }}>
                  Harga Override Proyek:
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: '#1E40AF' }}>Rp</span>
                  <input
                    type="number"
                    value={overridePrice}
                    onChange={(e) => setOverridePrice(Number(e.target.value))}
                    placeholder="0"
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: '1px solid #93C5FD',
                      fontSize: '16px',
                      fontWeight: 900,
                      color: '#0F172A',
                      outline: 'none',
                    }}
                    autoFocus
                  />
                </div>
                <div style={{ fontSize: '10px', color: '#2563EB', marginTop: '2px', fontWeight: 600 }}>
                  Akan menggantikan harga master di RAB proyek ini
                </div>
              </div>
            </div>

            {/* Live Difference & Deviation Indicator */}
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: isIdentical
                  ? '1px solid #E2E8F0'
                  : isCheaper
                  ? '1px solid #A7F3D0'
                  : '1px solid #FECACA',
                backgroundColor: isIdentical ? '#F8FAFC' : isCheaper ? '#ECFDF5' : '#FEF2F2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {isCheaper ? (
                  <TrendingDown size={16} color="#059669" />
                ) : isIdentical ? (
                  <CheckCircle2 size={16} color="#64748B" />
                ) : (
                  <TrendingUp size={16} color="#DC2626" />
                )}
                <span style={{ fontSize: '11.5px', fontWeight: 700, color: isCheaper ? '#065F46' : isIdentical ? '#475569' : '#991B1B' }}>
                  {isCheaper
                    ? 'Penghematan Biaya Terhadap Acuan Master'
                    : isIdentical
                    ? 'Harga Sama Persis Dengan Acuan Master'
                    : 'Kenaikan Biaya Terhadap Acuan Master'}
                </span>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 900,
                    color: isCheaper ? '#059669' : isIdentical ? '#475569' : '#DC2626',
                  }}
                >
                  {difference > 0 ? '+' : ''}Rp {difference.toLocaleString('id-ID')} ({percentage > 0 ? '+' : ''}{percentage.toFixed(1)}%)
                </span>
              </div>
            </div>

            {/* Justification & Source Metadata */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                  Alasan / Justifikasi Override:
                </label>
                <input
                  type="text"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Contoh: Kesepakatan harga borongan lapangan / diskon volume"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                  Sumber Penawaran:
                </label>
                <select
                  value={sourceType}
                  onChange={(e: any) => setSourceType(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12px',
                    fontWeight: 600,
                    backgroundColor: '#ffffff',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="QUOTATION">Penawaran Supplier (Quotation)</option>
                  <option value="PURCHASE">Purchase Order / Bon Riil (PO)</option>
                  <option value="CONTRACT">Kontrak Subkontraktor</option>
                  <option value="SUPPLIER">Daftar Harga Distributor</option>
                  <option value="USER">Estimasi Lapangan (Manual)</option>
                </select>
              </div>
            </div>

            {/* Optional Vendor & Validity */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                  Nama Supplier / Mandor (Opsional):
                </label>
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="Contoh: Toko Bangunan Jaya Mandiri"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                  Berlaku Sampai (Opsional):
                </label>
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 20px',
            backgroundColor: '#F8FAFC',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {isPickerMode ? (
            <div style={{ fontSize: '11px', color: '#64748B' }}>
              Pilih item yang ingin disesuaikan harga khususnya untuk proyek ini.
            </div>
          ) : (
            <div>
              {hasExistingOverride && (
                <button
                  type="button"
                  onClick={handleResetToMaster}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: '1px solid #FCA5A5',
                    backgroundColor: '#FEF2F2',
                    color: '#DC2626',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                  title="Hapus override dan kembalikan ke harga master acuan"
                >
                  <RotateCcw size={13} />
                  <span>Reset ke Master</span>
                </button>
              )}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#ffffff',
                color: '#475569',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Batal
            </button>

            {!isPickerMode && (
              <button
                type="button"
                onClick={handleSaveOverride}
                disabled={!selectedResource || overridePrice <= 0}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: !selectedResource || overridePrice <= 0 ? '#94A3B8' : '#2563EB',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: !selectedResource || overridePrice <= 0 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Save size={14} />
                <span>Simpan Override Proyek</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
