/**
 * Riwayat pemakaian & transaksi kredit — tabel responsif + filter.
 * Semua baris berstatus 'simulated' pada Fase 1; empty state jujur.
 */
import React, { useMemo, useState } from 'react';
import { ReceiptText } from 'lucide-react';
import type { AiFeature, LedgerEntry } from '../types';
import { FEATURE_LABELS } from '../config';
import { formatDateTime } from '../format';

interface Props {
  entries: LedgerEntry[];
}

const STATUS_LABEL: Record<LedgerEntry['status'], string> = {
  completed: 'Selesai',
  pending: 'Menunggu',
  failed: 'Gagal',
  simulated: 'Simulasi',
};

export const CreditUsageHistory: React.FC<Props> = ({ entries }) => {
  const [featureFilter, setFeatureFilter] = useState<'all' | AiFeature>('all');
  const [dateFilter, setDateFilter] = useState('');

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (featureFilter !== 'all' && e.feature !== featureFilter) return false;
      if (dateFilter) {
        const d = new Date(e.at).toISOString().slice(0, 10);
        if (d !== dateFilter) return false;
      }
      return true;
    });
  }, [entries, featureFilter, dateFilter]);

  return (
    <div>
      <div className="aic-history-tools">
        <select
          aria-label="Filter fitur"
          value={featureFilter}
          onChange={(e) => setFeatureFilter(e.target.value as 'all' | AiFeature)}
        >
          <option value="all">Semua fitur</option>
          {(Object.keys(FEATURE_LABELS) as AiFeature[]).map((f) => (
            <option key={f} value={f}>{FEATURE_LABELS[f]}</option>
          ))}
        </select>
        <input
          type="date"
          aria-label="Filter tanggal"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
        />
        {(featureFilter !== 'all' || dateFilter) && (
          <button
            type="button"
            className="aic-btn-ghost"
            style={{ height: 36 }}
            onClick={() => { setFeatureFilter('all'); setDateFilter(''); }}
          >
            Reset
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="aic-empty">
          <ReceiptText size={28} style={{ marginBottom: 8, opacity: 0.5 }} />
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Belum ada riwayat</div>
          <div>
            {entries.length === 0
              ? 'Riwayat pemakaian dan top-up simulasi akan tampil di sini setelah Anda memakai fitur AI.'
              : 'Tidak ada riwayat yang cocok dengan filter.'}
          </div>
        </div>
      ) : (
        <div className="aic-table-wrap">
          <table className="aic-table">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Fitur</th>
                <th>Model</th>
                <th>Deskripsi</th>
                <th>Kredit</th>
                <th>Status</th>
                <th>Referensi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(e.at)}</td>
                  <td>{FEATURE_LABELS[e.feature]}</td>
                  <td>{e.model ?? '—'}</td>
                  <td>{e.description}</td>
                  <td className={e.credits < 0 ? 'aic-neg' : 'aic-pos'}>
                    {e.credits > 0 ? '+' : ''}{e.credits.toLocaleString('id-ID')}
                  </td>
                  <td><span className="aic-status">{STATUS_LABEL[e.status]}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--ez-color-text-faint)' }}>
                    {e.jobReference ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
