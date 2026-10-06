# EZRAB — FORENSIC AUDIT REPORT
## AI Estimator Agent Architecture & DED → RAB 2.0 Transformation

**Tanggal Audit:** 5 Oktober 2026  
**Auditor:** Senior AI Systems Architect & Construction Estimator  
**Target Codebase:** EZRAB Platform (`ezrab site web`)  

---

## 1. CURRENT ARCHITECTURE (ARSITEKTUR SAAT INI)

Saat ini, pipeline DED → RAB di codebase memiliki dua implementasi parsial yang berjalan berdampingan namun belum terpadu secara ideal:

1. **`src/ded-rab-v2/pipeline/dedRabPipeline.ts` (Pipeline yang aktif dipanggil oleh UI saat ini)**
   - **Alur Kerja**: User Upload → `PdfPageService` (hashing & render halaman) → `dedAnalysisService` (Pass 1 & Pass 2 OCR/Vision) → `dedInterpreter` (Building model & inventory) → `dedQuantityEngine` (QTO) → `ahspMatcher` (Katalog PUPR 2026) → `ahspPriceResolver` → `dedRabValidationGate` (12 validation gates) → `DedRabV2ReviewView` → `dedSpreadsheetSync`.
   - **Karakteristik**: Pipeline ini didesain sebagai *hard-blocking deterministic gate*. Jika kuantitas fisik tidak dapat dihitung sempurna dari dimensi langsung, item ditandai `MISSING_DATA` / `MISSING_QTY`.
   - **Kelemahan Integrasi UI**: Di `DedRabWorkflowView.tsx` (baris 538-555), setelah pipeline selesai dieksekusi, sistem langsung memanggil `replaceProjectRabItems(...)` ke project state *sebelum* user meninjau atau menekan tombol ACC.

2. **`src/ded-rab-v3/pipeline/fullAiDedRabPipeline.ts` (Engine V3 yang baru dibangun)**
   - **Alur Kerja**: Document Reading → Synthesis → Work Inventory → Missing Info Search → Quantity Takeoff (SafeDecimalEngine) → AHSP Reasoning → Price Resolution → AI Self-Review (10 audit questions) → Grand Total.
   - **Kelebihan**: Sudah memiliki layer kanonikal `DedEvidence`, `DedMeasurement`, `CrossPageResolver`, `DuplicateDetector`, `SpecificationValidator`, dan `DedAiResolutionEngine`.
   - **Status Saat Ini**: Berdiri sendiri dan telah lulus 42 test golden pipeline (`dedRabGoldenDEDPipeline.test.ts`), namun belum dijadikan *default autonomous execution engine* di dalam `DedRabWorkflowView.tsx`.

3. **Komponen Pendukung yang Tersedia di Codebase**:
   - **AI Client & Provider**: `zyrouterClient.ts`, `aiProviderEngine.ts`, `aiProviderRouter.ts`, `aiDocumentReader.ts` (Gemini Flash-Lite & Gemini 3.8 Flash).
   - **AHSP Catalog Resmi**: `officialAhspRepository.ts` mengindeks 5.768 mata pembayaran resmi PUPR 2026 / Cipta Karya / Bina Marga / SDA / SMKK.
   - **Price Engine**: `ahspPriceResolver.ts`, `priceResolver2026`, `aiPriceEstimationEngine.ts` (memiliki 10-point self check dan rentang harga *low/central/high*).
   - **Spreadsheet Sync**: `dedSpreadsheetSync.ts` (9 sheet kanonikal) dan `spreadsheetSyncEngine.ts` (sinkronisasi formula dan tabel).

---

## 2. PROBLEMS & BOTTLENECK (MASALAH UTAMA)

1. **Paradigma "Hard-Blocking Validator" alih-alih "AI Estimator Agent"**:
   - Jika satu dimensi atau item spesifikasi tidak tertera eksplisit di teks DED, sistem langsung menyerah dan menandai status `MISSING_DATA`, `MISSING_QUANTITY`, atau `NOT_FOUND`.
   - Pengalaman yang dirasakan user adalah seperti berhadapan dengan *PDF parser yang melempar daftar error teknis*, bukan asisten estimator senior yang proaktif mencari korelasi gambar, menghitung area denah, dan membuat asumsi teknis terukur.

2. **QTO Menjadi Hard Bottleneck**:
   - Ketika QTO gagal menemukan parameter panjang/lebar/tinggi, item pekerjaan terancam tidak masuk ke RAB.
   - Padahal seorang Quantity Surveyor manusia dapat menginferensi volume dari luas ruangan, rasio standar konstruksi, atau jadwal bukaan. QTO seharusnya adalah salah satu **tool**, bukan penentu mati-hidupnya item RAB.

