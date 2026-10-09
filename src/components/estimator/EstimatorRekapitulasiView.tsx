import React, { useMemo } from "react";
import {
  FileCheck,
  TrendingUp,
  Layers,
  Download,
  ShieldCheck,
  PieChart as PieChartIcon,
} from "lucide-react";
import { Project, RabItem } from "../../types";
import { formatCurrencyIDR } from "../../calculations/decimalEngine";

interface EstimatorRekapitulasiViewProps {
  currentProject: Project | null;
  items: RabItem[];
  onOpenExportModal?: () => void;
}

export const EstimatorRekapitulasiView: React.FC<EstimatorRekapitulasiViewProps> = ({
  currentProject,
  items,
  onOpenExportModal,
}) => {
  const { categoryList, directCost, overheadNominal, ppnNominal, grandTotal } = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number }>();
    let direct = 0;

    items.forEach((item) => {
      const cat = item.category || "Pekerjaan Persiapan & Umum";
      const amt = item.amount || (item.volume || 0) * (item.unitPrice || 0);
      direct += amt;

      const existing = map.get(cat);
      if (existing) {
        existing.total += amt;
        existing.count += 1;
      } else {
        map.set(cat, { name: cat, total: amt, count: 1 });
      }
    });

    const categories = Array.from(map.values()).map((c, idx) => ({
      no: idx + 1,
      name: c.name,
      total: c.total,
      count: c.count,
      weight: direct > 0 ? (c.total / direct) * 100 : 0,
    }));

    const overheadPct = (currentProject as any)?.overheadPercent ?? 10;
    const ppnPct = (currentProject as any)?.ppnPercent ?? 11;

    const overhead = (direct * overheadPct) / 100;
    const subtotalAfterOverhead = direct + overhead;
    const ppn = (subtotalAfterOverhead * ppnPct) / 100;
    const total = subtotalAfterOverhead + ppn;

    return {
      categoryList: categories,
      directCost: direct,
      overheadNominal: overhead,
      ppnNominal: ppn,
      grandTotal: total,
    };
  }, [items, currentProject]);

  const colors = [
    "#2563EB", "#0D9488", "#F59E0B", "#8B5CF6", "#EC4899",
    "#06B6D4", "#10B981", "#F97316", "#6366F1", "#3B82F6",
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", width: "100%", maxWidth: "1600px", margin: "0 auto" }}>
      {/* 1. TOP STATS CARDS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "14px" }}>
        {/* Card 1: Biaya Langsung */}
        <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "14px", padding: "18px 20px", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#64748B" }}>Biaya Langsung (Real Cost)</span>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#EFF6FF", color: "#2563EB", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Layers size={16} />
            </div>
          </div>
          <div style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", fontVariantNumeric: "tabular-nums" }}>
            {formatCurrencyIDR(directCost)}
          </div>
          <span style={{ fontSize: "11.5px", color: "#94A3B8", marginTop: "4px", display: "block" }}>
            Total dari {items.length} item pekerjaan
          </span>
        </div>

        {/* Card 2: Overhead & Profit */}
        <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "14px", padding: "18px 20px", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#64748B" }}>Overhead & Keuntungan ({(currentProject as any)?.overheadPercent ?? 10}%)</span>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#F0FDF4", color: "#16A34A", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <TrendingUp size={16} />
            </div>
          </div>
          <div style={{ fontSize: "20px", fontWeight: 800, color: "#16A34A", fontVariantNumeric: "tabular-nums" }}>
            {formatCurrencyIDR(overheadNominal)}
          </div>
          <span style={{ fontSize: "11.5px", color: "#94A3B8", marginTop: "4px", display: "block" }}>
            Margin jasa pelaksana & manajemen
          </span>
        </div>

        {/* Card 3: PPN 11% */}
        <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "14px", padding: "18px 20px", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#64748B" }}>PPN 11%</span>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#FEF3C7", color: "#B45309", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ShieldCheck size={16} />
            </div>
          </div>
          <div style={{ fontSize: "20px", fontWeight: 800, color: "#B45309", fontVariantNumeric: "tabular-nums" }}>
            {formatCurrencyIDR(ppnNominal)}
          </div>
          <span style={{ fontSize: "11.5px", color: "#94A3B8", marginTop: "4px", display: "block" }}>
            Pajak pertambahan nilai resmi
          </span>
        </div>

        {/* Card 4: Grand Total RAB */}
        <div style={{ background: "#FFFFFF", color: "#111827", border: "1px solid #E5E7EB", borderRadius: "14px", padding: "18px 20px", boxShadow: "0 1px 3px rgba(15,23,42,0.03)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#64748B" }}>Grand Total RAB Proyek</span>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#EFF6FF", color: "#2563EB", border: "1px solid #DBEAFE", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FileCheck size={16} />
            </div>
          </div>
          <div style={{ fontSize: "21px", fontWeight: 800, color: "#2563EB", fontVariantNumeric: "tabular-nums" }}>
            {formatCurrencyIDR(grandTotal)}
          </div>
          <span style={{ fontSize: "11.5px", color: "#64748B", marginTop: "4px", display: "block" }}>
            Termasuk seluruh pajak & overhead
          </span>
        </div>
      </div>

      {/* 2. REKAPITULASI TABLE & VISUAL WEIGHTS */}
      <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "16px", padding: "24px", boxShadow: "0 1px 4px rgba(15,23,42,0.04)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "18px" }}>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 800, color: "#0F172A", margin: 0 }}>
              Rekapitulasi Rencana Anggaran Biaya (RAB)
            </h3>
            <p style={{ fontSize: "12.5px", color: "#64748B", margin: "4px 0 0 0" }}>
              Rincian bobot dan subtotal biaya konstruksi per divisi WBS proyek
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
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
                <span>Ekspor Rekap</span>
              </button>
            )}
          </div>
        </div>

        {/* Visual Progress Composition Bar */}
        {categoryList.length > 0 && (
          <div style={{ marginBottom: "22px" }}>
            <div style={{ display: "flex", height: "12px", borderRadius: "6px", overflow: "hidden", gap: "2px", background: "#F1F5F9" }}>
              {categoryList.map((cat, idx) => (
                <div
                  key={cat.no}
                  title={`${cat.name}: ${cat.weight.toFixed(2)}%`}
                  style={{
                    width: `${cat.weight}%`,
                    background: colors[idx % colors.length],
                    transition: "width 0.3s ease",
                  }}
                />
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "10px" }}>
              {categoryList.map((cat, idx) => (
                <div key={cat.no} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", color: "#475569" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: colors[idx % colors.length] }} />
                  <span style={{ fontWeight: 600 }}>{cat.name}</span>
                  <span style={{ color: "#94A3B8" }}>({cat.weight.toFixed(1)}%)</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Table */}
        <div style={{ overflowX: "auto", border: "1px solid #E2E8F0", borderRadius: "10px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0", color: "#475569", fontWeight: 700, fontSize: "12px" }}>
                <th style={{ padding: "12px 14px", textAlign: "center", width: "50px" }}>No</th>
                <th style={{ padding: "12px 14px", textAlign: "left" }}>Uraian Kelompok Pekerjaan (WBS)</th>
                <th style={{ padding: "12px 14px", textAlign: "center", width: "100px" }}>Jumlah Item</th>
                <th style={{ padding: "12px 14px", textAlign: "right", width: "180px" }}>Subtotal (Rp)</th>
                <th style={{ padding: "12px 14px", textAlign: "right", width: "110px" }}>Bobot (%)</th>
              </tr>
            </thead>
            <tbody>
              {categoryList.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "36px", textAlign: "center", color: "#94A3B8" }}>
                    Belum ada item pekerjaan di proyek ini.
                  </td>
                </tr>
              ) : (
                categoryList.map((cat) => (
                  <tr key={cat.no} style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "11px 14px", textAlign: "center", color: "#64748B", fontWeight: 600 }}>
                      {cat.no}
                    </td>
                    <td style={{ padding: "11px 14px", fontWeight: 600, color: "#0F172A" }}>
                      {cat.name}
                    </td>
                    <td style={{ padding: "11px 14px", textAlign: "center", color: "#64748B" }}>
                      {cat.count}
                    </td>
                    <td style={{ padding: "11px 14px", textAlign: "right", fontWeight: 700, color: "#0F172A", fontVariantNumeric: "tabular-nums" }}>
                      {formatCurrencyIDR(cat.total)}
                    </td>
                    <td style={{ padding: "11px 14px", textAlign: "right", fontWeight: 600, color: "#2563EB", fontVariantNumeric: "tabular-nums" }}>
                      {cat.weight.toFixed(2)}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {categoryList.length > 0 && (
              <tfoot>
                <tr style={{ background: "#F8FAFC", borderTop: "2px solid #E2E8F0", fontWeight: 700 }}>
                  <td colSpan={3} style={{ padding: "11px 14px", textAlign: "right", color: "#334155" }}>
                    Jumlah Biaya Langsung (A)
                  </td>
                  <td style={{ padding: "11px 14px", textAlign: "right", color: "#0F172A", fontVariantNumeric: "tabular-nums" }}>
                    {formatCurrencyIDR(directCost)}
                  </td>
                  <td style={{ padding: "11px 14px", textAlign: "right", color: "#2563EB" }}>
                    100.00%
                  </td>
                </tr>
                <tr style={{ background: "#FFFFFF", borderTop: "1px solid #F1F5F9", color: "#475569" }}>
                  <td colSpan={3} style={{ padding: "9px 14px", textAlign: "right" }}>
                    Jasa Overhead & Keuntungan Pelaksana (10%) (B)
                  </td>
                  <td style={{ padding: "9px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {formatCurrencyIDR(overheadNominal)}
                  </td>
                  <td style={{ padding: "9px 14px", textAlign: "right", color: "#94A3B8" }}>—</td>
                </tr>
                <tr style={{ background: "#FFFFFF", borderTop: "1px solid #F1F5F9", color: "#475569" }}>
                  <td colSpan={3} style={{ padding: "9px 14px", textAlign: "right" }}>
                    Pajak Pertambahan Nilai (PPN 11%) (C)
                  </td>
                  <td style={{ padding: "9px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {formatCurrencyIDR(ppnNominal)}
                  </td>
                  <td style={{ padding: "9px 14px", textAlign: "right", color: "#94A3B8" }}>—</td>
                </tr>
                <tr style={{ background: "#EFF6FF", borderTop: "2px solid #BFDBFE", fontWeight: 800, fontSize: "14px" }}>
                  <td colSpan={3} style={{ padding: "13px 14px", textAlign: "right", color: "#1E3A8A" }}>
                    TOTAL BIAYA PROYEK (A + B + C)
                  </td>
                  <td style={{ padding: "13px 14px", textAlign: "right", color: "#2563EB", fontVariantNumeric: "tabular-nums" }}>
                    {formatCurrencyIDR(grandTotal)}
                  </td>
                  <td style={{ padding: "13px 14px", textAlign: "right", color: "#2563EB" }}>
                    100.00%
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};
