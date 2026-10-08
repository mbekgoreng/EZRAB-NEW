/**
 * DedAiRedesign — Total overhaul of DED Estimate AI UI.
 * Modern, professional, step-based flow: Upload → Analyzing → Results.
 */
import React, { useState, useMemo } from 'react';
import type { DedWorkItem, SourceDocument, EvidenceRecord } from '../../ded-rab-v2/types';
import './DedAiRedesign.css';

export interface DedAiRedesignProps {
  projectName: string;
  sourceDocuments: SourceDocument[];
  workItems: DedWorkItem[];
  evidences: EvidenceRecord[];
  grandTotal?: number;
  onCommitOfficialRab?: (officialItems?: any[]) => void;
  onRetry?: () => void;
  onUpload?: (files: FileList) => void;
}

type Stage = 'upload' | 'analyzing' | 'results';
type ConfLevel = 'high' | 'med' | 'low';

function confLevel(item: DedWorkItem): ConfLevel {
  if (item.quantityStatus === 'MISSING_DATA' || item.quantity == null) return 'low';
  if (item.quantityStatus === 'AMBIGUOUS' || item.quantityStatus === 'CONFLICT') return 'med';
  const c = item.confidence ?? 0.8;
  if (c >= 0.75) return 'high';
  if (c >= 0.45) return 'med';
  return 'low';
}

const CONF_META: Record<ConfLevel, { label: string; color: string; bg: string; icon: string }> = {
  high: { label: 'Akurat', color: '#065F46', bg: '#D1FAE5', icon: '✓' },
  med: { label: 'Perlu cek', color: '#92400E', bg: '#FEF3C7', icon: '!' },
  low: { label: 'Perlu input', color: '#991B1B', bg: '#FEE2E2', icon: '?' },
};

function fmtQty(q: number | null | undefined, unit: string): string {
  if (q == null) return '—';
  return `${q.toLocaleString('id-ID', { maximumFractionDigits: 2 })} ${unit}`;
}

function fmtRp(n: number): string {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}

const ANALYZE_STEPS = [
  { icon: '📖', label: 'Membaca gambar DED' },
  { icon: '🔍', label: 'Mendeteksi dimensi & notasi' },
  { icon: '📐', label: 'Menghitung volume' },
  { icon: '📚', label: 'Mencocokkan AHSP 2026' },
  { icon: '💰', label: 'Menghitung estimasi harga' },
];

