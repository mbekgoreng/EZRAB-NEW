import React from 'react';
import { useCurrency } from '../../context/CurrencyContext';
import {
  convertIdrToDisplay,
  evaluateRate,
  formatCurrency,
  formatRateLine,
  formatRateTimestamp,
  type ForeignCurrencyCode,
} from '../../services/currencyService';

/**
 * Referensi konversi tampil untuk ringkasan RAB — DISPLAY-ONLY.
 * - Tidak pernah mengubah nilai sumber IDR, item RAB, atau total resmi.
 * - Total yang dikonversi adalah total resmi yang SUDAH digating status
 *   (unresolved tidak ikut); bila ada item belum berharga, total tampil
 *   dilabeli parsial.
 * - Nilai konversi SELALU dilabeli estimasi referensi, bukan harga resmi
 *   AHSP. Bila kurs tidak dapat dipakai, TIDAK ADA angka konversi yang
 *   ditampilkan — hanya pesan ketidaktersediaan.
 */
interface ConvertedReferenceProps {
  /** Total resmi IDR yang sudah digating (mis. totalRabNominal). */
  idrAmount: number;
  /** Jumlah item belum berharga (untuk label parsial). */
  unpricedCount?: number;
}

export const ConvertedReference: React.FC<ConvertedReferenceProps> = ({ idrAmount, unpricedCount = 0 }) => {
  const { displayCurrency, rates } = useCurrency();

  if (displayCurrency === 'IDR') return null;

  const code = displayCurrency as ForeignCurrencyCode;
  const rate = rates[code];
  const evaluation = evaluateRate(rate);

  const boxStyle: React.CSSProperties = {
    border: '1px solid #EEF1F6',
    borderRadius: '16px',
    padding: '12px 16px',
    background: 'var(--ez-color-surface)',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  };

  if (!evaluation.usable || rate == null) {
    return (
      <div style={boxStyle}>
        <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>
          Referensi {code} tidak tersedia
        </span>
        <span style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)' }}>
          {evaluation.reason} Perbarui kurs di Pengaturan (Mata Uang Default) atau masukkan kurs manual.
        </span>
      </div>
    );
  }

  const converted = convertIdrToDisplay(
    { amount: idrAmount, currency: 'IDR', kind: 'mixed' },
    code,
    rate,
  );
  if (!converted.ok || !converted.converted) {
    return (
      <div style={boxStyle}>
        <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>
          Referensi {code} tidak tersedia
        </span>
        <span style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)' }}>
          {converted.ok ? 'Konversi tidak berlaku.' : converted.reason}
        </span>
      </div>
    );
  }

  const value = converted.value;
  return (
    <div style={boxStyle}>
      <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>
        ≈ {formatCurrency(value.value, code)}
        <span style={{ fontWeight: 400, color: 'var(--ez-color-text-muted)' }}> (estimasi konversi referensi)</span>
      </span>
      <span style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)' }}>
        Kurs: {formatRateLine(code, value.rateIdrPerUnit)} · Sumber: {value.rateSource} · Diperbarui: {formatRateTimestamp(value.rateRetrievedAtMs)}
        {value.rateState === 'stale' ? ' · Kurs lama' : ''}
      </span>
      {unpricedCount > 0 && (
        <span style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)' }}>
          Total parsial — {unpricedCount} item belum berharga tidak ikut konversi.
        </span>
      )}
      <span style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)' }}>
        Nilai sumber resmi tetap dalam IDR. Nilai ini bukan harga resmi AHSP.
      </span>
    </div>
  );
};
