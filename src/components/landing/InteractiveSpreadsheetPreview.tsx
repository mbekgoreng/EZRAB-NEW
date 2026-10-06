import React, { useState } from 'react';
import { Plus, Trash2, FileSpreadsheet, Download, RefreshCw, CheckCircle2 } from 'lucide-react';
import { RabItem } from '../../types';
import { calculateItemAmount, calculateRabTotals, formatCurrencyIDR, formatNumberID } from '../../calculations/decimalEngine';

const PREVIEW_DEMO_ITEMS: RabItem[] = [
  {
    id: 'preview-1',
    no: 1,
    code: 'A.2.2.1.1',
    category: 'Pekerjaan Persiapan & Bowplank',
    description: 'Pengukuran dan pemasangan Bowplank',
    volume: 124.5,
    unit: 'm¹',
    unitPrice: 48500,
    amount: 6038250,
    ahspCode: 'AHSP-PUPR-2026-A1',
  },
  {
    id: 'preview-2',
    no: 2,
    code: 'A.2.3.1.1',
    category: 'Pekerjaan Tanah & Pondasi',
    description: 'Galian tanah pondasi footplat kedalaman 2m',
    volume: 68.2,
    unit: 'm³',
    unitPrice: 86200,
    amount: 5878840,
    ahspCode: 'AHSP-PUPR-2026-A2',
  },
  {
    id: 'preview-3',
    no: 3,
    code: 'A.4.1.1.5',
    category: 'Pekerjaan Struktur Beton Bertulang',
    description: 'Beton K-300 ready mix untuk Kolom & Balok Lt. 1 & 2',
    volume: 184.0,
    unit: 'm³',
    unitPrice: 1250000,
    amount: 230000000,
    ahspCode: 'AHSP-PUPR-2026-B3',
    isAiSuggested: true,
  },
  {
    id: 'preview-4',
    no: 4,
    code: 'A.4.4.1.1',
    category: 'Pekerjaan Dinding & Plesteran',
    description: 'Pasangan dinding bata ringan (hebel) tebal 10cm + mortar',
    volume: 485.0,
    unit: 'm²',
    unitPrice: 142000,
    amount: 68870000,
    ahspCode: 'AHSP-PUPR-2026-C1',
    isAiSuggested: true,
  },
];