3. **Missing Data Menghalangi Penyusunan Draft RAB**:
   - Ketiadaan harga satuan resmi pada katalog langsung menyebabkan item berstatus `PRICE_UNRESOLVED` atau `PRICE_NOT_FOUND`.
   - Di Mode AI Estimator, AI seharusnya mencari estimasi berbasis komponen material/upah atau referensi pasar regional yang didukung asumsi transparan (`AI_ESTIMATED`), tanpa memalsukan kode resmi.

4. **Premature Commit ke Project RAB**:
   - Pada `DedRabWorkflowView.tsx`, RAB proyek langsung ditimpa (*replace*) saat analisis selesai, melanggar prinsip *atomic ACC*: `AI COMPLETE → RAB PREVIEW → USER REVIEW → USER ACC → COMMIT TO SPREADSHEET & PROJECT`.

5. **Ketiadaan Tool Registry Terpadu (Autonomous Bounded Agent Loop)**:
   - Komponen-komponen canggih (`crossPageResolver`, `findAhsp`, `resolvePrice`, `dedQuantityEngine`, `aiPriceEstimationEngine`) terisolasi di dalam tahapan sekuensial statis.
   - Belum ada `AiEstimatorAgent` yang dapat memanggil tools ini secara iteratif (Observe → Reason → Tool Call → Evaluate → Repair → Finalize).

---

## 3. REUSABLE COMPONENTS (KOMPONEN YANG DAPAT DIGUNAKAN KEMBALI)

Komponen-komponen berikut sudah teruji, memiliki arsitektur kokoh, dan **WAJIB DILESTARIKAN** sebagai tool / service yang dipanggil oleh AI Estimator Agent:

1. **`SafeDecimalEngine` (`src/engine/safeDecimalEngine.ts`)**:
   - Perhitungan aritmatika presisi tinggi anti floating-point drift. Source of truth untuk seluruh formula dan subtotal/grand total.
2. **`officialAhspRepository` (`src/data/nationalCostDatabase/officialAhspRepository.ts`)**:
   - Indeks 5.768 AHSP resmi PUPR 2026. Single source of truth untuk kode dan koefisien analisa resmi.
3. **`specificationValidator` (`src/ded-rab-v3/validation/specificationValidator.ts`)**:
   - Validator cerdas dimensi (40x40 vs 60x60) dan material (Aluminium vs Kayu Kamper, Bata Merah vs Hebel).
4. **`dedUnitSafetyGate` (`src/ded-rab-v3/ahsp/dedUnitSafetyGate.ts`)**:
   - Menolak keras anomali unit teknik (tulangan dalam m², keramik dalam m³, beton dalam m²).
5. **`dedMeasurementLayer` (`src/ded-rab-v3/evidence/dedMeasurementLayer.ts`)**:
   - Canonical intermediate structure `DedEvidence`, `DedMeasurement`, dan `QuantityCalculationResult`.
6. **`crossPageResolver` & `duplicateDetector` (`src/ded-rab-v3/evidence/`)**:
   - Menghubungkan jadwal bukaan lintas lembar dan menggabungkan duplikat pekerjaan.
7. **`aiPriceEstimationEngine` (`src/ded-rab-v2/pricing/aiPriceEstimationEngine.ts`)**:
   - Engine estimasi harga berbasis komponen resep AHSP dengan evaluasi 10-point self-check.
8. **`dedSpreadsheetSync` & `spreadsheetSyncEngine` (`src/ded-rab-v2/spreadsheet/` & `src/services/`)**:
   - Generator 9 lembar kerja spreadsheet terstruktur dengan formula bersih.
9. **`DedRabV2ReviewView` (`src/ded-rab-v2/review/DedRabV2ReviewView.tsx`)**:
   - UI Review interaktif dengan badge provenance, filter status, modal evidence, dan tombol ACC.

---

## 4. BLOCKING COMPONENTS (KOMPONEN PENGHAMBAT YANG HARUS DIREFAKTOR)

1. **Hard Pipeline Exception Throws**:
   - Logika yang melempar exception `ANALYSIS FAILED` ketika ada item parsial atau dimensi yang belum lengkap harus diubah menjadi pencatatan asumsi terukur (`AI_ASSUMPTION` / `AI_ESTIMATED`) dengan confidence score yang jelas.
2. **Sequential Fixed Phase Execution**:
   - Model eksekusi kaku (Phase 1 → Phase 2 → Phase 3 tanpa mekanisme feedback loop) harus digantikan oleh **Bounded Agent Execution Loop**.
