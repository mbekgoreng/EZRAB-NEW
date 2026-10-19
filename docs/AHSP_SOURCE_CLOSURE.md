# AHSP 2026 Source Closure — 2026-10-18

## Ringkasan
- Kode berulang: 14 (mengandung fragmen parsing: 4, duplikat sejati: 1, dipakai ulang: 9)
- Tanpa satuan (belum ditentukan): 62
- **Tidak ada canonical data yang diubah. Semua menunggu SE DJBK 47/2026.**
- Item dengan fragmen parsing **diblokir dari RAB** via `checkAhspIdentitySafety()` di engine boundary.

## 14 Kode Berulang
### KECIL-5.a (x2) — KODE_DIPAKAI_ULANG
- Domain: SMKK | Halaman: 34,35
- Keputusan: NEEDS_REVIEW — pola dokumen sumber; bukan error data
- Nama: "Petugas Keselamatan Konstruksi Org-Bln penambahan " / "pengukur suhu) 1"

### SEDANG-1 (x3) — KODE_DIPAKAI_ULANG
- Domain: SMKK | Halaman: 39,44,56
- Keputusan: NEEDS_REVIEW — pola dokumen sumber; bukan error data
- Nama: "Penyiapan Dokumen Penerapan SMKK:" / "(kosong)" / "(satu)"

### SEDANG-12 (x2) — KODE_DIPAKAI_ULANG
- Domain: SMKK | Halaman: 40,57
- Keputusan: NEEDS_REVIEW — pola dokumen sumber; bukan error data
- Nama: "prosedur)." / "(kosong)"

### SEDANG-2 (x3) — KODE_DIPAKAI_ULANG
- Domain: SMKK | Halaman: 41,42,46
- Keputusan: NEEDS_REVIEW — pola dokumen sumber; bukan error data
- Nama: "Sosialisasi, Promosi, dan Pelatihan:" / "(kosong)" / "(kosong)"

### SEDANG-4 (x2) — KODE_DIPAKAI_ULANG
- Domain: SMKK | Halaman: 42,54
- Keputusan: NEEDS_REVIEW — pola dokumen sumber; bukan error data
- Nama: "(kosong)" / "Asuransi:"

### SEDANG-8.i (x2) — KODE_DIPAKAI_ULANG
- Domain: SMKK | Halaman: 69
- Keputusan: NEEDS_REVIEW — pola dokumen sumber; bukan error data
- Nama: "Ahli Geoteknik OJ Minimal 1 Sertifikat Ahli dan" / "Ahli Teknik Landasan Terbang OJ Minimal 1 Sertifik"

### A.3.03.1 (x3) — DUPLIKAT_SEJATI
- Domain: SUMBER_DAYA_AIR | Halaman: 260
- Keputusan: NEEDS_REVIEW — deduplikasi menunggu verifikasi SE DJBK 47/2026
- Nama: "Pengerukan 1 m3 Sedimen menggunakan Kapal Keruk Su" / "Pengerukan 1 m3 Sedimen menggunakan Kapal Keruk Su" / "Pengerukan 1 m3 Sedimen menggunakan Kapal Keruk Su"

### A.3.03.6a (x4) — KODE_DIPAKAI_ULANG
- Domain: SUMBER_DAYA_AIR | Halaman: 294
- Keputusan: NEEDS_REVIEW — pola dokumen sumber; bukan error data
- Nama: "Pengangkatan 1 m3 Gulma Air dari Situ/Waduk/Salura" / "Pemuatan ke DT setiap 1 m3 Gulma Air Hasil Pengang" / "Penghamparan, Perataan dan Perapihan 1 m2 Hasil ga" / "Pengangkatan 1 m3 Gulma Air dari Situ/Waduk/Salura"

### A.3.08.3.4.b.6.a (x2) — KODE_DIPAKAI_ULANG
- Domain: SUMBER_DAYA_AIR | Halaman: 1234
- Keputusan: NEEDS_REVIEW — pola dokumen sumber; bukan error data
- Nama: "Pengangkutan dan Pemasangan Reducer DN 2000 x DN 1" / "Pengangkutan dan Pemasangan Reducer DN 2000 x DN 1"

### A.3.08.3.4.b.6.b (x2) — KODE_DIPAKAI_ULANG
- Domain: SUMBER_DAYA_AIR | Halaman: 1234
- Keputusan: NEEDS_REVIEW — pola dokumen sumber; bukan error data
- Nama: "Pengangkutan dan Pemasangan Reducer DN 2000 x DN 1" / "Pengangkutan dan Pemasangan Reducer DN 2000 x DN 1"

### A.3.08.3.4.b.6.c (x2) — KODE_DIPAKAI_ULANG
- Domain: SUMBER_DAYA_AIR | Halaman: 1235
- Keputusan: NEEDS_REVIEW — pola dokumen sumber; bukan error data
- Nama: "Pengangkutan dan Pemasangan Reducer DN 2000 x DN 1" / "Pengangkutan dan Pemasangan Reducer DN 2000 x DN 1"

### A.3.08.3.4.b.6.d (x2) — KODE_DIPAKAI_ULANG
- Domain: SUMBER_DAYA_AIR | Halaman: 1235
- Keputusan: NEEDS_REVIEW — pola dokumen sumber; bukan error data
- Nama: "Pengangkutan dan Pemasangan Reducer DN 2000 x DN 1" / "Pengangkutan dan Pemasangan Reducer DN 2000 x DN 1"

