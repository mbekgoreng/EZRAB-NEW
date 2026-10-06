# EZRAB — PRICE DATABASE 2026 REPORT

> Generated: 2026-09-28T13:01:14.311Z  
> Command: `npm run price:pipeline`  
> Canonical AHSP: **5801 items** (unchanged, price-free)  
> Price records: **309**

---

## 1. Ringkasan Eksekutif

Masalah: EZRAB menampilkan **Rp 0** untuk harga satuan AHSP.

Akar masalahnya bukan satu bug, melainkan **tiga sebab yang bertumpuk**:

1. **AHSP kanonik memang bebas harga.** Katalog 2026 hasil regenerasi (5.801 item)
   hanya memuat kode, uraian, satuan, resource, dan koefisien — tanpa harga. Itu benar
   secara forensik, tetapi berarti tidak ada satu pun harga yang bisa dibaca.
2. **Tidak ada Price Master yang terhubung.** Tidak ada lapisan harga yang menjembatani
   resource kanonik ke sumber harga mana pun.
3. **"Tidak diketahui" dikonversi menjadi 0 di tiga lapisan** — mesin (`let unitPrice = 0`),
   resolver (`price: 0` untuk NOT_FOUND), dan UI (`unitPrice || 0`). Jadi ketidaktahuan
   tampil sebagai angka yang tampak sah.

Solusi: sebuah **Price Database 2026 yang terpisah** dari AHSP, satu **Price Resolver**,
dan aturan **"harga hilang = `null`, tidak pernah 0"**.

Hasil terukur hari ini:

- **309** record harga nyata, semuanya bernilai positif dan berprovenans lengkap.
- **71/782** pasangan (kode, satuan) berharga (**9.08%**), tetapi **76.95%** dari seluruh pemakaian komponen sudah terharga.
- **1235** item AHSP berstatus **FULL**, **3488** **PARTIAL**, **113** **MISSING**, **965** tanpa komponen.
- Cakupan "minimal punya satu harga": **81.42%** item.

Cakupan **tidak dipaksakan**. Resource yang tidak punya harga di sumber mana pun tetap
tanpa harga, dan dilaporkan — bukan diisi dengan angka karangan.

---

## 2. Arsitektur

```
  OFFICIAL AHSP 2026 (5.801 item, TANPA HARGA, tidak diubah)
            │  component.code + unit + coefficient
            ▼
  PRICE DATABASE 2026  (lapisan terpisah — 6 sumber aktif)
            │
            ▼
  PRICE RESOLVER  (src/data/priceDatabase2026/resolver.ts)
            │  satu-satunya jalan
            ├──────────▶  AHSP unit price = Σ (coefficient × resolved price)
            ├──────────▶  RAB (server/services/spreadsheetApprovalEngine.ts)
            └──────────▶  Magic AI / bridge (authoritativeAhspPriceBridge.ts)
```

Berkas kunci:

| Berkas | Peran |
| --- | --- |
| `src/data/priceDatabase2026/types.ts` | Kontrak: `ResourcePriceRecord`, `ResourcePriceResolution`, `AhspUnitPriceComposition` |
| `src/data/priceDatabase2026/normalize.ts` | Normalisasi kode/satuan/nama (dipakai bersama oleh pipeline & resolver) |
| `src/data/priceDatabase2026/resolver.ts` | **Price Resolver** — satu-satunya pintu harga |
| `src/data/priceDatabase2026/priceMaster.generated.ts` | Record harga hasil matching (dibuat mesin) |
| `scripts/price2026/*.ts` | Pipeline: audit → normalize → match → coverage → assert → forensic → report |
| `server/services/authoritativeAhspPriceBridge.ts` | Bridge RAB/Magic AI → resolver |

---

## 3. Sumber Harga

