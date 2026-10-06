import React, { useState, useMemo } from 'react';
import {
  FileText,
  Download,
  Calendar,
  CheckCircle2,
  Printer,
  ShieldCheck,
  TrendingUp,
  Scale,
  Receipt,
  Layers,
} from 'lucide-react';
import { Project, RabItem, Company } from '../../types';
import { FinancialAnalyticsService } from '../../services/financialAnalyticsService';
import { formatRupiah } from '../../engine/formulaEngine';
import { FinancialPeriodFilter } from '../../domain/finance/types';

interface FinancialReportsTabProps {
  currentProject: Project | null;
  rabItems?: RabItem[];
  company?: Company;
}

export const FinancialReportsTab: React.FC<FinancialReportsTabProps> = ({
  currentProject,
  rabItems = [],
  company,
}) => {
  const [periodFilter, setPeriodFilter] = useState<FinancialPeriodFilter>('all');
  const [reportTitle, setReportTitle] = useState('Laporan Keuangan & Arus Kas Proyek');
  const [includeForecast, setIncludeForecast] = useState(true);
  const [exportSuccessMsg, setExportSuccessMsg] = useState('');

  const projectId = currentProject?.id || 'global';
  const analytics = useMemo(() => new FinancialAnalyticsService(projectId), [projectId]);

  const summary = useMemo(() => {
    return analytics.getFinancialSummary(rabItems, currentProject, periodFilter);
  }, [analytics, rabItems, currentProject, periodFilter]);

  const cashFlow = useMemo(() => {
    return analytics.getCashFlow({ periodFilter, includeForecast }, rabItems, currentProject);
  }, [analytics, periodFilter, includeForecast, rabItems, currentProject]);

  const budgetVsActual = useMemo(() => {
    return analytics.getBudgetVsActual(rabItems);
  }, [analytics, rabItems]);

  const receivables = useMemo(() => {
    return analytics.getReceivables();
  }, [analytics]);

  const payables = useMemo(() => {
    return analytics.getPayables();
  }, [analytics]);

  const transactions = useMemo(() => {
    return analytics.getTransactions({ periodFilter, limit: 100 });
  }, [analytics, periodFilter]);

  const handleExportCSV = () => {
    try {
      const headers = ['Tanggal', 'Tipe', 'Kategori', 'Deskripsi', 'Pihak Terkait', 'Nominal', 'Status', 'Sumber'];
      const rows = transactions.transactions.map((t) => [
        t.date,
        t.type,
        t.category,
        `"${t.description.replace(/"/g, '""')}"`,
        `"${(t.vendorOrClient || '').replace(/"/g, '""')}"`,
        t.amount,
        t.status,
        t.source,
      ]);

      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `EZRAB_Laporan_Keuangan_${currentProject?.name || 'Proyek'}_${new Date().toISOString().substring(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setExportSuccessMsg('✓ Laporan Keuangan berhasil diekspor ke format CSV.');
      setTimeout(() => setExportSuccessMsg(''), 4000);
    } catch (err: any) {
      alert(`Gagal mengekspor CSV: ${err.message}`);
    }
  };

  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Controls */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          padding: '20px 24px',
          boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              Pusat Laporan Keuangan Proyek
            </h2>
            <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>
              Ekspor laporan komprehensif (Ringkasan KPI, Cash Flow, Budget vs Actual, Piutang, Hutang, dan Mutasi Transaksi).
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value as any)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '12.5px',
                color: '#334155',
                backgroundColor: '#FFFFFF',
                fontWeight: 600,
                outline: 'none',
              }}
            >
              <option value="all">Seluruh Periode Proyek</option>
              <option value="this_month">Bulan Berjalan</option>
              <option value="3_months">3 Bulan Terakhir</option>
              <option value="6_months">6 Bulan Terakhir</option>
              <option value="ytd">Tahun Berjalan (YTD)</option>
            </select>

            <button
              type="button"
              onClick={handleExportCSV}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                backgroundColor: '#10B981',
                border: 'none',
                color: '#FFFFFF',
                fontSize: '12.5px',
                fontWeight: 650,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Download size={14} />
              <span>Ekspor Excel / CSV</span>
            </button>

            <button
              type="button"
              onClick={handlePrintReport}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                backgroundColor: '#2563EB',
                border: 'none',
                color: '#FFFFFF',
                fontSize: '12.5px',
                fontWeight: 650,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Printer size={14} />
              <span>Cetak / Cetak PDF</span>
            </button>
          </div>
        </div>

        {exportSuccessMsg && (
          <div style={{ backgroundColor: '#DCFCE7', color: '#166534', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}>
            {exportSuccessMsg}
          </div>
        )}
      </div>

      {/* Printable Report Document Preview */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          padding: '36px',
          boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        {/* Document Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #0F172A', paddingBottom: '16px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', margin: 0 }}>
              {company?.name || 'EZRAB CONSTRUCTION MANAGEMENT'}
            </h1>
            <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
              {company?.address || 'Layanan Estimasi & Manajemen Konstruksi Terintegrasi'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#2563EB' }}>
              LAPORAN KEUANGAN PROYEK
            </div>
            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
              Tanggal Diterbitkan: {new Date().toLocaleDateString('id-ID', { dateStyle: 'long' })}
            </div>
            <div style={{ fontSize: '11px', color: '#64748B' }}>
              Revisi Dokumen: RAB Rev. 01 &bull; Status: Real Data
            </div>
          </div>
        </div>

        {/* Project Metadata Box */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', backgroundColor: '#F8FAFC', padding: '16px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '12px' }}>
          <div>
            <div style={{ color: '#64748B', fontSize: '11px' }}>Nama Proyek</div>
            <div style={{ fontWeight: 750, color: '#0F172A', marginTop: '2px' }}>{currentProject?.name || 'Proyek Tanpa Judul'}</div>
          </div>
          <div>
            <div style={{ color: '#64748B', fontSize: '11px' }}>Klien / Pemilik</div>
            <div style={{ fontWeight: 750, color: '#0F172A', marginTop: '2px' }}>{currentProject?.clientName || 'Klien Proyek'}</div>
          </div>
          <div>
            <div style={{ color: '#64748B', fontSize: '11px' }}>Lokasi Pekerjaan</div>
            <div style={{ fontWeight: 750, color: '#0F172A', marginTop: '2px' }}>{currentProject?.location || 'Indonesia'}</div>
          </div>
          <div>
            <div style={{ color: '#64748B', fontSize: '11px' }}>Nilai Kontrak</div>
            <div style={{ fontWeight: 800, color: '#2563EB', marginTop: '2px' }}>
              {summary.isContractAvailable ? formatRupiah(summary.contractValue) : '-'}
            </div>
          </div>
        </div>

        {/* 1. KPI Executive Summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            I. Ringkasan Eksekutif Finansial
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', fontSize: '12px' }}>
            <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px' }}>
              <div style={{ color: '#64748B' }}>Total Anggaran RAB</div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>{formatRupiah(summary.totalBudget)}</div>
            </div>
            <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px' }}>
              <div style={{ color: '#64748B' }}>Realisasi Pengeluaran</div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#DC2626', marginTop: '4px' }}>{formatRupiah(summary.actualCost)}</div>
            </div>
            <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px' }}>
              <div style={{ color: '#64748B' }}>Kas Masuk Diterima</div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#16A34A', marginTop: '4px' }}>{formatRupiah(summary.cashIn)}</div>
            </div>
            <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px' }}>
              <div style={{ color: '#64748B' }}>Gross Profit Sementara</div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#2563EB', marginTop: '4px' }}>
                {summary.isContractAvailable ? `${formatRupiah(summary.currentProfit)} (${summary.profitMarginPercent}%)` : '-'}
              </div>
            </div>
          </div>
        </div>

        {/* 2. Budget vs Actual Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            II. Pengendalian Biaya (Budget vs Actual)
          </h3>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
            <thead>
              <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '1px solid #CBD5E1' }}>
                <th style={{ padding: '8px 10px', fontWeight: 700 }}>Kelompok Pekerjaan</th>
                <th style={{ padding: '8px 10px', fontWeight: 700, textAlign: 'right' }}>Anggaran RAB</th>
                <th style={{ padding: '8px 10px', fontWeight: 700, textAlign: 'right' }}>Realisasi Pengeluaran</th>
                <th style={{ padding: '8px 10px', fontWeight: 700, textAlign: 'right' }}>Varians</th>
                <th style={{ padding: '8px 10px', fontWeight: 700, textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {budgetVsActual.items.map((i) => (
                <tr key={i.groupId} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>{i.groupName}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{formatRupiah(i.budgetAmount)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{formatRupiah(i.actualAmount)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: i.varianceAmount > 0 ? '#DC2626' : '#16A34A' }}>
                    {i.varianceAmount >= 0 ? '+' : ''}{formatRupiah(i.varianceAmount)} ({i.variancePercent >= 0 ? '+' : ''}{i.variancePercent}%)
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                    <span style={{ fontSize: '10.5px', fontWeight: 700, color: i.status === 'OVER_BUDGET' ? '#DC2626' : '#16A34A' }}>
                      {i.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 3. Receivables & Termins Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            III. Status Piutang & Penagihan Termin
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', fontSize: '12px' }}>
            <div style={{ padding: '10px', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div style={{ color: '#64748B' }}>Total Telah Ditagihkan</div>
              <div style={{ fontSize: '14px', fontWeight: 750, color: '#0F172A', marginTop: '2px' }}>{formatRupiah(receivables.totalInvoiced)}</div>
            </div>
            <div style={{ padding: '10px', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div style={{ color: '#64748B' }}>Sisa Piutang Berjalan</div>
              <div style={{ fontSize: '14px', fontWeight: 750, color: '#D97706', marginTop: '2px' }}>{formatRupiah(receivables.totalReceivable)}</div>
            </div>
            <div style={{ padding: '10px', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div style={{ color: '#64748B' }}>Piutang Jatuh Tempo</div>
              <div style={{ fontSize: '14px', fontWeight: 750, color: '#DC2626', marginTop: '2px' }}>{formatRupiah(receivables.totalOverdue)}</div>
            </div>
          </div>
        </div>

        {/* Signatures & Approval Footer */}
        <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #CBD5E1', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', textAlign: 'center', fontSize: '12px' }}>
          <div>
            <div style={{ color: '#64748B', marginBottom: '40px' }}>Dipersiapkan Oleh,</div>
            <div style={{ fontWeight: 750, color: '#0F172A' }}>Quantity Surveyor / Estimator</div>
          </div>
          <div>
            <div style={{ color: '#64748B', marginBottom: '40px' }}>Diperiksa Oleh,</div>
            <div style={{ fontWeight: 750, color: '#0F172A' }}>Project Manager</div>
          </div>
          <div>
            <div style={{ color: '#64748B', marginBottom: '40px' }}>Disetujui Oleh,</div>
            <div style={{ fontWeight: 750, color: '#0F172A' }}>Direktur Keuangan / Klien</div>
          </div>
        </div>
      </div>
    </div>
  );
};
