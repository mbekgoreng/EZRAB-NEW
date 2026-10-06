import React, { useState, useMemo } from 'react';
import { Database, Search, ChevronRight, FileText, Layers, ShieldCheck, Tag, Waves } from 'lucide-react';
import { ALL_OFFICIAL_AHSP_ITEMS } from '../../data/nationalCostDatabase/masterRegistry';
import { NationalAHSPItem } from '../../data/nationalCostDatabase/types';
import { formatCurrencyIDR, formatNumberID } from '../../calculations/decimalEngine';
import { priceResolver2026 } from '../../data/priceDatabase2026/resolver';

export const AhspDatabaseExplorer: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<'ALL' | 'CIPTA_KARYA' | 'BINA_MARGA' | 'SUMBER_DAYA_AIR' | 'SMKK'>('ALL');
  const [selectedItem, setSelectedItem] = useState<NationalAHSPItem>(ALL_OFFICIAL_AHSP_ITEMS[0]);

  const filteredItems = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return ALL_OFFICIAL_AHSP_ITEMS.filter((item) => {
      if (selectedDomain !== 'ALL' && item.domain !== selectedDomain) return false;
      if (q) {
        return (
          item.code.toLowerCase().includes(q) ||
          item.codeNormalized.toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q) ||
          (item.category || '').toLowerCase().includes(q)
        );
      }
      return true;
    }).slice(0, 50);
  }, [searchTerm, selectedDomain]);

  const selectedItemComposition = useMemo(() => {
    if (!selectedItem) return null;
    return priceResolver2026.resolveAhspUnitPrice(selectedItem);
  }, [selectedItem]);

  // Combined resource components for display with resolved prices
  const allResources = useMemo(() => {
    if (!selectedItemComposition) return [];
    const labor = selectedItemComposition.labor.components.map(l => ({ ...l, type: 'labor' as const, name: l.itemName, total: l.subtotalPerUnit }));
    const material = selectedItemComposition.material.components.map(m => ({ ...m, type: 'material' as const, name: m.itemName, total: m.subtotalPerUnit }));
    const equipment = selectedItemComposition.equipment.components.map(e => ({ ...e, type: 'equipment' as const, name: e.itemName, total: e.subtotalPerUnit }));

    if (labor.length === 0 && material.length === 0 && equipment.length === 0 && selectedItem) {
      const rawLabor = (selectedItem.laborComponents || []).map((l: any) => ({
        ...l,
        type: 'labor' as const,
        name: l.name,
        unitPrice: l.unitPrice,
        total: l.total ?? (l.coefficient * l.unitPrice)
      }));
      const rawMaterial = (selectedItem.materialComponents || []).map((m: any) => ({
        ...m,
        type: 'material' as const,
        name: m.name,
        unitPrice: m.unitPrice,
        total: m.total ?? (m.coefficient * m.unitPrice)
      }));
      const rawEquipment = (selectedItem.equipmentComponents || []).map((e: any) => ({
        ...e,
        type: 'equipment' as const,
        name: e.name,
        unitPrice: e.unitPrice,
        total: e.total ?? (e.coefficient * e.unitPrice)
      }));
      return [...rawLabor, ...rawMaterial, ...rawEquipment];
    }
    return [...labor, ...material, ...equipment];
  }, [selectedItemComposition, selectedItem]);

  return (
    <section id="ahsp-database" style={{ padding: '100px 0', background: 'var(--ezrab-bg)' }}>
      <div className="ezrab-container">
        <div style={{ textAlign: 'center', marginBottom: '48px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="ezrab-section-tag">
            <Database size={14} />
            <span>Resmi Lampiran III-VI SE DJBK No. 47/2026 & Permen PUPR</span>
          </div>
          <h2 className="ezrab-section-title">Katalog AHSP & Koefisien Standar</h2>
          <p className="ezrab-section-desc">
            Transparan dan terstandarisasi. Telusuri ribuan analisa harga satuan pekerjaan lengkap dengan dekomposisi koefisien bahan, upah tenaga kerja, dan peralatan.
          </p>
        </div>

        {/* Database Search & Browser Box */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(320px, 1fr) minmax(440px, 1.4fr)',
            gap: '24px',
            background: 'var(--ezrab-surface)',
            border: '1px solid var(--ezrab-border)',
            borderRadius: 'var(--ezrab-radius-lg)',
            boxShadow: 'var(--ezrab-shadow-lg)',
            padding: '28px',
          }}
          className="db-grid"
        >
          {/* Left Column: Search & Item List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Domain Tabs: Semua Bidang -> Cipta Karya -> Bina Marga -> SDA -> SMKK K3 */}
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
              <button
                onClick={() => setSelectedDomain('ALL')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                  fontWeight: selectedDomain === 'ALL' ? 700 : 500,
                  background: selectedDomain === 'ALL' ? 'var(--ezrab-blue)' : 'var(--ezrab-surface-soft)',
                  color: selectedDomain === 'ALL' ? '#ffffff' : 'var(--ezrab-text)',
                  border: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Semua Bidang
              </button>
              <button
                onClick={() => setSelectedDomain('CIPTA_KARYA')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                  fontWeight: selectedDomain === 'CIPTA_KARYA' ? 700 : 500,
                  background: selectedDomain === 'CIPTA_KARYA' ? 'var(--ezrab-blue)' : 'var(--ezrab-surface-soft)',
                  color: selectedDomain === 'CIPTA_KARYA' ? '#ffffff' : 'var(--ezrab-text)',
                  border: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Cipta Karya
              </button>
              <button
                onClick={() => setSelectedDomain('BINA_MARGA')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                  fontWeight: selectedDomain === 'BINA_MARGA' ? 700 : 500,
                  background: selectedDomain === 'BINA_MARGA' ? 'var(--ezrab-blue)' : 'var(--ezrab-surface-soft)',
                  color: selectedDomain === 'BINA_MARGA' ? '#ffffff' : 'var(--ezrab-text)',
                  border: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Bina Marga
              </button>
              <button
                onClick={() => setSelectedDomain('SUMBER_DAYA_AIR')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                  fontWeight: selectedDomain === 'SUMBER_DAYA_AIR' ? 700 : 500,
                  background: selectedDomain === 'SUMBER_DAYA_AIR' ? 'var(--ezrab-blue)' : 'var(--ezrab-surface-soft)',
                  color: selectedDomain === 'SUMBER_DAYA_AIR' ? '#ffffff' : 'var(--ezrab-text)',
                  border: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Sumber Daya Air (SDA)
              </button>
              <button
                onClick={() => setSelectedDomain('SMKK')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                  fontWeight: selectedDomain === 'SMKK' ? 700 : 500,
                  background: selectedDomain === 'SMKK' ? 'var(--ezrab-blue)' : 'var(--ezrab-surface-soft)',
                  color: selectedDomain === 'SMKK' ? '#ffffff' : 'var(--ezrab-text)',
                  border: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                SMKK K3
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1.5px solid var(--ezrab-border-strong)',
                background: 'var(--ezrab-bg)',
              }}
            >
              <Search size={16} color="var(--ezrab-text-muted)" />
              <input
                type="text"
                placeholder="Cari kode (misal A.1.01.a.1, pipa, galian)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ width: '100%', fontSize: '13.5px', color: 'var(--ezrab-text)', background: 'transparent', border: 'none', outline: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  style={{
                    padding: '14px',
                    borderRadius: '10px',
                    border: `1.5px solid ${selectedItem?.id === item.id ? 'var(--ezrab-blue)' : 'var(--ezrab-border)'}`,
                    background: selectedItem?.id === item.id ? 'var(--ezrab-blue-soft)' : 'var(--ezrab-surface-soft)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--ezrab-blue)', fontFamily: 'JetBrains Mono' }}>
                      {item.code}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--ezrab-text-muted)' }}>{item.category}</span>
                  </div>
                  <h5 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ezrab-text)', lineHeight: 1.4, marginBottom: '6px' }}>
                    {item.name}
                  </h5>
                  <div style={{ fontSize: '13px', fontWeight: 750, color: 'var(--ezrab-text)', fontFamily: 'JetBrains Mono' }}>
                    {(() => {
                      const c = priceResolver2026.resolveAhspUnitPrice(item);
                      const finalPrice = c.unitPrice ?? c.hspPrice ?? item.unitPrice;
                      return finalPrice !== null && finalPrice > 0 ? `${formatCurrencyIDR(finalPrice)} / ${item.unit}` : 'Harga belum tersedia';
                    })()}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Detailed Breakdown (Resources / Coefficients) */}
          <div
            style={{
              background: 'var(--ezrab-bg)',
              border: '1px solid var(--ezrab-border)',
              borderRadius: 'var(--ezrab-radius-md)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
            }}
          >
            {selectedItem && (
              <>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '11px', fontFamily: 'JetBrains Mono', fontWeight: 700, color: 'var(--ezrab-blue)', background: 'var(--ezrab-blue-soft)', padding: '2px 8px', borderRadius: '4px' }}>
                      {selectedItem.code}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--ezrab-text-muted)' }}>
                      {selectedItem.sourceDocument || 'Lampiran IV SE DJBK No. 47/SE/Dk/2026'}
                    </span>
                  </div>
                  <h4 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ezrab-text)', lineHeight: 1.4 }}>
                    {selectedItem.name}
                  </h4>
                </div>

                {/* Resource Breakdown Table */}
                <div>
                  <span style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ezrab-text-muted)', display: 'block', marginBottom: '8px' }}>
                    Rincian Koefisien Bahan, Upah & Alat
                  </span>
                  <div style={{ overflowX: 'auto', maxHeight: '280px' }}>
                    <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ color: 'var(--ezrab-text-muted)', borderBottom: '1px solid var(--ezrab-border)' }}>
                          <th style={{ padding: '6px 8px' }}>Uraian Komponen</th>
                          <th style={{ padding: '6px 8px', textAlign: 'center' }}>Tipe</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Koefisien</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Harga Satuan</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allResources.map((res, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--ezrab-border)' }}>
                            <td style={{ padding: '8px 8px', fontWeight: 500, color: 'var(--ezrab-text)' }}>{res.name}</td>
                            <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background: res.type === 'material' ? 'var(--ezrab-blue-soft)' : res.type === 'labor' ? 'var(--ezrab-warning-soft)' : 'var(--ezrab-success-soft)',
                                  color: res.type === 'material' ? 'var(--ezrab-blue)' : res.type === 'labor' ? 'var(--ezrab-warning)' : 'var(--ezrab-success)',
                                }}
                              >
                                {res.type}
                              </span>
                            </td>
                            <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono' }}>{formatNumberID(res.coefficient, 4)} {res.unit}</td>
                            <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono' }}>
                              {res.unitPrice !== null ? formatCurrencyIDR(res.unitPrice) : '—'}
                            </td>
                            <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontWeight: 600, color: 'var(--ezrab-text)' }}>
                              {res.total !== null ? formatCurrencyIDR(res.total) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style={{ marginTop: 'auto', paddingTop: '14px', borderTop: '1px solid var(--ezrab-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ezrab-text-secondary)' }}>Harga Satuan Pekerjaan:</span>
                  <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ezrab-blue)', fontFamily: 'JetBrains Mono' }}>
                    {(() => {
                      const finalPrice = selectedItemComposition?.unitPrice ?? selectedItemComposition?.hspPrice ?? selectedItem?.unitPrice;
                      return finalPrice !== null && (finalPrice ?? 0) > 0
                        ? `${formatCurrencyIDR(finalPrice!)} / ${selectedItem.unit}`
                        : 'Harga belum tersedia';
                    })()}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 860px) {
          .db-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </section>
  );
};
