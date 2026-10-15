import React from 'react';
import {
  Truck,
  CheckCircle2,
  Fuel,
  Zap,
  Gauge,
  UserCheck,
  AlertCircle,
  MoreVertical,
} from 'lucide-react';
import { EquipmentDatabaseService, EquipmentRecord } from '../../domain/equipment/equipmentDatabaseService';

import { projectPriceEngine } from '../../engine/pricing/projectPriceEngine';

interface EquipmentTableViewProps {
  equipmentList: EquipmentRecord[];
  selectedEquipment: EquipmentRecord | null;
  onSelectEquipment: (equipment: EquipmentRecord) => void;
  viewDensity?: 'TABLE' | 'COMPACT';
  projectId?: string;
  onOverridePrice?: (equipment: EquipmentRecord) => void;
}

export const EquipmentTableView: React.FC<EquipmentTableViewProps> = ({
  equipmentList,
  selectedEquipment,
  onSelectEquipment,
  viewDensity = 'TABLE',
  projectId,
  onOverridePrice,
}) => {
  const padY = viewDensity === 'COMPACT' ? '7px' : '10px';

  if (equipmentList.length === 0) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--ez-color-text-muted)' }}>
        <Truck size={40} color="var(--ez-color-text-faint)" style={{ margin: '0 auto 12px' }} />
        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>
          Tidak ada peralatan ditemukan
        </div>
        <div style={{ fontSize: '12px', marginTop: '4px' }}>
          Coba ubah kata kunci pencarian alat berat atau mesin konstruksi.
        </div>
      </div>
    );
  }

  return (
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
          <col style={{ width: '250px' }} />
          <col style={{ width: '130px' }} />
          <col style={{ width: '110px' }} />
          <col style={{ width: '60px' }} />
          <col style={{ width: '135px' }} />
          <col style={{ width: '135px' }} />
          <col style={{ width: '105px' }} />
          <col style={{ width: '110px' }} />
          <col style={{ width: '110px' }} />
        </colgroup>
        <thead>
          <tr style={{ backgroundColor: 'var(--ez-color-surface-secondary)', borderBottom: '1px solid var(--ez-color-border-line)' }}>
            <th style={{ padding: '10px 8px', textAlign: 'center' }}>
              <input type="checkbox" style={{ cursor: 'pointer' }} />
            </th>
            <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Peralatan & Kapasitas (HSD E)
            </th>
            <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Kategori Alat
            </th>
            <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Tenaga (HP)
            </th>
            <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Satuan
            </th>
            <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Sewa / Jam
            </th>
            <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Sewa / Hari (7 Jam)
            </th>
            <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              BBM (L/jam)
            </th>
            <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Operator
            </th>
            <th style={{ padding: '10px 6px', textAlign: 'center', fontSize: '10.5px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Aksi
            </th>
          </tr>
        </thead>
        <tbody>
          {equipmentList.map((eq) => {
            const isInspected = selectedEquipment?.id === eq.id;

            return (
              <tr
                key={eq.id}
                onClick={() => onSelectEquipment(eq)}
                style={{
                  backgroundColor: isInspected ? 'var(--ez-hue-blue-bg)' : 'var(--ez-color-surface)',
                  borderLeft: isInspected ? '3px solid var(--ez-color-primary)' : '3px solid transparent',
                  borderBottom: '1px solid var(--ez-color-surface-tertiary)',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s',
                }}
              >
                {/* Checkbox */}
                <td
                  style={{ padding: `${padY} 8px`, textAlign: 'center' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isInspected}
                    onChange={() => onSelectEquipment(eq)}
                    style={{ cursor: 'pointer' }}
                  />
                </td>

                {/* Nama Alat & Kapasitas */}
                <td style={{ padding: `${padY} 10px` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <div
                      style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '8px',
                        backgroundColor: 'var(--ez-hue-amber-bg)',
                        border: '1px solid var(--ez-hue-amber-border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--ez-hue-amber-text-deep)',
                        flexShrink: 0,
                      }}
                    >
                      <Truck size={18} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 700,
                          color: 'var(--ez-color-text-primary)',
                          fontSize: '12.5px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {eq.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 800,
                            fontFamily: 'monospace',
                            color: 'var(--ez-hue-amber-text)',
                            backgroundColor: 'var(--ez-hue-amber-bg)',
                            padding: '1px 5px',
                            borderRadius: '4px',
                          }}
                        >
                          {eq.code}
                        </span>
                        <span style={{ fontSize: '10.5px', color: 'var(--ez-color-text-muted)' }}>
                          Kap: {eq.capacity}
                        </span>
                      </div>
                    </div>
                  </div>
                </td>

                {/* Kategori Alat */}
                <td style={{ padding: `${padY} 10px` }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      backgroundColor: 'var(--ez-color-surface-tertiary)',
                      color: 'var(--ez-color-text-slate)',
                    }}
                  >
                    {eq.category}
                  </span>
                </td>

                {/* Tenaga Mesin */}
                <td style={{ padding: `${padY} 10px` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--ez-color-text-body)', fontWeight: 600 }}>
                    <Zap size={13} color="#F59E0B" />
                    <span style={{ fontSize: '11.5px' }}>{eq.enginePowerHP > 0 ? `${eq.enginePowerHP} HP` : '-'}</span>
                  </div>
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
                    {eq.unit}
                  </span>
                </td>

                {/* Sewa / Jam */}
                <td style={{ padding: `${padY} 10px` }}>
                  {(() => {
                    const activeOverride = projectId ? projectPriceEngine.getProjectOverride(projectId, eq.code) : undefined;
                    const isOverridden = Boolean(activeOverride && activeOverride.active);
                    return (
                      <>
                        <div style={{ fontWeight: 800, color: isOverridden ? 'var(--ez-color-primary-hover)' : 'var(--ez-color-text)', fontSize: '13px' }}>
                          Rp {(isOverridden && activeOverride ? activeOverride.price : eq.rentalPricePerHour).toLocaleString('id-ID')}
                        </div>
                        {isOverridden ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                            <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--ez-hue-amber-text)', backgroundColor: 'var(--ez-hue-amber-bg)', padding: '1px 5px', borderRadius: '4px', display: 'inline-block' }}>
                              OVERRIDE PROYEK
                            </span>
                            <span style={{ fontSize: '9.5px', color: 'var(--ez-color-text-faint)', textDecoration: 'line-through' }}>
                              Rp {eq.rentalPricePerHour.toLocaleString('id-ID')}
                            </span>
                          </div>
                        ) : (
                          <div style={{ fontSize: '10px', color: 'var(--ez-color-text-muted)' }}>per jam kerja</div>
                        )}
                      </>
                    );
                  })()}
                </td>

                {/* Sewa / Hari */}
                <td style={{ padding: `${padY} 10px` }}>
                  <div style={{ fontWeight: 700, color: 'var(--ez-color-primary)', fontSize: '12.5px' }}>
                    Rp {eq.rentalPricePerDay.toLocaleString('id-ID')}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--ez-color-text-faint)' }}>per hari (8 jam)</div>
                </td>

                {/* Konsumsi BBM */}
                <td style={{ padding: `${padY} 10px` }}>
                  {eq.fuelConsumptionLiterPerHour > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--ez-hue-amber-text)', fontWeight: 600 }}>
                      <Fuel size={13} />
                      <span>{eq.fuelConsumptionLiterPerHour} L/jam</span>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--ez-color-text-faint)', fontSize: '11px' }}>Non-BBM / Listrik</span>
                  )}
                </td>

                {/* Status Operator */}
                <td style={{ padding: `${padY} 10px` }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 6px',
                      borderRadius: '5px',
                      fontSize: '10.5px',
                      fontWeight: 700,
                      backgroundColor: eq.operatorIncluded ? 'var(--ez-hue-green-bg)' : 'var(--ez-hue-amber-bg)',
                      color: eq.operatorIncluded ? 'var(--ez-hue-green-text)' : '#D97706',
                    }}
                  >
                    <UserCheck size={11} />
                    {eq.operatorIncluded ? 'Inc. Operator' : 'Exc. Operator'}
                  </span>
                </td>

                {/* Aksi */}
                <td style={{ padding: `${padY} 6px`, textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEquipment(eq);
                      }}
                      style={{
                        padding: '4px 6px',
                        borderRadius: '6px',
                        border: '1px solid var(--ez-color-border-line)',
                        backgroundColor: 'var(--ez-color-surface)',
                        color: 'var(--ez-color-text-muted)',
                        fontSize: '10.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Detail
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOverridePrice?.(eq);
                      }}
                      style={{
                        padding: '4px 7px',
                        borderRadius: '6px',
                        border: '1px solid var(--ez-hue-blue-border)',
                        backgroundColor: 'var(--ez-hue-blue-bg)',
                        color: 'var(--ez-color-primary)',
                        fontSize: '10.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                      title="Override harga sewa alat untuk proyek ini"
                    >
                      Override
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
