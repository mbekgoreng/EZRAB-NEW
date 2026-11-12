/**
 * Peringatan saldo rendah — dengan aksi top-up (simulasi).
 */
import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useCreditSimulation } from '../useCreditSimulation';
import { LOW_BALANCE_THRESHOLD } from '../config';
import { CreditTopUpModal } from './CreditTopUpModal';

export const CreditLowBalanceNotice: React.FC = () => {
  const { balance, source } = useCreditSimulation();
  const [topUpOpen, setTopUpOpen] = useState(false);

  // Bila server belum terhubung, saldo tidak diketahui — jangan tampilkan
  // peringatan "saldo rendah" dari angka nol pengganti.
  if (source === 'unavailable') return null;
  if (balance.total >= LOW_BALANCE_THRESHOLD) return null;

  return (
    <>
      <div className="aic-low-notice" role="alert">
        <AlertTriangle size={16} />
        <span>
          Saldo kredit AI rendah ({balance.total.toLocaleString('id-ID')} kredit{source === 'simulation' ? ', simulasi' : ''}).
          Fitur AI mungkin memerlukan top-up.
        </span>
        <button type="button" onClick={() => setTopUpOpen(true)}>Top-up</button>
      </div>
      {topUpOpen && <CreditTopUpModal onClose={() => setTopUpOpen(false)} />}
    </>
  );
};
