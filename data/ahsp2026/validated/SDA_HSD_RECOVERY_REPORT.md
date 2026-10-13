# HSD SDA 2026 — Recovery Documentation

## Sumber Resmi yang Diperiksa

| Dokumen | Lokasi | Isi | HSD Standalone? |
|---|---|---|---|
| Lampiran III | `~/workspace/ahsp-official/lampiran-III.pdf` | AHSP Bina Marga | Tidak |
| Lampiran IV | `~/workspace/ahsp-official/lampiran-IV.pdf` | AHSP Sumber Daya Air | **Tidak** — HSD tersebar inline |
| Lampiran V | `~/workspace/ahsp-official/lampiran-V.pdf` | AHSP Cipta Karya | Tidak |
| Lampiran VI | `~/workspace/ahsp-official/lampiran-VI.pdf` | AHSP Cipta Karya | Tidak |
| Web search | PUPR, Scribd, JDIH | HSPK regional | Tidak ada HSD SDA nasional publik |

## Temuan Kritis: HSD Bersifat Regional

**HSD (Harga Satuan Dasar) tidak diterbitkan secara nasional untuk SDA.**

SE DJBK No. 47/SE/Dk/2026 hanya memuat **AHSP** (koefisien kebutuhan). Harga satuan dasar berasal dari **HSPK kabupaten/kota** masing-masing, bukan dari SE ini.

Ini menjelaskan mengapa:
- 26 harga inline ditemukan di Lampiran IV (contoh perhitungan)
- Kode HSD inline (M08c1, E11b) berbeda sistem dengan kode komponen SDA (M.23, T.34)
- Tidak ada tabel HSD SDA standalone

## Harga yang Berhasil Diekstrak (26 entri)

Dari teks Lampiran IV via pattern matching:

File: `data/ahsp2026/validated/sda_hsd_inline_lampiran_iv_26entries.json`

Contoh:
| Kode | Satuan | Harga (Rp) |
|---|---|---|
| E11b | Jam | 258.609,78 |
| E15d | Jam | 314.143,83 |
| M08c1 | m3 | 65.000,00 |
| M03b1 | m3 | 60.000,00 |

**Status:** Kode tidak cocok dengan sistem kode komponen SDA (M.23, T.34, E.05). Tidak dapat dimapping tanpa tabel konversi resmi.

## Labor Cross-Reference (Valid, Sudah Aktif)

| Kode | Nama | Harga | Sumber |
|---|---|---|---|
| L.01 | Pekerja | Rp100.000/OH | CK HSD via SE cross-ref |
| L.02 | Tukang Batu | Rp145.000/OH | CK HSD via SE cross-ref |
| L.03 | Kepala Tukang | Rp175.000/OH | CK HSD via SE cross-ref |
| L.04 | Mandor | Rp200.000/OH | CK HSD via SE cross-ref |

**Dasar:** SE 47/2026 Lampiran VI mengizinkan referensi lintas bidang. Tenaga kerja generik.

## Hasil Pemulihan

| Kategori | Jumlah |
|---|---|
| Item SDA total | 1.556 |
| Item terhitung via labor HSD (21) | 21 |
| Item dengan komponen, HSD tidak tersedia | 1.180 |
| Item tanpa komponen (NO_COMPONENTS_IN_SOURCE) | 355 |
| **Harga baru diintegrasikan ke generator** | **0** |

## Kesimpulan

**Tidak ada HSD SDA nasional yang dapat dipulihkan.**

Generator sudah menggunakan semua harga yang terbukti valid (labor via CK HSD). Sisanya membutuhkan HSPK regional yang tidak tersedia di workspace.

**Rekomendasi:** Untuk pricing SDA lengkap, EZRAB perlu modul input HSPK regional per kabupaten/kota.
