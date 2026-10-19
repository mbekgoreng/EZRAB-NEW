/**
 * EZRAB AI Design — Pemilih Kandidat AHSP Manual
 *
 * Menampilkan kandidat AHSP dari registry nyata untuk item generik.
 * TIDAK ada auto-mapping — user harus memilih secara eksplisit.
 * Mapping dan pricing adalah dua keputusan terpisah.
 */

import React, { useState, useMemo } from 'react';
import { ALL_OFFICIAL_AHSP_ITEMS } from '../data/nationalCostDatabase/masterRegistry';
import { checkAhspIdentitySafety } from '../data/priceDatabase2026/ahspDisplayPolicy';
import { priceResolver2026 } from '../data/priceDatabase2026/resolver';
import type { NationalAHSPItem } from '../data/nationalCostDatabase/types';

export interface AhspCandidate {
  item: NationalAHSPItem;
  identitySafe: boolean;
  identityReason?: string;
  unitMatch: boolean;
  hasPrice: boolean;
}

interface AhspCandidatePickerProps {
  /** Kata kunci pencarian (mis. "keramik", "beton") */
  keywords: string[];
  /** Satuan yang dibutuhkan item generik */
  requiredUnit: string;
  /** Callback saat user memilih kandidat */
  onSelect: (candidate: NationalAHSPItem) => void;
  onCancel: () => void;
}

/**
 * Cari kandidat dari registry nyata.
 * Tidak ada scoring AI — hanya filter keyword + unit.
 */
export function findAhspCandidates(keywords: string[], requiredUnit?: string): AhspCandidate[] {
  const lower = keywords.map(k => k.toLowerCase());
  const matches = ALL_OFFICIAL_AHSP_ITEMS.filter(item => {
    const name = item.name.toLowerCase();
    // Semua keyword harus ada di nama
    if (!lower.every(k => name.includes(k))) return false;
    // Filter unit jika diminta
    if (requiredUnit && item.unit !== requiredUnit) return false;
    return true;
  });

  return matches.slice(0, 20).map(item => {
    const idCheck = checkAhspIdentitySafety({ code: item.code, name: item.name });
    const comp = priceResolver2026.resolveAhspUnitPrice(item);
    return {
      item,
      identitySafe: idCheck.safe,
      identityReason: idCheck.safe ? undefined : idCheck.reason,
      unitMatch: !requiredUnit || item.unit === requiredUnit,
      hasPrice: comp.unitPrice != null && comp.unitPrice > 0,
    };
  });
}

export const AhspCandidatePicker: React.FC<AhspCandidatePickerProps> = ({
  keywords,
  requiredUnit,
  onSelect,
  onCancel,
}) => {
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const candidates = useMemo(() => findAhspCandidates(keywords, requiredUnit), [keywords, requiredUnit]);

  const selected = candidates.find(c => c.item.code === selectedCode);

  const handleConfirm = () => {
    if (!selected) return;
    // Gate: identity harus SAFE dan unit harus cocok
    if (!selected.identitySafe) {
      alert(`Kandidat ${selected.item.code} tidak aman: ${selected.identityReason}`);
      return;
    }
    if (!selected.unitMatch) {
      alert(`Satuan tidak cocok: butuh ${requiredUnit}, kandidat ${selected.item.unit}`);
      return;
    }
    onSelect(selected.item);
  };

  return (
    <div style={{ background: '#FFF', borderRadius: 12, padding: 16, border: '1px solid #E2E8F0' }}>
      <h4 style={{ margin: '0 0 8px', color: '#1E3A5F' }}>
        Pilih Kandidat AHSP
      </h4>
      <div style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>
        Kata kunci: {keywords.join(', ')} | Satuan: {requiredUnit} |
        {candidates.length} kandidat dari registry
      </div>

      {candidates.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', color: '#64748B', fontSize: 13 }}>
          Tidak ada kandidat. Gunakan pencarian manual atau input harga manual.
        </div>
      ) : (
        <div style={{ maxHeight: 300, overflowY: 'auto', display: 'grid', gap: 8 }}>
          {candidates.map(c => (
            <div
              key={c.item.code}
              onClick={() => setSelectedCode(c.item.code)}
              style={{
                padding: 10, borderRadius: 8, cursor: 'pointer',
                border: selectedCode === c.item.code ? '2px solid #1E3A5F' : '1px solid #E2E8F0',
                background: selectedCode === c.item.code ? '#EFF6FF' : '#FFF',
                opacity: c.identitySafe ? 1 : 0.6,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13, color: '#1E3A5F' }}>
                {c.item.code}
                {!c.identitySafe && <span style={{ color: '#DC2626', marginLeft: 8 }}>⚠ UNSAFE</span>}
              </div>
              <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                {c.item.name.slice(0, 80)}
              </div>
              <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>
                Satuan: {c.item.unit} {c.unitMatch ? '✅' : '❌'} |
                Harga: {c.hasPrice ? 'Tersedia' : 'Belum tersedia'} |
                {c.item.domain}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          onClick={handleConfirm}
          disabled={!selected}
          style={{
            padding: '10px 20px', borderRadius: 8, border: 'none',
            background: selected ? '#1E3A5F' : '#CBD5E1', color: '#FFF',
            fontWeight: 700, cursor: selected ? 'pointer' : 'default',
          }}
        >
          Pilih Kandidat Ini
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: '10px 20px', borderRadius: 8, border: '1px solid #E2E8F0',
            background: '#FFF', cursor: 'pointer',
          }}
        >
          Batal
        </button>
      </div>

      <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 8 }}>
        ⚠ Pemilihan manual. Mapping dan harga adalah keputusan terpisah.
        Kandidat UNSAFE tidak dapat dipilih.
      </div>
    </div>
  );
};
