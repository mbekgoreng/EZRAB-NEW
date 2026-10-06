# EZRAB AI CORE — TEMPLATE ASSUMPTION POLICY

## 1. Prinsip Transparansi Asumsi Teknis

Dalam praktek Quantity Surveying dan Estimasi Biaya Konstruksi, setiap perhitungan volume awal yang belum memiliki Gambar DED (Detail Engineering Design) final bertumpu pada **asumsi teknis standar**.

EZRAB AI Core menetapkan aturan wajib:
> **"Dilarang menyembunyikan asumsi teknis di dalam rumus tanpa pencatatan eksplisit dan konfirmasi."**

---

## 2. Struktur Data Asumsi (`TemplateAssumption`)

Setiap asumsi teknis wajib menyimpan atribut berikut:

```typescript
export interface TemplateAssumption {
  assumptionId: string;       // ID unik (contoh: 'wall_height', 'roof_slope_angle')
  label: string;              // Nama manusiawi (contoh: 'Tinggi Dinding Bersih')
  value: number | string | boolean; // Nilai asumsi (contoh: 3.5, 30, '0.8x0.8x0.25')
  unit?: string;              // Satuan (contoh: 'm', 'deg', 'multiplier')
  rationale: string;          // Alasan teknis penetapan nilai
  source: 'SNI' | 'PUPR' | 'BEST_PRACTICE' | 'EMPIRICAL_ESTIMATOR';
  confidence: number;         // 0.0 - 1.0
  editable: boolean;          // Dapat diubah oleh estimator
  requiresConfirmation: boolean; // Mengharuskan konfirmasi sebelum finalisasi
}
```

---

## 3. Kebijakan Nilai Asumsi Standar (Rumah Sederhana & Menengah)

| Kategori Asumsi | Parameter Standar | Nilai Default | Dasar Rujukan / Rationale |
|---|---|---|---|
| Tanah & Pondasi | Lebar galian | 0.80 m | SNI Pondasi Batu Kali 1 Lantai |
| Tanah & Pondasi | Kedalaman galian | 0.80 m | Standar tanah keras dangkal |
| Tanah & Pondasi | Dimensi pondasi batu kali | Atas: 0.3m, Bawah: 0.6m, Tinggi: 0.6m | SNI Trapesium Batu Kali 1:5 |
| Struktur Beton | Dimensi Sloof | 15 cm × 20 cm | Standar perumahan Cipta Karya |
| Struktur Beton | Dimensi Kolom Praktis | 15 cm × 15 cm | Pengaku dinding bata / hebel |
| Struktur Beton | Dimensi Ring Balok | 15 cm × 15 cm | Tumpuan kuda-kuda atap |
| Arsitektur | Tinggi dinding | 3.50 m | Tinggi plafon standar tropis |
| Arsitektur | Bukaan pintu & jendela | 12.0 m² | Deduksi bukaan denah tipe 36/45 |
| Atap | Kemiringan atap genteng | 30 derajat | Standar aliran air hujan genteng metal |
| Atap | Overstek tritisan atap | 0.80 m | Pelindung tampias dinding luar |
| Material | Waste factor pemotongan | 5% (1.05) | Faktor susut empiris estimator |

---

## 4. Alur Kustomisasi Asumsi

1. **Default Mode:** Template menggunakan nilai default SNI / PUPR yang telah diverifikasi.
2. **Override Mode:** Estimator dapat mengirimkan objek `assumptionOverrides` melalui UI atau API `POST /api/templates/:templateId/recalculate`.
3. **Audit Trail:** Setiap modifikasi asumsi dicatat ke dalam calculation trace dan riwayat audit proyek.
