import React, { useState, useMemo, useEffect } from "react";
import {
  LineChart,
  Calendar,
  Layers,
  Clock,
  Download,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react";
import { Project, RabItem } from "../../types";
import { useCurrency } from "../../context/CurrencyContext";
import { evaluateEstimatorKurvaS, buildLaporanKurvaS } from "../../lib/kurvaSHonesty";
import { useProject } from "../../context/ProjectContext";

interface EstimatorKurvaSViewProps {
  currentProject: Project | null;
  items: RabItem[];
  onOpenExportModal?: () => void;
}

export const EstimatorKurvaSView: React.FC<EstimatorKurvaSViewProps> = ({
  currentProject,
  items,
  onOpenExportModal,
}) => {
  const { formatDisplay } = useCurrency();
  // Durasi preferensi PERSISTEN per proyek (dulu state lokal yang reset ke 12
  // setiap pindah tab karena view di-unmount).
  const weeksStorageKey = currentProject ? `ezrab_estimator_kurva_weeks_${currentProject.id}` : null;
  const [totalWeeks, setTotalWeeks] = useState<number>(() => {
    try {
      const v = weeksStorageKey ? Number(localStorage.getItem(weeksStorageKey)) : NaN;
      return [8, 12, 16, 20, 24].includes(v) ? v : 12;
    } catch {
      return 12;
    }
  });
  useEffect(() => {
    if (!weeksStorageKey) return;
    try {
      const v = Number(localStorage.getItem(weeksStorageKey));
      if ([8, 12, 16, 20, 24].includes(v)) setTotalWeeks(v);
    } catch {
      /* abaikan */
    }
  }, [weeksStorageKey]);
  useEffect(() => {
    try {
      if (weeksStorageKey) localStorage.setItem(weeksStorageKey, String(totalWeeks));
    } catch {
      /* abaikan */
    }
  }, [totalWeeks, weeksStorageKey]);
  const [hoveredWeek, setHoveredWeek] = useState<number | null>(null);

  // SUMBER DATA NYATA: tugas jadwal + Kurva S engine dari ProjectContext
  // (hanya berlaku bila proyek konteks = proyek yang sedang ditampilkan).
  const { projectScheduleTasks, projectKurvaSData, currentProjectId } = useProject();
  const contextMatches = !!currentProject && currentProject.id === currentProjectId;
  const scheduleTasks = contextMatches ? projectScheduleTasks : [];
  const kurvaSData = contextMatches ? projectKurvaSData : [];

  // Kurva rencana dari engine jadwal (buildLaporanKurvaS menolak menggambar
  // tanpa tugas / tanpa bobot — tidak ada sintesis dari indeks kategori lagi).
  const realKurva = useMemo(
    () => buildLaporanKurvaS(kurvaSData, scheduleTasks),
    [kurvaSData, scheduleTasks]
  );
  const hasRealSchedule = realKurva.available;

  // Total biaya rencana dari item RAB (basis kolom Biaya proporsional bobot).
  const totalAmount = useMemo(
    () => items.reduce((acc, it) => acc + (it.amount || (it.volume || 0) * (it.unitPrice || 0)), 0),
    [items]
  );

  const effectiveWeeks = hasRealSchedule ? realKurva.totalWeeks : totalWeeks;

  // Baris distribusi = TUGAS JADWAL nyata: bobot tugas disebar merata pada
  // rentang pekannya (metode yang sama dengan engine Kurva S).
  const categorySchedule = useMemo(() => {
    if (!hasRealSchedule) return [];
    return scheduleTasks.map((t, idx) => {
      const startWeek = Math.max(1, t.startWeek || 1);
      const endWeek = Math.max(startWeek, t.endWeek || startWeek);
      const duration = Math.max(1, endWeek - startWeek + 1);
      const weeklyWeight = (t.weightPercent || 0) / duration;
      const weeklyDistribution: number[] = [];
      for (let w = 1; w <= effectiveWeeks; w++) {
        weeklyDistribution.push(w >= startWeek && w <= endWeek ? weeklyWeight : 0);
      }
      return {
        id: `task-${t.id}`,
        no: idx + 1,
        name: t.name,
        amount: totalAmount * ((t.weightPercent || 0) / 100),
        weight: t.weightPercent || 0,
        startWeek,
        endWeek,
        weeklyDistribution,
      };
    });
  }, [hasRealSchedule, scheduleTasks, effectiveWeeks, totalAmount]);

  // Seri mingguan & kumulatif rencana dari keluaran engine (bukan penjumlahan
  // ulang distribusi sintesis).
  const { weeklyTotals, cumulativePercentages } = useMemo(() => {
    if (!hasRealSchedule) return { weeklyTotals: [] as number[], cumulativePercentages: [] as number[] };
    return {
      weeklyTotals: realKurva.weeks.map((w) => w.planWeekly),
      cumulativePercentages: realKurva.weeks.map((w) => w.planCum),
    };
  }, [hasRealSchedule, realKurva]);

  // Progres AKTUAL dari titik aktual Kurva S yang sama (engine menghitungnya
  // dari progres tugas). null per pekan bila belum ada realisasi.
  const actualCumulative: (number | null)[] = useMemo(
    () => kurvaSData.map((d) => (d.actualProgressPercent != null ? d.actualProgressPercent : null)),
    [kurvaSData]
  );
  const lastActual = useMemo(() => {
    for (let i = actualCumulative.length - 1; i >= 0; i--) {
      if (actualCumulative[i] != null) {
        return {
          week: i + 1,
          actual: actualCumulative[i] as number,
          planned: cumulativePercentages[i] ?? null,
        };
      }
    }
    return null;
  }, [actualCumulative, cumulativePercentages]);

  // Kejujuran data: tanpa jadwal nyata, kurva TIDAK digambar — panel
  // "Data Kurva S Tidak Tersedia" ditampilkan (alasan dirinci di panel).
  const kurvaSAvailability = useMemo(() => evaluateEstimatorKurvaS(items), [items]);
  const panelAvailable = hasRealSchedule;

  // SVG Chart Geometry
  const chartHeight = 220;
  const chartWidth = 900;
  const paddingX = 40;
  const paddingY = 30;

  const getCoordinates = (weekIdx: number, pct: number) => {
    const x = paddingX + (weekIdx / Math.max(1, effectiveWeeks - 1)) * (chartWidth - paddingX * 2);
    const y = chartHeight - paddingY - (pct / 100) * (chartHeight - paddingY * 2);
    return { x, y };
  };

  const pathD = useMemo(() => {
    if (cumulativePercentages.length === 0) return "";
    const pts = cumulativePercentages.map((pct, idx) => getCoordinates(idx, pct));
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
    // Smooth Catmull-Rom → cubic bezier
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  }, [cumulativePercentages, effectiveWeeks]);

  const areaD = useMemo(() => {
    if (cumulativePercentages.length === 0) return "";
    const first = getCoordinates(0, cumulativePercentages[0]);
    const last = getCoordinates(effectiveWeeks - 1, cumulativePercentages[effectiveWeeks - 1]);
    const bottomY = chartHeight - paddingY;
    return `${pathD} L ${last.x} ${bottomY} L ${first.x} ${bottomY} Z`;
  }, [pathD, cumulativePercentages, effectiveWeeks]);

  // Garis realisasi dari titik aktual Kurva S (hanya pekan beraktual).
  const actualPathD = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    actualCumulative.forEach((v, idx) => {
      if (v != null) pts.push(getCoordinates(idx, v));
    });
    if (pts.length === 0) return "";
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
    return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  }, [actualCumulative, effectiveWeeks]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", width: "100%", maxWidth: "1600px", margin: "0 auto" }}>
      {/* 1. TOP HEADER & CONTROLS */}
      <div style={{ background: "var(--ez-color-surface)", border: "1px solid var(--ez-color-border-line)", borderRadius: "14px", padding: "18px 20px", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 800, color: "var(--ez-color-text-primary)", margin: 0 }}>
              Jadwal Waktu Pelaksanaan & Kurva S
            </h3>
            <p style={{ fontSize: "12.5px", color: "#64748B", margin: "3px 0 0 0" }}>
              Visualisasi distribusi bobot kumulatif dan progres rencana konstruksi mingguan
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: "var(--ez-color-text-slate)", fontWeight: 600 }}>
              <Clock size={15} color="var(--ez-hue-blue-text)" />
              <span>Durasi Proyek:</span>
              {hasRealSchedule ? (
                <span style={{ fontWeight: 700, color: "var(--ez-hue-blue-text)" }}>
                  {effectiveWeeks} Minggu (dari jadwal proyek)
                </span>
              ) : (
                <select
                  value={totalWeeks}
                  onChange={(e) => setTotalWeeks(Number(e.target.value))}
                  title="Preferensi durasi rencana — tersimpan per proyek"
                  style={{
                    height: "34px",
                    padding: "0 10px",
                    borderRadius: "7px",
                    border: "1px solid var(--ez-hue-slate-border)",
                    fontSize: "12.5px",
                    fontWeight: 700,
                    color: "var(--ez-hue-blue-text)",
                    background: "var(--ez-hue-blue-bg)",
                    outline: "none",
                  }}
                >
                  <option value={8}>8 Minggu (2 Bulan)</option>
                  <option value={12}>12 Minggu (3 Bulan)</option>
                  <option value={16}>16 Minggu (4 Bulan)</option>
                  <option value={20}>20 Minggu (5 Bulan)</option>
                  <option value={24}>24 Minggu (6 Bulan)</option>
                </select>
              )}
            </div>

            {/* Tombol "Ekspor Kurva S" DIHAPUS (owner 2026-10-27) — ia
                hanya memanggil modal Export yang sama dengan di mana-mana;
                Export kini satu pintu di Pengaturan Estimasi. Prop
                onOpenExportModal dipertahankan di interface agar call-site
                tidak perlu diubah. */}
          </div>
        </div>
      </div>

      {/* Data Tidak Tersedia — kurva hanya digambar dari JADWAL NYATA
          (tugas + Kurva S engine). Distribusi sintesis dari indeks kategori
          DIHAPUS: timing mingguan tanpa tugas jadwal adalah tebakan. */}
      {!panelAvailable ? (
        <div
          style={{
            background: "var(--ez-color-surface)",
            border: "1px dashed var(--ez-color-border-line)",
            borderRadius: "16px",
            padding: "28px 20px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
            boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
          }}
        >
          <TrendingUp size={28} color="var(--ez-color-text-muted)" />
          <div style={{ fontSize: "14px", fontWeight: 800, color: "var(--ez-color-text-primary)" }}>
            Data Kurva S Tidak Tersedia
          </div>
          <div style={{ fontSize: "12.5px", color: "var(--ez-color-text-muted)", maxWidth: "560px", lineHeight: 1.6 }}>
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
      {/* 2. S-CURVE VISUAL CHART */}
      <div style={{ background: "var(--ez-color-surface)", border: "1px solid var(--ez-color-border-line)", borderRadius: "16px", padding: "24px", boxShadow: "0 1px 4px rgba(15,23,42,0.04)" }}>
        <style>{`
          @keyframes estkurva-draw { to { stroke-dashoffset: 0; } }
          @keyframes estkurva-pop {
            0% { transform: scale(0); opacity: 0; }
            70% { transform: scale(1.3); opacity: 1; }
            100% { transform: scale(1); opacity: 1; }
          }
          @keyframes estkurva-fade { to { opacity: 1; } }
          .estkurva-line { stroke-dasharray: 2400; stroke-dashoffset: 2400; animation: estkurva-draw 1.6s ease-out 0.15s forwards; }
          .estkurva-area { opacity: 0; animation: estkurva-fade 0.9s ease-out 0.9s forwards; }
          .estkurva-dot { transform-box: fill-box; transform-origin: center; opacity: 0; animation: estkurva-pop 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards; }
          @media (prefers-reduced-motion: reduce) {
            .estkurva-line, .estkurva-area, .estkurva-dot { animation: none !important; opacity: 1 !important; stroke-dashoffset: 0 !important; transform: none !important; }
          }
        `}</style>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#2563EB" }} />
              <span style={{ fontSize: "13.5px", fontWeight: 750, color: "var(--ez-color-text-primary)" }}>
                Kurva S Rencana Kumulatif (dari Jadwal Proyek)
              </span>
            </div>
            {lastActual && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#16A34A" }} />
                <span style={{ fontSize: "12.5px", fontWeight: 650, color: "var(--ez-color-text-body)" }}>
                  Realisasi s.d. Minggu {lastActual.week}: {lastActual.actual.toFixed(1)}%
                  {lastActual.planned != null && (
                    <> · Rencana {lastActual.planned.toFixed(1)}% · Deviasi {(lastActual.actual - lastActual.planned >= 0 ? "+" : "")}{(lastActual.actual - lastActual.planned).toFixed(1)}%</>
                  )}
                </span>
              </div>
            )}
            {!lastActual && (
              <span style={{ fontSize: "12px", color: "var(--ez-color-text-muted)" }}>
                Belum ada data realisasi mingguan — garis realisasi tidak digambar.
              </span>
            )}
          </div>

          <div style={{ fontSize: "12px", color: "#64748B" }}>
            Total Biaya Rencana: <strong style={{ color: "var(--ez-color-text-primary)" }}>{formatDisplay(totalAmount)}</strong>
          </div>
        </div>

        {/* SVG Curve Display */}
        <div style={{ width: "100%", overflowX: "auto" }}>
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            style={{ width: "100%", height: "240px", overflow: "visible" }}
          >
            <defs>
              <linearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563EB" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#2563EB" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Grid lines */}
            {[0, 25, 50, 75, 100].map((level) => {
              const y = chartHeight - paddingY - (level / 100) * (chartHeight - paddingY * 2);
              return (
                <g key={level}>
                  <line
                    x1={paddingX}
                    y1={y}
                    x2={chartWidth - paddingX}
                    y2={y}
                    stroke="var(--ez-color-surface-tertiary)"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={paddingX - 8}
                    y={y + 4}
                    fill="#94A3B8"
                    fontSize="10"
                    textAnchor="end"
                    fontFamily="var(--ezrab-font-mono)"
                  >
                    {level}%
                  </text>
                </g>
              );
            })}

            {/* Area fill */}
            {areaD && <path d={areaD} fill="url(#curveGradient)" className="estkurva-area" />}

            {/* S-Curve Line — smooth + draw animation */}
            {pathD && <path d={pathD} fill="none" stroke="#2563EB" strokeWidth="3.5" strokeLinecap="round" className="estkurva-line" />}

            {/* Actual line — hanya dari titik aktual Kurva S nyata */}
            {actualPathD && <path d={actualPathD} fill="none" stroke="#16A34A" strokeWidth="3" strokeLinecap="round" />}
            {actualCumulative.map((v, idx) => {
              if (v == null) return null;
              const { x, y } = getCoordinates(idx, v);
              return <circle key={`act-${idx}`} cx={x} cy={y} r="4" fill="#16A34A" stroke="#FFFFFF" strokeWidth="2" />;
            })}

            {/* Week Data Points — staggered pop-in + hover tooltip */}
            {cumulativePercentages.map((pct, idx) => {
              const { x, y } = getCoordinates(idx, pct);
              const isHovered = hoveredWeek === idx + 1;
              return (
                <g
                  key={idx}
                  onMouseEnter={() => setHoveredWeek(idx + 1)}
                  onMouseLeave={() => setHoveredWeek(null)}
                  style={{ cursor: "pointer" }}
                >
                  <circle
                    cx={x}
                    cy={y}
                    r={isHovered ? 6 : 4}
                    fill="#FFFFFF"
                    stroke="#2563EB"
                    strokeWidth={isHovered ? 3 : 2}
                    className="estkurva-dot"
                    style={{ animationDelay: `${0.5 + idx * 0.06}s` }}
                  />
                  {isHovered && (
                    <g transform={`translate(${Math.min(Math.max(x - 58, paddingX - 10), chartWidth - 130)}, ${Math.max(y - 58, 4)})`}>
                      <rect width="116" height="42" rx="8" fill="#0F172A" opacity="0.94" />
                      <text x="10" y="17" fill="#94A3B8" fontSize="10" fontWeight="700">Minggu {idx + 1}</text>
                      <circle cx="14" cy="30" r="3.5" fill="#3B82F6" />
                      <text x="22" y="33" fill="#FFFFFF" fontSize="10.5" fontWeight="700">
                        Rencana: {pct.toFixed(1)}%
                      </text>
                    </g>
                  )}
                  <text
                    x={x}
                    y={chartHeight - 8}
                    fill={isHovered ? "#2563EB" : "#64748B"}
                    fontSize="11"
                    fontWeight={isHovered ? "700" : "500"}
                    textAnchor="middle"
                  >
                    M{idx + 1}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* 3. TIMELINE & WEEKLY SCHEDULE TABLE */}
      <div style={{ background: "var(--ez-color-surface)", border: "1px solid var(--ez-color-border-line)", borderRadius: "16px", padding: "20px 24px", boxShadow: "0 1px 4px rgba(15,23,42,0.04)", overflowX: "auto" }}>
        <h3 style={{ fontSize: "15px", fontWeight: 800, color: "var(--ez-color-text-primary)", marginBottom: "14px" }}>
          Distribusi Bobot Mingguan per Tahapan Jadwal
        </h3>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", minWidth: "800px" }}>
          <thead>
            <tr style={{ background: "var(--ez-color-surface-secondary)", borderBottom: "2px solid var(--ez-color-border-line)", color: "var(--ez-color-text-slate)" }}>
              <th style={{ padding: "8px 10px", textAlign: "center", width: "40px" }}>No</th>
              <th style={{ padding: "8px 10px", textAlign: "left", width: "240px" }}>Tahapan Pekerjaan</th>
              <th style={{ padding: "8px 10px", textAlign: "right", width: "130px" }}>Biaya (Rp)</th>
              <th style={{ padding: "8px 10px", textAlign: "right", width: "80px" }}>Bobot</th>
              {Array.from({ length: effectiveWeeks }, (_, i) => (
                <th key={i} style={{ padding: "8px 4px", textAlign: "center", width: "45px" }}>
                  M{i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categorySchedule.map((cat) => (
              <tr key={cat.id} style={{ borderBottom: "1px solid var(--ez-color-surface-tertiary)" }}>
                <td style={{ padding: "8px 10px", textAlign: "center", color: "#94A3B8" }}>{cat.no}</td>
                <td style={{ padding: "8px 10px", fontWeight: 600, color: "var(--ez-color-text-primary)" }}>{cat.name}</td>
                <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {formatDisplay(cat.amount)}
                </td>
                <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "var(--ez-hue-blue-text)", fontVariantNumeric: "tabular-nums" }}>
                  {cat.weight.toFixed(2)}%
                </td>
                {cat.weeklyDistribution.map((wVal, wIdx) => (
                  <td
                    key={wIdx}
                    style={{
                      padding: "8px 2px",
                      textAlign: "center",
                      fontSize: "11px",
                      background: wVal > 0 ? "var(--ez-hue-blue-bg)" : "transparent",
                      color: wVal > 0 ? "var(--ez-hue-blue-text-deep)" : "var(--ez-hue-slate-border)",
                      fontWeight: wVal > 0 ? 600 : 400,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {wVal > 0 ? `${wVal.toFixed(1)}%` : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: "var(--ez-color-surface-secondary)", borderTop: "2px solid var(--ez-color-border-line)", fontWeight: 700 }}>
              <td colSpan={2} style={{ padding: "9px 10px", textAlign: "right" }}>
                Bobot Rencana Mingguan (%)
              </td>
              <td style={{ padding: "9px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {formatDisplay(totalAmount)}
              </td>
              <td style={{ padding: "9px 10px", textAlign: "right", color: "var(--ez-hue-blue-text)" }}>
                {categorySchedule.reduce((s, c) => s + c.weight, 0).toFixed(2)}%
              </td>
              {weeklyTotals.map((wTot, wIdx) => (
                <td key={wIdx} style={{ padding: "9px 2px", textAlign: "center", fontSize: "11px", color: "var(--ez-color-text-primary)", fontWeight: 700 }}>
                  {wTot.toFixed(1)}%
                </td>
              ))}
            </tr>
            <tr style={{ background: "var(--ez-hue-blue-bg)", borderTop: "1px solid var(--ez-hue-blue-border)", fontWeight: 800, color: "var(--ez-hue-blue-text-deep)" }}>
              <td colSpan={4} style={{ padding: "10px 10px", textAlign: "right" }}>
                Bobot Rencana Kumulatif (%)
              </td>
              {cumulativePercentages.map((cVal, cIdx) => (
                <td key={cIdx} style={{ padding: "10px 2px", textAlign: "center", fontSize: "11px", color: "var(--ez-hue-blue-text)" }}>
                  {cVal.toFixed(1)}%
                </td>
              ))}
            </tr>
            <tr style={{ background: "var(--ez-pastel-mint, #ECFDF5)", borderTop: "1px solid var(--ez-color-border-line)", fontWeight: 700, color: "var(--ez-hue-green-text)" }}>
              <td colSpan={4} style={{ padding: "10px 10px", textAlign: "right" }}>
                Bobot Realisasi Kumulatif (%)
              </td>
              {actualCumulative.map((aVal, aIdx) => (
                <td key={aIdx} style={{ padding: "10px 2px", textAlign: "center", fontSize: "11px" }}>
                  {aVal != null ? `${aVal.toFixed(1)}%` : "—"}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      </>
      )}
    </div>
  );
};
