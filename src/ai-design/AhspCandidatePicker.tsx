/**
 * EZRAB AI Design — Pemilih Kandidat AHSP Manual
 *
 * Menampilkan kandidat AHSP dari registry nyata untuk item generik.
 * TIDAK ada auto-mapping — user harus memilih secara eksplisit.
 * Mapping dan pricing adalah dua keputusan terpisah.
 */

import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
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
 * Normalisasi satuan untuk perbandingan.
 *
 * Registry AHSP menyimpan satuan dalam banyak ejaan yang setara:
 * 'm3', 'M2', 'Meter Kubik', 'Meter Persegi', "m'", sedangkan item
 * generik dari generator desain memakai 'm³' / 'm²'. Perbandingan
 * string mentah membuat SEMUA kandidat gugur (0 hasil) — karena itu
 * satuan dibandingkan setelah dinormalisasi ke bentuk kanonik.
 * Satuan yang benar-benar berbeda tetap TIDAK disamakan.
 */
const UNIT_ALIASES: Record<string, string> = {
  'meter kubik': 'm3',
  'meter persegi': 'm2',
  'meter panjang': 'm1',
  'kilogram': 'kg',
  'lumpsum': 'ls',
  'lumsum': 'ls',
  'batang': 'btg',
};

export function normalizeUnit(unit: string): string {
  const cleaned = unit
    .trim()
    .toLowerCase()
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .replace(/\s+/g, ' ');
  if (UNIT_ALIASES[cleaned]) return UNIT_ALIASES[cleaned];
  if (cleaned === "m'" || cleaned === 'm') return 'm1';
  return cleaned.replace(/\s/g, '');
}

/**
 * Cari kandidat dari registry nyata.
 * Tidak ada scoring AI — hanya filter keyword + satuan (dinormalisasi).
 * Hasil diurutkan: identitas aman dulu, lalu yang berharga, lalu nama —
 * supaya 20 kandidat yang ditampilkan adalah yang paling dapat dipakai.
 */
export function findAhspCandidates(keywords: string[], requiredUnit?: string): AhspCandidate[] {
  const lower = keywords.map(k => k.toLowerCase()).filter(k => k.length > 0);
  const targetUnit = requiredUnit ? normalizeUnit(requiredUnit) : null;
  const matches = ALL_OFFICIAL_AHSP_ITEMS.filter(item => {
    const name = item.name.toLowerCase();
    // Semua keyword harus ada di nama
    if (!lower.every(k => name.includes(k))) return false;
    // Filter unit jika diminta — dibandingkan setelah normalisasi ejaan
    if (targetUnit && normalizeUnit(item.unit) !== targetUnit) return false;
    return true;
  });

  return matches
    .map(item => {
      const idCheck = checkAhspIdentitySafety({ code: item.code, name: item.name });
      const comp = priceResolver2026.resolveAhspUnitPrice(item);
      return {
        item,
        identitySafe: idCheck.safe,
        identityReason: idCheck.safe ? undefined : idCheck.reason,
        unitMatch: !targetUnit || normalizeUnit(item.unit) === targetUnit,
        hasPrice: comp.unitPrice != null && comp.unitPrice > 0,
      };
    })
    .sort((a, b) =>
      Number(b.identitySafe) - Number(a.identitySafe) ||
      Number(b.hasPrice) - Number(a.hasPrice) ||
      a.item.name.localeCompare(b.item.name),
    )
    .slice(0, 20);
}

