# LAPORAN VALIDASI DATA HARGA KONSTRUKSI & KALIBRASI BIAYA REAL-WORLD EZRAB (PHASE 5.5)

**Tanggal Audit**: 27 September 2026  
**Status Audit**: SELESAI — DATA AUDITED & FORENSICALLY TRACED  
**Status Kesiapan Produksi**: **NOT PRODUCTION-READY FOR AUTOMATIC MULTI-REGIONAL TENDER** (Data Coverage Belum Memadai untuk 514 Kab/Kota)  

---

## RINGKASAN METRIK UTAMA

| Metrik Kunci | Nilai Saat Ini | Status Kesiapan | Keterangan |
|---|:---:|:---:|---|
| **AHSP Coverage** | **5.891 Item** | **TERCATAT LENGKAP** | Sumber Daya Air (1.554), Bina Marga (1.144), Cipta Karya (3.131), SMKK (62) |
| **AHSP Valid / Complete** | **4.119 Item (70%)** | **SIAP KALKULASI** | Memiliki kelengkapan tenaga kerja & bahan sesuai tipologi pekerjaan |
| **AHSP Partial / Single-Scope** | **1.394 Item (24%)** | **VALID KHUSUS** | Pengadaan bahan murni / galian manual tanpa alat berat |
| **AHSP Suspicious** | **378 Item (6%)** | **PERLU AUDIT TEKNIS** | Pekerjaan struktur yang belum mendeklarasikan bahan atau upah |
| **Source Coverage** | **100% (5.891/5.891)** | **RESMI TERVERIFIKASI** | Seluruh analisa merujuk SE DJBK 2026, Permen PUPR 1/2022, KP-02, SNI |
| **National Resource Coverage** | **79% (19/24 Canonical)** | **MEMADAI** | Material utama (semen, pasir, split, besi, batu) memiliki harga acuan nasional |
| **Province & City Price Coverage** | **0% Lokal Terpetakan** | **BELUM MEMADAI** | Database belum memiliki baris harga resmi lokal untuk 38 provinsi & 514 kabupaten/kota |
| **Price Conflicts / Duplicates** | **2 Item Terdeteksi** | **DITANGANI DETERMINISTIK** | Diselesaikan via aturan effectiveDate & priority tier tanpa tebak-tebakan |
| **Physical Unit Integrity** | **100% STRICT** | **DIPROTEKSI BLOKIR** | Konversi lintas-dimensi (kg ↔ m³, m² ↔ m³, OH ↔ kg) diblokir total |

> [!WARNING]
> **PERNYATAAN KESIAPAN PRODUKSI**:  
> Meskipun software engine (Phase 3, Phase 4, Phase 5) telah **100% deterministic** dan bebas crash/drift, **EZRAB TIDAK BOLEH dinyatakan siap produksi untuk estimasi tender lokal** sampai database harga dasar (HSD) untuk masing-masing Pemerintah Daerah Kabupaten/Kota diimpor ke sistem.

---

## 1. AHSP COVERAGE

Total analisa harga satuan yang terindeks di sistem adalah **5.891 item** dengan rincian:
- **Cipta Karya (Gedung & Sanitasi)**: 3.131 analisa
- **Sumber Daya Air (SDA / Irigasi & Bendung)**: 1.554 analisa
- **Bina Marga (Jalan & Jembatan)**: 1.144 analisa
- **SMKK (Keselamatan & Kesehatan Kerja)**: 62 analisa

Seluruh analisa telah distandarisasi menggunakan schema internal:
- `codeNormalized` untuk pencarian tanpa tanda kurung/titik
- Komponen terpisah tegas: `laborComponents`, `materialComponents`, `equipmentComponents`

---

## 2. RESOURCE COVERAGE

Sistem telah dilengkapi dengan [`CanonicalResourceRegistry`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/engine/calibration/canonicalResourceRegistry.ts) yang mengonsolidasikan alias dan sinonim pasar:
- Semen: `CEMENT_PORTLAND` (Semen Gresik, Tiga Roda, Tonasa, PC Type I)
- Pasir Cor: `SAND_CONCRETE` (Pasir Lumajang, Pasir Kasar, Pasir Kali)
- Pasir Pasang: `SAND_MASONRY`
- Batu Belah: `BOULDER_STONE` (Batu Kali 15/20)
- Besi Beton Ulir: `REBAR_DEFORMED` (BJTS 420B, D13, D16, D19)
- Besi Beton Polos: `REBAR_ROUND` (BJTP 280, d8, d10, begel)
- Upah Tenaga: `LABOR_WORKER` (Pekerja), `LABOR_MASON` (Tukang), `LABOR_FOREMAN` (Mandor)
- Alat: `CONCRETE_MIXER` (Molen 0.35 m³), `EXCAVATOR` (0.8 m³), `DUMP_TRUCK` (6–8 Ton)

