# PHASE 4 — 3D VIEWER ARCHITECTURE

## 1. Arsitektur Umum & Pipeline Rendering

Sistem **3D Parametric Wireframe Viewer** EZRAB AI Core bekerja dengan alur data satu arah (unidirectional data flow) yang terisolasi dari proses penulisan basis data RAB:

```
┌───────────────────────────────────────────────────────────┐
│        Master Building Template + Parameters (P, L, H)    │
└─────────────────────────────┬─────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────┐
│                 Master Geometry Resolver                  │
│       (BuildingGeometryAdapter for HOUSE-T36-1FL)         │
└─────────────────────────────┬─────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────┐
│            3D Geometry Contract (ViewerModel3D)           │
│   - Deterministic stable IDs (e.g. HOUSE-T36-1FL-COL-1)   │
│   - Element dimensions (m), coordinates (x,y,z), euler    │
│   - Layer classification (FOUNDATION, STRUCTURE, WALLS)   │
│   - Link to WBS Code & Calculation Trace                  │
└─────────────────────────────┬─────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────┐
│            Three.js WebGL Interactive Viewport            │
│   - Render Modes: Solid Shaded, Wireframe, Transparent    │
│   - Camera Presets: Isometric 3D, Top, Front, Right       │
│   - Layer Filtering & Raycaster Element Inspector         │
└───────────────────────────────────────────────────────────┘
```

---

## 2. Koordinat & Konvensi Ruang 3D (Spatial Coordinate System)

- **Unit Satuan:** Meter ($1.0 = 1.0\text{ meter}$).
- **Sumbu X (Merah):** Lebar bangunan / Muka depan (0 ke $W$).
- **Sumbu Y (Hijau):** Elevasi vertikal ke atas ($0.0 = \text{Muka Lantai Keramik}$, minus = pondasi tanah).
- **Sumbu Z (Biru):** Panjang bangunan ke belakang (0 ke $L$).
- **Origin $(0,0,0)$:** Sudut depan kiri bangunan pada elevasi dasar lantai kerja/sloof.
- **Elevasi Lapisan:**
  - $y = -0.60\text{m}$ s/d $0.00\text{m}$: Pondasi Batu Kali
  - $y = 0.00\text{m}$ s/d $0.20\text{m}$: Sloof Beton 15/20
  - $y = 0.20\text{m}$ s/d $3.70\text{m}$: Kolom Praktis & Dinding Hebel ($H = 3.5\text{m}$)
  - $y = 3.70\text{m}$ s/d $3.85\text{m}$: Ring Balok Beton 15/15
  - $y = 3.85\text{m}$ s/d $5.58\text{m}$: Rangka Nok & Penutup Atap Genteng Metal 30°

---

## 3. Komponen Utama & Tanggung Jawab

1. **`BuildingGeometryAdapter`:** Menghitung geometri struktural dan arsitektural secara deterministik dari parameter template tanpa komputasi AI.
2. **`SpaceGridPacker`:** Membagi denah ruangan menjadi zona kuadran arsitektural teratur (Teras, Ruang Tamu, Kamar Utama, Kamar Anak, Dapur, KM).
3. **`GeometryValidator`:** Memastikan seluruh dimensi finite, non-negatif, dan menghitung Bounding Box model.
4. **`ParametricViewer3D`:** Canvas WebGL Three.js dengan Orbit Controls, Lighting, Raycasting, dan Material Switcher.
5. **`ViewerToolbar` & `LayerVisibilityPanel`:** Kontrol interaktif untuk navigasi kamera, mode render, dan filter layer.
6. **`ElementInspector`:** Panel inspeksi elemen BIM yang menampilkan dimensi fisik, koordinat, kode WBS, dan rumus volume.
