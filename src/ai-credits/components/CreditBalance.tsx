/**
 * Widget saldo kredit AI — reusable di Chat AI, DED AI, AI Document, TopBar.
 * Klik → menuju halaman kredit. Versi compact untuk mobile/TopBar.
 */
import React, { useState } from 'react';
import { Coins, Plus } from 'lucide-react';
import { useCreditSimulation } from '../useCreditSimulation';
import { LOW_BALANCE_THRESHOLD } from '../config';
import { formatCreditsShort } from '../format';
import { CreditTopUpModal } from './CreditTopUpModal';

interface Props {
  compact?: boolean;
  /** Jika tidak disediakan, widget hanya menampilkan saldo (tidak bisa diklik). */
  onOpenCreditPage?: () => void;
  showTopUp?: boolean;
}

export const CreditBalance: React.FC<Props> = ({ compact, onOpenCreditPage, showTopUp = true }) => {
  const { balance, source } = useCreditSimulation();
  const [topUpOpen, setTopUpOpen] = useState(false);

  const unavailable = source === 'unavailable';
  const low = !unavailable && balance.total < LOW_BALANCE_THRESHOLD;
  const critical = !unavailable && balance.total <= 0;
  const cls = `aic-balance${compact ? ' compact' : ''}${critical ? ' is-critical' : low ? ' is-low' : ''}`;
  const sourceLabel = source === 'server' ? 'server' : source === 'simulation' ? 'simulasi' : 'belum terhubung';

  return (
    <>
      <button
        type="button"
        className={cls}
        onClick={onOpenCreditPage}
        disabled={!onOpenCreditPage}
        title={
          unavailable
            ? 'Saldo kredit AI belum terhubung — server belum menjawab.'
            : `Saldo kredit AI (${sourceLabel}): ${balance.total.toLocaleString('id-ID')} kredit.${onOpenCreditPage ? ' Klik untuk rincian.' : ''}`
        }
        aria-label={
          unavailable
            ? 'Saldo kredit AI belum terhubung'
            : `Saldo kredit AI ${balance.total} kredit, paket ${balance.plan}`
        }
        style={!onOpenCreditPage ? { cursor: 'default' } : undefined}
      >
        <span className="aic-coin"><Coins size={12} /></span>
        <span className="aic-amount">{unavailable ? '—' : formatCreditsShort(balance.total)}</span>
        {!compact && <span className="aic-plan">{unavailable ? 'belum terhubung' : balance.plan}</span>}
        {showTopUp && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Top-up kredit"
            title={source === 'simulation' ? 'Top-up kredit (simulasi)' : 'Top-up kredit'}
            onClick={(e) => { e.stopPropagation(); setTopUpOpen(true); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setTopUpOpen(true); } }}
            style={{ display: 'inline-flex', color: 'var(--ez-color-primary, #2563eb)' }}
          >
            <Plus size={14} />
          </span>
        )}
      </button>
      {topUpOpen && <CreditTopUpModal onClose={() => setTopUpOpen(false)} />}
    </>
  );
};
