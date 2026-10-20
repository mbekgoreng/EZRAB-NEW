import React, { useState, useMemo } from 'react';
import type { HouseSpec, RoomSpec } from './specEngine';

export interface SpreadsheetRow {
  id: string;
  kategori: string;
  kode: string;
  uraian: string;
  panjang: number;
  lebar: number;
  tinggi: number;
  jumlah: number;
  satuan: string;
  volume: number;
  sumber: string;
  status: 'TERHITUNG' | 'ASUMSI' | 'PERLU_REVIEW';
  catatan: string;
}

interface DesignSpreadsheetProps {
  spec: HouseSpec;
}

/**
 * Generate baris spreadsheet dari HouseSpec.
 * Kolom: Kategori | Kode | Uraian | Panjang | Lebar | Tinggi | Jumlah | Satuan | Volume/Luas | Sumber | Status | Catatan
 */
export function specToSpreadsheetRows(spec: HouseSpec): SpreadsheetRow[] {
  const rows: SpreadsheetRow[] = [];
  let idx = 0;
  const nextId = () => `row-${++idx}`;

  // 1. Ringkasan proyek (sebagai baris info)
  rows.push({
    id: nextId(), kategori: 'PROYEK', kode: 'PRJ-001',
    uraian: `${spec.buildingType} ${spec.floors} lantai`,
    panjang: spec.buildingLengthM, lebar: spec.buildingWidthM, tinggi: 0,
    jumlah: 1, satuan: 'unit',
    volume: spec.buildingAreaM2,
    sumber: 'Prompt pengguna', status: 'TERHITUNG',
    catatan: `Target: ${spec.targetAreaM2} m²`,
  });

  // 2. Daftar ruang
  for (const room of spec.rooms) {
    rows.push({
      id: nextId(), kategori: 'RUANG', kode: room.id.toUpperCase(),
      uraian: room.name,
      panjang: room.lengthM, lebar: room.widthM, tinggi: 3.2,
      jumlah: 1, satuan: 'm²',
      volume: room.areaM2,
      sumber: room.isAssumed ? 'Asumsi sistem' : 'Prompt pengguna',
      status: room.isAssumed ? 'ASUMSI' : 'TERHITUNG',
      catatan: `Posisi: (${room.x}, ${room.y})`,
    });
  }

  // 3. Volume pekerjaan awal (turunan geometri)
  const wallT = spec.wallThicknessM;
  const perimeter = 2 * (spec.buildingWidthM + spec.buildingLengthM);
  const wallHeight = 3.2;

  rows.push({
    id: nextId(), kategori: 'PEKERJAAN', kode: 'W-001',
    uraian: 'Dinding bata perimeter',
    panjang: perimeter, lebar: wallT, tinggi: wallHeight,
    jumlah: 1, satuan: 'm³',
    volume: Math.round(perimeter * wallT * wallHeight * 100) / 100,
    sumber: 'Turunan geometri',
    status: 'PERLU_REVIEW',
    catatan: 'Belum dikurangi bukaan pintu/jendela',
  });

  rows.push({
    id: nextId(), kategori: 'PEKERJAAN', kode: 'F-001',
    uraian: 'Pelat lantai dasar',
    panjang: spec.buildingLengthM, lebar: spec.buildingWidthM, tinggi: 0.12,
    jumlah: 1, satuan: 'm³',
    volume: Math.round(spec.buildingAreaM2 * 0.12 * 100) / 100,
    sumber: 'Turunan geometri',
    status: 'PERLU_REVIEW',
    catatan: 'Tebal asumsi 12 cm',
  });

  rows.push({
    id: nextId(), kategori: 'PEKERJAAN', kode: 'F-002',
    uraian: 'Lantai keramik',
    panjang: spec.buildingLengthM, lebar: spec.buildingWidthM, tinggi: 0,
    jumlah: 1, satuan: 'm²',
    volume: Math.round(spec.buildingAreaM2 * 100) / 100,
    sumber: 'Turunan geometri',
    status: 'PERLU_REVIEW',
    catatan: '',
  });

  return rows;
}

/**
 * Export ke CSV (valid, dengan escaping).
 */
export function rowsToCSV(rows: SpreadsheetRow[]): string {
  const headers = ['Kategori', 'Kode', 'Uraian', 'Panjang', 'Lebar', 'Tinggi', 'Jumlah', 'Satuan', 'Volume/Luas', 'Sumber', 'Status', 'Catatan'];
  const esc = (v: string | number) => {
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(',')];
  for (const r of rows) {
    lines.push([r.kategori, r.kode, r.uraian, r.panjang, r.lebar, r.tinggi, r.jumlah, r.satuan, r.volume, r.sumber, r.status, r.catatan].map(esc).join(','));
  }
  return lines.join('\n');
}

/**
 * Download file (browser).
 */
export function downloadFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Spreadsheet editable untuk desain rumah AI.
 * Bahasa desain dashboard EZRAB (token --ez-*): header terang, status pill,
 * tanpa tombol ekspor (keputusan owner 2026-10-21 — buat simple).
 * Helper rowsToCSV/downloadFile tetap diekspor untuk test & pemakaian lain.
 */
