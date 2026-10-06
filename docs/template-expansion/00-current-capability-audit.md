# EZRAB — CURRENT CAPABILITY AUDIT
## Master Template Expansion (Phase 5+ Extensibility Audit)

**Status:** AUDIT & DESIGN ONLY — IMPLEMENTATION NOT STARTED  
**Auditor:** Principal Software Architect, Senior Construction Estimator, Quantity Surveyor  
**Date:** 2026-09-14  
**Project:** EZRAB AI — Intelligent Construction Cost Estimation Engine  

---

## 1. Executive Summary

EZRAB saat ini telah memiliki fondasi kuat untuk 7 template awal (5 bangunan gedung sederhana/komersial, 1 infrastruktur jalan beton rigid, 1 drainase precast U-Ditch). Untuk memperluas cakupan ke **37+ tipe proyek multidisiplin** (Building, Road & Pavement, Water Resources, Drainage, Civil & Structure), sistem memerlukan audit kapabilitas aktual untuk memetakan batasan arsitektur, titik kegagalan (*bottlenecks*), dan risiko ekstensibilitas sebelum kode produksi ditulis.

---

## 2. Tabel Audit Komponen Aktual Codebase

| Komponen | File Aktual | Kapabilitas Saat Ini | Keterbatasan Saat Ini | Risiko Ekstensibilitas |
| :--- | :--- | :--- | :--- | :--- |
| **Schema Template** | `src/data/buildingTemplates/schema/types.ts` | Mendefinisikan parameter bangunan, asumsi empiris/SNI/PUPR, ruang (`spaces`), formula WBS, dan trace kalkulasi. | Sangat terikat pada konsep gedung (`spaces`, `ceilingHeight`, `roofCover`). Tidak mendukung hirarki multi-segmen infrastruktur linier atau penampang hidrolika kompleks. | Jika dipaksakan pada Dam/Jembatan tanpa ekstensi schema, kalkulasi akan menjadi tidak realistis dan membingungkan estimator. |
| **Master Template Registry** | `src/data/buildingTemplates/masterTemplateRegistry.ts` | Menyimpan dan mencari 7 template aktif (`id`, `code`, `category`, `searchTemplates`). | Struktur *flat in-memory map*, belum memiliki pengelompokan disiplin bertingkat (Discipline > Domain > Sub-type > Component). | Skalabilitas pencarian menurun saat template bertambah ke 40+ item; tidak ada mekanisme lazy loading per disiplin. |
| **Template API Routes** | `server/api/templateRoutes.ts` | Endpoint CRUD read-only (`GET /api/templates`, `POST /api/templates/:id/validate`, `POST /api/templates/:id/generate`). | Payload parameter bersifat flat (`parameters: Record<string, any>`), belum mendukung nested array parameter (misal: pier list, cross-section stationing). | Payload validasi akan menolak parameter multi-bentang atau elevasi berundak pada struktur sipil air. |
| **Parametric Volume Engine** | `src/engine/parametricVolumeEngine/parametricVolumeEngine.ts` | Evaluasi deterministik formula volume, integrasi pengali regional provinsi, rekapitulasi kategori WBS, audit trace kalkulasi. | Kategori hardcoded pada 17 enum (`01_PERSIAPAN` s/d `17_PEKERJAAN_LUAR`). Belum memiliki modul volumetri tanah kontur (cut/fill Simpson/Prismoidal) atau hidrolika Manning. | Formula hidrolika atau geoteknik akan tercampur dan mengotori engine jika tidak dipisah ke modul khusus (*Calculation Modules*). |
| **3D Geometry Adapters** | `src/engine/viewer3d/geometryAdapters.ts` | Menghasilkan wireframe parametric 3D untuk gedung kotak (Grid, Pondasi, Sloof, Kolom, Dinding, Atap, Lantai, Kusen). | Khusus geometri orthogonal gedung rectangular. Tidak mendukung geometri kurva (bendungan urugan/busur), profil jalan melintang berlereng, atau jembatan girder. | Viewer akan crash atau menghasilkan visualisasi cacat jika menerima parameter non-gedung. |
| **Calculation Service** | `server/services/calculationService.ts` | Formula matematis, pembulatan desimal akurat, audit anomali harga RAB, deteksi outlier harga satuan. | Mengasumsikan satuan standar gedung (m, m2, m3, kg, unit, ls). Belum mendukung konversi stationing jalan (STA 0+000) atau volume reservoir ($m^3$ tampungan). | Kehilangan presisi perhitungan pada volume skala masif ($>10^6\text{ m}^3$) seperti bendungan atau cut-fill jalan tol. |
| **AHSP Mapping & Cost DB** | `src/data/nationalCostDatabase/masterRegistry.ts`, `ciptaKaryaAHSPDataset.ts`, `binaMargaAHSPDataset.ts`, `sdaAHSPDataset.ts` | 800+ item analisa AHSP PUPR 2026 (Cipta Karya, Bina Marga, SDA) dengan koefisien upah, bahan, alat. | Belum semua analisa spesifik (misal: grout curtain bendungan, sheet pile baja, elastomer bearing pad jembatan, aspal SMA/AC-WC) terindeks secara lengkap. | Fallback ke harga kustom/heuristik berisiko mengurangi akurasi estimasi proyek skala besar. |
| **Price Database & Regional Multipliers** | `src/data/indonesianPrices.ts`, `parametricVolumeEngine.ts` | 38 Provinsi dengan indeks regional pengali biaya dasar (DKI Jakarta=1.00, Papua=1.45, dsb.). | Indeks pengali seragam untuk seluruh material; tidak membedakan komoditas sensitif transportasi pulau (semen, baja tulangan, aspal curah). | Deviasi harga signifikan pada proyek pedalaman luar Jawa yang membutuhkan mobilisasi alat berat khusus. |
| **AI Orchestrator & Intent Engine** | `server/orchestrator/intentClassifier.ts`, `aiOrchestrator.ts`, `aiProviderEngine.ts` | Mengklasifikasikan intent `GENERATE_TEMPLATE_RAB`, pencocokan regex template, eksekusi estimasi deterministik. | Matching regex berbasis kata kunci sederhana (`"rumah"`, `"ruko"`, `"jalan"`, `"uditch"`). Belum mengenali parameter teknis bertingkat (misal: "bendungan urugan inti lempung tinggi 30m"). | Salah klasifikasi template saat prompt pengguna memiliki sinonim teknik beragam (misal: "krib", "talud", "bronjong", "revetment"). |
| **Vision Extraction Schema** | `docs/phase-5/02-extraction-schema-design.md` | Schema ekstraksi OCR/Vision untuk denah, tampak, potongan arsitektur dan struktur gedung. | Belum memiliki field ekstraksi untuk penampang melintang jalan (*cross section*), profil memanjang (*long section*), kurva kapasitas waduk, dan kurva massa tanah. | Vision AI gagal memetakan gambar DED infrastruktur ke parameter template yang tepat. |
| **Project Context & RAB Spreadsheet** | `src/context/ProjectContext.tsx`, `EstimatorSpreadsheetView.tsx` | Manajemen state tabel spreadsheet RAB, WBS grouping, formula SUM, ekspor Excel/PDF, multi-tenant workspace isolation. | Grouping level WBS saat ini terbatas pada 2 tingkat (Kategori > Item). Proyek infrastruktur membutuhkan WBS 4-5 tingkat (Divisi > Seksi > Sub-seksi > Item Pekerjaan). | Spreadsheet menjadi terlalu panjang tanpa sub-total hirarkis standar Bina Marga / SDA. |
| **RBAC & Security Isolation** | `server/services/commandEngine.ts`, `server/auth/authGateway.ts` | Isolasi per `workspace_id`, verifikasi role (`SUPER_ADMIN`, `ESTIMATOR`, `DIREKSI`, `CLIENT`), token undo per mutasi. | Belum ada flag review khusus untuk template berisiko tinggi (*Structural High-Risk Tag*). | Estimator pemula dapat secara tidak sengaja menghasilkan draft RAB bendungan/jembatan tanpa peninjauan Quantity Surveyor senior. |

