/**
 * Panel Perkiraan Harga AI untuk satu komponen AHSP yang harganya tidak tersedia.
 * ============================================================================
 * - Tombol "Minta Perkiraan AI" → requestAiPriceEstimate (AI, fallback heuristik).
 * - Hasil SELALU tampil dengan label "*Harga Perkiraan AI*".
 * - "Pakai perkiraan ini" butuh checkbox acknowledgment eksplisit.
 * - Setelah dipakai: onApply(estimate) → parent membuat price_assumption
 *   berstatus DRAFT dengan sourceNote "*Harga Perkiraan AI*".
 */
import React, { useState } from 'react';
import { Sparkles, Loader2, CheckCircle2, XCircle, Info } from 'lucide-react';
import {
  requestAiPriceEstimate,
  aiEstimateStore,
  AI_ESTIMATE_LABEL,
  formatAiEstimatePrice,
  type AiPriceEstimate,
} from '../../engine/pricing/aiEstimate/aiPriceEstimate';

interface Props {
  componentCode: string;
  componentName: string;
  componentUnit: string;
  /** Harga resmi/terverifikasi sudah ada? Jika ya, panel tidak ditampilkan. */
  hasResolvedPrice: boolean;
  onApply: (estimate: AiPriceEstimate) => void;
}

const fmtRp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');

export const AiPriceEstimatePanel: React.FC<Props> = ({
  componentCode,
  componentName,
  componentUnit,
  hasResolvedPrice,
  onApply,
}) => {
  const [estimate, setEstimate] = useState<AiPriceEstimate | null>(() =>
    aiEstimateStore.latestFor(componentCode)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ackChecked, setAckChecked] = useState(false);

  if (hasResolvedPrice) return null;

  const handleRequest = async () => {
    setLoading(true);
    setError(null);
    try {
      const est = await requestAiPriceEstimate({ componentCode, componentName, unit: componentUnit });
      if (!est) {
        setError(
          'Tidak ada sumber harga yang bisa dipakai sebagai dasar perkiraan. ' +
          'Tambahkan referensi harga pasar terlebih dahulu.'
        );
      } else {
        aiEstimateStore.save(est);
        setEstimate(est);
        setAckChecked(false);
      }
    } catch (e: any) {
      setError(e?.message || 'Gagal meminta perkiraan AI.');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!estimate || !ackChecked) return;
    aiEstimateStore.acknowledge(estimate.id, 'user');
    onApply({ ...estimate, acknowledged: true });
  };

  return (
    <div
      style={{
        marginTop: 16,
        padding: 14,
        borderRadius: 12,
        border: '1px dashed #a855f7',
        background: 'rgba(168,85,247,0.06)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Sparkles size={16} color="#a855f7" />
        <strong style={{ fontSize: 13.5 }}>Perkiraan Harga AI</strong>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#a855f7',
            background: 'rgba(168,85,247,0.14)',
            padding: '2px 8px',
            borderRadius: 999,
          }}
        >
          {AI_ESTIMATE_LABEL}
        </span>
      </div>

      <p style={{ fontSize: 12.5, color: '#64748b', margin: '0 0 10px', lineHeight: 1.5 }}>
        Harga komponen ini belum tersedia. AI dapat membuat perkiraan berdasarkan
        referensi harga pasar dan data material saat ini — <em>bukan harga resmi</em>.
      </p>

      {!estimate && (
        <button
          type="button"
          onClick={handleRequest}
          disabled={loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            height: 38,
            padding: '0 16px',
            fontSize: 13,
            fontWeight: 700,
            color: '#fff',
            background: loading ? '#c4b5fd' : '#a855f7',
            border: 'none',
            borderRadius: 10,
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
          {loading ? 'Meminta perkiraan…' : 'Minta Perkiraan AI'}
        </button>
      )}

      {error && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: '#b91c1c', display: 'flex', gap: 6 }}>
          <XCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}

      {estimate && (
        <div style={{ marginTop: 4 }}>
          <div
            style={{
              padding: 12,
              borderRadius: 10,
              background: '#fff',
              border: '1px solid rgba(168,85,247,0.3)',
            }}
          >
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>
              Perkiraan {estimate.method === 'ai' ? 'AI' : 'heuristik (AI tidak terjangkau)'} ·{' '}
              confidence {Math.round(estimate.confidence * 100)}%
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#7c3aed' }}>
              {formatAiEstimatePrice(estimate.estimatedPrice)}
            </div>
            <div style={{ fontSize: 12, color: '#475569', marginTop: 6, lineHeight: 1.5 }}>
              <Info size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
              {estimate.reasoning}
            </div>
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                DASAR PERKIRAAN ({estimate.sources.length} sumber):
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#475569' }}>
                {estimate.sources.map((s, i) => (
                  <li key={i}>
                    {s.label}: {fmtRp(s.price)} / {s.unit}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <label
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
              marginTop: 10,
              fontSize: 12.5,
              color: '#334155',
              cursor: 'pointer',
              lineHeight: 1.5,
            }}
          >
            <input
              type="checkbox"
              checked={ackChecked}
              onChange={(e) => setAckChecked(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span>
              Saya paham ini <strong>{AI_ESTIMATE_LABEL}</strong> — bukan harga resmi
              AHSP maupun harga pasar terverifikasi, dan akan selalu tampil dengan
              label tersebut.
            </span>
          </label>

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              type="button"
              onClick={handleApply}
              disabled={!ackChecked}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                height: 36,
                padding: '0 14px',
                fontSize: 13,
                fontWeight: 700,
                color: '#fff',
                background: ackChecked ? '#7c3aed' : '#cbd5e1',
                border: 'none',
                borderRadius: 10,
                cursor: ackChecked ? 'pointer' : 'not-allowed',
              }}
            >
              <CheckCircle2 size={15} /> Pakai perkiraan ini
            </button>
            <button
              type="button"
              onClick={handleRequest}
              disabled={loading}
              style={{
                height: 36,
                padding: '0 14px',
                fontSize: 13,
                fontWeight: 600,
                color: '#7c3aed',
                background: 'transparent',
                border: '1px solid #c4b5fd',
                borderRadius: 10,
                cursor: 'pointer',
              }}
            >
              Minta ulang
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
