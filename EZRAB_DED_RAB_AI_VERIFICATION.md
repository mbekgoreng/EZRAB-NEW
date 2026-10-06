# EZRAB — DED → RAB AI-FIRST REBUILD VERIFICATION REPORT
**Version:** 1.0  
**Mode:** Clean Baseline Rebuild (AI-First)  
**Agent Name:** `EZRAB DED → RAB AI`  
**Execution Timestamp:** 2026-10-01  
**Status:** FULL REBUILD VERIFIED & BASELINE SECURED  

---

## 1. Scope & Isolation Verification
- **Reset Scope:** Hanya modul `DED → RAB AI`.
- **Modul Lain (Zero Touch / Untouched):**
  * Authentication (Supabase Auth / RLS)
  * Project & Workspace Management
  * Copilot & Chatbox Assistant
  * QTO Calculators & Formula Engine
  * AHSP Database PUPR 2026
  * National Material / Resource Database 2026
  * Price Engine Ladder & SafeDecimalEngine
  * Spreadsheet RAB 9-Tab Workspace & Excel/PDF Exporters

---

## 2. Inventory: Reset vs Dipertahankan

### A. Komponen yang Direset / Direfaktor ke Clean Baseline
1. **DED Master System Prompt:** Direset total ke System Prompt AI-First (`EZRAB_DED_RAB_AI_PROMPT.md`) dengan prioritas `ACCURACY > COMPLETENESS > SPEED`.
2. **AHSP Matcher (`ahspMatcher.ts`):** Penghapusan total pembuatan kode sintetis `AI-CUSTOM-XXXX`. Jika tidak ditemukan di database resmi EZRAB, sistem fail-closed ke `NOT_FOUND` / `NO_AHSP`.
3. **QTO Engine (`ezrabCoreQto.ts`):** Penghapusan total fallback `quantity = 1` atau perkiraan 0. Missing data menghasilkan `quantity = null` dan status `NEEDS_REVIEW`.
4. **Price Resolver (`ahspPriceResolver.ts`):** Penerapan ladder harga 5-tingkat dengan pencatatan metadata harga eksternal lengkap via `aiPriceSearchService` dan penolakan harga Rp 0 sebagai fallback.
5. **Legacy Pipeline (`dedToRabPipelineService.ts`):** Dinonaktifkan dari alur production, digantikan oleh `dedRabPipeline.ts` (V2 modular).

### B. Komponen yang Dipertahankan
1. **Document Ingestion & Page Renderer:** `documentIngestionService.ts`, `pdfPageService.ts`, `imagePageService.ts` dengan validasi visual dan SHA-256 integrity hash.
2. **Evidence Engine:** `evidenceService.ts` dengan pelacakan nomor lembar dan konten bukti geometris.
3. **Validation Gates:** `dedRabValidationGate.ts` dengan 13 gerbang validasi deterministik.
4. **Review & Spreadsheet Sync:** `dedRabReviewService.ts`, `dedSpreadsheetSync.ts`, dan UI `DedRabWorkflowView.tsx`.

---

## 3. Production Entry Point & AI Configuration
- **Route:** `/magic-ai?mode=ded-rab` dan `/projects/:projectId/ai?mode=ded-rab`
- **UI Component:** `MagicAiSuperView.tsx` → `DedRabWorkflowView.tsx`
- **Orchestrator:** `dedRabPipeline.execute(...)`
- **AI Models Supported:**
  * **FAST Mode:** Gemini Flash / Flash-Lite
  * **STANDARD Mode:** Qwen Flash + Qwen Omni Flash (via VLEEE / ZyRouter)
  * **DETAIL Mode:** Gemini 3.8 Flash (ZyRouter) with deep multi-pass reasoning
- **Prompt Version:** `EZRAB DED→RAB AI v1.0`

---

## 4. Source of Truth & Tool Integration

| Resource | Engine / Provider di EZRAB | Ketentuan |
|---|---|---|
| **Official AHSP** | `ALL_OFFICIAL_AHSP_ITEMS` / `officialAhspRepository` (PUPR 2026) | Hanya item resmi. Dilarang kode AI custom. |
| **Material / Component** | `materialDatabaseService` & Dekomposisi AHSP Resmi | Material adalah komponen analisa, bukan row pekerjaan utama. |
| **Price Engine** | `priceResolver2026` & `PriceResolver` (Hierarki 5-Level) | Project → User → Regional → Official → External Search. |
| **External Price Search** | `aiPriceSearchService.ts` | Wajib menyimpan metadata: `sourceName`, `sourceUrl`, `checkedAt`, `notes`. |
| **Final Calculation** | `SafeDecimalEngine` | Perhitungan deterministik tanpa floating-point roundoff. |

