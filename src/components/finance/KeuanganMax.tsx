/**
 * KeuanganMax — Maximized finance: overview, termin, cashflow in one sleek hub.
 */
import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  CreditCard,
  Banknote,
  TrendingDown,
  Zap,
  Receipt,
  Plus,
  Download,
  Check,
  Hourglass,
  CalendarDays,
} from 'lucide-react';
import './KeuanganMax.css';

interface Props {
  currentProject?: any;
  projects?: any[];
  rabItems?: any[];
  initialTab?: string;
  onNavigateToTab?: (tab: string, projectId?: string | null) => void;
}

type Tab = 'overview' | 'termin' | 'cashflow';

const TAB_DEFS: { id: Tab; label: string; icon: React.ComponentType<{ size?: number | string; className?: string }> }[] = [
  { id: 'overview', label: 'Ringkasan', icon: BarChart3 },
  { id: 'termin', label: 'Termin', icon: CreditCard },
  { id: 'cashflow', label: 'Cashflow', icon: Banknote },
];

function fmtRp(n: number): string {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}
function fmtShort(n: number): string {
  if (n >= 1e9) return `Rp ${(n / 1e9).toFixed(1)} M`;
  if (n >= 1e6) return `Rp ${(n / 1e6).toFixed(0)} jt`;
  return fmtRp(n);
}

export const KeuanganMax: React.FC<Props> = ({ currentProject, projects = [], rabItems = [] }) => {
  const [tab, setTab] = useState<Tab>('overview');
  const [projectId, setProjectId] = useState(currentProject?.id ?? projects[0]?.id ?? '');

  const total = useMemo(() => {
    const items = projectId ? rabItems.filter((it: any) => !it.projectId || it.projectId === projectId) : rabItems;
    return items.reduce((s: number, it: any) => s + (Number(it.totalPrice ?? it.subtotal ?? (it.quantity ?? 0) * (it.unitPrice ?? 0)) || 0), 0);
  }, [rabItems, projectId]);

  const termins = useMemo(() => {
    const pct = [20, 40, 75, 100];
    return pct.map((p, i) => ({
      name: `Termin ${i + 1}`, pct: p, value: (total * (i === 0 ? 0.2 : i === 1 ? 0.2 : i === 2 ? 0.35 : 0.25)),
      status: i < 2 ? 'cair' : i === 2 ? 'proses' : 'jadwal',
    }));
  }, [total]);

  const cair = termins.filter((t) => t.status === 'cair').reduce((s, t) => s + t.value, 0);

  return (
    <div className="keu">
      <div className="keu-head ezdb-anim" style={{ animation: 'ezdb-rise 0.6s 0s both' }}>
        <div><h1>Keuangan Proyek</h1><p>Cashflow, termin & realisasi biaya</p></div>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="keu-select">
          {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div className="keu-kpis">
        <div className="ez-stat ez-stat-cream ezdb-anim" style={{ animation: 'ezdb-rise 0.6s 0.05s both' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-warm)', marginBottom: '8px' }}>Rencana Anggaran</div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: 'var(--ez-color-text-primary)' }}>{fmtShort(total)}</div>
        </div>
        <div className="ez-stat ez-stat-mint ezdb-anim" style={{ animation: 'ezdb-rise 0.6s 0.12s both' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-warm)', marginBottom: '8px' }}>Termin Cair</div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: 'var(--ez-color-text-primary)' }}>{fmtShort(cair)}</div>
        </div>
        <div className="ez-stat ez-stat-peach ezdb-anim" style={{ animation: 'ezdb-rise 0.6s 0.19s both' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-warm)', marginBottom: '8px' }}>Menunggu</div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: 'var(--ez-color-text-primary)' }}>{fmtShort(total - cair)}</div>
        </div>
        <div className="ez-stat ez-stat-sky ezdb-anim" style={{ animation: 'ezdb-rise 0.6s 0.26s both' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-warm)', marginBottom: '8px' }}>Progres</div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: 'var(--ez-color-text-primary)' }}>{total ? Math.round((cair / total) * 100) : 0}%</div>
        </div>
      </div>

      <div className="keu-tabs ezdb-anim" style={{ animation: 'ezdb-rise 0.6s 0.3s both' }}>
        {TAB_DEFS.map((t) => (
          <button key={t.id} className={`keu-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'termin' && (
        <div className="keu-card ezdb-anim" style={{ animation: 'ezdb-rise 0.6s 0.34s both' }}>
          <table className="keu-table">
            <thead><tr><th>Termin</th><th>Bobot</th><th style={{ textAlign: 'right' }}>Nilai</th><th>Status</th></tr></thead>
            <tbody>
              {termins.map((t) => (
                <tr key={t.name}>
                  <td><b>{t.name}</b></td><td>{t.pct}%</td>
                  <td style={{ textAlign: 'right' }}><b>{fmtRp(t.value)}</b></td>
                  <td>{t.status === 'cair' ? <span className="keu-pill green"><Check size={12} strokeWidth={3} /> Cair</span> : t.status === 'proses' ? <span className="keu-pill amber"><Hourglass size={12} /> Proses</span> : <span className="keu-pill slate"><CalendarDays size={12} /> Jadwal</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'cashflow' && (
        <div className="keu-card ezdb-anim" style={{ animation: 'ezdb-rise 0.6s 0.34s both' }}>
          <span className="keu-card-title"><TrendingDown size={16} /> Proyeksi Cashflow</span>
          <div className="keu-chart">
            {[35, 55, 45, 70, 60, 85].map((h, i) => (
              <div key={i} className="keu-bar" style={{ height: `${h}%` }} title={`Bulan ${i + 1}`} />
            ))}
          </div>
          <div className="keu-months">{['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun'].map((m) => <span key={m}>{m}</span>)}</div>
        </div>
      )}

      {tab === 'overview' && (
        <div className="keu-grid">
          <div className="keu-card ezdb-anim" style={{ animation: 'ezdb-rise 0.6s 0.34s both' }}>
            <span className="keu-card-title"><Banknote size={16} /> Realisasi vs Rencana</span>
            <div className="keu-bigbar"><div style={{ width: total ? `${Math.min(100, (cair / total) * 100)}%` : '0%' }} /></div>
            <div className="keu-row"><span>Terserap</span><b>{fmtRp(cair)}</b></div>
            <div className="keu-row"><span>Sisa anggaran</span><b>{fmtRp(total - cair)}</b></div>
          </div>
          <div className="keu-card ezdb-anim" style={{ animation: 'ezdb-rise 0.6s 0.4s both' }}>
            <span className="keu-card-title"><Zap size={16} /> Aksi Cepat</span>
            <div className="keu-actions">
              <button><Plus size={15} /> Catat Pemasukan</button>
              <button><Plus size={15} /> Catat Pengeluaran</button>
              <button><Receipt size={15} /> Buat Invoice</button>
              <button><Download size={15} /> Export Laporan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KeuanganMax;
