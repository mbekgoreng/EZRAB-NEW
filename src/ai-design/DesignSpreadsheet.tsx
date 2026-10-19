import React, { useState, useMemo } from 'react';
import type { HouseSpec, RoomSpec } from './specEngine';
import { downloadDesignExcel } from './designExcelExport';

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
  onExportCSV?: (csv: string) => void;
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
 */
export const DesignSpreadsheet: React.FC<DesignSpreadsheetProps> = ({ spec, onExportCSV }) => {
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

  const handleExportCSV = () => {
    const csv = rowsToCSV(rows);
    if (onExportCSV) onExportCSV(csv);
    else downloadFile(csv, `desain-rumah-${Date.now()}.csv`, 'text/csv');
  };

  const [exportingXlsx, setExportingXlsx] = useState(false);
  const handleExportXLSX = async () => {
    setExportingXlsx(true);
    try {
      await downloadDesignExcel(spec);
    } finally {
      setExportingXlsx(false);
    }
  };

  const statusColor = (s: SpreadsheetRow['status']) =>
    s === 'TERHITUNG' ? '#10B981' : s === 'ASUMSI' ? '#F59E0B' : '#EF4444';

  return (
    <div className="ai-design-spreadsheet">
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {(['semua', 'ruang', 'pekerjaan'] as const).map(tab => (
          <button key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '6px 14px', borderRadius: 8, border: '1px solid #E2E8F0',
              background: activeTab === tab ? '#1E3A5F' : '#FFF',
              color: activeTab === tab ? '#FFF' : '#1E3A5F',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
            {tab === 'semua' ? 'Semua' : tab === 'ruang' ? 'Daftar Ruang' : 'Pekerjaan'}
          </button>
        ))}
        <button onClick={handleExportCSV}
          style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#10B981', color: '#FFF', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginLeft: 'auto' }}>
          ⬇ Export CSV
        </button>
        <button onClick={handleExportXLSX} disabled={exportingXlsx}
          style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#217346', color: '#FFF', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: exportingXlsx ? 0.6 : 1 }}>
          {exportingXlsx ? '⏳ XLSX...' : '📊 Export XLSX'}
        </button>
      </div>
      <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid #E2E8F0' }}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', minWidth: 900 }}>
          <thead>
            <tr style={{ background: '#1E3A5F', color: '#FFF' }}>
              {['Kategori', 'Kode', 'Uraian', 'Pjg', 'Lbr', 'Tgi', 'Jml', 'Sat', 'Volume', 'Sumber', 'Status'].map(h => (
                <th key={h} style={{ padding: '8px 6px', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td style={{ padding: '6px' }}>{r.kategori}</td>
                <td style={{ padding: '6px', fontFamily: 'monospace' }}>{r.kode}</td>
                <td style={{ padding: '6px' }}>
                  <input value={r.uraian} onChange={e => updateCell(r.id, 'uraian', e.target.value)}
                    style={{ border: '1px solid #E2E8F0', borderRadius: 4, padding: 4, width: '100%', fontSize: 12 }} />
                </td>
                {(['panjang', 'lebar', 'tinggi', 'jumlah'] as const).map(f => (
                  <td key={f} style={{ padding: '6px' }}>
                    <input type="number" value={r[f]} onChange={e => updateCell(r.id, f, parseFloat(e.target.value) || 0)}
                      style={{ border: '1px solid #E2E8F0', borderRadius: 4, padding: 4, width: 60, fontSize: 12 }} />
                  </td>
                ))}
                <td style={{ padding: '6px' }}>{r.satuan}</td>
                <td style={{ padding: '6px', fontWeight: 600 }}>{r.volume}</td>
                <td style={{ padding: '6px', fontSize: 11, color: '#64748B' }}>{r.sumber}</td>
                <td style={{ padding: '6px' }}>
                  <span style={{ color: statusColor(r.status), fontWeight: 600, fontSize: 11 }}>{r.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: '#64748B' }}>
        {rows.length} baris · Edit sel untuk mengubah · Volume dihitung otomatis dari dimensi
      </div>
    </div>
  );
};

export default DesignSpreadsheet;
