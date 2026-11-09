/**
 * MobileKurvaS — presentasi native mobile untuk Kurva S estimator
 * (Gelombang Native 2, 2026-11-10).
 *
 * Membaca MODEL YANG SAMA dengan EstimatorKurvaSView desktop lewat
 * useKurvaSModel (diekstrak verbatim): sumber data ProjectContext, logika
 * kejujuran kurvaSHonesty, dan geometri SVG identik. Yang berubah hanya
 * presentasi: grafik di dalam bingkai kartu yang bisa digeser, distribusi
 * mingguan menjadi kartu per tahapan jadwal (bukan tabel terjepit), dan
 * strip ringkasan mingguan/kumulatif/realisasi di kaki layar.
 */
import React from 'react';
import { LineChart, Clock, TrendingUp } from 'lucide-react';
import { useCurrency } from '../../context/CurrencyContext';
import type { KurvaSModel } from '../estimator/useKurvaSModel';

interface MobileKurvaSProps {
  model: KurvaSModel;
}

export const MobileKurvaS: React.FC<MobileKurvaSProps> = ({ model }) => {
  const { formatDisplay } = useCurrency();
  const {
    totalWeeks,
    setTotalWeeks,
    realKurva,
    hasRealSchedule,
    totalAmount,
    effectiveWeeks,
    categorySchedule,
    weeklyTotals,
    cumulativePercentages,
    actualCumulative,
    lastActual,
    kurvaSAvailability,
    panelAvailable,
    chartWidth,
    chartHeight,
    paddingX,
    paddingY,
    getCoordinates,
    pathD,
    areaD,
    actualPathD,
  } = model;

  return (
    <div className="mnw-screen">
      <div className="mnw-eyebrow">Kurva S</div>
      <h2 className="mnw-title">Jadwal &amp; Kurva S</h2>
      <p className="mnw-sub">Distribusi bobot kumulatif dan progres rencana konstruksi mingguan.</p>

      {/* Durasi — kontrol & state yang sama dengan desktop */}
      <div className="mnw-card" style={{ marginBottom: 12 }}>
        <div className="mnw-kurva-duration">
          <span className="mnw-kurva-duration-label">
            <Clock size={15} color="#1D4ED8" /> Durasi Proyek
          </span>
          {hasRealSchedule ? (
            <span className="mnw-kurva-duration-value">{effectiveWeeks} Minggu (dari jadwal proyek)</span>
          ) : (
            <select
              className="mnw-kurva-select"
              value={totalWeeks}
              onChange={(e) => setTotalWeeks(Number(e.target.value))}
              title="Preferensi durasi rencana — tersimpan per proyek"
            >
              <option value={8}>8 Minggu (2 Bulan)</option>
              <option value={12}>12 Minggu (3 Bulan)</option>
              <option value={16}>16 Minggu (4 Bulan)</option>
              <option value={20}>20 Minggu (5 Bulan)</option>
              <option value={24}>24 Minggu (6 Bulan)</option>
            </select>
          )}
        </div>
      </div>

      {!panelAvailable ? (
        /* Panel kejujuran — teks alasan yang sama persis dengan desktop. */
        <div className="mnw-empty">
          <TrendingUp size={28} color="#94A3B8" />
          <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Data Kurva S Tidak Tersedia</div>
          <div style={{ maxWidth: 560, lineHeight: 1.6 }}>
            {realKurva.reason === 'NO_TASKS'
              ? 'Proyek ini belum memiliki jadwal tahapan pelaksanaan, sehingga distribusi bobot mingguan tidak punya basis nyata. Buat jadwal di menu Manajemen Proyek (tugas dengan pekan mulai/selesai dan bobot) — kurva rencana & realisasi akan dihitung dari data tersebut. Distribusi tebakan dari urutan kategori RAB tidak lagi ditampilkan sebagai kurva.'
              : realKurva.reason === 'NO_WEIGHTS'
                ? 'Jadwal tahapan ada, tetapi total bobot rencana masih nol — kurva 0% datar akan terbaca sebagai fakta padahal tidak ada rencana di baliknya. Lengkapi bobot tugas jadwal terlebih dahulu.'
                : !kurvaSAvailability.available && kurvaSAvailability.reason === 'NO_WEIGHTS'
                  ? 'Item RAB ditemukan, tetapi total biaya rencana masih nol — belum ada item dengan biaya (volume × harga satuan) lebih dari nol. Kurva rencana memerlukan item berharga dan jadwal tahapan agar dapat dihitung dari data nyata.'
                  : 'Data Kurva S dari engine jadwal belum tersedia untuk proyek ini. Kurva tidak digambar daripada menampilkan angka karangan.'}
          </div>
        </div>
      ) : (
        <>
          {/* Ringkasan realisasi terakhir + total biaya rencana */}
          <div className="mnw-card" style={{ marginBottom: 12 }}>
            {lastActual ? (
              <>
                <div className="mnw-param-row">
                  <span>Realisasi s.d. Minggu {lastActual.week}</span>
                  <b style={{ color: '#15803D' }}>{lastActual.actual.toFixed(1)}%</b>
                </div>
                {lastActual.planned != null && (
                  <>
                    <div className="mnw-param-row">
                      <span>Rencana Minggu {lastActual.week}</span>
                      <b>{lastActual.planned.toFixed(1)}%</b>
                    </div>
                    <div className="mnw-param-row">
                      <span>Deviasi</span>
                      <b style={{ color: lastActual.actual - lastActual.planned < 0 ? '#DC2626' : '#15803D' }}>
                        {lastActual.actual - lastActual.planned >= 0 ? '+' : ''}
                        {(lastActual.actual - lastActual.planned).toFixed(1)}%
                      </b>
                    </div>
                  </>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12.5, color: '#64748B', lineHeight: 1.5 }}>
                Belum ada data realisasi mingguan — garis realisasi tidak digambar.
              </div>
            )}
            <div className="mnw-param-row" style={{ borderTop: '1px dashed #E2E8F0', marginTop: 6, paddingTop: 9 }}>
              <span>Total Biaya Rencana</span>
              <b>{formatDisplay(totalAmount)}</b>
            </div>
          </div>

          {/* Grafik — geometri SVG yang sama, dalam bingkai geser */}
          <div className="mnw-card" style={{ marginBottom: 12 }}>
            <div className="mnw-kurva-legend">
              <span className="mnw-kurva-legend-item">
                <span className="mnw-kurva-dot" style={{ background: '#2563EB' }} /> Rencana Kumulatif
              </span>
              {lastActual && (
                <span className="mnw-kurva-legend-item">
                  <span className="mnw-kurva-dot" style={{ background: '#16A34A' }} /> Realisasi
                </span>
              )}
            </div>
            <div className="mnw-chartscroll">
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="mnw-kurva-svg" role="img" aria-label="Grafik Kurva S rencana vs realisasi">
                <defs>
                  <linearGradient id="mnwCurveGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#2563EB" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                {[0, 25, 50, 75, 100].map((level) => {
                  const y = chartHeight - paddingY - (level / 100) * (chartHeight - paddingY * 2);
                  return (
                    <g key={level}>
                      <line x1={paddingX} y1={y} x2={chartWidth - paddingX} y2={y} stroke="#E2E8F0" strokeWidth="1" strokeDasharray="4 4" />
                      <text x={paddingX - 8} y={y + 4} fill="#94A3B8" fontSize="10" textAnchor="end">
                        {level}%
                      </text>
                    </g>
                  );
                })}
                {areaD && <path d={areaD} fill="url(#mnwCurveGradient)" />}
                {pathD && <path d={pathD} fill="none" stroke="#2563EB" strokeWidth="3.5" strokeLinecap="round" />}
                {actualPathD && <path d={actualPathD} fill="none" stroke="#16A34A" strokeWidth="3" strokeLinecap="round" />}
                {actualCumulative.map((v, idx) => {
                  if (v == null) return null;
                  const { x, y } = getCoordinates(idx, v);
                  return <circle key={`act-${idx}`} cx={x} cy={y} r="4" fill="#16A34A" stroke="#FFFFFF" strokeWidth="2" />;
                })}
                {cumulativePercentages.map((pct, idx) => {
                  const { x, y } = getCoordinates(idx, pct);
                  return (
                    <g key={idx}>
                      <circle cx={x} cy={y} r="4" fill="#FFFFFF" stroke="#2563EB" strokeWidth="2" />
                      <text x={x} y={chartHeight - 8} fill="#64748B" fontSize="11" textAnchor="middle">
                        M{idx + 1}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
            <div className="mnw-kurva-scrollhint">Geser grafik untuk melihat seluruh {effectiveWeeks} pekan</div>
          </div>

          {/* Distribusi mingguan per tahapan — kartu, bukan tabel */}
          <div className="mnw-group-title">Distribusi Bobot per Tahapan</div>
          {categorySchedule.map((cat) => (
            <div key={cat.id} className="mnw-card" style={{ marginBottom: 10 }}>
              <div className="mnw-kurva-stage-head">
                <span className="mnw-div-chip">{cat.no}</span>
                <span className="mnw-kurva-stage-name">{cat.name}</span>
                <span className="mnw-kurva-stage-weight">{cat.weight.toFixed(2)}%</span>
              </div>
              <div className="mnw-param-row">
                <span>Biaya</span>
                <b>{formatDisplay(cat.amount)}</b>
              </div>
              <div className="mnw-param-row">
                <span>Rentang</span>
                <b>
                  M{cat.startWeek} – M{cat.endWeek}
                </b>
              </div>
              <div className="mnw-kurva-chips">
                {cat.weeklyDistribution.map((wVal, wIdx) =>
                  wVal > 0 ? (
                    <span key={wIdx} className="mnw-kurva-chip">
                      M{wIdx + 1} · {wVal.toFixed(1)}%
                    </span>
                  ) : null
                )}
              </div>
            </div>
          ))}

          {/* Strip ringkasan mingguan — angka footer tabel desktop yang sama */}
          <div className="mnw-card">
            <div className="mnw-kurva-strip-row">
              <span className="mnw-kurva-strip-label">Mingguan</span>
              <span className="mnw-kurva-strip-values">
                {weeklyTotals.map((w, i) => (
                  <span key={i} className="mnw-kurva-strip-val">
                    M{i + 1} {w.toFixed(1)}%
                  </span>
                ))}
              </span>
            </div>
            <div className="mnw-kurva-strip-row">
              <span className="mnw-kurva-strip-label">Kumulatif</span>
              <span className="mnw-kurva-strip-values">
                {cumulativePercentages.map((c, i) => (
                  <span key={i} className="mnw-kurva-strip-val strong">
                    M{i + 1} {c.toFixed(1)}%
                  </span>
                ))}
              </span>
            </div>
            <div className="mnw-kurva-strip-row">
              <span className="mnw-kurva-strip-label">Realisasi</span>
              <span className="mnw-kurva-strip-values">
                {actualCumulative.map((a, i) => (
                  <span key={i} className="mnw-kurva-strip-val">
                    M{i + 1} {a != null ? `${a.toFixed(1)}%` : '—'}
                  </span>
                ))}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default MobileKurvaS;
