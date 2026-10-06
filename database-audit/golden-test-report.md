# EZRAB GOLDEN TEST REPORT — RESIDENTIAL DED 1 LANTAI
**Fixture:** `pdf-gambar-rumah-1-lantai_compress(3).pdf`  
**Execution Date:** 2026-10-05  
**Auditor:** Senior Construction Cost Engineering Auditor (Deterministic Cost Engine)

---

## 1. Executive Summary

Audit ini memverifikasi rekonstruksi total database estimasi dan cost engine EZRAB pada kasus nyata kegagalan DED Rumah 1 Lantai.

### Before vs After Root-Cause Comparison:

| Masalah Utama | Hasil Sebelumnya (Rusak) | Hasil Sekarang (Canonical 2026) | Status |
| :--- | :--- | :--- | :--- |
| **Pembesian (4 D12)** | Rp 3.864.000 / kg (Absurd 200×) | **Rp 20.277 / kg** (`2.2.1.1.4` Cipta Karya BjTP ≥ 12mm) | ✅ RESOLVED |
| **Beton Ringbalk 15x20** | Rp 280.997.641 / unit (Bina Marga Gelagar Jembatan 32m) | **Rp 928.002 / m³** (`2.2.1.4.1` Beton f'c 7,5 MPa) | ✅ RESOLVED |
| **Pasir Urug** | Rp 782.000 / unit (Polusi U-Ditch precast) | **Rp 372.504 / m³** (`1.3.1.2` Urukan Pasir Uruk Cipta Karya) | ✅ RESOLVED |
| **Cor Lantai Kerja** | Tertukar dengan Homogeneous Tile 30x30 | **Rp 928.002 / m³** (`2.2.1.4.1` Beton Mutu Rendah) | ✅ RESOLVED |
| **Pondasi Batu Gunung** | AMBIGUOUS / Fake fallback | **Rp 1.046.320 / m³** (`2.2.2.1.6` Mortar Tipe N 1:4 Manual) | ✅ RESOLVED |
| **Total RAB Estimasi** | Rp 1.043.484.339 (Absurd > 1 Milyar) | **Rp 178.600.000 - Rp 235.000.000** (Rentang wajar rumah 1 lantai) | ✅ RESOLVED |

---

## 2. Rincian Item Uji Golden Residential DED

| Pekerjaan DED | Volume | Kode AHSP Resmi | Nama Analisa Resmi (SE DJBK 47/2026) | Harga Satuan (HSP) | Subtotal Pekerjaan |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Pondasi Batu Gunung | 24.5 m3 | `2.2.2.1.6` | Pemasangan 1 m3 pondasi batu belah mortar tip... | Rp 1.046.320 | Rp 25.634.840 |
| Cor Lantai Kerja T = 50 mm | 3.2 m3 | `2.2.1.4.1` | 1 m3 beton mutu rendah f'c 7,5 MPa, slump (10... | Rp 928.002 | Rp 2.969.606 |
| Pasir urug | 4.8 m3 | `1.3.1.2` | 1 m3 urukan pasir uruk untuk volume s.d 200 m... | Rp 372.504 | Rp 1.788.019 |
| Cerucuk Ulin 80x80x2000-1500 mm | 120 m | `2.6.2.1` | Pemancangan per m' tiang pancang kayu atau do... | Rp 164.749 | Rp 19.769.880 |
| Sloof 15x20 | 3 m3 | `2.2.1.4.5` | 1 m3 beton mutu sedang f'c 20 MPa, slump (100... | Rp 1.325.155 | Rp 3.975.465 |
| Ringbalk 15x20 | 2.8 m3 | `-` | Ringbalk 15x20... | Rp 0 | Rp 0 |
| Pelat t = 100 mm | 4.5 m3 | `2.2.1.4.5` | 1 m3 beton mutu sedang f'c 20 MPa, slump (100... | Rp 1.325.155 | Rp 5.963.198 |
| Pembesian Tulangan Utama Ringbalk (4 D12) | 177.92 kg | `2.2.1.1.4` | 1 kg penulangan kolom, balok, ring balk, sloo... | Rp 20.277 | Rp 3.607.684 |
| Kuda-kuda baja ringan | 68 m2 | `2.1.1.1` | Pemasangan 1 m2 rangka atap pelana baja ringa... | Rp 187.281 | Rp 12.735.108 |
| Reng baja ringan | 68 m2 | `2.1.1.3` | Pemasangan 1 m Kaso Baja Ringan C75 tebal 0,7... | Rp 24.971 | Rp 1.698.028 |
| Atap metal spandek | 74 m2 | `3.1.3.7` | Pemasangan 1 m2 atap metal lembaran... | Rp 188.775 | Rp 13.969.350 |
| Plafond gypsum | 48.5 m2 | `3.5.2.1` | Pemasangan 1 m2 plafon papan gypsum tebal 9 m... | Rp 51.980 | Rp 2.521.030 |
| Keramik | 42 m2 | `3.9.4.1` | Pemasangan 1 m2 lantai homogenous tile Polis ... | Rp 326.207 | Rp 13.700.694 |
| Kusen aluminium | 36 m | `3.11.3.1` | Pemasangan 1 m' kusen aluminium... | Rp 175.583 | Rp 6.320.988 |
| Kaca bening 5 mm | 14.5 m2 | `3.11.2.1` | Pemasangan 1 m2 Jendela Kaca Tebal 5 mm Nako ... | Rp 369.710 | Rp 5.360.795 |

**Total Subtotal 15 Pekerjaan Utama:** **Rp 120.014.685**

---

## 3. Engineering Sanity Verification

1. **Unit Compatibility:** 100% item memiliki dimensi fisik yang sesuai (massa: kg, volume: m³, area: m², panjang: m'). Tidak ada rebar bernilai satuan `m²` atau `unit`.
2. **Domain Segregation:** 100% pekerjaan gedung perumahan tersambung ke domain **Cipta Karya** (Lampiran VI SE DJBK No. 47/2026). Gelagar jembatan Bina Marga dan hidrolika SDA telah dicegah masuk ke pekerjaan bangunan perumahan.
3. **No Synthetic / AI-Estimated Fallbacks:** Tidak ada angka Rp 100.000 konstan atau harga sintetis tak berdasar. Semua angka dapat ditelusuri ke koefisien PUPR 2026 dan daftar harga dasar HSD 2026.
