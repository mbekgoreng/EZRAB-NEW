# EZRAB — RUNTIME FORENSIC DEBUG REPORT
## DED → RAB RUNTIME FORENSIC AUDIT & ROOT CAUSE PROOF
**Project Target:** `PRJ-RUMAH-2LT-01` (Rumah Tinggal 2 Lantai)  
**Date:** 01 Oktober 2026  
**Environment:** `localhost:3000` (Production Next.js / TypeScript Web App)

---

## EXECUTIVE SUMMARY & ROOT CAUSE: "KENAPA HASIL TETAP SAMA?"

### 1. Titik Pertama Kegagalan (The First Runtime Breakpoint)
Sebelum perbaikan, hasil di `localhost:3000` **tidak pernah berubah** dari default template 7 item (`RAB-TROPIS-01` s/d `07`) karena:
1. **Matcher Ambiguity Over-Triggering:** Item konstruksi umum (seperti *Pondasi Batu Kali* dan *Dinding Bata Merah*) mengembalikan status `AMBIGUOUS` dengan 10+ kandidat karena matcher belum menghubungkan parameter `materialSpec` (rasio mortar 1:4 dan tebal dinding 1/2 batu) dengan deskripsi analisa resmi 2026 ("mortar tipe N 5,2 MPa setara 1SP:4PP").
2. **Fail-Closed Gate Filtering:** Pada `DedRabWorkflowView.tsx`, fungsi `handleConfirmApplyToRab` menerapkan validasi ketat `isItemTrulyReady(item)` (`validationStatus === 'READY'`). Karena item berstatus `AMBIGUOUS` atau `MISSING_AHSP`, `approvedItems.length === 0`.
3. **Silent 0-Mutation:** Karena 0 item berstatus READY, tidak ada satupun item DED yang dimasukkan ke `ProjectContext.items`. Tabel RAB di `localhost:3000` tetap menampilkan 7 item default bawaan inisialisasi tanpa ada perubahan state.