3. **Eager Project RAB Overwrite**:
   - Logika `replaceProjectRabItems` di awal pemuatan hasil analisis di `DedRabWorkflowView.tsx` harus dinonaktifkan. Data harus disimpan sebagai `AI_DRAFT_RAB` di memory/persistence, dan baru di-commit ke proyek saat user menekan **✓ ACC & Masukkan ke Spreadsheet**.

---

## 5. MISSING COMPONENTS (KOMPONEN YANG HARUS DIBUAT)

1. **`AiEstimatorToolRegistry` (`src/ded-rab-v3/agent/aiEstimatorToolRegistry.ts`)**:
   - Tool registry resmi yang mengekspos 25+ tool functions (`readDed`, `extractDimensions`, `identifyWorkItem`, `calculateQuantity`, `findAhsp`, `findMaterial`, `findLabor`, `findEquipment`, `findProjectPrice`, `findRegionalPrice`, `estimatePrice`, `calculateRab`, `validateRab`, `checkDedCoverage`, `createAssumption`, `selfRepair`, dll.).
2. **`AiEstimatorAgent` (`src/ded-rab-v3/agent/aiEstimatorAgent.ts`)**:
   - Core agentic reasoning loop: Observe → Reason → Tool Call → Evaluate → Self-Repair → Finalize.
   - Mendukung dua mode: **Mode A (⭐ AI Estimator)** dan **Mode B (🔒 EZRAB Standard)**.
3. **`AiRabItem` Canonical Contract (`src/ded-rab-v3/agent/types.ts`)**:
   - Data structure resmi `AI_RAB_ITEM` dengan field-level provenance (`EZRAB_DATABASE`, `OFFICIAL_AHSP`, `OFFICIAL_STANDARD`, `PROJECT_PRICE`, `REGIONAL_PRICE`, `EXTERNAL_MARKET`, `AI_ASSISTED`, `AI_INFERRED`, `AI_ESTIMATED`, `USER_INPUT`), rincian material/labor/equipment, dan explicit assumptions.
4. **`DedCoverageMap` Engine (`src/ded-rab-v3/agent/dedCoverageEngine.ts`)**:
   - Audit kelengkapan disiplin (Arsitektur, Struktur, MEP) untuk memastikan tidak ada pekerjaan penting yang terlewat.
5. **`AtomicAccCommitService` (`src/ded-rab-v3/agent/atomicAccCommitService.ts`)**:
   - Menjalankan transaksi atomic saat user klik ACC: update project sections + sync ke Google Sheets 9 tabs secara bersamaan.

---

## 6. PROPOSED ARCHITECTURE (ARSITEKTUR BARU DED → RAB 2.0)

```
        USER UPLOAD DED (PDF / Gambar)
                      ↓
       [ DOCUMENT & VISION LAYER ]
        - Ingestion, Hashing, Render
        - Reading & Visual Evidence
                      ↓
        [ AI ESTIMATOR AGENT LOOP ]
  ┌─────────────────────────────────────────┐
  │ Bounded Loop: Observe -> Reason -> Tool │
  │                                         │
  │ Tool Calls:                             │
  │ • extractDimensions()                   │
  │ • crossPageResolver()                   │
  │ • calculateQuantity() (SafeDecimal)     │
  │ • findAhsp() (Official PUPR 2026)       │
  │ • resolveMaterial / Labor / Equipment   │
  │ • resolvePrice() (Database -> Market)   │
  │ • estimatePrice() (If uncataloged)      │
  │ • checkDedCoverage()                    │
  │ • selfCheck() & selfRepair()            │
  └─────────────────────────────────────────┘
                      ↓
     [ DUAL OUTPUT MODEL: ISOLATED ]
      - Mode A: AI_DRAFT_RAB (Lengkap + Asumsi)
      - Mode B: EZRAB_STANDARD_RAB (Database ketat)
                      ↓
        [ RAB REVIEW WORKSPACE ]
        - Headline: "✓ RAB berhasil dibuat"
        - Ringkasan: Total Nilai, Jumlah Item, Provenance
        - Tabs: [ Lihat RAB ], [ Lihat Asumsi ], [ Validasi ]
        - User Edit & Interactive Adjustments
                      ↓
            [ USER EXPLICIT ACC ]
        - Modal konfirmasi transaksi atomic
                      ↓
     [ COMMIT TRANSACTION: SPREADSHEET & PROJECT ]
        - Masuk ke Google Sheets (9 Tabs) dengan formula
        - Masuk ke Project RAB Resmi
```