---

## 5. Mandatory Test Case 30: Verification

### Skenario Uji:
- **Pekerjaan:** Pasangan Pondasi Batu Kali 1:4
- **Dimensi Dokumen:** Panjang $P = 32.50\text{ m}$, Lebar $L = 0.40\text{ m}$, Tinggi $T = 0.80\text{ m}$, Adukan 1SP:4PP.

### Hasil Verifikasi:
```
[1] Identifikasi Pekerjaan:
    - Kategori: STRUKTUR / FOUNDATION
    - Uraian: Pekerjaan Pasangan Pondasi Batu Belah 1:4
    - Bukti Fisik: S-01_Pondasi.pdf (Halaman 2)

[2] Kalkulasi Volume (QTO):
    - Rumus: 32.50 m × 0.40 m × 0.80 m
    - Volume Terhitung: 10.40 m³ (Tepat, deterministik)

[3] Pencocokan AHSP:
    - Kode AHSP: 2.2.2.1.6 (Official PUPR 2026)
    - Uraian AHSP: Pemasangan 1 m3 pondasi batu belah 1SP : 4PP
    - Status AHSP: MATCHED / OFFICIAL_PUPR_2026 (Tanpa AI-CUSTOM)

[4] Dekomposisi Komponen:
    - Material: Batu belah (Koef 1.200), Semen Portland (Koef 163.000), Pasir pasang (Koef 0.520)
    - Upah Tenaga: Pekerja (Koef 1.500), Tukang batu (Koef 0.750), Mandor (Koef 0.075)

[5] Resolusi Harga:
    - Harga Satuan: Ter-resolve dari database regional 2026 (Rp 951.200 / m³)
    - Total Biaya Item: 10.40 m³ × Rp 951.200 = Rp 9.892.480 (Dihitung SafeDecimalEngine)
    - Status Item: READY (Lolos 13 Validation Gates)
```

---

## 6. Real DED Ingestion Test
- **File Uji Nyata:** [`qa-fixtures/pdf-gambar-rumah-1-lantai_compress.pdf`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/qa-fixtures/pdf-gambar-rumah-1-lantai_compress.pdf) (Ukuran: 3.15 MB, Multi-halaman PDF teknis rumah tinggal 1 lantai)
- **Status Ingestion:** `SOURCE_VERIFIED`
- **SHA-256 Hashing:** Terverifikasi 64-karakter unik
- **Page Rendering:** Halaman berhasil dirender ke image data visual untuk konsumsi AI Vision.

---

## 7. Hasil Eksekusi Test Suite

| Test Suite | Jumlah Uji | Status |
|---|---|---|
| [`src/test/dedAiFirstCleanPipeline.test.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/test/dedAiFirstCleanPipeline.test.ts) | 6 Tests | **PASS (100%)** |
| [`src/test/dedRabV2Pipeline.test.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/test/dedRabV2Pipeline.test.ts) | 10 Tests | **PASS (100%)** |
| [`src/test/dedRab15RegressionCriteria.test.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/test/dedRab15RegressionCriteria.test.ts) | 15 Tests | **PASS (100%)** |
| [`src/test/dedRab24Fixtures.test.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/test/dedRab24Fixtures.test.ts) | 24 Tests | **PASS (100%)** |
| [`src/test/dedDualModeWorkflow.test.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/test/dedDualModeWorkflow.test.ts) | 8 Tests | **PASS (100%)** |
| [`src/test/dedRabCanonicalEvidenceRegression.test.ts`](file:///d:/file%20kerja/PEMBUATAN%20SOFTWARE/ezrab%20site%20web/src/test/dedRabCanonicalEvidenceRegression.test.ts) | 7 Tests | **PASS (100%)** |

> **TOTAL DED TESTS:** 70 Tests passed cleanly without legacy fallbacks.

---

## 8. Live AI Provider Status Statement (Section 35)

> [!NOTE]
> **LIVE AI RUNTIME STATUS:**  
> Seluruh alur deterministik, tool routing, AHSP matching, kalkulasi dimensi QTO, dekomposisi resource, ladder harga, dan penulisan spreadsheet **TERVERIFIKASI 100% PASS**.  
>  
> Pada lingkungan CI/Local tanpa active external API key:  
> **LIVE AI CALLS WITH EXTERNAL SERVER: OFFLINE VERIFIED WITH FAIL-CLOSED DIAGNOSTICS.**  
> Ketika API key eksternal diinput pada production/staging, `zyrouterClient` secara otomatis memanggil backend proxy `/api/ai/multi-provider/execute` menggunakan Master System Prompt v1.0.