### A.3.08.3.4.b.6.e (x2) — KODE_DIPAKAI_ULANG
- Domain: SUMBER_DAYA_AIR | Halaman: 1236
- Keputusan: NEEDS_REVIEW — pola dokumen sumber; bukan error data
- Nama: "Pengangkutan dan Pemasangan Reducer DN 2000 x DN 1" / "Pengangkutan dan Pemasangan Reducer DN 2000 x DN 1"

### A.3.08.3.4.b.6.f (x2) — KODE_DIPAKAI_ULANG
- Domain: SUMBER_DAYA_AIR | Halaman: 1236
- Keputusan: NEEDS_REVIEW — pola dokumen sumber; bukan error data
- Nama: "Pengangkutan dan Pemasangan Reducer DN 2000 x DN 1" / "Pengangkutan dan Pemasangan Reducer DN 2000 x DN 1"

## 62 Item Tanpa Satuan (NEEDS_REVIEW)
- **KECIL-3** [SMKK p.33] "Alat Pelindung Kerja dan Alat Pelindung Diri:" → NEEDS_REVIEW — satuan belum dapat ditentukan tanpa dokumen resmi
- **KECIL-3.a** [SMKK p.33] "APK, antara lain:" → NEEDS_REVIEW — satuan belum dapat ditentukan tanpa dokumen resmi
- **KECIL-3.b** [SMKK p.33] "APD, antara lain:" → NEEDS_REVIEW — satuan belum dapat ditentukan tanpa dokumen resmi
- **KECIL-5** [SMKK p.34] "Personel Keselamatan Konstruksi:" → NEEDS_REVIEW — satuan belum dapat ditentukan tanpa dokumen resmi
- **KECIL-5.a** [SMKK p.34] "Petugas Keselamatan Konstruksi Org-Bln penambahan 1 Mampu me" → NEEDS_REVIEW — satuan belum dapat ditentukan tanpa dokumen resmi
- **KECIL-7** [SMKK p.35] "Rambu dan Perlengkapan Lalu Lintas:" → NEEDS_REVIEW — satuan belum dapat ditentukan tanpa dokumen resmi
- **KECIL-7.k** [SMKK p.36] "Jembatan Sementara manajemen Lumsum Jumlah dan jenis" → NEEDS_REVIEW — satuan belum dapat ditentukan tanpa dokumen resmi
- **KECIL-8** [SMKK p.37] "Konsultasi dengan Ahli terkait Keselamatan Konstruksi: (komp" → NEEDS_REVIEW — satuan belum dapat ditentukan tanpa dokumen resmi
- **KECIL-9** [SMKK p.37] "Kegiatan dan peralatan terkait Pengendalian Risiko Keselamat" → NEEDS_REVIEW — satuan belum dapat ditentukan tanpa dokumen resmi
- **KECIL-9.a** [SMKK p.37] "Alat Pemadam Api Ringan (APAR):" → NEEDS_REVIEW — satuan belum dapat ditentukan tanpa dokumen resmi
- **KECIL-9.e** [SMKK p.38] "Pengujian lingkungan, antara" → NEEDS_REVIEW — satuan belum dapat ditentukan tanpa dokumen resmi
- **SEDANG-3** [SMKK p.46] "Alat Pelindung Kerja dan Alat Pelindung Diri:" → NEEDS_REVIEW — satuan belum dapat ditentukan tanpa dokumen resmi
- **SEDANG-3.a** [SMKK p.46] "APK, antara lain:" → NEEDS_REVIEW — satuan belum dapat ditentukan tanpa dokumen resmi
- **SEDANG-3.a.3** [SMKK p.47] "Pagar pengaman penahan Meter Keliling area kerja 1. Gambar k" → NEEDS_REVIEW — satuan belum dapat ditentukan tanpa dokumen resmi
- **SEDANG-3.a.4** [SMKK p.47] "Lantai penahan jatuh Meter Sepanjang sisi 1. Gambar kerja Ga" → NEEDS_REVIEW — satuan belum dapat ditentukan tanpa dokumen resmi
- **SEDANG-3.a.8** [SMKK p.49] "Penutup lubang Meter Tergantung jumlah Bahan penutup Gambar " → NEEDS_REVIEW — satuan belum dapat ditentukan tanpa dokumen resmi
- **SEDANG-3.a.10** [SMKK p.49] "Pagar sementara pengaman Meter Disesuaikan dengan 1. Gambar " → NEEDS_REVIEW — satuan belum dapat ditentukan tanpa dokumen resmi
- **SEDANG-3.b** [SMKK p.49] "APD, antara lain:" → NEEDS_REVIEW — satuan belum dapat ditentukan tanpa dokumen resmi
- **SEDANG-3.b.6** [SMKK p.51] "Pelindung telinga (ear muff) Tergantung jumlah Mampu menahan" → NEEDS_REVIEW — satuan belum dapat ditentukan tanpa dokumen resmi
- **SEDANG-5** [SMKK p.55] "Personel Keselamatan Konstruksi:" → NEEDS_REVIEW — satuan belum dapat ditentukan tanpa dokumen resmi

... dan 42 item lainnya (lihat .audit-frag.json untuk daftar lengkap).
