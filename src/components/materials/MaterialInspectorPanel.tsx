import React, { useState, useMemo } from 'react';
import {
  Package,
  HardHat,
  Truck,
  X,
  Edit2,
  Plus,
  MapPin,
  TrendingUp,
  ShieldCheck,
  CheckCircle2,
  ChevronRight,
  Check,
  Clock,
  Zap,
  Award,
  Shield,
  Fuel,
  Wrench,
} from 'lucide-react';
import { MaterialMaster } from '../../domain/material/types';
import { MaterialDatabaseService } from '../../domain/material/materialDatabaseService';
import { LaborRateRecord, LaborDatabaseService } from '../../domain/labor/laborDatabaseService';
import { EquipmentRecord, EquipmentDatabaseService } from '../../domain/equipment/equipmentDatabaseService';
import { projectPriceEngine, ResolvedPrice } from '../../engine/pricing/projectPriceEngine';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';
import { getMaterialThumbnail } from './materialThumbnailHelper';

interface MaterialInspectorPanelProps {
  material?: MaterialMaster | null;
  labor?: LaborRateRecord | null;
  equipment?: EquipmentRecord | null;
  activeCategory?: 'MATERIALS' | 'LABOR' | 'EQUIPMENT' | 'PROJECT_PRICE';
  selectedProvince?: string;
  projectId?: string;
  projectName?: string;
  onClose: () => void;
  onEditMaterial?: (material: MaterialMaster) => void;
  onAddPrice?: (material: MaterialMaster) => void;
  onViewAllComparisons?: (material: MaterialMaster) => void;
  onOpenProjectPriceModal?: (material: MaterialMaster) => void;
}

