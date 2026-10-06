# EZRAB — ARCHITECTURE AUDIT REPORT
**Domain:** Estimating Database, Price Resolution, and Cost Engine Reconstruction  
**Standard Authority:** SE DJBK No. 47/SE/Dk/2026 (Kementerian PU)  
**Execution Date:** 2026-10-05  

---

## 1. Latar Belakang & Akar Masalah (Root Causes)

Audit forensik terhadap codebase EZRAB menemukan beberapa kelemahan fundamental pada pipeline lama yang menyebabkan angka-angka absurd pada estimasi proyek nyata (seperti pembesian Rp 3,8 juta/kg dan balok beton Rp 280 juta/unit):

1. **Pencemaran Lintas Domain (Cross-Domain Pollution):**
   - AHSP jembatan berat Bina Marga (Lampiran V, kode `7.2.(1a)`: Gelagar Jembatan Beton Pratekan 32 meter seharga Rp 280.997.641) terpilih untuk pekerjaan perumahan sederhana (`Ringbalk 15x20`).
   - Penyebab: Tidak ada pemisahan domain tegas antara Cipta Karya (gedung/perumahan), Bina Marga (jalan/jembatan), dan SDA (irigasi/bendung).

2. **Hilangnya Kelas Satuan Massa (\`kg\` / \`ton\`):**
   - Dalam normalisasi satuan lama, satuan \`kg\` terlewat dari pemetaan kelas dimensi, sehingga dianggap kompatibel dengan \`buah\`/\`unit\`. Akibatnya, kueri tulangan dibiarkan mencocokkan item per unit atau terhubung ke harga salah.

3. **Silent Hardcoded Fallback (Rp 100.000 / AI_ESTIMATED):**
   - Pada \`src/ded-rab-v2/resolution/priceResolutionEngine.ts\` (baris 80) dan \`src/ded-rab-v3/pricing/dedPriceResolutionEngine.ts\` (tabel baris 171–220), ketika pencarian harga tidak menemukan hasil, sistem secara diam-diam menghasilkan angka konstan (Rp 100.000 atau Rp 75.000) dan menamakannya \`AI_ESTIMATED\`.
   - Hal ini melanggar prinsip kebenaran engineering: ketidaktahuan disamarkan menjadi kepastian palsu.

4. **Kekeliruan Normalisasi Kata Kunci:**
   - \`constructionNormalizer.ts\` mencocokkan setiap string yang memuat kata \`lantai\` sebagai pekerjaan finishing lantai keramik (\`CERAMIC_TILE_FLOOR\`). Akibatnya, \`Cor Lantai Kerja T = 50 mm\` tertukar dengan keramik homogen 30x30 cm.

---

## 2. Arsitektur Baru (Single Source of Truth)

Sistem baru merekonstruksi hierarki pemisahan tugas secara deterministik:

```
[DED / Gambar Kerja]
        │
        ▼ (Vision & Evidence Reader)
[Work Item Specification & Unit]
        │
        ▼ (Canonical Unit Gate)
[Canonical Unit Registry] ──▶ Rejects invalid dimensions (kg ≠ m2, m3 ≠ unit)
        │
        ▼ (Domain-Segregated Semantic Matcher)
[Official AHSP Repository 2026] (Cipta Karya Preferred for Building Works)
        │
        ▼ (Single Canonical Price Resolver)
[Canonical Price Resolver]
   ├── Tier 1: Project Overrides (Active Project Only)
   ├── Tier 2: Exact Official Prices (SE DJBK 47/2026)
   ├── Tier 3: Regional Prices (Provincial Standards)
   ├── Tier 4: Period Match (2026 Alignment)
   ├── Tier 5: National Reference Benchmarks
   └── Tier 6: MISSING (Fail-Closed, Zero Hallucinations)
        │
        ▼ (Anti-Absurd Price Sanity Gate)
[Price Sanity Validator] ──▶ Rejects rebar > Rp 45k/kg, concrete > Rp 3.5M/m3
        │
        ▼ (Deterministic Cost Engine)
[Canonical Cost Engine]
   ├── componentCost = coefficient × componentUnitPrice
   ├── AHSP = SUM(componentCost) + Overhead
   └── workTotal = volume × AHSPUnitPrice
        │
        ▼ (7-Stage Pre-Commit Quality Gate)
[RAB Sanity Engine]
   ├── UNIT CHECK
   ├── PRICE CHECK
   ├── COEFFICIENT CHECK
   ├── MAGNITUDE CHECK
   ├── DUPLICATE CHECK
   ├── SOURCE CHECK
   └── MISSING CHECK
        │
   [Status: VALID / NEEDS_REVIEW / DRAFT]
        │
        ▼
[Spreadsheet Commit / User Review]
```

---

## 3. Ketertelusuran Penuh (Audit Traceability)

EZRAB kini mampu menjawab secara matematis dan hukum pertanyaan:
**"Angka Rp X ini berasal dari mana?"**

Setiap baris RAB menyimpan:
- **Kode & Nama Analisa Resmi:** Sesuai SE DJBK No. 47/SE/Dk/2026.
- **Rincian Komponen:** Koefisien bahan, upah tenaga kerja, dan peralatan.
- **Harga Satuan Komponen:** Berdasarkan DHSP / HSD 2026 resmi.
- **Perhitungan Deterministik:** Volume × HSP tanpa keterlibatan interpolasi AI pada angka akhir.
