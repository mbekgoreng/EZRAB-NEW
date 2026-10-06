import React, { useState } from 'react';
import {
  FinancialTransaction,
  FinancialPeriodFilter,
  FinancialTransactionType,
} from '../../domain/finance/types';
import { formatRupiah } from '../../engine/formulaEngine';
import {
  Search,
  Filter,
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  Layers,
  Calendar,
  ExternalLink,
  X,
  FileText,
  User,
  CheckCircle2,
  Clock,
  AlertCircle,
} from 'lucide-react';

interface TransactionTableProps {
  transactions: FinancialTransaction[];
  totalCount: number;
  totalIncome: number;
  totalExpense: number;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  typeFilter: 'ALL' | 'INCOME' | 'EXPENSE' | 'RECEIVABLE' | 'PAYABLE';
  onTypeFilterChange: (t: 'ALL' | 'INCOME' | 'EXPENSE' | 'RECEIVABLE' | 'PAYABLE') => void;
  periodFilter: FinancialPeriodFilter;
  onPeriodFilterChange: (p: FinancialPeriodFilter) => void;
  onNavigateToSource?: (source: string, sourceId?: string) => void;
}

export const TransactionTable: React.FC<TransactionTableProps> = ({
  transactions,
  totalCount,
  totalIncome,
  totalExpense,
  searchQuery,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  periodFilter,
  onPeriodFilterChange,
  onNavigateToSource,
}) => {
  const [selectedTx, setSelectedTx] = useState<FinancialTransaction | null>(null);

  const getTypeBadge = (type: FinancialTransactionType) => {
    switch (type) {
      case 'INCOME':
        return { label: 'Pemasukan', bg: '#DCFCE7', color: '#166534', border: '#BBF7D0', icon: ArrowDownLeft };
      case 'EXPENSE':
        return { label: 'Pengeluaran', bg: '#FEE2E2', color: '#991B1B', border: '#FECACA', icon: ArrowUpRight };
      case 'RECEIVABLE':
        return { label: 'Piutang', bg: '#EFF6FF', color: '#1E40AF', border: '#BFDBFE', icon: Receipt };
      case 'PAYABLE':
        return { label: 'Hutang', bg: '#FEF3C7', color: '#92400E', border: '#FDE68A', icon: Layers };
      default:
        return { label: type, bg: '#F1F5F9', color: '#475569', border: '#E2E8F0', icon: FileText };
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
      case 'PAID':
        return { label: 'Selesai / Lunas', bg: '#DCFCE7', color: '#166534' };
      case 'PENDING':
      case 'COMMITTED':
        return { label: 'Menunggu / Komitmen', bg: '#FEF3C7', color: '#92400E' };
      case 'OVERDUE':
        return { label: 'Jatuh Tempo', bg: '#FEE2E2', color: '#991B1B' };
      case 'PARTIALLY_PAID':
        return { label: 'Dibayar Sebagian', bg: '#E0E7FF', color: '#3730A3' };
      case 'DRAFT':
        return { label: 'Draf', bg: '#F1F5F9', color: '#475569' };
      default:
        return { label: status, bg: '#F1F5F9', color: '#475569' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Header Filters & Search Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        {/* Type Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#F1F5F9', padding: '3px', borderRadius: '8px', overflowX: 'auto' }}>
          {[
            { id: 'ALL', label: 'Semua' },
            { id: 'INCOME', label: 'Pemasukan' },
            { id: 'EXPENSE', label: 'Pengeluaran' },
            { id: 'RECEIVABLE', label: 'Piutang' },
            { id: 'PAYABLE', label: 'Hutang' },
          ].map((t) => {
            const isActive = typeFilter === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onTypeFilterChange(t.id as any)}
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: isActive ? '#FFFFFF' : 'transparent',
                  color: isActive ? '#0F172A' : '#64748B',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '11.5px',
                  cursor: 'pointer',
                  boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 120ms ease',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Search Input & Period Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', minWidth: '200px' }}>
            <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '9px' }} />
            <input
              type="text"
              placeholder="Cari transaksi, vendor..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 10px 6px 30px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                fontSize: '12px',
                color: '#0F172A',
                backgroundColor: '#FFFFFF',
                outline: 'none',
              }}
            />
          </div>

          <select
            value={periodFilter}
            onChange={(e) => onPeriodFilterChange(e.target.value as any)}
            style={{
              padding: '6px 10px',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
              fontSize: '12px',
              color: '#334155',
              backgroundColor: '#FFFFFF',
              fontWeight: 500,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="all">Seluruh Proyek</option>
            <option value="this_month">Bulan Ini</option>
            <option value="3_months">3 Bulan Terakhir</option>
            <option value="6_months">6 Bulan Terakhir</option>
            <option value="ytd">Tahun Berjalan (YTD)</option>
          </select>
        </div>
      </div>

      {/* Table Content */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          overflowX: 'auto',
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.02)',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
          <thead>
            <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
              <th style={{ padding: '10px 14px', fontWeight: 700 }}>Tanggal</th>
              <th style={{ padding: '10px 14px', fontWeight: 700 }}>Tipe</th>
              <th style={{ padding: '10px 14px', fontWeight: 700 }}>Kategori</th>
              <th style={{ padding: '10px 14px', fontWeight: 700 }}>Deskripsi</th>
              <th style={{ padding: '10px 14px', fontWeight: 700 }}>Pihak Terkait</th>
              <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Nominal</th>
              <th style={{ padding: '10px 14px', fontWeight: 700 }}>Status</th>
              <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'center' }}>Sumber</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '36px', textAlign: 'center', color: '#64748B' }}>
                  <div style={{ fontWeight: 600 }}>Tidak ada transaksi yang cocok</div>
                  <div style={{ fontSize: '11.5px', marginTop: '2px' }}>
                    Coba sesuaikan filter pencarian atau periode tanggal.
                  </div>
                </td>
              </tr>
            ) : (
              transactions.map((tx) => {
                const badge = getTypeBadge(tx.type);
                const statusBadge = getStatusBadge(tx.status);
                const IconComp = badge.icon;
                const isIncome = tx.type === 'INCOME';
                const isExpense = tx.type === 'EXPENSE';

                return (
                  <tr
                    key={tx.id}
                    onClick={() => setSelectedTx(tx)}
                    style={{
                      borderBottom: '1px solid #F1F5F9',
                      cursor: 'pointer',
                      transition: 'background-color 100ms ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
                  >
                    <td style={{ padding: '10px 14px', color: '#64748B', whiteSpace: 'nowrap' }}>
                      {tx.date || '-'}
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: '6px',
                          backgroundColor: badge.bg,
                          color: badge.color,
                          border: `1px solid ${badge.border}`,
                        }}
                      >
                        <IconComp size={12} />
                        <span>{badge.label}</span>
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#334155', fontWeight: 550, whiteSpace: 'nowrap' }}>
                      {tx.category}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#0F172A', fontWeight: 600, maxWidth: '240px' }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tx.description}
                      </div>
                      {tx.reference && (
                        <div style={{ fontSize: '10.5px', color: '#64748B' }}>
                          Ref: {tx.reference}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#475569', whiteSpace: 'nowrap' }}>
                      {tx.vendorOrClient || '-'}
                    </td>
                    <td
                      style={{
                        padding: '10px 14px',
                        textAlign: 'right',
                        fontWeight: 750,
                        whiteSpace: 'nowrap',
                        color: isIncome ? '#16A34A' : (isExpense ? '#DC2626' : '#0F172A'),
                      }}
                    >
                      {isIncome ? '+' : isExpense ? '-' : ''}{formatRupiah(tx.amount)}
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <span
                        style={{
                          fontSize: '10.5px',
                          fontWeight: 650,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: statusBadge.bg,
                          color: statusBadge.color,
                        }}
                      >
                        {statusBadge.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <span
                        style={{
                          fontSize: '10.5px',
                          fontWeight: 600,
                          color: '#2563EB',
                          backgroundColor: '#EFF6FF',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          border: '1px solid #BFDBFE',
                        }}
                      >
                        {tx.source}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Transaction Detail Modal (Source Traceability) */}
      {selectedTx && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
          onClick={() => setSelectedTx(null)}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #E2E8F0',
              padding: '24px',
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 750, color: '#2563EB', textTransform: 'uppercase' }}>
                  Source Traceability & Detail
                </span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                  Rincian Transaksi Finansial
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTx(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12.5px' }}>
              <div>
                <div style={{ color: '#64748B', fontSize: '11px' }}>ID Transaksi</div>
                <div style={{ fontWeight: 650, color: '#0F172A', fontFamily: 'monospace' }}>{selectedTx.id}</div>
              </div>
              <div>
                <div style={{ color: '#64748B', fontSize: '11px' }}>Tanggal Transaksi</div>
                <div style={{ fontWeight: 650, color: '#0F172A' }}>{selectedTx.date}</div>
              </div>
              <div>
                <div style={{ color: '#64748B', fontSize: '11px' }}>Tipe & Kategori</div>
                <div style={{ fontWeight: 650, color: '#0F172A' }}>{selectedTx.type} &bull; {selectedTx.category}</div>
              </div>
              <div>
                <div style={{ color: '#64748B', fontSize: '11px' }}>Pihak Terkait (Vendor/Klien)</div>
                <div style={{ fontWeight: 650, color: '#0F172A' }}>{selectedTx.vendorOrClient || '-'}</div>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <div style={{ color: '#64748B', fontSize: '11px' }}>Deskripsi</div>
                <div style={{ fontWeight: 650, color: '#0F172A' }}>{selectedTx.description}</div>
              </div>
              <div>
                <div style={{ color: '#64748B', fontSize: '11px' }}>Nominal</div>
                <div style={{ fontWeight: 800, fontSize: '15px', color: selectedTx.type === 'INCOME' ? '#16A34A' : '#DC2626' }}>
                  {formatRupiah(selectedTx.amount)}
                </div>
              </div>
              <div>
                <div style={{ color: '#64748B', fontSize: '11px' }}>Metode Pembayaran</div>
                <div style={{ fontWeight: 650, color: '#0F172A' }}>{selectedTx.paymentMethod || 'Transfer'}</div>
              </div>
              <div>
                <div style={{ color: '#64748B', fontSize: '11px' }}>Referensi Bukti / No. Dokumen</div>
                <div style={{ fontWeight: 650, color: '#0F172A' }}>{selectedTx.reference || '-'}</div>
              </div>
              <div>
                <div style={{ color: '#64748B', fontSize: '11px' }}>Sumber Entitas (Source)</div>
                <div style={{ fontWeight: 700, color: '#2563EB' }}>{selectedTx.source} ({selectedTx.sourceId || '-'})</div>
              </div>
            </div>

            {selectedTx.notes && (
              <div style={{ backgroundColor: '#F8FAFC', padding: '10px', borderRadius: '8px', fontSize: '12px', color: '#475569' }}>
                <strong>Catatan:</strong> {selectedTx.notes}
              </div>
            )}

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid #E2E8F0', paddingTop: '12px' }}>
              <button
                type="button"
                onClick={() => setSelectedTx(null)}
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  backgroundColor: '#F1F5F9',
                  border: '1px solid #E2E8F0',
                  color: '#475569',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
