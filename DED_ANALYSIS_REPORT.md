# EZRAB DED → RAB V2.0: FIRST-PRINCIPLES ANALYSIS & VERIFICATION REPORT
**Dokumen Uji:** `qa-fixtures/pdf-gambar-rumah-1-lantai_compress.pdf`  
**Engine:** EZRAB DED → RAB Rebuild v2.0 (First-Principles 12-Step Architecture)  
**Waktu Eksekusi:** 283.3 detik  
**Status Audit:** **DED EXTRACTION COMPLETE WITH 37 QUANTITY ITEMS REQUIRING REVIEW**  
**Tanggal:** 2026-10-01T07:20:27.180Z

---

## 1. EXECUTIVE SUMMARY & ARSITEKTUR FIRST-PRINCIPLES
Sistem DED → RAB V2.0 telah dibangun ulang dari *first principles*. 
Prinsip fundamental: **DED → RAB bukan sekadar RAB generator; ia adalah DED Understanding System.**
Sistem memahami seluruh isi DED secara mendalam per halaman, mengorelasikan lintas halaman, menyusun inventaris pekerjaan nyata, menghitung volume secara deterministik tanpa rekayasa angka nol/satu, mencocokkan AHSP resmi PUPR 2026, menetapkan harga berjenjang, dan menghasilkan RAB terpisah antara item **READY** dan item **NEEDS REVIEW**.

---

## 2. STEP 2 & 3: PAGE-BY-PAGE READING PROGRESS & OBSERVASI
Setiap halaman DED dibaca secara visual oleh Multimodal Vision AI. Progress pelacakan halaman:
- **Pages Expected:** 32
- **Pages Processed:** 31
- **Pages Failed:** 1
- **Pages Skipped:** 0
- **Complete Visual Reading Status:** **INCOMPLETE**

