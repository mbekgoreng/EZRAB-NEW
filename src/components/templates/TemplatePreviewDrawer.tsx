import React, { useState, useMemo } from 'react';
import {
  X,
  ChevronDown,
  ChevronRight,
  ArrowRight
} from 'lucide-react';
import { RabTemplate, DetailLevel } from '../../types/rabTemplate';
import { RabTemplateService } from '../../services/rabTemplateService';
import { SafeDecimalEngine } from '../../engine/safeDecimalEngine';

interface TemplatePreviewDrawerProps {
  template: RabTemplate | null;
  isOpen: boolean;
  onClose: () => void;
  onUseTemplate: (template: RabTemplate, detailLevel: DetailLevel) => void;
  initialDetailLevel?: DetailLevel;
}

export const TemplatePreviewDrawer: React.FC<TemplatePreviewDrawerProps> = ({
  template,
  isOpen,
  onClose,
  onUseTemplate,
  initialDetailLevel = 'PROFESSIONAL'
}) => {
  const [detailLevel, setDetailLevel] = useState<DetailLevel>(initialDetailLevel);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Sync initial detail level when template changes
  React.useEffect(() => {
    if (template?.defaultDetailLevel) {
      setDetailLevel(template.defaultDetailLevel);
    } else {
      setDetailLevel(initialDetailLevel);
    }
    // Expand first 2 groups by default
    setExpandedGroups({});
  }, [template, initialDetailLevel]);

  const tplService = useMemo(() => RabTemplateService.getInstance(), []);

  // Compute live calculation using template defaults at current detailLevel
  const previewData = useMemo(() => {
    if (!template) return null;
    const defaultParams: Record<string, any> = {};
    for (const p of template.parameters) {
      defaultParams[p.key] = p.defaultValue !== undefined ? p.defaultValue : 0;
    }
    try {
      return tplService.generateRabFromTemplate(
        template,
        defaultParams,
        undefined,
        detailLevel
      );
    } catch (e) {
      console.warn('Failed to calculate preview:', e);
      return null;
    }
  }, [template, detailLevel, tplService]);

  // Katalog 180 (Fase H): kesiapan pemetaan AHSP dihitung dari katalog
  // kanonis (lookup kode + unit-gate), bukan label kosmetik.
  const mappingReadiness = useMemo(() => {
    if (!template) return null;
    try {
      return tplService.getTemplateMappingReadiness(template);
    } catch {
      return null;
    }
  }, [template, tplService]);

  // Group items by category (Work Package)
  const workPackages = useMemo(() => {
    if (!previewData || !previewData.items) return [];
    const groups: Record<string, { category: string; items: typeof previewData.items; subtotal: number }> = {};

    for (const item of previewData.items) {
      const cat = item.category || '01. PEKERJAAN UMUM';
      if (!groups[cat]) {
        groups[cat] = { category: cat, items: [], subtotal: 0 };
      }
      groups[cat].items.push(item);
      groups[cat].subtotal = SafeDecimalEngine.safeAdd(groups[cat].subtotal, item.amount);
    }

    return Object.values(groups);
  }, [previewData]);

  if (!isOpen || !template) return null;

  const toggleGroup = (cat: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [cat]: !prev[cat]
    }));
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 1100,
        display: 'flex',
        justifyContent: 'flex-end',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          height: '100%',
          background: 'var(--ez-color-surface)',
          boxShadow: '-8px 0 30px rgba(0, 0, 0, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--ez-color-border-line)',
            background: 'var(--ez-color-surface-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: template.metadata.source === 'EZRAB_OFFICIAL' ? 'var(--ez-hue-blue-bg-deep)' : 'var(--ez-hue-amber-bg-deep)',
                  color: template.metadata.source === 'EZRAB_OFFICIAL' ? 'var(--ez-hue-blue-text-deep)' : 'var(--ez-hue-amber-text-dark)'
                }}
              >
                {template.metadata.source === 'EZRAB_OFFICIAL' ? 'EZRAB Official' : 'Template Saya'}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)' }}>
                {template.category.replace(/_/g, ' ')}
              </span>
              {template.subcategory && (
                <>
                  <span style={{ color: '#CBD5E1', fontSize: '11px' }}>•</span>
                  <span
                    style={{
                      fontSize: '11.5px',
                      fontWeight: 600,
                      color: 'var(--ez-color-primary)',
                      background: 'var(--ez-hue-blue-bg)',
                      padding: '1px 6px',
                      borderRadius: '4px'
                    }}
                  >
                    {template.subcategory}
                  </span>
                </>
              )}
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: 0 }}>
              {template.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '8px',
              borderRadius: '8px',
              border: 'none',
              background: '#EDF2F7',
              color: 'var(--ez-color-text-slate)',
              cursor: 'pointer'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Drawer Scrollable Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          
          {/* Description */}
          {template.description && (
            <p style={{ fontSize: '13px', color: 'var(--ez-color-text-slate)', margin: 0, lineHeight: 1.5 }}>
              {template.description}
            </p>
          )}

          {/* Parameters Pills */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Parameter Utama ({template.parameters.length})
              </span>
              <span style={{ fontSize: '10.5px', color: '#94A3B8' }}>Nilai Default Baseline</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {template.parameters.map(p => (
                <div
                  key={p.id || p.key}
                  style={{
                    background: 'var(--ez-color-surface-tertiary)',
                    border: '1px solid var(--ez-color-border-line)',
                    borderRadius: '6px',
                    padding: '4px 10px',
                    fontSize: '11.5px',
                    color: 'var(--ez-color-text-body)'
                  }}
                >
                  <span style={{ color: 'var(--ez-color-text-muted)' }}>{p.label}: </span>
                  <strong style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
                    {String(p.defaultValue ?? '-')} {p.unit || ''}
                  </strong>
                </div>
              ))}
            </div>
          </div>

          {/* Katalog 180 (Fase H): komposisi komponen, kesiapan pemetaan AHSP,
              kejujuran sumber harga, asumsi & eksklusi template. */}
          <div
            style={{
              background: 'var(--ez-color-surface-secondary)',
              border: '1px solid var(--ez-color-border-line)',
              borderRadius: '10px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}
          >
            <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Sumber Harga & Pemetaan AHSP
            </span>
            <div style={{ fontSize: '12px', color: 'var(--ez-color-text-body)', lineHeight: 1.55 }}>
              {(template.components || []).length} komponen pekerjaan
              {' · '}
              {(template.components || []).filter(c => !c.isOptional).length} wajib
              {' · '}
              {(template.components || []).filter(c => c.isOptional).length} opsional
              {mappingReadiness && (
                <>
                  {' · '}Pemetaan AHSP: <strong>{mappingReadiness.readinessPercent}%</strong> terverifikasi
                  ({mappingReadiness.verifiedCodeCount} kode, {mappingReadiness.needsMappingCount} belum terpetakan, {mappingReadiness.noCodeCount} tanpa kode)
                </>
              )}
            </div>
            {previewData?.priceSummary && (
              <div style={{ fontSize: '12px', color: 'var(--ez-color-text-body)', lineHeight: 1.55 }}>
                Pada level {detailLevel}: <strong>{previewData.priceSummary.officialCount}</strong> harga resmi AHSP 2026
                {' · '}<strong>{previewData.priceSummary.referenceCount + previewData.priceSummary.manualCount}</strong> harga referensi
                {' · '}<strong>{previewData.priceSummary.unpricedCount}</strong> belum ada harga
                {previewData.priceSummary.totalStatus === 'PARTIAL' && (
                  <span style={{ color: 'var(--ez-hue-amber-text-dark)', fontWeight: 700 }}> — total bersifat PARSIAL (ada item tanpa harga; tidak dihitung Rp0).</span>
                )}
                <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', marginTop: '2px' }}>
                  Harga resmi adalah DHSP yang sudah termasuk overhead &amp; profit (SE DJBK No. 47/SE/Dk/2026) — jangan ditambah markup global lagi untuk item tersebut.
                </div>
              </div>
            )}
            {((template.assumptions && template.assumptions.length > 0) || (template.exclusions && template.exclusions.length > 0)) && (
              <div style={{ fontSize: '11.5px', color: 'var(--ez-color-text-slate)', lineHeight: 1.5 }}>
                {template.assumptions && template.assumptions.length > 0 && (
                  <div>
                    <strong>Asumsi:</strong>
                    <ul style={{ margin: '2px 0 4px 0', paddingLeft: '16px' }}>
                      {template.assumptions.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  </div>
                )}
                {template.exclusions && template.exclusions.length > 0 && (
                  <div>
                    <strong>Tidak termasuk:</strong>
                    <ul style={{ margin: '2px 0 0 0', paddingLeft: '16px' }}>
                      {template.exclusions.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Optional Components Availability Notice */}
          {(template.components || []).some(c => c.isOptional) && (
            <div
              style={{
                background: 'var(--ez-hue-amber-bg-deep)',
                border: '1px solid var(--ez-hue-amber-border)',
                borderRadius: '8px',
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '11.5px'
              }}
            >
              <div style={{ color: 'var(--ez-hue-amber-text-dark)' }}>
                <span style={{ fontWeight: 700 }}>
                  {(template.components || []).filter(c => c.isOptional).length} Pekerjaan Opsional
                </span>{' '}
                <span>tersedia (dapat dipilih pada tahap Konfigurasi).</span>
              </div>
              <span style={{ fontSize: '10px', fontWeight: 700, background: 'var(--ez-hue-amber-border)', color: 'var(--ez-hue-amber-text-dark)', padding: '2px 6px', borderRadius: '4px' }}>
                OPSIONAL
              </span>
            </div>
          )}

          {/* Interactive Detail Level Switcher */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Tingkat Detail Kelengkapan
              </span>
              <span style={{ fontSize: '11px', color: 'var(--ez-color-primary)', fontWeight: 600 }}>
                Live Scope Filter
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {(['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'] as DetailLevel[]).map(lvl => {
                const isSelected = detailLevel === lvl;
                return (
                  <button
                    key={lvl}
                    onClick={() => setDetailLevel(lvl)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: isSelected ? '2px solid #2563EB' : '1px solid var(--ez-color-border-line)',
                      background: isSelected ? 'var(--ez-hue-blue-bg)' : 'var(--ez-color-surface)',
                      color: isSelected ? 'var(--ez-hue-blue-text-deep)' : 'var(--ez-color-text-slate)',
                      fontWeight: isSelected ? 700 : 500,
                      fontSize: '12px',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {lvl === 'STANDARD' ? 'Standard' : lvl === 'PROFESSIONAL' ? 'Professional' : 'Comprehensive'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Total & Summary Banner */}
          {previewData && (
            <div
              style={{
                background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
                color: '#FFFFFF',
                borderRadius: 'var(--ez-radius-control)',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <span style={{ fontSize: '10.5px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Estimasi Total ({detailLevel})
                </span>
                <div style={{ fontSize: '19px', fontWeight: 800, color: '#38BDF8', marginTop: '2px' }}>
                  Rp {previewData.totalEstimate.toLocaleString('id-ID')}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#4ADE80' }}>
                  {previewData.itemCount} Item Pekerjaan
                </span>
                <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '2px' }}>
                  {workPackages.length} Paket WBS
                </div>
              </div>
            </div>
          )}

          {/* Engine Verification & Traceability Status — banner mengikuti
              kesiapan pemetaan NYATA (mappingReadiness). Badge RESMI hanya
              bila 100% komponen terverifikasi ke katalog kanonis. */}
          {(() => {
            const fullyOfficial =
              mappingReadiness !== null &&
              mappingReadiness.totalComponents > 0 &&
              mappingReadiness.verifiedCodeCount === mappingReadiness.totalComponents;
            return (
              <div
                style={{
                  background: fullyOfficial ? 'var(--ez-hue-green-bg)' : 'var(--ez-hue-amber-bg)',
                  border: fullyOfficial ? '1px solid var(--ez-hue-green-border)' : '1px solid var(--ez-hue-amber-border)',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '11.5px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: fullyOfficial ? 'var(--ez-hue-green-text-deep)' : 'var(--ez-hue-amber-text-dark)' }}>
                  <span style={{ fontWeight: 700 }}>{fullyOfficial ? '✓ AHSP & Harga:' : 'AHSP & Harga:'}</span>
                  <span>
                    {fullyOfficial
                      ? 'Terpetakan ke Database Resmi PUPR 2026 / Bina Marga'
                      : mappingReadiness
                        ? `Pemetaan sebagian — ${mappingReadiness.readinessPercent}% kode terverifikasi (${mappingReadiness.verifiedCodeCount}/${mappingReadiness.totalComponents}); sisanya harga referensi atau belum terpetakan`
                        : 'Status pemetaan AHSP tidak tersedia untuk template ini'}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: fullyOfficial ? 'var(--ez-hue-green-bg-deep)' : 'var(--ez-hue-amber-bg-deep)',
                    color: fullyOfficial ? 'var(--ez-hue-green-text)' : 'var(--ez-hue-amber-text-dark)'
                  }}
                >
                  {fullyOfficial ? 'RESMI' : 'SEBAGIAN'}
                </span>
              </div>
            );
          })()}

          {/* Work Packages Breakdown */}
          <div>
            <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '10px' }}>
              Rincian Paket Pekerjaan (Work Packages)
            </span>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {workPackages.map(wp => {
                const isExpanded = expandedGroups[wp.category];
                return (
                  <div
                    key={wp.category}
                    style={{
                      border: '1px solid var(--ez-color-border-line)',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      background: 'var(--ez-color-surface)'
                    }}
                  >
                    <div
                      onClick={() => toggleGroup(wp.category)}
                      style={{
                        padding: '10px 14px',
                        background: 'var(--ez-color-surface-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        userSelect: 'none'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {isExpanded ? <ChevronDown size={15} color="#64748B" /> : <ChevronRight size={15} color="#64748B" />}
                        <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ez-color-text-strong)' }}>
                          {wp.category}
                        </span>
                        <span
                          style={{
                            fontSize: '10.5px',
                            background: 'var(--ez-color-border-line)',
                            color: 'var(--ez-color-text-slate)',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            fontWeight: 650
                          }}
                        >
                          {wp.items.length} item
                        </span>
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>
                        Rp {wp.subtotal.toLocaleString('id-ID')}
                      </span>
                    </div>

                    {isExpanded && (
                      <div style={{ padding: '8px 12px', background: 'var(--ez-color-surface)', borderTop: '1px solid var(--ez-color-border-line)' }}>
                        <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ color: 'var(--ez-color-text-muted)', textAlign: 'left', borderBottom: '1px solid var(--ez-color-surface-tertiary)' }}>
                              <th style={{ padding: '4px 6px' }}>Item</th>
                              <th style={{ padding: '4px 6px', textAlign: 'right' }}>Vol</th>
                              <th style={{ padding: '4px 6px', textAlign: 'right' }}>Harga</th>
                              <th style={{ padding: '4px 6px', textAlign: 'right' }}>Subtotal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {wp.items.map(it => (
                              <tr key={it.id} style={{ borderBottom: '1px solid var(--ez-hue-slate-bg)' }}>
                                <td style={{ padding: '5px 6px', color: 'var(--ez-color-text-strong)', fontWeight: 500 }}>
                                  {it.description}
                                  {it.ahspCode && (
                                    <span style={{ display: 'block', fontSize: '9.5px', color: '#94A3B8' }}>
                                      {it.ahspCode}
                                    </span>
                                  )}
                                </td>
                                <td style={{ padding: '5px 6px', textAlign: 'right', color: 'var(--ez-color-primary)', fontWeight: 600 }}>
                                  {it.volume} {it.unit}
                                </td>
                                <td style={{ padding: '5px 6px', textAlign: 'right', color: '#64748B' }}>
                                  {it.unitPrice != null ? `Rp ${it.unitPrice.toLocaleString('id-ID')}` : <span style={{ color: '#DC2626' }}>Belum ada</span>}
                                </td>
                                <td style={{ padding: '5px 6px', textAlign: 'right', color: '#0F172A', fontWeight: 700 }}>
                                  {it.amount != null ? `Rp ${it.amount.toLocaleString('id-ID')}` : 'Belum ada harga'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Drawer Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--ez-color-border-line)',
            background: 'var(--ez-color-surface-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '9px 16px',
              borderRadius: '8px',
              border: '1px solid var(--ez-hue-slate-border)',
              background: 'var(--ez-color-surface)',
              color: 'var(--ez-color-text-slate)',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Tutup
          </button>
          <button
            onClick={() => onUseTemplate(template, detailLevel)}
            style={{
              padding: '9px 20px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--ez-color-primary)',
              color: '#FFFFFF',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 10px rgba(37, 99, 235, 0.3)'
            }}
          >
            <span>Konfigurasi & Terapkan ({detailLevel === 'STANDARD' ? 'Standard' : detailLevel === 'PROFESSIONAL' ? 'Pro' : 'Comp'}) →</span>
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};
