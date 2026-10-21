# TEMPLATE CATALOG 180 — LAPORAN AKHIR (Fase L)

**Status: READY WITH GAPS**
Tanggal: 2026-10-22 · Branch: `integrasi/unified-ui-engine` · HEAD awal: `f15d8fe`
Tidak ada staging/commit/push/deploy dalam batch ini (operasi Git terpusat oleh Muse setelah laporan ini, sesuai otorisasi user 2026-10-22 03:26).

---

## A. Ringkasan Eksekutif

Katalog template RAB resmi EZRAB diperluas dari **52 menjadi tepat 180 template aktif** (128 template baru, 25 kategori), dengan seluruh 52 ID legacy dipertahankan utuh. Mesin generate kini menyelesaikan harga melalui **resolver AHSP 2026 resmi** dengan pelabelan jujur: harga resmi hanya bila kode terverifikasi di katalog kanonis + satuan lolos unit-gate + komposisi resolver `FULL`; selain itu `REFERENCE_PRICE`; tidak ada sumber → `unitPrice: null` (tidak pernah Rp0, tidak pernah angka fallback karangan seperti perilaku lama `150000`).

Hasil generate default (level COMPREHENSIVE, seluruh katalog): **2.098 item — 818 OFFICIAL_AHSP (39%), 1.216 REFERENCE_PRICE (58%), 64 tanpa harga (3%, ditandai total PARSIAL)**. Untuk 128 template baru saja: 1.378 item — 818 resmi (59%), 496 referensi (36%), 64 tanpa harga (5%).

Verifikasi: suite katalog baru **10/10 grup PASS**, suite legacy **11/11 PASS**, `test:core` 74/74, `test:ded-rab` lulus rantai, `test:price` 69/2 (persis baseline pra-eksisting), tsc **0 error**, **build vite standar LULUS** (exit 0, 1m41s).

Kesenjangan yang tersisa (dirinci di §H): 55 komponen baru berstatus `UNIT_MISMATCH` (harga jatuh ke referensi secara aman — bukan resmi), konsolidasi penuh master registry belum dilakukan (konsumen Chat AI terpagari), dan fallback `buildingType: 'Custom'` di WorkspaceView untuk kategori baru (file terpagari, tidak boleh diedit batch ini).

---

## B. Fase A — Audit Awal (temuan terverifikasi, bukan asumsi)

1. **Katalog hidup** adalah `RabTemplateService.seedOfficialTemplates` (`src/services/rabTemplateService.ts`): tepat 52 template, 14 kategori, **732 komponen — setiap komponen legacy MEMILIKI `unitPrice` hardcode DAN `ahspCode`**.
2. **Temuan harga menentukan (probe resolver):** dari 78 pasangan kode+satuan distinct pada komponen legacy, **0 (nol) ditemukan di katalog AHSP 2026 kanonis** (`officialAhspRepository.hasOfficialAhsp` = false untuk semuanya; peta DHSP CK/BM juga tidak memuat kode-kode template tersebut — kode BM kanonis berbentuk huruf, mis. `G.188`). Katalog kanonis berisi ±4.700 item (CK numerik `2.2.1.4.1`, SDA `A.x`, BM huruf, SMKK) dan resolver menghasilkan komposisi `FULL` berharga nyata untuk banyak item kanonis (sampel acak 7/10 FULL, 9/10 berharga).
   **Konsekuensi:** seluruh harga seed legacy secara faktual adalah **harga referensi**, dan perilaku lama yang melabeli item bercode sebagai `OFFICIAL_AHSP` adalah label yang tidak jujur. Fase F memperbaikinya (§F).
