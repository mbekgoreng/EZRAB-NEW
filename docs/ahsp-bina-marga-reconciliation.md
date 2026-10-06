# Rekonsiliasi AHSP Bina Marga — Dataset Repo vs Lampiran II SE DJBK No. 47/SE/Dk/2026

Dibuat: 2026-09-27T08:41:24.354Z

Sumber resmi: `Lampiran-II-SE-DJBK-No-47-Tahun-2026-AHSP-Bidang-Bina-Marga.pdf`
(3.125 halaman, teks asli, diekstrak dengan rekonstruksi baris berbasis koordinat).

Dataset repo: `src/data/nationalCostDatabase/binaMargaAHSPDataset.ts`

> Laporan ini **tidak mengubah** dataset apa pun. Setiap angka dapat direproduksi
> dengan `npx tsx scripts/reconcileBinaMarga.ts`.

## 1. Ringkasan

| Metrik | Repo | Dokumen resmi |
|---|---|---|
| Jumlah item | 1144 | 1118 |
| Item dengan tabel analisa (koefisien) | — | 986 |
| Item dengan harga satuan resmi | — | 980 |
| Total baris komponen | 6159 | 9.813 |
| Nama komponen placeholder | 1488 (24.2%) | 0 |
| sourcePage dapat diverifikasi | 0 | 1118 |
| Harga satuan DISTINCT | **10** | 980+ |
| Koefisien DISTINCT (TENAGA) | **17** | 789 |
| Koefisien DISTINCT (BAHAN) | **14** | 1070 |
| Koefisien DISTINCT (PERALATAN) | **16** | 701 |
| Label status | 1144 × VERIFIED | — |
| dataQualityScore = 100 | 1144 | — |

## 2. Pencocokan

| Kelas | Jumlah | % |
|---|---|---|
| Cocok kuat via kode + nama (sim ≥ 0,35) | 1087 | 95.0% |
| Nama lemah / hanya cocok nama | 34 | 3.0% |
| Tidak ditemukan di dokumen resmi | 23 | 2.0% |

## 2b. Keragaman nilai — bukti bahwa dataset repo bukan hasil ekstraksi

Dari **1144** item repo, hanya terdapat **10 harga satuan berbeda**. **1143** item (99.9%) memakai ulang satu dari sepuluh nilai itu. Contohnya: **744 item (65%)** semuanya berharga satuan **Rp 149.875**, dan **221 item (19,3%)** semuanya berharga **Rp 1.450.000**.

Di tingkat komponen, repo hanya memiliki **17** koefisien tenaga, **14** koefisien bahan, dan **16** koefisien peralatan — total **47** nilai. Dokumen resmi memiliki **2560** nilai berbeda.

Tabel perbandingan:

| Jenis | Repo (distinct) | Resmi (distinct) | Rasio |
|---|---|---|---|
| Harga satuan item | 10 | 980+ | 0.010 |
| Koefisien TENAGA | 17 | 789 | 0.022 |
| Koefisien BAHAN | 14 | 1070 | 0.013 |
| Koefisien PERALATAN | 16 | 701 | 0.023 |

> **Ini bukan perbedaan kecil.** Jika dataset repo benar-benar diekstraksi dari dokumen resmi, distribusi koefisiennya harus meniru distribusi dokumen — bukan menyusut dari 2.560 menjadi 47 nilai.

## 3. Komponen — temuan utama

Dari 6159 baris komponen di dataset repo, hanya **409** (6.6%) yang namanya cocok **ketat** dengan tabel analisa resmi untuk kode yang sama (nama persis sama, atau kesamaan token ≥ 0,6).

Dengan pencocokan **longgar** (satu nama mengandung nama lain, mis. "Semen" ↔ "Semen Portland") jumlahnya 2895 (47.0%). Kedua angka dilaporkan supaya tidak ada klaim yang bergantung pada metode pencocokan yang menguntungkan.

**943 dari 1144 item (82.4%) tidak memiliki satu pun nama komponen yang cocok dengan dokumen resmi.**

1488 baris (24.2%) memakai nama placeholder generik seperti "Material & Bahan Standar Pekerjaan", "Peralatan Bantu / Mekanis", dan "Bahan / Material Standar".

Contoh 15 item dengan nol kecocokan nama komponen:

