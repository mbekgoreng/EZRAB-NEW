/**
 * MobileMaterialDb — presentasi native mobile untuk daftar database
 * Material & Harga (Gelombang Native 2, 2026-11-10): Material, Upah,
 * Peralatan, dan Harga Proyek (override).
 *
 * Daftar yang dirender = array terpaginasi/filter yang SAMA dengan yang
 * diterima tabel desktop dari MaterialDatabaseView (paginatedMaterials /
 * paginatedLabor / paginatedEquipment / projectPrices), dan pagination di
 * bawah daftar tetap kendali bersama view induk. Harga per baris diturunkan
 * dari service yang sama dengan sel tabel desktop (MaterialDatabaseService,
 * LaborDatabaseService.getAdjustedRate, projectPriceEngine) — tidak ada
 * sumber harga kedua. Ketuk kartu = membuka MaterialInspectorPanel yang
 * sama; tombol override membuka ProjectPriceModal yang sama.
 */
import React from 'react';
import { Pencil, RotateCcw } from 'lucide-react';
import { MaterialMaster } from '../../domain/material/types';
import { LaborDatabaseService, LaborRateRecord } from '../../domain/labor/laborDatabaseService';
import { EquipmentRecord } from '../../domain/equipment/equipmentDatabaseService';
import { projectPriceEngine } from '../../engine/pricing/projectPriceEngine';

export interface MaterialPriceInfo {
  basePrice: number;
  verificationStatus?: string | null;
  regionProvince?: string | null;
  isOverridden: boolean;
}

export interface MobileMaterialDbProps {
  mode: 'MATERIALS' | 'LABOR' | 'EQUIPMENT' | 'PROJECT_PRICE';
  materials?: MaterialMaster[];
  getMaterialPriceInfo?: (mat: MaterialMaster) => MaterialPriceInfo;
  onInspectMaterial?: (mat: MaterialMaster) => void;
  labor?: LaborRateRecord[];
  selectedProvince?: string;
  projectId?: string;
  onInspectLabor?: (lab: LaborRateRecord) => void;
  onOverrideLabor?: (lab: LaborRateRecord) => void;
  equipment?: EquipmentRecord[];
  onInspectEquipment?: (eq: EquipmentRecord) => void;
  onOverrideEquipment?: (eq: EquipmentRecord) => void;
  projectPrices?: any[];
  onEditProjectPrice?: (item: any) => void;
  onResetProjectPrice?: (item: any) => void;
}

const rp = (v: number): string => `Rp ${Math.round(v).toLocaleString('id-ID')}`;

