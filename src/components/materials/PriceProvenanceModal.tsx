import React from 'react';
import {
  X,
  ShieldCheck,
  Building,
  Calendar,
  AlertTriangle,
  History,
  FileText,
  User,
  ExternalLink,
  Lock,
  ArrowRight,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { projectPriceEngine } from '../../engine/pricing/projectPriceEngine';
import { PriceResolver } from '../../engine/pricing/resolver/priceResolver';
import { PriceRepository } from '../../engine/pricing/repository/priceRepository';
import { ResolvedPrice, ResolvedPriceStatus } from '../../engine/pricing/contracts/types';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';

interface PriceProvenanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  materialCode: string;
  materialName: string;
  projectId?: string;
  revisionId?: string;
  unit?: string;
  onOpenEditDrawer?: () => void;
}

export const PriceProvenanceModal: React.FC<PriceProvenanceModalProps> = ({
  isOpen,
  onClose,
  materialCode,
  materialName,
  projectId = 'PRJ-DEFAULT',
  revisionId,
  unit = 'unit',
  onOpenEditDrawer,
}) => {
  if (!isOpen) return null;

  const resolver = new PriceResolver(PriceRepository.getInstance());
  const resolved: ResolvedPrice = resolver.resolvePrice(
    { code: materialCode, name: materialName, unit },
    { projectId, revisionId }
  );

  const auditHistory = projectPriceEngine.getAuditTrail(projectId, materialCode);

  const getStatusBadge = (status: ResolvedPriceStatus) => {
    switch (status) {
      case 'OVERRIDE':
        return {
          bg: '#EFF6FF',
          border: '#BFDBFE',
          color: '#1D4ED8',
          text: 'HARGA OVERRIDE (AKTIF)',
          desc: 'Dipilih secara manual oleh Estimator (Prioritas Tertinggi Tier 1)',
        };
      case 'PROJECT_PRICE':
        return {
          bg: '#ECFDF5',
          border: '#A7F3D0',
          color: '#047857',
          text: 'HARGA PROYEK',
          desc: 'Berdasarkan penawaran supplier/kontrak khusus proyek ini (Tier 2)',
        };
      case 'LOCKED':
        return {
          bg: '#F5F3FF',
          border: '#DDD6FE',
          color: '#6D28D9',
          text: 'HARGA TERKUNCI (REVISI)',
          desc: 'Dibekukan untuk keutuhan dokumen kontrak RAB resmi',
        };
      case 'EXPIRED':
        return {
          bg: '#FFFBEB',
          border: '#FDE68A',
          color: '#B45309',
          text: 'KEDALUWARSA (FALLBACK)',
          desc: 'Penawaran proyek telah melewati masa berlaku, fallback ke acuan nasional',
        };
      case 'REFERENCE':
        return {
          bg: '#F8FAFC',
          border: '#E2E8F0',
          color: '#475569',
          text: 'HARGA REFERENSI NASIONAL',
          desc: 'Menggunakan Database Acuan Master EZRAB / HSD 2026',
        };
      case 'NOT_FOUND':
      default:
        return {
          bg: '#FEF2F2',
          border: '#FECACA',
          color: '#B91C1C',
          text: 'TIDAK DITEMUKAN',
          desc: 'Fail-closed: tidak ada harga resmi untuk item ini',
        };
    }
  };

  const badge = getStatusBadge(resolved.status);
  const refPrice = resolved.referencePrice || 0;
  const finalPrice = resolved.price || 0;
  const varianceAmt = resolved.varianceAmount || 0;
  const variancePct = resolved.variancePercent || 0;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid #E2E8F0',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #F1F5F9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#FAFAFA',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <ShieldCheck size={18} color="#0284C7" />
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#0284C7', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Price Provenance & Resolution Inspector
              </span>
            </div>
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0F172A' }}>
              {materialName}
            </h3>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px', fontFamily: 'monospace' }}>
              Kode: {materialCode} • Satuan: {resolved.unit}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              padding: '6px',
              borderRadius: '8px',
              cursor: 'pointer',
              color: '#64748B',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Status Banner */}
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              backgroundColor: badge.bg,
              border: `1px solid ${badge.border}`,
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
            }}
          >
            <div style={{ marginTop: '2px' }}>
              {resolved.status === 'LOCKED' ? (
                <Lock size={18} color={badge.color} />
              ) : resolved.status === 'EXPIRED' ? (
                <AlertTriangle size={18} color={badge.color} />
              ) : (
                <ShieldCheck size={18} color={badge.color} />
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    color: badge.color,
                    letterSpacing: '0.04em',
                  }}
                >
                  {badge.text}
                </span>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#334155', lineHeight: 1.4 }}>
                {resolved.explanation || badge.desc}
              </p>
            </div>
          </div>

          {/* 3-Tier Price Comparison Matrix */}
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '10px' }}>
              Perbandingan 3 Tingkat Harga
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '12px',
                backgroundColor: '#F8FAFC',
                padding: '16px',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
              }}
            >
              {/* 1. Harga Referensi */}
              <div style={{ padding: '10px', backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>1. Acuan Nasional</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#334155', marginTop: '4px' }}>
                  {refPrice > 0 ? formatCurrencyIDR(refPrice) : '-'}
                </div>
                <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '2px' }}>
                  Master EZRAB DB
                </div>
              </div>

              {/* 2. Harga Proyek */}
              <div
                style={{
                  padding: '10px',
                  backgroundColor: resolved.projectPrice ? '#ECFDF5' : '#FFFFFF',
                  borderRadius: '8px',
                  border: `1px solid ${resolved.projectPrice ? '#A7F3D0' : '#E2E8F0'}`,
                }}
              >
                <div style={{ fontSize: '11px', color: resolved.projectPrice ? '#047857' : '#64748B', fontWeight: 600 }}>
                  2. Penawaran Proyek
                </div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: resolved.projectPrice ? '#065F46' : '#94A3B8', marginTop: '4px' }}>
                  {resolved.projectPrice ? formatCurrencyIDR(resolved.projectPrice) : 'Belum Diatur'}
                </div>
                <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '2px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {resolved.supplier || 'Penawaran Vendor'}
                </div>
              </div>

              {/* 3. Override */}
              <div
                style={{
                  padding: '10px',
                  backgroundColor: resolved.overridePrice ? '#EFF6FF' : '#FFFFFF',
                  borderRadius: '8px',
                  border: `1px solid ${resolved.overridePrice ? '#BFDBFE' : '#E2E8F0'}`,
                }}
              >
                <div style={{ fontSize: '11px', color: resolved.overridePrice ? '#1D4ED8' : '#64748B', fontWeight: 600 }}>
                  3. Override Khusus
                </div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: resolved.overridePrice ? '#1E40AF' : '#94A3B8', marginTop: '4px' }}>
                  {resolved.overridePrice ? formatCurrencyIDR(resolved.overridePrice) : 'Tidak Aktif'}
                </div>
                <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '2px' }}>
                  Keputusan Estimator
                </div>
              </div>
            </div>

            {/* Final Price & Variance Result Banner */}
            <div
              style={{
                marginTop: '12px',
                padding: '14px 18px',
                backgroundColor: '#0F172A',
                color: '#FFFFFF',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Harga Final yang Digunakan di RAB
                </div>
                <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '2px', color: '#38BDF8' }}>
                  {formatCurrencyIDR(finalPrice)} <span style={{ fontSize: '13px', color: '#94A3B8', fontWeight: 400 }}>/ {resolved.unit}</span>
                </div>
              </div>

              {refPrice > 0 && varianceAmt !== 0 && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: '#94A3B8' }}>Selisih vs Referensi Nasional</div>
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: 700,
                      color: varianceAmt < 0 ? '#4ADE80' : '#F87171',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      justifyContent: 'flex-end',
                      marginTop: '2px',
                    }}
                  >
                    {varianceAmt < 0 ? <TrendingDown size={16} /> : <TrendingUp size={16} />}
                    {varianceAmt < 0 ? '-' : '+'}
                    {formatCurrencyIDR(Math.abs(varianceAmt))} ({variancePct}%)
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Provenance & Metadata */}
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '8px' }}>
              Detail Sumber & Dokumen Rujukan
            </div>
            <div
              style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                padding: '12px 16px',
                fontSize: '12.5px',
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '12px',
              }}
            >
              <div>
                <span style={{ color: '#64748B' }}>Sumber Resmi: </span>
                <strong style={{ color: '#1E293B' }}>{resolved.sourceName || resolved.source}</strong>
              </div>
              {resolved.supplier && (
                <div>
                  <span style={{ color: '#64748B' }}>Supplier / Vendor: </span>
                  <strong style={{ color: '#1E293B' }}>{resolved.supplier}</strong>
                </div>
              )}
              {resolved.validUntil && (
                <div>
                  <span style={{ color: '#64748B' }}>Masa Berlaku: </span>
                  <strong style={{ color: resolved.status === 'EXPIRED' ? '#DC2626' : '#1E293B' }}>
                    s.d. {resolved.validUntil}
                  </strong>
                </div>
              )}
              {resolved.provenance?.createdBy && (
                <div>
                  <span style={{ color: '#64748B' }}>Ditetapkan Oleh: </span>
                  <strong style={{ color: '#1E293B' }}>{resolved.provenance.createdBy}</strong>
                </div>
              )}
            </div>
          </div>

          {/* Audit History Log */}
          {auditHistory.length > 0 && (
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <History size={14} /> Riwayat Audit Perubahan Harga Proyek ({auditHistory.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '160px', overflowY: 'auto' }}>
                {auditHistory.map((rec) => (
                  <div
                    key={rec.id}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                      fontSize: '11.5px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <strong style={{ color: '#0F172A' }}>{rec.action}</strong>
                      <div style={{ color: '#64748B', fontSize: '11px' }}>
                        {rec.reason || 'Pembaruan harga'} • {rec.userName}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, color: '#0284C7' }}>
                        {formatCurrencyIDR(rec.newPrice)}
                      </div>
                      <div style={{ fontSize: '10px', color: '#94A3B8' }}>
                        {rec.timestamp.split('T')[0]}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #F1F5F9',
            backgroundColor: '#FAFAFA',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: '11px', color: '#94A3B8' }}>
            EZRAB Price Engine v2.0 • Fail-Closed Guarantee
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#475569',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Tutup
            </button>
            {onOpenEditDrawer && (
              <button
                onClick={() => {
                  onClose();
                  onOpenEditDrawer();
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#0284C7',
                  color: '#FFFFFF',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                Ubah Harga Proyek / Override
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
