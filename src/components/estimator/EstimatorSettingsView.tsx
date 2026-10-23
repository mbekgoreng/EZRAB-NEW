import React, { useState } from "react";
import {
  Settings,
  Save,
  Check,
  ShieldCheck,
  Percent,
  MapPin,
  FileSpreadsheet,
} from "lucide-react";
import { Project, RabItem } from "../../types";

interface EstimatorSettingsViewProps {
  currentProject: Project | null;
  onUpdateSettings?: (settings: any) => void;
}

export const EstimatorSettingsView: React.FC<EstimatorSettingsViewProps> = ({
  currentProject,
  onUpdateSettings,
}) => {
  const [overheadPercent, setOverheadPercent] = useState<number>(
    (currentProject as any)?.overheadPercent ?? 10
  );
  const [ppnPercent, setPpnPercent] = useState<number>(
    (currentProject as any)?.ppnPercent ?? 11
  );
  const [selectedRegion, setSelectedRegion] = useState<string>(
    (currentProject as any)?.region || "JAWA_TIMUR"
  );
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = () => {
    onUpdateSettings?.({
      overheadPercent,
      ppnPercent,
      region: selectedRegion,
    });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", width: "100%", maxWidth: "1600px", margin: "0 auto" }}>
      {/* 1. HEADER */}
      <div style={{ background: "var(--ez-color-surface)", border: "1px solid var(--ez-color-border-line)", borderRadius: "14px", padding: "18px 20px", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 800, color: "var(--ez-color-text-primary)", margin: 0 }}>
              Pengaturan & Parameter Estimasi Proyek
            </h3>
            <p style={{ fontSize: "12.5px", color: "#64748B", margin: "3px 0 0 0" }}>
              Konfigurasi persentase margin overhead, tarif pajak PPN, dan wilayah proyek (metadata)
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
            <span>{isSaved ? "Tersimpan" : "Terapkan Perubahan"}</span>
          </button>
        </div>
      </div>

      {/* 2. SETTINGS CARDS GRID */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "18px" }}>
        {/* Card 1: Overhead & Keuntungan */}
        <div style={{ background: "var(--ez-color-surface)", border: "1px solid var(--ez-color-border-line)", borderRadius: "14px", padding: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "var(--ez-hue-blue-bg)", color: "var(--ez-hue-blue-text)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Percent size={16} />
            </div>
            <div>
              <h4 style={{ fontSize: "14px", fontWeight: 700, color: "var(--ez-color-text-primary)", margin: 0 }}>
                Overhead & Jasa Kontraktor
              </h4>
              <span style={{ fontSize: "11.5px", color: "#64748B" }}>Persentase margin jasa pelaksanaan</span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <input
              type="number"
              min={0}
              max={50}
              step={0.5}
              value={overheadPercent}
              onChange={(e) => setOverheadPercent(Number(e.target.value))}
              style={{
                width: "100px",
                height: "38px",
                padding: "0 12px",
                borderRadius: "8px",
                border: "1px solid var(--ez-hue-slate-border)",
                fontSize: "14px",
                fontWeight: 700,
                color: "var(--ez-color-text-primary)",
                outline: "none",
              }}
            />
            <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--ez-color-text-slate)" }}>%</span>
          </div>
          <p style={{ fontSize: "11.5px", color: "#94A3B8", marginTop: "8px", margin: 0 }}>
            Standar umum PU / LKPP: 5% - 15% untuk pekerjaan konstruksi sipil & gedung.
          </p>
        </div>

        {/* Card 2: Pajak Pertambahan Nilai (PPN) */}
        <div style={{ background: "var(--ez-color-surface)", border: "1px solid var(--ez-color-border-line)", borderRadius: "14px", padding: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "var(--ez-hue-amber-bg-deep)", color: "var(--ez-hue-amber-text)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ShieldCheck size={16} />
            </div>
            <div>
              <h4 style={{ fontSize: "14px", fontWeight: 700, color: "var(--ez-color-text-primary)", margin: 0 }}>
                Tarif Pajak (PPN)
              </h4>
              <span style={{ fontSize: "11.5px", color: "#64748B" }}>Pajak resmi pengadaan barang & jasa</span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <input
              type="number"
              min={0}
              max={25}
              step={1}
              value={ppnPercent}
              onChange={(e) => setPpnPercent(Number(e.target.value))}
              style={{
                width: "100px",
                height: "38px",
                padding: "0 12px",
                borderRadius: "8px",
                border: "1px solid var(--ez-hue-slate-border)",
                fontSize: "14px",
                fontWeight: 700,
                color: "var(--ez-color-text-primary)",
                outline: "none",
              }}
            />
            <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--ez-color-text-slate)" }}>%</span>
          </div>
          <p style={{ fontSize: "11.5px", color: "#94A3B8", marginTop: "8px", margin: 0 }}>
            Sesuai UU HPP Republik Indonesia, tarif PPN konstruksi adalah 11% (atau 12% bila berlaku).
          </p>
        </div>

        {/* Card 3: Wilayah & Indeks Kemahalan */}
        <div style={{ background: "var(--ez-color-surface)", border: "1px solid var(--ez-color-border-line)", borderRadius: "14px", padding: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "var(--ez-hue-green-bg)", color: "var(--ez-hue-green-text-bright)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <MapPin size={16} />
            </div>
            <div>
              <h4 style={{ fontSize: "14px", fontWeight: 700, color: "var(--ez-color-text-primary)", margin: 0 }}>
                Wilayah Proyek
              </h4>
              <span style={{ fontSize: "11.5px", color: "#64748B" }}>Metadata lokasi proyek</span>
            </div>
          </div>

          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            style={{
              width: "100%",
              height: "38px",
              padding: "0 12px",
              borderRadius: "8px",
              border: "1px solid var(--ez-hue-slate-border)",
              fontSize: "13px",
              color: "var(--ez-color-text-primary)",
              fontWeight: 600,
              background: "var(--ez-color-surface)",
              outline: "none",
            }}
          >
            <option value="JAWA_TIMUR">Jawa Timur (Surabaya, Malang, Sidoarjo)</option>
            <option value="DKI_JAKARTA">DKI Jakarta & Bodetabek</option>
            <option value="JAWA_BARAT">Jawa Barat (Bandung, Cirebon, dll)</option>
            <option value="JAWA_TENGAH">Jawa Tengah & DIY Yogyakarta</option>
            <option value="BALI_NUSA">Bali & Nusa Tenggara</option>
            <option value="SUMATERA">Sumatera (Medan, Palembang, dll)</option>
            <option value="KALIMANTAN">Kalimantan</option>
            <option value="SULAWESI">Sulawesi</option>
            <option value="PAPUA_MALUKU">Papua & Maluku</option>
          </select>
          <p style={{ fontSize: "11.5px", color: "#94A3B8", marginTop: "8px", margin: 0, lineHeight: 1.5 }}>
            Wilayah tersimpan sebagai <strong>metadata proyek</strong> dan saat ini <strong>belum memengaruhi
            harga</strong> — tidak ada pengali koefisien wilayah yang diterapkan. Harga mengikuti sumber
            resmi/referensi per item. (Angka "indeks kemahalan" lama dihapus karena tidak ada perhitungan
            yang mengonsumsinya.)
          </p>
        </div>

        {/* Card 4 (Skema Pembulatan) DIHAPUS dari panel ini: nilainya tersimpan
            tetapi tidak dibaca perhitungan/tampilan mana pun, sehingga kontrolnya
            menyesatkan. Pengaturan pembulatan dikelola di Pengaturan Terpadu. */}
      </div>
    </div>
  );
};