3. **Kontrak jalur harga resmi:** gerbang = `officialAhspRepository.getOfficialAhsp(code)` (alias/quarantine-aware) → unit-gate `unitsCompatible` (`src/data/priceDatabase2026/normalize.ts`) → `priceResolver2026.resolveAhspUnitPrice(item)` harus `pricingStatus === 'FULL'` dan `hspPrice > 0`. Komposisi menyediakan split upah/material/alat riil + `provenanceSource`.
4. **Sistem ganda dikonfirmasi:** `masterTemplateRegistry` (`src/data/buildingTemplates/`, 7 template, skema berbeda berbasis fungsi `quantityRule`) melayani Chat AI/Desain; `TemplateRabMinimal.tsx` tidak terpakai. Penanganan di §D.
5. **Fase G (estimasi global):** `GlobalEstimationSettingsModal` (overhead/profit/PPN/waste) hidup sebagai state di `TemplateRabCatalogView` dan hanya diteruskan ke modal — **alur apply template tidak pernah menerapkan markup global**, jadi tidak ada double-counting dari sisi template. Peringatan yang didokumentasikan di UI & kode: harga resmi adalah **DHSP yang sudah termasuk overhead & profit** (SE DJBK No. 47/SE/Dk/2026) — markup global tidak boleh ditambahkan lagi ke item `OFFICIAL_AHSP`.

---

## C. Fase B — Distribusi Final (180) & Deviasi dari Tabel Target

Distribusi final **persis** sebagai berikut (dihitung dari service, bukan klaim):

| Kategori | Jumlah | Δ dari 52 |
|---|---:|---:|
| Rumah Tinggal | 18 | 0 |
| Jalan & Transportasi | 10 | +5 |
| SDA & Irigasi | 10 | +6 |
| Perkerasan | 7 | +4 |
| Gedung | 8 | +5 |
| Utilitas | 8 | +5 |
| Bangunan Tinggi | 6 | +4 |
| Hotel & Hospitality | 6 | +4 |
| Kesehatan | 6 | +4 |
| Pendidikan | 6 | +4 |
| Industri | 7 | +5 |
| Landscape & Site | 6 | +4 |
| MEP & Sistem | 9 | +7 |
| Renovasi & Maintenance | 8 | +6 |
| Pondasi & Geoteknik *(baru)* | 7 | — |
| Jembatan & Struktur *(baru)* | 7 | — |
| Drainase & Sanitasi *(baru)* | 7 | — |
| Pekerjaan Tanah *(baru)* | 6 | — |
| Struktur Beton & Baja *(baru)* | 7 | — |
| Finishing & Interior *(baru)* | 6 | — |
| Atap & Waterproofing *(baru)* | 5 | — |
| Pertanian & Perkebunan *(baru)* | 5 | — |
| Pelabuhan & Pesisir *(baru)* | 5 | — |
| Fasilitas Olahraga *(baru)* | 5 | — |
| Demolisi & Rekonstruksi *(baru)* | 5 | — |
| **TOTAL** | **180** | **+128** |

**Deviasi dari tabel target Fase B pada master prompt** (dilaporkan sesuai kewajiban): Industri 7 (target 8, −1), MEP 9 (target 10, −1), Pondasi & Geoteknik 7 (target 8, −1), Jembatan & Struktur 7 (−1), Drainase & Sanitasi 7 (−1), Struktur Beton & Baja 7 (−1). Selisih didistribusikan ke kategori lain agar total tetap tepat 180 tanpa template pengisi kosmetik — setiap template baru memiliki scope yang benar-benar berbeda (diverifikasi manual per definisi; tidak ada duplikasi ganti-nama).

11 anggota `TemplateCategory` baru ditambahkan secara aditif. Template kustom pengguna (localStorage `ezrab_custom_rab_templates`) **tidak pernah** terhitung dalam 180 dan CRUD-nya terverifikasi tetap berfungsi (Grup Uji 9).

---

## D. Fase C — Adapter Kanonis & Konsolidasi yang Tersisa

Dibuat `src/services/rabTemplateCatalogAdapter.ts` (baru, hanya mengimpor — tidak mengedit file terpagari):

