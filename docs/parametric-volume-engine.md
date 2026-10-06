# EZRAB AI CORE — PARAMETRIC VOLUME ENGINE

## 1. Konsep & Prinsip Deterministik

**Parametric Volume Engine** adalah mesin kalkulasi matematis deterministik yang bertugas mengubah parameter fisik proyek konstruksi (panjang, lebar, tinggi, jumlah ruang, sudut atap, tebal struktur) menjadi volume pekerjaan terukur (Quantity Take-Off / QTO).

### Prinsip Utama:
1. **Zero Hallucination:** Kalkulasi volume tidak pernah dilakukan oleh LLM secara probabilistik, melainkan oleh fungsi TypeScript murni (`quantityRule`).
2. **Safety & Sanity Boundaries:** Engine secara aktif menolak input bernilai negatif, `NaN`, atau `Infinity`.
3. **Traceability:** Setiap kalkulasi menghasilkan `CalculationTrace` langkah-demi-langkah beserta nilai parameter yang disubstitusikan ke dalam rumus.
4. **Opening Deductions:** Luas dinding secara otomatis dikurangi luas bukaan pintu dan jendela (deduction).
5. **Trigonometric Pitch Calculation:** Luas penutup dan rangka atap dihitung berdasarkan proyeksi horizontal dibagi $\cos(\theta)$ kemiringan atap.

---

## 2. Formula Geometri Standar Konstruksi

### A. Galian Tanah Pondasi Trapesium
$$\text{Volume} = L_{\text{pondasi}} \times \left(\frac{W_{\text{top}} + W_{\text{bottom}}}{2}\right) \times H_{\text{galian}}$$

### B. Pasangan Batu Kali Belah
$$\text{Volume} = L_{\text{pondasi}} \times \left(\frac{W_{\text{atas}} + W_{\text{bawah}}}{2}\right) \times H_{\text{pondasi}}$$

### C. Struktur Beton Bertulang (Sloof, Kolom, Ring Balok)
$$\text{Volume Sloof} = L_{\text{sloof}} \times b_{\text{sloof}} \times h_{\text{sloof}}$$
$$\text{Volume Kolom} = N_{\text{titik}} \times (s_{\text{kolom}} \times s_{\text{kolom}} \times H_{\text{dinding}})$$
$$\text{Volume Ring Balok} = L_{\text{balok}} \times b_{\text{balok}} \times h_{\text{balok}}$$

### D. Dinding Bata & Plesteran (Termasuk Deduksi Bukaan)
$$\text{Luas Bersih Dinding} = (L_{\text{dinding total}} \times H_{\text{dinding}}) - A_{\text{bukaan pintu & jendela}}$$
$$\text{Luas Plesteran} = \text{Luas Bersih Dinding} \times 2 \text{ (dua sisi)}$$
$$\text{Luas Acian} = \text{Luas Bersih Dinding} \times 2 \text{ (dua sisi)}$$

### E. Rangka & Penutup Atap
$$\text{Luas Proyeksi} = (W + 2 \times \text{overstek}) \times (L + 2 \times \text{overstek})$$
$$\text{Luas Bidang Miring Atap} = \frac{\text{Luas Proyeksi}}{\cos(\theta_{\text{kemiringan}})}$$

---

## 3. Alur Eksekusi Engine (`generateRABFromTemplate`)

```typescript
const result = parametricVolumeEngine.generateRABFromTemplate({
  templateId: 'template-house-type-36-single-floor',
  parameters: {
    buildingArea: 36,
    buildingWidth: 6,
    buildingLength: 6,
    bedroomCount: 2,
    bathroomCount: 1
  },
  region: 'DKI Jakarta',
  overheadPercentage: 5,
  profitPercentage: 5,
  taxPercentage: 11
});
```

### Output Terstruktur (`TemplateGenerationResult`):
- `templateId`, `templateCode`, `templateName`
- `parametersUsed`, `assumptionsUsed`
- `workItems`: Daftar pekerjaan dengan volume, satuan, AHSP resmi, harga satuan, dan trace.
- `categorySubtotals`: Subtotal per divisi WBS (Persiapan, Tanah, Pondasi, Struktur, Dinding, Finishing, MEP).
- `totalDirectCost`: Total biaya langsung konstruksi.
- `overheadAmount`, `profitAmount`, `taxAmount` (PPN 11%).
- `totalRabCost`: Total anggaran biaya akhir proyek.
- `costPerM2`: Biaya konstruksi per meter persegi luas bangunan.
- `confidenceScore`: Skor keyakinan teknis (0.0 - 1.0).
- `isReadyForSpreadsheet`: Status kelayakan sinkronisasi ke tabel spreadsheet RAB.
