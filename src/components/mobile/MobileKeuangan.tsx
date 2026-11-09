/**
 * MobileKeuangan — presentasi native mobile untuk Keuangan Proyek
 * (Gelombang Native 2, 2026-11-10).
 *
 * Data KEUANGAN ASLI proyek: summary dari ProjectFinanceRepository
 * .calculateFinanceSummary (nilai kontrak, tertagih, diterima, piutang,
 * pengeluaran, arus kas bersih) yang dihitung ProjectFinanceView dari
 * termin/invoice/payment/expense proyek aktif — bukan angka contoh
 * galeri. Sub-tab memakai daftar & state yang sama (subNavTabs view
 * induk); isi tiap sub-tab dirender oleh komponen tab yang sama persis
 * (children dari view induk), sehingga seluruh CRUD tetap berfungsi.
 * Yang native di sini: kartu proyek, chip sub-tab, dan kartu ringkasan
 * keuangan di tab Ringkasan.
 */
import React from 'react';
import { ArrowDownLeft, ArrowUpRight, Receipt, Scale, Wallet } from 'lucide-react';
import { ProjectFinanceSummary } from '../../domain/finance/types';
import { formatRupiah } from '../../engine/formulaEngine';
import type { FinanceSubTab } from '../finance/ProjectFinanceView';

export interface MobileKeuanganSubTab {
  id: FinanceSubTab;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  count?: number;
}

export interface MobileKeuanganProps {
  projectName: string;
  summary: ProjectFinanceSummary;
  subNavTabs: MobileKeuanganSubTab[];
  activeSubTab: FinanceSubTab;
  onSelectSubTab: (tab: FinanceSubTab) => void;
  children: React.ReactNode;
}

const rp = formatRupiah;

export const MobileKeuangan: React.FC<MobileKeuanganProps> = ({
  projectName,
  summary,
  subNavTabs,
  activeSubTab,
  onSelectSubTab,
  children,
}) => {
  return (
    <div className="mnw-screen">
      <div className="mnw-eyebrow">Keuangan Proyek</div>
      <h2 className="mnw-title">Keuangan</h2>

      <div className="mnw-projcard" style={{ marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mnw-projcard-name">{projectName}</div>
          <div className="mnw-projcard-meta">
            Nilai Kontrak: <strong style={{ color: '#FFFFFF' }}>{rp(summary.contractValue)}</strong>
          </div>
          <div className="mnw-projcard-meta">
            Alokasi termin: {summary.totalAllocatedPercentage}% · {summary.termsCount} termin ·{' '}
            {summary.invoicesCount} invoice
          </div>
        </div>
      </div>

      {/* Sub-tab — daftar & state yang sama dengan bilah desktop */}
      <div className="mnw-chips" role="tablist" aria-label="Sub-tab keuangan" style={{ paddingTop: 0 }}>
        {subNavTabs.map((tab) => {
          const IconComp = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeSubTab === tab.id}
              className={`mnw-chip${activeSubTab === tab.id ? ' is-active' : ''}`}
              onClick={() => onSelectSubTab(tab.id)}
            >
              <IconComp size={14} /> {tab.label}
              {tab.count !== undefined && tab.count > 0 ? ` (${tab.count})` : ''}
            </button>
          );
        })}
      </div>

      {/* Ringkasan native — hanya tab Ringkasan; angka summary asli */}
      {activeSubTab === 'overview' && (
        <>
          <div className="mnw-kpi-grid" style={{ marginTop: 14 }}>
            <div className="mnw-kpi-card">
              <span className="mnw-kpi-label">
                <Wallet size={13} /> Nilai Kontrak
              </span>
              <span className="mnw-kpi-value small">{rp(summary.contractValue)}</span>
              <span className="mnw-kpi-sub">Estimasi biaya RAB: {rp(summary.estimatedCost)}</span>
            </div>
            <div className="mnw-kpi-card">
              <span className="mnw-kpi-label">
                <Receipt size={13} /> Sudah Ditagihkan
              </span>
              <span className="mnw-kpi-value small">{rp(summary.totalInvoiced)}</span>
              <span className="mnw-kpi-sub">{summary.invoicesCount} invoice terbit</span>
            </div>
            <div className="mnw-kpi-card">
              <span className="mnw-kpi-label">
                <ArrowDownLeft size={13} /> Diterima
              </span>
              <span className="mnw-kpi-value small" style={{ color: '#15803D' }}>
                {rp(summary.totalPaid)}
              </span>
              <span className="mnw-kpi-sub">{summary.paymentsCount} pembayaran tercatat</span>
            </div>
            <div className="mnw-kpi-card">
              <span className="mnw-kpi-label">
                <Scale size={13} /> Piutang
              </span>
              <span className="mnw-kpi-value small">{rp(summary.totalReceivable)}</span>
              <span className="mnw-kpi-sub">
                {summary.overdueReceivable > 0
                  ? `Jatuh tempo: ${rp(summary.overdueReceivable)}`
                  : 'Tidak ada piutang jatuh tempo'}
              </span>
            </div>
            <div className="mnw-kpi-card">
              <span className="mnw-kpi-label">
                <ArrowUpRight size={13} /> Pengeluaran
              </span>
              <span className="mnw-kpi-value small">{rp(summary.totalExpenses)}</span>
              <span className="mnw-kpi-sub">{summary.expensesCount} pengeluaran tercatat</span>
            </div>
            <div className="mnw-kpi-card">
              <span className="mnw-kpi-label">Arus Kas Bersih</span>
              <span className="mnw-kpi-value small" style={{ color: summary.netCashFlow < 0 ? '#DC2626' : '#15803D' }}>
                {rp(summary.netCashFlow)}
              </span>
              <span className="mnw-kpi-sub">
                Estimasi profit {rp(summary.estimatedProfit)} · margin {summary.profitMarginPercent.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Aksi cepat — navigasi sub-tab yang sama dengan FinanceOverviewTab */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0' }}>
            <button type="button" className="mnw-action-btn primary" onClick={() => onSelectSubTab('terms')}>
              Buat Termin
            </button>
            <button type="button" className="mnw-action-btn" onClick={() => onSelectSubTab('invoices')}>
              Buat Invoice
            </button>
            <button type="button" className="mnw-action-btn" onClick={() => onSelectSubTab('payments')}>
              Catat Pemasukan
            </button>
            <button type="button" className="mnw-action-btn" onClick={() => onSelectSubTab('expenses')}>
              Tambah Pengeluaran
            </button>
          </div>
        </>
      )}

      {/* Isi sub-tab: komponen tab yang sama persis dengan desktop */}
      <div style={{ marginTop: activeSubTab === 'overview' ? 0 : 14 }}>{children}</div>
    </div>
  );
};

export default MobileKeuangan;
