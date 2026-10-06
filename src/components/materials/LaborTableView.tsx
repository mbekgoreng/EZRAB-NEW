import React from 'react';
import {
  HardHat,
  CheckCircle2,
  ChevronRight,
  Shield,
  Clock,
  Sparkles,
  Award,
  MoreVertical,
} from 'lucide-react';
import { LaborDatabaseService, LaborRateRecord } from '../../domain/labor/laborDatabaseService';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';

import { projectPriceEngine } from '../../engine/pricing/projectPriceEngine';

interface LaborTableViewProps {
  laborList: LaborRateRecord[];
  selectedLabor: LaborRateRecord | null;
  onSelectLabor: (labor: LaborRateRecord) => void;
  selectedProvince?: string;
  viewDensity?: 'TABLE' | 'COMPACT';
  projectId?: string;
  onOverridePrice?: (labor: LaborRateRecord) => void;
}

export const LaborTableView: React.FC<LaborTableViewProps> = ({
  laborList,
  selectedLabor,
  onSelectLabor,
  selectedProvince = 'Indonesia',
  viewDensity = 'TABLE',
  projectId,
  onOverridePrice,
}) => {
  const laborDb = LaborDatabaseService.getInstance();
  const padY = viewDensity === 'COMPACT' ? '7px' : '10px';

  if (laborList.length === 0) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', color: '#64748B' }}>
        <HardHat size={40} color="#94A3B8" style={{ margin: '0 auto 12px' }} />
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
          Tidak ada tenaga kerja ditemukan
        </div>
        <div style={{ fontSize: '12px', marginTop: '4px' }}>
          Coba ubah kata kunci pencarian profesi atau keahlian tenaga kerja.
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
          minWidth: '940px',
          borderCollapse: 'collapse',
          textAlign: 'left',
          fontSize: '12px',
          tableLayout: 'fixed',
        }}
      >
        <colgroup>
          <col style={{ width: '38px' }} />
          <col style={{ width: '240px' }} />
          <col style={{ width: '130px' }} />
          <col style={{ width: '140px' }} />
          <col style={{ width: '60px' }} />
          <col style={{ width: '135px' }} />
          <col style={{ width: '115px' }} />
          <col style={{ width: '120px' }} />
          <col style={{ width: '100px' }} />
          <col style={{ width: '110px' }} />
        </colgroup>
        <thead>
          <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
            <th style={{ padding: '10px 8px', textAlign: 'center' }}>
              <input type="checkbox" style={{ cursor: 'pointer' }} />
            </th>
            <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Tenaga Kerja (HSD L)
            </th>
            <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Kategori Peran
            </th>
            <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              SKK / Kualifikasi
            </th>
            <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Satuan
            </th>
            <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Upah Harian (OH)
            </th>
            <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Upah / Jam (OJ)
            </th>
            <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Wilayah Acuan
            </th>
            <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Standar
            </th>
            <th style={{ padding: '10px 6px', textAlign: 'center', fontSize: '10.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Aksi
            </th>
          </tr>
        </thead>
        <tbody>
          {laborList.map((lab) => {
            const adjustedRate = laborDb.getAdjustedRate(lab.id, selectedProvince);
            const isInspected = selectedLabor?.id === lab.id;

            return (
              <tr
                key={lab.id}
                onClick={() => onSelectLabor(lab)}
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
                    onChange={() => onSelectLabor(lab)}
                    style={{ cursor: 'pointer' }}
                  />
                </td>

                {/* Tenaga Kerja Name & Code */}
                <td style={{ padding: `${padY} 10px` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <div
                      style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '8px',
                        backgroundColor: '#EFF6FF',
                        border: '1px solid #DBEAFE',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#2563EB',
                        flexShrink: 0,
                      }}
                    >
                      <HardHat size={18} />
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
                        {lab.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 800,
                            fontFamily: 'monospace',
                            color: '#1D4ED8',
                            backgroundColor: '#EFF6FF',
                            padding: '1px 5px',
                            borderRadius: '4px',
                          }}
                        >
                          {lab.code}
                        </span>
                        <span style={{ fontSize: '10.5px', color: '#94A3B8' }}>• 7 Jam/Hari</span>
                      </div>
                    </div>
                  </div>
                </td>

                {/* Kategori Peran */}
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
                      backgroundColor:
                        lab.roleCategory === 'MANDOR'
                          ? '#FEF3C7'
                          : lab.roleCategory === 'TUKANG'
                          ? '#E0F2FE'
                          : lab.roleCategory === 'KEPALA_TUKANG'
                          ? '#EDE9FE'
                          : lab.roleCategory === 'AHLI'
                          ? '#FCE7F3'
                          : '#F1F5F9',
                      color:
                        lab.roleCategory === 'MANDOR'
                          ? '#92400E'
                          : lab.roleCategory === 'TUKANG'
                          ? '#0369A1'
                          : lab.roleCategory === 'KEPALA_TUKANG'
                          ? '#6D28D9'
                          : lab.roleCategory === 'AHLI'
                          ? '#BE185D'
                          : '#475569',
                    }}
                  >
                    {lab.roleCategory}
                  </span>
                </td>

                {/* SKK / Kualifikasi */}
                <td style={{ padding: `${padY} 10px` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#334155', fontWeight: 600 }}>
                    <Award size={13} color="#059669" />
                    <span style={{ fontSize: '11.5px' }}>{lab.skkLevel}</span>
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
                    {lab.unit}
                  </span>
                </td>

                {/* Upah Harian (OH) */}
                <td style={{ padding: `${padY} 10px` }}>
                  {(() => {
                    const activeOverride = projectId ? projectPriceEngine.getProjectOverride(projectId, lab.code) : undefined;
                    const isOverridden = Boolean(activeOverride && activeOverride.active);
                    return (
                      <>
                        <div style={{ fontWeight: 800, color: isOverridden ? '#1D4ED8' : '#0F172A', fontSize: '13px' }}>
                          Rp {(isOverridden && activeOverride ? activeOverride.price : adjustedRate.priceOH).toLocaleString('id-ID')}
                        </div>
                        {isOverridden ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                            <span style={{ fontSize: '9px', fontWeight: 800, color: '#92400E', backgroundColor: '#FEF3C7', padding: '1px 5px', borderRadius: '4px', display: 'inline-block' }}>
                              OVERRIDE PROYEK
                            </span>
                            <span style={{ fontSize: '9.5px', color: '#94A3B8', textDecoration: 'line-through' }}>
                              Rp {adjustedRate.priceOH.toLocaleString('id-ID')}
                            </span>
                          </div>
                        ) : (
                          <div style={{ fontSize: '10.5px', color: '#64748B' }}>
                            Standar 1 OH
                          </div>
                        )}
                      </>
                    );
                  })()}
                </td>

                {/* Upah / Jam (OJ) */}
                <td style={{ padding: `${padY} 10px` }}>
                  <div style={{ fontWeight: 700, color: '#2563EB', fontSize: '12px' }}>
                    Rp {adjustedRate.priceOJ.toLocaleString('id-ID')}
                  </div>
                  <div style={{ fontSize: '10px', color: '#94A3B8' }}>1 OJ (OH/7)</div>
                </td>

                {/* Wilayah Acuan */}
                <td style={{ padding: `${padY} 10px` }}>
                  <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#334155' }}>
                    {adjustedRate.province}
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748B' }}>
                    Faktor: {adjustedRate.factor}x
                  </div>
                </td>

                {/* Standar Acuan */}
                <td style={{ padding: `${padY} 10px` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#059669', fontSize: '11px', fontWeight: 700 }}>
                    <CheckCircle2 size={13} />
                    <span>PUPR 2026</span>
                  </div>
                </td>

                {/* Aksi */}
                <td style={{ padding: `${padY} 6px`, textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectLabor(lab);
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
                        onOverridePrice?.(lab);
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
                      title="Override upah untuk proyek ini"
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
