import React, { useState, useMemo } from "react";
import {
  Search,
  Calculator,
  Layers,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  Filter,
} from "lucide-react";
import { Project, RabItem } from "../../types";
import { formatCurrencyIDR, formatNumberID } from "../../calculations/decimalEngine";
import { ALL_OFFICIAL_AHSP_ITEMS } from "../../data/nationalCostDatabase/masterRegistry";
import { priceResolver2026 } from "../../data/priceDatabase2026/resolver";

interface EstimatorAhspViewProps {
  currentProject: Project | null;
  items: RabItem[];
  onOpenInspector?: (item: RabItem) => void;
}

export const EstimatorAhspView: React.FC<EstimatorAhspViewProps> = ({
  currentProject,
  items,
  onOpenInspector,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [expandedAhspIds, setExpandedAhspIds] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedAhspIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Extract unique AHSP items from project RAB
  const projectAhspList = useMemo(() => {
    return items.filter((it) => it.code || it.ahspCode || it.ahspSnapshot);
  }, [items]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((it) => {
      if (it.category) set.add(it.category);
    });
    return Array.from(set);
  }, [items]);

  const filteredItems = useMemo(() => {
    return projectAhspList.filter((it) => {
      const matchSearch =
        searchQuery === "" ||
        it.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (it.code && it.code.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (it.ahspCode && it.ahspCode.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchCat = selectedCategory === "ALL" || it.category === selectedCategory;
      return matchSearch && matchCat;
    });
  }, [projectAhspList, searchQuery, selectedCategory]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", width: "100%", maxWidth: "1600px", margin: "0 auto" }}>
      {/* 1. HEADER & FILTER BAR */}
      <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "14px", padding: "18px 20px", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "14px" }}>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 800, color: "#0F172A", margin: 0 }}>
              Analisa Harga Satuan Pekerjaan (AHSP) Proyek
            </h3>
            <p style={{ fontSize: "12.5px", color: "#64748B", margin: "3px 0 0 0" }}>
              Dekomposisi koefisien upah, material, dan alat berstandar SNI / PUPR 2026 yang aktif pada proyek ini
            </p>
          </div>
          <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#2563EB", background: "#EFF6FF", padding: "6px 12px", borderRadius: "8px", border: "1px solid #BFDBFE" }}>
            {projectAhspList.length} Analisa AHSP Terhubung
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: "240px" }}>
            <Search size={15} color="#94A3B8" style={{ position: "absolute", left: "12px", top: "11px" }} />
            <input
              type="text"
              placeholder="Cari kode AHSP atau uraian analisa pekerjaan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                height: "38px",
                paddingLeft: "36px",
                paddingRight: "12px",
                borderRadius: "8px",
                border: "1px solid #CBD5E1",
                fontSize: "13px",
                color: "#0F172A",
                outline: "none",
              }}
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{
              height: "38px",
              padding: "0 14px",
              borderRadius: "8px",
              border: "1px solid #CBD5E1",
              fontSize: "13px",
              color: "#334155",
              fontWeight: 500,
              background: "#FFFFFF",
              outline: "none",
            }}
          >
            <option value="ALL">Semua Kategori ({projectAhspList.length})</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 2. AHSP CARDS LIST */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {filteredItems.length === 0 ? (
          <div style={{ background: "#FFFFFF", border: "1px dashed #CBD5E1", borderRadius: "14px", padding: "40px", textAlign: "center", color: "#64748B" }}>
            <Calculator size={36} color="#94A3B8" style={{ margin: "0 auto 12px" }} />
            <h4 style={{ fontSize: "15px", fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>
              Tidak Ada Analisa Harga Satuan yang Sesuai
            </h4>
            <p style={{ fontSize: "13px", color: "#94A3B8", margin: 0 }}>
              Coba gunakan kata kunci pencarian lain atau pilih kategori yang berbeda.
            </p>
          </div>
        ) : (
          filteredItems.map((item, idx) => {
            const isExpanded = !!expandedAhspIds[item.id];
            const snap = item.ahspSnapshot;
            const code = item.code || item.ahspCode || "A.HSP";
            
            const matchOfficial = ALL_OFFICIAL_AHSP_ITEMS.find(
              (a) => a.code.toLowerCase() === code.toLowerCase() || a.codeNormalized?.toLowerCase() === code.toLowerCase()
            );
            const resolvedOfficial = matchOfficial ? priceResolver2026.resolveAhspUnitPrice(matchOfficial) : null;
            const unitPrice = (item.unitPrice && item.unitPrice > 0) ? item.unitPrice : (resolvedOfficial?.unitPrice ?? (item.unitPrice ?? null));

            const materials = (snap?.materialComponents && snap.materialComponents.length > 0)
              ? snap.materialComponents
              : (resolvedOfficial ? resolvedOfficial.material.components.map((c) => ({ name: c.itemName, unit: c.unit, coefficient: c.coefficient, unitPrice: c.unitPrice })) : []);
            const labors = (snap?.laborComponents && snap.laborComponents.length > 0)
              ? snap.laborComponents
              : (resolvedOfficial ? resolvedOfficial.labor.components.map((c) => ({ name: c.itemName, unit: c.unit, coefficient: c.coefficient, unitPrice: c.unitPrice })) : []);
            const equipments = (snap?.equipmentComponents && snap.equipmentComponents.length > 0)
              ? snap.equipmentComponents
              : (resolvedOfficial ? resolvedOfficial.equipment.components.map((c) => ({ name: c.itemName, unit: c.unit, coefficient: c.coefficient, unitPrice: c.unitPrice })) : []);

            return (
              <div
                key={item.id}
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #E2E8F0",
                  borderRadius: "14px",
                  overflow: "hidden",
                  boxShadow: "0 1px 3px rgba(15,23,42,0.03)",
                  transition: "border-color 0.2s ease",
                }}
              >
                {/* Header Row */}
                <div
                  onClick={() => toggleExpand(item.id)}
                  style={{
                    padding: "16px 20px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                    background: isExpanded ? "#F8FAFC" : "#FFFFFF",
                    borderBottom: isExpanded ? "1px solid #E2E8F0" : "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0, flex: 1 }}>
                    <button
                      type="button"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#64748B",
                        padding: 0,
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </button>
                    <span
                      style={{
                        fontFamily: "var(--ezrab-font-mono)",
                        fontWeight: 750,
                        fontSize: "12px",
                        color: "#2563EB",
                        background: "#EFF6FF",
                        padding: "3px 8px",
                        borderRadius: "5px",
                        border: "1px solid #BFDBFE",
                        flexShrink: 0,
                      }}
                    >
                      {code}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.description}
                      </div>
                      <div style={{ fontSize: "11.5px", color: "#64748B", marginTop: "2px" }}>
                        Kategori: {item.category} • Satuan: <strong>{item.unit || "m²"}</strong> • Sumber:{" "}
                        {snap?.sourceDocument || "Permen PUPR No. 1/PRT/M/2022"}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "16px", flexShrink: 0, marginLeft: "12px" }}>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: "11px", color: "#64748B", display: "block" }}>Harga Satuan (HSP)</span>
                      <span style={{ fontSize: "15px", fontWeight: 800, color: "#0F172A", fontVariantNumeric: "tabular-nums" }}>
                        {formatCurrencyIDR(unitPrice)} <span style={{ fontSize: "11.5px", color: "#64748B" }}>/ {item.unit}</span>
                      </span>
                    </div>

                    {onOpenInspector && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenInspector(item);
                        }}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "7px",
                          border: "1px solid #CBD5E1",
                          background: "#FFFFFF",
                          color: "#2563EB",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <span>Rincian</span>
                        <ExternalLink size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Decomposition Table */}
                {isExpanded && (
                  <div style={{ padding: "18px 20px", background: "#FFFFFF" }}>
                    {materials.length === 0 && labors.length === 0 && equipments.length === 0 ? (
                      <div style={{ padding: "16px", background: "#F8FAFC", borderRadius: "8px", fontSize: "12.5px", color: "#64748B", textAlign: "center" }}>
                        Dekomposisi koefisien AHSP mengacu pada standar umum analisa satuan nasional. Klik tombol <strong>Rincian</strong> untuk melihat atau menyesuaikan koefisien bahan dan upah di Work Item Inspector.
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                        {/* Labor Component Table */}
                        {labors.length > 0 && (
                          <div>
                            <div style={{ fontSize: "12px", fontWeight: 700, color: "#1E293B", marginBottom: "6px" }}>
                              A. Tenaga Kerja (Upah)
                            </div>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                              <thead>
                                <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0", color: "#64748B" }}>
                                  <th style={{ padding: "6px 8px", textAlign: "left" }}>Uraian Tenaga Kerja</th>
                                  <th style={{ padding: "6px 8px", textAlign: "center", width: "80px" }}>Satuan</th>
                                  <th style={{ padding: "6px 8px", textAlign: "right", width: "100px" }}>Koefisien</th>
                                  <th style={{ padding: "6px 8px", textAlign: "right", width: "130px" }}>Harga Satuan (Rp)</th>
                                  <th style={{ padding: "6px 8px", textAlign: "right", width: "140px" }}>Subtotal (Rp)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {labors.map((l, lIdx) => (
                                  <tr key={lIdx} style={{ borderBottom: "1px solid #F1F5F9" }}>
                                    <td style={{ padding: "6px 8px", color: "#0F172A", fontWeight: 500 }}>{l.name}</td>
                                    <td style={{ padding: "6px 8px", textAlign: "center", color: "#64748B" }}>{l.unit}</td>
                                    <td style={{ padding: "6px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatNumberID(l.coefficient, 4)}</td>
                                    <td style={{ padding: "6px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{l.unitPrice === null || l.unitPrice === undefined ? "—" : l.unitPrice.toLocaleString("id-ID")}</td>
                                    <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600, color: "#0F172A", fontVariantNumeric: "tabular-nums" }}>
                                      {formatCurrencyIDR(l.unitPrice === null || l.unitPrice === undefined ? null : (l.coefficient || 0) * l.unitPrice)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Material Component Table */}
                        {materials.length > 0 && (
                          <div>
                            <div style={{ fontSize: "12px", fontWeight: 700, color: "#1E293B", marginBottom: "6px" }}>
                              B. Bahan / Material
                            </div>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                              <thead>
                                <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0", color: "#64748B" }}>
                                  <th style={{ padding: "6px 8px", textAlign: "left" }}>Uraian Bahan</th>
                                  <th style={{ padding: "6px 8px", textAlign: "center", width: "80px" }}>Satuan</th>
                                  <th style={{ padding: "6px 8px", textAlign: "right", width: "100px" }}>Koefisien</th>
                                  <th style={{ padding: "6px 8px", textAlign: "right", width: "130px" }}>Harga Satuan (Rp)</th>
                                  <th style={{ padding: "6px 8px", textAlign: "right", width: "140px" }}>Subtotal (Rp)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {materials.map((m, mIdx) => (
                                  <tr key={mIdx} style={{ borderBottom: "1px solid #F1F5F9" }}>
                                    <td style={{ padding: "6px 8px", color: "#0F172A", fontWeight: 500 }}>{m.name}</td>
                                    <td style={{ padding: "6px 8px", textAlign: "center", color: "#64748B" }}>{m.unit}</td>
                                    <td style={{ padding: "6px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatNumberID(m.coefficient, 4)}</td>
                                    <td style={{ padding: "6px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{m.unitPrice === null || m.unitPrice === undefined ? "—" : m.unitPrice.toLocaleString("id-ID")}</td>
                                    <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600, color: "#0F172A", fontVariantNumeric: "tabular-nums" }}>
                                      {formatCurrencyIDR(m.unitPrice === null || m.unitPrice === undefined ? null : (m.coefficient || 0) * m.unitPrice)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
