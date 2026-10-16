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
        return { label: 'Pemasukan', bg: 'var(--ez-hue-green-bg-deep)', color: 'var(--ez-hue-green-text-deep)', border: 'var(--ez-hue-green-border)', icon: ArrowDownLeft };
      case 'EXPENSE':
        return { label: 'Pengeluaran', bg: 'var(--ez-hue-red-bg)', color: 'var(--ez-hue-red-text)', border: 'var(--ez-hue-rose-border)', icon: ArrowUpRight };
      case 'RECEIVABLE':
        return { label: 'Piutang', bg: 'var(--ez-hue-blue-bg)', color: 'var(--ez-hue-blue-text-deep)', border: 'var(--ez-hue-blue-border)', icon: Receipt };
      case 'PAYABLE':
        return { label: 'Hutang', bg: 'var(--ez-hue-amber-bg-deep)', color: 'var(--ez-hue-amber-text-dark)', border: 'var(--ez-hue-amber-border)', icon: Layers };
      default:
        return { label: type, bg: 'var(--ez-color-surface-tertiary)', color: 'var(--ez-color-text-slate)', border: 'var(--ez-color-border)', icon: FileText };
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
      case 'PAID':
        return { label: 'Selesai / Lunas', bg: 'var(--ez-hue-green-bg-deep)', color: 'var(--ez-hue-green-text-deep)' };
      case 'PENDING':
      case 'COMMITTED':
        return { label: 'Menunggu / Komitmen', bg: 'var(--ez-hue-amber-bg-deep)', color: 'var(--ez-hue-amber-text-dark)' };
      case 'OVERDUE':
        return { label: 'Jatuh Tempo', bg: 'var(--ez-hue-red-bg)', color: 'var(--ez-hue-red-text)' };
      case 'PARTIALLY_PAID':
        return { label: 'Dibayar Sebagian', bg: 'var(--ez-hue-indigo-bg)', color: '#3730A3' };
      case 'DRAFT':
        return { label: 'Draf', bg: 'var(--ez-color-surface-tertiary)', color: 'var(--ez-color-text-slate)' };
      default:
        return { label: status, bg: 'var(--ez-color-surface-tertiary)', color: 'var(--ez-color-text-slate)' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Header Filters & Search Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        {/* Type Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'var(--ez-color-surface-tertiary)', padding: '3px', borderRadius: '8px', overflowX: 'auto' }}>
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
                  backgroundColor: isActive ? 'var(--ez-color-surface)' : 'transparent',
                  color: isActive ? 'var(--ez-color-text)' : 'var(--ez-color-text-muted)',
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
                border: '1px solid var(--ez-color-border-line)',
                fontSize: '12px',
                color: 'var(--ez-color-text-primary)',
                backgroundColor: 'var(--ez-color-surface)',
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
              border: '1px solid var(--ez-color-border-line)',
              fontSize: '12px',
              color: 'var(--ez-color-text-body)',
              backgroundColor: 'var(--ez-color-surface)',
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
          backgroundColor: 'var(--ez-color-surface)',
          borderRadius: 'var(--ez-radius-control)',
          border: '1px solid var(--ez-color-border-line)',
          overflowX: 'auto',
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.02)',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--ez-color-surface-secondary)', borderBottom: '1px solid var(--ez-color-border-line)', color: 'var(--ez-color-text-slate)' }}>
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
                <td colSpan={8} style={{ padding: '36px', textAlign: 'center', color: 'var(--ez-color-text-muted)' }}>
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
                      borderBottom: '1px solid var(--ez-color-border-soft)',
                      cursor: 'pointer',
                      transition: 'background-color 100ms ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--ez-color-surface-secondary)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--ez-color-surface)')}
                  >
                    <td style={{ padding: '10px 14px', color: 'var(--ez-color-text-muted)', whiteSpace: 'nowrap' }}>
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
                    <td style={{ padding: '10px 14px', color: 'var(--ez-color-text-body)', fontWeight: 550, whiteSpace: 'nowrap' }}>
                      {tx.category}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--ez-color-text-primary)', fontWeight: 600, maxWidth: '240px' }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tx.description}
                      </div>
                      {tx.reference && (
                        <div style={{ fontSize: '10.5px', color: 'var(--ez-color-text-muted)' }}>
                          Ref: {tx.reference}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--ez-color-text-slate)', whiteSpace: 'nowrap' }}>
                      {tx.vendorOrClient || '-'}
                    </td>
                    <td
                      style={{
                        padding: '10px 14px',
                        textAlign: 'right',
                        fontWeight: 750,
                        whiteSpace: 'nowrap',
                        color: isIncome ? 'var(--ez-hue-green-text-bright)' : (isExpense ? 'var(--ez-hue-rose-text)' : 'var(--ez-color-text-primary)'),
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
                          color: 'var(--ez-color-primary)',
                          backgroundColor: 'var(--ez-hue-blue-bg)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          border: '1px solid var(--ez-hue-blue-border)',
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
              backgroundColor: 'var(--ez-color-surface)',
              borderRadius: '16px',
              border: '1px solid var(--ez-color-border-line)',
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--ez-color-border-line)', paddingBottom: '12px' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 750, color: 'var(--ez-color-primary)', textTransform: 'uppercase' }}>
                  Source Traceability & Detail
                </span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)' }}>
                  Rincian Transaksi Finansial
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTx(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ez-color-text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12.5px' }}>
              <div>
                <div style={{ color: 'var(--ez-color-text-muted)', fontSize: '11px' }}>ID Transaksi</div>
                <div style={{ fontWeight: 650, color: 'var(--ez-color-text-primary)', fontFamily: 'monospace' }}>{selectedTx.id}</div>
              </div>
              <div>
                <div style={{ color: 'var(--ez-color-text-muted)', fontSize: '11px' }}>Tanggal Transaksi</div>
                <div style={{ fontWeight: 650, color: 'var(--ez-color-text-primary)' }}>{selectedTx.date}</div>
              </div>
              <div>
                <div style={{ color: 'var(--ez-color-text-muted)', fontSize: '11px' }}>Tipe & Kategori</div>
                <div style={{ fontWeight: 650, color: 'var(--ez-color-text-primary)' }}>{selectedTx.type} &bull; {selectedTx.category}</div>
              </div>
              <div>
                <div style={{ color: 'var(--ez-color-text-muted)', fontSize: '11px' }}>Pihak Terkait (Vendor/Klien)</div>
                <div style={{ fontWeight: 650, color: 'var(--ez-color-text-primary)' }}>{selectedTx.vendorOrClient || '-'}</div>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <div style={{ color: 'var(--ez-color-text-muted)', fontSize: '11px' }}>Deskripsi</div>
                <div style={{ fontWeight: 650, color: 'var(--ez-color-text-primary)' }}>{selectedTx.description}</div>
              </div>
              <div>
                <div style={{ color: 'var(--ez-color-text-muted)', fontSize: '11px' }}>Nominal</div>
                <div style={{ fontWeight: 800, fontSize: '15px', color: selectedTx.type === 'INCOME' ? 'var(--ez-hue-green-text-bright)' : 'var(--ez-hue-rose-text)' }}>
                  {formatRupiah(selectedTx.amount)}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--ez-color-text-muted)', fontSize: '11px' }}>Metode Pembayaran</div>
                <div style={{ fontWeight: 650, color: 'var(--ez-color-text-primary)' }}>{selectedTx.paymentMethod || 'Transfer'}</div>
              </div>
              <div>
                <div style={{ color: 'var(--ez-color-text-muted)', fontSize: '11px' }}>Referensi Bukti / No. Dokumen</div>
                <div style={{ fontWeight: 650, color: 'var(--ez-color-text-primary)' }}>{selectedTx.reference || '-'}</div>
              </div>
              <div>
                <div style={{ color: 'var(--ez-color-text-muted)', fontSize: '11px' }}>Sumber Entitas (Source)</div>
                <div style={{ fontWeight: 700, color: 'var(--ez-color-primary)' }}>{selectedTx.source} ({selectedTx.sourceId || '-'})</div>
              </div>
            </div>

            {selectedTx.notes && (
              <div style={{ backgroundColor: 'var(--ez-color-surface-secondary)', padding: '10px', borderRadius: '8px', fontSize: '12px', color: 'var(--ez-color-text-slate)' }}>
                <strong>Catatan:</strong> {selectedTx.notes}
              </div>
            )}

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--ez-color-border-line)', paddingTop: '12px' }}>
              <button
                type="button"
                onClick={() => setSelectedTx(null)}
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--ez-color-surface-tertiary)',
                  border: '1px solid var(--ez-color-border-line)',
                  color: 'var(--ez-color-text-slate)',
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
