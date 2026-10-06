# EZRAB — MULTI-DISCIPLINARY TEST STRATEGY & VERIFICATION PLAN
## Phase 5+ Template Expansion Quality Assurance Framework

**Status:** AUDIT & DESIGN ONLY — IMPLEMENTATION NOT STARTED  
**Auditor:** QA Engineering Specialist, Principal Software Architect  
**Date:** 2026-09-14  
**Project:** EZRAB AI — Intelligent Construction Cost Estimation Engine  

---

## 1. Objektif Strategi Pengujian

Strategi pengujian ini dirancang untuk memastikan bahwa penambahan 37+ template multi-disiplin baru **tidak merusak (zero-regression)** pada:
1. Akurasi kalkulasi 7 template Phase 1-4 yang sudah beroperasi.
2. Isolasi data multi-tenant dan hak akses RBAC.
3. Keandalan deterministic execution (zero black-box calculation).
4. Konsistensi pemetaan kode analisa AHSP PUPR 2026 dan harga regional.

---

## 2. Lapisan Pengujian (Testing Layers)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. SCHEMA & TYPE COMPATIBILITY TESTS                        │
│ TypeScript compiler + JSON Schema validation                │
├─────────────────────────────────────────────────────────────┤
│ 2. DETERMINISTIC CALCULATION & UNIT TESTS                   │
│ Mathematical proofs, unit conversions, boundary checks      │
├─────────────────────────────────────────────────────────────┤
│ 3. REGRESSION SUITE (7 ORIGINAL TEMPLATES)                  │
│ Exact matching of work item quantities and total direct cost│
├─────────────────────────────────────────────────────────────┤
│ 4. INTEGRATION & SPREADSHEET API TESTS                      │
│ Template API routes, action proposals, bulk row insertions  │
├─────────────────────────────────────────────────────────────┤
│ 5. SECURITY & WORKSPACE ISOLATION TESTS                     │
│ Multi-tenant boundary, role permissions, read-only safety   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Matriks Skenario Pengujian Wajib

| Kategori Pengujian | Lingkup Verifikasi | Target Kriteria Kelulusan |
| :--- | :--- | :--- |
| **Schema Compatibility** | Memastikan semua template mematuhi `ExtendedMasterBuildingTemplate`. | 0 TypeScript error (`tsc --noEmit`), semua field required terisi, maturity level valid. |
| **Backward Compatibility** | Menjalankan kalkulasi ulang pada 7 template Phase 1-4 (`HOUSE-T36-1FL` s/d `DRAIN-UDITCH`). | Nilai volume, harga satuan, dan total direct cost identik $100.00\%$ terhadap baseline historis. |
| **Deterministic Consistency**| Eksekusi fungsi `calculate()` sebanyak 100 kali berturut-turut untuk input parameter yang sama. | Output volume dan subtotal identik tanpa variasi desimal ($Variance = 0.000$). |
| **Unit Conversion & Scale** | Validasi konversi $mm \leftrightarrow cm \leftrightarrow m \leftrightarrow m^2 \leftrightarrow m^3 \leftrightarrow ton \leftrightarrow kg$. | Tidak terjadi kesalahan pengali desimal 10x atau 1000x pada tonase aspal/baja. |
| **Boundary & Edge Values** | Pengujian nilai batas ekstrem (misal: tebal aspal $0.01\text{ m}$ s/d $0.50\text{ m}$, bentang jembatan $5\text{ m}$ s/d $100\text{ m}$). | Sistem mengeluarkan warning/error terstruktur tanpa crash (unhandled exception). |
| **Null / Unknown Handling** | Simulasi input DED parsial di mana parameter tanah/elevasi berstatus `NULL`. | Item terkait ditandai `needs_review`, perhitungan tidak menghasilkan `NaN` atau `undefined`. |
| **Geometry Consistency** | Validasi bounding box 3D dan node count adapter geometri Three.js. | Koordinat mesh berada dalam batas realistis, tidak ada dimensi negatif atau infinite. |
| **Volume Reconciliation** | Rekonsiliasi matematis antara volume WBS individu dengan rekapitulasi kategori. | $\sum V_i \times P_i = \text{Total Category Subtotal} = \text{Total Direct Cost}$. |
| **AHSP Mapping Accuracy** | Validasi keterhubungan kode analisa ke dataset AHSP PUPR 2026. | Skor kecocokan ($Match Score \ge 90\%$), sumber analisa valid (Cipta Karya/Bina Marga/SDA). |
| **Read-Only Safety** | Memastikan modul viewer 3D dan kalkulasi awal tidak memutasi database / context. | Database state tetap tidak berubah sampai pengguna mengklik "Terapkan". |
| **Workspace Isolation** | Akses template dan proyek dari pengguna Workspace A terhadap Workspace B. | Status HTTP `403 Forbidden` / `404 Not Found` pada akses lintas workspace. |

---

## 4. Rencana Suite Uji Otomatis

Setiap penambahan template pada tahapan roadmap wajib menyertakan test suite Vitest mandiri:

1. `server/test/templates/buildingTemplates.test.ts`
2. `server/test/templates/roadTemplates.test.ts`
3. `server/test/templates/waterResourcesTemplates.test.ts`
4. `server/test/templates/drainageTemplates.test.ts`
5. `server/test/templates/civilStructureTemplates.test.ts`
6. `server/test/components/componentLibrary.test.ts`

---

## 5. Standar Keputusan Uji (Pass / Fail Criteria)

- **PASS**: 100% test case lulus, zero TypeScript error, zero regression pada 7 baseline template.
- **FAIL / BLOCKED**: Jika ditemukan 1 test gagal atau terdapat perubahan tidak terotorisasi pada formula Phase 1-4.