export function DedAiRedesign(props: DedAiRedesignProps) {
  const { projectName, sourceDocuments, workItems, evidences, grandTotal, onCommitOfficialRab, onRetry, onUpload } = props;
  const [stage, setStage] = useState<Stage>(workItems.length > 0 ? 'results' : 'upload');
  const [analyzeStep, setAnalyzeStep] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<'all' | ConfLevel>('all');
  const [dragOver, setDragOver] = useState(false);

  const counts = useMemo(() => {
    const c = { high: 0, med: 0, low: 0 };
    workItems.forEach((w) => { c[confLevel(w)]++; });
    return c;
  }, [workItems]);

  const filtered = useMemo(
    () => (filter === 'all' ? workItems : workItems.filter((w) => confLevel(w) === filter)),
    [workItems, filter]
  );

  const getQty = (w: DedWorkItem) => overrides[w.id] ?? w.quantity ?? null;

  const startAnalyze = () => {
    setStage('analyzing');
    setAnalyzeStep(0);
    const iv = setInterval(() => {
      setAnalyzeStep((s) => {
        if (s >= ANALYZE_STEPS.length - 1) {
          clearInterval(iv);
          setTimeout(() => setStage('results'), 600);
          return s;
        }
        return s + 1;
      });
    }, 900);
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (onUpload) onUpload(files);
    startAnalyze();
  };

  /* ================= UPLOAD STAGE ================= */
  if (stage === 'upload') {
    return (
      <div className="dedr">
        <div className="dedr-hero">
          <div className="dedr-hero-icon">📐</div>
          <h1 className="dedr-hero-title">DED Estimate AI</h1>
          <p className="dedr-hero-sub">
            Upload gambar DED Anda — AI akan membaca dimensi, menghitung volume,
            mencocokkan AHSP 2026, dan menyusun estimasi biaya otomatis.
          </p>
        </div>

        <div
          className={`dedr-drop ${dragOver ? 'over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => document.getElementById('dedr-file')?.click()}
        >
          <div className="dedr-drop-icon">📁</div>
          <div className="dedr-drop-title">Tarik & letakkan file DED di sini</div>
          <div className="dedr-drop-sub">atau <span className="dedr-link">klik untuk memilih file</span></div>
          <div className="dedr-drop-formats">
            <span>PDF</span><span>PNG</span><span>JPG</span><span style={{ color: '#94A3B8' }}>maks 20 MB</span>
          </div>
          <input
            id="dedr-file" type="file" hidden multiple
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        <div className="dedr-features">
          <div className="dedr-feature"><span>🎯</span><div><b>Deteksi dimensi otomatis</b><p>AI membaca ukuran dari gambar teknik</p></div></div>
          <div className="dedr-feature"><span>📚</span><div><b>AHSP 2026 resmi</b><p>Analisa harga satuan Cipta Karya & Bina Marga</p></div></div>
          <div className="dedr-feature"><span>✏️</span><div><b>Koreksi manual</b><p>Ubah volume & asumsi kapan saja</p></div></div>
        </div>
      </div>
    );
  }

  /* ================= ANALYZING STAGE ================= */
  if (stage === 'analyzing') {
    return (
      <div className="dedr dedr-center">
        <div className="dedr-analyze-card">
          <div className="dedr-spinner" />
          <h2 className="dedr-analyze-title">Menganalisis DED...</h2>
          <p className="dedr-analyze-sub">{sourceDocuments[0]?.fileName ?? projectName}</p>
          <div className="dedr-steps">
            {ANALYZE_STEPS.map((s, i) => (
              <div key={s.label} className={`dedr-step ${i < analyzeStep ? 'done' : i === analyzeStep ? 'active' : ''}`}>
                <span className="dedr-step-icon">{i < analyzeStep ? '✓' : s.icon}</span>
                <span className="dedr-step-label">{s.label}</span>
                {i === analyzeStep && <span className="dedr-step-spin" />}
              </div>
            ))}
          </div>
          <div className="dedr-progress"><div style={{ width: `${((analyzeStep + 1) / ANALYZE_STEPS.length) * 100}%` }} /></div>
        </div>
      </div>
    );
  }

  /* ================= RESULTS STAGE ================= */
  const selected = workItems.find((w) => w.id === selectedId) ?? null;

  return (
    <div className="dedr">
      {/* HEADER */}
      <div className="dedr-header">
        <div>
          <h1 className="dedr-title">📐 Hasil Analisis DED</h1>
          <p className="dedr-subtitle">{projectName} • {sourceDocuments.length} dokumen • {workItems.length} pekerjaan terdeteksi</p>
        </div>
        <div className="dedr-header-actions">
          {onRetry && <button className="dedr-btn-ghost" onClick={onRetry}>↻ Ulangi</button>}
          <button className="dedr-btn-ghost" onClick={() => setStage('upload')}>+ Dokumen baru</button>
        </div>
      </div>

      {/* STATS */}
      <div className="dedr-stats">
        <div className="dedr-stat"><div className="dedr-stat-num" style={{ color: '#2563EB' }}>{workItems.length}</div><div className="dedr-stat-label">Pekerjaan</div></div>
        <div className="dedr-stat"><div className="dedr-stat-num" style={{ color: '#059669' }}>{counts.high}</div><div className="dedr-stat-label">Akurat ✓</div></div>
        <div className="dedr-stat"><div className="dedr-stat-num" style={{ color: '#D97706' }}>{counts.med}</div><div className="dedr-stat-label">Perlu cek !</div></div>
        <div className="dedr-stat"><div className="dedr-stat-num" style={{ color: '#DC2626' }}>{counts.low}</div><div className="dedr-stat-label">Perlu input ?</div></div>
        {grandTotal != null && (
          <div className="dedr-stat dedr-stat-total"><div className="dedr-stat-num">{fmtRp(grandTotal)}</div><div className="dedr-stat-label">Estimasi Total</div></div>
        )}
      </div>

      {/* FILTER */}
      <div className="dedr-filters">
        {(['all', 'high', 'med', 'low'] as const).map((f) => (
          <button key={f} className={`dedr-filter ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? `Semua (${workItems.length})` : `${CONF_META[f].label} (${counts[f]})`}
          </button>
        ))}
      </div>

      {/* MAIN SPLIT */}
      <div className="dedr-main">
        {/* DRAWING */}
        <div className="dedr-drawing-card">
          <div className="dedr-card-head"><b>🖼️ Gambar DED</b><span className="dedr-hint">Klik marker untuk detail</span></div>
          <div className="dedr-canvas">
            <svg viewBox="0 0 560 400" className="dedr-plan">
              <rect x="60" y="50" width="440" height="300" fill="#F8FAFC" stroke="#94A3B8" strokeWidth="8" rx="4" />
              <line x1="220" y1="50" x2="220" y2="200" stroke="#94A3B8" strokeWidth="5" />
              <line x1="220" y1="250" x2="220" y2="350" stroke="#94A3B8" strokeWidth="5" />
              <line x1="220" y1="200" x2="380" y2="200" stroke="#94A3B8" strokeWidth="5" />
              <line x1="380" y1="50" x2="380" y2="200" stroke="#94A3B8" strokeWidth="5" />
              <text x="280" y="30" fontSize="13" fill="#64748B" fontWeight="700" textAnchor="middle">
                {sourceDocuments[0]?.fileName ?? 'Denah Lantai 1'}
              </text>
              <text x="140" y="210" fontSize="11" fill="#94A3B8" textAnchor="middle">R. Tamu</text>
              <text x="300" y="130" fontSize="11" fill="#94A3B8" textAnchor="middle">Kamar</text>
              <text x="300" y="280" fontSize="11" fill="#94A3B8" textAnchor="middle">Dapur</text>
            </svg>
            {filtered.slice(0, 10).map((w, i) => {
              const lvl = confLevel(w);
              const left = 12 + ((i * 37) % 55);
              const top = 15 + ((i * 53) % 50);
              return (
                <button
                  key={w.id}
                  className={`dedr-marker lvl-${lvl} ${selectedId === w.id ? 'selected' : ''}`}
                  style={{ left: `${left}%`, top: `${top}%` }}
                  onClick={() => setSelectedId(w.id)}
                  title={w.name}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div className="dedr-legend">
            <span><i style={{ background: '#059669' }} />Akurat</span>
            <span><i style={{ background: '#D97706' }} />Perlu cek</span>
            <span><i style={{ background: '#DC2626' }} />Perlu input</span>
          </div>
        </div>

        {/* ITEMS */}
        <div className="dedr-items">
          {filtered.map((w, idx) => {
            const lvl = confLevel(w);
            const meta = CONF_META[lvl];
            const qty = getQty(w);
            const isSel = selectedId === w.id;
            return (
              <div key={w.id} className={`dedr-item ${isSel ? 'selected' : ''}`} onClick={() => setSelectedId(isSel ? null : w.id)}>
                <div className="dedr-item-top">
                  <span className="dedr-item-num">{idx + 1}</span>
                  <div className="dedr-item-info">
                    <div className="dedr-item-name">{w.name}</div>
                    <div className="dedr-item-meta">
                      <span className="dedr-conf" style={{ color: meta.color, background: meta.bg }}>{meta.icon} {meta.label}</span>
                      {(w.sourcePages ?? []).length > 0 && <span className="dedr-page">📄 Hal {w.sourcePages!.join(', ')}</span>}
                    </div>
                  </div>
                  <div className="dedr-item-qty">{fmtQty(qty, w.unit)}</div>
                </div>
                {isSel && (
                  <div className="dedr-item-detail" onClick={(e) => e.stopPropagation()}>
                    {w.materialSpec && <div className="dedr-spec">🔧 {w.materialSpec}</div>}
                    {Object.keys(w.calculationInputs ?? {}).length > 0 && (
                      <div className="dedr-formula">
                        {Object.entries(w.calculationInputs).map(([k, v]) => `${k} = ${v ?? '?'}`).join(' × ')}
                      </div>
                    )}
                    {(w.assumptions ?? []).length > 0 && (
                      <div className="dedr-assumptions">
                        {(w.assumptions ?? []).map((a, i) => <div key={i} className="dedr-assumption">⚠️ {a}</div>)}
                      </div>
                    )}
                    <div className="dedr-correct">
                      <span>Koreksi volume:</span>
                      <input
                        type="number" step="any"
                        placeholder={String(w.quantity ?? '')}
                        defaultValue={overrides[w.id] ?? ''}
                        onChange={(e) => {
                          const n = parseFloat(e.target.value.replace(',', '.'));
                          if (!Number.isNaN(n)) setOverrides((o) => ({ ...o, [w.id]: n }));
                        }}
                      />
                      <span>{w.unit}</span>
                    </div>
                    {evidences.filter((e) => w.evidenceIds?.includes(e.id)).length > 0 && (
                      <div className="dedr-evidence">
                        📎 {evidences.filter((e) => w.evidenceIds?.includes(e.id)).length} bukti pendukung
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="dedr-empty">Tidak ada pekerjaan dengan filter ini.</div>
          )}
        </div>
      </div>

      {/* CTA */}
      <div className="dedr-cta">
        <div>
          <b>Siap lanjut ke penyusunan RAB?</b>
          <p>{workItems.filter((w) => getQty(w) != null).length} dari {workItems.length} volume sudah final{counts.low > 0 && ` • ${counts.low} masih perlu input manual`}.</p>
        </div>
        {onCommitOfficialRab && (
          <button className="dedr-btn-primary" onClick={() => onCommitOfficialRab()}>
            Lanjut ke AHSP & Harga →
          </button>
        )}
      </div>

      {selected && (
        <div className="dedr-toast" onClick={() => setSelectedId(null)}>
          <b>{selected.name}</b> — {fmtQty(getQty(selected), selected.unit)} • {CONF_META[confLevel(selected)].label}
          <span> ✕</span>
        </div>
      )}
    </div>
  );
}

export default DedAiRedesign;