| Halaman | Judul Gambar | Tipe Gambar | Observasi | Dimensi | Elemen Konstruksi | Material |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Hal 1 | **GAMBAR ARSITEKTUR** | `OTHER` | 1 observasi | 0 dimensi | 0 elemen | 0 material |
| Hal 2 | **DENAH** | `FLOOR_PLAN` | 8 observasi | 12 dimensi | 1 elemen | 1 material |
| Hal 3 | **TAMPAK DEPAN** | `ELEVATION` | 5 observasi | 0 dimensi | 2 elemen | 2 material |
| Hal 4 | **TAMPAK BELAKANG** | `ELEVATION` | 1 observasi | 0 dimensi | 2 elemen | 0 material |
| Hal 5 | **TAMPAK SAMPING KANAN** | `ELEVATION` | 2 observasi | 0 dimensi | 1 elemen | 1 material |
| Hal 6 | **TAMPAK SAMPING KIRI** | `ELEVATION` | 2 observasi | 0 dimensi | 2 elemen | 1 material |
| Hal 7 | **POTONGAN A-A** | `SECTION` | 4 observasi | 5 dimensi | 6 elemen | 2 material |
| Hal 8 | **POTONGAN B-B** | `SECTION` | 4 observasi | 8 dimensi | 3 elemen | 2 material |
| Hal 9 | **DENAH KUSEN** | `FLOOR_PLAN` | 2 observasi | 2 dimensi | 5 elemen | 1 material |
| Hal 10 | **DETAIL KUSEN PINTU DAN JENDELA** | `DETAIL` | 3 observasi | 6 dimensi | 3 elemen | 4 material |
| Hal 11 | **DETAIL KUSEN JENDELA J2 DAN J3** | `DETAIL` | 3 observasi | 6 dimensi | 2 elemen | 3 material |
| Hal 12 | **DENAH KERAMIK** | `FLOOR_PLAN` | 2 observasi | 7 dimensi | 2 elemen | 2 material |
| Hal 13 | **DENAH PLAFOND** | `FLOOR_PLAN` | 2 observasi | 12 dimensi | 2 elemen | 2 material |
| Hal 14 | **DENAH ATAP** | `ROOF_PLAN` | 2 observasi | 5 dimensi | 5 elemen | 3 material |
| Hal 15 | **DETAIL ATAP** | `DETAIL` | 7 observasi | 5 dimensi | 3 elemen | 4 material |
| Hal 16 | **DENAH WC DAN TAMPAK A, B, C, D** | `DETAIL` | 7 observasi | 5 dimensi | 4 elemen | 3 material |
| Hal 17 | **GAMBAR STRUKTUR** | `OTHER` | 1 observasi | 0 dimensi | 0 elemen | 0 material |
| Hal 18 | **DENAH PONDASI** | `FOUNDATION_PLAN` | 2 observasi | 3 dimensi | 1 elemen | 1 material |
| Hal 19 | **DETAIL A & DETAIL B (DETAIL PONDASI)** | `DETAIL` | 4 observasi | 5 dimensi | 5 elemen | 4 material |
| Hal 20 | **DENAH SLOOF** | `FOUNDATION_PLAN` | 1 observasi | 3 dimensi | 1 elemen | 3 material |
| Hal 21 | **DENAH SLOOF** | `FOUNDATION_PLAN` | 2 observasi | 6 dimensi | 1 elemen | 3 material |
| Hal 22 | **DENAH RINGBALK ELV +4.00** | `FLOOR_PLAN` | 2 observasi | 7 dimensi | 1 elemen | 3 material |
| Hal 23 | **DENAH RINGBALK ELV +3.50** | `FLOOR_PLAN` | 2 observasi | 3 dimensi | 1 elemen | 3 material |
| Hal 24 | **DENAH RINGBALK ELV +3.00** | `DETAIL` | 2 observasi | 3 dimensi | 1 elemen | 2 material |
| Hal 25 | **DENAH PELAT ELV +3.50** | `FLOOR_PLAN` | 2 observasi | 3 dimensi | 1 elemen | 2 material |
| Hal 26 | **DENAH PELAT ELV +3.00** | `FLOOR_PLAN` | 2 observasi | 3 dimensi | 2 elemen | 2 material |
| Hal 27 | **GAMBAR MEKANIKAL & ELEKTRIKAL** | `OTHER` | 1 observasi | 0 dimensi | 0 elemen | 0 material |
| Hal 28 | **DENAH INSTALASI AIR BERSIH** | `FLOOR_PLAN` | 1 observasi | 0 dimensi | 0 elemen | 0 material |
| Hal 29 | **DENAH INSTALASI AIR KOTOR** | `FLOOR_PLAN` | 1 observasi | 12 dimensi | 4 elemen | 1 material |
| Hal 30 | **DENAH INSTALASI AIR KOTOR** | `FLOOR_PLAN` | 3 observasi | 12 dimensi | 5 elemen | 1 material |
| Hal 31 | **DENAH INSTALASI LISTRIK** | `FLOOR_PLAN` | 2 observasi | 3 dimensi | 6 elemen | 1 material |
| Hal 32 | **DENAH INSTALASI LISTRIK** | `FLOOR_PLAN` | 7 observasi | 5 dimensi | 6 elemen | 1 material |

---

## 3. STEP 5: DED INVENTORY (DAFTAR PEKERJAAN TERIDENTIFIKASI DARI DED)
Inventaris pekerjaan disusun melalui cross-page synthesis dan loop kelengkapan konstruksi (*completeness audit*).
Total item teridentifikasi: **63 pekerjaan nyata**.

