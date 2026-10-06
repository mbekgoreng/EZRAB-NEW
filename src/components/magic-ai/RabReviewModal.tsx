import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  Search,
  Scale,
  DollarSign,
  Layers,
  Copy,
  PlusCircle,
  FileSpreadsheet,
  ArrowRight,
  ShieldCheck,
  Filter,
} from 'lucide-react';
import { Project, RabItem } from '../../types';
import {
  reviewProjectRab,
  RABReviewSummary,
  RABReviewFinding,
  RABReviewSeverity,
  RABReviewCategory,
} from '../../services/aiRabReview';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';

interface RabReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProject: Project | null;
  rabItems: RabItem[];
  onNavigateToSpreadsheet?: (itemId?: string) => void;
}

export const RabReviewModal: React.FC<RabReviewModalProps> = ({
  isOpen,
  onClose,
  currentProject,
  rabItems,
  onNavigateToSpreadsheet,
}) => {
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  if (!isOpen) return null;

  const reviewRes = currentProject
    ? reviewProjectRab({
        projectId: currentProject.id,
        projectName: currentProject.name,
        rabItems,
      })
    : null;

  const summary = reviewRes?.summary;

  const filteredFindings = (summary?.findings || []).filter((f) => {
    if (selectedSeverity !== 'ALL' && f.severity !== selectedSeverity) return false;
    if (selectedCategory !== 'ALL' && f.category !== selectedCategory) return false;
    if (
      searchTerm.trim() &&
      !f.itemName.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !f.reason.toLowerCase().includes(searchTerm.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
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
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '1050px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #E2E8F0',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#F8FAFC',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                backgroundColor: '#EFF6FF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #BFDBFE',
                color: '#2563EB',
              }}
            >
              <Scale size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  AI Cek Kewajaran & Audit RAB
                </h2>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '6px',
                    backgroundColor: '#DBEAFE',
                    color: '#1D4ED8',
                  }}
                >
                  PHASE 9
                </span>
              </div>
              <p style={{ fontSize: '13px', color: '#64748B', margin: '2px 0 0 0' }}>
                Audit harga pasar, mapping AHSP, duplikasi pekerjaan, dan kelengkapan item RAB
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              border: '1px solid #E2E8F0',
              backgroundColor: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#64748B',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Summary KPIs */}
          {summary && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px',
              }}
            >
              <div style={{ backgroundColor: '#F8FAFC', padding: '14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                  Total Item Diperiksa
                </div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                  {summary.totalItemsReviewed} Pekerjaan
                </div>
                <div style={{ fontSize: '11px', color: '#64748B' }}>
                  {summary.totalFindings} Catatan Temuan
                </div>
              </div>

              <div
                style={{
                  backgroundColor: summary.healthScore >= 80 ? '#F0FDF4' : summary.healthScore >= 60 ? '#FEFCE8' : '#FEF2F2',
                  padding: '14px',
                  borderRadius: '10px',
                  border: `1px solid ${summary.healthScore >= 80 ? '#BBF7D0' : summary.healthScore >= 60 ? '#FEF08A' : '#FECACA'}`,
                }}
              >
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: summary.healthScore >= 80 ? '#166534' : summary.healthScore >= 60 ? '#854D0E' : '#991B1B',
                    textTransform: 'uppercase',
                  }}
                >
                  Skor Kesehatan RAB
                </div>
                <div
                  style={{
                    fontSize: '18px',
                    fontWeight: 800,
                    color: summary.healthScore >= 80 ? '#15803D' : summary.healthScore >= 60 ? '#A16207' : '#DC2626',
                    marginTop: '4px',
                  }}
                >
                  {summary.healthScore} / 100
                </div>
                <div style={{ fontSize: '11px', color: '#64748B' }}>
                  {summary.criticalWarnings} Warning • {summary.needsReviewCount} Review
                </div>
              </div>

              <div style={{ backgroundColor: '#F8FAFC', padding: '14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                  Selisih Harga Acuan
                </div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#D97706', marginTop: '4px' }}>
                  {summary.priceFindings} Item
                </div>
                <div style={{ fontSize: '11px', color: '#64748B' }}>
                  vs Master Price Benchmark
                </div>
              </div>

              <div style={{ backgroundColor: '#F8FAFC', padding: '14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                  Mapping & Satuan AHSP
                </div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#2563EB', marginTop: '4px' }}>
                  {summary.ahspFindings} Item
                </div>
                <div style={{ fontSize: '11px', color: '#64748B' }}>
                  Standar SNI / PUPR
                </div>
              </div>
            </div>
          )}

          {/* Filter Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {['ALL', 'WARNING', 'REVIEW', 'INFO'].map((sev) => (
                <button
                  key={sev}
                  onClick={() => setSelectedSeverity(sev)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    backgroundColor: selectedSeverity === sev ? '#0F172A' : '#FFFFFF',
                    color: selectedSeverity === sev ? '#FFFFFF' : '#475569',
                  }}
                >
                  {sev === 'ALL' ? 'Semua Severity' : sev}
                </button>
              ))}

              {['ALL', 'PRICE', 'AHSP', 'DUPLICATE', 'MISSING', 'QUANTITY'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    backgroundColor: selectedCategory === cat ? '#2563EB' : '#FFFFFF',
                    color: selectedCategory === cat ? '#FFFFFF' : '#475569',
                  }}
                >
                  {cat === 'ALL' ? 'Semua Kategori' : cat}
                </button>
              ))}
            </div>

            <div style={{ position: 'relative', width: '220px' }}>
              <input
                type="text"
                placeholder="Cari temuan..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 12px 6px 32px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '12.5px',
                }}
              />
              <Search
                size={14}
                color="#94A3B8"
                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}
              />
            </div>
          </div>

          {/* Findings List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredFindings.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  backgroundColor: '#F8FAFC',
                  borderRadius: '12px',
                  border: '1px dashed #CBD5E1',
                }}
              >
                <CheckCircle2 size={36} color="#16A34A" style={{ margin: '0 auto 10px auto' }} />
                <div style={{ fontSize: '15px', fontWeight: 750, color: '#0F172A' }}>
                  Tidak Ditemukan Isu Kritis
                </div>
                <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>
                  Seluruh item pekerjaan pada RAB memenuhi kriteria acuan standar.
                </div>
              </div>
            ) : (
              filteredFindings.map((finding) => {
                const isWarning = finding.severity === 'WARNING';
                const isReview = finding.severity === 'REVIEW';

                return (
                  <div
                    key={finding.id}
                    style={{
                      backgroundColor: '#FFFFFF',
                      borderRadius: '12px',
                      border: `1px solid ${isWarning ? '#FECACA' : isReview ? '#FED7AA' : '#E2E8F0'}`,
                      borderLeft: `4px solid ${isWarning ? '#DC2626' : isReview ? '#EA580C' : '#3B82F6'}`,
                      padding: '14px 18px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backgroundColor: isWarning ? '#FEF2F2' : isReview ? '#FFF7ED' : '#EFF6FF',
                            color: isWarning ? '#B91C1C' : isReview ? '#C2410C' : '#1D4ED8',
                          }}
                        >
                          {finding.severity}
                        </span>

                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backgroundColor: '#F1F5F9',
                            color: '#475569',
                          }}
                        >
                          {finding.category}
                        </span>

                        <span style={{ fontSize: '14px', fontWeight: 750, color: '#0F172A' }}>
                          {finding.itemName}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', color: '#64748B', backgroundColor: '#F8FAFC', padding: '2px 8px', borderRadius: '4px', border: '1px solid #E2E8F0' }}>
                          Sumber: <strong>{finding.source}</strong>
                        </span>
                        <span style={{ fontSize: '11px', color: '#64748B' }}>
                          Confidence: {finding.confidence}
                        </span>
                      </div>
                    </div>

                    <div style={{ fontSize: '13px', color: '#334155' }}>
                      {finding.reason}
                    </div>

                    <div
                      style={{
                        backgroundColor: '#F8FAFC',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        color: '#475569',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                      }}
                    >
                      <div>
                        💡 <strong>Saran Rekomendasi:</strong> {finding.suggestion}
                      </div>

                      {onNavigateToSpreadsheet && finding.itemId && (
                        <button
                          onClick={() => {
                            onNavigateToSpreadsheet(finding.itemId);
                            onClose();
                          }}
                          style={{
                            backgroundColor: '#FFFFFF',
                            border: '1px solid #CBD5E1',
                            color: '#0F172A',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <span>Review Item</span>
                          <ArrowRight size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #E2E8F0',
            backgroundColor: '#F8FAFC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: '12px', color: '#64748B' }}>
            🔒 <em>EZRAB AI tidak mengubah data spreadsheet RAB tanpa persetujuan manual pengguna.</em>
          </div>

          <button
            onClick={onClose}
            style={{
              backgroundColor: '#0F172A',
              color: '#FFFFFF',
              border: 'none',
              padding: '8px 20px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