---

## 3. Temuan Kritis Kesiapan (Critical Gaps)

1. **Monolithic Volume Engine Constraint:**  
   Saat ini logika kalkulasi volume berada di dalam callback `quantityRule` masing-masing file template. Pola ini berhasil untuk 7 template, tetapi akan menyebabkan duplikasi masif jika diterapkan pada 37 template (misal: rumus galian tanah, bekisting, pembesian diulang 37 kali).
2. **Ketiadaan Modul Komponen Reusable (Component Library):**  
   Belum ada abstraksi komponen parametrik terisolasi seperti `BoxCulvertComponent`, `PavingLayerComponent`, `RetainingWallComponent`, `EarthworkCutFillComponent`.
3. **Keterbatasan Format Satuan & Toleransi Keteknikan:**  
   Infrastruktur air dan jalan membutuhkan parameter toleransi debit ($m^3/s$), kecepatan aliran ($m/s$), kemiringan tanah ($1:m$), CBR tanah dasar, dan faktor kembang-susut tanah (*swell/shrinkage factor* 0.85 - 1.30).

---

## 4. Rekomendasi Audit

- **Wajib Membangun Arsitektur Bertingkat**: Pisahkan sistem menjadi (1) *Project Templates*, (2) *Parametric Component Library*, (3) *Calculation Modules*, (4) *Cost/AHSP Mappers*, (5) *Geometry Adapters*, dan (6) *Vision Contracts*.
- **Pertahankan 100% Kompatibilitas**: Jangan memodifikasi formula 7 template Phase 1-4 yang telah teruji. Seluruh ekstensi harus bersifat *additive* dan modular.