export const DesignSpreadsheet: React.FC<DesignSpreadsheetProps> = ({ spec }) => {
  const initialRows = useMemo(() => specToSpreadsheetRows(spec), [spec]);
  const [rows, setRows] = useState<SpreadsheetRow[]>(initialRows);
  const [activeTab, setActiveTab] = useState<'ruang' | 'pekerjaan' | 'semua'>('semua');

  // Sync ketika spec berubah (tanpa duplikasi: regenerate dari spec)
  React.useEffect(() => {
    setRows(specToSpreadsheetRows(spec));
  }, [spec]);

  const updateCell = (id: string, field: keyof SpreadsheetRow, value: string | number) => {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r, [field]: value };
      // Hitung ulang volume jika dimensi berubah
      if (['panjang', 'lebar', 'tinggi', 'jumlah'].includes(field as string)) {
        const p = Number(updated.panjang) || 0;
        const l = Number(updated.lebar) || 0;
        const t = Number(updated.tinggi) || 0;
        const j = Number(updated.jumlah) || 0;
        updated.volume = updated.satuan === 'm²'
          ? Math.round(p * l * j * 100) / 100
          : Math.round(p * l * t * j * 100) / 100;
        updated.status = 'TERHITUNG';
      }
      return updated;
    }));
  };

  const filtered = activeTab === 'semua' ? rows : rows.filter(r =>
    activeTab === 'ruang' ? r.kategori === 'RUANG' : r.kategori === 'PEKERJAAN'
  );

  const statusPill = (s: SpreadsheetRow['status']): React.CSSProperties => ({
    display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap',
    color: s === 'TERHITUNG' ? '#059669' : s === 'ASUMSI' ? '#D97706' : '#DC2626',
    background: s === 'TERHITUNG' ? 'rgba(16,185,129,0.12)' : s === 'ASUMSI' ? 'rgba(245,158,11,0.14)' : 'rgba(239,68,68,0.10)',
  });

  const cellInput: React.CSSProperties = {
    border: '1px solid transparent', borderRadius: 7, padding: '4px 6px', width: '100%',
    fontSize: 12.5, background: 'transparent', color: 'var(--ez-color-text-primary)', outline: 'none',
  };
  const numInput: React.CSSProperties = { ...cellInput, width: 58, textAlign: 'right' };

  return (
    <div className="ai-design-spreadsheet">
      {/* Filter — segmented control (selaras tab studio) */}
      <div style={{
        display: 'inline-flex', gap: 4, marginBottom: 14, flexWrap: 'wrap',
        background: 'var(--ez-color-surface-secondary)', border: '1px solid var(--ez-color-border-soft)',
        borderRadius: 12, padding: 4,
      }}>
        {(['semua', 'ruang', 'pekerjaan'] as const).map(tab => (
          <button key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '6px 14px', borderRadius: 9, border: 'none',
              background: activeTab === tab ? 'var(--ez-color-surface)' : 'transparent',
              color: activeTab === tab ? 'var(--ez-color-text-primary)' : 'var(--ez-color-text-secondary)',
              fontWeight: activeTab === tab ? 700 : 550, fontSize: 12.5, cursor: 'pointer',
              boxShadow: activeTab === tab ? '0 1px 3px rgba(15, 23, 42, 0.10)' : 'none',
              transition: 'all 0.15s ease',
            }}>
            {tab === 'semua' ? 'Semua' : tab === 'ruang' ? 'Daftar Ruang' : 'Pekerjaan'}
          </button>
        ))}
      </div>
      <div style={{
        overflowX: 'auto', borderRadius: 16, border: '1px solid var(--ez-color-border)',
        background: 'var(--ez-color-surface)', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
      }}>
        <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse', minWidth: 900 }}>
          <thead>
            <tr style={{ background: 'var(--ez-color-surface-secondary)' }}>
              {['Kategori', 'Kode', 'Uraian', 'Pjg', 'Lbr', 'Tgi', 'Jml', 'Sat', 'Volume', 'Sumber', 'Status'].map(h => (
                <th key={h} style={{
                  padding: '10px 8px', textAlign: 'left', whiteSpace: 'nowrap',
                  fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
                  color: 'var(--ez-color-text-muted)', borderBottom: '1px solid var(--ez-color-border-soft)',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--ez-color-border-soft)' }}>
                <td style={{ padding: '5px 8px', color: 'var(--ez-color-text-secondary)', fontWeight: 600 }}>{r.kategori}</td>
                <td style={{ padding: '5px 8px', fontFamily: 'monospace', fontSize: 11.5, color: 'var(--ez-color-text-muted)' }}>{r.kode}</td>
                <td style={{ padding: '5px 4px', minWidth: 170 }}>
                  <input value={r.uraian} onChange={e => updateCell(r.id, 'uraian', e.target.value)} style={cellInput} />
                </td>
                {(['panjang', 'lebar', 'tinggi', 'jumlah'] as const).map(f => (
                  <td key={f} style={{ padding: '5px 4px' }}>
                    <input type="number" value={r[f]} onChange={e => updateCell(r.id, f, parseFloat(e.target.value) || 0)} style={numInput} />
                  </td>
                ))}
                <td style={{ padding: '5px 8px', color: 'var(--ez-color-text-secondary)' }}>{r.satuan}</td>
                <td style={{ padding: '5px 8px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>{r.volume}</td>
                <td style={{ padding: '5px 8px', fontSize: 11.5, color: 'var(--ez-color-text-muted)' }}>{r.sumber}</td>
                <td style={{ padding: '5px 8px' }}>
                  <span style={statusPill(r.status)}>{r.status === 'PERLU_REVIEW' ? 'PERLU REVIEW' : r.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ez-color-text-muted)' }}>
        {filtered.length} dari {rows.length} baris · Edit sel untuk mengubah · Volume dihitung otomatis dari dimensi
      </div>
    </div>
  );
};

export default DesignSpreadsheet;
