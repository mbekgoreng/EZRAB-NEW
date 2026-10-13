/**
 * Price source badge for RAB rows.
 * Shows: RESMI AHSP | REFERENSI PASAR | ASUMSI — PERLU VERIFIKASI | HARGA BELUM TERSEDIA
 */
import React from 'react';
import type { PriceSourceKind } from '../../engine/pricing/assumption/types';
import { PRICE_SOURCE_LABELS } from '../../engine/pricing/assumption/types';

const BADGE_STYLE: Record<PriceSourceKind, React.CSSProperties> = {
  OFFICIAL_AHSP: { background: '#dcfce7', color: '#166534', border: '1px solid #86efac' },
  MARKET_REFERENCE: { background: '#dbeafe', color: '#1e40af', border: '1px solid #93c5fd' },
  EZRAB_ASSUMPTION: { background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' },
  UNRESOLVED: { background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' },
};

export const PriceSourceBadge: React.FC<{
  sourceKind: PriceSourceKind;
  explanation?: string | null;
  compact?: boolean;
}> = ({ sourceKind, explanation, compact }) => {
  const label = PRICE_SOURCE_LABELS[sourceKind];
  return (
    <span
      title={explanation || label}
      style={{
        ...BADGE_STYLE[sourceKind],
        fontSize: compact ? 10 : 11,
        fontWeight: 600,
        padding: compact ? '2px 6px' : '3px 8px',
        borderRadius: 999,
        whiteSpace: 'nowrap',
        display: 'inline-block',
      }}
    >
      {label}
    </span>
  );
};

/** Detail panel showing full price provenance for a RAB row. */
export const PriceProvenancePanel: React.FC<{
  sourceKind: PriceSourceKind;
  sourceName?: string | null;
  region?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  approvedBy?: string | null;
  explanation?: string | null;
}> = (props) => {
  const rows: Array<[string, string]> = [
    ['Sumber', PRICE_SOURCE_LABELS[props.sourceKind]],
  ];
  if (props.sourceName) rows.push(['Nama sumber', props.sourceName]);
  if (props.region) rows.push(['Wilayah', props.region]);
  if (props.validFrom) rows.push(['Berlaku', props.validFrom + (props.validUntil ? ` s.d. ${props.validUntil}` : '')]);
  if (props.approvedBy) rows.push(['Disetujui oleh', props.approvedBy]);
  if (props.explanation) rows.push(['Keterangan', props.explanation]);

  return (
    <div style={{ fontSize: 13 }}>
      {props.sourceKind === 'EZRAB_ASSUMPTION' && (
        <div
          style={{
            background: '#fef3c7',
            border: '1px solid #fcd34d',
            borderRadius: 8,
            padding: '8px 12px',
            marginBottom: 12,
            color: '#92400e',
          }}
        >
          ⚠ Harga ini adalah <strong>asumsi EZRAB</strong>, bukan harga resmi AHSP.
          Verifikasi sebelum kontrak.
        </div>
      )}
      {props.sourceKind === 'UNRESOLVED' && (
        <div
          style={{
            background: '#fee2e2',
            border: '1px solid #fca5a5',
            borderRadius: 8,
            padding: '8px 12px',
            marginBottom: 12,
            color: '#991b1b',
          }}
        >
          ⚠ Harga belum tersedia. Item ini tidak masuk total final.
        </div>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td style={{ padding: '4px 8px', color: '#6b7280', width: 140 }}>{k}</td>
              <td style={{ padding: '4px 8px', fontWeight: 500 }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default PriceSourceBadge;