- `listUnifiedTemplates()` — daftar gabungan bertanda sumber: 180 entri `CATALOG` + entri master-only (hasil runtime: **181 entri**; 6 pasangan tumpang-tindih tertaut, mis. `HOUSE-T36-1FL` ↔ `template-house-type-36-single-floor`; satu master tanpa padanan katalog: `template-shophouse-2-floor`).
- `findUnifiedTemplate(idOrCode)` — katalog didahulukan (kanonis), lalu registry.
- `catalogToMasterSummary(t)` — proyeksi ringkasan read-only ke bentuk deskriptif master, berstatus eksplisit `'summary-only'`.

**Konsolidasi yang SENGAJA tersisa** (memerlukan grant terpisah): (1) konsumen Chat AI/Desain masih membaca `masterBuildingTemplateRegistry` secara langsung — file-file mereka terpagari Batch Chat-to-RAB sehingga tidak dialihkan ke adapter pada batch ini; (2) konversi eksekutabel katalog→master tidak dilakukan: `quantityRule` master berupa fungsi dengan `CalculationTrace` bertahap, sedangkan katalog memakai formula string — menerjemahkan 180 template secara otomatis berarti mengarang perilaku volume; (3) registry master tetap 7 template warisan.

---

## E. Fase D & E — Skema dan Mesin Volume Deterministik

**Skema (aditif, `src/types/rabTemplate.ts` + `src/types/index.ts`):** 11 kategori baru; `AhspMappingStatus` (`VERIFIED | MAPPED_UNPRICED | UNIT_MISMATCH | NEEDS_MAPPING | NOT_APPLICABLE`); `TemplatePriceSummary`; `TemplateMappingReadiness`; field opsional komponen `mappingStatus?`/`priceNote?`; field template `assumptions?`/`exclusions?`/`validationRules?`/`formulaVersion?`; traceability diperluas `mappingStatus?`/`validationStatus?`/`priceSourceName?`; hasil generate membawa `priceSummary?`/`generationStatus?`/`missingRequiredParams?`; `RabItem.ahspMappingStatus?`/`priceSourceName?`. Tidak ada field lama yang diubah/dihapus.

**Setiap template baru** (128) memiliki: tier STANDARD + PROFESSIONAL + COMPREHENSIVE nyata, komponen wajib + opsional, dependensi formula yang hanya merujuk parameter terdeklarasi (diasertikan otomatis), `assumptions` & `exclusions` tertulis, `formulaVersion: '1.0'`. Total komponen baru: **1.378** (rata-rata ±10,8 per template; minimum 6).

**Mesin volume:** guard Fase E aktif — hasil formula non-finite/negatif → volume 0 + penanda `INVALID` terlihat pada catatan item (tidak diklem diam-diam); parameter wajib tanpa nilai & tanpa default → status generate `INCOMPLETE_MISSING_PARAMS` (bukan dimensi karangan); traceability per item lengkap (template+versi, formula, volume, satuan, kode AHSP + status pemetaan, sumber harga + nama sumber, status validasi).

Satu koreksi integritas data saat penulisan seed: komponen lantai `BLD-HEALTH-PUSKESMAS` & `BLD-HEALTH-LAB` semula memakai kode `3.10.2.1` yang ternyata item **dinding** homogeneous tile di katalog kanonis — kode dicabut dan diganti lantai vinyl homogeneous harga referensi dengan catatan eksplisit, agar pemetaan tidak menyesatkan.

---

## F. Fase F & G — Integritas Harga (prinsip tertinggi)

**Mekanisme** (`resolveTemplateComponentPrice` di service, menggantikan jalur lama): gerbang resmi tiga lapis (§B.3) → harga material tertaut (referensi) → harga bawaan komponen (referensi) → `null`. Label traceability kini **diturunkan dari resolusi nyata item**, bukan dari sekadar adanya `ahspCode`. Split biaya: komposisi resolver riil untuk item resmi; rasio legacy 70/25/5 dipertahankan hanya untuk tampilan item referensi (total legacy tidak berubah — dibuktikan suite legacy).

**Statistik pemetaan (terukur, bukan estimasi):**