---

## 3. PRICE COVERAGE

Total baris harga terdaftar: **386 item** (gabungan HSD Nasional 2026 dan Master Commercial Price).
- **Material**: 314 item
- **Tenaga Kerja**: 42 item
- **Peralatan**: 30 item

### Temuan Validasi:
- **Clean Records**: 384 item
- **Missing Source**: 0 item
- **Missing Region**: 0 item
- **Missing Year**: 0 item
- **Duplicate & Conflict**: 2 item (terdeteksi perbedaan harga revisi HSD pasir cor dan batu split yang diselesaikan via timestamp `effectiveDate`).

---

## 4. REGIONAL COVERAGE

- **Nasional / Acuan Pusat 2026**: 79% resource utama terisi harga.
- **Provinsi Jawa Timur / DKI Jakarta**: Terisi sebagian melalui SHST sampel.
- **514 Kabupaten / Kota**: **0% coverage lokal**.
  - Dampak: Jika pengguna menghitung proyek di Kab. Probolinggo atau Kab. Merauke tanpa memasukkan override harga proyek, engine akan melakukan fallback deterministik ke tingkat Nasional (SE 12/2026) dengan memberi status provenance `NATIONAL` (Bukan harga lokal).

---

## 5. SOURCE COVERAGE

- **100% Sumber Terverifikasi**:
  - Lampiran V SE Direktur Jenderal Bina Marga No. 12/SE/Db/2026
  - Standar Perencanaan Irigasi KP-02 (Bangunan Utama)
  - Peraturan Menteri PUPR No. 1 Tahun 2022 tentang Pedoman Analisis Harga Satuan Pekerjaan
  - Standar Harga Satuan Tertinggi (SHST) Pemprov Jatim 2026
- Analisa tanpa dokumen rujukan sah ditandai status `SOURCE_UNVERIFIED`.

---

## 6. UNIT INTEGRITY (INTEGRITAS SATUAN FISIK)

Menggunakan modul [`UnitDimensionalValidator`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/engine/calibration/unitDimensionalValidator.ts):
- **Konversi Sah Diizinkan**:
  - Massa: `kg` ↔ `ton` (faktor: 1.000)
  - Volume: `liter` ↔ `m³` (faktor: 0.001)
  - Panjang: `cm` ↔ `m` (faktor: 0.01)
  - Waktu Tenaga: `OH` ↔ `jam` (faktor: 7 jam kerja standar PUPR)
- **Konversi Terlarang DIBLOKIR TOTAL (`DIMENSIONAL_CONVERSION_BLOCKED`)**:
  - `kg` ↔ `m³` (Massa vs Volume dilarang dikonversi tanpa massa jenis spesifik)
  - `m²` ↔ `m³` (Luas vs Volume)
  - `OH` ↔ `kg` (Waktu kerja vs Berat)

---

## 7. AHSP INTEGRITY

Sistem mengklasifikasikan integritas AHSP secara cerdas tanpa salah tafsir tipologi pekerjaan:
1. **VALID (4.119 item)**: Memiliki pasangan upah dan bahan yang seimbang.
2. **PARTIAL (1.394 item)**: Pekerjaan manual murni (galian manual, pembersihan) yang sah tanpa material atau alat berat.
3. **SUSPICIOUS (378 item)**: Pekerjaan bertitel "beton" atau "pasangan" yang kehilangan rincian semen/pasir dalam dataset mentah.
4. **INVALID (0 item)**: Tidak ditemukan koefisien negatif ($\le 0$) atau nilai `NaN`.

---

## 8. WEIR BODY FORENSIC AUDIT (CASE STUDY 350 m³)

Audit forensik terhadap tubuh bendung tetap dengan dimensi:
- Panjang mercu: $L = 25\text{ m}$
- Tinggi bendung: $H = 3.5\text{ m}$
- Lebar puncak mercu: $W_c = 2.0\text{ m}$
- Lebar dasar fondasi: $W_b = 6.0\text{ m}$

### 1. Tracing Geometri Deterministik:
$$\text{Area} = \frac{W_c + W_b}{2} \times H = \frac{2 + 6}{2} \times 3.5 = 14.0\text{ m}^2$$
$$\text{Volume} = \text{Area} \times L = 14.0 \times 25 = 350.0\text{ m}^3$$

