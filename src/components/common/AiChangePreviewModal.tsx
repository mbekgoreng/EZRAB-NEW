import React, { useState } from 'react';
import {
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Check,
  X,
  Sliders,
  Search,
  Layers,
  FileSpreadsheet,
  Building2,
  Database,
  TrendingUp,
  TrendingDown,
  Info,
  CheckCircle2,
  Trash2,
  PlusCircle,
  RefreshCw,
  Edit3,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  AiChangeProposalData,
  AiChangeActionType,
  AiChangeAffectedRecord,
} from '../../types';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';

interface AiChangePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  proposal: AiChangeProposalData | null;
  onApply: (proposal: AiChangeProposalData) => void;
  onModify?: (proposal: AiChangeProposalData, modifiedValues?: any) => void;
}

export const AiChangePreviewModal: React.FC<AiChangePreviewModalProps> = ({
  isOpen,
  onClose,
  proposal,
  onApply,
  onModify,
}) => {
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'WORK_ITEM' | 'AHSP' | 'RESOURCE'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  const [isModifying, setIsModifying] = useState(false);
  const [modifyPercent, setModifyPercent] = useState<number>(proposal?.bulkAdjustPercent || 0);
  const [highImpactConfirmed, setHighImpactConfirmed] = useState(false);

  if (!isOpen || !proposal) return null;

  const isHighImpact =
    proposal.isHighImpact ||
    proposal.actionType === 'DELETE' ||
    Math.abs(proposal.deltaPercent) > 5 ||
    Math.abs(proposal.deltaAmount) > 50000000;

  // Filter affected records
  const filteredRecords = (proposal.affectedRecords || []).filter((rec) => {
    if (activeFilter !== 'ALL' && rec.type !== activeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        rec.code.toLowerCase().includes(q) ||
        rec.description.toLowerCase().includes(q) ||
        (rec.category && rec.category.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const getActionBadgeColor = (action: AiChangeActionType) => {
    switch (action) {
      case 'ADD':
        return { bg: '#ECFDF5', text: '#059669', border: '#A7F3D0', label: 'ADD WORK ITEM' };
      case 'DELETE':
        return { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA', label: 'DELETE RECORD' };
      case 'PRICE_UPDATE':
      case 'BULK_UPDATE':
        return { bg: '#EFF6FF', text: '#2563EB', border: '#BFDBFE', label: 'PRICE ADJUSTMENT' };
      case 'REPLACE':
        return { bg: '#FDF4FF', text: '#9333EA', border: '#F5D0FE', label: 'RESOURCE SUBSTITUTION' };
      case 'AHSP_UPDATE':
        return { bg: '#FFFBEB', text: '#D97706', border: '#FDE68A', label: 'AHSP RECIPE UPDATE' };
      default:
        return { bg: '#F1F5F9', text: '#475569', border: '#CBD5E1', label: 'DATA UPDATE' };
    }
  };

  const actionInfo = getActionBadgeColor(proposal.actionType);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '880px',
          maxHeight: '92vh',
          background: '#FFFFFF',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: isHighImpact ? '2px solid #F59E0B' : '1px solid #E2E8F0',
        }}
      >
        {/* ---------------------------------------------------------------------
            1. MODAL HEADER
           --------------------------------------------------------------------- */}
        <div
          style={{
            padding: '16px 24px',
            background: '#0F172A',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #1E293B',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #2563EB, #7C3AED)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 14px rgba(37, 99, 235, 0.4)',
              }}
            >
              <Sparkles size={20} color="#FFFFFF" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '0.02em' }}>
                  AI CHANGE PREVIEW & AUDIT
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: actionInfo.bg,
                    color: actionInfo.text,
                    border: `1px solid ${actionInfo.border}`,
                  }}
                >
                  {actionInfo.label}
                </span>
                {proposal.confidence && (
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 750,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: 'rgba(52, 211, 153, 0.15)',
                      color: '#34D399',
                      border: '1px solid rgba(52, 211, 153, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <ShieldCheck size={11} />
                    {Math.round(proposal.confidence * 100)}% Confidence
                  </span>
                )}
              </div>
              <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>
                Verifikasi dampak keuangan dan entitas sebelum mengeksekusi perubahan ke anggaran proyek
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* ---------------------------------------------------------------------
            2. SCROLLABLE BODY
           --------------------------------------------------------------------- */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* HIGH IMPACT WARNING IF APPLICABLE */}
          {isHighImpact && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '10px',
                background: '#FFFBEB',
                border: '1px solid #FCD34D',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
              }}
            >
              <AlertTriangle size={20} color="#D97706" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#92400E' }}>
                  Perubahan Berdampak Signifikan (High-Impact Mutation)
                </div>
                <div style={{ fontSize: '12px', color: '#B45309', marginTop: '2px', lineHeight: 1.4 }}>
                  Perubahan ini mengubah nilai total anggaran lebih dari 5% atau memodifikasi banyak entitas sekaligus. Mohon periksa kembali matriks Before/After di bawah ini secara teliti.
                </div>
              </div>
            </div>
          )}

          {/* PROPOSAL RATIONALE & CONTEXT BOX */}
          <div
            style={{
              background: '#F8FAFC',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
                {proposal.title}
              </span>
              <span style={{ fontSize: '11px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Database size={12} color="#2563EB" />
                Sumber: <strong>{proposal.sourceContext || 'Standar AHSP PUPR 2026'}</strong>
              </span>
            </div>

            <p style={{ margin: 0, fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
              {proposal.reason}
            </p>

            {/* AFFECTED SUMMARY PILLS */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '4px' }}>
              <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Entitas Terdampak:</span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 750,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: '#EFF6FF',
                  color: '#2563EB',
                }}
              >
                {proposal.affectedWorkItemsCount} Item Pekerjaan
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 750,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: '#FDF4FF',
                  color: '#9333EA',
                }}
              >
                {proposal.affectedAhspCount} Analisa AHSP
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 750,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: '#ECFDF5',
                  color: '#059669',
                }}
              >
                {proposal.affectedResourcesCount} Komponen Resource
              </span>
            </div>
          </div>

          {/* -------------------------------------------------------------------
              FINANCIAL IMPACT SUMMARY MATRIX
             ------------------------------------------------------------------- */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1.2fr',
              gap: '12px',
            }}
          >
            {/* Current Total RAB */}
            <div
              style={{
                padding: '14px',
                borderRadius: '10px',
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                Total RAB Saat Ini
              </span>
              <span style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrencyIDR(proposal.currentTotalRab)}
              </span>
              <span style={{ fontSize: '10.5px', color: '#94A3B8' }}>Baseline Anggaran Proyek</span>
            </div>

            {/* Proposed Total RAB */}
            <div
              style={{
                padding: '14px',
                borderRadius: '10px',
                background: '#EFF6FF',
                border: '1px solid #BFDBFE',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#1E40AF', textTransform: 'uppercase' }}>
                Total RAB Usulan (Proposed)
              </span>
              <span style={{ fontSize: '16px', fontWeight: 800, color: '#2563EB', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrencyIDR(proposal.proposedTotalRab)}
              </span>
              <span style={{ fontSize: '10.5px', color: '#60A5FA' }}>Setelah Perubahan Diterapkan</span>
            </div>

            {/* Difference / Delta */}
            <div
              style={{
                padding: '14px',
                borderRadius: '10px',
                background: proposal.deltaAmount >= 0 ? '#FEF2F2' : '#ECFDF5',
                border: `1px solid ${proposal.deltaAmount >= 0 ? '#FECACA' : '#A7F3D0'}`,
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    color: proposal.deltaAmount >= 0 ? '#DC2626' : '#059669',
                    textTransform: 'uppercase',
                  }}
                >
                  Selisih Bersih (Difference)
                </span>
                {proposal.deltaAmount >= 0 ? (
                  <TrendingUp size={15} color="#DC2626" />
                ) : (
                  <TrendingDown size={15} color="#059669" />
                )}
              </div>
              <span
                style={{
                  fontSize: '16px',
                  fontWeight: 850,
                  color: proposal.deltaAmount >= 0 ? '#DC2626' : '#059669',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {proposal.deltaAmount >= 0 ? '+' : ''}
                {formatCurrencyIDR(proposal.deltaAmount)}
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 750,
                  color: proposal.deltaAmount >= 0 ? '#B91C1C' : '#047857',
                }}
              >
                {proposal.deltaPercent >= 0 ? '+' : ''}
                {proposal.deltaPercent.toFixed(2)}% dari Total Anggaran
              </span>
            </div>
          </div>

          {/* -------------------------------------------------------------------
              INSPECTION OF AFFECTED RECORDS (BEFORE VS AFTER TABLE)
             ------------------------------------------------------------------- */}
          <div
            style={{
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Table Filter Toolbar */}
            <div
              style={{
                padding: '10px 16px',
                background: '#F8FAFC',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#334155' }}>
                  Inspeksi Rincian ({filteredRecords.length}):
                </span>
                {(['ALL', 'WORK_ITEM', 'AHSP', 'RESOURCE'] as const).map((filterKey) => (
                  <button
                    key={filterKey}
                    onClick={() => setActiveFilter(filterKey)}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '5px',
                      background: activeFilter === filterKey ? '#2563EB' : '#FFFFFF',
                      color: activeFilter === filterKey ? '#FFFFFF' : '#64748B',
                      border: activeFilter === filterKey ? 'none' : '1px solid #CBD5E1',
                      fontSize: '11px',
                      fontWeight: 650,
                      cursor: 'pointer',
                    }}
                  >
                    {filterKey === 'ALL'
                      ? 'Semua'
                      : filterKey === 'WORK_ITEM'
                      ? 'Item Pekerjaan'
                      : filterKey === 'AHSP'
                      ? 'AHSP'
                      : 'Resource'}
                  </button>
                ))}
              </div>

              {/* Search input */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#FFFFFF',
                  borderRadius: '6px',
                  padding: '3px 8px',
                  border: '1px solid #CBD5E1',
                }}
              >
                <Search size={13} color="#94A3B8" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari kode/uraian..."
                  style={{
                    border: 'none',
                    outline: 'none',
                    fontSize: '11.5px',
                    width: '140px',
                  }}
                />
              </div>
            </div>

            {/* Table List */}
            <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                <thead style={{ background: '#F1F5F9', color: '#475569', fontSize: '11px', fontWeight: 750, position: 'sticky', top: 0 }}>
                  <tr>
                    <th style={{ padding: '8px 12px' }}>Kode & Uraian</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Before</th>
                    <th style={{ padding: '8px 8px', textAlign: 'center' }}></th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>After</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Dampak (Rp)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#94A3B8' }}>
                        Tidak ada catatan terdampak yang cocok dengan filter pencarian.
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((rec, rIdx) => {
                      const isExpanded = expandedRecordId === rec.id;
                      const deltaAmt = rec.deltaAmount || (rec.after.amount || 0) - (rec.before.amount || 0);

                      return (
                        <React.Fragment key={rec.id || rIdx}>
                          <tr
                            onClick={() => setExpandedRecordId(isExpanded ? null : rec.id)}
                            style={{
                              borderBottom: '1px solid #F1F5F9',
                              background: isExpanded ? '#EFF6FF' : rIdx % 2 === 0 ? '#FFFFFF' : '#FAFAFA',
                              cursor: 'pointer',
                              transition: 'background 0.1s',
                            }}
                          >
                            <td style={{ padding: '8px 12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 700, color: '#2563EB' }}>
                                  {rec.code}
                                </span>
                                <span style={{ fontWeight: 600, color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' }}>
                                  {rec.description}
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', color: '#64748B', fontVariantNumeric: 'tabular-nums' }}>
                              {rec.before.unitPrice !== undefined ? formatCurrencyIDR(rec.before.unitPrice) : `${rec.before.volume} ${rec.before.unit}`}
                            </td>
                            <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                              <ArrowRight size={12} color="#94A3B8" />
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                              {rec.after.unitPrice !== undefined ? formatCurrencyIDR(rec.after.unitPrice) : `${rec.after.volume} ${rec.after.unit}`}
                            </td>
                            <td
                              style={{
                                padding: '8px 12px',
                                textAlign: 'right',
                                fontWeight: 750,
                                fontVariantNumeric: 'tabular-nums',
                                color: deltaAmt >= 0 ? '#DC2626' : '#059669',
                              }}
                            >
                              {deltaAmt >= 0 ? '+' : ''}
                              {formatCurrencyIDR(deltaAmt)}
                            </td>
                          </tr>

                          {/* EXPANDED INSPECTION DETAIL */}
                          {isExpanded && (
                            <tr style={{ background: '#EFF6FF' }}>
                              <td colSpan={5} style={{ padding: '10px 16px', borderBottom: '1px solid #BFDBFE' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '11.5px' }}>
                                  <div>
                                    <strong style={{ color: '#475569' }}>Rincian Sebelum:</strong>
                                    <div>Volume: {rec.before.volume || '-'} {rec.before.unit || ''}</div>
                                    <div>Harga Satuan: {formatCurrencyIDR(rec.before.unitPrice || 0)}</div>
                                    <div>Subtotal: {formatCurrencyIDR(rec.before.amount || 0)}</div>
                                  </div>
                                  <div>
                                    <strong style={{ color: '#2563EB' }}>Rincian Setelah Usulan:</strong>
                                    <div>Volume: {rec.after.volume || '-'} {rec.after.unit || ''}</div>
                                    <div>Harga Satuan: {formatCurrencyIDR(rec.after.unitPrice || 0)}</div>
                                    <div>Subtotal: {formatCurrencyIDR(rec.after.amount || 0)}</div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* INLINE MODIFICATION ACCORDION IF REQUESTED */}
          {isModifying && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '10px',
                background: '#F1F5F9',
                border: '1px solid #CBD5E1',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <Sliders size={16} color="#2563EB" />
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                <span style={{ fontSize: '12px', fontWeight: 650, color: '#1E293B' }}>
                  Sesuaikan Nilai Persentase:
                </span>
                <input
                  type="number"
                  value={modifyPercent}
                  onChange={(e) => setModifyPercent(parseFloat(e.target.value) || 0)}
                  style={{
                    width: '80px',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12px',
                    fontWeight: 700,
                  }}
                />
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748B' }}>%</span>
              </div>
              <button
                onClick={() => {
                  if (onModify) onModify(proposal, { percent: modifyPercent });
                  setIsModifying(false);
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: '#2563EB',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Hitung Ulang Proposal
              </button>
            </div>
          )}

          {/* HIGH IMPACT EXPLICIT CHECKBOX IF HIGH IMPACT */}
          {isHighImpact && (
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                borderRadius: '8px',
                background: '#FEF3C7',
                border: '1px solid #FCD34D',
                cursor: 'pointer',
                fontSize: '12px',
                color: '#92400E',
                fontWeight: 650,
              }}
            >
              <input
                type="checkbox"
                checked={highImpactConfirmed}
                onChange={(e) => setHighImpactConfirmed(e.target.checked)}
                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
              />
              <span>
                Saya telah memverifikasi seluruh dampak keuangan di atas dan menyetujui penerapan perubahan ini.
              </span>
            </label>
          )}
        </div>

        {/* ---------------------------------------------------------------------
            3. MODAL FOOTER & ACTION BUTTONS
           --------------------------------------------------------------------- */}
        <div
          style={{
            padding: '14px 24px',
            background: '#F8FAFC',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#64748B' }}>
              ⚡ Otomatis mencatat riwayat versi & audit trail
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                background: '#FFFFFF',
                border: '1px solid #CBD5E1',
                color: '#475569',
                fontSize: '12.5px',
                fontWeight: 650,
                cursor: 'pointer',
              }}
            >
              Batalkan
            </button>

            <button
              onClick={() => setIsModifying(!isModifying)}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                background: '#F1F5F9',
                border: '1px solid #CBD5E1',
                color: '#1E293B',
                fontSize: '12.5px',
                fontWeight: 650,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Sliders size={14} color="#2563EB" />
              Sesuaikan Parameter
            </button>

            <button
              onClick={() => {
                if (isHighImpact && !highImpactConfirmed) {
                  alert('Mohon centang konfirmasi verifikasi dampak sebelum menerapkan perubahan.');
                  return;
                }
                onApply(proposal);
                onClose();
              }}
              disabled={isHighImpact && !highImpactConfirmed}
              style={{
                padding: '8px 20px',
                borderRadius: '8px',
                background:
                  isHighImpact && !highImpactConfirmed
                    ? '#94A3B8'
                    : isHighImpact
                    ? '#D97706'
                    : '#10B981',
                color: '#FFFFFF',
                border: 'none',
                fontSize: '13px',
                fontWeight: 800,
                cursor: isHighImpact && !highImpactConfirmed ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow:
                  isHighImpact && !highImpactConfirmed
                    ? 'none'
                    : isHighImpact
                    ? '0 4px 12px rgba(217, 119, 6, 0.4)'
                    : '0 4px 12px rgba(16, 185, 129, 0.4)',
              }}
            >
              <Check size={16} />
              Terapkan Perubahan ({proposal.affectedWorkItemsCount} Item)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
