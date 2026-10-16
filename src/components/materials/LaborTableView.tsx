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
      <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--ez-color-text-muted)' }}>
        <HardHat size={40} color="var(--ez-color-text-faint)" style={{ margin: '0 auto 12px' }} />
        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>
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
          <tr style={{ backgroundColor: 'var(--ez-color-surface-secondary)', borderBottom: '1px solid var(--ez-color-border-line)' }}>
            <th style={{ padding: '10px 8px', textAlign: 'center' }}>
              <input type="checkbox" style={{ cursor: 'pointer' }} />
            </th>
            <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Tenaga Kerja (HSD L)
            </th>
            <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Kategori Peran
            </th>
            <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              SKK / Kualifikasi
            </th>
            <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Satuan
            </th>
            <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Upah Harian (OH)
            </th>
            <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Upah / Jam (OJ)
            </th>
            <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Wilayah Acuan
            </th>
            <th style={{ padding: '10px 10px', fontSize: '10.5px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Standar
            </th>
            <th style={{ padding: '10px 6px', textAlign: 'center', fontSize: '10.5px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
                        backgroundColor: 'var(--ez-hue-blue-bg)',
                        border: '1px solid var(--ez-hue-blue-border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--ez-color-primary)',
                        flexShrink: 0,
                      }}
                    >
                      <HardHat size={18} />
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
                        {lab.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 800,
                            fontFamily: 'monospace',
                            color: 'var(--ez-color-primary-hover)',
                            backgroundColor: 'var(--ez-hue-blue-bg)',
                            padding: '1px 5px',
                            borderRadius: '4px',
                          }}
                        >
                          {lab.code}
                        </span>
                        <span style={{ fontSize: '10.5px', color: 'var(--ez-color-text-faint)' }}>• 7 Jam/Hari</span>
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
                          ? 'var(--ez-hue-amber-bg)'
                          : lab.roleCategory === 'TUKANG'
                          ? 'var(--ez-pastel-sky)'
                          : lab.roleCategory === 'KEPALA_TUKANG'
                          ? 'var(--ez-hue-violet-bg)'
                          : lab.roleCategory === 'AHLI'
                          ? 'var(--ez-hue-violet-bg)'
                          : 'var(--ez-color-surface-tertiary)',
                      color:
                        lab.roleCategory === 'MANDOR'
                          ? 'var(--ez-hue-amber-text)'
                          : lab.roleCategory === 'TUKANG'
                          ? 'var(--ez-color-info)'
                          : lab.roleCategory === 'KEPALA_TUKANG'
                          ? 'var(--ez-hue-violet-text)'
                          : lab.roleCategory === 'AHLI'
                          ? 'var(--ez-hue-violet-text)'
                          : 'var(--ez-color-text-slate)',
                    }}
                  >
                    {lab.roleCategory}
                  </span>
                </td>

                {/* SKK / Kualifikasi */}
                <td style={{ padding: `${padY} 10px` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--ez-color-text-body)', fontWeight: 600 }}>
                    <Award size={13} color="var(--ez-hue-green-text)" />
                    <span style={{ fontSize: '11.5px' }}>{lab.skkLevel}</span>
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
                        <div style={{ fontWeight: 800, color: isOverridden ? 'var(--ez-color-primary-hover)' : 'var(--ez-color-text)', fontSize: '13px' }}>
                          Rp {(isOverridden && activeOverride ? activeOverride.price : adjustedRate.priceOH).toLocaleString('id-ID')}
                        </div>
                        {isOverridden ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                            <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--ez-hue-amber-text)', backgroundColor: 'var(--ez-hue-amber-bg)', padding: '1px 5px', borderRadius: '4px', display: 'inline-block' }}>
                              OVERRIDE PROYEK
                            </span>
                            <span style={{ fontSize: '9.5px', color: 'var(--ez-color-text-faint)', textDecoration: 'line-through' }}>
                              Rp {adjustedRate.priceOH.toLocaleString('id-ID')}
                            </span>
                          </div>
                        ) : (
                          <div style={{ fontSize: '10.5px', color: 'var(--ez-color-text-muted)' }}>
                            Standar 1 OH
                          </div>
                        )}
                      </>
                    );
                  })()}
                </td>

                {/* Upah / Jam (OJ) */}
                <td style={{ padding: `${padY} 10px` }}>
                  <div style={{ fontWeight: 700, color: 'var(--ez-color-primary)', fontSize: '12px' }}>
                    Rp {adjustedRate.priceOJ.toLocaleString('id-ID')}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--ez-color-text-faint)' }}>1 OJ (OH/7)</div>
                </td>

                {/* Wilayah Acuan */}
                <td style={{ padding: `${padY} 10px` }}>
                  <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>
                    {adjustedRate.province}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--ez-color-text-muted)' }}>
                    Faktor: {adjustedRate.factor}x
                  </div>
                </td>

                {/* Standar Acuan */}
                <td style={{ padding: `${padY} 10px` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--ez-hue-green-text)', fontSize: '11px', fontWeight: 700 }}>
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
                        onOverridePrice?.(lab);
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