### 2. Tracing Work Item & Biaya (Tanpa Hardcoded Target Price):
1. **Beton Siklop K-225 ($350\text{ m}^3$)**:
   - Semen: $380\text{ kg/m}^3 \times 350 = 133.000\text{ kg} \times \text{Rp } 1.600 = \text{Rp } 212.800.000$
   - Pasir Beton: $0.48\text{ m}^3/\text{m}^3 \times 350 = 168\text{ m}^3 \times \text{Rp } 260.000 = \text{Rp } 43.680.000$
   - Batu Pecah 2/3: $0.72\text{ m}^3/\text{m}^3 \times 350 = 252\text{ m}^3 \times \text{Rp } 290.000 = \text{Rp } 73.080.000$
   - Upah (Pekerja, Tukang, Mandor): $\text{Rp } 69.440.000$
   - Alat (Mixer, Vibrator): $\text{Rp } 7.262.500$
   - **Direct Cost Beton**: $\text{Rp } 409.815.000$
   - **Subtotal + O&P (10%) + PPN (11%)**: $\text{Rp } 500.384.150$

2. **Besi Tulangan Ulir BJTS 420B ($29.750\text{ kg}$)**:
   - Besi + Kawat + Upah Rakit: $\text{Rp } 539.665.000$
   - **Subtotal + O&P + PPN**: $\text{Rp } 658.932.750$

3. **Bekisting Struktur Masif ($251.5\text{ m}^2$)**:
   - Kayu Papan + Paku + Tukang Kayu: $\text{Rp } 38.152.550$
   - **Subtotal + O&P + PPN**: $\text{Rp } 46.584.339$

4. **Sambungan Dilatasi / Contraction Joint ($7\text{ m}$)**:
   - Joint Filler + Upah: $\text{Rp } 897.750$
   - **Subtotal + O&P + PPN**: $\text{Rp } 1.096.158$

5. **Waterstop PVC 200 mm ($13\text{ m}$)**:
   - Waterstop + Upah Pemasangan: $\text{Rp } 2.655.250$
   - **Subtotal + O&P + PPN**: $\text{Rp } 3.242.070$

### 3. Total Forensik Tubuh Bendung:
$$\text{Total Forensik Tubuh Bendung} = \text{Rp } 1.210.239.467$$
- **Direct Cost**: $\text{Rp } 991.185.550$ (Upah: 11%, Bahan: 87%, Alat: 2%)
- **Overhead (5%)**: $\text{Rp } 49.559.277$
- **Profit (5%)**: $\text{Rp } 49.559.277$
- **PPN (11%)**: $\text{Rp } 119.935.363$

### 4. Scope Status: `PARTIAL_SCOPE`
> **Peringatan Scope**: $350\text{ m}^3$ tubuh bendung HANYA mencakup badan bendung utama ($\pm 35\%$ dari total bendung). Pekerjaan pengelakan sungai (cofferdam), dewatering, galian fondasi dalam, kolam olak peredam energi, riprap tebing, dan pintu air sadap belum termasuk dalam angka ini.

---

## 9. ANOMALIES & PRICE ANOMALY V2

Sistem telah melepaskan rule universal kaku ($<\text{Rp } 10$ atau $>\text{Rp } 500\text{ juta}$) dan beralih ke kalibrasi berbasis rentang referensi pasar:
- **NORMAL**: Berada dalam deviasi wajar ($0.7\times - 1.3\times$ median referensi). Tindakan: `PROCEED`.
- **LOW**: Di bawah batas wajar pasar ($< 0.65\times$ median). Tindakan: `WARN` (DILARANG mengubah harga otomatis).
- **HIGH**: Di atas batas wajar pasar ($> 1.4\times$ median). Tindakan: `WARN`.
- **EXTREME**: Anomali ekstrem ($< 0.25\times$ atau $> 2.5\times$ median). Tindakan: `BLOCK` untuk verifikasi pengguna.
- **UNKNOWN**: Bila data referensi belum ada di sistem, ditandai `UNKNOWN` (Dilarang menebak angka).

---

## 10. MISSING DATA GAP ANALYSIS

1. **Database HSD Daerah**: Belum ada database harga tingkat kota/kabupaten di luar Jawa (misal: Maluku, Papua, Kalimantan Utara).
2. **Resource Code Binding**: Pada analisa Cipta Karya, beberapa baris teks deskripsi perlu dimapping ke kode canonical yang baku.

---

## 11. RECOMMENDED DATA IMPORTS (ROADMAP)

1. **Import HSD 38 Provinsi 2026**: Mengunggah tabel HSD resmi Dinas PUPR masing-masing provinsi ke `PriceRepository`.
2. **Indeks Kemahalan Konstruksi (IKK BPS 2026)**: Mengintegrasikan faktor pengali IKK resmi BPS untuk wilayah remote yang tidak memiliki data HSD kota mandiri.
3. **Pemberitahuan UI Transparan**: Pada kalkulator volume, selalu tampilkan badge:
   - `[NATIONAL_FALLBACK]` jika harga memakai acuan nasional.
   - `[PROVINCE_VERIFIED]` jika menggunakan SHST provinsi.
   - `[PROJECT_OVERRIDE]` jika pengguna memasukkan harga riil lapangan.
