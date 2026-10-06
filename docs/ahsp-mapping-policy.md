# EZRAB AI CORE — AHSP MAPPING POLICY

## 1. Prinsip Integritas AHSP Resmi PUPR 2026

EZRAB AI Core mewajibkan seluruh pemetaan item pekerjaan konstruksi terhubung dengan basis data resmi Analisa Harga Satuan Pekerjaan (AHSP) yang diterbitkan oleh Kementerian PUPR Republik Indonesia.

### Aturan Ketat:
1. **Tidak Ada Kode AHSP Palsu:** Seluruh kode analisis wajib bersumber dari registry resmi Cipta Karya, Bina Marga, atau Sumber Daya Air (SDA) 2026.
2. **Pemisahan Perhitungan:** Volume calculation (QTO) dipisahkan secara tegas dari penentuan harga satuan (AHSP Pricing).
3. **Kandidat AHSP Eksplisit:** Setiap item pekerjaan menyediakan daftar kandidat AHSP (`ahspCandidates`) dengan skor kesesuaian (`matchScore`), alasan pencocokan (`matchRationale`), dan status rekomendasi (`isRecommended`).

---

## 2. Struktur Data Kandidat AHSP (`AHSPCandidate`)

```typescript
export interface AHSPCandidate {
  ahspCode: string;        // Kode unik AHSP (contoh: "A.4.4.1.1")
  name: string;            // Nama resmi pekerjaan
  source: 'CIPTA_KARYA_2026' | 'BINA_MARGA_2026' | 'SDA_2026' | 'CUSTOM';
  unit: string;            // Satuan baku (m2, m3, m1, kg, unit, dll)
  matchScore: number;      // 0 - 100
  matchRationale: string;  // Penjelasan keterkaitan teknis
  isRecommended: boolean;  // Pilihan default engine
  unitPriceEstimate?: number;
}
```

---

## 3. Matriks Pemetaan AHSP Standar Bangunan Rumah (Cipta Karya 2026)

| Divisi Pekerjaan | Kode AHSP Baku | Uraian Resmi AHSP PUPR 2026 | Satuan |
|---|---|---|---|
| Persiapan | `A.2.2.1.9` | Pembersihan dan perataan lapangan | m² |
| Persiapan | `A.2.2.1.1` | Pengukuran dan pemasangan bowplank | m' |
| Tanah | `A.2.3.1.1` | Galian tanah biasa sedalam 1 m | m³ |
| Tanah | `A.2.3.1.11` | Pengurugan pasir urug padat | m³ |
| Tanah | `A.2.3.1.9` | Pengurugan kembali galian tanah | m³ |
| Pondasi | `A.3.2.1.2` | Pasangan pondasi batu belah 1SP : 5PP | m³ |
| Pondasi | `A.3.2.1.9` | Pasangan batu kosong (aanstamping) | m³ |
| Struktur Beton | `A.4.1.1.28` | Pembuatan 1 m3 sloof beton bertulang | m³ |
| Struktur Beton | `A.4.1.1.35` | Pembuatan 1 m3 kolom praktis beton bertulang | m³ |
| Struktur Beton | `A.4.1.1.36` | Pembuatan 1 m3 ring balok beton bertulang | m³ |
| Dinding | `A.4.4.1.1` | Pasangan dinding bata ringan hebel t=10cm mortar | m² |
| Plesteran & Acian | `A.4.4.2.2` | Plesteran 1:5 tebal 15 mm | m² |
| Plesteran & Acian | `A.4.4.2.27` | Acian semen / mortar instan | m² |
| Penutup Lantai | `A.4.4.3.3` | Pasang lantai keramik 40x40 / 50x50 cm | m² |
| Plafon | `A.4.5.1.7` | Plafon gypsum board 9mm rangka hollow | m² |
| Rangka Atap | `A.4.2.1.22` | Rangka atap baja ringan profil C | m² |
| Penutup Atap | `A.4.5.2.32` | Penutup atap genteng metal berpasir | m² |
| Kusen & Pintu | `A.4.6.1.1` | Kusen pintu dan jendela aluminium 4 inch | m' |
| Pengecatan | `A.4.7.1.10` | Pengecatan tembok interior 3 lapis | m² |
| Pengecatan | `A.4.7.1.11` | Pengecatan tembok eksterior weathershield | m² |
| Sanitasi & Air | `A.5.1.1.1` | Pasang kloset duduk porselen monoblok | Unit |
| Instalasi Listrik | `A.6.1.1.1` | Instalasi titik lampu & saklar kabel NYM | Titik |

---

## 4. Penyesuaian Indeks Wilayah (Regional Multipliers)

Harga satuan AHSP dikalikan dengan indeks harga wilayah konstruksi 38 provinsi di Indonesia (basis DKI Jakarta = 1.00):
- **Jawa Barat / Banten:** 0.95 - 0.96
- **Jawa Tengah / DIY:** 0.88 - 0.89
- **Jawa Timur / Bali:** 0.92 - 1.05
- **Sumatera:** 0.95 - 1.12
- **Kalimantan & IKN:** 1.05 - 1.22 (IKN Nusantara: 1.18)
- **Sulawesi:** 1.02 - 1.12
- **Papua & Maluku:** 1.25 - 1.60