| Sumber | Tier | Prioritas | Status | Aktif | Record terpakai | Rentang harga |
| --- | --- | --- | --- | --- | --- | --- |
| `HSD_2026` | OFFICIAL_GOVERNMENT | 1 | VERIFIED | ya | 76 | Rp 1.600 – Rp 3.000.000 |
| `LABOR_2026` | VERIFIED_REGIONAL | 3 | VERIFIED | ya | 30 | Rp 20.000 – Rp 270.000 |
| `EQUIPMENT_2026` | VERIFIED_REGIONAL | 3 | VERIFIED | ya | 15 | Rp 20.000 – Rp 1.200.000 |
| `MATERIAL_MASTER_2026` | PROJECT_INTERNAL_MASTER | 5 | SOURCE_REPORTED | ya | 162 | Rp 1.600 – Rp 3.000.000 |
| `MATERIAL_LIBRARY` | COMMERCIAL_REFERENCE | 6 | SOURCE_REPORTED | ya | 1 | Rp 14.500 – Rp 14.500 |
| `COMMERCIAL_2026` | COMMERCIAL_REFERENCE | 6 | SOURCE_REPORTED | ya | 25 | Rp 12.500 – Rp 920.000 |
| `LEGACY_PUPR_2022` | LEGACY_SUPERSEDED | 99 | NEEDS_REVIEW | **TIDAK** | 0 | — |

Total baris harga ternormalisasi: **6913**, aktif **6855**, dikecualikan **58** (`LEGACY_PUPR_2022`).

**Legacy 2022 dikarantina, bukan digabung.** Sumber tersebut adalah baseline yang sudah
digantikan dan pernah *membayangi* tarif tenaga kerja 2026 di `PriceRepository` (first-wins).
Sumber itu tetap terdaftar untuk audit, tetapi `active: false` dan tidak pernah dipakai.

---

## 4. Hasil Matching

Record harga: **309**.

| Metode | Jumlah | Boleh VERIFIED? |
| --- | --- | --- |
| `NAME_UNIT` | 294 | **tidak** → NEEDS_REVIEW |
| `EXACT_CODE` | 12 | ya (tergantung sumber) |
| `NORMALIZED_CODE_UNIT` | 3 | ya (tergantung sumber) |

| Status verifikasi | Jumlah |
| --- | --- |
| NEEDS_REVIEW | 294 |
| VERIFIED | 11 |
| SOURCE_REPORTED | 4 |

### Mengapa matching-nya tidak "kode dulu" seperti biasanya

Di repositori ini, kode kanonik memakai kode internal PDF sumber, yang **bertabrakan tetapi
tidak bermakna sama** dengan kode sumber harga. Delapan dari delapan tabrakan kode yang
disampel salah:

| Kanonik | Sumber harga |
| --- | --- |
| `E.11` CRANE ON TRACK 10-15 TON | `E.11` Plate Compactor |
| `E15` Wheel Loader | `E.15` Lowbed Trailer |
| `E12` Generator Set 134 KVA | `E.12` Dump Truck |
| `E08` Dump Truck 4 Ton | `E.08` Tandem Roller |

Karena itu setiap kecocokan kode **selalu digerbangi** kecocokan nama, dan join yang benar-
benar dipakai adalah **nama + satuan** terhadap **kunci komponen** (nama pemakaian komponen,
yang jauh lebih bersih daripada nama di resource master).

Dua cacat data yang ditemukan dan ditangani:

1. **Material salah kelas menjadi `laborComponents`** (baris berkode `M03`, `M14`, `M170`, …).
   Tipe komponen kini ditentukan dari **prefiks kode**, bukan dari array tempat ia muncul.
   Tanpa perbaikan ini, `M03|m3` bertipe `labor` dan **semua** sumber harga material ditolak.
2. **Nama resource master tercemar** (353 SUSPECT + 117 DEFECTIVE). Kunci komponen memilih
   label yang bersih, dan nama yang seluruhnya artefak tidak pernah dipakai untuk name-match.

---

## 5. Cakupan

| Tipe | Kunci berharga | Cakupan kunci | Cakupan berbobot pemakaian |
| --- | --- | --- | --- |
| material | 40/642 | 6.23% | **34.75%** |
| labor | 10/22 | 45.45% | **93.72%** |
| equipment | 21/118 | 17.8% | **41.23%** |
| **total** | 71/782 | 9.08% | **76.95%** |

