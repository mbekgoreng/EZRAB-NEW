/**
 * Ringkasan pemakaian kredit per fitur (dari ledger simulasi).
 */
import React, { useMemo } from 'react';
import type { LedgerEntry } from '../types';
import { FEATURE_LABELS } from '../config';

interface Props {
  entries: LedgerEntry[];
}

export const CreditUsageSummary: React.FC<Props> = ({ entries }) => {
  const summary = useMemo(() => {
    const byFeature = new Map<string, number>();
    let total = 0;
    for (const e of entries) {
      if (e.credits >= 0) continue;
      const used = -e.credits;
      total += used;
      byFeature.set(e.feature, (byFeature.get(e.feature) ?? 0) + used);
    }
    return { total, rows: [...byFeature.entries()] };
  }, [entries]);

  if (summary.total === 0) return null;

  const max = Math.max(...summary.rows.map(([, v]) => v), 1);

  return (
    <div className="aic-card">
      <div className="aic-k">Ringkasan pemakaian (simulasi)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
        {summary.rows.map(([feature, used]) => (
          <div key={feature}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
              <span>{FEATURE_LABELS[feature as keyof typeof FEATURE_LABELS] ?? feature}</span>
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{used.toLocaleString('id-ID')} kredit</strong>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: 'var(--ez-color-surface-secondary)' }}>
              <div
                style={{
                  width: `${Math.round((used / max) * 100)}%`, height: '100%',
                  borderRadius: 999, background: 'var(--ez-color-primary)',
                }}
              />
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 800, borderTop: '1px solid var(--ez-color-border-line)', paddingTop: 8 }}>
          <span>Total terpakai</span>
          <span>{summary.total.toLocaleString('id-ID')} kredit</span>
        </div>
      </div>
    </div>
  );
};
