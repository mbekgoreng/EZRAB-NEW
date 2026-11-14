import React from 'react';
import { Plus, Check } from 'lucide-react';
import { useCurrency } from '../../context/CurrencyContext';

interface SpreadsheetFooterProps {
  groupsCount: number;
  totalItemsCount: number;
  /**
   * D-38 (Batch F): jumlah item yang SEDANG DITAMPILKAN (sesudah filter /
   * pencarian). Bila tidak diisi, diasumsikan sama dengan total (tidak
   * ada filter aktif) — perilaku lama dipertahankan untuk pemanggil lain.
   */
  filteredItemsCount?: number;
  /** Jumlah amount item terharga — biaya langsung saja (PPN & grand total ada di Rekapitulasi). */
  totalRab: number;
  onAddGroup: () => void;
  isSaving?: boolean;
}

/**
 * D-38 (Batch F) — teks jumlah item yang jujur terhadap filter:
 * "Menampilkan semua N item" HANYA bila yang tampil == total; bila filter /
 * pencarian aktif (tampil < total), "Menampilkan X dari N item". Aturan
 * berbasis panjang semata: filter yang mencocokkan semua item tetap
 * menampilkan "semua" — benar, karena memang semua sedang ditampilkan.
 */
export function footerItemCountText(filteredCount: number, totalCount: number): string {
  const shown = Math.max(0, Math.min(filteredCount, totalCount));
  if (shown === totalCount) return `Menampilkan semua ${totalCount} item`;
  return `Menampilkan ${shown} dari ${totalCount} item`;
}

export const SpreadsheetFooter: React.FC<SpreadsheetFooterProps> = ({
  groupsCount,
  totalItemsCount,
  filteredItemsCount,
  totalRab,
  onAddGroup,
  isSaving = false,
}) => {
  /* Kurs tampil global: total biaya langsung ikut mata uang Top Bar
   * (default IDR). Input harga satuan per baris tetap IDR (nilai sumber)
   * — hanya total tampil yang dikonversi. */
  const { formatDisplay } = useCurrency();
  return (
    <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* 1. Summary Bar (+ Tambah Kelompok, counts, Total Biaya Langsung) */}
      <div
        style={{
          background: 'var(--ez-color-surface)',
          borderRadius: '10px',
          border: '1px solid var(--ez-color-border-line)',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.02)',
        }}
      >
        {/* Left: + Tambah Kelompok button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={onAddGroup}
            className="ezrab-touch-target"
            style={{
              height: '36px',
              padding: '0 14px',
              borderRadius: '6px',
              background: 'var(--ez-color-surface)',
              border: '1px solid var(--ez-hue-slate-border)',
              fontSize: '12px',
              fontWeight: 650,
              color: 'var(--ez-color-primary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ez-hue-blue-bg)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--ez-color-surface)')}
          >
            <Plus size={14} color="var(--ez-hue-blue-text)" />
            <span>Tambah Kelompok</span>
          </button>

          {/* Group & Item counts text */}
          <span style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', fontWeight: 500 }}>
            {groupsCount} kelompok • {totalItemsCount} item
          </span>
        </div>

        {/* Right: Total Biaya Langsung (label jujur — angka ini hanya jumlah
            amount item; overhead, PPN, dan grand total hidup di Rekapitulasi) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', fontWeight: 650, color: 'var(--ez-color-text-slate)' }}>
            Total Biaya Langsung
          </span>
          <span
            style={{
              fontSize: '17px',
              fontWeight: 850,
              color: 'var(--ez-color-text-primary)',
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.02em',
            }}
          >
{formatDisplay(totalRab)}
          </span>
        </div>
      </div>

      {/* 2. Item Count & Autosave Status Bar
          F1a: kontrol pagination lama dihapus — kontrol tersebut tidak
          pernah memotong daftar (semua baris selalu dirender) dan
          totalPages selalu 1. D-38 (Batch F): klaim "semua" hanya benar
          bila tidak ada filter/pencarian aktif — bila ada, teksnya
          "Menampilkan X dari N item" (lihat footerItemCountText). */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 8px',
          fontSize: '12px',
          color: 'var(--ez-color-text-muted)',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <span>{footerItemCountText(filteredItemsCount ?? totalItemsCount, totalItemsCount)}</span>

        {/* Right: Autosave status indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: isSaving ? '#F59E0B' : '#10B981',
            }}
          />
          <span style={{ fontSize: '11.5px', fontWeight: 600, color: isSaving ? 'var(--ez-hue-amber-text-deep)' : 'var(--ez-hue-green-text)' }}>
            {isSaving ? 'Menyimpan perubahan...' : 'Semua perubahan disimpan'}
          </span>
        </div>
      </div>
    </div>
  );
};
