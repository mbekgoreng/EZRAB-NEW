# EZRAB — CANONICAL DATABASE MAP
**Version:** 2026.1  
**Authority:** SE DJBK No. 47/SE/Dk/2026  
**Generated Date:** 2026-10-05  

---

## 1. Peta File & Komponen Kanonikal

| Komponen Arsitektur | File Sumber Kanonikal | Peran & Tanggung Jawab |
| :--- | :--- | :--- |
| **Katalog AHSP Resmi** | \`src/data/nationalCostDatabase/officialAhspRepository.ts\` | 5.768 analisa resmi SE DJBK No. 47/2026 (Cipta Karya, Bina Marga, SDA, SMKK). Tanpa harga flat; menyimpan koefisien & relasi komponen. |
| **Database Harga 2026** | \`src/data/priceDatabase2026/resolver.ts\` & \`priceMaster.generated.ts\` | Master harga bahan, tenaga, dan sewa alat 2026 berdasar wilayah (Nasional, Provinsi, Kota). |
| **Registry Satuan Kanonikal** | \`src/engine/pricing/canonical/canonicalUnitRegistry.ts\` | Pemetaan dimensi fisik 100% ketat (Massa, Volume, Luas, Panjang, Cacah, Waktu Kerja). Memblokir konversi ilegal (misal: kg ke unit). |
| **Master Material Standar** | \`src/engine/pricing/canonical/canonicalMaterialMaster.ts\` | 24 material konstruksi baku Indonesia dengan batas harga wajar dan spesifikasi teknis. |
| **Source Governance Registry** | \`src/engine/pricing/canonical/sourceRegistry.ts\` | Metadata hukum sumber data (Lampiran II, III, IV, V, VI SE DJBK 47/2026 & SSH Daerah). |
| **Price Sanity Validator** | \`src/engine/pricing/canonical/priceSanityValidator.ts\` | Detektor anomali harga fisik: menolak harga absurd (besi > Rp 45k/kg, beton > Rp 3,5M/m3). |
| **Canonical Price Resolver** | \`src/engine/pricing/canonical/canonicalPriceResolver.ts\` | **Single Source of Truth** resolusi harga untuk semua modul: Project Override ➔ Official Price ➔ Region ➔ Period ➔ Reference ➔ Fail-Closed. |
| **Deterministic Cost Engine** | \`src/engine/pricing/canonical/canonicalCostEngine.ts\` | Kalkulator deterministik: \`koefisien × harga\`, \`SUM(komponen) + overhead\`, \`volume × HSP\`. |
| **RAB Quality Gate & Sanity** | \`src/engine/pricing/canonical/rabSanityEngine.ts\` | 7-Stage Pre-Commit Audit: Unit, Price, Coeff, Magnitude, Duplicate, Source, Missing. Menentukan status \`VALID\` vs \`NEEDS_REVIEW\`. |

---

## 2. Struktur Data Hubungan Relasional

```
[AHSP Item (officialAhspRepository)]
       │
       ├── Code: e.g. "2.2.1.1.4"
       ├── Title: "1 kg penulangan kolom, balok, ring balk..."
       ├── Unit: "kg" (Dimension: MASS)
       ├── Domain: "CIPTA_KARYA"
       │
       └── Components[]
             ├── Material: Besi Beton Polos (Koef: 1.0500, Unit: kg)
             │        └── Price Resolver ──▶ Rp 14.500 / kg (HSD CK 2026) ──▶ Biaya: Rp 15.225
             ├── Material: Kawat Beton (Koef: 0.0150, Unit: kg)
             │        └── Price Resolver ──▶ Rp 22.000 / kg (HSD CK 2026) ──▶ Biaya: Rp 330
             ├── Labor: Pekerja (Koef: 0.0070, Unit: OH)
             │        └── Price Resolver ──▶ Rp 120.000 / OH ──▶ Biaya: Rp 840
             ├── Labor: Tukang Besi (Koef: 0.0070, Unit: OH)
             │        └── Price Resolver ──▶ Rp 150.000 / OH ──▶ Biaya: Rp 1.050
             └── Labor: Kepala Tukang & Mandor (Koef: 0.0007 / 0.0004)
                      └── Price Resolver ──▶ Biaya: Rp 120 + Rp 70
       │
       └── Subtotal Langsung = Rp 17.635
       └── Overhead & Keuntungan (15%) = Rp 2.645
       └── HARGA SATUAN PEKERJAAN (HSP) = Rp 20.280 / kg
```

---

## 3. Kebijakan Anti-Polusi Data (Data Hygiene Policies)

1. **Pemisahan Domain Wajib:**
   - Pencarian pekerjaan arsitektur dan struktur perumahan tidak boleh menyertakan item dari domain Bina Marga atau SDA kecuali jika Cipta Karya tidak memiliki item yang setara.
2. **Pencegahan Bongkaran:**
   - Item analisa pembongkaran (\`1.6.x\`, kata kunci *bongkar*, *pembongkaran*) secara otomatis disaring keluar dari kueri pekerjaan baru.
3. **Pemberian Status Fail-Closed:**
   - Jika item tidak ditemukan di database resmi maupun referensi, statusnya adalah \`MISSING\` dan harganya \`null\` / \`0\` dengan tanda \`NEEDS_REVIEW\`. Tidak ada angka perkiraan buatan yang dijadikan angka final.