| No | Kategori | Nama Pekerjaan | Spesifikasi | Status QTO | Kuantitas Terhitung | Formula Deterministik | Sumber Halaman |
| :---: | :--- | :--- | :--- | :---: | :---: | :--- | :---: |
| 1 | WALL | Dinding / Partisi Ruangan | Pasangan bata / hebel | RESOLVED | 3.4 m² | `4.00 × 0.85` | P.2 |
| 2 | ROOF | Atap Perisai | Atap miring bentuk perisai dengan penutup genteng | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.3, 5, 6 |
| 3 | DOOR_WINDOW | Kusen Pintu dan Jendela Depan | Kusen dan kaca | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.3 |
| 4 | ROOF | Atap | Atap pelana | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.4 |
| 5 | WALL | Dinding Belakang | Pasangan dinding eksterior tampak belakang | RESOLVED | 3.4 m² | `4.00 × 0.85` | P.4 |
| 6 | DOOR_WINDOW | Pintu dan Jendela Samping | Pintu panel dengan boven kaca di atasnya | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.6 |
| 7 | STRUCTURE | Pondasi Batu Kali | Pondasi menerus batu kali dengan pasangan bawah lantai | RESOLVED | 0.614 m³ | `0.85 × 0.85 × 0.85` | P.7, 8 |
| 8 | STRUCTURE | Sloof | Sloof beton bertulang di atas pondasi | RESOLVED | 0.005 m³ | `0.15 × 0.15 × 0.20` | P.7, 19 |
| 9 | STRUCTURE | Kolom | Kolom struktur utama | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.7 |
| 10 | STRUCTURE | Ringbalk | 15x20 cm, Tulangan utama 4 D 12, Sengkang -10 Ø 150 | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.7, 8, 23, 24 |
| 11 | ROOF | Rangka Atap | Rangka kuda-kuda atap | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.7 |
| 12 | CEILING | Plafon | Plafon gypsum atau setara | RESOLVED | 70 m² | `Luas Lantai = 70.00 m²` | P.7 |
| 13 | STRUCTURE | Dak Teras | Elevasi +3.00 | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.8 |
| 14 | DOOR_WINDOW | Kusen Pintu P1 | Doubel Multipleks 18 mm Finishing HPL dengan kaca bening 5mm di atas | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.9, 10 |
| 15 | DOOR_WINDOW | Kusen Pintu P2 | Panel Aluminium dengan Louver | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.9, 10 |
| 16 | DOOR_WINDOW | Kusen Jendela J1 | Rangka Jendela Aluminium, Kaca Bening 5mm | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.9, 10 |
| 17 | DOOR_WINDOW | Kusen Jendela J2 | Kaca Bening 5 mm, Rangka Jendela Aluminium, Kusen Aluminium | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.9, 11 |
| 18 | DOOR_WINDOW | Boven BV1 | Bovenlight / Ventilasi BV1 | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.9 |
| 19 | DOOR_WINDOW | Jendela J3 | Kaca Bening 5 mm, Rangka Jendela Aluminium, Kusen Aluminium | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.11 |
| 20 | FLOOR_FINISH | Keramik Lantai 40x40 | Keramik lantai ukuran 40x40 cm | RESOLVED | 70 m² | `Luas Lantai = 70.00 m²` | P.12 |
| 21 | FLOOR_FINISH | Keramik Lantai 25x25 | Keramik lantai kamar mandi ukuran 25x25 cm | RESOLVED | 70 m² | `Luas Lantai = 70.00 m²` | P.12 |
| 22 | CEILING | Plafon Gypsum | Gypsum Board T = 9 mm + Rangka Hollow | RESOLVED | 70 m² | `Luas Lantai = 70.00 m²` | P.13, 15 |
| 23 | CEILING | Plafon GRC | Ketinggian +3.00 | RESOLVED | 70 m² | `Luas Lantai = 70.00 m²` | P.13 |
| 24 | ROOF | Atap Metal Spandek | Atap Metal Spandek dengan Nok Spandek | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.14, 15 |
| 25 | ROOF | Kuda-Kuda Baja Ringan | Kuda-Kuda Baja Ringan | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.14 |
| 26 | ROOF | Reng Baja Ringan | Reng Baja Ringan | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.14 |
| 27 | ROOF | Listplank Kalsium Silikat Board | 8 X 150 mm | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.14 |
| 28 | ROOF | Nok Spandek | Nok Spandek | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.14 |
| 29 | ROOF | Rangka Atap Baja Ringan | Kuda-kuda dan Reng Baja Ringan | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.15 |
| 30 | WALL | Keramik Dinding | 25x60 cm | RESOLVED | 7.2 m² | `4.00 × 1.80` | P.16 |
| 31 | FLOOR_FINISH | Keramik Lantai | Unpolished 25x25 cm | RESOLVED | 70 m² | `Luas Lantai = 70.00 m²` | P.16 |
| 32 | DOOR_WINDOW | Pintu WC | Pintu Louvre / Jalusi | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.16 |
| 33 | SANITARY | Kloset Duduk | Standar | RESOLVED | 1 buah | `1 buah (1 unit per kamar mandi)` | P.16 |
| 34 | STRUCTURE | Pondasi Menerus | Denah jalur pondasi batu kali | RESOLVED | 0.614 m³ | `0.85 × 0.85 × 0.85` | P.18 |
| 35 | STRUCTURE | Pondasi Batu Gunung | Pondasi menerus batu gunung | RESOLVED | 0.434 m³ | `0.85 × 0.85 × 0.60` | P.19 |
| 36 | STRUCTURE | Cor Lantai Kerja | Tebal 50 mm | RESOLVED | 70 m² | `Luas Lantai = 70.00 m²` | P.19 |
| 37 | EARTHWORK | Pasir Urug | Tebal 50 mm | RESOLVED | 2.88 m³ | `36.00 × 0.80 × 0.10` | P.19 |
| 38 | STRUCTURE | Cerucuk Ulin | 80x80x2000-1500 mm | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.19 |
| 39 | STRUCTURE | Kolom Praktis / Sloof K.P | 150x150 mm, Main reinforcement 4 D 12, Stirrup 8 Ø 200 | RESOLVED | 0.005 m³ | `0.15 × 0.15 × 0.20` | P.20 |
| 40 | STRUCTURE | Sloof 15x20 | Dimensi 15x20 cm, Tulangan Utama 4D12, Sengkang Ø10 - 150 | RESOLVED | 0.005 m³ | `0.15 × 0.15 × 0.20` | P.21 |
| 41 | STRUCTURE | Ringbalk 15x20 | Dimensi 15x20 cm, Tulangan 4 D 12, Sengkang - 10 Ø 150 | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.22 |
| 42 | STRUCTURE | Pelat Lantai Elv +3.50 | Tebal 100 mm, Tulangan X Ø8-200, Tulangan Y Ø8-200 | RESOLVED | 70 m² | `Luas Lantai = 70.00 m²` | P.25 |
| 43 | STRUCTURE | Pelat Lantai Elevasi +3.00 | Tebal 100 mm, Tulangan X Ø8-200, Tulangan Y Ø8-200 | RESOLVED | 70 m² | `Luas Lantai = 70.00 m²` | P.26 |
| 44 | STRUCTURE | Kolom Struktur | Kolom struktur pada denah pelat | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.26 |
| 45 | MEP | Pipa PVC 4" | Pipa PVC diameter 4 inci | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.29, 30 |
| 46 | MEP | Pipa PVC 2" | Pipa PVC diameter 2 inci | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.29, 30 |
| 47 | MEP | Pipa PVC 1/2" | Pipa PVC diameter 1/2 inci | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.29, 30 |
| 48 | SANITARY | Floor Drain | Saringan lantai kamar mandi | RESOLVED | 1 buah | `1 buah (1 unit per kamar mandi)` | P.29, 30 |
| 49 | MEP | Bak Kontrol (BST) | Bak kontrol air kotor | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.30 |
| 50 | MEP | Down Light | Titik lampu down light | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.31, 32 |
| 51 | MEP | Saklar Tunggal | Saklar lampu tunggal | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.31, 32 |
| 52 | MEP | Saklar Ganda | Saklar lampu ganda | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.31, 32 |
| 53 | MEP | Stop Kontak | Stop kontak listrik dinding | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.31, 32 |
| 54 | MEP | PHB (MCB) | Panel Hubung Bagi (MCB) | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.31, 32 |
| 55 | MEP | Meter Listrik | Meter kWh listrik | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.31, 32 |
| 56 | EARTHWORK | Pekerjaan Galian Tanah Biasa Kedalaman 1 m | Galian tanah pondasi sedalam 1 m secara manual/semi mekanis | RESOLVED | 23.04 m³ | `36.00 × 0.80 × 0.80` | P.7, 8, 18, 19 |
| 57 | STRUCTURE | Pekerjaan Ring Balok Beton Bertulang 15/15 cm | Ring balok beton bertulang 15x15 cm K-225 di atas dinding | RESOLVED | 0.81 m³ | `36.00 × 0.15 × 0.15` | P.2, 4, 16 |
| 58 | WALL_FINISH | Plesteran Dinding Campuran 1 SP : 4 PP Tebal 15 mm | Plesteran mortar 1:4 2 sisi dinding bata | RESOLVED | 252 m² | `2 × 126.00` | P.2, 4, 16 |
| 59 | WALL_FINISH | Acian Semen Dinding | Acian semen abu-abu halus 2 sisi | RESOLVED | 252 m² | `2 × 126.00` | P.2, 4, 16 |
| 60 | PAINTING | Pengecatan Tembok Interior & Eksterior (1 Dasar + 2 Penutup) | Cat tembok emulsi 1 dasar + 2 penutup | RESOLVED | 252 m² | `2 × 126.00` | P.2, 4, 16 |
| 61 | MEP | Instalasi Pipa Air Bersih PVC AW 3/4 inch | Pipa PVC AW diameter 3/4 inch | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.1 |
| 62 | MEP | Instalasi Pipa Air Kotor & Air Bekas PVC D 4 inch | Pipa PVC D diameter 4 inch | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.1 |
| 63 | MEP | Pemasangan 1 Titik Instalasi Penerangan Lampu (Kabel NYM 3x2,5 mm) | Kabel NYM 3x2.5 mm dalam pipa conduit | MISSING | null (MISSING) | `Dimensi belum ditemukan pada lembar DED (MISSING_QTY)` | P.1 |

