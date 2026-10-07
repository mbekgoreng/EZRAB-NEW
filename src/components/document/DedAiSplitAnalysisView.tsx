/**
 * DedAiSplitAnalysisView — Split-view DED AI analysis UI (EZRAB theme).
 *
 * Kiri: viewer dokumen DED dengan marker dimensi AI (klik → detail).
 * Kanan: panel hasil — confidence, traceability, asumsi, inline edit.
 * Mobile: langsung ke hasil, floating button untuk intip gambar.
 */
import React, { useState, useMemo, useCallback } from 'react';
import type { DedWorkItem, SourceDocument, EvidenceRecord } from '../../ded-rab-v2/types';
import './DedAiSplitAnalysisView.css';

export interface DedAiSplitAnalysisViewProps {
  projectName: string;
  sourceDocuments: SourceDocument[];
  workItems: DedWorkItem[];
  evidences: EvidenceRecord[];
  grandTotal?: number;
  onCommitOfficialRab?: (officialItems?: any[]) => void;
  onRetry?: () => void;
}

type ConfLevel = 'high' | 'med' | 'low';

function confLevel(item: DedWorkItem): ConfLevel {
  if (item.quantityStatus === 'MISSING_DATA' || item.quantity == null) return 'low';
  if (item.quantityStatus === 'AMBIGUOUS' || item.quantityStatus === 'CONFLICT') return 'med';
  const c = item.confidence ?? 0.8;
  if (c >= 0.75) return 'high';
  if (c >= 0.45) return 'med';
  return 'low';
}

const CONF_LABEL: Record<ConfLevel, string> = { high: 'Yakin', med: 'Ragu', low: 'Perlu input' };

function formatQty(q: number | null | undefined, unit: string): string {
  if (q == null) return '? perlu input';
  return `${q.toLocaleString('id-ID', { maximumFractionDigits: 2 })} ${unit}`;
}

