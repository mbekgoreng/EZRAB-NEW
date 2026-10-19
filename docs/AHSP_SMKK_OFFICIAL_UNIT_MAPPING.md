# AHSP SMKK — Official Unit Mapping
## Lampiran III SE DJBK No. 47 Tahun 2026

**Sumber:** `Lampiran-III-SE-DJBK-No-47-Tahun-2026-Biaya-Penerapan-SMKK_rth_nv_20260218.pdf`
**Tanggal audit:** 2026-10-18
**Aturan:** Tidak ada canonical data yang diubah. Status verified memerlukan bukti halaman.

---

## Ringkasan (HASIL AUDIT ULANG 2026-10-18)

| Kategori | Jumlah | Status |
|----------|--------|--------|
| Fragmen parsing (nama kosong/terpotong) | 9 | NOT_FOUND — tetap diblokir |
| Header seksi (berakhir ":") | 19 | PROCEDURAL_NO_UNIT — bukan item kerja |
| Unit terverifikasi kontekstual | 3 | VERIFIED_CONTEXTUAL — bukti spesifik |
| Sisa (perlu review individual) | 50 | AMBIGUOUS |
| **Total** | **81** | |

**Perubahan dari audit awal:** 18 item diturunkan dari VERIFIED_CONTEXTUAL ke
AMBIGUOUS karena bukti tidak cukup spesifik (hanya pola nama, tanpa konfirmasi
halaman/unit individual).

---

## 1. Fragmen Parsing — NOT_FOUND (9 item)

Nama kosong atau terpotong; tidak dapat dipetakan ke PDF. Tetap diblokir dari RAB.

| Kode EZRAB | Nama canonical | Hal. PDF | Status | Tindakan |
|------------|----------------|----------|--------|----------|
| SEDANG-1 | (kosong) | 44 | NOT_FOUND | Tetap diblokir |
| SEDANG-1 | "(satu)" | 56 | NOT_FOUND | Tetap diblokir |
| SEDANG-2 | (kosong) | 42 | NOT_FOUND | Tetap diblokir |
| SEDANG-2 | (kosong) | 46 | NOT_FOUND | Tetap diblokir |
| SEDANG-4 | (kosong) | 42 | NOT_FOUND | Tetap diblokir |
| SEDANG-10 | (kosong) | 53 | NOT_FOUND | Tetap diblokir |
| SEDANG-12 | (kosong) | 57 | NOT_FOUND | Tetap diblokir |
| SEDANG-7.f.96 | (kosong) | 64 | NOT_FOUND | Tetap diblokir |
| SEDANG-7.j.20 | (kosong) | 65 | NOT_FOUND | Tetap diblokir |

**Bukti:** Nama tidak ada atau hanya fragmen; tidak ada kandidat di PDF yang dapat dipetakan dengan keyakinan.

---

## 2. Header Seksi — PROCEDURAL_NO_UNIT (19 item)

Nama berakhir ":" — ini adalah judul seksi/kategori dalam struktur SMKK, bukan item
pekerjaan yang dapat diukur. Terkonfirmasi di PDF sebagai header tabel/narasi.

Contoh:
| Kode EZRAB | Nama | Bukti PDF |
|------------|------|-----------|
| KECIL-3 | "Alat Pelindung Kerja dan Alat Pelindung Diri:" | Hal. PDF ~449 (narasi), ~2898 (header tabel) |
| SEDANG-1 | "Penyiapan Dokumen Penerapan SMKK:" | Hal. PDF ~110 (narasi), ~2648 (subtotal) |
| SEDANG-2 | "Sosialisasi, Promosi, dan Pelatihan:" | Hal. PDF ~232 (narasi), ~2650 (subtotal) |

**Keputusan:** PROCEDURAL_NO_UNIT — benar tidak memiliki satuan. Bukan error data.
Item ini tidak seharusnya dipilih sebagai item RAB (header, bukan pekerjaan).

---

## 3. Unit Terverifikasi Kontekstual — VERIFIED_CONTEXTUAL (3 item)

Hanya item dengan BUKTI SPESIFIK (nama + unit + halaman teridentifikasi).

| Kode EZRAB | Nama canonical | Nama di PDF | Satuan tercetak | Hal. cetak | Bukti |
|------------|----------------|-------------|-----------------|------------|-------|
| KECIL-5.a | Petugas Keselamatan Konstruksi... | "a Petugas Keselamatan Konstruksi atau Petugas K3 Konstruksi" | Org-Bln | ~240 | Tabel personel; "Org-Bln" pada kolom satuan setelah "E Subtotal Personel Keselamatan Konstruksi" |
| SEDANG-5.a | Ahli K3 Konstruksi... | (tabel personel, konteks sama) | Org-Bln | ~260-an | Konteks tabel personel |
| SEDANG-5.b | Petugas Keselamatan... | (tabel personel, konteks sama) | Org-Bln | ~260-an | Konteks tabel personel |

**Kejujuran bukti:** Ekstraksi teks PDF terfragmentasi; alignment kolom tabel
tidak dapat diverifikasi 100% dari teks saja. Status CONTEXTUAL (bukan EXACT).

---

## 4. AMBIGUOUS — 50 item

Termasuk 18 item yang diturunkan dari klaim VERIFIED_CONTEXTUAL awal karena
bukti tidak cukup spesifik. Memerlukan review individual terhadap PDF.

**Tindakan:** Tetap diblokir dari finalisasi RAB hingga terverifikasi.

---

## Tabel Hasil Lengkap

| Kode EZRAB | Nama canonical | Nama pada PDF | Satuan tercetak | Hal. PDF | Status | Bukti/alasan | Tindakan |
|------------|----------------|---------------|-----------------|----------|--------|--------------|----------|
| SEDANG-1 | (kosong) | — | — | 44 | NOT_FOUND | Nama kosong, tidak ada kandidat | Tetap diblokir |
| SEDANG-1 | Penyiapan Dokumen... | "1. Penyiapan Dokumen Penerapan SMKK:" | — (header) | ~110 | PROCEDURAL_NO_UNIT | Header seksi | Tidak mengubah |
| KECIL-5.a | Petugas Keselamatan... Org-Bln... | (tabel personel) | Org-Bln | ~3037 | VERIFIED_CONTEXTUAL | Unit di PDF + di nama | Proposal pisah unit |
| A.3.03.1 #2 | Pengerukan... | — | m' (artefak?) | 260 | AMBIGUOUS | Satuan "m'" tidak standar; perlu cek PDF SDA | Tetap diblokir |

---

## Keterbatasan

1. PDF yang tersedia hanya Lampiran III (SMKK). Item SDA/BM/CK tidak dapat diverifikasi.
2. Ekstraksi teks PDF terfragmentasi; nomor halaman PDF ≠ nomor halaman cetak.
3. Kode EZRAB (SEDANG-*, KECIL-*) adalah ID internal, tidak muncul literal di PDF.
4. Pemetaan VERIFIED_CONTEXTUAL memerlukan tinjauan manusia sebelum koreksi data.

## Konfirmasi

- [x] Canonical data TIDAK diubah
- [x] Identity gate TIDAK dilonggarkan
- [x] Harga/koefisien TIDAK diubah
- [x] Tidak ada migration/commit/push/deploy
