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
      <div style={{ padding: '48px 24px', textAlign: 'center', color: '#64748B' }}>
        <Truck size={40} color="#94A3B8" style={{ margin: '0 auto 12px' }} />
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
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
          <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
            <th style={{ padding: '10px 8px', textAlign: 'center' }}>
              <input type="checkbox" style={{ cursor: 'pointer' }} />
            </th>
            <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Peralatan & Kapasitas (HSD E)
            </th>
            <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Kategori Alat
            </th>
            <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Tenaga (HP)
            </th>
            <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Satuan
            </th>
            <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Sewa / Jam
            </th>
            <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Sewa / Hari (7 Jam)
            </th>
            <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              BBM (L/jam)
            </th>
            <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Operator
            </th>
            <th style={{ padding: '10px 6px', textAlign: 'center', fontSize: '10.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
                  backgroundColor: isInspected ? '#EFF6FF' : '#ffffff',
                  borderLeft: isInspected ? '3px solid #2563EB' : '3px solid transparent',
                  borderBottom: '1px solid #F1F5F9',
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
                        backgroundColor: '#FEF3C7',
                        border: '1px solid #FDE68A',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#D97706',
                        flexShrink: 0,
                      }}
                    >
                      <Truck size={18} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 700,
                          color: '#0F172A',
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
                            color: '#B45309',
                            backgroundColor: '#FEF3C7',
                            padding: '1px 5px',
                            borderRadius: '4px',
                          }}
                        >
                          {eq.code}
                        </span>
                        <span style={{ fontSize: '10.5px', color: '#64748B' }}>
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
                      backgroundColor: '#F1F5F9',
                      color: '#475569',
                    }}
                  >
                    {eq.category}
                  </span>
                </td>

                {/* Tenaga Mesin */}
                <td style={{ padding: `${padY} 10px` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#334155', fontWeight: 600 }}>
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
                      color: '#475569',
                      backgroundColor: '#F8FAFC',
                      padding: '2px 6px',
                      borderRadius: '5px',
                      border: '1px solid #E2E8F0',
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
                        <div style={{ fontWeight: 800, color: isOverridden ? '#1D4ED8' : '#0F172A', fontSize: '13px' }}>
                          Rp {(isOverridden && activeOverride ? activeOverride.price : eq.rentalPricePerHour).toLocaleString('id-ID')}
                        </div>
                        {isOverridden ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                            <span style={{ fontSize: '9px', fontWeight: 800, color: '#92400E', backgroundColor: '#FEF3C7', padding: '1px 5px', borderRadius: '4px', display: 'inline-block' }}>
                              OVERRIDE PROYEK
                            </span>
                            <span style={{ fontSize: '9.5px', color: '#94A3B8', textDecoration: 'line-through' }}>
                              Rp {eq.rentalPricePerHour.toLocaleString('id-ID')}
                            </span>
                          </div>
                        ) : (
                          <div style={{ fontSize: '10px', color: '#64748B' }}>per jam kerja</div>
                        )}
                      </>
                    );
                  })()}
                </td>

                {/* Sewa / Hari */}
                <td style={{ padding: `${padY} 10px` }}>
                  <div style={{ fontWeight: 700, color: '#2563EB', fontSize: '12.5px' }}>
                    Rp {eq.rentalPricePerDay.toLocaleString('id-ID')}
                  </div>
                  <div style={{ fontSize: '10px', color: '#94A3B8' }}>per hari (8 jam)</div>
                </td>

                {/* Konsumsi BBM */}
                <td style={{ padding: `${padY} 10px` }}>
                  {eq.fuelConsumptionLiterPerHour > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#B45309', fontWeight: 600 }}>
                      <Fuel size={13} />
                      <span>{eq.fuelConsumptionLiterPerHour} L/jam</span>
                    </div>
                  ) : (
                    <span style={{ color: '#94A3B8', fontSize: '11px' }}>Non-BBM / Listrik</span>
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
                      backgroundColor: eq.operatorIncluded ? '#ECFDF5' : '#FFFBEB',
                      color: eq.operatorIncluded ? '#059669' : '#D97706',
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
                        border: '1px solid #E2E8F0',
                        backgroundColor: '#ffffff',
                        color: '#64748B',
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
                        border: '1px solid #DBEAFE',
                        backgroundColor: '#EFF6FF',
                        color: '#2563EB',
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