/** Pseudo-position for a marker on the drawing canvas (stable per item id). */
function markerPos(id: string): { left: string; top: string; width: string; height: string } {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const left = 8 + (h % 60);
  const top = 12 + ((h >> 6) % 55);
  const width = 14 + ((h >> 12) % 18);
  const height = 8 + ((h >> 18) % 12);
  return { left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` };
}

const STAGES = [
  'Membaca gambar', 'Menemukan pekerjaan', 'Spesifikasi teknis',
  'Menghitung volume', 'Mencari AHSP', 'Harga regional', 'Review akhir',
];

export function DedAiSplitAnalysisView(props: DedAiSplitAnalysisViewProps) {
  const { projectName, sourceDocuments, workItems, evidences, grandTotal, onCommitOfficialRab, onRetry } = props;
  const [openId, setOpenId] = useState<string | null>(workItems[0]?.id ?? null);
  const [selectedMarker, setSelectedMarker] = useState<string | null>(null);
  const [activePage, setActivePage] = useState(0);
  const [mobileView, setMobileView] = useState<'results' | 'drawing'>('results');
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [approvedAssumptions, setApprovedAssumptions] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'hasil' | 'asumsi'>('hasil');

  const doc = sourceDocuments[0];
  const pageCount = doc?.pages?.length ?? doc?.pageCount ?? 1;

  const counts = useMemo(() => {
    const c = { high: 0, med: 0, low: 0 };
    workItems.forEach((w) => { c[confLevel(w)]++; });
    return c;
  }, [workItems]);

  const allAssumptions = useMemo(
    () => workItems.flatMap((w) => (w.assumptions ?? []).map((a, i) => ({ key: `${w.id}-a${i}`, workName: w.name, text: a }))),
    [workItems],
  );

  const getQty = useCallback((w: DedWorkItem) => overrides[w.id] ?? w.quantity ?? null, [overrides]);

  const highlightItem = useCallback((id: string) => {
    setSelectedMarker(id);
    setOpenId(id);
    if (window.innerWidth <= 768) setMobileView('drawing');
  }, []);

  const applyOverride = (id: string, val: string) => {
    const n = parseFloat(val.replace(',', '.'));
    if (!Number.isNaN(n)) setOverrides((o: Record<string, number>) => ({ ...o, [id]: n }));
  };

  return (
    <div className="ded-split" data-mview={mobileView}>
      {/* PIPELINE STRIP */}
      <div className="ded-split-pipeline">
        {STAGES.map((s, i) => (
          <React.Fragment key={s}>
            <div className={`ded-stage ${i < 5 ? 'done' : i === 5 ? 'active' : ''}`}>
              <span className="ded-dot" />
              {s}{i === 5 ? '…' : ''}
            </div>
            {i < STAGES.length - 1 && <span className="ded-sep">›</span>}
          </React.Fragment>
        ))}
      </div>

      <div className="ded-split-main">
        {/* FLOATING PEEK (mobile) */}
        <button
          className="ded-peek"
          onClick={() => setMobileView(mobileView === 'drawing' ? 'results' : 'drawing')}
          title={mobileView === 'drawing' ? 'Kembali ke hasil' : 'Lihat gambar'}
        >
          {mobileView === 'drawing' ? '📋' : '🖼️'}
        </button>

        {/* LEFT: DRAWING VIEWER */}
        <div className="ded-viewer">
          <div className="ded-viewer-toolbar">
            {Array.from({ length: Math.min(pageCount, 5) }).map((_, i) => (
              <button
                key={i}
                className={`ded-page-tab ${i === activePage ? 'active' : ''}`}
                onClick={() => setActivePage(i)}
              >
                Hal {i + 1}{i === 0 ? ' — Denah' : ''}
              </button>
            ))}
            <span className="ded-viewer-hint">🔍 Klik dimensi di gambar untuk lihat detailnya</span>
          </div>
          <div className="ded-canvas-wrap">
            <div className="ded-drawing">
              {/* Placeholder denah — diganti PDF renderer bila tersedia */}
              <svg viewBox="0 0 560 400" className="ded-plan-svg">
                <rect x="60" y="50" width="440" height="300" fill="none" stroke="#78716C" strokeWidth="10" />
                <line x1="220" y1="50" x2="220" y2="200" stroke="#78716C" strokeWidth="6" />
                <line x1="220" y1="250" x2="220" y2="350" stroke="#78716C" strokeWidth="6" />
                <line x1="220" y1="200" x2="380" y2="200" stroke="#78716C" strokeWidth="6" />
                <line x1="380" y1="50" x2="380" y2="200" stroke="#78716C" strokeWidth="6" />
                <text x="270" y="22" fontSize="12" fill="#64748B" fontWeight="600">{doc?.fileName ?? projectName}</text>
              </svg>
              {workItems.slice(0, 12).map((w) => {
                const pos = markerPos(w.id);
                const lvl = confLevel(w);
                return (
                  <div
                    key={w.id}
                    className={`ded-marker ${lvl === 'med' ? 'warn' : lvl === 'low' ? 'low' : ''} ${selectedMarker === w.id ? 'selected' : ''}`}
                    style={pos}
                    onClick={() => highlightItem(w.id)}
                    title={w.name}
                  >
                    <span className="ded-marker-label">{w.name.slice(0, 18)}</span>
                  </div>
                );
              })}
              <div className="ded-legend">
                <span><i style={{ background: '#10B981' }} />Yakin</span>
                <span><i style={{ background: '#F59E0B' }} />Ragu</span>
                <span><i style={{ background: '#EF4444' }} />Tak terbaca</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: RESULTS PANEL */}
        <div className="ded-panel">
          <div className="ded-panel-tabs">
            <button className={`ded-ptab ${activeTab === 'hasil' ? 'active' : ''}`} onClick={() => setActiveTab('hasil')}>
              📋 Hasil <span className="ded-badge" style={{ background: '#10B981' }}>{workItems.length}</span>
            </button>
            <button className={`ded-ptab ${activeTab === 'asumsi' ? 'active' : ''}`} onClick={() => setActiveTab('asumsi')}>
              ⚠️ Asumsi <span className="ded-badge" style={{ background: '#F59E0B' }}>{allAssumptions.length}</span>
            </button>
          </div>

          <div className="ded-panel-body">
            {activeTab === 'hasil' ? workItems.map((w) => {
              const lvl = confLevel(w);
              const qty = getQty(w);
              const isOpen = openId === w.id;
              const itemEvidences = evidences.filter((e) => w.evidenceIds?.includes(e.id));
              return (
                <div key={w.id} className={`ded-item ${isOpen ? 'open' : ''}`}>
                  <div className="ded-item-head" onClick={() => { setOpenId(isOpen ? null : w.id); setSelectedMarker(w.id); }}>
                    <span className={`ded-conf ${lvl}`} title={CONF_LABEL[lvl]} />
                    <span className="ded-item-title">{w.name}</span>
                    <span className="ded-item-vol">{formatQty(qty, w.unit)}{lvl !== 'high' ? ' ⚠️' : ''}</span>
                    <span className="ded-chev">▼</span>
                  </div>
                  {isOpen && (
                    <div className="ded-item-detail">
                      <div className="ded-evidence">
                        📄 Sumber:{' '}
                        {(w.sourcePages ?? []).slice(0, 3).map((p, idx) => (
                          <span key={p}>
                            {idx > 0 && ', '}
                            <span className="ded-src" onClick={() => highlightItem(w.id)}>
                              Hal {p}
                            </span>
                          </span>
                        ))}
                        {itemEvidences.length > 0 && (
                          <span style={{ color: '#64748B' }}> · {itemEvidences.length} bukti</span>
                        )}
                        {w.materialSpec && <><br /><span style={{ color: '#64748B' }}>Spesifikasi: {w.materialSpec}</span></>}
                      </div>
                      {Object.keys(w.calculationInputs ?? {}).length > 0 && (
                        <div className="ded-formula">
                          {Object.entries(w.calculationInputs).map(([k, v]) => `${k}=${v ?? '?'}`).join(' × ')} = {formatQty(qty, w.unit)}
                        </div>
                      )}
                      {(w.assumptions ?? []).map((a, i) => {
                        const key = `${w.id}-a${i}`;
                        const approved = approvedAssumptions[key];
                        return (
                          <div key={key} className={`ded-assumption ${approved ? 'resolved' : ''}`}>
                            ⚠️ {a}
                            {!approved && (
                              <div className="ded-acts">
                                <button className="ded-ok" onClick={() => setApprovedAssumptions((s: Record<string, boolean>) => ({ ...s, [key]: true }))}>✓ Setuju</button>
                              </div>
                            )}
                            {approved && <div style={{ color: '#059669', fontSize: 12, fontWeight: 700, marginTop: 6 }}>✓ Dikonfirmasi</div>}
                          </div>
                        );
                      })}
                      {(w.warnings ?? []).map((wr, i) => (
                        <div key={i} className="ded-assumption danger">🔴 {wr}</div>
                      ))}
                      <div className="ded-edit-row">
                        Koreksi:
                        <input
                          type="number" step="any" placeholder={String(w.quantity ?? 0)}
                          defaultValue={overrides[w.id] ?? ''}
                          id={`ded-vol-${w.id}`}
                        />
                        <span>{w.unit}</span>
                        <button
                          className="ded-btn-primary"
                          onClick={() => {
                            const el = document.getElementById(`ded-vol-${w.id}`) as HTMLInputElement;
                            if (el) applyOverride(w.id, el.value);
                          }}
                        >
                          Terapkan
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            }) : (
              allAssumptions.map((a) => {
                const approved = approvedAssumptions[a.key];
                return (
                  <div key={a.key} className={`ded-assumption ${approved ? 'resolved' : ''}`} style={{ margin: '0 0 10px' }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{a.workName}</div>
                    ⚠️ {a.text}
                    {!approved && (
                      <div className="ded-acts">
                        <button className="ded-ok" onClick={() => setApprovedAssumptions((s: Record<string, boolean>) => ({ ...s, [a.key]: true }))}>✓ Setuju</button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="ded-summary">
            <div className="ded-conf-count">
              <span>🟢 {counts.high} yakin</span>
              <span>🟡 {counts.med} ragu</span>
              <span>🔴 {counts.low} perlu input</span>
            </div>
            <div className="ded-summary-row"><span>{workItems.length} pekerjaan terdeteksi</span><span>{workItems.filter((w) => getQty(w) != null).length} volume final</span></div>
            {grandTotal != null && (
              <div className="ded-summary-row total"><span>Estimasi sementara</span><span>Rp {grandTotal.toLocaleString('id-ID')}</span></div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              {onRetry && <button className="ded-btn-ghost" onClick={onRetry} style={{ flex: 1 }}>↻ Analisis ulang</button>}
              {onCommitOfficialRab && <button className="ded-btn-primary" onClick={() => onCommitOfficialRab()} style={{ flex: 2, padding: 12 }}>Lanjut ke AHSP & Harga →</button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DedAiSplitAnalysisView;
