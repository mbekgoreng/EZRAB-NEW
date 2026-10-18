/**
 * Badge estimasi kredit — "5–20 kredit (simulasi)".
 * Tidak pernah menampilkan angka pasti bila tarif berupa rentang.
 */
import React from 'react';
import { Zap } from 'lucide-react';
import type { UsageEstimate } from '../types';
import { formatEstimateRange } from '../format';

interface Props {
  estimate: UsageEstimate;
}

export const CreditEstimateBadge: React.FC<Props> = ({ estimate }) => (
  <span className="aic-estimate" title="Estimasi simulasi frontend — bukan pengukuran biaya backend.">
    <Zap size={12} />
    <span>Estimasi: <strong>{formatEstimateRange(estimate.min, estimate.max)}</strong></span>
    <span className="aic-sim">simulasi</span>
  </span>
);