| Kode | Nama repo | Komponen repo | Komponen resmi | Nama cocok |
|---|---|---|---|---|
| `1.7` | Pembayaran Bersyarat (Provisional Sums) Provis | 4 | 0 | 0 |
| `1.13.(1)` | Building Information Modelling (BIM) | 4 | 0 | 0 |
| `1.20.(1)` | Pengeboran, termasuk SPT dan Laporan | 4 | 0 | 0 |
| `1.20.(2)` | Sondir termasuk Laporan | 4 | 0 | 0 |
| `1.20.(3)` | DCP-CBR termasuk Laporan | 4 | 0 | 0 |
| `A.7` | Sistem Manajemen Keselamatan Konstruksi (SMKK) | 4 | 0 | 0 |
| `2.2.(1)` | Pasangan Batu dengan Mortar | 4 | 13 | 0 |
| `2.2.(2)` | Pasangan Batu dengan Mortar DS-2 | 4 | 10 | 0 |
| `2.2.(3)` | Pasangan Batu dengan Mortar DS-4 | 4 | 12 | 0 |
| `2.2.(4)` | Pasangan Batu dengan Mortar DS-5 | 4 | 12 | 0 |
| `2.2.(5)` | Pasangan Batu dengan Mortar DS-5 dengan Subdra | 4 | 15 | 0 |
| `2.2.(6)` | Pasangan Batu dengan Mortar DS-6 | 4 | 12 | 0 |
| `2.2.(7)` | Pasangan Batu dengan Mortar DV-10 | 4 | 12 | 0 |
| `2.3.(1)` | Gorong-gorong Pipa Beton Tanpa Tulangan diamet | 10 | 12 | 0 |
| `2.3.(2)` | Gorong-gorong Pipa Beton Tanpa Tulangan diamet | 10 | 12 | 0 |

## 4. Satuan

Dari 1095 item yang dapat dibandingkan: **462** satuannya identik, **582** (53.2%) hanya berbeda notasi (mis. `bh` vs `Buah`, `m1` vs `M'`) sehingga setara, dan **44** (4.0%) benar-benar berbeda satuan.

Alias satuan yang belum dikenali pemetaan: **7**. Angka ini dilaporkan apa adanya, bukan dianggap setara maupun berbeda — keduanya akan menjadi klaim tanpa dasar.

Catatan: 582 selisih notasi tetap harus diseragamkan sebelum dipakai engine, karena pencocokan satuan (`m3` vs `M3`) adalah penyebab bug underpricing zak/kg yang ditemukan pada audit Phase 0.

Contoh satuan yang benar-benar berbeda (bukan sekadar notasi):

