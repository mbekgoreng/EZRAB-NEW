# PHASE 4 — PRE-IMPLEMENTATION AUDIT
## 3D Wireframe Viewer berbasis Parameter Template & Parametric Volume Engine

**Tanggal Audit:** 14 September 2026  
**Auditor:** Senior Software Architect, Construction Estimator, BIM/Parametric Engineer, QA Engineer  
**Status:** AUDIT COMPLETED — READY FOR IMPLEMENTATION PLANNING  

---

## 1. Executive Summary

Audit ini dilakukan sebelum penulisan kode Phase 4 untuk memverifikasi kesiapan arsitektur, ketersediaan dependency, kelengkapan parameter geometri pada 7 master template, serta memastikan bahwa implementasi **3D Wireframe Viewer** tidak akan merusak Phase 1, Phase 2, atau Phase 3 yang telah lulus 100% acceptance testing.

---

## 2. File & Modul yang Diperiksa (Files Inspected)

### A. Core Engine & Templates:
1. `src/data/buildingTemplates/schema/types.ts`: Memeriksa interface `MasterBuildingTemplate`, `TemplateSpace`, `TemplateParameter`, `TemplateAssumption`, `VolumeCalculationResult`, dan `CalculationTrace`.
2. `src/data/buildingTemplates/masterTemplateRegistry.ts`: Memeriksa mekanisme pendaftaran dan pencarian 7 template resmi.
3. `src/data/buildingTemplates/templates/houseType36Template.ts`: Memeriksa denah 6 ruangan, dimensi perimeter, kolom 12 titik, sloof, ring balok, dan atap prisma/pelana kemiringan 30°.
4. `src/data/buildingTemplates/templates/houseType45Template.ts`: Memeriksa denah ruangan (6x7.5m), bukaan pintu-jendela, dan struktur.
5. `src/data/buildingTemplates/templates/houseType70Template.ts`: Memeriksa denah ruangan luas 70m2 dan spesifikasi struktur.
6. `src/data/buildingTemplates/templates/houseType36TwoFloorTemplate.ts`: Memeriksa data pelat lantai 2 (t=12cm), kolom 20x20, balok lantai 2, dan tangga.
7. `src/data/buildingTemplates/templates/shophouse2FloorTemplate.ts`: Memeriksa struktur ruko portal komersial 4.5x12m, rolling door, dan balkon.
8. `src/data/buildingTemplates/templates/concreteRoadTemplate.ts`: Memeriksa parameter jalan rigid pavement (panjang, lebar, tebal pelat, bahu jalan, joint cutting).
9. `src/data/buildingTemplates/templates/uDitchDrainageTemplate.ts`: Memeriksa parameter saluran U-Ditch (panjang, lebar dalam, tinggi, tebal dinding, cover slab).
10. `src/engine/parametricVolumeEngine/parametricVolumeEngine.ts`: Memeriksa konsistensi output deterministik, boundary checking, dan trace.

### B. Project Context & Frontend UI:
11. `package.json`: Memeriksa dependency grafis dan library yang terpasang.
12. `src/context/ProjectContext.tsx`: Memeriksa struktur state proyek dan RAB item.
13. `src/engine/constructionCalculators/diagrams.tsx`: Memeriksa implementasi diagram parametrik SVG 2D/isometrik eksisting.
14. `src/components/qto/QtoCalculatorView.tsx`: Memeriksa UI kalkulator volume dan container blueprint.
15. `server/test/parametricVolumeEngine.test.ts`: Memeriksa test suite Phase 2 & 3.

---

## 3. Analisis Dependency

### Status Dependency Saat Ini:
- `react` & `react-dom`: v19.0.0
- `lucide-react`: v1.16.0 (Icons)
- `framer-motion`: v12.38.0
- `clsx`: v2.1.1
- `decimal.js`: v10.6.0
- `three` & `@types/three`: **Belum terpasang di `package.json`**.

### Rekomendasi Teknis Dependency:
Untuk membangun **Parametric 3D Wireframe Viewer** yang cepat, responsif, dan ringan tanpa overhead bundle besar:
- Menggunakan `three` (Three.js standar) sebagai renderer WebGL 3D core yang terbukti stabil, hemat memori, dan mendukung OrbitControls, line wireframe, mesh shading, transparent raycasting, dan dynamic geometry generation.
- Dibungkus dengan custom React hook/component (`useThreeViewer` / `<ParametricViewer3D />`) yang mengelola lifecycle canvas WebGL secara bersih (mount, unmount, dispose geometry/material/textures) tanpa memory leak.

---

## 4. Architecture & Geometry Gaps Analysis

| Aspek | Status Saat Ini | Kebutuhan Phase 4 | Solusi Desain |
|---|---|---|---|
| **Geometry Model** | Parameter numerik di template | Objek 3D berkoordinat $(x, y, z)$ | Buat `BuildingGeometryAdapter`, `RoadGeometryAdapter`, `DrainageGeometryAdapter` |
| **Spatial Coordinate Layout** | Array `TemplateSpace[]` berisi panjang & lebar tanpa koordinat absolut $(x, y)$ | Ruangan tertata rapi dalam grid denah tanpa tumpang tindih | Buat algoritma deterministic space-packing / grid partitioner untuk denah rumah dan ruko |
| **BIM/WBS Association** | Item RAB memiliki `wbsCode` & `stableId` | Elemen 3D terhubung dengan WBS & baris RAB | Sematkan `stableId`, `wbsCode`, dan `rabItemId` pada `GeometryElementMeta` |
| **Visual Modes** | N/A | Wireframe, Shaded Solid, Transparent X-Ray | Buat material switcher di Three.js dengan layer filtering |
| **Element Picking** | N/A | Klik elemen 3D -> Buka inspector dimensi & link RAB | Implementasikan Three.js `Raycaster` interaktif dengan bounding box highlighter |

