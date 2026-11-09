/**
 * MobileResourceLibrary — presentasi native mobile untuk daftar catatan
 * harga Resource Library (Gelombang Native 2, 2026-11-10).
 *
 * Merender filteredRecords yang sama dengan tabel desktop (11 kolom yang
 * di HP menjadi kartu): nama, kode, spesifikasi, brand, kategori, satuan,
 * harga (formatCurrencyIDR yang sama), wilayah, sumber, tanggal, dan
 * status override proyek. Satu-satunya aksi baris desktop — tombol
 * "Detail" yang membuka modal banding/adopsi — dipertahankan persis.
 * Tab SUPPLIERS tidak lewat sini: direktori supplier desktop sudah
 * berbentuk kartu dan tetap dirender apa adanya.
 */
import React from 'react';
import { Scale } from 'lucide-react';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';
import type { ExtendedPriceRecord } from '../resources/ResourceLibraryView';

export interface MobileResourceLibraryProps {
  records: ExtendedPriceRecord[];
  projectOverrideCodes: string[];
  onCompare: (item: ExtendedPriceRecord) => void;
}

export const MobileResourceLibrary: React.FC<MobileResourceLibraryProps> = ({
  records,
  projectOverrideCodes,
  onCompare,
}) => {
  if (records.length === 0) {
    return (
      <div className="mnw-empty">Tidak ada data material &amp; harga yang sesuai dengan filter pencarian.</div>
    );
  }
  return (
    <div>
      {records.map((item) => {
        const isProjectOverride = projectOverrideCodes.includes(item.code);
        return (
          <div key={item.id} className="mnw-ahsp-card">
            <div className="mnw-ahsp-top">
              <span className="mnw-ahsp-name">{item.name}</span>
              <span className={`mnw-badge ${isProjectOverride ? 'partial' : 'full'}`}>
                {isProjectOverride ? 'PROYEK' : 'ACTIVE'}
              </span>
            </div>
            <div className="mnw-ahsp-meta">
              <span className="mnw-code-chip">{item.code}</span> {item.specification || '-'}
            </div>
            <div className="mnw-param-row">
              <span>Brand · Kategori</span>
              <b style={{ textAlign: 'right' }}>
                {item.brand || '-'} · {item.subcategory || 'Material'}
              </b>
            </div>
            <div className="mnw-param-row">
              <span>Wilayah · Sumber</span>
              <b style={{ textAlign: 'right' }}>
                {item.location || 'Nasional'} · {item.supplier ? 'Vendor' : 'Database'}
              </b>
            </div>
            <div className="mnw-param-row">
              <span>Tanggal efektif</span>
              <b>{item.effectiveDate || '25 Sep 2026'}</b>
            </div>
            <div className="mnw-ahsp-price-row">
              <span className="mnw-ahsp-price">{formatCurrencyIDR(item.price)}</span>
              <span className="mnw-ahsp-per">/ {item.unit}</span>
            </div>
            <div className="mnw-detail-actions">
              <button type="button" className="mnw-action-btn" onClick={() => onCompare(item)}>
                <Scale size={14} /> Detail
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default MobileResourceLibrary;