| Kode | Nama repo | Satuan repo | Satuan resmi |
|---|---|---|---|
| `3.5.(1a)` | Geotekstil Filter untuk Drainase Bawah Per | m2 | M' |
| `3.5.(1b)` | Geotekstil Filter untuk Drainase Bawah Per | m2 | M' |
| `3.5.(2a)` | Geotekstil Separator Kelas 4A INFORMATIF | m2 | Ton |
| `3.5.(2b)` | Geotekstil Separator Kelas 1 | m2 | Buah |
| `3.5.(2c)` | Geotekstil Separator Kelas 2 | m2 | Buah |
| `3.5.(2d)` | Geotekstil Separator Kelas 3 | m2 | Buah |
| `3.5.(3a)` | Geotekstil Stabilisasi Tanah Kelas 4A | m2 | M3 |
| `3.5.(3b)` | Geotekstil Stabilisasi Tanah Kelas 1 | m2 | M3 |
| `3.5.(3c)` | Geotekstil Stabilisasi Tanah Kelas 2 | m2 | M3 |
| `3.5.(3d)` | Geotekstil Stabilisasi Tanah Kelas 3 | m2 | M3 |
| `3.6.(1)` | Penyalir Vertikal Pra-Fabrikasi (Prefabric | m1 | Buah |
| `3.6.(2)` | Penyalir Vertikal Pra-Fabrikasi (Prefabric | m1 | Buah |
| `3.8.(1)` | Penyalir Horizontal Pra-Fabrikasi (Prefabr | m1 | Buah |
| `7.11.(3)` | Sambungan Siar Muai Tipe Strip Seal | m1 | M3 |
| `7.11.(4)` | Sambungan Siar Muai Tipe Compression Seal | m1 | M3 |

## 5. Harga satuan

Dibandingkan: **1000** item (item repo dengan "unitPrice" > 0 dan dokumen resmi dengan harga satuan).

| Metrik rasio repo ÷ resmi | Nilai |
|---|---|
| minimum | 0.001 |
| p10 | 0.016 |
| median | 0.348 |
| p90 | 3.828 |
| maksimum | 1341.040 |
| selisih ≤ 1% | 2 (0.2%) |
| selisih ≤ 10% | 26 (2.6%) |
| meleset > 10× | 321 |

20 penyimpangan harga terbesar:

| Kode | Nama repo | Harga repo | Harga resmi | Rasio | Halaman resmi |
|---|---|---|---|---|---|
| `7.4.(5)` | Pengangkutan Elemen Baja Struktur yang | 1.450.000 | 1.081,25 | 1341.0405× | 1152 |
| `10.2.(1b)` | Pembersihan Struktur Bangunan Atas Jem | 1.450.000 | 5.825,83 | 248.8916× | 3079 |
| `10.2.(1c)` | Pembersihan Struktur Bangunan Atas Jem | 1.450.000 | 6.463,1 | 224.3505× | 3081 |
| `10.2.(1a)` | Pembersihan Struktur Bangunan Atas Jem | 1.450.000 | 7.419,01 | 195.4439× | 3077 |
| `10.2.(2c)` | Pembersihan Struktur Bangunan Atas Jem | 1.450.000 | 7.737,65 | 187.3954× | 3087 |
| `10.2.(3)` | Pembersihan Struktur Bangunan Atas Jem | 1.450.000 | 7.737,65 | 187.3954× | 3089 |
| `10.2.(4)` | Pembersihan Struktur Bangunan Atas Jem | 1.450.000 | 8.374,92 | 173.136× | 3091 |
| `10.2.(2a)` | Pembersihan Struktur Bangunan Atas Jem | 1.450.000 | 9.012,19 | 160.8932× | 3083 |
| `7.4.(9)` | Struktur Jembatan Darurat (Bailey, Acr | 1.450.000 | 9.823,01 | 147.6126× | 1162 |
| `10.2.(2b)` | Pembersihan Struktur Bangunan Atas Jem | 1.450.000 | 10.286,74 | 140.9582× | 3085 |
| `7.4.(7)` | Struktur Jembatan Semi Permanen, benta | 1.450.000 | 10.522,92 | 137.7945× | 1157 |
| `6.2.(1d)` | Agregat Penutup BURTU Gradasi 4 | 385.000 | 3.005,6 | 128.0942× | 772 |
| `7.4.(4)` | Struktur Jembatan Baja Standar, bentan | 1.450.000 | 12.259,85 | 118.2722× | 1149 |
| `7.4.(2)` | Struktur Jembatan Baja Non Standar/Khu | 1.450.000 | 14.651,27 | 98.9675× | 1144 |
| `9.2.(26)` | Pembongkaran Ubin Eksisting atau Perke | 1.450.000 | 15.727,13 | 92.1974× | 2162 |
| `6.2.(1c)` | Agregat Penutup BURTU Gradasi 3 | 385.000 | 4.296,61 | 89.6055× | 768 |
| `6.2.(1b)` | Agregat Penutup BURTU Gradasi 2 | 385.000 | 6.080,79 | 63.3141× | 764 |
| `10.1.(27)` | Pengendalian Tanaman | 149.875 | 3.145,65 | 47.6452× | 3073 |
| `6.2.(1a)` | Agregat Penutup BURTU Gradasi 1 | 385.000 | 8.134,65 | 47.3284× | 760 |
| `6.2.(2b)` | Agregat Penutup BURDA Nominal Maks.¾” | 385.000 | 9.495,77 | 40.5444× | 778 |

## 6. Provenance

**1144 dari 1144 item (100.0%) memiliki `sourcePage` yang tidak sama dengan nomor halaman dokumen resmi.**

Nilai `sourcePage` di dataset repo berjalan 1…1144 berurutan tanpa duplikat — itu adalah indeks item, bukan nomor halaman. Dokumen resmi memuat nomor halaman cetak (mis. `- 4326 -`) dan nomor halaman PDF (1…3125) yang keduanya tidak pernah dipakai dataset.

Semua 1144 item berlabel `status: "VERIFIED"` dan 1144 item berlabel `dataQualityScore: 100`. Label tersebut tidak berasal dari perbandingan terhadap dokumen resmi, karena perbandingan itu baru dilakukan sekarang.

## 7. Kesimpulan

1. **Struktur kode AHSP repo sebagian besar benar** — kode dapat dicocokkan ke dokumen resmi.
2. **Isi analisanya tidak berasal dari dokumen resmi.** Mayoritas komponen memakai nama generik dan koefisien yang tidak muncul di lampiran.
3. **Harga satuan repo tidak dapat ditelusuri** ke harga satuan resmi dokumen.
4. **Label `VERIFIED` dan `dataQualityScore: 100` tidak berdasar** dan harus dicabut sampai setiap item dipetakan ulang ke halaman resmi.
5. **`sourcePage` palsu** harus diganti dengan `headerPage` / `analisaPage` hasil ekstraksi.
6. **Dataset repo adalah template, bukan ekstraksi.** Bukti terkuat: 1.144 item hanya memakai 10 harga satuan, dan 47 koefisien komponen dibandingkan dengan 2.560 koefisien di dokumen resmi.

## 8. Rekomendasi

- **Jangan melakukan pembaruan massal (bulk update)** terhadap dataset ini. Bangun dataset baru
  `binaMargaAHSP2026Official` langsung dari hasil ekstraksi, dengan `sourcePage`, `headerPage`,
  `analisaPage`, dan `numberFormat` per item.
- **Simpan dataset lama** dengan status `DEPRECATED_UNVERIFIED` supaya tidak ada jalur produksi
  yang diam-diam memakainya sebagai sumber "VERIFIED".
- **Untuk 5 item `LOST_COEF` dan 1 item `SUSPECT`** (F.47 / kode `6.7.(2)`), jangan menebak nilai:
  tandai `UNREADABLE` dan keluarkan dari perhitungan otomatis.
- **Harga komponen** (upah/bahan/alat) di dokumen resmi adalah harga contoh tahun anggaran dokumen;
  yang boleh dipakai ulang adalah **koefisien**, bukan harganya. Harga harus datang dari
  `price_master` ber-region.
- **Seragamkan satuan** sebelum dipakai engine — 582 selisih notasi (`bh` vs `Buah`, `m1` vs `M'`)
  adalah sumber bug underpricing zak/kg yang ditemukan pada audit Phase 0.