export const AhspCandidatePicker: React.FC<AhspCandidatePickerProps> = ({
  keywords,
  requiredUnit,
  onSelect,
  onCancel,
}) => {
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  // Kata kunci dapat diedit user (pencarian manual) — awalnya dari usulan item.
  const [keywordText, setKeywordText] = useState(keywords.join(' '));
  const activeKeywords = useMemo(
    () => keywordText.toLowerCase().split(/[\s,]+/).filter(w => w.length > 0),
    [keywordText],
  );
  const candidates = useMemo(
    () => findAhspCandidates(activeKeywords, requiredUnit),
    [activeKeywords, requiredUnit],
  );

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
    <div style={{
      background: 'var(--ez-color-surface)', borderRadius: 16, padding: 18,
      border: '1px solid var(--ez-color-border)', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
    }}>
      <h4 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: 'var(--ez-color-text-primary)' }}>
        Pilih Kandidat AHSP
      </h4>
      <div style={{ fontSize: 12.5, color: 'var(--ez-color-text-muted)', marginBottom: 12 }}>
        Satuan item: {requiredUnit} · {candidates.length} kandidat ditampilkan dari registry
      </div>

      {/* Pencarian manual: kata kunci dapat diubah bila usulan awal tidak cocok */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
        border: '1px solid var(--ez-color-border)', borderRadius: 10,
        padding: '0 12px', background: 'var(--ez-color-surface)',
      }}>
        <Search size={15} color="var(--ez-color-text-muted)" style={{ flexShrink: 0 }} />
        <input
          value={keywordText}
          onChange={e => { setKeywordText(e.target.value); setSelectedCode(null); }}
          placeholder="Kata kunci, mis. beton / bata merah / keramik lantai"
          aria-label="Kata kunci pencarian AHSP"
          style={{
            flex: 1, padding: '10px 0', border: 'none', outline: 'none',
            background: 'transparent', color: 'var(--ez-color-text-primary)', fontSize: 13,
          }}
        />
      </div>

      {candidates.length === 0 ? (
        <div style={{
          padding: '22px 16px', textAlign: 'center', fontSize: 13, lineHeight: 1.6,
          color: 'var(--ez-color-text-muted)', background: 'var(--ez-color-surface-faint)', borderRadius: 12,
        }}>
          Tidak ada kandidat untuk kata kunci ini dengan satuan {requiredUnit}.
          Ubah kata kunci di atas, atau tetapkan harga manual dari menu RAB.
        </div>
      ) : (
        <div style={{ maxHeight: 300, overflowY: 'auto', display: 'grid', gap: 8 }}>
          {candidates.map(c => (
            <div
              key={c.item.code}
              onClick={() => setSelectedCode(c.item.code)}
              style={{
                padding: '11px 13px', borderRadius: 12, cursor: 'pointer',
                border: selectedCode === c.item.code ? '1.5px solid var(--ez-ai-text)' : '1px solid var(--ez-color-border)',
                background: selectedCode === c.item.code ? 'var(--ez-ai-surface)' : 'var(--ez-color-surface)',
                opacity: c.identitySafe ? 1 : 0.65,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--ez-color-text-primary)' }}>{c.item.code}</span>
                {!c.identitySafe && (
                  <span style={{
                    fontSize: 9.5, fontWeight: 800, letterSpacing: '0.04em',
                    color: '#DC2626', background: 'rgba(220, 38, 38, 0.10)',
                    padding: '2px 7px', borderRadius: 999,
                  }}>
                    UNSAFE
                  </span>
                )}
                <span style={{
                  marginLeft: 'auto', fontSize: 11, fontWeight: 700,
                  color: c.hasPrice ? '#059669' : 'var(--ez-color-text-faint)',
                }}>
                  {c.hasPrice ? 'Harga tersedia' : 'Harga belum tersedia'}
                </span>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ez-color-text-body)', marginTop: 3, lineHeight: 1.45 }}>
                {c.item.name.slice(0, 90)}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ez-color-text-muted)', marginTop: 5 }}>
                Satuan: {c.item.unit} · {c.item.domain}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button
          onClick={handleConfirm}
          disabled={!selected}
          style={{
            padding: '10px 20px', borderRadius: 10, border: 'none',
            background: selected ? 'var(--ez-ai-surface-active)' : 'var(--ez-color-surface-tertiary)',
            color: selected ? '#FFF' : 'var(--ez-color-text-muted)',
            fontWeight: 700, fontSize: 13, cursor: selected ? 'pointer' : 'default',
            boxShadow: selected ? '0 4px 12px rgba(124, 58, 237, 0.30)' : 'none',
          }}
        >
          Pilih Kandidat Ini
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: '10px 20px', borderRadius: 10, border: '1px solid var(--ez-color-border)',
            background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-secondary)',
            fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}
        >
          Batal
        </button>
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--ez-color-text-faint)', marginTop: 10, lineHeight: 1.5 }}>
        Pemilihan manual. Mapping dan harga adalah keputusan terpisah.
        Kandidat UNSAFE tidak dapat dipilih.
      </div>
    </div>
  );
};
