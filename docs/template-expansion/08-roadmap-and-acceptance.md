# EZRAB — IMPLEMENTATION ROADMAP & ACCEPTANCE CRITERIA
## Phased Rollout Plan for 37+ Multi-Disciplinary Construction Templates

**Status:** AUDIT & DESIGN ONLY — IMPLEMENTATION NOT STARTED  
**Auditor:** Principal Software Architect, Engineering Program Manager  
**Date:** 2026-09-14  
**Project:** EZRAB AI — Intelligent Construction Cost Estimation Engine  

---

## 1. Strategi Pentahapan Implementasi

Untuk memastikan stabilitas sistem, keberlanjutan arsitektur (*architectural maintainability*), dan nol regresi pada 7 template Phase 1-4 yang sudah berjalan, ekspansi dibagi menjadi **4 Tahapan Utama (Stages)**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 1: FOUNDATION & LINEAR HORIZONTAL INFRASTRUCTURE                  │
│ • Reusable Component Library Framework                                  │
│ • Earthwork Cut/Fill Module & Paving & Asphalt & Open Drainage          │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────────────────────┐
│ STAGE 2: COMMERCIAL & LARGE-SPAN VERTICAL BUILDINGS                     │
│ • Hotel, Warehouse, Multipurpose Hall, Office, School, Mosque, Market   │
│ • Hospital (Tahap 1: Struktur & Ruang Standar)                          │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────────────────────┐
│ STAGE 3: HYDRAULIC & CIVIL STRUCTURES                                   │
│ • Saluran Irigasi, Embung/Kolam Retensi, Dinding Penahan Tanah,         │
│ • Box Culvert, Jembatan Bentang Pendek (L <= 15m), Bronjong             │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────────────────────┐
│ STAGE 4: ADVANCED HYDRAULIC & HEAVY CIVIL STRUCTURES                    │
│ • Gravity Dam, Embankment Dam, Spillway, Intake/Outlet,                 │
│ • Jembatan Gelagar Prategang (PCI Girder L = 20-40m)                    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Rincian dan Kriteria Penerimaan per Tahap

### STAGE 1: Foundation & Linear Horizontal Infrastructure

**Target Deliverables:**
1. Rancang bangun `IParametricComponent` dan `ComponentRegistry`.
2. Komponen: `EarthworkCutFillComponent`, `PavingBlockLayerComponent`, `AsphaltLayerComponent`, `DrainageChannelComponent`.
3. Template: `ROAD-ASPHALT`, `ROAD-PAVING`, `DRN-OPEN-CHAN`, `CIV-EARTHWORK`, `ROAD-SIDEWALK`.

**Kriteria Penerimaan (Acceptance Criteria):**
- [ ] Seluruh 7 template lama Phase 1-4 lulus 100% regression test suite tanpa perubahan nilai output.
- [ ] Perhitungan tonase aspal, volume agregat kelas A/B, dan prime/tack coat pada `ROAD-ASPHALT` memiliki deviasi $< 0.1\%$ terhadap hitungan manual Quantity Surveyor.
- [ ] Modul cut/fill menghasilkan volume galian/timbunan deterministik dengan faktor kembang-susut tanah yang terverifikasi.
- [ ] Unit test coverage minimum 95% untuk seluruh komponen Stage 1.

---

### STAGE 2: Commercial & Large-Span Vertical Buildings

**Target Deliverables:**
1. Template: `BLD-HOTEL`, `BLD-WAREHOUSE`, `BLD-HALL`, `BLD-OFFICE`, `BLD-SCHOOL`, `BLD-MOSQUE`, `BLD-MARKET`, `BLD-PARK`.
2. Template: `BLD-HOSPITAL` (Fase 1: modul arsitektur, struktur, dan rawat inap umum).
3. Komponen: `SteelPortalFrameComponent`, `WallFinishingComponent`, `DeepFoundationComponent`.

**Kriteria Penerimaan (Acceptance Criteria):**
- [ ] Formula bentang lebar portal frame baja (`BLD-WAREHOUSE`, `BLD-HALL`) menghitung berat tonase profil WF, gording, baut HTB, dan cat anti-karat secara akurat.
- [ ] Template hotel memisahkan area kamar tipikal dan area publik lobi/ballroom dengan kalkulasi plumbing/sanitasi presisi.
- [ ] Seluruh item pekerjaan terhubung ke kode analisa AHSP Cipta Karya 2026 yang valid.
- [ ] Trace kalkulasi menampilkan urutan matematis luas dinding bersih dan volume pembesian beton.

---

### STAGE 3: Hydraulic & Intermediate Civil Structures

**Target Deliverables:**
1. Template: `SDA-CANAL-IRR`, `SDA-EMBUNG`, `CIV-RET-WALL`, `DRN-BOX-CULV`, `DRN-PIPE-RCP`, `CIV-BRG-SMALL`, `CIV-GABION`, `CIV-RIPRAP`.
2. Modul: `HydraulicsDrainageCalculator` (Formula Manning debit saluran).

**Kriteria Penerimaan (Acceptance Criteria):**
- [ ] Perhitungan saluran irigasi dan embung memvalidasi kemiringan talud ($m$), kapasitas tampungan ($m^3$), dan lining pasangan batu.
- [ ] Template Dinding Penahan Tanah (`CIV-RET-WALL`) secara otomatis menghitung volume pasangan batu/beton, pipa weep holes, dan lapisan filter ijuk-kerikil.
- [ ] Box Culvert dan pipa beton RCP mengkalkulasi galian, lantai kerja Bo, unit precast, dan urugan kembali secara deterministik.
- [ ] Jembatan bentang pendek ($L \le 15\text{ m}$) menghitung volume abutment, balok T-Beam/I-Girder, lantai beton K-350, dan expansion joint.

---

### STAGE 4: Advanced Hydraulic & Heavy Civil Structures

**Target Deliverables:**
1. Template: `SDA-DAM-GRAVITY`, `SDA-DAM-EMBANK`, `SDA-SPILLWAY`, `SDA-INTAKE`, `SDA-OUTLET`, `CIV-BRG-CONC`.
2. Template: `BLD-HOSPITAL` (Fase 2: modul ruang bedah/OK, radiologi Pb, gas medis sentral, IPAL B3).

**Kriteria Penerimaan (Acceptance Criteria):**
- [ ] Template bendungan mensyaratkan konfirmasi minimal 5 cross-section elevasi dan menandai status `NEEDS_REVIEW` jika data geoteknik belum lengkap.
- [ ] Template jembatan beton prategang (`CIV-BRG-CONC`) menghitung gelagar PCI Girder, elastomer bearing pad, diafragma, dan pilar jembatan (*pier*).
- [ ] Modul pelimpah (*Spillway*) menghitung beton masif ogee crest, saluran luncur, peredam energi kolam olak (*stilling basin*), dan waterstop.
- [ ] Semua template berisiko tinggi wajib lulus audit tim Quantity Surveyor dan Civil Engineer sebelum dinaikkan ke status `PRODUCTION_CANDIDATE`.

---

## 3. Aturan Pelaksanaan Program

- **No Premature Execution**: Dilarang melompat ke Stage berikutnya sebelum seluruh Acceptance Criteria tahap aktif terpenuhi dan diverifikasi test suite.
- **Continuous Documentation**: Setiap implementasi komponen wajib disertai test file di `server/test/` atau `src/test/`.