Perbedaan besar antara cakupan kunci dan cakupan berbobot itu penting: hanya sedikit kunci, tetapi kunci itulah yang dipakai ribuan kali (tenaga kerja 93,72% berbobot).

### Status harga per item AHSP

| Status | Jumlah | Arti |
| --- | --- | --- |
| FULL | 1235 | semua komponen berharga |
| PARTIAL | 3488 | sebagian berharga; total tidak lengkap dan itu ditandai |
| MISSING | 113 | tidak ada komponen yang berharga; total = `null` |
| NO-COMP | 965 | item tanpa komponen (mis. baris SMKK) |

### Kualitas resource master kanonik

CLEAN **3428** · SUSPECT **353** · DEFECTIVE **117**

### Blocker terbesar (kunci tanpa harga, menurut frekuensi pemakaian)

| Tipe | Kode | Satuan | Pemakaian | Nama |
| --- | --- | --- | --- | --- |
| labor | `L.03` | OJ | 943 | Mandor |
| equipment | `E23` | jam | 244 | Water Tank Truck |
| equipment | `E.11` | jam | 135 | FLAT BED TRUCK 4 TON |
| equipment | `E08` | jam | 116 | DUMP TRUCK 4 TON; 134 HP |
| equipment | `E07` | jam | 111 | CRANE ON TRACK 10-15 TON |
| equipment | `E35` | jam | 106 | DUMP TRUCK TRONTON 10 TON |
| material | `EI311` | m3 | 86 | Galian Tanah Biasa |
| material | `M271` | m3 | 84 | Tanah Humus ketebalan 20 cm |
| material | `M272` | kg | 84 | Pupuk |
| equipment | `T.34` | jam | 77 | Trailer 10-20 ton (lebar 3,5 m x 8,0 m) |
| material | `M.23` | kg | 72 | Portland Cement |
| equipment | `E71` | jam | 65 | Mesin Bor |
| material | `M182` | kg | 60 | Super Plastizier |
| equipment | `E01` | jam | 51 | ASPHALT MIXING PLANT (AMP) |
| material | `M366` | batang | 48 | Bambu Penopang |

---

## 6. Bukti: Resolusi Nyata

### Harga satuan resource

- **Tenaga kerja `L.01` @ OH** → `Rp 140.000` · status `RESOLVED`
  - sumber: Master Upah Tenaga Kerja 2026 (EZRAB) (VERIFIED_REGIONAL, prioritas 3)
  - metode: `EXACT_CODE` · verifikasi: `VERIFIED`
  - periode: 2026-01 · lokasi: NATIONAL
- **Material `M03` @ m3** → `Rp 300.000` · status `RESOLVED`
  - sumber: Katalog Acuan HSD 2026 (OFFICIAL_GOVERNMENT, prioritas 1)
  - metode: `NAME_UNIT` · verifikasi: `NEEDS_REVIEW`
  - periode: 2026-Q1 · lokasi: NATIONAL
- **Alat `E71` @ jam (tidak ada di sumber)** → `null` · status `NOT_FOUND`

### Komposisi harga satuan AHSP (contoh nyata)

**A.1.01.a.1** — 1 m2 Pembersihan dan pengupasan permukaan tanah (striping) s.d. tanaman Ø 2 cm  
Satuan: m2 · status: **FULL**

| Tipe | Kode | Satuan | Koefisien | Harga satuan | Subtotal |
| --- | --- | --- | --- | --- | --- |
| labor | `L.01` | OH | 0.05 | Rp 140.000 | Rp 7.000 |
| labor | `L.04` | OH | 0.005 | Rp 230.000 | Rp 1.150 |
| | | | | **Harga satuan** | **Rp 8.150** |

---

## 7. Forensik Harga Nol

### Pembuktian dinamis

| Uji | Hasil |
| --- | --- |
| Resource berharga mengembalikan angka positif | true |
| Resource tanpa harga mengembalikan `null` | true |
| Resource tanpa harga **bukan** 0 | true |

### Sapuan statis

CRITICAL **227** · HIGH **131** · MEDIUM **0**

Situs fabrikasi terdaftar dari audit Phase 0: **12**, yang konstannya sudah
hilang dari kode: **5**.

Yang **sudah diperbaiki** dan dibuktikan oleh assert:

