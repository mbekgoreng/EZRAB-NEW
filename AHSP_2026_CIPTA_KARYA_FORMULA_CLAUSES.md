# Klausul Rumus AHSP 2026 — Bidang Cipta Karya

Sumber: **SE Bina Konstruksi No. 47/SE/Dk/2026**, workbook `ahsp bina kontruksi 2026.xlsx`
(Lampiran VI). Dokumen ini mencatat klausul rumus persis seperti di Excel, supaya
cara EZRAB menghitung Harga Satuan Pekerjaan transparan dan bisa diaudit.

## 1. Tabel acuan harga — sheet `Upah Bahan` (named range `upahbahan`)

Satu-satunya sumber harga resmi di workbook ini:

| Seksi | Kode | Isi |
|---|---|---|
| I. UPAH | `L.xx` | Harga satuan upah tenaga kerja (satuan OH/hari) |
| II. MATERIAL | `M.xx` | Harga satuan bahan/material |
| III. SEWA PERALATAN | (nomor) | Harga sewa peralatan |

Di EZRAB, ketiga tabel ini tersimpan di
`src/data/nationalCostDatabase/officialCiptaKaryaPrices2026.ts`
(`OFFICIAL_CK_2026_LABOR` / `_MATERIALS` / `_EQUIPMENT`) — **nilainya wajib sama
persis dengan kolom HARGA SATUAN sheet Upah Bahan.**

## 2. Klausul per baris komponen (sheet analisa, mis. `Persiapan`, `Beton`, …)

Setiap baris komponen analisa memakai dua rumus ini:

```
Harga Satuan  = VLOOKUP(Kode, upahbahan, 3, FALSE)   → kolom H
Jumlah Harga  = Koefisien × Harga Satuan              → kolom J  (= G × H)
```

Artinya: harga **tidak pernah diketik manual** di sheet analisa — selalu diambil
dari tabel Upah Bahan lewat kode (`L.xx` / `M.xx` / nomor alat). Kalau harga di
tabel berubah, seluruh analisa ikut berubah otomatis.

## 3. Klausul agregasi per item pekerjaan

```
A. TENAGA KERJA   : Jumlah A = Σ Jumlah Harga baris tenaga        (= SUM(J8:J12))
B. BAHAN          : Jumlah B = Σ Jumlah Harga baris bahan
C. PERALATAN      : Jumlah C = Σ Jumlah Harga baris alat
D. Jumlah (A+B+C) : D = A + B + C                                 (= J13+J23+J25)
E. Biaya Umum & Keuntungan : E = D × tarif overhead               (= J26 × $Q$8)
F. Harga Satuan Pekerjaan  : F = D + E                            (= SUM(J26:J27))
```

- Tarif overhead mengacu ke sel overhead tiap sheet analisa (contoh `$Q$8 = 0.1`
  = 10%; label resmi: *"Biaya Umum dan Keuntungan 10%-15% x D"*).
- **Harga Satuan Pekerjaan yang ditampilkan dibulatkan ke bawah ke rupiah penuh:**

```
HSP tampil = ROUNDDOWN(F, 0)
```

## 4. Keterkaitan sheet DHSP — `Daftar Harga Satuan Pekerjaan`

Sheet DHSP tidak menghitung sendiri; ia me-referensikan sheet analisa:

```
Kode    = <SheetAnalisa>!Cx          (contoh: =Persiapan!C5)
Uraian  = VLOOKUP(Kode, <Sheet>!C:M, 2, FALSE)
Satuan  = literal dari analisa
Harga   = VLOOKUP(Uraian, <Sheet>!$D$5:$K$679, 8, FALSE)   → HSP hasil ROUNDDOWN
```

Kolom F/G DHSP membandingkan dengan SE sebelumnya (SE 128/SE/Dk/2025 dan
SE 30/SE/Dk/2025); kolom K/L mencatat status ("Revisi" / "tidak ada perubahan").

## 5. Cara EZRAB menerapkan klausul ini

1. **Harga** — di-resolve saat runtime dari `OFFICIAL_CK_2026_*` lewat
   `src/data/priceDatabase2026/resolver.ts` (sourceKey `CK_HSD_2026`, prioritas 1).
   Harga yang hilang = `null`, **tidak pernah** diubah menjadi 0.
2. **Koefisien** — dari katalog kanonis
   (`src/data/nationalCostDatabase/ahsp2026Canonical.generated.ts`, price-free by design).
3. **Jumlah per komponen** = koefisien × harga satuan (klausul §2).
4. **Overhead** mengikuti tarif tiap analisa (§3); default acuan 10%.
5. **HSP final** = `ROUNDDOWN(D + E, 0)` (§3).

Audit sinkronisasi harga terakhir: `AHSP_2026_CK_PRICE_AUDIT_2026-10-08.md`.