| Metrik | Nilai |
|---|---:|
| Komponen baru berkode kanonis terverifikasi (lolos lookup+unit-gate) | 968 / 1.378 (70%) |
| Komponen baru berkode belum ditemukan di kanonis (`NEEDS_MAPPING` saat readiness) | 84 |
| Komponen baru tanpa kode (referensi murni / `NOT_APPLICABLE`) | 326 |
| Kode AHSP distinct yang teresolusi `OFFICIAL_AHSP` saat generate | 90 |
| Item baru @COMPREHENSIVE: `VERIFIED` | 818 |
| Item baru: `MAPPED_UNPRICED` (kode ada, komposisi PARTIAL → fallback referensi/null) | 150 |
| Item baru: `UNIT_MISMATCH` (fail-safe ke referensi, tidak pernah resmi) | 55 |
| Item baru: `NEEDS_MAPPING` saat generate | 29 |
| Item tanpa harga (`null`, total ditandai PARSIAL) — seluruh katalog | 64 |

Catatan kosmetik data kanonis (bukan kode batch ini): `provenanceSource` untuk kode `C.37` terbaca `"SE DJBK No. 47/SE/Dk/2026 (undefined, Baris undefined)"` — metadata baris sumber memang kosong pada data kanonis untuk item tersebut.

**Pengungkapan koreksi test legacy:** `src/test/rabTemplateExpansion.test.ts` baris 353 semula mengasertikan `traceRigid.priceSource === 'OFFICIAL_AHSP'` untuk kode `BM.7.1.1` — asersi itu mengkodekan persis perilaku tidak jujur yang Fase F perintahkan untuk diperbaiki (kode tersebut tidak ada di katalog kanonis; lihat §B.2). Asersi dikoreksi menjadi `'REFERENCE_PRICE'` dengan komentar penjelasan di tempat. **Tidak ada asersi lain yang diubah** — seluruh total & jumlah item legacy (mis. HOUSE-T36-1FL Rp 122.988.600/26 item; jalan rigid 1.200 m³, total Rp 3.481.800.000) lolos persis seperti sebelumnya.

---

## G. Fase H — UX Katalog

- `TemplateRabCatalogView.tsx` (edit aditif; file yang sama juga memuat paket poles UI dari agen paralel — tidak ada tumpang tindih wilayah edit): 11 kategori baru di `CATEGORY_ITEMS` + ikon `getCategoryIcon`; setiap kartu kini menampilkan **strip kejujuran harga dari `priceSummary` hasil generate nyata** (n Harga Resmi AHSP · n Harga Referensi · peringatan "Belum Ada Harga — Total Parsial") dan **badge "Pemetaan AHSP n%"** dari `getTemplateMappingReadiness()` yang dihitung dari katalog kanonis. Pencarian/filter/pagination (12/halaman) terverifikasi tetap benar pada 180 (Grup Uji 11 suite legacy: pencarian "hotel" kini memuat 7 hasil termasuk template baru).
- `TemplatePreviewDrawer.tsx`: panel baru "Sumber Harga & Pemetaan AHSP" — jumlah komponen (wajib/opsional), persen pemetaan terverifikasi + rincian kode, komposisi sumber harga pada level aktif, peringatan total parsial, catatan DHSP-sudah-termasuk-overhead, serta daftar **Asumsi** dan **Tidak termasuk** dari template.
- `UniversalTemplateConfigurator.tsx`: blok **"Review Sumber Harga"** (Fase F.8) pada panel preview sebelum tombol terapkan — hitungan resmi/referensi/belum-terpetakan, peringatan item tanpa harga (diterapkan dengan harga kosong, bukan Rp0), dan catatan anti-double-counting markup global.
- **Gap yang tidak dapat diperbaiki batch ini:** `WorkspaceView.tsx` (terpagari) memetakan `buildingType` proyek dari kategori dengan ternary yang tidak mencakup 11 kategori baru → kategori baru jatuh ke `'Custom'` saat apply. Alur apply itu sendiri berfungsi (item masuk via `generateRabFromTemplate`); hanya label tipe bangunan proyek yang generik. Perbaikan satu baris di file tersebut memerlukan grant terpisah.

