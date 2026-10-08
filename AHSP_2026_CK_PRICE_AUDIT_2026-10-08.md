# Audit & Sinkronisasi Harga AHSP 2026 Cipta Karya — 2026-10-08

Sumber: `/home/hatch/workspace/user/files/ahsp_bina_kontruksi_2026.xlsx`
(SE Bina Konstruksi No. 47/SE/Dk/2026 — Cipta Karya)
File yang diaudit & diregenerasi:
- `src/data/nationalCostDatabase/officialCiptaKaryaPrices2026.ts`
- `src/data/nationalCostDatabase/officialCiptaKaryaDhsp2026.ts`

## 1. Ringkasan

| Dataset | Excel (fresh extract) | TS sebelum | TS sesudah | Status |
|---|---|---|---|---|
| Upah (labor) | 44 | 45 | 44 | ✅ sinkron (1 sampah dibuang) |
| Material | 3075 | 3075 | 3075 | ✅ sinkron |
| Peralatan | 204 | 204 | 204 | ✅ sinkron (15 nama `#NAME?` diganti nama asli) |
| DHSP total | 3148 | 3148 | 3148 | ✅ sinkron |
| DHSP leaf | 2776 | 2778* | 2776 | ✅ dikoreksi (lihat §6) |

\* Nilai lama 2778 dihitung *sebelum* deduplikasi kode (generator menghitung saat iterasi,
termasuk 3 baris duplikat yang tertimpa). Nilai benar isi `OFFICIAL_CK_2026_DHSP_LIST` = 2776.

**Mismatch harga Excel vs TS: 0.** Semua harga di file TS lama sudah sama dengan Excel
(5 kandidat mismatch awal ternyata false positive — nama material ganda dengan harga
berbeda di baris Excel yang berbeda, mis. "Besi profil" baris 1237 = Rp 14.840 dan
baris 1983 = Rp 34.500; keduanya sudah benar di TS).

## 2. Metode ekstraksi (fresh, tanpa openpyxl)

`openpyxl` memuat seluruh workbook (±5 MB, 42 sheet, ribuan formula) terlalu lambat di VM
ini, jadi ekstraksi memakai parser streaming XML langsung (`zipfile` + `iterparse`):
- Sheet `Upah Bahan` → `xl/worksheets/sheet2.xml`; kolom D=NO, E=Kode, F=Nama, G=Satuan,
  H=Harga, I=Keterangan. Deteksi seksi dinamis dari baris header
  ("I./UPAH", "II./MATERIAL", "III/SEWA PERALATAN"). Nilai = cached value Excel
  (`data_only`), konversi numerik ala openpyxl (integer-looking → `int`).
- Sheet `Daftar Harga Satuan Pekerjaan` → `xl/worksheets/sheet1.xml`; kolom B=Kode,
  C=Uraian, D=Satuan, E=Harga, F=Keterangan; formula mentah kolom E diambil dari
  elemen `<f>`. Replikasi persis logika `scripts/price2026/generateCiptaKaryaDhspModule.py`:
  `code = B.rstrip('.')`, pola `^\d+(\.\d+)+[a-zA-Z]?$` / `^[A-Z]\.\d+(\.\d+)*[a-zA-Z]?$`,
  `unitPrice = float(E)` jika E > 0, `isLeaf = satuan && harga`, `notes` = kolom F,
  `formulaRaw` = formula kolom E, dedup per kode (baris terakhir menang).

## 3. Item sampah di TS (SUDAH DIBERSIHKAN)

1. `OFFICIAL_CK_2026_LABOR`: `{"code":"","name":"2","unit":"3","price":4.0}` —
   bocoran baris marker kolom Excel (baris 7: D=1, F=2, G=3, H=4). Dibuang.
2. `OFFICIAL_CK_2026_EQUIPMENT`: 15 entri bernama `"#NAME?"` (satuan `bulan`) —
   artefak error formula Excel. Di Excel, sel nama 15 baris sewa scaffolding
   (baris 3247–3259, 3262–3263, hidden) berisi *array formula rusak* yang teks
   formulanya justru nama item yang dimaksud, mis. `- Scaffolding Main frame T-190`.
   Excel menampilkan `#NAME?`, tapi nama asli penulis ada di formula bar.
   **Keputusan**: pakai teks formula sebagai nama (paling setia ke maksud data Excel),
   bukan `#NAME?`. Daftar: `- Scaffolding Main frame T-190/T-170`,
   `- Scaffolding Leader frame T-90`, `- Scaffolding Cross  brass  T-220/T-193`,
   `- Scaffolding Joint  pin`, `- Scaffolding Jack base T-40/T-60`,
   `- Scaffolding U  head Jack   T-40/T-60`, `- Scaffolding Pipe support`,
   `- Scaffolding Horizontal frame`, `- Scaffolding Cat  walk`,
   `- Scaffolding Swipel clamb`, `- Scaffolding Roda custer (satu set)`.

## 4. Item hilang / berubah nama di TS (SUDAH DIPERBAIKI)

15 baris scaffolding di atas — di TS lama hanya tercatat sebagai `#NAME?`
(tidak dapat dipakai). Sekarang bernama benar dengan harga tetap dari Excel.

## 5. Baris Excel yang di-skip (22 baris, tanpa harga → tidak masuk TS)

| Baris | Seksi | Nama | Alasan |
|---|---|---|---|
| 23 | upah | Tukang kaca (L.02) | harga kosong |
| 56 | material | MATERIAL  TANAH DAN  BATUAN | sub-header kategori |
| 131 | material | MATERIAL KAYU DAN BAMBU | sub-header kategori |
| 191 | material | MATERIAL PIPA PVC DAN HDPE | sub-header kategori |
| 524 | material | MATERIAL PIPA GALVANIS | sub-header kategori |
| 1220 | material | MATERIAL BESI DAN BAJA | sub-header kategori |
| 1331 | material | MATERIAL PENUTUP ATAP | sub-header kategori |
| 1421 | material | MATERIAL PLAFON | sub-header kategori |
| 1446 | material | MATERIAL PENUTUP LANTAI DAN DINDING | sub-header kategori |
| 1606 | material | MATERIAL BETON DAN ADUKAN PASANGAN | sub-header kategori |
| 1700 | material | MATERIAL CAT | sub-header kategori |
| 1750 | material | MATERIAL KUNCI DAN ENGSEL | sub-header kategori |
| 1784 | material | MATERIAL KACA | sub-header kategori |
| 1817 | material | MATERIAL SANITAIR | sub-header kategori |
| 1956 | material | MATERIAL MINYAK | sub-header kategori |
| 1978 | material | MATERIAL ALUMINIUM DAN BESI | sub-header kategori |
| 2049 | material | MATERIAL LISTRIK | sub-header kategori |
| 2687 | material | MATERIAL SISTEM PEMBUMIAN | sub-header kategori |
| 2721 | material | MATERIAL LAIN-LAIN | sub-header kategori |
| 2864 | material | MATERIAL LANSEKAP | sub-header kategori |
| 3246 | peralatan | Sewa Scaffolding : | sub-header |
| 3362 | peralatan | LAIN-LAIN | sub-header |

Catatan: "Tukang kaca" (L.02) satu-satunya item upah tanpa harga di Excel —
kemungkinan data sumber memang kosong, bukan ke
...[truncated 2289 chars]