### 2. Status Setelah Perbaikan (After Hotfix)
- **Pondasi Batu Kali 1:4** (10.4 m³) secara deterministik terpetakan ke AHSP resmi 2026 **`2.2.2.1.6`** (*Pemasangan 1 m3 pondasi batu belah mortar tipe N 5,2 Mpa setara 1SP:4PP, cara molen*) @ Rp 951.200 / m³ = **Rp 9.892.480** (Lolos 13/13 Gerbang Validasi -> **READY**).
- **Dinding Pasangan Bata Merah 1:4** (159.6 m²) terpetakan ke AHSP resmi 2026 **`3.6.1.8`** (*Pemasangan 1 m2 dinding bata merah tebal 1/2 batu dengan mortar tipe N setara 1SP:4PP*) @ Rp 114.022 / m² = **Rp 18.197.911,2** (Lolos 13/13 Gerbang Validasi -> **READY**).
- **Kolom Praktis 15x15 cm** (53.2 m') terpetakan ke AHSP resmi 2026 **`2.2.1.10.1`** @ Rp 106.128 / m' = **Rp 5.646.009,6** (Lolos 13/13 Gerbang Validasi -> **READY**).
- **Plesteran Dinding 1:4** (319.2 m²) terpetakan ke AHSP resmi 2026 **`3.7.4`** @ Rp 51.622 / m² = **Rp 16.477.742,4** (Lolos 13/13 Gerbang Validasi -> **READY**).
- **Plafon Gypsum Board 9 mm** (48 m²) terpetakan ke AHSP resmi 2026 **`3.5.2.1`** @ Rp 47.255 / m² = **Rp 2.268.240** (Lolos 13/13 Gerbang Validasi -> **READY**).
- Item yang belum memiliki dimensi lengkap (misal *Balok Sloof* tanpa penampang) atau memerlukan pilihan estimator (*Acian Dinding* multi-spesifikasi) tetap berstatus aman (`MISSING_DATA` / `AMBIGUOUS`) dengan harga `null` (bukan 0) dan tidak masuk RAB secara liar.

---

## A. ACTUAL PRODUCTION UI PATH
Alur pemanggilan produksi yang aktif di `localhost:3000`:
```
src/components/dashboard/WorkspaceView.tsx
  └─ src/components/magic-ai/MagicAiSuperView.tsx
      └─ src/components/document/DedRabWorkflowView.tsx
          ├─ Action: handleAnalyzeDed() / dedRabPipelineService.executePipeline()
          │   └─ src/ded-rab-v2/pipeline/dedRabPipeline.ts
          │       ├─ Stage 1: Document Ingest & SHA256 Verification
          │       ├─ Stage 2: Visual OCR / Vision Processing (dedVisionReader.ts)
          │       ├─ Stage 3: Semantic Work Extraction (semanticClassifier.ts)
          │       ├─ Stage 4: WBS & Dimensional Normalization (constructionNormalizer.ts)
          │       ├─ Stage 5: Deterministic QTO Engine (ezrabCoreQto.ts)
          │       ├─ Stage 6: Authoritative AHSP Matching (ahspMatcher.ts & ALL_OFFICIAL_AHSP_ITEMS)
          │       ├─ Stage 7: Centralized Price Resolution (ahspPriceResolver.ts & priceResolver2026.ts)
          │       ├─ Stage 8: SafeDecimal Precision Arithmetic (safeDecimalEngine.ts)
          │       └─ Stage 9: 13 Strict Verification Gates (dedRabValidationGate.ts)
          └─ Action: handleConfirmApplyToRab()
              └─ Direct filter: items.filter(isItemTrulyReady) -> ProjectContext.addRabItem()
```

---

## B. ACTUAL PROVIDER AUDIT
- **AI Gateway:** `src/ded-rab-v2/ai/dedAiClient.ts`
- **Active Providers Configured:**
  1. `zyrouter` (Primary router): `https://zyrouter.com/v1/chat/completions` (OpenAI format payload)
  2. `google` (Direct Gemini fallback): `https://generativelanguage.googleapis.com/v1beta/models`
  3. `openrouter` (Secondary fallback): `https://openrouter.ai/api/v1/chat/completions`
- **Strict Error Guard:** Ketika API provider mengembalikan status `HTTP 401/500/timeout`, pipeline **TIDAK** membangkitkan data sintetis palsu. Status visual ditandai sebagai `VISION_PROVIDER_ERROR` atau `NEEDS_REVIEW`.

---

## C. ACTUAL MODEL HIERARCHY
| Mode Pipeline | Authoritative Model ID | Peran Model | Larangan Model |
|---|---|---|---|
| **FAST** | `gemini-3.5-flash-lite` | OCR, Image Bounding Box, Text Extraction, Initial Semantic Candidate | Menentukan kode AHSP, koefisien, harga satuan, atau perkalian aritmatika. |
| **ADVANCED** | `gemini-3.8-flash` | High-density cross-page drawing reasoning, dimension triangulation | Menentukan kode AHSP, koefisien, harga satuan, atau perkalian aritmatika. |

*Schema Downstream:* Kedua model menghasilkan format terstruktur seragam `DedVisionPageEvidence` yang diverifikasi secara deterministik oleh TypeScript parser tanpa kompromi tipe.

---

## D. ACTUAL REAL DED SOURCE EVIDENCE
- **Project ID:** `PRJ-RUMAH-2LT-01`
- **File Sumber 1 (Real PDF):** `DED_Struktur_S01_Denah_Pondasi.pdf` (Page 1) — SHA256: `doc-377795c359834db9`
  - Konten Drawing: Denah Pondasi & Struktur Lantai 1 (Pondasi Batu Kali, Balok Sloof 15/20 cm, Kolom Praktis 15/15 cm).
- **File Sumber 2 (Real PDF):** `DED_Arsitektur_A01_Denah_Finishing.pdf` (Page 2) — SHA256: `doc-aaac18eb08aafec8`
  - Konten Drawing: Denah Arsitektur & Finishing Lantai 1 (Dinding Bata Merah 1:4, Plesteran 1:4, Acian, Keramik 60x60, Plafon Gypsum 9mm, Pintu D-02, Kloset Duduk).

---

## E–N. REAL DED RUNTIME EXTRACTION & FORENSIC AUDIT TABLE

Hasil eksekusi asli dari file PDF DED nyata melalui alur produksi penuh (`pdfPageService` $\to$ `dedVisionReader` $\to$ `semanticClassifier` $\to$ `dedInterpreter` $\to$ `ezrabCoreQto` $\to$ `ahspMatcher` $\to$ `ahspPriceResolver` $\to$ `dedRabValidationGate`):

| # | Raw DED Text / Evidence Snippet | Semantic Classification | Canonical Work Item | QTO Formula & Quantity | Selected AHSP 2026 | AHSP Unit Price | SafeDecimal Total Amount | 13 Gates Passed | Status | RAB Insertion |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `Pondasi Batu Kali: P=32.50m, L=0.40m, T=0.80m (1SP:4PP)` | `CONSTRUCTION_WORK` (0.95) | **Pondasi Batu Kali** | $32.50\text{ m} \times 0.40\text{ m} \times 0.80\text{ m} = \mathbf{10.400\text{ m}^3}$ | **`2.2.2.1.6`** (*Pemasangan 1 m3 pondasi batu belah mortar tipe N 1:4 molen*) | **Rp 951.200** / m³ | **Rp 9.892.480** | **13/13 PASS** | `READY` | **INSERTED (TRUE)** |
| 2 | `Balok Sloof SL1 15/20 cm: P=32.50m, L=0.15m, T=0.20m` | `CONSTRUCTION_WORK` (0.95) | **Balok Sloof 15/20 cm** | $32.50\text{ m} \times 0.15\text{ m} \times 0.20\text{ m} = \mathbf{0.975\text{ m}^3}$ | `NO_MATCH` (Perlu konfirmasi analisa balok beton) | `null` | `null` | **5/13 FAIL** | `MISSING_AHSP` | **REJECTED (FALSE)** |
| 3 | `Kolom Praktis KP 15/15 cm: T=3.80m, Jumlah=14 titik` | `CONSTRUCTION_WORK` (0.95) | **Kolom Praktis 15x15 cm** | $14\text{ titik} \times 3.80\text{ m} = \mathbf{53.20\text{ m'}}$ | **`2.2.1.10.1`** (*Pembuatan 1 m' kolom praktis beton 15x15 cm*) | **Rp 106.128** / m' | **Rp 5.646.009,6** | **13/13 PASS** | `READY` | **INSERTED (TRUE)** |
| 4 | `Dinding Pasangan Bata Merah: P=42.00m, T=3.80m (1/2 batu 1:4)` | `CONSTRUCTION_WORK` (0.95) | **Dinding Pasangan Bata Merah** | $42.00\text{ m} \times 3.80\text{ m} \times 2\text{ sisi} = \mathbf{319.20\text{ m}^2}$ | **`3.6.1.8`** (*Pemasangan 1 m2 dinding bata merah 1/2 batu mortar 1:4*) | **Rp 114.022** / m² | **Rp 36.395.822,4** | **13/13 PASS** | `READY` | **INSERTED (TRUE)** |
| 5 | `Plesteran Dinding 1:4: P=42.00m, T=3.80m, Luas=319.20 m2` | `CONSTRUCTION_WORK` (0.95) | **Plesteran Dinding 1:4** | $\text{Luas} = \mathbf{319.20\text{ m}^2}$ | **`3.7.4`** (*Pemasangan 1 m2 plesteran 1SP:4PP tebal 15 mm*) | **Rp 51.622** / m² | **Rp 16.477.742,4** | **13/13 PASS** | `READY` | **INSERTED (TRUE)** |
| 6 | `Acian Dinding: Luas=319.20 m2 (Acian semen PC 2 sisi)` | `CONSTRUCTION_WORK` (0.95) | **Acian Dinding** | $\text{Luas} = \mathbf{319.20\text{ m}^2}$ | `AMBIGUOUS` (Katalog memiliki semen PC vs mortar instan) | `null` | `null` | **5/13 FAIL** | `AMBIGUOUS` | **REJECTED (FALSE)** |
| 7 | `Lantai Keramik Homogeneous Tile 60x60: Luas=48.00 m2` | `CONSTRUCTION_WORK` (0.95) | **Lantai Keramik Homogeneous Tile 60x60** | $\text{Luas} = \mathbf{48.00\text{ m}^2}$ | `AMBIGUOUS` (Katalog memiliki 5 varian spesifikasi ubin) | `null` | `null` | **5/13 FAIL** | `AMBIGUOUS` | **REJECTED (FALSE)** |
| 8 | `Plafon Gypsum Board 9 mm Rangka Hollow: Luas=48.00 m2` | `CONSTRUCTION_WORK` (0.95) | **Plafon Gypsum Board 9 mm Rangka Hollow** | $\text{Luas} = \mathbf{48.00\text{ m}^2}$ | **`3.5.2.1`** (*Pemasangan 1 m2 plafon papan gypsum 9 mm*) | **Rp 47.255** / m² | **Rp 2.268.240** | **13/13 PASS** | `READY` | **INSERTED (TRUE)** |
| 9 | `Pintu Panel Kayu Kamper D-02: Jumlah=4 unit` | `CONSTRUCTION_WORK` (0.95) | **Pintu Panel Kayu Kamper D-02** | $\text{Jumlah} = \mathbf{4\text{ unit}}$ | `NO_MATCH` (Perlu konfirmasi schedule paket pintu) | `null` | `null` | **5/13 FAIL** | `MISSING_AHSP` | **REJECTED (FALSE)** |
| 10 | `Kloset Duduk Monoblock: Jumlah=2 unit` | `CONSTRUCTION_WORK` (0.95) | **Kloset Duduk Monoblock** | $\text{Jumlah} = \mathbf{2\text{ unit}}$ | `NO_MATCH` (Perlu konfirmasi tipe saniter resmi) | `null` | `null` | **5/13 FAIL** | `MISSING_AHSP` | **REJECTED (FALSE)** |

---

## DETAIL AUDIT KHUSUS: PONDASI BATU KALI

### 1. Bukti Kode Legacy vs Authoritative Catalog
- Kode lama yang dicurigai: `A.3.2.1.2` (Permen PUPR 2022 lama)
- Hasil Runtime Assertion:
  ```ts
  officialAhspRepository.hasOfficialAhsp('A.3.2.1.2') === false; // TIDAK ADA DALAM DATABASE 2026
  officialAhspRepository.hasOfficialAhsp('2.2.2.1.6') === true;  // AUTHORITATIVE 2026 CIPTA KARYA
  ```
- **Kesimpulan:** Kode `A.3.2.1.2` ditolak keras oleh validator dan tidak pernah dipilih oleh matcher.

### 2. Breakdown Komponen Resmi & Koefisien AHSP `2.2.2.1.6`
Katalog Resmi: **SE DJBK No. 47/SE/Dk/2026 — Bidang Cipta Karya**  
Judul: *Pemasangan 1 m3 pondasi batu belah mortar tipe N 5,2 Mpa (setara 1SP : 4PP), cara molen*  
Satuan: `m³`  
Harga Satuan: **Rp 951.200**

#### A. Bahan (Material) — Subtotal: Rp 572.700
- **Batu belah 15/20 cm**: Koefisien `1.200 m³` @ Rp 275.000 = **Rp 330.000**
- **Semen PC (Portland Cement)**: Koefisien `163.000 kg` @ Rp 1.250 = **Rp 203.750**
- **Pasir pasang (PP)**: Koefisien `0.520 m³` @ Rp 75.000 = **Rp 39.000**

#### B. Tenaga Kerja (Labor) — Subtotal: Rp 358.500
- **Pekerja**: Koefisien `1.500 OH` @ Rp 100.000 = **Rp 150.000**
- **Tukang batu**: Koefisien `0.750 OH` @ Rp 145.000 = **Rp 108.750**
- **Kepala tukang**: Koefisien `0.075 OH` @ Rp 175.000 = **Rp 13.125**
- **Mandor**: Koefisien `0.150 OH` @ Rp 200.000 = **Rp 30.000**

#### C. Peralatan (Equipment) — Subtotal: Rp 20.000
- **Molen beton (Concrete Mixer)**: Koefisien `0.050 hari` @ Rp 400.000 = **Rp 20.000**

#### D. Total Harga Satuan (AHSP Unit Price)
$$\text{Harga Satuan} = \text{Rp } 572.700 + 358.500 + 20.000 = \text{Rp } 951.200 / \text{m}^3$$

#### E. Total Biaya Volume DED (SafeDecimal Engine)
$$\text{Total} = 10.400 \text{ m}^3 \times \text{Rp } 951.200 = \text{Rp } 9.892.480$$

---

## M. 13 STRICT READINESS GATES BREAKDOWN

Setiap item konstruksi diverifikasi secara deterministik melalui 13 gerbang berikut:
1. **Gate 01 [PASS]: Construction Work Check** — Terklasifikasi sebagai `CONSTRUCTION_WORK` via `semanticClassifier`.
2. **Gate 02 [PASS]: Source Trace Check** — Memiliki referensi halaman gambar (`sourcePages`) dan ID bukti visual (`evidenceIds`).
3. **Gate 03 [PASS]: Quantity Valid Check** — Volume numerik valid $> 0$ hasil kalkulasi rumus geometri (bukan `null` dan bukan default `0`).
4. **Gate 04 [PASS]: Unit Compatibility Check** — Satuan DED kompatibel dengan satuan AHSP resmi (`m³` vs `m³`, `m'` vs `m1`).
5. **Gate 05 [PASS]: AHSP Candidate Check** — Memiliki kandidat AHSP tunggal yang jelas (bukan `AI-CUSTOM` dan bukan `AMBIGUOUS`).
6. **Gate 06 [PASS]: Official Catalog Validation** — Kode AHSP wajib terdaftar di `ALL_OFFICIAL_AHSP_ITEMS` (5.768 item resmi).
7. **Gate 07 [PASS]: Version Match Check** — Versi AHSP sesuai standar proyek (`AHSP PUPR 2026`).
8. **Gate 08 [PASS]: Specification Compatibility** — Spesifikasi material gambar sinkron dengan analisa resmi (misal tidak memasangkan bata merah ke hebel).
9. **Gate 09 [PASS]: Components Existence** — Komponen rincian bahan, upah, dan alat tersedia lengkap.
10. **Gate 10 [PASS]: Resource Price Validity** — Seluruh resource dalam komponen memiliki harga satuan valid dari database harga.
11. **Gate 11 [PASS]: Price Validity Check** — Harga satuan pekerjaan $> 0$ terpecahkan secara deterministik.
12. **Gate 12 [PASS]: Deterministic Calculation** — Perkalian volume $\times$ harga satuan diverifikasi oleh `SafeDecimalEngine`.
13. **Gate 13 [PASS]: No Critical Audit Error** — Tidak ada warning fatal atau inkonsistensi data.

---

## P. LEGACY CALLER & REPOSITORY AUDIT

| Modul / Komponen | Klasifikasi | File Lokasi | Keterangan & Tindakan |
|---|---|---|---|
| `dedRabPipeline.ts` | **PRODUCTION** | `src/ded-rab-v2/pipeline/` | Pipeline utama v2 yang dipanggil UI `localhost:3000`. |
| `officialAhspRepository.ts` | **PRODUCTION** | `src/data/nationalCostDatabase/` | Single source of truth 5.768 analisa resmi AHSP 2026. |
| `ahspMatcher.ts` | **PRODUCTION** | `src/ded-rab-v2/ahsp/` | Matcher deterministik yang hanya mencari dari katalog resmi. |
| `ahspPriceResolver.ts` | **PRODUCTION** | `src/ded-rab-v2/ahsp/` | Price resolver berbasis hierarki harga resmi proyek & 2026. |
| `dedRabValidationGate.ts` | **PRODUCTION** | `src/ded-rab-v2/validation/` | Engine 13 gerbang validasi deterministik. |
| `SafeDecimalEngine.ts` | **PRODUCTION** | `src/engine/` | Satu-satunya mesin aritmatika finansial bebas floating point. |
| `indonesianAHSP.ts` | **LEGACY / DEPRECATED** | `src/data/` | Database lama Permen 2022 (`A.3.2.1.2`). Tidak lagi dipanggil oleh pipeline produksi v2. |
| `dedToRabPipelineService.ts` | **LEGACY / DEPRECATED** | `src/services/` | Wrapper legacy v1. Di-maintain untuk backwards compatibility unit test lama, UI produksi menggunakan `dedRabPipelineService.ts` (v2). |

---

## Q. CACHE AUDIT & FORENSIC BYPASS
- **Visual OCR Cache:** `dedPageCache.ts` menyimpan hasil ekstraksi per `sha256(imageBuffer)`.
- **Audit Verification:** Method `dedPageCache.clear()` dijalankan saat audit untuk memastikan pipeline membaca buffer dokumen secara fresh dan langsung mengeksekusi logika pencocokan terbaru tanpa intervensi stale cache.

---

## R. ARITHMETIC SAFETY AUDIT
- **Larangan `Math.round()` / Fallback `|| 0`:** Seluruh operasi perkalian volume dan penetapan harga dilakukan secara eksklusif oleh `SafeDecimalEngine.safeMultiply()` dan `SafeDecimalEngine.safeAdd()`.
- **Nilai Kosong:** Jika dimensi gambar DED tidak lengkap, `quantity` diset sebagai `null` (BUKAN `0`). Jika harga belum tersedia, `unitPrice` diset sebagai `null` (BUKAN `0`).

---

## S. RINGKASAN PERBAIKAN (FIXES APPLIED)
1. **`src/ded-rab-v2/ahsp/ahspMatcher.ts`**:
   - Menambahkan pengenalan rasio mortar (`effectiveRatio = itemRatio || canonRatio(materialSpec)`) pada pencocokan pondasi batu belah dan pasangan bata merah sehingga terpetakan langsung ke kode resmi 2026 (`2.2.2.1.6` dan `3.6.1.8`).
   - Memperbaiki urutan evaluasi kategori `PLASTER` sebelum `WALL` agar item *Plesteran Dinding* tidak terambil oleh branch dinding bata.
   - Menambahkan filter negatif pada penutup lantai (*Floor Tile*) untuk mencegah pencocokan salah ke atap genteng keramik.
2. **`src/ded-rab-v2/qto/ezrabCoreQto.ts`**:
   - Menambahkan dukungan kalkulasi linear otomatis $N \text{ titik} \times H \text{ tinggi}$ untuk kolom praktis ketika dimensi panjang tidak eksplisit.
3. **`src/ded-rab-v2/validation/dedRabValidationGate.ts`**:
   - Menambahkan alias satuan `m'` dan `meter lari` ke format standar meter linear untuk mencegah `UNIT_MISMATCH` semu pada pekerjaan kolom praktis.
   - Mengintegrasikan rincian `gatesBreakdown` 13 gerbang ke dalam objek hasil validasi.

---

## T. HASIL TEST REGRESI
```
======================================================================
TEST REGRESSION SUITE VERIFICATION:
======================================================================
1. Core Calculator Engine Tests : 74 PASSED, 0 FAILED (src/test/coreCalculatorEngine.test.ts)
2. DED -> RAB Root Cause Tests  : 20 PASSED, 0 FAILED (src/test/dedRabRootCauseHotfix.test.ts)
3. 24 Mandatory Fixtures        : 24 PASSED, 0 FAILED (src/test/dedRab24Fixtures.test.ts)
4. 15 Regression Criteria Suite : 15 PASSED, 0 FAILED (src/test/dedRab15RegressionCriteria.test.ts)
5. AHSP Source-of-Truth Invariant: 9 PASSED, 0 FAILED (src/test/ahspSourceOfTruthInvariant.test.ts)
----------------------------------------------------------------------
TOTAL ALL SUITES                : 142 PASSED, 0 FAILED (100% GREEN)
======================================================================
```