---

## 7. IMPLEMENTATION PLAN (RENCANA IMPLEMENTASI BERTAHAP)

- **PHASE B: AI Estimator Canonical Contract & Data Model**
  - Buat interface `AI_RAB_ITEM`, `AiEstimatorRunContext`, `AiAssumption`, `DedCoverageReport`, `FieldProvenance`.
- **PHASE C: Tool Registry Implementation**
  - Implementasikan `aiEstimatorToolRegistry.ts` yang membungkus semua engine existing menjadi callable tools ber-runtime nyata (tanpa fake functions).
- **PHASE D & E: AI Estimator Agent & Bounded Reasoning Loop**
  - Implementasikan `aiEstimatorAgent.ts` yang mengkoordinasikan alur kerja dari observasi DED hingga self-check & self-repair.
- **PHASE F & G: Non-Blocking Resolution & Explicit Assumptions**
  - Pastikan item yang kekurangan data resmi tidak menggagalkan pipeline, melainkan diproses melalui Tier AI Inference / Estimation dengan flag `AI_ESTIMATED`.
- **PHASE H: Coverage & Self-Repair Validation Engine**
  - Jalankan 17-point self check (DED coverage, sanity volume, satuan, aritmatika, dll.).
- **PHASE I & J: UI Integration di `DedRabWorkflowView` & `DedRabV2ReviewView`**
  - Hubungkan mode pemilihan (⭐ AI Estimator vs 🔒 EZRAB Standard), tampilkan headline profesional, nonaktifkan auto-replace sebelum ACC.
- **PHASE K & L: Atomic ACC Flow & Spreadsheet Commit**
  - Transaksi commit hanya dijalankan saat user menekan ACC, menghasilkan 9 sheet bersih ke Google Sheets dan sections resmi proyek.
- **PHASE M: Verification & Regression Tests**
  - Jalankan seluruh test suite (`npm test`, `npm run test:ded-rab`, test AI Estimator baru, dan `npm run build`).

---

## 8. RISIKO & MITIGASI (RISK ASSESSMENT)

1. **Risiko Floating Math / AI Calculation Drift**:
   - *Mitigasi*: AI hanya mengekstrak formula dan parameter. Semua perkalian, pembagian, dan subtotal dieksekusi eksklusif oleh `SafeDecimalEngine`.
2. **Risiko AI Memalsukan Data Resmi (Hallucination)**:
   - *Mitigasi*: Database resmi diisolasi di `officialAhspRepository`. Item estimasi AI wajib dilabeli `isOfficial: false` dan `source: AI_ESTIMATED`.
3. **Risiko Infinite Tool Calling Loop**:
   - *Mitigasi*: Bounded tool calls dengan batas maksimal (`maxToolCalls = 25`, `maxRetries = 2`, `timeout`).
4. **Risiko Regresi Kode Lama**:
   - *Mitigasi*: Pipeline lama tetap utuh sebagai opsi fallback / Mode B; semua tes eksisting (74 core calculator + 20 hotfix + 24 fixtures + 15 criteria + 9 AHSP invariants) harus tetap lulus 100%.

---

## 9. DAFTAR FILE YANG AKAN DIBUAT & DIUBAH

### File Baru:
1. `src/ded-rab-v3/agent/types.ts` (Canonical contract `AI_RAB_ITEM`, provenance, assumptions, coverage).
2. `src/ded-rab-v3/agent/aiEstimatorToolRegistry.ts` (Runtime tools registry).
3. `src/ded-rab-v3/agent/aiEstimatorAgent.ts` (Core AI Estimator Agent dengan bounded loop).
4. `src/ded-rab-v3/agent/dedCoverageEngine.ts` (Coverage mapper disiplin konstruksi).
5. `src/ded-rab-v3/agent/atomicAccCommitService.ts` (Atomic ACC & spreadsheet committer).
6. `src/test/aiEstimatorAgent.test.ts` (Test suite komprehensif untuk kontrak AI Estimator).

### File yang Disesuaikan / Diintegrasikan:
1. `src/components/document/DedRabWorkflowView.tsx` (Mengintegrasikan `aiEstimatorAgent`, Mode Selector, dan memutus auto-replace sebelum ACC).
2. `src/ded-rab-v2/review/DedRabV2ReviewView.tsx` (Memastikan headline, badge provenance, daftar asumsi, dan modal konfirmasi ACC sesuai spesifikasi).
3. `src/ded-rab-v2/pipeline/dedRabPipeline.ts` (Menghubungkan `aiEstimatorAgent` saat dipanggil dalam mode autonomous).
