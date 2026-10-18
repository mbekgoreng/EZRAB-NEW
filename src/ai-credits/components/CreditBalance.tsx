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
  onOpenCreditPage: () => void;
  showTopUp?: boolean;
}

export const CreditBalance: React.FC<Props> = ({ compact, onOpenCreditPage, showTopUp = true }) => {
  const { balance } = useCreditSimulation();
  const [topUpOpen, setTopUpOpen] = useState(false);

  const low = balance.total < LOW_BALANCE_THRESHOLD;
  const critical = balance.total <= 0;
  const cls = `aic-balance${compact ? ' compact' : ''}${critical ? ' is-critical' : low ? ' is-low' : ''}`;

  return (
    <>
      <button
        type="button"
        className={cls}
        onClick={onOpenCreditPage}
        title={`Saldo kredit AI (simulasi): ${balance.total.toLocaleString('id-ID')} kredit. Klik untuk rincian.`}
        aria-label={`Saldo kredit AI ${balance.total} kredit, paket ${balance.plan}`}
      >
        <span className="aic-coin"><Coins size={12} /></span>
        <span className="aic-amount">{formatCreditsShort(balance.total)}</span>
        {!compact && <span className="aic-plan">{balance.plan}</span>}
        {showTopUp && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Top-up kredit"
            title="Top-up kredit (simulasi)"
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
