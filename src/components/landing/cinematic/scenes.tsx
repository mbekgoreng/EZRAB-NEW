import React, { memo } from 'react';
import { DashboardMock } from './DashboardMock';
import {
  DEMO_BADGE,
  DEMO_PROJECT_NAME,
  demoAiEstimateSteps,
  demoCurveS,
  demoProjects,
  demoRabItems,
  demoRabRows,
  demoSubtotal,
  formatRupiah,
  formatVolume,
} from './demoData';

/** Map scene progress to a 0..1 segment between a and b. */
const seg = (p: number, a: number, b: number): number =>
  Math.min(1, Math.max(0, (p - a) / (b - a)));

const fade = (p: number, a: number, b: number): React.CSSProperties => ({
  opacity: seg(p, a, b),
  transform: `translateY(${(1 - seg(p, a, b)) * 8}px)`,
  transition: 'none',
});

interface SceneProps {
  progress: number;
  reduced: boolean;
}

/* ------------------------------------------------------------------ */
/* S1 — Project Intelligence                                           */
/* ------------------------------------------------------------------ */
export const SceneProjectIntelligence: React.FC<SceneProps> = memo(({ progress, reduced }) => {
  const p = reduced ? 1 : progress;
  const selected = seg(p, 0.25, 0.45) > 0.5;
  const detailIn = seg(p, 0.5, 0.75);
  return (
    <DashboardMock activeMenuId="proyek">
      <div className="ch-scene-head">
        <h3>Proyek</h3>
        <span className="ch-demo-chip">{DEMO_BADGE}</span>
      </div>
      <div className="ch-project-cards">
        {demoProjects.map((proj, i) => (
          <div
            key={proj.id}
            className={`ch-project-card${i === 0 && selected ? ' is-selected' : ''}`}
            style={fade(p, 0.05 + i * 0.12, 0.2 + i * 0.12)}
          >
            <div className="ch-project-card-top">
              <strong>{proj.name}</strong>
              <span className={`ch-status ch-status--${proj.status === 'Aktif' ? 'active' : proj.status === 'Selesai' ? 'done' : 'draft'}`}>
                {proj.status}
              </span>
            </div>
            <p className="ch-muted">{proj.location}</p>
            <div className="ch-progressbar">
              <span style={{ width: `${proj.progress}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="ch-project-detail" style={{ opacity: detailIn, pointerEvents: detailIn > 0.5 ? 'auto' : 'none' }}>
        <div className="ch-detail-banner" style={fade(p, 0.55, 0.7)}>
          <strong>{DEMO_PROJECT_NAME}</strong>
          <span className="ch-muted">Ringkasan proyek terpilih — {DEMO_BADGE.toLowerCase()}</span>
        </div>
        <div className="ch-kpi-row">
          {[
            { label: 'Item RAB', value: String(demoRabRows.length) },
            { label: 'Volume beton', value: formatVolume(demoRabRows[2].volume, 'm³') },
            { label: 'Subtotal contoh', value: formatRupiah(demoSubtotal) },
          ].map((kpi, i) => (
            <div key={kpi.label} className="ch-kpi" style={fade(p, 0.6 + i * 0.1, 0.72 + i * 0.1)}>
              <span className="ch-kpi-value">{kpi.value}</span>
              <span className="ch-kpi-label">{kpi.label}</span>
            </div>
          ))}
        </div>
      </div>
    </DashboardMock>
  );
});
SceneProjectIntelligence.displayName = 'SceneProjectIntelligence';

/* ------------------------------------------------------------------ */
/* S2 — AI Estimate                                                    */
/* ------------------------------------------------------------------ */
export const SceneAiEstimate: React.FC<SceneProps> = memo(({ progress, reduced }) => {
  const p = reduced ? 1 : progress;
  const stepActive = p < 0.35 ? 0 : p < 0.6 ? 1 : 2;
  const rowsVisible = Math.floor(seg(p, 0.6, 0.95) * (demoRabRows.length + 0.999));
  return (
    <DashboardMock activeMenuId="ded-estimate-ai">
      <div className="ch-scene-head">
        <h3>AI Estimate</h3>
        <span className="ch-demo-chip">{DEMO_BADGE}</span>
      </div>
      <div className="ch-ai-form" style={fade(p, 0.05, 0.2)}>
        <span className="ch-muted">Tipe proyek</span>
        <div className="ch-chip-row">
          <span className="ch-type-chip is-picked">Rumah tinggal</span>
          <span className="ch-type-chip">Ruko</span>
          <span className="ch-type-chip">Gedung</span>
        </div>
      </div>
      <ol className="ch-ai-steps">
        {demoAiEstimateSteps.map((step, i) => (
          <li
            key={step}
            className={`ch-ai-step${i < stepActive ? ' is-done' : i === stepActive ? ' is-active' : ''}`}
            style={fade(p, 0.15 + i * 0.12, 0.28 + i * 0.12)}
          >
            <span className="ch-ai-step-dot">{i + 1}</span>
            {step}
            {i === stepActive && <span className="ch-ai-spinner" aria-hidden="true" />}
          </li>
        ))}
      </ol>
      <div className="ch-mini-table-wrap">
        <table className="ch-mini-table">
          <thead>
            <tr>
              <th>Pekerjaan</th>
              <th>Vol.</th>
              <th>Subtotal contoh</th>
            </tr>
          </thead>
          <tbody>
            {demoRabRows.map((row, i) => (
              <tr key={row.code} style={{ opacity: i < rowsVisible ? 1 : 0 }}>
                <td>
                  <span className="ch-code">{row.code}</span> {row.name}
                </td>
                <td>{formatVolume(row.volume, row.unit)}</td>
                <td>{formatRupiah(row.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ch-honest-caption">Simulasi tampilan — bukan panggilan AI sungguhan.</p>
    </DashboardMock>
  );
});
SceneAiEstimate.displayName = 'SceneAiEstimate';

/* ------------------------------------------------------------------ */
/* S3 — DED & AI Dokumen                                               */
/* ------------------------------------------------------------------ */
const BlueprintThumb: React.FC<{ active: boolean; page: number }> = ({ active, page }) => (
  <svg
    viewBox="0 0 80 100"
    className={`ch-doc-thumb${active ? ' is-active' : ''}`}
    role="img"
    aria-label={`Halaman ${page}`}
  >
    <rect x="4" y="4" width="72" height="92" fill={active ? '#DBEAFE' : '#F1F5F9'} stroke="#2563EB" strokeWidth="1.5" />
    <rect x="12" y="14" width="56" height="30" fill="none" stroke="#2563EB" strokeWidth="1" strokeDasharray="4 3" />
    <line x1="12" y1="58" x2="68" y2="58" stroke="#94A3B8" strokeWidth="1.5" />
    <line x1="12" y1="68" x2="52" y2="68" stroke="#94A3B8" strokeWidth="1.5" />
    <line x1="12" y1="78" x2="60" y2="78" stroke="#94A3B8" strokeWidth="1.5" />
    <text x="40" y="92" textAnchor="middle" fontSize="9" fill="#475569">
      Hlm {page}
    </text>
  </svg>
);

export const SceneDedDokumen: React.FC<SceneProps> = memo(({ progress, reduced }) => {
  const p = reduced ? 1 : progress;
  const activePage = p < 0.33 ? 1 : p < 0.66 ? 2 : 3;
  return (
    <DashboardMock activeMenuId="ai-document">
      <div className="ch-scene-head">
        <h3>AI Dokumen</h3>
        <span className="ch-demo-chip">{DEMO_BADGE}</span>
      </div>
      <div className="ch-doc-layout">
        <div className="ch-doc-viewer" style={fade(p, 0.05, 0.2)}>
          <p className="ch-muted">DED_Rumah-Tipe120.pdf — {DEMO_BADGE.toLowerCase()}</p>
          <div className="ch-doc-thumbs">
            {[1, 2, 3].map((page) => (
              <BlueprintThumb key={page} page={page} active={page === activePage} />
            ))}
          </div>
        </div>
        <div className="ch-doc-analysis">
          {[
            { page: 1, text: 'Denah lantai 1 — 3 kamar tidur, 2 kamar mandi.' },
            { page: 2, text: 'Detail pondasi batu kali, sloof 25/40, kolom 25/25.' },
            { page: 3, text: 'Rencana atap pelana, rangka baja ringan.' },
          ].map((item, i) => (
            <div
              key={item.page}
              className={`ch-analysis-item${item.page === activePage ? ' is-active' : ''}`}
              style={fade(p, 0.25 + i * 0.15, 0.38 + i * 0.15)}
            >
              <span className="ch-page-marker">[Halaman {item.page}]</span>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="ch-honest-caption">Dokumen contoh — hasil analisis ilustratif, bukan OCR sungguhan.</p>
    </DashboardMock>
  );
});
SceneDedDokumen.displayName = 'SceneDedDokumen';

/* ------------------------------------------------------------------ */
/* S4 — QTO & Kalkulasi Volume                                         */
/* ------------------------------------------------------------------ */
export const SceneQtoVolume: React.FC<SceneProps> = memo(({ progress, reduced }) => {
  const p = reduced ? 1 : progress;
  // Animate dimensions: panjang 10 → 12.5, lebar 0.30 → 0.25, tinggi 0.40 tetap
  const dimT = seg(p, 0.1, 0.55);
  const panjang = 10 + (12.5 - 10) * dimT;
  const lebar = 0.3 + (0.25 - 0.3) * dimT;
  const tinggi = 0.4;
  const volume = panjang * lebar * tinggi;
  const sent = seg(p, 0.7, 0.9) > 0.5;
  const sentFlash = seg(p, 0.7, 0.85);
  return (
    <DashboardMock activeMenuId="kalkulator-volume">
      <div className="ch-scene-head">
        <h3>Kalkulator Volume</h3>
        <span className="ch-demo-chip">{DEMO_BADGE}</span>
      </div>
      <div className="ch-qto-panel" style={fade(p, 0.05, 0.2)}>
        <p className="ch-muted">Beton sloof K-225 — dimensi (m)</p>
        <div className="ch-qto-inputs">
          {[
            { label: 'Panjang', value: panjang },
            { label: 'Lebar', value: lebar },
            { label: 'Tinggi', value: tinggi },
          ].map((f) => (
            <label key={f.label} className="ch-qto-field">
              <span>{f.label}</span>
              <strong>{f.value.toFixed(2)}</strong>
            </label>
          ))}
        </div>
        <p className="ch-qto-formula">
          V = p × l × t = {panjang.toFixed(2)} × {lebar.toFixed(2)} × {tinggi.toFixed(2)}
        </p>
        <p className="ch-qto-result">
          Volume = <strong>{volume.toFixed(2)} m³</strong>
        </p>
      </div>
      <div className="ch-qto-send" style={{ opacity: sentFlash }}>
        <span className={`ch-send-btn${sent ? ' is-sent' : ''}`}>
          {sent ? '✓ Terkirim ke RAB' : 'Kirim ke RAB'}
        </span>
      </div>
      {sent && (
        <table className="ch-mini-table ch-mini-table--sent" style={fade(p, 0.82, 0.95)}>
          <tbody>
            <tr>
              <td>
                <span className="ch-code">{demoRabItems[2].code}</span> {demoRabItems[2].name}
              </td>
              <td>{formatVolume(demoRabRows[2].volume, 'm³')}</td>
              <td>{formatRupiah(demoRabRows[2].subtotal)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </DashboardMock>
  );
});
SceneQtoVolume.displayName = 'SceneQtoVolume';

/* ------------------------------------------------------------------ */
/* S5 — AHSP & RAB                                                     */
/* ------------------------------------------------------------------ */
export const SceneAhspRab: React.FC<SceneProps> = memo(({ progress, reduced }) => {
  const p = reduced ? 1 : progress;
  const expanded = seg(p, 0.3, 0.5) > 0.5;
  const showTotal = seg(p, 0.72, 0.9);
  return (
    <DashboardMock activeMenuId="rab-estimasi">
      <div className="ch-scene-head">
        <h3>RAB &amp; Estimasi</h3>
        <span className="ch-demo-chip">{DEMO_BADGE}</span>
      </div>
      <table className="ch-mini-table ch-rab-table">
        <thead>
          <tr>
            <th>Kode AHSP</th>
            <th>Pekerjaan</th>
            <th>Vol.</th>
            <th>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {demoRabRows.map((row, i) => (
            <React.Fragment key={row.code}>
              <tr style={fade(p, 0.08 + i * 0.12, 0.2 + i * 0.12)}>
                <td>
                  <span className="ch-code">{row.code}</span>
                </td>
                <td>{row.name}</td>
                <td>{formatVolume(row.volume, row.unit)}</td>
                <td>{formatRupiah(row.subtotal)}</td>
              </tr>
              {i === 0 && expanded && (
                <tr className="ch-breakdown-row">
                  <td colSpan={4}>
                    <div className="ch-breakdown" style={fade(p, 0.32, 0.48)}>
                      {demoRabItems[0].resources.map((r) => (
                        <span key={r.name} className={`ch-res ch-res--${r.kind === 'Material' ? 'mat' : r.kind === 'Upah' ? 'wage' : 'tool'}`}>
                          {r.kind}: {r.name} × {r.coef} {r.unit}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
      <div className="ch-total-band" style={{ opacity: showTotal }}>
        <span>Subtotal {demoRabRows.length} item</span>
        <strong>{formatRupiah(demoSubtotal)}</strong>
      </div>
      <p className="ch-honest-caption">Harga contoh (bukan harga resmi) — untuk keperluan demonstrasi.</p>
    </DashboardMock>
  );
});
SceneAhspRab.displayName = 'SceneAhspRab';

/* ------------------------------------------------------------------ */
/* S6 — Laporan & Kurva S                                              */
/* ------------------------------------------------------------------ */
const CURVE_W = 320;
const CURVE_H = 130;

function curvePath(points: number[]): string {
  return points
    .map((w, i) => {
      const x = 20 + (i / (points.length - 1)) * (CURVE_W - 40);
      const y = CURVE_H - 16 - (w / 100) * (CURVE_H - 36);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export const SceneLaporanKurvaS: React.FC<SceneProps> = memo(({ progress, reduced }) => {
  const p = reduced ? 1 : progress;
  const drawT = seg(p, 0.1, 0.75);
  const d = curvePath(demoCurveS);
  const totalLen = 560; // approximate path length for dash animation
  return (
    <DashboardMock activeMenuId="laporan">
      <div className="ch-scene-head">
        <h3>Laporan — Kurva S</h3>
        <span className="ch-demo-chip">{DEMO_BADGE}</span>
      </div>
      <div className="ch-curve-wrap" style={fade(p, 0.05, 0.2)}>
        <svg viewBox={`0 0 ${CURVE_W} ${CURVE_H}`} className="ch-curve" role="img" aria-label="Kurva S demonstrasi">
          {[0, 25, 50, 75, 100].map((g) => {
            const y = CURVE_H - 16 - (g / 100) * (CURVE_H - 36);
            return (
              <g key={g}>
                <line x1="20" y1={y} x2={CURVE_W - 20} y2={y} stroke="#E2E8F0" strokeWidth="1" />
                <text x="8" y={y + 3} fontSize="8" fill="#94A3B8">
                  {g}%
                </text>
              </g>
            );
          })}
          <path
            d={d}
            fill="none"
            stroke="#2563EB"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={totalLen}
            strokeDashoffset={totalLen * (1 - drawT)}
          />
          {demoCurveS.map((w, i) => {
            const x = 20 + (i / (demoCurveS.length - 1)) * (CURVE_W - 40);
            const y = CURVE_H - 16 - (w / 100) * (CURVE_H - 36);
            const visible = drawT * (demoCurveS.length - 1) >= i;
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="3"
                fill="#2563EB"
                opacity={visible ? 1 : 0}
              />
            );
          })}
        </svg>
        <p className="ch-muted ch-curve-note">Bobot kumulatif rencana — {DEMO_BADGE.toLowerCase()}</p>
      </div>
      <div className="ch-kpi-row">
        {[
          { label: 'Subtotal contoh', value: formatRupiah(demoSubtotal) },
          { label: 'Item terverifikasi', value: `${demoRabRows.length} item` },
          { label: 'Progres rencana', value: '100%' },
        ].map((kpi, i) => (
          <div key={kpi.label} className="ch-kpi" style={fade(p, 0.55 + i * 0.12, 0.68 + i * 0.12)}>
            <span className="ch-kpi-value">{kpi.value}</span>
            <span className="ch-kpi-label">{kpi.label}</span>
          </div>
        ))}
      </div>
    </DashboardMock>
  );
});
SceneLaporanKurvaS.displayName = 'SceneLaporanKurvaS';
