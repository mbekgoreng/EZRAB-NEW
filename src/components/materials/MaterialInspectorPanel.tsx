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
          backgroundColor: 'var(--ez-color-surface)',
          border: '1px solid var(--ez-color-border-line)',
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
            <h2 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: 0 }}>
              {labor.name}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--ez-color-primary)', fontWeight: 700 }}>
                {labor.code}
              </span>
              {labor.englishName && (
                <span style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', fontStyle: 'italic' }}>
                  ({labor.englishName})
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', color: 'var(--ez-color-text-faint)', cursor: 'pointer', padding: '4px' }}
            title="Tutup Panel"
          >
            <X size={16} />
          </button>
        </div>

        {/* Hero Card */}
        <div style={{ background: 'var(--ez-color-surface-secondary)', border: '1px solid var(--ez-color-border-line)', borderRadius: 'var(--ez-radius-control)', padding: '12px', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div
            style={{
              width: '60px',
              height: '60px',
              borderRadius: '10px',
              backgroundColor: 'var(--ez-hue-amber-bg)',
              color: 'var(--ez-hue-amber-text)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--ez-hue-amber-border)',
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
              <span style={{ fontSize: '9.5px', fontWeight: 700, backgroundColor: 'var(--ez-hue-blue-bg)', color: 'var(--ez-color-primary)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--ez-hue-blue-border)' }}>
                {labor.skillLevel}
              </span>
            </div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>{labor.subcategory || labor.roleCategory}</div>
            <div style={{ fontSize: '10.5px', color: 'var(--ez-color-text-muted)' }}>{labor.skkLevel || 'SKK Jenjang Standar'}</div>
          </div>
        </div>

        {/* Current Rate Card */}
        <div style={{ backgroundColor: 'var(--ez-hue-green-bg)', border: '1px solid var(--ez-hue-green-border)', borderRadius: 'var(--ez-radius-control)', padding: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ez-hue-green-text)', textTransform: 'uppercase' }}>
              Upah Harian Standar (OH)
            </span>
            <span style={{ fontSize: '10px', fontWeight: 700, backgroundColor: 'var(--ez-hue-green-bg)', color: 'var(--ez-hue-green-text)', padding: '2px 6px', borderRadius: '4px' }}>
              {labor.workHoursPerDay || 7} Jam Kerja
            </span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--ez-hue-green-text)', letterSpacing: '-0.02em' }}>
            Rp {adjustedRate.priceOH.toLocaleString('id-ID')}
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-hue-green-text)', marginLeft: '4px' }}>/ OH</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--ez-hue-green-text)', marginTop: '4px', display: 'flex', gap: '12px' }}>
            <span>Per Jam: <strong>Rp {adjustedRate.priceOJ.toLocaleString('id-ID')} / OJ</strong></span>
            <span>Lembur: <strong>Rp {labor.overtimeHourlyRate.toLocaleString('id-ID')} / jam</strong></span>
          </div>
          {labor.minWage && labor.maxWage && (
            <div style={{ fontSize: '10.5px', color: 'var(--ez-hue-green-text)', marginTop: '4px' }}>
              Rentang Pasar: Rp {labor.minWage.toLocaleString('id-ID')} - Rp {labor.maxWage.toLocaleString('id-ID')} / OH
            </div>
          )}
          <div style={{ fontSize: '10.5px', color: '#4ADE80', marginTop: '6px', borderTop: '1px solid var(--ez-hue-green-bg)', paddingTop: '6px' }}>
            Wilayah: {adjustedRate.province} (Faktor Wilayah: {adjustedRate.factor}x)
          </div>
        </div>

        {/* Productivity Rate (If Available) */}
        {labor.productivity && (
          <div style={{ backgroundColor: 'var(--ez-hue-blue-bg)', border: '1px solid var(--ez-hue-blue-border)', borderRadius: '10px', padding: '10px' }}>
            <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--ez-color-primary-hover)', textTransform: 'uppercase', marginBottom: '2px' }}>
              Standar Output Produktivitas
            </div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ez-color-primary-hover)' }}>
              {labor.productivity.standardRate} {labor.productivity.unit}
            </div>
            <div style={{ fontSize: '10.5px', color: 'var(--ez-color-text-muted)', marginTop: '2px' }}>
              {labor.productivity.description}
            </div>
          </div>
        )}

        {/* Aliases & Synonyms */}
        {labor.aliases && labor.aliases.length > 0 && (
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ez-color-text-body)', textTransform: 'uppercase', marginBottom: '6px' }}>
              Alias & Kata Kunci:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {labor.aliases.map((alias, idx) => (
                <span key={idx} style={{ backgroundColor: 'var(--ez-color-surface-tertiary)', color: 'var(--ez-color-text-slate)', padding: '2px 7px', borderRadius: '5px', fontSize: '10.5px' }}>
                  {alias}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Duties & Responsibilities */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ez-color-text-body)', textTransform: 'uppercase', marginBottom: '6px' }}>
            Uraian Tugas Pokok:
          </div>
          <div style={{ backgroundColor: 'var(--ez-color-surface-secondary)', border: '1px solid var(--ez-color-border-line)', borderRadius: '8px', padding: '10px' }}>
            {labor.duties.map((duty, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '6px', fontSize: '11.5px', color: 'var(--ez-color-text-slate)', marginBottom: idx !== labor.duties.length - 1 ? '6px' : 0 }}>
                <Check size={14} color="var(--ez-hue-green-text)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>{duty}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Safety & K3 Requirements */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ez-color-text-body)', textTransform: 'uppercase', marginBottom: '6px' }}>
            Standar APD & Keselamatan Kerja (SMKK):
          </div>
          <div style={{ backgroundColor: 'var(--ez-color-danger-soft)', border: '1px solid var(--ez-hue-rose-border)', borderRadius: '8px', padding: '10px' }}>
            {labor.safetyRequirements.map((req, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '6px', fontSize: '11px', color: 'var(--ez-color-danger-strong)', marginBottom: idx !== labor.safetyRequirements.length - 1 ? '4px' : 0 }}>
                <Shield size={13} color="var(--ez-color-danger-strong)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>{req}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Regional Comparison */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ez-color-text-body)', textTransform: 'uppercase', marginBottom: '6px' }}>
            Matriks Upah Regional Indonesia 2026:
          </div>
          <div style={{ border: '1px solid var(--ez-color-border-line)', borderRadius: '8px', overflow: 'hidden', fontSize: '11.5px' }}>
            {[
              { prov: 'DKI Jakarta', f: 1.0 },
              { prov: 'Jawa Barat', f: 0.96 },
              { prov: 'Jawa Timur', f: 0.94 },
              { prov: 'Nusantara (IKN)', f: 1.25 },
              { prov: 'Papua', f: 1.48 },
            ].map((reg, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', backgroundColor: idx % 2 === 0 ? 'var(--ez-color-surface)' : 'var(--ez-color-surface-secondary)', borderBottom: idx < 4 ? '1px solid var(--ez-color-surface-tertiary)' : 'none' }}>
                <span style={{ color: 'var(--ez-color-text-slate)' }}>{reg.prov}</span>
                <span style={{ fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>
                  Rp {Math.round((labor.basePriceOH * reg.f) / 500 * 500).toLocaleString('id-ID')} / OH
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Provenance */}
        <div style={{ padding: '8px 10px', backgroundColor: 'var(--ez-color-surface-secondary)', borderRadius: '8px', border: '1px solid var(--ez-color-border-line)', fontSize: '10.5px', color: 'var(--ez-color-text-muted)' }}>
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
          backgroundColor: 'var(--ez-color-surface)',
          border: '1px solid var(--ez-color-border-line)',
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
            <h2 style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: 0, lineHeight: 1.3 }}>
              {equipment.name}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--ez-color-primary)', fontWeight: 700 }}>
                {equipment.code}
              </span>
              {equipment.englishName && (
                <span style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', fontStyle: 'italic' }}>
                  ({equipment.englishName})
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', color: 'var(--ez-color-text-faint)', cursor: 'pointer', padding: '4px' }}
            title="Tutup Panel"
          >
            <X size={16} />
          </button>
        </div>

        {/* Hero Card */}
        <div style={{ background: 'var(--ez-color-surface-secondary)', border: '1px solid var(--ez-color-border-line)', borderRadius: 'var(--ez-radius-control)', padding: '12px', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div
            style={{
              width: '60px',
              height: '60px',
              borderRadius: '10px',
              backgroundColor: 'var(--ez-hue-blue-bg)',
              color: 'var(--ez-color-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--ez-hue-blue-border)',
              flexShrink: 0,
            }}
          >
            <Truck size={28} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '4px' }}>
              <span style={{ fontSize: '9.5px', fontWeight: 800, backgroundColor: 'var(--ez-color-primary)', color: '#FFF', padding: '2px 6px', borderRadius: '4px' }}>
                {equipment.category}
              </span>
              <span style={{ fontSize: '9.5px', fontWeight: 700, backgroundColor: 'var(--ez-hue-green-bg)', color: 'var(--ez-hue-green-text)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--ez-hue-green-border)' }}>
                {equipment.ownershipMode || 'RENTED'}
              </span>
            </div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>{equipment.capacity}</div>
            <div style={{ fontSize: '10.5px', color: 'var(--ez-color-text-muted)' }}>Daya: {equipment.enginePowerHP > 0 ? `${equipment.enginePowerHP} HP` : 'Motor Listrik'}</div>
          </div>
        </div>

        {/* Current Rental Rate Card */}
        <div style={{ backgroundColor: 'var(--ez-hue-green-bg)', border: '1px solid var(--ez-hue-green-border)', borderRadius: 'var(--ez-radius-control)', padding: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ez-hue-green-text)', textTransform: 'uppercase' }}>
              Tarif Sewa Acuan 2026
            </span>
            <span style={{ fontSize: '10px', fontWeight: 700, backgroundColor: 'var(--ez-hue-green-bg)', color: 'var(--ez-hue-green-text)', padding: '2px 6px', borderRadius: '4px' }}>
              {equipment.operatorIncluded ? 'Include Operator & BBM' : 'Unit Only'}
            </span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--ez-hue-green-text)', letterSpacing: '-0.02em' }}>
            Rp {adjustedRate.pricePerHour.toLocaleString('id-ID')}
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-hue-green-text)', marginLeft: '4px' }}>/ jam</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--ez-hue-green-text)', marginTop: '4px', display: 'flex', gap: '12px' }}>
            <span>Per Hari (8 Jam): <strong>Rp {adjustedRate.pricePerDay.toLocaleString('id-ID')}</strong></span>
          </div>
          {adjustedRate.pricePerMonth > 0 && (
            <div style={{ fontSize: '11px', color: 'var(--ez-hue-green-text)', marginTop: '2px' }}>
              Sewa Bulanan (200 jam): <strong>Rp {adjustedRate.pricePerMonth.toLocaleString('id-ID')}</strong>
            </div>
          )}
          <div style={{ fontSize: '10.5px', color: '#4ADE80', marginTop: '6px', borderTop: '1px solid var(--ez-hue-green-bg)', paddingTop: '6px' }}>
            Wilayah: {adjustedRate.province}
          </div>
        </div>

        {/* Productivity Profile */}
        {equipment.productivity && (
          <div style={{ backgroundColor: 'var(--ez-hue-blue-bg)', border: '1px solid var(--ez-hue-blue-border)', borderRadius: '10px', padding: '10px' }}>
            <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--ez-color-primary-hover)', textTransform: 'uppercase', marginBottom: '2px' }}>
              Kapasitas Output & Produktivitas
            </div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ez-color-primary-hover)' }}>
              {equipment.productivity.standardOutputPerHour} {equipment.productivity.unit}
            </div>
            <div style={{ fontSize: '10.5px', color: 'var(--ez-color-text-muted)', marginTop: '2px' }}>
              {equipment.productivity.description}
            </div>
          </div>
        )}

        {/* Operating Cost Breakdown */}
        {equipment.operatingCosts && (
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ez-color-text-body)', textTransform: 'uppercase', marginBottom: '6px' }}>
              Rincian Biaya Operasional / Jam:
            </div>
            <div style={{ border: '1px solid var(--ez-color-border-line)', borderRadius: '8px', overflow: 'hidden', fontSize: '11px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 10px', backgroundColor: 'var(--ez-color-surface-secondary)', borderBottom: '1px solid var(--ez-color-border-line)' }}>
                <span>BBM ({equipment.fuelType}):</span>
                <strong>Rp {equipment.operatingCosts.fuelCostPerHour.toLocaleString('id-ID')}/jam</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 10px', backgroundColor: 'var(--ez-color-surface)', borderBottom: '1px solid var(--ez-color-border-line)' }}>
                <span>Pelumas & Oli:</span>
                <strong>Rp {equipment.operatingCosts.lubricantCostPerHour.toLocaleString('id-ID')}/jam</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 10px', backgroundColor: 'var(--ez-color-surface-secondary)', borderBottom: '1px solid var(--ez-color-border-line)' }}>
                <span>Operator:</span>
                <strong>Rp {equipment.operatingCosts.operatorCostPerHour.toLocaleString('id-ID')}/jam</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 10px', backgroundColor: 'var(--ez-color-surface)', borderBottom: '1px solid var(--ez-color-border-line)' }}>
                <span>Maintenance & Part:</span>
                <strong>Rp {equipment.operatingCosts.maintenanceCostPerHour.toLocaleString('id-ID')}/jam</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', backgroundColor: 'var(--ez-hue-blue-bg)', fontWeight: 800, color: 'var(--ez-color-primary-hover)' }}>
                <span>Total Operasional:</span>
                <span>Rp {equipment.operatingCosts.totalOperatingCostPerHour.toLocaleString('id-ID')}/jam</span>
              </div>
            </div>
          </div>
        )}

        {/* Technical Specs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div style={{ padding: '8px 10px', backgroundColor: 'var(--ez-color-surface-secondary)', borderRadius: '8px', border: '1px solid var(--ez-color-border-line)' }}>
            <div style={{ fontSize: '10px', color: 'var(--ez-color-text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Fuel size={12} color="var(--ez-hue-amber-text-deep)" /> Konsumsi BBM
            </div>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ez-color-text-primary)', marginTop: '2px' }}>
              {equipment.fuelConsumptionLiterPerHour > 0 ? `${equipment.fuelConsumptionLiterPerHour} L / jam` : 'Listrik / Manual'}
            </div>
          </div>
          <div style={{ padding: '8px 10px', backgroundColor: 'var(--ez-color-surface-secondary)', borderRadius: '8px', border: '1px solid var(--ez-color-border-line)' }}>
            <div style={{ fontSize: '10px', color: 'var(--ez-color-text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Truck size={12} color="var(--ez-color-primary)" /> Estimasi Mob/Demob
            </div>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ez-color-text-primary)', marginTop: '2px' }}>
              Rp {equipment.mobDemobEstimate.toLocaleString('id-ID')}
            </div>
          </div>
        </div>

        {/* Operational Specification */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ez-color-text-body)', textTransform: 'uppercase', marginBottom: '6px' }}>
            Deskripsi & Lingkup Operasi:
          </div>
          <div style={{ backgroundColor: 'var(--ez-color-surface-secondary)', border: '1px solid var(--ez-color-border-line)', borderRadius: '8px', padding: '10px', fontSize: '11.5px', color: 'var(--ez-color-text-slate)', lineHeight: 1.5 }}>
            {equipment.specification}
          </div>
        </div>

        {/* Recommended Brands */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ez-color-text-body)', textTransform: 'uppercase', marginBottom: '6px' }}>
            Merek & Model Rekomendasi:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {equipment.recommendedBrands.map((b, idx) => (
              <span key={idx} style={{ backgroundColor: 'var(--ez-hue-blue-bg)', border: '1px solid var(--ez-hue-blue-border)', color: 'var(--ez-color-primary-hover)', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600 }}>
                {b}
              </span>
            ))}
          </div>
        </div>

        {/* Provenance */}
        <div style={{ padding: '8px 10px', backgroundColor: 'var(--ez-color-surface-secondary)', borderRadius: '8px', border: '1px solid var(--ez-color-border-line)', fontSize: '10.5px', color: 'var(--ez-color-text-muted)' }}>
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
          backgroundColor: 'var(--ez-color-surface)',
          border: '1px solid var(--ez-color-border-line)',
          borderRadius: '16px',
          padding: '24px 16px',
          textAlign: 'center',
          color: 'var(--ez-color-text-muted)',
        }}
      >
        <Package size={32} color="var(--ez-color-border-strong)" style={{ margin: '0 auto 8px auto' }} />
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
        backgroundColor: 'var(--ez-color-surface)',
        border: '1px solid var(--ez-color-border-line)',
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
              color: 'var(--ez-color-text-primary)',
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
          <div style={{ fontFamily: 'monospace', fontSize: '10.5px', color: 'var(--ez-color-text-faint)', marginTop: '2px' }}>
            {material.materialCode}
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            padding: '4px',
            borderRadius: '8px',
            color: 'var(--ez-color-text-faint)',
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
          background: 'var(--ez-color-surface-secondary)',
          border: '1px solid var(--ez-color-border-line)',
          borderRadius: 'var(--ez-radius-control)',
          padding: '12px',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            width: '68px',
            height: '68px',
            borderRadius: '10px',
            border: '1px dashed var(--ez-color-border-strong)',
            backgroundColor: 'var(--ez-color-surface-tertiary)',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            color: 'var(--ez-color-text-faint)',
          }}
          title="No Foto"
        >
          <Package size={22} color="var(--ez-color-text-faint)" />
          <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--ez-color-text-faint)' }}>No Foto</span>
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span
              style={{
                padding: '2px 6px',
                borderRadius: '5px',
                fontSize: '9.5px',
                fontWeight: 800,
                backgroundColor: 'var(--ez-color-primary)',
                color: '#FFFFFF',
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
                backgroundColor: 'var(--ez-hue-blue-bg)',
                color: 'var(--ez-color-primary)',
                border: '1px solid var(--ez-hue-blue-border)',
                letterSpacing: '0.04em',
              }}
            >
              MATERIAL
            </span>
          </div>

          <div
            style={{
              fontWeight: 800,
              color: 'var(--ez-color-text-primary)',
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
              color: 'var(--ez-color-text-muted)',
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
                border: '1px solid var(--ez-color-border-strong)',
                backgroundColor: 'var(--ez-color-surface)',
                fontSize: '10.5px',
                fontWeight: 700,
                color: 'var(--ez-color-text-body)',
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
                border: '1px solid var(--ez-hue-blue-border)',
                backgroundColor: 'var(--ez-hue-blue-bg)',
                fontSize: '10.5px',
                fontWeight: 700,
                color: 'var(--ez-color-primary)',
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
        className="mat-inspector-subtabs"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          backgroundColor: 'var(--ez-color-surface-tertiary)',
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
                background: isSelected ? 'var(--ez-color-surface)' : 'transparent',
                color: isSelected ? 'var(--ez-color-text)' : 'var(--ez-color-text-muted)',
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
          <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--ez-color-text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '8px' }}>
            Informasi Material
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
            <div style={{ backgroundColor: 'var(--ez-color-surface-secondary)', border: '1px solid var(--ez-color-border-line)', borderRadius: '8px', padding: '8px 10px' }}>
              <div style={{ fontSize: '10px', color: 'var(--ez-color-text-muted)', fontWeight: 600 }}>Sektor</div>
              <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ez-color-text-primary)', marginTop: '2px' }}>{material.sector || 'Bangunan'}</div>
            </div>
            <div style={{ backgroundColor: 'var(--ez-color-surface-secondary)', border: '1px solid var(--ez-color-border-line)', borderRadius: '8px', padding: '8px 10px' }}>
              <div style={{ fontSize: '10px', color: 'var(--ez-color-text-muted)', fontWeight: 600 }}>Kategori</div>
              <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ez-color-text-primary)', marginTop: '2px' }}>{material.category || 'Semen & Pasir'}</div>
            </div>
            <div style={{ backgroundColor: 'var(--ez-color-surface-secondary)', border: '1px solid var(--ez-color-border-line)', borderRadius: '8px', padding: '8px 10px' }}>
              <div style={{ fontSize: '10px', color: 'var(--ez-color-text-muted)', fontWeight: 600 }}>Satuan Dasar</div>
              <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ez-color-text-primary)', marginTop: '2px' }}>{material.unit}</div>
            </div>
            <div style={{ backgroundColor: 'var(--ez-color-surface-secondary)', border: '1px solid var(--ez-color-border-line)', borderRadius: '8px', padding: '8px 10px' }}>
              <div style={{ fontSize: '10px', color: 'var(--ez-color-text-muted)', fontWeight: 600 }}>Tier Harga</div>
              <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ez-color-text-primary)', marginTop: '2px' }}>{material.priceTier || 'Standard'}</div>
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
              <div style={{ backgroundColor: 'var(--ez-color-surface-secondary)', border: '1px solid var(--ez-color-border-line)', borderRadius: '10px', padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase' }}>
                    1. Harga Referensi Nasional
                  </span>
                  <span style={{ fontSize: '9.5px', color: 'var(--ez-color-text-muted)' }}>EZRAB Master 2026</span>
                </div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ez-color-text-primary)' }}>
                  Rp {(basePrice > 0 ? basePrice : 74000).toLocaleString('id-ID')}
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ez-color-text-muted)', marginLeft: '4px' }}>/ {material.unit}</span>
                </div>
                <div style={{ fontSize: '10px', color: 'var(--ez-color-text-muted)', marginTop: '2px' }}>
                  Wilayah: {primaryPriceRec?.region.province || 'Jawa Barat'} • Sumber: {primaryPriceRec?.sourceName || 'Katalog Nasional'}
                </div>
              </div>

              {/* 2. HARGA PROYEK AKTIF */}
              <div
                style={{
                  backgroundColor: projPrice ? 'var(--ez-hue-blue-bg)' : 'var(--ez-color-surface-faint)',
                  border: projPrice ? '1px solid var(--ez-hue-blue-border)' : '1px dashed var(--ez-color-border-strong)',
                  borderRadius: '10px',
                  padding: '10px 12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: projPrice ? 'var(--ez-color-primary-hover)' : 'var(--ez-color-text-muted)', textTransform: 'uppercase' }}>
                    2. Harga Proyek ({projectName})
                  </span>
                  {projPrice && (
                    <span style={{ fontSize: '9.5px', fontWeight: 800, backgroundColor: 'var(--ez-hue-blue-border)', color: 'var(--ez-color-primary-hover)', padding: '1px 5px', borderRadius: '4px' }}>
                      {projPrice.source}
                    </span>
                  )}
                </div>

                {projPrice ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--ez-color-primary-hover)' }}>
                        Rp {projPrice.price.toLocaleString('id-ID')}
                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ez-color-primary)', marginLeft: '4px' }}>/ {projPrice.unit}</span>
                      </div>
                      <div style={{ fontSize: '11px', fontWeight: 800, color: resolved.varianceAmount < 0 ? 'var(--ez-hue-green-text)' : 'var(--ez-color-danger-strong)' }}>
                        {resolved.varianceAmount < 0 ? '' : '+'}{resolved.varianceAmount.toLocaleString('id-ID')} ({resolved.variancePercent}%)
                      </div>
                    </div>
                    <div style={{ fontSize: '10.5px', color: 'var(--ez-color-text-slate)', marginTop: '4px' }}>
                      Supplier: <strong>{projPrice.supplierName || 'Supplier Proyek'}</strong>
                      {projPrice.referenceNumber && ` • Ref: ${projPrice.referenceNumber}`}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', margin: '4px 0' }}>
                    Belum ada harga khusus proyek ini (mengikuti harga acuan).
                  </div>
                )}

                <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => onOpenProjectPriceModal && onOpenProjectPriceModal(material)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: '1px solid var(--ez-hue-blue-border)',
                      backgroundColor: 'var(--ez-color-surface)',
                      color: 'var(--ez-color-primary)',
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
                  backgroundColor: 'var(--ez-hue-green-bg)',
                  border: '1px solid var(--ez-hue-green-border)',
                  borderRadius: '10px',
                  padding: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--ez-hue-green-text)', textTransform: 'uppercase' }}>
                    3. Harga Final RAB
                  </span>
                  <span
                    style={{
                      fontSize: '9.5px',
                      fontWeight: 800,
                      backgroundColor: resolved.status === 'OVERRIDE' ? 'var(--ez-hue-amber-bg)' : resolved.status === 'PROJECT_PRICE' ? 'var(--ez-hue-blue-border)' : 'var(--ez-hue-green-bg)',
                      color: resolved.status === 'OVERRIDE' ? 'var(--ez-hue-amber-text)' : resolved.status === 'PROJECT_PRICE' ? 'var(--ez-color-primary-hover)' : 'var(--ez-hue-green-text)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                    }}
                  >
                    ● {resolved.status === 'OVERRIDE' ? 'Override User' : resolved.status === 'PROJECT_PRICE' ? 'Project Price' : 'EZRAB Reference'}
                  </span>
                </div>

                <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--ez-hue-green-text)' }}>
                  Rp {resolved.price.toLocaleString('id-ID')}
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ez-hue-green-text)', marginLeft: '4px' }}>/ {resolved.unit}</span>
                </div>
                <div style={{ fontSize: '10.5px', color: 'var(--ez-hue-green-text)', marginTop: '4px' }}>
                  {resolved.explanation}
                </div>
              </div>
            </div>
          );
        })()}

        {/* SECTION: Perbandingan Harga Merek */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--ez-color-text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Perbandingan Harga Merek
            </div>
            <button
              onClick={() => onViewAllComparisons && onViewAllComparisons(material)}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--ez-color-primary)',
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
                  border: b.isCurrent ? '1.5px solid var(--ez-color-primary)' : '1px solid var(--ez-color-border-line)',
                  backgroundColor: b.isCurrent ? 'var(--ez-hue-blue-bg)' : 'var(--ez-color-surface)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '11.5px', color: 'var(--ez-color-text-primary)' }}>{b.name}</div>
                  <div style={{ fontSize: '10px', color: 'var(--ez-color-text-muted)' }}>{b.tier}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: '12px', color: 'var(--ez-color-text-primary)' }}>
                    Rp {b.price.toLocaleString('id-ID')}
                  </div>
                  <div style={{ fontSize: '9.5px', color: b.isCurrent ? 'var(--ez-color-primary)' : 'var(--ez-color-text-muted)', fontWeight: 600 }}>
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
            <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--ez-color-text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Harga & Tren
            </div>
            <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--ez-hue-green-text)', display: 'flex', alignItems: 'center', gap: '2px' }}>
              <TrendingUp size={11} /> +2.3% (30 hari)
            </span>
          </div>

          <div
            style={{
              backgroundColor: 'var(--ez-color-surface-secondary)',
              border: '1px solid var(--ez-color-border-line)',
              borderRadius: '10px',
              padding: '10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ height: '42px', width: '100%', position: 'relative' }}>
              <svg viewBox="0 0 200 42" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
                <path d="M 0,32 Q 50,30 100,24 T 200,10" fill="none" stroke="var(--ez-color-primary)" strokeWidth="2.5" />
                <path d="M 0,32 Q 50,30 100,24 T 200,10 L 200,42 L 0,42 Z" fill="rgba(37,99,235,0.08)" />
                <circle cx="200" cy="10" r="3.5" fill="var(--ez-color-primary)" />
              </svg>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: 'var(--ez-color-text-faint)' }}>
              <span>Jan 2026</span>
              <span>Feb 2026</span>
              <span>Mar 2026 (Now)</span>
            </div>
          </div>
        </div>

        {/* SECTION: Provenance */}
        <div>
          <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--ez-color-text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '8px' }}>
            Provenance
          </div>
          <div style={{ backgroundColor: 'var(--ez-color-surface-secondary)', border: '1px solid var(--ez-color-border-line)', borderRadius: '10px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--ez-color-text-muted)' }}>Sumber Acuan:</span>
              <span style={{ fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>SE DJBK No. 12/2026</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--ez-color-text-muted)' }}>Integritas Mutu:</span>
              <span style={{ fontWeight: 700, color: 'var(--ez-hue-green-text)' }}>SNI 7064:2014</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--ez-color-text-muted)' }}>Hash Dokumen:</span>
              <span style={{ fontFamily: 'monospace', fontSize: '9.5px', color: 'var(--ez-color-text-muted)' }}>sha256:4b91...8c2</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