export const MaterialInspectorPanel: React.FC<MaterialInspectorPanelProps> = ({
  material,
  labor,
  equipment,
  activeCategory = 'MATERIALS',
  selectedProvince = 'Indonesia',
  projectId = 'PROJ-DEMO-01',
  projectName = 'Proyek Aktif',
  onClose,
  onEditMaterial,
  onAddPrice,
  onViewAllComparisons,
  onOpenProjectPriceModal,
}) => {
  const [activeTab, setActiveTab] = useState<
    'OVERVIEW' | 'HARGA' | 'SPESIFIKASI' | 'MEREK' | 'RIWAYAT' | 'PROVENANCE'
  >('OVERVIEW');

  const matDb = useMemo(() => MaterialDatabaseService.getInstance(), []);
  const laborDb = useMemo(() => LaborDatabaseService.getInstance(), []);
  const equipDb = useMemo(() => EquipmentDatabaseService.getInstance(), []);

  // -------------------------------------------------------------
  // RENDER LABOR (UPAH) INSPECTOR
  // -------------------------------------------------------------
  if (activeCategory === 'LABOR' && labor) {
    const adjustedRate = laborDb.getAdjustedRate(labor.id, selectedProvince);
    return (
      <aside
        className="mat-inspector-panel"
        style={{
          width: '390px',
          minWidth: '390px',
          maxWidth: '390px',
          flexShrink: 0,
          backgroundColor: '#ffffff',
          border: '1px solid #E2E8F0',
          borderRadius: '16px',
          padding: '16px',
          position: 'sticky',
          top: '16px',
          maxHeight: 'calc(100vh - 40px)',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          fontSize: '12px',
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
          boxShadow: '0 4px 16px -2px rgba(15, 23, 42, 0.05)',
          boxSizing: 'border-box',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              {labor.name}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#2563EB', fontWeight: 700 }}>
                {labor.code}
              </span>
              {labor.englishName && (
                <span style={{ fontSize: '11px', color: '#64748B', fontStyle: 'italic' }}>
                  ({labor.englishName})
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer', padding: '4px' }}
            title="Tutup Panel"
          >
            <X size={16} />
          </button>
        </div>

        {/* Hero Card */}
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div
            style={{
              width: '60px',
              height: '60px',
              borderRadius: '10px',
              backgroundColor: '#FEF3C7',
              color: '#B45309',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid #FDE68A',
              flexShrink: 0,
            }}
          >
            <HardHat size={28} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '4px' }}>
              <span style={{ fontSize: '9.5px', fontWeight: 800, backgroundColor: '#D97706', color: '#FFF', padding: '2px 6px', borderRadius: '4px' }}>
                {labor.category || 'TENAGA KERJA'}
              </span>
              <span style={{ fontSize: '9.5px', fontWeight: 700, backgroundColor: '#EFF6FF', color: '#2563EB', padding: '2px 6px', borderRadius: '4px', border: '1px solid #DBEAFE' }}>
                {labor.skillLevel}
              </span>
            </div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>{labor.subcategory || labor.roleCategory}</div>
            <div style={{ fontSize: '10.5px', color: '#64748B' }}>{labor.skkLevel || 'SKK Jenjang Standar'}</div>
          </div>
        </div>

        {/* Current Rate Card */}
        <div style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '12px', padding: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>
              Upah Harian Standar (OH)
            </span>
            <span style={{ fontSize: '10px', fontWeight: 700, backgroundColor: '#DCFCE7', color: '#15803D', padding: '2px 6px', borderRadius: '4px' }}>
              {labor.workHoursPerDay || 7} Jam Kerja
            </span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#14532D', letterSpacing: '-0.02em' }}>
            Rp {adjustedRate.priceOH.toLocaleString('id-ID')}
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#166534', marginLeft: '4px' }}>/ OH</span>
          </div>
          <div style={{ fontSize: '11px', color: '#15803D', marginTop: '4px', display: 'flex', gap: '12px' }}>
            <span>Per Jam: <strong>Rp {adjustedRate.priceOJ.toLocaleString('id-ID')} / OJ</strong></span>
            <span>Lembur: <strong>Rp {labor.overtimeHourlyRate.toLocaleString('id-ID')} / jam</strong></span>
          </div>
          {labor.minWage && labor.maxWage && (
            <div style={{ fontSize: '10.5px', color: '#166534', marginTop: '4px' }}>
              Rentang Pasar: Rp {labor.minWage.toLocaleString('id-ID')} - Rp {labor.maxWage.toLocaleString('id-ID')} / OH
            </div>
          )}
          <div style={{ fontSize: '10.5px', color: '#4ADE80', marginTop: '6px', borderTop: '1px solid #DCFCE7', paddingTop: '6px' }}>
            Wilayah: {adjustedRate.province} (Faktor Wilayah: {adjustedRate.factor}x)
          </div>
        </div>

        {/* Productivity Rate (If Available) */}
        {labor.productivity && (
          <div style={{ backgroundColor: '#EFF6FF', border: '1px solid #DBEAFE', borderRadius: '10px', padding: '10px' }}>
            <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#1E40AF', textTransform: 'uppercase', marginBottom: '2px' }}>
              Standar Output Produktivitas
            </div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#1D4ED8' }}>
              {labor.productivity.standardRate} {labor.productivity.unit}
            </div>
            <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '2px' }}>
              {labor.productivity.description}
            </div>
          </div>
        )}

        {/* Aliases & Synonyms */}
        {labor.aliases && labor.aliases.length > 0 && (
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', marginBottom: '6px' }}>
              Alias & Kata Kunci:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {labor.aliases.map((alias, idx) => (
                <span key={idx} style={{ backgroundColor: '#F1F5F9', color: '#475569', padding: '2px 7px', borderRadius: '5px', fontSize: '10.5px' }}>
                  {alias}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Duties & Responsibilities */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', marginBottom: '6px' }}>
            Uraian Tugas Pokok:
          </div>
          <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px' }}>
            {labor.duties.map((duty, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '6px', fontSize: '11.5px', color: '#475569', marginBottom: idx !== labor.duties.length - 1 ? '6px' : 0 }}>
                <Check size={14} color="#059669" style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>{duty}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Safety & K3 Requirements */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', marginBottom: '6px' }}>
            Standar APD & Keselamatan Kerja (SMKK):
          </div>
          <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '10px' }}>
            {labor.safetyRequirements.map((req, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '6px', fontSize: '11px', color: '#991B1B', marginBottom: idx !== labor.safetyRequirements.length - 1 ? '4px' : 0 }}>
                <Shield size={13} color="#DC2626" style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>{req}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Regional Comparison */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', marginBottom: '6px' }}>
            Matriks Upah Regional Indonesia 2026:
          </div>
          <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden', fontSize: '11.5px' }}>
            {[
              { prov: 'DKI Jakarta', f: 1.0 },
              { prov: 'Jawa Barat', f: 0.96 },
              { prov: 'Jawa Timur', f: 0.94 },
              { prov: 'Nusantara (IKN)', f: 1.25 },
              { prov: 'Papua', f: 1.48 },
            ].map((reg, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', backgroundColor: idx % 2 === 0 ? '#FFF' : '#F8FAFC', borderBottom: idx < 4 ? '1px solid #F1F5F9' : 'none' }}>
                <span style={{ color: '#475569' }}>{reg.prov}</span>
                <span style={{ fontWeight: 700, color: '#0F172A' }}>
                  Rp {Math.round((labor.basePriceOH * reg.f) / 500 * 500).toLocaleString('id-ID')} / OH
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Provenance */}
        <div style={{ padding: '8px 10px', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '10.5px', color: '#64748B' }}>
          <strong>Dasar Regulasi:</strong> {labor.regulationSource}
        </div>
      </aside>
    );
  }

  // -------------------------------------------------------------
  // RENDER EQUIPMENT (PERALATAN) INSPECTOR
  // -------------------------------------------------------------
  if (activeCategory === 'EQUIPMENT' && equipment) {
    const adjustedRate = equipDb.getAdjustedRate(equipment.id, selectedProvince);
    return (
      <aside
        className="mat-inspector-panel"
        style={{
          width: '390px',
          minWidth: '390px',
          maxWidth: '390px',
          flexShrink: 0,
          backgroundColor: '#ffffff',
          border: '1px solid #E2E8F0',
          borderRadius: '16px',
          padding: '16px',
          position: 'sticky',
          top: '16px',
          maxHeight: 'calc(100vh - 40px)',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          fontSize: '12px',
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
          boxShadow: '0 4px 16px -2px rgba(15, 23, 42, 0.05)',
          boxSizing: 'border-box',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A', margin: 0, lineHeight: 1.3 }}>
              {equipment.name}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#2563EB', fontWeight: 700 }}>
                {equipment.code}
              </span>
              {equipment.englishName && (
                <span style={{ fontSize: '11px', color: '#64748B', fontStyle: 'italic' }}>
                  ({equipment.englishName})
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer', padding: '4px' }}
            title="Tutup Panel"
          >
            <X size={16} />
          </button>
        </div>

        {/* Hero Card */}
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div
            style={{
              width: '60px',
              height: '60px',
              borderRadius: '10px',
              backgroundColor: '#EFF6FF',
              color: '#2563EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid #DBEAFE',
              flexShrink: 0,
            }}
          >
            <Truck size={28} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '4px' }}>
              <span style={{ fontSize: '9.5px', fontWeight: 800, backgroundColor: '#2563EB', color: '#FFF', padding: '2px 6px', borderRadius: '4px' }}>
                {equipment.category}
              </span>
              <span style={{ fontSize: '9.5px', fontWeight: 700, backgroundColor: '#ECFDF5', color: '#059669', padding: '2px 6px', borderRadius: '4px', border: '1px solid #A7F3D0' }}>
                {equipment.ownershipMode || 'RENTED'}
              </span>
            </div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>{equipment.capacity}</div>
            <div style={{ fontSize: '10.5px', color: '#64748B' }}>Daya: {equipment.enginePowerHP > 0 ? `${equipment.enginePowerHP} HP` : 'Motor Listrik'}</div>
          </div>
        </div>

        {/* Current Rental Rate Card */}
        <div style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '12px', padding: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>
              Tarif Sewa Acuan 2026
            </span>
            <span style={{ fontSize: '10px', fontWeight: 700, backgroundColor: '#DCFCE7', color: '#15803D', padding: '2px 6px', borderRadius: '4px' }}>
              {equipment.operatorIncluded ? 'Include Operator & BBM' : 'Unit Only'}
            </span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#14532D', letterSpacing: '-0.02em' }}>
            Rp {adjustedRate.pricePerHour.toLocaleString('id-ID')}
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#166534', marginLeft: '4px' }}>/ jam</span>
          </div>
          <div style={{ fontSize: '11px', color: '#15803D', marginTop: '4px', display: 'flex', gap: '12px' }}>
            <span>Per Hari (8 Jam): <strong>Rp {adjustedRate.pricePerDay.toLocaleString('id-ID')}</strong></span>
          </div>
          {adjustedRate.pricePerMonth > 0 && (
            <div style={{ fontSize: '11px', color: '#15803D', marginTop: '2px' }}>
              Sewa Bulanan (200 jam): <strong>Rp {adjustedRate.pricePerMonth.toLocaleString('id-ID')}</strong>
            </div>
          )}
          <div style={{ fontSize: '10.5px', color: '#4ADE80', marginTop: '6px', borderTop: '1px solid #DCFCE7', paddingTop: '6px' }}>
            Wilayah: {adjustedRate.province}
          </div>
        </div>

        {/* Productivity Profile */}
        {equipment.productivity && (
          <div style={{ backgroundColor: '#EFF6FF', border: '1px solid #DBEAFE', borderRadius: '10px', padding: '10px' }}>
            <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#1E40AF', textTransform: 'uppercase', marginBottom: '2px' }}>
              Kapasitas Output & Produktivitas
            </div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#1D4ED8' }}>
              {equipment.productivity.standardOutputPerHour} {equipment.productivity.unit}
            </div>
            <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '2px' }}>
              {equipment.productivity.description}
            </div>
          </div>
        )}

        {/* Operating Cost Breakdown */}
        {equipment.operatingCosts && (
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', marginBottom: '6px' }}>
              Rincian Biaya Operasional / Jam:
            </div>
            <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden', fontSize: '11px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 10px', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                <span>BBM ({equipment.fuelType}):</span>
                <strong>Rp {equipment.operatingCosts.fuelCostPerHour.toLocaleString('id-ID')}/jam</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 10px', backgroundColor: '#FFF', borderBottom: '1px solid #E2E8F0' }}>
                <span>Pelumas & Oli:</span>
                <strong>Rp {equipment.operatingCosts.lubricantCostPerHour.toLocaleString('id-ID')}/jam</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 10px', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                <span>Operator:</span>
                <strong>Rp {equipment.operatingCosts.operatorCostPerHour.toLocaleString('id-ID')}/jam</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 10px', backgroundColor: '#FFF', borderBottom: '1px solid #E2E8F0' }}>
                <span>Maintenance & Part:</span>
                <strong>Rp {equipment.operatingCosts.maintenanceCostPerHour.toLocaleString('id-ID')}/jam</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', backgroundColor: '#EFF6FF', fontWeight: 800, color: '#1D4ED8' }}>
                <span>Total Operasional:</span>
                <span>Rp {equipment.operatingCosts.totalOperatingCostPerHour.toLocaleString('id-ID')}/jam</span>
              </div>
            </div>
          </div>
        )}

        {/* Technical Specs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div style={{ padding: '8px 10px', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '10px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Fuel size={12} color="#D97706" /> Konsumsi BBM
            </div>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
              {equipment.fuelConsumptionLiterPerHour > 0 ? `${equipment.fuelConsumptionLiterPerHour} L / jam` : 'Listrik / Manual'}
            </div>
          </div>
          <div style={{ padding: '8px 10px', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '10px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Truck size={12} color="#2563EB" /> Estimasi Mob/Demob
            </div>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
              Rp {equipment.mobDemobEstimate.toLocaleString('id-ID')}
            </div>
          </div>
        </div>

        {/* Operational Specification */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', marginBottom: '6px' }}>
            Deskripsi & Lingkup Operasi:
          </div>
          <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px', fontSize: '11.5px', color: '#475569', lineHeight: 1.5 }}>
            {equipment.specification}
          </div>
        </div>

        {/* Recommended Brands */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', marginBottom: '6px' }}>
            Merek & Model Rekomendasi:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {equipment.recommendedBrands.map((b, idx) => (
              <span key={idx} style={{ backgroundColor: '#EFF6FF', border: '1px solid #DBEAFE', color: '#1E40AF', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600 }}>
                {b}
              </span>
            ))}
          </div>
        </div>

        {/* Provenance */}
        <div style={{ padding: '8px 10px', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '10.5px', color: '#64748B' }}>
          <strong>Sumber Acuan:</strong> {equipment.provenance.sourceName} ({equipment.provenance.effectiveDate})
        </div>
      </aside>
    );
  }

  // -------------------------------------------------------------
  // DEFAULT: RENDER MATERIAL INSPECTOR
  // -------------------------------------------------------------
  if (!material) {
    return (
      <aside
        className="mat-inspector-panel"
        style={{
          width: '390px',
          minWidth: '390px',
          maxWidth: '390px',
          flexShrink: 0,
          backgroundColor: '#ffffff',
          border: '1px solid #E2E8F0',
          borderRadius: '16px',
          padding: '24px 16px',
          textAlign: 'center',
          color: '#64748B',
        }}
      >
        <Package size={32} color="#CBD5E1" style={{ margin: '0 auto 8px auto' }} />
        <p style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>Pilih baris pada tabel untuk melihat detail inspector.</p>
      </aside>
    );
  }

  const prices = matDb.getPricesByMaterialId(material.id);
  const primaryPriceRec = prices[0];
  const basePrice = primaryPriceRec?.price || 0;

  const brandComparisons = [
    {
      name: `${material.brand || 'Gresik'} ${material.product || 'PCC'}`,
      price: basePrice > 0 ? basePrice : 74000,
      tier: material.priceTier || 'STANDARD',
      isCurrent: true,
    },
    {
      name: 'Tiga Roda PPC',
      price: 76500,
      tier: 'STANDARD',
      isCurrent: false,
    },
    {
      name: 'Holcim',
      price: 82000,
      tier: 'PREMIUM',
      isCurrent: false,
    },
  ];

  return (
    <aside
      className="mat-inspector-panel"
      style={{
        width: '390px',
        minWidth: '390px',
        maxWidth: '390px',
        flexShrink: 0,
        backgroundColor: '#ffffff',
        border: '1px solid #E2E8F0',
        borderRadius: '16px',
        padding: '16px',
        position: 'sticky',
        top: '16px',
        maxHeight: 'calc(100vh - 40px)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        fontSize: '12px',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        boxShadow: '0 4px 16px -2px rgba(15, 23, 42, 0.05)',
        boxSizing: 'border-box',
      }}
    >
      {/* 1. Header with Close Button */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2
            style={{
              fontSize: '13.5px',
              fontWeight: 800,
              color: '#0F172A',
              margin: 0,
              lineHeight: 1.35,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={material.name}
          >
            {material.name}
          </h2>
          <div style={{ fontFamily: 'monospace', fontSize: '10.5px', color: '#94A3B8', marginTop: '2px' }}>
            {material.materialCode}
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            padding: '4px',
            borderRadius: '8px',
            color: '#94A3B8',
            cursor: 'pointer',
            border: 'none',
            background: 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Tutup Panel"
        >
          <X size={15} />
        </button>
      </div>

      {/* 2. Top Product Card with No Foto Badge */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          background: '#F8FAFC',
          border: '1px solid #E2E8F0',
          borderRadius: '12px',
          padding: '12px',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            width: '68px',
            height: '68px',
            borderRadius: '10px',
            border: '1px dashed #CBD5E1',
            backgroundColor: '#F1F5F9',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            color: '#94A3B8',
          }}
          title="No Foto"
        >
          <Package size={22} color="#94A3B8" />
          <span style={{ fontSize: '9px', fontWeight: 700, color: '#94A3B8' }}>No Foto</span>
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span
              style={{
                padding: '2px 6px',
                borderRadius: '5px',
                fontSize: '9.5px',
                fontWeight: 800,
                backgroundColor: '#2563EB',
                color: '#ffffff',
                letterSpacing: '0.04em',
              }}
            >
              {material.sector || 'BANGUNAN'}
            </span>
            <span
              style={{
                padding: '2px 6px',
                borderRadius: '5px',
                fontSize: '9.5px',
                fontWeight: 800,
                backgroundColor: '#EFF6FF',
                color: '#2563EB',
                border: '1px solid #DBEAFE',
                letterSpacing: '0.04em',
              }}
            >
              MATERIAL
            </span>
          </div>

          <div
            style={{
              fontWeight: 800,
              color: '#0F172A',
              fontSize: '12.5px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {material.brand || 'Gresik'} {material.product || 'PCC'}
          </div>

          <div
            style={{
              fontSize: '10.5px',
              color: '#64748B',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {material.specification || 'SNI 7064:2014, Karung 50kg'}
          </div>

          <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
            <button
              onClick={() => onEditMaterial && onEditMaterial(material)}
              style={{
                padding: '3px 8px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#ffffff',
                fontSize: '10.5px',
                fontWeight: 700,
                color: '#334155',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
              }}
            >
              <Edit2 size={10} />
              Edit
            </button>
            <button
              onClick={() => onAddPrice && onAddPrice(material)}
              style={{
                padding: '3px 8px',
                borderRadius: '6px',
                border: '1px solid #DBEAFE',
                backgroundColor: '#EFF6FF',
                fontSize: '10.5px',
                fontWeight: 700,
                color: '#2563EB',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
              }}
            >
              <Plus size={10} />
              + Tambah Merek
            </button>
          </div>
        </div>
      </div>

      {/* 3. Sub-tabs Segmented Control */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          backgroundColor: '#F1F5F9',
          padding: '3px',
          borderRadius: '9px',
          gap: '2px',
        }}
      >
        {(['OVERVIEW', 'HARGA', 'SPESIFIKASI', 'MEREK', 'RIWAYAT', 'PROVENANCE'] as const).map((tab) => {
          const isSelected = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                border: 'none',
                background: isSelected ? '#ffffff' : 'transparent',
                color: isSelected ? '#0F172A' : '#64748B',
                fontWeight: isSelected ? 800 : 600,
                fontSize: '9.5px',
                padding: '5px 2px',
                borderRadius: '7px',
                cursor: 'pointer',
                boxShadow: isSelected ? '0 1px 3px rgba(15, 23, 42, 0.08)' : 'none',
                transition: 'all 0.15s ease',
                textAlign: 'center',
              }}
            >
              {tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          );
        })}
      </div>

      {/* 4. Tab Body Content */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* SECTION: Informasi Material */}
        <div>
          <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '8px' }}>
            Informasi Material
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
            <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px' }}>
              <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>Sektor</div>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>{material.sector || 'Bangunan'}</div>
            </div>
            <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px' }}>
              <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>Kategori</div>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>{material.category || 'Semen & Pasir'}</div>
            </div>
            <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px' }}>
              <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>Satuan Dasar</div>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>{material.unit}</div>
            </div>
            <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px' }}>
              <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>Tier Harga</div>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>{material.priceTier || 'Standard'}</div>
            </div>
          </div>
        </div>

        {/* SECTION: 3-LAYER PRICING (Referensi -> Proyek -> Final RAB) */}
        {(() => {
          const resolved = projectPriceEngine.resolveFinalPrice({
            materialIdOrCode: material.materialCode || material.id,
            projectId,
          });
          const projPrice = projectPriceEngine.getProjectPrice(projectId, material.materialCode || material.id);
          const override = projectPriceEngine.getProjectOverride(projectId, material.materialCode || material.id);

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* 1. HARGA REFERENSI NASIONAL */}
              <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                    1. Harga Referensi Nasional
                  </span>
                  <span style={{ fontSize: '9.5px', color: '#64748B' }}>EZRAB Master 2026</span>
                </div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>
                  Rp {(basePrice > 0 ? basePrice : 74000).toLocaleString('id-ID')}
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', marginLeft: '4px' }}>/ {material.unit}</span>
                </div>
                <div style={{ fontSize: '10px', color: '#64748B', marginTop: '2px' }}>
                  Wilayah: {primaryPriceRec?.region.province || 'Jawa Barat'} • Sumber: {primaryPriceRec?.sourceName || 'Katalog Nasional'}
                </div>
              </div>

              {/* 2. HARGA PROYEK AKTIF */}
              <div
                style={{
                  backgroundColor: projPrice ? '#EFF6FF' : '#FAFAFA',
                  border: projPrice ? '1px solid #BFDBFE' : '1px dashed #CBD5E1',
                  borderRadius: '10px',
                  padding: '10px 12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: projPrice ? '#1D4ED8' : '#64748B', textTransform: 'uppercase' }}>
                    2. Harga Proyek ({projectName})
                  </span>
                  {projPrice && (
                    <span style={{ fontSize: '9.5px', fontWeight: 800, backgroundColor: '#DBEAFE', color: '#1E40AF', padding: '1px 5px', borderRadius: '4px' }}>
                      {projPrice.source}
                    </span>
                  )}
                </div>

                {projPrice ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: '16px', fontWeight: 900, color: '#1E40AF' }}>
                        Rp {projPrice.price.toLocaleString('id-ID')}
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#2563EB', marginLeft: '4px' }}>/ {projPrice.unit}</span>
                      </div>
                      <div style={{ fontSize: '11px', fontWeight: 800, color: resolved.varianceAmount < 0 ? '#059669' : '#DC2626' }}>
                        {resolved.varianceAmount < 0 ? '' : '+'}{resolved.varianceAmount.toLocaleString('id-ID')} ({resolved.variancePercent}%)
                      </div>
                    </div>
                    <div style={{ fontSize: '10.5px', color: '#475569', marginTop: '4px' }}>
                      Supplier: <strong>{projPrice.supplierName || 'Supplier Proyek'}</strong>
                      {projPrice.referenceNumber && ` • Ref: ${projPrice.referenceNumber}`}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '11px', color: '#64748B', margin: '4px 0' }}>
                    Belum ada harga khusus proyek ini (mengikuti harga acuan).
                  </div>
                )}

                <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => onOpenProjectPriceModal && onOpenProjectPriceModal(material)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: '1px solid #93C5FD',
                      backgroundColor: '#ffffff',
                      color: '#2563EB',
                      fontSize: '10.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {projPrice ? 'Ubah Harga Proyek' : '+ Tambah Harga Proyek'}
                  </button>
                </div>
              </div>

              {/* 3. HARGA FINAL YANG DIGUNAKAN DI RAB */}
              <div
                style={{
                  backgroundColor: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  borderRadius: '10px',
                  padding: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#166534', textTransform: 'uppercase' }}>
                    3. Harga Final RAB
                  </span>
                  <span
                    style={{
                      fontSize: '9.5px',
                      fontWeight: 800,
                      backgroundColor: resolved.status === 'OVERRIDE' ? '#FEF3C7' : resolved.status === 'PROJECT_PRICE' ? '#DBEAFE' : '#DCFCE7',
                      color: resolved.status === 'OVERRIDE' ? '#92400E' : resolved.status === 'PROJECT_PRICE' ? '#1E40AF' : '#15803D',
                      padding: '2px 6px',
                      borderRadius: '4px',
                    }}
                  >
                    ● {resolved.status === 'OVERRIDE' ? 'Override User' : resolved.status === 'PROJECT_PRICE' ? 'Project Price' : 'EZRAB Reference'}
                  </span>
                </div>

                <div style={{ fontSize: '20px', fontWeight: 900, color: '#14532D' }}>
                  Rp {resolved.price.toLocaleString('id-ID')}
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#166534', marginLeft: '4px' }}>/ {resolved.unit}</span>
                </div>
                <div style={{ fontSize: '10.5px', color: '#15803D', marginTop: '4px' }}>
                  {resolved.explanation}
                </div>
              </div>
            </div>
          );
        })()}

        {/* SECTION: Perbandingan Harga Merek */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Perbandingan Harga Merek
            </div>
            <button
              onClick={() => onViewAllComparisons && onViewAllComparisons(material)}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#2563EB',
                fontSize: '10.5px',
                fontWeight: 700,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Lihat Semua →
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {brandComparisons.map((b, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: b.isCurrent ? '1.5px solid #2563EB' : '1px solid #E2E8F0',
                  backgroundColor: b.isCurrent ? '#EFF6FF' : '#ffffff',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '11.5px', color: '#0F172A' }}>{b.name}</div>
                  <div style={{ fontSize: '10px', color: '#64748B' }}>{b.tier}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: '12px', color: '#0F172A' }}>
                    Rp {b.price.toLocaleString('id-ID')}
                  </div>
                  <div style={{ fontSize: '9.5px', color: b.isCurrent ? '#2563EB' : '#64748B', fontWeight: 600 }}>
                    {b.isCurrent ? 'Current' : 'Alternatif'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SECTION: Harga & Tren */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Harga & Tren
            </div>
            <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#059669', display: 'flex', alignItems: 'center', gap: '2px' }}>
              <TrendingUp size={11} /> +2.3% (30 hari)
            </span>
          </div>

          <div
            style={{
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '10px',
              padding: '10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ height: '42px', width: '100%', position: 'relative' }}>
              <svg viewBox="0 0 200 42" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
                <path d="M 0,32 Q 50,30 100,24 T 200,10" fill="none" stroke="#2563EB" strokeWidth="2.5" />
                <path d="M 0,32 Q 50,30 100,24 T 200,10 L 200,42 L 0,42 Z" fill="rgba(37,99,235,0.08)" />
                <circle cx="200" cy="10" r="3.5" fill="#2563EB" />
              </svg>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: '#94A3B8' }}>
              <span>Jan 2026</span>
              <span>Feb 2026</span>
              <span>Mar 2026 (Now)</span>
            </div>
          </div>
        </div>

        {/* SECTION: Provenance */}
        <div>
          <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '8px' }}>
            Provenance
          </div>
          <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Sumber Acuan:</span>
              <span style={{ fontWeight: 700, color: '#0F172A' }}>SE DJBK No. 12/2026</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Integritas Mutu:</span>
              <span style={{ fontWeight: 700, color: '#059669' }}>SNI 7064:2014</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Hash Dokumen:</span>
              <span style={{ fontFamily: 'monospace', fontSize: '9.5px', color: '#64748B' }}>sha256:4b91...8c2</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
