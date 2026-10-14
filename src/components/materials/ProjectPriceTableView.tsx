import React, { useState, useMemo } from 'react';
import {
  Tag,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Edit2,
  FolderKanban,
  Plus,
  Package,
  HardHat,
  Truck,
  Search,
  Filter,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

export interface ProjectPriceItemInput {
  id: string;
  itemCode?: string;
  code?: string;
  resourceCode?: string;
  notes?: string;
  name?: string;
  resourceName?: string;
  category?: string;
  unit?: string;
  basePrice?: number;
  masterPrice?: number;
  minPrice?: number;
  price?: number;
  projectPrice?: number;
  updatedAt?: string;
  lastUpdated?: string;
  effectiveDate?: string;
  provenance?: any;
}

interface ProjectPriceTableViewProps {
  projectPrices: ProjectPriceItemInput[];
  viewDensity?: 'TABLE' | 'COMPACT';
  onEditPrice?: (override: ProjectPriceItemInput) => void;
  onResetPrice?: (override: ProjectPriceItemInput) => void;
  onAddNewOverride?: () => void;
}

export const ProjectPriceTableView: React.FC<ProjectPriceTableViewProps> = ({
  projectPrices,
  viewDensity = 'TABLE',
  onEditPrice,
  onResetPrice,
  onAddNewOverride,
}) => {
  const padY = viewDensity === 'COMPACT' ? '7px' : '10px';

  // Category filter state
  const [filterCategory, setFilterCategory] = useState<'ALL' | 'MATERIAL' | 'LABOR' | 'EQUIPMENT'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [resetConfirmItem, setResetConfirmItem] = useState<ProjectPriceItemInput | null>(null);

  // Metrics
  const metrics = useMemo(() => {
    let totalMaterial = 0;
    let totalLabor = 0;
    let totalEquipment = 0;

    projectPrices.forEach((p) => {
      const cat = (p.category || '').toUpperCase();
      if (cat.includes('LABOR') || cat.includes('UPAH') || cat.includes('TENAGA')) {
        totalLabor++;
      } else if (cat.includes('EQUIP') || cat.includes('ALAT')) {
        totalEquipment++;
      } else {
        totalMaterial++;
      }
    });

    return {
      total: projectPrices.length,
      material: totalMaterial,
      labor: totalLabor,
      equipment: totalEquipment,
    };
  }, [projectPrices]);

  // Filtered Items
  const filteredList = useMemo(() => {
    return projectPrices.filter((p) => {
      const cat = (p.category || '').toUpperCase();
      const isLabor = cat.includes('LABOR') || cat.includes('UPAH') || cat.includes('TENAGA');
      const isEquip = cat.includes('EQUIP') || cat.includes('ALAT');
      const isMat = !isLabor && !isEquip;

      if (filterCategory === 'MATERIAL' && !isMat) return false;
      if (filterCategory === 'LABOR' && !isLabor) return false;
      if (filterCategory === 'EQUIPMENT' && !isEquip) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const code = (p.itemCode || p.code || p.resourceCode || '').toLowerCase();
      const name = (p.notes || p.name || p.resourceName || '').toLowerCase();
      return code.includes(q) || name.includes(q);
    });
  }, [projectPrices, filterCategory, searchQuery]);

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 1. TOP METRIC SUMMARY CARDS */}
      <div
        style={{
          padding: '16px 20px',
          backgroundColor: 'var(--ez-color-surface-secondary)',
          borderBottom: '1px solid var(--ez-color-border-line)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
        }}
      >
        {/* Card 1: Total Overrides */}
        <div
          style={{
            backgroundColor: 'var(--ez-color-surface)',
            borderRadius: '10px',
            border: '1px solid var(--ez-color-border-line)',
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase' }}>
              Total Override Proyek
            </div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--ez-color-text-primary)', marginTop: '2px' }}>
              {metrics.total.toLocaleString('id-ID')}
            </div>
          </div>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: 'var(--ez-hue-blue-bg)',
              color: 'var(--ez-color-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Tag size={18} />
          </div>
        </div>

        {/* Card 2: Material Overrides */}
        <div
          style={{
            backgroundColor: 'var(--ez-color-surface)',
            borderRadius: '10px',
            border: '1px solid var(--ez-color-border-line)',
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase' }}>
              Material & Bahan
            </div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--ez-color-primary-hover)', marginTop: '2px' }}>
              {metrics.material.toLocaleString('id-ID')}
            </div>
          </div>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: 'var(--ez-hue-blue-bg)',
              color: 'var(--ez-color-primary-hover)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Package size={18} />
          </div>
        </div>

        {/* Card 3: Labor Overrides */}
        <div
          style={{
            backgroundColor: 'var(--ez-color-surface)',
            borderRadius: '10px',
            border: '1px solid var(--ez-color-border-line)',
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase' }}>
              Upah Tenaga Kerja
            </div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--ez-hue-amber-text)', marginTop: '2px' }}>
              {metrics.labor.toLocaleString('id-ID')}
            </div>
          </div>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: 'var(--ez-hue-amber-bg)',
              color: 'var(--ez-hue-amber-text)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <HardHat size={18} />
          </div>
        </div>

        {/* Card 4: Equipment Overrides */}
        <div
          style={{
            backgroundColor: 'var(--ez-color-surface)',
            borderRadius: '10px',
            border: '1px solid var(--ez-color-border-line)',
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase' }}>
              Peralatan & Alat Berat
            </div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--ez-hue-purple-text)', marginTop: '2px' }}>
              {metrics.equipment.toLocaleString('id-ID')}
            </div>
          </div>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: 'var(--ez-hue-violet-bg)',
              color: 'var(--ez-hue-purple-text)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Truck size={18} />
          </div>
        </div>
      </div>

      {/* 2. TOOLBAR BAR (Search, Category Filter, and [+ Tambah Override] button) */}
      <div
        style={{
          padding: '12px 20px',
          borderBottom: '1px solid var(--ez-color-border-line)',
          backgroundColor: 'var(--ez-color-surface)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Category Filter Pills */}
          {[
            { id: 'ALL', label: `Semua (${metrics.total})` },
            { id: 'MATERIAL', label: `Material (${metrics.material})` },
            { id: 'LABOR', label: `Upah (${metrics.labor})` },
            { id: 'EQUIPMENT', label: `Peralatan (${metrics.equipment})` },
          ].map((pill) => {
            const active = filterCategory === pill.id;
            return (
              <button
                key={pill.id}
                onClick={() => setFilterCategory(pill.id as any)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '8px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: active ? '1px solid var(--ez-color-primary)' : '1px solid var(--ez-color-border-line)',
                  backgroundColor: active ? 'var(--ez-hue-blue-bg)' : 'var(--ez-color-surface)',
                  color: active ? 'var(--ez-color-primary-hover)' : 'var(--ez-color-text-muted)',
                  transition: 'all 0.15s',
                }}
              >
                {pill.label}
              </button>
            );
          })}

          {/* Quick Search */}
          <div style={{ position: 'relative', width: '220px' }}>
            <Search size={14} color="var(--ez-color-text-faint)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari item override..."
              style={{
                width: '100%',
                padding: '6px 10px 6px 30px',
                borderRadius: '8px',
                border: '1px solid var(--ez-color-border-strong)',
                fontSize: '11.5px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Action Button: Option B [+ Tambah Override] */}
        {onAddNewOverride && (
          <button
            onClick={onAddNewOverride}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: 'var(--ez-color-primary)',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(37, 99, 235, 0.2)',
            }}
          >
            <Plus size={15} />
            <span>Tambah Override</span>
          </button>
        )}
      </div>

      {/* 3. TABLE OR EMPTY STATE */}
      {filteredList.length === 0 ? (
        <div style={{ padding: '56px 24px', textAlign: 'center', color: 'var(--ez-color-text-muted)' }}>
          <FolderKanban size={44} color="var(--ez-color-text-faint)" style={{ margin: '0 auto 14px' }} />
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ez-color-text-primary)' }}>
            {projectPrices.length === 0
              ? 'Belum ada override harga khusus untuk proyek ini'
              : 'Tidak ada item yang sesuai dengan filter pencarian'}
          </div>
          <div style={{ fontSize: '12.5px', marginTop: '6px', maxWidth: '440px', margin: '6px auto 0', lineHeight: 1.5 }}>
            {projectPrices.length === 0
              ? 'Item RAB, AHSP, dan BOQ saat ini menggunakan harga master acuan secara default. Klik tombol di bawah untuk menetapkan harga khusus proyek.'
              : 'Coba bersihkan pencarian atau ganti filter kategori untuk melihat item lainnya.'}
          </div>

          {projectPrices.length === 0 && onAddNewOverride && (
            <button
              onClick={onAddNewOverride}
              style={{
                marginTop: '18px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 18px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: 'var(--ez-color-primary)',
                color: '#ffffff',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Plus size={16} />
              <span>Tambah Override Pertama</span>
            </button>
          )}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table
            className="mat-table"
            style={{
              width: '100%',
              minWidth: '980px',
              borderCollapse: 'collapse',
              textAlign: 'left',
              fontSize: '12px',
              tableLayout: 'fixed',
            }}
          >
            <colgroup>
              <col style={{ width: '38px' }} />
              <col style={{ width: '240px' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '60px' }} />
              <col style={{ width: '130px' }} />
              <col style={{ width: '130px' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '140px' }} />
              <col style={{ width: '90px' }} />
              <col style={{ width: '110px' }} />
            </colgroup>
            <thead>
              <tr style={{ backgroundColor: 'var(--ez-color-surface-secondary)', borderBottom: '1px solid var(--ez-color-border-line)' }}>
                <th style={{ padding: '10px 8px', textAlign: 'center' }}>
                  <input type="checkbox" style={{ cursor: 'pointer' }} />
                </th>
                <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Item Proyek
                </th>
                <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Kategori
                </th>
                <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Satuan
                </th>
                <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Harga Master Acuan
                </th>
                <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Harga Proyek (Override)
                </th>
                <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Deviasi
                </th>
                <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Alasan / Sumber
                </th>
                <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Status
                </th>
                <th style={{ padding: '10px 6px', textAlign: 'center', fontSize: '10.5px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredList.map((override) => {
                const priceVal = override.price ?? override.projectPrice ?? 0;
                const basePriceVal = override.masterPrice ?? override.basePrice ?? override.minPrice ?? 0;
                const diff = priceVal - basePriceVal;
                const diffPercent = basePriceVal > 0 ? (diff / basePriceVal) * 100 : 0;
                const isHigher = diff > 0;
                const isIdentical = diff === 0;
                const itemCode = override.itemCode || override.resourceCode || override.code || '';
                const itemName = override.notes || override.name || override.resourceName || itemCode;
                const reasonStr = override.provenance?.notes || override.notes || override.provenance?.sourceName || '-';

                const catUpper = (override.category || '').toUpperCase();
                const isLabor = catUpper.includes('LABOR') || catUpper.includes('UPAH') || catUpper.includes('TENAGA');
                const isEquip = catUpper.includes('EQUIP') || catUpper.includes('ALAT');

                return (
                  <tr
                    key={override.id}
                    style={{
                      backgroundColor: 'var(--ez-color-surface)',
                      borderBottom: '1px solid var(--ez-color-surface-tertiary)',
                      transition: 'background-color 0.15s',
                    }}
                  >
                    {/* Checkbox */}
                    <td style={{ padding: `${padY} 8px`, textAlign: 'center' }}>
                      <input type="checkbox" style={{ cursor: 'pointer' }} />
                    </td>

                    {/* Item Name & Code */}
                    <td style={{ padding: `${padY} 10px` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            backgroundColor: isLabor ? 'var(--ez-hue-amber-bg)' : isEquip ? 'var(--ez-hue-violet-bg)' : 'var(--ez-hue-blue-bg)',
                            color: isLabor ? 'var(--ez-hue-amber-text)' : isEquip ? 'var(--ez-hue-purple-text)' : 'var(--ez-color-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {isLabor ? <HardHat size={16} /> : isEquip ? <Truck size={16} /> : <Package size={16} />}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, color: 'var(--ez-color-text-primary)', fontSize: '12.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {itemName}
                          </div>
                          <div style={{ fontSize: '10.5px', fontFamily: 'monospace', color: 'var(--ez-color-primary)' }}>
                            {itemCode}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Kategori */}
                    <td style={{ padding: `${padY} 10px` }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '10.5px',
                          fontWeight: 700,
                          backgroundColor: isLabor ? 'var(--ez-hue-amber-bg)' : isEquip ? 'var(--ez-hue-violet-bg)' : 'var(--ez-hue-blue-bg)',
                          color: isLabor ? 'var(--ez-hue-amber-text)' : isEquip ? 'var(--ez-hue-purple-text)' : 'var(--ez-color-primary-hover)',
                        }}
                      >
                        {isLabor ? 'Tenaga Kerja' : isEquip ? 'Peralatan' : 'Material'}
                      </span>
                    </td>

                    {/* Satuan */}
                    <td style={{ padding: `${padY} 10px` }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          color: 'var(--ez-color-text-slate)',
                          backgroundColor: 'var(--ez-color-surface-secondary)',
                          padding: '2px 6px',
                          borderRadius: '5px',
                          border: '1px solid var(--ez-color-border-line)',
                        }}
                      >
                        {override.unit || 'unit'}
                      </span>
                    </td>

                    {/* Harga Master Acuan */}
                    <td style={{ padding: `${padY} 10px` }}>
                      <div style={{ color: 'var(--ez-color-text-muted)', fontSize: '12px', textDecoration: basePriceVal > 0 ? 'line-through' : 'none' }}>
                        {basePriceVal > 0 ? `Rp ${basePriceVal.toLocaleString('id-ID')}` : '-'}
                      </div>
                    </td>

                    {/* Harga Proyek (Override) */}
                    <td style={{ padding: `${padY} 10px` }}>
                      <div style={{ fontWeight: 800, color: 'var(--ez-color-text-primary)', fontSize: '13px' }}>
                        Rp {priceVal.toLocaleString('id-ID')}
                      </div>
                    </td>

                    {/* Deviasi */}
                    <td style={{ padding: `${padY} 10px` }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '2px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700,
                          backgroundColor: isIdentical ? 'var(--ez-color-surface-tertiary)' : isHigher ? 'var(--ez-color-danger-soft)' : 'var(--ez-hue-green-bg)',
                          color: isIdentical ? 'var(--ez-color-text-slate)' : isHigher ? 'var(--ez-color-danger-strong)' : 'var(--ez-hue-green-text)',
                        }}
                      >
                        {isIdentical ? '0%' : `${isHigher ? '+' : ''}${diffPercent.toFixed(1)}%`}
                      </span>
                    </td>

                    {/* Alasan / Sumber */}
                    <td style={{ padding: `${padY} 10px` }}>
                      <div style={{ fontSize: '11.5px', color: 'var(--ez-color-text-slate)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={reasonStr}>
                        {reasonStr}
                      </div>
                    </td>

                    {/* Status */}
                    <td style={{ padding: `${padY} 10px` }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: 'var(--ez-hue-green-text)',
                        }}
                      >
                        <CheckCircle2 size={12} />
                        Aktif di RAB
                      </span>
                    </td>

                    {/* Aksi: [Edit] & [Reset] */}
                    <td style={{ padding: `${padY} 6px`, textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                        <button
                          onClick={() => onEditPrice?.(override)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: '1px solid var(--ez-color-border-strong)',
                            backgroundColor: 'var(--ez-color-surface)',
                            color: 'var(--ez-color-primary)',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                          title="Edit harga override"
                        >
                          Edit
                        </button>

                        <button
                          onClick={() => setResetConfirmItem(override)}
                          style={{
                            padding: '4px 6px',
                            borderRadius: '6px',
                            border: '1px solid #FCA5A5',
                            backgroundColor: 'var(--ez-color-danger-soft)',
                            color: 'var(--ez-color-danger-strong)',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                          title="Kembalikan ke acuan master"
                        >
                          <RotateCcw size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Reset Confirmation Dialog */}
      {resetConfirmItem && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(2px)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setResetConfirmItem(null)}
        >
          <div
            style={{
              width: '420px',
              maxWidth: '100%',
              backgroundColor: 'var(--ez-color-surface)',
              borderRadius: 'var(--ez-radius-control)',
              padding: '20px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--ez-color-danger-strong)' }}>
              <AlertTriangle size={20} />
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--ez-color-text-primary)' }}>
                Kembalikan ke Harga Master?
              </h3>
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--ez-color-text-slate)', marginTop: '10px', lineHeight: 1.5 }}>
              Override untuk <strong>{resetConfirmItem.name || resetConfirmItem.itemCode || resetConfirmItem.code}</strong> akan dihapus dari proyek ini.
              Perhitungan RAB dan AHSP akan otomatis kembali menggunakan harga acuan master.
              <div style={{ marginTop: '8px', fontSize: '11.5px', color: 'var(--ez-hue-green-text)', fontWeight: 600 }}>
                ✓ Database master nasional tetap aman dan tidak akan terhapus.
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '18px' }}>
              <button
                onClick={() => setResetConfirmItem(null)}
                style={{
                  padding: '7px 14px',
                  borderRadius: '6px',
                  border: '1px solid var(--ez-color-border-strong)',
                  backgroundColor: 'var(--ez-color-surface)',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'var(--ez-color-text-slate)',
                  cursor: 'pointer',
                }}
              >
                Batal
              </button>
              <button
                onClick={() => {
                  onResetPrice?.(resetConfirmItem);
                  setResetConfirmItem(null);
                }}
                style={{
                  padding: '7px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: 'var(--ez-color-danger-strong)',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#ffffff',
                  cursor: 'pointer',
                }}
              >
                Ya, Reset ke Master
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
