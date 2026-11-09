/**
 * MobileLaporan — presentasi native mobile untuk tab Rekapitulasi menu
 * Laporan (Gelombang Native 2, 2026-11-10).
 *
 * Semua angka berasal dari perhitungan LaporanView yang sama:
 * laporanSummary (lib/laporanSummary), rekapCategories, projectSummary
 * (costSummary proyek, hanya tampil bila summaryMatchesItems), dan
 * boqData. Ekspor (Paket/PDF/Excel) memakai handler yang sama persis —
 * termasuk handleExportExcel yang diekstrak dari tombol desktop.
 * Donut digambar tersegmentasi dari nilai kategori yang sama (desktop
 * menggambar busur total 100% + legenda persen; data persennya identik).
 * Tab lain (BOQ/AHSP/Kurva S/Jadwal) tetap memakai bagian view yang sama
 * lewat chip tab — beralih tab mengembalikan render ke cabang utama view.
 */
import React from 'react';
import { ChevronDown, FileSpreadsheet, FileText, Layers, Package, Upload } from 'lucide-react';
import { Project } from '../../types';
import { LaporanSummary } from '../../lib/laporanSummary';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';
import { formatPriceCell } from '../reports/LaporanView';

export type LaporanTabId = 'rekapitulasi' | 'boq' | 'ahsp' | 'kurva-s' | 'jadwal';

export interface LaporanRekapCategory {
  no: number;
  id: string;
  name: string;
  value: number;
  color: string;
  pricedCount: number;
  itemCount: number;
}

export interface LaporanBoqGroup {
  categoryCode: string;
  categoryName: string;
  items: any[];
}

export interface MobileLaporanProps {
  projectName: string;
  projectOptions: Array<{ id: string; name: string }>;
  selectedProjectId: string;
  onSelectProject: (id: string) => void;
  hasRealProject: boolean;
  onExportPackage: () => void;
  onExportPdf: () => void;
  isExportingPdf: boolean;
  onExportExcel: () => void;
  activeTab: LaporanTabId;
  onSelectTab: (tab: LaporanTabId) => void;
  summary: LaporanSummary;
  rekapCategories: LaporanRekapCategory[];
  totalRekapValue: number;
  grandTotalValue: number;
  projectSummary?: Project['costSummary'];
  summaryMatchesItems: boolean;
  boqData: LaporanBoqGroup[];
  expandedCategories: Record<string, boolean>;
  onToggleCategory: (catId: string) => void;
}

const TABS: Array<{ id: LaporanTabId; label: string }> = [
  { id: 'rekapitulasi', label: 'Rekapitulasi' },
  { id: 'boq', label: 'BOQ' },
  { id: 'ahsp', label: 'Analisa Harga Satuan' },
  { id: 'kurva-s', label: 'Kurva S' },
  { id: 'jadwal', label: 'Jadwal Waktu' },
];

const resolveDonutColor = (color: string): string => (color.startsWith('var(') ? '#2563EB' : color);

