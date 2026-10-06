import React, { useState } from "react";
import {
  FileText,
  Save,
  Check,
  Building,
  CheckCircle2,
  Sparkles,
  Layers,
  Wrench,
  ShieldAlert,
} from "lucide-react";
import { Project, RabItem } from "../../types";

interface EstimatorNotesViewProps {
  currentProject: Project | null;
  items: RabItem[];
  onSaveNotes?: (notes: string) => void;
}

export const EstimatorNotesView: React.FC<EstimatorNotesViewProps> = ({
  currentProject,
  items,
  onSaveNotes,
}) => {
  const [projectNotes, setProjectNotes] = useState<string>(
    (currentProject as any)?.notes ||
      `• Asumsi Mutu Beton Struktur: fc' 20 MPa (K-250) Ready Mix dengan slump 12±2 cm.\n• Rangka Atap: Baja Ringan Kanal C75.075 SNI dengan genteng metal pasir / spandek insulasi.\n• Dinding: Bata Ringan (Hebel) tebal 10 cm dengan mortar instan perekat thinbed dan plesteran 15 mm.\n• Instalasi Elektrikal: Kabel NYM 3x2.5 mm² standar SPLN dengan armature lampu LED downlight dan MCB Box Hager.\n• Plumbing: Pipa PVC tipe AW untuk air bersih dan tipe D untuk air kotor/bekas.`
  );

  const [isSaved, setIsSaved] = useState(false);

  const handleSave = () => {
    onSaveNotes?.(projectNotes);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", width: "100%", maxWidth: "1600px", margin: "0 auto" }}>
      {/* 1. HEADER */}
      <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "14px", padding: "18px 20px", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 800, color: "#0F172A", margin: 0 }}>
              Catatan Teknis, Spesifikasi & Asumsi Konstruksi
            </h3>
            <p style={{ fontSize: "12.5px", color: "#64748B", margin: "3px 0 0 0" }}>
              Dokumentasikan asumsi perhitungan RAB, mutu material, dan instruksi teknis lapangan untuk proyek ini
            </p>
          </div>

          <button
            onClick={handleSave}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 18px",
              borderRadius: "8px",
              background: isSaved ? "#10B981" : "#2563EB",
              color: "#FFFFFF",
              fontSize: "13px",
              fontWeight: 650,
              cursor: "pointer",
              border: "none",
              transition: "all 0.2s ease",
            }}
          >
            {isSaved ? <Check size={16} /> : <Save size={16} />}
            <span>{isSaved ? "Tersimpan" : "Simpan Catatan"}</span>
          </button>
        </div>
      </div>

      {/* 2. MAIN NOTES EDITOR */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "20px" }}>
        <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "16px", padding: "20px", boxShadow: "0 1px 4px rgba(15,23,42,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <FileText size={18} color="#2563EB" />
            <h4 style={{ fontSize: "14px", fontWeight: 700, color: "#0F172A", margin: 0 }}>
              Lembar Catatan Estimator
            </h4>
          </div>

          <textarea
            value={projectNotes}
            onChange={(e) => setProjectNotes(e.target.value)}
            rows={14}
            placeholder="Tuliskan catatan teknis spesifikasi material, metode pelaksanaan, atau asumsi volume di sini..."
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "10px",
              border: "1px solid #CBD5E1",
              fontSize: "13px",
              lineHeight: "1.6",
              color: "#0F172A",
              fontFamily: "var(--ezrab-font-sans)",
              resize: "vertical",
              outline: "none",
            }}
          />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "8px", fontSize: "11.5px", color: "#94A3B8" }}>
            <span>Mendukung teks multi-baris dan poin penjelasan.</span>
            <span>{items.length} item pekerjaan terdata dalam proyek.</span>
          </div>
        </div>

        {/* 3. QUICK SPECIFICATION GUIDE CARDS */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* Card 1: Struktur */}
          <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "12px", padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <Layers size={16} color="#2563EB" />
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#0F172A" }}>Standar Struktur & Pondasi</span>
            </div>
            <p style={{ fontSize: "12px", color: "#64748B", margin: 0, lineHeight: 1.5 }}>
              Kedalaman galian pondasi disesuaikan dengan daya dukung tanah keras setempat (standar min. 0.8m - 1.2m). Mutu baja tulangan ulir BjTS 420B untuk D10 ke atas.
            </p>
          </div>

          {/* Card 2: Arsitektur */}
          <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "12px", padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <Building size={16} color="#0D9488" />
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#0F172A" }}>Standar Finishing Arsitektur</span>
            </div>
            <p style={{ fontSize: "12px", color: "#64748B", margin: 0, lineHeight: 1.5 }}>
              Lantai utama menggunakan Granit Tile 60x60 cm unpolished/polished kualitas Granito/Roman dengan nat epoxy anti-noda di area basah.
            </p>
          </div>

          {/* Card 3: MEP & Sanitasi */}
          <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "12px", padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <Wrench size={16} color="#F59E0B" />
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#0F172A" }}>Standar MEP & Sanitasi</span>
            </div>
            <p style={{ fontSize: "12px", color: "#64748B", margin: 0, lineHeight: 1.5 }}>
              Pipa air bersih menggunakan PVC AW atau PPR PN-10. Septic tank biofilter berkapasitas sesuai jumlah penghuni dan sumur resapan air hujan.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