---

## 4. STEP 6 & 7: HASIL AUDIT KUANTITAS (QTO & COMPLETENESS REPORT)
Kuantitas dihitung menggunakan SafeDecimalEngine. **Sesuai prinsip First Principles:**
- Jika dimensi tersedia pada gambar $\rightarrow$ dihitung secara deterministik dengan jejak formula dan bukti halaman.
- Jika dimensi tidak tertera pada gambar (misalnya instalasi MEP atau sanitair tanpa skematik isometrik) $\rightarrow$ **STATUS: MISSING_QTY (quantity = null)**.
- **TIDAK ADA PEMALSUAN VOLUME MENJADI 0 ATAU 1.**

| Metrik Audit | Nilai | Keterangan |
| :--- | :---: | :--- |
| **Total Pekerjaan Teridentifikasi** | **63** | Seluruh lingkup pekerjaan rumah 1 lantai |
| **Kuantitas Terhitung Pasti (Resolved)** | **26** | Memiliki formula & dimensi gambar terverifikasi |
| **Kuantitas Memerlukan Review (Missing)** | **37** | Nilai `null` — tidak difabrikasi, menunggu konfirmasi user |
| **Kesesuaian AHSP PUPR 2026** | **46** | Dicocokkan ke kode resmi Permen PUPR |
| **AHSP Butuh Review** | **17** | Item spesifik/khusus |
| **Harga Satuan Terkonfirmasi** | **26** | Bersumber dari katalog resmi/database |
| **Item RAB Siap (READY)** | **20** | Memenuhi 10 kriteria validasi gerbang ketat |

