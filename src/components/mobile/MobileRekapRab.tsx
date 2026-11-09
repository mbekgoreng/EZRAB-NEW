/**
 * MobileRekapRab — presentasi NATIVE mobile tab Rekapitulasi RAB
 * (Gelombang 1, layar 08 galeri EZRAB-ALL-MENUS-MOBILE).
 *
 * HANYA presentasi: seluruh angka berasal dari computeRekapSummary —
 * ringkasan kanonis yang SAMA dengan EstimatorRekapitulasiView desktop
 * (diekstrak ke estimator/rekapSummary.ts; tangga biaya tetap dihitung
 * UnifiedProjectEngine.recalculateCostSummary). Format mata uang memakai
 * useCurrency yang sama dengan desktop. Tombol Ekspor membuka modal
 * paket ekspor yang sama dengan desktop (PDF/Excel dipilih di sana —
 * tidak ada tombol ekspor karangan di sini).
 */
import React, { useMemo } from 'react';
import { Share2, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import type { Project, RabItem } from '../../types';
import { useCurrency } from '../../context/CurrencyContext';
import { computeRekapSummary } from '../estimator/rekapSummary';
import { formatRpFull } from './mobileV3Utils';

interface MobileRekapRabProps {
  currentProject: Project | null;
  items: RabItem[];
  onOpenExportModal?: () => void;
}

const GROUP_COLORS = ['#0B2B57', '#1E40AF', '#2563EB', '#3B82F6', '#60A5FA', '#0891B2', '#0D9488', '#65A30D', '#D97706', '#DC2626'];

export const MobileRekapRab: React.FC<MobileRekapRabProps> = ({ currentProject, items, onOpenExportModal }) => {
  const { formatDisplay } = useCurrency();
  const summary = useMemo(() => computeRekapSummary(items, currentProject), [items, currentProject]);

  if (items.length === 0) {
    return (
      <div className="mnw-screen">
        <div className="mnw-empty">
          <FileSpreadsheet size={26} color="#94A3B8" />
          <p style={{ margin: 0 }}>
            Belum ada item RAB.
            <br />
            Tambahkan item pekerjaan di Spreadsheet terlebih dahulu agar rekapitulasi dapat dihitung.
          </p>
        </div>
      </div>
    );
  }

  const taxesUnset = summary.overheadPct === 0 && summary.profitPct === 0;

  return (
    <div className="mnw-screen">
      {/* Komposisi per divisi */}
      <section className="mnw-card" style={{ padding: 0, overflow: 'hidden' }}>
        {summary.categoryList.map((group, idx) => {
          const weight = group.weight;
          const color = GROUP_COLORS[idx % GROUP_COLORS.length];
          return (
            <div key={group.name} className="mnw-rekap-row">
              <span className="mnw-rekap-num" style={{ background: color }}>{idx + 1}</span>
              <span className="mnw-rekap-main">
                <span className="mnw-rekap-name">{group.name}</span>
                <span className="mnw-rekap-weight">
                  <span className="mnw-rekap-track">
                    <span className="mnw-rekap-fill" style={{ display: 'block', width: `${Math.min(100, Math.max(0, weight))}%`, background: color }} />
                  </span>
                  <span className="mnw-rekap-pct">{weight.toFixed(1).replace('.', ',')}% · {group.count} item</span>
                </span>
              </span>
              <span className="mnw-rekap-total">{formatDisplay(group.total)}</span>
            </div>
          );
        })}
      </section>

      {/* Tangga biaya kanonis */}
      <section className="mnw-card" style={{ padding: '6px 0', marginTop: 12 }}>
        <div className="mnw-sum-row">
          <span>Subtotal (Biaya Langsung)</span>
          <b>{formatDisplay(summary.directCost)}</b>
        </div>
        <div className="mnw-sum-row">
          <span>Overhead ({summary.overheadPct}%)</span>
          <b>{formatDisplay(summary.overheadNominal)}</b>
        </div>
        <div className="mnw-sum-row">
          <span>Profit ({summary.profitPct}%)</span>
          <b>{formatDisplay(summary.profitNominal)}</b>
        </div>
        {taxesUnset && (
          <div className="mnw-sum-row" style={{ paddingTop: 0 }}>
            <span style={{ color: '#94A3B8', fontSize: 11.5 }}>Overhead &amp; profit 0% · belum diatur</span>
          </div>
        )}
        <div className="mnw-sum-row">
          <span>PPN {summary.ppnEnabled ? `(${summary.ppnPct}%)` : ''}</span>
          <b>{summary.ppnEnabled ? formatDisplay(summary.ppnNominal) : 'Nonaktif'}</b>
        </div>
        {summary.pphEnabled && (
          <div className="mnw-sum-row">
            <span>PPh ({summary.pphPct}%)</span>
            <b>{formatDisplay(summary.pphNominal)}</b>
          </div>
        )}
      </section>

      <div className="mnw-totalbar" style={{ marginTop: 12 }}>
        <div>
          <span className="mnw-totalbar-label">Total Akhir</span>
          <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.75)' }}>Sesuai tangga biaya di atas</span>
        </div>
        <span className="mnw-totalbar-value">{formatRpFull(summary.grandTotal)}</span>
      </div>

      {summary.unresolvedCount > 0 && (
        <div className="mnw-warn" style={{ display: 'flex', gap: 8 }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            {summary.unresolvedCount} item belum memiliki harga (PRICE_UNRESOLVED). Total di atas bersifat{' '}
            <b>PARSIAL</b> dan tidak termasuk item tersebut — lengkapi harga lewat Analisa Harga Satuan atau
            Inspektor item.
          </span>
        </div>
      )}

      {onOpenExportModal && (
        <button
          type="button"
          className="mnw-action-btn primary"
          style={{ marginTop: 12, padding: '13px 8px', borderRadius: 14 }}
          onClick={onOpenExportModal}
        >
          <Share2 size={15} /> Ekspor RAB (PDF / Excel)
        </button>
      )}

      <p className="mnw-sub" style={{ margin: '10px 2px 0', textAlign: 'center' }}>
        {currentProject?.name || 'Proyek aktif'} · {summary.categoryList.length} divisi · {items.length} item pekerjaan
      </p>
    </div>
  );
};

export default MobileRekapRab;