---

## H. Fase J & K — Pengujian, Build, Berkas, Langkah Berikutnya

**Hasil uji (semua dijalankan aktual pada tree final):**

| Suite | Hasil |
|---|---|
| `src/test/templateCatalog180.test.ts` (BARU, 10 grup) | **10/10 PASS** — 180 tepat, 52 legacy utuh, distribusi 25 kategori, struktur 180 template, generate aman 2.098 item, determinisme 180/180, perilaku resolver 7a–7f, filter opsional & monotonisitas level, CRUD kustom, adapter |
| `src/test/rabTemplateExpansion.test.ts` (legacy) | **11/11 PASS** (dengan koreksi baris 353 di §F) |
| `npm run test:core` | **74/74 PASS** |
| `npm run test:price` | **69 PASS / 2 FAIL** — persis baseline pra-eksisting terdokumentasi (RAB-01 pembulatan `A.1.02.4a.1.d`; AHSP-01 invariant sumber kanonis); tidak ada asersi yang dilemahkan |
| `npm run test:ded-rab` (rantai 5 suite) | **LULUS** (exit 0; suite penutup 9/9) |
| `docTemplatesPro.test.ts` (vitest) + `test:phase5_3` | **14/14** dan **28/28 PASS** |
| `tsc --noEmit --skipLibCheck` (heap 6 GB) | **exit 0 — 0 error seluruh repo** |
| `vite build` standar | **LULUS — exit 0, 1m41s** (hanya peringatan ukuran chunk pra-eksisting) |
| `git diff --check` | bersih |

Selama tsc pertama, ditemukan & diperbaiki bug data nyata: 22 komponen di dua file seed memakai kunci kelompok kerja yang salah ketik (`G.PINTU`/`G.PEKERASAN`/`G.JEMBATAN` tidak ada di builders) sehingga kategorinya `undefined` saat runtime. Sudah diperbaiki (`KUSEN`/`PERKERASAN`/`STRUKTUR`) dan suite katalog kini mengasertikan kelompok kerja WBS kanonis untuk semua template baru agar kelas bug ini tertangkap otomatis.

**Berkas batch ini** (tidak ada yang di-stage/commit oleh subagent):
- Baru: `src/data/templateCatalog180/` (9 file: builders + 7 file seed + index), `src/services/rabTemplateCatalogAdapter.ts`, `src/test/templateCatalog180.test.ts`, laporan ini.
- Diubah (aditif): `src/services/rabTemplateService.ts` (+275/−baris terkait), `src/types/rabTemplate.ts`, `src/types/index.ts`, `src/components/templates/TemplateRabCatalogView.tsx`, `src/components/templates/TemplatePreviewDrawer.tsx`, `src/components/templates/UniversalTemplateConfigurator.tsx`, `src/test/rabTemplateExpansion.test.ts` (hanya koreksi §F).
- File terpagari (Batch 0B/0C/Chat-to-RAB, `Sidebar.tsx`, `dictionaries.ts`, `WorkspaceView.tsx`): **tidak disentuh**.

**NOT_RUN / belum terverifikasi:** uji browser visual katalog 180 (headless Chromium sandbox tidak dapat me-mount aplikasi React penuh — keterbatasan lingkungan terdokumentasi; verifikasi UI dilakukan pada level tsc + build + logika hitung), uji cetak/PDF alur template.

**Langkah berikutnya yang disarankan (di luar grant batch ini):** (1) grant kecil untuk memetakan `buildingType` kategori baru di `WorkspaceView.tsx`; (2) pekerjaan pemetaan lanjutan untuk 84 komponen `NEEDS_MAPPING` + 55 `UNIT_MISMATCH` agar cakupan resmi naik dari 70%; (3) keputusan konsolidasi master registry (§D) sebelum konsumen Chat AI dialihkan ke adapter.