export const MobileLaporan: React.FC<MobileLaporanProps> = ({
  projectName,
  projectOptions,
  selectedProjectId,
  onSelectProject,
  hasRealProject,
  onExportPackage,
  onExportPdf,
  isExportingPdf,
  onExportExcel,
  activeTab,
  onSelectTab,
  summary,
  rekapCategories,
  totalRekapValue,
  grandTotalValue,
  projectSummary,
  summaryMatchesItems,
  boqData,
  expandedCategories,
  onToggleCategory,
}) => {
  // Segmen donut dari nilai kategori berharga — persen yang sama dengan
  // legenda desktop.
  let donutOffset = 0;
  const donutSegments = rekapCategories
    .filter((cat) => totalRekapValue > 0 && cat.pricedCount > 0 && cat.value > 0)
    .map((cat) => {
      const pct = (cat.value / totalRekapValue) * 100;
      const seg = { key: cat.no, color: resolveDonutColor(cat.color), pct, offset: donutOffset };
      donutOffset += pct;
      return seg;
    });

  const totalVolumeLabel =
    summary.volumeItemCount === 0
      ? '—'
      : `${summary.totalVolume.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${summary.dominantVolumeUnit ?? ''}`;

  return (
    <div className="mnw-screen">
      <div className="mnw-eyebrow">Laporan</div>
      <h2 className="mnw-title">Laporan Proyek</h2>
      <p className="mnw-sub">{projectName}</p>

      {/* Pemilih proyek — state yang sama dengan pemilih desktop */}
      {projectOptions.length > 0 && (
        <div className="mnw-card" style={{ marginBottom: 12, padding: 10 }}>
          <select
            className="mnw-lap-select"
            value={selectedProjectId}
            onChange={(e) => onSelectProject(e.target.value)}
            aria-label="Pilih proyek laporan"
          >
            {projectOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Ekspor — handler yang sama persis */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <button type="button" className="mnw-action-btn primary" onClick={onExportPackage} disabled={!hasRealProject}>
          <Package size={15} /> Ekspor Paket
        </button>
        <button type="button" className="mnw-action-btn" onClick={onExportPdf} disabled={isExportingPdf}>
          <Upload size={15} /> {isExportingPdf ? 'Membuat PDF…' : 'Export PDF'}
        </button>
        <button type="button" className="mnw-action-btn" onClick={onExportExcel}>
          <FileSpreadsheet size={15} /> Excel
        </button>
      </div>

      {/* Tab laporan — state activeTab yang sama */}
      <div className="mnw-chips" role="tablist" aria-label="Tab laporan">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`mnw-chip${activeTab === tab.id ? ' is-active' : ''}`}
            onClick={() => onSelectTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* KPI — logika nilai & sub-label yang sama dengan kartu desktop */}
      <div className="mnw-kpi-grid" style={{ marginTop: 14 }}>
        <div className="mnw-kpi-card">
          <span className="mnw-kpi-label">
            <FileText size={13} /> Total Nilai RAB
          </span>
          <span className="mnw-kpi-value small">
            {summary.totalRabValue === null ? 'Belum dapat dihitung' : formatCurrencyIDR(summary.totalRabValue)}
          </span>
          <span className="mnw-kpi-sub">
            {summary.rabTotalState === 'EMPTY'
              ? 'Belum ada item RAB'
              : summary.rabTotalState === 'UNPRICED'
                ? `${summary.totalItems} item belum memiliki harga`
                : summary.rabTotalState === 'PARTIAL'
                  ? `dari ${summary.pricedItemCount} dari ${summary.totalItems} item berharga`
                  : `Terakumulasi ${summary.categoryCount} kategori`}
          </span>
        </div>
        <div className="mnw-kpi-card">
          <span className="mnw-kpi-label">
            <Layers size={13} /> Total Item Pekerjaan
          </span>
          <span className="mnw-kpi-value">{summary.totalItems === 0 ? '—' : `${summary.totalItems} Item`}</span>
          <span className="mnw-kpi-sub">
            {summary.totalItems === 0 ? 'Belum ada data' : `${summary.categoryCount} Kategori aktif`}
          </span>
        </div>
        <div className="mnw-kpi-card">
          <span className="mnw-kpi-label">Total Volume</span>
          <span className="mnw-kpi-value small">{totalVolumeLabel}</span>
          <span className="mnw-kpi-sub">
            {summary.volumeItemCount === 0
              ? 'Belum ada volume tercatat'
              : [
                  summary.missingVolumeCount > 0
                    ? `dari ${summary.volumeItemCount} dari ${summary.totalItems} item`
                    : 'Akumulasi volume pekerjaan',
                  summary.otherUnitItemCount > 0
                    ? `${summary.otherUnitItemCount} item satuan lain tidak dijumlahkan`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
          </span>
        </div>
        <div className="mnw-kpi-card">
          <span className="mnw-kpi-label">Progress</span>
          <span className="mnw-kpi-value">
            {summary.progressPercent === null
              ? '—'
              : `${summary.progressPercent.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`}
          </span>
          <span className="mnw-kpi-sub">
            {summary.progressPercent === null
              ? 'Belum ada data progress'
              : summary.progressSource === 'SCHEDULE_TASKS'
                ? `Dari ${summary.scheduleTaskCount} tugas jadwal`
                : 'Progress tercatat proyek'}
          </span>
        </div>
      </div>

      {/* Rekapitulasi + donut */}
      <div className="mnw-group-title">Rekapitulasi Anggaran Biaya</div>
      <div className="mnw-card">
        <div className="mnw-lap-donutwrap">
          <div className="mnw-lap-donut">
            <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%' }}>
              <path
                stroke="#EEF2F7"
                strokeWidth="3.8"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              {donutSegments.map((seg) => (
                <path
                  key={seg.key}
                  stroke={seg.color}
                  strokeDasharray={`${seg.pct}, ${100 - seg.pct}`}
                  strokeDashoffset={-seg.offset}
                  strokeWidth="3.8"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              ))}
            </svg>
            <div className="mnw-lap-donut-center">
              <span className="mnw-lap-donut-pct">{totalRekapValue > 0 ? '100%' : '—'}</span>
              <span className="mnw-lap-donut-cap">Total Anggaran</span>
              <span className="mnw-lap-donut-val">
                {summary.pricedItemCount === 0 ? 'Harga belum diisi' : formatCurrencyIDR(grandTotalValue)}
              </span>
            </div>
          </div>
        </div>

        {rekapCategories.map((cat) => {
          const pct =
            totalRekapValue > 0 && cat.pricedCount > 0 ? ((cat.value / totalRekapValue) * 100).toFixed(2) : null;
          return (
            <div key={cat.no} className="mnw-sum-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                <span className="mnw-status-dot" style={{ background: resolveDonutColor(cat.color) }} />
                <span style={{ overflowWrap: 'anywhere' }}>
                  {cat.no}. {cat.name}
                </span>
              </span>
              <span style={{ textAlign: 'right' }}>
                <b>{cat.pricedCount === 0 ? 'Harga belum diisi' : cat.value.toLocaleString('id-ID')}</b>
                <span className="mnw-lap-pct">{pct === null ? '—' : `${pct}%`}</span>
              </span>
            </div>
          );
        })}

        <div className="mnw-sum-row" style={{ paddingLeft: 0, paddingRight: 0, borderTop: '2px solid #0F172A', marginTop: 4 }}>
          <span style={{ fontWeight: 800, color: '#0F172A' }}>Total Biaya Langsung</span>
          <b style={{ color: '#1D4ED8' }}>
            {summary.pricedItemCount === 0 ? 'Harga belum diisi' : formatCurrencyIDR(totalRekapValue)}
          </b>
        </div>

        {summaryMatchesItems && projectSummary && (
          <>
            <div className="mnw-sum-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
              <span>Overhead ({projectSummary.overheadPercent}%)</span>
              <b>{formatCurrencyIDR(projectSummary.overheadAmount)}</b>
            </div>
            <div className="mnw-sum-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
              <span>Profit ({projectSummary.profitPercent}%)</span>
              <b>{formatCurrencyIDR(projectSummary.profitAmount)}</b>
            </div>
            <div className="mnw-sum-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
              <span>Subtotal sebelum Pajak</span>
              <b>{formatCurrencyIDR(projectSummary.subtotalBeforeTax)}</b>
            </div>
            <div className="mnw-sum-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
              <span>PPN ({projectSummary.taxPercent}%)</span>
              <b>{formatCurrencyIDR(projectSummary.taxAmount)}</b>
            </div>
            <div className="mnw-sum-row grand">
              <span>Total Anggaran (Grand Total)</span>
              <b>{formatCurrencyIDR(projectSummary.grandTotal)}</b>
            </div>
          </>
        )}
      </div>

      {/* Detail rekapitulasi — kartu grup yang bisa dibuka */}
      <div className="mnw-group-title">Detail Rekapitulasi</div>
      {boqData.length === 0 ? (
        <div className="mnw-empty">Belum ada item RAB untuk ditampilkan.</div>
      ) : (
        boqData.map((group) => {
          const toggleKey = `detail-${group.categoryName}`;
          const isOpen = expandedCategories[toggleKey] ?? false;
          const groupPricedCount = group.items.filter((it: any) => it.amount !== null && it.amount !== undefined).length;
          const groupTotal = group.items.reduce((s: number, it: any) => s + (it.amount ?? 0), 0);
          return (
            <div key={toggleKey} className="mnw-qto-list" style={{ marginBottom: 10 }}>
              <button type="button" className="mnw-div-head" onClick={() => onToggleCategory(toggleKey)} aria-expanded={isOpen}>
                <span className="mnw-div-chip">{group.categoryCode}</span>
                <span className="mnw-div-name">{group.categoryName}</span>
                <span className="mnw-div-total">
                  {groupPricedCount === 0 ? 'Harga belum diisi' : formatCurrencyIDR(groupTotal)}
                </span>
                <ChevronDown
                  size={16}
                  color="#94A3B8"
                  style={{ transform: isOpen ? 'rotate(180deg)' : 'none', flexShrink: 0 }}
                />
              </button>
              {isOpen &&
                group.items.map((item: any, idx: number) => (
                  <div key={idx} className="mnw-lap-item">
                    <div className="mnw-lap-item-main">
                      <span className="mnw-lap-item-desc">
                        {item.no} · {item.desc}
                      </span>
                      <span className="mnw-lap-item-meta">
                        {typeof item.vol === 'number' && Number.isFinite(item.vol)
                          ? item.vol.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          : '—'}{' '}
                        {item.unit} · Harga satuan {formatPriceCell(item.price)}
                      </span>
                    </div>
                    <span className="mnw-lap-item-amt">{formatPriceCell(item.amount)}</span>
                  </div>
                ))}
            </div>
          );
        })
      )}
    </div>
  );
};

export default MobileLaporan;
