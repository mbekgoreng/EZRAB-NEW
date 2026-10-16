/**
 * DatabaseMinimal — Minimalist but cool material/upah/alat database.
 * Clean table, smart search, category pills. Dark accents.
 */
import React, { useState, useMemo } from 'react';
import { Package, HardHat, Truck, Search, Lightbulb } from 'lucide-react';
import { priceResolver2026 } from '../../data/priceDatabase2026/resolver';
import './DatabaseMinimal.css';

type Tab = 'material' | 'labor' | 'equipment';

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ size?: number | string; className?: string }> }[] = [
  { id: 'material', label: 'Material', icon: Package },
  { id: 'labor', label: 'Upah', icon: HardHat },
  { id: 'equipment', label: 'Alat', icon: Truck },
];

function fmtRp(n: number): string {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}

interface Props {
  initialTab?: 'MATERIALS' | 'LABOR' | 'EQUIPMENT' | 'PROJECT_PRICE';
  onNavigateToTab?: (tab: string) => void;
}

const TAB_MAP: Record<string, Tab> = { MATERIALS: 'material', LABOR: 'labor', EQUIPMENT: 'equipment', PROJECT_PRICE: 'material' };

export const DatabaseMinimal: React.FC<Props> = ({ initialTab }) => {
  const [tab, setTab] = useState<Tab>(TAB_MAP[initialTab ?? 'MATERIALS'] ?? 'material');
  const [q, setQ] = useState('');

  const items = useMemo(() => {
    try {
      const r: any = priceResolver2026 as any;
      // Try to get all records from the resolver's index
      const all: any[] = [];
      if (r.byName) {
        for (const [, recs] of r.byName) {
          for (const rec of recs as any[]) {
            if (!all.find((x) => x.name === rec.name && x.unit === rec.unit)) all.push(rec);
          }
        }
      }
      const typeMap: Record<Tab, string> = { material: 'material', labor: 'labor', equipment: 'equipment' };
      return all
        .filter((rec) => (rec.resourceType ?? 'material') === typeMap[tab])
        .slice(0, 200);
    } catch {
      return [];
    }
  }, [tab]);

  const filtered = useMemo(() => {
    if (!q.trim()) return items;
    const words = q.toLowerCase().split(/\s+/);
    return items.filter((it: any) => {
      const hay = `${it.name ?? ''} ${it.unit ?? ''}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [items, q]);

  return (
    <div className="dbm">
      <div className="dbm-head ezdb-anim" style={{ animation: 'ezdb-rise 0.6s 0s both' }}>
        <div>
          <h1>Database Harga</h1>
          <p>Harga material, upah & alat — update 2026</p>
        </div>
        <div className="dbm-search"><Search size={16} className="dbm-search-icon" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari..." /></div>
      </div>

      <div className="dbm-tabs ezdb-anim" style={{ animation: 'ezdb-rise 0.6s 0.08s both' }}>
        {TABS.map((t) => (
          <button key={t.id} className={`dbm-tab ${tab === t.id ? 'active' : ''}`} onClick={() => { setTab(t.id); setQ(''); }}>
            <t.icon size={18} /> {t.label}
            <span className="dbm-count">{tab === t.id ? filtered.length : ''}</span>
          </button>
        ))}
      </div>

      <div className="dbm-table-wrap ezdb-anim" style={{ animation: 'ezdb-rise 0.6s 0.16s both' }}>
        <table className="dbm-table">
          <thead><tr><th>Nama</th><th>Satuan</th><th style={{ textAlign: 'right' }}>Harga</th></tr></thead>
          <tbody>
            {filtered.map((it: any, i: number) => (
              <tr key={i}>
                <td><b>{it.name ?? '-'}</b>{it.spec && <div className="dbm-spec">{it.spec}</div>}</td>
                <td><span className="dbm-unit">{it.unit ?? '-'}</span></td>
                <td style={{ textAlign: 'right' }}><b className="dbm-price">{it.price != null ? fmtRp(Number(it.price)) : '—'}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="dbm-empty">{q ? 'Tidak ditemukan.' : 'Memuat data...'}</div>}
      </div>

      <p className="dbm-note"><Lightbulb size={15} /><span>Harga referensi nasional 2026. Sesuaikan dengan HSPK kabupaten/kota Anda sebelum digunakan untuk kontrak.</span></p>
    </div>
  );
};

export default DatabaseMinimal;
