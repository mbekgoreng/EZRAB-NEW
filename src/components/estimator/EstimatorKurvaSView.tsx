import React, { useState, useMemo } from "react";
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
import { formatCurrencyIDR } from "../../calculations/decimalEngine";

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
  const [totalWeeks, setTotalWeeks] = useState<number>(12);
  const [hoveredWeek, setHoveredWeek] = useState<number | null>(null);

  // Group items by category and compute weights
  const { categorySchedule, totalAmount } = useMemo(() => {
    const map = new Map<string, { name: string; amount: number }>();
    let total = 0;

    items.forEach((it) => {
      const cat = it.category || "Pekerjaan Persiapan & Umum";
      const amt = it.amount || (it.volume || 0) * (it.unitPrice || 0);
      total += amt;
      const ex = map.get(cat);
      if (ex) ex.amount += amt;
      else map.set(cat, { name: cat, amount: amt });
    });

    const cats = Array.from(map.values()).map((c, idx) => {
      const weight = total > 0 ? (c.amount / total) * 100 : 0;
      
      // Calculate realistic staggered start and duration based on WBS sequence
      const catCount = map.size || 1;
      const startWeek = Math.min(Math.floor((idx / catCount) * (totalWeeks * 0.7)), totalWeeks - 2);
      const spanWeeks = Math.max(3, Math.floor(totalWeeks * 0.4));
      const endWeek = Math.min(startWeek + spanWeeks, totalWeeks);
      const activeDuration = Math.max(1, endWeek - startWeek);
      const weeklyWeight = weight / activeDuration;

      const weeklyDistribution: number[] = [];
      for (let w = 1; w <= totalWeeks; w++) {
        if (w >= startWeek + 1 && w <= endWeek) {
          weeklyDistribution.push(weeklyWeight);
        } else {
          weeklyDistribution.push(0);
        }
      }

      return {
        id: `cat-${idx + 1}`,
        no: idx + 1,
        name: c.name,
        amount: c.amount,
        weight,
        startWeek: startWeek + 1,
        endWeek,
        weeklyDistribution,
      };
    });

    return { categorySchedule: cats, totalAmount: total };
  }, [items, totalWeeks]);

  // Compute Weekly Total & Cumulative % for S-Curve
  const { weeklyTotals, cumulativePercentages } = useMemo(() => {
    const wTotals: number[] = [];
    const cumPct: number[] = [];
    let cum = 0;

    for (let w = 0; w < totalWeeks; w++) {
      let weekSum = 0;
      categorySchedule.forEach((cat) => {
        weekSum += cat.weeklyDistribution[w] || 0;
      });
      wTotals.push(weekSum);
      cum += weekSum;
      cumPct.push(Math.min(100, cum));
    }

    return { weeklyTotals: wTotals, cumulativePercentages: cumPct };
  }, [categorySchedule, totalWeeks]);

  // SVG Chart Geometry
  const chartHeight = 220;
  const chartWidth = 900;
  const paddingX = 40;
  const paddingY = 30;

  const getCoordinates = (weekIdx: number, pct: number) => {
    const x = paddingX + (weekIdx / (totalWeeks - 1)) * (chartWidth - paddingX * 2);
    const y = chartHeight - paddingY - (pct / 100) * (chartHeight - paddingY * 2);
    return { x, y };
  };

  const pathD = useMemo(() => {
    if (cumulativePercentages.length === 0) return "";
    return cumulativePercentages.reduce((acc, pct, idx) => {
      const { x, y } = getCoordinates(idx, pct);
      return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
    }, "");
  }, [cumulativePercentages, totalWeeks]);

  const areaD = useMemo(() => {
    if (cumulativePercentages.length === 0) return "";
    const first = getCoordinates(0, cumulativePercentages[0]);
    const last = getCoordinates(totalWeeks - 1, cumulativePercentages[totalWeeks - 1]);
    const bottomY = chartHeight - paddingY;
    return `${pathD} L ${last.x} ${bottomY} L ${first.x} ${bottomY} Z`;
  }, [pathD, cumulativePercentages, totalWeeks]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", width: "100%", maxWidth: "1600px", margin: "0 auto" }}>
      {/* 1. TOP HEADER & CONTROLS */}
      <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "14px", padding: "18px 20px", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 800, color: "#0F172A", margin: 0 }}>
              Jadwal Waktu Pelaksanaan & Kurva S
            </h3>
            <p style={{ fontSize: "12.5px", color: "#64748B", margin: "3px 0 0 0" }}>
              Visualisasi distribusi bobot kumulatif dan progres rencana konstruksi mingguan
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: "#475569", fontWeight: 600 }}>
              <Clock size={15} color="#2563EB" />
              <span>Durasi Proyek:</span>
              <select
                value={totalWeeks}
                onChange={(e) => setTotalWeeks(Number(e.target.value))}
                style={{
                  height: "34px",
                  padding: "0 10px",
                  borderRadius: "7px",
                  border: "1px solid #CBD5E1",
                  fontSize: "12.5px",
                  fontWeight: 700,
                  color: "#2563EB",
                  background: "#EFF6FF",
                  outline: "none",
                }}
              >
                <option value={8}>8 Minggu (2 Bulan)</option>
                <option value={12}>12 Minggu (3 Bulan)</option>
                <option value={16}>16 Minggu (4 Bulan)</option>
                <option value={20}>20 Minggu (5 Bulan)</option>
                <option value={24}>24 Minggu (6 Bulan)</option>
              </select>
            </div>

            {onOpenExportModal && (
              <button
                onClick={onOpenExportModal}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 14px",
                  borderRadius: "8px",
                  border: "1px solid #CBD5E1",
                  background: "#FFFFFF",
                  color: "#334155",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <Download size={14} />
                <span>Ekspor Kurva S</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. S-CURVE VISUAL CHART */}
      <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "16px", padding: "24px", boxShadow: "0 1px 4px rgba(15,23,42,0.04)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#2563EB" }} />
            <span style={{ fontSize: "13.5px", fontWeight: 750, color: "#0F172A" }}>
              Kurva S Rencana Kumulatif (Planned Progress %)
            </span>
          </div>

          <div style={{ fontSize: "12px", color: "#64748B" }}>
            Total Biaya Rencana: <strong style={{ color: "#0F172A" }}>{formatCurrencyIDR(totalAmount)}</strong>
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
                    stroke="#F1F5F9"
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
            {areaD && <path d={areaD} fill="url(#curveGradient)" />}

            {/* S-Curve Line */}
            {pathD && <path d={pathD} fill="none" stroke="#2563EB" strokeWidth="3.5" strokeLinecap="round" />}

            {/* Week Data Points */}
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
                  />
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
      <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "16px", padding: "20px 24px", boxShadow: "0 1px 4px rgba(15,23,42,0.04)", overflowX: "auto" }}>
        <h3 style={{ fontSize: "15px", fontWeight: 800, color: "#0F172A", marginBottom: "14px" }}>
          Distribusi Bobot Pekerjaan Mingguan
        </h3>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", minWidth: "800px" }}>
          <thead>
            <tr style={{ background: "#F8FAFC", borderBottom: "2px solid #E2E8F0", color: "#475569" }}>
              <th style={{ padding: "8px 10px", textAlign: "center", width: "40px" }}>No</th>
              <th style={{ padding: "8px 10px", textAlign: "left", width: "240px" }}>Kelompok Pekerjaan</th>
              <th style={{ padding: "8px 10px", textAlign: "right", width: "130px" }}>Biaya (Rp)</th>
              <th style={{ padding: "8px 10px", textAlign: "right", width: "80px" }}>Bobot</th>
              {Array.from({ length: totalWeeks }, (_, i) => (
                <th key={i} style={{ padding: "8px 4px", textAlign: "center", width: "45px" }}>
                  M{i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categorySchedule.map((cat) => (
              <tr key={cat.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                <td style={{ padding: "8px 10px", textAlign: "center", color: "#94A3B8" }}>{cat.no}</td>
                <td style={{ padding: "8px 10px", fontWeight: 600, color: "#0F172A" }}>{cat.name}</td>
                <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {formatCurrencyIDR(cat.amount)}
                </td>
                <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "#2563EB", fontVariantNumeric: "tabular-nums" }}>
                  {cat.weight.toFixed(2)}%
                </td>
                {cat.weeklyDistribution.map((wVal, wIdx) => (
                  <td
                    key={wIdx}
                    style={{
                      padding: "8px 2px",
                      textAlign: "center",
                      fontSize: "11px",
                      background: wVal > 0 ? "#EFF6FF" : "transparent",
                      color: wVal > 0 ? "#1D4ED8" : "#CBD5E1",
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
            <tr style={{ background: "#F8FAFC", borderTop: "2px solid #E2E8F0", fontWeight: 700 }}>
              <td colSpan={2} style={{ padding: "9px 10px", textAlign: "right" }}>
                Bobot Rencana Mingguan (%)
              </td>
              <td style={{ padding: "9px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {formatCurrencyIDR(totalAmount)}
              </td>
              <td style={{ padding: "9px 10px", textAlign: "right", color: "#2563EB" }}>100.00%</td>
              {weeklyTotals.map((wTot, wIdx) => (
                <td key={wIdx} style={{ padding: "9px 2px", textAlign: "center", fontSize: "11px", color: "#0F172A", fontWeight: 700 }}>
                  {wTot.toFixed(1)}%
                </td>
              ))}
            </tr>
            <tr style={{ background: "#EFF6FF", borderTop: "1px solid #BFDBFE", fontWeight: 800, color: "#1E3A8A" }}>
              <td colSpan={4} style={{ padding: "10px 10px", textAlign: "right" }}>
                Bobot Rencana Kumulatif (%)
              </td>
              {cumulativePercentages.map((cVal, cIdx) => (
                <td key={cIdx} style={{ padding: "10px 2px", textAlign: "center", fontSize: "11px", color: "#2563EB" }}>
                  {cVal.toFixed(1)}%
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