- konstanta karangan `150000` di `authoritativeAhspPriceBridge.lookupPrice()` — **dihapus**;
- `unitPrice: 0` untuk harga hilang — menjadi `null`;
- `priceResult.unitPrice || 0` di `deterministicRabDraftEngine` — **dihapus**;
- `unitPrice: number` pada `PriceLookupResult` / `RabReviewRowItem` / `DeterministicRabDraftItem`
  yang memaksa 0 sebagai pengganti `null` — menjadi `number | null`;
- `formatCurrencyIDR(null)` kini menampilkan `—`, bukan `Rp 0`.

Yang **masih terbuka** (jujur, belum diperbaiki) — sapuan statis menemukan pola `|| 0` pada
jalur harga di sejumlah komponen UI/engine lain, misalnya `EstimatorAhspView`,
`AhspExplorerView`, `WorkItemInspectorDrawer`, `EstimatingCopilotPanel`, `DedRabWorkflowView`,
`ahspCalculationEngine`, `projectPriceEngine`. Daftar lengkapnya ada di
`data/price2026/reports/zero_price_forensic.json`. Ini **pekerjaan lanjutan yang teridentifikasi**,
bukan klaim selesai.

---

## 8. Aturan yang Ditegakkan

| Aturan | Cara ditegakkan |
| --- | --- |
| AHSP kanonik tidak boleh berubah | `price:assert` memverifikasi tetap 5.801 item dan tetap bebas harga |
| Harga hilang = `null`, bukan 0 | `ResourcePriceResolution.price: number \| null`; resolver mengembalikan `null` |
| Tanpa fallback angka ajaib | assert memindai `\|\| 0` dan `?? 0` pada jalur harga |
| Tanpa harga lama tanpa alasan | `LEGACY_PUPR_2022` `active: false` |
| Tanpa klaim "resmi" tanpa sumber | `verificationStatus` per record + `sourceDocument` |
| Tanpa name-match diam-diam | `NAME_UNIT` tidak pernah boleh `VERIFIED` |
| Tanpa menghapus konflik harga | kandidat yang kalah disimpan di `alternatives` |
| Cakupan tidak dipaksa 100% | cakupan diukur & dilaporkan, tidak diassert |
| Resolusi deterministik | tiga pemanggilan berturut-turut identik byte-per-byte |
| Fail closed | `price:assert` keluar non-nol bila ada pelanggaran |

---

## 9. Perintah

```bash
npm run price:audit       # audit sumber harga yang ada
npm run price:normalize   # normalisasi satuan + provenance
npm run price:match       # matching ke resource kanonik
npm run price:coverage    # audit cakupan (33/34/35)
npm run price:assert      # gate keras (41/32/42/43)
npm run price:forensic    # forensik harga nol (42)
npm run price:report      # laporan ini (44)
npm run price:pipeline    # semuanya, berurutan
npm run test:price        # suite uji wajib (39)
```

---

## 10. Keterbatasan yang Diketahui

1. Cakupan material hanya ~6% per kunci. Sumber material utama memakai kosakata Inggris/
   generik sedangkan AHSP kanonik memakai istilah Indonesia, sehingga name-match tidak bisa
   diandalkan. Menutup celah ini memerlukan **alias yang didukung bukti** di
   `data/price2026/aliases.json`, bukan pemaksaan otomatis.
2. Sebagian besar record (294) berstatus `NEEDS_REVIEW` karena diikat lewat nama. Itu
   disengaja: menaikkannya ke `VERIFIED` tanpa bukti akan melanggar aturan.
3. Resource master kanonik masih memuat 353 baris SUSPECT dan 117 DEFECTIVE. Lapisan harga
   menghindarinya, tetapi sumbernya belum diperbaiki (di luar mandat).
4. Pemecahan komposisi 70/25/5 (material/tenaga/alat) di `spreadsheetApprovalEngine` masih
   merupakan estimasi struktur, bukan komposisi hasil resolver. Teridentifikasi, belum diubah.

---

_Laporan ini dihasilkan mesin dari artefak pipeline pada 2026-09-28T13:01:14.314Z._