export const MobileMaterialDb: React.FC<MobileMaterialDbProps> = (props) => {
  const { mode, projectId } = props;

  if (mode === 'MATERIALS') {
    const { materials = [], getMaterialPriceInfo, onInspectMaterial } = props;
    if (materials.length === 0) return <div className="mnw-empty">Tidak ada material yang cocok dengan filter.</div>;
    return (
      <div style={{ padding: 12 }}>
        {materials.map((mat) => {
          const info = getMaterialPriceInfo?.(mat);
          const statusLabel = info?.isOverridden
            ? 'Harga Proyek (Override)'
            : info?.verificationStatus === 'VERIFIED'
              ? 'Terverifikasi'
              : info?.verificationStatus === 'EXPIRED'
                ? 'Kedaluwarsa'
                : info?.verificationStatus
                  ? 'Belum terverifikasi'
                  : 'Belum ada harga';
          const statusCls = info?.isOverridden
            ? 'partial'
            : info?.verificationStatus === 'VERIFIED'
              ? 'full'
              : info?.verificationStatus
                ? 'partial'
                : 'missing';
          return (
            <div key={mat.id} className="mnw-ahsp-card" style={{ boxShadow: 'none', border: '1px solid #EEF2F7' }}>
              <button type="button" className="mnw-ahsp-cardbtn" onClick={() => onInspectMaterial?.(mat)}>
                <div className="mnw-ahsp-top">
                  <span className="mnw-ahsp-name">{mat.name}</span>
                  <span className={`mnw-badge ${statusCls}`}>{statusLabel}</span>
                </div>
                <div className="mnw-ahsp-meta">
                  <span className="mnw-code-chip">{mat.materialCode}</span>{' '}
                  {mat.brand || 'Multi-Brand'} · {mat.product || 'Lokal'}
                  {mat.specification ? ` · ${mat.specification}` : ''}
                </div>
                <div className="mnw-ahsp-price-row">
                  <span className="mnw-ahsp-price">{info ? rp(info.basePrice) : '—'}</span>
                  <span className="mnw-ahsp-per">
                    / {mat.unit}
                    {info?.regionProvince ? ` · ${info.regionProvince}` : ''}
                    {mat.priceTier ? ` · ${mat.priceTier}` : ''}
                  </span>
                </div>
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  if (mode === 'LABOR') {
    const { labor = [], selectedProvince = '', onInspectLabor, onOverrideLabor } = props;
    if (labor.length === 0) return <div className="mnw-empty">Tidak ada data upah yang cocok dengan filter.</div>;
    const laborDb = LaborDatabaseService.getInstance();
    return (
      <div style={{ padding: 12 }}>
        {labor.map((lab) => {
          const adjustedRate = laborDb.getAdjustedRate(lab.id, selectedProvince);
          const activeOverride = projectId ? projectPriceEngine.getProjectOverride(projectId, lab.code) : undefined;
          const isOverridden = Boolean(activeOverride && activeOverride.active);
          return (
            <div key={lab.id} className="mnw-ahsp-card" style={{ boxShadow: 'none', border: '1px solid #EEF2F7' }}>
              <button type="button" className="mnw-ahsp-cardbtn" onClick={() => onInspectLabor?.(lab)}>
                <div className="mnw-ahsp-top">
                  <span className="mnw-ahsp-name">{lab.name}</span>
                  <span className={`mnw-badge ${isOverridden ? 'partial' : 'full'}`}>
                    {isOverridden ? 'OVERRIDE PROYEK' : lab.roleCategory}
                  </span>
                </div>
                <div className="mnw-ahsp-meta">
                  <span className="mnw-code-chip">{lab.code}</span> {lab.skkLevel || lab.category} · {lab.unit} ·{' '}
                  {adjustedRate.province} (faktor {adjustedRate.factor}x)
                </div>
                <div className="mnw-ahsp-price-row">
                  <span className="mnw-ahsp-price">
                    {rp(isOverridden && activeOverride ? activeOverride.price : adjustedRate.priceOH)}
                  </span>
                  <span className="mnw-ahsp-per">/ OH · {rp(adjustedRate.priceOJ)} / OJ</span>
                </div>
                {isOverridden && (
                  <div className="mnw-ahsp-meta" style={{ textDecoration: 'line-through' }}>
                    Standar: {rp(adjustedRate.priceOH)} / OH
                  </div>
                )}
              </button>
              {onOverrideLabor && (
                <div className="mnw-detail-actions">
                  <button type="button" className="mnw-action-btn" onClick={() => onOverrideLabor(lab)}>
                    <Pencil size={14} /> Atur Harga Proyek
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  if (mode === 'EQUIPMENT') {
    const { equipment = [], onInspectEquipment, onOverrideEquipment } = props;
    if (equipment.length === 0) return <div className="mnw-empty">Tidak ada data peralatan yang cocok dengan filter.</div>;
    return (
      <div style={{ padding: 12 }}>
        {equipment.map((eq) => {
          const activeOverride = projectId ? projectPriceEngine.getProjectOverride(projectId, eq.code) : undefined;
          const isOverridden = Boolean(activeOverride && activeOverride.active);
          return (
            <div key={eq.id} className="mnw-ahsp-card" style={{ boxShadow: 'none', border: '1px solid #EEF2F7' }}>
              <button type="button" className="mnw-ahsp-cardbtn" onClick={() => onInspectEquipment?.(eq)}>
                <div className="mnw-ahsp-top">
                  <span className="mnw-ahsp-name">{eq.name}</span>
                  <span className={`mnw-badge ${isOverridden ? 'partial' : 'full'}`}>
                    {isOverridden ? 'OVERRIDE PROYEK' : eq.category}
                  </span>
                </div>
                <div className="mnw-ahsp-meta">
                  <span className="mnw-code-chip">{eq.code}</span>
                  {eq.capacity ? ` Kap: ${eq.capacity} ·` : ''} {eq.enginePowerHP > 0 ? `${eq.enginePowerHP} HP ·` : ''}{' '}
                  {eq.unit}
                  {eq.fuelConsumptionLiterPerHour > 0 ? ` · ${eq.fuelConsumptionLiterPerHour} L/jam` : ''}
                </div>
                <div className="mnw-ahsp-price-row">
                  <span className="mnw-ahsp-price">
                    {rp(isOverridden && activeOverride ? activeOverride.price : eq.rentalPricePerHour)}
                  </span>
                  <span className="mnw-ahsp-per">/ jam · {rp(eq.rentalPricePerDay)} / hari</span>
                </div>
                {isOverridden && (
                  <div className="mnw-ahsp-meta" style={{ textDecoration: 'line-through' }}>
                    Standar: {rp(eq.rentalPricePerHour)} / jam
                  </div>
                )}
              </button>
              {onOverrideEquipment && (
                <div className="mnw-detail-actions">
                  <button type="button" className="mnw-action-btn" onClick={() => onOverrideEquipment(eq)}>
                    <Pencil size={14} /> Atur Harga Proyek
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // PROJECT_PRICE — daftar override proyek
  const { projectPrices = [], onEditProjectPrice, onResetProjectPrice } = props;
  if (projectPrices.length === 0)
    return <div className="mnw-empty">Belum ada harga override untuk proyek ini.</div>;
  return (
    <div style={{ padding: 12 }}>
      {projectPrices.map((override: any) => {
        const priceVal = override.price ?? override.projectPrice ?? 0;
        const basePriceVal = override.masterPrice ?? override.basePrice ?? override.minPrice ?? 0;
        const itemCode = override.itemCode || override.resourceCode || override.code || '';
        const itemName = override.notes || override.name || override.resourceName || itemCode;
        return (
          <div key={override.id} className="mnw-ahsp-card" style={{ boxShadow: 'none', border: '1px solid #EEF2F7' }}>
            <div className="mnw-ahsp-top">
              <span className="mnw-ahsp-name">{itemName}</span>
              <span className="mnw-badge partial">{(override.category || 'MATERIAL').toString().toUpperCase()}</span>
            </div>
            <div className="mnw-ahsp-meta">
              <span className="mnw-code-chip">{itemCode}</span> {override.unit || 'unit'}
            </div>
            <div className="mnw-ahsp-price-row">
              <span className="mnw-ahsp-price">{rp(priceVal)}</span>
              <span className="mnw-ahsp-per">master {rp(basePriceVal)}</span>
            </div>
            <div className="mnw-detail-actions">
              <button type="button" className="mnw-action-btn" onClick={() => onEditProjectPrice?.(override)}>
                <Pencil size={14} /> Edit
              </button>
              <button type="button" className="mnw-action-btn danger" onClick={() => onResetProjectPrice?.(override)}>
                <RotateCcw size={14} /> Reset
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default MobileMaterialDb;