export const InteractiveSpreadsheetPreview: React.FC = () => {
  const [items, setItems] = useState<RabItem[]>(PREVIEW_DEMO_ITEMS);

  const handleVolumeChange = (id: string, val: string) => {
    const num = parseFloat(val) || 0;
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const newAmount = calculateItemAmount(num, item.unitPrice);
          return { ...item, volume: num, amount: newAmount };
        }
        return item;
      })
    );
  };

  const handlePriceChange = (id: string, val: string) => {
    const num = parseFloat(val) || 0;
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const newAmount = calculateItemAmount(item.volume, num);
          return { ...item, unitPrice: num, amount: newAmount };
        }
        return item;
      })
    );
  };

  const handleDeleteItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleReset = () => {
    setItems(PREVIEW_DEMO_ITEMS);
  };

  const totals = calculateRabTotals(items);

  return (
    <section id="spreadsheet" style={{ padding: '100px 0', background: 'var(--ezrab-surface)', borderTop: '1px solid var(--ezrab-border)', borderBottom: '1px solid var(--ezrab-border)' }}>
      <div className="ezrab-container">
        <div style={{ textAlign: 'center', marginBottom: '48px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="ezrab-section-tag">
            <FileSpreadsheet size={14} />
            <span>Live Interactive Grid</span>
          </div>
          <h2 className="ezrab-section-title">Spreadsheet Estimasi Real-Time</h2>
          <p className="ezrab-section-desc">
            Coba ubah angka volume atau harga satuan pada tabel di bawah. Seluruh subtotal, overhead, PPN 11%, dan Grand Total akan terkalkulasi seketika tanpa round-off error.
          </p>
        </div>

        {/* Spreadsheet Component Wrapper */}
        <div
          style={{
            background: 'var(--ezrab-bg)',
            border: '1px solid var(--ezrab-border)',
            borderRadius: 'var(--ezrab-radius-lg)',
            boxShadow: 'var(--ezrab-shadow-lg)',
            overflow: 'hidden',
          }}
        >
          {/* Header Bar */}
          <div
            style={{
              padding: '16px 24px',
              borderBottom: '1px solid var(--ezrab-border)',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              background: 'var(--ezrab-surface)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '15px', fontWeight: 750, color: 'var(--ezrab-text)' }}>
                RAB Proyek: Rumah Tinggal Modern 2 Lantai
              </span>
              <span style={{ fontSize: '11px', background: 'var(--ezrab-success-soft)', color: 'var(--ezrab-success)', padding: '3px 8px', borderRadius: '4px', fontWeight: 700 }}>
                Autosaved
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={handleReset}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12.5px',
                  color: 'var(--ezrab-text-secondary)',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--ezrab-border)',
                  cursor: 'pointer',
                }}
              >
                <RefreshCw size={14} />
                <span>Reset Tabel</span>
              </button>
            </div>
          </div>

          {/* Table Element */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--ezrab-surface-soft)', color: 'var(--ezrab-text-secondary)', borderBottom: '1px solid var(--ezrab-border)' }}>
                  <th style={{ padding: '12px 16px', width: '50px' }}>No</th>
                  <th style={{ padding: '12px 16px', width: '120px' }}>Kode AHSP</th>
                  <th style={{ padding: '12px 16px' }}>Uraian Pekerjaan</th>
                  <th style={{ padding: '12px 16px', width: '110px', textAlign: 'right' }}>Volume</th>
                  <th style={{ padding: '12px 16px', width: '70px', textAlign: 'center' }}>Satuan</th>
                  <th style={{ padding: '12px 16px', width: '150px', textAlign: 'right' }}>Harga Satuan (Rp)</th>
                  <th style={{ padding: '12px 16px', width: '160px', textAlign: 'right' }}>Jumlah Harga (Rp)</th>
                  <th style={{ padding: '12px 16px', width: '50px', textAlign: 'center' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--ezrab-border)', background: idx % 2 === 0 ? 'transparent' : 'var(--ezrab-surface-soft)' }}>
                    <td style={{ padding: '10px 16px', fontFamily: 'JetBrains Mono', color: 'var(--ezrab-text-muted)' }}>{idx + 1}</td>
                    <td style={{ padding: '10px 16px', fontFamily: 'JetBrains Mono', fontSize: '12px', color: 'var(--ezrab-blue)', fontWeight: 600 }}>{item.code}</td>
                    <td style={{ padding: '10px 16px', fontWeight: 500, color: 'var(--ezrab-text)' }}>
                      <div>{item.description}</div>
                      <div style={{ fontSize: '11px', color: 'var(--ezrab-text-muted)', marginTop: '2px' }}>{item.category}</div>
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                      <input
                        type="number"
                        value={item.volume}
                        onChange={(e) => handleVolumeChange(item.id, e.target.value)}
                        style={{
                          width: '85px',
                          padding: '4px 8px',
                          textAlign: 'right',
                          borderRadius: '6px',
                          border: '1px solid var(--ezrab-border-strong)',
                          background: 'var(--ezrab-surface)',
                          fontFamily: 'JetBrains Mono',
                          fontSize: '13px',
                          fontWeight: 600,
                        }}
                      />
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'center', color: 'var(--ezrab-text-secondary)' }}>{item.unit}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                      <input
                        type="number"
                        value={item.unitPrice}
                        onChange={(e) => handlePriceChange(item.id, e.target.value)}
                        style={{
                          width: '130px',
                          padding: '4px 8px',
                          textAlign: 'right',
                          borderRadius: '6px',
                          border: '1px solid var(--ezrab-border-strong)',
                          background: 'var(--ezrab-surface)',
                          fontFamily: 'JetBrains Mono',
                          fontSize: '13px',
                          fontWeight: 600,
                        }}
                      />
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontWeight: 700, color: 'var(--ezrab-text)' }}>
                      {formatCurrencyIDR(item.amount)}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        style={{ color: 'var(--ezrab-text-muted)', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}
                        title="Hapus baris"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Financial Summary Calculation Card */}
          <div
            style={{
              padding: '24px',
              background: 'var(--ezrab-surface)',
              borderTop: '1px solid var(--ezrab-border)',
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
            }}
          >
            <div style={{ width: '100%', maxWidth: '380px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13.5px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ezrab-text-secondary)' }}>
                <span>Subtotal Pekerjaan:</span>
                <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 600 }}>{formatCurrencyIDR(totals.subtotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ezrab-text-secondary)' }}>
                <span>Overhead & Keuntungan (5%):</span>
                <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 600 }}>{formatCurrencyIDR(totals.overhead)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ezrab-text-secondary)' }}>
                <span>PPN 11% Konstruksi:</span>
                <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 600 }}>{formatCurrencyIDR(totals.ppn)}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  paddingTop: '10px',
                  marginTop: '4px',
                  borderTop: '1.5px solid var(--ezrab-border-strong)',
                  fontSize: '17px',
                  fontWeight: 800,
                  color: 'var(--ezrab-text)',
                }}
              >
                <span>Grand Total RAB:</span>
                <span style={{ color: 'var(--ezrab-blue)', fontFamily: 'JetBrains Mono' }}>{formatCurrencyIDR(totals.grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