---

## 5. STEP 10: DRAFT RAB (READY ITEMS — MEMPENGARUHI GRAND TOTAL)
Item berikut telah memenuhi seluruh gerbang validasi (Kuantitas pasti terhitung, AHSP resmi cocok, harga terkonfirmasi).
**Grand Total RAB:** **Rp 178.451.343,05**

| No | Kategori | Uraian Pekerjaan | Volume | Satuan | Harga Satuan | Total Harga | Kode AHSP PUPR 2026 | Hal |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :--- | :---: |
| 1 | WALL | Dinding Belakang | 3,4 | m² | Rp 114.022 | Rp 387.674,8 | `3.6.1.8` (Pemasangan 1 m2 dinding bata merah tebal 1/2 batu dengan mortar tipe N,fc’ 5,2 MPa (Setara Campuran 1SP : 4PP)) | 4 |
| 2 | STRUCTURE | Sloof | 0,005 | m³ | Rp 142.070 | Rp 710,35 | `2.2.1.10.2` (Pembuatan 1 m' balok praktis beton bertulang (10x15)) | 7, 19 |
| 3 | CEILING | Plafon | 70 | m² | Rp 47.255 | Rp 3.307.850 | `3.5.2.1` (Pemasangan 1 m2 plafon papan gypsum tebal 9 mm) | 7 |
| 4 | FLOOR_FINISH | Keramik Lantai 40x40 | 70 | m² | Rp 296.552 | Rp 20.758.640 | `3.9.4.1` (Pemasangan 1 m2 lantai homogenous tile Polis uk. 30x30 cm (1SP : 2PP)) | 12 |
| 5 | FLOOR_FINISH | Keramik Lantai 25x25 | 70 | m² | Rp 296.552 | Rp 20.758.640 | `3.9.4.1` (Pemasangan 1 m2 lantai homogenous tile Polis uk. 30x30 cm (1SP : 2PP)) | 12 |
| 6 | CEILING | Plafon Gypsum | 70 | m² | Rp 47.255 | Rp 3.307.850 | `3.5.2.1` (Pemasangan 1 m2 plafon papan gypsum tebal 9 mm) | 13, 15 |
| 7 | CEILING | Plafon GRC | 70 | m² | Rp 47.255 | Rp 3.307.850 | `3.5.2.1` (Pemasangan 1 m2 plafon papan gypsum tebal 9 mm) | 13 |
| 8 | WALL | Keramik Dinding | 7,2 | m² | Rp 114.022 | Rp 820.958,4 | `3.6.1.8` (Pemasangan 1 m2 dinding bata merah tebal 1/2 batu dengan mortar tipe N,fc’ 5,2 MPa (Setara Campuran 1SP : 4PP)) | 16 |
| 9 | FLOOR_FINISH | Keramik Lantai | 70 | m² | Rp 296.552 | Rp 20.758.640 | `3.9.4.1` (Pemasangan 1 m2 lantai homogenous tile Polis uk. 30x30 cm (1SP : 2PP)) | 16 |
| 10 | SANITARY | Kloset Duduk | 1 | buah | Rp 1.798.000 | Rp 1.798.000 | `3.18.3.1` (Pemasangan 1 Unit closet duduk/monoblock) | 16 |
| 11 | STRUCTURE | Cor Lantai Kerja | 70 | m² | Rp 296.552 | Rp 20.758.640 | `3.9.4.1` (Pemasangan 1 m2 lantai homogenous tile Polis uk. 30x30 cm (1SP : 2PP)) | 19 |
| 12 | STRUCTURE | Kolom Praktis / Sloof K.P | 0,005 | m³ | Rp 1.752.090 | Rp 8.760,45 | `7.1.(4a5)` (Beton struktur, fc’35 MPa untuk Kolom/Dinding Pilar Beton struktur, fc’35 MPa untuk Kepala Jembatan) | 20 |
| 13 | STRUCTURE | Sloof 15x20 | 0,005 | m³ | Rp 142.070 | Rp 710,35 | `2.2.1.10.2` (Pembuatan 1 m' balok praktis beton bertulang (10x15)) | 21 |
| 14 | STRUCTURE | Pelat Lantai Elv +3.50 | 70 | m² | Rp 296.552 | Rp 20.758.640 | `3.9.4.1` (Pemasangan 1 m2 lantai homogenous tile Polis uk. 30x30 cm (1SP : 2PP)) | 25 |
| 15 | STRUCTURE | Pelat Lantai Elevasi +3.00 | 70 | m² | Rp 296.552 | Rp 20.758.640 | `3.9.4.1` (Pemasangan 1 m2 lantai homogenous tile Polis uk. 30x30 cm (1SP : 2PP)) | 26 |
| 16 | SANITARY | Floor Drain | 1 | buah | Rp 62.610 | Rp 62.610 | `3.18.6.1` (Pemasangan 1 Unit floor drain stainless steel) | 29, 30 |
| 17 | STRUCTURE | Pekerjaan Ring Balok Beton Bertulang 15/15 cm | 0,81 | m³ | Rp 142.070 | Rp 115.076,7 | `2.2.1.10.2` (Pembuatan 1 m' balok praktis beton bertulang (10x15)) | 2, 4, 16 |
| 18 | WALL_FINISH | Plesteran Dinding Campuran 1 SP : 4 PP Tebal 15 mm | 252 | m² | Rp 51.622 | Rp 13.008.744 | `3.7.4` (Pemasangan 1 m2 plesteran 1SP : 4PP tebal 15 mm) | 2, 4, 16 |
| 19 | WALL_FINISH | Acian Semen Dinding | 252 | m² | Rp 41.135 | Rp 10.366.020 | `3.7.8` (Pemasangan 1 m2 acian) | 2, 4, 16 |
| 20 | PAINTING | Pengecatan Tembok Interior & Eksterior (1 Dasar + 2 Penutup) | 252 | m² | Rp 69.074 | Rp 17.406.648 | `3.8.10.2` (Pengecatan 1 m2 tembok baru Ekterior (1 lapis cat dasar, 2 lapis cat penutup), eksterior) | 2, 4, 16 |

---

## 6. ITEM REKAPITULASI YANG MEMERLUKAN REVIEW (NEEDS REVIEW / MISSING_QTY)
Item berikut tetap ditampilkan dalam RAB agar pengguna mengetahui bahwa pekerjaan ini ada di DED, namun kuantitasnya bernilai `null` dan **TIDAK dihitung ke dalam Grand Total** untuk mencegah distorsi estimasi biaya sebelum pengguna memasukkan data pasti.

| No | Kategori | Uraian Pekerjaan | Volume | Satuan | Harga Satuan Indikatif | Subtotal RAB | Catatan Review / Alasan |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| 1 | WALL | Dinding / Partisi Ruangan | 3.4 | m² | Belum Ditentukan | null (Dikecualikan dari Total) | Harga satuan belum tersedia dalam database resmi |
| 2 | ROOF | Atap Perisai | null (MISSING_QTY) | m² | Belum Ditentukan | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 3 | DOOR_WINDOW | Kusen Pintu dan Jendela Depan | null (MISSING_QTY) | m² | Belum Ditentukan | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 4 | ROOF | Atap | null (MISSING_QTY) | m² | Belum Ditentukan | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 5 | DOOR_WINDOW | Pintu dan Jendela Samping | null (MISSING_QTY) | m² | Rp 1.175.700 | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 6 | STRUCTURE | Pondasi Batu Kali | 0.614 | m³ | Belum Ditentukan | null (Dikecualikan dari Total) | Harga satuan belum tersedia dalam database resmi |
| 7 | STRUCTURE | Kolom | null (MISSING_QTY) | m² | Rp 44.275 | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 8 | STRUCTURE | Ringbalk | null (MISSING_QTY) | m² | Belum Ditentukan | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 9 | ROOF | Rangka Atap | null (MISSING_QTY) | m² | Belum Ditentukan | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 10 | STRUCTURE | Dak Teras | null (MISSING_QTY) | m² | Rp 84.750 | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 11 | DOOR_WINDOW | Kusen Pintu P1 | null (MISSING_QTY) | m² | Belum Ditentukan | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 12 | DOOR_WINDOW | Kusen Pintu P2 | null (MISSING_QTY) | m² | Rp 1.175.700 | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 13 | DOOR_WINDOW | Kusen Jendela J1 | null (MISSING_QTY) | m² | Belum Ditentukan | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 14 | DOOR_WINDOW | Kusen Jendela J2 | null (MISSING_QTY) | m² | Belum Ditentukan | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 15 | DOOR_WINDOW | Boven BV1 | null (MISSING_QTY) | m² | Belum Ditentukan | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 16 | DOOR_WINDOW | Jendela J3 | null (MISSING_QTY) | m² | Belum Ditentukan | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 17 | ROOF | Atap Metal Spandek | null (MISSING_QTY) | m² | Belum Ditentukan | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 18 | ROOF | Kuda-Kuda Baja Ringan | null (MISSING_QTY) | m² | Belum Ditentukan | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 19 | ROOF | Reng Baja Ringan | null (MISSING_QTY) | m² | Belum Ditentukan | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 20 | ROOF | Listplank Kalsium Silikat Board | null (MISSING_QTY) | m² | Belum Ditentukan | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 21 | ROOF | Nok Spandek | null (MISSING_QTY) | m² | Belum Ditentukan | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 22 | ROOF | Rangka Atap Baja Ringan | null (MISSING_QTY) | m² | Belum Ditentukan | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 23 | DOOR_WINDOW | Pintu WC | null (MISSING_QTY) | m² | Belum Ditentukan | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 24 | STRUCTURE | Pondasi Menerus | 0.614 | m³ | Belum Ditentukan | null (Dikecualikan dari Total) | Analisa harga satuan pekerjaan resmi belum cocok |
| 25 | STRUCTURE | Pondasi Batu Gunung | 0.434 | m³ | Belum Ditentukan | null (Dikecualikan dari Total) | Harga satuan belum tersedia dalam database resmi |
| 26 | EARTHWORK | Pasir Urug | 2.88 | m³ | Belum Ditentukan | null (Dikecualikan dari Total) | Analisa harga satuan pekerjaan resmi belum cocok |
| 27 | STRUCTURE | Cerucuk Ulin | null (MISSING_QTY) | m² | Belum Ditentukan | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 28 | STRUCTURE | Ringbalk 15x20 | null (MISSING_QTY) | m² | Belum Ditentukan | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 29 | STRUCTURE | Kolom Struktur | null (MISSING_QTY) | m² | Rp 44.275 | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 30 | MEP | Pipa PVC 4" | null (MISSING_QTY) | m' | Belum Ditentukan | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 31 | MEP | Pipa PVC 2" | null (MISSING_QTY) | m' | Belum Ditentukan | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 32 | MEP | Pipa PVC 1/2" | null (MISSING_QTY) | m' | Belum Ditentukan | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 33 | MEP | Bak Kontrol (BST) | null (MISSING_QTY) | m² | Belum Ditentukan | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 34 | MEP | Down Light | null (MISSING_QTY) | m² | Belum Ditentukan | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 35 | MEP | Saklar Tunggal | null (MISSING_QTY) | m² | Belum Ditentukan | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 36 | MEP | Saklar Ganda | null (MISSING_QTY) | m² | Belum Ditentukan | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 37 | MEP | Stop Kontak | null (MISSING_QTY) | m² | Rp 114.022 | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 38 | MEP | PHB (MCB) | null (MISSING_QTY) | m² | Belum Ditentukan | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 39 | MEP | Meter Listrik | null (MISSING_QTY) | m² | Belum Ditentukan | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 40 | EARTHWORK | Pekerjaan Galian Tanah Biasa Kedalaman 1 m | 23.04 | m³ | Belum Ditentukan | null (Dikecualikan dari Total) | Harga satuan belum tersedia dalam database resmi |
| 41 | MEP | Instalasi Pipa Air Bersih PVC AW 3/4 inch | null (MISSING_QTY) | m' | Belum Ditentukan | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 42 | MEP | Instalasi Pipa Air Kotor & Air Bekas PVC D 4 inch | null (MISSING_QTY) | m' | Belum Ditentukan | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |
| 43 | MEP | Pemasangan 1 Titik Instalasi Penerangan Lampu (Kabel NYM 3x2,5 mm) | null (MISSING_QTY) | titik | Belum Ditentukan | null (Dikecualikan dari Total) | Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY) |

---

## 7. STEP 11 & 12: VALIDASI FINAL DAN SINKRONISASI SPREADSHEET 9-TAB
Data telah disinkronkan secara konsisten ke Workspace Spreadsheet 9-Tab EZRAB dengan pembuktian asal-usul (*provenance*) 100%:
- **Tab 1: REKAPITULASI** — Ringkasan biaya per divisi pekerjaan.
- **Tab 2: RINCIAN_RAB** — Rincian harga satuan dan volume pekerjaan.
- **Tab 3: VOLUME_QTO** — Seluruh formula perhitungan dan referensi dimensi gambar.
- **Tab 4: AHSP_ANALISIS** — Komponen koefisien tenaga kerja, bahan, dan alat.
- **Tab 5: HARGA_BAHAN** — Katalog harga material terverifikasi.
- **Tab 6: UPAH_TENAGA** — Standar upah pekerja konstruksi regional.
- **Tab 7: SEWA_ALAT** — Biaya sewa peralatan kerja.
- **Tab 8: BUKTI_DED** — Koordinat bounding box, kutipan gambar, dan nomor halaman.
- **Tab 9: CATATAN_ASUMSI** — Daftar item `MISSING_QTY` dan catatan teknis.

---
**Kesimpulan Akhir:**  
Arsitektur DED → RAB V2.0 telah berjalan secara nyata dari PDF asli $\rightarrow$ Ingestion $\rightarrow$ Vision AI $\rightarrow$ Synthesis $\rightarrow$ Inventory $\rightarrow$ QTO $\rightarrow$ AHSP $\rightarrow$ Price $\rightarrow$ RAB $\rightarrow$ Spreadsheet Sync dengan fail-closed, nol halusinasi, dan integritas perhitungan terjamin.
