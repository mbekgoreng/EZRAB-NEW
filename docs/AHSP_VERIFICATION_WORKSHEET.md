# Worksheet Verifikasi AHSP 2026 — 14 Kode Berulang

> **Aturan:** Jangan ubah canonical data sebelum dokumen SE DJBK 47/SE/Dk/2026
> diperiksa. Centang [x] bila sudah diverifikasi terhadap dokumen resmi.

## Prioritas 1: Duplikat Sejati (1 kode)

### A.3.03.1 — Pengerukan Sedimen (SDA, hal. 260)
| # | ID | Nama | Satuan | Status |
|---|----|------|--------|--------|
| 1 | AHSP-2026-SDA-000606 | Pengerukan 1 m3 Sedimen menggunakan Kapal Keruk Sunction Dredger... | m3 | NEEDS_REVIEW |
| 2 | AHSP-2026-SDA-000607 | (sama) | **m'** ← artefak parsing? | NEEDS_REVIEW |
| 3 | AHSP-2026-SDA-000608 | (sama) | m3 | NEEDS_REVIEW |

**Analisis awal:** #1 dan #3 identik persis (nama + satuan). #2 satuan "m'" terindikasi
artefak parsing dari "m3". Kemungkinan duplikasi saat parsing PDF, bukan 3 item
berbeda di dokumen sumber.

- [ ] Cek SE DJBK 47/2026 hal. 260: berapa item A.3.03.1 yang tercantum?
- [ ] Jika hanya 1: hapus #2 dan #3 (atau tandai duplikat), pertahankan #1
- [ ] Jika memang 3: catat pembedanya (kedalaman? lokasi?)

---

## Prioritas 2: Mengandung Fragmen Parsing (4 kode)

### SEDANG-1 (x3) — SMKK, hal. 39, 44, 56
| # | Nama |
|---|------|
| 1 | "Penyiapan Dokumen Penerapan SMKK:" |
| 2 | (kosong) |
| 3 | "(satu)" |

- [ ] Cek dokumen: apakah SEDANG-1 adalah satu item atau tiga sub-item?
- [ ] Item #2 dan #3 **sudah diblokir dari RAB** via identity gate

### SEDANG-2 (x3) — SMKK, hal. 41, 42, 46
| # | Nama |
|---|------|
| 1 | "Sosialisasi, Promosi, dan Pelatihan:" |
| 2 | (kosong) |
| 3 | (kosong) |

- [ ] Verifikasi terhadap dokumen sumber

### SEDANG-4 (x2) — SMKK, hal. 42, 54
| # | Nama |
|---|------|
| 1 | (kosong) |
| 2 | "Asuransi:" |

- [ ] Verifikasi terhadap dokumen sumber

### SEDANG-12 (x2) — SMKK, hal. 40, 57
| # | Nama |
|---|------|
| 1 | "prosedur)." ← terpotong |
| 2 | (kosong) |

- [ ] Verifikasi terhadap dokumen sumber

---

## Prioritas 3: Kode Dipakai Ulang Sah (9 kode)

Kode yang sama untuk item berbeda — pola dokumen sumber, bukan error.
**Tidak perlu tindakan** kecuali dokumen menunjukkan sebaliknya.

| Kode | Jumlah | Contoh pembeda |
|------|--------|----------------|
| A.3.03.6a | x4 | Pengangkatan vs Pemuatan vs Penghamparan |
| A.3.08.3.4.b.6.a | x2 | Reducer DN2000x1400 vs DN2000x1200 |
| A.3.08.3.4.b.6.b | x2 | (sama, jarak 2.0 km) |
| A.3.08.3.4.b.6.c | x2 | (sama, jarak 2.5 km) |
| A.3.08.3.4.b.6.d | x2 | (sama, jarak 5.0 km) |
| A.3.08.3.4.b.6.e | x2 | (sama, jarak 10 km) |
| A.3.08.3.4.b.6.f | x2 | (sama, jarak 15 km) |
| SEDANG-8.i | x2 | Ahli Geoteknik vs Ahli Teknik Landasan Terbang |
| KECIL-5.a | x2 | Petugas Keselamatan vs (fragmen "pengukur suhu)") |

- [ ] Konfirmasi pola dipakai-ulang di dokumen sumber (cukup 1 contoh per pola)

---

## Catatan
- Item fragmen **sudah diblokir dari RAB** via `checkAhspIdentitySafety()`.
- Data canonical **tidak diubah** — semua menunggu verifikasi dokumen.
- Setelah verifikasi, update `docs/AHSP_SOURCE_CLOSURE.md`.

---

# Worksheet Verifikasi — 62 Satuan Belum Ditentukan

## Prioritas 1: Punya Komponen (3 item — tidak bisa dihitung tanpa satuan)

### A.3.01.2b.4 — Angkutan bahan mentah/jadi/olahan menggunakan flatbed truck (SDA, hal. 165)
- [ ] Cek SE DJBK 47/2026 hal. 165: satuan yang benar (kemungkinan: m3, ton, atau km?)
- [ ] Item ini punya komponen harga → **P1, blokir dari perhitungan hingga satuan jelas**

### 1.000 — "USGPM" (Cipta Karya, hal. 1106)
### 1.250 — "USGPM" (Cipta Karya, hal. 1107)
- [ ] Kode berupa angka = artefak parsing, bukan kode AHSP valid
- [ ] Cek hal. 1106-1107: item apa yang seharusnya ada di sana?
- [ ] Kedua item **sudah diblokir dari RAB** via identity gate

## Prioritas 2: 59 Item Lainnya
Lihat `docs/AHSP_SOURCE_CLOSURE.md` untuk daftar lengkap.
Mayoritas adalah item SMKK prosedural yang memang tidak butuh satuan kuantitatif
(dokumen, pelatihan, asuransi) — verifikasi terhadap Lampiran III bila tersedia.

- [ ] Konfirmasi 15 item prosedural memang tidak butuh satuan
- [ ] Klasifikasi 44 sisanya: butuh satuan vs prosedural
