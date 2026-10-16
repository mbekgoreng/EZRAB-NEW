/**
 * LaporanMax — Maximized project reports: RAB, BOQ, Rekap, AHSP in one clean hub.
 * Export PDF/Excel, per-division breakdown, print-ready.
 */
import React, { useState, useMemo } from 'react';
import { ClipboardList, Package, BarChart3, BookOpen, Printer, Download } from 'lucide-react';
import './LaporanMax.css';

interface Props {
  projects?: any[];
  rabItems?: any[];
  onNavigateToTab?: (tab: string) => void;
}

type ReportKind = 'rab' | 'boq' | 'rekap' | 'ahsp';

const KINDS: { id: ReportKind; label: string; icon: React.ComponentType<{ size?: number | string; className?: string }>; desc: string }[] = [
  { id: 'rab', label: 'RAB', icon: ClipboardList, desc: 'Rencana Anggaran Biaya lengkap' },
  { id: 'boq', label: 'BOQ', icon: Package, desc: 'Bill of Quantity per item' },
  { id: 'rekap', label: 'Rekap', icon: BarChart3, desc: 'Rekapitulasi per divisi' },
  { id: 'ahsp', label: 'AHSP', icon: BookOpen, desc: 'Analisa harga satuan' },
];

function fmtRp(n: number): string {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}

export const LaporanMax: React.FC<Props> = ({ projects = [], rabItems = [] }) => {
  const [kind, setKind] = useState<ReportKind>('rab');
  const [projectId, setProjectId] = useState<string>(projects[0]?.id ?? '');

  const items = useMemo(() => {
    if (!projectId) return rabItems;
    return rabItems.filter((it: any) => !it.projectId || it.projectId === projectId);
  }, [rabItems, projectId]);

  const divisions = useMemo(() => {
    const map = new Map<string, { items: any[]; total: number }>();
    for (const it of items) {
      const d = it.division ?? it.category ?? 'Lainnya';
      const e = map.get(d) ?? { items: [], total: 0 };
      e.items.push(it);
      e.total += Number(it.totalPrice ?? it.subtotal ?? (it.quantity ?? 0) * (it.unitPrice ?? 0)) || 0;
      map.set(d, e);
    }
    return [...map.entries()].map(([name, v]) => ({ name, ...v }));
  }, [items]);

  const grandTotal = useMemo(() => divisions.reduce((s, d) => s + d.total, 0), [divisions]);

  const doPrint = () => window.print();

  return (
    <div className="lpm">
      <div className="lpm-head ezdb-anim" style={{ animation: 'ezdb-rise 0.6s 0s both' }}>
        <div><h1>Laporan Proyek</h1><p>Dokumen RAB profesional siap cetak & export</p></div>
        <div className="lpm-actions">
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="lpm-select">
            {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="lpm-btn" onClick={doPrint}><Printer size={15} /> Cetak</button>
          <button className="lpm-btn primary" onClick={doPrint}><Download size={15} /> Export PDF</button>
        </div>
      </div>

      <div className="lpm-kinds ezdb-anim" style={{ animation: 'ezdb-rise 0.6s 0.08s both' }}>
        {KINDS.map((k) => (
          <button key={k.id} className={`lpm-kind ${kind === k.id ? 'active' : ''}`} onClick={() => setKind(k.id)}>
            <span className="lpm-kind-icon"><k.icon size={20} /></span>
            <b>{k.label}</b><small>{k.desc}</small>
          </button>
        ))}
      </div>

      <div className="lpm-doc ezdb-anim" style={{ animation: 'ezdb-rise 0.6s 0.16s both' }}>
        <div className="lpm-kop">
          <div className="lpm-kop-logo">EZRAB</div>
          <div><b>RENCANA ANGGARAN BIAYA ({kind.toUpperCase()})</b><p>{projects.find((p: any) => p.id === projectId)?.name ?? '—'}</p></div>
          <div className="lpm-kop-date">{new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>

        {kind === 'rekap' ? (
          <table className="lpm-table">
            <thead><tr><th>No</th><th>Divisi Pekerjaan</th><th style={{ textAlign: 'right' }}>Jumlah (Rp)</th><th style={{ textAlign: 'right' }}>%</th></tr></thead>
            <tbody>
              {divisions.map((d, i) => (
                <tr key={d.name}><td>{i + 1}</td><td><b>{d.name}</b> <span className="lpm-muted">({d.items.length} item)</span></td><td style={{ textAlign: 'right' }}><b>{fmtRp(d.total)}</b></td><td style={{ textAlign: 'right' }}>{grandTotal ? ((d.total / grandTotal) * 100).toFixed(1) : 0}%</td></tr>
              ))}
              <tr className="lpm-total"><td colSpan={2}><b>TOTAL</b></td><td style={{ textAlign: 'right' }}><b>{fmtRp(grandTotal)}</b></td><td style={{ textAlign: 'right' }}><b>100%</b></td></tr>
            </tbody>
          </table>
        ) : (
          <table className="lpm-table">
            <thead><tr><th>No</th><th>Uraian Pekerjaan</th><th>Vol</th><th>Sat</th><th style={{ textAlign: 'right' }}>Harga Satuan</th><th style={{ textAlign: 'right' }}>Jumlah</th></tr></thead>
            <tbody>
              {divisions.map((d) => (
                <React.Fragment key={d.name}>
                  <tr className="lpm-div"><td colSpan={6}><b>{d.name.toUpperCase()}</b></td></tr>
                  {d.items.map((it: any, i: number) => {
                    const qty = Number(it.quantity ?? it.volume ?? 0);
                    const price = Number(it.unitPrice ?? it.harga_satuan ?? 0);
                    const total = Number(it.totalPrice ?? it.subtotal ?? qty * price) || 0;
                    return (
                      <tr key={it.id ?? i}>
                        <td>{i + 1}</td><td>{it.name ?? it.description ?? '-'}{kind === 'ahsp' && it.ahspCode && <div className="lpm-muted">AHSP: {it.ahspCode}</div>}</td>
                        <td>{qty.toLocaleString('id-ID')}</td><td>{it.unit ?? it.satuan ?? '-'}</td>
                        <td style={{ textAlign: 'right' }}>{fmtRp(price)}</td><td style={{ textAlign: 'right' }}><b>{fmtRp(total)}</b></td>
                      </tr>
                    );
                  })}
                  <tr className="lpm-subtotal"><td colSpan={5} style={{ textAlign: 'right' }}>Subtotal {d.name}</td><td style={{ textAlign: 'right' }}><b>{fmtRp(d.total)}</b></td></tr>
                </React.Fragment>
              ))}
              <tr className="lpm-total"><td colSpan={5}><b>GRAND TOTAL</b></td><td style={{ textAlign: 'right' }}><b>{fmtRp(grandTotal)}</b></td></tr>
            </tbody>
          </table>
        )}

        <div className="lpm-sign">
          <div><p>Diperiksa,</p><br /><br /><b>(........................)</b></div>
          <div><p>Disetujui,</p><br /><br /><b>(........................)</b></div>
        </div>
      </div>
    </div>
  );
};

export default LaporanMax;