---

## 5. Analisis Kesiapan 7 Master Template

1. **`HOUSE-T36-1FL` (Rumah T36 1-Lantai):** **READY FOR 3D** (Lengkap: pondasi, sloof, 12 kolom, dinding hebel, bukaan, plafon, atap pelana 30°).
2. **`HOUSE-T45-1FL` (Rumah T45 1-Lantai):** **READY FOR 3D** (Lengkap: denah 6x7.5m, ruang keluarga, 2 kamar, carport).
3. **`HOUSE-T70-1FL` (Rumah T70 1-Lantai):** **READY FOR 3D** (Lengkap: denah 7x10m, 3 kamar, teras).
4. **`HOUSE-T36-2FL` (Rumah T36 2-Lantai):** **READY FOR 3D** (Lengkap: lantai 1, pelat lantai 2 t=12cm, tangga beton, lantai 2, atap).
5. **`RUKO-2FL` (Ruko 2-Lantai):** **READY FOR 3D** (Lengkap: portal beton K-250 4.5x12m, rolling door depan, lantai 2, balkon).
6. **`INFRA-ROAD-CONCRETE` (Jalan Beton):** **READY FOR 3D** (Lengkap: lapis pondasi agregat, lantai kerja Bo, pelat rigid K-300, wiremesh, joint cutting, bahu jalan).
7. **`DRAIN-UDITCH` (Saluran U-Ditch):** **READY FOR 3D** (Lengkap: galian trapesium, pasir urug, lantai kerja, profil penampang U, cover slab).

---

## 6. Identifikasi Risiko & Strategi Mitigasi

1. **Risiko Memory Leak WebGL:** Canvas 3D yang di-mount/unmount berulang kali dapat menghabiskan konteks WebGL GPU.
   - *Mitigasi:* Implementasikan cleanup routine komprehensif (`dispose()` pada semua geometries, materials, textures, dan renderers saat unmount).
2. **Risiko Mutasi State RAB:** Interaksi klik/drag di 3D tidak boleh mengubah volume atau harga di ProjectContext secara tidak sah.
   - *Mitigasi:* Viewer bersifat **Read-Only Visualizer** yang hanya menerima data dari Engine tanpa kemampuan memutasi RAB secara langsung.
3. **Risiko Dimensi Invalid (Negatif/NaN):** Parameter ekstrim dari user bisa merusak mesh 3D.
   - *Mitigasi:* Validasi boundary `geometryValidation.ts` memverifikasi seluruh dimensi sebelum komputasi mesh. Jika tidak valid, tampilkan fallback bounding box dan warning status `INVALID_DIMENSIONS`.

---

## 7. Usulan Struktur File Phase 4

```
src/viewer3d/
├── types.ts                              # Definisi tipe elemen 3D, camera state, layer flags
├── geometry/
│   ├── geometryTypes.ts                  # Kontrak 3D mesh, node, vertex, box, wireframe
│   ├── geometryValidation.ts             # Validator batas dimensi & proteksi NaN/Infinity
│   ├── spaceGridPacker.ts                # Deterministic layout denah ruangan (x,y placement)
│   ├── buildingGeometryAdapter.ts        # Adapter 3D untuk Rumah T36, T45, T70, T36-2FL, Ruko
│   ├── roadGeometryAdapter.ts            # Adapter 3D untuk Jalan Beton Rigid Pavement
│   ├── drainageGeometryAdapter.ts        # Adapter 3D untuk Saluran Precast U-Ditch
│   └── masterGeometryResolver.ts         # Dispatcher utama template -> model 3D
├── state/
│   └── viewerStore.ts                    # State management layer, camera, selected element
├── components/
│   ├── ParametricViewer3D.tsx            # Komponen utama 3D Canvas WebGL
│   ├── ViewerToolbar.tsx                 # Toolbar (Orbit/Pan, Reset, Fit, Wireframe/Solid)
│   ├── LayerVisibilityPanel.tsx          # Panel toggle layer (Pondasi, Struktur, Dinding, Atap)
│   ├── ElementInspector.tsx              # Panel info dimensi elemen, WBS code, link RAB
│   └── TemplateModel3DContainer.tsx      # Container terintegrasi untuk view template & estimator
└── test/
    ├── geometryAdapters.test.ts          # Unit test adapter geometri untuk 7 template
    └── viewerState.test.ts               # Unit test state management dan filtering
```

---

## 8. Rencana Pengujian (Test Strategy)

1. **Unit Test Adapters:**
   - Verifikasi bahwa setiap adapter menghasilkan elemen dengan `elementId`, `stableId`, `dimensions`, `position`, dan `materialCategory`.
   - Verifikasi tidak ada nilai `NaN`, `Infinity`, atau dimensi $\le 0$.
   - Verifikasi keunikan `elementId` pada seluruh mesh yang dihasilkan.
2. **Integration Test dengan Engine:**
   - Verifikasi bahwa dimensi elemen 3D sinkron 1:1 dengan `CalculationTrace` dari Parametric Volume Engine.
   - Verifikasi bahwa layer toggle menyembunyikan/menampilkan mesh dengan benar.
3. **Security & Immutability Test:**
   - Verifikasi bahwa preview 3D tidak melakukan mutasi apa pun pada `ProjectContext` / data RAB yang tersimpan.
4. **Build & Typecheck:**
   - Verifikasi `tsc && vite build` lulus tanpa error.
